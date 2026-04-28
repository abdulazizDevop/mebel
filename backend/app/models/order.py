import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderStatus(str, enum.Enum):
    new = "new"
    chatting = "chatting"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"


class ChatSender(str, enum.Enum):
    client = "client"
    admin = "admin"


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    customer_id: Mapped[str | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(64), nullable=False)
    total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, native_enum=False), nullable=False, default=OrderStatus.new
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now, index=True)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )
    chat: Mapped[list["ChatMessage"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )


class OrderItem(Base):
    """Snapshot of a product at the moment it was ordered. Never updated when product changes."""

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )

    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_sku: Mapped[str] = mapped_column(String(64), nullable=False)
    product_image: Mapped[str] = mapped_column(Text, nullable=False)

    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    purchase_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    color_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color_hex: Mapped[str | None] = mapped_column(String(9), nullable=True)
    color_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    order: Mapped[Order] = relationship(back_populates="items")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender: Mapped[ChatSender] = mapped_column(Enum(ChatSender, native_enum=False), nullable=False)
    sender_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now, index=True)

    order: Mapped[Order] = relationship(back_populates="chat")
