from sqlalchemy import Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class SkillType(Base):
    __tablename__ = "skill_type"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    values: Mapped[list["SkillValue"]] = relationship(
        "SkillValue", back_populates="skill_type", cascade="all, delete-orphan"
    )


class SkillValue(Base):
    __tablename__ = "skill_value"
    __table_args__ = (UniqueConstraint("skill_type_id", "value", name="uq_skill_type_value"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    skill_type_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("skill_type.id", ondelete="RESTRICT"), nullable=False
    )
    value: Mapped[str] = mapped_column(String, nullable=False)

    skill_type: Mapped["SkillType"] = relationship("SkillType", back_populates="values")
    staff_skills: Mapped[list["StaffSkill"]] = relationship(  # noqa: F821
        "StaffSkill", back_populates="skill_value"
    )
    demands: Mapped[list["Demand"]] = relationship(  # noqa: F821
        "Demand", back_populates="skill_value"
    )
