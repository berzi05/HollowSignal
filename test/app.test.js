import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as engine from '../dist/engine.js';
import * as relay from '../dist/relay.js';
import * as crisis from '../dist/crisis.js';
import * as health from '../dist/health.js';

const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const responseSource = await readFile(new URL('../dist/response-ui.js', import.meta.url), 'utf8');

const healthSource = await readFile(new URL('../dist/health-ui.js', import.meta.url), 'utf8');

function harness(initialHash = '', initialRecords) {
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
  const location = {
    get hash() { return hash; },
    set hash(value) { hash = value && !value.startsWith('#') ? '#' + value : value; },
  };
  const document = {
    title: '',
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        value: '', checked: false, listeners: new Map(),
        addEventListener(name, handler) { this.listeners.set(name, handler); },
        dispatchEvent(event) { this.listeners.get(event.type)?.({ ...event, target: this, currentTarget: this, preventDefault() {} }); },
        querySelector: selector => document.querySelector(selector),
        focus() { this.focused = true; },
        scrollIntoView() { this.scrolled = true; },
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
    ...engine, ...relay, ...crisis, ...health, document, location,
    Event: class { constructor(type) { this.type = type; } },
    FormData: class {
      *[Symbol.iterator]() {
        yield ['alias', document.querySelector('#alias').value];
        yield ['level', document.querySelector('#checkin-level').value];
        yield ['note', document.querySelector('#checkin-note').value];
        yield ['status', document.querySelector('input[name="status"][value="help"]').checked ? 'help' : 'moving'];
      }
    },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    navigator: { onLine: true },
    window: { addEventListener: (name, handler) => handlers.set(name, handler), scrollTo() {}, confirm: () => true },
    setTimeout: () => 0, clearTimeout() {},
  });
  context.initResponseLab = vm.runInContext('(() => {' + responseSource.replace(/^import .*;\r?\n/gm, '').replace('export function initResponseLab', 'function initResponseLab') + '; return initResponseLab; })()', context);
  context.initHealthAid = vm.runInContext('(() => {' + healthSource.replace(/^import .*;\r?\n/gm, '').replace('export function initHealthAid', 'function initHealthAid') + '; return initHealthAid; })()', context);
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, ''), context, { filename: 'app.js' });
  return {
    get: selector => document.querySelector(selector),
    fire(selector, type, changes = {}) {
      const target = document.querySelector(selector);
      Object.assign(target, changes);
      target.dispatchEvent({ type });
    },
    records() { return JSON.parse(saved.get('hollow-signal-v1')); },
    navigate(hash) { location.hash = hash; handlers.get('hashchange')(); },
    visible() { return panels.filter(panel => !panel.hidden).map(panel => panel.id); },
    active() { return links.filter(link => link['aria-current'] === 'page').map(link => link.dataset.view); },
    title() { return document.title; },
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
