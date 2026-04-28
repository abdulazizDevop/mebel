"""Web Push delivery via VAPID.

Each PushToken row stores the full browser subscription as JSON in the
`token` column (endpoint + p256dh + auth). On a chat event we fan-out a
push to every relevant subscription. Failed sends (HTTP 410 Gone) drop the
row so we don't keep poking dead browsers.

The actual `pywebpush.webpush` call is blocking I/O — fine because the
hot path is small (≤ a few subscriptions per order), but we run it in a
thread when called from async code (FastAPI WebSocket handler).
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Iterable

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import PushPlatform, PushToken

log = logging.getLogger(__name__)


def _vapid_claims() -> dict[str, str]:
    return {"sub": get_settings().vapid_subject}


def store_subscription(
    db: Session,
    *,
    subscription: dict[str, Any],
    user_id: str | None,
    customer_id: str | None,
    user_agent: str | None,
) -> PushToken:
    """Insert or update a Web Push subscription. Same `endpoint` from the
    same browser collapses to one row (replacing the keys if they rotated)."""
    endpoint = subscription.get("endpoint")
    if not endpoint:
        raise ValueError("subscription is missing 'endpoint'")
    keys = subscription.get("keys") or {}
    if not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("subscription is missing 'keys.p256dh' / 'keys.auth'")

    raw = json.dumps(subscription, separators=(",", ":"), sort_keys=True)
    existing = db.execute(select(PushToken).where(PushToken.token == raw)).scalar_one_or_none()
    if existing is not None:
        existing.user_id = user_id
        existing.customer_id = customer_id
        if user_agent:
            existing.user_agent = user_agent[:255]
        db.commit()
        db.refresh(existing)
        return existing

    row = PushToken(
        user_id=user_id,
        customer_id=customer_id,
        token=raw,
        platform=PushPlatform.web,
        user_agent=(user_agent or None) and user_agent[:255],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _send_one(subscription: dict[str, Any], payload: dict[str, Any]) -> bool:
    """Returns False when the subscription is permanently gone (HTTP 404/410),
    in which case the caller should drop the DB row."""
    settings = get_settings()
    if not settings.push_enabled:
        return True
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims=_vapid_claims(),
            ttl=600,
        )
        return True
    except WebPushException as exc:
        # `response` is a `requests.Response` when the push provider returned
        # a body — we use it to detect dead subscriptions.
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        if status_code in (404, 410):
            return False
        log.warning("webpush failed for %s: %s", subscription.get("endpoint"), exc)
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort delivery
        log.warning("webpush unexpected error: %s", exc)
        return True


def send_to_subscriptions(
    db: Session,
    rows: Iterable[PushToken],
    payload: dict[str, Any],
) -> None:
    """Synchronous fan-out. Drops dead rows in-place."""
    dead: list[int] = []
    for row in rows:
        try:
            sub = json.loads(row.token)
        except (TypeError, ValueError):
            continue
        if not _send_one(sub, payload):
            dead.append(row.id)
    if dead:
        for row_id in dead:
            obj = db.get(PushToken, row_id)
            if obj is not None:
                db.delete(obj)
        db.commit()


async def send_to_subscriptions_async(
    db: Session,
    rows: Iterable[PushToken],
    payload: dict[str, Any],
) -> None:
    """Run the blocking fan-out in a worker thread so async callers (the
    WebSocket chat handler) don't stall the event loop."""
    materialised = list(rows)
    await asyncio.to_thread(send_to_subscriptions, db, materialised, payload)


def subscriptions_for_customer(db: Session, customer_id: str) -> list[PushToken]:
    return list(
        db.execute(
            select(PushToken).where(PushToken.customer_id == customer_id)
        ).scalars().all()
    )


def subscriptions_for_admins(db: Session) -> list[PushToken]:
    """Returns every admin/staff push subscription. Small enough for a single
    storefront — when this scales we'll filter by role / who's online."""
    return list(
        db.execute(select(PushToken).where(PushToken.user_id.is_not(None))).scalars().all()
    )
