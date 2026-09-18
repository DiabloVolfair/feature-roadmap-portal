"""Health_Endpoint router.

Exposes GET /health, which is mounted under the /api/v1 prefix by the
application factory, giving the full path /api/v1/health.

Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3
"""

from fastapi import APIRouter

from app.utils.responses import success_response

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """Return the backend's operational status.

    Only GET is registered for this path, so FastAPI's routing layer
    itself returns 405 Method Not Allowed for any other HTTP method
    (Requirement 6.4), without any custom logic here.
    """
    return success_response(
        message="Backend is running.",
        data={"status": "healthy", "version": "1.0.0"},
    )
