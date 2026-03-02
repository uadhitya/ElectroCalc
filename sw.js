const CACHE_NAME = 'electrocalci-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Install event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Fetch event - Cache First strategy
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      
      return fetch(e.request)
        .then(response => {
          // Cache new requests
          if(response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(e.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback untuk navigasi
          if(e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// Activate event - Cleanup
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});
