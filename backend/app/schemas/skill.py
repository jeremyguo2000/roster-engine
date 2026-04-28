from pydantic import BaseModel


class SkillValueBase(BaseModel):
    value: str

class SkillValueCreate(SkillValueBase):
    pass

class SkillValueOut(SkillValueBase):
    id: int
    skill_type_id: int
    model_config = {"from_attributes": True}


class SkillTypeBase(BaseModel):
    name: str
    description: str | None = None

class SkillTypeCreate(SkillTypeBase):
    pass

class SkillTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

class SkillTypeOut(SkillTypeBase):
    id: int
    values: list[SkillValueOut] = []
    model_config = {"from_attributes": True}
