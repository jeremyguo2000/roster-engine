from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from datetime import date, timedelta

from app.database import get_db
from app.models import (
    Roster, RosterStatus, RosterDemand, Demand, Profile, Leave, SkillValue, User
)
from app.dependencies.auth import get_current_user
from app.roster_inputs import build_solver_inputs, conditional_constraints, rebuild_result
from app.schemas.roster import (
    CoverageGapOut, DemandOut, ReplacementCandidateOut, ReplacementsOut,
    RosterCreate, RosterListItem, RosterOut, ShiftRef,
)
from app.worker.tasks import run_solver
from solver.swaps import suggest_replacements

router = APIRouter(prefix="/rosters", tags=["Rosters"])


@router.get("", response_model=list[RosterListItem])
def list_rosters(
    status: RosterStatus | None = None,
    profile_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Roster).options(joinedload(Roster.profile))
    if status:
        q = q.filter(Roster.status == status)
    if profile_id:
        q = q.filter_by(profile_id=profile_id)
    return q.order_by(Roster.roster_start.desc()).all()


@router.post("", response_model=RosterOut, status_code=status.HTTP_201_CREATED)
def create_and_run_roster(body: RosterCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a roster, link its demand rows, then dispatch the solver.

    Demands may be referenced by id (`demand_ids`, already created) or supplied
    inline (`demands`, created here). Inline demands are created in the same
    transaction as the roster, so a failure anywhere leaves nothing behind.
    """
    if not db.get(Profile, body.profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")

    # Validate all demand_ids exist
    for demand_id in body.demand_ids:
        if not db.get(Demand, demand_id):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"Demand id {demand_id} not found."
            )

    # Validate inline demands' skill references before writing anything
    for d in body.demands:
        if d.skill_value_id and not db.get(SkillValue, d.skill_value_id):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"Skill value id {d.skill_value_id} not found."
            )

    # Validate previous_roster_id if provided
    if body.previous_roster_id:
        prev = db.get(Roster, body.previous_roster_id)
        if not prev:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"Previous roster id {body.previous_roster_id} not found."
            )
        if not prev.result or "assignments" not in (prev.result or {}):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Previous roster {body.previous_roster_id} has no usable result to chain from."
            )

    roster = Roster(
        profile_id=body.profile_id,
        name=body.name,
        status=RosterStatus.running,
        roster_start=body.roster_start,
        num_days=body.num_days,
        target_work_min=body.target_work_min,
    )
    db.add(roster)

    # Inline demands are created here rather than via POST /demands so they share
    # this transaction — nothing persists unless the whole roster succeeds.
    new_demands = [Demand(**d.model_dump()) for d in body.demands]
    db.add_all(new_demands)

    # One flush assigns the primary key on every pending row (roster + demands).
    db.flush()

    for demand_id in [*body.demand_ids, *(d.id for d in new_demands)]:
        db.add(RosterDemand(roster_id=roster.id, demand_id=demand_id))

    db.commit()
    db.refresh(roster)

    profile = db.get(Profile, body.profile_id)
    time_limit = profile.config.get("time_limit", 600)

    task = run_solver.delay(
        roster_id=roster.id,
        time_limit=time_limit,
        previous_roster_id=body.previous_roster_id,
    )
    roster.celery_task_id = task.id
    db.commit()
    db.refresh(roster)
    return roster


@router.get("/{roster_id}", response_model=RosterOut)
def get_roster(roster_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    return roster


@router.get("/{roster_id}/demands", response_model=list[DemandOut])
def get_roster_demands(roster_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all demands linked to a roster via RosterDemand junction."""
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    return [rd.demand for rd in roster.roster_demands]


@router.get("/{roster_id}/leaves")
def get_roster_leaves(roster_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Preview which leaves will be applied as pre-assignments when the solver runs."""
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")

    active_staff_ids = [
        ps.staff_id for ps in roster.profile.profile_staff
        if not ps.excluded and not ps.staff.deleted
    ]

    roster_dates = [
        roster.roster_start + timedelta(days=i)
        for i in range(roster.num_days)
    ]

    leaves = (
        db.query(Leave)
        .filter(
            Leave.staff_id.in_(active_staff_ids),
            Leave.date.in_(roster_dates),
        )
        .order_by(Leave.date, Leave.staff_id)
        .all()
    )

    return [
        {
            "leave_id":    lv.id,
            "staff_id":    lv.staff_id,
            "employee_id": lv.staff.employee_id,
            "full_name":   lv.staff.full_name,
            "date":        lv.date.isoformat(),
            "shift_code":  lv.shift_code,
            "note":        lv.note,
        }
        for lv in leaves
    ]


@router.get("/{roster_id}/replacements", response_model=ReplacementsOut)
def get_replacements(
    roster_id: int,
    employee_id: str,
    absence_date: date,
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Who could cover `employee_id`'s shift on `absence_date` — the sick-call
    question, answered from the solved roster without running the solver.

    Ranks staff who are off duty, permitted the shift, qualified for whatever
    coverage it was holding up, and clear of the rest rules. Contracted hours
    are reported per candidate rather than filtered on: covering an extra shift
    is overtime, and that is the operator's call to make.

    Note the roster's chain link is not persisted (DESIGN.md §4), so a rest
    rule triggered by a shift in the *previous* roster cannot be seen here.
    """
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    if not roster.result or "assignments" not in roster.result:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Roster {roster_id} has no solved result to suggest replacements from.",
        )

    day = (absence_date - roster.roster_start).days
    if not 0 <= day < roster.num_days:
        last = roster.roster_start + timedelta(days=roster.num_days - 1)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{absence_date} is outside this roster ({roster.roster_start} to {last}).",
        )

    shifts, staff, demands, _ = build_solver_inputs(db, roster)
    try:
        result = rebuild_result(roster, shifts, staff, demands)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    out = suggest_replacements(
        result,
        absent_employee_id=employee_id,
        day=day,
        target_work_min=roster.target_work_min,
        conditional_constraints=conditional_constraints(roster.profile),
        limit=limit,
    )

    return ReplacementsOut(
        absent_employee_id=out.absent_employee_id,
        absent_fullname=out.absent_fullname,
        day=out.day,
        date=out.date,
        shift=ShiftRef(
            code=out.shift.code, name=out.shift.name,
            start_time=out.shift.start_time, end_time=out.shift.end_time,
            work_time=out.shift.work_time,
        ) if out.shift else None,
        gaps=[
            CoverageGapOut(
                date=g.date, start_time=g.start_time, end_time=g.end_time,
                headcount=g.headcount, present=g.present, short_by=g.short_by,
                worst_minute=g.worst_minute,
                skills_required=[f"{s.key}={s.value}" for s in g.skills_required],
                description=g.describe(),
            )
            for g in out.gaps
        ],
        candidates=[ReplacementCandidateOut(**vars(c)) for c in out.candidates],
        excluded=out.excluded,
        message=out.message,
    )


@router.post("/{roster_id}/approve", response_model=RosterOut)
def approve_roster(roster_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    if roster.status != RosterStatus.draft:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Only draft rosters can be approved. Current status: {roster.status}",
        )
    roster.status = RosterStatus.approved
    db.commit()
    db.refresh(roster)
    return roster


@router.post("/{roster_id}/discard", status_code=status.HTTP_204_NO_CONTENT)
def discard_roster(roster_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    if roster.status == RosterStatus.approved:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot discard an approved roster.")
    db.delete(roster)
    db.commit()


@router.delete("/{roster_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_roster(roster_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    db.delete(roster)
    db.commit()
