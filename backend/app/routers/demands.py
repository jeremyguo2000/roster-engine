from datetime import date as date_type

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Demand, SkillValue
from app.schemas.roster import DemandCreate, DemandOut

router = APIRouter(prefix="/demands", tags=["Demands"])


@router.get("", response_model=list[DemandOut])
def list_demands(
    from_date: date_type | None = None,
    to_date: date_type | None = None,
    skill_value_id: int | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Demand)
    if from_date:
        q = q.filter(Demand.date >= from_date)
    if to_date:
        q = q.filter(Demand.date <= to_date)
    if skill_value_id:
        q = q.filter_by(skill_value_id=skill_value_id)
    return q.order_by(Demand.date, Demand.start_min).offset(offset).limit(limit).all()


@router.post("", response_model=DemandOut, status_code=status.HTTP_201_CREATED)
def create_demand(body: DemandCreate, db: Session = Depends(get_db)):
    if body.skill_value_id and not db.get(SkillValue, body.skill_value_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Skill value not found.")
    demand = Demand(**body.model_dump())
    db.add(demand)
    db.commit()
    db.refresh(demand)
    return demand


@router.get("/{demand_id}", response_model=DemandOut)
def get_demand(demand_id: int, db: Session = Depends(get_db)):
    demand = db.get(Demand, demand_id)
    if not demand:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demand not found.")
    return demand
