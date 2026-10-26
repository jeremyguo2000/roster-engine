"""Inbound authentication for the MCP server.

The server logs in to the backend with its own service account, so whoever can
reach its URL acts with that account's full privileges. This middleware makes
callers prove they are allowed to, by sending a shared access token on every
request:

    Authorization: Bearer <MCP_ACCESS_TOKEN>

Anything else gets a 401 before the request reaches the MCP transport.

It is one static token compared in constant time, deliberately not OAuth.
FastMCP's built-in `token_verifier` path advertises OAuth protected-resource
metadata on 401, which sends clients off to discover an authorization server
this deployment does not have. A plain bearer header is something every
Streamable HTTP client (Claude Code, OpenClaw, an AgentCore Gateway target)
can be configured to send, and it composes with a per-user identity scheme
later (see identity.py).
"""

import secrets

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class BearerTokenMiddleware:
    """Pure ASGI middleware: reject HTTP requests without the expected bearer token."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        if not token:
            raise ValueError("BearerTokenMiddleware needs a non-empty token")
        self._app = app
        self._token = token.encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Lifespan events carry no headers and must always pass through.
        if scope["type"] != "http" or self._authorized(Headers(scope=scope)):
            await self._app(scope, receive, send)
            return
        response = JSONResponse(
            {"detail": "Missing or invalid bearer token"},
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
        )
        await response(scope, receive, send)

    def _authorized(self, headers: Headers) -> bool:
        scheme, _, credentials = headers.get("authorization", "").partition(" ")
        return scheme.lower() == "bearer" and secrets.compare_digest(
            credentials.strip().encode(), self._token
        )
