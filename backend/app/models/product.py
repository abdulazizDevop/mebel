import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uid)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    purchase_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    main_image: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    dimensions: Mapped[str | None] = mapped_column(String(120), nullable=True)
    weight: Mapped[str | None] = mapped_column(String(64), nullable=True)
    material: Mapped[str | None] = mapped_column(String(255), nullable=True)

    in_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    color_variants: Mapped[list["ColorVariant"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ColorVariant.sort_order",
    )


class ColorVariant(Base):
    __tablename__ = "color_variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hex: Mapped[str] = mapped_column(String(9), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    image: Mapped[str] = mapped_column(Text, nullable=False)
    photos: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    product: Mapped[Product] = relationship(back_populates="color_variants")
