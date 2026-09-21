"""Property-based tests for the public roadmap functionality (Sprint 5B).

Covers Tasks 1.2 and 2.2 from the sprint-5b-public-roadmap spec:

  Property 2 (Task 1.2): RoadmapCard serialization — required fields present,
    forbidden fields absent, id == str(doc["_id"]).

  Property 1 (Task 2.2): Public Roadmap Excludes Under_Review — no document
    with status=="under_review" appears in any roadmap column.

  Property 3 (Task 2.2): Roadmap Column Totality — for documents with status
    in {"planned", "in_progress", "completed"}, every document appears in
    exactly one column and no document is lost or duplicated.

Feature: sprint-5b-public-roadmap
"""

from datetime import datetime, timezone

from bson import ObjectId
from hypothesis import given, settings
from hypothesis import strategies as st

from app.models.feature import RoadmapCard


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALL_STATUSES = ["under_review", "planned", "in_progress", "completed"]
ROADMAP_STATUSES = ["planned", "in_progress", "completed"]

# The 8 required fields that RoadmapCard must expose.
REQUIRED_FIELDS = {
    "id",
    "title",
    "category",
    "status",
    "vote_count",
    "comment_count",
    "author_name",
    "created_at",
}

# Fields that must never appear in a RoadmapCard dump.
FORBIDDEN_FIELDS = {
    "description_markdown",
    "votes",
    "author_id",
    "is_owner",
    "is_admin",
}


# ---------------------------------------------------------------------------
# Pure roadmap-grouping helper
# (Mirrors the dict-grouping logic in feature_service.get_public_roadmap()
#  without any DB access, so Properties 1 and 3 can run as pure function
#  tests — same pattern as _group_features in test_admin_properties.py.)
# ---------------------------------------------------------------------------

def _group_for_roadmap(docs: list[dict]) -> dict[str, list[dict]]:
    """Group a list of feature documents into the three public roadmap columns.

    Silently omits documents whose status is "under_review" or any unknown
    value, mirroring get_public_roadmap()'s Req 3.3/3.4 behaviour.
    """
    board: dict[str, list[dict]] = {
        "planned": [],
        "in_progress": [],
        "completed": [],
    }
    for doc in docs:
        status = doc.get("status")
        if status in board:
            board[status].append(doc)
    return board


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

@st.composite
def feature_doc_strategy(draw):
    """Generate a valid feature document dict (all four statuses) for testing
    RoadmapCard serialization and roadmap grouping.  Uses a real ObjectId for
    `_id` to mirror the persisted document shape.
    """
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "title": draw(st.text(min_size=5, max_size=120)),
        "description_markdown": draw(st.text(min_size=20, max_size=200)),
        "category": draw(
            st.sampled_from(["ui_ux", "integrations", "performance", "general"])
        ),
        "status": draw(st.sampled_from(ALL_STATUSES)),
        "author_id": str(ObjectId()),
        "author_name": draw(st.text(min_size=1, max_size=100)),
        "vote_count": draw(st.integers(min_value=0, max_value=1000)),
        "comment_count": draw(st.integers(min_value=0, max_value=500)),
        "votes": [],
        "created_at": now,
        "updated_at": now,
    }


@st.composite
def roadmap_doc_strategy(draw):
    """Generate a valid feature document dict where status is restricted to
    the three roadmap statuses — {"planned", "in_progress", "completed"} —
    for use in Property 3 (Roadmap Column Totality).
    """
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "title": draw(st.text(min_size=5, max_size=120)),
        "description_markdown": draw(st.text(min_size=20, max_size=200)),
        "category": draw(
            st.sampled_from(["ui_ux", "integrations", "performance", "general"])
        ),
        "status": draw(st.sampled_from(ROADMAP_STATUSES)),
        "author_id": str(ObjectId()),
        "author_name": draw(st.text(min_size=1, max_size=100)),
        "vote_count": draw(st.integers(min_value=0, max_value=1000)),
        "comment_count": draw(st.integers(min_value=0, max_value=500)),
        "votes": [],
        "created_at": now,
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# Task 1.2 — Property 2: Roadmap Card Omits Admin-Only Fields
# Feature: sprint-5b-public-roadmap, Property 2: Roadmap Card Omits Admin-Only Fields
# ---------------------------------------------------------------------------


# Validates: Requirements 1.1, 1.2
@settings(max_examples=100)
@given(feature_doc_strategy())
def test_roadmap_card_omits_admin_only_fields(doc):
    """For any valid feature document, RoadmapCard.from_mongo produces a
    serialized dict that:
      - contains all 8 required fields,
      - does NOT contain description_markdown, votes, author_id, is_owner,
        or is_admin,
      - has id == str(doc["_id"]).

    (Req 1.1, 1.2)
    """
    # Feature: sprint-5b-public-roadmap, Property 2: Roadmap Card Omits Admin-Only Fields
    card = RoadmapCard.from_mongo(doc)
    dumped = card.model_dump()

    # All 8 required fields must be present.
    for field in REQUIRED_FIELDS:
        assert field in dumped, (
            f"Required field '{field}' is missing from RoadmapCard dump."
        )

    # Forbidden fields must not appear.
    for field in FORBIDDEN_FIELDS:
        assert field not in dumped, (
            f"Forbidden field '{field}' must not appear in RoadmapCard dump."
        )

    # id must be the string form of the MongoDB ObjectId.
    assert dumped["id"] == str(doc["_id"]), (
        f"Expected id={str(doc['_id'])!r}, got {dumped['id']!r}"
    )


# ---------------------------------------------------------------------------
# Example test — RoadmapResponse defaults to three empty lists
# ---------------------------------------------------------------------------

def test_roadmap_response_defaults():
    """RoadmapResponse() initialises with three empty list columns."""
    from app.models.feature import RoadmapResponse

    response = RoadmapResponse()
    assert response.planned == []
    assert response.in_progress == []
    assert response.completed == []


# ---------------------------------------------------------------------------
# Task 2.2 — Property 1: Public Roadmap Excludes Under_Review
# Feature: sprint-5b-public-roadmap, Property 1: Public Roadmap Excludes Under_Review
# ---------------------------------------------------------------------------


# Validates: Requirements 3.3
@settings(max_examples=100)
@given(st.lists(feature_doc_strategy()))
def test_public_roadmap_excludes_under_review(docs):
    """For any collection that may include under_review documents,
    _group_for_roadmap never places any under_review document into any
    of the three roadmap columns.

    (Req 3.3)
    """
    # Feature: sprint-5b-public-roadmap, Property 1: Public Roadmap Excludes Under_Review
    board = _group_for_roadmap(docs)

    for column_name, column_docs in board.items():
        for d in column_docs:
            assert d.get("status") != "under_review", (
                f"Document with status='under_review' appeared in "
                f"column '{column_name}': {d}"
            )


# ---------------------------------------------------------------------------
# Task 2.2 — Property 3: Roadmap Column Totality
# Feature: sprint-5b-public-roadmap, Property 3: Roadmap Column Totality
# ---------------------------------------------------------------------------


# Validates: Requirements 3.2, 3.3
@settings(max_examples=100)
@given(st.lists(roadmap_doc_strategy()))
def test_roadmap_column_totality(docs):
    """For any list of feature documents where every status is in
    {"planned", "in_progress", "completed"}:
      - the union of all column lists equals the full input set,
      - no document appears in more than one column (no duplicates),
      - the total count of items across all columns equals len(docs).

    (Req 3.2, 3.3)
    """
    # Feature: sprint-5b-public-roadmap, Property 3: Roadmap Column Totality
    board = _group_for_roadmap(docs)

    # Collect all ids across every column.
    all_ids_in_board: list[str] = []
    for column_docs in board.values():
        for d in column_docs:
            all_ids_in_board.append(str(d["_id"]))

    input_ids = [str(d["_id"]) for d in docs]

    # All input documents (all have known roadmap statuses) must appear in
    # the board.
    assert set(all_ids_in_board) == set(input_ids), (
        "Board does not contain the same set of documents as the input."
    )

    # No duplicates across columns.
    assert len(all_ids_in_board) == len(set(all_ids_in_board)), (
        "A document appears in more than one column."
    )

    # Total count must equal input length.
    assert len(all_ids_in_board) == len(docs), (
        f"Expected {len(docs)} total items across all columns, "
        f"got {len(all_ids_in_board)}."
    )
