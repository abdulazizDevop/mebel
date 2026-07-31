import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
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
    # A single browser endpoint may subscribe against several handles (an admin
    # user, a registered customer, or one row per guest order), so uniqueness is
    # (token, order_id) for guest rows. Because NULLs are DISTINCT in a unique
    # index, that composite alone would NOT dedupe admin/customer rows (order_id
    # NULL) — so a partial unique index enforces one row per token there too.
    __table_args__ = (
        UniqueConstraint("token", "order_id", name="uq_push_tokens_token_order"),
        Index(
            "uq_push_tokens_token_null_order",
            "token",
            unique=True,
            sqlite_where=text("order_id IS NULL"),
            postgresql_where=text("order_id IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    customer_id: Mapped[str | None] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Guest push: a not-logged-in customer has no user/customer id, so their
    # device subscribes keyed by the order UUID (the same bearer capability the
    # guest chat endpoints use). NULL for admin/customer subscriptions.
    order_id: Mapped[str | None] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=True, index=True
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
