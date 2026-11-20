import { buildBriefContext, briefKey, createLocalBrief, validateAiBrief, formatBriefText } from './brief.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERRORS = {
  not_configured: 'AI is not configured on this server.',
  local_only: 'AI is available on the local computer only.',
  busy: 'AI is busy or the request limit was reached. Try again in a minute.',
  timeout: 'AI took too long to respond.',
  provider_unavailable: 'The AI provider could not complete the request. Check the server’s key, model access, and API balance.',
  provider_auth: 'Gemini rejected access. Check the API key and its project permissions.',
  provider_quota: 'Gemini’s quota or rate limit was reached. Check your project quota or try again later.',
  provider_model: 'This Gemini model is unavailable for your project. Check GEMINI_MODEL on the server.',
  provider_mismatch: 'An older AI server is running. Restart npm start to enable Gemini.',
  invalid_response: 'AI did not return a usable brief.',
};

export function initAiBrief({ getInputs, download, toast, fetchImpl = globalThis.fetch }) {
  let current = null, pending = null, sequence = 0, statusSequence = 0;
  let waitTimer, progressTimer;
  let knownKey = briefKey(getInputs());

  function controls() {
    const stale = current && current.context.key !== knownKey;
    $('#ai-generate').disabled = Boolean(pending);
    $('#ai-generate').textContent = pending ? 'Writing AI brief…' : 'Explain with AI';
    $('#ai-cancel').hidden = !pending;
    $('#ai-stale').hidden = !stale;
    $('#ai-export').disabled = !current || stale;
    $('#ai-copy').disabled = !current || stale;
    $('#ai-output').setAttribute('aria-busy', String(Boolean(pending) && !current));
  }

  function display(context, brief, source, label) {
    current = { context, brief, source, label };
    $('#ai-output').hidden = false;
    $('#ai-source').textContent = label;
    $('#ai-snapshot').textContent = context.label;
    $('#ai-summary').textContent = brief.summary;
    $('#ai-priorities').innerHTML = brief.priorities.map(item => {
      const fact = context.facts.find(row => row.id === item.factId);
      return `<li><h3>${esc(fact.title)}</h3><p>${esc(item.explanation)}</p><div class="ai-evidence"><b>Calculated source</b><p>${esc(fact.text)}</p></div></li>`;
    }).join('');
    $('#ai-message').textContent = brief.message;
    $('#ai-warnings').innerHTML = context.warnings.map(warning => `<li>${esc(warning)}</li>`).join('');
    controls();
  }

  function clearWaitTimers() {
    clearTimeout(waitTimer); clearTimeout(progressTimer);
    waitTimer = progressTimer = undefined;
  }

  function cancel() {
    sequence++;
    clearWaitTimers();
    pending?.abort(); pending = null;
    controls();
  }

  function refreshContext() {
    const key = briefKey(getInputs());
    if (key === knownKey) return;
    knownKey = key;
    const wasPending = Boolean(pending);
    cancel();
    $('#ai-feedback').textContent = wasPending ? 'Plan changed. The pending answer was discarded; generate a brief for the new settings.' : '';
  }

  async function checkStatus() {
    const ticket = ++statusSequence;
    $('#ai-connection').textContent = 'Checking AI configuration…';
    try {
      const response = await fetchImpl('./api/ai/status', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (ticket !== statusSequence) return;
      const modelLabel = typeof data.model === 'string' && data.model.length <= 100 ? ` · ${data.model}` : '';
      $('#ai-connection').textContent = data.provider !== 'Gemini' ? ERRORS.provider_mismatch : data.configured === true ? `Gemini configured${modelLabel} · connection tested when you generate` : 'Gemini not configured · local briefs available';
    } catch {
      if (ticket === statusSequence) $('#ai-connection').textContent = 'AI server unavailable · local briefs available';
    }
  }

  async function generate() {
    cancel();
    const context = buildBriefContext(getInputs());
    const ticket = sequence;
    const controller = new AbortController();
    const startedAt = Date.now();
    pending = controller;
    display(context, createLocalBrief(context), 'local', 'Local brief · calculated rules, no AI');
    $('#ai-feedback').textContent = 'Local brief ready below. Gemini is preparing a short explanation…';
    progressTimer = setTimeout(() => {
      if (ticket === sequence) $('#ai-feedback').textContent = 'Gemini is still responding. You can read, copy, or download the local brief now.';
    }, 4000);
    waitTimer = setTimeout(() => {
      if (ticket !== sequence) return;
      cancel();
      $('#ai-feedback').textContent = 'Gemini reached the 14-second wait limit. The local brief remains ready to use.';
    }, 14000);
    try {
      const response = await fetchImpl('./api/ai/brief', {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(context.inputs),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(ERRORS[data.error] || 'The AI service is unavailable.');
      if (data.provider !== 'Gemini') throw new Error(ERRORS.provider_mismatch);
      if (data.source !== 'ai' || data.key !== context.key || typeof data.model !== 'string' || data.model.length > 100) throw new Error(ERRORS.invalid_response);
      validateAiBrief(data.brief);
      if (ticket !== sequence || context.key !== briefKey(getInputs())) return;
      display(context, data.brief, 'ai', `Gemini draft · ${data.model}${data.cached ? ' · reused snapshot' : ''}`);
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      $('#ai-feedback').textContent = `Gemini brief ready in ${seconds}s. Check the calculated sources and warnings before sharing.`;
      $('#ai-connection').textContent = 'Gemini responded successfully';
    } catch (error) {
      if (ticket !== sequence || context.key !== briefKey(getInputs())) return;
      display(context, createLocalBrief(context), 'local', 'Local brief · calculated rules, no AI');
      const message = controller.signal.aborted ? ERRORS.timeout : (Object.values(ERRORS).includes(error.message) ? error.message : 'AI could not be reached.');
      $('#ai-feedback').textContent = `${message} Showing a local brief instead.`;
    } finally {
      if (ticket === sequence) { clearWaitTimers(); pending = null; controls(); }
    }
  }

  function exportText() {
    refreshContext();
    if (!current || current.context.key !== knownKey) return null;
    return formatBriefText(current.context, current.brief, current.label);
  }

  $('#ai-generate').addEventListener('click', generate);
  $('#ai-check').addEventListener('click', checkStatus);
  $('#ai-cancel').addEventListener('click', () => { cancel(); $('#ai-feedback').textContent = 'Stopped waiting for Gemini. The local brief is ready to use.'; });
  $('#ai-local').addEventListener('click', () => {
    cancel();
    const context = buildBriefContext(getInputs());
    display(context, createLocalBrief(context), 'local', 'Local brief · calculated rules, no AI');
    $('#ai-feedback').textContent = 'Local brief ready. Calculated on this device.';
  });
  $('#ai-export').addEventListener('click', () => {
    const text = exportText();
    if (text) { download('hollow-explained-brief.txt', text); toast('Brief exported with its calculated sources and review warnings.'); }
  });
  $('#ai-copy').addEventListener('click', async () => {
    const text = exportText();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast('Brief copied with sources and warnings. Review before sharing.'); }
    catch { toast('Clipboard unavailable. Use Download brief instead.'); }
  });
  controls();
  const ready = checkStatus();
  return { refreshContext, ready };
}
