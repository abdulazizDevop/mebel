import enum
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnalyticsType(str, enum.Enum):
    visit = "visit"
    product_view = "product_view"
    cart_add = "cart_add"
    cart_checkout = "cart_checkout"
    chat_open = "chat_open"
    favorite_add = "favorite_add"
    favorite_remove = "favorite_remove"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[AnalyticsType] = mapped_column(
        Enum(AnalyticsType, native_enum=False), nullable=False, index=True
    )
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_id: Mapped[str | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, index=True
    )
