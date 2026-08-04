"""Tool behaviour, shared by both surfaces.

The MCP server and the chat endpoint call these; neither reimplements the logic.
Functions take already-validated arguments and return JSON-serializable results.
Auth and transport are the caller's concern, via the `RosterApiClient` passed in.
"""

from typing import Any

from .client import BackendError, RosterApiClient
from .params import CreateRosterParams


def format_backend_error(exc: BackendError) -> str:
    detail = exc.detail
    if isinstance(detail, dict) and "detail" in detail:
        detail = detail["detail"]
    return f"Backend returned {exc.status_code}: {detail}"


async def list_profiles(client: RosterApiClient) -> list[dict]:
    return await client.list_profiles()


async def list_skill_types(client: RosterApiClient) -> list[dict]:
    return await client.list_skill_types()


async def list_rosters(
    client: RosterApiClient,
    status: str | None = None,
    profile_id: int | None = None,
) -> list[dict]:
    return await client.list_rosters(status=status, profile_id=profile_id)


async def list_leaves(
    client: RosterApiClient,
    from_date: str | None = None,
    to_date: str | None = None,
    staff_id: int | None = None,
) -> list[dict]:
    return await client.list_leaves(
        from_date=from_date, to_date=to_date, staff_id=staff_id
    )


async def create_roster(client: RosterApiClient, params: CreateRosterParams) -> dict:
    """Submit a roster with its demands in a single request.

    The demands ride along inline so the backend creates them in the same
    transaction as the roster — a failure anywhere leaves nothing behind.
    """
    payload: dict[str, Any] = {
        "profile_id": params.profile_id,
        "name": params.name,
        "roster_start": params.roster_start,
        "num_days": params.num_days,
        "target_work_min": round(params.target_work_hours * 60),
        "demands": [d.model_dump() for d in params.demands],
        "previous_roster_id": params.previous_roster_id,
    }
    return await client.create_roster(payload)


async def get_roster_status(client: RosterApiClient, roster_id: int) -> dict:
    return await client.get_roster(roster_id)
