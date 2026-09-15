from datetime import date, datetime
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
    created_at: datetime
    finished_at: datetime | None
    model_config = {"from_attributes": True}
        
class RosterCreate(BaseModel):
    profile_id: int
    name: str
    roster_start: date
    num_days: int
    target_work_min: int
    # Link demand rows that already exist...
    demand_ids: list[int] = []
    # ...and/or create new ones inside the same transaction as the roster. Prefer
    # this: creating demands via POST /demands first leaves orphaned rows behind if
    # a later step fails, since each request commits on its own.
    demands: list[DemandCreate] = []
    previous_roster_id: int | None = None
 
class RosterOut(RosterListItem):
    # Untyped: the solver result has no declared shape anywhere in the system.
    # See DESIGN.md §5 — this is the field that note is about.
    result: dict | None


# ── Replacement suggestions (sick-call flow) ────────────────────────────────
# Unlike `result` above, this payload is declared, so OpenAPI carries it and
# the frontend has something authoritative to type against.

class ShiftRef(BaseModel):
    code: str
    name: str
    start_time: int
    end_time: int
    work_time: int

class CoverageGapOut(BaseModel):
    """A demand left short once the absent staff member is removed."""
    date: date
    start_time: int
    end_time: int
    headcount: int
    present: int
    short_by: int
    worst_minute: int
    skills_required: list[str]
    description: str

class ReplacementCandidateOut(BaseModel):
    """One staff member who could cover, and what it would cost them."""
    employee_id: str
    fullname: str
    consec_run: int
    work_min_before: int
    work_min_after: int
    target_delta: int
    nights: int
    weekends: int
    covers_gaps: bool
    notes: list[str]

class ReplacementsOut(BaseModel):
    absent_employee_id: str
    absent_fullname: str
    day: int
    date: date
    shift: ShiftRef | None
    gaps: list[CoverageGapOut]
    candidates: list[ReplacementCandidateOut]
    # Why everyone else was ruled out: reason -> how many staff.
    excluded: dict[str, int]
    message: str | None
 