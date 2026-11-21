import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as engine from '../dist/engine.js';
import * as relay from '../dist/relay.js';
import * as crisis from '../dist/crisis.js';
import * as health from '../dist/health.js';
import { createUpdateMonitor } from '../dist/updates.js';
import * as brief from '../dist/brief.js';

const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const responseSource = await readFile(new URL('../dist/response-ui.js', import.meta.url), 'utf8');

const healthSource = await readFile(new URL('../dist/health-ui.js', import.meta.url), 'utf8');
const aiSource = await readFile(new URL('../dist/ai-ui.js', import.meta.url), 'utf8');

function harness(initialHash = '', initialRecords, options = {}) {
  const handlers = new Map();
  const elements = new Map();
  const saved = new Map(initialRecords ? [['hollow-signal-v1', initialRecords]] : []);
  const panels = ['overview', 'response', 'resources', 'health', 'community'].map(view => ({ id: `view-${view}`, hidden: true }));
  const links = panels.map(panel => ({
    dataset: { view: panel.id.slice(5) },
    classList: { toggle() {} },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
  }));
  let hash = initialHash;
  let reloads = 0;
  const location = {
    get hash() { return hash; },
    set hash(value) { hash = value && !value.startsWith('#') ? '#' + value : value; },
    reload() { reloads++; },
  };
  const document = {
    title: '',
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        value: '', checked: false, listeners: new Map(),
        addEventListener(name, handler) { this.listeners.set(name, handler); },
        dispatchEvent(event) { return this.listeners.get(event.type)?.({ ...event, target: this, currentTarget: this, preventDefault() {} }); },
        querySelector: selector => document.querySelector(selector),
        focus() { this.focused = true; },
        scrollIntoView() { this.scrolled = true; },
        showModal() { this.open = true; },
        close() { this.open = false; },
        setAttribute() {},
        classList: { add() {}, remove() {} },
      });
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      if (selector === '.view') return panels;
      if (selector === '[data-view]') return links;
      return [];
    },
  };
  // Run the actual app and its hashchange listener with a minimal DOM.
  // Supply the real modules through the VM context instead of ESM imports.
  const context = vm.createContext({
    ...engine, ...relay, ...crisis, ...health, ...brief, createUpdateMonitor, document, location,
    AbortController, AbortSignal, fetch: options.fetch || (async () => new Response('{"configured":false,"provider":"Gemini"}')),
    Event: class { constructor(type) { this.type = type; } },
    FormData: class {
      constructor(form) { this.form = form; }
      *[Symbol.iterator]() {
        if (this.form === document.querySelector('#report-form')) {
          for (const key of ['level', 'type', 'detail']) yield [key, document.querySelector('#report-' + key).value];
          return;
        }
        yield ['alias', document.querySelector('#alias').value];
        yield ['level', document.querySelector('#checkin-level').value];
        yield ['note', document.querySelector('#checkin-note').value];
        yield ['status', document.querySelector('input[name="status"][value="help"]').checked ? 'help' : 'moving'];
      }
    },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    navigator: { onLine: true, ...(options.serviceWorker ? { serviceWorker: options.serviceWorker } : {}) },
    window: { isSecureContext: Boolean(options.serviceWorker), addEventListener: (name, handler) => handlers.set(name, handler), scrollTo() {}, confirm: () => options.confirm !== false },
    setTimeout: options.setTimeout || (() => 0), clearTimeout: options.clearTimeout || (() => {}),
  });
  context.initResponseLab = vm.runInContext('(() => {' + responseSource.replace(/^import .*;\r?\n/gm, '').replace('export function initResponseLab', 'function initResponseLab') + '; return initResponseLab; })()', context);
  context.initHealthAid = vm.runInContext('(() => {' + healthSource.replace(/^import .*;\r?\n/gm, '').replace('export function initHealthAid', 'function initHealthAid') + '; return initHealthAid; })()', context);
  context.initAiBrief = vm.runInContext('(() => {' + aiSource.replace(/^import .*;\r?\n/gm, '').replace('export function initAiBrief', 'function initAiBrief') + '; return initAiBrief; })()', context);
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, ''), context, { filename: 'app.js' });
  return {
    get: selector => document.querySelector(selector),
    fire(selector, type, changes = {}) {
      const target = document.querySelector(selector);
      Object.assign(target, changes);
      return target.dispatchEvent({ type });
    },
    records() { return JSON.parse(saved.get('hollow-signal-v1')); },
    navigate(hash) { location.hash = hash; handlers.get('hashchange')(); },
    visible() { return panels.filter(panel => !panel.hidden).map(panel => panel.id); },
    active() { return links.filter(link => link['aria-current'] === 'page').map(link => link.dataset.view); },
    title() { return document.title; },
    updatesReady: () => vm.runInContext('updateMonitor?.ready', context),
    aiReady: () => vm.runInContext('aiBrief.ready', context),
    reloads: () => reloads,
  };
}

test('Back to the fragment-free homepage restores Overview, and Forward restores Resources', () => {
  const app = harness();
  assert.deepEqual(app.visible(), ['view-overview']);
  app.navigate('#resources');
  assert.deepEqual(app.visible(), ['view-resources']);
  app.navigate(''); // Browser Back to the original homepage URL.
  assert.deepEqual(app.visible(), ['view-overview']);
  assert.deepEqual(app.active(), ['overview']);
  assert.equal(app.title(), 'Overview — Hollow Signal');
  app.navigate('#resources'); // Browser Forward.
  assert.deepEqual(app.visible(), ['view-resources']);
  assert.deepEqual(app.active(), ['resources']);
});

test('the response lab drafts a help request that the existing relay form can save', () => {
  const app = harness();
  app.fire('#drill-respond', 'click');
  assert.equal(app.get('#scenario').value, 'blackout');
  app.fire('#route-step-free', 'change', { checked: true });
  app.fire('#route-message', 'click');
  assert.deepEqual(app.visible(), ['view-community']);
  assert.match(app.get('#checkin-note').value, /No refuge route/);
  app.get('#alias').value = 'Lantern-17';
  app.fire('#checkin-form', 'submit');
  const packet = app.records();
  assert.equal(packet.checkIns.length, 1);
  assert.equal(packet.checkIns[0].status, 'help');
  assert.equal(packet.checkIns[0].alias, 'Lantern-17');
  assert.equal(packet.checkIns[0].level, 'L20');
});

test('the main-content skip link preserves each selected view', () => {
  for (const view of ['overview', 'response', 'resources', 'health', 'community']) {
    const app = harness(`#${view}`);
    app.navigate('#main');
    assert.deepEqual(app.visible(), [`view-${view}`]);
    assert.deepEqual(app.active(), [view]);
  }
});

test('planning from a neighborhood carries its origin and focuses the refuge section', () => {
  const app = harness();
  app.fire('#drill-respond', 'click');
  app.fire('#level-detail', 'click', { closest: selector => selector === '[data-plan-level]' ? ({ dataset: { planLevel: 'L12' } }) : null });
  assert.deepEqual(app.visible(), ['view-response']);
  assert.equal(app.get('#route-origin').value, 'L12');
  assert.equal(app.get('#response-routes').focused, true);
  assert.equal(app.get('#response-routes').scrolled, true);
  assert.match(app.get('#route-result').innerHTML, /L12/);
  assert.match(app.get('#route-context').textContent, /Geothermal outage.*20 min/);
});

test('sample health signals lead to an aid request, shared closure constraints, and a relayed status update', () => {
  const app = harness('#health');
  assert.deepEqual(app.visible(), ['view-health']);
  app.fire('#health-sample', 'click');
  assert.equal(app.get('#health-signal-count').textContent, 2);
  assert.equal(app.records().healthReports.length, 6);
  app.fire('#health-sample', 'click');
  assert.equal(app.records().healthReports.length, 6, 'sample does not duplicate or overwrite daily records');
  app.fire('#health-rows', 'click', { closest: () => ({ dataset: { healthLevel: 'L20' } }) });
  assert.equal(app.get('#health-aid').focused, true);
  assert.match(app.get('#aid-result').innerHTML, /Market community clinic/);
  app.fire('#drill-respond', 'click');
  assert.match(app.get('#aid-context').textContent, /20 min.*closed/);
  assert.match(app.get('#aid-result').innerHTML, /Local assistance needed/);
  app.fire('#aid-save', 'click');
  const request = app.records().aidRequests[0];
  assert.equal(request.level, 'L20');
  assert.equal(request.clinicId, null);
  assert.equal(request.context.minutes, 20);
  assert.equal(request.context.stepFree, true);
  app.fire('#aid-requests', 'click', { closest: () => ({ dataset: { requestId: request.id, requestStatus: 'coordinating' } }) });
  assert.equal(app.records().aidRequests.length, 1);
  assert.equal(app.records().aidRequests[0].status, 'coordinating');
  const restored = harness('#health', JSON.stringify(app.records()));
  assert.match(restored.get('#aid-requests').innerHTML, /coordinating/);
  assert.equal(restored.get('#health-signal-count').textContent, 2);
});

test('editing a daily tally replaces the count, requires a review note, and escapes source text', () => {
  const app = harness('#health');
  app.fire('#health-sample', 'click');
  app.get('#health-count').value = 5;
  app.get('#health-review').value = 'reviewed';
  app.get('#health-note').value = '';
  app.fire('#health-form', 'submit');
  assert.match(app.get('#toast').textContent, /Review note is required/);
  assert.equal(app.records().healthReports.find(row => row.level === 'L20' && row.day === app.get('#health-day').value).count, 18);
  app.get('#health-note').value = 'Reconciled overlapping reports';
  app.get('#health-source').value = '<img src=x onerror=alert(1)>';
  app.fire('#health-form', 'submit');
  assert.equal(app.records().healthReports.length, 6);
  assert.equal(app.records().healthReports.find(row => row.level === 'L20' && row.day === app.get('#health-day').value).count, 5);
  assert.match(app.get('#health-rows').innerHTML, /&lt;img/);
  assert.doesNotMatch(app.get('#health-rows').innerHTML, /<img/);
});

test('clinic updates change aid candidates, invalid groups cannot save, and clear removes all health records', () => {
  const app = harness('#health');
  app.get('#clinic-slots').value = 4;
  app.get('#clinic-source').value = 'Garden desk';
  app.fire('#clinic-form', 'submit');
  assert.equal(app.records().clinicUpdates.length, 1);
  assert.match(app.get('#aid-result').innerHTML, /Root Gardens care station/);
  app.fire('#aid-people', 'input', { value: 0 });
  assert.equal(app.get('#aid-save').disabled, true);
  app.fire('#aid-save', 'click');
  assert.equal(app.records().aidRequests.length, 0);
  app.fire('#aid-people', 'input', { value: 2 });
  app.fire('#aid-save', 'click');
  assert.equal(app.records().aidRequests.length, 1);
  app.fire('#reset-button', 'click');
  const records = app.records();
  for (const key of ['checkIns', 'reports', 'healthReports', 'clinicUpdates', 'aidRequests']) assert.equal(records[key].length, 0);
  assert.match(app.get('#aid-result').innerHTML, /Market community clinic/);
});

test('overview find-aid action carries the neighborhood and focuses care planning', () => {
  const app = harness();
  app.fire('#level-detail', 'click', { closest: selector => selector === '[data-health-origin]' ? { dataset: { healthOrigin: 'L16' } } : null });
  assert.deepEqual(app.visible(), ['view-health']);
  assert.equal(app.get('#aid-origin').value, 'L16');
  assert.equal(app.get('#health-aid').focused, true);
});

test('Overview exposes every modeled warning and opens the relevant hazard for each crisis', () => {
  const app = harness();
  for (const [scenario, label] of [['heat', 'Heat &amp; cooling'], ['water', 'Water quality'], ['blackout', 'Power reserves']]) {
    app.fire('#scenario', 'change', { value: scenario });
    const html = app.get('#alerts').innerHTML;
    const groups = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
    assert.equal(groups.length, 4);
    assert.match(groups[0][1], /\bopen\b/);
    assert.ok(groups[0][2].includes(label));
    const expected = engine.getScenarioLevels(scenario).flatMap(level => engine.assessLevel(level).warnings);
    assert.equal([...html.matchAll(/data-inspect=/g)].length, expected.length);
    assert.equal(Number(app.get('#alert-count').textContent), expected.length);
  }
  app.fire('#alerts', 'click', { closest: () => ({ dataset: { inspect: 'L16', hazard: 'heat' } }) });
  assert.match(app.get('#level-detail').innerHTML, /Ember District/);
  assert.match(app.get('#level-detail').innerHTML, /<ul><li><b>Heat accumulating/);
  assert.match(app.get('#level-detail').innerHTML, /data-reports-type="heat"/);
  assert.equal(app.get('#level-detail').focused, true);
  app.fire('#level-detail', 'click', { closest: selector => selector === '#return-to-map' });
  assert.equal(app.get('#level-map [data-level="L16"]').focused, true);
});

test('the report log can retrieve older relayed observations and filter by neighborhood, type and text', async () => {
  const reports = Array.from({ length: 12 }, (_, i) => ({
    id: 'field-report-' + i, type: i % 3 === 0 ? 'water' : 'tunnel', level: i % 2 === 0 ? 'L12' : 'L20',
    updatedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), detail: i === 0 ? 'South pump <offline>' : 'Gate observation ' + i,
  }));
  const app = harness();
  const packet = relay.serializePacket([], reports);
  await app.fire('#import-file', 'change', { files: [{ size: packet.length, text: async () => packet }] });
  assert.doesNotMatch(app.get('#report-list').innerHTML, /South pump/);
  app.fire('#overview-reports', 'click');
  assert.deepEqual(app.visible(), ['view-community']);
  assert.match(app.get('#log-count').textContent, /8 of 12/);
  app.fire('#log-expand', 'click');
  assert.match(app.get('#log-count').textContent, /12 of 12/);
  assert.match(app.get('#log-rows').innerHTML, /South pump &lt;offline&gt;/);
  app.fire('#log-level', 'change', { value: 'L12' });
  app.fire('#log-type', 'change', { value: 'water' });
  assert.match(app.get('#log-count').textContent, /2 of 2/);
  app.fire('#log-search', 'input', { value: '  PUMP  ' });
  assert.match(app.get('#log-count').textContent, /1 of 1 report\b/);
  assert.doesNotMatch(app.get('#log-rows').innerHTML, /<offline>|Gate observation/);
  app.fire('#log-search', 'input', { value: 'missing' });
  assert.match(app.get('#log-count').textContent, /No reports match/);
  app.fire('#log-clear', 'click');
  assert.match(app.get('#log-count').textContent, /8 of 12/);
  assert.equal(app.records().reports.length, 12);
  app.fire('#reset-button', 'click');
  assert.match(app.get('#log-count').textContent, /No field reports yet/);
  assert.equal(app.get('#overview-reports').hidden, true);
});

test('a neighborhood opens a filtered log and a report can be filed, reopened and relayed', () => {
  const app = harness();
  app.fire('#level-detail', 'click', { closest: selector => selector === '[data-reports-level]' ? { dataset: { reportsLevel: 'L16' } } : null });
  assert.deepEqual(app.visible(), ['view-community']);
  assert.equal(app.get('#report-log').focused, true);
  assert.equal(app.get('#log-level').value, 'L16');
  app.fire('#log-type', 'change', { value: 'heat' });
  app.fire('#log-add', 'click');
  assert.equal(app.get('#report-dialog').open, true);
  assert.equal(app.get('#report-level').value, 'L16');
  assert.equal(app.get('#report-type').value, 'heat');
  app.get('#report-detail').value = '   ';
  app.fire('#report-form', 'submit');
  assert.equal(app.get('#report-error').hidden, false);
  assert.equal(app.get('#report-dialog').open, true);
  app.get('#report-detail').value = 'Cooling fan stopped near the east lift.';
  app.fire('#report-form', 'submit');
  assert.equal(app.get('#report-dialog').open, false);
  assert.equal(app.records().reports.length, 1);
  assert.match(app.get('#log-rows').innerHTML, /L16 · Extreme heat/);
  assert.match(app.get('#report-list').innerHTML, /Cooling fan/);
  const restored = harness('#community', JSON.stringify(app.records()));
  assert.match(restored.get('#log-rows').innerHTML, /Cooling fan/);
  assert.deepEqual(relay.parsePacket(JSON.stringify(app.records())).reports, app.records().reports);
});

test('a blocked refuge route hands the whole group to local assistance without saving or losing records', () => {
  const app = harness('#health');
  app.fire('#health-sample', 'click');
  const before = app.records();
  app.navigate('#response');
  app.fire('#drill-respond', 'click');
  app.fire('#route-origin', 'change', { value: 'L16' });
  app.fire('#route-group', 'change', { value: '37' });
  app.fire('#route-step-free', 'change', { checked: true });
  assert.match(app.get('#route-result').innerHTML, /No viable candidate/);
  assert.equal(app.get('#route-assistance').hidden, false);
  app.fire('#route-assistance', 'click');
  assert.deepEqual(app.visible(), ['view-health']);
  assert.equal(app.get('#health-aid').focused, true);
  assert.equal(app.get('#aid-origin').value, 'L16');
  assert.equal(Number(app.get('#aid-people').value), 37);
  assert.equal(app.get('#aid-step-free').checked, true);
  assert.equal(app.get('#aid-kind').value, 'mobile');
  assert.match(app.get('#aid-result').innerHTML, /Local assistance needed/);
  assert.match(app.get('#aid-context').textContent, /blackout.*20 min.*closed/);
  assert.deepEqual(app.records(), before, 'a handoff prepares a draft, never saves or dispatches');
  app.fire('#aid-save', 'click');
  const records = app.records(), request = records.aidRequests[0];
  assert.equal(request.people, 37);
  assert.equal(request.level, 'L16');
  assert.equal(request.kind, 'mobile');
  assert.equal(request.clinicId, null);
  assert.equal(request.context.stepFree, true);
  assert.equal(request.context.minutes, 20);
  assert.deepEqual(request.context.closedEdges, ['lower-shaft']);
  assert.match(request.note, /Nothing dispatched/);
  assert.deepEqual(records.healthReports, before.healthReports);
  const imported = relay.parsePacket(relay.serializePacket(records.checkIns, records.reports, records));
  assert.equal(imported.aidRequests[0].people, 37);
  assert.equal(imported.aidRequests[0].context.stepFree, true);
  app.navigate('#response');
  assert.equal(Number(app.get('#route-group').value), 37);
  assert.equal(app.get('#route-origin').value, 'L16');
});

test('local assistance preserves stair permission and is offered for flagged candidate routes', () => {
  const app = harness('#response');
  app.fire('#drill-respond', 'click');
  app.fire('#route-group', 'change', { value: '8' });
  assert.match(app.get('#route-result').innerHTML, /Travel exceeds/);
  assert.equal(app.get('#route-assistance').hidden, false);
  app.fire('#route-assistance', 'click');
  assert.equal(Number(app.get('#aid-people').value), 8);
  assert.equal(app.get('#aid-step-free').checked, false);
  app.fire('#aid-save', 'click');
  assert.equal(app.records().aidRequests[0].context.stepFree, false);
  app.navigate('#response');
  app.fire('#route-origin', 'change', { value: 'L01' });
  assert.equal(app.get('#route-assistance').hidden, true, 'ordinary candidates retain the travel check-in action');
});

test('a newer cached version shows a reload control without losing drafts or saved records', async () => {
  const handlers = new Map();
  const worker = revision => ({ postMessage(message, ports) { ports[0].postMessage({ type: message.type, revision, ready: true }); } });
  const serviceWorker = {
    controller: worker('v13'),
    addEventListener: (name, handler) => handlers.set(name, handler),
    register: async () => ({ update: async () => {} }),
  };
  const options = { serviceWorker, confirm: false };
  const app = harness('#community', undefined, options);
  await app.updatesReady();
  app.get('#alias').value = 'Lantern';
  app.fire('#checkin-form', 'submit');
  const before = app.records();
  app.get('#checkin-note').value = 'An unfinished draft';
  serviceWorker.controller = worker('v14');
  await handlers.get('controllerchange')();
  assert.equal(app.get('#reload-update').hidden, false);
  assert.match(app.get('#connection-status').textContent, /Update ready/);
  assert.equal(app.reloads(), 0, 'updates never reload a form automatically');
  assert.equal(app.get('#checkin-note').value, 'An unfinished draft');
  await app.fire('#reload-update', 'click');
  assert.equal(app.reloads(), 0, 'canceling preserves the current page');
  options.confirm = true;
  await app.fire('#reload-update', 'click');
  assert.equal(app.reloads(), 1);
  assert.deepEqual(app.records(), before, 'reloading does not clear saved records');
});

test('planner offers a useful local brief and invalidates it when the route changes', async () => {
  let paidCalls = 0;
  const app = harness('#response', undefined, { fetch: async (url, options) => {
    if (options.method === 'POST') paidCalls++;
    return new Response('{"configured":false,"provider":"Gemini"}');
  } });
  await app.aiReady();
  app.fire('#drill-respond', 'click');
  app.fire('#route-step-free', 'change', { checked: true });
  app.fire('#ai-local', 'click');
  assert.match(app.get('#ai-source').textContent, /Local brief/);
  assert.match(app.get('#ai-message').textContent, /No refuge candidate/);
  assert.equal(app.get('#ai-copy').disabled, false);
  app.fire('#route-step-free', 'change', { checked: false });
  assert.equal(app.get('#ai-stale').hidden, false);
  assert.equal(app.get('#ai-copy').disabled, true);
  assert.equal(app.get('#ai-export').disabled, true);
  app.fire('#ai-local', 'click');
  assert.match(app.get('#ai-message').textContent, /Includes stairs/);
  assert.equal(app.get('#ai-stale').hidden, true);
  assert.equal(paidCalls, 0);
});

test('AI UI sends only planner settings, renders returned text safely, and labels real AI separately', async () => {
  const app = harness('#response', undefined, { fetch: async (url, options) => {
    if (url.endsWith('/status')) return new Response('{"configured":true,"provider":"Gemini"}');
    const inputs = JSON.parse(options.body);
    assert.deepEqual(Object.keys(inputs), ['scenario', 'minutes', 'supply', 'origin', 'groupSize', 'stepFree', 'closedEdges']);
    const context = brief.buildBriefContext(inputs);
    const answer = brief.createLocalBrief(context);
    answer.priorities[0].explanation = '<img src=x onerror=alert(1)>';
    return new Response(JSON.stringify({ source: 'ai', provider: 'Gemini', key: context.key, model: 'test-model', brief: answer, cached: false }));
  } });
  await app.aiReady();
  await app.fire('#ai-generate', 'click');
  assert.match(app.get('#ai-source').textContent, /Gemini draft · test-model/);
  assert.match(app.get('#ai-priorities').innerHTML, /&lt;img/);
  assert.doesNotMatch(app.get('#ai-priorities').innerHTML, /<img/);
  assert.equal(app.get('#ai-copy').disabled, false);
  assert.match(app.get('#ai-connection').textContent, /responded successfully/);
});

test('an AI response for an earlier plan is discarded even if its transport ignores cancellation', async () => {
  let resolveCall, received;
  const app = harness('#response', undefined, { fetch: async (url, options) => {
    if (url.endsWith('/status')) return new Response('{"configured":true,"provider":"Gemini"}');
    received = JSON.parse(options.body);
    return new Promise(resolve => { resolveCall = resolve; });
  } });
  await app.aiReady();
  app.fire('#ai-local', 'click');
  const pending = app.fire('#ai-generate', 'click');
  app.fire('#response-time', 'input', { value: '30' });
  const context = brief.buildBriefContext(received);
  resolveCall(new Response(JSON.stringify({ source: 'ai', provider: 'Gemini', key: context.key, model: 'test-model', brief: brief.createLocalBrief(context) })));
  await pending;
  assert.match(app.get('#ai-source').textContent, /Local brief/);
  assert.equal(app.get('#ai-stale').hidden, false);
  assert.equal(app.get('#ai-copy').disabled, true);
  assert.match(app.get('#ai-feedback').textContent, /Plan changed/);
});

test('a local brief is usable immediately and stopping Gemini preserves it after a late reply', async () => {
  let resolveCall, received, signal;
  const app = harness('#response', undefined, { fetch: async (url, options) => {
    if (url.endsWith('/status')) return new Response('{"configured":true,"provider":"Gemini"}');
    received = JSON.parse(options.body);
    signal = options.signal;
    return new Promise(resolve => { resolveCall = resolve; });
  } });
  await app.aiReady();
  const pending = app.fire('#ai-generate', 'click');
  assert.equal(app.get('#ai-output').hidden, false);
  assert.match(app.get('#ai-source').textContent, /Local brief/);
  assert.match(app.get('#ai-feedback').textContent, /Local brief ready below/);
  assert.equal(app.get('#ai-copy').disabled, false);
  assert.equal(app.get('#ai-export').disabled, false);
  assert.equal(app.get('#ai-generate').disabled, true);
  const localSummary = app.get('#ai-summary').textContent;
  app.fire('#ai-cancel', 'click');
  assert.equal(signal.aborted, true);
  assert.equal(app.get('#ai-generate').disabled, false);
  assert.equal(app.get('#ai-cancel').hidden, true);
  const context = brief.buildBriefContext(received);
  resolveCall(new Response(JSON.stringify({ source: 'ai', provider: 'Gemini', key: context.key, model: 'test', brief: { ...brief.createLocalBrief(context), summary: 'Late answer' } })));
  await pending;
  assert.equal(app.get('#ai-summary').textContent, localSummary);
  assert.match(app.get('#ai-source').textContent, /Local brief/);
  assert.match(app.get('#ai-feedback').textContent, /Stopped waiting/);
});

test('the browser wait limit clears the spinner and late replies cannot affect a newer request', async () => {
  const timers = new Map(), requests = [];
  let timerId = 0;
  const app = harness('#response', undefined, {
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      if (url.endsWith('/status')) return new Response('{"configured":true,"provider":"Gemini"}');
      return new Promise(resolve => requests.push({ resolve, signal: options.signal, context: brief.buildBriefContext(JSON.parse(options.body)) }));
    },
  });
  await app.aiReady();
  const first = app.fire('#ai-generate', 'click');
  [...timers.values()].find(timer => timer.ms === 4000).callback();
  assert.match(app.get('#ai-feedback').textContent, /read, copy, or download/);
  [...timers.values()].find(timer => timer.ms === 14000).callback();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(app.get('#ai-generate').disabled, false);
  assert.equal(app.get('#ai-copy').disabled, false);
  assert.match(app.get('#ai-feedback').textContent, /14-second wait limit/);
  assert.equal(timers.size, 0);
  const second = app.fire('#ai-generate', 'click');
  const answer = request => new Response(JSON.stringify({ source: 'ai', provider: 'Gemini', key: request.context.key, model: 'test', brief: brief.createLocalBrief(request.context) }));
  requests[0].resolve(answer(requests[0]));
  await first;
  assert.match(app.get('#ai-source').textContent, /Local brief/);
  assert.equal(app.get('#ai-generate').disabled, true);
  assert.equal(timers.size, 2, 'the old request must not clear the new request’s deadline');
  requests[1].resolve(answer(requests[1]));
  await second;
  assert.match(app.get('#ai-source').textContent, /Gemini draft/);
  assert.match(app.get('#ai-feedback').textContent, /ready in .*s/);
  assert.equal(timers.size, 0);
});

test('missing backend, missing key and invalid AI output visibly fall back to local rules', async () => {
  for (const reply of [
    () => new Response('static hosting has no API', { status: 404 }),
    () => new Response('{"error":"not_configured"}', { status: 503 }),
    () => new Response('{"source":"ai","key":"wrong","model":"test","brief":{}}'),
  ]) {
    const app = harness('#response', undefined, { fetch: async (url) => url.endsWith('/status') ? new Response('{"configured":false,"provider":"Gemini"}') : reply() });
    await app.aiReady();
    await app.fire('#ai-generate', 'click');
    assert.match(app.get('#ai-source').textContent, /Local brief/);
    assert.match(app.get('#ai-feedback').textContent, /Showing a local brief instead/);
    assert.equal(app.get('#ai-generate').disabled, false);
    assert.equal(app.get('#ai-copy').disabled, false);
  }
});

test('a server from before the Gemini migration is identified instead of mislabeled as Gemini', async () => {
  const app = harness('#response', undefined, { fetch: async (url, options) => {
    if (url.endsWith('/status')) return new Response('{"configured":true,"provider":"OpenAI"}');
    const context = brief.buildBriefContext(JSON.parse(options.body));
    return new Response(JSON.stringify({ source: 'ai', provider: 'OpenAI', model: 'legacy-model', key: context.key, brief: brief.createLocalBrief(context) }));
  } });
  await app.aiReady();
  assert.match(app.get('#ai-connection').textContent, /older AI server.*Restart/);
  await app.fire('#ai-generate', 'click');
  assert.match(app.get('#ai-source').textContent, /Local brief/);
  assert.match(app.get('#ai-feedback').textContent, /Restart npm start to enable Gemini/);
});
