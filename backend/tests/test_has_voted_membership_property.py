"""Property test for the `has_voted` membership computation shared by both
read schemas (Sprint 3 - Atomic Voting Engine).

Both `FeatureFeedResponse.from_mongo` and `FeatureDetailResponse.from_mongo`
derive a per-viewer `has_voted` flag from the single-sourced
`viewer_has_voted(doc, current_user)` helper in `app.models.feature`. This
module exercises Property 4 from design.md as a pure Hypothesis round-trip
over arbitrary feature documents, arbitrary `votes` arrays, arbitrary viewer
ids, and both guest and non-guest viewers - no MongoDB connection or fake
collection is required because the computation under test is a pure function
of the document and the resolved optional viewer.

Feature: sprint-3-voting-engine
Property 4: `has_voted` equals votes membership for the resolved viewer -
the serialized `has_voted` (on both `FeatureFeedResponse` and
`FeatureDetailResponse`) is `true` exactly when the viewer is present (not a
guest) and the viewer's id is in the feature's `votes` array, and `false`
otherwise (including every guest case).

Validates: Requirements 5.2, 5.3, 6.2, 6.3
"""

from datetime import datetime, timezone

from bson import ObjectId
from hypothesis import given, settings
from hypothesis import strategies as st

from app.models.feature import FeatureDetailResponse, FeatureFeedResponse


# --- Strategies -------------------------------------------------------------
#
# User ids in a persisted feature's `votes` array are the *string* form of
# each voting user's ObjectId (see Feature_Model docstring and
# `viewer_has_voted`, which compares `str(current_user["_id"])` against the
# array members). We therefore generate ids as the string form of freshly
# minted ObjectIds so the generated space matches the real one.

object_id_strings = st.builds(lambda: str(ObjectId()))


@st.composite
def feature_docs_and_viewers(draw):
    """Generate a persisted-shape feature document together with a resolved
    optional viewer.

    Returns a `(doc, current_user, expected_has_voted)` triple. To exercise
    both the membership-hit and membership-miss branches meaningfully, the
    viewer's id is sometimes drawn from the document's own `votes` array
    (guaranteed hit) and sometimes an independent fresh id (almost-certain
    miss), and the viewer is sometimes a guest (`None`).
    """
    votes = draw(
        st.lists(object_id_strings, min_size=0, max_size=8, unique=True)
    )

    # Decide what kind of viewer to resolve.
    viewer_kind = draw(st.sampled_from(["guest", "member_in", "member_out"]))

    if viewer_kind == "guest":
        current_user = None
    elif viewer_kind == "member_in" and votes:
        # A non-guest viewer whose id is in the votes array.
        viewer_id = draw(st.sampled_from(votes))
        current_user = _viewer(viewer_id)
    else:
        # A non-guest viewer with an independent id (miss unless it happens
        # to collide, which the assertion below still handles correctly).
        viewer_id = draw(object_id_strings)
        current_user = _viewer(viewer_id)

    doc = _feature_doc(votes)
    expected = current_user is not None and str(current_user["_id"]) in votes
    return doc, current_user, expected


def _viewer(viewer_id: str) -> dict:
    """A minimal resolved-user dict as produced by `get_optional_current_user`;
    only `_id` and `role` are read by the schemas."""
    return {"_id": ObjectId(viewer_id), "role": "user"}


def _feature_doc(votes: list[str]) -> dict:
    """A persisted-shape feature document carrying the given `votes` array."""
    now = datetime.now(timezone.utc)
    return {
        "_id": ObjectId(),
        "title": "A sufficiently long feature title",
        "description_markdown": "A sufficiently long description body here.",
        "category": "general",
        "status": "under_review",
        "author_id": str(ObjectId()),
        "author_name": "Author Name",
        "vote_count": len(votes),
        "comment_count": 0,
        "votes": votes,
        "created_at": now,
        "updated_at": now,
    }


# --- Property 4 -------------------------------------------------------------


@settings(max_examples=100)
@given(feature_docs_and_viewers())
def test_feed_has_voted_equals_votes_membership(case):
    """`FeatureFeedResponse.from_mongo` serializes `has_voted` as exactly the
    membership of the resolved viewer's id in the feature's `votes` array,
    and `False` for every guest (Req 5.2, 5.3)."""
    doc, current_user, expected = case
    response = FeatureFeedResponse.from_mongo(doc, current_user=current_user)
    assert response.has_voted is expected


@settings(max_examples=100)
@given(feature_docs_and_viewers())
def test_detail_has_voted_equals_votes_membership(case):
    """`FeatureDetailResponse.from_mongo` serializes `has_voted` as exactly
    the membership of the resolved viewer's id in the feature's `votes`
    array, and `False` for every guest (Req 6.2, 6.3)."""
    doc, current_user, expected = case
    response = FeatureDetailResponse.from_mongo(
        doc, current_user=current_user, related=[]
    )
    assert response.has_voted is expected


@settings(max_examples=100)
@given(feature_docs_and_viewers())
def test_feed_and_detail_agree_on_has_voted(case):
    """Both read schemas resolve `has_voted` from the same single-sourced
    helper, so they always agree for the same document and viewer (Req 5.2,
    5.3, 6.2, 6.3)."""
    doc, current_user, _expected = case
    feed = FeatureFeedResponse.from_mongo(doc, current_user=current_user)
    detail = FeatureDetailResponse.from_mongo(
        doc, current_user=current_user, related=[]
    )
    assert feed.has_voted is detail.has_voted


@settings(max_examples=100)
@given(feature_docs_and_viewers())
def test_guest_never_has_voted(case):
    """A guest viewer (`current_user is None`) always serializes
    `has_voted=False` on both schemas, regardless of the votes array
    (Req 5.3, 6.3)."""
    doc, _current_user, _expected = case
    feed = FeatureFeedResponse.from_mongo(doc, current_user=None)
    detail = FeatureDetailResponse.from_mongo(
        doc, current_user=None, related=[]
    )
    assert feed.has_voted is False
    assert detail.has_voted is False
