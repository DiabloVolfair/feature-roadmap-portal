"""Reusable authentication exceptions.

Defines a single AuthException base class carrying the HTTP status code,
message, and errors list for an authentication failure, plus the concrete
subclasses used by Auth_Service and Auth_Middleware. `main.py` registers one
exception handler for the whole AuthException family (Req 18.8), so
Auth_Service and Auth_Middleware only ever raise these exceptions rather than
building error_response() envelopes inline (Req 18.9).

Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6
"""


class AuthException(Exception):
    """Base class for every reusable authentication exception.

    Subclasses set a class-level `status_code`. `message` describes the
    specific authentication failure; `errors` defaults to a single-item list
    containing `message` when the caller does not supply a more detailed list,
    so the `error_response()` envelope always gets a non-empty `errors` array
    (Req 18.8).
    """

    status_code: int

    def __init__(self, message: str, errors: list[str] | None = None) -> None:
        self.message = message
        self.errors = errors or [message]
        super().__init__(message)


class InvalidCredentialsException(AuthException):
    """Raised when login credentials are invalid. Maps to HTTP 401 (Req 18.1)."""

    status_code = 401


class UserAlreadyExistsException(AuthException):
    """Raised when signup targets an email that already exists. Maps to HTTP 409 (Req 18.2)."""

    status_code = 409


class InvalidTokenException(AuthException):
    """Raised when a token fails to decode/validate. Maps to HTTP 401 (Req 18.3)."""

    status_code = 401


class ExpiredTokenException(AuthException):
    """Raised when a token has expired. Maps to HTTP 401 (Req 18.4)."""

    status_code = 401


class UnauthorizedException(AuthException):
    """Raised by Auth_Middleware for the missing/invalid Authorization header
    failure (Req 15.3) and the non-administrator role failure (Req 16.2).

    `status_code` defaults to 401 (Req 18.5, 18.6); Auth_Middleware overrides
    it to 403 for the non-admin-role case (Req 18.7) by passing
    `status_code=403`.
    """

    status_code = 401

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        if status_code is not None:
            self.status_code = status_code


# --- Feature-domain exceptions (Sprint 2A) -------------------------------
#
# A new, small exception family, deliberately not inheriting from
# AuthException: AuthException is authentication-specific, and reusing it
# (or renaming it) for feature-domain failures would be a needless naming
# compromise (Req 11.3). This mirrors AuthException's shape and its
# single-handler-per-family wiring pattern, registered separately in
# main.py.
#
# No InvalidCategoryException/InvalidStatusException types are introduced
# here: category/status/sort validation is fully enforced via
# Pydantic/FastAPI Enum-typed request/query parameters, which already
# produce a 422 response through the existing RequestValidationError
# handler, so dedicated exceptions for that failure mode would be dead code
# (Req 11.6).


class FeatureException(Exception):
    """Base class for every reusable feature-domain exception. Same shape as
    AuthException (status_code/message/errors), but intentionally not a
    subclass of it - AuthException is authentication-specific and this is a
    different domain (Req 11.3)."""

    status_code: int

    def __init__(self, message: str, errors: list[str] | None = None) -> None:
        self.message = message
        self.errors = errors or [message]
        super().__init__(message)


class FeatureNotFoundException(FeatureException):
    """Raised when Feature_Service cannot locate a feature by id. Maps to
    HTTP 404 (Req 11.1)."""

    status_code = 404


class PermissionDeniedException(FeatureException):
    """Raised when the requesting user is not authorized to modify or
    delete a specific feature request. Maps to HTTP 403 (Req 11.2)."""

    status_code = 403
