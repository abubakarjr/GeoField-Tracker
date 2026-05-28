// public/sw.js
const CACHE_NAME = 'geofield-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  // Note: In Vite dev mode, asset paths are dynamic. 
  // This cache logic becomes highly effective after we build for production in Stage 7.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached asset if found, otherwise fetch from network
      return response || fetch(event.request);
    }).catch(() => {
      // Fallback logic for when completely offline and asset isn't cached
      console.log('You are offline and asset is not cached.');
    })
  );
});