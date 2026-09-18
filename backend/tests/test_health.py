"""Unit tests for the Health_Endpoint.

Builds a minimal standalone FastAPI app that mounts api_router under the
/api/v1 prefix, mirroring how app/main.py will mount it, without depending
on app/main.py directly (task 6.1 may not exist yet).

Requirements: 6.1, 6.2, 6.4
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1 import api_router

app = FastAPI()
app.include_router(api_router, prefix="/api/v1")

client = TestClient(app)


def test_health_get_returns_200_with_exact_body():
    """GET /api/v1/health returns 200 with the exact expected envelope."""
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "Backend is running.",
        "data": {"status": "healthy", "version": "1.0.0"},
    }


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_health_disallowed_methods_return_405(method):
    """Non-GET methods on /api/v1/health return 405 Method Not Allowed."""
    response = client.request(method, "/api/v1/health")

    assert response.status_code == 405
