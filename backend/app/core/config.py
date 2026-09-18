"""Backend application configuration.

Defines the Settings schema loaded from environment variables (and a local
.env file) via pydantic-settings. All fields except access_token_expire_minutes
and refresh_token_expire_days are required; a missing or invalid required
field raises a pydantic ValidationError at import time, which causes the
application to fail to start (Requirements 9.4, 9.5).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration for the Backend_Application."""

    mongodb_uri: str
    database_name: str
    jwt_secret: str
    jwt_refresh_secret: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    frontend_url: str

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
