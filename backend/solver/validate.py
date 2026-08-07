from __future__ import annotations
from datetime import timedelta

from solver.models import Shift, Staff
from solver.rules import (
    MINUTES_PER_DAY,
    Rule,
    Violation,
    assignment_grid,
    hhmm,
    rest_rule_violations,
    staff_on_duty,
)
from solver.solver import ConditionalConstraint, RosterContext

__all__ = ["Rule", "Violation", "validate_roster"]


def validate_roster(
    result:                  dict,
    target_work_min:         int,
    pre_assignments:         list[tuple[int, int, int]] | None = None,
    conditional_constraints: list[ConditionalConstraint] | None = None,
    context:                 RosterContext | None = None,
) -> list[Violation]:
    """
    Independently audit a solved roster against the rules the solver was
    asked to enforce (C1-C7, plus the consecutive-day bookkeeping).

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
    solver's C3 silently skips.

    The primitives it shares with the replacement suggester (the coverage
    walk, the rest-rule check) live in solver/rules.py.
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

    assigned = assignment_grid(result)

    def work_shifts_on(emp_id: str, d: int) -> list[Shift]:
        return [s for s in assigned.get((emp_id, d), []) if s.shift_group.is_work_shift]

    def codes_on(emp_id: str, d: int) -> set[str]:
        return {sh.code for sh in assigned.get((emp_id, d), [])}

    violations: list[Violation] = []

    # ── C1: at most one work shift per staff per day ────────────────────
    for staff in staff_list:
        for d in range(num_days):
            work = work_shifts_on(staff.employee_id, d)
            if len(work) > 1:
                codes = ", ".join(s.code for s in work)
                violations.append(Violation(
                    Rule.one_shift_per_day,
                    f"{staff.employee_id} has {len(work)} work shifts on day {d}: {codes}",
                    staff.employee_id, d,
                ))

    # ── C2: exact target minutes per staff (all shifts count, incl. leaves)
    for staff in staff_list:
        total = sum(
            s.work_time
            for d in range(num_days)
            for s in assigned.get((staff.employee_id, d), [])
        )
        if total != target_work_min:
            violations.append(Violation(
                Rule.contracted_hours,
                f"{staff.employee_id} works {total} min, target is {target_work_min} min",
                staff.employee_id,
            ))

    # ── C3: demand coverage, checked minute by minute ───────────────────
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
            present = staff_on_duty(
                d + t // MINUTES_PER_DAY, t % MINUTES_PER_DAY,
                employee_ids=staff_by_id,
                work_shifts_on=work_shifts_on,
                num_days=num_days,
                shift_by_code=shift_by_code,
                context=context,
            )
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
                Rule.shift_cover,
                f"Demand {demand.date} {hhmm(demand.start_time)}-{hhmm(demand.end_time)} "
                f"needs {demand.headcount} staff{skill} but has {worst[1]} at {hhmm(worst[0])}",
                day=d,
            ))

    # ── C4: only permitted work shifts ──────────────────────────────────
    for staff in staff_list:
        if not staff.permitted_shifts:
            continue
        permitted = {s.code for s in staff.permitted_shifts}
        for d in range(num_days):
            for sh in work_shifts_on(staff.employee_id, d):
                if sh.code not in permitted:
                    violations.append(Violation(
                        Rule.permitted_shifts,
                        f"{staff.employee_id} assigned non-permitted shift {sh.code} on day {d}",
                        staff.employee_id, d,
                    ))

    # ── C5: pre-assigned leaves honoured; no stray rest shifts ──────────
    for n, d, s_idx in pre_assigned:
        emp_id, code = staff_list[n].employee_id, shifts[s_idx].code
        if code not in codes_on(emp_id, d):
            violations.append(Violation(
                Rule.booked_leave,
                f"Pre-assigned {code} for {emp_id} on day {d} is missing",
                emp_id, d,
            ))
    for (emp_id, d), shs in assigned.items():
        for sh in shs:
            if sh.shift_group.is_work_shift:
                continue
            n, s_idx = emp_to_n.get(emp_id), code_to_s.get(sh.code)
            if (n, d, s_idx) not in pre_assigned:
                violations.append(Violation(
                    Rule.booked_leave,
                    f"{emp_id} has rest shift {sh.code} on day {d} that was never pre-assigned",
                    emp_id, d,
                ))

    # ── C6: no work on days with no demand ──────────────────────────────
    demand_days = {day_of_date[dem.date] for dem in demands if dem.date in day_of_date}
    for d in range(num_days):
        if d in demand_days:
            continue
        for staff in staff_list:
            for sh in work_shifts_on(staff.employee_id, d):
                violations.append(Violation(
                    Rule.days_without_demand,
                    f"{staff.employee_id} works {sh.code} on day {d}, which has no demand",
                    staff.employee_id, d,
                ))

    # ── C7: conditional if/then rest rules, incl. carry-over from context ─
    for staff in staff_list:
        violations.extend(rest_rule_violations(
            staff.employee_id,
            lambda d, _e=staff.employee_id: codes_on(_e, d),
            rules=rules,
            num_days=num_days,
            shifts=shifts,
            context=context,
        ))

    # ── consec: reported consecutive-day counts match a recount ─────────
    reported = result.get("consec_days") or {}
    if reported:
        for n, staff in enumerate(staff_list):
            run = context.carry_consec.get(staff.employee_id, 0) if context else 0
            for d in range(num_days):
                run = run + 1 if work_shifts_on(staff.employee_id, d) else 0
                if reported.get((n, d)) != run:
                    violations.append(Violation(
                        Rule.consecutive_days,
                        f"{staff.employee_id} day {d}: reported consecutive-day count "
                        f"{reported.get((n, d))} but recount gives {run}",
                        staff.employee_id, d,
                    ))

    return violations