import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
const scope = 'https://example.test/hollow/';
const currentCache = `hollow-signal:${scope}:v10`;
const shell = ['/', '/index.html', '/styles.css', '/response.css', '/app.js', '/engine.js', '/relay.js', '/crisis.js', '/response-ui.js', '/health.js', '/health-ui.js', '/health.css', '/updates.js', '/brief.js', '/ai-ui.js', '/ai.css', '/manifest.webmanifest', '/icon.svg', '/fonts/dm-sans.ttf', '/fonts/space-grotesk.ttf']
  .map(path => `${scope.slice(0, -1)}${path}`);

function harness({ failInstall = false, offline = false } = {}) {
  const handlers = new Map();
  const stores = new Map();
  const added = [];
  const fetched = [];
  const lifecycle = { skipped: false, claimed: false };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
    async open(key) {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return {
        async addAll(requests) {
          added.push(...requests.map(request => request.url));
          if (failInstall) throw new Error('Network failed during shell install');
          for (const request of requests) store.set(request.url, new Response(`cached:${request.url}`));
        },
        async match(key) { return store.get(typeof key === 'string' ? key : key.url)?.clone(); },
        async put(key, response) { store.set(typeof key === 'string' ? key : key.url, response); },
      };
    },
  };
  vm.runInNewContext(source, {
    URL, Request, Response, caches,
    fetch: async request => {
      fetched.push(request.url);
      if (offline) throw new Error('Offline');
      return new Response(`network:${request.url}`);
    },
    self: {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
      async skipWaiting() { lifecycle.skipped = true; },
      clients: { async claim() { lifecycle.claimed = true; } },
    },
  });
  async function dispatch(name, input = {}) {
    let pending;
    let response;
    handlers.get(name)?.({ ...input, waitUntil: promise => { pending = promise; }, respondWith: promise => { response = promise; } });
    await pending;
    return response ? await response : undefined;
  }
  async function status() {
    let result;
    await dispatch('message', { data: { type: 'HOLLOW_CACHE_STATUS' }, ports: [{ postMessage: value => { result = value; } }] });
    return result;
  }
  return { dispatch, status, stores, added, fetched, lifecycle };
}

test('service worker installs the complete module graph under a subpath', async () => {
  const h = harness();
  await h.dispatch('install');
  assert.deepEqual(h.added, shell);
  assert.equal(h.lifecycle.skipped, true);
  assert.equal((await h.status()).ready, true);
  assert.equal((await h.status()).revision, 'v10');
});

test('offline status rejects missing, failed, old, and partially evicted caches', async () => {
  const fresh = harness();
  assert.equal((await fresh.status()).ready, false);
  assert.equal(fresh.stores.size, 0, 'status must not create an empty cache');
  fresh.stores.set(`hollow-signal:${scope}:v1`, new Map());
  assert.equal((await fresh.status()).ready, false);

  const failed = harness({ failInstall: true });
  await assert.rejects(failed.dispatch('install'), /Network failed/);
  assert.equal(failed.lifecycle.skipped, false);
  assert.equal((await failed.status()).ready, false);

  const partial = harness();
  await partial.dispatch('install');
  partial.stores.get(currentCache).delete(`${scope}relay.js`);
  assert.equal((await partial.status()).ready, false, 'relay module is required offline');

  const missingFont = harness();
  await missingFont.dispatch('install');
  missingFont.stores.get(currentCache).delete(`${scope}fonts/space-grotesk.ttf`);
  assert.equal((await missingFont.status()).ready, false, 'local fonts are required for complete offline assets');
});

test('app expects the same cache revision the worker reports', async () => {
  const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const appRevision = app.match(/const CACHE_REVISION = '([^']+)'/)?.[1];
  const workerRevision = source.match(/const REVISION = '([^']+)'/)?.[1];
  assert.ok(workerRevision, 'sw.js must declare REVISION');
  assert.equal(appRevision, workerRevision, 'bump CACHE_REVISION in app.js together with REVISION in sw.js');
});

test('activation removes old caches only for its own installation', async () => {
  const h = harness();
  await h.dispatch('install');
  const old = `hollow-signal:${scope}:v1`;
  const other = 'hollow-signal:https://example.test/another/:v1';
  h.stores.set(old, new Map());
  h.stores.set(other, new Map());
  h.stores.set('unrelated-app', new Map());
  await h.dispatch('activate');
  assert.equal(h.stores.has(old), false);
  assert.equal(h.stores.has(currentCache), true);
  assert.equal(h.stores.has(other), true);
  assert.equal(h.stores.has('unrelated-app'), true);
  assert.equal(h.lifecycle.claimed, true);
});

test('offline known assets and in-scope navigation resolve from the cached shell', async () => {
  const h = harness({ offline: true });
  await h.dispatch('install');
  const module = await h.dispatch('fetch', { request: { url: `${scope}relay.js`, method: 'GET', mode: 'cors' } });
  assert.equal(await module.text(), `cached:${scope}relay.js`);
  const navigation = await h.dispatch('fetch', { request: { url: `${scope}community?view=family`, method: 'GET', mode: 'navigate' } });
  assert.equal(await navigation.text(), `cached:${scope}index.html`);
  assert.deepEqual(h.fetched, [`${scope}community?view=family`]);
  assert.equal(h.stores.get(currentCache).has(`${scope}community?view=family`), false);
});

test('worker leaves APIs, writes, external requests, and other app navigations alone', async () => {
  const h = harness();
  await h.dispatch('install');
  const before = h.stores.get(currentCache).size;
  for (const request of [
    { url: `${scope}api/records`, method: 'GET', mode: 'cors' },
    { url: `${scope}relay.js`, method: 'POST', mode: 'cors' },
    { url: 'https://elsewhere.test/app.js', method: 'GET', mode: 'cors' },
    { url: 'https://example.test/another/', method: 'GET', mode: 'navigate' },
  ]) {
    assert.equal(await h.dispatch('fetch', { request }), undefined);
  }
  assert.equal(h.stores.get(currentCache).size, before);
  assert.equal(h.fetched.length, 0);
});
