"""Feature_Service: the sole module permitted to read from or write to the
`features` collection.

Provides `ensure_indexes`, `create_feature`, `find_by_id`, `update_feature`,
`delete_feature`, and `get_feed`, plus the private `_build_query`/`_build_sort`
helpers used only by `get_feed`.

`update_feature`/`delete_feature` accept the requesting user's full document
(not a bare id) so that author-only (Req 5.2, 5.3) and author-or-admin
(Req 5.4, 5.5) authorization checks stay inside this module rather than
leaking into Feature_API routes (Req 27.1). Both mutation functions check
for a not-found feature before checking authorization (Req 5.7).

Requirements: 3.1, 3.2, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.3,
5.4, 5.5, 5.6, 5.7, 7.1, 7.4, 7.5, 8.1, 8.2, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.5,
10.1, 10.2, 10.3, 10.4
"""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.core.exceptions import FeatureNotFoundException, PermissionDeniedException
from app.db.mongodb import db
from app.models.feature import FeatureCreate, FeatureUpdate


def _collection():
    """Returns the `features` collection off the shared Motor `db` handle."""
    return db["features"]


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
        "description_markdown": data.description_markdown,
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
