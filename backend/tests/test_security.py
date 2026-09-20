"""Property-based tests for the Security_Module's opaque-token hashing.

Requirements: 2.1, 2.2, 5.1, 5.2
"""

from hypothesis import assume, given, settings, strategies as st

from app.core.security import hash_opaque_token, verify_opaque_token

# Strategy: varied-length opaque token strings (mirroring the length of a
# secrets.token_urlsafe-generated raw token, but not constrained to its
# alphabet, to exercise the digest-then-bcrypt pipeline broadly).
opaque_tokens = st.text(min_size=1, max_size=500)


# Feature: sprint-1b-authentication-completion, Property 1: Opaque token hashing round-trips, and only for the original token
@given(token=opaque_tokens)
@settings(max_examples=100, deadline=None)
def test_opaque_token_hash_verify_round_trip(token):
    """For any raw opaque token string, verifying it against the hash of
    itself SHALL succeed (Req 2.1, 2.2, 5.1, 5.2)."""
    token_hash = hash_opaque_token(token)
    assert verify_opaque_token(token, token_hash) is True


# Feature: sprint-1b-authentication-completion, Property 1: Opaque token hashing round-trips, and only for the original token
@given(token1=opaque_tokens, token2=opaque_tokens)
@settings(max_examples=100, deadline=None)
def test_opaque_token_verify_fails_for_distinct_token(token1, token2):
    """For any two distinct raw opaque token strings, verifying the second
    against the hash of the first SHALL fail (Req 2.1, 2.2, 5.1, 5.2)."""
    assume(token1 != token2)
    token_hash = hash_opaque_token(token1)
    assert verify_opaque_token(token2, token_hash) is False


def test_hash_refresh_token_and_verify_refresh_token_remain_callable_as_aliases():
    """`hash_refresh_token`/`verify_refresh_token` are aliases for
    `hash_opaque_token`/`verify_opaque_token` (Req 24.4) - Sprint 1A's
    `user_service.set_refresh_token` calls them by these original names, so
    the aliases must remain callable and behave identically."""
    from app.core.security import hash_refresh_token, verify_refresh_token

    token = "some-refresh-token-value"
    token_hash = hash_refresh_token(token)
    assert verify_refresh_token(token, token_hash) is True
    assert verify_refresh_token("a-different-token", token_hash) is False
