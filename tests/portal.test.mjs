import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { portalPages } from '../tools/build-portal.mjs';
const template = (await readFile(new URL('../web/index.html', import.meta.url), 'utf8'))
  .replace('{{DOCUMENTATION}}', '<article class="doc-article" id="doc-guide"><h1>Test guide</h1><p>Load-cell wiring guide.</p><p>HX711 wiring reference</p></article><article id="doc-07-manufacturing-control"><h1>Manufacturing control</h1><p>From prototype data to controlled manufacturing.</p></article>');
const pages = portalPages(template);
test('Landing page contains resource links without interactive viewer payloads', () => {
  const home = pages.get('index.html');
  assert.match(home, /href="versions.html"/);
  assert.doesNotMatch(home, /id="comparison-overlay"|<model-viewer|src="gerber.mjs"|src="review.mjs"/);
  assert.doesNotMatch(home, /class="metrics"|board footprints|ERC \/ DRC \/ unrouted/);
  assert.match(home, /id="global-revision"/);
});
test('Every resource has distinct navigation and one heading; only guides carry a breadcrumb', () => {
  for (const [name, html] of pages) {
    if (!name.endsWith('.html')) continue;
    assert.equal(/aria-label="Breadcrumb"/.test(html), name.startsWith('doc-'), `${name}: breadcrumb only on guides`);
    assert.match(html, /aria-current="page"/);
    assert.equal((html.match(/id="global-revision"/g) ?? []).length, 1, `${name}: one revision selector`);
    if (!name.startsWith('doc-') && name !== 'index.html') assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${name}: one h1`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${name}`);
    for (const [, link] of html.matchAll(/href="([^"#]+\.html)"/g)) assert.ok(pages.has(link), `${name}: ${link}`);
  }
});
test('Guides become standalone searchable pages', () => {
  assert.match(pages.get('doc-guide.html'), /HX711 wiring reference/);
  assert.doesNotMatch(pages.get('documentation.html'), /HX711 wiring reference/);
  assert.ok(JSON.parse(pages.get('search-index.json')).some(page => page.url === 'doc-guide.html' && page.text.includes('HX711')));
});
test('Heavy viewers are isolated and design tabs use deferred sources', () => {
  assert.match(pages.get('explore.html'), /<model-viewer data-artifact="model"/);
  assert.doesNotMatch(pages.get('explore.html'), /<script[^>]*src="vendor\/model-viewer/);
  assert.match(pages.get('gerbers.html'), /src="gerber.mjs"/);
  assert.doesNotMatch(pages.get('gerbers.html'), /src="review.mjs"|id="comparison-overlay"/);
  assert.match(pages.get('versions.html'), /src="review.mjs"/);
  assert.match(pages.get('statistics.html'), /src="statistics-page.mjs"/);
});
test('Revision-dependent media and downloads cannot load current artifacts before selection',()=>{
  for(const [name,html] of pages){if(!name.endsWith('.html'))continue;
    assert.match(html,/id="global-revision"/);assert.match(html,/class="revision-loading"/);
    assert.doesNotMatch(html,/(?:href|src|data-src)="(?:board.glb|top.png|pcb-top.svg|pcb-bottom.svg|schematic.pdf|files\/[^\"]+)"/);
  }
  assert.match(pages.get('manufacture.html'),/data-artifact="assembly"/);
});
test('Missing content fails generation instead of emitting a partial portal', () => {
  assert.throws(() => portalPages(template.replace('id="gerbers"', 'id="missing"')), /Missing portal section/);
});

test('Documentation cards describe each document with its lead sentence', () => {
  const docs = pages.get('documentation.html');
  assert.match(docs, /<strong>Test guide<\/strong><span>Load-cell wiring guide\.<\/span>/);
  assert.match(docs, /<strong>Manufacturing control<\/strong><span>From prototype data to controlled manufacturing\.<\/span>/);
  assert.doesNotMatch(docs, /Maintained project documentation for this build/);
});

test('Documentation without a lead sentence is rejected', () => {
  const bad = template.replace('<h1>Test guide</h1><p>Load-cell wiring guide.</p>', '<h1>Test guide</h1><table></table>');
  assert.throws(() => portalPages(bad), /lead paragraph/);
});
