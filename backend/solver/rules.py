"""
Rule identity and the rule primitives shared by the post-solve audit
(solver/validate.py) and the replacement suggester (solver/swaps.py).

Both audits need to answer the same questions — "which shift codes are in this
group?", "who is physically on duty at this minute?", "does this employee's row
break a rest rule?" — so the semantics live here once. A bug fixed here is
fixed for both callers, and the two can never drift apart.

Like the rest of solver/, this is pure: no FastAPI, SQLAlchemy or Celery.
"""
from __future__ import annotations
import enum
from collections.abc import Callable, Collection
from dataclasses import dataclass

from solver.models import Shift
from solver.solver import ConditionalConstraint, RosterContext

MINUTES_PER_DAY = 1440


class Rule(str, enum.Enum):
    """
    The scheduling rules a solved roster is audited against.

    Three things get confused if they share one field, so they are kept apart:

    - the **value** is the identity — stable, semantic, what code groups and
      tests match on, and what is stored in `roster.result`. It follows the
      same convention as RosterStatus.
    - `label` is the rule in words, for operators reading the audit panel.
    - `constraint` is the number of the matching block in generate_roster()
      ("C1".."C7"), purely a cross-reference for someone reading the solver or
      the design docs. Renumbering those comments must never change identity,
      which is exactly why it is not the value.

    `consecutive_days` has no constraint number: consecutive days are a soft
    objective term in the solver, and the audit only re-checks the bookkeeping.
    """
    one_shift_per_day   = "one_shift_per_day"
    contracted_hours    = "contracted_hours"
    shift_cover         = "shift_cover"
    permitted_shifts    = "permitted_shifts"
    booked_leave        = "booked_leave"
    days_without_demand = "days_without_demand"
    rest_rules          = "rest_rules"
    consecutive_days    = "consecutive_days"

    @property
    def label(self) -> str:
        return _RULE_META[self][0]

    @property
    def constraint(self) -> str | None:
        return _RULE_META[self][1]


# rule -> (operator-facing label, constraint number in generate_roster())
_RULE_META: dict[Rule, tuple[str, str | None]] = {
    Rule.one_shift_per_day:   ("One shift per day",    "C1"),
    Rule.contracted_hours:    ("Contracted hours",     "C2"),
    Rule.shift_cover:         ("Shift cover",          "C3"),
    Rule.permitted_shifts:    ("Permitted shifts",     "C4"),
    Rule.booked_leave:        ("Booked leave",         "C5"),
    Rule.days_without_demand: ("Days with no demand",  "C6"),
    Rule.rest_rules:          ("Rest rules",           "C7"),
    Rule.consecutive_days:    ("Consecutive days",     None),
}


@dataclass
class Violation:
    """
    A single rule breach found in a solved roster.

    Serialised into `roster.result["violations"]` by the solver task and
    rendered by the frontend, whose RosterViolation interface
    (frontend/src/api/rosters.ts) mirrors these fields — keep the two in step.

    `label` and `constraint` are derived from `rule`, so no caller has to
    remember to pass them.
    """
    rule:        Rule
    message:     str          # plain-English description for operators
    employee_id: str | None = None
    day:         int | None = None
    label:       str = ""
    constraint:  str | None = None

    def __post_init__(self) -> None:
        if not self.label:
            self.label = self.rule.label
        if self.constraint is None:
            self.constraint = self.rule.constraint


def hhmm(minute: int) -> str:
    """Format a minutes-from-midnight value as HH:MM, wrapping past midnight."""
    minute %= MINUTES_PER_DAY
    return f"{minute // 60:02d}:{minute % 60:02d}"


def expand_group(group: str, shifts: list[Shift]) -> set[str]:
    """
    The shift codes belonging to a ShiftGroup code, or every code when the
    group is "*" (the wildcard ConditionalConstraint accepts on both sides).
    """
    if group == "*":
        return {s.code for s in shifts}
    return {s.code for s in shifts if s.shift_group.code == group}


def assignment_grid(result: dict) -> dict[tuple[str, int], list[Shift]]:
    """
    (employee_id, day) -> the Shift objects assigned there, built from the
    in-memory result dict returned by generate_roster().
    """
    shift_by_code = {s.code: s for s in result["shifts"]}
    grid: dict[tuple[str, int], list[Shift]] = {}
    for (emp_id, d, code), val in result["assignments"].items():
        if val == 1:
            grid.setdefault((emp_id, d), []).append(shift_by_code[code])
    return grid


def staff_on_duty(
    day:            int,
    minute:         int,
    *,
    employee_ids:   Collection[str],
    work_shifts_on: Callable[[str, int], list[Shift]],
    num_days:       int,
    shift_by_code:  dict[str, Shift],
    context:        RosterContext | None = None,
) -> set[str]:
    """
    The employee ids physically present at `minute` (0-1439) of `day`.

    Presence, not assignment: an overnight shift started on day-1 still has
    people on the floor in the early hours of `day`, and `context` carries the
    same effect across the roster's start boundary.

    `work_shifts_on(employee_id, day)` supplies the work shifts assigned to one
    employee on one day, so a caller can ask this of a hypothetical grid as
    easily as of a solved one.
    """
    on: set[str] = set()
    for emp_id in employee_ids:
        for s_day in (day - 1, day):
            if not 0 <= s_day < num_days:
                continue
            for sh in work_shifts_on(emp_id, s_day):
                overnight = sh.end_time <= sh.start_time
                if s_day == day:
                    covers = minute >= sh.start_time and (overnight or minute < sh.end_time)
                else:
                    covers = overnight and minute < sh.end_time
                if covers:
                    on.add(emp_id)

    # Overnight tails carried over from the previous roster cover day 0
    if day == 0 and context:
        for emp_id, code in context.carry_night_shifts.items():
            sh = shift_by_code.get(code)
            if sh and minute < sh.end_time and emp_id in employee_ids:
                on.add(emp_id)
    return on


def rest_rule_violations(
    employee_id: str,
    codes_on:    Callable[[int], set[str]],
    *,
    rules:       list[ConditionalConstraint],
    num_days:    int,
    shifts:      list[Shift],
    context:     RosterContext | None = None,
) -> list[Violation]:
    """
    Check one employee's row against the conditional if/then rest rules,
    including rules triggered by a shift carried over from a previous roster.

    These are the rules a profile configures as `conditional_constraints`, of
    the form "a night shift on day d blocks every shift on day d+1".

    `codes_on(day)` returns the shift codes assigned to this employee on that
    day; days outside 0..num_days-1 are never asked for. Returns the violations
    found, empty when the row is clean.
    """
    violations: list[Violation] = []

    def check_enforcement(rule: ConditionalConstraint, target_d: int, origin: str) -> None:
        enforce = expand_group(rule.enforce, shifts)
        if not enforce:
            return
        at_target = codes_on(target_d)
        if rule.enforce_val == 0 and at_target & enforce:
            violations.append(Violation(
                Rule.rest_rules,
                f"{employee_id} has {', '.join(sorted(at_target & enforce))} on day {target_d}, "
                f"blocked by rule ({origin})",
                employee_id, target_d,
            ))
        elif rule.enforce_val == 1 and not enforce <= at_target:
            violations.append(Violation(
                Rule.rest_rules,
                f"{employee_id} is missing forced shift(s) {', '.join(sorted(enforce - at_target))} "
                f"on day {target_d} ({origin})",
                employee_id, target_d,
            ))

    for rule in rules:
        trigger = expand_group(rule.trigger, shifts)
        if not trigger or not expand_group(rule.enforce, shifts):
            continue
        for d in range(num_days):
            target_d = d + rule.offset
            if not 0 <= target_d < num_days:
                continue
            here  = codes_on(d)
            fired = bool(here & trigger) if rule.trigger_val == 1 else not here & trigger
            if fired:
                check_enforcement(rule, target_d, f"{rule.trigger} on day {d}")

    if context:
        carry = context.carry_shifts.get(employee_id)
        if carry:
            trigger_code, days_ago = carry
            for rule in rules:
                if rule.trigger != trigger_code or rule.trigger_val != 1:
                    continue
                target_d = days_ago + rule.offset
                if 0 <= target_d < num_days:
                    check_enforcement(
                        rule, target_d,
                        f"{trigger_code} carried over from previous roster",
                    )

    return violations
