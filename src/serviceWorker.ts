/* Service-worker lifecycle for the Mebel storefront.
 *
 * registerSW() is called once on app boot from main.tsx. It:
 *   1. Registers `/sw.js` (no-op if the browser doesn't support SW).
 *   2. Watches for a new SW that's installed but waiting (i.e. the user
 *      has an old version of the bundle in front of them).
 *   3. Calls `onUpdateReady` so the UI can prompt the user to refresh.
 *   4. Reloads the page once the new SW has taken control, so the new
 *      bundle is what they're actually running.
 *
 * Designed to coexist with the push-subscription flow in `src/api/push.ts` —
 * we share a single registration. */

type UpdateHandler = (skipWaiting: () => void) => void;

interface RegisterOptions {
  /** Called when a fresh service worker is installed and waiting. The
   *  callback receives a `skipWaiting()` action — invoke it (typically from
   *  a "Reload to update" button) to swap the new SW into control. */
  onUpdateReady?: UpdateHandler;
}

export function registerSW({ onUpdateReady }: RegisterOptions = {}): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof window === 'undefined') return;

  // Wait for `load` so the SW registration doesn't compete with the initial
  // page render for bandwidth.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // If a worker is already waiting (installed but not controlling),
        // we already have an update queued.
        if (registration.waiting && navigator.serviceWorker.controller) {
          notify(registration.waiting, onUpdateReady);
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              // First-install (no controller) is a fresh user — no banner.
              // Update-install (controller exists) means the user already
              // has an old version: prompt them.
              notify(installing, onUpdateReady);
            }
          });
        });

        // Poll for updates every 30 minutes — covers long-lived PWA sessions
        // where the tab never reloads on its own.
        setInterval(() => {
          registration.update().catch(() => {/* offline — try later */});
        }, 30 * 60 * 1000);
      })
      .catch((err) => {
        // Don't blow up the app over a SW failure (private browsing, etc.).
        console.warn('SW registration failed', err);
      });

    // When the controller changes (after `skipWaiting` lands), reload once
    // so the user is on the new bundle. The `refreshed` guard prevents a
    // reload loop if multiple `controllerchange` events fire.
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  });
}

function notify(worker: ServiceWorker, handler?: UpdateHandler) {
  if (!handler) {
    // No UI handler — auto-update silently. Users who haven't been given
    // a banner still get fresh code on the next navigation.
    worker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  handler(() => worker.postMessage({ type: 'SKIP_WAITING' }));
}
