"""Property and unit tests for the atomic `toggle_vote` service function
(Sprint 3 - Atomic Voting Engine).

`toggle_vote` reads a feature once via `find_by_id` (to confirm existence and
choose the add/remove branch) and then performs a *single* conditional
`find_one_and_update` whose filter carries the membership guard, so the
`votes` array update and the `vote_count` adjustment are one write and can
never diverge. This module exercises design.md's Properties 1-3 with
Hypothesis over arbitrary toggle sequences, plus unit tests for the two
non-happy branches (not-found and lost-race), all against a minimal in-memory
fake Motor-like `features` collection patched over `feature_service.db`,
mirroring `test_token_consumption_properties.py`'s fake-collection pattern.

The fake collection implements exactly the operations `toggle_vote`/
`find_by_id` touch: `find_one`, `find_one_and_update` (with the
membership-filter semantics - add branch `{_id, votes: {$ne: user_id}}` +
`$addToSet`/`$inc`; remove branch `{_id, votes: user_id}` + `$pull`/`$inc`;
`ReturnDocument.AFTER`), `insert_one`, and `find`. No real MongoDB connection
is required because the fake reproduces the atomic conditional-write semantics
the property depends on.

Feature: sprint-3-voting-engine

Property 1: Vote count equals votes-array length after every toggle.
Validates: Requirements 1.3, 2.4, 2.5

Property 2: The votes array never contains a duplicate user id.
Validates: Requirements 1.2, 2.2, 2.3

Property 3: Toggling a user's vote twice is an involution.
Validates: Requirements 2.1, 2.5

Unit tests: toggle_vote's not-found and lost-race branches.
Validates: Requirements 2.6, 2.7
"""

import asyncio
from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from bson import ObjectId
from hypothesis import given, settings
from hypothesis import strategies as st
from pymongo import ReturnDocument

import app.services.feature_service as feature_service
from app.core.exceptions import AlreadyVotedException, FeatureNotFoundException


# --- Minimal in-memory fake Motor-like collection/db ------------------------
#
# Supports only the operations `toggle_vote`/`find_by_id` actually call:
# insert_one, find_one, find_one_and_update, find. Duplicated here (rather
# than imported) to match how the sibling test files keep their fakes local,
# since there is no shared fixture module yet. The find_one_and_update
# implementation reproduces MongoDB's conditional-update-and-return semantics
# that the atomic-toggle properties depend on: the whole filter (including the
# `votes` membership guard) must match, or the write applies to nothing and
# None is returned.


class _FakeResult:
    def __init__(self, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            setattr(self, key, value)


class _FakeCursor:
    def __init__(self, docs: list[dict]) -> None:
        self._docs = list(docs)

    def __aiter__(self) -> "_FakeCursor":
        self._iter = iter(self._docs)
        return self

    async def __anext__(self) -> dict:
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


def _matches(doc: dict, query: dict) -> bool:
    """Evaluate the small subset of MongoDB query operators `toggle_vote`
    relies on: equality, `$ne`, and array-membership (a scalar compared
    against a list field means "is this value a member?")."""
    for key, condition in query.items():
        value = doc.get(key)
        if isinstance(condition, dict):
            if "$ne" in condition:
                target = condition["$ne"]
                if isinstance(value, list):
                    # `votes: {$ne: user_id}` -> user_id must NOT be a member.
                    if target in value:
                        return False
                elif value == target:
                    return False
            else:  # pragma: no cover - no other operators are exercised
                raise NotImplementedError(f"Unsupported operator in {condition!r}")
        else:
            if isinstance(value, list):
                # `votes: user_id` -> user_id must be a member.
                if condition not in value:
                    return False
            elif value != condition:
                return False
    return True


def _apply_update(doc: dict, update: dict) -> None:
    """Apply the `$addToSet`/`$pull`/`$inc` operators `toggle_vote` uses,
    in place, mirroring MongoDB semantics ($addToSet is a no-op if the value
    is already present)."""
    for field, value in update.get("$addToSet", {}).items():
        arr = doc.setdefault(field, [])
        if value not in arr:
            arr.append(value)
    for field, value in update.get("$pull", {}).items():
        arr = doc.get(field, [])
        doc[field] = [item for item in arr if item != value]
    for field, amount in update.get("$inc", {}).items():
        doc[field] = doc.get(field, 0) + amount


class _FakeCollection:
    def __init__(self) -> None:
        self._docs: dict[Any, dict] = {}

    async def insert_one(self, doc: dict) -> _FakeResult:
        _id = doc.get("_id") or ObjectId()
        doc["_id"] = _id
        self._docs[_id] = doc
        return _FakeResult(inserted_id=_id)

    def find(self, query: dict | None = None) -> _FakeCursor:
        docs = [d for d in self._docs.values() if _matches(d, query or {})]
        return _FakeCursor(docs)

    async def find_one(self, query: dict) -> dict | None:
        for doc in self._docs.values():
            if _matches(doc, query or {}):
                return doc
        return None

    async def find_one_and_update(
        self, query: dict, update: dict, return_document=ReturnDocument.AFTER
    ) -> dict | None:
        """Conditional single-document update: only if the whole filter
        (including the `votes` membership guard) matches does the update
        apply. Returns the post-update document (AFTER) or the pre-update
        document (BEFORE); returns None when nothing matched."""
        for doc in self._docs.values():
            if _matches(doc, query or {}):
                before = dict(doc)
                _apply_update(doc, update)
                return dict(doc) if return_document == ReturnDocument.AFTER else before
        return None


class _FakeDB:
    def __init__(self) -> None:
        self._collections: dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


async def _create_feature(fake_db: _FakeDB, votes: list[str] | None = None) -> str:
    """Insert a persisted-shape feature document into the fake `features`
    collection with the given initial `votes` array (whose length seeds
    `vote_count`), and return its id as a string."""
    votes = list(votes or [])
    now = datetime.now(timezone.utc)
    result = await fake_db["features"].insert_one(
        {
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
    )
    return str(result.inserted_id)


# --- Strategies -------------------------------------------------------------
#
# Vote-array members are the *string* form of ObjectIds (see Feature_Service /
# `viewer_has_voted`). We generate a small fixed pool of distinct user ids and
# draw arbitrary toggle sequences over that pool so the same user toggles
# repeatedly, exercising both the add and remove branches (and the involution).

user_id_strings = st.builds(lambda: str(ObjectId()))


@st.composite
def user_pool_and_toggle_sequence(draw):
    """Generate a pool of distinct user ids and an arbitrary sequence of
    toggle operations (each naming one user from the pool)."""
    pool = draw(st.lists(user_id_strings, min_size=1, max_size=5, unique=True))
    sequence = draw(
        st.lists(st.sampled_from(pool), min_size=0, max_size=20)
    )
    return pool, sequence


# --- Property 1: vote_count == len(votes) after every toggle ----------------


# Feature: sprint-3-voting-engine, Property 1: Vote count equals votes-array length after every toggle
@settings(max_examples=100, deadline=None)
@given(user_pool_and_toggle_sequence())
def test_vote_count_equals_votes_length_after_every_toggle(case):
    """For any feature and any sequence of toggle_vote calls by any set of
    users, after each completed call vote_count equals len(votes)
    (Req 1.3, 2.4, 2.5)."""
    _pool, sequence = case

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(feature_service, "db", fake_db):
            feature_id = await _create_feature(fake_db)
            collection = fake_db["features"]
            object_id = ObjectId(feature_id)

            for user_id in sequence:
                await feature_service.toggle_vote(feature_id, user_id)
                doc = collection._docs[object_id]
                assert doc["vote_count"] == len(doc["votes"])

    asyncio.run(scenario())


# --- Property 2: no duplicate user id in votes ------------------------------


# Feature: sprint-3-voting-engine, Property 2: The votes array never contains a duplicate user id
@settings(max_examples=100, deadline=None)
@given(user_pool_and_toggle_sequence())
def test_votes_never_contains_duplicate_user_id(case):
    """For any sequence of toggle_vote calls (including repeated calls by the
    same user, in any order), the votes array contains each user id at most
    once at every step (Req 1.2, 2.2, 2.3)."""
    _pool, sequence = case

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(feature_service, "db", fake_db):
            feature_id = await _create_feature(fake_db)
            collection = fake_db["features"]
            object_id = ObjectId(feature_id)

            for user_id in sequence:
                await feature_service.toggle_vote(feature_id, user_id)
                votes = collection._docs[object_id]["votes"]
                assert len(votes) == len(set(votes))

    asyncio.run(scenario())


# --- Property 3: toggling twice is an involution ----------------------------


# Feature: sprint-3-voting-engine, Property 3: Toggling a user's vote twice is an involution
@settings(max_examples=100, deadline=None)
@given(
    initial_votes=st.lists(user_id_strings, min_size=0, max_size=5, unique=True),
    from_existing=st.booleans(),
)
def test_toggling_twice_is_an_involution(initial_votes, from_existing):
    """For any feature and any user, calling toggle_vote twice returns the
    feature's vote_count and that user's membership to their exact pre-toggle
    values, and each call's returned `voted` matches the user's membership
    after that call (Req 2.1, 2.5)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(feature_service, "db", fake_db):
            feature_id = await _create_feature(fake_db, votes=initial_votes)
            collection = fake_db["features"]
            object_id = ObjectId(feature_id)

            # Pick a user who is either already a member or a fresh outsider.
            if from_existing and initial_votes:
                user_id = initial_votes[0]
            else:
                user_id = str(ObjectId())

            before_votes = list(collection._docs[object_id]["votes"])
            before_count = collection._docs[object_id]["vote_count"]
            before_member = user_id in before_votes

            first = await feature_service.toggle_vote(feature_id, user_id)
            mid_votes = collection._docs[object_id]["votes"]
            # `voted` reflects membership after this call.
            assert first["voted"] is (user_id in mid_votes)
            assert first["voted"] is (not before_member)

            second = await feature_service.toggle_vote(feature_id, user_id)
            after_votes = collection._docs[object_id]["votes"]
            after_count = collection._docs[object_id]["vote_count"]

            # Second call's `voted` also reflects post-call membership.
            assert second["voted"] is (user_id in after_votes)

            # Involution: back to the exact pre-toggle count and membership.
            assert after_count == before_count
            assert (user_id in after_votes) is before_member
            assert second["vote_count"] == before_count

    asyncio.run(scenario())


# --- Unit tests: not-found and lost-race branches (Req 2.6, 2.7) ------------


def test_toggle_vote_on_unknown_id_raises_feature_not_found():
    """toggle_vote on an id that matches no feature document raises
    FeatureNotFoundException (a genuine miss, not a lost-race
    AlreadyVotedException) (Req 2.6)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(feature_service, "db", fake_db):
            unknown_id = str(ObjectId())
            with pytest.raises(FeatureNotFoundException):
                await feature_service.toggle_vote(unknown_id, str(ObjectId()))

    asyncio.run(scenario())


def test_toggle_vote_raises_already_voted_when_conditional_write_matches_nothing():
    """When the feature exists but the conditional find_one_and_update returns
    None (the vote state changed under us), toggle_vote raises
    AlreadyVotedException rather than corrupting the count (Req 2.7)."""

    async def scenario() -> None:
        fake_db = _FakeDB()
        with patch.object(feature_service, "db", fake_db):
            feature_id = await _create_feature(fake_db)
            user_id = str(ObjectId())

            # Force the lost-race: the atomic conditional write matches
            # nothing on an existing feature.
            collection = fake_db["features"]
            original = collection.find_one_and_update

            async def _returns_none(*_args, **_kwargs):
                return None

            collection.find_one_and_update = _returns_none
            try:
                with pytest.raises(AlreadyVotedException):
                    await feature_service.toggle_vote(feature_id, user_id)
            finally:
                collection.find_one_and_update = original

    asyncio.run(scenario())
