"""Property tests for the Auth_API's `/auth/forgot-password` and
`/auth/send-verification` routes (Sprint 1B).

Property 4 spans two endpoints and crosses App_Environment with whether a
token was actually created during the call. Both axes are small, fixed,
discrete sets (not good Hypothesis `@given` fodder), so this is written as
an exhaustive `pytest.mark.parametrize` grid rather than a generated test -
matching design.md's Testing Strategy note that a parametrize table is the
more appropriate tool here. `"staging"` stands in for "any non-development
value" (the property only special-cases exactly `"development"`).

Property 5 is naturally suited to Hypothesis `@given`, since it ranges over
an arbitrary submitted email crossed with whether it matches an existing
account - both axes are open-ended/arbitrary rather than a small fixed grid.

Uses FastAPI's `app.dependency_overrides` to stand in for `get_current_user`
(the Send_Verification_Endpoint requires it), and `monkeypatch` to control
`settings.app_env` and to replace `email_verification_service.create_verification_token`,
`password_reset_service.create_reset_token`, and `user_service.find_by_email`
with stand-ins - so only the route handlers' own env-gating `if` logic is
exercised, matching Requirement 27.2's route-thinness rule (no live MongoDB
connection is required).

Feature: sprint-1b-authentication-completion
Property 4: A raw opaque token appears in a response if and only if the
environment is development and a token was actually created this call.
Validates: Requirements 3.4, 3.5, 6.5, 6.6, 6.7

Property 5: Forgot-password responses are worded identically regardless of
account existence.
Validates: Requirements 6.4
"""

from unittest.mock import AsyncMock

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings as hyp_settings, strategies as st

from app.core.config import settings
from app.main import app
from app.middleware.auth import get_current_user
from app.services import email_verification_service, password_reset_service, user_service

# Plain instantiation (no `with TestClient(app) as client:`) never enters
# app.main's lifespan (and therefore never calls connect_to_mongo()), so no
# real MongoDB connection is attempted here - mirroring the documented
# pattern in test_main.py. raise_server_exceptions=False keeps an unexpected
# error from aborting the test run instead of being translated by main.py's
# exception handlers, though no test below is expected to hit that path.
client = TestClient(app, raise_server_exceptions=False)

APP_ENVS = ["development", "production", "staging"]


@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    """Ensures no `get_current_user` override leaks into another test."""
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize("app_env", APP_ENVS)
@pytest.mark.parametrize("already_verified", [True, False])
def test_send_verification_token_exposure(monkeypatch, app_env, already_verified):
    """`POST /auth/send-verification`: a raw token appears in `data` if and
    only if `app_env == "development"` AND the user was not already
    verified (i.e. a new Email_Verification_Token was actually created this
    call). In every other combination, `data` is None (Req 3.4, 3.5)."""
    monkeypatch.setattr(settings, "app_env", app_env)
    create_mock = AsyncMock(return_value="raw-verification-token-value")
    monkeypatch.setattr(email_verification_service, "create_verification_token", create_mock)

    fake_user = {"_id": ObjectId(), "is_verified": already_verified}
    app.dependency_overrides[get_current_user] = lambda: fake_user

    response = client.post("/api/v1/auth/send-verification")

    assert response.status_code == 200
    body = response.json()
    token_created = not already_verified

    if app_env == "development" and token_created:
        assert body["data"] == {"token": "raw-verification-token-value"}
    else:
        assert body["data"] is None

    assert create_mock.await_count == (1 if token_created else 0)


@pytest.mark.parametrize("app_env", APP_ENVS)
@pytest.mark.parametrize("user_found", [True, False])
def test_forgot_password_token_exposure(monkeypatch, app_env, user_found):
    """`POST /auth/forgot-password`: a raw token appears in `data` if and
    only if `app_env == "development"` AND a matching user was found (i.e.
    a new Password_Reset_Token was actually created this call). In every
    other combination, `data` is None (Req 6.5, 6.6, 6.7); the response
    `message` is identical regardless of the branch taken."""
    monkeypatch.setattr(settings, "app_env", app_env)
    fake_user = {"_id": ObjectId()} if user_found else None
    monkeypatch.setattr(user_service, "find_by_email", AsyncMock(return_value=fake_user))
    create_mock = AsyncMock(return_value="raw-reset-token-value")
    monkeypatch.setattr(password_reset_service, "create_reset_token", create_mock)

    response = client.post("/api/v1/auth/forgot-password", json={"email": "someone@example.com"})

    assert response.status_code == 200
    body = response.json()
    token_created = user_found

    if app_env == "development" and token_created:
        assert body["data"] == {"token": "raw-reset-token-value"}
    else:
        assert body["data"] is None

    assert create_mock.await_count == (1 if token_created else 0)
    assert body["message"] == "If an account exists, a reset link has been generated."


# Feature: sprint-1b-authentication-completion, Property 5: Forgot-password responses are worded identically regardless of account existence
@given(user_found=st.booleans(), email=st.emails())
@hyp_settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_forgot_password_message_is_always_identical(monkeypatch, user_found, email):
    """For any submitted email and regardless of whether it matches an
    existing user, the response's `message` field is byte-identical
    (Req 6.4).

    `monkeypatch` is used only to install fixed stand-ins
    (`settings.app_env`, mocked service calls) that do not vary across
    generated examples, so the function-scoped-fixture health check is
    safe to suppress here - each example re-applies the same patches via
    the same mocks rather than depending on per-example fixture reset."""
    monkeypatch.setattr(settings, "app_env", "production")
    fake_user = {"_id": ObjectId()} if user_found else None
    monkeypatch.setattr(user_service, "find_by_email", AsyncMock(return_value=fake_user))
    monkeypatch.setattr(
        password_reset_service, "create_reset_token", AsyncMock(return_value="raw-reset-token-value")
    )

    response = client.post("/api/v1/auth/forgot-password", json={"email": email})

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "If an account exists, a reset link has been generated."


# ---------------------------------------------------------------------------
# Task 7.4: Integration tests for the four new Auth_API routes
#
# These tests exercise each documented HTTP-status branch for
# `send-verification`, `verify-email`, `forgot-password`, and
# `reset-password` directly (rather than as a property-derived grid), with
# the service layer mocked via `monkeypatch`/`AsyncMock` - no real MongoDB
# connection is made, matching the module's existing pattern. `get_current_user`
# is overridden via `app.dependency_overrides` only for `send-verification`,
# which is the only one of the four routes that requires it (Req 4.1, 6.1, 7.1).
#
# Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 7.1, 7.3,
# 7.4, 7.5, 7.6
# ---------------------------------------------------------------------------

from app.core.exceptions import ExpiredTokenException, InvalidTokenException


def test_send_verification_returns_200_for_already_verified_user(monkeypatch):
    """`POST /auth/send-verification` returns 200 with the "already verified"
    message and no token creation when the authenticated user is already
    verified (Req 3.2, 3.3)."""
    monkeypatch.setattr(settings, "app_env", "production")
    create_mock = AsyncMock(return_value="raw-verification-token-value")
    monkeypatch.setattr(email_verification_service, "create_verification_token", create_mock)
    app.dependency_overrides[get_current_user] = lambda: {"_id": ObjectId(), "is_verified": True}

    response = client.post("/api/v1/auth/send-verification")

    assert response.status_code == 200
    body = response.json()
    assert body == {"success": True, "message": "Account is already verified.", "data": None}
    create_mock.assert_not_awaited()


def test_send_verification_returns_200_for_not_yet_verified_user(monkeypatch):
    """`POST /auth/send-verification` returns 200 and creates a new token
    when the authenticated user is not yet verified (Req 3.1, 3.2)."""
    monkeypatch.setattr(settings, "app_env", "production")
    create_mock = AsyncMock(return_value="raw-verification-token-value")
    monkeypatch.setattr(email_verification_service, "create_verification_token", create_mock)
    app.dependency_overrides[get_current_user] = lambda: {"_id": ObjectId(), "is_verified": False}

    response = client.post("/api/v1/auth/send-verification")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["message"] == "Verification email sent."
    create_mock.assert_awaited_once()


def test_verify_email_returns_200_when_token_consumed_successfully(monkeypatch):
    """`POST /auth/verify-email` returns 200 when
    `email_verification_service.consume_verification_token` succeeds
    (Req 4.2, 4.3)."""
    consume_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(email_verification_service, "consume_verification_token", consume_mock)

    response = client.post("/api/v1/auth/verify-email", json={"token": "some-valid-token"})

    assert response.status_code == 200
    body = response.json()
    assert body == {"success": True, "message": "Email verified successfully.", "data": None}
    consume_mock.assert_awaited_once_with("some-valid-token")


@pytest.mark.parametrize("exc_cls", [InvalidTokenException, ExpiredTokenException])
def test_verify_email_returns_401_on_invalid_or_expired_token(monkeypatch, exc_cls):
    """`POST /auth/verify-email` returns 401 with the error envelope when
    `consume_verification_token` raises `InvalidTokenException` or
    `ExpiredTokenException` (Req 4.4)."""
    consume_mock = AsyncMock(side_effect=exc_cls("Invalid or expired verification token."))
    monkeypatch.setattr(email_verification_service, "consume_verification_token", consume_mock)

    response = client.post("/api/v1/auth/verify-email", json={"token": "bad-token"})

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "Invalid or expired verification token."
    assert body["errors"] == ["Invalid or expired verification token."]


def test_forgot_password_returns_200_with_documented_response_shape(monkeypatch):
    """`POST /auth/forgot-password` returns 200 with the documented envelope
    shape for a well-formed request (Req 6.1, 6.2, 6.3)."""
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(user_service, "find_by_email", AsyncMock(return_value=None))

    response = client.post("/api/v1/auth/forgot-password", json={"email": "someone@example.com"})

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "success": True,
        "message": "If an account exists, a reset link has been generated.",
        "data": None,
    }


def test_reset_password_returns_200_when_token_consumed_successfully(monkeypatch):
    """`POST /auth/reset-password` returns 200 when
    `password_reset_service.consume_reset_token` succeeds (Req 7.3)."""
    consume_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(password_reset_service, "consume_reset_token", consume_mock)

    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "some-valid-token", "new_password": "new-strong-password"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body == {"success": True, "message": "Password reset successfully.", "data": None}
    consume_mock.assert_awaited_once_with("some-valid-token", "new-strong-password")


@pytest.mark.parametrize("exc_cls", [InvalidTokenException, ExpiredTokenException])
def test_reset_password_returns_401_on_invalid_or_expired_token(monkeypatch, exc_cls):
    """`POST /auth/reset-password` returns 401 with the error envelope when
    `consume_reset_token` raises `InvalidTokenException` or
    `ExpiredTokenException` (Req 7.4, 7.5)."""
    consume_mock = AsyncMock(side_effect=exc_cls("Invalid or expired reset token."))
    monkeypatch.setattr(password_reset_service, "consume_reset_token", consume_mock)

    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "bad-token", "new_password": "new-strong-password"},
    )

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "Invalid or expired reset token."
    assert body["errors"] == ["Invalid or expired reset token."]


@pytest.mark.parametrize("bad_password", ["short", "x" * 200])
def test_reset_password_returns_422_when_new_password_violates_bounds(bad_password):
    """`POST /auth/reset-password` returns 422 when `new_password` violates
    `PasswordResetRequest`'s 8-128 character bound, via Pydantic validation
    before the route body runs - no service mocking needed (Req 7.6)."""
    response = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "some-token", "new_password": bad_password},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False


def test_no_auth_header_routes_succeed_without_authorization_header(monkeypatch):
    """`verify-email`, `forgot-password`, and `reset-password` all require no
    authenticated session (Req 4.1, 6.1, 7.1): each reaches its normal 200
    success path with no `Authorization` header sent at all, proving none of
    them depends on `get_current_user`/Auth_Middleware. Contrast with
    `send-verification`, which does require the header via
    `get_current_user` and is excluded from this test."""
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(
        email_verification_service, "consume_verification_token", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(user_service, "find_by_email", AsyncMock(return_value=None))
    monkeypatch.setattr(password_reset_service, "consume_reset_token", AsyncMock(return_value=None))

    no_auth_client = TestClient(app, raise_server_exceptions=False)
    no_auth_client.headers.pop("Authorization", None)
    assert "Authorization" not in no_auth_client.headers

    verify_response = no_auth_client.post("/api/v1/auth/verify-email", json={"token": "a-token"})
    forgot_response = no_auth_client.post(
        "/api/v1/auth/forgot-password", json={"email": "someone@example.com"}
    )
    reset_response = no_auth_client.post(
        "/api/v1/auth/reset-password",
        json={"token": "a-token", "new_password": "new-strong-password"},
    )

    assert verify_response.status_code == 200
    assert forgot_response.status_code == 200
    assert reset_response.status_code == 200
