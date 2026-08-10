/**
 * Service Worker — גרסה 2.5.0
 * מוחק רק caches של הספר ואינו שומר מפות, AI או שמע דינמי.
 */

// Prefix נפרד מגרסאות הצילום, כדי ש־SW היסטורי לא ימחק את מטמון האתר החי.
const CACHE_PREFIX = 'ilan-roadbook-v250-';
const CACHE_NAME = `${CACHE_PREFIX}build-1`;
const LEGACY_LIVE_CACHES = new Set(['ilan-roadbook-live-v2.4.0-build-1']);
const APP_FILES = [
  './',
  './index.html',
  './manifest-2.5.0.webmanifest',
  './offline-2.5.0.html',
  './assets/app-v2.5.0.css',
  './assets/app-v2.5.0.js',
  './data/config-v2.5.0.js',
  './data/legacy-content-v2.js',
  './data/new-routes-v2.js',
  './data/route-expansion-v2.3.0.js',
  './data/release-audit-v2.3.0.js',
  './icons/icon.svg',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_FILES.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || LEGACY_LIVE_CACHES.has(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const scopePath = new URL(self.registration.scope).pathname;
        const isAppShell = url.pathname === scopePath || url.pathname === `${scopePath}index.html`;
        if (response.ok && isAppShell) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./offline-2.5.0.html'));
      }
    })());
    return;
  }

  const relativePath = `.${url.pathname.slice(new URL(self.registration.scope).pathname.length - 1)}`;
  const isPrecached = APP_FILES.includes(relativePath) || APP_FILES.includes(`./${url.pathname.split('/').at(-1)}`);
  if (!isPrecached) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) {
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});
