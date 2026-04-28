from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
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
    OrderCreateIn,
    OrderOut,
    OrderStatusUpdate,
)
from app.services.push import (
    send_to_subscriptions,
    subscriptions_for_admins,
    subscriptions_for_customer,
)

router = APIRouter(prefix="/orders", tags=["orders"])


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
    # frontend used to do client-side.
    if order.items:
        intro = (
            f"Здравствуйте! Меня зовут {payload.customer_name.strip()}. "
            f"Хочу оформить заказ на сумму {total} ₽. "
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
    )
    db.add(msg)
    if order.status == OrderStatus.new:
        order.status = OrderStatus.chatting
    db.commit()
    db.refresh(msg)

    # Fan-out web push to the customer's registered browsers so they hear
    # back even when their tab is closed.
    if order.customer_id:
        send_to_subscriptions(
            db,
            subscriptions_for_customer(db, order.customer_id),
            {
                "title": "ROOOMEBEL — новое сообщение",
                "body": msg.text[:140],
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
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Notify every registered admin so the owner sees a system push even when
    # they don't have the dashboard open.
    send_to_subscriptions(
        db,
        subscriptions_for_admins(db),
        {
            "title": f"ROOOMEBEL — новое сообщение от {customer.name}",
            "body": msg.text[:140],
            "url": "/admin",
            "order_id": order.id,
        },
    )
    return msg
