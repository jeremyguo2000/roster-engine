"""
Replacement suggestions for a single absence — DESIGN.md §2, Phase 3.

A nurse calls in sick. The ward manager needs an answer in seconds, not a
re-solve: who is off duty, allowed to work this shift, qualified for whatever
the shift was covering, and wouldn't breach a rest rule by taking it?

Every one of those is answerable from the stored roster, so nothing here runs
CP-SAT. It reuses the audit's own primitives (solver/rules.py) rather than
re-deriving the rules, so a candidate this module clears is a candidate
validate_roster() would not complain about.

One rule is deliberately *not* enforced: contracted hours (C2). Covering an
extra shift puts someone over their exact target — that is what overtime is,
and refusing every candidate on those grounds would return an empty list every
time. It is reported per candidate as `target_delta` and left to the operator.

Like the rest of solver/, this is pure: no FastAPI, SQLAlchemy or Celery.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, timedelta

from solver.models import Demand, Shift, Skill, Staff
from solver.rules import (
    MINUTES_PER_DAY,
    assignment_grid,
    hhmm,
    rest_rule_violations,
    staff_on_duty,
)
from solver.solver import ConditionalConstraint, RosterContext


@dataclass
class CoverageGap:
    """A demand that falls below its headcount once the absent staff is removed."""
    date:            date
    start_time:      int
    end_time:        int
    headcount:       int
    present:         int              # headcount actually on at the worst minute
    worst_minute:    int
    skills_required: list[Skill] = field(default_factory=list)

    @property
    def short_by(self) -> int:
        return self.headcount - self.present

    def describe(self) -> str:
        skill = ""
        if self.skills_required:
            skill = " with " + ", ".join(f"{s.key}={s.value}" for s in self.skills_required)
        return (
            f"{self.date} {hhmm(self.start_time)}-{hhmm(self.end_time)} needs "
            f"{self.headcount} staff{skill}, {self.present} on at {hhmm(self.worst_minute)}"
        )


@dataclass
class Candidate:
    """One staff member who could take the uncovered shift."""
    employee_id:     str
    fullname:        str
    consec_run:      int    # consecutive working days they'd be on, counting this one
    work_min_before: int
    work_min_after:  int
    target_delta:    int    # minutes over (+) or under (-) contracted hours afterwards
    nights:          int    # night shifts already worked this roster
    weekends:        int    # weekend days already worked this roster
    covers_gaps:     bool   # meets the skills every open gap asks for
    notes:           list[str] = field(default_factory=list)

    @property
    def sort_key(self) -> tuple:
        """
        Least-disruptive first. Someone who closes the gap outright beats
        someone who only half-closes it; then whoever is furthest from
        overtime, most rested, and carrying the lightest night/weekend load.
        """
        return (
            not self.covers_gaps,
            max(self.target_delta, 0),
            self.consec_run,
            self.nights + self.weekends,
            self.employee_id,
        )


@dataclass
class Replacements:
    """The answer to "X is off on day D — now what?"."""
    absent_employee_id: str
    absent_fullname:    str
    day:                int
    date:               date
    shift:              Shift | None
    gaps:               list[CoverageGap] = field(default_factory=list)
    candidates:         list[Candidate]   = field(default_factory=list)
    excluded:           dict[str, int]    = field(default_factory=dict)
    message:            str | None        = None


def suggest_replacements(
    result:                  dict,
    absent_employee_id:      str,
    day:                     int,
    target_work_min:         int,
    conditional_constraints: list[ConditionalConstraint] | None = None,
    context:                 RosterContext | None = None,
    limit:                   int | None = None,
) -> Replacements:
    """
    Rank the staff who could cover `absent_employee_id`'s shift on `day`.

    `result` is the in-memory result dict (as validate_roster takes), and must
    carry full Staff objects — skills and permitted shifts are what the filter
    turns on, and the minimal Staff that _json_to_result() rebuilds do not have
    them.

    Returns a Replacements with the coverage that actually breaks, the ranked
    candidates, and a tally of why everyone else was ruled out.
    """
    staff_list: list[Staff]  = result["staff"]
    shifts:     list[Shift]  = result["shifts"]
    demands:    list[Demand] = result["demands"]
    num_days:   int          = result["num_days"]
    roster_start: date       = result["roster_start"]

    rules         = conditional_constraints or []
    shift_by_code = {s.code: s for s in shifts}
    staff_by_id   = {s.employee_id: s for s in staff_list}
    grid          = assignment_grid(result)
    the_date      = roster_start + timedelta(days=day)

    absent = staff_by_id.get(absent_employee_id)
    if absent is None:
        return Replacements(
            absent_employee_id, "", day, the_date, None,
            message=f"{absent_employee_id} is not in this roster.",
        )

    def work_shifts_on(emp_id: str, d: int) -> list[Shift]:
        return [s for s in grid.get((emp_id, d), []) if s.shift_group.is_work_shift]

    dropped = work_shifts_on(absent_employee_id, day)
    if not dropped:
        return Replacements(
            absent_employee_id, absent.fullname, day, the_date, None,
            message=(
                f"{absent.fullname} is not rostered to work on {the_date} — "
                "nothing to cover."
            ),
        )
    shift = dropped[0]

    # ── What breaks: coverage with the absent member taken out ──────────────
    def without_absent(emp_id: str, d: int) -> list[Shift]:
        if emp_id == absent_employee_id and d == day:
            return []
        return work_shifts_on(emp_id, d)

    gaps = _coverage_gaps(
        demands, roster_start, num_days, day,
        employee_ids=staff_by_id, work_shifts_on=without_absent,
        shift_by_code=shift_by_code, staff_by_id=staff_by_id, context=context,
    )
    # Every gap the replacement must be qualified for.
    required_skills: list[Skill] = []
    for gap in gaps:
        for skill in gap.skills_required:
            if skill not in required_skills:
                required_skills.append(skill)

    # ── Who could take it ───────────────────────────────────────────────────
    candidates: list[Candidate] = []
    excluded: dict[str, int] = {}

    def rule_out(reason: str) -> None:
        excluded[reason] = excluded.get(reason, 0) + 1

    for staff in staff_list:
        emp_id = staff.employee_id
        if emp_id == absent_employee_id:
            continue

        rostered = grid.get((emp_id, day), [])
        if rostered:
            rule_out(
                "already working that day"
                if any(sh.shift_group.is_work_shift for sh in rostered)
                else "on leave that day"
            )
            continue

        if staff.permitted_shifts and shift.code not in {s.code for s in staff.permitted_shifts}:
            rule_out(f"not permitted to work {shift.code}")
            continue

        # Would taking this shift break a rest rule, in either direction?
        def codes_on(d: int, _e: str = emp_id) -> set[str]:
            codes = {sh.code for sh in grid.get((_e, d), [])}
            return codes | {shift.code} if d == day else codes

        if rest_rule_violations(emp_id, codes_on, rules=rules, num_days=num_days,
                                shifts=shifts, context=context):
            rule_out("would breach a rest rule")
            continue

        candidates.append(_profile_candidate(
            staff, shift, day, num_days, roster_start, grid,
            work_shifts_on=work_shifts_on,
            target_work_min=target_work_min,
            required_skills=required_skills,
            context=context,
        ))

    candidates.sort(key=lambda c: c.sort_key)
    if limit is not None:
        candidates = candidates[:limit]

    message = None
    if not candidates:
        message = "No one is free and eligible to cover this shift."
    elif not gaps:
        message = (
            "Coverage still holds without a replacement — the shift can be left "
            "uncovered if you accept the reduced headcount."
        )

    return Replacements(
        absent_employee_id, absent.fullname, day, the_date, shift,
        gaps=gaps, candidates=candidates, excluded=excluded, message=message,
    )


def _coverage_gaps(
    demands, roster_start, num_days, day, *,
    employee_ids, work_shifts_on, shift_by_code, staff_by_id, context,
) -> list[CoverageGap]:
    """
    Demands that fall short once the absent member is removed.

    Only the absence day and the one after it are walked: a shift can only
    affect the day it starts on and, if it runs overnight, the following
    morning.
    """
    day_of_date = {roster_start + timedelta(days=d): d for d in range(num_days)}
    affected = {day, day + 1}

    gaps: list[CoverageGap] = []
    for demand in demands:
        d = day_of_date.get(demand.date)
        if d is None or d not in affected:
            continue
        end = demand.end_time
        if end <= demand.start_time:
            end += MINUTES_PER_DAY

        worst: tuple[int, int] | None = None
        for t in range(demand.start_time, end):
            present = staff_on_duty(
                d + t // MINUTES_PER_DAY, t % MINUTES_PER_DAY,
                employee_ids=employee_ids, work_shifts_on=work_shifts_on,
                num_days=num_days, shift_by_code=shift_by_code, context=context,
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
            gaps.append(CoverageGap(
                date=demand.date, start_time=demand.start_time, end_time=demand.end_time,
                headcount=demand.headcount, present=worst[1], worst_minute=worst[0],
                skills_required=list(demand.skillset_required),
            ))
    return gaps


def _profile_candidate(
    staff, shift, day, num_days, roster_start, grid, *,
    work_shifts_on, target_work_min, required_skills, context,
) -> Candidate:
    """Measure what taking the shift would cost this staff member."""
    emp_id = staff.employee_id

    worked_min = sum(
        sh.work_time
        for d in range(num_days)
        for sh in grid.get((emp_id, d), [])
    )
    after = worked_min + shift.work_time

    nights = sum(
        1 for d in range(num_days)
        for sh in work_shifts_on(emp_id, d)
        if sh.shift_group.is_night_shift
    )
    weekends = sum(
        1 for d in range(num_days)
        if work_shifts_on(emp_id, d)
        and (roster_start + timedelta(days=d)).weekday() >= 5
    )

    # The consecutive run this shift would sit in, seeded by any run carried
    # over from the previous roster.
    def works(d: int) -> bool:
        return d == day or bool(work_shifts_on(emp_id, d))

    run = 1
    d = day - 1
    while d >= 0 and works(d):
        run += 1
        d -= 1
    if d < 0 and context:
        run += context.carry_consec.get(emp_id, 0)
    d = day + 1
    while d < num_days and works(d):
        run += 1
        d += 1

    covers = staff.meets_requirements(required_skills) if required_skills else True

    notes: list[str] = []
    delta = after - target_work_min
    if delta > 0:
        notes.append(f"{delta} min over contracted hours")
    if run >= 5:
        notes.append(f"{run} consecutive days")
    if not covers:
        missing = [f"{s.key}={s.value}" for s in required_skills
                   if not staff.meets_requirements([s])]
        notes.append("does not meet " + ", ".join(missing))
    if (roster_start + timedelta(days=day)).weekday() >= 5:
        notes.append("weekend day")

    return Candidate(
        employee_id=emp_id, fullname=staff.fullname,
        consec_run=run, work_min_before=worked_min, work_min_after=after,
        target_delta=delta, nights=nights, weekends=weekends,
        covers_gaps=covers, notes=notes,
    )
