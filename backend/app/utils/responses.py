"""Response envelope helpers.

Centralizes the success/error JSON envelope shape so every current and
future API route returns a consistent response body.

Requirements: 7.1, 7.2
"""

from typing import Any


def success_response(message: str, data: Any = None) -> dict:
    """Build the success response envelope.

    Args:
        message: A string describing the result (1-500 characters).
        data: The response payload, or None when there is no payload.

    Returns:
        A dict of the shape {"success": True, "message": message, "data": data}.
    """
    return {"success": True, "message": message, "data": data}


def error_response(message: str, errors: list[str]) -> dict:
    """Build the error response envelope.

    Args:
        message: A string describing the error (1-500 characters).
        errors: A non-empty list of strings describing the specific errors.

    Returns:
        A dict of the shape {"success": False, "message": message, "errors": errors}.
    """
    return {"success": False, "message": message, "errors": errors}
