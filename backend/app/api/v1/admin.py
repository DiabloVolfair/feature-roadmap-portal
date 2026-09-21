"""Admin_API routes for the kanban board.

Exposes two thin route handlers under the `/admin` prefix:
- `GET /features/board`  — returns all features grouped by status (Req 2.1–2.7)
- `PATCH /features/{feature_id}/status` — validates and applies a status
  transition (Req 3.1–3.7)

Both handlers delegate entirely to `feature_service`; no business logic,
authorization, or database access lives here.  Error responses are produced
by letting `feature_service` raise `FeatureException` subclasses, which
`main.py`'s single exception handler translates to the `error_response()`
envelope without any additional handler registration (Req 5.4).

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5,
3.6, 3.7, 7.1, 7.2, 7.3, 7.4, 7.5
"""

from typing import Any

from fastapi import APIRouter, Depends

from app.middleware.auth import require_admin
from app.models.feature import AdminStatusUpdate, BoardFeatureCard, FeatureResponse
from app.services import feature_service
from app.utils.responses import success_response

router = APIRouter(prefix="/admin")


@router.get("/features/board")
async def board_route(current_user: dict[str, Any] = Depends(require_admin)) -> dict:
    """Returns all features grouped into four status columns (Req 2.1–2.7)."""
    board_dict = await feature_service.get_board()
    serialized = {
        col: [BoardFeatureCard.from_mongo(doc).model_dump() for doc in docs]
        for col, docs in board_dict.items()
    }
    return success_response("Board retrieved.", serialized)


@router.patch("/features/{feature_id}/status")
async def update_status_route(
    feature_id: str,
    body: AdminStatusUpdate,
    current_user: dict[str, Any] = Depends(require_admin),
) -> dict:
    """Validates and applies a status transition for a feature (Req 3.1–3.7)."""
    doc = await feature_service.update_feature_status(
        feature_id, body.status, current_user
    )
    return success_response(
        "Status updated.", FeatureResponse.from_mongo(doc).model_dump()
    )
