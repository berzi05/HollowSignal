import { LEVELS } from './engine.js';
import { CLINICS, AID_KINDS, UPDATE_CLOCK_SKEW, createHealthReport, mergeHealthReports, summarizeHealth, sampleHealthReports, createClinicUpdate, mergeClinicUpdates, clinicSnapshots, planAid, createAidRequest, mergeAidRequests } from './health.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rate = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const stamp = () => new Date().toISOString();

export function initHealthAid({ getRecords, getSituation, onSave, toast, download }) {
  let origin = 'L20';
  const options = LEVELS.map(level => `<option value="${level.id}">${level.id} · ${esc(level.name)}</option>`).join('');
  $('#health-level').innerHTML = options;
  $('#aid-origin').innerHTML = options;
  $('#clinic-id').innerHTML = CLINICS.map(clinic => `<option value="${clinic.id}">${clinic.level} · ${esc(clinic.name)}</option>`).join('');
  $('#aid-kind').innerHTML = Object.entries(AID_KINDS).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');

  function focusSection(id) {
    if (!['health-signals', 'health-clinics', 'health-aid'].includes(id)) return;
    $('#' + id).scrollIntoView({ block: 'start' });
    $('#' + id).focus({ preventScroll: true });
  }
  function loadTally() {
    const current = getRecords().healthReports.find(row => row.level === $('#health-level').value && row.day === $('#health-day').value);
    $('#health-screened').value = current?.screened ?? '';
    $('#health-count').value = current?.count ?? '';
    $('#health-source').value = current?.source ?? '';
    $('#health-review').value = current?.review ?? 'unreviewed';
    $('#health-note').value = current?.note ?? '';
    $('#health-save').textContent = current ? 'Update this daily tally' : 'Save daily tally';
  }
  function loadClinic() {
    const clinic = clinicSnapshots(getRecords().clinicUpdates).find(item => item.id === $('#clinic-id').value);
    $('#clinic-open').checked = clinic.open;
    $('#clinic-slots').max = clinic.capacity;
    $('#clinic-slots').value = clinic.slots;
    $('#clinic-masks').value = clinic.masks;
    $('#clinic-kits').value = clinic.kits;
    $('#clinic-source').value = clinic.source ?? '';
    $('#clinic-time').value = (clinic.observedAt ?? stamp()).slice(0, 16);
  }
  function requestPlan() {
    const situation = getSituation();
    return planAid({ levels: situation.levels, updates: getRecords().clinicUpdates, origin,
      people: Number($('#aid-people').value), kind: $('#aid-kind').value,
      stepFree: $('#aid-step-free').checked, closedEdges: situation.closedEdges, scenario: situation.scenario, minutes: situation.minutes });
  }
  function renderAid() {
    const situation = getSituation();
    $('#aid-context').textContent = `Shared crisis planner: ${situation.scenario} · T + ${situation.minutes} min · lower shaft ${situation.closedEdges.includes('lower-shaft') ? 'closed' : 'open'}.`;
    try {
      const plan = requestPlan(), { route, clinic } = plan;
      $('#aid-save').disabled = false;
      $('#aid-result').innerHTML = route.found
        ? `<span class="eyebrow muted">CANDIDATE CARE / SUPPLY DESTINATION</span><h3>${esc(clinic.name)}</h3><p class="aid-path">${route.path.join(' → ')} <b>· ${route.minutes} min</b></p><p>${route.stepFree ? 'Step-free candidate' : 'Includes stairs'} · ${clinic.slots} care places · ${clinic.masks} masks · ${clinic.kits} kits</p><p>${clinic.simulated ? 'Fictional clinic snapshot' : 'Community snapshot · ' + esc(clinic.observedAt)}. Nothing reserved.</p>${route.criticalLevels.length ? `<p class="route-warning">Critical readings along the path: ${route.criticalLevels.join(', ')}. Local route review required.</p>` : ''}${route.exceedsReserve ? '<p class="route-warning">Travel exceeds the origin’s modeled reserve. Request assistance before planning movement.</p>' : ''}`
        : `<h3>Local assistance needed</h3><p>${esc(route.reason)}</p>`;
      $('#aid-save').textContent = route.found ? 'Save aid request & proposed route' : 'Save local assistance request';
    } catch (error) {
      $('#aid-save').disabled = true;
      $('#aid-result').innerHTML = `<p>${esc(error.message)}</p>`;
    }
  }
  function render() {
    const records = getRecords(), summary = summarizeHealth(records.healthReports);
    $('#health-day').max = summary.today;
    $('#health-window').textContent = `UTC days: ${summary.yesterday} → ${summary.today}. Today’s tally may still be incomplete.`;
    $('#health-signal-count').textContent = summary.signals;
    $('#health-review-count').textContent = summary.unreviewed;
    $('#health-overview').textContent = summary.signals
      ? `${summary.signals} neighborhoods have an increase to review. Check the evidence, then plan aid.`
      : records.healthReports.length ? 'Review neighborhood tallies and clinic availability.' : 'Track respiratory reports and find available care. Start with a sample or add a tally.';
    $('#health-rows').innerHTML = summary.rows.map(row => `<tr><th scope="row">${row.level}<small>${esc(row.name)}</small></th><td>${row.previous ? `${row.previous.count} / ${row.previous.screened}<small>${rate(row.priorRate)}</small>` : 'No tally'}</td><td>${row.current ? `${row.current.count} / ${row.current.screened}<small>${rate(row.rate)} · ${row.current.review === 'reviewed' ? 'reviewed locally' : 'unreviewed'}</small>` : 'No tally'}</td><td><span class="health-tag ${row.signal ? 'attention' : ''}">${row.status}</span>${row.current ? `<small>Source: ${esc(row.current.source)}</small>` : ''}</td><td><button class="button secondary compact" data-health-level="${row.level}" aria-label="Plan aid for ${row.level}">Plan aid →</button></td></tr>`).join('');
    $('#health-records').innerHTML = records.healthReports.length
      ? records.healthReports.slice(0, 12).map(row => `<li><b>${row.level} · ${row.day}</b> · ${row.count}/${row.screened} · ${esc(row.review)}<br>${esc(row.source)} · updated ${esc(row.updatedAt)}${row.note ? `<p>${esc(row.note)}</p>` : ''}</li>`).join('')
      : '<li>No tallies stored. Missing data is not evidence of no illness.</li>';
    $('#clinic-cards').innerHTML = clinicSnapshots(records.clinicUpdates).map(clinic => `<article class="clinic-card"><div><span class="eyebrow muted">${clinic.level}</span><h3>${esc(clinic.name)}</h3></div><span class="health-tag ${clinic.stale || !clinic.open || !clinic.slots ? 'attention' : ''}">${clinic.stale ? 'Stale · confirm first' : !clinic.open ? 'Closed' : clinic.slots ? `${clinic.slots} care places` : 'Care capacity full'}</span><p><b>${clinic.masks}</b> masks · <b>${clinic.kits}</b> first-aid kits${!clinic.masks || !clinic.kits ? ' · supply shortage' : ''}</p><small>${clinic.simulated ? 'SIMULATED SNAPSHOT' : esc(clinic.source) + ' · ' + esc(clinic.observedAt)}</small><button class="alert-action" data-clinic-id="${clinic.id}">Update availability →</button></article>`).join('');
    $('#aid-requests').innerHTML = records.aidRequests.length ? records.aidRequests.map(request => `<article class="aid-request"><div><b>${request.level} · ${esc(AID_KINDS[request.kind])} · ${request.people} people</b><span class="health-tag">${request.status === 'completed' ? 'Reported complete' : request.status}</span></div><p>${esc(request.note)}</p><small>Saved plan: ${esc(request.context.scenario)} · T + ${request.context.minutes} min · ${request.context.stepFree ? 'step-free required' : 'stairs permitted'} · lower shaft ${request.context.closedEdges.includes('lower-shaft') ? 'closed' : 'open'}.<br>${esc(request.updatedAt)} · local / relayed record · status is self-reported</small>${request.status !== 'completed' ? `<button class="alert-action" data-request-id="${request.id}" data-request-status="${request.status === 'requested' ? 'coordinating' : 'completed'}">${request.status === 'requested' ? 'Mark as coordinating' : 'Mark as reported complete'} →</button>` : ''}</article>`).join('') : '<p class="health-note">No aid requests yet. Save a plan below, then export a relay packet to share it.</p>';
    renderAid();
  }
  function nextStamp(previous) {
    const now = stamp();
    if (previous && Date.parse(previous.updatedAt) > Date.parse(now) + UPDATE_CLOCK_SKEW) throw new Error('A newer record exists. Check your device clock before updating it.');
    return previous?.updatedAt >= now ? new Date(Date.parse(previous.updatedAt) + 1).toISOString() : now;
  }
  function save(patch, message) {
    const persisted = onSave(patch);
    render();
    if (persisted) toast(message);
  }
  function safely(action) { try { action(); } catch (error) { toast(error.message); } }

  $('#health-sample').addEventListener('click', () => safely(() => {
    const current = getRecords().healthReports;
    const samples = sampleHealthReports().filter(row => !current.some(existing => existing.id === row.id));
    save({ healthReports: mergeHealthReports(current, samples) }, 'Fictional tallies loaded. Existing daily tallies were preserved.');
    loadTally();
  }));
  $('#health-level').addEventListener('change', loadTally);
  $('#health-day').addEventListener('change', loadTally);
  $('#health-form').addEventListener('submit', event => {
    event.preventDefault(); safely(() => {
      const rows = getRecords().healthReports;
      const level = $('#health-level').value, day = $('#health-day').value;
      const record = createHealthReport({ level, day, screened: Number($('#health-screened').value), count: Number($('#health-count').value), source: $('#health-source').value, review: $('#health-review').value, note: $('#health-note').value }, nextStamp(rows.find(row => row.level === level && row.day === day)));
      save({ healthReports: mergeHealthReports(rows, [record]) }, 'Daily tally saved locally. Review labels do not verify an outbreak or the reporter’s identity.');
      loadTally();
    });
  });
  $('#health-rows').addEventListener('click', event => {
    const button = event.target.closest('[data-health-level]');
    if (button) { setOrigin(button.dataset.healthLevel); focusSection('health-aid'); }
  });
  $('#clinic-cards').addEventListener('click', event => {
    const button = event.target.closest('[data-clinic-id]');
    if (button) { $('#clinic-id').value = button.dataset.clinicId; loadClinic(); $('#clinic-editor').open = true; $('#clinic-id').focus(); }
  });
  $('#clinic-id').addEventListener('change', loadClinic);
  $('#clinic-form').addEventListener('submit', event => {
    event.preventDefault(); safely(() => {
      const rows = getRecords().clinicUpdates, clinicId = $('#clinic-id').value;
      const record = createClinicUpdate({ clinicId, open: $('#clinic-open').checked, slots: Number($('#clinic-slots').value), masks: Number($('#clinic-masks').value), kits: Number($('#clinic-kits').value), source: $('#clinic-source').value, observedAt: new Date($('#clinic-time').value + 'Z').toISOString() }, nextStamp(rows.find(row => row.clinicId === clinicId)));
      save({ clinicUpdates: mergeClinicUpdates(rows, [record]) }, 'Clinic snapshot saved. Candidate aid routes recalculated.');
    });
  });
  $('#aid-origin').addEventListener('change', event => { origin = event.target.value; renderAid(); });
  for (const selector of ['#aid-kind', '#aid-people', '#aid-step-free']) $(selector).addEventListener('input', renderAid);
  $('#aid-save').addEventListener('click', () => safely(() => {
    const record = createAidRequest(requestPlan());
    save({ aidRequests: mergeAidRequests(getRecords().aidRequests, [record]) }, 'Aid request saved locally. Export a relay packet to share it; no team has been dispatched.');
    $('#aid-requests').scrollIntoView({ block: 'nearest' });
  }));
  $('#aid-requests').addEventListener('click', event => safely(() => {
    const button = event.target.closest('[data-request-id]');
    if (!button) return;
    const rows = getRecords().aidRequests, previous = rows.find(row => row.id === button.dataset.requestId);
    if (!previous) return;
    save({ aidRequests: mergeAidRequests(rows, [{ ...previous, status: button.dataset.requestStatus, updatedAt: nextStamp(previous) }]) }, 'Self-reported request status saved. Export again to relay the update.');
  }));
  $('#health-export').addEventListener('click', () => safely(download));
  document.querySelectorAll('[data-health-target]').forEach(button => button.addEventListener('click', () => focusSection(button.dataset.healthTarget)));
  function setOrigin(level) {
    if (!LEVELS.some(row => row.id === level)) throw new TypeError('Unknown aid origin.');
    origin = level; $('#aid-origin').value = level; renderAid();
  }
  function reset() {
    origin = 'L20'; $('#aid-origin').value = origin; $('#aid-people').value = 1;
    $('#aid-kind').value = 'visit'; $('#aid-step-free').checked = true;
    $('#health-level').value = origin; $('#health-day').value = stamp().slice(0, 10);
    $('#health-day').max = $('#health-day').value; $('#clinic-id').value = 'gardens';
    loadTally(); loadClinic(); render();
  }
  reset();
  return { render, setOrigin, focusSection, reset };
}
