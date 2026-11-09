import { useEffect } from 'react';

/**
 * Keeps <title>, description and canonical in sync while the SPA navigates.
 * The server renderer (backend/app/seo) writes the same values into the first
 * HTML response; this hook updates them on client-side route changes so the
 * tab title, Метрика page views and share dialogs stay correct.
 */
export interface DocumentMeta {
  title: string;
  description?: string;
  /** Path only, e.g. `/catalog/krovati`; the origin is taken from the page. */
  canonicalPath?: string;
  /** `noindex` for private screens (order, chat, profile, admin). */
  robots?: string;
}

export const SITE_NAME = 'ROOOMEBEL';

function upsertMeta(selector: string, attrs: Record<string, string>, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function applyDocumentMeta(meta: DocumentMeta): void {
  if (typeof document === 'undefined') return;
  document.title = meta.title;
  upsertMeta('meta[property="og:title"]', { property: 'og:title' }, meta.title);
  if (meta.description !== undefined) {
    upsertMeta('meta[name="description"]', { name: 'description' }, meta.description);
    upsertMeta('meta[property="og:description"]', { property: 'og:description' }, meta.description);
  }
  upsertMeta('meta[name="robots"]', { name: 'robots' }, meta.robots ?? 'index, follow, max-image-preview:large');
  if (meta.canonicalPath !== undefined) {
    const href = `${window.location.origin}${meta.canonicalPath}`;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
    upsertMeta('meta[property="og:url"]', { property: 'og:url' }, href);
  }
}

export function useDocumentMeta(meta: DocumentMeta | null): void {
  useEffect(() => {
    if (meta) applyDocumentMeta(meta);
  }, [meta?.title, meta?.description, meta?.canonicalPath, meta?.robots]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Same price formatting the server uses in titles: 18 000. */
export const formatPrice = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ');
