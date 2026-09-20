"""Unit tests for `Email_Verification_Service` against a mocked Motor-like
in-memory collection (no real MongoDB connection is required).

Kept in its own module, separate from `test_token_consumption_properties.py`
(which already covers the shared single-use/expiry-distinction property),
per tasks.md's wave-separation notes for task 3.4.

Feature: sprint-1b-authentication-completion

Validates: Requirements 2.2, 2.6
"""

import asyncio
from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId

import app.services.email_verification_service as email_verification_service
import app.services.user_service as user_service_module
from app.core.exceptions import InvalidTokenException


# --- Minimal in-memory fake Motor-like collection/db ------------------------
#
# Duplicated locally (rather than imported from
# test_token_consumption_properties.py) so this file stays self-contained,
# mirroring that module's own "minimal fake collection" pattern. Supports
# only the operations the service under test actually calls: insert_one,
# find({}), delete_one, find_one.


class _FakeResult:
    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


class _FakeCursor:
    def __init__(self, docs: list[dict]) -> None:
        self._docs = list(docs)

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

    async def insert_one(self, doc: dict) -> _FakeResult:
        _id = doc.get("_id") or ObjectId()
        doc["_id"] = _id
        self._docs[_id] = doc
        return _FakeResult(inserted_id=_id)

    def find(self, query: dict | None = None) -> _FakeCursor:
        return _FakeCursor(list(self._docs.values()))

    async def find_one(self, query: dict) -> dict | None:
        for doc in self._docs.values():
            if all(doc.get(k) == v for k, v in (query or {}).items()):
                return doc
        return None

    async def delete_one(self, query: dict) -> _FakeResult:
        for _id, doc in list(self._docs.items()):
            if all(doc.get(k) == v for k, v in query.items()):
                del self._docs[_id]
                return _FakeResult(deleted_count=1)
        return _FakeResult(deleted_count=0)

    async def update_one(self, query: dict, update: dict) -> _FakeResult:
        for doc in self._docs.values():
            if all(doc.get(k) == v for k, v in query.items()):
                doc.update(update.get("$set", {}))
                return _FakeResult(matched_count=1)
        return _FakeResult(matched_count=0)


class _FakeDB:
    def __init__(self) -> None:
        self._collections: dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


async def _create_user(fake_db: _FakeDB) -> str:
    """Inserts a minimal valid user document directly into the fake `users`
    collection and returns its id as a string."""
    result = await fake_db["users"].insert_one(
        {
            "name": "Test User",
            "email": "test-email-verification@example.com",
            "password_hash": "irrelevant-hash",
            "role": "user",
            "is_verified": False,
            "refresh_token_hash": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )
    return str(result.inserted_id)


def test_create_verification_token_persists_no_raw_token_field():
    """The persisted document's fields are exactly `user_id`, `token_hash`,
    `expires_at`, `created_at` (plus `_id`), and none of them - including
    `token_hash` - holds the raw token value (Req 2.2)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(email_verification_service, "db", fake_db):
            user_id = await _create_user(fake_db)
            raw_token = await email_verification_service.create_verification_token(user_id)

            collection = email_verification_service._collection()
            assert len(collection._docs) == 1
            doc = next(iter(collection._docs.values()))

            assert set(doc.keys()) == {"_id", "user_id", "token_hash", "expires_at", "created_at"}

            # The raw token is never persisted anywhere in the document.
            assert doc["token_hash"] != raw_token
            for value in doc.values():
                assert value != raw_token

    asyncio.run(scenario())


def test_consume_verification_token_raises_invalid_when_user_no_longer_exists():
    """A token whose associated `user_id` no longer identifies an existing
    user is rejected as Invalid, not any other exception (Req 2.6)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(email_verification_service, "db", fake_db), patch.object(
            user_service_module, "db", fake_db
        ):
            # A user_id that never had a corresponding user document
            # inserted (simulates the user having been deleted).
            missing_user_id = str(ObjectId())
            raw_token = await email_verification_service.create_verification_token(
                missing_user_id
            )

            with pytest.raises(InvalidTokenException):
                await email_verification_service.consume_verification_token(raw_token)

    asyncio.run(scenario())
