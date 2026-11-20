// public/sw.js
const CACHE_NAME = 'geofield-cache-v6';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && !cacheName.startsWith('geofield-map-tiles')) {
            return caches.delete(cacheName);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Let live APIs and map tile loader handle their own caching
  if (
    url.includes('postcode.gov.ng') ||
    url.includes('nominatim.openstreetmap.org') ||
    url.includes('tile.openstreetmap.org') ||
    url.includes('mt1.google.com') ||
    url.includes('arcgisonline.com')
  ) {
    return;
  }

  // Cache-first with runtime caching for Vite /assets/*.js and /assets/*.css bundles
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((networkRes) => {
          if (
            networkRes &&
            networkRes.ok &&
            event.request.method === 'GET' &&
            url.startsWith(self.location.origin)
          ) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkRes;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});