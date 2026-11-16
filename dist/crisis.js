/** Fictional crisis rehearsal. These explicit assumptions are not calibrated forecasts. */
import { getScenarioLevels, assessLevel, allocateResource } from './engine.js';

export const TUNNELS = Object.freeze([
  { id: 'atrium-market', from: 'L01', to: 'L04', minutes: 8, stepFree: true, name: 'Atrium ramp' },
  { id: 'market-gardens', from: 'L04', to: 'L08', minutes: 9, stepFree: true, name: 'Market concourse' },
  { id: 'gardens-narrows', from: 'L08', to: 'L12', minutes: 9, stepFree: true, name: 'Garden ramp' },
  { id: 'lower-shaft', from: 'L12', to: 'L16', minutes: 8, stepFree: true, name: 'Lower shaft' },
  { id: 'sump-ramp', from: 'L16', to: 'L20', minutes: 7, stepFree: true, name: 'Sump ramp' },
  { id: 'service-bypass', from: 'L20', to: 'L08', minutes: 32, stepFree: false, name: 'Service stair bypass' },
].map(Object.freeze));

export const REFUGES = Object.freeze([
  { level: 'L01', name: 'Atrium assembly hall', capacity: 600, occupied: 420 },
  { level: 'L04', name: 'Market first-aid station', capacity: 420, occupied: 310 },
  { level: 'L08', name: 'Root Gardens refuge', capacity: 420, occupied: 210 },
].map(Object.freeze));

export function projectSituation(scenario = 'baseline', minutes = 0) {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 120) throw new TypeError('Rehearsal time must be between 0 and 120 minutes.');
  const initialLevels = getScenarioLevels(scenario);
  const levels = initialLevels.map(level => {
    const draw = 1 - level.power / 100;
    const reserveWindow = draw > 0 ? level.reserve / draw : Infinity;
    const withoutReserve = Math.max(0, minutes - reserveWindow);
    return {
      ...level,
      reserve: Math.max(0, level.reserve - minutes * draw),
      // Hypothetical cascading ventilation/cooling loss after the modeled reserve is exhausted.
      air: Math.max(0, Math.round((level.air - Math.min(1.5, withoutReserve * 0.015)) * 100) / 100),
      co2: Math.round(level.co2 + withoutReserve * 14),
      temp: Math.round((level.temp + withoutReserve * 0.025) * 100) / 100,
    };
  });
  const windows = levels.map((level, index) => {
    const risk = assessLevel(level);
    return { id: level.id, name: level.name, population: level.population, ...risk, exhaustsAt: assessLevel(initialLevels[index]).blackoutMinutes };
  }).sort((a, b) => (a.exhaustsAt ?? Infinity) - (b.exhaustsAt ?? Infinity));
  return { scenario, minutes, levels, windows, exhausted: windows.filter(row => row.blackoutMinutes === 0) };
}

function essentialMetrics(levels, plan) {
  const deepIds = new Set(levels.filter(level => level.depth >= 420).map(level => level.id));
  const deep = plan.allocations.filter(row => deepIds.has(row.id));
  const essentials = deep.reduce((sum, row) => sum + row.essential, 0);
  return {
    deepCoverage: essentials ? 100 * deep.reduce((sum, row) => sum + Math.min(row.allocated, row.essential), 0) / essentials : 100,
    minimumCoverage: plan.allocations.length ? Math.min(...plan.allocations.map(row => row.essential ? Math.min(100, 100 * row.allocated / row.essential) : 100)) : 100,
    zeroAllocationResidents: plan.allocations.filter(row => row.allocated === 0).reduce((sum, row) => sum + row.population, 0),
  };
}

/** Compare the same budget against a fictional upper-level-first policy, without claiming lives saved. */
export function comparePolicies(levels, supply, resource = 'power') {
  const community = allocateResource(levels, supply, resource);
  let remaining = Math.floor(supply * 1000 + 1e-7);
  const byDepth = [...levels].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const grants = new Map();
  for (const level of byDepth) {
    const need = community.allocations.find(row => row.id === level.id).need;
    const grant = Math.min(remaining, Math.round(need * 1000));
    grants.set(level.id, grant / 1000);
    remaining -= grant;
  }
  const allocations = community.allocations.map(row => ({
    ...row, allocated: grants.get(row.id), coverage: row.need ? 100 * grants.get(row.id) / row.need : 100,
  }));
  const used = allocations.reduce((sum, row) => sum + Math.round(row.allocated * 1000), 0) / 1000;
  const essentialShortfall = allocations.reduce((sum, row) => sum + Math.max(0, Math.round(row.essential * 1000) - Math.round(row.allocated * 1000)), 0) / 1000;
  const directorate = { ...community, allocations, used, unallocated: Math.max(0, supply - used), essentialShortfall };
  return { community, directorate, communityMetrics: essentialMetrics(levels, community), directorateMetrics: essentialMetrics(levels, directorate) };
}

/** Shortest weighted path with explicit closures, access needs, hazard costs, and refuge capacity. */
export function findRefugeRoute({ levels, origin = 'L20', groupSize = 12, stepFree = false, closedEdges = [], refuges = REFUGES } = {}) {
  if (!Array.isArray(levels) || !levels.length) throw new TypeError('Provide current level readings.');
  const byId = new Map(levels.map(level => [level.id, level]));
  if (byId.size !== levels.length || !byId.has(origin)) throw new TypeError('Choose a known starting level.');
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 1000) throw new TypeError('Group size must be a whole number from 1 to 1000.');
  if (typeof stepFree !== 'boolean') throw new TypeError('Step-free preference must be true or false.');
  if (!Array.isArray(closedEdges) || closedEdges.some(id => !TUNNELS.some(edge => edge.id === id))) throw new TypeError('Unknown tunnel closure.');
  if (!Array.isArray(refuges) || refuges.some(refuge => !byId.has(refuge.level) || !Number.isInteger(refuge.capacity) || !Number.isInteger(refuge.occupied) || refuge.occupied < 0 || refuge.capacity < refuge.occupied)) throw new TypeError('Invalid refuge capacity.');
  const risk = new Map(levels.map(level => [level.id, assessLevel(level)]));
  const graph = TUNNELS.filter(edge => byId.has(edge.from) && byId.has(edge.to) && !closedEdges.includes(edge.id) && (!stepFree || edge.stepFree));
  const costs = new Map([[origin, 0]]);
  const previous = new Map();
  const unsettled = new Set(byId.keys());
  while (unsettled.size) {
    const current = [...unsettled].sort((a, b) => (costs.get(a) ?? Infinity) - (costs.get(b) ?? Infinity) || a.localeCompare(b))[0];
    if (!Number.isFinite(costs.get(current))) break;
    unsettled.delete(current);
    for (const edge of graph.filter(edge => edge.from === current || edge.to === current)) {
      const next = edge.from === current ? edge.to : edge.from;
      if (!unsettled.has(next)) continue;
      const cost = costs.get(current) + edge.minutes * (1 + risk.get(next).score / 100);
      if (cost < (costs.get(next) ?? Infinity)) {
        costs.set(next, cost);
        previous.set(next, { from: current, edge });
      }
    }
  }
  const candidates = refuges.filter(refuge => refuge.capacity - refuge.occupied >= groupSize && risk.get(refuge.level).severity !== 'critical' && costs.has(refuge.level))
    .sort((a, b) => costs.get(a.level) - costs.get(b.level) || a.level.localeCompare(b.level));
  if (!candidates.length) return {
    found: false, origin, groupSize, path: [], edges: [],
    reason: 'No connected refuge meets the current capacity, access, and destination-hazard constraints. Request local assistance or change the plan; do not assume a blocked route is usable.',
  };
  const refuge = candidates[0];
  const path = [refuge.level], edges = [];
  let cursor = refuge.level;
  while (cursor !== origin) {
    const link = previous.get(cursor);
    edges.unshift(link.edge); path.unshift(link.from); cursor = link.from;
  }
  const minutes = edges.reduce((sum, edge) => sum + edge.minutes, 0);
  const reserveMinutes = risk.get(origin).blackoutMinutes;
  return {
    found: true, origin, groupSize, refuge: { ...refuge }, available: refuge.capacity - refuge.occupied,
    path, edges, minutes, cost: costs.get(refuge.level),
    stepFree: edges.every(edge => edge.stepFree),
    criticalLevels: path.filter(id => risk.get(id).severity === 'critical'),
    exceedsReserve: reserveMinutes !== null && minutes > reserveMinutes,
    reserveMinutes,
  };
}

export function createResponseBrief({ scenario, minutes, supply, origin, groupSize, stepFree, closedEdges }) {
  const situation = projectSituation(scenario, minutes);
  return {
    app: 'hollow-signal', type: 'response-brief', version: 1, exportedAt: new Date().toISOString(),
    simulation: true, assumptions: [
      'Fictional readings, tunnel times, and refuge capacities; no live sensor or responder connection.',
      'Reserve draw = 1 - power coverage. After reserve depletion: oxygen -0.015 points/min (capped at 1.5), CO2 +14 ppm/min, temperature +0.025 C/min.',
      'Route cost = walking minutes × (1 + destination risk score / 100). Capacities are snapshots, not reservations.',
      'Allocation is a proposal; exporting does not deliver supplies, dispatch help, or change conditions.',
    ],
    inputs: { scenario, minutes, supply, origin, groupSize, stepFree, closedEdges: [...closedEdges] },
    situation,
    allocation: comparePolicies(situation.levels, supply),
    route: findRefugeRoute({ levels: situation.levels, origin, groupSize, stepFree, closedEdges }),
  };
}
