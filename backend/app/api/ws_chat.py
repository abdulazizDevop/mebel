"""Real-time chat over WebSockets — one channel per order.

Wire shape mirrors the REST `ChatMessageOut` schema (sender / text / audio_url /
created_at) so the frontend can reuse the same renderer it already has for
HTTP-fetched history.

Auth: token is passed as the `?token=` query parameter (browsers can't easily
attach an `Authorization` header to a WebSocket upgrade). Admin and customer
JWTs are accepted; a customer JWT is gated to its own order. A **guest** (no
token) may also connect, but only to an UNCLAIMED order (customer_id IS NULL) —
the order UUID is the bearer capability, exactly like the guest REST endpoints.
"""
import asyncio
from typing import Any

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import update

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
    subscriptions_for_order,
)
from app.services.storage import is_own_storage_url

router = APIRouter()

# Captured once at startup (main.py lifespan). The sync REST chat endpoints run
# in FastAPI's threadpool and use this to schedule a hub broadcast back onto the
# loop the WebSockets live on — see OrderChatHub.broadcast_threadsafe.
MAIN_LOOP: asyncio.AbstractEventLoop | None = None


def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    global MAIN_LOOP
    MAIN_LOOP = loop


class OrderChatHub:
    """Per-order broadcast registry. Holds the live WebSocket connections of
    everyone currently viewing the chat for a given order — typically one
    customer/guest plus zero/one/several admins."""

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

    def broadcast_threadsafe(self, order_id: str, payload: dict[str, Any]) -> None:
        """Schedule a broadcast from a NON-loop thread (a sync REST endpoint).
        `self._lock` is an asyncio.Lock bound to MAIN_LOOP, so the coroutine
        must run on that loop — run_coroutine_threadsafe is the only correct
        cross-thread primitive here. No-ops if the loop isn't captured yet."""
        loop = MAIN_LOOP
        if loop is None:
            return
        try:
            asyncio.run_coroutine_threadsafe(self.broadcast(order_id, payload), loop)
        except RuntimeError:
            # Loop not running (shutdown / tests) — the write already committed;
            # a missed live frame is recovered by the peer's next poll/refresh.
            pass


hub = OrderChatHub()


def _clean_audio(data: dict[str, Any]) -> tuple[str | None, int | None]:
    audio_url = data.get("audio_url")
    # Only trust a URL the server itself minted via /uploads/audio — never an
    # arbitrary external URL a client could inject as a "voice message".
    if not isinstance(audio_url, str) or not audio_url.strip() or not is_own_storage_url(audio_url):
        audio_url = None
    audio_duration = data.get("audio_duration")
    if not isinstance(audio_duration, int) or isinstance(audio_duration, bool):
        audio_duration = None
    elif audio_duration < 0 or audio_duration > 3600:
        audio_duration = None
    return audio_url, audio_duration


def _push_body(msg: ChatMessage) -> str:
    return msg.text[:140] if msg.text else "🎤 Голосовое сообщение"


@router.websocket("/ws/orders/{order_id}/chat")
async def chat_socket(
    ws: WebSocket,
    order_id: str,
    token: str | None = Query(default=None),
) -> None:
    # ─── Auth (cheap checks before accepting the upgrade) ────────────────
    kind: str | None = None
    sub: str | None = None
    if token is not None:
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
        elif kind == "user":  # admin / staff
            user = db.get(User, sub)
            if user is None:
                await ws.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        else:  # guest — no token, gated to an unclaimed order (UUID capability)
            if order.customer_id is not None:
                await ws.close(code=status.WS_1008_POLICY_VIOLATION)
                return

        is_admin = kind == "user"

        await ws.accept()
        await hub.join(order_id, ws)
        try:
            while True:
                data = await ws.receive_json()
                data = data or {}
                text = data.get("text", "")
                text = text.strip() if isinstance(text, str) else ""
                audio_url, audio_duration = _clean_audio(data)
                if not text and not audio_url:
                    continue

                if is_admin:
                    msg = ChatMessage(
                        order_id=order_id,
                        sender=ChatSender.admin,
                        sender_user_id=sub,
                        text=text,
                        audio_url=audio_url,
                        audio_duration=audio_duration,
                    )
                    # Bump status on first admin reply so the dashboard stops
                    # showing the order as "new". Guarded DB-side (WHERE
                    # status='new') so a concurrent terminal-status change made
                    # in another session isn't clobbered by this stale-cached
                    # order object; expire the attr so later reads are accurate.
                    db.execute(
                        update(Order)
                        .where(Order.id == order_id, Order.status == OrderStatus.new)
                        .values(status=OrderStatus.chatting)
                    )
                    db.expire(order, ["status"])
                else:
                    msg = ChatMessage(
                        order_id=order_id,
                        sender=ChatSender.client,
                        text=text,
                        audio_url=audio_url,
                        audio_duration=audio_duration,
                    )
                db.add(msg)
                db.commit()
                db.refresh(msg)

                payload_out = {
                    "id": msg.id,
                    "sender": msg.sender.value,
                    "sender_user_id": msg.sender_user_id,
                    "text": msg.text,
                    "audio_url": msg.audio_url,
                    "audio_duration": msg.audio_duration,
                    "created_at": msg.created_at.isoformat(),
                }
                await hub.broadcast(order_id, payload_out)

                # Push fan-out to whoever is on the OTHER side. The receiver may
                # also have an open WS (already updated by the broadcast above)
                # but the push is what reaches them with the tab closed.
                if msg.sender == ChatSender.admin:
                    # Reach a registered customer AND/OR a guest device keyed by
                    # this order — so guest checkout gets notified too.
                    targets = []
                    if order.customer_id:
                        targets += subscriptions_for_customer(db, order.customer_id)
                    targets += subscriptions_for_order(db, order_id)
                    if targets:
                        await send_to_subscriptions_async(
                            db,
                            targets,
                            {
                                "title": "ROOOMEBEL — новое сообщение",
                                "body": _push_body(msg),
                                "url": "/chat",
                                "order_id": order_id,
                            },
                        )
                else:  # client / guest → notify admins
                    sender_name = order.customer_name or "клиент"
                    await send_to_subscriptions_async(
                        db,
                        subscriptions_for_admins(db),
                        {
                            "title": f"ROOOMEBEL — сообщение от {sender_name}",
                            "body": _push_body(msg),
                            "url": "/admin",
                            "order_id": order_id,
                        },
                    )
        except WebSocketDisconnect:
            pass
        finally:
            await hub.leave(order_id, ws)
    finally:
        db.close()
