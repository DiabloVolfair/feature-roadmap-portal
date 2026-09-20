"""Unit tests for the vote-domain exception hierarchy (Sprint 3).

Verifies that `AlreadyVotedException` and `VoteFailedException` are members of
the `FeatureException` family (so main.py's existing
`@app.exception_handler(FeatureException)` translates them) and are NOT part of
the authentication-specific `AuthException` family, and that they carry the
documented HTTP status codes (409 and 500 respectively).

Requirements: 7.1, 7.2, 7.3
"""

from app.core.exceptions import (
    AlreadyVotedException,
    AuthException,
    FeatureException,
    VoteFailedException,
)


def test_vote_exceptions_subclass_feature_exception():
    """Both vote exceptions belong to the FeatureException family (Req 7.1)."""
    assert issubclass(AlreadyVotedException, FeatureException)
    assert issubclass(VoteFailedException, FeatureException)


def test_vote_exceptions_do_not_subclass_auth_exception():
    """Neither vote exception is part of the AuthException family (Req 7.1)."""
    assert not issubclass(AlreadyVotedException, AuthException)
    assert not issubclass(VoteFailedException, AuthException)


def test_already_voted_exception_status_code_is_409():
    """AlreadyVotedException maps to HTTP 409 (Req 7.2)."""
    assert AlreadyVotedException.status_code == 409


def test_vote_failed_exception_status_code_is_500():
    """VoteFailedException maps to HTTP 500 (Req 7.3)."""
    assert VoteFailedException.status_code == 500
