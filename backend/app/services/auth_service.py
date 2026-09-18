"""Auth_Service: signup, login, session refresh, and logout business logic.

Implements the Auth_Service described in design.md ("Auth service
(services/auth_service.py, Req 7-10)"). This module delegates exclusively
to `User_Service` (persistence) and `Security_Module` (hashing/JWT), and
raises the reusable exceptions defined in `app/core/exceptions.py` rather
than building `error_response()` envelopes inline (Req 18.9). It never
imports `db` from `app.db.mongodb` directly (Req 6.8, 27.2, 27.4).

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7,
8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4, 18.9
"""

from app.core.exceptions import (
    ExpiredTokenException,
    InvalidCredentialsException,
    InvalidTokenException,
    UserAlreadyExistsException,
)
from app.core.security import (
    TokenDecodeError,
    TokenExpiredError,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
    verify_refresh_token,
)
from app.models.user import TokenResponse, UserCreate, UserLogin, UserResponse
from app.services import user_service
from app.services.user_service import DuplicateEmailError


def _issue_tokens(user_id: str) -> tuple[str, str]:
    """Creates a fresh (access_token, refresh_token) pair for `user_id` via
    the Security_Module. Used by `login` and `refresh_session` so tokens are
    always created together, before either is persisted or returned.
    """
    return create_access_token(user_id), create_refresh_token(user_id)


async def signup(user_create: UserCreate) -> UserResponse:
    """Registers a new user and returns a UserResponse.

    Checks email existence via User_Service first (Req 7.1); if the email
    already exists, signals UserAlreadyExistsException and does not create a
    document (Req 7.2). Otherwise hashes the password via Security_Module
    (delegated to User_Service.create_user) and creates the document,
    returning a UserResponse (Req 7.3). Never issues tokens (Req 7.4). If the
    create-user call races past the pre-check and hits the unique-email
    constraint anyway, DuplicateEmailError is translated into the same
    UserAlreadyExistsException rather than propagating as an unexpected
    error (Req 7.5).
    """
    if await user_service.email_exists(user_create.email):
        raise UserAlreadyExistsException(
            f"An account with email {user_create.email} already exists."
        )
    try:
        doc = await user_service.create_user(user_create)
    except DuplicateEmailError:
        raise UserAlreadyExistsException(
            f"An account with email {user_create.email} already exists."
        )
    return UserResponse.from_mongo(doc)


async def login(user_login: UserLogin) -> tuple[TokenResponse, str]:
    """Authenticates a user and establishes a session.

    Returns (TokenResponse, refresh_token_value_for_cookie).

    Finds the user by email via User_Service (Req 8.1); if no user matches,
    or the submitted password does not verify against the stored hash,
    signals the same InvalidCredentialsException in both cases so the two
    failure causes are indistinguishable to the caller (Req 8.2, 8.3).
    Otherwise creates an access and refresh token via Security_Module
    (Req 8.4) and persists the refresh token via User_Service before
    returning anything (Req 8.5, 8.6). If persistence fails, signals a
    session-establishment failure and returns neither a TokenResponse nor a
    refresh token for the cookie (Req 8.8).
    """
    doc = await user_service.find_by_email(user_login.email)
    if doc is None or not verify_password(user_login.password, doc["password_hash"]):
        raise InvalidCredentialsException("Invalid email or password.")
    access, refresh = _issue_tokens(str(doc["_id"]))
    if not await user_service.set_refresh_token(str(doc["_id"]), refresh):
        raise InvalidCredentialsException(
            "Could not establish a session. Please try again."
        )
    return TokenResponse(access_token=access, token_type="bearer"), refresh


async def refresh_session(refresh_token: str | None) -> tuple[TokenResponse, str]:
    """Rotates a session's tokens given the current Refresh_Token.

    Returns (TokenResponse, new_refresh_token_value_for_cookie).

    Decodes the Refresh_Token (Req 9.1); a missing cookie value, a malformed
    token, or a token whose `type` claim is not `"refresh"` all signal an
    InvalidTokenException (Req 9.2). An expired `exp` claim signals an
    ExpiredTokenException instead (Req 9.3). Once decoded and unexpired, the
    user identified by the token's `sub` claim is looked up via User_Service
    (Req 9.4); if no user matches, or the presented token does not verify
    against the hash currently persisted on that user's document, signals
    InvalidTokenException (Req 9.5, 9.6). Otherwise issues a new token pair
    and persists the new refresh token, overwriting the previous value, so
    the previous token immediately stops matching on any subsequent call
    (Req 9.7). If persistence fails, signals InvalidTokenException rather
    than returning a TokenResponse (Req 9.7-fail path, mirroring Req 8.8).
    """
    if refresh_token is None:
        raise InvalidTokenException("No refresh token provided.")
    try:
        payload = decode_token(refresh_token, token_type="refresh")
    except TokenExpiredError:
        raise ExpiredTokenException("Refresh token has expired.")
    except TokenDecodeError:
        raise InvalidTokenException("Invalid refresh token.")
    if payload.get("type") != "refresh":
        raise InvalidTokenException("Invalid refresh token.")
    doc = await user_service.find_by_id(payload["sub"])
    stored_hash = doc.get("refresh_token_hash") if doc is not None else None
    if not stored_hash or not verify_refresh_token(refresh_token, stored_hash):
        raise InvalidTokenException("Invalid refresh token.")
    access, new_refresh = _issue_tokens(str(doc["_id"]))
    if not await user_service.set_refresh_token(str(doc["_id"]), new_refresh):
        raise InvalidTokenException("Could not refresh session. Please log in again.")
    return TokenResponse(access_token=access, token_type="bearer"), new_refresh


async def logout(refresh_token: str | None) -> None:
    """Best-effort session termination. Never raises (Req 10.3).

    If the Refresh_Token_Cookie decodes to a token identifying an existing
    user document, clears that user's persisted `refresh_token_hash` field
    (Req 10.1, 10.2). A missing, malformed, expired cookie, or one that does
    not identify an existing user, is simply skipped without signaling a
    failure (Req 10.3). Callers (the Logout_Endpoint) always proceed to
    clear the Refresh_Token_Cookie and respond successfully regardless of
    which branch was taken (Req 10.4).
    """
    if refresh_token is None:
        return
    try:
        payload = decode_token(refresh_token, token_type="refresh")
        doc = await user_service.find_by_id(payload["sub"])
        if doc is not None:
            await user_service.set_refresh_token(str(doc["_id"]), None)
    except (TokenDecodeError, TokenExpiredError):
        return
