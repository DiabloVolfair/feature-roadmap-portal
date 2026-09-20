"""Dashboard_API: minimal RBAC demonstration routes.

Exposes GET /user/dashboard (requires `require_verified_user`) and
GET /admin/dashboard (requires `require_admin`). These are demonstration/test
routes for RBAC, not real feature functionality (Req 11.5, 12.5) - all
authorization logic is delegated to the Auth_Middleware dependencies; this
file contains no business logic beyond returning a fixed message.

The envelope's top-level `message` field carries a generic description of
the result ("Dashboard retrieved."); the endpoint-specific fixed text
("Welcome to your dashboard." / "Welcome Admin.") is payload, so it lives in
`data.message`, matching how UserResponse payloads already work in
/auth/me (Req 11.2, 12.2).

Requirements: 11.1, 11.2, 11.5, 12.1, 12.2, 12.5, 24.1, 24.2
"""

from typing import Any

from fastapi import APIRouter, Depends

from app.middleware.auth import require_admin, require_verified_user
from app.utils.responses import success_response

router = APIRouter()


@router.get("/user/dashboard")
async def user_dashboard(user: dict[str, Any] = Depends(require_verified_user)) -> dict:
    """Returns a fixed welcome message for any verified, authenticated user (Req 11.1-11.5)."""
    return success_response("Dashboard retrieved.", {"message": "Welcome to your dashboard."})


@router.get("/admin/dashboard")
async def admin_dashboard(user: dict[str, Any] = Depends(require_admin)) -> dict:
    """Returns a fixed welcome message for any verified, authenticated admin (Req 12.1-12.5)."""
    return success_response("Dashboard retrieved.", {"message": "Welcome Admin."})
