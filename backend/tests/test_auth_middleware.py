"""Property-based test for the Auth_Middleware's require_verified_user and
require_admin dependencies (Sprint 1B).

Both dependencies are plain async functions that accept an already-resolved
`user` dict (the `Depends(get_current_user)` wiring is FastAPI's concern, not
this module's), so they are called directly here rather than through a
FastAPI TestClient.

Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4
"""

import asyncio

import pytest
from hypothesis import given, settings, strategies as st

from app.core.exceptions import UnauthorizedException
from app.middleware.auth import get_current_admin, require_admin, require_verified_user

# Roles: the one value that matters ("admin") plus other sampled literals and
# arbitrary strings, per the property's "or any string" role generator.
roles = st.one_of(st.sampled_from(["user", "admin", "other"]), st.text())


# Feature: sprint-1b-authentication-completion, Property 7: require_verified_user and require_admin reject based exactly on their stated conditions, propagating upstream failures unchanged
@given(is_verified=st.booleans(), role=roles)
@settings(max_examples=100)
def test_require_verified_user_gates_exactly_on_is_verified(is_verified, role):
    """require_verified_user(user) succeeds iff is_verified is True, and
    raises a 403 UnauthorizedException otherwise, regardless of role."""
    user = {"is_verified": is_verified, "role": role}

    if is_verified:
        result = asyncio.run(require_verified_user(user=user))
        assert result is user
    else:
        with pytest.raises(UnauthorizedException) as exc_info:
            asyncio.run(require_verified_user(user=user))
        assert exc_info.value.status_code == 403


# Feature: sprint-1b-authentication-completion, Property 7: require_verified_user and require_admin reject based exactly on their stated conditions, propagating upstream failures unchanged
@given(is_verified=st.booleans(), role=roles)
@settings(max_examples=100)
def test_require_admin_gates_exactly_on_is_verified_and_admin_role(is_verified, role):
    """require_admin(user) succeeds iff is_verified is True AND role ==
    "admin", and raises a 403 UnauthorizedException otherwise."""
    user = {"is_verified": is_verified, "role": role}

    if is_verified and role == "admin":
        result = asyncio.run(require_admin(user=user))
        assert result is user
    else:
        with pytest.raises(UnauthorizedException) as exc_info:
            asyncio.run(require_admin(user=user))
        assert exc_info.value.status_code == 403


def test_get_current_admin_ignores_is_verified_and_only_checks_role():
    """Regression guard (Req 10.5): get_current_admin's Sprint 1A contract is
    unchanged by Sprint 1B. It succeeds for role == "admin" regardless of
    is_verified (even when is_verified is False), and rejects any other role
    regardless of is_verified with a 403 UnauthorizedException. This proves
    get_current_admin must NOT have started requiring verification, since
    that stricter check belongs to the new require_admin dependency only."""
    unverified_admin = {"is_verified": False, "role": "admin"}
    result = asyncio.run(get_current_admin(user=unverified_admin))
    assert result is unverified_admin

    verified_non_admin = {"is_verified": True, "role": "user"}
    with pytest.raises(UnauthorizedException) as exc_info:
        asyncio.run(get_current_admin(user=verified_non_admin))
    assert exc_info.value.status_code == 403
