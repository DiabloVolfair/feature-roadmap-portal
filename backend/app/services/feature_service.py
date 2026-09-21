"""Feature_Service: the sole module permitted to read from or write to the
`features` collection.

Provides `ensure_indexes`, `create_feature`, `find_by_id`, `update_feature`,
`delete_feature`, `get_feed`, and `get_related_features`, plus the private
`_build_query`/`_build_sort` helpers used only by `get_feed`.

`update_feature`/`delete_feature` accept the requesting user's full document
(not a bare id) so that author-only (Req 5.2, 5.3) and author-or-admin
(Req 5.4, 5.5) authorization checks stay inside this module rather than
leaking into Feature_API routes (Req 27.1). Both mutation functions check
for a not-found feature before checking authorization (Req 5.7).

`description_markdown` is passed through `Markdown_Sanitizer.sanitize_markdown`
at a single shared point, immediately before persistence in `create_feature`
and `update_feature`. Because sanitization happens at write-time, every
read path (`find_by_id`, `get_feed`, `get_related_features`) returns the
already-sanitized value with no separate sanitization step of its own, so
no code path can return a differently-sanitized copy of the same field
(Req 3.6).

Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2,
5.3, 5.4, 5.5, 5.6, 5.7, 7.1, 7.4, 7.5, 8.1, 8.2, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3,
9.5, 10.1, 10.2, 10.3, 10.4
"""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument

from app.core.exceptions import (
    AdminPermissionException,
    AlreadyVotedException,
    FeatureNotFoundException,
    InvalidStatusTransitionException,
    PermissionDeniedException,
    StatusUpdateFailedException,
)
from app.db import mongodb
from app.models.feature import FeatureCreate, FeatureUpdate
from app.utils.markdown_sanitizer import sanitize_markdown


def _collection():
    """Returns the `features` collection off the shared Motor `db` handle."""
    return mongodb.db["features"]


async def ensure_indexes() -> None:
    """Creates the compound text index (title + description_markdown) and
    the five single-field indexes (category, status, created_at desc,
    vote_count desc, comment_count desc). Relies on create_index's
    idempotency - safe to call on every startup (Req 3.1, 3.2, 3.5)."""
    collection = _collection()
    await collection.create_index(
        [("title", "text"), ("description_markdown", "text")], name="feature_text_search"
    )
    await collection.create_index("category")
    await collection.create_index("status")
    await collection.create_index([("created_at", -1)])
    await collection.create_index([("vote_count", -1)])
    await collection.create_index([("comment_count", -1)])


async def create_feature(data: FeatureCreate, author_id: str, author_name: str) -> dict[str, Any]:
    """Creates a feature document from validated FeatureCreate data plus the
    requesting user's id/name, defaulting status/vote_count/comment_count/
    votes/created_at/updated_at (Req 1.2, 1.5, 1.6, 4.1)."""
    now = datetime.now(timezone.utc)
    doc = {
        "title": data.title,
        "description_markdown": sanitize_markdown(data.description_markdown),
        "category": data.category,
        "status": "under_review",
        "author_id": author_id,
        "author_name": author_name,
        "vote_count": 0,
        "comment_count": 0,
        "votes": [],
        "created_at": now,
        "updated_at": now,
    }
    result = await _collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def find_by_id(feature_id: str) -> dict[str, Any] | None:
    """Finds a feature document by id, or None (including an invalid
    ObjectId string) (Req 4.2)."""
    try:
        object_id = ObjectId(feature_id)
    except (InvalidId, TypeError):
        return None
    return await _collection().find_one({"_id": object_id})


async def update_feature(
    feature_id: str, data: FeatureUpdate, current_user: dict[str, Any]
) -> dict[str, Any]:
    """Applies only the fields present in `data` (Req 4.3), enforcing
    author-only authorization (Req 5.2, 5.3). Raises FeatureNotFoundException
    if no matching document exists (checked before authorization, Req 5.7),
    or PermissionDeniedException if the requester is not the author."""
    feature = await find_by_id(feature_id)
    if feature is None:
        raise FeatureNotFoundException("Feature request not found.")
    if feature["author_id"] != str(current_user["_id"]):
        raise PermissionDeniedException("Only the author may edit this feature request.")
    updates = data.model_dump(exclude_unset=True)
    if "description_markdown" in updates:
        updates["description_markdown"] = sanitize_markdown(updates["description_markdown"])
    updates["updated_at"] = datetime.now(timezone.utc)
    await _collection().update_one({"_id": feature["_id"]}, {"$set": updates})
    return await find_by_id(feature_id)


async def delete_feature(feature_id: str, current_user: dict[str, Any]) -> None:
    """Deletes a feature document iff the requester is its author OR an
    admin (Req 5.4, 5.5); raises FeatureNotFoundException (checked first,
    Req 5.7) or PermissionDeniedException."""
    feature = await find_by_id(feature_id)
    if feature is None:
        raise FeatureNotFoundException("Feature request not found.")
    is_author = feature["author_id"] == str(current_user["_id"])
    is_admin = current_user.get("role") == "admin"
    if not (is_author or is_admin):
        raise PermissionDeniedException("Only the author or an admin may delete this feature request.")
    await _collection().delete_one({"_id": feature["_id"]})


async def get_feed(
    page: int, limit: int, category: list[str], status: list[str], sort: str, search: str | None
) -> tuple[list[dict[str, Any]], int]:
    """Returns (page of matching documents, total matching count), given
    parsed feed parameters (Req 4.5)."""
    query = _build_query(category, status, search)
    sort_spec = _build_sort(sort, search)
    total = await _collection().count_documents(query)
    cursor = _collection().find(query).sort(sort_spec).skip((page - 1) * limit).limit(limit)
    items = [doc async for doc in cursor]
    return items, total


def _build_query(category: list[str], status: list[str], search: str | None) -> dict:
    """Translates filters into a MongoDB query: OR-within a filter type, AND
    across types (Req 9.1, 9.2, 9.3, 9.5); adds a $text clause iff `search`
    is non-empty (Req 10.1, 10.4)."""
    query: dict[str, Any] = {}
    if category:
        query["category"] = {"$in": category}
    if status:
        query["status"] = {"$in": status}
    if search:
        query["$text"] = {"$search": search}
    return query


def _build_sort(sort: str, search: str | None) -> list[tuple[str, int]]:
    """Translates `sort` (and whether `search` is present) into a MongoDB
    sort specification (Req 8.1, 8.2, 8.4, 8.5, 8.6)."""
    if sort == "relevance":
        if search:
            return [("score", {"$meta": "textScore"})]
        return [("created_at", -1)]  # no search term to score against
    return {
        "newest": [("created_at", -1)],
        "oldest": [("created_at", 1)],
        "most_upvoted": [("vote_count", -1)],
        "most_discussed": [("comment_count", -1)],
        "trending": [("vote_count", -1), ("created_at", -1)],
    }[sort]


async def get_related_features(
    feature_id: str, category: str, limit: int = 4
) -> list[dict[str, Any]]:
    """Returns up to `limit` (<=4 within this sprint's call sites) feature
    documents sharing `category`, excluding `feature_id`, ordered by
    created_at descending with _id descending as a deterministic tiebreaker
    (Req 2.2-2.6). Returns [] on zero matches, never None. Queries only the
    existing `category` and `created_at` indexes from Sprint 2A - no new
    index required (Req 2.9)."""
    cursor = (
        _collection()
        .find({"category": category, "_id": {"$ne": ObjectId(feature_id)}})
        .sort([("created_at", -1), ("_id", -1)])
        .limit(limit)
    )
    return [doc async for doc in cursor]


async def toggle_vote(feature_id: str, user_id: str) -> dict[str, Any]:
    """Atomically toggles `user_id`'s vote on a feature and returns
    `{voted, vote_count}` from the post-update document.

    Reads the feature once via `find_by_id` (a genuine miss is a
    FeatureNotFoundException, not a lost-race AlreadyVotedException - Req 2.6)
    and uses current membership (`user_id in feature["votes"]`) only to choose
    the branch. The state change is a single conditional `find_one_and_update`
    whose filter carries the membership guard, so the array update and the
    count adjustment are one write and can never diverge (Req 1.2, 1.3, 2.2,
    2.3): the add branch filters `{_id, votes: {$ne: user_id}}` and applies
    `{$addToSet: {votes: user_id}, $inc: {vote_count: 1}}`; the remove branch
    filters `{_id, votes: user_id}` and applies `{$pull: {votes: user_id},
    $inc: {vote_count: -1}}`. Both request the post-update document via
    ReturnDocument.AFTER. When the conditional write matches nothing on an
    existing feature the vote state changed under us, so AlreadyVotedException
    is raised rather than retrying or corrupting the count (Req 2.7).

    Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
    """
    feature = await find_by_id(feature_id)
    if feature is None:
        raise FeatureNotFoundException("Feature request not found.")

    object_id = feature["_id"]
    already_voted = user_id in feature.get("votes", [])

    if already_voted:
        updated = await _collection().find_one_and_update(
            {"_id": object_id, "votes": user_id},
            {"$pull": {"votes": user_id}, "$inc": {"vote_count": -1}},
            return_document=ReturnDocument.AFTER,
        )
        resulting_voted = False
    else:
        updated = await _collection().find_one_and_update(
            {"_id": object_id, "votes": {"$ne": user_id}},
            {"$addToSet": {"votes": user_id}, "$inc": {"vote_count": 1}},
            return_document=ReturnDocument.AFTER,
        )
        resulting_voted = True

    if updated is None:
        raise AlreadyVotedException(
            "Your vote could not be applied because the vote state changed. Please retry."
        )

    return {"voted": resulting_voted, "vote_count": updated["vote_count"]}


# ---------------------------------------------------------------------------
# Admin Kanban board — Sprint 5A
# ---------------------------------------------------------------------------

VALID_STATUSES = frozenset({"under_review", "planned", "in_progress", "completed"})
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {s: VALID_STATUSES - {s} for s in VALID_STATUSES}


def validate_status_transition(current_status: str, requested_status: str) -> None:
    """Pure function. Raises InvalidStatusTransitionException for same-to-same.

    Requirements: 4.2, 4.3
    """
    if requested_status == current_status:
        raise InvalidStatusTransitionException(
            f"Feature is already '{current_status}'. Specify a different target status."
        )


async def get_board() -> dict[str, list[dict]]:
    """Returns all features grouped into four status columns, sorted by
    vote_count descending then created_at descending within each column.
    Silently skips documents whose status value is not one of the four known
    statuses. No pagination or filtering is applied.

    Requirements: 6.1, 6.2, 6.3
    """
    board: dict[str, list[dict]] = {
        "under_review": [],
        "planned": [],
        "in_progress": [],
        "completed": [],
    }
    cursor = _collection().find({}).sort([("vote_count", -1), ("created_at", -1)])
    async for doc in cursor:
        status = doc.get("status")
        if status in board:
            board[status].append(doc)
    return board


async def update_feature_status(
    feature_id: str, new_status: str, current_user: dict[str, Any]
) -> dict[str, Any]:
    """Atomically updates a feature's status.

    Guard order:
    1. Fetch feature by id; raise FeatureNotFoundException if absent.
    2. Check current_user role; raise AdminPermissionException if not admin.
    3. Validate the transition; raise InvalidStatusTransitionException on
       same-to-same.
    4. Perform atomic find_one_and_update with ReturnDocument.AFTER; raise
       StatusUpdateFailedException if the returned document is None.

    Returns the updated feature document.

    Requirements: 6.4, 6.5, 6.6, 6.7, 6.8
    """
    feature = await find_by_id(feature_id)
    if feature is None:
        raise FeatureNotFoundException("Feature request not found.")

    if current_user.get("role") != "admin":
        raise AdminPermissionException("Only administrators may update a feature's status.")

    validate_status_transition(feature["status"], new_status)

    now = datetime.now(timezone.utc)
    updated = await _collection().find_one_and_update(
        {"_id": feature["_id"]},
        {"$set": {"status": new_status, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise StatusUpdateFailedException(
            "Status update could not be persisted. Please retry."
        )
    return updated


# ---------------------------------------------------------------------------
# Public Roadmap — Sprint 5B
# ---------------------------------------------------------------------------


async def get_public_roadmap() -> dict[str, list[dict]]:
    """Returns features grouped into the three public roadmap columns.
    Silently skips 'under_review' and any unknown status values.
    Sort: vote_count DESC, created_at DESC (Req 3.1–3.6)."""
    board: dict[str, list[dict]] = {
        "planned": [],
        "in_progress": [],
        "completed": [],
    }
    cursor = _collection().find({}).sort([("vote_count", -1), ("created_at", -1)])
    async for doc in cursor:
        status = doc.get("status")
        if status in board:
            board[status].append(doc)
    return board
