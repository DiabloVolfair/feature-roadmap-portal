"""Unit tests for the exception handlers registered in backend/app/main.py.

Exercises all three registered exception handlers (RequestValidationError,
StarletteHTTPException, catch-all Exception) and asserts each returns the
correct HTTP status and error_response() envelope shape.

Requirements: 9.5, 7.2
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.main import (
    app,
    http_exception_handler,
    unhandled_exception_handler,
    validation_handler,
)

# The shared `app` from app.main is safe to instantiate a plain TestClient
# against here because TestClient only runs the lifespan (and therefore
# connect_to_mongo()) when used as a context manager. Plain instantiation
# below never enters the lifespan, so no real MongoDB connection is attempted.
client = TestClient(app, raise_server_exceptions=False)


def test_starlette_http_exception_handler_on_unknown_path_returns_404_envelope():
    """Hitting a nonexistent path triggers the StarletteHTTPException handler
    with a 404 passthrough status and the error envelope shape."""
    response = client.get("/this-path-does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["errors"], list) and len(body["errors"]) >= 1


def test_starlette_http_exception_handler_on_disallowed_method_returns_405_envelope():
    """Sending POST to /api/v1/health (GET-only) triggers the
    StarletteHTTPException handler with a 405 passthrough status and the
    error envelope shape."""
    response = client.post("/api/v1/health")

    assert response.status_code == 405
    body = response.json()
    assert body["success"] is False
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["errors"], list) and len(body["errors"]) >= 1


def test_request_validation_error_handler_returns_422_envelope():
    """A request that fails Pydantic validation triggers the
    RequestValidationError handler with a 422 status and the error envelope
    shape. Uses a throwaway app/route (not the shared `app`) with the real
    validation handler registered, so the shared app's route table is left
    untouched.
    """

    class Item(BaseModel):
        name: str
        quantity: int

    from fastapi.exceptions import RequestValidationError

    validation_app = FastAPI()
    validation_app.add_exception_handler(RequestValidationError, validation_handler)

    @validation_app.post("/items")
    async def create_item(item: Item):
        return {"received": item.model_dump()}

    validation_client = TestClient(validation_app, raise_server_exceptions=False)

    response = validation_client.post("/items", json={"name": "widget"})

    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "Validation failed."
    assert isinstance(body["errors"], list) and len(body["errors"]) >= 1


def test_unhandled_exception_handler_returns_500_envelope():
    """Any unhandled exception raised inside a route triggers the catch-all
    Exception handler with a 500 status and the error envelope shape. Uses a
    fresh, throwaway FastAPI app (not the shared `app`) with the same
    catch-all handler registered, so the shared app is never made to raise.
    """
    crash_app = FastAPI()
    crash_app.add_exception_handler(Exception, unhandled_exception_handler)

    @crash_app.get("/boom")
    async def boom():
        raise RuntimeError("something broke")

    crash_client = TestClient(crash_app, raise_server_exceptions=False)

    response = crash_client.get("/boom")

    assert response.status_code == 500
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "An unexpected error occurred."
    assert isinstance(body["errors"], list) and len(body["errors"]) >= 1
    assert "something broke" in body["errors"][0]
