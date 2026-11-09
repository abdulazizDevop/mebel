/**
 * Яндекс.Метрика — loaded ONLY after the visitor allowed analytics cookies
 * (spec §31). The counter id comes from `VITE_METRIKA_ID`; when it is empty
 * (default) nothing is ever loaded, so the compliance gating is in place
 * before the counter itself is switched on.
 *
 * Webvisor (session replay) is off unless VITE_METRIKA_WEBVISOR=1 — it records
 * everything on screen, including chat messages, so it needs a deliberate
 * decision by the owner (documented in compliance/processors.md).
 */
type YmFn = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };

declare global {
  interface Window {
    ym?: YmFn;
  }
}

const COUNTER_ID = Number(import.meta.env.VITE_METRIKA_ID || 0);
const WEBVISOR = import.meta.env.VITE_METRIKA_WEBVISOR === '1';

let loaded = false;

export function isMetrikaEnabled(): boolean {
  return COUNTER_ID > 0;
}

export function isMetrikaLoaded(): boolean {
  return loaded;
}

export function loadMetrika(): void {
  if (!COUNTER_ID || loaded || typeof window === 'undefined') return;
  loaded = true;

  if (!window.ym) {
    const ym: YmFn = function (...args: unknown[]) {
      (ym.a = ym.a || []).push(args);
    };
    ym.l = Date.now();
    window.ym = ym;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.appendChild(script);

  window.ym(COUNTER_ID, 'init', {
    ssr: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    ecommerce: 'dataLayer',
    webvisor: WEBVISOR,
  });
}

/** SPA navigation → page view. No-op until the counter is loaded. */
export function metrikaHit(url: string): void {
  if (!loaded || !window.ym) return;
  window.ym(COUNTER_ID, 'hit', url);
}

/** Conversion goal. No-op without consent. The two goals the owner creates in
 *  Метрика as «JavaScript-событие» are `order` (catalogue order) and
 *  `custom_order` (individual order); both fire ONLY after POST /orders
 *  returned 201 — never on cart or page view. */
export function metrikaGoal(name: 'order' | 'custom_order', params?: Record<string, unknown>): void {
  if (!loaded || !window.ym) return;
  window.ym(COUNTER_ID, 'reachGoal', name, params);
}

export interface PurchaseLine {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** Метрика e-commerce `purchase` (counter inited with `ecommerce: 'dataLayer'`),
 *  so Директ reports revenue per campaign. Same consent gate as the goals. */
export function metrikaPurchase(orderId: string, revenue: number, lines: PurchaseLine[]): void {
  if (!loaded || !window.ym) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    ecommerce: {
      currencyCode: 'RUB',
      purchase: {
        actionField: { id: orderId, revenue },
        products: lines.map((l) => ({
          id: l.id,
          name: l.name,
          price: l.price,
          quantity: l.quantity,
          ...(l.category ? { category: l.category } : {}),
        })),
      },
    },
  });
}
