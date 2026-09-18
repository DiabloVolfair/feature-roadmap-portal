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
