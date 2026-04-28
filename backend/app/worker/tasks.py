import logging
from datetime import date, timedelta

from celery import shared_task
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Roster, RosterStatus, Staff, StaffSkill, StaffPermittedShift,
    Leave, Profile, ProfileStaff, ProfileShift, Shift, ShiftGroup,
    Demand, SkillValue,
)
from app.worker.celery_app import celery_app

# Import your existing solver
from solver.models import (
    Shift as SolverShift,
    ShiftGroup as SolverShiftGroup,
    Staff as SolverStaff,
    Skill as SolverSkill,
    Demand as SolverDemand,
)
from solver.solver import RosterEngine, RosterContext

logger = logging.getLogger(__name__)


def _build_solver_inputs(db: Session, roster: Roster):
    """Translate DB records into solver domain objects."""
    profile: Profile = roster.profile

    # ── Shift groups ────────────────────────────────────────────────
    all_shift_groups: list[ShiftGroup] = db.query(ShiftGroup).all()
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
    shifts_db: list[Shift] = (
        db.query(Shift).filter(Shift.id.in_(profile_shift_ids)).all()
    )
    solver_shifts = {
        s.id: SolverShift(
            code=s.code,
            name=s.name,
            group=solver_groups[s.group_id],
            start_min=s.start_min,
            end_min=s.end_min,
            work_min=s.work_min,
            break_min=s.break_min,
        )
        for s in shifts_db
    }

    # ── Active (non-excluded, non-deleted) staff ────────────────────
    active_profile_staff = [
        ps for ps in profile.profile_staff
        if not ps.excluded and not ps.staff.deleted
    ]
    staff_db: list[Staff] = [ps.staff for ps in active_profile_staff]

    solver_staff = []
    for s in staff_db:
        # Skills
        skillset = [
            SolverSkill(key=sv.skill_value.skill_type.name, value=sv.skill_value.value)
            for sv in s.skills
        ]
        # Permitted shifts (None = all permitted)
        if s.permitted_shifts:
            permitted = [
                solver_shifts[ps.shift_id]
                for ps in s.permitted_shifts
                if ps.shift_id in solver_shifts
            ]
        else:
            permitted = list(solver_shifts.values())

        solver_staff.append(
            SolverStaff(
                name=s.full_name,
                skillset=skillset,
                permitted_shifts=permitted,
            )
        )

    # ── Demands ─────────────────────────────────────────────────────
    solver_demands = []
    for d in roster.demands:
        skill_filter = None
        if d.skill_value_id:
            sv: SkillValue = db.get(SkillValue, d.skill_value_id)
            skill_filter = SolverSkill(
                key=sv.skill_type.name,
                value=sv.value,
            )
        solver_demands.append(
            SolverDemand(
                date=d.date,
                start_min=d.start_min,
                end_min=d.end_min,
                headcount=d.headcount,
                skill_filter=skill_filter,
            )
        )

    # ── Leaves as pre-assignments ───────────────────────────────────
    roster_dates = {
        roster.roster_start + timedelta(days=i)
        for i in range(roster.num_days)
    }
    leaves_db: list[Leave] = (
        db.query(Leave)
        .filter(
            Leave.staff_id.in_([s.id for s in staff_db]),
            Leave.date.in_(roster_dates),
        )
        .all()
    )
    staff_name_map = {s.full_name: s for s in staff_db}
    pre_assignments = {}
    for leave in leaves_db:
        staff_obj = next((s for s in staff_db if s.id == leave.staff_id), None)
        if staff_obj:
            key = (staff_obj.full_name, leave.date)
            pre_assignments[key] = leave.shift_code

    return (
        list(solver_shifts.values()),
        solver_staff,
        solver_demands,
        pre_assignments,
    )


@celery_app.task(bind=True)
def run_solver(self, roster_id: int, target_minutes: int, time_limit: int = 600):
    db: Session = SessionLocal()
    try:
        roster: Roster = db.get(Roster, roster_id)
        if not roster:
            logger.error(f"Roster {roster_id} not found")
            return

        config: dict = roster.profile.config
        shifts, staff, demands, pre_assignments = _build_solver_inputs(db, roster)

        engine = RosterEngine(
            shifts=shifts,
            staff=staff,
            num_days=roster.num_days,
            start_date=roster.roster_start,
            target_work_minutes=target_minutes,
            time_limit=time_limit,
            weights=config.get("weights", {}),
            conditional_constraints=config.get("conditional_constraints", []),
            lookahead_days=config.get("lookahead_days", 1),
        )

        if pre_assignments:
            engine.build_pre_assignments_for_leaves(pre_assignments)

        result = engine.solve()

        if result is None:
            roster.status = RosterStatus.failed
            roster.result = {"error": "No feasible solution found within time limit."}
        else:
            roster.status = RosterStatus.draft
            roster.result = result

        db.commit()

    except Exception as exc:
        logger.exception(f"Solver task failed for roster {roster_id}: {exc}")
        try:
            roster = db.get(Roster, roster_id)
            if roster:
                roster.status = RosterStatus.failed
                roster.result = {"error": str(exc)}
                db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()
