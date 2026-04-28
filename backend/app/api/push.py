"""Public-key + subscription endpoints for browser Web Push.

Frontend lifecycle:
  1. GET  /push/vapid-key                → tells PushManager which app server it is
  2. POST /push/subscriptions {sub_json} → registers the browser, server stores it
  3. DELETE /push/subscriptions          → admin/customer logout flow tears it down
"""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.deps import get_optional_customer
from app.models import Customer, PushToken, User
from app.services.push import store_subscription
from app.security import decode_access_token
import jwt

router = APIRouter(prefix="/push", tags=["push"])


class VapidKeyOut(BaseModel):
    public_key: str


class SubscriptionKeysIn(BaseModel):
    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=8, max_length=2000)
    keys: SubscriptionKeysIn
    expirationTime: int | None = None  # browser-supplied, ignored on the server


class SubscriptionOut(BaseModel):
    id: int
    endpoint: str


# ─── Public key for the PushManager subscribe call ───────────────────────


@router.get("/vapid-key", response_model=VapidKeyOut)
def vapid_key():
    settings = get_settings()
    if not settings.push_enabled:
        raise HTTPException(status_code=503, detail="Push is not configured on the server")
    return VapidKeyOut(public_key=settings.vapid_public_key)


# ─── Subscribe / unsubscribe ────────────────────────────────────────────


def _resolve_admin_or_customer(
    authorization: str | None,
    db: Session,
) -> tuple[User | None, Customer | None]:
    """Either an admin OR a customer JWT is acceptable here. Anonymous
    subscriptions are not allowed — every push needs to be addressed to a
    known account so we can fan-out properly."""
    if not authorization:
        return None, None
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None, None
    try:
        payload = decode_access_token(parts[1])
    except jwt.PyJWTError:
        return None, None
    sub = payload.get("sub")
    kind = payload.get("kind")
    if not sub:
        return None, None
    if kind == "user":
        return db.get(User, sub), None
    if kind == "customer":
        return None, db.get(Customer, sub)
    return None, None


@router.post(
    "/subscriptions",
    response_model=SubscriptionOut,
    status_code=status.HTTP_201_CREATED,
)
def subscribe(
    payload: SubscriptionIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
):
    user, customer = _resolve_admin_or_customer(authorization, db)
    if user is None and customer is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Push subscriptions require an admin or customer JWT",
        )

    sub_dict: dict[str, Any] = {
        "endpoint": payload.endpoint,
        "keys": {"p256dh": payload.keys.p256dh, "auth": payload.keys.auth},
    }
    row = store_subscription(
        db,
        subscription=sub_dict,
        user_id=user.id if user else None,
        customer_id=customer.id if customer else None,
        user_agent=request.headers.get("user-agent"),
    )
    return SubscriptionOut(id=row.id, endpoint=payload.endpoint)


class UnsubscribeIn(BaseModel):
    endpoint: str


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    payload: UnsubscribeIn,
    db: Annotated[Session, Depends(get_db)],
):
    """Endpoint-based delete so the browser can drop its own subscription
    without remembering the row id. No auth required — owning the endpoint
    string is enough proof of ownership in practice."""
    rows = db.execute(
        select(PushToken).where(PushToken.token.like(f'%"endpoint":"{payload.endpoint}"%'))
    ).scalars().all()
    for row in rows:
        db.delete(row)
    if rows:
        db.commit()
    return None


# Optional convenience for the customer / admin to see their own subs.
@router.get(
    "/subscriptions/me",
    response_model=list[SubscriptionOut],
)
def my_subscriptions(
    db: Annotated[Session, Depends(get_db)],
    customer: Annotated[Customer | None, Depends(get_optional_customer)],
    authorization: Annotated[str | None, Header()] = None,
):
    user, _ = _resolve_admin_or_customer(authorization, db)
    rows: list[PushToken] = []
    if user is not None:
        rows = list(db.execute(select(PushToken).where(PushToken.user_id == user.id)).scalars().all())
    elif customer is not None:
        rows = list(db.execute(select(PushToken).where(PushToken.customer_id == customer.id)).scalars().all())
    out: list[SubscriptionOut] = []
    for r in rows:
        try:
            import json as _json
            endpoint = _json.loads(r.token).get("endpoint", "")
        except Exception:
            endpoint = ""
        out.append(SubscriptionOut(id=r.id, endpoint=endpoint))
    return out
