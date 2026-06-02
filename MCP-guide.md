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

> Note: a bare `GET http://localhost:8001/mcp` returns `307 Temporary Redirect` to `/mcp/`. That is expected —
> MCP clients follow it automatically.

## Authentication model (read this first)

The MCP server **holds no credentials and never logs in**. It uses pure **JWT pass-through**: it reads the
`Authorization: Bearer <token>` header off the incoming MCP request and forwards that same header on every
upstream backend call (`backend/app/mcp_server/server.py`, `_extract_jwt`).

That means **you (the operator) supply the token**, in two steps:

1. **Have a backend user account.** If you don't have one, create it (see Prerequisites).
2. **Exchange those credentials for a JWT** at `POST /api/auth/login`. The resulting **token** — *not* your
   password — is what you put into the chatbot's MCP configuration.

The chatbot only ever holds the bearer token. Tokens expire after **24 hours** by default
(`access_token_expire_minutes` in `backend/app/config.py`). There is **no in-band refresh** — when the token
expires you re-run the login and update the client config with the new token.

Create a **dedicated user** for the chatbot rather than reusing a personal or test account.

## Prerequisites

- The stack is running and healthy:
  ```bash
  docker compose -f docker-compose.dev.yml up -d
  ```
  Confirm the `mcp` service is published on host `8001`:
  ```bash
  docker compose -f docker-compose.dev.yml ps mcp
  ```
- A backend user for the chatbot. Create one if needed:
  ```bash
  docker compose -f docker-compose.dev.yml exec backend \
    python -m app.scripts.create_user chatbot 'a-strong-password'
  ```
- Your MCP client installed: OpenClaw (`openclaw mcp …` available) and/or Claude Code (`claude` CLI).

## Step 1 — Obtain a JWT

Log in against the backend and capture the `access_token`:

```bash
export TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"chatbot","password":"a-strong-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "${TOKEN:0:24}…"   # sanity check that it's non-empty
```

(If you have `jq` installed, `| jq -r .access_token` works in place of the `python3` one-liner.)

Remember: this token is valid for ~24 hours. When it expires, repeat this step and update your client config.

## Step 2 — Register the server with your MCP client

The connection facts are the same for both clients — URL `http://localhost:8001/mcp`, Streamable HTTP
transport, and the `Authorization: Bearer <token>` header. Only the registration syntax differs.

### 2A — OpenClaw

**CLI:**
```bash
openclaw mcp add roster-engine \
  --url http://localhost:8001/mcp \
  --transport streamable-http \
  --header "Authorization: Bearer $TOKEN"
```

**Or edit the config file** `~/.openclaw/openclaw.json`:
```json
{
  "mcp": {
    "servers": {
      "roster-engine": {
        "url": "http://localhost:8001/mcp",
        "transport": "streamable-http",
        "headers": { "Authorization": "Bearer <paste-token-here>" }
      }
    }
  }
}
```

Run `openclaw mcp --help` to see the exact status/list/remove subcommands for your version.

### 2B — Claude Code

**CLI:**
```bash
claude mcp add --transport http roster-engine http://localhost:8001/mcp \
  --header "Authorization: Bearer $TOKEN"
```

- The transport flag is **`http`** for Claude Code (vs `streamable-http` for OpenClaw) — it's the same
  underlying Streamable HTTP protocol, just a different flag name.
- **Scope** with `-s`:
  - `local` (default) — this project only, written to `~/.claude.json`.
  - `user` — available across all your projects.
  - `project` — shared with the team via a checked-in `.mcp.json`. **Do not use `project` scope here:** it would
    commit your bearer token to the repo. Prefer `local` or `user`.
- **Paste a full JSON config** in one shot instead, if you prefer:
  ```bash
  claude mcp add-json roster-engine '{"type":"http","url":"http://localhost:8001/mcp","headers":{"Authorization":"Bearer <token>"}}'
  ```
- Undo with `claude mcp remove roster-engine`.

> **Startup caveat:** Claude Code loads MCP servers at session start. Adding the server mid-session registers it
> but does **not** expose its tools to the running assistant — you must **restart Claude Code** for the six
> `roster-engine` tools to appear.

## Step 3 — Network reachability

`http://localhost:8001` only works if the MCP client runs on the **same host** as the Docker stack.

- **Client in its own container or on another machine:** `localhost` will not resolve to the server. Use the
  Docker host's LAN IP instead — `http://<host-ip>:8001/mcp` — or attach the client to the compose network.
- The MCP server binds to `0.0.0.0`, so it is reachable across the LAN once the host firewall allows port 8001.
  Quick check from another host:
  ```bash
  curl -i http://<host-ip>:8001/mcp
  ```
  A `307` (or `405`) proves the port is published. `Connection refused` means a port-mapping or firewall issue.

## Step 4 — Reload & verify the connection

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

## Step 5 — Chat to generate a roster

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
| Tool error `Missing Authorization: Bearer …` | No bearer header reached the MCP request — check the client's `headers` config. |
| Tool error `Backend returned 401` | Token expired or invalid — repeat Step 1 and update the client config with the fresh token. |
| `Connection refused` | Wrong host or port not published — see Step 3. |
| Claude Code tools missing after `claude mcp add` | Restart Claude Code; MCP servers load at startup. |

Known limitations (see `TESTPLAN.md` §7 for detail):

- **No transactional rollback** on `create_roster`: if one demand in the batch fails after earlier ones were
  created, the earlier demand rows remain in the database.
- **No in-band JWT refresh:** when the token expires mid-session, re-login and update the client config.
- The MCP server is a single uvicorn process — treat it as single-user for now.
