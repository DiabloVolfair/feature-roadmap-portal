"""Security module: password hashing/verification and JWT creation/decoding.

Implements the Security_Module described in design.md ("Security module
(core/security.py, Req 4, 5)"). Two failure families are kept intentionally
distinct:

- Password hashing/verification failures never raise for a malformed hash;
  `verify_password` returns False instead (Req 4.2).
- JWT decode failures are split into `TokenDecodeError` (bad signature or
  malformed structure) and `TokenExpiredError` (valid signature/structure,
  but `exp` is in the past). This distinction is achieved by decoding with
  `verify_exp=False` and then checking expiration manually via `is_expired`,
  rather than relying on python-jose's built-in ExpiredSignatureError, which
  is itself a JWTError subtype and would collapse the two failure signals
  into one (Req 5.8, 5.9).

Access tokens and refresh tokens are signed with distinct secrets
(`settings.jwt_secret` vs `settings.jwt_refresh_secret`), so a token can
never even decode successfully against the wrong secret. This is a stronger
form of type discrimination than checking the `type` claim alone (Req 5.6,
5.7), though the `type` claim is still embedded and available for callers
to check redundantly (Req 5.1, 5.2).
"""

import hashlib
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError

from app.core.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_MAX_PASSWORD_BYTES = 72


class TokenDecodeError(Exception):
    """Signature invalid or JWT structure malformed.

    Distinct from `TokenExpiredError` so callers can tell the two failure
    modes apart (Req 5.8, 5.9).
    """


class TokenExpiredError(Exception):
    """Signature/structure valid, but the `exp` claim is in the past."""


def _validate_password_bytes(password: str) -> None:
    """Raises ValueError if password is empty or exceeds 72 bytes UTF-8 (Req 4.6)."""
    if not password:
        raise ValueError("Password must not be empty.")
    if len(password.encode("utf-8")) > _MAX_PASSWORD_BYTES:
        raise ValueError(
            f"Password must not exceed {_MAX_PASSWORD_BYTES} bytes when UTF-8 encoded."
        )


def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt via passlib.

    Raises ValueError if the password is empty or exceeds 72 bytes UTF-8
    (Req 4.6), rather than silently truncating it.
    """
    _validate_password_bytes(password)
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash.

    Returns False (never raises) for a malformed/non-bcrypt hash (Req 4.2).
    """
    try:
        return _pwd_context.verify(password, password_hash)
    except (ValueError, UnknownHashError):
        return False


def _refresh_token_digest(token: str) -> str:
    """Reduces a Refresh_Token (a JWT string, far longer than 72 bytes) to a
    fixed-length 64-character hex SHA-256 digest, so it can safely be passed
    to bcrypt (which caps input at 72 bytes) without truncation.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_refresh_token(token: str) -> str:
    """Hashes a Refresh_Token for storage.

    Refresh tokens are JWT strings far longer than bcrypt's 72-byte input
    limit, so unlike `hash_password`, this first reduces the token to a
    fixed-length SHA-256 digest and bcrypt-hashes that digest instead of the
    raw token.
    """
    return _pwd_context.hash(_refresh_token_digest(token))


def verify_refresh_token(token: str, token_hash: str) -> bool:
    """Verifies a Refresh_Token against a stored hash produced by
    `hash_refresh_token`.

    Returns False (never raises) for a malformed/non-bcrypt stored hash,
    mirroring `verify_password`'s behavior.
    """
    try:
        return _pwd_context.verify(_refresh_token_digest(token), token_hash)
    except (ValueError, UnknownHashError):
        return False


def _secret_for(token_type: str) -> str:
    return settings.jwt_secret if token_type == "access" else settings.jwt_refresh_secret


def _create_token(user_id: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "type": token_type, "exp": now + expires_delta}
    return jwt.encode(payload, _secret_for(token_type), algorithm="HS256")


def create_access_token(user_id: str) -> str:
    """Creates an Access_Token: `sub`=user_id, `type`="access" (Req 5.1)."""
    return _create_token(
        user_id,
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(user_id: str) -> str:
    """Creates a Refresh_Token: `sub`=user_id, `type`="refresh" (Req 5.2)."""
    return _create_token(
        user_id,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
    )


def is_expired(exp: float) -> bool:
    """Pure function: no signature check, no decoding — just a timestamp
    comparison against the current time (Req 5.4).
    """
    return datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc)


def decode_token(token: str, token_type: str) -> dict:
    """Decodes and validates a JWT of the given `token_type`.

    Verifies signature and structure first; only once those are confirmed
    valid does it check `exp`, raising TokenExpiredError if it's in the
    past. This ordering is what makes decode failures and expiration
    failures distinguishable (Req 5.8, 5.9). Uses a distinct secret per
    token type (Req 5.6, 5.7).
    """
    secret = _secret_for(token_type)
    try:
        payload = jwt.decode(
            token, secret, algorithms=["HS256"], options={"verify_exp": False}
        )
    except JWTError as exc:
        raise TokenDecodeError(str(exc)) from exc
    if is_expired(payload["exp"]):
        raise TokenExpiredError("Token has expired")
    return payload
