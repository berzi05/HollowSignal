import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('health controls exist in the document and navigation and labels target real unique elements', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../dist/health-ui.js', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'DOM IDs must be unique');
  for (const match of ui.matchAll(/['"]#([a-z][a-z0-9-]*)['"]/g)) assert.ok(ids.includes(match[1]), `Missing health control ${match[1]}`);
  for (const match of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Unresolved label ${match[1]}`);
  for (const match of html.matchAll(/data-view="([^"]+)"/g)) assert.ok(ids.includes(`view-${match[1]}`), `Missing view ${match[1]}`);
  for (const match of html.matchAll(/data-health-target="([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing health jump target ${match[1]}`);
});
