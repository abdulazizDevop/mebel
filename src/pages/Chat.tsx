import { useCallback, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ArrowLeft, Package, MessageCircle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { cn } from '../utils/cn';
import { dtoToChatMessage, socketMessageToDto, useOrderChatSocket } from '../api';

export function Chat() {
  const { orders, activeOrderId, setActiveOrderId, sendMessage, adminSession, appendChatMessage } = useStore();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const order = orders.find((o) => o.id === activeOrderId);

  // Live updates — admin replies and the customer's own broadcasts arrive
  // here as JSON frames; we hand them to the store which dedupes by id.
  const handleSocketMessage = useCallback(
    (raw: Parameters<typeof socketMessageToDto>[0]) => {
      if (!activeOrderId) return;
      appendChatMessage(activeOrderId, dtoToChatMessage(socketMessageToDto(raw)));
    },
    [activeOrderId, appendChatMessage],
  );
  const chatSocket = useOrderChatSocket(activeOrderId, 'customer', handleSocketMessage);

  // Admins should never land on the customer-facing chat — their conversations
  // live in /admin → Заказы. Bounce them.
  useEffect(() => {
    if (adminSession) navigate('/admin', { replace: true });
  }, [adminSession, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [order?.chat.length]);

  // Auto-select first order if none active
  useEffect(() => {
    if (!activeOrderId && orders.length > 0) {
      setActiveOrderId(orders[0].id);
    }
  }, [activeOrderId, orders, setActiveOrderId]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Package size={48} className="opacity-15 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Нет активных заказов</h2>
        <p className="text-sm opacity-50 mb-6">Добавьте товары в корзину и оформите заказ</p>
        <button
          onClick={() => navigate('/catalog')}
          className="bg-primary text-primary-inv rounded-full px-8 py-3 font-bold"
        >
          В каталог
        </button>
      </div>
    );
  }

  // Show order list if no active order selected yet
  if (!order) {
    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-4">Ваши заказы</h2>
        <div className="space-y-3">
          {orders.map(o => {
            const lastMsg = o.chat[o.chat.length - 1];
            const hasAdminReply = o.chat.some(m => m.from === 'admin');
            return (
              <motion.button
                key={o.id}
                onClick={() => setActiveOrderId(o.id)}
                className="w-full bg-surface rounded-2xl shadow-sm p-4 flex items-center gap-4 text-left hover:shadow-md transition-shadow"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <div className={cn(
                  "rounded-full p-3",
                  hasAdminReply ? "bg-green-500/10" : "bg-primary/5"
                )}>
                  <MessageCircle size={20} className={hasAdminReply ? "text-green-600" : ""} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm truncate">Заказ № {o.id.slice(0, 8).toUpperCase()}</h4>
                    <span className="text-[10px] opacity-40 flex-shrink-0">{o.createdAt}</span>
                  </div>
                  <p className="text-xs opacity-50">
                    {o.items.length > 0 ? `${o.items.length} товаров — ${o.total.toLocaleString('ru-RU')} ₽` : 'Индивидуальный заказ'}
                  </p>
                  {lastMsg && (
                    <p className="text-[11px] opacity-40 truncate mt-1">
                      {lastMsg.from === 'admin' ? '↩ Админ: ' : 'Вы: '}{lastMsg.text}
                    </p>
                  )}
                </div>
                <span className="bg-primary/5 text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0">
                  {o.chat.length}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Prefer the live socket — backend broadcasts the saved message back to
    // both sides so we don't need to optimistically insert. If the socket
    // isn't open (slow network, lost token, etc.) fall back to REST which
    // does insert locally.
    if (chatSocket.send(trimmed)) {
      setText('');
      return;
    }
    sendMessage(order.id, 'client', trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] max-w-lg mx-auto">
      {/* Chat header — back button only appears when there are multiple
          conversations to step back to. With a single order the bottom nav
          handles navigation, so we skip the redundant arrow. */}
      <div className="flex items-center gap-3 mb-4">
        {orders.length > 1 && (
          <button
            onClick={() => setActiveOrderId(null)}
            className="bg-surface/80 backdrop-blur-sm p-2.5 sm:p-3 rounded-full shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm sm:text-base truncate">Заказ № {order.id.slice(0, 8).toUpperCase()}</h3>
          <p className="text-[11px] sm:text-xs opacity-40 truncate">
            {order.items.length > 0 ? `${order.items.length} товаров — ${order.total.toLocaleString('ru-RU')} ₽` : 'Индивидуальный заказ'}
          </p>
        </div>
        {orders.length > 1 && (
          <span className="text-[10px] opacity-40 bg-surface rounded-full px-2 py-1 flex-shrink-0">
            {orders.indexOf(order) + 1}/{orders.length}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4 scrollbar-hide">
        {order.chat.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "max-w-[80%] rounded-2xl px-4 py-3",
              msg.from === 'client'
                ? "ml-auto bg-primary text-primary-inv rounded-br-md"
                : "mr-auto bg-surface shadow-sm rounded-bl-md"
            )}
          >
            {msg.from === 'admin' && (
              <p className="text-[9px] font-bold opacity-40 mb-1">Админ</p>
            )}
            {msg.from === 'client' && (
              <p className="text-[9px] font-bold text-primary-inv/50 mb-1">{order.name}</p>
            )}
            <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
            <p className={cn(
              "text-[10px] mt-1",
              msg.from === 'client' ? "text-primary-inv/50 text-right" : "text-primary/30"
            )}>
              {msg.time}
            </p>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-4 border-t border-primary/5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Написать сообщение..."
          className="flex-1 bg-surface rounded-full px-5 py-3 border-none shadow-sm focus:ring-2 focus:ring-primary outline-none text-sm"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
            text.trim()
              ? "bg-primary text-primary-inv hover:scale-105 active:scale-95"
              : "bg-primary/10 text-primary/30"
          )}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
