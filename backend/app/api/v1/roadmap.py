"""Public roadmap router.

Exposes a single unauthenticated GET endpoint that returns all non-under_review
features grouped by status.

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
"""

from fastapi import APIRouter

from app.models.feature import RoadmapCard, RoadmapResponse
from app.services import feature_service
from app.utils.responses import success_response

router = APIRouter(prefix="/roadmap")


@router.get("")
async def roadmap_route() -> dict:
    """Returns all non-under_review features grouped by status (public, no auth). Req 2.1-2.6"""
    board_dict = await feature_service.get_public_roadmap()
    serialized = RoadmapResponse(
        planned=[RoadmapCard.from_mongo(doc) for doc in board_dict["planned"]],
        in_progress=[RoadmapCard.from_mongo(doc) for doc in board_dict["in_progress"]],
        completed=[RoadmapCard.from_mongo(doc) for doc in board_dict["completed"]],
    )
    return success_response("Roadmap retrieved.", serialized.model_dump())
