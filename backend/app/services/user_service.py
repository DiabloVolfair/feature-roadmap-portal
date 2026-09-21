"""User_Service: the sole module permitted to read from or write to the
`users` collection (Req 6.8).

Provides `find_by_email`, `find_by_id`, `email_exists`, `create_user`, and
`set_refresh_token`. The `email` argument is lowercased on every read and
write so that email uniqueness is enforced case-insensitively (Req 2.2). A
duplicate-key failure on insert is translated into a `DuplicateEmailError`
distinct from any other persistence failure (Req 6.4).

The raw Refresh_Token is never persisted: only a bcrypt hash of it (via
`Security_Module.hash_refresh_token`) is stored, under the
`refresh_token_hash` field. `set_refresh_token` still accepts the raw token
string as input - hashing it before persistence is an internal
implementation detail that its callers (`Auth_Service`) do not need to know
about.

`Auth_Service` and `Auth_Middleware` never import `db` from `app.db.mongodb`
directly; they call through this module instead (Req 6.8, 27.2, 27.4).

Requirements: 2.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
"""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

from app.core.security import hash_password, hash_refresh_token
from app.db import mongodb
from app.models.user import UserCreate


class DuplicateEmailError(Exception):
    """Raised when `create_user`'s insert violates the email unique index.

    Distinct from any other persistence failure (Req 6.4), so `Auth_Service`
    can tell a duplicate-email failure apart from an unexpected error.
    """


def _collection():
    """Returns the `users` collection off the shared Motor `db` handle."""
    return mongodb.db["users"]


async def find_by_email(email: str) -> dict[str, Any] | None:
    """Finds a user document by `email` (lowercased), or returns None if no
    matching document exists (Req 6.1).
    """
    return await _collection().find_one({"email": email.lower()})


async def find_by_id(user_id: str) -> dict[str, Any] | None:
    """Finds a user document by `id`, or returns None if no matching
    document exists, including when `user_id` is not a valid ObjectId
    (Req 6.2).
    """
    try:
        object_id = ObjectId(user_id)
    except (InvalidId, TypeError):
        return None
    return await _collection().find_one({"_id": object_id})


async def email_exists(email: str) -> bool:
    """Reports whether a user document with the given `email` (lowercased)
    already exists (Req 6.7).
    """
    return await find_by_email(email) is not None


async def create_user(user_create: UserCreate) -> dict[str, Any]:
    """Creates a new user document from validated signup data and returns
    the created document (Req 6.3).

    The `email` is stored lowercased for case-insensitive uniqueness
    (Req 2.2). `role` defaults to `"user"`, `is_verified` to `False`, and
    `refresh_token_hash` to `None`; `created_at`/`updated_at` are both set to
    the current timestamp (Req 2.3, 2.4, 2.5, 2.7).

    If the underlying insert fails because a document with the same email
    already exists, raises `DuplicateEmailError` instead of creating a
    duplicate document (Req 6.4).
    """
    now = datetime.now(timezone.utc)
    doc: dict[str, Any] = {
        "name": user_create.name,
        "email": user_create.email.lower(),
        "password_hash": hash_password(user_create.password),
        "role": "user",
        "is_verified": False,
        "refresh_token_hash": None,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = await _collection().insert_one(doc)
    except DuplicateKeyError as exc:
        raise DuplicateEmailError(user_create.email) from exc
    doc["_id"] = result.inserted_id
    return doc


async def set_refresh_token(user_id: str, token: str | None) -> bool:
    """Sets or clears the `refresh_token_hash` field of the user identified
    by `id`, accepting either a raw token string or None to clear it.
    Returns True iff a matching document was found and updated (Req 6.5).

    When `token` is not None, it is hashed via
    `Security_Module.hash_refresh_token` before being persisted - the raw
    token string is never written to the database. When `token` is None,
    `refresh_token_hash` is simply set to None to clear it.

    If no user document matches `user_id`, returns False and does not alter
    any other user document (Req 6.6).
    """
    try:
        object_id = ObjectId(user_id)
    except (InvalidId, TypeError):
        return False
    token_hash = hash_refresh_token(token) if token is not None else None
    result = await _collection().update_one(
        {"_id": object_id},
        {
            "$set": {
                "refresh_token_hash": token_hash,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return result.matched_count == 1


async def mark_verified(user_id: str) -> bool:
    """Sets the `is_verified` field of the user identified by `id` to True.
    Returns True iff a matching document was found and updated (Req 2.3).

    If no user document matches `user_id`, returns False and does not alter
    any other user document.
    """
    try:
        object_id = ObjectId(user_id)
    except (InvalidId, TypeError):
        return False
    result = await _collection().update_one(
        {"_id": object_id},
        {
            "$set": {
                "is_verified": True,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return result.matched_count == 1


async def set_password_hash(user_id: str, password_hash: str) -> bool:
    """Sets the `password_hash` field of the user identified by `id` to
    `password_hash`. Returns True iff a matching document was found and
    updated (Req 5.3).

    If no user document matches `user_id`, returns False and does not alter
    any other user document.
    """
    try:
        object_id = ObjectId(user_id)
    except (InvalidId, TypeError):
        return False
    result = await _collection().update_one(
        {"_id": object_id},
        {
            "$set": {
                "password_hash": password_hash,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return result.matched_count == 1
