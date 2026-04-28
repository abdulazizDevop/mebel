from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_optional_customer, require_section
from app.models import (
    AnalyticsEvent,
    AnalyticsType,
    Customer,
    Order,
    Product,
)
from app.schemas.analytics import (
    AnalyticsBatchIn,
    AnalyticsEventIn,
    StatsOut,
    TopProductOut,
)

router = APIRouter(tags=["analytics"])

PeriodKey = Literal["today", "week", "month", "custom"]


def _resolve_window(
    period: PeriodKey,
    custom_from: datetime | None,
    custom_to: datetime | None,
) -> tuple[datetime, datetime]:
    """Mirror the period semantics the frontend Dashboard already uses.

    `today`  = midnight of today UTC → now
    `week`   = midnight 7 days ago    → now
    `month`  = midnight 30 days ago   → now
    `custom` = explicit range from the caller
    """
    now = datetime.now(timezone.utc)
    if period == "custom":
        if custom_from is None or custom_to is None:
            # Falls back to "all time" so the dashboard never 400s.
            return datetime.fromtimestamp(0, tz=timezone.utc), now
        # Make naive datetimes UTC-aware so comparisons work.
        f = custom_from if custom_from.tzinfo else custom_from.replace(tzinfo=timezone.utc)
        t = custom_to if custom_to.tzinfo else custom_to.replace(tzinfo=timezone.utc)
        return f, t

    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        return midnight, now
    if period == "week":
        return midnight - timedelta(days=7), now
    # month
    return midnight - timedelta(days=30), now


# ─── Ingest ──────────────────────────────────────────────────────────────


@router.post("/analytics/events", status_code=status.HTTP_204_NO_CONTENT)
def ingest_event(
    payload: AnalyticsEventIn,
    db: Annotated[Session, Depends(get_db)],
    customer: Annotated[Customer | None, Depends(get_optional_customer)],
):
    """Public — anyone can record an event. If the request carries a valid
    customer JWT the row gets the customer attached, otherwise it stays
    anonymous (only `session_id` distinguishes browsers)."""
    db.add(_event_from_payload(payload, customer))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/analytics/events/batch", status_code=status.HTTP_204_NO_CONTENT)
def ingest_events_batch(
    payload: AnalyticsBatchIn,
    db: Annotated[Session, Depends(get_db)],
    customer: Annotated[Customer | None, Depends(get_optional_customer)],
):
    """Same as POST /analytics/events but accepts up to 200 events at a time —
    used by the storefront to flush a buffered queue when the tab regains
    focus, instead of one round-trip per click."""
    for event in payload.events:
        db.add(_event_from_payload(event, customer))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _event_from_payload(payload: AnalyticsEventIn, customer: Customer | None) -> AnalyticsEvent:
    return AnalyticsEvent(
        type=payload.type,
        product_id=payload.product_id,
        customer_id=customer.id if customer else None,
        session_id=payload.session_id,
        data=payload.data,
    )


# ─── Aggregate query (admin) ────────────────────────────────────────────


@router.get(
    "/stats",
    response_model=StatsOut,
    dependencies=[Depends(require_section("dashboard"))],
)
def get_stats(
    db: Annotated[Session, Depends(get_db)],
    period: PeriodKey = Query(default="today"),
    custom_from: datetime | None = Query(default=None, alias="from"),
    custom_to: datetime | None = Query(default=None, alias="to"),
):
    range_from, range_to = _resolve_window(period, custom_from, custom_to)

    # ─── Event counters ───────────────────────────────────────────────
    counts_by_type: dict[AnalyticsType, int] = dict(
        db.execute(
            select(AnalyticsEvent.type, func.count(AnalyticsEvent.id))
            .where(AnalyticsEvent.created_at >= range_from)
            .where(AnalyticsEvent.created_at <= range_to)
            .group_by(AnalyticsEvent.type)
        ).all()
    )
    visits = counts_by_type.get(AnalyticsType.visit, 0)
    product_views = counts_by_type.get(AnalyticsType.product_view, 0)
    cart_adds = counts_by_type.get(AnalyticsType.cart_add, 0)
    checkouts = counts_by_type.get(AnalyticsType.cart_checkout, 0)
    chat_opens = counts_by_type.get(AnalyticsType.chat_open, 0)
    favorite_adds = counts_by_type.get(AnalyticsType.favorite_add, 0)

    # ─── Top-N leaderboards (one query per board, joined to Product) ──
    def top_for(event_type: AnalyticsType, limit: int = 5) -> list[TopProductOut]:
        rows = db.execute(
            select(
                Product.id,
                Product.name,
                Product.main_image,
                Product.price,
                func.count(AnalyticsEvent.id).label("count"),
            )
            .join(Product, Product.id == AnalyticsEvent.product_id)
            .where(AnalyticsEvent.type == event_type)
            .where(AnalyticsEvent.created_at >= range_from)
            .where(AnalyticsEvent.created_at <= range_to)
            .group_by(Product.id, Product.name, Product.main_image, Product.price)
            .order_by(func.count(AnalyticsEvent.id).desc())
            .limit(limit)
        ).all()
        return [
            TopProductOut(product_id=r[0], name=r[1], main_image=r[2], price=float(r[3]), count=int(r[4]))
            for r in rows
        ]

    top_viewed = top_for(AnalyticsType.product_view)
    top_carted = top_for(AnalyticsType.cart_add)
    top_favorited = top_for(AnalyticsType.favorite_add)

    # ─── Finance: revenue / cost / net profit from orders in the window
    orders = db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.created_at >= range_from)
        .where(Order.created_at <= range_to)
    ).scalars().all()
    revenue = 0.0
    cost = 0.0
    for order in orders:
        for item in order.items:
            qty = item.qty or 0
            revenue += float(item.price or 0) * qty
            cost += float(item.purchase_price or 0) * qty

    return StatsOut(
        visits=visits,
        product_views=product_views,
        cart_adds=cart_adds,
        checkouts=checkouts,
        chat_opens=chat_opens,
        favorite_adds=favorite_adds,
        revenue=revenue,
        cost=cost,
        net_profit=revenue - cost,
        orders_count=len(orders),
        top_viewed=top_viewed,
        top_carted=top_carted,
        top_favorited=top_favorited,
        period=period,
        range_from=range_from,
        range_to=range_to,
    )
