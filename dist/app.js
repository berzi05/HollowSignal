import { LEVELS, RESOURCE_RULES, getScenarioLevels, assessLevel, getSummary, allocateResource, createCheckIn, mergeCheckIns } from './engine.js';
import { createReport, mergeReports, parsePacket, serializePacket } from './relay.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const numberFormats = new Map();
const fmt = (n, digits = 0) => {
  let format = numberFormats.get(digits);
  if (!format) numberFormats.set(digits, format = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }));
  return format.format(Number(n));
};
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const storageKey = 'hollow-signal-v1';
// Must match REVISION in sw.js (enforced by test/sw.test.js).
const CACHE_REVISION = 'v3';
const DEFAULTS = Object.freeze({ scenario: 'baseline', selected: 'L20', resource: 'power' });
const state = { ...DEFAULTS, supply: 1140, checkIns: [], reports: [] };
const VIEWS = {
  overview: { heading: 'Keep the Hollow alive', description: 'Every level matters. See the risks. Share what we have. Stay connected.', crumb: 'OVERVIEW', title: 'Overview' },
  resources: { heading: 'Enough to keep going', description: 'A transparent plan for sharing power, water, and food across every level.', crumb: 'RESOURCE ALLOCATION', title: 'Resource allocation' },
  community: { heading: 'Let them know you’re here', description: 'A neighborhood relay for the moments when connection matters most.', crumb: 'COMMUNITY RELAY', title: 'Community relay' }
};
let levels = getScenarioLevels();
let plan;
let toastTimer;
let offlineReady = false;
let currentView;
const scenarioNotes = {
  baseline: '',
  blackout: 'Geothermal outage simulated: power coverage drops 34 points from L08 down. Ventilation weakens and battery reserves shrink. Review the deepest levels first.',
  water: 'Recycler contamination simulated: water quality falls 35 points from L12 down. Isolate affected supplies and compare the clean-water allocation.',
  heat: 'Cooling failure simulated: temperatures rise 4.5°C from L08 down and power coverage falls 9 points. Prioritize cooling and monitored refuge spaces.'
};

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5500);
}
/**
 * Replace local records and persist them. Serialization runs first, so an oversized
 * state throws before anything changes. Storage failure keeps the in-memory state.
 */
function commit(checkIns, reports) {
  const text = serializePacket(checkIns, reports);
  state.checkIns = checkIns;
  state.reports = reports;
  try { localStorage.setItem(storageKey, text); return true; }
  catch { toast('Browser storage is unavailable. Export a relay packet to keep your records.'); return false; }
}
function restore() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) Object.assign(state, parsePacket(raw));
  } catch { toast('Saved records could not be read. The app is running with an empty local relay.'); }
}
function levelOptions() {
  const options = LEVELS.map(l => `<option value="${l.id}">${l.id} · ${l.name}</option>`).join('');
  $('#checkin-level').innerHTML = options;
  $('#report-level').innerHTML = options;
  $('#checkin-level').value = 'L12';
  $('#report-level').value = state.selected;
}
function showView() {
  // Non-view hashes (e.g. the #main skip link) keep the current view instead of resetting it.
  const requested = location.hash.slice(1);
  const view = Object.hasOwn(VIEWS, requested) ? requested : currentView ?? 'overview';
  const meta = VIEWS[view];
  $$('.view').forEach(el => { el.hidden = el.id !== `view-${view}`; });
  $$('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
    if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  $('#page-title').innerHTML = `${meta.heading}<span>.</span>`;
  $('#page-description').textContent = meta.description;
  $('#breadcrumb-view').textContent = meta.crumb;
  document.title = `${meta.title} — Hollow Signal`;
  // Links near the bottom of one view should not open the next view mid-page.
  if (currentView && currentView !== view) window.scrollTo(0, 0);
  currentView = view;
}
function renderMetrics() {
  const s = getSummary(levels);
  const metrics = [
    { label: 'Residents in our care', icon: '◎', value: fmt(s.population), unit: '', foot: '<em>6 neighborhoods</em> connected', status: '' },
    { label: 'Power supply coverage', icon: 'ϟ', value: fmt(s.averagePower), unit: '%', foot: '<em>↓ Below demand</em> sector average', status: 'warning' },
    { label: 'Levels needing attention', icon: '△', value: s.critical + s.watch, unit: '/ 6', foot: `<em>${s.critical} critical</em> · ${s.watch} on watch`, status: 'critical' },
    { label: 'Average temperature', icon: '♨', value: s.averageTemp.toFixed(1), unit: '°C', foot: `<em>${levels.filter(l => l.temp >= 34).length} levels above 34°C</em>`, status: 'warning' }
  ];
  $('#metrics').innerHTML = metrics.map(m => `<article class="metric ${m.status}"><div class="metric-label">${m.label}<span aria-hidden="true">${m.icon}</span></div><div class="metric-value">${m.value}<small>${m.unit}</small></div><div class="metric-foot">${m.foot}</div></article>`).join('');
}
function renderMap() {
  $('#level-map').innerHTML = levels.map(l => {
    const risk = assessLevel(l);
    return `<button class="level-row ${risk.severity} ${state.selected === l.id ? 'selected' : ''}" data-level="${l.id}" aria-pressed="${state.selected === l.id}" aria-label="Inspect ${l.id}, ${l.name}, ${risk.severity}"><span class="depth">−${l.depth}m</span><span class="shaft" aria-hidden="true"></span><span class="level-segment"><span class="level-id">${l.id}</span><span class="level-name">${l.name}</span><span class="level-power" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(l.power / 10) ? 'on' : ''}"></i>`).join('')}</span><span class="level-status">${risk.severity}</span><span class="level-arrow" aria-hidden="true">↗</span></span></button>`;
  }).join('');
}
function selectLevel(id) {
  state.selected = id;
  renderMap();
  renderDetail();
}
function renderAlerts() {
  const priorities = { power: 0, water: 1, air: 2, heat: 3 };
  const warnings = levels.flatMap(l => assessLevel(l).warnings.map(w => ({ ...w, level: l })));
  warnings.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1) || priorities[a.type] - priorities[b.type] || b.level.depth - a.level.depth);
  // Show one of each hazard, so cascading failures remain visible.
  const chosen = [...new Set(warnings.map(w => w.type))].map(type => warnings.find(w => w.type === type)).slice(0, 3);
  $('#alert-count').textContent = warnings.length;
  $('#alert-count').setAttribute('aria-label', `${warnings.length} warnings across all levels; showing ${chosen.length} priority signal${chosen.length === 1 ? '' : 's'}`);
  const icons = { power: 'ϟ', air: '≈', water: '◈', heat: '♨' };
  $('#alerts').innerHTML = chosen.map(w => `<article class="alert ${w.severity}"><span class="alert-icon" aria-hidden="true">${icons[w.type]}</span><div><div class="alert-title"><h3>${w.title}</h3><span class="alert-level">${w.level.id}</span></div><p>${esc(w.detail)}</p><button class="alert-action" data-inspect="${w.level.id}">Inspect level & response <span>→</span></button></div></article>`).join('');
}
function renderDetail() {
  const l = levels.find(l => l.id === state.selected);
  const r = assessLevel(l);
  const reserve = r.blackoutMinutes === null ? 'No reserve draw at full supply' : `${fmt(r.blackoutMinutes)} min modeled reserve`;
  const stats = [['POWER COVERAGE', `${l.power}%`, reserve], ['OXYGEN', `${l.air.toFixed(1)}%`, `${fmt(l.co2)} ppm CO₂`], ['TEMPERATURE', `${l.temp.toFixed(1)}°C`, l.temp >= 34 ? 'Critical heat signal' : 'Neighborhood sensor'], ['WATER INDEX', `${l.water}<small> / 100</small>`, l.water < 60 ? 'Testing required' : 'Synthetic sensor index']];
  $('#level-detail').innerHTML = `<div><div class="eyebrow muted">SELECTED NEIGHBORHOOD · ${l.id}</div><div class="detail-title"><h2>${l.name}</h2><span class="status-tag ${r.severity}">${r.severity}</span></div><p>${fmt(l.population)} residents · ${l.depth} m below surface</p></div><div class="detail-stats">${stats.map(s => `<div class="detail-stat"><span>${s[0]}</span><b>${s[1]}</b><p>${s[2]}</p></div>`).join('')}</div><div class="detail-actions"><strong>COMMUNITY RESPONSE</strong> &nbsp; ${r.warnings.length ? r.warnings.map(w => esc(w.action)).join(' ') : 'Keep monitoring local sensors and check that shared reserves are accessible.'}</div>`;
}
function configureResource() {
  const rule = RESOURCE_RULES[state.resource];
  const demand = levels.reduce((sum, l) => sum + l.population * rule.perPerson, 0);
  const max = Math.ceil(demand * 1.15 / 10) * 10;
  $('#supply').max = max;
  $('#supply').step = state.resource === 'power' ? 10 : 100;
  state.supply = Math.round(demand * 0.75 / Number($('#supply').step)) * Number($('#supply').step);
  $('#supply').value = state.supply;
}
function renderAllocation() {
  plan = allocateResource(levels, state.supply, state.resource);
  const totalNeed = plan.allocations.reduce((sum, a) => sum + a.need, 0);
  const unit = RESOURCE_RULES[state.resource].unit;
  $('#supply-label').textContent = `${fmt(state.supply)} ${unit}`;
  $('#allocation-summary').innerHTML = `<div class="plan-stat"><span>AVAILABLE SUPPLY</span><b>${fmt(state.supply)}<small>${unit}</small></b></div><div class="plan-stat"><span>ALLOCATED TO RESIDENTS</span><b>${fmt(plan.used, 1)}<small>${unit}</small></b></div><div class="plan-stat"><span>SECTOR DEMAND COVERED</span><b>${fmt(plan.used / totalNeed * 100, 1)}<small>%</small></b></div>${plan.essentialShortfall > 0 ? `<p class="plan-warning">Essential needs are short by ${fmt(plan.essentialShortfall, 1)} ${unit}. Every level receives the same proportion of its essential requirement.</p>` : `<p class="plan-warning ok">Essential shares covered. ${plan.unallocated > 0 ? `${fmt(plan.unallocated, 1)} ${unit} remain after all modeled demand is met.` : 'Remaining supply follows vulnerability and current hazard scores.'}</p>`}`;
  $('#allocation-rows').innerHTML = plan.allocations.map(a => `<tr><td><b>${a.id} · ${a.name}</b><span>${fmt(levels.find(l => l.id === a.id).vulnerable)} vulnerable residents</span></td><td>${fmt(a.population)}</td><td>${fmt(a.essential, 1)} ${unit}</td><td>${fmt(a.allocated, 1)} ${unit}</td><td><div class="coverage"><div class="coverage-track"><i style="width:${a.coverage}%"></i></div><span>${fmt(a.coverage, 1)}%</span></div></td></tr>`).join('');
  const rule = RESOURCE_RULES[state.resource];
  $('#allocation-method').textContent = `Planning assumptions: ${rule.perPerson} ${unit} per resident, ${rule.period}. Essential share: ${fmt(rule.essentialFraction * 100, 1)}% of demand. Remaining-supply weight = population × (1 + 1.5 × vulnerable fraction + 0.5 × risk score / 100). Each level is capped at its modeled demand. Demo policy; residents must review real-world needs.`;
}
function timeLabel(iso) {
  return dateFormat.format(new Date(iso));
}
// Split by code point so an emoji call sign never renders half a surrogate pair.
const initials = alias => [...alias].slice(0, 2).join('').toUpperCase();
function renderCheckIns() {
  const term = $('#checkin-search').value.trim().toLowerCase();
  const records = state.checkIns.filter(c => c.alias.toLowerCase().includes(term));
  $('#checkin-count').textContent = state.checkIns.length;
  const statuses = { safe: '● Safe', help: '＋ Needs help', moving: '↗ Moving' };
  $('#checkin-list').innerHTML = records.length ? records.map(c => `<article class="checkin"><div class="avatar ${c.status}" aria-hidden="true">${esc(initials(c.alias))}</div><div class="checkin-body"><div class="checkin-name"><b>${esc(c.alias)}</b><span class="${c.status}">${statuses[c.status]}</span></div><small>${c.level} · ${esc(timeLabel(c.updatedAt))} · local copy</small>${c.note ? `<p>${esc(c.note)}</p>` : ''}</div></article>`).join('') : `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><h3>${term ? 'No matching call signs' : 'The first signal starts with you.'}</h3><p>${term ? 'Try another call sign or import a relay packet from a neighbor.' : 'Save a check-in or import a neighbor’s relay packet. Every signal stays available on this device.'}</p></div>`;
}
function renderReports() {
  const records = state.reports.slice(0, 3);
  $('#report-list').innerHTML = records.length ? records.map(r => `<div class="field-report"><span class="report-dot" aria-hidden="true"></span><div><p>${esc(r.detail)}</p><small>${r.level} · ${esc(r.type)} · ${esc(timeLabel(r.updatedAt))} · unverified</small></div></div>`).join('') : `<div class="field-empty"><p>No local reports yet. What you notice in your tunnel could help the next neighborhood.</p><button class="alert-action" id="first-report">Add a field report →</button></div>`;
}
function renderSituation() { renderMetrics(); renderMap(); renderAlerts(); renderDetail(); renderAllocation(); }
function download(name, contents) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openReport() { $('#report-level').value = state.selected; $('#report-dialog').showModal(); }
function updateConnection() {
  $('#offline-status').textContent = offlineReady ? (navigator.onLine ? 'Offline cache ready' : 'Offline · cache ready') : (navigator.onLine ? 'Local relay available' : 'Offline · cache unverified');
}

restore(); levelOptions(); configureResource(); renderSituation(); renderCheckIns(); renderReports(); showView();
window.addEventListener('hashchange', showView);
// Delegated handlers survive re-rendering, so renders never re-attach listeners.
$('#level-map').addEventListener('click', event => {
  const button = event.target.closest('[data-level]');
  if (button) selectLevel(button.dataset.level);
});
$('#alerts').addEventListener('click', event => {
  const button = event.target.closest('[data-inspect]');
  if (!button) return;
  selectLevel(button.dataset.inspect);
  $('#level-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('#report-list').addEventListener('click', event => { if (event.target.closest('#first-report')) openReport(); });
$('#scenario').addEventListener('change', event => {
  state.scenario = event.target.value; levels = getScenarioLevels(state.scenario);
  $('#scenario-note').textContent = scenarioNotes[state.scenario];
  $('#scenario-note').hidden = state.scenario === 'baseline';
  renderSituation();
  toast(state.scenario === 'baseline' ? 'Current conditions restored.' : 'Simulation applied. Signals and resource priorities updated.');
});
$('#resource').addEventListener('change', event => { state.resource = event.target.value; configureResource(); renderAllocation(); });
$('#supply').addEventListener('input', event => { state.supply = Number(event.target.value); renderAllocation(); });
$('#export-plan').addEventListener('click', () => { download(`hollow-plan-${state.resource}.json`, JSON.stringify({ app: 'hollow-signal', type: 'allocation-plan', scenario: state.scenario, exportedAt: new Date().toISOString(), ...plan }, null, 2)); toast('Allocation plan exported with assumptions and coverage.'); });
$('#checkin-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const record = createCheckIn(input);
    // Subsequent check-ins under this local call sign update the same signal.
    const previous = state.checkIns.find(c => c.alias.toLowerCase() === record.alias.toLowerCase());
    if (previous) {
      if (previous.updatedAt > record.updatedAt) throw new Error('This call sign has a newer timestamp from another device. Check your clock or use a different call sign.');
      record.id = previous.id;
      if (previous.updatedAt === record.updatedAt) record.updatedAt = new Date(Date.parse(record.updatedAt) + 1).toISOString();
    }
    const persisted = commit(mergeCheckIns(state.checkIns, [record]), state.reports);
    renderCheckIns();
    $('#checkin-note').value = '';
    if (persisted) toast('Check-in saved on this device. Export a relay packet to share it.');
  } catch (error) { toast(error.message); }
});
$('#checkin-search').addEventListener('input', renderCheckIns);
$('#report-button').addEventListener('click', openReport);
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());
$$('.close-dialog').forEach(el => el.addEventListener('click', () => el.closest('dialog').close()));
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
$('#report-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const record = createReport(Object.fromEntries(new FormData(event.currentTarget)));
    const persisted = commit(state.checkIns, mergeReports(state.reports, [record]));
    renderReports(); $('#report-dialog').close(); $('#report-detail').value = '';
    if (persisted) toast('Unverified field report saved locally. Include it in your next relay packet.');
  } catch (error) { toast(error.message); }
});
$('#export-relay').addEventListener('click', () => {
  try { download('hollow-relay.json', serializePacket(state.checkIns, state.reports)); toast('Relay packet exported. Share the file with a trusted neighbor.'); }
  catch (error) { toast(`Export failed: ${error.message}`); }
});
$('#import-relay').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 262144) throw new Error('Relay packets must be smaller than 256 KiB.');
    const next = parsePacket(await file.text(), state.checkIns, state.reports);
    const persisted = commit(next.checkIns, next.reports);
    renderCheckIns(); renderReports();
    if (persisted) toast(`Packet merged. ${state.checkIns.length} check-ins and ${state.reports.length} reports now stored locally.`);
  } catch (error) { toast(`Import rejected: ${error.message}`); }
  finally { event.target.value = ''; }
});
$('#reset-button').addEventListener('click', () => {
  if (!window.confirm('Clear all local check-ins and reports, and restore current conditions? Export a relay packet first if you want to keep them.')) return;
  Object.assign(state, DEFAULTS);
  levels = getScenarioLevels(state.scenario); $('#scenario').value = state.scenario; $('#resource').value = state.resource; $('#scenario-note').hidden = true; $('#checkin-search').value = '';
  const persisted = commit([], []); configureResource(); renderSituation(); renderCheckIns(); renderReports();
  if (persisted) toast('Demo reset. Local records cleared.');
});
function confirmOfflineCache(worker) {
  return new Promise(resolve => {
    if (!worker) return resolve(false);
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 2000);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer); channel.port1.close();
      resolve(data?.type === 'HOLLOW_CACHE_STATUS' && data.revision === CACHE_REVISION && data.ready === true);
    };
    worker.postMessage({ type: 'HOLLOW_CACHE_STATUS' }, [channel.port2]);
  });
}
async function refreshOfflineStatus() {
  if ('serviceWorker' in navigator) offlineReady = await confirmOfflineCache(navigator.serviceWorker.controller);
  updateConnection();
}
window.addEventListener('online', refreshOfflineStatus); window.addEventListener('offline', refreshOfflineStatus);
window.addEventListener('focus', refreshOfflineStatus);
updateConnection();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.addEventListener('controllerchange', refreshOfflineStatus);
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(async registration => {
    offlineReady = await confirmOfflineCache(registration.active);
    updateConnection();
  }).catch(() => { offlineReady = false; updateConnection(); });
}
