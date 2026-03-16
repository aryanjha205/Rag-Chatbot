const CACHE_NAME = 'rag-analyst-v1';
const urlsToCache = [
  '/',
  '/static/style.css',
  '/static/script.js',
  '/manifest.json',
  '/static/icon.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method === 'GET') {
      event.respondWith(
        fetch(event.request).catch(() => {
          return caches.match(event.request);
        })
      );
  }
});
