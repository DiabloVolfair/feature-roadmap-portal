"""Unit tests for User_Service's `mark_verified` and `set_password_hash`
(Sprint 1B), mirroring `set_refresh_token`'s matched-id/unmatched-id test
shape from Sprint 1A.

Requirements: 2.3, 5.3
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

import app.services.user_service as user_service_module
from app.services.user_service import mark_verified, set_password_hash


def _make_mock_collection(matched_count: int) -> MagicMock:
    """Build a MagicMock standing in for the Motor `users` collection, with
    an awaitable `update_one` resolving to a result carrying the given
    `matched_count`."""
    mock_collection = MagicMock()
    mock_result = MagicMock()
    mock_result.matched_count = matched_count
    mock_collection.update_one = AsyncMock(return_value=mock_result)
    return mock_collection


# --- mark_verified ----------------------------------------------------------


def test_mark_verified_returns_true_and_sets_is_verified_on_matched_id():
    """A matching `user_id` returns True and sets `is_verified` to True in
    the `$set` payload."""
    user_id = str(ObjectId())
    mock_collection = _make_mock_collection(matched_count=1)

    with patch.object(user_service_module, "_collection", return_value=mock_collection):
        result = asyncio.run(mark_verified(user_id))

    assert result is True
    mock_collection.update_one.assert_awaited_once()
    filter_arg, update_arg = mock_collection.update_one.await_args.args
    assert filter_arg == {"_id": ObjectId(user_id)}
    assert update_arg["$set"]["is_verified"] is True


def test_mark_verified_returns_false_on_unmatched_id():
    """A well-formed `user_id` with no matching document returns False."""
    user_id = str(ObjectId())
    mock_collection = _make_mock_collection(matched_count=0)

    with patch.object(user_service_module, "_collection", return_value=mock_collection):
        result = asyncio.run(mark_verified(user_id))

    assert result is False


def test_mark_verified_returns_false_on_invalid_object_id():
    """An invalid ObjectId string returns False without querying the
    collection."""
    mock_collection = _make_mock_collection(matched_count=1)

    with patch.object(user_service_module, "_collection", return_value=mock_collection):
        result = asyncio.run(mark_verified("not-a-valid-object-id"))

    assert result is False
    mock_collection.update_one.assert_not_awaited()


# --- set_password_hash -------------------------------------------------------


def test_set_password_hash_returns_true_and_sets_password_hash_on_matched_id():
    """A matching `user_id` returns True and sets `password_hash` to the
    given value in the `$set` payload."""
    user_id = str(ObjectId())
    mock_collection = _make_mock_collection(matched_count=1)

    with patch.object(user_service_module, "_collection", return_value=mock_collection):
        result = asyncio.run(set_password_hash(user_id, "new-hashed-value"))

    assert result is True
    mock_collection.update_one.assert_awaited_once()
    filter_arg, update_arg = mock_collection.update_one.await_args.args
    assert filter_arg == {"_id": ObjectId(user_id)}
    assert update_arg["$set"]["password_hash"] == "new-hashed-value"


def test_set_password_hash_returns_false_on_unmatched_id():
    """A well-formed `user_id` with no matching document returns False."""
    user_id = str(ObjectId())
    mock_collection = _make_mock_collection(matched_count=0)

    with patch.object(user_service_module, "_collection", return_value=mock_collection):
        result = asyncio.run(set_password_hash(user_id, "new-hashed-value"))

    assert result is False


def test_set_password_hash_returns_false_on_invalid_object_id():
    """An invalid ObjectId string returns False without querying the
    collection."""
    mock_collection = _make_mock_collection(matched_count=1)

    with patch.object(user_service_module, "_collection", return_value=mock_collection):
        result = asyncio.run(set_password_hash("not-a-valid-object-id", "new-hashed-value"))

    assert result is False
    mock_collection.update_one.assert_not_awaited()
