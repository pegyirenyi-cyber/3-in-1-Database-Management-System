const CACHE_NAME = 'ges-sms-cache-v1';
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/index.css',
  '/src/App.tsx'
];

// Install Event: cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching core app shell...');
      return cache.addAll(STATIC_RESOURCES).catch((err) => {
        console.warn('[Service Worker] Pre-cache warning (some files may be compiled dynamically):', err);
      });
    })
  );
  // Force active state directly
  self.skipWaiting();
});

// Activate Event: clear old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Purging stale obsolete cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: intercept requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // We only intercept GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Bypass Firebase firestore protocol routes which shouldn't be cached through local custom SW
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebase')) {
    return;
  }

  // Handle SPA routing: if requesting helper index/navigation pages, return cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep a fresh index copy in cache
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => {
          // If network fails (offline), load from cache root
          return caches.match('/').then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate caching pattern for general assets (CSS, JS, Fonts, Images)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background refresh to update cache silently
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {
            /* ignore background fetch errors when offline */
          });
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch((err) => {
          // Fallback modes for offline images or fallback components if wanted
          console.log('[Service Worker] Offline fetch failed for:', url.pathname);
          // Return cached fallback if available
          return caches.match(request);
        });
    })
  );
});
