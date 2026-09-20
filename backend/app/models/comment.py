"""Comment_Model schemas.

Defines the Pydantic request/response schemas used by the Comment_API
(`CommentCreate`, `CommentUpdate`, `CommentResponse`, `CommentTreeResponse`),
plus `CommentResponse.from_mongo`, which maps a persisted Mongo comment
document to a `CommentResponse`.

The persisted Mongo document itself is a plain dict with this shape:

    {
        "_id": ObjectId(...),           # uniquely identifies the document (Req 1.1)
        "feature_id": str,              # reference to the parent feature
        "author_id": str,               # string form of the creating user's _id
        "author_name": str,             # snapshotted at creation time
        "author_role": str,             # snapshotted at creation time
        "is_verified": bool,            # snapshotted at creation time
        "parent_comment_id": str|None,  # None for top-level comments (Req 1.1)
        "content_markdown": str,        # 3-2000 chars, sanitized at write-time
        "reply_count": int,             # defaults to 0 on creation
        "created_at": datetime,         # set once at creation, UTC
        "updated_at": datetime,         # set at creation and rewritten on edits
        "is_deleted": bool,             # soft-delete flag, defaults to False
    }

`Comment_Service` (not this module) is responsible for constructing and
persisting those documents; this module only defines the schemas used at the
API boundary and the `from_mongo` mapping.

Requirements: 1.1, 1.2, 1.3, 1.4, 1.7
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    """Create comment or reply request body (Req 1.1).

    `content_markdown` must be 3-2000 characters (Req 1.1); a request body
    violating either bound fails validation. `parent_comment_id` is optional
    and defaults to `None` for top-level comments; when provided it must be
    the string form of an existing comment's `_id`.
    """

    content_markdown: str = Field(min_length=3, max_length=2000)
    parent_comment_id: str | None = None


class CommentUpdate(BaseModel):
    """Edit comment request body (Req 1.2).

    `content_markdown` must be 3-2000 characters (Req 1.2).
    """

    content_markdown: str = Field(min_length=3, max_length=2000)


class CommentResponse(BaseModel):
    """Serialized comment data as returned by the Comment_API (Req 1.3).

    Carries all Comment_Document fields in their API-safe form: `_id` is
    mapped to `id` (str) and the raw ObjectId is never exposed.
    """

    id: str
    feature_id: str
    author_id: str
    author_name: str
    author_role: str
    is_verified: bool
    parent_comment_id: str | None
    content_markdown: str
    reply_count: int
    created_at: datetime
    updated_at: datetime
    is_deleted: bool

    @classmethod
    def from_mongo(cls, doc: dict[str, Any]) -> "CommentResponse":
        """Build a `CommentResponse` from a persisted Mongo comment document.

        Maps `doc["_id"]` to `id` (stringified) and reads all declared
        fields from the document explicitly, so no raw MongoDB internals
        leak through this mapping (Req 1.7).
        """
        return cls(
            id=str(doc["_id"]),
            feature_id=doc["feature_id"],
            author_id=doc["author_id"],
            author_name=doc["author_name"],
            author_role=doc["author_role"],
            is_verified=doc["is_verified"],
            parent_comment_id=doc["parent_comment_id"],
            content_markdown=doc["content_markdown"],
            reply_count=doc["reply_count"],
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            is_deleted=doc["is_deleted"],
        )


class CommentTreeResponse(CommentResponse):
    """Comment node in a nested discussion tree (Req 1.4).

    Extends `CommentResponse` with a `replies` field containing the direct
    children of this node, each of which is itself a `CommentTreeResponse`.
    Defaults to an empty list so leaf nodes need no special treatment.

    `model_rebuild()` is called after the class definition to resolve the
    forward reference required by Pydantic v2 for self-referencing models.
    """

    replies: list["CommentTreeResponse"] = []


# Required for Pydantic v2 to resolve the self-referencing `replies` field.
CommentTreeResponse.model_rebuild()


def build_comment_tree(docs: list[dict]) -> list[CommentTreeResponse]:
    """Convert a flat, oldest-first list of comment documents to a nested tree.

    Precondition: `docs` is sorted by `created_at` ASC (oldest-first), which
    the service layer guarantees by querying with `sort("created_at", 1)`.

    Algorithm
    ---------
    1. Convert every doc to a `CommentTreeResponse` node (replies=[]).
    2. Build `id_map`   – { str(doc["_id"]): node }
    3. Build `depth_map` – { node.id: int }  (populated incrementally)
    4. Walk docs in arrival order:
       - If the node has no parent, or the parent id is not in id_map,
         treat it as a top-level comment (depth 0) and append to roots.
       - If parent_depth < 3: attach as a direct child and record
         depth = parent_depth + 1.
       - If parent_depth >= 3: walk up the ancestor chain until we reach
         the first ancestor whose depth < 3, then attach there as a depth-3
         child (ensuring no node exceeds depth 3).
    5. Return roots.

    Key invariants
    --------------
    - Every comment appears exactly once (no duplication, no omission).
    - No node has depth > 3.
    - Siblings are ordered oldest-first (input order preserved).
    - Soft-deleted comments are included unchanged.

    Requirements: 1.5, 1.6, 4.1, 4.2, 4.3, 4.4, 4.5
    """
    # Step 1 & 2: convert docs → nodes, build id_map
    id_map: dict[str, CommentTreeResponse] = {}
    nodes: list[CommentTreeResponse] = []
    for doc in docs:
        node = CommentTreeResponse(
            id=str(doc["_id"]),
            feature_id=doc["feature_id"],
            author_id=doc["author_id"],
            author_name=doc["author_name"],
            author_role=doc["author_role"],
            is_verified=doc["is_verified"],
            parent_comment_id=doc["parent_comment_id"],
            content_markdown=doc["content_markdown"],
            reply_count=doc["reply_count"],
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            is_deleted=doc["is_deleted"],
            replies=[],
        )
        id_map[node.id] = node
        nodes.append(node)

    # Step 3 & 4: assign depths and build tree
    depth_map: dict[str, int] = {}
    roots: list[CommentTreeResponse] = []

    for node in nodes:
        pid = node.parent_comment_id

        if pid is None or pid not in id_map:
            # Top-level comment
            depth_map[node.id] = 0
            roots.append(node)
        else:
            parent_depth = depth_map[id_map[pid].id]
            if parent_depth < 3:
                # Attach as direct child of parent
                depth_map[node.id] = parent_depth + 1
                id_map[pid].replies.append(node)
            else:
                # Excess depth: walk up until we find an ancestor whose depth < 3,
                # then attach as a depth-3 child of that ancestor.
                ancestor_id = pid
                while depth_map.get(ancestor_id, 0) >= 3:
                    ancestor = id_map[ancestor_id]
                    ancestor_id = ancestor.parent_comment_id  # type: ignore[assignment]
                depth_map[node.id] = depth_map[ancestor_id] + 1
                id_map[ancestor_id].replies.append(node)

    # Step 5
    return roots
