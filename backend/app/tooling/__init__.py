"""Shared roster-tool layer.

Both tool surfaces are thin adapters over this package:

- `app.mcp_server` — MCP protocol, authenticates as a shared service account
  (for external agents like Claude Code).
- `app.chat` — Anthropic Messages API tool-calling, passes through the
  logged-in user's own JWT (for the in-app chat widget).

Everything that isn't protocol-specific lives here: the backend HTTP client,
the operation orchestration, and the tool descriptions. Only the schema
*declaration* differs per surface — MCP derives it from typed function
signatures, the Messages API takes raw JSON Schema.
"""
