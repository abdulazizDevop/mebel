/* WebSocket client for real-time order chat.
 *
 * Connects to `ws(s)://<API host>/ws/orders/{id}/chat?token=...` and exposes
 * a tiny imperative wrapper. Used by `useOrderChatSocket` (a React hook,
 * see below) so components don't need to think about reconnect / cleanup. */

import { useEffect, useRef, useState } from 'react';

import { API_BASE_URL, tokenStore } from './client';
import type { ChatMessageDTO, ChatSender } from './types';

/** Shape of the JSON the backend pushes for every new chat message. */
export interface ChatSocketMessage {
  id: string;
  sender: ChatSender;
  sender_user_id: string | null;
  text: string;
  created_at: string;
}

function wsUrl(orderId: string, token: string): string {
  // Convert http(s):// → ws(s):// for the matching origin.
  const base = API_BASE_URL.replace(/^http/, 'ws');
  return `${base}/ws/orders/${encodeURIComponent(orderId)}/chat?token=${encodeURIComponent(token)}`;
}

export type ChatSlot = 'admin' | 'customer';

export interface OrderChatSocket {
  send: (text: string) => boolean;
  /** True after the socket has reached OPEN. Useful for an "online" badge. */
  isOpen: boolean;
}

/**
 * Subscribes to the per-order chat WebSocket while the component is mounted.
 *
 * @param orderId  the chat to listen on; pass `null` to skip connecting (e.g.
 *                 while the active order hasn't loaded yet)
 * @param slot     which token the client should authenticate with — admin or
 *                 customer. The component knows which view it is.
 * @param onMessage fired once per inbound message. Components dedupe by id so
 *                  it's safe even when a sender sees their own broadcast.
 */
export function useOrderChatSocket(
  orderId: string | null,
  slot: ChatSlot,
  onMessage: (msg: ChatSocketMessage) => void,
): OrderChatSocket {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const [isOpen, setIsOpen] = useState(false);

  // Keep the latest callback without forcing a reconnect on every render.
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!orderId) return;
    const token = tokenStore.get(slot);
    if (!token) return; // anonymous user — no live chat

    let cancelled = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Reconnect with exponential backoff capped at 10 s — fixes the
    // "Chrome didn't see live updates until I refreshed" symptom by
    // re-trying when the first connect races a stale dev-server worker.
    const connect = (): void => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl(orderId, token));
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        attempt = 0;
        if (!cancelled) setIsOpen(true);
      });
      ws.addEventListener('message', (e) => {
        try {
          const data = JSON.parse(e.data) as ChatSocketMessage;
          onMessageRef.current(data);
        } catch {
          /* ignore malformed frames */
        }
      });
      const onDown = (event: Event) => {
        if (!cancelled) setIsOpen(false);
        if (cancelled) return;
        // Don't keep retrying when the server explicitly rejected us
        // (1008 = policy violation: bad/expired token, kicked out, etc.).
        const code = (event as CloseEvent).code;
        if (code === 1008) return;
        attempt += 1;
        const delay = Math.min(10000, 500 * 2 ** Math.min(attempt - 1, 4));
        retryTimer = setTimeout(connect, delay);
      };
      ws.addEventListener('close', onDown);
      ws.addEventListener('error', onDown);
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      const ws = wsRef.current;
      try { ws?.close(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [orderId, slot]);

  return {
    isOpen,
    send: (text: string) => {
      const trimmed = text.trim();
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !trimmed) return false;
      ws.send(JSON.stringify({ text: trimmed }));
      return true;
    },
  };
}

/** Convenience: turns a raw socket message into the camelCase `ChatMessage`
 *  shape the rest of the frontend uses. Mirrors `dtoToChatMessage` in mappers.ts
 *  so that REST-fetched history and live messages render identically. */
export function socketMessageToDto(msg: ChatSocketMessage): ChatMessageDTO {
  return {
    id: msg.id,
    sender: msg.sender,
    sender_user_id: msg.sender_user_id,
    text: msg.text,
    created_at: msg.created_at,
  };
}
