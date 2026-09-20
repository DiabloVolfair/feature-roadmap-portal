"""Unit tests for Settings validation (backend/app/core/config.py).

Asserts that unsetting/blanking each required environment variable causes
constructing Settings() to raise a pydantic ValidationError at startup.

Requirements: 1.4, 9.5
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings

# A complete set of valid values for every required field, used as the
# baseline that each test overrides one field of.
VALID_ENV = {
    "project_name": "Feature Roadmap Portal",
    "api_prefix": "/api/v1",
    "mongodb_uri": "mongodb://localhost:27017",
    "database_name": "test_db",
    "jwt_secret": "test-secret",
    "jwt_refresh_secret": "test-refresh-secret",
    "frontend_url": "http://localhost:5173",
}

REQUIRED_FIELDS = [
    "project_name",
    "api_prefix",
    "mongodb_uri",
    "database_name",
    "jwt_secret",
    "jwt_refresh_secret",
    "frontend_url",
]

# Fields that additionally reject empty/whitespace-only values, not just
# unset values (Requirement 1.4).
BLANK_VALIDATED_FIELDS = ["project_name", "api_prefix"]

# Sprint 1B optional fields and the default each takes when its environment
# variable is unset (Requirements 1.1, 1.2, 1.3).
OPTIONAL_FIELD_DEFAULTS = {
    "email_verification_expire_hours": 24,
    "password_reset_expire_minutes": 30,
    "app_env": "production",
}

# (field, env value to set, expected parsed value) for each optional field
# when explicitly configured (Requirements 1.1, 1.2, 1.3).
OPTIONAL_FIELD_OVERRIDES = [
    ("email_verification_expire_hours", "48", 48),
    ("password_reset_expire_minutes", "60", 60),
    ("app_env", "development", "development"),
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


@pytest.mark.parametrize("blank_field", BLANK_VALIDATED_FIELDS)
@pytest.mark.parametrize("blank_value", ["", "   ", "\t\n"])
def test_settings_raises_validation_error_when_field_is_empty_or_whitespace(
    blank_field, blank_value, monkeypatch
):
    """Setting PROJECT_NAME/API_PREFIX to an empty or whitespace-only string
    raises a pydantic ValidationError naming the affected field (Requirement
    1.4)."""
    for field, value in VALID_ENV.items():
        monkeypatch.setenv(field.upper(), value)
    monkeypatch.setenv(blank_field.upper(), blank_value)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    assert blank_field in str(exc_info.value)


def test_settings_raises_validation_error_naming_both_fields_when_both_blank(
    monkeypatch,
):
    """When both PROJECT_NAME and API_PREFIX are unset/blank, the raised
    ValidationError identifies both affected variable names (Requirement
    1.4)."""
    for field, value in VALID_ENV.items():
        monkeypatch.setenv(field.upper(), value)
    monkeypatch.setenv("PROJECT_NAME", "   ")
    monkeypatch.delenv("API_PREFIX", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    error_text = str(exc_info.value)
    assert "project_name" in error_text
    assert "api_prefix" in error_text


@pytest.mark.parametrize(
    "project_name,api_prefix",
    [
        ("Feature Roadmap Portal", "/api/v1"),
        ("  Feature Roadmap Portal  ", "  /api/v1  "),
    ],
)
def test_settings_loads_valid_project_name_and_api_prefix(
    project_name, api_prefix, monkeypatch
):
    """Valid (including surrounding-whitespace) PROJECT_NAME/API_PREFIX
    values load successfully and are stripped."""
    for field, value in VALID_ENV.items():
        monkeypatch.setenv(field.upper(), value)
    monkeypatch.setenv("PROJECT_NAME", project_name)
    monkeypatch.setenv("API_PREFIX", api_prefix)

    settings = Settings(_env_file=None)

    assert settings.project_name == project_name.strip()
    assert settings.api_prefix == api_prefix.strip()


@pytest.mark.parametrize(
    "optional_field,expected_default", OPTIONAL_FIELD_DEFAULTS.items()
)
def test_settings_defaults_optional_field_when_unset(
    optional_field, expected_default, monkeypatch
):
    """When its environment variable is unset, each Sprint 1B optional field
    (email_verification_expire_hours, password_reset_expire_minutes,
    app_env) defaults correctly (Requirements 1.1, 1.2, 1.3)."""
    for field, value in VALID_ENV.items():
        monkeypatch.setenv(field.upper(), value)
    for field in OPTIONAL_FIELD_DEFAULTS:
        monkeypatch.delenv(field.upper(), raising=False)

    settings = Settings(_env_file=None)

    assert getattr(settings, optional_field) == expected_default


@pytest.mark.parametrize(
    "optional_field,env_value,expected_value", OPTIONAL_FIELD_OVERRIDES
)
def test_settings_loads_optional_field_when_set(
    optional_field, env_value, expected_value, monkeypatch
):
    """When explicitly set via its environment variable, each Sprint 1B
    optional field loads the given value correctly (Requirements 1.1, 1.2,
    1.3)."""
    for field, value in VALID_ENV.items():
        monkeypatch.setenv(field.upper(), value)
    monkeypatch.setenv(optional_field.upper(), env_value)

    settings = Settings(_env_file=None)

    assert getattr(settings, optional_field) == expected_value
