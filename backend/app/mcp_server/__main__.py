"""Entry point: `python -m app.mcp_server`.

Does what `FastMCP.run(transport="streamable-http")` does, with the inbound
bearer check from auth.py wrapped around the ASGI app. FastMCP has no hook for
plain middleware, so uvicorn is started here instead.
"""

import os

import uvicorn

from .auth import BearerTokenMiddleware
from .server import mcp


def main() -> None:
    token = os.environ.get("MCP_ACCESS_TOKEN")
    if not token:
        raise RuntimeError(
            "MCP_ACCESS_TOKEN must be set — every MCP client presents it as "
            "`Authorization: Bearer <token>`. The server acts as a shared service "
            "account, so without it anyone who can reach the URL can act as that account."
        )
    app = BearerTokenMiddleware(mcp.streamable_http_app(), token)
    uvicorn.run(
        app,
        host=mcp.settings.host,
        port=mcp.settings.port,
        log_level=mcp.settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
