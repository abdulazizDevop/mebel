from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import ChatSender, OrderStatus
from app.services.storage import is_own_storage_url


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
    audio_url: str | None = None
    audio_duration: int | None = None
    created_at: datetime


class ChatMessageIn(BaseModel):
    # Either text OR a voice note (audio_url) must be present. A voice-only
    # message sends text="" plus an audio_url, so text can no longer be required.
    text: str = Field(default="", max_length=5000)
    audio_url: str | None = Field(default=None, max_length=2000)
    audio_duration: int | None = Field(default=None, ge=0, le=3600)

    @model_validator(mode="after")
    def _require_content(self) -> "ChatMessageIn":
        # Only accept an audio_url the server itself minted (via /uploads/audio),
        # never an arbitrary external URL a client could set as a "voice message".
        if self.audio_url is not None and not is_own_storage_url(self.audio_url):
            raise ValueError("audio_url must reference this server's storage")
        if not self.text.strip() and not self.audio_url:
            raise ValueError("message must have text or audio_url")
        return self


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
