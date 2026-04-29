/* global self, caches */
/* Service Worker for ROOOMEBEL.
 *
 * Three jobs:
 *   1. Web Push — show system notifications when the FastAPI backend sends
 *      a push (admin reply, new order, etc.).
 *   2. Offline / fast-load caching — keep the app shell + already-seen
 *      products around so a flaky connection doesn't blank the storefront.
 *   3. Self-update — bump CACHE_VERSION on each deploy and the SW will
 *      fetch new bundles automatically; the page asks the SW to
 *      `skipWaiting` once the user accepts the update banner.
 *
 * Lives at the site root (`/sw.js`) so its scope covers the whole app.
 *
 * IMPORTANT: when you ship a new frontend build, bump CACHE_VERSION below.
 * The Vite output hashes asset filenames, so old bundles still load from
 * cache for clients mid-session — this version bump is what triggers the
 * eventual refresh.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `mebel-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `mebel-runtime-${CACHE_VERSION}`;

// App shell — files we want cached on install so the storefront opens
// instantly even before the network responds.
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

// ─── Lifecycle ─────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      // Don't `skipWaiting()` here — we want the page to ask first via
      // postMessage, so the user sees the "update available" banner instead
      // of a silent reload.
      .catch(() => {/* offline / 404 — fine, cache lazily later */}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Drop caches from old versions so storage doesn't grow forever.
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('mebel-') && n !== STATIC_CACHE && n !== RUNTIME_CACHE)
            .map((n) => caches.delete(n)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

// Page-to-SW message channel — the app posts `{ type: 'SKIP_WAITING' }` when
// the user accepts the update prompt; this swaps the new SW into control
// without forcing the user to close and reopen the app.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Fetch caching ─────────────────────────────────────────────────────

const isApi = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/auth/') ||
  url.pathname.startsWith('/products') ||
  url.pathname.startsWith('/categories') ||
  url.pathname.startsWith('/orders') ||
  url.pathname.startsWith('/admin/') ||
  url.pathname.startsWith('/analytics/') ||
  url.pathname.startsWith('/stats') ||
  url.pathname.startsWith('/push/') ||
  url.pathname.startsWith('/uploads/');

/** Network-first with cache fallback — used for HTML and API calls so the
 *  user gets fresh data when online and the last-known good response when
 *  offline. */
async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    // Only cache successful, basic-type responses to avoid storing 500s
    // and opaque cross-origin garbage.
    if (fresh.ok && (fresh.type === 'basic' || fresh.type === 'default')) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Last-resort offline page is just the shell — react-router handles
    // the actual route on the client.
    if (req.mode === 'navigate') {
      const shell = await caches.match('/');
      if (shell) return shell;
    }
    throw new Error('offline and no cache');
  }
}

/** Stale-while-revalidate — returns cached copy immediately if any, then
 *  fetches a fresh one in the background to update the cache. Perfect for
 *  hashed bundles and product images. */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached); // network failed; fall back to cache below
  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutations
  const url = new URL(request.url);

  // Cross-origin requests (Google Fonts, S3 images, push endpoints) — let
  // the browser handle them with default semantics.
  if (url.origin !== self.location.origin) return;

  // /ws — WebSocket upgrades — never touch.
  if (url.pathname.startsWith('/ws/')) return;

  // API + auth + dynamic data: always try the network first.
  if (isApi(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // HTML navigations: network-first so deploys roll out fast.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (JS, CSS, fonts, images, manifest, sw): SWR — instant
  // load from cache, refresh in background.
  event.respondWith(staleWhileRevalidate(request));
});

// ─── Web Push ──────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }

  const title = payload.title || 'ROOOMEBEL';
  const body = payload.body || 'Новое сообщение';
  const url = payload.url || '/';
  const orderId = payload.order_id || '';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      // Tagging by order id collapses repeated messages from the same chat
      // into a single notification — the customer doesn't see 20 stacked
      // banners if the admin types five short replies in a row.
      tag: orderId ? `order-${orderId}` : 'mebel-msg',
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) {
          if ('navigate' in win) {
            win.navigate(target);
          }
          return win.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return null;
    }),
  );
});
