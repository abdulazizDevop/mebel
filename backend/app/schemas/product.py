from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ColorVariantIn(BaseModel):
    hex: str = Field(min_length=4, max_length=9)
    name: str | None = None
    image: str
    photos: list[str] = Field(default_factory=list)
    sort_order: int = 0


class ColorVariantOut(ColorVariantIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


# Postgres `INTEGER` is signed 32-bit (max 2_147_483_647). The DB column for
# quantity uses INTEGER, so without an upper bound here pydantic accepts
# arbitrarily large numbers and the overflow surfaces as a 500 from psycopg2
# (`NumericValueOutOfRange`). Cap at ~1 billion — comfortably within INT32
# and far above any realistic furniture quantity.
_INT32_SAFE_MAX = 1_000_000_000


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    sku: str | None = None  # auto-generated if missing
    price: float = Field(ge=0, le=10_000_000_000)
    purchase_price: float | None = Field(default=None, ge=0, le=10_000_000_000)
    main_image: str
    description: str = ""
    category_id: int | None = None
    dimensions: str | None = None
    weight: str | None = None
    material: str | None = None
    in_stock: bool = True
    quantity: int | None = Field(default=None, ge=0, le=_INT32_SAFE_MAX)
    color_variants: list[ColorVariantIn] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    """All fields optional. `color_variants`, if present, REPLACES the entire list."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    sku: str | None = None
    price: float | None = Field(default=None, ge=0, le=10_000_000_000)
    purchase_price: float | None = Field(default=None, ge=0, le=10_000_000_000)
    main_image: str | None = None
    description: str | None = None
    category_id: int | None = None
    dimensions: str | None = None
    weight: str | None = None
    material: str | None = None
    in_stock: bool | None = None
    quantity: int | None = Field(default=None, ge=0, le=_INT32_SAFE_MAX)
    color_variants: list[ColorVariantIn] | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    sku: str
    price: float
    purchase_price: float | None
    main_image: str
    description: str
    category_id: int | None
    category_name: str | None = None  # populated by router for convenience
    dimensions: str | None
    weight: str | None
    material: str | None
    in_stock: bool
    quantity: int | None
    color_variants: list[ColorVariantOut]
    created_at: datetime
    updated_at: datetime
