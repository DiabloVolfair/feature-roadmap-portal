"""Comment_Service: the sole module permitted to read from or write to the
`comments` collection.

Provides `ensure_indexes`, `find_comment_by_id`, `create_comment`,
`reply_to_comment`, and (in later tasks) `get_comments_for_feature`,
`update_comment`, and `delete_comment`.

`_collection()` returns the `comments` collection; `_features_collection()`
returns the `features` collection and is used for atomic `$inc` updates to
`features.comment_count` (Req 3.1, 3.2, 3.3).

`find_comment_by_id` follows the same guard pattern as `feature_service.find_by_id`:
an invalid or malformed ObjectId string returns `None` rather than raising
(Req 2.4, 11.5).

`create_comment` sanitizes the submitted markdown, builds a full comment
document with `parent_comment_id=None`, persists it, and atomically
increments the parent feature's `comment_count` (Req 2.1, 2.2, 2.3, 3.1,
5.2, 5.5).

`reply_to_comment` looks up the parent comment (raises `CommentNotFoundException`
if absent), then inserts a reply doc with `parent_comment_id` set, atomically
increments `reply_count` on the parent comment, and increments `comment_count`
on the feature (Req 2.1, 2.2, 2.3, 3.1, 5.2, 5.5).

Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 5.2, 5.5, 6.1, 7.2, 7.3, 7.4, 7.5,
             10.4, 11.2, 11.5
"""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.core.exceptions import (
    CommentDeletedException,
    CommentNotFoundException,
    CommentPermissionDeniedException,
)
from app.db import mongodb
from app.models.comment import CommentCreate, CommentUpdate
from app.utils.markdown_sanitizer import sanitize_markdown


def _collection():
    """Returns the `comments` collection off the shared Motor `db` handle."""
    return mongodb.db["comments"]


def _features_collection():
    """Returns the `features` collection off the shared Motor `db` handle.
    Used for atomic comment_count increments/decrements (Req 3.1, 3.2, 3.3)."""
    return mongodb.db["features"]


async def ensure_indexes() -> None:
    """Creates indexes on `feature_id`, `parent_comment_id`, and the compound
    `(feature_id, created_at ASC)` index used when fetching a feature's
    comment thread. Relies on create_index's idempotency — safe to call on
    every startup (Req 2.4)."""
    collection = _collection()
    await collection.create_index("feature_id")
    await collection.create_index("parent_comment_id")
    await collection.create_index([("feature_id", 1), ("created_at", 1)])


async def find_comment_by_id(comment_id: str) -> dict[str, Any] | None:
    """Finds a comment document by id, or None (including an invalid
    ObjectId string) (Req 2.4, 11.5)."""
    try:
        object_id = ObjectId(comment_id)
    except (InvalidId, TypeError):
        return None
    return await _collection().find_one({"_id": object_id})


async def create_comment(
    data: CommentCreate, feature_id: str, author: dict[str, Any]
) -> dict[str, Any]:
    """Creates a top-level comment on a feature.

    Sanitizes `data.content_markdown` via `sanitize_markdown`, builds the
    full comment document with `parent_comment_id=None` and `reply_count=0`,
    persists it to the `comments` collection, and atomically increments
    `comment_count` on the parent feature document (Req 2.1, 2.2, 2.3, 3.1,
    5.2, 5.5).

    Returns the inserted document with `_id` populated.
    """
    now = datetime.now(timezone.utc)
    doc: dict[str, Any] = {
        "feature_id": feature_id,
        "author_id": str(author["_id"]),
        "author_name": author["name"],
        "author_role": author.get("role", "user"),
        "is_verified": bool(author.get("is_verified", False)),
        "parent_comment_id": None,
        "content_markdown": sanitize_markdown(data.content_markdown),
        "reply_count": 0,
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
    }
    result = await _collection().insert_one(doc)
    doc["_id"] = result.inserted_id

    # Atomically increment the feature's comment_count (Req 3.1).
    await _features_collection().update_one(
        {"_id": ObjectId(feature_id)},
        {"$inc": {"comment_count": 1}},
    )

    return doc


async def reply_to_comment(
    data: CommentCreate, parent_comment_id: str, author: dict[str, Any]
) -> dict[str, Any]:
    """Creates a reply to an existing comment.

    Looks up the parent comment via `find_comment_by_id`; raises
    `CommentNotFoundException` if the parent does not exist.  Builds the
    reply document with `parent_comment_id` set to the parent's `_id`
    (stringified), inserts it, atomically increments `reply_count` on the
    parent comment, and atomically increments `comment_count` on the feature
    (Req 2.1, 2.2, 2.3, 3.1, 5.2, 5.5).

    Returns the inserted document with `_id` populated.
    """
    parent = await find_comment_by_id(parent_comment_id)
    if parent is None:
        raise CommentNotFoundException("Parent comment not found.")

    feature_id: str = parent["feature_id"]
    now = datetime.now(timezone.utc)
    doc: dict[str, Any] = {
        "feature_id": feature_id,
        "author_id": str(author["_id"]),
        "author_name": author["name"],
        "author_role": author.get("role", "user"),
        "is_verified": bool(author.get("is_verified", False)),
        "parent_comment_id": str(parent["_id"]),
        "content_markdown": sanitize_markdown(data.content_markdown),
        "reply_count": 0,
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
    }
    result = await _collection().insert_one(doc)
    doc["_id"] = result.inserted_id

    # Atomically increment reply_count on the parent comment (Req 5.5).
    await _collection().update_one(
        {"_id": parent["_id"]},
        {"$inc": {"reply_count": 1}},
    )

    # Atomically increment the feature's comment_count (Req 3.1).
    await _features_collection().update_one(
        {"_id": ObjectId(feature_id)},
        {"$inc": {"comment_count": 1}},
    )

    return doc


async def get_comments_for_feature(feature_id: str) -> list[dict[str, Any]]:
    """Returns all comments for a feature as a flat list, oldest-first.

    Queries the `comments` collection filtered by `feature_id` and sorted by
    `created_at` ascending so that `build_comment_tree` receives input in the
    correct order (Req 6.1, 24.1).

    Returns an empty list when no comments exist.
    """
    cursor = _collection().find({"feature_id": feature_id}).sort("created_at", 1)
    return [doc async for doc in cursor]


async def update_comment(
    comment_id: str, data: CommentUpdate, current_user: dict[str, Any]
) -> dict[str, Any]:
    """Edits the content of an existing comment.

    Raises:
        CommentNotFoundException: if `comment_id` does not match any document
            (invalid ObjectId or missing record) (Req 11.5).
        CommentPermissionDeniedException: if the requesting user is not the
            comment author (Req 7.3, 7.4, 11.2).
        CommentDeletedException: if the comment has been soft-deleted (Req 7.5,
            10.4).

    Sanitizes the new markdown, updates `content_markdown` and `updated_at`
    atomically, then returns the refreshed document (Req 2.2, 6.1, 7.2).
    """
    comment = await find_comment_by_id(comment_id)
    if comment is None:
        raise CommentNotFoundException("Comment not found.")

    if comment["author_id"] != str(current_user["_id"]):
        raise CommentPermissionDeniedException(
            "Only the author may edit this comment."
        )

    if comment["is_deleted"]:
        raise CommentDeletedException("Cannot edit a deleted comment.")

    now = datetime.now(timezone.utc)
    await _collection().update_one(
        {"_id": comment["_id"]},
        {
            "$set": {
                "content_markdown": sanitize_markdown(data.content_markdown),
                "updated_at": now,
            }
        },
    )

    return await find_comment_by_id(comment_id)


async def delete_comment(
    comment_id: str,
    current_user: dict[str, Any],
) -> dict[str, Any]:
    """Soft-deletes a comment by setting `is_deleted=True` and scrubbing
    its content and author name.

    Raises `CommentNotFoundException` if the comment does not exist.
    Raises `CommentPermissionDeniedException` if the caller is neither the
    comment author nor an admin (Req 3.2, 3.3, 8.2, 8.3, 8.4, 8.5).

    If the comment was not already deleted, atomically decrements
    `comment_count` on the parent feature (Req 10.1, 10.2, 11.3, 11.5).

    The operation is idempotent — calling it on an already-deleted comment
    returns 200 with the existing tombstone document (Req 10.1, 10.2).
    """
    # EXISTENCE CHECK FIRST (Req 11.3, 11.5)
    comment = await find_comment_by_id(comment_id)
    if comment is None:
        raise CommentNotFoundException("Comment not found.")

    is_author: bool = comment["author_id"] == str(current_user["_id"])
    is_admin: bool = current_user.get("role") == "admin"
    if not (is_author or is_admin):
        raise CommentPermissionDeniedException(
            "Only the author or an admin may delete this comment."
        )

    already_deleted: bool = comment["is_deleted"]
    now = datetime.now(timezone.utc)

    await _collection().update_one(
        {"_id": comment["_id"]},
        {
            "$set": {
                "is_deleted": True,
                "content_markdown": "[deleted]",
                "author_name": "[deleted]",
                "updated_at": now,
            }
        },
    )

    if not already_deleted:
        # Atomically decrement the feature's comment_count (Req 10.1, 10.2).
        await _features_collection().update_one(
            {"_id": ObjectId(comment["feature_id"])},
            {"$inc": {"comment_count": -1}},
        )

    # Return the current (tombstoned) document — idempotent, always 200.
    return await find_comment_by_id(comment_id)
