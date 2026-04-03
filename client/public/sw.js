/* Service Worker for Logix Plus Solutions PWA */

// Bump this version string every deployment to bust stale caches.
// Format: logix-plus-vYYYY-MM-DD or any unique string per deploy.
const CACHE_NAME = 'logix-plus-v2026-04-03';
const RUNTIME_CACHE = 'logix-plus-runtime-v2026-04-03';
// NOTE: intentionally NOT caching index.html here.
// index.html must always be fetched fresh so it references the latest JS/CSS chunk hashes.
const ASSETS_TO_CACHE = [
  '/manifest.json',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // Some assets may fail to cache, but installation should continue
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first, fall back to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // HTML navigation requests (index.html, /) — ALWAYS network first, no cache
  // This ensures new deployments' JS/CSS chunk filenames are always used.
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // API requests - network first
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/v1')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(RUNTIME_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((response) => {
            return response || new Response('Offline - cached data unavailable', { status: 503 });
          });
        })
    );
  } else {
    // Static assets - cache first
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request).then((response) => {
          if (response.ok && (request.method === 'GET')) {
            const cache = caches.open(CACHE_NAME);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        }).catch(() => {
          return new Response('Offline - asset unavailable', { status: 503 });
        });
      })
    );
  }
});

// Handle push notifications (optional)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Logix Plus Solutions notification',
    icon: '/images/favicon-192.png',
    badge: '/images/favicon-192.png',
    tag: data.tag || 'logix-notification',
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Logix Plus Solutions', options)
  );
});

// Handle notification clicks (optional)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
