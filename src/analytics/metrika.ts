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

/**
 * Mirrors the snippet Метрика gives in the counter settings (2026 version).
 *
 * The script URL MUST carry `?id=<counter>`: with `ssr: true` in init, a bare
 * `tag.js` never consumes the `ym(...)` queue — no page views, no goals.
 * That was the cause of «0 визитов» (verified 2026-11-24 in headless Chrome:
 * bare tag.js + ssr → no /watch requests; tag.js?id= + ssr → hits sent).
 */
export function loadMetrika(): void {
  if (!COUNTER_ID || loaded || typeof window === 'undefined') return;
  loaded = true;

  const src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`;
  if (!window.ym) {
    // Same stub as the official snippet: queue the raw `arguments` objects.
    const ym: YmFn = function () {
      // eslint-disable-next-line prefer-rest-params
      (ym.a = ym.a || []).push(arguments);
    };
    ym.l = Date.now();
    window.ym = ym;
  }
  if (!Array.from(document.scripts).some((s) => s.src === src)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  window.ym(COUNTER_ID, 'init', {
    ssr: true,
    webvisor: WEBVISOR,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: document.referrer,
    url: window.location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  });
  lastHitUrl = window.location.href;
}

let lastHitUrl = '';

/** SPA navigation → page view. No-op until the counter is loaded; skips the
 *  URL that init already counted, so the first screen is never doubled. */
export function metrikaHit(url: string): void {
  if (!loaded || !window.ym) return;
  const absolute = new URL(url, window.location.origin).href;
  if (absolute === lastHitUrl) return;
  window.ym(COUNTER_ID, 'hit', absolute, { referer: lastHitUrl || document.referrer });
  lastHitUrl = absolute;
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
