"""Auth_API routes.

Follows the `health.py` pattern: a bare `APIRouter()`, thin `async def`
route handlers, everything delegated to `Auth_Service` (business logic) or
`get_current_user` (Auth_Middleware). No route here contains inline
exception handling, password/JWT logic, or a direct database query
(Req 27.1-27.4) - every failure branch is produced by letting
`Auth_Service`/`get_current_user` raise an `AuthException` subclass, which
`main.py`'s single exception handler translates to the `error_response()`
envelope (Req 18.9, 27.2).

Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4,
12.5, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 17.1, 17.2, 17.3, 17.4,
19.1, 19.2, 19.3, 19.6, 27.1, 27.2, 27.3, 27.4
"""

from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from app.core.config import settings
from app.middleware.auth import get_current_user
from app.models.user import UserCreate, UserLogin, UserResponse
from app.services import auth_service
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
