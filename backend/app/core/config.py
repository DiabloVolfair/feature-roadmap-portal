"""Backend application configuration.

Defines the Settings schema loaded from environment variables (and a local
.env file) via pydantic-settings. All fields except access_token_expire_minutes
and refresh_token_expire_days are required; a missing or invalid required
field raises a pydantic ValidationError at import time, which causes the
application to fail to start (Requirements 9.4, 9.5).
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration for the Backend_Application."""

    project_name: str
    api_prefix: str
    mongodb_uri: str
    database_name: str
    jwt_secret: str
    jwt_refresh_secret: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    frontend_url: str
    email_verification_expire_hours: int = 24
    password_reset_expire_minutes: int = 30
    app_env: str = "production"

    model_config = SettingsConfigDict(env_file=".env")

    @field_validator("project_name", "api_prefix")
    @classmethod
    def _not_blank(cls, v: str, info) -> str:
        """Reject empty or whitespace-only values (Requirements 1.1, 1.2, 1.4).

        pydantic's built-in `str_strip_whitespace` is not enabled by default,
        so a value of e.g. " " would otherwise pass a naive "is set" check.
        """
        if not v or not v.strip():
            raise ValueError(
                f"{info.field_name} must not be empty or whitespace-only"
            )
        return v.strip()


settings = Settings()
