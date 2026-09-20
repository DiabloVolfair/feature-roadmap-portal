"""Integration and unit tests for comment-related route behavior.

Covers Task 5.4 (comment count synchronization) and Task 5.5 (authorization
rules) against the comment and feature routes in `app/api/v1/comments.py`
and `app/api/v1/features.py`.

The testing approach mirrors `test_feature_routes.py`:
- A minimal in-memory fake Motor-like DB is patched over `comment_service.db`
  **and** `feature_service.db` so both modules share the same collection
  instances.  The shared fake means `create_comment` writing to `comments` and
  simultaneously `$inc`-ing `features` all operates on one consistent store.
- Auth dependencies are overridden via `app.dependency_overrides`:
  - `require_verified_user` for POST `/{feature_id}/comments`.
  - `get_current_user` for PATCH/DELETE `/comments/{comment_id}`.
- No real MongoDB connection is established: the plain (non-context-manager)
  `TestClient` never enters the lifespan.

Requirements: 3.1, 3.2, 3.3, 3.4, 11.1, 11.2, 11.3, 11.4, 11.5
"""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import ReturnDocument

import app.services.comment_service as comment_service
import app.services.feature_service as feature_service
from app.core.exceptions import UnauthorizedException
from app.main import app
from app.middleware.auth import get_current_user, require_verified_user

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Minimal in-memory fake Motor-like collection / DB
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
    """Evaluate the subset of query operators used by comment/feature services:
    equality, `$ne`, `$in`.  `$text` treated as match-all."""
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
            else:
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

    async def update_one(self, query: dict, update: dict) -> _FakeResult:
        for doc in self._docs.values():
            if _matches(doc, query or {}):
                _apply_update(doc, update)
                return _FakeResult(modified_count=1, matched_count=1)
        return _FakeResult(modified_count=0, matched_count=0)

    async def create_index(self, *_args, **_kwargs) -> None:  # noqa: D401
        return None


class _FakeDB:
    def __init__(self) -> None:
        self._collections: dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


# ---------------------------------------------------------------------------
# Helpers for seeding and building fixture documents
# ---------------------------------------------------------------------------

def _make_feature(comment_count: int = 0) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "title": "Test feature title long enough",
        "description_markdown": "A description body that is long enough.",
        "category": "general",
        "status": "under_review",
        "author_id": str(ObjectId()),
        "author_name": "Author",
        "vote_count": 0,
        "comment_count": comment_count,
        "votes": [],
        "created_at": now,
        "updated_at": now,
    }


def _make_comment(
    feature_id: Any,
    author_id: Any,
    author_name: str = "Commenter",
    is_deleted: bool = False,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "feature_id": str(feature_id),
        "author_id": str(author_id),
        "author_name": author_name if not is_deleted else "[deleted]",
        "author_role": "user",
        "is_verified": True,
        "parent_comment_id": None,
        "content_markdown": "[deleted]" if is_deleted else "Hello world comment.",
        "reply_count": 0,
        "is_deleted": is_deleted,
        "created_at": now,
        "updated_at": now,
    }


def _seed(fake_db: _FakeDB, collection: str, *docs: dict[str, Any]) -> None:
    col = fake_db[collection]
    for doc in docs:
        col._docs[doc["_id"]] = doc


def _fake_verified_user(user_id: ObjectId, name: str = "Test User", role: str = "user"):
    def _dep():
        return {
            "_id": user_id,
            "name": name,
            "is_verified": True,
            "role": role,
        }
    return _dep


def _fake_admin_user(user_id: ObjectId, name: str = "Admin User"):
    def _dep():
        return {
            "_id": user_id,
            "name": name,
            "is_verified": True,
            "role": "admin",
        }
    return _dep


# ---------------------------------------------------------------------------
# Fixture: auto-clear dependency overrides after every test
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ============================================================================
# Task 5.4 — Integration tests for comment count synchronization
# Req 3.1, 3.2, 3.3, 3.4
# ============================================================================


def test_create_comment_increments_feature_comment_count():
    """Req 3.1: creating a comment atomically increments `comment_count` by 1."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=0)

    _seed(fake_db, "features", feature)
    app.dependency_overrides[require_verified_user] = _fake_verified_user(user_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.post(
            f"/api/v1/features/{feature['_id']}/comments",
            json={"content_markdown": "This is a valid comment body."},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True

    # The feature document in the shared fake_db should now have comment_count=1
    stored_feature = fake_db["features"]._docs[feature["_id"]]
    assert stored_feature["comment_count"] == 1


def test_delete_non_deleted_comment_decrements_feature_comment_count():
    """Req 3.2, 3.3: deleting a non-deleted comment decrements `comment_count` by 1."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=1)
    comment = _make_comment(feature["_id"], user_id)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_verified_user(user_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.delete(f"/api/v1/comments/{comment['_id']}")

    assert response.status_code == 200
    assert response.json()["success"] is True

    stored_feature = fake_db["features"]._docs[feature["_id"]]
    assert stored_feature["comment_count"] == 0


def test_delete_already_deleted_comment_does_not_decrement_comment_count():
    """Req 3.4: deleting an already-deleted (tombstoned) comment is idempotent —
    `comment_count` remains unchanged and the response is still 200."""
    user_id = ObjectId()
    fake_db = _FakeDB()
    # comment_count is 0 (the comment was already counted-down when first deleted)
    feature = _make_feature(comment_count=0)
    comment = _make_comment(feature["_id"], user_id, is_deleted=True)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_verified_user(user_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.delete(f"/api/v1/comments/{comment['_id']}")

    assert response.status_code == 200
    assert response.json()["success"] is True

    stored_feature = fake_db["features"]._docs[feature["_id"]]
    # Must remain at 0, not go to -1
    assert stored_feature["comment_count"] == 0


# ============================================================================
# Task 5.5 — Unit tests for authorization rules
# Req 11.1, 11.2, 11.3, 11.4, 11.5
# ============================================================================


# --- PATCH /comments/{comment_id} (edit) ------------------------------------


def test_edit_comment_author_succeeds():
    """Req 11.2: the comment author can edit their own comment (200)."""
    author_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=1)
    comment = _make_comment(feature["_id"], author_id)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_verified_user(author_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.patch(
            f"/api/v1/comments/{comment['_id']}",
            json={"content_markdown": "Updated comment content here."},
        )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"]["content_markdown"] == "Updated comment content here."


def test_edit_comment_non_author_gets_403():
    """Req 11.2: a non-author regular user cannot edit another's comment (403)."""
    author_id = ObjectId()
    stranger_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=1)
    comment = _make_comment(feature["_id"], author_id)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    # stranger is authenticated but is not the author
    app.dependency_overrides[get_current_user] = _fake_verified_user(stranger_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.patch(
            f"/api/v1/comments/{comment['_id']}",
            json={"content_markdown": "Trying to hijack this comment."},
        )

    assert response.status_code == 403
    assert response.json()["success"] is False


def test_edit_comment_admin_gets_403():
    """Req 11.2: an admin cannot edit another user's comment (403).
    Admins have delete privilege but NOT edit privilege."""
    author_id = ObjectId()
    admin_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=1)
    comment = _make_comment(feature["_id"], author_id)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_admin_user(admin_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.patch(
            f"/api/v1/comments/{comment['_id']}",
            json={"content_markdown": "Admin override edit attempt."},
        )

    assert response.status_code == 403
    assert response.json()["success"] is False


# --- DELETE /comments/{comment_id} (soft-delete) ----------------------------


def test_delete_comment_author_succeeds():
    """Req 11.3: the comment author can delete their own comment (200)."""
    author_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=1)
    comment = _make_comment(feature["_id"], author_id)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_verified_user(author_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.delete(f"/api/v1/comments/{comment['_id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["is_deleted"] is True


def test_delete_comment_admin_succeeds():
    """Req 11.3: an admin can delete any comment (200)."""
    author_id = ObjectId()
    admin_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=1)
    comment = _make_comment(feature["_id"], author_id)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_admin_user(admin_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.delete(f"/api/v1/comments/{comment['_id']}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["is_deleted"] is True


def test_delete_comment_stranger_gets_403():
    """Req 11.3: a non-author, non-admin user cannot delete someone else's comment (403)."""
    author_id = ObjectId()
    stranger_id = ObjectId()
    fake_db = _FakeDB()
    feature = _make_feature(comment_count=1)
    comment = _make_comment(feature["_id"], author_id)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_verified_user(stranger_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.delete(f"/api/v1/comments/{comment['_id']}")

    assert response.status_code == 403
    assert response.json()["success"] is False


def test_delete_already_deleted_comment_returns_200_no_count_change():
    """Req 11.4: deleting an already-deleted comment returns 200 (idempotent)
    and does not further decrement `comment_count`."""
    author_id = ObjectId()
    fake_db = _FakeDB()
    # Simulate state after first deletion: count already decremented to 0
    feature = _make_feature(comment_count=0)
    comment = _make_comment(feature["_id"], author_id, is_deleted=True)

    _seed(fake_db, "features", feature)
    _seed(fake_db, "comments", comment)
    app.dependency_overrides[get_current_user] = _fake_verified_user(author_id)

    with patch.object(comment_service, "db", fake_db), \
         patch.object(feature_service, "db", fake_db):
        response = client.delete(f"/api/v1/comments/{comment['_id']}")

    assert response.status_code == 200
    assert response.json()["success"] is True

    stored_feature = fake_db["features"]._docs[feature["_id"]]
    assert stored_feature["comment_count"] == 0
