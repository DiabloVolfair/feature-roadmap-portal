"""MongoDB Atlas connection lifecycle (Database_Connector).

Manages a single module-level Motor client, created on application startup
and closed on shutdown. Does not create any collections, indexes, or
documents (Requirement 8.9).
"""

import logging

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

logger = logging.getLogger(__name__)

client: AsyncIOMotorClient | None = None
db = None


async def connect_to_mongo() -> None:
    """Establish the MongoDB Atlas connection and verify connectivity.

    Reads MONGODB_URI/DATABASE_NAME from settings, logs and raises a
    RuntimeError if either is missing, then creates the Motor client and
    confirms connectivity with an admin.command("ping") within 10 seconds.
    """
    global client, db

    if not settings.mongodb_uri or not settings.database_name:
        logger.error(
            "Missing MONGODB_URI or DATABASE_NAME; skipping database connection."
        )
        raise RuntimeError("MONGODB_URI/DATABASE_NAME not configured")

    client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000)
    try:
        await client.admin.command("ping")
    except Exception as exc:
        logger.error(f"MongoDB connection failed: {exc}")
        raise

    db = client[settings.database_name]
    logger.info("MongoDB connection established.")


async def close_mongo_connection() -> None:
    """Close the MongoDB connection if it was opened, logging confirmation."""
    if client is not None:
        client.close()
        logger.info("MongoDB connection closed.")
