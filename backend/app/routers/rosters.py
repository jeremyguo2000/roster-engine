from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from app.database import get_db
from app.models import Roster, RosterStatus, RosterDemand, Demand, Profile, Leave
from app.schemas.roster import RosterCreate, RosterOut, DemandOut
from app.worker.tasks import run_solver

router = APIRouter(prefix="/rosters", tags=["Rosters"])


@router.get("", response_model=list[RosterOut])
def list_rosters(
    status: RosterStatus | None = None,
    profile_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Roster)
    if status:
        q = q.filter(Roster.status == status)
    if profile_id:
        q = q.filter_by(profile_id=profile_id)
    return q.order_by(Roster.roster_start.desc()).all()


@router.post("", response_model=RosterOut, status_code=status.HTTP_201_CREATED)
def create_and_run_roster(body: RosterCreate, db: Session = Depends(get_db)):
    """Create a roster, link existing demand rows, then dispatch the solver."""
    if not db.get(Profile, body.profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")

    # Validate all demand_ids exist
    for demand_id in body.demand_ids:
        if not db.get(Demand, demand_id):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                f"Demand id {demand_id} not found."
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
    db.flush()

    for demand_id in body.demand_ids:
        db.add(RosterDemand(roster_id=roster.id, demand_id=demand_id))

    db.commit()
    db.refresh(roster)

    profile = db.get(Profile, body.profile_id)
    time_limit = profile.config.get("time_limit", 600)

    task = run_solver.delay(
        roster_id=roster.id,
        time_limit=time_limit,
    )
    roster.celery_task_id = task.id
    db.commit()
    db.refresh(roster)
    return roster


@router.get("/{roster_id}", response_model=RosterOut)
def get_roster(roster_id: int, db: Session = Depends(get_db)):
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    return roster


@router.get("/{roster_id}/demands", response_model=list[DemandOut])
def get_roster_demands(roster_id: int, db: Session = Depends(get_db)):
    """Get all demands linked to a roster via RosterDemand junction."""
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    return [rd.demand for rd in roster.roster_demands]


@router.get("/{roster_id}/leaves")
def get_roster_leaves(roster_id: int, db: Session = Depends(get_db)):
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


@router.post("/{roster_id}/approve", response_model=RosterOut)
def approve_roster(roster_id: int, db: Session = Depends(get_db)):
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
def discard_roster(roster_id: int, db: Session = Depends(get_db)):
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    if roster.status == RosterStatus.approved:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot discard an approved roster.")
    db.delete(roster)
    db.commit()


@router.delete("/{roster_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_roster(roster_id: int, db: Session = Depends(get_db)):
    roster = db.get(Roster, roster_id)
    if not roster:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roster not found.")
    db.delete(roster)
    db.commit()
