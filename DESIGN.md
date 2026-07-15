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

Most machinery exists already: leaves become pre-assignments, C7 can pin
work shifts, chaining carries rest state. Three phases:

**Phase 1 — tail re-solve (no solver changes).** Record the absence as a
`Leave` with a sick-leave shift code (`MC`, defined like `AL` so C4
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
  `effective_date` as pre-assignments (C7 handles this today); add a churn
  term — `minimise weight_churn · Σ(1 − x[n,d,s])` over the parent's future
  assignments, weighted to dominate — so coverage is repaired with the
  fewest changed cells; soften C4 to slack + penalty in amend mode (exact
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
2. **Infeasibility diagnostics** — CP-SAT assumption literals so failures
   say *which* constraint is unsatisfiable, not just "no feasible solution".
3. **Backend test suite + CI** — none exists; the pure solver is ideal for
   pytest (solve → assert C1–C9 on output; JSON round-trip tests).
4. **Staff preferences** — soft penalty terms ("prefers no Mondays") rather
   than hard constraints, plus fairness on preference satisfaction.
5. **Cross-roster fairness ledger** — carry cumulative night/weekend burden
   in `RosterContext` so debts even out over months instead of resetting.
6. **Warm starts** — `AddHint()` from the previous/parent solution to cut
   solve times.
7. **Export & notifications** — per-staff ICS/Excel; notify staff on
   approve/amend.
8. **RBAC** — planner vs viewer roles; later a staff self-service view
   building on Phase 3 swaps.
9. **Multi-ward staffing** — shared staff pool across profiles with
   borrowing rules.

## 4. Known rough edges

- `DELETE /api/rosters/{id}` hard-deletes approved rosters; `discard`
  refuses them — pick one policy.
- Constraint numbering skips C2/C3 — kept because docs reference the numbers.
- C5 silently skips demand checkpoints no shift can cover — a solve can
  "succeed" while under-covering; worth a warning in the result.
- CORS allows only `http://localhost:5173`; non-same-origin deployments need
  it configurable.
- `solver/display.py` helpers are debug-only (per-cell dict scans).
