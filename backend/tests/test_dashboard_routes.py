"""Integration tests for the Dashboard_API routes (Sprint 1B).

Covers the 200/401/403 branches of both `GET /api/v1/user/dashboard`
(guarded by `require_verified_user`) and `GET /api/v1/admin/dashboard`
(guarded by `require_admin`).

The 200 and 403 branches use FastAPI's `app.dependency_overrides` to stand
in for `require_verified_user`/`require_admin` with lightweight callables
(a fake-user return, or a raise of the same `UnauthorizedException` the real
dependency would raise) - this substitutes the dependency itself rather than
constructing a real JWT, while still exercising the actual FastAPI routing
and `AuthException` handler machinery registered on the shared `app`
(Req 11.2, 11.4, 12.2, 12.4).

The 401 branch is exercised with no override at all: a request with no
`Authorization` header lets the real `get_current_user` -> `require_verified_user`
/`require_admin` chain naturally raise its own 401 `UnauthorizedException`,
so the "not authenticated" branch is proven against the real dependency
chain rather than a stand-in (Req 11.3, 12.3).

Requirements: 11.2, 11.3, 11.4, 12.2, 12.3, 12.4
"""

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.core.exceptions import UnauthorizedException
from app.main import app
from app.middleware.auth import require_admin, require_verified_user

# The shared `app` from app.main is safe to instantiate a plain TestClient
# against here because TestClient only runs the lifespan (and therefore
# connect_to_mongo()) when used as a context manager. Plain instantiation
# below never enters the lifespan, so no real MongoDB connection is
# attempted, mirroring the pattern established in test_main.py/test_auth_routes.py.
client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _clear_dependency_overrides():
    """Ensures no override leaks into another test file's use of the shared `app`."""
    yield
    app.dependency_overrides.clear()


def _fake_verified_user():
    return {"_id": ObjectId(), "is_verified": True, "role": "user"}


def _fake_admin_user():
    return {"_id": ObjectId(), "is_verified": True, "role": "admin"}


def _raise_403():
    raise UnauthorizedException("Forbidden.", status_code=403)


# --- GET /api/v1/user/dashboard ---------------------------------------------


def test_user_dashboard_returns_200_with_exact_message_for_verified_user():
    """Req 11.2: a verified, authenticated user gets 200 with the exact
    welcome message nested under `data.message`, plus a generic top-level
    envelope `message`."""
    app.dependency_overrides[require_verified_user] = _fake_verified_user

    response = client.get("/api/v1/user/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert isinstance(body["message"], str) and body["message"]
    assert body["data"] == {"message": "Welcome to your dashboard."}


def test_user_dashboard_returns_401_when_not_authenticated():
    """Req 11.3: with no Authorization header, the real `get_current_user`
    dependency (invoked via `require_verified_user`) rejects the request
    with 401 before route logic executes."""
    response = client.get("/api/v1/user/dashboard")

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False


def test_user_dashboard_returns_403_when_not_verified():
    """Req 11.4: when `require_verified_user` rejects an authenticated but
    unverified user, the route responds with 403 and an error envelope."""
    app.dependency_overrides[require_verified_user] = _raise_403

    response = client.get("/api/v1/user/dashboard")

    assert response.status_code == 403
    body = response.json()
    assert body["success"] is False


# --- GET /api/v1/admin/dashboard --------------------------------------------


def test_admin_dashboard_returns_200_with_exact_message_for_admin():
    """Req 12.2: a verified, authenticated admin gets 200 with the exact
    welcome message nested under `data.message`, plus a generic top-level
    envelope `message`."""
    app.dependency_overrides[require_admin] = _fake_admin_user

    response = client.get("/api/v1/admin/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert isinstance(body["message"], str) and body["message"]
    assert body["data"] == {"message": "Welcome Admin."}


def test_admin_dashboard_returns_401_when_not_authenticated():
    """Req 12.3: with no Authorization header, the real `get_current_user`
    dependency (invoked via `require_admin`) rejects the request with 401
    before route logic executes."""
    response = client.get("/api/v1/admin/dashboard")

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False


def test_admin_dashboard_returns_403_when_not_admin_or_not_verified():
    """Req 12.4: when `require_admin` rejects an authenticated user that is
    not both verified and an admin, the route responds with 403 and an
    error envelope."""
    app.dependency_overrides[require_admin] = _raise_403

    response = client.get("/api/v1/admin/dashboard")

    assert response.status_code == 403
    body = response.json()
    assert body["success"] is False
