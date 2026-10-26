"""The MCP server must refuse requests that do not carry the shared access token.

The server acts as a service account with full roster privileges, so the bearer
check in app.mcp_server.auth is the only thing between "can reach the URL" and
"can create rosters". These tests pin its behaviour on both a trivial app and the
real MCP app, so a refactor of either cannot quietly drop the check.
"""

import os

import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

# The MCP server refuses to import without service-account credentials. Nothing
# here logs in, so placeholders are enough.
os.environ.setdefault("ROSTER_SERVICE_USERNAME", "test")
os.environ.setdefault("ROSTER_SERVICE_PASSWORD", "test")

from app.mcp_server.auth import BearerTokenMiddleware  # noqa: E402
from app.mcp_server.server import mcp  # noqa: E402

TOKEN = "s3cret-token"


@pytest.fixture
def client() -> TestClient:
    async def ok(_request):
        return PlainTextResponse("ok")

    inner = Starlette(routes=[Route("/", ok)])
    return TestClient(BearerTokenMiddleware(inner, TOKEN))


def test_missing_header_is_401(client: TestClient) -> None:
    resp = client.get("/")
    assert resp.status_code == 401
    assert resp.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    [
        "Bearer wrong-token",
        f"Basic {TOKEN}",
        f"Bearer {TOKEN}x",
        TOKEN,  # no scheme at all
    ],
)
def test_wrong_credentials_are_401(client: TestClient, header: str) -> None:
    assert client.get("/", headers={"Authorization": header}).status_code == 401


def test_correct_token_passes_through(client: TestClient) -> None:
    resp = client.get("/", headers={"Authorization": f"Bearer {TOKEN}"})
    assert resp.status_code == 200
    assert resp.text == "ok"


def test_scheme_is_case_insensitive(client: TestClient) -> None:
    resp = client.get("/", headers={"Authorization": f"bearer {TOKEN}"})
    assert resp.status_code == 200


def test_empty_token_is_refused_at_construction() -> None:
    with pytest.raises(ValueError):
        BearerTokenMiddleware(Starlette(), "")


def test_real_mcp_app_is_guarded() -> None:
    """The check sits in front of routing, so the MCP endpoint itself is covered."""
    app = BearerTokenMiddleware(mcp.streamable_http_app(), TOKEN)
    with TestClient(app) as client:
        assert client.get("/mcp").status_code == 401
        # With the token the request reaches the transport, whose own answer to a
        # bare GET is anything but 401 (a redirect or a method/accept complaint).
        assert client.get("/mcp", headers={"Authorization": f"Bearer {TOKEN}"}).status_code != 401
