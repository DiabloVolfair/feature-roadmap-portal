"""Feature_API routes.

Follows the `auth.py` pattern: a bare `APIRouter(prefix="/features")`, thin
`async def` route handlers, everything delegated to `Feature_Service`
(business logic) or `get_current_user` (Auth_Middleware). No route here
contains inline exception handling, authorization logic, or a direct
database query (Req 27.1, 27.2, 27.3) - every failure branch is produced by
letting `Feature_Service`/`get_current_user` raise a `FeatureException` or
`AuthException` subclass, which `main.py`'s exception handlers translate to
the `error_response()` envelope. The sole exception is `get_feature_route`'s
not-found check, which is inline because `find_by_id`'s contract is "return
`None` on no match" rather than raising.

Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12,
6.13, 7.1, 7.2, 7.3, 8.3, 9.4, 27.1, 27.2, 27.3
"""

from math import ceil

from fastapi import APIRouter, Depends, Query

from app.core.exceptions import FeatureNotFoundException
from app.middleware.auth import get_current_user
from app.models.feature import (
    FeatureCategory,
    FeatureCreate,
    FeatureFeedResponse,
    FeatureResponse,
    FeatureSort,
    FeatureStatus,
    FeatureUpdate,
    PaginatedFeatureResponse,
    PaginationMeta,
)
from app.services import feature_service
from app.utils.responses import success_response

router = APIRouter(prefix="/features")


@router.post("", status_code=201)
async def create_feature_route(
    body: FeatureCreate, current_user: dict = Depends(get_current_user)
) -> dict:
    doc = await feature_service.create_feature(body, str(current_user["_id"]), current_user["name"])
    return success_response("Feature request created.", FeatureResponse.from_mongo(doc).model_dump())


@router.get("")
async def feed_route(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    category: list[FeatureCategory] = Query([]),
    status: list[FeatureStatus] = Query([]),
    sort: FeatureSort = Query("newest"),
    search: str | None = Query(None),
) -> dict:
    items, total = await feature_service.get_feed(page, limit, category, status, sort, search)
    total_pages = ceil(total / limit) if total else 0
    pagination = PaginationMeta(
        page=page, limit=limit, total_items=total, total_pages=total_pages,
        has_next=page < total_pages, has_previous=page > 1,
    )
    body = PaginatedFeatureResponse(
        items=[FeatureFeedResponse.from_mongo(doc) for doc in items], pagination=pagination
    )
    return success_response("Feed retrieved.", body.model_dump())


@router.get("/{feature_id}")
async def get_feature_route(feature_id: str) -> dict:
    feature = await feature_service.find_by_id(feature_id)
    if feature is None:
        raise FeatureNotFoundException("Feature request not found.")
    return success_response("Feature retrieved.", FeatureResponse.from_mongo(feature).model_dump())


@router.patch("/{feature_id}")
async def update_feature_route(
    feature_id: str, body: FeatureUpdate, current_user: dict = Depends(get_current_user)
) -> dict:
    doc = await feature_service.update_feature(feature_id, body, current_user)
    return success_response("Feature request updated.", FeatureResponse.from_mongo(doc).model_dump())


@router.delete("/{feature_id}")
async def delete_feature_route(
    feature_id: str, current_user: dict = Depends(get_current_user)
) -> dict:
    await feature_service.delete_feature(feature_id, current_user)
    return success_response("Feature request deleted.")
