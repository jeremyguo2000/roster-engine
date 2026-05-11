from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SkillType, SkillValue, User
from app.dependencies.auth import get_current_user
from app.schemas.skill import (
    SkillTypeCreate, SkillTypeUpdate, SkillTypeOut,
    SkillValueCreate, SkillValueOut,
)

router = APIRouter(prefix="/skills", tags=["Skills"])


# ── Skill Types ──────────────────────────────────────────────────────

@router.get("/types", response_model=list[SkillTypeOut])
def list_skill_types(db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(SkillType).order_by(SkillType.name).all()


@router.post("/types", response_model=SkillTypeOut, status_code=status.HTTP_201_CREATED)
def create_skill_type(body: SkillTypeCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(SkillType).filter_by(name=body.name).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Skill type '{body.name}' already exists.")
    st = SkillType(**body.model_dump())
    db.add(st)
    db.commit()
    db.refresh(st)
    return st


@router.patch("/types/{type_id}", response_model=SkillTypeOut)
def update_skill_type(type_id: int, body: SkillTypeUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    st = db.get(SkillType, type_id)
    if not st:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill type not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(st, field, value)
    db.commit()
    db.refresh(st)
    return st


@router.delete("/types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill_type(type_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.exc import IntegrityError
    st = db.get(SkillType, type_id)
    if not st:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill type not found.")
    if st.values:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete a skill type that still has values. Delete all values first."
        )
    try:
        db.delete(st)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete this skill type — it is referenced by other records."
        )


# ── Skill Values ─────────────────────────────────────────────────────

@router.post("/types/{type_id}/values", response_model=SkillValueOut, status_code=status.HTTP_201_CREATED)
def add_skill_value(type_id: int, body: SkillValueCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    st = db.get(SkillType, type_id)
    if not st:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill type not found.")
    existing = db.query(SkillValue).filter_by(skill_type_id=type_id, value=body.value).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Value '{body.value}' already exists in this skill type.")
    sv = SkillValue(skill_type_id=type_id, value=body.value)
    db.add(sv)
    db.commit()
    db.refresh(sv)
    return sv


@router.delete("/types/{type_id}/values/{value_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill_value(type_id: int, value_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.exc import IntegrityError
    sv = db.query(SkillValue).filter_by(id=value_id, skill_type_id=type_id).first()
    if not sv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill value not found.")
    if sv.staff_skills:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete a skill value that is assigned to staff members."
        )
    if sv.demands:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete a skill value that is referenced by demands."
        )
    try:
        db.delete(sv)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete this skill value — it is referenced by other records."
        )
