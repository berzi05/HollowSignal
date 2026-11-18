import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateMonitor, readWorkerStatus } from '../dist/updates.js';

function harness() {
  const events = new Map(), statuses = [], updates = [], registrations = [];
  let online = true, time = 100000, updateCalls = 0, registrationFails = false;
  const registration = { installing: null, waiting: null, async update() { updateCalls++; } };
  const serviceWorker = {
    controller: { revision: 'v8', ready: true },
    addEventListener: (name, handler) => events.set(name, handler),
    async register(url, options) {
      registrations.push({ url, options });
      if (registrationFails) throw new Error('Server unavailable');
      return registration;
    },
  };
  const config = { serviceWorker, revision: 'v8', onStatus: value => statuses.push(value), onUpdate: value => updates.push(value),
    readStatus: async worker => worker, isOnline: () => online, now: () => time };
  return { serviceWorker, registration, statuses, updates, registrations,
    start: overrides => createUpdateMonitor({ ...config, ...overrides }),
    switchWorker: async worker => { serviceWorker.controller = worker; await events.get('controllerchange')(); },
    setOnline: value => { online = value; }, advance: ms => { time += ms; },
    failRegistration: value => { registrationFails = value; }, updateCalls: () => updateCalls };
}

test('a completed newer cache prompts an update while first install and an older worker do not', async () => {
  const h = harness(), monitor = h.start();
  await monitor.ready;
  assert.deepEqual(h.registrations, [{ url: './sw.js', options: { updateViaCache: 'none' } }]);
  assert.equal(h.statuses.at(-1), true);
  assert.equal(h.updates.at(-1), false);
  await h.switchWorker({ revision: 'v9', ready: false });
  assert.equal(h.updates.at(-1), false, 'incomplete caches are not offered for reload');
  await h.switchWorker({ revision: 'v9', ready: true });
  assert.equal(h.updates.at(-1), true);
  assert.equal(h.statuses.at(-1), false, 'the open page still has the previous revision');
  await h.switchWorker({ revision: 'v7', ready: true });
  assert.equal(h.updates.at(-1), false, 'a fresh page must not reload an older worker');
});

test('update checks distinguish installation, availability, failed requests and offline mode', async () => {
  const h = harness(), monitor = h.start(); await monitor.ready;
  assert.equal(await monitor.check({ force: true }), 'current');
  h.registration.installing = {};
  assert.equal(await monitor.check({ force: true }), 'installing');
  await h.switchWorker({ revision: 'v9', ready: true });
  assert.equal(await monitor.check({ force: true }), 'available');
  h.registration.update = async () => { throw new Error('Server stopped'); };
  assert.equal(await monitor.check({ force: true }), 'unavailable');
  h.setOnline(false);
  assert.equal(await monitor.check({ force: true }), 'offline');
  assert.equal(h.updates.at(-1), true, 'a downloaded update remains usable offline');
});

test('focus checks are throttled, manual checks bypass the timer, and concurrent checks are shared', async () => {
  const h = harness(), monitor = h.start(); await monitor.ready;
  const first = monitor.check(), concurrent = monitor.check({ force: true });
  assert.equal(first, concurrent);
  await first;
  assert.equal(h.updateCalls(), 1);
  assert.equal(await monitor.check(), 'recent');
  assert.equal(h.updateCalls(), 1);
  await monitor.check({ force: true });
  assert.equal(h.updateCalls(), 2);
  h.advance(60000); await monitor.check();
  assert.equal(h.updateCalls(), 3);
});

test('registration failure can recover without reloading or clearing saved data', async () => {
  const h = harness(); h.failRegistration(true);
  const monitor = h.start(); await monitor.ready;
  assert.equal(await monitor.check({ force: true }), 'unavailable');
  h.failRegistration(false);
  assert.equal(await monitor.check({ force: true }), 'current');
  assert.equal(h.registrations.length, 3);
});

test('slow replies from a replaced worker cannot hide a newer update', async () => {
  const h = harness();
  let release;
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  const monitor = h.start({ readStatus: worker => worker.revision === 'v8' ? new Promise(resolve => { release = resolve; started(); }) : Promise.resolve(worker) });
  await pending;
  await h.switchWorker({ revision: 'v9', ready: true });
  assert.equal(h.updates.at(-1), true);
  release({ revision: 'v8', ready: true });
  await monitor.ready;
  assert.equal(h.updates.at(-1), true);
});

test('worker status accepts only the cache protocol and handles unavailable workers', async () => {
  assert.equal(await readWorkerStatus(null), null);
  assert.equal(await readWorkerStatus({ postMessage() { throw new Error('Detached'); } }), null);
  const worker = reply => ({ postMessage(message, ports) { assert.equal(message.type, 'HOLLOW_CACHE_STATUS'); ports[0].postMessage(reply); } });
  assert.equal(await readWorkerStatus(worker({ type: 'other', revision: 'v9', ready: true })), null);
  const valid = { type: 'HOLLOW_CACHE_STATUS', revision: 'v9', ready: true };
  assert.deepEqual(await readWorkerStatus(worker(valid)), valid);
});
