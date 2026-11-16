import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getScenarioLevels, assessLevel, getSummary, allocateResource, createCheckIn, mergeCheckIns } from '../dist/engine.js';

test('scenarios clone seeds and affect only intended neighborhoods', () => {
  const baseline = getScenarioLevels();
  baseline[0].power = 0;
  assert.equal(LEVELS[0].power, 98);
  assert.equal(getScenarioLevels('blackout')[0].power, LEVELS[0].power);
  assert.ok(getScenarioLevels('blackout')[5].power < LEVELS[5].power);
  assert.ok(getScenarioLevels('water')[3].water < LEVELS[3].water);
  assert.ok(getScenarioLevels('heat')[2].temp > LEVELS[2].temp);
  assert.throws(() => getScenarioLevels('other'), TypeError);
});

test('hazards include thresholds, reserve estimate, and useful actions', () => {
  assert.equal(assessLevel(LEVELS[0]).severity, 'stable');
  assert.equal(assessLevel(LEVELS[3]).severity, 'watch');
  const assessment = assessLevel(LEVELS[5]);
  assert.equal(assessment.severity, 'critical');
  assert.equal(assessment.blackoutMinutes, 16);
  assert.equal(assessment.warnings.length, 4);
  assert.ok(assessment.warnings.every(warning => warning.action.length > 20));
  assert.equal(assessLevel({ ...LEVELS[0], power: 100 }).blackoutMinutes, null);
  assert.equal(assessLevel({ ...LEVELS[0], water: 60 }).warnings[0].severity, 'watch');
  assert.equal(assessLevel({ ...LEVELS[0], air: 19.49 }).severity, 'critical');
});

test('summary counts all residents and weights readings by population', () => {
  const summary = getSummary(LEVELS);
  assert.equal(summary.population, 19000);
  assert.equal(summary.critical, 2);
  assert.equal(summary.watch, 1);
  assert.equal(summary.stable, 3);
  assert.equal(summary.atRiskPopulation, 13600);
  assert.equal(getSummary([]).averagePower, 0);
});

test('allocator conserves supply, never exceeds demand, handles all resources', () => {
  for (const resource of ['power', 'water', 'food']) {
    for (const supply of [0, 0.001, 0.0027, 10.499, 500, 1200, 10000, 100000]) {
      const plan = allocateResource(LEVELS, supply, resource);
      const sum = plan.allocations.reduce((total, row) => total + row.allocated, 0);
      assert.ok(Math.abs(sum - plan.used) < 1e-8);
      assert.ok(plan.used <= supply + 1e-9);
      assert.ok(Math.abs(plan.used + plan.unallocated - supply) < 1e-8);
      assert.ok(plan.allocations.every(row => row.allocated >= 0 && row.allocated <= row.need && row.coverage <= 100));
      assert.ok(plan.unallocated < 0.0011 || plan.allocations.every(row => row.allocated === row.need));
    }
  }
});

test('scarcity protects the same fraction of essentials across depth', () => {
  const plan = allocateResource(LEVELS, 300, 'power');
  const shares = plan.allocations.map(row => row.allocated / row.essential);
  assert.ok(Math.max(...shares) - Math.min(...shares) < 0.0001);
  assert.ok(plan.essentialShortfall > 0);
});

test('above essential floor, vulnerable neighborhoods receive higher coverage', () => {
  const levels = [{ ...LEVELS[0], id: 'A', population: 1000, vulnerable: 0 }, { ...LEVELS[0], id: 'B', population: 1000, vulnerable: 600 }];
  const plan = allocateResource(levels, 130, 'power');
  assert.ok(plan.allocations.every(row => row.allocated >= row.essential));
  assert.ok(plan.allocations[1].allocated > plan.allocations[0].allocated);
  assert.equal(plan.essentialShortfall, 0);
  const full = allocateResource(levels, 1000, 'power');
  assert.equal(full.used, 160);
  assert.equal(full.unallocated, 840);
});

test('allocator distributes every milli-unit across awkward weights without overshooting', () => {
  const levels = Array.from({ length: 7 }, (_, i) => ({ ...LEVELS[0], id: `X${i}`, population: 997 + i * 13, vulnerable: i * 37 }));
  for (const supply of [0.007, 1.333, 77.777, 333.333, 555.555]) {
    const plan = allocateResource(levels, supply, 'power');
    assert.ok(plan.allocations.every(row => row.allocated <= row.need));
    assert.ok(Math.abs(plan.used - Math.min(supply, plan.allocations.reduce((t, r) => t + r.need, 0))) < 0.0011);
  }
});

test('allocator rejects malformed input and has a defined empty result', () => {
  for (const value of [NaN, Infinity, -1, '500']) assert.throws(() => allocateResource(LEVELS, value), TypeError);
  assert.throws(() => allocateResource(LEVELS, 100, '__proto__'), TypeError);
  assert.throws(() => allocateResource([LEVELS[0], LEVELS[0]], 100), TypeError);
  assert.throws(() => allocateResource([{ ...LEVELS[0], vulnerable: 1e8 }], 100), TypeError);
  assert.deepEqual(allocateResource([], 10).allocations, []);
  assert.equal(allocateResource([], 10).unallocated, 10);
});

const makeRecord = (overrides = {}) => ({ id: 'record-0001', alias: 'Lantern', level: 'L12', status: 'safe', note: 'At the refuge', updatedAt: '2026-11-14T12:00:00.000Z', ...overrides });
test('check-ins validate fields and support deterministic, idempotent merging', () => {
  const created = createCheckIn({ alias: '  Lantern  ', level: 'L12', status: 'safe' }, '2026-11-14T12:00:00.000Z');
  assert.equal(created.alias, 'Lantern');
  assert.equal(created.note, '');
  const older = makeRecord();
  const newer = makeRecord({ status: 'help', updatedAt: '2026-11-14T13:00:00.000Z' });
  assert.deepEqual(mergeCheckIns([older], [newer]), [newer]);
  assert.deepEqual(mergeCheckIns([newer], [older]), [newer]);
  assert.deepEqual(mergeCheckIns([newer], [newer]), [newer]);
  const tied = makeRecord({ status: 'moving' });
  assert.deepEqual(mergeCheckIns([older], [tied]), mergeCheckIns([tied], [older]));
});

test('untrusted imports reject malformed and oversized records and strip unknown fields', () => {
  for (const change of [{ alias: '' }, { alias: 'a'.repeat(41) }, { note: 'a'.repeat(181) }, { note: 'bad\u0000text' }, { level: 'L99' }, { status: 'hidden' }, { updatedAt: 'tomorrow' }, { id: '<script>' }]) assert.throws(() => mergeCheckIns([], [makeRecord(change)]), TypeError);
  assert.equal(mergeCheckIns([], [makeRecord({ alias: 'a'.repeat(40), note: 'First line\nSecond line\tchecked' })])[0].note, 'First line\nSecond line\tchecked');
  assert.throws(() => mergeCheckIns([], Array.from({ length: 201 }, () => makeRecord())), TypeError);
  assert.throws(() => mergeCheckIns([], {}), TypeError);
  assert.equal(mergeCheckIns([], [makeRecord({ injected: 'ignore me' })])[0].injected, undefined);
});
