import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PushPlatform(str, enum.Enum):
    web = "web"
    ios = "ios"
    android = "android"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PushToken(Base):
    __tablename__ = "push_tokens"
    __table_args__ = (UniqueConstraint("token", name="uq_push_tokens_token"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    customer_id: Mapped[str | None] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True
    )
    token: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[PushPlatform] = mapped_column(
        Enum(PushPlatform, native_enum=False), nullable=False, default=PushPlatform.web
    )
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )
