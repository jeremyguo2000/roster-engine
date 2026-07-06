# MCP Server Test Plan

Acceptance test plan for the roster-engine MCP server (`backend/app/mcp_server/`, host port 8001, Streamable HTTP at `/mcp`).

## 1. Purpose & scope

This plan covers black-box testing of the MCP server from an MCP client's perspective. It exercises every tool the chatbot will call, the JWT pass-through auth path, error surfacing, and the end-to-end "schedule a new roster" orchestration. The underlying FastAPI routes, the CP-SAT solver, the Celery worker, and the chatbot's NLU layer are out of scope — they have their own tests upstream. A run takes ~10 minutes; full suite passes are expected before any MCP server change is merged.

## 2. System under test

Six MCP tools, each thin HTTP wrappers over the backend API. JWT is forwarded from the MCP client to the backend on every call.

| Tool | Backend route called | Purpose |
|---|---|---|
| `list_profiles` | `GET /api/profiles` | Discover valid `profile_id` |
| `list_skill_types` | `GET /api/skills/types` | Discover valid `skill_value_id` for demands |
| `list_rosters` | `GET /api/rosters?status=…&profile_id=…` | Find prior roster for chaining |
| `list_leaves` | `GET /api/staff/leaves?from_date=…&to_date=…` | Preview leaves in target window |
| `create_roster` | `POST /api/demands` (×N) then `POST /api/rosters` | Dispatch a roster to the solver |
| `get_roster_status` | `GET /api/rosters/{id}` | Poll until solver finishes |

## 3. Test environment

### Prerequisites

- Docker + Docker Compose v2
- `curl`, `jq`, `python3` on the test host
- Host port 8001 free
- The repo checked out at the standard path

### Setup

```bash
# 1. Bring up the full stack (idempotent)
docker compose -f docker-compose.dev.yml up -d

# 2. Run migrations on first use
docker compose -f docker-compose.dev.yml exec backend alembic upgrade head

# 3. Create or reuse a test user
docker compose -f docker-compose.dev.yml exec backend \
  python -m app.scripts.create_user testuser testpass123

# 4. Acquire a JWT and export it
export TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","password":"testpass123"}' \
  | jq -r .access_token)
echo "${TOKEN:0:40}…"   # sanity check
```

### Test data assumed to exist

- At least one **Profile** (e.g. "Ward 1" from the dev seed) with a valid `config` JSON and ≥1 permitted shift group.
- At least one **ShiftGroup** + **Shift** so the solver has something to assign.
- At least one **Staff** with permitted shifts and non-empty skills (for `list_skill_types` to be meaningful and for the solver to find a feasible solution).

If the dev DB is empty, restore from the project's seed or recreate via the web UI before running the suite.

## 4. Reusable helpers

Source these in your shell. Every test case below relies on them.

```bash
# Initialize an MCP session. Exports SESSION.
mcp_init() {
  local raw
  raw=$(curl -si -X POST http://localhost:8001/mcp \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"testplan","version":"1.0"}}}')
  export SESSION=$(echo "$raw" | grep -i 'mcp-session-id:' | awk '{print $2}' | tr -d '\r\n')
  curl -s -X POST http://localhost:8001/mcp \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "Authorization: Bearer $TOKEN" \
    -H "mcp-session-id: $SESSION" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' > /dev/null
  echo "session=$SESSION"
}

# Call a tool. Usage: mcp_call list_profiles '{}'
mcp_call() {
  local name="$1"
  local args="$2"
  curl -s -X POST http://localhost:8001/mcp \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "Authorization: Bearer $TOKEN" \
    -H "mcp-session-id: $SESSION" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args}}" \
    | sed -n 's/^data: //p' | jq .
}

# Raw JSON-RPC call without auth, for negative path tests.
mcp_call_noauth() {
  local name="$1"
  local args="$2"
  curl -s -X POST http://localhost:8001/mcp \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "mcp-session-id: $SESSION" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args}}" \
    | sed -n 's/^data: //p' | jq .
}
```

## 5. Test cases

### Master matrix

| ID | Category | Title | Pass criterion |
|---|---|---|---|
| TC-001 | Protocol | Initialize handshake | `serverInfo.name == "roster-engine"` |
| TC-002 | Protocol | `tools/list` returns 6 tools | Names match {list_profiles, list_skill_types, list_rosters, list_leaves, create_roster, get_roster_status} |
| TC-003 | Protocol | `create_roster` schema | `inputSchema.$defs.DemandSpec` present with date/start_min/end_min/headcount/skill_value_id |
| TC-010 | Auth | No Authorization header | Error text contains "Missing Authorization: Bearer" |
| TC-011 | Auth | Malformed Authorization header | Same error as TC-010 |
| TC-012 | Auth | Unsigned/forged JWT | Backend 401 surfaced as MCP error |
| TC-013 | Auth | Expired JWT | Same 401 surfacing |
| TC-020 | Tool happy | `list_profiles` | Returns ≥1 profile with id/name/config |
| TC-021 | Tool happy | `list_skill_types` | Returns items with nested `values` |
| TC-022 | Tool happy | `list_rosters(status=approved)` | All returned rosters have status=approved |
| TC-023 | Tool happy | `list_leaves(from,to)` | Every leave's `date` is in [from, to] |
| TC-024 | Tool happy | `create_roster` (1 day, 1 demand) | Returns `status:"running"` + `celery_task_id`; demand rows visible in DB |
| TC-025 | Tool happy | `get_roster_status` after solve | `status:"draft"`, `result.staff` and `result.assignments` populated |
| TC-030 | Tool neg | `list_rosters(status="garbage")` | 422 surfaced as MCP error |
| TC-031 | Tool neg | `list_leaves(from_date="not-a-date")` | 422 surfaced |
| TC-032 | Tool neg | `create_roster(profile_id=999999)` | 404 surfaced |
| TC-033 | Tool neg | `create_roster(demands=[])` | Pydantic `min_length=1` error at MCP layer; no backend call |
| TC-034 | Tool neg | `create_roster` with one bad demand | Backend error surfaced; orphan demand rows present (known limitation, see §7) |
| TC-035 | Tool neg | `get_roster_status(999999)` | 404 surfaced |
| TC-040 | E2E | Full chatbot flow, 7-day roster | Roster appears in web UI Drafts list with correct date range + demand count |
| TC-050 | Network | LAN reachability | 307 or 405 on bare GET — anything but `Connection refused` |

### Detailed cases

#### TC-001 Initialize handshake

```bash
curl -s -X POST http://localhost:8001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"testplan","version":"1.0"}}}' \
  | sed -n 's/^data: //p' | jq '.result.serverInfo'
```

**Expected**: `{"name":"roster-engine","version":"…"}`. **Pass**: `name == "roster-engine"`.

#### TC-002 `tools/list`

```bash
mcp_init
curl -s -X POST http://localhost:8001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $TOKEN" \
  -H "mcp-session-id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | sed -n 's/^data: //p' | jq '.result.tools[].name'
```

**Expected**: exactly the six tool names listed in §2.

#### TC-010 Missing auth

```bash
mcp_init                      # opens a session with a valid token
mcp_call_noauth list_profiles '{}'
```

**Expected** (excerpt):
```json
{
  "result": {
    "content": [{ "type": "text", "text": "Error executing tool list_profiles: Missing Authorization: Bearer <jwt> header on the MCP request. …" }],
    "isError": true
  }
}
```

#### TC-012 Forged JWT

```bash
TOKEN_ORIG=$TOKEN
export TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsImV4cCI6OTk5OTk5OTk5OX0.invalidsignature"
mcp_init
mcp_call list_profiles '{}'
export TOKEN=$TOKEN_ORIG   # restore
```

**Expected**: response `isError:true`, text containing `"Backend returned 401"`.

#### TC-013 Expired JWT

Re-issue a token with a 0-minute expiry by restarting the backend with the env override, OR wait out the configured `ACCESS_TOKEN_EXPIRE_MINUTES`. Then run the same probe as TC-012.

```bash
docker compose -f docker-compose.dev.yml stop backend
ACCESS_TOKEN_EXPIRE_MINUTES=0 docker compose -f docker-compose.dev.yml up -d backend
sleep 3
export TOKEN_EXPIRED=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","password":"testpass123"}' | jq -r .access_token)
TOKEN=$TOKEN_EXPIRED mcp_init || true   # session open will still succeed
TOKEN=$TOKEN_EXPIRED mcp_call list_profiles '{}'
# Restore normal expiry afterwards
docker compose -f docker-compose.dev.yml stop backend
docker compose -f docker-compose.dev.yml up -d backend
```

**Expected**: same 401 surfacing as TC-012.

#### TC-024 `create_roster` happy path

```bash
mcp_init
PROFILE_ID=$(mcp_call list_profiles '{}' | jq -r '.result.content[0].text' | jq '.[0].id // 1')

mcp_call create_roster "{
  \"profile_id\": $PROFILE_ID,
  \"name\": \"TC-024 smoke\",
  \"roster_start\": \"2026-08-01\",
  \"num_days\": 1,
  \"target_work_hours\": 8,
  \"demands\": [
    {\"date\":\"2026-08-01\",\"start_min\":540,\"end_min\":1020,\"headcount\":2}
  ]
}"
```

**Expected** (excerpt):
```json
{
  "result": {
    "content": [{ "type":"text", "text": "{ \"id\": <int>, \"status\":\"running\", \"celery_task_id\":\"<uuid>\", … }" }],
    "isError": false
  }
}
```

**DB verification**:
```bash
docker compose -f docker-compose.dev.yml exec postgres \
  psql -U roster -d roster_engine -c "SELECT id, date, headcount FROM demands ORDER BY id DESC LIMIT 1;"
```
**Pass**: one new demand row exists with `date='2026-08-01'`, `headcount=2`.

#### TC-025 `get_roster_status` after solve

Wait ~5 s after TC-024 then:
```bash
ROSTER_ID=$(mcp_call list_rosters '{"status":"draft"}' \
  | jq -r '.result.content[0].text' | jq '.[0].id')
mcp_call get_roster_status "{\"roster_id\": $ROSTER_ID}"
```
**Pass**: `status == "draft"`, `result.staff` is a non-empty array, `result.assignments` is a non-empty object.

#### TC-033 Empty demands list

```bash
mcp_init
mcp_call create_roster '{
  "profile_id": 1, "name": "TC-033", "roster_start": "2026-08-01",
  "num_days": 1, "target_work_hours": 8, "demands": []
}'
```
**Pass**: error returned at the MCP layer (pydantic `min_length=1`) without any `POST /api/demands` or `POST /api/rosters` request reaching the backend (verify via `docker compose logs backend --tail 5` — no new POST lines).

#### TC-034 Bad demand mid-batch (known limitation)

```bash
mcp_init
# Count demands before
BEFORE=$(docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U roster -d roster_engine -t -c "SELECT count(*) FROM demands;")

mcp_call create_roster '{
  "profile_id": 1, "name": "TC-034", "roster_start": "2026-08-01",
  "num_days": 2, "target_work_hours": 8,
  "demands": [
    {"date":"2026-08-01","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-02","start_min":540,"end_min":1020,"headcount":0}
  ]
}'

# Count after
AFTER=$(docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U roster -d roster_engine -t -c "SELECT count(*) FROM demands;")
echo "before=$BEFORE after=$AFTER"
```
**Expected**: error response from MCP. **Pass**: `AFTER = BEFORE + 1` (the first demand row was created; rollback is **not** implemented — see §7).

#### TC-040 Full E2E flow

This is the chatbot scenario from end to end. Run as one shell script:
```bash
mcp_init
echo "--- profiles ---"           ; mcp_call list_profiles '{}' | head -20
echo "--- skill types ---"        ; mcp_call list_skill_types '{}' | head -20
echo "--- approved rosters ---"   ; mcp_call list_rosters '{"status":"approved"}' | head -20
echo "--- leaves preview ---"     ; mcp_call list_leaves '{"from_date":"2026-08-10","to_date":"2026-08-16"}'

echo "--- create_roster (7d × 2 demands) ---"
mcp_call create_roster '{
  "profile_id": 1,
  "name": "TC-040 chatbot E2E",
  "roster_start": "2026-08-10",
  "num_days": 7,
  "target_work_hours": 40,
  "demands": [
    {"date":"2026-08-10","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-10","start_min":1320,"end_min":360,"headcount":1},
    {"date":"2026-08-11","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-11","start_min":1320,"end_min":360,"headcount":1},
    {"date":"2026-08-12","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-12","start_min":1320,"end_min":360,"headcount":1},
    {"date":"2026-08-13","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-13","start_min":1320,"end_min":360,"headcount":1},
    {"date":"2026-08-14","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-14","start_min":1320,"end_min":360,"headcount":1},
    {"date":"2026-08-15","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-15","start_min":1320,"end_min":360,"headcount":1},
    {"date":"2026-08-16","start_min":540,"end_min":1020,"headcount":2},
    {"date":"2026-08-16","start_min":1320,"end_min":360,"headcount":1}
  ]
}'

# Wait + poll
sleep 10
ROSTER_ID=$(mcp_call list_rosters '{}' | jq -r '.result.content[0].text' \
  | jq '[.[] | select(.name == "TC-040 chatbot E2E")][0].id')
mcp_call get_roster_status "{\"roster_id\": $ROSTER_ID}" | head -30
```

**Pass**:
- The `create_roster` response has `status:"running"` and `celery_task_id`.
- Within 60 s, `get_roster_status` returns `status:"draft"` (or `failed` with a feasibility message — document which).
- Opening `http://localhost:5173/rosters` shows a **TC-040 chatbot E2E** card under **Drafts** with `2026-08-10` start, 7 days, and 14 demand rows linked.

#### TC-050 LAN reachability

From a second host on the same network:
```bash
curl -i http://<engine-host-ip>:8001/mcp
```
**Pass**: HTTP/1.1 307 (or 405) — proves the port is published and not bound to 127.0.0.1. **Fail**: `curl: (7) Failed to connect …` — fix the compose port mapping or the host firewall.

## 6. Pass / fail criteria

**Per case**: the response shape matches the "Expected" / "Pass" entry above AND `docker compose logs mcp --tail 50` and `docker compose logs backend --tail 50` show no `ERROR` or `Traceback` lines during the case.

**Overall suite**: all 21 cases pass on a freshly seeded database. A pass on TC-034 is the documented known-limitation behaviour (orphan rows + error), not a perfect transactional rollback.

## 7. Known limitations / out of scope

- **Partial-failure rollback on `create_roster`** — TC-034 documents this. If demand N+1 fails after demands 1…N were created, the first N demand rows remain in the database. The backend offers no transactional bulk-create endpoint. Fix would require either a new backend route or a compensating delete loop in the MCP layer's `create_roster` tool. Tracked as an open issue.
- **JWT refresh** — There is no in-band token refresh. When the token expires mid-session, the MCP client must re-login against `POST /api/auth/login` and reopen the MCP session with the new bearer.
- **Concurrency / load** — The MCP server is a single uvicorn process. Concurrent `create_roster` calls have not been characterised. Treat as single-user for now.

## 8. Appendix: copy-paste suite runner

```bash
# Prereqs: containers up, $TOKEN set (see §3).
set -e

# Sourceable helpers
. <(cat <<'HELPERS'
mcp_init() { … }       # (copy from §4)
mcp_call() { … }
mcp_call_noauth() { … }
HELPERS
)

mcp_init
mcp_call list_profiles '{}'                                   # TC-020
mcp_call list_skill_types '{}'                                # TC-021
mcp_call list_rosters '{"status":"approved"}'                 # TC-022
mcp_call list_leaves '{"from_date":"2026-08-10","to_date":"2026-08-16"}'  # TC-023
mcp_call create_roster '{
  "profile_id": 1, "name": "TC-024", "roster_start":"2026-08-01",
  "num_days": 1, "target_work_hours": 8,
  "demands": [{"date":"2026-08-01","start_min":540,"end_min":1020,"headcount":2}]
}'                                                            # TC-024
sleep 5
# Re-init session if it expired between cases:
mcp_init
mcp_call list_rosters '{}' | jq -r '.result.content[0].text' | jq '.[0]'  # find latest id
# … etc.
```

A complete pass takes ~10 minutes. Capture stdout + stderr to a file for the audit trail:
```bash
bash run_testplan.sh 2>&1 | tee testplan-$(date +%Y%m%d-%H%M).log
```
