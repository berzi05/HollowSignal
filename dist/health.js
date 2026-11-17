/** Community observations and aid logistics. All thresholds and clinic seeds are fictional. */
import { LEVELS, mergeRecords, validateRecordId, validateTimestamp } from './engine.js';
import { findRefugeRoute, TUNNELS } from './crisis.js';

export const CLINICS = Object.freeze([
  { id: 'market', level: 'L04', name: 'Market community clinic', capacity: 20, slots: 8, masks: 80, kits: 16 },
  { id: 'gardens', level: 'L08', name: 'Root Gardens care station', capacity: 12, slots: 0, masks: 8, kits: 0 },
  { id: 'ember', level: 'L16', name: 'Ember volunteer clinic', capacity: 8, slots: 0, masks: 0, kits: 0 },
  { id: 'sump', level: 'L20', name: 'Sump care desk', capacity: 6, slots: 0, masks: 0, kits: 0 },
].map(Object.freeze));
export const AID_KINDS = Object.freeze({ visit: 'Care visit', masks: 'Masks', kits: 'First-aid kits', mobile: 'Mobile care / local assistance' });
export const CLINIC_MAX_AGE = 6 * 60 * 60 * 1000;
// Local edits use monotonic millisecond timestamps; tolerate their tiny clock lead.
export const UPDATE_CLOCK_SKEW = 1000;
const DAY = 86400000;
const levelById = new Map(LEVELS.map(level => [level.id, level]));
const reviewStates = new Set(['unreviewed', 'reviewed', 'excluded']);
const requestStates = new Set(['requested', 'coordinating', 'completed']);
const iso = value => validateTimestamp(value instanceof Date ? value.toISOString() : value, 'Timestamp');
const integer = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
};
function text(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max) throw new TypeError(`${label} must be text of at most ${max} characters.`);
  const clean = value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim();
  if (required && !clean) throw new TypeError(`${label} is required.`);
  return clean;
}
function dayString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Choose a valid UTC tally date.');
  iso(`${value}T00:00:00.000Z`);
  return value;
}

function validateHealthReport(record) {
  validateRecordId(record, 'health tally');
  const level = levelById.get(record.level);
  if (!level) throw new TypeError('Unknown health tally level.');
  const day = dayString(record.day);
  if (record.id !== `health-${record.level}-${day}`) throw new TypeError('A neighborhood has one reconciled tally per UTC day.');
  const screened = integer(record.screened, 1, level.population, 'People observed');
  const count = integer(record.count, 0, screened, 'People reporting respiratory symptoms');
  if (!reviewStates.has(record.review)) throw new TypeError('Unknown review state.');
  return {
    id: record.id, level: record.level, day, screened, count,
    source: text(record.source, 60, 'Tally source', true), review: record.review,
    note: text(record.note, 180, 'Review note', record.review !== 'unreviewed'),
    updatedAt: iso(record.updatedAt),
  };
}
export function createHealthReport(input, now = new Date().toISOString()) {
  const stamp = iso(now);
  const result = validateHealthReport({ ...input, id: `health-${input.level}-${input.day}`, updatedAt: stamp });
  if (result.day > stamp.slice(0, 10)) throw new TypeError('A tally cannot be dated in the future.');
  return result;
}
export function mergeHealthReports(existing, incoming) {
  return mergeRecords(existing, incoming, validateHealthReport, 'health tallies');
}

/** Compare reporting rates in equal UTC-day windows, never interpreting missing data as zero. */
export function summarizeHealth(records, now = new Date().toISOString()) {
  const stamp = iso(now), today = stamp.slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00.000Z`) - DAY).toISOString().slice(0, 10);
  const valid = mergeHealthReports([], records).filter(row => Date.parse(row.updatedAt) <= Date.parse(stamp) + UPDATE_CLOCK_SKEW && row.day <= today && row.review !== 'excluded');
  const rows = LEVELS.map(level => {
    const current = valid.find(row => row.level === level.id && row.day === today);
    const previous = valid.find(row => row.level === level.id && row.day === yesterday);
    const rate = current ? current.count / current.screened : null;
    const priorRate = previous ? previous.count / previous.screened : null;
    const signal = Boolean(current && previous && current.count >= 5 && rate > priorRate && rate >= priorRate * 2);
    return { level: level.id, name: level.name, current, previous, rate, priorRate, signal,
      status: !current ? 'No current tally' : !previous ? 'Need prior tally' : signal ? 'Review increase' : 'No threshold crossed' };
  });
  return { today, yesterday, rows, signals: rows.filter(row => row.signal).length,
    unreviewed: valid.filter(row => row.day === today && row.review === 'unreviewed').length };
}

export function sampleHealthReports(now = new Date().toISOString()) {
  const stamp = iso(now), today = stamp.slice(0, 10);
  const yesterday = new Date(Date.parse(`${today}T00:00:00.000Z`) - DAY).toISOString().slice(0, 10);
  return [['L20', 80, 4, 18], ['L16', 60, 3, 7], ['L08', 80, 2, 2]].flatMap(([level, screened, before, after]) =>
    [[yesterday, before], [today, after]].map(([day, count]) => createHealthReport({ level, day, screened, count,
      source: 'SAMPLE · neighborhood volunteer desk', review: 'unreviewed', note: 'Fictional rehearsal tally; no individual records.' }, stamp)));
}

function validateClinicUpdate(record) {
  validateRecordId(record, 'clinic snapshot');
  const clinic = CLINICS.find(item => item.id === record.clinicId);
  if (!clinic || record.id !== `clinic-${clinic.id}`) throw new TypeError('Unknown clinic snapshot.');
  if (typeof record.open !== 'boolean') throw new TypeError('Clinic availability must be true or false.');
  const observedAt = iso(record.observedAt), updatedAt = iso(record.updatedAt);
  if (observedAt > updatedAt) throw new TypeError('Clinic observation cannot be later than its update.');
  return { id: record.id, clinicId: clinic.id, open: record.open,
    slots: integer(record.slots, 0, clinic.capacity, 'Available care places'),
    masks: integer(record.masks, 0, 10000, 'Masks'), kits: integer(record.kits, 0, 10000, 'First-aid kits'),
    source: text(record.source, 60, 'Snapshot source', true), observedAt, updatedAt };
}
export function createClinicUpdate(input, now = new Date().toISOString()) {
  return validateClinicUpdate({ ...input, id: `clinic-${input.clinicId}`, updatedAt: iso(now) });
}
export function mergeClinicUpdates(existing, incoming) {
  return mergeRecords(existing, incoming, validateClinicUpdate, 'clinic snapshots');
}
export function clinicSnapshots(updates, now = new Date().toISOString()) {
  const stamp = iso(now), records = mergeClinicUpdates([], updates);
  return CLINICS.map(clinic => {
    const update = records.find(row => row.clinicId === clinic.id);
    const age = update ? Date.parse(stamp) - Date.parse(update.observedAt) : 0;
    return { ...clinic, open: true, ...update, id: clinic.id, simulated: !update,
      stale: Boolean(update && (age < 0 || age > CLINIC_MAX_AGE || Date.parse(update.updatedAt) > Date.parse(stamp) + UPDATE_CLOCK_SKEW)) };
  });
}

function validateContext({ scenario, minutes, stepFree, closedEdges }) {
  if (!['baseline', 'blackout', 'water', 'heat'].includes(scenario) || !Number.isFinite(minutes) || minutes < 0 || minutes > 120 || typeof stepFree !== 'boolean' || !Array.isArray(closedEdges) || closedEdges.length > TUNNELS.length || closedEdges.some(id => !TUNNELS.some(edge => edge.id === id))) throw new TypeError('Invalid aid planning context.');
  return { scenario, minutes, stepFree, closedEdges: [...new Set(closedEdges)].sort() };
}
export function planAid({ levels, updates = [], origin = 'L20', people = 1, kind = 'visit', stepFree = false, closedEdges = [], scenario = 'baseline', minutes = 0, now = new Date().toISOString() }) {
  if (!Object.hasOwn(AID_KINDS, kind)) throw new TypeError('Unknown aid need.');
  integer(people, 1, 1000, 'People needing help');
  const context = validateContext({ scenario, minutes, stepFree, closedEdges });
  const clinics = clinicSnapshots(updates, now);
  const available = clinic => kind === 'visit' ? clinic.slots : kind === 'mobile' ? 0 : clinic[kind];
  const eligible = clinics.filter(clinic => !clinic.stale && clinic.open && available(clinic) >= people);
  const route = findRefugeRoute({ levels, origin, groupSize: people, stepFree, closedEdges,
    refuges: eligible.map(clinic => ({ level: clinic.level, name: clinic.name, capacity: available(clinic), occupied: 0 })) });
  if (!route.found) route.reason = kind === 'mobile'
    ? 'Ask a volunteer team to come to this neighborhood. A person must arrange and relay the request.'
    : 'No clinic meets the current availability, stock, route, and destination-hazard requirements. Request local assistance; do not drop access needs.';
  const clinic = route.found ? eligible.find(item => item.level === route.refuge.level) : null;
  return { origin, people, kind, context, clinic, route };
}

function validateAidRequest(record) {
  validateRecordId(record, 'aid request');
  if (!levelById.has(record.level) || !Object.hasOwn(AID_KINDS, record.kind)) throw new TypeError('Unknown aid request level or need.');
  if (!requestStates.has(record.status)) throw new TypeError('Unknown aid request status.');
  if (record.clinicId !== null && !CLINICS.some(clinic => clinic.id === record.clinicId)) throw new TypeError('Unknown proposed clinic.');
  return { id: record.id, level: record.level, kind: record.kind,
    people: integer(record.people, 1, 1000, 'People needing help'), clinicId: record.clinicId,
    status: record.status, context: validateContext(record.context ?? {}), note: text(record.note, 240, 'Aid note', true), updatedAt: iso(record.updatedAt) };
}
export function createAidRequest(plan, now = new Date().toISOString()) {
  return validateAidRequest({ id: globalThis.crypto.randomUUID(), level: plan.origin, kind: plan.kind, people: plan.people,
    clinicId: plan.clinic?.id ?? null, status: 'requested', context: plan.context, updatedAt: iso(now),
    note: plan.route.found
      ? `DRILL: ${AID_KINDS[plan.kind]} for ${plan.people} at ${plan.origin}. Proposed clinic ${plan.clinic.level}; resident route ${plan.route.path.join(' → ')} (${plan.route.minutes} min). Local review required. No stock or care places reserved.`
      : `DRILL: ${AID_KINDS[plan.kind]} for ${plan.people} at ${plan.origin}. Local assistance requested; no clinic route selected. Please relay to a volunteer team. Nothing dispatched.` });
}
export function mergeAidRequests(existing, incoming) {
  return mergeRecords(existing, incoming, validateAidRequest, 'aid requests');
}
