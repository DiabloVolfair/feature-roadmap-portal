"""Unit and integration tests for the admin Kanban board routes.

Covers Task 5.2 against the two admin routes in `app/api/v1/admin.py`:
- `GET /api/v1/admin/features/board`
- `PATCH /api/v1/admin/features/{feature_id}/status`

The testing approach mirrors `test_feature_routes.py` and
`test_comment_routes.py`:
- A minimal in-memory fake Motor-like DB is patched over `feature_service.db`
  so `get_board` and `update_feature_status` operate against it.
- Auth dependencies are overridden via `app.dependency_overrides`:
  - `require_admin` → callable returning a fake admin user dict for admin tests.
  - No override for no-auth tests (real dependency chain raises 401).
  - A callable raising `UnauthorizedException(status_code=403)` for non-admin.
- The plain (non-context-manager) `TestClient` never enters the lifespan,
  so no real MongoDB connection is established.

Test cases:
  1. GET /board with admin → 200, data has under_review/planned/in_progress/completed keys
  2. GET /board with non-admin → 403
  3. GET /board with no auth → 401
  4. PATCH /{id}/status valid cross-status → 200, FeatureResponse with new status
  5. PATCH /{id}/status same status → 400
  6. PATCH /{id}/status unknown feature → 404
  7. PATCH /{id}/status non-admin → 403
  8. PATCH /{id}/status invalid status string → 422

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5,
3.6, 3.7
"""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import ReturnDocument

import app.services.feature_service as feature_service
from app.core.exceptions import UnauthorizedException
from app.main import app
from app.middleware.auth import require_admin

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Minimal in-memory fake Motor-like collection / DB
# (matches the pattern in test_feature_routes.py / test_comment_routes.py)
# ---------------------------------------------------------------------------


class _FakeResult:
    def __init__(self, **kwargs: Any) -> None:
        for k, v in kwargs.items():
            setattr(self, k, v)


class _FakeCursor:
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
    """Evaluate the small subset of query operators used by the admin service."""
    for key, condition in query.items():
        if key == "$text":
            continue
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
            else:  # pragma: no cover
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
    for field, value in update.get("$set", {}).items():
        doc[field] = value


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
                return dict(doc)
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_feature(status: str = "under_review") -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "title": "A sufficiently long feature title",
        "description_markdown": "A sufficiently long description body here.",
        "category": "general",
        "status": status,
        "author_id": str(ObjectId()),
        "author_name": "Author Name",
        "vote_count": 0,
        "comment_count": 0,
        "votes": [],
        "created_at": now,
        "updated_at": now,
    }


def _seed(fake_db: _FakeDB, *docs: dict[str, Any]) -> None:
    collection = fake_db["features"]
    for doc in docs:
        collection._docs[doc["_id"]] = doc


def _fake_admin():
    """Dependency override: returns a verified admin user document."""
    return {
        "_id": ObjectId(),
        "name": "Admin",
        "is_verified": True,
        "role": "admin",
    }


def _raise_403():
    """Dependency override: simulates a non-admin authenticated user."""
    raise UnauthorizedException("Administrator access required.", status_code=403)


# ---------------------------------------------------------------------------
# Fixture: clear dependency overrides after every test
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ============================================================================
# GET /api/v1/admin/features/board
# ============================================================================


def test_board_admin_returns_200_with_four_column_keys():
    """Req 2.1, 2.2, 2.3, 2.4: an admin request returns 200 with `data`
    containing exactly the four status column keys."""
    fake_db = _FakeDB()
    features = [
        _make_feature(status="under_review"),
        _make_feature(status="planned"),
        _make_feature(status="in_progress"),
        _make_feature(status="completed"),
    ]

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, *features)
        app.dependency_overrides[require_admin] = _fake_admin

        response = client.get("/api/v1/admin/features/board")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert set(data.keys()) == {"under_review", "planned", "in_progress", "completed"}


def test_board_admin_features_appear_in_correct_columns():
    """Req 2.5, 2.6: each feature document is placed in the column matching
    its status, with the expected `id` and no `description_markdown` or `votes`."""
    fake_db = _FakeDB()
    under_review = _make_feature(status="under_review")
    planned = _make_feature(status="planned")

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, under_review, planned)
        app.dependency_overrides[require_admin] = _fake_admin

        response = client.get("/api/v1/admin/features/board")

    assert response.status_code == 200
    data = response.json()["data"]

    under_review_ids = {c["id"] for c in data["under_review"]}
    planned_ids = {c["id"] for c in data["planned"]}

    assert str(under_review["_id"]) in under_review_ids
    assert str(planned["_id"]) in planned_ids

    # BoardFeatureCard must exclude description_markdown and votes
    for card in data["under_review"] + data["planned"]:
        assert "description_markdown" not in card
        assert "votes" not in card


def test_board_non_admin_returns_403():
    """Req 2.7: a non-admin authenticated request is rejected with 403."""
    app.dependency_overrides[require_admin] = _raise_403

    response = client.get("/api/v1/admin/features/board")

    assert response.status_code == 403
    assert response.json()["success"] is False


def test_board_no_auth_returns_401():
    """Req 2.7: an unauthenticated request is rejected with 401 by the
    real `require_admin` → `get_current_user` dependency chain."""
    # No override — real dependency chain fires and raises 401
    response = client.get("/api/v1/admin/features/board")

    assert response.status_code == 401
    assert response.json()["success"] is False


# ============================================================================
# PATCH /api/v1/admin/features/{feature_id}/status
# ============================================================================


def test_update_status_valid_cross_status_returns_200_with_feature_response():
    """Req 3.1, 3.2: a valid cross-status transition returns 200 with the
    updated FeatureResponse reflecting the new status."""
    fake_db = _FakeDB()
    feature = _make_feature(status="under_review")

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        app.dependency_overrides[require_admin] = _fake_admin

        response = client.patch(
            f"/api/v1/admin/features/{feature['_id']}/status",
            json={"status": "planned"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "planned"
    assert body["data"]["id"] == str(feature["_id"])


def test_update_status_same_status_returns_400():
    """Req 3.3: attempting to transition a feature to its current status
    is rejected with 400 (InvalidStatusTransitionException)."""
    fake_db = _FakeDB()
    feature = _make_feature(status="planned")

    with patch.object(feature_service, "db", fake_db):
        _seed(fake_db, feature)
        app.dependency_overrides[require_admin] = _fake_admin

        response = client.patch(
            f"/api/v1/admin/features/{feature['_id']}/status",
            json={"status": "planned"},
        )

    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert isinstance(body["errors"], list) and body["errors"]


def test_update_status_unknown_feature_returns_404():
    """Req 3.4: a valid ObjectId that does not match any document returns 404
    (FeatureNotFoundException)."""
    fake_db = _FakeDB()  # empty — no features

    with patch.object(feature_service, "db", fake_db):
        app.dependency_overrides[require_admin] = _fake_admin

        response = client.patch(
            f"/api/v1/admin/features/{ObjectId()}/status",
            json={"status": "planned"},
        )

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert isinstance(body["errors"], list) and body["errors"]


def test_update_status_non_admin_returns_403():
    """Req 3.5: a non-admin request is rejected with 403 before any DB
    access is performed."""
    app.dependency_overrides[require_admin] = _raise_403

    response = client.patch(
        f"/api/v1/admin/features/{ObjectId()}/status",
        json={"status": "planned"},
    )

    assert response.status_code == 403
    assert response.json()["success"] is False


def test_update_status_invalid_status_string_returns_422():
    """Req 3.6: an unrecognised status value in the request body fails
    Pydantic validation before reaching any service logic (422)."""
    app.dependency_overrides[require_admin] = _fake_admin

    response = client.patch(
        f"/api/v1/admin/features/{ObjectId()}/status",
        json={"status": "not_a_real_status"},
    )

    assert response.status_code == 422
