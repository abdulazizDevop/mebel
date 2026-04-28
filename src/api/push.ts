/* Browser-side Web Push lifecycle: register the service worker, subscribe
 * via PushManager with the server's VAPID public key, and ship the
 * subscription to the backend so server-sent pushes can fan-out.
 *
 * Designed to be called after a successful login (admin or customer). It's
 * a best-effort path — if the browser blocks notifications or the OS
 * doesn't support Web Push, we silently no-op so the storefront UX never
 * depends on push working. */

import { api, tokenStore } from './client';

interface VapidKeyResponse {
  public_key: string;
}

export const fetchVapidKey = () => api.get<VapidKeyResponse>('/push/vapid-key');

/** Decode the URL-safe base64 VAPID public key (RFC 4648 §5) into the
 *  Uint8Array the PushManager expects as `applicationServerKey`. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Subscribe the current browser tab. Safe to call repeatedly — if a
 * subscription already exists it gets re-posted to the backend so the row
 * is associated with the *current* logged-in user (handy after a profile
 * switch on the same browser).
 *
 * Returns true on success, false on any silent skip (no support, denied
 * permission, no JWT, etc.). Caller should never block a UI flow on it.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  // Don't even ask — caller likely had a chance to show their own opt-in
  // explainer first. If permission was already denied, skip.
  if (Notification.permission === 'denied') return false;

  const slot: 'admin' | 'customer' | null =
    tokenStore.get('admin') ? 'admin' : tokenStore.get('customer') ? 'customer' : null;
  if (!slot) return false;

  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return false;
  }

  const registration =
    (await navigator.serviceWorker.getRegistration('/sw.js')) ||
    (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { public_key } = await fetchVapidKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast through `BufferSource` — TS's PushManager type is overly strict
      // about the buffer flavour (SharedArrayBuffer vs ArrayBuffer) but
      // browsers happily accept any Uint8Array view here.
      applicationServerKey: urlBase64ToUint8Array(public_key) as unknown as BufferSource,
    });
  }

  const subJson = subscription.toJSON();
  if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return false;

  await api.post('/push/subscriptions', {
    endpoint: subJson.endpoint,
    keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
  }, { tokenSlot: slot });
  return true;
}

/**
 * Tear down the local subscription and tell the backend to delete the row.
 * Called from the logout flow so the next user on the same browser doesn't
 * receive notifications addressed to the previous account.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => {});
    // Best-effort backend cleanup — we already nuked the local sub regardless.
    await api.delete('/push/subscriptions', { body: { endpoint } }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
