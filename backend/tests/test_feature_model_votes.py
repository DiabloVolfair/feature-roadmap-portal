"""Unit tests for Feature_Model schema-shape preservation and votes non-exposure.

Verifies that both read schemas' `model_dump()` output carries the new
per-viewer `has_voted` flag together with every pre-existing field (including
the Sprint 2B additions `is_owner`/`is_admin`/`related_features` on the detail
schema), and that neither schema ever surfaces the raw `votes` array.

Feature: sprint-3-voting-engine

Validates: Requirements 1.4, 5.1, 6.1
"""

from datetime import datetime, timezone

from bson import ObjectId

from app.models.feature import (
    FeatureDetailResponse,
    FeatureFeedResponse,
)

# The ten fields every persisted-document-derived read schema exposes, shared
# by both FeatureFeedResponse and FeatureDetailResponse (the latter via
# subclassing). `votes` is deliberately absent - it must never appear in a dump.
BASE_RESPONSE_FIELDS = {
    "id",
    "title",
    "description_markdown",
    "category",
    "status",
    "author_id",
    "author_name",
    "vote_count",
    "comment_count",
    "created_at",
    "updated_at",
}


def _sample_feature_doc() -> dict:
    """A representative persisted Mongo feature document, including the raw
    `votes` array that must never leak through either read schema."""
    return {
        "_id": ObjectId(),
        "title": "Add dark mode",
        "description_markdown": "It would be great to have a dark theme option.",
        "category": "ui_ux",
        "status": "under_review",
        "author_id": str(ObjectId()),
        "author_name": "Ada Lovelace",
        "vote_count": 3,
        "comment_count": 1,
        "votes": [str(ObjectId()), str(ObjectId()), str(ObjectId())],
        "created_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2024, 1, 2, tzinfo=timezone.utc),
    }


def test_feed_response_dump_has_has_voted_and_all_base_fields():
    """`FeatureFeedResponse.from_mongo(...).model_dump()` contains `has_voted`
    plus every pre-existing base field (Req 5.1)."""
    doc = _sample_feature_doc()

    dump = FeatureFeedResponse.from_mongo(doc).model_dump()

    assert "has_voted" in dump
    assert BASE_RESPONSE_FIELDS.issubset(dump.keys())


def test_feed_response_dump_never_exposes_votes():
    """The feed schema's dump never carries the raw `votes` array (Req 1.4)."""
    doc = _sample_feature_doc()

    dump = FeatureFeedResponse.from_mongo(doc).model_dump()

    assert "votes" not in dump


def test_detail_response_dump_has_has_voted_and_all_fields():
    """`FeatureDetailResponse.from_mongo(...).model_dump()` contains `has_voted`,
    every base field, and the Sprint 2B additions `is_owner`/`is_admin`/
    `related_features` (Req 6.1)."""
    doc = _sample_feature_doc()

    dump = FeatureDetailResponse.from_mongo(
        doc, current_user=None, related=[]
    ).model_dump()

    assert "has_voted" in dump
    assert BASE_RESPONSE_FIELDS.issubset(dump.keys())
    assert {"is_owner", "is_admin", "related_features"}.issubset(dump.keys())


def test_detail_response_dump_never_exposes_votes():
    """The detail schema's dump never carries the raw `votes` array, even when
    the source document has a non-empty `votes` array (Req 1.4)."""
    doc = _sample_feature_doc()

    dump = FeatureDetailResponse.from_mongo(
        doc, current_user=None, related=[]
    ).model_dump()

    assert "votes" not in dump
