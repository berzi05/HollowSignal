import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getScenarioLevels } from '../dist/engine.js';
import { projectSituation, comparePolicies, findRefugeRoute, createResponseBrief, REFUGES } from '../dist/crisis.js';

test('rehearsal starts at the scenario snapshot and projects a bounded cascade without mutating seeds', () => {
  const before = JSON.stringify(LEVELS);
  assert.deepEqual(projectSituation('blackout', 0).levels, getScenarioLevels('blackout'));
  const now = projectSituation('blackout', 0);
  const later = projectSituation('blackout', 20);
  const sump = later.levels.find(level => level.id === 'L20');
  assert.equal(sump.reserve, 0);
  assert.ok(sump.air < now.levels[5].air);
  assert.ok(sump.co2 > now.levels[5].co2);
  assert.ok(later.exhausted.some(level => level.id === 'L20'));
  assert.equal(later.windows[0].id, 'L20', 'the first exhausted neighborhood stays first as time advances');
  assert.equal(later.levels[0].air, now.levels[0].air);
  assert.equal(JSON.stringify(LEVELS), before);
  for (const minutes of [-1, 121, Infinity, NaN, '20']) assert.throws(() => projectSituation('blackout', minutes), TypeError);
});

test('policy comparisons conserve the same budget across resources and expose scarcity', () => {
  const levels = projectSituation('blackout', 20).levels;
  for (const resource of ['power', 'water', 'food']) {
    for (const supply of [0, 0.001, 0.0027, 300, 1000, 100000]) {
      const result = comparePolicies(levels, supply, resource);
      for (const plan of [result.community, result.directorate]) {
        assert.ok(plan.used <= supply + 1e-8);
        assert.ok(Math.abs(plan.used + plan.unallocated - supply) < 1e-8);
        assert.ok(plan.allocations.every(row => row.allocated >= 0 && row.allocated <= row.need));
      }
      assert.ok(Math.abs(result.community.used - result.directorate.used) < 1e-8);
    }
  }
  const comparison = comparePolicies(levels, 1000);
  assert.equal(comparison.communityMetrics.minimumCoverage, 100);
  assert.equal(comparison.community.essentialShortfall, 0);
  assert.ok(comparison.directorate.essentialShortfall > 0);
  assert.ok(comparison.communityMetrics.deepCoverage > comparison.directorateMetrics.deepCoverage);
  const none = comparePolicies(levels, 0);
  assert.equal(none.communityMetrics.deepCoverage, 0);
  assert.equal(none.communityMetrics.minimumCoverage, 0);
  assert.ok(none.community.essentialShortfall > 0);
});

test('closing the lower shaft reroutes through the stair bypass and never uses a closed edge', () => {
  const levels = projectSituation('blackout', 0).levels;
  const open = findRefugeRoute({ levels });
  assert.equal(open.found, true);
  assert.ok(open.edges.some(edge => edge.id === 'lower-shaft'));
  const rerouted = findRefugeRoute({ levels, closedEdges: ['lower-shaft'] });
  assert.equal(rerouted.found, true);
  assert.deepEqual(rerouted.path, ['L20', 'L08']);
  assert.ok(rerouted.edges.every(edge => edge.id !== 'lower-shaft'));
  assert.equal(rerouted.stepFree, false);
  assert.equal(rerouted.minutes, 32);
  assert.equal(rerouted.exceedsReserve, true);
  assert.ok(rerouted.criticalLevels.includes('L20'));
});

test('step-free access and closures can make a route unavailable; no fabricated path is returned', () => {
  const levels = getScenarioLevels();
  const open = findRefugeRoute({ levels, stepFree: true });
  assert.equal(open.found, true);
  assert.ok(open.edges.every(edge => edge.stepFree));
  const isolated = findRefugeRoute({ levels, stepFree: true, closedEdges: ['lower-shaft'] });
  assert.equal(isolated.found, false);
  assert.deepEqual(isolated.path, []);
  assert.deepEqual(isolated.edges, []);
});

test('refuges must fit the entire group and cannot have critical destination readings', () => {
  const levels = getScenarioLevels();
  const full = REFUGES.map(refuge => ({ ...refuge, occupied: refuge.capacity }));
  assert.equal(findRefugeRoute({ levels, refuges: full }).found, false);
  assert.equal(findRefugeRoute({ levels, groupSize: 211 }).found, false);
  assert.equal(findRefugeRoute({ levels, groupSize: 210 }).refuge.level, 'L08');
  const hotGardens = levels.map(level => level.id === 'L08' ? { ...level, temp: 40 } : level);
  const route = findRefugeRoute({ levels: hotGardens });
  assert.equal(route.found, true);
  assert.notEqual(route.refuge.level, 'L08');
  assert.ok(route.criticalLevels.includes('L08'));
  const alreadyThere = findRefugeRoute({ levels, origin: 'L08' });
  assert.deepEqual(alreadyThere.path, ['L08']);
  assert.equal(alreadyThere.minutes, 0);
});

test('route input rejects invalid groups, unknown closures and invalid capacity', () => {
  const levels = getScenarioLevels();
  for (const groupSize of [0, -1, 1.5, 1001, NaN]) assert.throws(() => findRefugeRoute({ levels, groupSize }), TypeError);
  assert.throws(() => findRefugeRoute({ levels, origin: 'L99' }), TypeError);
  assert.throws(() => findRefugeRoute({ levels, closedEdges: ['missing'] }), TypeError);
  assert.throws(() => findRefugeRoute({ levels, stepFree: 'yes' }), TypeError);
  assert.throws(() => findRefugeRoute({ levels, refuges: [{ level: 'L08', capacity: 1, occupied: 2 }] }), TypeError);
});

test('response brief records reproducible inputs, the comparison and routing constraints', () => {
  const inputs = { scenario: 'blackout', minutes: 20, supply: 1000, origin: 'L20', groupSize: 12, stepFree: true, closedEdges: ['lower-shaft'] };
  const brief = JSON.parse(JSON.stringify(createResponseBrief(inputs)));
  assert.equal(brief.simulation, true);
  assert.equal(brief.type, 'response-brief');
  assert.deepEqual(brief.inputs, inputs);
  assert.equal(brief.route.found, false);
  assert.equal(brief.allocation.community.used, 1000);
  assert.ok(brief.assumptions.length >= 4);
});
