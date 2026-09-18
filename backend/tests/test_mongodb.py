"""Unit tests for the Database_Connector (backend/app/db/mongodb.py).

Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import app.db.mongodb as mongodb_module


@pytest.fixture(autouse=True)
def reset_mongodb_globals():
    """Reset the module-level client/db globals before and after each test.

    connect_to_mongo()/close_mongo_connection() mutate module-level globals,
    so tests must not leak state into one another.
    """
    original_client = mongodb_module.client
    original_db = mongodb_module.db
    mongodb_module.client = None
    mongodb_module.db = None
    yield
    mongodb_module.client = original_client
    mongodb_module.db = original_db


def _make_mock_client() -> MagicMock:
    """Build a MagicMock standing in for AsyncIOMotorClient, with an
    awaitable admin.command("ping")."""
    mock_client = MagicMock()
    mock_client.admin.command = AsyncMock(return_value={"ok": 1})
    return mock_client


def test_connect_to_mongo_pings_once_and_sets_db():
    """A successful connection attempt pings exactly once and sets `db`."""
    mock_client = _make_mock_client()

    with patch.object(
        mongodb_module, "AsyncIOMotorClient", return_value=mock_client
    ) as mock_ctor:
        asyncio.run(mongodb_module.connect_to_mongo())

    mock_ctor.assert_called_once()
    mock_client.admin.command.assert_awaited_once_with("ping")
    assert mongodb_module.client is mock_client
    assert mongodb_module.db is not None


def test_connect_to_mongo_raises_and_does_not_set_db_on_ping_failure():
    """If the ping fails, connect_to_mongo re-raises and leaves `db` unset."""
    mock_client = MagicMock()
    mock_client.admin.command = AsyncMock(side_effect=Exception("connection refused"))

    with patch.object(mongodb_module, "AsyncIOMotorClient", return_value=mock_client):
        with pytest.raises(Exception, match="connection refused"):
            asyncio.run(mongodb_module.connect_to_mongo())

    mock_client.admin.command.assert_awaited_once_with("ping")
    assert mongodb_module.db is None


@pytest.mark.parametrize(
    "missing_field",
    ["mongodb_uri", "database_name"],
)
def test_connect_to_mongo_raises_without_connecting_when_config_missing(missing_field):
    """Missing MONGODB_URI/DATABASE_NAME raises RuntimeError without ever
    attempting to construct a client."""
    with patch.object(mongodb_module.settings, "mongodb_uri", "test-uri"), \
         patch.object(mongodb_module.settings, "database_name", "test_db"), \
         patch.object(mongodb_module.settings, missing_field, ""), \
         patch.object(mongodb_module, "AsyncIOMotorClient") as mock_ctor:
        with pytest.raises(RuntimeError, match="MONGODB_URI/DATABASE_NAME not configured"):
            asyncio.run(mongodb_module.connect_to_mongo())

    mock_ctor.assert_not_called()
    assert mongodb_module.client is None
    assert mongodb_module.db is None


def test_close_mongo_connection_calls_client_close_once():
    """close_mongo_connection() calls client.close() exactly once when a
    client is present."""
    mock_client = MagicMock()
    mongodb_module.client = mock_client

    asyncio.run(mongodb_module.close_mongo_connection())

    mock_client.close.assert_called_once()


def test_close_mongo_connection_is_noop_when_no_client():
    """close_mongo_connection() does nothing (and does not raise) when no
    client was ever established."""
    mongodb_module.client = None

    asyncio.run(mongodb_module.close_mongo_connection())
