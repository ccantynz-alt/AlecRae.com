/// AlecRae Service Worker
/// Email, Evolved.

const CACHE_VERSION = 1;
const CACHE_NAME = 'alecrae-v1';

const APP_SHELL_ROUTES = [
  '/',
  '/inbox',
  '/compose',
  '/sent',
  '/drafts',
  '/settings',
  '/contacts',
  '/templates',
  '/snoozed',
  '/analytics',
  '/domains',
];

// ─── Install ────────────────────────────────────────────────────────────────
// Pre-cache the app shell so the core UI is available offline immediately.

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ROUTES);
    }),
  );
  // Activate the new SW immediately rather than waiting for the old one to release.
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
// Purge caches from previous versions so we never serve stale assets.

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
  // Take control of all open tabs without requiring a reload.
  self.clients.claim();
});

// ─── Fetch ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the URL points to a static asset we should cache
 * aggressively (JS bundles, CSS, images, fonts).
 */
function isStaticAsset(url) {
  const path = url.pathname;
  return (
    path.startsWith('/_next/static/') ||
    path.startsWith('/static/') ||
    /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico)$/i.test(
      path,
    )
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── API requests: network-only (IndexedDB handles offline data) ──
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── Tracking pixel: network-only, never cache ──
  if (url.pathname.startsWith('/t/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── Static assets: cache-first with network fallback ──
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then((response) => {
          // Only cache successful, same-origin responses.
          if (
            response.ok &&
            response.type === 'basic'
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      }),
    );
    return;
  }

  // ── Navigation requests (HTML): network-first with cache fallback ──
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Stale-while-revalidate: update the cache for next time.
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // Offline — serve from cache.
          return caches.match(event.request).then((cached) => {
            // Fall back to the root app shell if we don't have the exact page.
            return cached || caches.match('/');
          });
        }),
    );
    return;
  }

  // ── Everything else: network with cache fallback ──
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});

// ─── Message Handler ────────────────────────────────────────────────────────
// Accept SKIP_WAITING from the client so a waiting worker can take over.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Background Sync ────────────────────────────────────────────────────────
// When the browser regains connectivity it fires a sync event so we can flush
// queued outbox emails that were composed offline.

self.addEventListener('sync', (event) => {
  if (event.tag === 'outbox-flush') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'outbox-flush' });
        }
      }),
    );
  }
});

// ─── Push Notifications ─────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  /** @type {{ title?: string; body?: string; icon?: string; badge?: string; tag?: string; data?: unknown }} */
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'AlecRae';
  const options = {
    body: payload.body || 'You have a new email.',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-192x192.png',
    tag: payload.tag || 'alecrae-email',
    data: payload.data || {},
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Open or focus the AlecRae inbox.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (new URL(client.url).pathname.startsWith('/inbox') && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/inbox');
    }),
  );
});
