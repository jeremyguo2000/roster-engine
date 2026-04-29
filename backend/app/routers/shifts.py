from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import ShiftGroup, Shift
from app.schemas.shift import (
    ShiftGroupCreate, ShiftGroupUpdate, ShiftGroupOut,
    ShiftCreate, ShiftUpdate, ShiftOut,
)

router = APIRouter(prefix="/shifts", tags=["Shifts"])


# ── Shift Groups ─────────────────────────────────────────────────────

@router.get("/groups", response_model=list[ShiftGroupOut])
def list_shift_groups(db: Session = Depends(get_db)):
    return db.query(ShiftGroup).order_by(ShiftGroup.code).all()


@router.post("/groups", response_model=ShiftGroupOut, status_code=status.HTTP_201_CREATED)
def create_shift_group(body: ShiftGroupCreate, db: Session = Depends(get_db)):
    if db.query(ShiftGroup).filter_by(code=body.code).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Shift group '{body.code}' already exists.")
    sg = ShiftGroup(**body.model_dump())
    db.add(sg)
    db.commit()
    db.refresh(sg)
    return sg


@router.patch("/groups/{group_id}", response_model=ShiftGroupOut)
def update_shift_group(group_id: int, body: ShiftGroupUpdate, db: Session = Depends(get_db)):
    sg = db.get(ShiftGroup, group_id)
    if not sg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift group not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(sg, field, value)
    db.commit()
    db.refresh(sg)
    return sg


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift_group(group_id: int, db: Session = Depends(get_db)):
    sg = db.get(ShiftGroup, group_id)
    if not sg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift group not found.")
    if sg.shifts:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete a shift group that still has shifts. Delete or reassign the shifts first."
        )
    try:
        db.delete(sg)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete this shift group — it is referenced by other records."
        )


# ── Shifts ───────────────────────────────────────────────────────────

@router.get("", response_model=list[ShiftOut])
def list_shifts(group_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(Shift)
    if group_id:
        q = q.filter_by(group_id=group_id)
    return q.order_by(Shift.code).all()


@router.post("", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(body: ShiftCreate, db: Session = Depends(get_db)):
    if not db.get(ShiftGroup, body.group_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift group not found.")
    if db.query(Shift).filter_by(code=body.code).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Shift code '{body.code}' already exists.")
    shift = Shift(**body.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.get("/{shift_id}", response_model=ShiftOut)
def get_shift(shift_id: int, db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found.")
    return shift


@router.patch("/{shift_id}", response_model=ShiftOut)
def update_shift(shift_id: int, body: ShiftUpdate, db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(shift, field, value)
    db.commit()
    db.refresh(shift)
    return shift


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift(shift_id: int, db: Session = Depends(get_db)):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found.")
    if shift.permitted_staff or shift.profile_shifts:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete a shift that is assigned to staff or profiles. Remove those assignments first."
        )
    try:
        db.delete(shift)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete this shift — it is referenced by other records."
        )

