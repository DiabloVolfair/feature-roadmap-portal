"""Feature_Model schemas.

Defines the Pydantic request/response schemas used by the Feature_API
(`FeatureCreate`, `FeatureUpdate`, `FeatureResponse`, `FeatureFeedResponse`,
`PaginationMeta`, `PaginatedFeatureResponse`), plus `FeatureResponse.from_mongo`,
which maps a persisted Mongo feature document to a `FeatureResponse` without
ever exposing `votes`.

The persisted Mongo document itself is a plain dict (Motor does not require
a Pydantic model to write/read it) with this shape:

    {
        "_id": ObjectId(...),           # uniquely identifies the document (Req 1.1)
        "title": str,                    # 5-120 chars (Req 1.8)
        "description_markdown": str,     # 20-10,000 chars (Req 1.8, 1.9)
        "category": "ui_ux" | "integrations" | "performance" | "general",
        "status": "under_review" | "planned" | "in_progress" | "completed",
                                         # defaults to "under_review" on
                                         # creation (Req 1.2, 1.3)
        "author_id": str,                # string form of the creating user's
                                         # _id
        "author_name": str,              # snapshotted at creation time
        "vote_count": int,               # defaults to 0 on creation (Req 1.5)
        "comment_count": int,            # defaults to 0 on creation (Req 1.5)
        "votes": list,                   # defaults to [] on creation (Req 1.5);
                                         # no voting logic this sprint
        "created_at": datetime,          # set once at creation, never rewritten
                                         # afterward (Req 1.6, 1.7)
        "updated_at": datetime,          # set at creation and rewritten on every
                                         # subsequent persisted-field change
                                         # (Req 1.6, 1.7)
    }

`Feature_Service` (not this module) is responsible for actually constructing
and persisting that document; this module only defines the schemas used at
the API boundary and the `from_mongo` mapping.

Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.2,
2.3, 2.4, 2.5, 2.6, 2.7, 2.8
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

FeatureCategory = Literal["ui_ux", "integrations", "performance", "general"]
"""The `category` field is restricted to exactly these four values (Req 1.4)."""

FeatureStatus = Literal["under_review", "planned", "in_progress", "completed"]
"""The `status` field is restricted to exactly these four values (Req 1.3),
defaulting to `"under_review"` for newly created feature requests (Req 1.2)."""

FeatureSort = Literal[
    "newest", "oldest", "most_upvoted", "most_discussed", "trending", "relevance"
]
"""The Feed_Endpoint's `sort` query parameter is restricted to exactly these
six values (Req 8.1)."""


class FeatureCreate(BaseModel):
    """Create_Feature_Endpoint request body (Req 2.1).

    `title` must be 5-120 characters and `description_markdown` must be
    20-10,000 characters (Req 1.8, 1.9); a request body violating either
    bound fails validation (Req 2.8). This schema has no `status`,
    `author_id`, or `author_name` field - those are server-assigned.
    """

    title: str = Field(min_length=5, max_length=120)
    description_markdown: str = Field(min_length=20, max_length=10_000)
    category: FeatureCategory


class FeatureUpdate(BaseModel):
    """Update_Feature_Endpoint request body (Req 2.2).

    Every field is optional (default `None`) to support partial updates,
    using the same bounds as `FeatureCreate` when a value is supplied
    (Req 2.8). Structurally has no `status` field under any name - this is
    the sole mechanism preventing a non-admin from changing `status`
    through this endpoint (Req 5.6), mirroring the precedent set by
    `UserResponse`'s deliberate omission of `password_hash`.
    """

    title: str | None = Field(default=None, min_length=5, max_length=120)
    description_markdown: str | None = Field(
        default=None, min_length=20, max_length=10_000
    )
    category: FeatureCategory | None = None


class FeatureResponse(BaseModel):
    """Serialized feature data as returned by the Feature_API (Req 2.3).

    Structurally cannot contain a `votes` field - there is no such field on
    this model, a deliberate omission rather than an always-empty
    placeholder, because no client-observable behavior this sprint depends
    on the array's contents.
    """

    id: str
    title: str
    description_markdown: str
    category: FeatureCategory
    status: FeatureStatus
    author_id: str
    author_name: str
    vote_count: int
    comment_count: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict[str, Any]) -> "FeatureResponse":
        """Build a `FeatureResponse` from a persisted Mongo feature document.

        Maps `doc["_id"]` to `id` (stringified) and reads only the fields
        this schema declares, so a raw document - including its `votes`
        array - can never leak through this mapping.
        """
        return cls(
            id=str(doc["_id"]),
            title=doc["title"],
            description_markdown=doc["description_markdown"],
            category=doc["category"],
            status=doc["status"],
            author_id=doc["author_id"],
            author_name=doc["author_name"],
            vote_count=doc["vote_count"],
            comment_count=doc["comment_count"],
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )


class FeatureFeedResponse(FeatureResponse):
    """Feed_Endpoint item schema (Req 2.4).

    Identical in shape to `FeatureResponse`, including the full,
    untruncated `description_markdown` - intentionally not a distinct,
    lighter-weight shape, because the feed's description preview is
    computed client-side from the full `description_markdown` already
    present here (Req 24.3), avoiding two different truncation behaviors
    for the same visual result.
    """


class PaginationMeta(BaseModel):
    """Pagination metadata accompanying a `PaginatedFeatureResponse` (Req 2.5)."""

    page: int
    limit: int
    total_items: int
    total_pages: int
    has_next: bool
    has_previous: bool


class PaginatedFeatureResponse(BaseModel):
    """Feed_Endpoint success response body (Req 2.6)."""

    items: list[FeatureFeedResponse]
    pagination: PaginationMeta
