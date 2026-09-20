"""Comment_API routes.

Follows the `features.py` pattern: a bare `APIRouter(prefix="/comments")`,
thin `async def` route handlers, everything delegated to `comment_service`
(business logic) or the auth dependencies. No route here contains inline
exception handling, authorization logic, or a direct database query —
every failure branch is produced by letting `comment_service` raise a
`FeatureException` subclass, which `main.py`'s exception handler translates
to the `error_response()` envelope.

Requirements: 5.4, 5.6, 7.1, 7.5, 8.1, 8.6
"""

from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user, require_verified_user
from app.models.comment import CommentCreate, CommentResponse, CommentUpdate
from app.services import comment_service
from app.utils.responses import success_response

router = APIRouter(prefix="/comments")


@router.post("/{comment_id}/reply", status_code=201)
async def reply_to_comment_route(
    comment_id: str,
    body: CommentCreate,
    current_user: dict = Depends(require_verified_user),
) -> dict:
    doc = await comment_service.reply_to_comment(body, comment_id, current_user)
    return success_response("Reply posted.", CommentResponse.from_mongo(doc).model_dump())


@router.patch("/{comment_id}", status_code=200)
async def update_comment_route(
    comment_id: str,
    body: CommentUpdate,
    current_user: dict = Depends(get_current_user),
) -> dict:
    doc = await comment_service.update_comment(comment_id, body, current_user)
    return success_response("Comment updated.", CommentResponse.from_mongo(doc).model_dump())


@router.delete("/{comment_id}", status_code=200)
async def delete_comment_route(
    comment_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    doc = await comment_service.delete_comment(comment_id, current_user)
    return success_response("Comment deleted.", CommentResponse.from_mongo(doc).model_dump())
