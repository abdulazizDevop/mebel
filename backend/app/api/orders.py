from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import CurrentCustomer, CurrentUser, get_optional_customer, require_section
from app.models import (
    ChatMessage,
    ChatSender,
    Customer,
    Order,
    OrderItem,
    OrderStatus,
    Product,
)
from app.schemas.order import (
    ChatMessageIn,
    ChatMessageOut,
    OrderArchiveUpdate,
    OrderCreateIn,
    OrderOut,
    OrderStatusUpdate,
)
from app.api.ws_chat import hub
from app.services.push import (
    send_to_subscriptions,
    subscriptions_for_admins,
    subscriptions_for_customer,
    subscriptions_for_order,
)

router = APIRouter(prefix="/orders", tags=["orders"])


def _chat_payload(msg: ChatMessage) -> dict:
    """Same wire shape ws_chat.py broadcasts, so a REST-sent message reaches any
    peer sitting on the order's WebSocket (fallback path when a sender's socket
    isn't OPEN)."""
    return {
        "id": msg.id,
        "sender": msg.sender.value,
        "sender_user_id": msg.sender_user_id,
        "text": msg.text,
        "audio_url": msg.audio_url,
        "audio_duration": msg.audio_duration,
        "image_url": msg.image_url,
        "created_at": msg.created_at.isoformat(),
    }


def _push_body(msg: ChatMessage) -> str:
    if msg.text:
        return msg.text[:140]
    if msg.image_url:
        return "📷 Фото"
    return "🎤 Голосовое сообщение"


def _load_order(db: Session, order_id: str) -> Order:
    order = db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.chat))
        .where(Order.id == order_id)
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


# ─── Create (guest OR customer; variant-3 hybrid) ───────────────────────


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreateIn,
    db: Annotated[Session, Depends(get_db)],
    customer: Annotated[Customer | None, Depends(get_optional_customer)],
):
    """Anyone can place an order. If a customer Bearer token is sent, the order
    is auto-attached to that customer so they can see it from any device."""
    # Snapshot every line item from the canonical Product row so historical
    # finance numbers stay accurate even if the product is later edited or
    # deleted. Prices are read server-side; the client cannot tamper with them.
    order = Order(
        customer_id=customer.id if customer else None,
        customer_name=payload.customer_name.strip(),
        customer_phone=payload.customer_phone.strip(),
        status=OrderStatus.new,
        total=Decimal("0"),
    )

    total = Decimal("0")
    for line in payload.items:
        product = db.get(Product, line.product_id)
        if product is None:
            raise HTTPException(status_code=400, detail=f"Unknown product_id: {line.product_id}")

        variants = sorted(product.color_variants, key=lambda v: v.sort_order)
        variant = variants[line.color_index] if 0 <= line.color_index < len(variants) else None

        item = OrderItem(
            product_id=product.id,
            product_name=product.name,
            product_sku=product.sku,
            product_image=variant.image if variant else product.main_image,
            price=product.price,
            purchase_price=product.purchase_price,
            qty=line.qty,
            color_index=line.color_index,
            color_hex=variant.hex if variant else None,
            color_name=variant.name if variant else None,
        )
        order.items.append(item)
        total += Decimal(str(product.price)) * line.qty

    order.total = total

    # Seed the chat with the client's intro message — same UX as the legacy
    # frontend used to do client-side. Enumerate every line item (name /
    # colour / qty / price) so the admin sees exactly WHAT was ordered right in
    # the chat, not just the total.
    if order.items:
        lines_txt = "\n".join(
            f"• {it.product_name}"
            + (f" ({it.color_name})" if it.color_name else "")
            + f" — {it.qty} × {it.price} ₽ = {Decimal(str(it.price)) * it.qty} ₽"
            for it in order.items
        )
        intro = (
            f"Здравствуйте! Меня зовут {payload.customer_name.strip()}.\n"
            f"Хочу оформить заказ:\n"
            f"{lines_txt}\n"
            f"Итого: {total} ₽\n"
            f"Мой телефон: {payload.customer_phone.strip()}"
        )
    else:
        # Custom-furniture order — no line items, just the request details.
        intro = (
            f"Индивидуальный заказ.\n"
            f"Имя: {payload.customer_name.strip()}\n"
            f"Телефон: {payload.customer_phone.strip()}"
        )
    if payload.note:
        intro += f"\n\n{payload.note.strip()}"
    order.chat.append(ChatMessage(sender=ChatSender.client, text=intro))

    db.add(order)
    db.commit()
    db.refresh(order)
    return order


# ─── Read — customer ────────────────────────────────────────────────────


@router.get("/me", response_model=list[OrderOut])
def my_orders(
    customer: CurrentCustomer,
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.chat))
        .where(Order.customer_id == customer.id)
        .order_by(Order.created_at.desc())
    ).scalars().all()
    return rows


# ─── Read — admin / staff ───────────────────────────────────────────────


@router.get("", response_model=list[OrderOut], dependencies=[Depends(require_section("orders"))])
def list_orders(
    db: Annotated[Session, Depends(get_db)],
    phone: str | None = Query(default=None, description="Filter by phone (substring match)"),
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.chat))
        .order_by(Order.created_at.desc())
    )
    if phone:
        stmt = stmt.where(Order.customer_phone.ilike(f"%{phone.strip()}%"))
    if status_filter is not None:
        stmt = stmt.where(Order.status == status_filter)
    stmt = stmt.limit(limit).offset(offset)
    return db.execute(stmt).scalars().all()


@router.get(
    "/{order_id}",
    response_model=OrderOut,
    dependencies=[Depends(require_section("orders"))],
)
def get_order(order_id: str, db: Annotated[Session, Depends(get_db)]):
    return _load_order(db, order_id)


@router.patch(
    "/{order_id}/status",
    response_model=OrderOut,
    dependencies=[Depends(require_section("orders"))],
)
def update_status(
    order_id: str,
    payload: OrderStatusUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    order = _load_order(db, order_id)
    order.status = payload.status
    db.commit()
    db.refresh(order)
    return order


@router.patch(
    "/{order_id}/archive",
    response_model=OrderOut,
    dependencies=[Depends(require_section("orders"))],
)
def set_archived(
    order_id: str,
    payload: OrderArchiveUpdate,
    db: Annotated[Session, Depends(get_db)],
):
    """Move a chat to the archive (or restore it) without deleting."""
    order = _load_order(db, order_id)
    order.archived = payload.archived
    db.commit()
    db.refresh(order)
    return order


@router.delete(
    "/{order_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_section("orders"))],
)
def delete_order(order_id: str, db: Annotated[Session, Depends(get_db)]):
    """Permanently delete a chat/order (cascades to its items + messages)."""
    order = _load_order(db, order_id)
    db.delete(order)
    db.commit()
    return None


# ─── Chat (basic REST; WebSocket for real-time lands in 2C) ────────────


@router.post(
    "/{order_id}/chat",
    response_model=ChatMessageOut,
    status_code=status.HTTP_201_CREATED,
)
def send_chat_as_admin(
    order_id: str,
    payload: ChatMessageIn,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """Admin-side chat reply. Falls back here when the WebSocket isn't open
    (slow network, lost token). Customers use the parallel endpoint below."""
    order = _load_order(db, order_id)
    msg = ChatMessage(
        order_id=order.id,
        sender=ChatSender.admin,
        sender_user_id=user.id,
        text=payload.text.strip(),
        audio_url=payload.audio_url,
        audio_duration=payload.audio_duration,
        image_url=payload.image_url,
    )
    db.add(msg)
    # Guarded new→chatting bump (see ws_chat.py) so a concurrent terminal-status
    # change isn't reverted by this request's stale-loaded order object.
    db.execute(
        update(Order)
        .where(Order.id == order.id, Order.status == OrderStatus.new)
        .values(status=OrderStatus.chatting)
    )
    db.commit()
    db.refresh(msg)

    # Push the saved message to any peer live on the order's WebSocket (the
    # customer/guest side), since this REST path doesn't go through the hub.
    hub.broadcast_threadsafe(order.id, _chat_payload(msg))

    # Fan-out web push to the customer's registered browsers AND the guest
    # device keyed to this order, so they hear back with the tab closed.
    targets = []
    if order.customer_id:
        targets += subscriptions_for_customer(db, order.customer_id)
    targets += subscriptions_for_order(db, order.id)
    if targets:
        send_to_subscriptions(
            db,
            targets,
            {
                "title": "ROOOMEBEL — новое сообщение",
                "body": _push_body(msg),
                "url": "/chat",
                "order_id": order.id,
            },
        )
    return msg


@router.post(
    "/{order_id}/chat/customer",
    response_model=ChatMessageOut,
    status_code=status.HTTP_201_CREATED,
)
def send_chat_as_customer(
    order_id: str,
    payload: ChatMessageIn,
    customer: CurrentCustomer,
    db: Annotated[Session, Depends(get_db)],
):
    order = _load_order(db, order_id)
    if order.customer_id != customer.id:
        raise HTTPException(status_code=403, detail="This order does not belong to you")
    msg = ChatMessage(
        order_id=order.id,
        sender=ChatSender.client,
        text=payload.text.strip(),
        audio_url=payload.audio_url,
        audio_duration=payload.audio_duration,
        image_url=payload.image_url,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Live-push to any admin sitting on the order's WebSocket (this REST path
    # doesn't go through the hub).
    hub.broadcast_threadsafe(order.id, _chat_payload(msg))

    # Notify every registered admin so the owner sees a system push even when
    # they don't have the dashboard open.
    send_to_subscriptions(
        db,
        subscriptions_for_admins(db),
        {
            "title": f"ROOOMEBEL — новое сообщение от {customer.name}",
            "body": _push_body(msg),
            "url": "/admin",
            "order_id": order.id,
        },
    )
    return msg


# ─── Chat (guest / order-link capability, no auth) ──────────────────────
# Guests never authenticate, so their only handle on an order is its UUID —
# unguessable, acting as a bearer capability. These endpoints are gated to
# UNCLAIMED orders (customer_id IS NULL) so a registered customer's history is
# never exposed by id alone; those go through the authenticated paths above.


def _guest_order(db: Session, order_id: str) -> Order:
    order = _load_order(db, order_id)
    if order.customer_id is not None:
        # Claimed by a registered customer — force them through the authed path.
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("/{order_id}/chat", response_model=list[ChatMessageOut])
def get_chat_public(order_id: str, db: Annotated[Session, Depends(get_db)]):
    """Read a guest order's chat by its UUID so the customer can poll for admin
    replies without logging in."""
    order = _guest_order(db, order_id)
    return sorted(order.chat, key=lambda m: m.created_at)


@router.post(
    "/{order_id}/chat/guest",
    response_model=ChatMessageOut,
    status_code=status.HTTP_201_CREATED,
)
def send_chat_as_guest(
    order_id: str,
    payload: ChatMessageIn,
    db: Annotated[Session, Depends(get_db)],
):
    """Guest customer reply, keyed by order UUID (no auth)."""
    order = _guest_order(db, order_id)
    msg = ChatMessage(
        order_id=order.id,
        sender=ChatSender.client,
        text=payload.text.strip(),
        audio_url=payload.audio_url,
        audio_duration=payload.audio_duration,
        image_url=payload.image_url,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Live-push to any admin sitting on the order's WebSocket (this REST path
    # doesn't go through the hub).
    hub.broadcast_threadsafe(order.id, _chat_payload(msg))

    # Notify every registered admin so the owner hears about the reply even
    # with the dashboard closed.
    send_to_subscriptions(
        db,
        subscriptions_for_admins(db),
        {
            "title": f"ROOOMEBEL — новое сообщение от {order.customer_name}",
            "body": _push_body(msg),
            "url": "/admin",
            "order_id": order.id,
        },
    )
    return msg
