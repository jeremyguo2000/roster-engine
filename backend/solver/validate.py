from __future__ import annotations
from dataclasses import dataclass
from datetime import timedelta

from solver.models import Shift, Staff
from solver.solver import ConditionalConstraint, RosterContext

MINUTES_PER_DAY = 1440


@dataclass
class Violation:
    """A single rule violation found in a solved roster."""
    rule:        str          # constraint number ("C1".."C9") or "consec"
    message:     str          # plain-English description for operators
    employee_id: str | None = None
    day:         int | None = None


def _hhmm(minute: int) -> str:
    minute %= MINUTES_PER_DAY
    return f"{minute // 60:02d}:{minute % 60:02d}"


def validate_roster(
    result:                  dict,
    target_work_min:         int,
    pre_assignments:         list[tuple[int, int, int]] | None = None,
    conditional_constraints: list[ConditionalConstraint] | None = None,
    context:                 RosterContext | None = None,
) -> list[Violation]:
    """
    Independently audit a solved roster against the rules the solver was
    asked to enforce (C1, C4-C9, plus the consecutive-day bookkeeping).

    Takes the in-memory result dict returned by generate_roster() (the
    tuple-keyed form, before _result_to_json) together with the same
    inputs the solve received. Returns a list of Violations, empty when
    the roster is clean.

    This is deliberately NOT built on the solver's helpers
    (_shift_covers_checkpoint, _check_points): every rule is re-derived
    from the raw assignment grid using only the shift definitions, so a
    bug in the CP-SAT encoding and a bug here are unlikely to coincide.
    In particular, demand coverage is checked by walking every minute of
    every demand window, not by sampling check points — so it can also
    surface genuine under-coverage at times no shift covers, which the
    solver's C5 silently skips.
    """
    staff_list: list[Staff] = result["staff"]
    shifts:     list[Shift] = result["shifts"]
    demands                 = result["demands"]
    num_days:   int         = result["num_days"]
    roster_start            = result["roster_start"]

    pre_assigned = set(pre_assignments or [])
    rules        = conditional_constraints or []

    shift_by_code = {s.code: s for s in shifts}
    staff_by_id   = {s.employee_id: s for s in staff_list}
    emp_to_n      = {s.employee_id: n for n, s in enumerate(staff_list)}
    code_to_s     = {s.code: i for i, s in enumerate(shifts)}

    # (employee_id, day) -> list of assigned Shift objects
    assigned: dict[tuple[str, int], list[Shift]] = {}
    for (emp_id, d, code), val in result["assignments"].items():
        if val == 1:
            assigned.setdefault((emp_id, d), []).append(shift_by_code[code])

    def work_shifts_on(emp_id: str, d: int) -> list[Shift]:
        return [s for s in assigned.get((emp_id, d), []) if s.shift_group.is_work_shift]

    violations: list[Violation] = []

    # ── C1: at most one work shift per staff per day ────────────────────
    for staff in staff_list:
        for d in range(num_days):
            work = work_shifts_on(staff.employee_id, d)
            if len(work) > 1:
                codes = ", ".join(s.code for s in work)
                violations.append(Violation(
                    "C1", f"{staff.employee_id} has {len(work)} work shifts on day {d}: {codes}",
                    staff.employee_id, d,
                ))

    # ── C4: exact target minutes per staff (all shifts count, incl. leaves)
    for staff in staff_list:
        total = sum(
            s.work_time
            for d in range(num_days)
            for s in assigned.get((staff.employee_id, d), [])
        )
        if total != target_work_min:
            violations.append(Violation(
                "C4", f"{staff.employee_id} works {total} min, target is {target_work_min} min",
                staff.employee_id,
            ))

    # ── C5: demand coverage, checked minute by minute ───────────────────
    def on_duty(day: int, minute: int) -> set[str]:
        """Employee ids physically present at `minute` (0-1439) of `day`."""
        on = set()
        for staff in staff_list:
            for s_day in (day - 1, day):
                if not 0 <= s_day < num_days:
                    continue
                for sh in work_shifts_on(staff.employee_id, s_day):
                    overnight = sh.end_time <= sh.start_time
                    if s_day == day:
                        covers = minute >= sh.start_time and (overnight or minute < sh.end_time)
                    else:
                        covers = overnight and minute < sh.end_time
                    if covers:
                        on.add(staff.employee_id)
        # Overnight tails carried over from the previous roster cover day 0
        if day == 0 and context:
            for emp_id, code in context.carry_night_shifts.items():
                sh = shift_by_code.get(code)
                if sh and minute < sh.end_time and emp_id in staff_by_id:
                    on.add(emp_id)
        return on

    day_of_date = {roster_start + timedelta(days=d): d for d in range(num_days)}
    for demand in demands:
        d = day_of_date.get(demand.date)
        if d is None:
            continue
        end = demand.end_time
        if end <= demand.start_time:
            end += MINUTES_PER_DAY
        worst: tuple[int, int] | None = None  # (abs minute, headcount seen)
        for t in range(demand.start_time, end):
            present = on_duty(d + t // MINUTES_PER_DAY, t % MINUTES_PER_DAY)
            if demand.skillset_required:
                present = {
                    e for e in present
                    if e in staff_by_id
                    and staff_by_id[e].meets_requirements(demand.skillset_required)
                }
            if len(present) < demand.headcount and (worst is None or len(present) < worst[1]):
                worst = (t, len(present))
        if worst:
            skill = ""
            if demand.skillset_required:
                skill = " with " + ", ".join(f"{s.key}={s.value}" for s in demand.skillset_required)
            violations.append(Violation(
                "C5",
                f"Demand {demand.date} {_hhmm(demand.start_time)}-{_hhmm(demand.end_time)} "
                f"needs {demand.headcount} staff{skill} but has {worst[1]} at {_hhmm(worst[0])}",
                day=d,
            ))

    # ── C6: only permitted work shifts ──────────────────────────────────
    for staff in staff_list:
        if not staff.permitted_shifts:
            continue
        permitted = {s.code for s in staff.permitted_shifts}
        for d in range(num_days):
            for sh in work_shifts_on(staff.employee_id, d):
                if sh.code not in permitted:
                    violations.append(Violation(
                        "C6", f"{staff.employee_id} assigned non-permitted shift {sh.code} on day {d}",
                        staff.employee_id, d,
                    ))

    # ── C7: pre-assigned leaves honoured; no stray rest shifts ──────────
    for n, d, s_idx in pre_assigned:
        emp_id, code = staff_list[n].employee_id, shifts[s_idx].code
        if code not in {sh.code for sh in assigned.get((emp_id, d), [])}:
            violations.append(Violation(
                "C7", f"Pre-assigned {code} for {emp_id} on day {d} is missing",
                emp_id, d,
            ))
    for (emp_id, d), shs in assigned.items():
        for sh in shs:
            if sh.shift_group.is_work_shift:
                continue
            n, s_idx = emp_to_n.get(emp_id), code_to_s.get(sh.code)
            if (n, d, s_idx) not in pre_assigned:
                violations.append(Violation(
                    "C7", f"{emp_id} has rest shift {sh.code} on day {d} that was never pre-assigned",
                    emp_id, d,
                ))

    # ── C8: no work on days with no demand ──────────────────────────────
    demand_days = {day_of_date[dem.date] for dem in demands if dem.date in day_of_date}
    for d in range(num_days):
        if d in demand_days:
            continue
        for staff in staff_list:
            for sh in work_shifts_on(staff.employee_id, d):
                violations.append(Violation(
                    "C8", f"{staff.employee_id} works {sh.code} on day {d}, which has no demand",
                    staff.employee_id, d,
                ))

    # ── C9: conditional if/then rules, incl. carry-over from context ────
    def group_codes(group: str) -> set[str]:
        if group == "*":
            return set(shift_by_code)
        return {s.code for s in shifts if s.shift_group.code == group}

    def check_enforcement(rule: ConditionalConstraint, emp_id: str, target_d: int, origin: str):
        enforce = group_codes(rule.enforce)
        if not enforce:
            return
        at_target = {sh.code for sh in assigned.get((emp_id, target_d), [])}
        if rule.enforce_val == 0 and at_target & enforce:
            violations.append(Violation(
                "C9",
                f"{emp_id} has {', '.join(sorted(at_target & enforce))} on day {target_d}, "
                f"blocked by rule ({origin})",
                emp_id, target_d,
            ))
        elif rule.enforce_val == 1 and not enforce <= at_target:
            violations.append(Violation(
                "C9",
                f"{emp_id} is missing forced shift(s) {', '.join(sorted(enforce - at_target))} "
                f"on day {target_d} ({origin})",
                emp_id, target_d,
            ))

    for rule in rules:
        trigger = group_codes(rule.trigger)
        if not trigger or not group_codes(rule.enforce):
            continue
        for staff in staff_list:
            for d in range(num_days):
                target_d = d + rule.offset
                if not 0 <= target_d < num_days:
                    continue
                here = {sh.code for sh in assigned.get((staff.employee_id, d), [])}
                fired = bool(here & trigger) if rule.trigger_val == 1 else not here & trigger
                if fired:
                    check_enforcement(
                        rule, staff.employee_id, target_d,
                        f"{rule.trigger} on day {d}",
                    )

    if context:
        for emp_id, (trigger_code, days_ago) in context.carry_shifts.items():
            if emp_id not in staff_by_id:
                continue
            for rule in rules:
                if rule.trigger != trigger_code or rule.trigger_val != 1:
                    continue
                target_d = days_ago + rule.offset
                if 0 <= target_d < num_days:
                    check_enforcement(
                        rule, emp_id, target_d,
                        f"{trigger_code} carried over from previous roster",
                    )

    # ── consec: reported consecutive-day counts match a recount ─────────
    reported = result.get("consec_days") or {}
    if reported:
        for n, staff in enumerate(staff_list):
            run = context.carry_consec.get(staff.employee_id, 0) if context else 0
            for d in range(num_days):
                run = run + 1 if work_shifts_on(staff.employee_id, d) else 0
                if reported.get((n, d)) != run:
                    violations.append(Violation(
                        "consec",
                        f"{staff.employee_id} day {d}: reported consecutive-day count "
                        f"{reported.get((n, d))} but recount gives {run}",
                        staff.employee_id, d,
                    ))

    return violations
