/* Builds the pre-filled WhatsApp message the "Написать в WhatsApp" buttons open
 * with. Fixed greeting/closing lines never change; product names, prices and the
 * cart total are filled in automatically so the customer types nothing. */

const HELLO = 'Здравствуйте!';
const OUTRO = 'Можете рассказать подробнее? Хотел бы приобрести.';

const money = (n: number) => n.toLocaleString('ru-RU');

/** Single product page → name + price. */
export function productWhatsappMessage(name: string, price: number): string {
  return [HELLO, `Меня интересует «${name}».`, `Цена: ${money(price)} ₽.`, OUTRO].join('\n');
}

export interface WhatsappCartLine {
  name: string;
  price: number;
  qty: number;
}

/** Cart → every item with its line total, plus the grand total. */
export function cartWhatsappMessage(items: WhatsappCartLine[], total: number): string {
  const lines = items.map(
    (i) => `• ${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''} — ${money(i.price * i.qty)} ₽`,
  );
  return [
    HELLO,
    'Меня интересуют следующие товары:',
    ...lines,
    `Итого: ${money(total)} ₽.`,
    OUTRO,
  ].join('\n');
}
