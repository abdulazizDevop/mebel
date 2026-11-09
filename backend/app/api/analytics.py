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
    CampaignRowOut,
    CampaignsOut,
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


# ─── Per-campaign ad report (admin) ─────────────────────────────────────

_NO_MARKS_KEY = "__direct__"


def _clean(v: object) -> str | None:
    if not isinstance(v, str):
        return None
    v = v.strip()
    return v[:255] or None


def _campaign_key(
    source: str | None, medium: str | None, campaign: str | None, yclid: str | None, gclid: str | None
) -> tuple[str, str, str | None, str | None, str | None]:
    """Group rows by UTM; a click id without UTM still names its network."""
    if not (source or medium or campaign):
        if yclid:
            source = "yandex-direct"
        elif gclid:
            source = "google-ads"
        else:
            return _NO_MARKS_KEY, "Без рекламных меток (прямые / поиск / соцсети)", None, None, None
    key = "|".join([source or "", medium or "", campaign or ""])
    label = " · ".join(p for p in (source, campaign or medium) if p) or (source or "")
    return key, label, source, medium, campaign


@router.get(
    "/stats/campaigns",
    response_model=CampaignsOut,
    dependencies=[Depends(require_section("dashboard"))],
)
def get_campaign_stats(
    db: Annotated[Session, Depends(get_db)],
    period: PeriodKey = Query(default="month"),
    custom_from: datetime | None = Query(default=None, alias="from"),
    custom_to: datetime | None = Query(default=None, alias="to"),
):
    """Visitors come from `visit` analytics events whose `data` carries the
    first-touch UTM / yclid / gclid the storefront stored on landing; orders
    come from the `orders` table (same marks, saved at checkout). Volumes are
    small (hundreds of rows a day), so grouping happens in Python — identical
    on SQLite and Postgres, no JSON-path SQL."""
    range_from, range_to = _resolve_window(period, custom_from, custom_to)

    rows: dict[str, dict] = {}

    def bucket(key: str, label: str, source, medium, campaign) -> dict:
        if key not in rows:
            rows[key] = {
                "key": key, "label": label, "utm_source": source, "utm_medium": medium,
                "utm_campaign": campaign, "sessions": set(), "orders": 0,
                "custom_orders": 0, "revenue": 0.0,
            }
        return rows[key]

    visits = db.execute(
        select(AnalyticsEvent.session_id, AnalyticsEvent.data)
        .where(AnalyticsEvent.type == AnalyticsType.visit)
        .where(AnalyticsEvent.created_at >= range_from)
        .where(AnalyticsEvent.created_at <= range_to)
    ).all()
    for session_id, data in visits:
        d = data if isinstance(data, dict) else {}
        key, label, s, m, c = _campaign_key(
            _clean(d.get("utm_source")), _clean(d.get("utm_medium")), _clean(d.get("utm_campaign")),
            _clean(d.get("yclid")), _clean(d.get("gclid")),
        )
        bucket(key, label, s, m, c)["sessions"].add(session_id or f"anon-{id(data)}")

    orders = db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.created_at >= range_from)
        .where(Order.created_at <= range_to)
    ).scalars().all()
    for order in orders:
        key, label, s, m, c = _campaign_key(
            order.utm_source, order.utm_medium, order.utm_campaign, order.yclid, order.gclid
        )
        b = bucket(key, label, s, m, c)
        b["orders"] += 1
        if not order.items:
            b["custom_orders"] += 1
        b["revenue"] += float(order.total or 0)

    out_rows: list[CampaignRowOut] = []
    for b in rows.values():
        visitors = len(b["sessions"])
        out_rows.append(
            CampaignRowOut(
                key=b["key"], label=b["label"], utm_source=b["utm_source"],
                utm_medium=b["utm_medium"], utm_campaign=b["utm_campaign"],
                visitors=visitors, orders=b["orders"], custom_orders=b["custom_orders"],
                revenue=round(b["revenue"], 2),
                conversion_pct=round(b["orders"] / visitors * 100, 2) if visitors else 0.0,
            )
        )
    # Campaigns with orders first, then by revenue, then by traffic.
    out_rows.sort(key=lambda r: (r.orders, r.revenue, r.visitors), reverse=True)
    best = next((r.key for r in out_rows if r.orders > 0 and r.key != _NO_MARKS_KEY), None)

    return CampaignsOut(
        rows=out_rows,
        best_key=best,
        total_visitors=sum(r.visitors for r in out_rows),
        total_orders=sum(r.orders for r in out_rows),
        total_revenue=round(sum(r.revenue for r in out_rows), 2),
        period=period,
        range_from=range_from,
        range_to=range_to,
    )
