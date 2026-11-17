/** Manual, unauthenticated demo relay. Import validates all records before returning any changes. */
import { LEVELS, mergeCheckIns, mergeRecords, validateRecordId, validateTimestamp } from './engine.js';
import { mergeHealthReports, mergeClinicUpdates, mergeAidRequests } from './health.js';

const MAX_PACKET_BYTES = 256 * 1024;
const LEVEL_IDS = new Set(LEVELS.map(level => level.id));
const REPORT_TYPES = new Set(['water', 'power', 'air', 'heat', 'tunnel']);
const encoder = new TextEncoder();

function validateReport(record) {
  validateRecordId(record, 'report');
  if (!LEVEL_IDS.has(record.level)) throw new TypeError('Unknown report level.');
  if (!REPORT_TYPES.has(record.type)) throw new TypeError('Unknown report type.');
  if (typeof record.detail !== 'string' || record.detail.length > 240) throw new TypeError('Report details must contain 1–240 characters.');
  const detail = record.detail.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/gu, '').trim();
  if (!detail) throw new TypeError('Report details are required.');
  return { id: record.id, level: record.level, type: record.type, detail, updatedAt: validateTimestamp(record.updatedAt, 'Report timestamp') };
}

export function createReport({ level, type, detail } = {}, now = new Date().toISOString()) {
  return validateReport({ id: globalThis.crypto.randomUUID(), level, type, detail, updatedAt: now instanceof Date ? now.toISOString() : now });
}

/** Same last-write-wins and stable tie-break rule as check-ins, with a bounded newest-first result. */
export function mergeReports(existing, incoming) {
  return mergeRecords(existing, incoming, validateReport, 'reports');
}

export function parsePacket(text, existingCheckIns = [], existingReports = [], existingHealth = {}) {
  if (typeof text !== 'string' || encoder.encode(text).byteLength > MAX_PACKET_BYTES) throw new TypeError('Relay packets must be text no larger than 256 KiB.');
  let packet;
  try { packet = JSON.parse(text); } catch { throw new TypeError('This is not a valid JSON relay packet.'); }
  const healthKeys = ['healthReports', 'clinicUpdates', 'aidRequests'];
  const allowedKeys = new Set(['app', 'version', 'checkIns', 'reports', 'exportedAt', ...(packet?.version === 2 ? healthKeys : [])]);
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) || packet.app !== 'hollow-signal' || ![1, 2].includes(packet.version) || !Array.isArray(packet.checkIns) || !Array.isArray(packet.reports) || Object.keys(packet).some(key => !allowedKeys.has(key)) || (packet.version === 2 && healthKeys.some(key => !Array.isArray(packet[key])))) throw new TypeError('Expected a complete Hollow Signal version 1 or 2 relay packet.');
  if (Object.hasOwn(packet, 'exportedAt')) validateTimestamp(packet.exportedAt, 'Packet export time');
  // Both operations are pure; if either fails, the caller receives no partial result.
  const checkIns = mergeCheckIns(existingCheckIns, packet.checkIns);
  const reports = mergeReports(existingReports, packet.reports);
  // A valid input can exceed the limit after merging with existing records.
  // Reject before returning a state that cannot be persisted or exported.
  const health = {
    healthReports: mergeHealthReports(existingHealth.healthReports ?? [], packet.healthReports ?? []),
    clinicUpdates: mergeClinicUpdates(existingHealth.clinicUpdates ?? [], packet.clinicUpdates ?? []),
    aidRequests: mergeAidRequests(existingHealth.aidRequests ?? [], packet.aidRequests ?? []),
  };
  serializePacket(checkIns, reports, health);
  return { checkIns, reports, ...health };
}

export function serializePacket(checkIns, reports, health = {}) {
  const packet = {
    app: 'hollow-signal', version: 2, exportedAt: new Date().toISOString(),
    checkIns: mergeCheckIns([], checkIns), reports: mergeReports([], reports),
    healthReports: mergeHealthReports([], health.healthReports ?? []),
    clinicUpdates: mergeClinicUpdates([], health.clinicUpdates ?? []),
    aidRequests: mergeAidRequests([], health.aidRequests ?? []),
  };
  const text = JSON.stringify(packet, null, 2);
  if (encoder.encode(text).byteLength > MAX_PACKET_BYTES) throw new TypeError('Relay packet exceeds the 256 KiB limit.');
  return text;
}
