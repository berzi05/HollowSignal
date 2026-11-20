// Increment the revision whenever the app shell changes, and keep CACHE_REVISION in
// app.js identical (test/sw.test.js enforces this). Scope isolates installations.
const CACHE_PREFIX = `hollow-signal:${self.registration.scope}:`;
const REVISION = 'v12';
const CACHE_NAME = `${CACHE_PREFIX}${REVISION}`;
const SHELL = ['./', './index.html', './styles.css', './response.css', './app.js', './engine.js', './relay.js', './crisis.js', './response-ui.js', './health.js', './health-ui.js', './health.css', './updates.js', './brief.js', './ai-ui.js', './ai.css', './manifest.webmanifest', './icon.svg', './fonts/dm-sans.ttf', './fonts/space-grotesk.ttf']
  .map(path => new URL(path, self.registration.scope).href);
const SHELL_URLS = new Set(SHELL);
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'HOLLOW_CACHE_STATUS' || !event.ports?.[0]) return;
  event.waitUntil((async () => {
    let ready = false;
    try {
      // Cache creation alone does not mean installation succeeded. Check every asset
      // in this revision, not an old revision or an empty/partially evicted cache.
      if ((await caches.keys()).includes(CACHE_NAME)) {
        const cache = await caches.open(CACHE_NAME);
        const responses = await Promise.all(SHELL.map(url => cache.match(url)));
        ready = responses.every(response => response?.ok);
      }
    } catch {
      ready = false;
    }
    event.ports[0].postMessage({ type: 'HOLLOW_CACHE_STATUS', revision: REVISION, ready });
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (SHELL_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url.href);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(url.href, response.clone());
      return response;
    })());
  } else if (request.mode === 'navigate' && url.href.startsWith(self.registration.scope)) {
    // Unrecognized requests are never cached. Only navigation may fall back to the shell.
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(INDEX_URL) || Response.error();
    }));
  }
});
