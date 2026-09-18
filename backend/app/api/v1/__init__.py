"""Aggregates all v1 API routers.

The application factory in app/main.py mounts api_router under the
/api/v1 prefix.

Requirements: 5.4, 5.5, 5.6, 5.7
"""

from fastapi import APIRouter

from app.api.v1 import auth, health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
