import copy

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Profile, ProfileStaff, ProfileShift, Staff, Shift, StaffGroup, ShiftGroup, User
from app.dependencies.auth import get_current_user
from app.schemas.profile import (
    ProfileCreate, ProfileUpdate, ProfileDuplicate, ProfileOut,
    ProfileStaffAdd, ProfileStaffOut, ProfileStaffUpdate,
    ProfileShiftAdd, ProfileShiftOut,
)

router = APIRouter(prefix="/profiles", tags=["Profiles"])


@router.get("", response_model=list[ProfileOut])
def list_profiles(db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Profile).order_by(Profile.name).all()


@router.post("", response_model=ProfileOut, status_code=status.HTTP_201_CREATED)
def create_profile(body: ProfileCreate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Profile).filter_by(name=body.name).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Profile '{body.name}' already exists.")
    p = Profile(**body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.get("/{profile_id}", response_model=ProfileOut)
def get_profile(profile_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.get(Profile, profile_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return p


@router.patch("/{profile_id}", response_model=ProfileOut)
def update_profile(profile_id: int, body: ProfileUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.get(Profile, profile_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(profile_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.exc import IntegrityError
    p = db.get(Profile, profile_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    if p.rosters:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete a profile that has rosters. Delete or discard all rosters first."
        )
    try:
        db.delete(p)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete this profile — it is referenced by other records."
        )


@router.post("/{profile_id}/duplicate", response_model=ProfileOut, status_code=status.HTTP_201_CREATED)
def duplicate_profile(profile_id: int, body: ProfileDuplicate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    source = db.get(Profile, profile_id)
    if not source:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    if db.query(Profile).filter_by(name=body.name).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Profile '{body.name}' already exists.")

    new_profile = Profile(name=body.name, config=copy.deepcopy(source.config))
    db.add(new_profile)
    db.flush()

    for ps in source.profile_staff:
        db.add(ProfileStaff(profile_id=new_profile.id, staff_id=ps.staff_id, excluded=ps.excluded))
    for psh in source.profile_shifts:
        db.add(ProfileShift(profile_id=new_profile.id, shift_id=psh.shift_id))

    db.commit()
    db.refresh(new_profile)
    return new_profile


# ── Profile Staff ────────────────────────────────────────────────────

@router.get("/{profile_id}/staff", response_model=list[ProfileStaffOut])
def list_profile_staff(profile_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return db.query(ProfileStaff).filter_by(profile_id=profile_id).all()


@router.post("/{profile_id}/staff", response_model=ProfileStaffOut, status_code=status.HTTP_201_CREATED)
def add_profile_staff(profile_id: int, body: ProfileStaffAdd, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    if not db.get(Staff, body.staff_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found.")
    existing = db.query(ProfileStaff).filter_by(profile_id=profile_id, staff_id=body.staff_id).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Staff already in profile.")
    ps = ProfileStaff(profile_id=profile_id, staff_id=body.staff_id, excluded=body.excluded)
    db.add(ps)
    db.commit()
    db.refresh(ps)
    return ps


@router.post("/{profile_id}/staff/add-group/{group_id}", status_code=status.HTTP_201_CREATED)
def add_staff_group_to_profile(profile_id: int, group_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-add all active staff from a staff group into the profile."""
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    group = db.get(StaffGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff group not found.")
    added = 0
    for s in group.staff:
        if s.deleted:
            continue
        existing = db.query(ProfileStaff).filter_by(profile_id=profile_id, staff_id=s.id).first()
        if not existing:
            db.add(ProfileStaff(profile_id=profile_id, staff_id=s.id, excluded=False))
            added += 1
    db.commit()
    return {"added": added}


@router.delete("/{profile_id}/staff/remove-group/{group_id}")
def remove_staff_group_from_profile(profile_id: int, group_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-remove every staff member in a staff group from the profile."""
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    group = db.get(StaffGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff group not found.")
    staff_ids = [s.id for s in group.staff]
    if not staff_ids:
        return {"removed": 0}
    removed = (
        db.query(ProfileStaff)
        .filter(ProfileStaff.profile_id == profile_id, ProfileStaff.staff_id.in_(staff_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"removed": removed}


@router.patch("/{profile_id}/staff/{staff_id}", response_model=ProfileStaffOut)
def update_profile_staff(
    profile_id: int, staff_id: int, body: ProfileStaffUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle the excluded flag for a staff member in a profile."""
    ps = db.query(ProfileStaff).filter_by(profile_id=profile_id, staff_id=staff_id).first()
    if not ps:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not in profile.")
    ps.excluded = body.excluded
    db.commit()
    db.refresh(ps)
    return ps


@router.delete("/{profile_id}/staff/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_profile_staff(profile_id: int, staff_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ps = db.query(ProfileStaff).filter_by(profile_id=profile_id, staff_id=staff_id).first()
    if not ps:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not in profile.")
    db.delete(ps)
    db.commit()


# ── Profile Shifts ───────────────────────────────────────────────────

@router.get("/{profile_id}/shifts", response_model=list[ProfileShiftOut])
def list_profile_shifts(profile_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return db.query(ProfileShift).filter_by(profile_id=profile_id).all()


@router.post("/{profile_id}/shifts", response_model=ProfileShiftOut, status_code=status.HTTP_201_CREATED)
def add_profile_shift(profile_id: int, body: ProfileShiftAdd, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    if not db.get(Shift, body.shift_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found.")
    existing = db.query(ProfileShift).filter_by(profile_id=profile_id, shift_id=body.shift_id).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Shift already in profile.")
    ps = ProfileShift(profile_id=profile_id, shift_id=body.shift_id)
    db.add(ps)
    db.commit()
    db.refresh(ps)
    return ps


@router.post("/{profile_id}/shifts/add-group/{group_id}", status_code=status.HTTP_201_CREATED)
def add_shift_group_to_profile(profile_id: int, group_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-add all shifts from a shift group into the profile."""
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    group = db.get(ShiftGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift group not found.")
    added = 0
    for shift in group.shifts:
        existing = db.query(ProfileShift).filter_by(profile_id=profile_id, shift_id=shift.id).first()
        if not existing:
            db.add(ProfileShift(profile_id=profile_id, shift_id=shift.id))
            added += 1
    db.commit()
    return {"added": added}


@router.delete("/{profile_id}/shifts/remove-group/{group_id}")
def remove_shift_group_from_profile(profile_id: int, group_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-remove every shift in a shift group from the profile."""
    if not db.get(Profile, profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    group = db.get(ShiftGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift group not found.")
    shift_ids = [s.id for s in group.shifts]
    if not shift_ids:
        return {"removed": 0}
    removed = (
        db.query(ProfileShift)
        .filter(ProfileShift.profile_id == profile_id, ProfileShift.shift_id.in_(shift_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"removed": removed}


@router.delete("/{profile_id}/shifts/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_profile_shift(profile_id: int, shift_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ps = db.query(ProfileShift).filter_by(profile_id=profile_id, shift_id=shift_id).first()
    if not ps:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not in profile.")
    db.delete(ps)
    db.commit()
