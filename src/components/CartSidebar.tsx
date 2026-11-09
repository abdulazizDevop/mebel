import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { WhatsAppButton } from './WhatsAppButton';
import { cartWhatsappMessage } from '../utils/whatsapp';
import { ORDER_PATH } from '../utils/paths';

/* Cart drawer. Checkout itself lives on /order (its own page, see
 * pages/Order.tsx) — the drawer only lists items and hands off. */
export function CartSidebar() {
  const { cart, cartOpen, setCartOpen, removeFromCart, addToCart, whatsappPhone } = useStore();
  const navigate = useNavigate();

  const total = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const close = () => setCartOpen(false);
  const goToCheckout = () => {
    setCartOpen(false);
    navigate(ORDER_PATH);
  };

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
          />

          {/* Drawer — bg-background (opaque, theme-aware); sits above the z-50 navbar. */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-[100dvh] w-full max-w-sm z-[70] shadow-2xl flex flex-col bg-background"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-primary/5">
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} />
                <h3 className="text-lg font-bold">Корзина</h3>
              </div>
              <button onClick={close} className="p-2 hover:bg-primary/5 rounded-full transition-colors" aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>

            {/* Items — min-h-0 lets this flex child shrink and scroll */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingBag size={40} className="opacity-15 mb-4" />
                  <p className="opacity-40 text-sm">Корзина пуста</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <motion.div
                      key={item.product.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 50 }}
                      className="flex gap-4 bg-surface rounded-2xl p-3 shadow-sm"
                    >
                      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                        <img
                          src={item.product.colorVariants[item.colorIndex]?.image || item.product.image}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold truncate">{item.product.name}</h4>
                        <p className="text-xs opacity-40">{item.product.sku}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-bold">{(item.product.price * item.qty).toLocaleString('ru-RU')} ₽</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (item.qty <= 1) removeFromCart(item.product.id);
                                else {
                                  // Decrease qty by removing and re-adding with qty-1
                                  removeFromCart(item.product.id);
                                  for (let n = 0; n < item.qty - 1; n++) addToCart(item.product, item.colorIndex);
                                }
                              }}
                              aria-label="Убрать одну штуку"
                              className="w-7 h-7 rounded-full border border-primary/10 flex items-center justify-center hover:bg-primary/5 transition-colors"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="text-sm font-bold w-5 text-center">{item.qty}</span>
                            <button
                              onClick={() => addToCart(item.product, item.colorIndex)}
                              aria-label="Добавить ещё одну"
                              className="w-7 h-7 rounded-full border border-primary/10 flex items-center justify-center hover:bg-primary/5 transition-colors"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] border-t border-primary/5">
                <div className="flex justify-between mb-4">
                  <span className="opacity-50">Итого</span>
                  <span className="text-xl font-bold">{total.toLocaleString('ru-RU')} ₽</span>
                </div>
                <button
                  onClick={goToCheckout}
                  className="w-full bg-primary text-primary-inv rounded-full py-4 font-bold hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Оформить заказ
                </button>
                {whatsappPhone && (
                  <WhatsAppButton
                    phone={whatsappPhone}
                    variant="outline"
                    label="Написать в WhatsApp"
                    message={cartWhatsappMessage(
                      cart.map((i) => ({ name: i.product.name, price: i.product.price, qty: i.qty })),
                      total,
                    )}
                    className="w-full py-3 mt-2"
                  />
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
