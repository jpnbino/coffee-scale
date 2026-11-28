import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CORE_PAGES, IGNORED_REQUESTS, discoverPages, mimeType, parseDevToolsUrl, resolveRequest } from '../tools/smoke-portal.mjs';

test('Smoke server serves portal assets with their MIME types', () => {
  assert.match(mimeType('index.html'), /^text\/html/);
  assert.match(mimeType('app.js'), /^text\/javascript/);
  assert.match(mimeType('/gerber.mjs?v=abc123'), /^text\/javascript/);
  assert.match(mimeType('portal.css#x'), /^text\/css/);
  assert.equal(mimeType('stackup.json'), 'application/json');
  assert.equal(mimeType('pcb-top.svg'), 'image/svg+xml');
  assert.equal(mimeType('TOP.PNG'), 'image/png');
  assert.equal(mimeType('board.glb'), 'model/gltf-binary');
  assert.equal(mimeType('decoder.wasm'), 'application/wasm');
  assert.equal(mimeType('vendor/material-symbols-outlined.woff2'), 'font/woff2');
  assert.equal(mimeType('font.ttf'), 'font/ttf');
  assert.equal(mimeType('unknown.bin'), 'application/octet-stream');
});

test('Smoke server strips query strings and stays inside the site', () => {
  const root = path.resolve('/srv/site');
  assert.equal(resolveRequest(root, '/'), path.join(root, 'index.html'));
  assert.equal(resolveRequest(root, '/gerber.mjs?v=1'), path.join(root, 'gerber.mjs'));
  assert.equal(resolveRequest(root, '/review/a%20b.json'), path.join(root, 'review', 'a b.json'));
  assert.equal(resolveRequest(root, '/../secret'), path.join(root, 'secret'));
  assert.equal(resolveRequest(root, '/%2e%2e/%2e%2e/etc/passwd'), path.join(root, 'etc', 'passwd'));
  assert.equal(resolveRequest(root, '/..%2f..%2fetc/passwd'), null);
  assert.equal(resolveRequest(root, '/%E0%A4%A'), null);
});

test('DevTools URL is read from Chrome stderr', () => {
  const stderr = '[1127/101500.123:WARNING:x.cc(1)] noise\n\nDevTools listening on ws://127.0.0.1:41234/devtools/browser/0b8e-11aa\nmore\n';
  assert.equal(parseDevToolsUrl(stderr), 'ws://127.0.0.1:41234/devtools/browser/0b8e-11aa');
  assert.equal(parseDevToolsUrl('DevTools listening on ws://[::1]:9222/devtools/browser/x\r\n'), 'ws://[::1]:9222/devtools/browser/x');
  assert.equal(parseDevToolsUrl('Chrome failed to start'), null);
});

test('Page discovery lists core pages in order, then every guide', () => {
  const names = ['doc-02-circuit.html', 'search-index.json', ...CORE_PAGES.slice().reverse(), 'doc-01-overview.html', 'kc-test.html', 'doc-notes.md'];
  const { pages, missing } = discoverPages(names);
  assert.deepEqual(pages, [...CORE_PAGES, 'doc-01-overview.html', 'doc-02-circuit.html']);
  assert.deepEqual(missing, []);
  assert.ok(CORE_PAGES.includes('gerbers.html') && CORE_PAGES.includes('stackup.html') && CORE_PAGES.includes('explore.html'));
});

test('Page discovery reports missing core pages', () => {
  const { pages, missing } = discoverPages(['index.html', 'doc-01-overview.html']);
  assert.deepEqual(pages, ['index.html', 'doc-01-overview.html']);
  assert.ok(missing.includes('gerbers.html') && !missing.includes('index.html'));
});

test('Only the favicon and KiCanvas template placeholders are ignored as failed requests', () => {
  const ignored = url => IGNORED_REQUESTS.some(pattern => pattern.test(url));
  assert.ok(ignored('/favicon.ico'));
  assert.ok(ignored('/$$:0:$$'));
  assert.ok(ignored('/vendor/$$:12:$$'));
  assert.ok(!ignored('/gerber.mjs'));
  assert.ok(!ignored('/review/revE/gerbers.json'));
  assert.ok(!ignored('/favicon.ico.bak'));
});
