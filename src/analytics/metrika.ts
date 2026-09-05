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

/** Conversion goal (e.g. `zakaz`). No-op without consent. */
export function metrikaGoal(name: string, params?: Record<string, unknown>): void {
  if (!loaded || !window.ym) return;
  window.ym(COUNTER_ID, 'reachGoal', name, params);
}
