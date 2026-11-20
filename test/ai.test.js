import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStaticServer } from '../server.mjs';
import { buildBriefContext, createLocalBrief } from '../dist/brief.js';

const inputs = { scenario: 'blackout', minutes: 20, supply: 1000, origin: 'L20', groupSize: 12, stepFree: true, closedEdges: ['lower-shaft'] };
const validBrief = createLocalBrief(buildBriefContext(inputs));
const completion = brief => new Response(JSON.stringify({ status: 'completed', steps: [
  { type: 'thought', signature: 'opaque-thought-signature' },
  { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(brief) }] },
] }));

async function serve(t, options = {}) {
  const server = createStaticServer(undefined, options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, get: (path, options) => fetch(origin + path, options),
    post: (body = inputs, headers = {}) => fetch(origin + '/api/ai/brief', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    }),
  };
}

test('real HTTP server serves assets; missing key is explicit and never calls the provider', async t => {
  const app = await serve(t, { fetchImpl: () => { assert.fail('must not call upstream'); } });
  const status = await app.get('/api/ai/status');
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await status.json(), { configured: false, provider: 'Gemini', model: null });
  const response = await app.post();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'not_configured' });
  assert.match(await (await app.get('/')).text(), /id="response-ai"/);
  assert.equal((await app.get('/.env')).status, 400);
  assert.equal((await app.get('/ai.mjs')).status, 404);
});

test('real endpoint calls Gemini with calculated facts only, validates output and reuses identical snapshots', async t => {
  let calls = 0;
  const app = await serve(t, {
    apiKey: 'test-secret-never-expose',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['x-goog-api-key'], 'test-secret-never-expose');
      assert.equal(options.headers['Api-Revision'], '2026-05-20');
      assert.equal(options.headers.Authorization, undefined);
      assert.ok(!url.includes('test-secret'), 'the key stays out of URL/query logs');
      const payload = JSON.parse(options.body);
      assert.equal(payload.store, false);
      assert.equal(payload.model, 'gemini-3.5-flash-lite');
      assert.equal(payload.response_format.mime_type, 'application/json');
      assert.equal(payload.response_format.schema.additionalProperties, false);
      assert.equal(payload.generation_config.max_output_tokens, 1200);
      assert.equal(payload.generation_config.thinking_level, 'minimal');
      assert.match(payload.system_instruction, /fictional underground-survival rehearsal/);
      const factPayload = JSON.parse(payload.input);
      assert.deepEqual(Object.keys(factPayload), ['label', 'facts', 'warnings']);
      assert.match(factPayload.facts[2].text, /No refuge candidate/);
      assert.doesNotMatch(payload.input, /test-secret|checkIns|healthReports/);
      return completion(validBrief);
    },
  });
  const response = await app.post();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.source, 'ai');
  assert.equal(data.provider, 'Gemini');
  assert.deepEqual(data.brief, validBrief);
  assert.equal(data.cached, false);
  assert.doesNotMatch(JSON.stringify(data), /test-secret/);
  assert.equal((await (await app.post()).json()).cached, true);
  assert.equal(calls, 1);
});

test('rejects cross-origin, rebound hosts, private records, malformed JSON and oversized bodies before billing', async t => {
  let calls = 0;
  const app = await serve(t, { apiKey: 'test', fetchImpl: () => { calls++; return completion(validBrief); } });
  assert.equal((await app.post(inputs, { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await app.post(inputs, { Host: 'attacker.invalid', Origin: 'http://attacker.invalid' })).status, 403);
  assert.equal((await app.post(inputs, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await app.post({ ...inputs, healthReports: ['private'] })).status, 400);
  assert.equal((await app.post(inputs, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await app.post({ extra: 'x'.repeat(5000) })).status, 413);
  assert.equal((await app.get('/api/ai/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  assert.equal((await app.get('/api/ai/brief')).status, 405);
  assert.equal(calls, 0);
});

test('refusals, incomplete answers, duplicate sources and provider errors cannot masquerade as successful AI', async t => {
  const fixtures = [
    () => new Response('test-secret-never-expose', { status: 401 }),
    () => new Response(JSON.stringify({ status: 'incomplete', steps: [] })),
    () => new Response(JSON.stringify({ status: 'failed', error: { code: 'blocked', message: 'test-secret-never-expose' }, steps: [] })),
    () => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'refusal', refusal: 'no' }] }] })),
    () => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'function_call', name: 'dispatch', arguments: {} }] })),
    () => completion({ ...validBrief, priorities: validBrief.priorities.map(item => ({ ...item, factId: 'route' })) }),
    () => new Response('{broken'),
    () => new Response('x'.repeat(70000)),
  ];
  for (const fixture of fixtures) {
    const app = await serve(t, { apiKey: 'test-secret-never-expose', fetchImpl: async () => fixture() });
    const response = await app.post();
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.doesNotMatch(body, /test-secret|Bearer|stack|source/);
  }
});

test('Gemini access, quota, model and network failures return safe actionable codes', async t => {
  for (const [status, code] of [[401, 'provider_auth'], [403, 'provider_auth'], [429, 'provider_quota'], [404, 'provider_model'], [503, 'provider_unavailable']]) {
    const app = await serve(t, { apiKey: 'test-secret', fetchImpl: async () => new Response('test-secret', { status }) });
    const response = await app.post();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: code });
  }
  const app = await serve(t, { apiKey: 'test-secret', fetchImpl: async () => { throw new Error('test-secret'); } });
  assert.deepEqual(await (await app.post()).json(), { error: 'provider_unavailable' });
});

test('Gemini output can span text blocks without exposing its thought step', async t => {
  const text = JSON.stringify(validBrief), split = Math.floor(text.length / 2);
  const app = await serve(t, { apiKey: 'test', fetchImpl: () => new Response(JSON.stringify({ status: 'completed', steps: [
    { type: 'thought', summary: 'Private reasoning must not reach the UI.' },
    { type: 'model_output', content: [{ type: 'text', text: text.slice(0, split) }, { type: 'text', text: text.slice(split) }] },
  ] })) });
  const response = await app.post();
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(body).brief, validBrief);
  assert.doesNotMatch(body, /Private reasoning/);
});

test('provider timeout releases concurrency even if the transport ignores cancellation', { timeout: 2000 }, async t => {
  let calls = 0;
  const app = await serve(t, { apiKey: 'test', timeoutMs: 15, fetchImpl: async (url, { signal }) => {
    calls++;
    if (calls > 1) return completion(validBrief);
    return new Promise(() => {});
  } });
  const response = await app.post();
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: 'timeout' });
  assert.equal((await app.post()).status, 200);
});

test('the same deadline bounds a stalled provider body and cancels its reader', { timeout: 2000 }, async t => {
  let calls = 0, cancelled = false;
  const app = await serve(t, { apiKey: 'test', timeoutMs: 20, fetchImpl: async () => {
    if (++calls > 1) return completion(validBrief);
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"status":')); },
      cancel() { cancelled = true; },
    }));
  } });
  const response = await app.post();
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: 'timeout' });
  assert.equal(cancelled, true);
  assert.equal((await app.post()).status, 200);
});

test('closing the browser request aborts Gemini and frees the server for the next plan', { timeout: 2000 }, async t => {
  const started = Promise.withResolvers(), cancelled = Promise.withResolvers();
  let calls = 0;
  const app = await serve(t, { apiKey: 'test', fetchImpl: async (url, { signal }) => {
    if (++calls > 1) return completion(validBrief);
    started.resolve();
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      cancelled.resolve(); reject(signal.reason);
    }, { once: true }));
  } });
  const controller = new AbortController();
  const pending = app.get('/api/ai/brief', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inputs), signal: controller.signal,
  });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started.promise;
  controller.abort();
  await rejected;
  await cancelled.promise;
  await new Promise(resolve => setImmediate(resolve));
  const response = await app.post({ ...inputs, minutes: 25 });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cached, false);
  assert.equal(calls, 2);
});

test('custom reasoning models retain a supported low thinking level', async t => {
  const app = await serve(t, { apiKey: 'test', model: 'gemini-4-hydrogen', fetchImpl: async (url, { body }) => {
    const payload = JSON.parse(body);
    assert.equal(payload.model, 'gemini-4-hydrogen');
    assert.equal(payload.generation_config.thinking_level, 'low');
    return completion(validBrief);
  } });
  assert.equal((await app.post()).status, 200);
});

test('one pending call and five attempts per minute bound billed requests', async t => {
  let release;
  let time = 0, calls = 0;
  const started = Promise.withResolvers();
  const app = await serve(t, { apiKey: 'test', now: () => time, fetchImpl: async () => {
    calls++;
    if (calls === 1) { started.resolve(); return new Promise(resolve => { release = resolve; }); }
    return completion(validBrief);
  } });
  const pending = app.post();
  await started.promise;
  assert.equal((await app.post({ ...inputs, minutes: 25 })).status, 429);
  release(completion(validBrief));
  assert.equal((await pending).status, 200);
  for (let minutes = 21; minutes <= 24; minutes++) assert.equal((await app.post({ ...inputs, minutes })).status, 200);
  assert.equal((await app.post({ ...inputs, minutes: 25 })).status, 429);
  assert.equal(calls, 5);
  time = 60001;
  assert.equal((await app.post({ ...inputs, minutes: 25 })).status, 200);
});
