/**
 * Ad attribution: which campaign brought this visitor.
 *
 * On every page load the URL is checked for `utm_*`, `yclid` (Яндекс.Директ)
 * and `gclid` (Google Ads). When any mark is present it REPLACES the stored
 * attribution ("last non-direct click", the same model Метрика uses by
 * default, so our admin report and Метрика agree). A visit without marks keeps
 * whatever was stored, for ATTRIBUTION_TTL_DAYS. The stored marks are sent
 * with the `visit` analytics event and attached to the order at checkout.
 *
 * These marks are campaign identifiers, not personal data, and they are the
 * core of the paid "which ad brought the order" feature — so they are kept
 * even when the visitor declines analytics cookies, and survive the profile
 * wipe on logout (see useStore.wipeAllAndReload).
 */
import type { AttributionDTO } from '../api/types';

export const ATTRIBUTION_KEY = 'rooomebel.attribution';
const ATTRIBUTION_TTL_DAYS = 30;
const MARK_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid'] as const;

interface StoredAttribution extends AttributionDTO {
  captured_at: string;
}

function safeGet(): StoredAttribution | null {
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    const age = Date.now() - new Date(parsed.captured_at).getTime();
    if (!Number.isFinite(age) || age > ATTRIBUTION_TTL_DAYS * 86_400_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeSet(value: StoredAttribution): void {
  try {
    window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
  } catch {
    /* private mode / quota — attribution is best-effort */
  }
}

const clip = (v: string | null, max = 255) => (v ? v.trim().slice(0, max) : '');

/** Read marks from the current URL and persist them when present. Call once per load. */
export function captureAttribution(search: string = window.location.search, path: string = window.location.pathname): void {
  const params = new URLSearchParams(search);
  const marks: AttributionDTO = {};
  for (const key of MARK_KEYS) {
    const v = clip(params.get(key), key === 'yclid' || key === 'gclid' ? 128 : 255);
    if (v) marks[key] = v;
  }
  if (Object.keys(marks).length === 0) return; // direct / organic → keep the stored source
  safeSet({ ...marks, landing_page: clip(path + search, 500), captured_at: new Date().toISOString() });
}

/** Marks to attach to analytics events and orders; `undefined` when none. */
export function getAttribution(): AttributionDTO | undefined {
  const stored = safeGet();
  if (!stored) return undefined;
  const { captured_at: _ignored, ...marks } = stored;
  return marks;
}
