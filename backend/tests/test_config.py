"""Unit tests for Settings validation (backend/app/core/config.py).

Asserts that unsetting/blanking each required environment variable causes
constructing Settings() to raise a pydantic ValidationError at startup.

Requirements: 9.5
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

# A complete set of valid values for every required field, used as the
# baseline that each test overrides one field of.
VALID_ENV = {
    "mongodb_uri": "mongodb://localhost:27017",
    "database_name": "test_db",
    "jwt_secret": "test-secret",
    "jwt_refresh_secret": "test-refresh-secret",
    "frontend_url": "http://localhost:5173",
}

REQUIRED_FIELDS = [
    "mongodb_uri",
    "database_name",
    "jwt_secret",
    "jwt_refresh_secret",
    "frontend_url",
]


def test_settings_constructs_successfully_with_all_required_fields_present():
    """Sanity check: Settings() succeeds when every required field is set."""
    settings = Settings(**VALID_ENV, _env_file=None)

    for field, value in VALID_ENV.items():
        assert getattr(settings, field) == value


@pytest.mark.parametrize("missing_field", REQUIRED_FIELDS)
def test_settings_raises_validation_error_when_required_field_is_unset(
    missing_field, monkeypatch
):
    """Unsetting a required field (via env vars, bypassing constructor
    kwargs and any local .env file) raises a pydantic ValidationError
    naming the missing field."""
    for field, value in VALID_ENV.items():
        monkeypatch.setenv(field.upper(), value)
    monkeypatch.delenv(missing_field.upper(), raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    assert missing_field in str(exc_info.value)
