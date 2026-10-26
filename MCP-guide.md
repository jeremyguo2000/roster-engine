# Connecting a Chatbot to the roster-engine MCP Server

This guide walks through wiring an MCP-capable chatbot to the roster-engine MCP server so a user can
generate rosters in natural language. It covers two clients in detail — **OpenClaw** and **Claude Code** —
but the connection facts are identical for any Streamable-HTTP MCP client.

## Overview

The MCP server (`backend/app/mcp_server/`, the `mcp` service in `docker-compose.dev.yml`) is a thin HTTP
wrapper over the backend API. It runs as its own container on **host port 8001** and speaks
**MCP Streamable HTTP** at **`http://localhost:8001/mcp`**.

| Tool | Backend route | Purpose |
|---|---|---|
| `list_profiles` | `GET /api/profiles` | Discover a valid `profile_id` |
| `list_skill_types` | `GET /api/skills/types` | Discover a valid `skill_value_id` for demands |
| `list_rosters` | `GET /api/rosters?status=…&profile_id=…` | Find a prior roster for chaining |
| `list_leaves` | `GET /api/staff/leaves?from_date=…&to_date=…` | Preview leaves in the target window |
| `create_roster` | `POST /api/demands` (×N) then `POST /api/rosters` | Dispatch a roster to the solver |
| `get_roster_status` | `GET /api/rosters/{id}` | Poll until the solver finishes |

> Note: a bare `GET http://localhost:8001/mcp` returns `401` without the access token (next section), and
> `307 Temporary Redirect` to `/mcp/` with it. Both are expected — MCP clients send the header and follow the
> redirect automatically.

## Authentication model (read this first)

There are two layers, and they are independent.

**Inbound — the client proves it may call the server.** Every request must carry the deployment's shared
access token:

```
Authorization: Bearer <MCP_ACCESS_TOKEN>
```

`MCP_ACCESS_TOKEN` is set in the `mcp` container's environment (`.env` locally; the chart's `mcp.accessToken`;
SSM `/roster/MCP_ACCESS_TOKEN` on AWS). A request without it, or with the wrong value, gets `401` before it
reaches the MCP transport (`backend/app/mcp_server/auth.py`). It is one static token per deployment, shared by
every client that connects — it says "this client is allowed in", not who the human is.

**Outbound — the server logs itself in to the backend.** The MCP server holds its own credentials: on first
tool call it authenticates to the backend as a fixed **service account** (`ROSTER_SERVICE_USERNAME` /
`ROSTER_SERVICE_PASSWORD`, `svc-mcp` in this repo's `.env`), caches the resulting JWT, and re-logs-in
automatically before it expires or after a `401` (`backend/app/mcp_server/token_manager.py`). The access token
the client sent is **not** forwarded — `backend/app/tooling/client.py` always attaches the service account's
own token.

Practically, this means:

- **You configure one header on the client and nothing else.** No backend login, no per-user JWT.
- **Every connected client shares one identity.** The backend cannot distinguish which human is behind a given
  tool call — everyone holding the access token acts as `svc-mcp`. Treat the token accordingly: it is a
  credential for the whole roster, not a login for a person.
- The service account must already exist in the backend; it's created once during setup, not per chatbot user.

`backend/app/mcp_server/identity.py` documents a "multi-user seam" for a future per-caller identity model, but
that isn't implemented yet — today it's always the one shared account.

## Prerequisites

- The stack is running and healthy:
  ```bash
  docker compose -f docker-compose.dev.yml up -d
  ```
  Confirm the `mcp` service is published on host `8001`:
  ```bash
  docker compose -f docker-compose.dev.yml ps mcp
  ```
- Your MCP client installed: OpenClaw (`openclaw mcp …` available) and/or Claude Code (`claude` CLI).

## Step 1 — Register the server with your MCP client

The connection facts are the same for both clients — URL `http://localhost:8001/mcp`, Streamable HTTP
transport, and the header `Authorization: Bearer <MCP_ACCESS_TOKEN>` with the value from `.env`. Only the
registration syntax differs.

### 1A — OpenClaw

**CLI:**
```bash
openclaw mcp add roster-engine \
  --url http://localhost:8001/mcp \
  --transport streamable-http
```

then add the `Authorization` header (`openclaw mcp add --help` shows the flag for your version), **or edit the
config file** `~/.openclaw/openclaw.json`:
```json
{
  "mcp": {
    "servers": {
      "roster-engine": {
        "url": "http://localhost:8001/mcp",
        "transport": "streamable-http",
        "headers": { "Authorization": "Bearer <MCP_ACCESS_TOKEN>" }
      }
    }
  }
}
```

Run `openclaw mcp --help` to see the exact status/list/remove subcommands for your version.

### 1B — Claude Code

**CLI:**
```bash
claude mcp add --transport http roster-engine http://localhost:8001/mcp \
  --header "Authorization: Bearer $MCP_ACCESS_TOKEN"
```

- The transport flag is **`http`** for Claude Code (vs `streamable-http` for OpenClaw) — it's the same
  underlying Streamable HTTP protocol, just a different flag name.
- **Scope** with `-s`:
  - `local` (default) — this project only, written to `~/.claude.json`.
  - `user` — available across all your projects.
  - `project` — shared with the team via a checked-in `.mcp.json`. Don't paste the token into that file:
    Claude Code expands `${MCP_ACCESS_TOKEN}` inside header values from the environment, so commit the
    reference and keep the value in each developer's shell.
- Undo with `claude mcp remove roster-engine`.

> **Startup caveat:** Claude Code loads MCP servers at session start. Adding the server mid-session registers it
> but does **not** expose its tools to the running assistant — you must **restart Claude Code** for the six
> `roster-engine` tools to appear.

## Step 2 — Network reachability

`http://localhost:8001` only works if the MCP client runs on the **same host** as the Docker stack.

- **Client in its own container or on another machine:** `localhost` will not resolve to the server. Use the
  Docker host's LAN IP instead — `http://<host-ip>:8001/mcp` — or attach the client to the compose network.
- The MCP server binds to `0.0.0.0`, so it is reachable across the LAN once the host firewall allows port 8001.
  Quick check from another host:
  ```bash
  curl -i http://<host-ip>:8001/mcp
  ```
  A `401` proves the port is published (the access-token check answers before anything else). Add
  `-H "Authorization: Bearer $MCP_ACCESS_TOKEN"` and the transport answers `307` (or `405`) instead.
  `Connection refused` means a port-mapping or firewall issue.

## Step 3 — Reload & verify the connection

Both clients load MCP servers at startup, so **restart the client** after registering.

- **OpenClaw:** check status/list via `openclaw mcp` (see `openclaw mcp --help`).
- **Claude Code:**
  ```bash
  claude mcp list
  ```
  Expect `roster-engine: http://localhost:8001/mcp (HTTP) - ✓ Connected`. The six tools become callable by the
  assistant after the restart.

Either way, a healthy connection lists all six tools: `list_profiles`, `list_skill_types`, `list_rosters`,
`list_leaves`, `create_roster`, `get_roster_status`.

## Step 4 — Chat to generate a roster

With the server connected, the chatbot can drive the whole flow from natural language. Example prompt:

> *"Create a 7-day roster for Ward 1 starting 2026-08-10 — two staff on a 09:00–17:00 day shift each day,
> targeting 40 hours per nurse."*

A well-behaved model will call the tools in roughly this order:

1. `list_profiles` → find the `profile_id` for "Ward 1".
2. (optional) `list_skill_types` if the request names a required skill (e.g. "a Registered Nurse"); and/or
   `list_leaves` to warn about staff away during the window.
3. `create_roster` → returns the roster immediately with `status:"running"` and a `celery_task_id`.
4. `get_roster_status` → poll every few seconds until `status` flips to `draft` (success) or `failed`.

`create_roster` arguments (so you can sanity-check what the model sends):

| Argument | Type | Notes |
|---|---|---|
| `profile_id` | int | From `list_profiles`. |
| `name` | string | Human-readable name shown in the UI. |
| `roster_start` | string | ISO date `YYYY-MM-DD` of day 0. |
| `num_days` | int ≥ 1 | Length of the roster window. |
| `target_work_hours` | number > 0 | Target hours per staff over the window (converted to minutes internally). |
| `demands` | array (≥ 1) | Each: `date`, `start_min` (0–1439), `end_min` (0–1439, may be ≤ `start_min` for overnight), `headcount` (≥ 1), optional `skill_value_id`. |
| `previous_roster_id` | int / null | Optional. Chains conditional constraints from an approved prior roster. |

> Time is **minutes from midnight** (09:00 = 540, 17:00 = 1020). Demand windows that require continuous
> round-the-clock coverage are much harder for the solver and may run up to the profile's time limit before
> returning a solution (or `failed`); a normal daytime window solves in about a second.

When `status` is `draft`, the solved roster also shows up in the web UI under **Drafts**
(`http://localhost:5173/rosters`).

## Troubleshooting & limitations

| Symptom | Cause / fix |
|---|---|
| Client cannot connect; `curl` of the MCP URL returns `401` | The client isn't sending `Authorization: Bearer <MCP_ACCESS_TOKEN>`, or its value differs from the `mcp` container's `MCP_ACCESS_TOKEN`. This is the server's own check, before any backend call. |
| Tool error `MCP service account login failed (…)` | `ROSTER_SERVICE_USERNAME`/`ROSTER_SERVICE_PASSWORD` on the `mcp` container don't match a real backend user — check `.env` and that the account exists. |
| Tool error `Backend returned 401` | The service account's cached token was rejected; the client retries once with a fresh login automatically — a persistent 401 means the account's password changed or was deleted. |
| `Connection refused` | Wrong host or port not published — see Step 2. |
| Claude Code tools missing after `claude mcp add` | Restart Claude Code; MCP servers load at startup. |

Known limitations (see `TESTPLAN.md` §7 for detail):

- **No transactional rollback** on `create_roster`: if one demand in the batch fails after earlier ones were
  created, the earlier demand rows remain in the database.
- **Single shared identity:** every connected client acts as the same `svc-mcp` account (see "Authentication
  model" above) — the access token decides who may call at all, but there's no per-caller audit trail.
- The MCP server is a single uvicorn process — treat it as single-user for now.
