from sqlalchemy import Integer, String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    profile_staff: Mapped[list["ProfileStaff"]] = relationship(
        "ProfileStaff", back_populates="profile", cascade="all, delete-orphan"
    )
    profile_shifts: Mapped[list["ProfileShift"]] = relationship(
        "ProfileShift", back_populates="profile", cascade="all, delete-orphan"
    )
    rosters: Mapped[list["Roster"]] = relationship(  # noqa: F821
        "Roster", back_populates="profile"
    )


class ProfileStaff(Base):
    __tablename__ = "profile_staff"
    __table_args__ = (UniqueConstraint("profile_id", "staff_id", name="uq_profile_staff"),)

    profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("profile.id", ondelete="CASCADE"), primary_key=True
    )
    staff_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("staff.id", ondelete="CASCADE"), primary_key=True
    )
    excluded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    profile: Mapped["Profile"] = relationship("Profile", back_populates="profile_staff")
    staff: Mapped["Staff"] = relationship("Staff", back_populates="profile_staff")  # noqa: F821


class ProfileShift(Base):
    __tablename__ = "profile_shift"
    __table_args__ = (UniqueConstraint("profile_id", "shift_id", name="uq_profile_shift"),)

    profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("profile.id", ondelete="CASCADE"), primary_key=True
    )
    shift_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shift.id", ondelete="CASCADE"), primary_key=True
    )

    profile: Mapped["Profile"] = relationship("Profile", back_populates="profile_shifts")
    shift: Mapped["Shift"] = relationship("Shift", back_populates="profile_shifts")  # noqa: F821
