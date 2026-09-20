"""Property test for opaque token consumption's single-use and
expiry-distinction behavior, shared by Email_Verification_Service and
Password_Reset_Service (Sprint 1B).

Both services implement the identical single-use/expiry-distinction
contract per design.md's Property 2, so this single test module exercises
both structurally-identical `consume_*_token` functions against a
minimal in-memory fake Motor-like collection (no real MongoDB connection
is required). The property being validated is a sequential/stateful
invariant across a fixed sequence of operations (create -> consume ->
consume again; or force-expire -> consume -> consume again; or consume an
unknown token) rather than a pure round-trip over arbitrary generated
input, so it is written as plain parametrized async scenarios (via
`asyncio.run`) rather than a Hypothesis `@given` generator - mirroring how
Sprint 1A's stateful Refresh_Token flows were tested.

Feature: sprint-1b-authentication-completion
Property 2: Opaque token consumption is single-use, and distinguishes
expired from invalid without deleting the expired record.

Validates: Requirements 2.3, 2.4, 2.5, 2.6, 5.4, 5.5, 5.6
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId

import app.services.email_verification_service as email_verification_service
import app.services.password_reset_service as password_reset_service
import app.services.user_service as user_service_module
from app.core.exceptions import ExpiredTokenException, InvalidTokenException


# --- Minimal in-memory fake Motor-like collection/db ------------------------
#
# Supports only the operations the services under test actually call:
# insert_one, find({}), delete_one, update_one, find_one. Not a general
# Motor stand-in - just enough to exercise the real service functions
# end-to-end without a MongoDB connection.


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
            "email": "test-token-consumption@example.com",
            "password_hash": "irrelevant-hash",
            "role": "user",
            "is_verified": False,
            "refresh_token_hash": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )
    return str(result.inserted_id)


async def _consume_email_verification(raw_token: str) -> None:
    await email_verification_service.consume_verification_token(raw_token)


async def _consume_password_reset(raw_token: str) -> None:
    await password_reset_service.consume_reset_token(raw_token, "NewPassword123!")


SERVICE_CASES = [
    pytest.param(
        email_verification_service,
        email_verification_service.create_verification_token,
        _consume_email_verification,
        id="email_verification_service",
    ),
    pytest.param(
        password_reset_service,
        password_reset_service.create_reset_token,
        _consume_password_reset,
        id="password_reset_service",
    ),
]


@pytest.mark.parametrize("service_module, create_fn, consume_fn", SERVICE_CASES)
def test_second_consume_of_same_raw_token_raises_invalid_not_expired(
    service_module, create_fn, consume_fn
):
    """Consuming a freshly created token once succeeds; consuming the same
    raw token a second time raises InvalidTokenException (not
    ExpiredTokenException), because the record was deleted by the first
    successful consumption (Req 2.3, 2.4, 5.3, 5.4)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(service_module, "db", fake_db), patch.object(
            user_service_module, "db", fake_db
        ):
            user_id = await _create_user(fake_db)
            raw_token = await create_fn(user_id)

            # First consume succeeds.
            await consume_fn(raw_token)

            # Second consume with the SAME raw token: Invalid, not Expired.
            with pytest.raises(InvalidTokenException):
                await consume_fn(raw_token)

    asyncio.run(scenario())


@pytest.mark.parametrize("service_module, create_fn, consume_fn", SERVICE_CASES)
def test_expired_record_stays_expired_on_repeated_consume_without_deletion(
    service_module, create_fn, consume_fn
):
    """A token record whose `expires_at` is in the past raises
    ExpiredTokenException on consume; consuming it again raises
    ExpiredTokenException again (not InvalidTokenException), proving the
    expired record was never deleted on the failure path (Req 2.5, 5.5)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(service_module, "db", fake_db), patch.object(
            user_service_module, "db", fake_db
        ):
            user_id = await _create_user(fake_db)
            raw_token = await create_fn(user_id)

            # Force the just-created record into the past.
            collection = service_module._collection()
            record = next(iter(collection._docs.values()))
            record["expires_at"] = datetime.now(timezone.utc) - timedelta(hours=1)
            record_id = record["_id"]

            with pytest.raises(ExpiredTokenException):
                await consume_fn(raw_token)
            # Not deleted by the failed attempt.
            assert record_id in collection._docs

            with pytest.raises(ExpiredTokenException):
                await consume_fn(raw_token)
            # Still not deleted after a second failed attempt.
            assert record_id in collection._docs

    asyncio.run(scenario())


@pytest.mark.parametrize("service_module, create_fn, consume_fn", SERVICE_CASES)
def test_unknown_token_raises_invalid_not_expired(service_module, create_fn, consume_fn):
    """A raw token that was never created (matches no persisted record's
    hash) raises InvalidTokenException, not ExpiredTokenException (Req 2.4,
    5.4)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(service_module, "db", fake_db), patch.object(
            user_service_module, "db", fake_db
        ):
            with pytest.raises(InvalidTokenException):
                await consume_fn("totally-unknown-garbage-token-value")

    asyncio.run(scenario())
