"""Password_Reset_Service: the sole module permitted to read from or write
to the `password_reset_tokens` collection (Req 5.7).

Provides `create_reset_token` and `consume_reset_token`, structurally
mirroring `Email_Verification_Service`'s create/consume pattern (Req 5.1,
5.2). The raw token is generated via `secrets.token_urlsafe` and returned to
its caller exactly once; only its hash (via `Security_Module.hash_opaque_token`)
is ever persisted (Req 5.1, 5.2). Because the raw token is never persisted,
`consume_reset_token` cannot look a record up by an equality query - it must
scan the collection and verify the presented raw token against each
record's `token_hash` (scan-and-verify) until a match is found or the
collection is exhausted (Req 5.3).

`consume_reset_token` additionally hashes and persists a new password via
`User_Service.set_password_hash`, and clears the user's persisted
Refresh_Token hash via `User_Service.set_refresh_token(user_id, None)` - the
same function `Auth_Service.logout` already uses. In this codebase's
single-active-session model (one `refresh_token_hash` field per user, not a
per-device session list), clearing that one field is the complete and
sufficient mechanism for invalidating the user's active session (Req 5.3,
8.2) - no additional multi-session bookkeeping is needed or in scope here.

An expired record is deliberately left in place on the failure path (Req
5.5): the expiry check only runs after a hash match is already confirmed,
so an unrelated/garbage token is reported as Invalid rather than Expired,
and a genuinely expired token stays reproducibly Expired on every retry
rather than turning into "not found" after the first failed attempt.

Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.core.exceptions import ExpiredTokenException, InvalidTokenException
from app.core.security import hash_opaque_token, hash_password, verify_opaque_token
from app.db.mongodb import db
from app.services import user_service


def _collection():
    """Returns the `password_reset_tokens` collection off the shared Motor
    `db` handle."""
    return db["password_reset_tokens"]


async def create_reset_token(user_id: str) -> str:
    """Creates a new Password_Reset_Token for `user_id`.

    Generates the raw token value via `secrets.token_urlsafe`, persists
    only its hash together with `user_id`, a `created_at` timestamp, and an
    `expires_at` timestamp set to `created_at` plus
    `settings.password_reset_expire_minutes` minutes, and returns the raw
    token value to its caller exactly once (Req 5.1). The raw value is
    never itself persisted (Req 5.2).
    """
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await _collection().insert_one(
        {
            "user_id": user_id,
            "token_hash": hash_opaque_token(raw_token),
            "expires_at": now + timedelta(minutes=settings.password_reset_expire_minutes),
            "created_at": now,
        }
    )
    return raw_token


async def _find_matching_record(raw_token: str) -> dict[str, Any] | None:
    """Scans the collection and returns the first record whose `token_hash`
    verifies against `raw_token`, or None if no record matches.

    There is no indexed field to query the raw token by equality since it
    is never persisted, so every candidate record's hash must be verified
    individually (Req 5.3).
    """
    async for doc in _collection().find({}):
        if verify_opaque_token(raw_token, doc["token_hash"]):
            return doc
    return None


async def consume_reset_token(raw_token: str, new_password: str) -> None:
    """Consumes a Password_Reset_Token, replacing the associated user's
    password and terminating their active session.

    Locates the matching record via `_find_matching_record`. If no record's
    hash matches `raw_token`, raises `InvalidTokenException` and modifies no
    user document (Req 5.4). If a matching record's `expires_at` is in the
    past, raises `ExpiredTokenException`, modifies no user document, and
    does not delete the expired record (Req 5.5) - the expiry check only
    runs once a hash match has already been confirmed, so this branch is
    reached only for a record that really did match. If the record's
    `user_id` no longer identifies an existing user, raises
    `InvalidTokenException` and modifies no user document (Req 5.6).

    On success: hashes `new_password` via `Security_Module.hash_password`
    and persists it as the user's `password_hash` via
    `User_Service.set_password_hash`; clears the user's persisted
    Refresh_Token hash via `User_Service.set_refresh_token(user_id, None)`,
    which invalidates their active session under this codebase's
    single-refresh-token-per-user model (Req 5.3, 8.2); and deletes the
    matched record so the same raw token value cannot be consumed a second
    time (Req 5.3).
    """
    record = await _find_matching_record(raw_token)
    if record is None:
        raise InvalidTokenException("Invalid password reset token.")
    if record["expires_at"] < datetime.now(timezone.utc):
        raise ExpiredTokenException("Password reset token has expired.")
    user = await user_service.find_by_id(record["user_id"])
    if user is None:
        raise InvalidTokenException("Invalid password reset token.")
    await user_service.set_password_hash(record["user_id"], hash_password(new_password))
    await user_service.set_refresh_token(record["user_id"], None)
    await _collection().delete_one({"_id": record["_id"]})
