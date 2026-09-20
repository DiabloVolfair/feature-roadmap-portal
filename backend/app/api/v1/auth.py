"""Auth_API routes.

Follows the `health.py` pattern: a bare `APIRouter()`, thin `async def`
route handlers, everything delegated to `Auth_Service` (business logic) or
`get_current_user` (Auth_Middleware). No route here contains inline
exception handling, password/JWT logic, or a direct database query
(Req 27.1-27.4) - every failure branch is produced by letting
`Auth_Service`/`get_current_user` raise an `AuthException` subclass, which
`main.py`'s single exception handler translates to the `error_response()`
envelope (Req 18.9, 27.2).

Sprint 1B additively extends this router with four new routes -
`send_verification`, `verify_email`, `forgot_password`, `reset_password` -
delegating to `Email_Verification_Service`/`Password_Reset_Service` in the
same thin, delegate-everything style; none of the existing signup/login/
refresh/logout/me handlers above are modified.

Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4,
12.5, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 17.1, 17.2, 17.3, 17.4,
19.1, 19.2, 19.3, 19.6, 27.1, 27.2, 27.3, 27.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6,
4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.3,
7.4, 7.5, 7.6, 7.7, 8.3, 24.1, 24.2
"""

from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from app.core.config import settings
from app.middleware.auth import get_current_user
from app.models.user import (
    ForgotPasswordRequest,
    PasswordResetRequest,
    UserCreate,
    UserLogin,
    UserResponse,
    VerifyEmailRequest,
)
from app.services import auth_service, email_verification_service, password_reset_service, user_service
from app.utils.responses import success_response

router = APIRouter(prefix="/auth")


def _cookie_kwargs() -> dict:
    """Shared Refresh_Token_Cookie attributes (Req 19.1-19.3).

    `httponly=True` keeps the Refresh_Token out of reach of JavaScript
    (Req 19.3); `secure=False` matches the local-development HTTP setup this
    sprint targets; `samesite="lax"` and `path="/"` scope the cookie to the
    whole app while still offering baseline CSRF protection; `max_age` ties
    the cookie's own lifetime to `refresh_token_expire_days`, matching the
    Refresh_Token's own expiration.
    """
    return dict(
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
        max_age=settings.refresh_token_expire_days * 86400,
    )


@router.post("/signup", status_code=201)
async def signup(body: UserCreate) -> dict[str, Any]:
    """Registers a new user (Req 11.1-11.6).

    Delegates entirely to `Auth_Service.signup`; sets no cookie and issues
    no tokens (Req 11.4, 11.5).
    """
    user = await auth_service.signup(body)
    return success_response("Account created successfully.", user.model_dump())


@router.post("/login")
async def login(body: UserLogin, response: Response) -> dict[str, Any]:
    """Authenticates a user and establishes a session (Req 12.1-12.5).

    Delegates entirely to `Auth_Service.login`, then sets the
    Refresh_Token_Cookie on the response (Req 12.4, 19.1-19.3) and returns
    the access token in the response body (Req 12.3, 19.6).
    """
    tokens, refresh_token = await auth_service.login(body)
    response.set_cookie("refresh_token", refresh_token, **_cookie_kwargs())
    return success_response("Logged in successfully.", tokens.model_dump())


@router.post("/refresh")
async def refresh(request: Request, response: Response) -> dict[str, Any]:
    """Rotates a session's tokens using the Refresh_Token_Cookie (Req 13.1-13.4).

    Reads the cookie from the request, delegates entirely to
    `Auth_Service.refresh_session`, then sets the rotated
    Refresh_Token_Cookie on the response (Req 13.3, 19.2).
    """
    refresh_token = request.cookies.get("refresh_token")
    tokens, new_refresh_token = await auth_service.refresh_session(refresh_token)
    response.set_cookie("refresh_token", new_refresh_token, **_cookie_kwargs())
    return success_response("Session refreshed.", tokens.model_dump())


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict[str, Any]:
    """Terminates a session (Req 14.1-14.3).

    Reads the cookie from the request, delegates entirely to
    `Auth_Service.logout` (which never raises), then always clears the
    Refresh_Token_Cookie and returns a 200 success response (Req 14.2, 14.3).
    """
    refresh_token = request.cookies.get("refresh_token")
    await auth_service.logout(refresh_token)
    response.delete_cookie("refresh_token", path="/")
    return success_response("Logged out successfully.")


@router.get("/me")
async def me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Returns the currently authenticated user (Req 17.1-17.4).

    Delegates authentication entirely to `get_current_user`
    (Auth_Middleware) and maps the resolved document to a `UserResponse`.
    """
    return success_response(
        "Current user retrieved.", UserResponse.from_mongo(current_user).model_dump()
    )


@router.post("/send-verification")
async def send_verification(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Requests a new Email_Verification_Token for the authenticated user
    (Req 3.1-3.6).

    Short-circuits with a generic success message if the user is already
    verified, without creating a new token (Req 3.2, 3.3). Otherwise
    delegates to `Email_Verification_Service.create_verification_token` and
    includes the raw token in `data` only when `settings.app_env` is
    `"development"` (Req 3.4, 3.5).
    """
    if current_user.get("is_verified"):
        return success_response("Account is already verified.")
    token = await email_verification_service.create_verification_token(str(current_user["_id"]))
    data = {"token": token} if settings.app_env == "development" else None
    return success_response("Verification email sent.", data)


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest) -> dict[str, Any]:
    """Consumes an Email_Verification_Token, marking the associated user
    verified (Req 4.1-4.5).

    Requires no authenticated session - the token itself is the proof of
    account ownership (Req 4.1). Delegates entirely to
    `Email_Verification_Service.consume_verification_token`, letting
    `InvalidTokenException`/`ExpiredTokenException` propagate to `main.py`'s
    existing exception handler on failure (Req 4.4, 4.5).
    """
    await email_verification_service.consume_verification_token(body.token)
    return success_response("Email verified successfully.")


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest) -> dict[str, Any]:
    """Requests a Password_Reset_Token for the submitted email if it
    matches an existing user (Req 6.1-6.8).

    Requires no authenticated session (Req 6.1). Never reveals whether the
    email matched: there is exactly one `success_response(...)` call site
    below, so the response message is provably identical regardless of
    account existence (Req 6.4); only the presence of a development-mode
    token in `data` can differ, and only when `settings.app_env` is
    `"development"` (Req 6.5, 6.6, 6.7).
    """
    user = await user_service.find_by_email(body.email)
    data = None
    if user is not None:
        token = await password_reset_service.create_reset_token(str(user["_id"]))
        if settings.app_env == "development":
            data = {"token": token}
    return success_response("If an account exists, a reset link has been generated.", data)


@router.post("/reset-password")
async def reset_password(body: PasswordResetRequest) -> dict[str, Any]:
    """Consumes a Password_Reset_Token, replacing the associated user's
    password and invalidating their active session (Req 7.1-7.7).

    Requires no authenticated session - the token itself is the proof of
    account ownership (Req 7.1). Delegates entirely to
    `Password_Reset_Service.consume_reset_token`, letting
    `InvalidTokenException`/`ExpiredTokenException` propagate to `main.py`'s
    existing exception handler on failure (Req 7.4, 7.5, 7.6, 7.7).
    """
    await password_reset_service.consume_reset_token(body.token, body.new_password)
    return success_response("Password reset successfully.")
