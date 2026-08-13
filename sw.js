/**
 * Service Worker — גרסת מסמך 4.4.1
 * גרסת מוצר: 4.4.1
 * שומר רק את קובצי הספר; מפות וקישורים חיצוניים נשארים מקוונים.
 */

const CACHE_PREFIX = 'ilan-roadbook-v441-';
const CACHE_NAME = `${CACHE_PREFIX}build-4`;
const APP_FILES = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './assets/app-v2.css',
  './assets/app-v2.js',
  './data/config-v2.js',
  './data/legacy-content-v2.js',
  './data/new-routes-v2.js',
  './data/expanded-catalog-v3.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './favicon.ico',
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
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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
        return await fetch(event.request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html')) || (await cache.match('./offline.html'));
      }
    })());
    return;
  }

  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = `./${url.pathname.slice(scopePath.length)}`;
  if (!APP_FILES.includes(relativePath)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
