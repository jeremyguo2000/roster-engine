from sqlalchemy import Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ShiftGroup(Base):
    __tablename__ = "shift_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    is_work_shift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_night_shift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    shifts: Mapped[list["Shift"]] = relationship(
        "Shift", back_populates="group", cascade="all, delete-orphan"
    )


class Shift(Base):
    __tablename__ = "shift"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shift_group.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    start_min: Mapped[int] = mapped_column(Integer, nullable=False)
    end_min: Mapped[int] = mapped_column(Integer, nullable=False)
    work_min: Mapped[int] = mapped_column(Integer, nullable=False)
    break_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    group: Mapped["ShiftGroup"] = relationship("ShiftGroup", back_populates="shifts")
    permitted_staff: Mapped[list["StaffPermittedShift"]] = relationship(  # noqa: F821
        "StaffPermittedShift", back_populates="shift"
    )
    profile_shifts: Mapped[list["ProfileShift"]] = relationship(  # noqa: F821
        "ProfileShift", back_populates="shift"
    )
