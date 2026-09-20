"""Integration tests for the vote-related Feature_API route behavior
(Sprint 3 - Atomic Voting Engine).

Covers Task 4.2 (the `POST /{id}/vote` and `GET /{id}/vote-status` endpoints)
and Task 4.3 (the per-viewer `has_voted` flag on the feed and detail reads),
both against the vote-related routes in `app/api/v1/features.py`.

Like `test_dashboard_routes.py`, these tests drive the real FastAPI routing
and the real `FeatureException`/`AuthException` exception handlers registered
on the shared `app`, while substituting the *dependency* (via
`app.dependency_overrides`) rather than minting real JWTs:

- The verified-user branches override `require_verified_user` /
  `get_optional_current_user` with lightweight callables returning a fake
  user document, so the route runs its real body against a fake collection.
- The guest 401 branch uses no `require_verified_user` override at all, so
  the real `get_current_user` -> `require_verified_user` chain naturally
  raises its own 401.
- The unverified 403 branch overrides `require_verified_user` with a callable
  that raises the same `UnauthorizedException(status_code=403)` the real
  dependency raises.

The `features` collection is a minimal in-memory fake patched over
`feature_service.db` (mirroring `test_toggle_vote_properties.py`'s
fake-collection pattern) so `toggle_vote`, `find_by_id`, `get_feed`, and
`get_related_features` all operate on it without a real MongoDB connection.

Requirements: 3.2, 3.3, 4.1, 4.2, 4.3, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 6.4, 7.4
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import ReturnDocument

import app.services.feature_service as feature_service
from app.core.exceptions import AlreadyVotedException, UnauthorizedException
from app.main import app
from app.middleware.auth import get_optional_current_user, require_verified_user

# Plain (non-context-manager) TestClient never enters the lifespan, so no real
# MongoDB connection is attempted, matching test_dashboard_routes.py.
client = TestClient(app, raise_server_exceptions=False)


# --- Minimal in-memory fake Motor-like collection/db ------------------------
#
# Supports exactly the operations the vote routes and read routes touch via
# Feature_Service: insert_one, find_one, find_one_and_update (with the
# membership-filter semantics toggle_vote relies on), count_documents, and a
# chainable find().sort().skip().limit() cursor for get_feed /
# get_related_features. Kept local to this file, mirroring how the sibling
# test files keep their fakes local.


class _FakeResult:
    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


class _FakeCursor:
    """Chainable async cursor supporting .sort()/.skip()/.limit() as no-op-ish
    builders and async iteration, enough for get_feed / get_related_features.
    Sorting is intentionally a stable identity here: these tests assert on
    membership/`has_voted`, not on ordering."""

    def __init__(self, docs: list[dict]) -> None:
        self._docs = [dict(d) for d in docs]

    def sort(self, *_args, **_kwargs) -> "_FakeCursor":
        return self

    def skip(self, n: int) -> "_FakeCursor":
        self._docs = self._docs[n:]
        return self

    def limit(self, n: int) -> "_FakeCursor":
        self._docs = self._docs[:n]
        return self

    def __aiter__(self) -> "_FakeCursor":
        self._iter = iter(self._docs)
        return self

    async def __anext__(self) -> dict:
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


def _matches(doc: dict, query: dict) -> bool:
    """Evaluate the small subset of query operators these routes rely on:
    equality, `$ne` (scalar and array-membership), `$in`, and `$text`
    (treated as a no-op match so search does not filter out the fixtures)."""
    for key, condition in query.items():
        if key == "$text":
            continue  # not exercised for filtering in these tests
        value = doc.get(key)
        if isinstance(condition, dict):
            if "$ne" in condition:
                target = condition["$ne"]
                if isinstance(value, list):
                    if target in value:
                        return False
                elif value == target:
                    return False
            elif "$in" in condition:
                if value not in condition["$in"]:
                    return False
            else:  # pragma: no cover - no other operators are exercised
                raise NotImplementedError(f"Unsupported operator in {condition!r}")
        else:
            if isinstance(value, list):
                if condition not in value:
                    return False
            elif value != condition:
                return False
    return True


def _apply_update(doc: dict, update: dict) -> None:
    for field, value in update.get("$addToSet", {}).items():
        arr = doc.setdefault(field, [])
        if value not in arr:
            arr.append(value)
    for field, value in update.get("$pull", {}).items():
        doc[field] = [item for item in doc.get(field, []) if item != value]
    for field, amount in update.get("$inc", {}).items():
        doc[field] = doc.get(field, 0) + amount


class _FakeCollection:
    def __init__(self) -> None:
        self._docs: dict[Any, dict] = {}

    async def insert_one(self, doc: dict) -> _FakeResult:
        _id = doc.get("_id") or ObjectId()
        doc["_id"] = _id
        self._docs[_id] = doc
        return _FakeResult(inserted_id=_id)

    def find(self, query: dict | None = None) -> _FakeCursor:
        docs = [d for d in self._docs.values() if _matches(d, query or {})]
        return _FakeCursor(docs)

    async def count_documents(self, query: dict | None = None) -> int:
        return len([d for d in self._docs.values() if _matches(d, query or {})])

    async def find_one(self, query: dict) -> dict | None:
        for doc in self._docs.values():
            if _matches(doc, query or {}):
                return doc
        return None

    async def find_one_and_update(
        self, query: dict, update: dict, return_document=ReturnDocument.AFTER
    ) -> dict | None:
        for doc in self._docs.values():
            if _matches(doc, query or {}):
                before = dict(doc)
                _apply_update(doc, update)
                return dict(doc) if return_document == ReturnDocument.AFTER else before
        return None


class _FakeDB:
    def __init__(self) -> None:
        self._collections: dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


def _make_feature_doc(
    votes: list[str] | None = None, created_offset: int = 0
) -> dict[str, Any]:
    """Build a persisted-shape feature document with the given initial `votes`
    (whose length seeds `vote_count`)."""
    votes = list(votes or [])
    created = datetime.now(timezone.utc) - timedelta(seconds=created_offset)
    return {
        "_id": ObjectId(),
        "title": "A sufficiently long feature title",
        "description_markdown": "A sufficiently long description body here.",
        "category": "general",
        "status": "under_review",
        "author_id": str(ObjectId()),
        "author_name": "Author Name",
        "vote_count": len(votes),
        "comment_count": 0,
        "votes": votes,
        "created_at": created,
        "updated_at": created,
    }


def _seed(fake_db: _FakeDB, *docs: dict[str, Any]) -> None:
    """Insert persisted-shape documents directly into the fake collection.

    Synchronous on purpose: the fake `insert_one` only mutates an in-memory
    dict, so seeding does not need an event loop and stays independent of the
    TestClient's request loop."""
    collection = fake_db["features"]
    for doc in docs:
        collection._docs[doc["_id"]] = doc


@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    """Ensures no override leaks into another test file's use of the shared `app`."""
    yield
    app.dependency_overrides.clear()


def _fake_verified_user(user_id: ObjectId):
    def _dep():
        return {"_id": user_id, "is_verified": True, "role": "user"}

    return _dep


def _raise_403():
    raise UnauthorizedException("Email verification required.", status_code=403)


# ============================================================================
# Task 4.2 - POST /{id}/vote and GET /{id}/vote-status
# ============================================================================


def test_vote_returns_200_with_voted_and_vote_count():
    """Req 3.2, 4.1, 4.2: a verified user POSTing to a feature they have not
    voted for gets 200 with `{voted: true, vote_count}` reflecting the added
    vote."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)

        response = client.post(f"/api/v1/features/{feature['_id']}/vote")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == {"voted": True, "vote_count": 1}


def test_second_vote_toggles_back_off():
    """Req 3.2, 4.2: a second POST by the same user toggles the vote back off,
    flipping `voted` to false and returning the count to its prior value."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)

        first = client.post(f"/api/v1/features/{feature['_id']}/vote")
        second = client.post(f"/api/v1/features/{feature['_id']}/vote")

    assert first.status_code == 200
    assert first.json()["data"] == {"voted": True, "vote_count": 1}
    assert second.status_code == 200
    assert second.json()["data"] == {"voted": False, "vote_count": 0}


def test_vote_status_returns_has_voted_and_vote_count():
    """Req 4.3: GET vote-status returns `{has_voted, vote_count}` for the
    resolved verified user - true when their id is in the feature's votes."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[str(user_id), str(ObjectId())])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)

        response = client.get(f"/api/v1/features/{feature['_id']}/vote-status")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == {"has_voted": True, "vote_count": 2}


def test_vote_status_has_voted_false_when_not_a_member():
    """Req 4.3: GET vote-status returns has_voted false for a verified user
    whose id is not in the votes array."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[str(ObjectId())])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)

        response = client.get(f"/api/v1/features/{feature['_id']}/vote-status")

    assert response.status_code == 200
    assert response.json()["data"] == {"has_voted": False, "vote_count": 1}


def test_vote_guest_gets_401():
    """Req 3.3: a guest (no `require_verified_user` override, no token) POSTing
    a vote is rejected 401 by the real dependency chain."""
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        response = client.post(f"/api/v1/features/{feature['_id']}/vote")

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_vote_status_guest_gets_401():
    """Req 3.3: a guest requesting vote-status is rejected 401 by the real
    dependency chain."""
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        response = client.get(f"/api/v1/features/{feature['_id']}/vote-status")

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_vote_unverified_user_gets_403():
    """Req 3.3: an authenticated but unverified user is rejected 403 (the same
    `UnauthorizedException(status_code=403)` the real `require_verified_user`
    raises) with an error envelope."""
    app.dependency_overrides[require_verified_user] = _raise_403

    response = client.post(f"/api/v1/features/{ObjectId()}/vote")

    assert response.status_code == 403
    assert response.json()["success"] is False


def test_vote_status_unverified_user_gets_403():
    """Req 3.3: an unverified user is rejected 403 on the vote-status route."""
    app.dependency_overrides[require_verified_user] = _raise_403

    response = client.get(f"/api/v1/features/{ObjectId()}/vote-status")

    assert response.status_code == 403
    assert response.json()["success"] is False


def test_vote_unknown_feature_id_gets_404():
    """Req 4.x: POSTing a vote for a valid-but-absent ObjectId surfaces the
    `FeatureNotFoundException` from `toggle_vote` as a 404 error envelope."""
    user_id = ObjectId()
    fake_db = _FakeDB()  # empty - no features

    with patch.object(feature_service, "db", fake_db):
        app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)
        response = client.post(f"/api/v1/features/{ObjectId()}/vote")

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert isinstance(body["errors"], list) and body["errors"]


def test_vote_status_unknown_feature_id_gets_404():
    """Req 4.x: requesting vote-status for a valid-but-absent ObjectId raises
    `FeatureNotFoundException`, surfacing as a 404 error envelope."""
    user_id = ObjectId()
    fake_db = _FakeDB()  # empty - no features

    with patch.object(feature_service, "db", fake_db):
        app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)
        response = client.get(f"/api/v1/features/{ObjectId()}/vote-status")

    assert response.status_code == 404
    assert response.json()["success"] is False


def test_vote_already_voted_surfaces_as_409_envelope():
    """Req 7.4: an `AlreadyVotedException` raised by `toggle_vote` (the
    lost-race case) surfaces as a 409 `{success:false, message, errors}`
    envelope through the existing `FeatureException` family handler."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[])

    async def _raise_already_voted(_feature_id, _user_id):
        raise AlreadyVotedException("Your vote could not be applied.")

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)
        with patch.object(feature_service, "toggle_vote", _raise_already_voted):
            response = client.post(f"/api/v1/features/{feature['_id']}/vote")

    assert response.status_code == 409
    body = response.json()
    assert body["success"] is False
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["errors"], list) and body["errors"]


# ============================================================================
# Task 4.3 - has_voted on the feed and detail reads
# ============================================================================


def test_guest_feed_has_all_has_voted_false_and_structure_intact():
    """Req 5.2, 5.4: a guest feed request returns 200 with every item's
    `has_voted` false and the feed's `items`/`pagination` structure intact."""
    fake_db = _FakeDB()
    features = [
        _make_feature_doc(votes=[str(ObjectId())], created_offset=0),
        _make_feature_doc(votes=[], created_offset=10),
    ]

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, *features)
        response = client.get("/api/v1/features")

    assert response.status_code == 200
    data = response.json()["data"]
    assert "items" in data and "pagination" in data
    assert len(data["items"]) == 2
    assert all(item["has_voted"] is False for item in data["items"])
    pagination = data["pagination"]
    for key in (
        "page",
        "limit",
        "total_items",
        "total_pages",
        "has_next",
        "has_previous",
    ):
        assert key in pagination
    assert pagination["total_items"] == 2


def test_guest_detail_has_voted_false():
    """Req 6.2: a guest detail request returns 200 with has_voted false."""
    fake_db = _FakeDB()
    feature = _make_feature_doc(votes=[str(ObjectId())])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        response = client.get(f"/api/v1/features/{feature['_id']}")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["has_voted"] is False


def test_authenticated_viewer_sees_has_voted_true_only_for_voted_feed_item():
    """Req 5.3, 5.5: an authenticated viewer whose id is in one feature's
    votes sees `has_voted` true for that feed item and false for the other."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    voted = _make_feature_doc(votes=[str(user_id)], created_offset=0)
    not_voted = _make_feature_doc(votes=[str(ObjectId())], created_offset=10)

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, voted, not_voted)
        app.dependency_overrides[get_optional_current_user] = _fake_verified_user(
            user_id
        )
        response = client.get("/api/v1/features")

    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()["data"]["items"]}
    assert items[str(voted["_id"])]["has_voted"] is True
    assert items[str(not_voted["_id"])]["has_voted"] is False


def test_authenticated_viewer_sees_has_voted_true_on_detail_for_voted_feature():
    """Req 6.3, 6.4: an authenticated viewer whose id is in the feature's
    votes sees `has_voted` true on the detail read, and false for a feature
    they have not voted for."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    voted = _make_feature_doc(votes=[str(user_id)])
    not_voted = _make_feature_doc(votes=[str(ObjectId())])

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, voted, not_voted)
        app.dependency_overrides[get_optional_current_user] = _fake_verified_user(
            user_id
        )

        voted_response = client.get(f"/api/v1/features/{voted['_id']}")
        not_voted_response = client.get(f"/api/v1/features/{not_voted['_id']}")

    assert voted_response.status_code == 200
    assert voted_response.json()["data"]["has_voted"] is True
    assert not_voted_response.status_code == 200
    assert not_voted_response.json()["data"]["has_voted"] is False
