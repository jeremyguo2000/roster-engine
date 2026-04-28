from datetime import date
from pydantic import BaseModel


class StaffGroupBase(BaseModel):
    name: str

class StaffGroupCreate(StaffGroupBase):
    pass

class StaffGroupUpdate(BaseModel):
    name: str | None = None

class StaffGroupOut(StaffGroupBase):
    id: int
    model_config = {"from_attributes": True}


class StaffBase(BaseModel):
    staff_group_id: int
    full_name: str

class StaffCreate(StaffBase):
    pass

class StaffUpdate(BaseModel):
    staff_group_id: int | None = None
    full_name: str | None = None

class StaffOut(StaffBase):
    id: int
    deleted: bool
    staff_group: StaffGroupOut
    model_config = {"from_attributes": True}


class StaffSkillAdd(BaseModel):
    skill_value_id: int

class StaffPermittedShiftAdd(BaseModel):
    shift_id: int


class LeaveBase(BaseModel):
    staff_id: int
    date: date
    shift_code: str = "AL"
    note: str | None = None

class LeaveCreate(LeaveBase):
    pass

class LeaveUpdate(BaseModel):
    shift_code: str | None = None
    note: str | None = None

class LeaveOut(LeaveBase):
    id: int
    model_config = {"from_attributes": True}
