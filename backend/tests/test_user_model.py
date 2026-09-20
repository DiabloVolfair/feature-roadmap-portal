"""Property-based test for `PasswordResetRequest`'s password length bound.

Requirements: 7.2
"""

import pytest
from hypothesis import example, given, settings, strategies as st
from pydantic import ValidationError

from app.models.user import PasswordResetRequest

# Strategy: strings ranging from empty up to well past the 128-character
# upper bound, so both accepted and rejected lengths are exercised.
new_passwords = st.text(min_size=0, max_size=200)


# Feature: sprint-1b-authentication-completion, Property 6: PasswordResetRequest accepts and rejects based exactly on its stated password bound
@given(new_password=new_passwords)
@example(new_password="x" * 7)
@example(new_password="x" * 8)
@example(new_password="x" * 128)
@example(new_password="x" * 129)
@settings(max_examples=100, deadline=None)
def test_password_reset_request_accepts_and_rejects_exactly_on_length_bound(new_password):
    """`PasswordResetRequest(token="x", new_password=new_password)` SHALL
    succeed if and only if `8 <= len(new_password) <= 128` (Req 7.2)."""
    within_bound = 8 <= len(new_password) <= 128

    if within_bound:
        request = PasswordResetRequest(token="x", new_password=new_password)
        assert request.new_password == new_password
    else:
        with pytest.raises(ValidationError):
            PasswordResetRequest(token="x", new_password=new_password)
