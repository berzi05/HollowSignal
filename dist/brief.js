import { LEVELS } from './engine.js';
import { createResponseBrief, TUNNELS } from './crisis.js';

const INPUT_KEYS = ['scenario', 'minutes', 'supply', 'origin', 'groupSize', 'stepFree', 'closedEdges'];
const scenarios = { baseline: 'Baseline', blackout: 'Plant failure', water: 'Water contamination', heat: 'Heat surge' };
export const FACT_IDS = ['reserves', 'power', 'route'];

/** Only these synthetic controls may cross the AI boundary. No free text or resident records. */
export function validateBriefInputs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== INPUT_KEYS.length || INPUT_KEYS.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError('Send only the seven planner settings.');
  }
  if (typeof value.scenario !== 'string' || !Object.hasOwn(scenarios, value.scenario) || !LEVELS.some(level => level.id === value.origin)) throw new TypeError('Unknown scenario or neighborhood.');
  for (const [key, min, max] of [['minutes', 0, 120], ['supply', 0, 1800], ['groupSize', 1, 1000]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new TypeError(`Invalid ${key}.`);
  }
  if (typeof value.stepFree !== 'boolean' || !Array.isArray(value.closedEdges) || value.closedEdges.length > TUNNELS.length ||
      value.closedEdges.some(id => !TUNNELS.some(edge => edge.id === id)) || new Set(value.closedEdges).size !== value.closedEdges.length) {
    throw new TypeError('Invalid tunnel or accessibility settings.');
  }
  return Object.fromEntries(INPUT_KEYS.map(key => [key, key === 'closedEdges' ? [...value[key]].sort() : value[key]]));
}

export const briefKey = inputs => JSON.stringify(validateBriefInputs(inputs));
const rounded = value => Math.round(value * 10) / 10;

/** The browser and server independently derive the same facts from the existing engine. */
export function buildBriefContext(value) {
  const inputs = validateBriefInputs(value);
  const { situation, allocation, route } = createResponseBrief(inputs);
  const finite = situation.windows.filter(level => level.blackoutMinutes !== null);
  const exhausted = finite.filter(level => level.blackoutMinutes <= 0);
  const next = finite.filter(level => level.blackoutMinutes > 0).sort((a, b) => a.blackoutMinutes - b.blackoutMinutes)[0];
  const reserveText = [
    exhausted.length ? `Reserves exhausted at ${exhausted.map(level => level.id).join(', ')}.` : 'No modeled reserves are exhausted at this point.',
    next ? `${next.id} has the next depletion, in about ${Math.ceil(next.blackoutMinutes)} minutes.` : 'No further reserve depletion is modeled from this snapshot.',
  ].join(' ');
  const powerText = `${inputs.supply} kW available. Deep-level essential coverage: ${rounded(allocation.directorateMetrics.deepCoverage)}% with upper-level-first allocation; ${rounded(allocation.communityMetrics.deepCoverage)}% with the community policy. Essential shortfall: ${rounded(allocation.community.essentialShortfall)} kW.`;
  const routeText = route.found
    ? `Candidate for ${inputs.groupSize} people: ${route.path.join(' → ')} to ${route.refuge.name}; ${route.minutes} minutes walking; ${route.available} places in the simulated snapshot. ${route.stepFree ? 'Step-free.' : 'Includes stairs.'}`
    : `No refuge candidate meets the access, capacity, and destination-hazard constraints for ${inputs.groupSize} people at ${inputs.origin}. Request local assistance; no movement is authorized.`;
  const warnings = ['Fictional rehearsal. Verify conditions locally before any action.', 'No space is reserved, supplies delivered, or help dispatched.'];
  if (route.found && route.exceedsReserve) warnings.push('Travel exceeds the origin’s remaining modeled reserve; local assistance and review are needed.');
  if (route.found && route.criticalLevels.length) warnings.push(`Critical readings along the candidate path: ${route.criticalLevels.join(', ')}. This is not a safety clearance.`);
  if (allocation.community.essentialShortfall > 0) warnings.push('The available power cannot cover every modeled essential need.');
  return {
    inputs, key: briefKey(inputs),
    label: `${scenarios[inputs.scenario]} · +${inputs.minutes} min · ${inputs.origin} · ${inputs.groupSize} people`,
    facts: [
      { id: 'reserves', title: 'Reserve window', text: reserveText },
      { id: 'power', title: 'Power fairness', text: powerText },
      { id: 'route', title: 'Refuge access', text: routeText },
    ],
    warnings,
  };
}

export function createLocalBrief(context) {
  return {
    summary: `Review the reserve window, proposed power allocation, and refuge access for ${context.inputs.origin}. This brief follows the current planner settings.`,
    priorities: [
      { factId: 'reserves', explanation: 'Check the earliest reserve losses first and share the modeled warning with the affected neighborhoods.' },
      { factId: 'power', explanation: 'Use the same budget to compare both policies. Review essential shortfalls before proposing a distribution.' },
      { factId: 'route', explanation: 'Review the access and capacity result with local coordinators. Where no route qualifies, draft a request for local assistance.' },
    ],
    message: `REHEARSAL UPDATE — ${context.label}. ${context.facts[2].text} Please confirm local conditions and relay your group’s status. This is a planning draft, not a dispatch notice.`,
  };
}

/** Structured output still needs business-rule validation and plain-text rendering. */
export function validateAiBrief(value) {
  const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s);
  if (!value || Object.keys(value).sort().join(',') !== 'message,priorities,summary' || !text(value.summary, 600) || !text(value.message, 900) ||
      !Array.isArray(value.priorities) || value.priorities.length !== 3 ||
      value.priorities.some(item => !item || Object.keys(item).sort().join(',') !== 'explanation,factId' || !FACT_IDS.includes(item.factId) || !text(item.explanation, 400)) ||
      new Set(value.priorities.map(item => item.factId)).size !== 3) {
    throw new TypeError('The AI response did not match the brief format.');
  }
  return value;
}

export function formatBriefText(context, brief, source) {
  return [
    `HOLLOW SIGNAL — ${source}`, context.label, '', brief.summary, '',
    ...brief.priorities.map(item => {
      const fact = context.facts.find(row => row.id === item.factId);
      return `${fact.title}: ${item.explanation}\nCalculated source: ${fact.text}\n`;
    }),
    'RESIDENT MESSAGE — DRAFT', brief.message, '', 'REVIEW BEFORE SHARING', ...context.warnings,
  ].join('\n');
}
