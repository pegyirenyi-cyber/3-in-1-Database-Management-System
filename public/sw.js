const CACHE_NAME = 'ges-sms-cache-v2';
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/attendance_empty.jpg'
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

  // Bypass API routes entirely
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Bypass Firebase firestore protocol routes which shouldn't be cached through local custom SW
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('firebase')) {
    return;
  }

  // Cache-First Strategy for all intercepted requests
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // If we found a match in the cache, return it immediately
      if (cachedResponse) {
        // For navigation requests, we still attempt a background update to keep the shell fresh
        if (request.mode === 'navigate') {
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put('/', networkResponse));
            }
          }).catch(() => {
            /* ignore background fetch errors when offline */
          });
        }
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(request)
        .then((networkResponse) => {
          // Check if we received a valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Clone the response before caching it
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // For navigation requests, we always cache them at the root '/'
            const cacheKey = request.mode === 'navigate' ? '/' : request;
            cache.put(cacheKey, responseToCache);
          });

          return networkResponse;
        })
        .catch((err) => {
          console.log('[Service Worker] Fetch failed, and no cache match for:', url.pathname);
          
          // If navigation fails and no cache match, try root fallback
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
          
          return undefined;
        });
    })
  );
});
