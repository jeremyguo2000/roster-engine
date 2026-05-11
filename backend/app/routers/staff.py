from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import StaffGroup, Staff, StaffSkill, StaffPermittedShift, Leave, SkillValue, Shift, User
from app.dependencies.auth import get_current_user
from app.schemas.staff import (
    StaffGroupCreate, StaffGroupUpdate, StaffGroupOut,
    StaffCreate, StaffUpdate, StaffOut,
    StaffSkillAdd, StaffPermittedShiftAdd,
    LeaveCreate, LeaveUpdate, LeaveOut,
)

router = APIRouter(prefix="/staff", tags=["Staff"])


# ── Staff Groups ─────────────────────────────────────────────────────

@router.get("/groups", response_model=list[StaffGroupOut])
def list_staff_groups(db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(StaffGroup).order_by(StaffGroup.name).all()


@router.post("/groups", response_model=StaffGroupOut, status_code=status.HTTP_201_CREATED)
def create_staff_group(body: StaffGroupCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(StaffGroup).filter_by(name=body.name).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Staff group '{body.name}' already exists.")
    sg = StaffGroup(**body.model_dump())
    db.add(sg)
    db.commit()
    db.refresh(sg)
    return sg


@router.patch("/groups/{group_id}", response_model=StaffGroupOut)
def update_staff_group(group_id: int, body: StaffGroupUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sg = db.get(StaffGroup, group_id)
    if not sg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff group not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(sg, field, value)
    db.commit()
    db.refresh(sg)
    return sg


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_staff_group(group_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sg = db.get(StaffGroup, group_id)
    if not sg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff group not found.")
    if sg.staff:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete a group that still has staff members.")
    db.delete(sg)
    db.commit()


# ── Leaves ───────────────────────────────────────────────────────────
# NOTE: these must be defined BEFORE /{staff_id} routes to avoid
# FastAPI matching "leaves" as a staff_id integer parameter.

@router.get("/leaves", response_model=list[LeaveOut])
def list_leaves(
    staff_id: int | None = None,
    from_date: date_type | None = None,
    to_date: date_type | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Leave)
    if staff_id:
        q = q.filter_by(staff_id=staff_id)
    if from_date:
        q = q.filter(Leave.date >= from_date)
    if to_date:
        q = q.filter(Leave.date <= to_date)
    return q.order_by(Leave.date).all()


@router.post("/leaves", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
def create_leave(body: LeaveCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Staff, body.staff_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    leave = Leave(**body.model_dump())
    db.add(leave)
    db.commit()
    db.refresh(leave)
    return leave


@router.patch("/leaves/{leave_id}", response_model=LeaveOut)
def update_leave(leave_id: int, body: LeaveUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    leave = db.get(Leave, leave_id)
    if not leave:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(leave, field, value)
    db.commit()
    db.refresh(leave)
    return leave


@router.delete("/leaves/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave(leave_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    leave = db.get(Leave, leave_id)
    if not leave:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave not found.")
    db.delete(leave)
    db.commit()


# ── Staff ────────────────────────────────────────────────────────────

@router.get("", response_model=list[StaffOut])
def list_staff(
    group_id: int | None = None,
    include_deleted: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Staff)
    if not include_deleted:
        q = q.filter_by(deleted=False)
    if group_id:
        q = q.filter_by(staff_group_id=group_id)
    return q.order_by(Staff.full_name).all()


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def create_staff(body: StaffCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(StaffGroup, body.staff_group_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff group not found.")
    if db.query(Staff).filter_by(employee_id=body.employee_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Employee ID '{body.employee_id}' already exists.")
    s = Staff(**body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/{staff_id}", response_model=StaffOut)
def get_staff(staff_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.get(Staff, staff_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    return s


@router.patch("/{staff_id}", response_model=StaffOut)
def update_staff(staff_id: int, body: StaffUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.get(Staff, staff_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.post("/{staff_id}/delete", response_model=StaffOut)
def soft_delete_staff(staff_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete: sets deleted=True. Staff remains in historical rosters."""
    s = db.get(Staff, staff_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    s.deleted = True
    db.commit()
    db.refresh(s)
    return s


@router.post("/{staff_id}/restore", response_model=StaffOut)
def restore_staff(staff_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.get(Staff, staff_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    s.deleted = False
    db.commit()
    db.refresh(s)
    return s


# ── Staff Skills ─────────────────────────────────────────────────────

@router.get("/{staff_id}/skills")
def get_staff_skills(staff_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.get(Staff, staff_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    return [
        {
            "skill_value_id": ss.skill_value_id,
            "skill_type":     ss.skill_value.skill_type.name,
            "value":          ss.skill_value.value,
        }
        for ss in s.skills
    ]


@router.post("/{staff_id}/skills", status_code=status.HTTP_201_CREATED)
def add_staff_skill(staff_id: int, body: StaffSkillAdd, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Staff, staff_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    if not db.get(SkillValue, body.skill_value_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill value not found.")
    existing = db.query(StaffSkill).filter_by(staff_id=staff_id, skill_value_id=body.skill_value_id).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Skill already assigned to this staff member.")
    db.add(StaffSkill(staff_id=staff_id, skill_value_id=body.skill_value_id))
    db.commit()
    return {"staff_id": staff_id, "skill_value_id": body.skill_value_id}


@router.delete("/{staff_id}/skills/{skill_value_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_staff_skill(staff_id: int, skill_value_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sk = db.query(StaffSkill).filter_by(staff_id=staff_id, skill_value_id=skill_value_id).first()
    if not sk:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill assignment not found.")
    db.delete(sk)
    db.commit()


# ── Permitted Shifts ─────────────────────────────────────────────────

@router.get("/{staff_id}/permitted-shifts")
def get_permitted_shifts(staff_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.get(Staff, staff_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    if not s.permitted_shifts:
        return {"note": "No restrictions — all shifts permitted", "permitted_shifts": []}
    return {
        "note": "Restricted to listed shifts only",
        "permitted_shifts": [
            {
                "shift_id":   ps.shift_id,
                "shift_code": ps.shift.code,
                "shift_name": ps.shift.name,
                "group":      ps.shift.group.code,
            }
            for ps in s.permitted_shifts
        ]
    }


@router.post("/{staff_id}/permitted-shifts", status_code=status.HTTP_201_CREATED)
def add_permitted_shift(staff_id: int, body: StaffPermittedShiftAdd, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Staff, staff_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    if not db.get(Shift, body.shift_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found.")
    existing = db.query(StaffPermittedShift).filter_by(staff_id=staff_id, shift_id=body.shift_id).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Shift already permitted for this staff member.")
    db.add(StaffPermittedShift(staff_id=staff_id, shift_id=body.shift_id))
    db.commit()
    return {"staff_id": staff_id, "shift_id": body.shift_id}


@router.delete("/{staff_id}/permitted-shifts/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_permitted_shift(staff_id: int, shift_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ps = db.query(StaffPermittedShift).filter_by(staff_id=staff_id, shift_id=shift_id).first()
    if not ps:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Permitted shift not found.")
    db.delete(ps)
    db.commit()
