import test from 'node:test';
import assert from 'node:assert/strict';
import { createReport, mergeReports, parsePacket, serializePacket } from '../dist/relay.js';

const time = '2026-11-14T12:00:00.000Z';
const report = overrides => ({ id: 'report-0001', level: 'L12', type: 'water', detail: 'The tap is discolored', updatedAt: time, ...overrides });
const checkIn = overrides => ({ id: 'checkin-0001', alias: 'Lantern', level: 'L12', status: 'safe', note: 'At refuge', updatedAt: time, ...overrides });
const packet = overrides => JSON.stringify({ app: 'hollow-signal', version: 1, checkIns: [], reports: [], ...overrides });

test('report creation validates fields and preserves readable multiline details', () => {
  const created = createReport({ level: 'L12', type: 'tunnel', detail: '  Tunnel flooded.\r\n\u0000Use passage B.  ' }, new Date(time));
  assert.equal(created.detail, 'Tunnel flooded.\nUse passage B.');
  assert.equal(created.updatedAt, time);
  assert.ok(created.id.length >= 8);
  for (const change of [{ detail: '' }, { detail: '\u0000\u0001' }, { detail: 'a'.repeat(241) }, { detail: {} }, { type: '__proto__' }, { level: 'L99' }, { updatedAt: 'yesterday' }, { id: '<script>' }]) assert.throws(() => mergeReports([], [report(change)]), TypeError);
  assert.throws(() => createReport({ level: 'L12', type: 'water', detail: 'testing' }, '2026-02-30T12:00:00.000Z'), TypeError);
});

test('report merge is idempotent, newest-first, and order-independent for conflicts', () => {
  const old = report();
  const recent = report({ detail: 'Recycler isolated', updatedAt: '2026-11-14T13:00:00.000Z' });
  assert.deepEqual(mergeReports([old], [recent, recent]), [recent]);
  assert.deepEqual(mergeReports([recent], [old]), [recent]);
  const tied = report({ detail: 'Updated report' });
  assert.deepEqual(mergeReports([old], [tied]), mergeReports([tied], [old]));
  assert.equal(mergeReports([], [report({ injected: '<script>' })])[0].injected, undefined);
});

test('reports are bounded and imports reject oversized arrays', () => {
  const existing = Array.from({ length: 200 }, (_, i) => report({ id: `report-old-${i}` }));
  const incoming = Array.from({ length: 200 }, (_, i) => report({ id: `report-new-${i}`, updatedAt: '2026-11-14T13:00:00.000Z' }));
  const merged = mergeReports(existing, incoming);
  assert.equal(merged.length, 200);
  assert.ok(merged.every(item => item.id.startsWith('report-new-')));
  assert.throws(() => mergeReports([], [...existing, report()]), TypeError);
  assert.throws(() => mergeReports({}, []), TypeError);
});

test('relay export round-trips both record kinds and deduplicates repeated imports', () => {
  const text = serializePacket([checkIn()], [report()]);
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, 'hollow-signal');
  assert.equal(parsed.version, 2);
  assert.ok(parsed.exportedAt.endsWith('Z'));
  assert.ok(text.includes('\n  "app"'));
  assert.deepEqual(parsePacket(text), { checkIns: [checkIn()], reports: [report()], healthReports: [], clinicUpdates: [], aidRequests: [] });
  assert.deepEqual(parsePacket(text, [checkIn()], [report()]), parsePacket(text));
});

test('packet validation rejects corruption, wrong schema, wrong version and unknown fields', () => {
  for (const text of ['{broken', 'null', '[]', packet({ app: 'other' }), packet({ version: 2 }), packet({ checkIns: {} }), packet({ reports: null }), packet({ unexpected: true }), packet({ exportedAt: 'bad time' })]) assert.throws(() => parsePacket(text), TypeError);
  assert.throws(() => parsePacket(null), TypeError);
});

test('packet size is measured as UTF-8 bytes rather than JS string length', () => {
  assert.throws(() => parsePacket(' '.repeat(256 * 1024 + 1)), /256 KiB/);
  const multibyte = packet({ unexpected: '☀'.repeat(90000) });
  assert.ok(multibyte.length < 256 * 1024);
  assert.throws(() => parsePacket(multibyte), /256 KiB/);
});

test('a malformed report rejects an entire import without mutating existing data', () => {
  const existingCheckIns = [checkIn()];
  const existingReports = [report()];
  const before = JSON.stringify({ existingCheckIns, existingReports });
  const text = packet({ checkIns: [checkIn({ id: 'checkin-0002', alias: 'New resident' })], reports: [report({ type: 'bad-type' })] });
  assert.throws(() => parsePacket(text, existingCheckIns, existingReports), TypeError);
  assert.equal(JSON.stringify({ existingCheckIns, existingReports }), before);
  assert.throws(() => parsePacket(packet({ checkIns: [checkIn({ status: 'unknown' })], reports: [report()] })), TypeError);
});

test('individually valid packets cannot merge into an unexportable oversized state', () => {
  const checkIns = Array.from({ length: 200 }, (_, i) => checkIn({ id: `checkin-${String(i).padStart(4, '0')}`, alias: '漢'.repeat(40), note: '漢'.repeat(180) }));
  const reports = Array.from({ length: 200 }, (_, i) => report({ id: `report-${String(i).padStart(4, '0')}`, detail: '漢'.repeat(240) }));
  const first = serializePacket(checkIns, []);
  const second = serializePacket([], reports);
  assert.equal(parsePacket(first).checkIns.length, 200);
  assert.equal(parsePacket(second).reports.length, 200);
  const before = JSON.stringify(checkIns);
  assert.throws(() => parsePacket(second, checkIns, []), /256 KiB/);
  assert.equal(JSON.stringify(checkIns), before);
});

test('untrusted markup remains inert string data for the UI to escape', () => {
  const detail = '<img src=x onerror=alert(1)>\n<script>attack()</script>';
  const text = serializePacket([checkIn({ alias: '<b>Lantern</b>', note: '<script>attack()</script>' })], [report({ detail })]);
  const imported = parsePacket(text);
  assert.equal(imported.reports[0].detail, detail);
  assert.equal(imported.checkIns[0].alias, '<b>Lantern</b>');
});
