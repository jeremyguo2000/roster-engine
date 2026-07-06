from datetime import date
from pydantic import BaseModel
 
from app.models.roster import RosterStatus
 
 
class DemandBase(BaseModel):
    date: date
    start_min: int
    end_min: int
    headcount: int
    skill_value_id: int | None = None
 
class DemandCreate(DemandBase):
    pass
 
class DemandOut(DemandBase):
    id: int
    model_config = {"from_attributes": True}
    

class RosterListItem(BaseModel):
    id: int
    profile_id: int
    profile_name: str
    name: str
    status: RosterStatus
    roster_start: date
    num_days: int
    target_work_min: int
    celery_task_id: str | None
    model_config = {"from_attributes": True}
        
class RosterCreate(BaseModel):
    profile_id: int
    name: str
    roster_start: date
    num_days: int
    target_work_min: int
    demand_ids: list[int]
    previous_roster_id: int | None = None
 
class RosterOut(RosterListItem):
    result: dict | None
 