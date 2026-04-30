import logging
from datetime import timedelta

from app.database import SessionLocal
from app.models import (
    Roster, RosterStatus, Leave, Profile,
    Shift, ShiftGroup, SkillValue, RosterDemand,
)
from app.worker.celery_app import celery_app

from solver.models import (
    Shift     as SolverShift,
    ShiftGroup as SolverShiftGroup,
    Staff     as SolverStaff,
    Skill     as SolverSkill,
    Demand    as SolverDemand,
)
from solver.solver import RosterEngine, ConditionalConstraint

logger = logging.getLogger(__name__)


def _build_solver_inputs(db, roster: Roster):
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

    # ── Leaves as (employee_id, date) tuples ────────────────────────
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
        (staff_id_to_employee_id[lv.staff_id], lv.date)
        for lv in leaves_db
        if lv.staff_id in staff_id_to_employee_id
    ]

    return list(solver_shifts.values()), solver_staff, solver_demands, leave_tuples


def _result_to_json(result: dict) -> dict:
    """Convert solver result dict to JSON-serialisable form."""
    assignments = {}
    for (emp_id, d, code), val in result["assignments"].items():
        if val == 1:
            assignments.setdefault(emp_id, {})[d] = code

    consec_days_raw = result.get("consec_days", {})
    staff_list      = result["staff"]
    num_days        = result["num_days"]

    staff_max_consec = {}
    for n, s in enumerate(staff_list):
        if consec_days_raw:
            staff_max_consec[s.employee_id] = max(
                (consec_days_raw.get((n, d), 0) for d in range(num_days)),
                default=0,
            )

    return {
        "assignments":      assignments,
        "max_consecutive":  result.get("max_consecutive"),
        "status":           result.get("status"),
        "roster_start":     result["roster_start"].isoformat(),
        "num_days":         result["num_days"],
        "staff": [
            {"employee_id": s.employee_id, "fullname": s.fullname}
            for s in staff_list
        ],
        "staff_max_consec": staff_max_consec,
        "shifts": {
            s.code: {
                "name":       s.name,
                "group":      s.shift_group.code,
                "start_time": s.start_time,
                "end_time":   s.end_time,
                "work_time":  s.work_time,
            }
            for s in result["shifts"]
        },
    }


@celery_app.task(bind=True)
def run_solver(self, roster_id: int, time_limit: int = 600):
    db = SessionLocal()
    try:
        roster: Roster = db.get(Roster, roster_id)
        if not roster:
            logger.error(f"Roster {roster_id} not found")
            return

        config: dict = roster.profile.config

        shifts, staff, demands, leave_tuples = _build_solver_inputs(db, roster)

        ccs = [
            ConditionalConstraint(
                trigger=cc["trigger"],
                trigger_val=cc["trigger_val"],
                offset=cc["offset"],
                enforce=cc["enforce"],
                enforce_val=cc["enforce_val"],
            )
            for cc in config.get("conditional_constraints", [])
        ]

        engine = RosterEngine(
            shifts=shifts,
            staff_list=staff,
            weight_overstaff=config.get("weight_overstaff", 20),
            weight_consec=config.get("weight_consec", 100),
            weight_burden=config.get("weight_burden", 10),
            weight_night=config.get("weight_night", 2),
            weight_weekend=config.get("weight_weekend", 1),
            time_limit_s=time_limit,
            conditional_constraints=ccs,
        )

        # Build pre-assignments from leaves
        pre_assignments = []
        if leave_tuples:
            pre_assignments = engine.build_pre_assignments_for_leaves(
                leaves=leave_tuples,
                roster_start=roster.roster_start,
                num_days=roster.num_days,
                shift_code="AL",
            )

        result = engine.generate_roster(
            roster_start=roster.roster_start,
            num_days=roster.num_days,
            target_work_min=roster.target_work_min,
            demands=demands,
            pre_assignments=pre_assignments,
        )

        if result is None:
            roster.status = RosterStatus.failed
            roster.result = {"error": "No feasible solution found within time limit."}
        else:
            roster.status = RosterStatus.draft
            roster.result = _result_to_json(result)

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
