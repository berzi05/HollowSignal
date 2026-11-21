import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { LEVELS } from '../dist/engine.js';
import * as crisis from '../dist/crisis.js';

const source = await readFile(new URL('../dist/response-ui.js', import.meta.url), 'utf8');
function harness() {
  const elements = new Map();
  const get = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: '', textContent: '', value: '', checked: false, listeners: new Map(),
      addEventListener(name, handler) { this.listeners.set(name, handler); },
      focus() { this.focused = true; },
      scrollIntoView() { this.scrolled = true; },
    });
    return elements.get(selector);
  };
  const sections = ['response-reserves', 'response-allocation', 'response-routes'];
  const buttons = sections.map(id => Object.assign(get('#jump-' + id), { dataset: { plannerTarget: id } }));
  const document = { querySelector: get, querySelectorAll: selector => selector === '[data-planner-target]' ? buttons : [] };
  const location = { hash: '' };
  const context = vm.createContext({ ...crisis, LEVELS, document, location });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace('export function initResponseLab', 'function initResponseLab'), context);
  let scenario = 'baseline';
  const drafts = [], downloads = [], notices = [];
  const lab = context.initResponseLab({
    getScenario: () => scenario,
    onScenario: value => { scenario = value; },
    onCheckIn: draft => drafts.push(draft),
    download: (name, content) => downloads.push({ name, content }),
    toast: message => notices.push(message),
  });
  return {
    get, lab, location, drafts, downloads, notices,
    fire(selector, event = 'click', change = {}) {
      const target = get(selector);
      Object.assign(target, change);
      target.listeners.get(event)({ target });
    },
  };
}

test('guided drill connects time, policy, closure, rerouting, and a draft check-in', () => {
  const h = harness();
  h.fire('#drill-shock');
  assert.equal(h.location.hash, 'response');
  assert.match(h.get('#response-countdown').innerHTML, /7<small> min/);
  h.fire('#drill-respond');
  assert.equal(h.get('#response-time').value, 20);
  assert.equal(h.get('#route-closure').checked, true);
  assert.match(h.get('#route-result').innerHTML, /Service stair bypass/);
  assert.match(h.get('#policy-impact').innerHTML, /57%/);
  assert.match(h.get('#policy-impact').innerHTML, /100%/);
  h.fire('#drill-reconnect');
  assert.equal(h.drafts.length, 1);
  assert.equal(h.drafts[0].status, 'moving');
  assert.equal(h.drafts[0].level, 'L20');
  assert.ok(h.drafts[0].note.length <= 180);
  assert.match(h.drafts[0].note, /L08/);
});

test('accessibility constraints produce a help draft instead of an impossible travel plan', () => {
  const h = harness();
  h.fire('#drill-respond');
  h.fire('#route-step-free', 'change', { checked: true });
  assert.match(h.get('#route-result').innerHTML, /No viable candidate/);
  assert.equal(h.get('#route-message').textContent, 'Draft a help request →');
  h.fire('#route-message');
  assert.equal(h.drafts[0].status, 'help');
  assert.match(h.drafts[0].note, /No refuge route/);
  assert.ok(h.drafts[0].note.length <= 180);
});

test('group validation preserves a valid plan, and a brief exports the current controls', () => {
  const h = harness();
  h.fire('#drill-respond');
  h.fire('#route-group', 'change', { value: '1.5' });
  assert.equal(h.get('#route-group').value, 12);
  assert.equal(h.notices.length, 1);
  h.fire('#route-group', 'change', { value: '210' });
  h.fire('#response-supply', 'input', { value: '500' });
  h.fire('#export-response');
  const brief = JSON.parse(h.downloads[0].content);
  assert.equal(brief.inputs.groupSize, 210);
  assert.equal(brief.inputs.supply, 500);
  assert.deepEqual(brief.inputs.closedEdges, ['lower-shaft']);
  assert.equal(brief.route.found, true);
  h.lab.reset();
  assert.equal(h.get('#response-time').value, 0);
  assert.equal(h.get('#route-closure').checked, false);
});

test('planner shortcuts focus the requested section without resetting current inputs', () => {
  const h = harness();
  h.lab.setOrigin('L12');
  h.fire('#response-supply', 'input', { value: '700' });
  h.fire('#jump-response-routes');
  assert.equal(h.get('#response-routes').focused, true);
  assert.equal(h.get('#response-routes').scrolled, true);
  assert.equal(h.get('#route-origin').value, 'L12');
  h.fire('#export-response');
  const brief = JSON.parse(h.downloads[0].content);
  assert.equal(brief.inputs.origin, 'L12');
  assert.equal(brief.inputs.supply, 700);
  assert.throws(() => h.lab.setOrigin('L99'), /known starting level/);
});
