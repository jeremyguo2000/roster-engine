import logging
from dataclasses import asdict

from app.database import SessionLocal
from app.models import Roster, RosterStatus
from app.roster_inputs import build_solver_inputs, conditional_constraints
from app.worker.celery_app import celery_app

from solver.models import (
    Shift      as SolverShift,
    ShiftGroup as SolverShiftGroup,
    Staff      as SolverStaff,
)
from solver.solver import RosterEngine
from solver.validate import validate_roster

logger = logging.getLogger(__name__)


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
    consec_days_json = {}
    
    for n, s in enumerate(staff_list):
        if consec_days_raw:
            staff_max_consec[s.employee_id] = max(
                (consec_days_raw.get((n, d), 0) for d in range(num_days)),
                default=0,
            )
            consec_days_json[s.employee_id] = {
                d: consec_days_raw.get((n, d), 0) for d in range(num_days)
            }

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
        "consec_days":      consec_days_json,
        "shifts": {
            s.code: {
                "name":       s.name,
                "group":      s.shift_group.code,
                "is_work_shift":  s.shift_group.is_work_shift,
                "is_night_shift": s.shift_group.is_night_shift,
                "start_time": s.start_time,
                "end_time":   s.end_time,
                "work_time":  s.work_time,
            }
            for s in result["shifts"]
        },
    }
 
 
def _json_to_result(result_json: dict) -> dict:
    """
    Reconstruct an in-memory result dict (with tuple keys and Staff/Shift dataclasses)
    from the JSON-serialised result. Used to rebuild context for chained rosters.
    """
    from datetime import date as date_type
 
    # Rebuild Staff objects (minimal, with employee_id and fullname only)
    staff_list = [
        SolverStaff(
            employee_id=s["employee_id"],
            fullname=s["fullname"],
            skillset=[],
            permitted_shifts=[],
        )
        for s in result_json["staff"]
    ]
 
    # Rebuild Shift objects with shift_group reconstructed
    shifts = []
    for code, s in result_json["shifts"].items():
        sg = SolverShiftGroup(
            code=s["group"],
            is_work_shift=s.get("is_work_shift", True),
            is_night_shift=s.get("is_night_shift", False),
        )
        shifts.append(SolverShift(
            code=code,
            name=s["name"],
            shift_group=sg,
            start_time=s["start_time"],
            end_time=s["end_time"],
            work_time=s["work_time"],
            break_time=0,
        ))
 
    # Rebuild assignments dict with tuple keys
    assignments = {}
    for emp_id, day_dict in result_json["assignments"].items():
        for day_str, shift_code in day_dict.items():
            assignments[(emp_id, int(day_str), shift_code)] = 1
 
    # Rebuild consec_days dict with tuple keys (n, d)
    consec_days = {}
    consec_days_json = result_json.get("consec_days", {})
    for n, s in enumerate(staff_list):
        emp_consec = consec_days_json.get(s.employee_id, {})
        for day_str, val in emp_consec.items():
            consec_days[(n, int(day_str))] = val
 
    return {
        "assignments":  assignments,
        "consec_days":  consec_days,
        "staff":        staff_list,
        "shifts":       shifts,
        "num_days":     result_json["num_days"],
        "roster_start": date_type.fromisoformat(result_json["roster_start"]),
    }


@celery_app.task(bind=True)
def run_solver(self, roster_id: int, time_limit: int = 600, previous_roster_id: int | None = None):
    db = SessionLocal()
    try:
        roster: Roster = db.get(Roster, roster_id)
        if not roster:
            logger.error(f"Roster {roster_id} not found")
            return

        config: dict = roster.profile.config

        shifts, staff, demands, leave_tuples = build_solver_inputs(db, roster)

        ccs = conditional_constraints(roster.profile)

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
            )
 
        # Build roster context from previous roster, if provided
        context = None
        if previous_roster_id:
            prev_roster = db.get(Roster, previous_roster_id)
            if prev_roster and prev_roster.result and "assignments" in prev_roster.result:
                prev_result = _json_to_result(prev_roster.result)
                context = engine.build_roster_context(prev_result, roster.roster_start)
                logger.info(f"Built roster context from roster {previous_roster_id}: "
                            f"carry_consec={context.carry_consec}, carry_shifts={context.carry_shifts}")
            else:
                logger.warning(f"Previous roster {previous_roster_id} has no result; "
                               f"proceeding without context")

        result = engine.generate_roster(
            roster_start=roster.roster_start,
            num_days=roster.num_days,
            target_work_min=roster.target_work_min,
            demands=demands,
            pre_assignments=pre_assignments,
            context=context,
        )

        if result is None:
            roster.status = RosterStatus.failed
            roster.result = {"error": "No feasible solution found within time limit."}
        else:
            roster.status = RosterStatus.draft
            result_json = _result_to_json(result)
            try:
                violations = validate_roster(
                    result,
                    target_work_min=roster.target_work_min,
                    pre_assignments=pre_assignments,
                    conditional_constraints=ccs,
                    context=context,
                )
                result_json["violations"] = [asdict(v) for v in violations]
                if violations:
                    logger.warning(
                        f"Roster {roster_id}: validator found {len(violations)} rule "
                        f"violation(s): {[v.message for v in violations]}"
                    )
            except Exception:
                # The audit must never take down a successful solve.
                logger.exception(f"Roster {roster_id}: post-solve validation crashed")
            roster.result = result_json

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
