// CineSync Service Worker
// Enables offline shell + PWA installability

const CACHE_NAME = 'cinesync-v1';

// Files to cache for offline shell
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// Install — cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache for navigation requests
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Always go network-first for API calls — never cache them
  if (request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // For navigation requests (HTML pages), network first then cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For static assets, cache first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});