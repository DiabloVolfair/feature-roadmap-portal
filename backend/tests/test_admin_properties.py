"""Property-based tests for admin Kanban board functionality (Sprint 5A).

Covers Tasks 2.2 and 3.2 from the sprint-5a-admin-kanban-board spec:

  Property 6 (Task 2.2): BoardFeatureCard serialization — required fields
    present, forbidden fields absent, id == str(doc["_id"]).

  Property 1 (Task 3.2): Same-status transition is always rejected by
    validate_status_transition.

  Property 2 (Task 3.2): Cross-status transition is always accepted by
    validate_status_transition.

  Property 3 (Task 3.2): Board totality — grouping all feature documents
    produces columns whose union equals the full input set, with no
    duplicates and correct total count.

Feature: sprint-5a-admin-kanban-board
"""

from datetime import datetime, timezone

import pytest
from bson import ObjectId
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from app.core.exceptions import InvalidStatusTransitionException
from app.models.feature import BoardFeatureCard
from app.services.feature_service import ALLOWED_TRANSITIONS, validate_status_transition


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STATUSES = ["under_review", "planned", "in_progress", "completed"]

# The 8 required fields that BoardFeatureCard must expose.
REQUIRED_FIELDS = {"id", "title", "category", "status", "vote_count", "comment_count", "author_name", "created_at"}

# Fields that must never appear in a BoardFeatureCard dump.
FORBIDDEN_FIELDS = {"description_markdown", "votes"}


# ---------------------------------------------------------------------------
# Pure board-grouping helper
# (Mirrors the dict-grouping logic in feature_service.get_board() without
#  any DB access, so Property 3 can run as a pure function test.)
# ---------------------------------------------------------------------------

def _group_features(docs: list[dict]) -> dict[str, list[dict]]:
    """Group a list of feature documents into the four status columns.

    Silently omits documents whose status is not one of the four known values,
    mirroring get_board()'s Req 6.3 behaviour.
    """
    board: dict[str, list[dict]] = {
        "under_review": [],
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
    """Generate a valid feature document dict for testing BoardFeatureCard
    serialization and board grouping.  Uses a real ObjectId for `_id` to
    mirror the persisted document shape.
    """
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "title": draw(st.text(min_size=5, max_size=120)),
        "description_markdown": draw(st.text(min_size=20, max_size=200)),
        "category": draw(st.sampled_from(["ui_ux", "integrations", "performance", "general"])),
        "status": draw(st.sampled_from(STATUSES)),
        "author_id": str(ObjectId()),
        "author_name": draw(st.text(min_size=1, max_size=100)),
        "vote_count": draw(st.integers(min_value=0, max_value=1000)),
        "comment_count": draw(st.integers(min_value=0, max_value=500)),
        "votes": [],
        "created_at": now,
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# Task 2.2 — Property 6: BoardFeatureCard Serialization
# Feature: sprint-5a-admin-kanban-board, Property 6: BoardFeatureCard Serialization
# ---------------------------------------------------------------------------


# Validates: Requirements 1.1, 1.2, 1.5
@settings(max_examples=100)
@given(feature_doc_strategy())
def test_board_feature_card_serialization(doc):
    """For any valid feature document, BoardFeatureCard.from_mongo produces
    a serialized dict that:
      - contains all 8 required fields,
      - does NOT contain description_markdown or votes,
      - has id == str(doc["_id"]).

    (Req 1.1, 1.2, 1.5)
    """
    # Feature: sprint-5a-admin-kanban-board, Property 6: BoardFeatureCard Serialization
    card = BoardFeatureCard.from_mongo(doc)
    dumped = card.model_dump()

    # All 8 required fields must be present.
    for field in REQUIRED_FIELDS:
        assert field in dumped, (
            f"Required field '{field}' is missing from BoardFeatureCard dump."
        )

    # Forbidden fields must not appear.
    for field in FORBIDDEN_FIELDS:
        assert field not in dumped, (
            f"Forbidden field '{field}' must not appear in BoardFeatureCard dump."
        )

    # id must be the string form of the MongoDB ObjectId.
    assert dumped["id"] == str(doc["_id"]), (
        f"Expected id={str(doc['_id'])!r}, got {dumped['id']!r}"
    )


# ---------------------------------------------------------------------------
# Task 3.2 — Property 1: Same-Status Transition Is Always Rejected
# Feature: sprint-5a-admin-kanban-board, Property 1
# ---------------------------------------------------------------------------


# Validates: Requirements 4.2
@settings(max_examples=100)
@given(st.sampled_from(STATUSES))
def test_same_status_transition_is_rejected(s):
    """validate_status_transition(s, s) always raises
    InvalidStatusTransitionException for any of the four valid status
    strings.

    (Req 4.2)
    """
    # Feature: sprint-5a-admin-kanban-board, Property 1
    with pytest.raises(InvalidStatusTransitionException):
        validate_status_transition(s, s)


# ---------------------------------------------------------------------------
# Task 3.2 — Property 2: Cross-Status Transition Is Always Accepted
# Feature: sprint-5a-admin-kanban-board, Property 2
# ---------------------------------------------------------------------------


# Validates: Requirements 4.3
@settings(max_examples=100)
@given(st.sampled_from(STATUSES), st.sampled_from(STATUSES))
def test_cross_status_transition_is_accepted(current, requested):
    """validate_status_transition(current, requested) raises no exception
    when current != requested, for any combination of the four valid status
    strings.

    (Req 4.3)
    """
    # Feature: sprint-5a-admin-kanban-board, Property 2
    assume(current != requested)
    # Should not raise
    validate_status_transition(current, requested)


# ---------------------------------------------------------------------------
# Task 3.2 — Property 3: Board Totality
# Feature: sprint-5a-admin-kanban-board, Property 3
# ---------------------------------------------------------------------------


# Validates: Requirements 6.1, 6.2, 2.3, 2.4
@settings(max_examples=100)
@given(st.lists(feature_doc_strategy(), min_size=0, max_size=30))
def test_board_totality(docs):
    """For any list of feature documents (all with known statuses):
      - the union of all four column lists equals the full input set
        (every document appears in exactly one column),
      - no document appears in more than one column (no duplicates across
        columns),
      - the total count of items across all columns equals len(docs).

    (Req 6.1, 6.2, 2.3, 2.4)
    """
    # Feature: sprint-5a-admin-kanban-board, Property 3
    board = _group_features(docs)

    # Collect all ids across every column.
    all_ids_in_board: list[str] = []
    for column_docs in board.values():
        for d in column_docs:
            all_ids_in_board.append(str(d["_id"]))

    input_ids = [str(d["_id"]) for d in docs]

    # All input documents (all have known statuses from the strategy) must
    # appear in the board.
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
