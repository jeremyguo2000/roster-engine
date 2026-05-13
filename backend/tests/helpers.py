from datetime import date as date_type
from app.models import (
    SkillType, SkillValue,
    ShiftGroup, Shift,
    StaffGroup, Staff,
    Profile, Roster, RosterStatus, Demand,
)


def make_skill_type(db, name="Seniority"):
    st = SkillType(name=name)
    db.add(st)
    db.flush()
    return st


def make_skill_value(db, skill_type_id, value="Senior"):
    sv = SkillValue(skill_type_id=skill_type_id, value=value)
    db.add(sv)
    db.flush()
    return sv


def make_shift_group(db, code="DSG", is_work_shift=True, is_night_shift=False):
    sg = ShiftGroup(code=code, is_work_shift=is_work_shift, is_night_shift=is_night_shift)
    db.add(sg)
    db.flush()
    return sg


def make_shift(db, group_id, code="D0800", name="Day 0800", start_min=480, end_min=960, work_min=480):
    s = Shift(group_id=group_id, code=code, name=name, start_min=start_min, end_min=end_min, work_min=work_min, break_min=0)
    db.add(s)
    db.flush()
    return s


def make_staff_group(db, name="Nurses"):
    sg = StaffGroup(name=name)
    db.add(sg)
    db.flush()
    return sg


def make_staff(db, staff_group_id, employee_id="EMP001", full_name="Alice Smith"):
    s = Staff(staff_group_id=staff_group_id, employee_id=employee_id, full_name=full_name)
    db.add(s)
    db.flush()
    return s


def make_profile(db, name="Default"):
    p = Profile(name=name, config={})
    db.add(p)
    db.flush()
    return p


def make_demand(db, d=None, start_min=480, end_min=960, headcount=2, skill_value_id=None):
    dem = Demand(
        date=d or date_type(2025, 1, 6),
        start_min=start_min,
        end_min=end_min,
        headcount=headcount,
        skill_value_id=skill_value_id,
    )
    db.add(dem)
    db.flush()
    return dem


def make_roster(db, profile_id, status=RosterStatus.draft, roster_start=None):
    r = Roster(
        profile_id=profile_id,
        name="Test Roster",
        status=status,
        roster_start=roster_start or date_type(2025, 1, 6),
        num_days=7,
        target_work_min=2400,
        result=None,
    )
    db.add(r)
    db.flush()
    return r
