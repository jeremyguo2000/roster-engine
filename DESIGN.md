# Roster Engine — Design Notes

A design for last-minute cancellations, future directions, and known rough
edges. Architecture and dev commands: [README.md](README.md) / CLAUDE.md.
Operator instructions: [documentation/operators-manual.html](documentation/operators-manual.html).

## 1. Operator workflow

Set up in this order (one page per step in the web app; also available as
MCP tools, see [MCP-guide.md](MCP-guide.md)):

1. **Skills** — skill types + values (e.g. `seniority: senior/junior`).
2. **Shifts** — shift groups (night/work flags) and shifts; minutes from
   midnight, overnight = `end <= start`.
3. **Staff** — staff + skills, optional permitted-shift restrictions, leaves.
4. **Profiles** — which staff/shifts participate + solver config (weights,
   time limit, conditional if/then rules).
5. **Generate** — dates, target minutes, demands, optional chaining from a
   previous roster (rest rules carry across the boundary).
6. **Rosters** — review the draft, approve or discard.

## 2. Design: last-minute cancellations

*Design only — not implemented.* A staff member calls in sick after a roster
is approved. The system should record the absence, restore coverage, and
disturb the published schedule as little as possible.

Most machinery exists already: leaves become pre-assignments, C5 can pin
work shifts, chaining carries rest state. Three phases:

**Phase 1 — tail re-solve (no solver changes).** Record the absence as a
`Leave` with a sick-leave shift code (`MC`, defined like `AL` so C2
accounting balances). Create a new roster chained off the approved one
(`roster_start = effective_date`, `num_days` = remaining). Correct, but the
whole tail reshuffles — MVP only.

**Phase 2 — amendment rosters with churn minimisation.** An *amendment* is
a new roster over the same window as its parent: past locked, future
re-solved to stay close to the parent.

| Change | Purpose |
|---|---|
| `roster.parent_roster_id` | links amendment → corrected roster |
| `roster.effective_date` | first re-solved day; earlier days locked |
| `RosterStatus.superseded` | parent's state once amendment approved (enum migration — see README gotchas) |

- API: `POST /api/rosters/{id}/amend` `{effective_date, absences}` on
  approved rosters only → creates leaves + child roster, dispatches solver.
  Approving the amendment supersedes the parent; discarding leaves it be.
- Solver (the only engine change): lock parent assignments before
  `effective_date` as pre-assignments (C5 handles this today); add a churn
  term — `minimise weight_churn · Σ(1 − x[n,d,s])` over the parent's future
  assignments, weighted to dominate — so coverage is repaired with the
  fewest changed cells; soften C2 to slack + penalty in amend mode (exact
  targets may be unattainable with someone out; report deviations).
- Edge cases: mid-shift cancellation → lock today as fact, re-solve from
  tomorrow; rosters already chained off the parent get a "successor may need
  re-generation" warning, no cascading; repeated cancellations amend the
  newest approved roster (parent pointers = audit trail).

**Phase 3 — swap suggestions (fast path).** Most cancellations need no
solve: rank off-duty staff who are permitted the shift, meet the skill
filter, and wouldn't break rest rules (all checkable from the stored
result). Operator picks one (a one-cell amendment) or falls back to
Phase 2. Groundwork for manual roster editing generally.

## 3. Future directions

By value-for-effort:

1. **Cancellations/amendments** — §2.
2. **Declare the solver result** — §5. The largest structural debt: the
   result payload has no type anywhere in the system.
3. **Infeasibility diagnostics** — CP-SAT assumption literals so failures
   say *which* constraint is unsatisfiable, not just "no feasible solution".
4. **Solver tests + CI** — `backend/tests/` covers the tooling layer only
   (22 tests, no CI runs them). The pure solver is ideal for pytest:
   solve → assert C1–C7 on the output; JSON round-trip tests.
5. **Staff preferences** — soft penalty terms ("prefers no Mondays") rather
   than hard constraints, plus fairness on preference satisfaction.
6. **Cross-roster fairness ledger** — carry cumulative night/weekend burden
   in `RosterContext` so debts even out over months instead of resetting.
7. **Warm starts** — `AddHint()` from the previous/parent solution to cut
   solve times.
8. **Export & notifications** — the roster grid and both timetables already
   export to xlsx (`frontend/src/lib/rosterExport.ts`, `timetableExport.ts`).
   Still missing: *per-staff* ICS/Excel, and notifying staff on approve/amend.
9. **RBAC** — planner vs viewer roles; later a staff self-service view
   building on Phase 3 swaps.
10. **Multi-ward staffing** — shared staff pool across profiles with
    borrowing rules.

## 4. Known rough edges

- `DELETE /api/rosters/{id}` hard-deletes approved rosters; `discard`
  refuses them — pick one policy.
- C3 silently skips demand checkpoints no shift can cover — a solve can
  "succeed" while under-covering; worth a warning in the result.
- CORS allows only `http://localhost:5173`; non-same-origin deployments need
  it configurable.
- `solver/display.py` helpers are debug-only (per-cell dict scans).

## 5. The solver result has no declared type

The single largest piece of structural debt, recorded here because it is
invisible until it bites and then it bites in three places at once.

`solver/` declares a dataclass for every *input* it takes — `Shift`, `Staff`,
`Demand`, `ShiftGroup` — and nothing for the result it returns. The shape of
that result is defined implicitly, by a function: `_result_to_json()` in
`app/worker/tasks.py`. Every other part of the system then re-asserts that
shape by hand:

| Where | How the shape is expressed |
|---|---|
| `generate_roster()` | a plain `dict`, documented in a docstring |
| `_result_to_json()` | the *de facto* definition — a dict literal |
| `_json_to_result()` | a second, independent reading of the same keys |
| `RosterOut.result` | `dict \| None`, so OpenAPI emits an opaque object |
| `frontend/src/api/rosters.ts` | hand-written TS interfaces mirroring all of it |

Nothing checks that these five agree. `_result_to_json` and `_json_to_result`
must already be edited in lockstep (CLAUDE.md says so explicitly) — that
instruction exists *because* the type doesn't.

The contrast is visible in one response schema: `RosterOut.status` appears in
OpenAPI as `$ref: RosterStatus`, because `RosterStatus` is a declared enum,
while `result` appears as `{"additionalProperties": true, "type": "object"}`.
Same endpoint, same file — one field is typed and one is a blob. The frontend
has 37 hand-written interfaces across 9 API modules and no codegen tooling, so
this is the pattern everywhere, not a one-off.

A second smell rides along: `roster.result` holds two unrelated shapes — a
solved roster, or `{"error": "..."}` when the solve fails. Any declared type
has to be a union, and making that explicit is part of the fix rather than an
obstacle to it.

**Target, in dependency order.** Each step is useful alone:

1. **Declare the result in `solver/`** as a dataclass, returned by
   `generate_roster()`. The layer that produces it owns its shape.
   `_result_to_json` / `_json_to_result` become serialization *of a declared
   type* rather than the definition of one.
2. **Declare the API projection** in `app/schemas/` (Pydantic), typed as a
   union of solved-result and error, so OpenAPI carries the real shape.
3. **Generate the TypeScript** from the OpenAPI schema (`openapi-typescript`
   plus an npm script), deleting the hand-written mirrors. Drift stops being
   a thing you avoid by discipline and becomes impossible.

Step 3 without steps 1–2 is worthless: generating from `additionalProperties:
true` yields `Record<string, unknown>`. Step 2 without step 3 is an
improvement, not a fix — two hand-maintained definitions instead of three.

Not done yet because it touches the solver's return signature, the Celery
task, chaining, the audit and the frontend at once, and delivers no
user-visible change. It should be done before the result grows another
consumer.
