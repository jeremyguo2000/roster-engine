import os
from typing import Annotated, Any

from mcp.server.fastmcp import Context, FastMCP
from pydantic import BaseModel, Field

from .client import BackendError, RosterApiClient


ROSTER_API_URL = os.environ.get("ROSTER_API_URL", "http://backend:8000")

mcp = FastMCP(
    name="roster-engine",
    instructions=(
        "Schedules new rosters for the roster-engine app. "
        "Pass the user's JWT as Authorization: Bearer <token> on the MCP HTTP request. "
        "Typical flow: list_profiles, list_skill_types, list_rosters (to find prior "
        "roster for chaining), list_leaves, then create_roster with inline demands, "
        "then get_roster_status to poll until status flips from 'running' to 'draft' or 'failed'."
    ),
    host="0.0.0.0",
    port=8000,
)


class DemandSpec(BaseModel):
    date: str = Field(description="ISO date YYYY-MM-DD")
    start_min: int = Field(
        ge=0,
        lt=1440,
        description="Shift start, minutes from midnight (e.g. 09:00 = 540)",
    )
    end_min: int = Field(
        ge=0,
        lt=1440,
        description="Shift end, minutes from midnight. May be <= start_min for overnight shifts",
    )
    headcount: int = Field(ge=1, description="Number of staff required for this demand window")
    skill_value_id: int | None = Field(
        default=None,
        description="Optional skill filter. Use null/omit for 'any skill'. "
        "Look up valid IDs from list_skill_types.",
    )


def _extract_jwt(ctx: Context) -> str:
    """Pull Bearer token off the inbound HTTP request that triggered this tool call."""
    request = ctx.request_context.request
    if request is None:
        raise ValueError(
            "MCP tool called without an HTTP request context — Bearer token unavailable."
        )
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise ValueError(
            "Missing Authorization: Bearer <jwt> header on the MCP request. "
            "Obtain a token via POST /api/auth/login against the backend first."
        )
    return auth.split(" ", 1)[1].strip()


def _client(ctx: Context) -> RosterApiClient:
    return RosterApiClient(ROSTER_API_URL, _extract_jwt(ctx))


def _format_backend_error(exc: BackendError) -> str:
    detail = exc.detail
    if isinstance(detail, dict) and "detail" in detail:
        detail = detail["detail"]
    return f"Backend returned {exc.status_code}: {detail}"


@mcp.tool()
async def list_profiles(ctx: Context) -> list[dict]:
    """List every roster profile. Use the returned `id` as `profile_id` when calling create_roster."""
    try:
        async with _client(ctx) as c:
            return await c.list_profiles()
    except BackendError as e:
        raise RuntimeError(_format_backend_error(e)) from e


@mcp.tool()
async def list_skill_types(ctx: Context) -> list[dict]:
    """List skill types with their nested skill values. Use a value's `id` as `skill_value_id` on a demand to require that specific skill."""
    try:
        async with _client(ctx) as c:
            return await c.list_skill_types()
    except BackendError as e:
        raise RuntimeError(_format_backend_error(e)) from e


@mcp.tool()
async def list_rosters(
    ctx: Context,
    status: Annotated[
        str | None,
        Field(description="Filter by status: 'running', 'draft', 'failed', or 'approved'."),
    ] = None,
    profile_id: Annotated[int | None, Field(description="Filter by profile id.")] = None,
) -> list[dict]:
    """List recent rosters. Use this to find an approved roster that ends the day before your new roster_start so you can pass its id as `previous_roster_id` for cross-roster constraint chaining."""
    try:
        async with _client(ctx) as c:
            return await c.list_rosters(status=status, profile_id=profile_id)
    except BackendError as e:
        raise RuntimeError(_format_backend_error(e)) from e


@mcp.tool()
async def list_leaves(
    ctx: Context,
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
    """Preview staff leaves that fall inside a date window. Read-only — call this before create_roster to warn the user about reduced availability."""
    try:
        async with _client(ctx) as c:
            return await c.list_leaves(
                from_date=from_date, to_date=to_date, staff_id=staff_id
            )
    except BackendError as e:
        raise RuntimeError(_format_backend_error(e)) from e


@mcp.tool()
async def create_roster(
    ctx: Context,
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
    """Dispatch a new roster to the solver. Creates each demand row, then submits the roster. Returns the roster immediately with status='running' and a celery_task_id; poll get_roster_status until status flips to 'draft' (success) or 'failed'."""
    try:
        async with _client(ctx) as c:
            demand_ids: list[int] = []
            for d in demands:
                created = await c.create_demand(
                    {
                        "date": d.date,
                        "start_min": d.start_min,
                        "end_min": d.end_min,
                        "headcount": d.headcount,
                        "skill_value_id": d.skill_value_id,
                    }
                )
                demand_ids.append(created["id"])

            payload: dict[str, Any] = {
                "profile_id": profile_id,
                "name": name,
                "roster_start": roster_start,
                "num_days": num_days,
                "target_work_min": round(target_work_hours * 60),
                "demand_ids": demand_ids,
                "previous_roster_id": previous_roster_id,
            }
            return await c.create_roster(payload)
    except BackendError as e:
        raise RuntimeError(_format_backend_error(e)) from e


@mcp.tool()
async def get_roster_status(
    ctx: Context,
    roster_id: Annotated[int, Field(description="Roster id returned by create_roster.")],
) -> dict:
    """Fetch the current state of a roster. Poll this every few seconds after create_roster until status is no longer 'running'. When status='draft', the `result` field holds the solver output; when status='failed', `result.error` holds the message."""
    try:
        async with _client(ctx) as c:
            return await c.get_roster(roster_id)
    except BackendError as e:
        raise RuntimeError(_format_backend_error(e)) from e
