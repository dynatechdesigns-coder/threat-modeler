/* Threat Modeler service worker.
 *
 * What it does: keeps the app itself (pages, scripts, styles, icons) on the device so the app opens with no internet.
 * What it never does: touch the API. Reports, scans and sign-in always go to the server, and no private data is
 * stored by this file. Anything on another website is left alone too.
 *
 * Change VERSION whenever you edit this file, so old caches are cleaned up.
 */
const VERSION = 'tm-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const MAX_ASSETS = 80;
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/favicon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Pages: try the network first so people get the newest version, but fall back fast to the saved app.
async function pageRequest(request) {
  try {
    const response = await fetchWithTimeout(request, 4000);
    const isHtml = (response.headers.get('content-type') || '').includes('text/html');
    if (response.ok && isHtml) {
      const cache = await caches.open(SHELL);
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_ASSETS) await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map((k) => cache.delete(k)));
}

// Scripts, styles, images, fonts: serve the saved copy instantly and refresh it in the background.
// Build file names change with every release, so a saved copy is never the wrong version.
async function assetRequest(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        await trim(cache);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    refresh.catch(() => null);
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // the API and other sites are never touched
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(pageRequest(request));
    return;
  }
  if (/\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(assetRequest(request));
  }
});
