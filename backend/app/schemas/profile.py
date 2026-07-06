from pydantic import BaseModel


class ProfileBase(BaseModel):
    name: str
    config: dict = {}

class ProfileCreate(ProfileBase):
    pass

class ProfileUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None

class ProfileDuplicate(BaseModel):
    name: str

class ProfileOut(ProfileBase):
    id: int
    model_config = {"from_attributes": True}


class ProfileStaffAdd(BaseModel):
    staff_id: int
    excluded: bool = False

class ProfileStaffOut(BaseModel):
    staff_id: int
    excluded: bool
    model_config = {"from_attributes": True}

class ProfileStaffUpdate(BaseModel):
    excluded: bool

class ProfileShiftAdd(BaseModel):
    shift_id: int

class ProfileShiftOut(BaseModel):
    shift_id: int
    model_config = {"from_attributes": True}
