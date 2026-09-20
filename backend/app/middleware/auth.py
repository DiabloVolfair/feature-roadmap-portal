"""Auth_Middleware: reusable request dependencies for protected routes.

Implements `get_current_user` and `get_current_admin` as described in
design.md ("Auth middleware (middleware/auth.py, Req 15, 16)"). Both
dependencies raise the reusable exceptions defined in `app/core/exceptions.py`
rather than constructing `error_response()` envelopes inline (Req 18.7,
18.9); `main.py`'s single `AuthException` handler does the translation.

`get_current_user` parses the `Authorization` header as a `Bearer` token,
decodes it as an access token via the Security_Module, checks the `type`
claim, and resolves the user via `User_Service` (Req 15.1-15.7).
`get_current_admin` depends on `get_current_user` via FastAPI's `Depends`
(rather than calling it as a plain function) so that any `AuthException`
raised while resolving the current user propagates through FastAPI's normal
dependency-resolution exception path unchanged, without being re-wrapped
(Req 16.2). It then raises an Unauthorized failure with `status_code=403`
when the resolved user's `role` is not `"admin"` (Req 16.3, 18.7), and
otherwise provides the resolved user to the route handler (Req 16.4).

Sprint 1B additively extends this module with `require_verified_user` (Req 9)
and `require_admin` (Req 10), two stricter dependencies that also depend on
`get_current_user` via `Depends` for the same unwrapped-propagation reason.
`require_admin` is a new dependency alongside `get_current_admin`, not a
replacement for it: `get_current_admin` remains unchanged and continues to
check `role == "admin"` only, while `require_admin` additionally requires
`is_verified` to be `true` (Req 10.5).

Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.2, 16.3,
16.4, 18.7, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4, 10.5
"""

from typing import Any

from fastapi import Depends, Header
from fastapi.security.utils import get_authorization_scheme_param

from app.core.exceptions import (
    ExpiredTokenException,
    InvalidTokenException,
    UnauthorizedException,
)
from app.core.security import TokenDecodeError, TokenExpiredError, decode_token
from app.services import user_service


async def get_current_user(authorization: str | None = Header(None)) -> dict[str, Any]:
    """Resolves the current authenticated user from the `Authorization`
    Bearer Access_Token (Req 15.1, 15.2).

    Raises `UnauthorizedException` (401) if the header is missing or is not
    a `Bearer` token (Req 15.3); `ExpiredTokenException` (401) if the token
    has expired (Req 15.5); `InvalidTokenException` (401) if the token is
    malformed/has an invalid signature (Req 15.4), if its `type` claim is
    not `"access"` (Req 15.6), or if its `sub` claim does not identify an
    existing user (Req 15.7).
    """
    scheme, token = get_authorization_scheme_param(authorization or "")
    if not authorization or scheme.lower() != "bearer" or not token:
        raise UnauthorizedException("Missing or invalid Authorization header.")
    try:
        payload = decode_token(token, token_type="access")
    except TokenExpiredError:
        raise ExpiredTokenException("Access token has expired.")
    except TokenDecodeError:
        raise InvalidTokenException("Invalid access token.")
    if payload.get("type") != "access":
        raise InvalidTokenException("Invalid access token.")
    user = await user_service.find_by_id(payload["sub"])
    if user is None:
        raise InvalidTokenException("Invalid access token.")
    return user


async def get_current_admin(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Resolves the current authenticated user and requires `role == "admin"`.

    Depends on `get_current_user` via FastAPI's `Depends` so that any
    `AuthException` it raises propagates unchanged (Req 16.1, 16.2).
    Raises `UnauthorizedException` with `status_code=403` when the resolved
    user's `role` is not `"admin"` (Req 16.3); otherwise returns the resolved
    user (Req 16.4).
    """
    if user.get("role") != "admin":
        raise UnauthorizedException("Administrator access required.", status_code=403)
    return user


async def require_verified_user(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Resolves the current authenticated user and requires `is_verified == true`.

    Depends on `get_current_user` via FastAPI's `Depends` so that any
    `AuthException` it raises propagates unchanged (Req 9.1, 9.2). Raises
    `UnauthorizedException` with `status_code=403` when the resolved user's
    `is_verified` field is not `true` (Req 9.3); otherwise returns the
    resolved user (Req 9.4).
    """
    if not user.get("is_verified"):
        raise UnauthorizedException("Email verification required.", status_code=403)
    return user


async def require_admin(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Resolves the current authenticated user and requires both
    `is_verified == true` and `role == "admin"`.

    Depends on `get_current_user` via FastAPI's `Depends` so that any
    `AuthException` it raises propagates unchanged (Req 10.1, 10.2). Raises
    `UnauthorizedException` with `status_code=403` when the resolved user's
    `is_verified` field is not `true` or its `role` field is not `"admin"`
    (Req 10.3); otherwise returns the resolved user (Req 10.4).

    This dependency is additive alongside `get_current_admin`, which remains
    unchanged and continues to check `role == "admin"` only, without
    checking `is_verified` (Req 10.5). `require_admin` is the stricter
    dependency intended for routes that must guarantee both verification
    and role, starting with the Admin_Dashboard_Endpoint introduced in
    Sprint 1B.
    """
    if not user.get("is_verified") or user.get("role") != "admin":
        raise UnauthorizedException("Administrator access required.", status_code=403)
    return user
