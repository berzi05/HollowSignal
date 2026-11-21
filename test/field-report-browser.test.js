import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createStaticServer } from '../server.mjs';

const chrome = process.env.CHROME_BIN || (process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux' ? 'google-chrome' : null);

// This function runs in Chrome against the actual app in a same-origin frame.
async function exerciseReportFlow() {
  const frame = document.querySelector('iframe');
  const app = frame.contentDocument;
  const $ = selector => app.querySelector(selector);
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  for (const [width, level] of [[360, 'L16'], [1280, 'L20']]) {
    frame.style.width = width + 'px';
    const navigation = new Promise(resolve => frame.contentWindow.addEventListener('hashchange', resolve, { once: true }));
    $('[data-view="overview"]').click();
    await navigation;
    function checkLayout(view) {
      const viewport = app.documentElement.clientWidth;
      check(Math.abs(frame.getBoundingClientRect().width - width) <= 1, 'Unexpected frame width');
      check(app.documentElement.scrollWidth <= viewport + 1, view + ' overflows horizontally at ' + width + 'px');
    }
    checkLayout('Overview');
    $('#scenario').value = 'heat';
    $('#scenario').dispatchEvent(new frame.contentWindow.Event('change'));
    const heat = $('#alerts details');
    check(heat.open && heat.querySelector('summary').textContent.includes('Heat & cooling'), 'Heat warnings are hidden');
    heat.querySelector('summary').click();
    check(!heat.open, 'Warning group did not collapse');
    heat.querySelector('summary').click();
    const warning = heat.querySelector('[data-inspect="' + level + '"]');
    check(warning && warning.getBoundingClientRect().height > 0, 'Warning is not visible');
    warning.click();
    check(app.activeElement === $('#level-detail'), 'Inspection lost keyboard focus');
    $('#return-to-map').click();
    check(app.activeElement.dataset.level === level, 'Could not return to the selected level');
    warning.click();
    $('[data-reports-level="' + level + '"]').click();
    check(!$('#view-community').hidden && app.activeElement === $('#report-log'), 'Report log did not receive focus');
    check($('#log-level').value === level && $('#log-type').value === 'heat', 'Selected level or hazard lost');
    checkLayout('Community');
    $('#log-add').click();
    check($('#report-dialog').open && $('#report-level').value === level && $('#report-type').value === 'heat', 'Report form lost its filters');
    const observation = 'Cooling fan stopped at the ' + level + ' lift.';
    $('#report-detail').value = observation;
    $('#report-form').requestSubmit();
    check(!$('#report-dialog').open && $('#log-rows').textContent.includes(observation), 'Saved report missing from the log');
    checkLayout('Saved report');
  }
}

test('Chrome can inspect a heat warning and file a report at phone and desktop widths', {
  skip: chrome ? false : 'Set CHROME_BIN to run the browser check locally',
  timeout: 30000,
}, async t => {
  const temp = resolve(tmpdir());
  const directory = await mkdtemp(join(temp, 'hollow-field-test-'));
  const site = join(directory, 'site');
  const server = createStaticServer(site);
  t.after(async () => {
    if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (dirname(directory) === temp && basename(directory).startsWith('hollow-field-test-')) {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  });
  await cp(new URL('../dist/', import.meta.url), site, { recursive: true });
  await writeFile(join(site, 'report-test.html'), `<!doctype html><meta charset="utf-8">
    <iframe src="./index.html" title="Hollow Signal" style="border:0;height:900px"></iframe><output id="result">Pending</output>
    <script>window.addEventListener('load', async () => {
      const result = document.querySelector('#result');
      try { await (${exerciseReportFlow.toString()})(); result.textContent = 'Passed'; }
      catch (error) { result.textContent = error.message; }
    });</script>`);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { stdout } = await promisify(execFile)(chrome, [
    '--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--disable-extensions',
    '--user-data-dir=' + join(directory, 'profile'), '--virtual-time-budget=5000', '--dump-dom',
    'http://127.0.0.1:' + server.address().port + '/report-test.html',
  ], { timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true });
  assert.equal(stdout.match(/<output id="result">([^<]*)<\/output>/)?.[1], 'Passed');
});
