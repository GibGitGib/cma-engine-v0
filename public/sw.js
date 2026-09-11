// Instant CMA — service worker
// Two caches, deliberately separate:
//   shell  — app UI, precached, cache-first (it changes only on deploy)
//   data   — /api/cma responses, network-first with offline fallback
// The data cache is the point of this SW: an agent standing in a property with
// no signal can still open a CMA they ran earlier.

const VERSION = 'v1';
const SHELL_CACHE = `cma-shell-${VERSION}`;
const DATA_CACHE = `cma-data-${VERSION}`;
const MAX_CACHED_CMAS = 25;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Individual addAll failures shouldn't abort the whole install.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((a) => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** Keep the CMA cache bounded — oldest insertions evicted first. */
async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/** Re-emit a cached response with a header the UI can detect. */
async function markStale(response) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  headers.set('X-CMA-Offline', '1');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/** CMA data: fresh when online, last-known-good when not. */
async function cmaStrategy(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      await cache.put(request, fresh.clone());
      await trimCache(cache, MAX_CACHED_CMAS);
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return markStale(cached);
    return new Response(
      JSON.stringify({ error: 'You are offline and this CMA has not been run before.', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-CMA-Offline': '1' } }
    );
  }
}

/** Navigations: network-first so deploys land, cached shell when offline. */
async function navigationStrategy(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match(request)) || (await cache.match('/index.html')) || (await cache.match('/'))
      || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

/** Static assets: cache-first, refill in the background. */
async function assetStrategy(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache cross-origin calls (e.g. the Census geocoder).
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/cma')) {
    event.respondWith(cmaStrategy(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
  } else {
    event.respondWith(assetStrategy(request));
  }
});

// Lets the page trigger an immediate update instead of waiting for a reload.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
