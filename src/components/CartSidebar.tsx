import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ShoppingBag, Send } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../utils/cn';
import { formatPhoneInput, isValidName, isValidPhone, sanitizeNameInput } from '../utils/format';
import { useNavigate } from 'react-router-dom';

export function CartSidebar() {
  const { cart, cartOpen, setCartOpen, removeFromCart, addToCart, placeOrder, setActiveOrderId, userSession } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<'cart' | 'form' | 'done'>('cart');
  const [name, setName] = useState(userSession?.name || '');
  const [phone, setPhone] = useState('');
  const [orderId, setOrderId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const nameValid = isValidName(name);
  const phoneValid = isValidPhone(phone);
  const formValid = nameValid && phoneValid;

  const total = cart.reduce((s, i) => s + i.product.price * i.qty, 0);

  const handlePlaceOrder = async () => {
    setNameTouched(true);
    setPhoneTouched(true);
    if (!formValid) return;
    setSubmitting(true);
    setSubmitError('');
    const id = await placeOrder(name.trim(), phone.trim());
    setSubmitting(false);
    if (!id) {
      setSubmitError('Не удалось оформить заказ. Попробуйте ещё раз.');
      return;
    }
    setOrderId(id);
    setStep('done');
  };

  const handleClose = () => {
    setCartOpen(false);
    setTimeout(() => {
      setStep('cart');
      setName('');
      setPhone('');
    }, 300);
  };

  const handleGoToChat = () => {
    setCartOpen(false);
    setActiveOrderId(orderId);
    navigate('/chat');
    setTimeout(() => {
      setStep('cart');
      setName('');
      setPhone('');
    }, 300);
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
            onClick={handleClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-sm z-[70] shadow-2xl flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-primary/5">
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} />
                <h3 className="text-lg font-bold">
                  {step === 'cart' && 'Корзина'}
                  {step === 'form' && 'Оформление'}
                  {step === 'done' && 'Готово!'}
                </h3>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-primary/5 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                {step === 'cart' && (
                  <motion.div
                    key="cart"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
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
                                <span className="text-sm font-bold">{item.product.price * item.qty} ₽</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      if (item.qty <= 1) removeFromCart(item.product.id);
                                      else {
                                        // Decrease qty by removing and re-adding with qty-1
                                        removeFromCart(item.product.id);
                                        for (let n = 0; n < item.qty - 1; n++) {
                                          addToCart(item.product, item.colorIndex);
                                        }
                                      }
                                    }}
                                    className="w-7 h-7 rounded-full border border-primary/10 flex items-center justify-center hover:bg-primary/5 transition-colors"
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <span className="text-sm font-bold w-5 text-center">{item.qty}</span>
                                  <button
                                    onClick={() => addToCart(item.product, item.colorIndex)}
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
                  </motion.div>
                )}

                {step === 'form' && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-5"
                  >
                    <p className="text-sm opacity-50">
                      Оставьте ваши данные и мы свяжемся с вами
                    </p>
                    <div className="space-y-1">
                      <label className="text-sm font-bold px-1">Имя</label>
                      <input
                        value={name}
                        // Strip digits/symbols on the way in so the user can't
                        // accidentally save "test123" as their name.
                        onChange={(e) => setName(sanitizeNameInput(e.target.value))}
                        onBlur={() => setNameTouched(true)}
                        placeholder="Ваше имя"
                        className={cn(
                          'w-full bg-surface rounded-full px-5 py-3 border-2 shadow-sm outline-none text-sm transition-colors',
                          nameTouched && !nameValid
                            ? 'border-red-400 focus:border-red-500'
                            : 'border-transparent focus:border-primary',
                        )}
                      />
                      {nameTouched && !nameValid && (
                        <p className="text-[11px] text-red-500 px-2">Введите имя (минимум 2 буквы, без цифр)</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-bold px-1">Телефон</label>
                      <input
                        value={phone}
                        // Auto-formats to +998 (XX) XXX-XX-XX (or +7 …) as the
                        // user types and silently drops anything non-digit.
                        onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                        onBlur={() => setPhoneTouched(true)}
                        placeholder="+7 (999) 123-45-67"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        className={cn(
                          'w-full bg-surface rounded-full px-5 py-3 border-2 shadow-sm outline-none text-sm transition-colors',
                          phoneTouched && !phoneValid
                            ? 'border-red-400 focus:border-red-500'
                            : 'border-transparent focus:border-primary',
                        )}
                      />
                      {phoneTouched && !phoneValid && (
                        <p className="text-[11px] text-red-500 px-2">Введите номер целиком (минимум 9 цифр)</p>
                      )}
                    </div>

                    {/* Order summary */}
                    <div className="bg-surface rounded-2xl p-4 shadow-sm">
                      <p className="text-xs opacity-40 mb-2">Ваш заказ</p>
                      {cart.map((item) => (
                        <div key={item.product.id} className="flex justify-between text-sm py-1">
                          <span>{item.product.name} × {item.qty}</span>
                          <span className="font-bold">{item.product.price * item.qty} ₽</span>
                        </div>
                      ))}
                      <div className="border-t border-primary/5 mt-2 pt-2 flex justify-between font-bold">
                        <span>Итого</span>
                        <span>{total} ₽</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 'done' && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center"
                  >
                    <div className="bg-primary/5 rounded-full p-6 mb-6">
                      <Send size={32} className="text-primary" />
                    </div>
                    <h4 className="text-xl font-bold mb-2">Заказ отправлен!</h4>
                    <p className="text-sm opacity-50 mb-1">Заказ #{orderId}</p>
                    <p className="text-sm opacity-50 mb-6">
                      Перейдите в чат, чтобы связаться с администратором
                    </p>
                    <button
                      onClick={handleGoToChat}
                      className="bg-primary text-primary-inv rounded-full px-8 py-3 font-bold hover:scale-105 active:scale-95 transition-all"
                    >
                      Открыть чат
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            {step === 'cart' && cart.length > 0 && (
              <div className="p-6 border-t border-primary/5">
                <div className="flex justify-between mb-4">
                  <span className="opacity-50">Итого</span>
                  <span className="text-xl font-bold">{total} ₽</span>
                </div>
                <button
                  onClick={() => setStep('form')}
                  className="w-full bg-primary text-primary-inv rounded-full py-4 font-bold hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Оформить заказ
                </button>
              </div>
            )}

            {step === 'form' && (
              <div className="p-6 border-t border-primary/5">
                {submitError && (
                  <p className="text-xs text-red-500 mb-2 px-1">{submitError}</p>
                )}
                <button
                  onClick={handlePlaceOrder}
                  disabled={submitting || !formValid}
                  className={cn(
                    "w-full rounded-full py-4 font-bold transition-all",
                    !submitting && formValid
                      ? "bg-primary text-primary-inv hover:scale-[1.02] active:scale-[0.98]"
                      : "bg-primary/20 text-primary/40 cursor-not-allowed"
                  )}
                >
                  {submitting ? 'Отправляем…' : 'Отправить заказ'}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
