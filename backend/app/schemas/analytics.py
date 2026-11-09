from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import AnalyticsType


class AnalyticsEventIn(BaseModel):
    """Single event sent from the storefront. The backend fills in
    `customer_id` from the optional bearer token, and `created_at` from now —
    the client never gets to pick either."""

    type: AnalyticsType
    product_id: str | None = None
    session_id: str | None = Field(default=None, max_length=64)
    data: dict | None = None


class AnalyticsBatchIn(BaseModel):
    events: list[AnalyticsEventIn] = Field(min_length=1, max_length=200)


class TopProductOut(BaseModel):
    """One row of a "top viewed / carted / favourited" leaderboard."""
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    name: str
    main_image: str
    price: float
    count: int


class CampaignRowOut(BaseModel):
    """One advertising source in the per-campaign report.

    `visitors` = distinct browser sessions whose first landing carried these
    UTM/click-id marks (from analytics_events). `orders` / `revenue` = REAL
    orders rows carrying the same marks. The two are never mixed."""

    key: str  # stable row id, e.g. "yandex|cpc|krovati"
    label: str  # human label for the table
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None
    visitors: int
    orders: int
    custom_orders: int
    revenue: float
    conversion_pct: float  # orders / visitors * 100 (0 when no visitors)


class CampaignsOut(BaseModel):
    rows: list[CampaignRowOut]
    best_key: str | None  # most orders, ties broken by revenue
    total_visitors: int
    total_orders: int
    total_revenue: float
    period: Literal["today", "week", "month", "custom"]
    range_from: datetime
    range_to: datetime


class StatsOut(BaseModel):
    """Server-side aggregate stats for the admin Dashboard. Mirrors the
    field names emitted by the legacy frontend `getStats` so the UI can
    swap to this without churn (snake_case → camelCase translation
    happens in the frontend mapper)."""

    visits: int
    product_views: int
    cart_adds: int
    checkouts: int
    chat_opens: int
    favorite_adds: int

    revenue: float
    cost: float
    net_profit: float
    orders_count: int

    top_viewed: list[TopProductOut]
    top_carted: list[TopProductOut]
    top_favorited: list[TopProductOut]

    period: Literal["today", "week", "month", "custom"]
    range_from: datetime
    range_to: datetime
