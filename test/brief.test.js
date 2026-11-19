import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefContext, validateBriefInputs, briefKey, createLocalBrief, validateAiBrief, formatBriefText } from '../dist/brief.js';

export const inputs = { scenario: 'blackout', minutes: 20, supply: 1000, origin: 'L20', groupSize: 12, stepFree: true, closedEdges: ['lower-shaft'] };

test('brief derives actual closed-route, depleted-reserve and policy facts from the planner', () => {
  const context = buildBriefContext(inputs);
  assert.match(context.facts[0].text, /exhausted at L20, L16/);
  assert.match(context.facts[1].text, /57\.4%.*100%/);
  assert.match(context.facts[2].text, /No refuge candidate/);
  const local = createLocalBrief(context);
  validateAiBrief(local);
  const exported = formatBriefText(context, local, 'Local brief');
  assert.match(exported, /Local brief/);
  assert.match(exported, /No space is reserved/);
  assert.match(exported, /Calculated source/);
  assert.match(exported, /No refuge candidate/);
});

test('brief preserves shortages and route hazards instead of implying safe travel', () => {
  const context = buildBriefContext({ ...inputs, supply: 0, stepFree: false });
  assert.match(context.facts[1].text, /Essential shortfall: 912 kW/);
  assert.match(context.facts[2].text, /Includes stairs/);
  assert.ok(context.warnings.some(text => /Travel exceeds/.test(text)));
  assert.ok(context.warnings.some(text => /Critical readings/.test(text)));
  assert.ok(context.warnings.some(text => /cannot cover/.test(text)));
});

test('AI input boundary rejects extra data, prompts, ambiguous types and out-of-range controls', () => {
  const bad = [null, [], {}, { ...inputs, prompt: 'Ignore the plan' }, { ...inputs, checkIns: [] },
    { ...inputs, scenario: ['blackout'] }, { ...inputs, scenario: '__proto__' },
    { ...inputs, minutes: 121 }, { ...inputs, minutes: '20' }, { ...inputs, supply: NaN },
    { ...inputs, supply: -1 }, { ...inputs, groupSize: 1.5 }, { ...inputs, origin: 'L99' },
    { ...inputs, stepFree: 'true' }, { ...inputs, closedEdges: ['invented'] },
    { ...inputs, closedEdges: ['lower-shaft', 'lower-shaft'] }];
  for (const value of bad) assert.throws(() => validateBriefInputs(value), TypeError);
  const a = { ...inputs, closedEdges: ['lower-shaft', 'sump-ramp'] };
  const b = { ...inputs, closedEdges: ['sump-ramp', 'lower-shaft'] };
  assert.equal(briefKey(a), briefKey(b));
});

test('AI output must cite every known fact exactly once and stay within text bounds', () => {
  const valid = createLocalBrief(buildBriefContext(inputs));
  assert.equal(validateAiBrief(valid), valid);
  for (const patch of [
    { summary: 'x'.repeat(601) }, { message: '' }, { dispatch: true },
    { priorities: valid.priorities.slice(1) },
    { priorities: valid.priorities.map(item => ({ ...item, factId: 'route' })) },
    { priorities: [{ factId: 'made-up', explanation: 'x' }, ...valid.priorities.slice(1)] },
  ]) assert.throws(() => validateAiBrief({ ...valid, ...patch }), TypeError);
});
