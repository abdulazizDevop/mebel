import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    viewer = "viewer"


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """Admin / staff member with role-based section access."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, native_enum=False), nullable=False, default=UserRole.viewer)
    sections: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class Customer(Base):
    """Storefront customer (registers from /profile)."""

    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
