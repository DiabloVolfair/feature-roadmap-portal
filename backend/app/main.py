"""Backend application entry point.

Creates the single FastAPI() application instance for the Backend_Application
(Requirement 5.2), wires the MongoDB connection lifecycle into an
asynccontextmanager lifespan (Requirements 8.3-8.8), registers CORS, mounts
the versioned API router under /api/v1 (Requirement 5.4), and registers
exception handlers that normalize errors into the error_response() envelope
(Requirements 7.2, 6.4).
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from app.api.v1 import api_router
from app.core.cors import configure_cors
from app.core.exceptions import AuthException, FeatureException
from app.db.mongodb import close_mongo_connection, connect_to_mongo
from app.services import feature_service
from app.utils.responses import error_response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to MongoDB on startup and close the connection on shutdown."""
    await connect_to_mongo()
    await feature_service.ensure_indexes()
    yield
    await close_mongo_connection()


app = FastAPI(lifespan=lifespan)
configure_cors(app)
app.include_router(api_router, prefix="/api/v1")


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Translate Pydantic request validation errors into the error envelope."""
    return JSONResponse(
        status_code=422,
        content=error_response(
            message="Validation failed.",
            errors=[str(e["msg"]) for e in exc.errors()],
        ),
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Translate raised HTTPExceptions (e.g. 404, 405) into the error envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(
            message=str(exc.detail),
            errors=[str(exc.detail)],
        ),
    )


@app.exception_handler(AuthException)
async def auth_exception_handler(request: Request, exc: AuthException) -> JSONResponse:
    """Translate any AuthException subclass into the error envelope (Req 18.8)."""
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(
            message=exc.message,
            errors=exc.errors,
        ),
    )


@app.exception_handler(FeatureException)
async def feature_exception_handler(request: Request, exc: FeatureException) -> JSONResponse:
    """Translate any FeatureException subclass into the error envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(
            message=exc.message,
            errors=exc.errors,
        ),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler translating any unexpected exception into a 500 envelope."""
    return JSONResponse(
        status_code=500,
        content=error_response(
            message="An unexpected error occurred.",
            errors=[str(exc)],
        ),
    )
