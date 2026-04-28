from sqlalchemy import Integer, String, Boolean, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class StaffGroup(Base):
    __tablename__ = "staff_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)

    staff: Mapped[list["Staff"]] = relationship("Staff", back_populates="staff_group")


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    staff_group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("staff_group.id", ondelete="RESTRICT"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    staff_group: Mapped["StaffGroup"] = relationship("StaffGroup", back_populates="staff")
    skills: Mapped[list["StaffSkill"]] = relationship(
        "StaffSkill", back_populates="staff", cascade="all, delete-orphan"
    )
    permitted_shifts: Mapped[list["StaffPermittedShift"]] = relationship(
        "StaffPermittedShift", back_populates="staff", cascade="all, delete-orphan"
    )
    leaves: Mapped[list["Leave"]] = relationship(
        "Leave", back_populates="staff", cascade="all, delete-orphan"
    )
    profile_staff: Mapped[list["ProfileStaff"]] = relationship(  # noqa: F821
        "ProfileStaff", back_populates="staff"
    )


class StaffSkill(Base):
    __tablename__ = "staff_skill"
    __table_args__ = (UniqueConstraint("staff_id", "skill_value_id", name="uq_staff_skill"),)

    staff_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="CASCADE"), primary_key=True
    )
    skill_value_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("skill_value.id", ondelete="RESTRICT"), primary_key=True
    )

    staff: Mapped["Staff"] = relationship("Staff", back_populates="skills")
    skill_value: Mapped["SkillValue"] = relationship(  # noqa: F821
        "SkillValue", back_populates="staff_skills"
    )


class StaffPermittedShift(Base):
    __tablename__ = "staff_permitted_shift"
    __table_args__ = (
        UniqueConstraint("staff_id", "shift_id", name="uq_staff_permitted_shift"),
    )

    staff_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="CASCADE"), primary_key=True
    )
    shift_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shift.id", ondelete="RESTRICT"), primary_key=True
    )

    staff: Mapped["Staff"] = relationship("Staff", back_populates="permitted_shifts")
    shift: Mapped["Shift"] = relationship("Shift", back_populates="permitted_staff")


class Leave(Base):
    __tablename__ = "leave"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    staff_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[Date] = mapped_column(Date, nullable=False)
    shift_code: Mapped[str] = mapped_column(String, nullable=False, default="AL")
    note: Mapped[str | None] = mapped_column(String, nullable=True)

    staff: Mapped["Staff"] = relationship("Staff", back_populates="leaves")
