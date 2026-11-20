import { buildBriefContext, FACT_IDS, validateAiBrief } from './dist/brief.js';

export const DEFAULT_MODEL = 'gemini-4-hydrogen';
const MAX_BODY = 4096;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'priorities', 'message'],
  properties: {
    summary: { type: 'string', maxLength: 600 },
    priorities: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false, required: ['factId', 'explanation'],
        properties: { factId: { type: 'string', enum: FACT_IDS }, explanation: { type: 'string', maxLength: 400 } },
      },
    },
    message: { type: 'string', maxLength: 900 },
  },
};
const INSTRUCTIONS = `You write concise response briefs for Hollow Signal, a fictional underground-survival rehearsal.
Use only the supplied calculated facts and warnings. Never invent readings, routes, capacities, health advice, forecasts, or actions already performed.
Explain why the facts matter in plain language. Give exactly three priorities, one for each factId, ordered by urgency. Each explanation must be grounded in that fact.
Draft a short, calm resident message explicitly labeled as a rehearsal. Include access failures and any warnings about travel, critical levels, or shortages. Ask for local review before movement.
Do not claim any route is safe, any place is reserved, any medicine is indicated, or any help has been dispatched. You cannot alter the plan or execute actions.
Use plain text only. Keep the summary under 70 words, each explanation under 45 words, and the message under 120 words.`;

function failure(code, status) { return Object.assign(new Error(code), { code, status }); }
function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

/** This optional, billed endpoint is deliberately limited to the local computer. */
function isLocalRequest(request) {
  try {
    const url = new URL(`http://${request.headers.host}`);
    return LOOPBACK.has(request.socket.remoteAddress) && HOSTS.has(url.hostname) &&
      url.host === request.headers.host && (url.port || '80') === String(request.socket.localPort) &&
      (!request.headers.origin || request.headers.origin === url.origin) &&
      !['cross-site', 'same-site'].includes(request.headers['sec-fetch-site']);
  } catch { return false; }
}

async function readInputs(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw failure('invalid_request', 415);
  if (Number(request.headers['content-length']) > MAX_BODY) { request.resume(); throw failure('request_too_large', 413); }
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    const timer = setTimeout(() => finish(failure('request_timeout', 408)), 5000);
    function finish(error, value) {
      clearTimeout(timer);
      request.removeListener('data', data); request.removeListener('end', end);
      request.removeListener('error', failed); request.removeListener('aborted', failed);
      if (error) { request.resume(); reject(error); } else resolve(value);
    }
    function data(chunk) {
      size += chunk.length;
      if (size > MAX_BODY) { finish(failure('request_too_large', 413)); return; }
      chunks.push(chunk);
    }
    function end() {
      try { finish(null, buildBriefContext(JSON.parse(Buffer.concat(chunks).toString('utf8')))); }
      catch { finish(failure('invalid_request', 400)); }
    }
    function failed() { finish(failure('invalid_request', 400)); }
    request.on('data', data); request.on('end', end); request.on('error', failed); request.on('aborted', failed);
  });
}

/** Inject transport/time in tests; credentials never enter browser assets or API responses. */
export function createAiHandler({ apiKey = '', model = DEFAULT_MODEL, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 30000 } = {}) {
  const configured = Boolean(apiKey.trim()) && !/^(your_|replace)/i.test(apiKey.trim());
  const cache = new Map();
  let busy = false, attempts = [];
  return async (request, response) => {
    const path = request.url?.split('?')[0];
    if (!path?.startsWith('/api/')) return false;
    if (!isLocalRequest(request)) { json(response, 403, { error: 'local_only' }); return true; }
    if (path === '/api/ai/status' && request.method === 'GET') {
      json(response, 200, { configured, provider: 'Gemini', model: configured ? model : null }); return true;
    }
    if (path !== '/api/ai/brief') { json(response, 404, { error: 'not_found' }); return true; }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST'); json(response, 405, { error: 'method_not_allowed' }); return true;
    }
    let acquired = false;
    try {
      const context = await readInputs(request);
      if (!configured) throw failure('not_configured', 503);
      const cached = cache.get(context.key);
      if (cached && now() - cached.time < 300000) {
        json(response, 200, { ...cached.value, cached: true }); return true;
      }
      attempts = attempts.filter(time => now() - time < 60000);
      if (busy || attempts.length >= 5) { response.setHeader('Retry-After', '60'); throw failure('busy', 429); }
      busy = true; acquired = true; attempts.push(now());
      const signal = AbortSignal.timeout(timeoutMs);
      let upstream;
      try {
        upstream = await Promise.resolve().then(() => fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST', redirect: 'error', signal,
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
          body: JSON.stringify({
            model, store: false,
            generation_config: { max_output_tokens: 2400, thinking_level: 'low', thinking_summaries: 'none' },
            system_instruction: INSTRUCTIONS,
            input: JSON.stringify({ label: context.label, facts: context.facts, warnings: context.warnings }),
            response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
          }),
        })).catch(() => { throw failure('provider_unavailable', 502); });
        if (!upstream.ok) {
          await upstream.body?.cancel();
          const code = [401, 403].includes(upstream.status) ? 'provider_auth' : upstream.status === 429 ? 'provider_quota' : upstream.status === 404 ? 'provider_model' : 'provider_unavailable';
          throw failure(code, 502);
        }
        // Bound response size even when the provider returns an unexpected payload.
        let size = 0, chunks = [];
        for await (const chunk of upstream.body) {
          size += chunk.length;
          if (size > 65536) throw failure('invalid_response', 502);
          chunks.push(chunk);
        }
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result.status !== 'completed' || !Array.isArray(result.steps) || result.steps.some(item => !['thought', 'model_output'].includes(item.type))) throw failure('invalid_response', 502);
        const outputs = result.steps.filter(item => item.type === 'model_output');
        if (outputs.length !== 1 || !Array.isArray(outputs[0].content) || outputs[0].content.length === 0 ||
            outputs[0].content.some(item => item.type !== 'text' || typeof item.text !== 'string')) throw failure('invalid_response', 502);
        const brief = validateAiBrief(JSON.parse(outputs[0].content.map(item => item.text).join('')));
        const value = { source: 'ai', provider: 'Gemini', model, brief, key: context.key, generatedAt: new Date(now()).toISOString(), cached: false };
        cache.set(context.key, { time: now(), value });
        if (cache.size > 20) cache.delete(cache.keys().next().value);
        json(response, 200, value);
      } catch (error) {
        if (signal.aborted) throw failure('timeout', 504);
        throw error.status ? error : failure('invalid_response', 502);
      }
    } catch (error) {
      // Never forward provider errors, request headers, or stack traces containing secrets.
      json(response, error.status || 502, { error: error.code || 'provider_unavailable' });
    } finally { if (acquired) busy = false; }
    return true;
  };
}
