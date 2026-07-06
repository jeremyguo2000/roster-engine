from typing import Any

from .token_manager import ServiceTokenManager


async def resolve_token(token_manager: ServiceTokenManager, ctx: Any = None) -> str:
    """Decide which bearer token to use for a tool's backend calls.

    Today: always the shared service-account token, so the agent never supplies a
    credential. `ctx` is accepted but unused.

    Multi-user seam (future): plumb the inbound request `ctx` through to here, read a
    trusted end-user id off it, and return that user's per-user token instead, e.g.

        user = ctx.request_context.request.headers.get("x-roster-user")
        if user:
            return await _per_user_managers[user].get_token()

    IMPORTANT: such a header must be stamped by a trusted upstream (the harness),
    never trusted from the sandboxed agent itself.
    """
    return await token_manager.get_token()
