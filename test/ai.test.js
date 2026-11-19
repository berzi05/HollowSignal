import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStaticServer } from '../server.mjs';
import { buildBriefContext, createLocalBrief } from '../dist/brief.js';

const inputs = { scenario: 'blackout', minutes: 20, supply: 1000, origin: 'L20', groupSize: 12, stepFree: true, closedEdges: ['lower-shaft'] };
const validBrief = createLocalBrief(buildBriefContext(inputs));
const completion = brief => new Response(JSON.stringify({ status: 'completed', output: [
  { type: 'reasoning', summary: [] },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(brief) }] },
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
  assert.deepEqual(await status.json(), { configured: false, provider: 'OpenAI', model: null });
  const response = await app.post();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'not_configured' });
  assert.match(await (await app.get('/')).text(), /id="response-ai"/);
  assert.equal((await app.get('/.env')).status, 400);
  assert.equal((await app.get('/ai.mjs')).status, 404);
});

test('real endpoint calls OpenAI with calculated facts only, validates output and reuses identical snapshots', async t => {
  let calls = 0;
  const app = await serve(t, {
    apiKey: 'test-secret-never-expose',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer test-secret-never-expose');
      const payload = JSON.parse(options.body);
      assert.equal(payload.store, false);
      assert.equal(payload.text.format.strict, true);
      assert.equal(payload.max_output_tokens, 2400);
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
    () => new Response(JSON.stringify({ status: 'incomplete', output: [] })),
    () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'no' }] }] })),
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

test('provider timeout ends the request, releases concurrency and does not leak errors', async t => {
  let calls = 0;
  const app = await serve(t, { apiKey: 'test', timeoutMs: 15, fetchImpl: async (url, { signal }) => {
    calls++;
    if (calls > 1) return completion(validBrief);
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('secret details')), { once: true }));
  } });
  assert.equal((await app.post()).status, 504);
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
