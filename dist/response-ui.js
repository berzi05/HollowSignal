import { LEVELS } from './engine.js';
import { projectSituation, comparePolicies, findRefugeRoute, createResponseBrief, TUNNELS } from './crisis.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const percent = value => Math.round(value).toLocaleString('en-US');
const fmt = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
const defaults = () => ({ minutes: 0, supply: 1000, origin: 'L20', groupSize: 12, stepFree: false, blocked: false });
const explanations = [
  'Start with one neighborhood, then see how a power failure becomes a movement and communication crisis.',
  'The plant has tripped. Scrub forward to see reserves drain and ventilation deteriorate in this fictional model.',
  'Twenty minutes later, the lower shaft floods. The same budget still has to serve every level. Compare the policies, then inspect the alternate route.',
];

function networkSvg(route, blocked, windows) {
  const y = new Map(LEVELS.map((level, i) => [level.id, 36 + i * 54]));
  const selected = new Set(route.edges.map(edge => edge.id));
  const segments = TUNNELS.map(edge => {
    const closed = blocked && edge.id === 'lower-shaft';
    const d = edge.id === 'service-bypass' ? 'M 164 306 C 285 306 285 144 164 144' : `M 164 ${y.get(edge.from)} L 164 ${y.get(edge.to)}`;
    return `<path d="${d}" class="tunnel ${closed ? 'closed' : selected.has(edge.id) ? 'chosen' : ''}"/>${closed ? '<text x="181" y="228" class="closed-label">× CLOSED</text>' : ''}`;
  }).join('');
  const nodes = LEVELS.map(level => {
    const risk = windows.find(row => row.id === level.id);
    return `<g transform="translate(164 ${y.get(level.id)})"><circle r="8" class="network-node ${risk.severity}"/><text x="-143" y="4" class="network-name">${level.id} · ${esc(level.name)}</text>${route.found && route.refuge.level === level.id ? '<text x="17" y="-12" class="refuge-label">REFUGE</text>' : ''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 300 346" role="img" aria-label="Six-level tunnel network. ${blocked ? 'Lower shaft closed.' : 'Lower shaft open.'} ${route.found ? 'Candidate route: ' + route.path.join(' to ') : 'No candidate route meets the selected constraints.'}">${segments}${nodes}<text x="194" y="330" class="network-legend">STAIR BYPASS</text></svg>`;
}

export function initResponseLab({ getScenario, onScenario, onCheckIn, download, toast, onChange = () => {} }) {
  let state = defaults();
  let story = 0;
  let latest;
  $('#route-origin').innerHTML = LEVELS.map(level => `<option value="${level.id}">${level.id} · ${esc(level.name)}</option>`).join('');

  function syncControls() {
    $('#response-time').value = state.minutes;
    $('#response-supply').value = state.supply;
    $('#route-origin').value = state.origin;
    $('#route-group').value = state.groupSize;
    $('#route-step-free').checked = state.stepFree;
    $('#route-closure').checked = state.blocked;
  }

  function render() {
    const scenario = getScenario();
    const situation = projectSituation(scenario, state.minutes);
    const comparison = comparePolicies(situation.levels, state.supply);
    const route = findRefugeRoute({
      levels: situation.levels, origin: state.origin, groupSize: state.groupSize,
      stepFree: state.stepFree, closedEdges: state.blocked ? ['lower-shaft'] : [],
    });
    latest = { situation, comparison, route };
    $('#response-time-label').textContent = `T + ${state.minutes} min`;
    const scenarioLabel = { baseline: 'Current conditions', blackout: 'Geothermal outage', water: 'Recycler contamination', heat: 'Cooling system failure' }[scenario];
    $('#route-context').textContent = `${scenarioLabel} · Projection at T + ${state.minutes} min. Route conditions use this projected snapshot.`;
    $('#response-supply-label').textContent = `${fmt(state.supply)} kW`;
    $('#response-narrative').textContent = explanations[story];
    const first = situation.windows[0];
    $('#response-countdown').innerHTML = `<span>FIRST MODELED RESERVE TO RUN OUT</span><strong>${first.blackoutMinutes === 0 ? 'Now' : first.blackoutMinutes + '<small> min</small>'}</strong><p>${first.id} · ${esc(first.name)} · ${fmt(first.population)} residents</p>`;
    $('#reserve-list').innerHTML = situation.windows.map(row => {
      const remaining = row.blackoutMinutes;
      const width = Math.max(2, Math.min(100, (remaining ?? 120) / 120 * 100));
      return `<div class="reserve-row"><b>${row.id}</b><span class="reserve-track"><i class="${remaining === 0 ? 'depleted' : remaining < 20 ? 'urgent' : ''}" style="width:${width}%"></i></span><span>${remaining === 0 ? 'Exhausted' : remaining === null ? 'No draw' : fmt(remaining) + ' min'}</span></div>`;
    }).join('');
    $('#cascade-summary').textContent = situation.exhausted.length
      ? `${situation.exhausted.length} levels have exhausted their modeled reserves. Ventilation and cooling losses are now included in the route's hazard cost.`
      : 'Advance time to reveal the modeled cascade from power reserves into ventilation and cooling.';
    const cm = comparison.communityMetrics, dm = comparison.directorateMetrics;
    $('#policy-impact').innerHTML = `<div><span>DEEP-LEVEL ESSENTIAL COVERAGE</span><strong><s>${percent(dm.deepCoverage)}%</s> <span aria-hidden="true">→</span> ${percent(cm.deepCoverage)}%</strong><p>Upper-level-first → community allocation · L12–L20</p></div><div><span>LOWEST ESSENTIAL COVERAGE</span><strong>${percent(cm.minimumCoverage)}<small>%</small></strong><p>Across all six levels with the community policy</p></div>`;
    $('#policy-rows').innerHTML = comparison.community.allocations.map((row, i) => {
      const old = comparison.directorate.allocations[i];
      const coverage = value => row.essential ? Math.min(100, value / row.essential * 100) : 100;
      return `<div class="policy-row"><b>${row.id}</b><div class="policy-bars" role="img" aria-label="${row.id}: upper-level-first ${percent(coverage(old.allocated))} percent, community ${percent(coverage(row.allocated))} percent of essential need"><div class="policy-track"><i style="width:${coverage(old.allocated)}%"></i></div><div class="policy-track community"><i style="width:${coverage(row.allocated)}%"></i></div></div><span>${percent(coverage(old.allocated))}% / <b>${percent(coverage(row.allocated))}%</b></span></div>`;
    }).join('');
    $('#policy-accounting').textContent = `${fmt(comparison.community.used)} kW allocated · ${fmt(comparison.community.unallocated)} kW unallocated. ${comparison.community.essentialShortfall > 0 ? 'Essential shortfall: ' + fmt(comparison.community.essentialShortfall) + ' kW. No policy can remove this shortage.' : 'Every level’s modeled essential share is covered.'}`;
    $('#route-network').innerHTML = networkSvg(route, state.blocked, situation.windows);
    $('#route-result').innerHTML = route.found
      ? `<div class="route-heading"><span class="eyebrow">CANDIDATE REFUGE</span><h3>${esc(route.refuge.name)}</h3><div class="route-facts"><strong>${route.minutes}<small> min walk</small></strong><strong>${route.available}<small> places available</small></strong></div></div><ol class="route-itinerary">${route.path.map((id, i) => `<li><b>${id}</b> ${esc(LEVELS.find(level => level.id === id).name)}${i < route.edges.length ? `<small>${esc(route.edges[i].name)} · ${route.edges[i].minutes} min${route.edges[i].stepFree ? '' : ' · stairs'}</small>` : '<small>Capacity is a simulated snapshot, not a reservation.</small>'}</li>`).join('')}</ol>${route.exceedsReserve ? '<p class="route-warning">Travel exceeds the origin’s remaining reserve. This plan needs local assistance and review before anyone moves.</p>' : ''}${route.criticalLevels.length ? `<p class="route-warning">Critical readings along the path: ${route.criticalLevels.join(', ')}. A calculated route is not a safety clearance.</p>` : ''}`
      : `<div class="route-unavailable"><span aria-hidden="true">⊘</span><h3>No viable candidate</h3><p>${esc(route.reason)}</p></div>`;
    $('#route-message').textContent = route.found ? 'Draft a travel check-in →' : 'Draft a help request →';
    $('#route-status').textContent = route.found ? (route.stepFree ? 'Step-free candidate' : 'Stairs on this route') : 'Local assistance needed';
    document.querySelectorAll('[data-drill-step]').forEach(button => {
      const active = Number(button.dataset.drillStep) === story;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    onChange();
  }

  function draftCheckIn() {
    const { route } = latest;
    onCheckIn({
      level: state.origin, status: route.found ? 'moving' : 'help',
      note: route.found
        ? `DRILL: ${state.groupSize} people at ${state.origin}. Proposed refuge: ${route.refuge.level} via ${route.path.join(' → ')}. Route needs local review. Please relay.`
        : `DRILL: ${state.groupSize} people at ${state.origin}. No refuge route meets current access and capacity needs. Requesting local assistance. Please relay.`,
    });
  }

  function startDrill() {
    state = defaults(); story = 1; syncControls();
    onScenario('blackout'); render(); location.hash = 'response';
  }
  function focusSection(id) {
    if (!['response-reserves', 'response-allocation', 'response-routes'].includes(id)) return;
    const section = $('#' + id);
    section.scrollIntoView({ block: 'start' });
    section.focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-planner-target]').forEach(button => {
    button.addEventListener('click', () => focusSection(button.dataset.plannerTarget));
  });
  $('#start-drill').addEventListener('click', startDrill);
  $('#drill-shock').addEventListener('click', startDrill);
  $('#drill-respond').addEventListener('click', () => {
    story = 2; state.minutes = 20; state.blocked = true;
    syncControls(); onScenario('blackout'); render();
  });
  $('#drill-reconnect').addEventListener('click', draftCheckIn);
  $('#route-message').addEventListener('click', draftCheckIn);
  $('#response-time').addEventListener('input', event => { state.minutes = Number(event.target.value); render(); });
  $('#response-supply').addEventListener('input', event => { state.supply = Number(event.target.value); render(); });
  $('#route-origin').addEventListener('change', event => { state.origin = event.target.value; render(); });
  $('#route-group').addEventListener('change', event => {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      event.target.value = state.groupSize; toast('Choose a whole group size from 1 to 1,000.'); return;
    }
    state.groupSize = value; render();
  });
  $('#route-step-free').addEventListener('change', event => { state.stepFree = event.target.checked; render(); });
  $('#route-closure').addEventListener('change', event => { state.blocked = event.target.checked; render(); });
  $('#export-response').addEventListener('click', () => {
    const brief = createResponseBrief({
      scenario: getScenario(), minutes: state.minutes, supply: state.supply, origin: state.origin,
      groupSize: state.groupSize, stepFree: state.stepFree, closedEdges: state.blocked ? ['lower-shaft'] : [],
    });
    download('hollow-response-brief.json', JSON.stringify(brief, null, 2));
    toast('Response brief exported with assumptions, allocations, and route. Carry or share the file manually.');
  });
  syncControls(); render();
  return {
    render, focusSection,
    getSituation() { return { ...latest.situation, closedEdges: state.blocked ? ['lower-shaft'] : [] }; },
    setOrigin(id) {
      if (!LEVELS.some(level => level.id === id)) throw new TypeError('Choose a known starting level.');
      state.origin = id; syncControls(); render();
    },
    reset() { state = defaults(); story = 0; syncControls(); render(); },
  };
}
