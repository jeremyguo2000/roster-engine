"""
Translating DB rows into the solver's domain objects.

Shared by the Celery task that runs a solve and by the API when it asks a
solved roster questions after the fact (replacement suggestions). Both need
the same Profile-scoped view of shifts, staff and demands, so it is built in
one place.

This is the app-side half of the bridge described in CLAUDE.md; solver/ still
knows nothing about SQLAlchemy.
"""
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import Leave, Profile, Roster, Shift, ShiftGroup, SkillValue
from solver.models import (
    Demand     as SolverDemand,
    Shift      as SolverShift,
    ShiftGroup as SolverShiftGroup,
    Skill      as SolverSkill,
    Staff      as SolverStaff,
)
from solver.solver import ConditionalConstraint


def build_solver_inputs(db: Session, roster: Roster):
    """Translate DB records into solver domain objects."""
    profile: Profile = roster.profile

    # ── Shift groups ────────────────────────────────────────────────
    all_shift_groups = db.query(ShiftGroup).all()
    solver_groups = {
        sg.id: SolverShiftGroup(
            code=sg.code,
            is_work_shift=sg.is_work_shift,
            is_night_shift=sg.is_night_shift,
        )
        for sg in all_shift_groups
    }

    # ── Shifts included in profile ──────────────────────────────────
    profile_shift_ids = {ps.shift_id for ps in profile.profile_shifts}
    shifts_db = db.query(Shift).filter(Shift.id.in_(profile_shift_ids)).all()
    solver_shifts = {
        s.id: SolverShift(
            code=s.code,
            name=s.name,
            shift_group=solver_groups[s.group_id],
            start_time=s.start_min,
            end_time=s.end_min,
            work_time=s.work_min,
            break_time=s.break_min,
        )
        for s in shifts_db
    }

    # ── Active (non-excluded, non-deleted) staff ────────────────────
    active_profile_staff = [
        ps for ps in profile.profile_staff
        if not ps.excluded and not ps.staff.deleted
    ]

    solver_staff = []
    staff_db_list = []
    for ps in active_profile_staff:
        s = ps.staff
        staff_db_list.append(s)

        skillset = []
        for ss in s.skills:
            sv = db.get(SkillValue, ss.skill_value_id)
            if sv:
                skillset.append(SolverSkill(
                    key=sv.skill_type.name,
                    value=sv.value,
                ))

        # No permitted_shift rows = all shifts permitted
        if s.permitted_shifts:
            permitted = [
                solver_shifts[ps2.shift_id]
                for ps2 in s.permitted_shifts
                if ps2.shift_id in solver_shifts
            ]
        else:
            permitted = list(solver_shifts.values())

        solver_staff.append(SolverStaff(
            employee_id=s.employee_id,
            fullname=s.full_name,
            skillset=skillset,
            permitted_shifts=permitted,
        ))

    # ── Demands ─────────────────────────────────────────────────────
    solver_demands = []
    for rd in roster.roster_demands:
        d = rd.demand
        skill_filter = None
        if d.skill_value_id:
            sv = db.get(SkillValue, d.skill_value_id)
            if sv:
                skill_filter = SolverSkill(
                    key=sv.skill_type.name,
                    value=sv.value,
                )
        solver_demands.append(SolverDemand(
            date=d.date,
            start_time=d.start_min,
            end_time=d.end_min,
            headcount=d.headcount,
            skillset_required=[skill_filter] if skill_filter else [],
        ))

    # ── Leaves as (employee_id, date, shift_code) tuples ─────────────
    roster_dates = {
        roster.roster_start + timedelta(days=i)
        for i in range(roster.num_days)
    }
    staff_ids = [s.id for s in staff_db_list]
    leaves_db = (
        db.query(Leave)
        .filter(
            Leave.staff_id.in_(staff_ids),
            Leave.date.in_(roster_dates),
        )
        .all()
    )
    staff_id_to_employee_id = {s.id: s.employee_id for s in staff_db_list}
    leave_tuples = [
        (staff_id_to_employee_id[lv.staff_id], lv.date, lv.shift_code)
        for lv in leaves_db
        if lv.staff_id in staff_id_to_employee_id
    ]

    return list(solver_shifts.values()), solver_staff, solver_demands, leave_tuples


def conditional_constraints(profile: Profile) -> list[ConditionalConstraint]:
    """The profile's configured if/then rest rules, as solver objects."""
    return [
        ConditionalConstraint(
            trigger=cc["trigger"],
            trigger_val=cc["trigger_val"],
            offset=cc["offset"],
            enforce=cc["enforce"],
            enforce_val=cc["enforce_val"],
        )
        for cc in (profile.config or {}).get("conditional_constraints", [])
    ]


def rebuild_result(roster: Roster, shifts, staff, demands) -> dict:
    """
    The in-memory result dict for an already-solved roster, at full fidelity.

    _json_to_result() in the worker rebuilds Staff with no skills and no
    permitted shifts — enough to derive a RosterContext for chaining, but not
    for anything that filters on them. This pairs the stored assignment grid
    with the profile's real Staff, Shift and Demand objects instead.

    Raises ValueError if the stored grid references a shift the profile no
    longer contains, rather than silently dropping those assignments.
    """
    stored = roster.result or {}
    known = {s.code for s in shifts}

    assignments = {}
    unknown = set()
    for emp_id, day_dict in (stored.get("assignments") or {}).items():
        for day_str, code in day_dict.items():
            if code not in known:
                unknown.add(code)
                continue
            assignments[(emp_id, int(day_str), code)] = 1

    if unknown:
        raise ValueError(
            "Roster references shift(s) no longer in its profile: "
            + ", ".join(sorted(unknown))
        )

    return {
        "assignments":  assignments,
        "staff":        staff,
        "shifts":       shifts,
        "demands":      demands,
        "num_days":     roster.num_days,
        "roster_start": roster.roster_start,
        "consec_days":  {},
    }
