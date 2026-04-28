from pydantic import BaseModel


class ShiftGroupBase(BaseModel):
    code: str
    is_work_shift: bool = True
    is_night_shift: bool = False

class ShiftGroupCreate(ShiftGroupBase):
    pass

class ShiftGroupUpdate(BaseModel):
    code: str | None = None
    is_work_shift: bool | None = None
    is_night_shift: bool | None = None

class ShiftGroupOut(ShiftGroupBase):
    id: int
    model_config = {"from_attributes": True}


class ShiftBase(BaseModel):
    group_id: int
    code: str
    name: str
    start_min: int
    end_min: int
    work_min: int
    break_min: int = 0

class ShiftCreate(ShiftBase):
    pass

class ShiftUpdate(BaseModel):
    group_id: int | None = None
    code: str | None = None
    name: str | None = None
    start_min: int | None = None
    end_min: int | None = None
    work_min: int | None = None
    break_min: int | None = None

class ShiftOut(ShiftBase):
    id: int
    group: ShiftGroupOut
    model_config = {"from_attributes": True}
