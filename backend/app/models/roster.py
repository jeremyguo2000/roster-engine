import enum
from datetime import date

from sqlalchemy import Integer, String, Date, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RosterStatus(str, enum.Enum):
    running  = "running"
    draft    = "draft"
    approved = "approved"
    failed   = "failed"


class Roster(Base):
    __tablename__ = "roster"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("profile.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[RosterStatus] = mapped_column(
        Enum(RosterStatus), nullable=False, default=RosterStatus.running
    )
    roster_start: Mapped[date] = mapped_column(Date, nullable=False)
    num_days: Mapped[int] = mapped_column(Integer, nullable=False)
    target_work_min: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String, nullable=True)

    profile: Mapped["Profile"] = relationship("Profile", back_populates="rosters")  # noqa: F821
    roster_demands: Mapped[list["RosterDemand"]] = relationship(
        "RosterDemand", back_populates="roster", cascade="all, delete-orphan"
    )


class Demand(Base):
    __tablename__ = "demand"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    skill_value_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("skill_value.id", ondelete="RESTRICT"), nullable=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_min: Mapped[int] = mapped_column(Integer, nullable=False)
    end_min: Mapped[int] = mapped_column(Integer, nullable=False)
    headcount: Mapped[int] = mapped_column(Integer, nullable=False)

    skill_value: Mapped["SkillValue | None"] = relationship(  # noqa: F821
        "SkillValue", back_populates="demands"
    )
    roster_demands: Mapped[list["RosterDemand"]] = relationship(
        "RosterDemand", back_populates="demand"
    )


class RosterDemand(Base):
    __tablename__ = "roster_demand"
    __table_args__ = (UniqueConstraint("roster_id", "demand_id", name="uq_roster_demand"),)

    roster_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roster.id", ondelete="CASCADE"), primary_key=True
    )
    demand_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("demand.id", ondelete="RESTRICT"), primary_key=True
    )

    roster: Mapped["Roster"] = relationship("Roster", back_populates="roster_demands")
    demand: Mapped["Demand"] = relationship("Demand", back_populates="roster_demands")
