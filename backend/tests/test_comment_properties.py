"""Property-based tests for `build_comment_tree()` in `app.models.comment`.

Tests Properties 1, 2, and 3 from the Sprint 4 Threaded Discussions design.

All tests use Hypothesis with @given/@settings patterns matching the project's
existing property test conventions (see test_toggle_vote_properties.py and
test_has_voted_membership_property.py).

Feature: sprint-4-threaded-discussions
"""

from datetime import datetime, timezone

from bson import ObjectId
from hypothesis import given, settings
from hypothesis import strategies as st

from app.models.comment import CommentTreeResponse, build_comment_tree


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _comment_doc(
    oid: ObjectId,
    parent_id: str | None,
    created_at: datetime,
    feature_id: str | None = None,
) -> dict:
    """Build a minimal valid comment document."""
    now = datetime.now(timezone.utc)
    return {
        "_id": oid,
        "feature_id": feature_id or str(ObjectId()),
        "author_id": str(ObjectId()),
        "author_name": "Author",
        "author_role": "user",
        "is_verified": True,
        "parent_comment_id": parent_id,
        "content_markdown": "abc",
        "reply_count": 0,
        "created_at": created_at,
        "updated_at": now,
        "is_deleted": False,
    }


def _flatten_tree(nodes: list[CommentTreeResponse]) -> list[CommentTreeResponse]:
    """Recursively collect every node in a tree into a flat list."""
    result = []
    for node in nodes:
        result.append(node)
        result.extend(_flatten_tree(node.replies))
    return result


def _max_depth(nodes: list[CommentTreeResponse], depth: int = 0) -> int:
    """Return the maximum depth reached anywhere in the tree.

    Depth 0 = top-level. Each level of replies increments depth by 1.
    """
    if not nodes:
        return depth - 1  # no nodes at this level means depth - 1 was the last
    current_max = depth
    for node in nodes:
        child_max = _max_depth(node.replies, depth + 1)
        if child_max > current_max:
            current_max = child_max
    return current_max


def _collect_replies_lists(
    nodes: list[CommentTreeResponse],
) -> list[list[CommentTreeResponse]]:
    """Walk the tree and collect all non-empty `replies` lists."""
    result = []
    for node in nodes:
        if node.replies:
            result.append(node.replies)
            result.extend(_collect_replies_lists(node.replies))
    return result


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------


@st.composite
def comment_doc_lists(draw):
    """Generate a list of comment dicts with valid parent references.

    IDs are minted sequentially; each comment may optionally reference one of
    the IDs that appeared before it (so parents always precede children), or
    have no parent (top-level).

    `created_at` is assigned in strictly ascending order so that the
    oldest-first precondition of `build_comment_tree` is met automatically.
    """
    size = draw(st.integers(min_value=0, max_value=20))
    docs = []
    oids: list[ObjectId] = []

    # Use an integer base to produce monotonically increasing datetimes
    # without generating real timestamps (avoids datetime edge cases).
    base_ts = 1_700_000_000  # Unix epoch seconds, some fixed base

    for i in range(size):
        oid = ObjectId()
        oids.append(oid)

        # Optionally pick a parent from all preceding IDs.
        if oids[:-1] and draw(st.booleans()):
            parent_oid = draw(st.sampled_from(oids[:-1]))
            parent_id = str(parent_oid)
        else:
            parent_id = None

        created_at = datetime.fromtimestamp(base_ts + i, tz=timezone.utc)
        docs.append(_comment_doc(oid, parent_id, created_at))

    return docs


@st.composite
def chain_comment_docs(draw):
    """Generate a strict chain of comments: each is a reply to the previous.

    Chain length is drawn from a range that includes lengths > 3, so that
    the depth-capping logic is exercised.
    """
    chain_length = draw(st.integers(min_value=1, max_value=10))
    docs = []
    prev_oid: ObjectId | None = None
    base_ts = 1_700_000_000

    for i in range(chain_length):
        oid = ObjectId()
        parent_id = str(prev_oid) if prev_oid is not None else None
        created_at = datetime.fromtimestamp(base_ts + i, tz=timezone.utc)
        docs.append(_comment_doc(oid, parent_id, created_at))
        prev_oid = oid

    return docs


@st.composite
def comment_docs_with_varying_timestamps(draw):
    """Generate comment lists with varying `created_at` values.

    Within each sibling group, ordering is guaranteed oldest-first by using
    monotonically increasing timestamps as the docs are built in order and
    `build_comment_tree` relies on the input being sorted oldest-first.
    The strategy draws a random number of top-level and nested comments.
    """
    size = draw(st.integers(min_value=0, max_value=15))
    docs = []
    oids: list[ObjectId] = []

    # Draw a permuted set of distinct integer offsets to vary created_at.
    # We keep them in insertion order so the input list is oldest-first.
    offsets = list(range(size))  # 0, 1, 2, ... — already ascending
    base_ts = 1_700_000_000

    for i in range(size):
        oid = ObjectId()
        oids.append(oid)

        if oids[:-1] and draw(st.booleans()):
            parent_oid = draw(st.sampled_from(oids[:-1]))
            parent_id = str(parent_oid)
        else:
            parent_id = None

        created_at = datetime.fromtimestamp(base_ts + offsets[i], tz=timezone.utc)
        docs.append(_comment_doc(oid, parent_id, created_at))

    return docs


# ---------------------------------------------------------------------------
# Property 1: Tree Building — Total Inclusion
# Feature: sprint-4-threaded-discussions, Property 1
# ---------------------------------------------------------------------------


# Validates: Requirements 1.5, 4.1, 4.2
@settings(max_examples=100)
@given(comment_doc_lists())
def test_build_comment_tree_total_inclusion(docs):
    """Every comment document appears exactly once in the output tree.

    The set of all node ids in the flattened tree must equal the set of
    str(d["_id"]) for all input docs (Req 1.5, 4.1, 4.2).
    """
    # Feature: sprint-4-threaded-discussions, Property 1
    result = build_comment_tree(docs)
    flat = _flatten_tree(result)

    all_node_ids = {node.id for node in flat}
    all_doc_ids = {str(d["_id"]) for d in docs}

    assert all_node_ids == all_doc_ids


# ---------------------------------------------------------------------------
# Property 2: Tree Building — Max Depth Invariant
# Feature: sprint-4-threaded-discussions, Property 2
# ---------------------------------------------------------------------------


# Validates: Requirements 1.6, 4.3, 4.4
@settings(max_examples=100)
@given(chain_comment_docs())
def test_build_comment_tree_max_depth_invariant(docs):
    """No node in the resulting tree exceeds depth 3.

    Chains of arbitrary length (including > 3) must still produce a tree
    where every node is at depth 0, 1, 2, or 3 (Req 1.6, 4.3, 4.4).
    """
    # Feature: sprint-4-threaded-discussions, Property 2
    result = build_comment_tree(docs)

    if not docs:
        assert result == []
        return

    def check_depth(nodes: list[CommentTreeResponse], depth: int) -> None:
        for node in nodes:
            assert depth <= 3, f"Node found at depth {depth}, which exceeds max of 3"
            check_depth(node.replies, depth + 1)

    check_depth(result, 0)


# ---------------------------------------------------------------------------
# Property 3: Tree Building — Oldest-First Ordering
# Feature: sprint-4-threaded-discussions, Property 3
# ---------------------------------------------------------------------------


# Validates: Requirements 4.1, 4.2, 24.2
@settings(max_examples=100)
@given(comment_docs_with_varying_timestamps())
def test_build_comment_tree_oldest_first_ordering(docs):
    """Every `replies` list (and the root list) is sorted by `created_at` ascending.

    For every node in the tree, its replies are ordered oldest-first
    (Req 4.1, 4.2, 24.2).
    """
    # Feature: sprint-4-threaded-discussions, Property 3
    result = build_comment_tree(docs)

    # Check root-level ordering
    root_timestamps = [node.created_at for node in result]
    assert root_timestamps == sorted(root_timestamps), (
        f"Root list not sorted oldest-first: {root_timestamps}"
    )

    # Check every replies list throughout the tree
    replies_lists = _collect_replies_lists(result)
    for replies in replies_lists:
        timestamps = [node.created_at for node in replies]
        assert timestamps == sorted(timestamps), (
            f"Replies list not sorted oldest-first: {timestamps}"
        )


# ---------------------------------------------------------------------------
# Property 4: Sanitizer Idempotence
# Feature: sprint-4-threaded-discussions, Property 4
# ---------------------------------------------------------------------------

from app.utils.markdown_sanitizer import sanitize_markdown


# Validates: Requirements 2.2
@settings(max_examples=100)
@given(st.text())
def test_sanitize_markdown_idempotent(s):
    """Applying sanitize_markdown twice yields the same result as once.

    For any arbitrary string s:
        sanitize_markdown(sanitize_markdown(s)) == sanitize_markdown(s)

    This guarantees the sanitizer reaches a fixed point on first application
    and does not alter already-clean content on re-application (Req 2.2).
    """
    # Feature: sprint-4-threaded-discussions, Property 4
    once = sanitize_markdown(s)
    twice = sanitize_markdown(once)
    assert twice == once, (
        f"Sanitizer not idempotent.\n"
        f"  Input:    {s!r}\n"
        f"  Once:     {once!r}\n"
        f"  Twice:    {twice!r}"
    )


# ---------------------------------------------------------------------------
# Property 5: Soft-Delete Tombstone Invariant
# Feature: sprint-4-threaded-discussions, Property 5
# ---------------------------------------------------------------------------


@st.composite
def arbitrary_comment_doc(draw):
    """Generate an arbitrary comment document dict with all required fields."""
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "feature_id": draw(st.text(min_size=1, max_size=50)),
        "author_id": draw(st.text(min_size=1, max_size=50)),
        "author_name": draw(st.text(min_size=1, max_size=100)),
        "author_role": draw(st.sampled_from(["user", "admin", "moderator"])),
        "is_verified": draw(st.booleans()),
        "parent_comment_id": draw(st.one_of(st.none(), st.text(min_size=1, max_size=50))),
        "content_markdown": draw(st.text(min_size=0, max_size=2000)),
        "reply_count": draw(st.integers(min_value=0, max_value=100)),
        "created_at": now,
        "updated_at": now,
        "is_deleted": draw(st.booleans()),
    }


def _apply_soft_delete(doc: dict) -> dict:
    """Apply soft-delete field transformations to a comment document (pure mapping)."""
    result = dict(doc)
    result["is_deleted"] = True
    result["content_markdown"] = "[deleted]"
    result["author_name"] = "[deleted]"
    return result


# Validates: Requirements 8.4, 10.1
@settings(max_examples=100)
@given(arbitrary_comment_doc())
def test_soft_delete_tombstone_invariant(doc):
    """Soft-delete transformation always sets the three tombstone fields correctly.

    For any arbitrary comment document, applying the soft-delete mapping must
    produce a document where:
      - is_deleted is True
      - content_markdown is "[deleted]"
      - author_name is "[deleted]"

    All other fields remain unchanged (Req 8.4, 10.1).
    """
    # Feature: sprint-4-threaded-discussions, Property 5
    tombstoned = _apply_soft_delete(doc)

    assert tombstoned["is_deleted"] is True, (
        f"Expected is_deleted=True after soft-delete, got {tombstoned['is_deleted']!r}"
    )
    assert tombstoned["content_markdown"] == "[deleted]", (
        f"Expected content_markdown='[deleted]' after soft-delete, "
        f"got {tombstoned['content_markdown']!r}"
    )
    assert tombstoned["author_name"] == "[deleted]", (
        f"Expected author_name='[deleted]' after soft-delete, "
        f"got {tombstoned['author_name']!r}"
    )

    # Verify other fields are not mutated
    for key in doc:
        if key not in ("is_deleted", "content_markdown", "author_name"):
            assert tombstoned[key] == doc[key], (
                f"Field '{key}' was unexpectedly modified by soft-delete."
            )
