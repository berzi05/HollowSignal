import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssetPath } from '../server.mjs';

test('static path resolution handles shell, assets, and query strings', () => {
  const root = '/workspace/example/dist';
  assert.equal(resolveAssetPath('/', root), `${root}/index.html`);
  assert.equal(resolveAssetPath('/app.js?v=1', root), `${root}/app.js`);
  assert.equal(resolveAssetPath('/assets/map.svg', root), `${root}/assets/map.svg`);
});

test('static path resolution rejects traversal, hidden files and malformed encoding', () => {
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/x/../app.js', '/.env', '/x/.git/config', '/%00app.js', '/%zz', '/a\\b', 'https://example.com/app.js']) {
    assert.throws(() => resolveAssetPath(path, '/workspace/example/dist'), TypeError, path);
  }
});
