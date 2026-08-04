"""Anthropic tool-calling adapter over the shared tooling layer.

Tool schemas are derived from the Pydantic models in `app.tooling.params` rather
than hand-written, so this surface and the MCP server can't drift apart.
"""

from typing import Any

from pydantic import ValidationError

from app.tooling import operations
from app.tooling.client import BackendError, RosterApiClient
from app.tooling.params import DESCRIPTIONS, PARAMS, CreateRosterParams


def _input_schema(model) -> dict:
    """Pydantic JSON Schema → Anthropic `input_schema`.

    `title` keys are cosmetic noise for the model, so they're stripped; `$defs`
    and `$ref` are kept (the API supports them, and nested DemandSpec needs them).
    """
    schema = model.model_json_schema()

    def strip_titles(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: strip_titles(v) for k, v in node.items() if k != "title"}
        if isinstance(node, list):
            return [strip_titles(v) for v in node]
        return node

    schema = strip_titles(schema)
    schema.setdefault("type", "object")
    schema.setdefault("properties", {})
    return schema


# Built by iterating the shared registry — adding a tool to app.tooling.params
# exposes it here automatically.
TOOLS: list[dict] = [
    {
        "name": name,
        "description": DESCRIPTIONS[name],
        "input_schema": _input_schema(model),
    }
    for name, model in PARAMS.items()
]


async def execute_tool(name: str, tool_input: dict, client: RosterApiClient) -> Any:
    """Run one tool call. Returns a JSON-serializable result, or an error string —
    errors go back to the model as a tool_result so it can correct itself rather
    than failing the whole conversation.
    """
    model = PARAMS.get(name)
    if model is None:
        return f"Error: unknown tool '{name}'"

    try:
        params = model.model_validate(tool_input)
    except ValidationError as e:
        return f"Error: invalid arguments for {name}: {e.errors()}"

    try:
        if name == "list_profiles":
            return await operations.list_profiles(client)
        if name == "list_skill_types":
            return await operations.list_skill_types(client)
        if name == "list_rosters":
            return await operations.list_rosters(
                client, status=params.status, profile_id=params.profile_id
            )
        if name == "list_leaves":
            return await operations.list_leaves(
                client,
                from_date=params.from_date,
                to_date=params.to_date,
                staff_id=params.staff_id,
            )
        if name == "create_roster":
            assert isinstance(params, CreateRosterParams)
            return await operations.create_roster(client, params)
        if name == "get_roster_status":
            return await operations.get_roster_status(client, params.roster_id)
    except BackendError as e:
        return f"Error: {operations.format_backend_error(e)}"

    return f"Error: tool '{name}' has no handler"
