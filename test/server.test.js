import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { resolveAssetPath } from '../server.mjs';

// Build platform-native paths so the suite also passes on Windows.
const root = resolve('/workspace/example/dist');

test('static path resolution handles shell, assets, and query strings', () => {
  assert.equal(resolveAssetPath('/', root), resolve(root, 'index.html'));
  assert.equal(resolveAssetPath('/app.js?v=1', root), resolve(root, 'app.js'));
  assert.equal(resolveAssetPath('/assets/map.svg', root), resolve(root, 'assets', 'map.svg'));
});

test('static path resolution rejects traversal, hidden files and malformed encoding', () => {
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/x/../app.js', '/.env', '/x/.git/config', '/%00app.js', '/%zz', '/a\\b', 'https://example.com/app.js']) {
    assert.throws(() => resolveAssetPath(path, root), TypeError, path);
  }
});
