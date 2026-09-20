"""Email_Verification_Service: the sole module permitted to read from or
write to the `email_verification_tokens` collection (Req 2.7).

Provides `create_verification_token` and `consume_verification_token`,
mirroring the create-token/consume-token shape `User_Service.set_refresh_token`
and Sprint 1A's Refresh_Token flow already establish. The raw token is never
persisted: only its hash (via `Security_Module.hash_opaque_token`) is stored,
and the raw value is handed back to the caller exactly once, at creation
time (Req 2.1, 2.2).

`Auth_API`, `Auth_Service`, and `Auth_Middleware` access
`email_verification_tokens` data exclusively through this module and never
issue MongoDB queries against that collection directly (Req 2.7).

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.core.exceptions import ExpiredTokenException, InvalidTokenException
from app.core.security import hash_opaque_token, verify_opaque_token
from app.db.mongodb import db
from app.services import user_service


def _collection():
    """Returns the `email_verification_tokens` collection off the shared
    Motor `db` handle."""
    return db["email_verification_tokens"]


async def create_verification_token(user_id: str) -> str:
    """Creates a new Email_Verification_Token for `user_id` and returns the
    raw token value exactly once (Req 2.1).

    The raw value is generated via `secrets.token_urlsafe`, never persisted;
    only its hash (via `Security_Module.hash_opaque_token`) is written to
    the collection, alongside `user_id`, a `created_at` timestamp, and an
    `expires_at` timestamp set to `email_verification_expire_hours` hours
    from now (Req 2.1, 2.2).
    """
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await _collection().insert_one(
        {
            "user_id": user_id,
            "token_hash": hash_opaque_token(raw_token),
            "expires_at": now + timedelta(hours=settings.email_verification_expire_hours),
            "created_at": now,
        }
    )
    return raw_token


async def _find_matching_record(raw_token: str) -> dict[str, Any] | None:
    """Scans the collection and returns the first record whose `token_hash`
    verifies against `raw_token`, or None if no record matches.

    The raw token is never persisted, so there is no indexed field to query
    by equality - the presented value can only be verified against each
    stored bcrypt hash in turn (mirroring how `refresh_session` already
    matches a presented Refresh_Token against a persisted hash). This is
    acceptable because the collection is expected to stay small: at most one
    live row per pending verification in practice, with rows removed on
    every successful consumption.
    """
    async for doc in _collection().find({}):
        if verify_opaque_token(raw_token, doc["token_hash"]):
            return doc
    return None


async def consume_verification_token(raw_token: str) -> None:
    """Consumes `raw_token`: marks the associated user verified via
    `User_Service` and deletes the matched record so the same raw token
    cannot be consumed a second time (Req 2.3).

    Failure branches, checked in this order:

    - No record's hash matches `raw_token`: raises `InvalidTokenException`
      and does not modify any user document (Req 2.4).
    - A matching record's `expires_at` is in the past: raises
      `ExpiredTokenException` and does not modify any user document. The
      expired record is deliberately NOT deleted here - Requirement 2.5
      requires this failure path to have no such side effect, which keeps
      failure semantics simple and idempotent: an expired token stays
      exactly as expired on a second attempt, rather than turning into
      "not found" after the first failed attempt. No TTL index or cleanup
      job is introduced; stale expired rows are an operational concern
      outside this sprint's scope (Req 2.5).
    - The matching record's `user_id` no longer identifies an existing
      user: raises `InvalidTokenException` and does not modify any user
      document (Req 2.6).

    The expiry check only runs once a hash match has been confirmed: an
    expired token that doesn't match anything is "invalid" (Req 2.4), not
    "expired" (Req 2.5) - matching the order in which the two requirements
    are stated.
    """
    record = await _find_matching_record(raw_token)
    if record is None:
        raise InvalidTokenException("Invalid verification token.")
    if record["expires_at"] < datetime.now(timezone.utc):
        raise ExpiredTokenException("Verification token has expired.")
    user = await user_service.find_by_id(record["user_id"])
    if user is None:
        raise InvalidTokenException("Invalid verification token.")
    await user_service.mark_verified(record["user_id"])
    await _collection().delete_one({"_id": record["_id"]})
