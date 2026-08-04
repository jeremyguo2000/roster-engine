"""Tool parameter definitions — the single source of truth for both tool surfaces.

Each tool's inputs are declared once here as a Pydantic model, with its description
in `Field(description=...)`. The two surfaces consume this differently:

- `app.chat.tools` derives its Anthropic `input_schema` directly via
  `model_json_schema()` — no hand-written JSON.
- `app.mcp_server.server` keeps flattened typed parameters (FastMCP nests a
  model-typed parameter under a `$ref`, which would change its wire shape), so it
  restates the signature but imports the descriptions from `DESCRIPTIONS` below.

`tests/test_tool_contract.py` asserts the two schemas stay identical, so a param
added to one surface and not the other fails CI rather than drifting silently.
"""

from pydantic import BaseModel, Field

# Tool-level descriptions. Imported by both surfaces — MCP passes them to
# `@mcp.tool(description=...)` (a docstring can't be used, it must be a literal),
# chat embeds them in its tool dicts.
DESCRIPTIONS: dict[str, str] = {
    "list_profiles": (
        "List every roster profile. Use the returned `id` as `profile_id` when "
        "calling create_roster."
    ),
    "list_skill_types": (
        "List skill types with their nested skill values. Use a value's `id` as "
        "`skill_value_id` on a demand to require that specific skill."
    ),
    "list_rosters": (
        "List recent rosters. Use this to find an approved roster that ends the day "
        "before your new roster_start so you can pass its id as `previous_roster_id` "
        "for cross-roster constraint chaining."
    ),
    "list_leaves": (
        "Preview staff leaves that fall inside a date window. Read-only — call this "
        "before create_roster to warn the user about reduced availability."
    ),
    "create_roster": (
        "Dispatch a new roster to the solver. Creates each demand row, then submits "
        "the roster. Returns the roster immediately with status='running' and a "
        "celery_task_id; poll get_roster_status until status flips to 'draft' "
        "(success) or 'failed'."
    ),
    "get_roster_status": (
        "Fetch the current state of a roster. Poll this every few seconds after "
        "create_roster until status is no longer 'running'. When status='draft', the "
        "`result` field holds the solver output; when status='failed', `result.error` "
        "holds the message."
    ),
}


class ListProfilesParams(BaseModel):
    pass


class ListSkillTypesParams(BaseModel):
    pass


class ListRostersParams(BaseModel):
    status: str | None = Field(
        default=None,
        description="Filter by status: 'running', 'draft', 'failed', or 'approved'.",
    )
    profile_id: int | None = Field(default=None, description="Filter by profile id.")


class ListLeavesParams(BaseModel):
    from_date: str | None = Field(
        default=None, description="ISO date YYYY-MM-DD lower bound (inclusive)."
    )
    to_date: str | None = Field(
        default=None, description="ISO date YYYY-MM-DD upper bound (inclusive)."
    )
    staff_id: int | None = Field(
        default=None, description="Optional filter to a single staff member."
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
        description=(
            "Shift end, minutes from midnight. May be <= start_min for overnight shifts"
        ),
    )
    headcount: int = Field(
        ge=1, description="Number of staff required for this demand window"
    )
    skill_value_id: int | None = Field(
        default=None,
        description=(
            "Optional skill filter. Use null/omit for 'any skill'. Look up valid IDs "
            "from list_skill_types."
        ),
    )


class CreateRosterParams(BaseModel):
    profile_id: int = Field(description="Profile id from list_profiles.")
    name: str = Field(description="Human-readable roster name shown in the UI.")
    roster_start: str = Field(description="ISO date YYYY-MM-DD of day 0.")
    num_days: int = Field(ge=1, description="Number of days in the roster window.")
    target_work_hours: float = Field(
        gt=0, description="Target working hours per staff over the roster window."
    )
    demands: list[DemandSpec] = Field(
        min_length=1,
        description=(
            "Per-day demand rows. Each row is one shift window with required "
            "headcount. Multiple rows on the same date are allowed (e.g. morning + "
            "night)."
        ),
    )
    previous_roster_id: int | None = Field(
        default=None,
        description=(
            "Optional. Pass the id of the approved roster that ends the day before "
            "roster_start to chain conditional constraints across rosters."
        ),
    )


class GetRosterStatusParams(BaseModel):
    roster_id: int = Field(description="Roster id returned by create_roster.")


# Tool name → params model. Both surfaces iterate this, so adding an entry here is
# the only edit needed to expose a new tool on both.
PARAMS: dict[str, type[BaseModel]] = {
    "list_profiles": ListProfilesParams,
    "list_skill_types": ListSkillTypesParams,
    "list_rosters": ListRostersParams,
    "list_leaves": ListLeavesParams,
    "create_roster": CreateRosterParams,
    "get_roster_status": GetRosterStatusParams,
}
