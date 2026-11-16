import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as engine from '../dist/engine.js';
import * as relay from '../dist/relay.js';

const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');

function harness(initialHash = '') {
  const handlers = new Map();
  const elements = new Map();
  const panels = ['overview', 'resources', 'community'].map(view => ({ id: `view-${view}`, hidden: true }));
  const links = panels.map(panel => ({
    dataset: { view: panel.id.slice(5) },
    classList: { toggle() {} },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
  }));
  const location = { hash: initialHash };
  const document = {
    title: '',
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, {
        value: '',
        addEventListener() {},
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
  vm.runInNewContext(source.replace(/^import .*;\r?\n/gm, ''), {
    ...engine, ...relay, document, location,
    localStorage: { getItem() { return null; } },
    navigator: { onLine: true },
    window: { addEventListener: (name, handler) => handlers.set(name, handler), scrollTo() {} },
    setTimeout, clearTimeout,
  }, { filename: 'app.js' });
  return {
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

test('the main-content skip link preserves each selected view', () => {
  for (const view of ['overview', 'resources', 'community']) {
    const app = harness(`#${view}`);
    app.navigate('#main');
    assert.deepEqual(app.visible(), [`view-${view}`]);
    assert.deepEqual(app.active(), [view]);
  }
});
