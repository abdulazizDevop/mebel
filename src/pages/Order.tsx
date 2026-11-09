import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { cn } from '../utils/cn';
import { formatPhoneInput, isValidName, isValidPhone, sanitizeNameInput } from '../utils/format';
import { CONSENT_ERRORS, ConsentCheckbox, MarketingConsentText, TermsConsentText } from '../components/ConsentCheckbox';
import { orderSuccessPath, productPath } from '../utils/paths';

/* /order — the checkout page. Used to live inside the cart drawer; a page of
 * its own gives Метрика/Директ a clean step (cart → /order → /order/success)
 * and a URL the customer can return to. The conversion itself is NOT fired
 * here: useStore.placeOrder fires the `order` goal only after the server
 * returned 201, then we navigate to the success page. */
export function Order() {
  const { cart, placeOrder, userSession } = useStore();
  const navigate = useNavigate();

  const [name, setName] = useState(userSession?.name || '');
  const [phone, setPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [termsTouched, setTermsTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const nameValid = isValidName(name);
  const phoneValid = isValidPhone(phone);
  const formValid = nameValid && phoneValid;
  const total = cart.reduce((s, i) => s + i.product.price * i.qty, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameTouched(true);
    setPhoneTouched(true);
    setTermsTouched(true);
    if (!formValid || submitting) return;
    if (!termsAccepted) {
      setSubmitError(CONSENT_ERRORS.terms);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const id = await placeOrder(name.trim(), phone.trim(), { marketing: marketingConsent });
    setSubmitting(false);
    if (!id) {
      setSubmitError('Не удалось оформить заказ. Попробуйте ещё раз.');
      return;
    }
    navigate(orderSuccessPath(id), { replace: true });
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="inline-flex bg-primary/5 rounded-full p-5 mb-4">
          <ShoppingBag size={32} className="opacity-30" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Корзина пуста</h1>
        <p className="text-sm opacity-60 mb-6">Добавьте товары из каталога, чтобы оформить заказ.</p>
        <Link to="/catalog" className="inline-block bg-primary text-primary-inv rounded-full px-8 py-3 font-bold">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  const inputClass = (invalid: boolean) =>
    cn(
      'w-full bg-surface rounded-full px-5 py-3 border-2 shadow-sm outline-none text-sm transition-colors',
      invalid ? 'border-red-400 focus:border-red-500' : 'border-transparent focus:border-primary',
    );

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto pb-10">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm opacity-60 hover:opacity-100 transition-opacity mb-4"
      >
        <ArrowLeft size={16} /> Назад
      </button>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Оформление заказа</h1>
      <p className="text-sm opacity-50 mb-6">Оставьте ваши данные и мы свяжемся с вами</p>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-1">
          <label htmlFor="order-name" className="text-sm font-bold px-1">Имя</label>
          <input
            id="order-name"
            value={name}
            onChange={(e) => setName(sanitizeNameInput(e.target.value))}
            onBlur={() => setNameTouched(true)}
            placeholder="Ваше имя"
            autoComplete="name"
            className={inputClass(nameTouched && !nameValid)}
          />
          {nameTouched && !nameValid && (
            <p className="text-[11px] text-red-500 px-2">Введите имя (минимум 2 буквы, без цифр)</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="order-phone" className="text-sm font-bold px-1">Телефон</label>
          <input
            id="order-phone"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            onBlur={() => setPhoneTouched(true)}
            placeholder="+7 (999) 123-45-67"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={inputClass(phoneTouched && !phoneValid)}
          />
          {phoneTouched && !phoneValid && (
            <p className="text-[11px] text-red-500 px-2">Введите номер целиком (минимум 9 цифр)</p>
          )}
        </div>

        {/* Order summary */}
        <div className="bg-surface rounded-2xl p-4 shadow-sm">
          <p className="text-xs opacity-40 mb-2">Ваш заказ</p>
          {cart.map((item) => (
            <div key={item.product.id} className="flex items-center gap-3 py-1.5 text-sm">
              <img
                src={item.product.colorVariants[item.colorIndex]?.image || item.product.image}
                alt=""
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
              <Link to={productPath(item.product)} className="flex-1 min-w-0 truncate hover:opacity-70">
                {item.product.name} × {item.qty}
              </Link>
              <span className="font-bold whitespace-nowrap">{(item.product.price * item.qty).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
          <div className="border-t border-primary/5 mt-2 pt-2 flex justify-between font-bold">
            <span>Итого</span>
            <span>{total.toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>

        {/* Legal consents — required terms box + optional marketing box */}
        <div className="space-y-2">
          <ConsentCheckbox
            id="order-terms"
            checked={termsAccepted}
            invalid={termsTouched && !termsAccepted}
            onChange={(v) => {
              setTermsAccepted(v);
              if (v && submitError === CONSENT_ERRORS.terms) setSubmitError('');
            }}
          >
            <TermsConsentText />
          </ConsentCheckbox>
          {termsTouched && !termsAccepted && (
            <p className="text-[11px] text-red-500 px-2">{CONSENT_ERRORS.terms}</p>
          )}
          <ConsentCheckbox id="order-marketing" checked={marketingConsent} onChange={setMarketingConsent}>
            <MarketingConsentText />
          </ConsentCheckbox>
        </div>

        {submitError && submitError !== CONSENT_ERRORS.terms && (
          <p className="text-xs text-red-500 px-1">{submitError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'w-full rounded-full py-4 font-bold transition-all',
            !submitting ? 'bg-primary text-primary-inv hover:scale-[1.02] active:scale-[0.98]' : 'bg-primary/20 text-primary/40 cursor-wait',
          )}
        >
          {submitting ? 'Отправляем…' : 'Отправить заказ'}
        </button>
      </form>
    </motion.div>
  );
}
