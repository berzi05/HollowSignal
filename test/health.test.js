import test from 'node:test';
import assert from 'node:assert/strict';
import { getScenarioLevels } from '../dist/engine.js';
import { createHealthReport, mergeHealthReports, summarizeHealth, sampleHealthReports, createClinicUpdate, mergeClinicUpdates, clinicSnapshots, planAid, createAidRequest, mergeAidRequests } from '../dist/health.js';
import { parsePacket, serializePacket } from '../dist/relay.js';

const now = '2026-11-17T12:00:00.000Z';
const later = '2026-11-17T13:00:00.000Z';
const tally = (overrides = {}) => createHealthReport({ level: 'L20', day: '2026-11-17', screened: 80, count: 18, source: 'Sump desk', review: 'unreviewed', note: '', ...overrides }, now);
const update = (overrides = {}) => createClinicUpdate({ clinicId: 'gardens', open: true, slots: 4, masks: 10, kits: 2, source: 'Garden desk', observedAt: now, ...overrides }, now);
const plan = (overrides = {}) => planAid({ levels: getScenarioLevels(), now, ...overrides });
const empty = { healthReports: [], clinicUpdates: [], aidRequests: [] };

test('health signals compare observed rates, preserve missing data, and separate review from detection', () => {
  const records = sampleHealthReports(now);
  const summary = summarizeHealth(records, now);
  assert.equal(summary.signals, 2);
  assert.equal(summary.unreviewed, 3);
  assert.equal(summary.rows.find(row => row.level === 'L20').status, 'Review increase');
  assert.equal(summary.rows.find(row => row.level === 'L01').status, 'No current tally');
  assert.equal(summarizeHealth([tally()], now).rows.at(-1).status, 'Need prior tally');
  const prior = tally({ day: '2026-11-16', count: 9, screened: 40 });
  assert.equal(summarizeHealth([prior, tally()], now).signals, 0, 'doubling the sample and count leaves the rate unchanged');
  const reviewed = tally({ review: 'reviewed', note: 'Counts reconciled with volunteer desk' });
  const reviewedSummary = summarizeHealth([reviewed, tally({ day: '2026-11-16', count: 4 })], now);
  assert.equal(reviewedSummary.signals, 1, 'review does not erase an increase or confirm disease');
  assert.equal(reviewedSummary.unreviewed, 0);
});

test('zero baselines, excluded records, future records and old tallies are handled explicitly', () => {
  const prior = tally({ day: '2026-11-16', count: 0 });
  assert.equal(summarizeHealth([prior, tally({ count: 5 })], now).signals, 1);
  assert.equal(summarizeHealth([prior, tally({ count: 4 })], now).signals, 0);
  assert.equal(summarizeHealth([prior, tally({ review: 'excluded', note: 'Duplicate census' })], now).rows.at(-1).status, 'No current tally');
  assert.equal(summarizeHealth([{ ...tally(), updatedAt: later }], now).rows.at(-1).status, 'No current tally');
  assert.equal(summarizeHealth([{ ...tally(), updatedAt: '2026-11-17T12:00:00.001Z' }], now).rows.at(-1).current.count, 18, 'a monotonic local edit remains visible within the one-second clock tolerance');
  assert.equal(summarizeHealth([prior], '2026-11-19T00:00:00.000Z').rows.at(-1).status, 'No current tally');
});

test('one reconciled daily tally survives repeated relay merges without inflating counts', () => {
  const original = tally(), corrected = { ...original, count: 12, updatedAt: later };
  const merged = mergeHealthReports([original], [corrected, corrected]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 12);
  assert.deepEqual(mergeHealthReports(merged, [original]), merged);
  const tied = { ...original, count: 10 };
  assert.deepEqual(mergeHealthReports([original], [tied]), mergeHealthReports([tied], [original]));
  for (const change of [{ id: 'health-fake' }, { count: -1 }, { count: 81 }, { count: 1.2 }, { screened: 5801 }, { day: '2026-02-30' }, { source: '' }, { review: 'confirmed' }, { review: 'reviewed', note: '' }, { updatedAt: 'now' }]) assert.throws(() => mergeHealthReports([], [{ ...original, ...change }]), TypeError);
  assert.throws(() => tally({ day: '2026-11-18' }), /future/);
  assert.throws(() => mergeHealthReports([], Array(201).fill(original)), TypeError);
});

test('care routing skips full clinics, honors group size, hazards, closures and access', () => {
  assert.equal(plan({ people: 4 }).clinic.id, 'market');
  assert.equal(plan({ people: 9 }).route.found, false);
  assert.equal(plan({ updates: [update()], people: 4 }).clinic.id, 'gardens');
  assert.equal(plan({ updates: [update()], people: 5 }).clinic.id, 'market');
  const blocked = { closedEdges: ['lower-shaft'], stepFree: true };
  assert.equal(plan(blocked).route.found, false);
  assert.equal(plan({ ...blocked, stepFree: false }).route.stepFree, false);
  assert.equal(plan({ origin: 'L20', updates: [update({ clinicId: 'sump', slots: 5 })] }).clinic.id, 'market', 'critical destination readings reject the closest clinic');
  const mobile = plan({ kind: 'mobile' });
  assert.equal(mobile.route.found, false);
  assert.match(mobile.route.reason, /volunteer team/);
});

test('supply routes use stock, and planning never consumes or reserves it', () => {
  const updates = [update({ slots: 0, masks: 2, kits: 0 })], before = JSON.stringify(updates);
  assert.equal(plan({ kind: 'masks', people: 2, updates }).clinic.id, 'gardens');
  assert.equal(plan({ kind: 'masks', people: 3, updates }).clinic.id, 'market');
  assert.equal(plan({ kind: 'kits', people: 17, updates }).route.found, false);
  createAidRequest(plan({ kind: 'masks', people: 3, updates }), now);
  assert.equal(JSON.stringify(updates), before);
});

test('clinic snapshots age out without falling back to the seeded availability', () => {
  const stale = update({ observedAt: '2026-11-17T05:59:59.000Z' });
  assert.equal(clinicSnapshots([stale], now).find(clinic => clinic.id === 'gardens').stale, true);
  assert.equal(plan({ updates: [stale] }).clinic.id, 'market');
  assert.equal(plan({ updates: [update({ open: false })] }).clinic.id, 'market');
  const boundary = update({ observedAt: '2026-11-17T06:00:00.000Z' });
  assert.equal(plan({ updates: [boundary] }).clinic.id, 'gardens');
  assert.equal(plan({ updates: [{ ...update(), observedAt: later, updatedAt: later }] }).clinic.id, 'market');
  for (const changes of [{ slots: 13 }, { kits: -1 }, { masks: 1.5 }, { clinicId: 'unknown' }, { open: 'yes' }, { source: '' }, { observedAt: later }]) assert.throws(() => update(changes), TypeError);
  assert.equal(mergeClinicUpdates([update()], [update()]).length, 1);
});

test('aid requests preserve planning context and merge status changes without duplicating the request', () => {
  const request = createAidRequest(plan({ scenario: 'blackout', minutes: 20, stepFree: true, closedEdges: ['lower-shaft'] }), now);
  assert.equal(request.clinicId, null);
  assert.deepEqual(request.context, { scenario: 'blackout', minutes: 20, stepFree: true, closedEdges: ['lower-shaft'] });
  assert.match(request.note, /Nothing dispatched/);
  const done = { ...request, status: 'completed', updatedAt: later };
  assert.deepEqual(mergeAidRequests([request], [done, done]), [done]);
  for (const change of [{ status: 'dispatched' }, { people: 0 }, { clinicId: 'fake' }, { context: {} }, { note: '' }]) assert.throws(() => mergeAidRequests([], [{ ...request, ...change }]), TypeError);
});

test('version 2 relay carries all health data, migrates version 1, and rejects invalid data atomically', () => {
  const health = { healthReports: [tally()], clinicUpdates: [update()], aidRequests: [createAidRequest(plan(), now)] };
  const encoded = serializePacket([], [], health);
  const decoded = parsePacket(encoded);
  assert.deepEqual(decoded, { checkIns: [], reports: [], ...health });
  assert.deepEqual(parsePacket(encoded, [], [], health), decoded);
  const legacy = JSON.stringify({ app: 'hollow-signal', version: 1, checkIns: [], reports: [] });
  assert.deepEqual(parsePacket(legacy), { checkIns: [], reports: [], ...empty });
  assert.deepEqual(parsePacket(legacy, [], [], health), decoded, 'old packets never erase new records');
  const before = JSON.stringify(health);
  const bad = JSON.parse(encoded); bad.clinicUpdates[0].slots = -1;
  assert.throws(() => parsePacket(JSON.stringify(bad), [], [], health), TypeError);
  assert.equal(JSON.stringify(health), before);
  const incomplete = JSON.parse(encoded); delete incomplete.aidRequests;
  assert.throws(() => parsePacket(JSON.stringify(incomplete)), /complete/);
});
