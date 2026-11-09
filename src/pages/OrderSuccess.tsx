import { motion } from 'framer-motion';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { OrderAccepted } from '../components/OrderAccepted';
import { SITE_NAME, useDocumentMeta } from '../seo/useDocumentMeta';

/* /order/success/:id — «Заказ успешно отправлен». A page of its own so the
 * success state has a URL (Метрика shows it as a step; the customer can
 * reload it). The conversion goal has already fired in useStore.placeOrder. */
export function OrderSuccess() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orders, setActiveOrderId } = useStore();
  const order = orders.find((o) => o.id === id);
  useDocumentMeta({ title: `Заказ отправлен | ${SITE_NAME}`, canonicalPath: '/order', robots: 'noindex, nofollow' });

  const lines = order?.items.map((i) => ({ name: i.product.name, qty: i.qty, price: i.product.price })) ?? [];
  const isCustom = !!order && order.items.length === 0;

  const openChat = () => {
    setActiveOrderId(id);
    navigate('/chat');
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md mx-auto pb-10">
      <h1 className="sr-only">Заказ успешно отправлен</h1>
      <div className="bg-surface rounded-3xl shadow-sm p-6 sm:p-8">
        <OrderAccepted
          orderId={id}
          lines={isCustom ? undefined : lines}
          customSummary={isCustom ? 'Индивидуальный заказ — параметры и расчёт стоимости согласуем в чате' : undefined}
          total={order?.total}
          onOpenChat={openChat}
        />
      </div>
      <Link to="/catalog" className="block text-center text-sm font-bold opacity-50 hover:opacity-100 transition-opacity mt-5">
        Вернуться в каталог →
      </Link>
    </motion.div>
  );
}
