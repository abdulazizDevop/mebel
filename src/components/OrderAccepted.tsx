import { CheckCircle2, MessageCircle } from 'lucide-react';
import { OPERATOR } from '../legal/documents';

export interface OrderAcceptedLine {
  name: string;
  qty: number;
  price: number;
}

interface OrderAcceptedProps {
  orderId: string;
  /** Line items for catalogue orders; omit for custom-furniture requests. */
  lines?: OrderAcceptedLine[];
  /** Custom-order description shown instead of line items. */
  customSummary?: string;
  total?: number;
  onOpenChat: () => void;
}

export const formatOrderNumber = (id: string) => id.slice(0, 8).toUpperCase();

/** «Заказ принят» confirmation — wording from the ТЗ §17. */
export function OrderAccepted({ orderId, lines, customSummary, total, onOpenChat }: OrderAcceptedProps) {
  return (
    <div className="text-left w-full">
      <div className="flex flex-col items-center text-center mb-5">
        <div className="bg-primary/5 rounded-full p-5 mb-4">
          <CheckCircle2 size={32} className="text-primary" />
        </div>
        <h4 className="text-xl font-semibold">Заказ принят</h4>
        <p className="text-sm mt-1">
          Номер заказа: <span className="font-semibold">№ {formatOrderNumber(orderId)}</span>
        </p>
        <p className="text-sm opacity-60 mt-1">Спасибо за заказ!</p>
      </div>

      <div className="bg-surface rounded-2xl p-4 shadow-sm text-sm space-y-3">
        <div>
          <p className="text-xs opacity-50 mb-1">Состав заказа:</p>
          {lines && lines.length > 0 ? (
            <ul className="space-y-1">
              {lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 break-words">
                    {l.name} × {l.qty}
                  </span>
                  <span className="font-semibold whitespace-nowrap">{(l.price * l.qty).toLocaleString('ru-RU')} ₽</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="break-words">{customSummary || 'Индивидуальный заказ'}</p>
          )}
        </div>
        <div>
          <p className="text-xs opacity-50 mb-1">Общая стоимость:</p>
          <p className="font-semibold">
            {typeof total === 'number' && total > 0
              ? `${total.toLocaleString('ru-RU')} ₽`
              : 'Рассчитывается после согласования параметров'}
          </p>
        </div>
        <div>
          <p className="text-xs opacity-50 mb-1">Доставка:</p>
          <p>Условия и стоимость доставки согласовываются с вами до подтверждения заказа.</p>
        </div>
        <div>
          <p className="text-xs opacity-50 mb-1">Телефон Rooomebel:</p>
          <a href={OPERATOR.phoneHref} className="font-semibold underline underline-offset-2">{OPERATOR.phone}</a>
        </div>
        <div>
          <p className="text-xs opacity-50 mb-1">E-mail:</p>
          <a href={OPERATOR.emailHref} className="font-semibold underline underline-offset-2 break-all">{OPERATOR.email}</a>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenChat}
        className="mt-5 w-full bg-primary text-primary-inv rounded-full py-3.5 font-semibold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform"
      >
        <MessageCircle size={18} /> Открыть чат
      </button>
    </div>
  );
}
