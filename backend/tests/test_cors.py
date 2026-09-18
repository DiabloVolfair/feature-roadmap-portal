"""Property-based test for the CORS allow/deny decision.

Requirements: 7.3, 7.4, 7.5
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given, settings as hyp_settings, strategies as st

from app.core import cors as cors_module
from app.core.cors import configure_cors

FRONTEND_URL = "http://localhost:5173"


def _build_client(frontend_url):
    """Build a TestClient for a fresh app with CORS configured for frontend_url.

    Temporarily overrides the module-level `settings.frontend_url` while
    `configure_cors` builds its allow-list, then restores the original value.
    The allow-list is baked into the middleware at `add_middleware` time, so
    the override only needs to be active during app construction.
    """
    original = cors_module.settings.frontend_url
    cors_module.settings.frontend_url = frontend_url
    try:
        app = FastAPI()
        configure_cors(app)

        @app.get("/probe")
        async def probe():
            return {"ok": True}
    finally:
        cors_module.settings.frontend_url = original
    return TestClient(app)


# App configured with a fixed, non-empty FRONTEND_URL.
configured_client = _build_client(FRONTEND_URL)

# App configured with an unset/empty FRONTEND_URL.
unset_client = _build_client("")

# Strategy: arbitrary Origin header values, including the exact configured
# origin, near-miss variants, an unrelated origin, and "" (treated below as
# "no Origin header sent").
origin_values = st.one_of(
    st.just(FRONTEND_URL),
    st.sampled_from(
        [
            "http://evil.com",
            "https://localhost:5173",  # different scheme
            "http://localhost:5174",  # different port
            "http://localhost:5173/",  # trailing slash
            "null",
            "",
        ]
    ),
    st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126),
        min_size=0,
        max_size=40,
    ),
)


# Feature: sprint-0-foundation-setup, Property 3: CORS allow/deny matches configured origin exactly
@given(origin=origin_values)
@hyp_settings(max_examples=100)
def test_cors_allow_matches_configured_origin_exactly(origin):
    """With FRONTEND_URL configured, CORS is granted iff Origin == FRONTEND_URL."""
    headers = {"Origin": origin} if origin else {}
    response = configured_client.get("/probe", headers=headers)

    allow_origin = response.headers.get("access-control-allow-origin")
    if origin and origin == FRONTEND_URL:
        assert allow_origin == FRONTEND_URL
    else:
        assert allow_origin is None


# Feature: sprint-0-foundation-setup, Property 3: CORS allow/deny matches configured origin exactly
@given(origin=origin_values)
@hyp_settings(max_examples=100)
def test_cors_denies_all_origins_when_frontend_url_unset(origin):
    """With FRONTEND_URL unset/empty, no origin is ever granted CORS access."""
    headers = {"Origin": origin} if origin else {}
    response = unset_client.get("/probe", headers=headers)

    assert response.headers.get("access-control-allow-origin") is None
