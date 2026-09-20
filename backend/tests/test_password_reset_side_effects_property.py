"""Property test for password reset side effects (Sprint 1B).

Feature: sprint-1b-authentication-completion
Property 3: Successful password reset replaces the password hash and
invalidates the refresh session.

For any user with an existing Refresh_Token hash and any valid unexpired
Password_Reset_Token, successfully consuming that token with a new valid
password SHALL cause the user's `password_hash` to verify against the new
password, and SHALL cause the user's `refresh_token_hash` to become `None`.

Validates: Requirements 5.3

Exercised against a minimal in-memory fake Motor-like collection/db (no real
MongoDB connection required), duplicating the fake-db pattern used by the
sibling files `test_password_reset_service.py` and
`test_token_consumption_properties.py`. This is a deliberately separate wave
(per tasks.md's Task Dependency Graph) so this file does not touch the same
files concurrently as tasks 4.4/4.6.
"""

import asyncio
from typing import Any
from unittest.mock import patch

from bson import ObjectId
from hypothesis import given, settings
from hypothesis import strategies as st

import app.services.password_reset_service as password_reset_service
import app.services.user_service as user_service_module
from app.core.security import verify_password


# --- Minimal in-memory fake Motor-like collection/db ------------------------
#
# Supports only the operations the service under test actually calls:
# insert_one, find({}), delete_one, update_one, find_one. Duplicated here
# (rather than imported) to match how the sibling test files keep their
# fakes local, since there is no shared fixture module yet.


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


async def _create_user_with_active_session(fake_db: _FakeDB) -> str:
    """Inserts a user document with a known initial `password_hash` and a
    known non-None `refresh_token_hash` (simulating an active session)
    directly into the fake `users` collection, and returns its id as a
    string."""
    result = await fake_db["users"].insert_one(
        {
            "name": "Test User",
            "email": "test-password-reset-side-effects@example.com",
            "password_hash": "initial-password-hash",
            "role": "user",
            "is_verified": False,
            "refresh_token_hash": "initial-refresh-token-hash",
            "created_at": None,
            "updated_at": None,
        }
    )
    return str(result.inserted_id)


# Valid-bound passwords only: this property is about consume_reset_token's
# side effects given an already-valid password, not about validation bounds
# - that is Property 6 / task 4.4's job. Restricted to printable ASCII of
# length 8-72 (rather than the full 8-128 PasswordResetRequest bound) so
# every generated value is guaranteed hashable: `hash_password` rejects
# passwords exceeding 72 UTF-8 bytes and any embedded NUL byte, and a
# non-ASCII character could exceed 72 bytes well before 128 characters -
# both pre-existing hashing-layer constraints orthogonal to this property.
valid_new_passwords = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126), min_size=8, max_size=72
)


# Feature: sprint-1b-authentication-completion, Property 3: Successful password reset replaces the password hash and invalidates the refresh session
@given(new_password=valid_new_passwords)
@settings(max_examples=100, deadline=None)
def test_consume_reset_token_replaces_password_hash_and_clears_refresh_token(new_password):
    """For any valid-bound new password, successfully consuming a Password
    Reset Token SHALL cause the user's `password_hash` to change from its
    initial value and to verify against the new password, and SHALL cause
    the user's `refresh_token_hash` to become `None` (Req 5.3)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(password_reset_service, "db", fake_db), patch.object(
            user_service_module, "db", fake_db
        ):
            user_id = await _create_user_with_active_session(fake_db)
            initial_password_hash = (await user_service_module.find_by_id(user_id))[
                "password_hash"
            ]

            raw_token = await password_reset_service.create_reset_token(user_id)

            await password_reset_service.consume_reset_token(raw_token, new_password)

            updated_doc = await user_service_module.find_by_id(user_id)

            # password_hash changed from its initial value and verifies
            # against the new password (Req 5.3).
            assert updated_doc["password_hash"] != initial_password_hash
            assert verify_password(new_password, updated_doc["password_hash"]) is True

            # refresh_token_hash was cleared, invalidating the previously
            # active session (Req 5.3).
            assert updated_doc["refresh_token_hash"] is None

    asyncio.run(scenario())
