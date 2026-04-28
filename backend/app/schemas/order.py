from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import ChatSender, OrderStatus


class OrderItemIn(BaseModel):
    product_id: str
    qty: int = Field(ge=1)
    color_index: int = 0


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: str | None
    product_name: str
    product_sku: str
    product_image: str
    price: float
    purchase_price: float | None
    qty: int
    color_index: int
    color_hex: str | None
    color_name: str | None


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sender: ChatSender
    sender_user_id: str | None
    text: str
    created_at: datetime


class ChatMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class OrderCreateIn(BaseModel):
    customer_name: str = Field(min_length=1, max_length=255)
    customer_phone: str = Field(min_length=4, max_length=64)
    items: list[OrderItemIn] = Field(default_factory=list)
    note: str | None = Field(
        default=None,
        max_length=5000,
        description="Optional free-form text appended to the auto-seeded first chat message; "
        "used by custom-furniture orders that have no line items.",
    )


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer_id: str | None
    customer_name: str
    customer_phone: str
    total: float
    status: OrderStatus
    items: list[OrderItemOut]
    chat: list[ChatMessageOut]
    created_at: datetime
