import functools
import os
from typing import Annotated, Awaitable, Callable, TypeVar

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from app.tooling import operations
from app.tooling.client import BackendError, RosterApiClient
from app.tooling.params import DESCRIPTIONS, CreateRosterParams, DemandSpec

from .token_manager import ServiceAuthError, ServiceTokenManager


ROSTER_API_URL = os.environ.get("ROSTER_API_URL", "http://backend:8000")

_SERVICE_USERNAME = os.environ.get("ROSTER_SERVICE_USERNAME")
_SERVICE_PASSWORD = os.environ.get("ROSTER_SERVICE_PASSWORD")
if not _SERVICE_USERNAME or not _SERVICE_PASSWORD:
    raise RuntimeError(
        "ROSTER_SERVICE_USERNAME and ROSTER_SERVICE_PASSWORD must be set — the MCP "
        "server authenticates to the backend with its own service account."
    )

mcp = FastMCP(
    name="roster-engine",
    instructions=(
        "Schedules new rosters for the roster-engine app. The server authenticates to "
        "the backend on your behalf — you do not send any credentials. "
        "Typical flow: list_profiles, list_skill_types, list_rosters (to find prior "
        "roster for chaining), list_leaves, then create_roster with inline demands, "
        "then get_roster_status to poll until status flips from 'running' to 'draft' or 'failed'."
    ),
    host="0.0.0.0",
    port=8000,
)

# One service-account token manager + API client, shared across all tool calls.
# The chat surface (app/chat) uses the same client with the caller's own JWT instead.
_token_manager = ServiceTokenManager(
    ROSTER_API_URL, _SERVICE_USERNAME, _SERVICE_PASSWORD
)
_api = RosterApiClient(
    ROSTER_API_URL,
    token_provider=_token_manager.get_token,
    on_unauthorized=_token_manager.invalidate,
)


T = TypeVar("T")


def _surface_errors(fn: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
    """Translate backend/auth failures into RuntimeErrors the MCP client can read."""

    @functools.wraps(fn)
    async def wrapper(*args, **kwargs) -> T:
        try:
            return await fn(*args, **kwargs)
        except BackendError as e:
            raise RuntimeError(operations.format_backend_error(e)) from e
        except ServiceAuthError as e:
            raise RuntimeError(str(e)) from e

    return wrapper


# Tool descriptions and parameter shapes come from app.tooling.params so this surface
# and the in-app chat stay in step; tests/test_tool_contract.py enforces that.


@mcp.tool(description=DESCRIPTIONS["list_profiles"])
@_surface_errors
async def list_profiles() -> list[dict]:
    return await operations.list_profiles(_api)


@mcp.tool(description=DESCRIPTIONS["list_skill_types"])
@_surface_errors
async def list_skill_types() -> list[dict]:
    return await operations.list_skill_types(_api)


@mcp.tool(description=DESCRIPTIONS["list_rosters"])
@_surface_errors
async def list_rosters(
    status: Annotated[
        str | None,
        Field(description="Filter by status: 'running', 'draft', 'failed', or 'approved'."),
    ] = None,
    profile_id: Annotated[int | None, Field(description="Filter by profile id.")] = None,
) -> list[dict]:
    return await operations.list_rosters(_api, status=status, profile_id=profile_id)


@mcp.tool(description=DESCRIPTIONS["list_leaves"])
@_surface_errors
async def list_leaves(
    from_date: Annotated[
        str | None, Field(description="ISO date YYYY-MM-DD lower bound (inclusive).")
    ] = None,
    to_date: Annotated[
        str | None, Field(description="ISO date YYYY-MM-DD upper bound (inclusive).")
    ] = None,
    staff_id: Annotated[
        int | None, Field(description="Optional filter to a single staff member.")
    ] = None,
) -> list[dict]:
    return await operations.list_leaves(
        _api, from_date=from_date, to_date=to_date, staff_id=staff_id
    )


@mcp.tool(description=DESCRIPTIONS["create_roster"])
@_surface_errors
async def create_roster(
    profile_id: Annotated[int, Field(description="Profile id from list_profiles.")],
    name: Annotated[str, Field(description="Human-readable roster name shown in the UI.")],
    roster_start: Annotated[str, Field(description="ISO date YYYY-MM-DD of day 0.")],
    num_days: Annotated[int, Field(ge=1, description="Number of days in the roster window.")],
    target_work_hours: Annotated[
        float,
        Field(gt=0, description="Target working hours per staff over the roster window."),
    ],
    demands: Annotated[
        list[DemandSpec],
        Field(
            min_length=1,
            description=(
                "Per-day demand rows. Each row is one shift window with required headcount. "
                "Multiple rows on the same date are allowed (e.g. morning + night)."
            ),
        ),
    ],
    previous_roster_id: Annotated[
        int | None,
        Field(
            default=None,
            description=(
                "Optional. Pass the id of the approved roster that ends the day before "
                "roster_start to chain conditional constraints across rosters."
            ),
        ),
    ] = None,
) -> dict:
    return await operations.create_roster(
        _api,
        CreateRosterParams(
            profile_id=profile_id,
            name=name,
            roster_start=roster_start,
            num_days=num_days,
            target_work_hours=target_work_hours,
            demands=demands,
            previous_roster_id=previous_roster_id,
        ),
    )


@mcp.tool(description=DESCRIPTIONS["get_roster_status"])
@_surface_errors
async def get_roster_status(
    roster_id: Annotated[int, Field(description="Roster id returned by create_roster.")],
) -> dict:
    return await operations.get_roster_status(_api, roster_id)
