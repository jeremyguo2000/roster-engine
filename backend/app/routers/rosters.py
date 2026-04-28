from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Roster, RosterStatus, Demand, Profile
from app.schemas.roster import RosterCreate, RosterOut
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
    """Create a roster record, save demands, then dispatch the solver as a Celery task."""
    if not db.get(Profile, body.profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")

    roster = Roster(
        profile_id=body.profile_id,
        name=body.name,
        status=RosterStatus.running,
        roster_start=body.roster_start,
        num_days=body.num_days,
    )
    db.add(roster)
    db.flush()  # get roster.id before adding demands

    for d in body.demands:
        db.add(Demand(roster_id=roster.id, **d.model_dump()))

    db.commit()
    db.refresh(roster)

    task = run_solver.delay(
        roster_id=roster.id,
        target_minutes=body.target_minutes,
        time_limit=roster.profile.config.get("time_limit", 600),
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
