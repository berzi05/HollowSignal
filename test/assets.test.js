import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

test('the offline shell includes every local HTML, CSS, and JavaScript dependency', async () => {
  const scope = 'https://example.test/hollow/';
  const sw = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const shell = new Set(vm.runInNewContext(sw + '\nSHELL;', {
    URL, self: { registration: { scope }, addEventListener() {} },
  }));
  const pending = ['index.html'];
  const seen = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    assert.ok(shell.has(new URL(path, scope).href), path + ' must be available offline');
    const asset = new URL('../dist/' + path, import.meta.url);
    assert.ok((await stat(asset)).isFile(), path + ' must exist in the deployable directory');
    if (!/\.(html|css|js)$/.test(path)) continue;
    const text = await readFile(asset, 'utf8');
    const refs = path.endsWith('.html')
      ? [...text.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map(match => match[1])
      : path.endsWith('.js')
        ? [...text.matchAll(/from ['"](\.\/[^'"]+)['"]/g)].map(match => match[1])
        : [...text.matchAll(/url\(['"]?(\.\/[^'")]+)['"]?\)/g)].map(match => match[1]);
    for (const ref of refs) pending.push(new URL(ref, new URL(path, scope)).href.slice(scope.length));
  }
  assert.ok(seen.has('crisis.js'));
  assert.ok(seen.has('response-ui.js'));
  assert.ok(seen.has('response.css'));
});
