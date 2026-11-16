import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as engine from '../dist/engine.js';
import * as relay from '../dist/relay.js';
import * as crisis from '../dist/crisis.js';

const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
const responseSource = await readFile(new URL('../dist/response-ui.js', import.meta.url), 'utf8');

function harness(initialHash = '') {
  const handlers = new Map();
  const elements = new Map();
  const saved = new Map();
  const panels = ['overview', 'response', 'resources', 'community'].map(view => ({ id: `view-${view}`, hidden: true }));
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
    ...engine, ...relay, ...crisis, document, location,
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
    window: { addEventListener: (name, handler) => handlers.set(name, handler), scrollTo() {} },
    setTimeout: () => 0, clearTimeout() {},
  });
  context.initResponseLab = vm.runInContext('(() => {' + responseSource.replace(/^import .*;\r?\n/gm, '').replace('export function initResponseLab', 'function initResponseLab') + '; return initResponseLab; })()', context);
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
  for (const view of ['overview', 'response', 'resources', 'community']) {
    const app = harness(`#${view}`);
    app.navigate('#main');
    assert.deepEqual(app.visible(), [`view-${view}`]);
    assert.deepEqual(app.active(), [view]);
  }
});

test('planning from a neighborhood carries its origin and focuses the refuge section', () => {
  const app = harness();
  app.fire('#drill-respond', 'click');
  app.fire('#level-detail', 'click', { closest: () => ({ dataset: { planLevel: 'L12' } }) });
  assert.deepEqual(app.visible(), ['view-response']);
  assert.equal(app.get('#route-origin').value, 'L12');
  assert.equal(app.get('#response-routes').focused, true);
  assert.equal(app.get('#response-routes').scrolled, true);
  assert.match(app.get('#route-result').innerHTML, /L12/);
  assert.match(app.get('#route-context').textContent, /Geothermal outage.*20 min/);
});
