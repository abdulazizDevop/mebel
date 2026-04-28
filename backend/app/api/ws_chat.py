"""Real-time chat over WebSockets — one channel per order.

Wire shape mirrors the REST `ChatMessageOut` schema (sender / text / created_at)
so the frontend can reuse the same renderer it already has for HTTP-fetched
history.

Auth: token is passed as the `?token=` query parameter (browsers can't easily
attach an `Authorization` header to a WebSocket upgrade). Both admin and
customer JWTs are accepted; customer JWTs are gated to their own order.
"""
import asyncio
from typing import Any

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.database import SessionLocal
from app.models import (
    ChatMessage,
    ChatSender,
    Customer,
    Order,
    OrderStatus,
    User,
)
from app.security import decode_access_token
from app.services.push import (
    send_to_subscriptions_async,
    subscriptions_for_admins,
    subscriptions_for_customer,
)

router = APIRouter()


class OrderChatHub:
    """Per-order broadcast registry. Holds the live WebSocket connections of
    everyone currently viewing the chat for a given order — that's typically
    one customer plus zero/one/several admins."""

    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def join(self, order_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._channels.setdefault(order_id, set()).add(ws)

    async def leave(self, order_id: str, ws: WebSocket) -> None:
        async with self._lock:
            channel = self._channels.get(order_id)
            if channel is None:
                return
            channel.discard(ws)
            if not channel:
                self._channels.pop(order_id, None)

    async def broadcast(self, order_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._channels.get(order_id, set()))
        # Send outside the lock so a slow socket doesn't block others.
        for ws in targets:
            try:
                await ws.send_json(payload)
            except Exception:
                # Best-effort: a stale socket is cleaned up on its own
                # disconnect handler.
                pass


hub = OrderChatHub()


@router.websocket("/ws/orders/{order_id}/chat")
async def chat_socket(
    ws: WebSocket,
    order_id: str,
    token: str = Query(...),
) -> None:
    # ─── Auth (cheap checks before accepting the upgrade) ────────────────
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    kind = payload.get("kind")
    sub = payload.get("sub")
    if not sub or kind not in ("user", "customer"):
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if order is None:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        if kind == "customer":
            if order.customer_id != sub:
                await ws.close(code=status.WS_1008_POLICY_VIOLATION)
                return
            db.get(Customer, sub)  # touch — confirms the customer still exists
        else:  # admin / staff
            user = db.get(User, sub)
            if user is None:
                await ws.close(code=status.WS_1008_POLICY_VIOLATION)
                return

        await ws.accept()
        await hub.join(order_id, ws)
        try:
            while True:
                data = await ws.receive_json()
                text = (data or {}).get("text", "")
                text = text.strip() if isinstance(text, str) else ""
                if not text:
                    continue

                if kind == "user":
                    msg = ChatMessage(
                        order_id=order_id,
                        sender=ChatSender.admin,
                        sender_user_id=sub,
                        text=text,
                    )
                    # Bump status on first admin reply so the dashboard
                    # stops showing the order as "new".
                    if order.status == OrderStatus.new:
                        order.status = OrderStatus.chatting
                else:
                    msg = ChatMessage(
                        order_id=order_id,
                        sender=ChatSender.client,
                        text=text,
                    )
                db.add(msg)
                db.commit()
                db.refresh(msg)

                payload_out = {
                    "id": msg.id,
                    "sender": msg.sender.value,
                    "sender_user_id": msg.sender_user_id,
                    "text": msg.text,
                    "created_at": msg.created_at.isoformat(),
                }
                await hub.broadcast(order_id, payload_out)

                # Push fan-out to whoever is on the OTHER side. The receiver
                # may also have an open WS (in which case the broadcast above
                # already updated their UI) but the push is what reaches them
                # when their tab is closed or backgrounded.
                if msg.sender == ChatSender.admin and order.customer_id:
                    push_payload = {
                        "title": "ROOOMEBEL — новое сообщение",
                        "body": msg.text[:140],
                        "url": "/chat",
                        "order_id": order_id,
                    }
                    await send_to_subscriptions_async(
                        db, subscriptions_for_customer(db, order.customer_id), push_payload
                    )
                elif msg.sender == ChatSender.client:
                    sender_name = order.customer_name or "клиент"
                    push_payload = {
                        "title": f"ROOOMEBEL — сообщение от {sender_name}",
                        "body": msg.text[:140],
                        "url": "/admin",
                        "order_id": order_id,
                    }
                    await send_to_subscriptions_async(
                        db, subscriptions_for_admins(db), push_payload
                    )
        except WebSocketDisconnect:
            pass
        finally:
            await hub.leave(order_id, ws)
    finally:
        db.close()
