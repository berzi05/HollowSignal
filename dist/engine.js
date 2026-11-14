/** Hollow Signal's transparent simulation model. All readings and thresholds are fictional demo data. */
export const LEVELS = Object.freeze([
  { id: 'L01', name: 'The Atrium', depth: 45, population: 1200, power: 98, reserve: 240, air: 20.9, co2: 610, temp: 24.2, water: 97, vulnerable: 140 },
  { id: 'L04', name: 'Market Row', depth: 140, population: 1800, power: 92, reserve: 180, air: 20.6, co2: 780, temp: 26.1, water: 92, vulnerable: 270 },
  { id: 'L08', name: 'Root Gardens', depth: 280, population: 2400, power: 76, reserve: 110, air: 20.2, co2: 1100, temp: 28.4, water: 85, vulnerable: 480 },
  { id: 'L12', name: 'The Narrows', depth: 420, population: 3200, power: 63, reserve: 42, air: 19.8, co2: 1800, temp: 31.2, water: 74, vulnerable: 800 },
  { id: 'L16', name: 'Ember District', depth: 560, population: 4600, power: 49, reserve: 21, air: 19.3, co2: 2800, temp: 34.6, water: 68, vulnerable: 1380 },
  { id: 'L20', name: 'The Sump', depth: 700, population: 5800, power: 38, reserve: 10, air: 18.9, co2: 3900, temp: 35.8, water: 46, vulnerable: 2030 },
].map(Object.freeze));

const ids = new Set(LEVELS.map(level => level.id));
const round = value => Math.round(value * 1000) / 1000;
const finite = (value, label, min = 0, max = Infinity) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new TypeError(`${label} must be a finite number from ${min} to ${max}.`);
};

function validateLevel(level) {
  if (!level || typeof level !== 'object' || typeof level.id !== 'string' || !level.id || typeof level.name !== 'string') throw new TypeError('Invalid level.');
  finite(level.population, 'population', 1, 1e9);
  finite(level.vulnerable, 'vulnerable residents', 0, level.population);
  finite(level.power, 'power', 0, 100);
  finite(level.reserve, 'reserve', 0, 1e6);
  finite(level.air, 'oxygen', 0, 100);
  finite(level.co2, 'CO2', 0, 1e6);
  finite(level.temp, 'temperature', -100, 200);
  finite(level.water, 'water quality', 0, 100);
}

export function getScenarioLevels(scenario = 'baseline') {
  if (!['baseline', 'blackout', 'water', 'heat'].includes(scenario)) throw new TypeError('Unknown scenario.');
  return LEVELS.map(level => {
    const copy = { ...level };
    if (scenario === 'blackout' && level.depth >= 280) {
      copy.power = Math.max(0, level.power - 34);
      copy.reserve = Math.round(level.reserve * 0.65);
      copy.air = round(level.air - 0.3);
      copy.co2 += 700;
    }
    if (scenario === 'water' && level.depth >= 420) copy.water = Math.max(12, level.water - 35);
    if (scenario === 'heat' && level.depth >= 280) {
      copy.temp = round(level.temp + 4.5);
      copy.power = Math.max(0, level.power - 9);
    }
    return copy;
  });
}

export function assessLevel(level) {
  validateLevel(level);
  const warnings = [];
  const add = (type, severity, title, detail, action) => warnings.push({ type, severity, title, detail, action });
  const blackoutMinutes = level.power < 100 ? Math.round(level.reserve / (1 - level.power / 100)) : null;
  if (level.power < 70) add('power', level.power < 40 ? 'critical' : 'watch', level.power < 40 ? 'Blackout risk' : 'Power reserve falling', `${level.power}% supply coverage · about ${blackoutMinutes} min of reserve under this load model.`, 'Prioritize ventilation and clinic circuits; prepare neighborhood battery reserves.');
  if (level.air < 20 || level.co2 >= 1500) add('air', level.air < 19.5 || level.co2 >= 5000 ? 'critical' : 'watch', 'Air quality deteriorating', `${level.air}% oxygen · ${level.co2.toLocaleString('en-US')} ppm CO₂.`, 'Check ventilation and request an air-team assessment; locate a monitored refuge.');
  if (level.temp >= 30) add('heat', level.temp >= 34 ? 'critical' : 'watch', 'Heat accumulating', `${level.temp.toFixed(1)}°C at neighborhood sensors.`, 'Prioritize cooling for clinics and shared refuges; check on vulnerable residents.');
  if (level.water < 80) add('water', level.water < 60 ? 'critical' : 'watch', level.water < 60 ? 'Water quality alert' : 'Recycler needs inspection', `Water quality index ${level.water}/100; contamination type is unconfirmed.`, 'Isolate the flagged supply, request testing, and distribute verified clean water.');
  const critical = warnings.some(warning => warning.severity === 'critical');
  const severity = critical ? 'critical' : warnings.length ? 'watch' : 'stable';
  const score = Math.min(100, warnings.reduce((total, warning) => total + (warning.severity === 'critical' ? 30 : 13), 0));
  return { severity, score, warnings, blackoutMinutes };
}

export function getSummary(levels) {
  if (!Array.isArray(levels)) throw new TypeError('Levels must be an array.');
  const result = { population: 0, critical: 0, watch: 0, stable: 0, averagePower: 0, averageAir: 0, averageWater: 0, averageTemp: 0, atRiskPopulation: 0 };
  for (const level of levels) {
    const assessment = assessLevel(level);
    result.population += level.population;
    result[assessment.severity]++;
    if (assessment.severity !== 'stable') result.atRiskPopulation += level.population;
    result.averagePower += level.power * level.population;
    result.averageAir += level.air * level.population;
    result.averageWater += level.water * level.population;
    result.averageTemp += level.temp * level.population;
  }
  for (const key of ['averagePower', 'averageAir', 'averageWater', 'averageTemp']) result[key] = result.population ? round(result[key] / result.population) : 0;
  return result;
}

export const RESOURCE_RULES = Object.freeze({
  power: Object.freeze({ perPerson: 0.08, essentialFraction: 0.6, unit: 'kW', period: 'instantaneous capacity' }),
  water: Object.freeze({ perPerson: 3, essentialFraction: 2 / 3, unit: 'L', period: 'per day' }),
  food: Object.freeze({ perPerson: 1, essentialFraction: 0.7, unit: 'rations', period: 'per day' }),
});

/** Distribute integer milli-units, repeatedly capping full recipients, then apportion remainders. */
function distribute(amount, caps, weights) {
  const allocated = caps.map(() => 0);
  let remaining = Math.min(amount, caps.reduce((a, b) => a + b, 0));
  let active = caps.map((_, i) => i).filter(i => caps[i] > 0);
  while (remaining > 0 && active.length) {
    const totalWeight = active.reduce((sum, i) => sum + weights[i], 0);
    const full = active.filter(i => remaining * weights[i] / totalWeight >= caps[i] - allocated[i]);
    if (full.length) {
      for (const i of full) { const grant = caps[i] - allocated[i]; allocated[i] += grant; remaining -= grant; }
      active = active.filter(i => !full.includes(i));
      continue;
    }
    const shares = active.map(i => ({ i, exact: remaining * weights[i] / totalWeight }));
    for (const share of shares) { const grant = Math.floor(share.exact); allocated[share.i] += grant; remaining -= grant; }
    shares.sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.i - b.i);
    for (let j = 0; j < remaining; j++) allocated[shares[j].i]++;
    remaining = 0;
  }
  return allocated;
}

/** Fictional planning assumptions; never a substitute for infrastructure engineering. */
export function allocateResource(levels, supply, resource = 'power') {
  if (!Array.isArray(levels) || new Set(levels.map(level => level?.id)).size !== levels.length) throw new TypeError('Levels must be an array with unique IDs.');
  finite(supply, 'supply', 0, 1e10);
  if (!Object.hasOwn(RESOURCE_RULES, resource)) throw new TypeError('Unknown resource.');
  const rule = RESOURCE_RULES[resource];
  const rows = levels.map(level => {
    const assessment = assessLevel(level);
    const need = Math.round(level.population * rule.perPerson * 1000);
    return { level, need, essential: Math.round(need * rule.essentialFraction), weight: level.population * (1 + 1.5 * level.vulnerable / level.population + 0.5 * assessment.score / 100) };
  });
  const available = Math.floor(supply * 1000 + 1e-7);
  const essentialTotal = rows.reduce((sum, row) => sum + row.essential, 0);
  let grants;
  if (available < essentialTotal) grants = distribute(available, rows.map(row => row.essential), rows.map(row => row.essential));
  else {
    const extra = distribute(available - essentialTotal, rows.map(row => row.need - row.essential), rows.map(row => row.weight));
    grants = rows.map((row, i) => row.essential + extra[i]);
  }
  const used = grants.reduce((sum, value) => sum + value, 0) / 1000;
  return {
    allocations: rows.map((row, i) => ({ id: row.level.id, name: row.level.name, population: row.level.population, need: row.need / 1000, essential: row.essential / 1000, allocated: grants[i] / 1000, coverage: row.need ? round(grants[i] / row.need * 100) : 100 })),
    supply, used, unallocated: Math.max(0, supply - used), essentialShortfall: Math.max(0, essentialTotal - available) / 1000,
    resource, unit: rule.unit, period: rule.period,
  };
}

const CHECK_IN_LIMIT = 200;
const timestamp = value => {
  const date = new Date(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError('Check-in timestamp must be an ISO date.');
  return value;
};
function cleanText(value, label, max, required = false, multiline = false) {
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (typeof value !== 'string' || value.length > max || controls.test(value)) throw new TypeError(`${label} must contain at most ${max} printable characters.`);
  const text = value.trim();
  if (required && !text) throw new TypeError(`${label} is required.`);
  return text;
}
function validateCheckIn(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(record.id)) throw new TypeError('Invalid check-in ID.');
  if (!ids.has(record.level)) throw new TypeError('Unknown check-in level.');
  if (!['safe', 'help', 'moving'].includes(record.status)) throw new TypeError('Unknown check-in status.');
  return { id: record.id, alias: cleanText(record.alias, 'Alias', 40, true), level: record.level, status: record.status, note: cleanText(record.note ?? '', 'Note', 180, false, true), updatedAt: timestamp(record.updatedAt) };
}

export function createCheckIn({ alias, level, status, note = '' } = {}, now = new Date().toISOString()) {
  const updatedAt = now instanceof Date ? now.toISOString() : now;
  return validateCheckIn({ id: globalThis.crypto.randomUUID(), alias, level, status, note, updatedAt });
}

/** Validated, bounded last-write-wins by record ID. Equal timestamps use canonical lexical order. */
export function mergeCheckIns(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming) || existing.length > CHECK_IN_LIMIT || incoming.length > CHECK_IN_LIMIT) throw new TypeError(`Import at most ${CHECK_IN_LIMIT} check-ins at a time.`);
  const records = new Map();
  for (const candidate of [...existing, ...incoming]) {
    const record = validateCheckIn(candidate);
    const previous = records.get(record.id);
    if (!previous || record.updatedAt > previous.updatedAt || (record.updatedAt === previous.updatedAt && JSON.stringify(record) > JSON.stringify(previous))) records.set(record.id, record);
  }
  return [...records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, CHECK_IN_LIMIT);
}
