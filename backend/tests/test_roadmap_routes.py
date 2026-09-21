"""Integration tests for the public roadmap endpoint.

Covers Task 4.3 against the route in `app/api/v1/roadmap.py`:
- `GET /api/v1/roadmap`

Testing approach mirrors `test_admin_routes.py`:
- A minimal in-memory fake Motor-like DB is patched over `feature_service.db`
  so `get_public_roadmap` operates against controlled data.
- No auth dependency to override — the endpoint is fully public.
- The plain (non-context-manager) `TestClient` never enters the lifespan,
  so no real MongoDB connection is established.

Test cases:
  1. GET /roadmap with no Authorization header → 200 (public endpoint, no auth)
  2. Response envelope has success=true, message="Roadmap retrieved.", and
     `data` with exactly the keys `planned`, `in_progress`, `completed`
  3. `under_review` features in the DB do NOT appear in any column
  4. Features with status planned/in_progress/completed appear in correct columns
  5. Each card has exactly the 8 required fields and lacks description_markdown / votes

Requirements: 2.1, 2.2, 2.3, 3.3
"""

from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

import app.services.feature_service as feature_service  # noqa: F401 (kept for parity with sibling test files)
from app.db import mongodb as mongodb_module
from app.main import app

client = TestClient(app, raise_server_exceptions=False)

# ---------------------------------------------------------------------------
# Minimal in-memory fake Motor-like collection / DB
# (same pattern as test_admin_routes.py)
# ---------------------------------------------------------------------------

_REQUIRED_CARD_FIELDS = {
    "id",
    "title",
    "category",
    "status",
    "vote_count",
    "comment_count",
    "author_name",
    "created_at",
}

_FORBIDDEN_CARD_FIELDS = {"description_markdown", "votes"}


class _FakeCursor:
    def __init__(self, docs: list[dict]) -> None:
        self._docs = [dict(d) for d in docs]

    def sort(self, *_args, **_kwargs) -> "_FakeCursor":
        return self

    def __aiter__(self) -> "_FakeCursor":
        self._iter = iter(self._docs)
        return self

    async def __anext__(self) -> dict:
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class _FakeCollection:
    def __init__(self) -> None:
        self._docs: dict[Any, dict] = {}

    async def insert_one(self, doc: dict) -> Any:
        _id = doc.get("_id") or ObjectId()
        doc["_id"] = _id
        self._docs[_id] = doc

    def find(self, query: dict | None = None) -> _FakeCursor:
        # The roadmap endpoint always calls find({}) so no filtering needed here
        return _FakeCursor(list(self._docs.values()))

    async def count_documents(self, query: dict | None = None) -> int:
        return len(self._docs)

    async def find_one(self, query: dict) -> dict | None:
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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_roadmap_no_auth_returns_200():
    """Req 2.1: GET /api/v1/roadmap returns 200 with no Authorization header.
    The endpoint is public — no token is required."""
    fake_db = _FakeDB()

    with patch.object(mongodb_module, "db", fake_db):
        response = client.get("/api/v1/roadmap")  # no Authorization header

    assert response.status_code == 200


def test_roadmap_response_envelope_and_data_keys():
    """Req 2.2: Response has success=true, message='Roadmap retrieved.',
    and data with exactly the keys planned, in_progress, completed."""
    fake_db = _FakeDB()

    with patch.object(mongodb_module, "db", fake_db):
        response = client.get("/api/v1/roadmap")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["message"] == "Roadmap retrieved."
    data = body["data"]
    assert set(data.keys()) == {"planned", "in_progress", "completed"}


def test_under_review_features_excluded_from_all_columns():
    """Req 3.3: under_review features in the DB never appear in any
    column of the public roadmap, even when they are the only documents."""
    fake_db = _FakeDB()
    under_review_a = _make_feature(status="under_review")
    under_review_b = _make_feature(status="under_review")

    with patch.object(mongodb_module, "db", fake_db):
        _seed(fake_db, under_review_a, under_review_b)
        response = client.get("/api/v1/roadmap")

    assert response.status_code == 200
    data = response.json()["data"]

    all_ids_in_response = (
        {c["id"] for c in data["planned"]}
        | {c["id"] for c in data["in_progress"]}
        | {c["id"] for c in data["completed"]}
    )
    assert str(under_review_a["_id"]) not in all_ids_in_response
    assert str(under_review_b["_id"]) not in all_ids_in_response


def test_features_appear_in_correct_columns():
    """Req 2.3: Features with status planned, in_progress, and completed
    each appear in their corresponding column and not in the others."""
    fake_db = _FakeDB()
    planned = _make_feature(status="planned")
    in_progress = _make_feature(status="in_progress")
    completed = _make_feature(status="completed")
    under_review = _make_feature(status="under_review")

    with patch.object(mongodb_module, "db", fake_db):
        _seed(fake_db, planned, in_progress, completed, under_review)
        response = client.get("/api/v1/roadmap")

    assert response.status_code == 200
    data = response.json()["data"]

    planned_ids = {c["id"] for c in data["planned"]}
    in_progress_ids = {c["id"] for c in data["in_progress"]}
    completed_ids = {c["id"] for c in data["completed"]}

    # Each feature is in its correct column
    assert str(planned["_id"]) in planned_ids
    assert str(in_progress["_id"]) in in_progress_ids
    assert str(completed["_id"]) in completed_ids

    # No cross-column contamination
    assert str(planned["_id"]) not in in_progress_ids
    assert str(planned["_id"]) not in completed_ids
    assert str(in_progress["_id"]) not in planned_ids
    assert str(in_progress["_id"]) not in completed_ids
    assert str(completed["_id"]) not in planned_ids
    assert str(completed["_id"]) not in in_progress_ids

    # under_review not in any public column
    assert str(under_review["_id"]) not in (
        planned_ids | in_progress_ids | completed_ids
    )


def test_card_fields_correct_and_no_forbidden_fields():
    """Req 2.2, 2.3: Each card in the response has exactly the 8 required fields
    (id, title, category, status, vote_count, comment_count, author_name,
    created_at) and does NOT contain description_markdown or votes."""
    fake_db = _FakeDB()
    features = [
        _make_feature(status="planned"),
        _make_feature(status="in_progress"),
        _make_feature(status="completed"),
    ]

    with patch.object(mongodb_module, "db", fake_db):
        _seed(fake_db, *features)
        response = client.get("/api/v1/roadmap")

    assert response.status_code == 200
    data = response.json()["data"]

    all_cards = data["planned"] + data["in_progress"] + data["completed"]
    assert len(all_cards) == 3  # only the 3 public-status features

    for card in all_cards:
        card_keys = set(card.keys())
        # All required fields must be present
        assert _REQUIRED_CARD_FIELDS == card_keys, (
            f"Card field set mismatch: got {card_keys}"
        )
        # Forbidden fields must be absent
        for forbidden in _FORBIDDEN_CARD_FIELDS:
            assert forbidden not in card_keys, (
                f"Card unexpectedly contains forbidden field: {forbidden!r}"
            )
