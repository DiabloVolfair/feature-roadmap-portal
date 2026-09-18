"""CORS configuration for the Backend_Application.

Registers CORSMiddleware with an allow-list built from the FRONTEND_URL
environment variable. When FRONTEND_URL is unset/empty, the allow-list is
empty, which causes Starlette's CORSMiddleware to deny cross-origin access
from any origin (Requirements 7.3, 7.4, 7.5).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


def configure_cors(app: FastAPI) -> None:
    """Register CORS middleware on the given FastAPI app."""
    allowed_origins = [settings.frontend_url] if settings.frontend_url else []
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=True,
    )
