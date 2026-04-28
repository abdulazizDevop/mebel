/* global self, clients */
/* Service Worker for ROOOMEBEL Web Push.
 *
 * Listens for push events from the FastAPI backend and shows a system
 * notification. Clicking it focuses an existing tab (or opens a new one)
 * at the URL the server picked (e.g. /chat or /admin).
 *
 * Lives at the site root (`/sw.js`) so its scope covers the whole app.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) {
          // Same-origin SPA → just focus + navigate.
          if ('navigate' in win) {
            win.navigate(target);
          }
          return win.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return null;
    })
  );
});
