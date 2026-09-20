"""Unit tests for `Password_Reset_Service` against a minimal in-memory
fake Motor-like collection/db (no real MongoDB connection required),
mirroring the fake-db pattern used by
`test_token_consumption_properties.py`.

Feature: sprint-1b-authentication-completion

Validates: Requirements 5.2, 5.6
"""

import asyncio
from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId

import app.services.password_reset_service as password_reset_service
import app.services.user_service as user_service_module
from app.core.exceptions import InvalidTokenException


# --- Minimal in-memory fake Motor-like collection/db ------------------------
#
# Supports only the operations the service under test actually calls:
# insert_one, find({}), delete_one, update_one, find_one. Duplicated here
# (rather than imported) to match how `test_token_consumption_properties.py`
# keeps its fakes local, since there is no shared fixture module yet.


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


def test_create_reset_token_never_persists_the_raw_token_value():
    """`create_reset_token` persists a document with exactly the fields
    `user_id`, `token_hash`, `expires_at`, `created_at` (plus `_id`), and
    the raw token value it returns is not stored anywhere in that document
    (Req 5.2)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(password_reset_service, "db", fake_db):
            user_id = str(ObjectId())
            raw_token = await password_reset_service.create_reset_token(user_id)

            collection = password_reset_service._collection()
            assert len(collection._docs) == 1
            doc = next(iter(collection._docs.values()))

            assert set(doc.keys()) == {"_id", "user_id", "token_hash", "expires_at", "created_at"}
            assert doc["user_id"] == user_id
            assert isinstance(doc["expires_at"], datetime)
            assert isinstance(doc["created_at"], datetime)

            # The raw token is never persisted, anywhere in the document.
            assert raw_token != doc["token_hash"]
            assert all(value != raw_token for value in doc.values())

    asyncio.run(scenario())


def test_consume_reset_token_raises_invalid_when_user_no_longer_exists():
    """A token record whose `user_id` does not identify any existing user
    document is rejected with `InvalidTokenException`, and no password or
    refresh-token side effects occur (Req 5.6)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(password_reset_service, "db", fake_db), patch.object(
            user_service_module, "db", fake_db
        ):
            # user_id shaped like a valid ObjectId, but never inserted into
            # the fake `users` collection.
            missing_user_id = str(ObjectId())
            raw_token = await password_reset_service.create_reset_token(missing_user_id)

            with pytest.raises(InvalidTokenException):
                await password_reset_service.consume_reset_token(raw_token, "NewPassword123!")

            # No user document was created/modified as a side effect.
            users_collection = fake_db["users"]
            assert len(users_collection._docs) == 0

            # The token record itself was not deleted by the failed attempt.
            tokens_collection = password_reset_service._collection()
            assert len(tokens_collection._docs) == 1

    asyncio.run(scenario())
