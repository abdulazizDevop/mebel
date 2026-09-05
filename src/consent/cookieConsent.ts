/**
 * Cookie-consent state (spec §15/§16) — stored in the visitor's browser and
 * mirrored to the backend ConsentLog by the CookieConsent component.
 *
 * Nothing optional (Яндекс.Метрика, first-party analytics events) may start
 * before `analytics === true`. Necessary storage (JWT, cart, favourites,
 * this preference itself) is always allowed — it is what makes the shop work.
 */
import { LEGAL_VERSION } from '../legal/documents';

export interface CookiePrefs {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  /** Version of the cookie policy the visitor decided on. */
  version: string;
  updatedAt: string;
}

const PREFS_KEY = 'rooomebel.cookie-consent';
const VISITOR_KEY = 'rooomebel.visitor-id';
export const COOKIE_SETTINGS_EVENT = 'rooomebel:cookie-settings';

type Listener = (prefs: CookiePrefs) => void;
const listeners = new Set<Listener>();

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — the banner simply shows again next time */
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '');
  } catch {
    /* fall through */
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** Stable anonymous id used as `request_id` for consents made without an account. */
export function getVisitorId(): string {
  let id = safeGet(VISITOR_KEY);
  if (!id) {
    id = randomId();
    safeSet(VISITOR_KEY, id);
  }
  return id;
}

export function readCookiePrefs(): CookiePrefs | null {
  const raw = safeGet(PREFS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CookiePrefs>;
    if (typeof parsed.analytics !== 'boolean' || typeof parsed.marketing !== 'boolean') return null;
    return {
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      version: typeof parsed.version === 'string' ? parsed.version : LEGAL_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeCookiePrefs(input: { analytics: boolean; marketing: boolean }): CookiePrefs {
  const prefs: CookiePrefs = {
    necessary: true,
    analytics: input.analytics,
    marketing: input.marketing,
    version: LEGAL_VERSION,
    updatedAt: new Date().toISOString(),
  };
  safeSet(PREFS_KEY, JSON.stringify(prefs));
  listeners.forEach((l) => l(prefs));
  return prefs;
}

export function hasAnalyticsConsent(): boolean {
  return readCookiePrefs()?.analytics === true;
}

export function onCookiePrefsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Opens the cookie settings dialog from anywhere (footer link, /cookies page). */
export function openCookieSettings(): void {
  window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT));
}
