import test from 'node:test';
import assert from 'node:assert/strict';
import { versionReferences } from '../tools/lib/cache-bust.mjs';

test('Own scripts, styles and module imports carry the build ID', () => {
  const html = '<link rel="stylesheet" href="portal.css"><script src="data.js" defer></script><script type="module" src="gerber.mjs"></script><script src="vendor/model-viewer-4.4.0.min.js"></script>';
  assert.equal(versionReferences(html, 'E-1'), '<link rel="stylesheet" href="portal.css?v=E-1"><script src="data.js?v=E-1" defer></script><script type="module" src="gerber.mjs?v=E-1"></script><script src="vendor/model-viewer-4.4.0.min.js?v=E-1"></script>');
  const js = `import { a } from './revision.mjs';\nconst m = await import("./design-viewer.mjs");\nawait import('./vendor/kicanvas.js');`;
  assert.equal(versionReferences(js, 'E-1'), `import { a } from './revision.mjs?v=E-1';\nconst m = await import("./design-viewer.mjs?v=E-1");\nawait import('./vendor/kicanvas.js?v=E-1');`);
});

test('Pages, data, external links and already-versioned references are untouched', () => {
  const html = '<a href="explore.html?net=HX_DOUT">x</a><a href="https://example.com/a.js">y</a><img src="top.png"><a href="files/source.zip">z</a><script src="app.js?v=old"></script><a href="//cdn.example/x.css">w</a>';
  assert.equal(versionReferences(html, 'E-1'), html);
  assert.equal(versionReferences("fetch('review/catalog.json')", 'E-1'), "fetch('review/catalog.json')");
});
