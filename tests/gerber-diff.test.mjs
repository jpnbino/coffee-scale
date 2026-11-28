import test from 'node:test';
import assert from 'node:assert/strict';
import { layerKey, pairLayers, comparisonFrame, classify, findRegions, regionToBoard, summarise, areaMm2, formatArea, ADDED, REMOVED, COMMON, NONE } from '../web/gerber-diff-core.mjs';

const layer = (kind, extra = {}) => ({ kind, name: `board${kind}`, label: kind, available: true, sourceSha256: `sha${kind}`, ...extra });

test('Drill files pair by plating; other layers by Gerber kind', () => {
  assert.equal(layerKey({ kind: '.drl', name: 'x-NPTH.drl' }), '.drl:npth');
  assert.equal(layerKey({ kind: '.drl', name: 'x-PTH.drl' }), '.drl:pth');
  assert.equal(layerKey({ kind: '.GTL', name: 'x' }), '.gtl');
});

test('Layer pairs follow the physical stack and say which revision lacks a layer', () => {
  const base = [layer('.gm1'), layer('.drl', { name: 'b-NPTH.drl' }), layer('.drl', { name: 'b-PTH.drl' }), layer('.gbl'), layer('.gtl', { sourceSha256: 'old' }), layer('.gts'), layer('.gto'), layer('.xyz')];
  const head = [layer('.gtp'), layer('.gtl', { sourceSha256: 'new' }), layer('.gbl'), layer('.gto', { available: false }), layer('.gm1'), layer('.drl', { name: 'h-PTH.drl' }), layer('.drl', { name: 'h-NPTH.drl' })];
  const rows = pairLayers(base, head);
  assert.deepEqual(rows.map(r => r.key), ['.gto', '.gtp', '.gts', '.gtl', '.gbl', '.drl:pth', '.drl:npth', '.gm1', '.xyz']);
  const by = Object.fromEntries(rows.map(r => [r.key, r]));
  assert.equal(by['.gtp'].status, 'head-only');
  assert.equal(by['.gts'].status, 'base-only');
  assert.equal(by['.gto'].status, 'unavailable');
  assert.equal(by['.gtl'].status, 'both');
  assert.equal(by['.gtl'].identical, false);
  assert.equal(by['.gbl'].identical, true);
  assert.equal(by['.drl:npth'].base.name, 'b-NPTH.drl');
  assert.equal(by['.drl:npth'].head.name, 'h-NPTH.drl');
  assert.equal(by['.gtl'].title, 'Top copper');
});

test('The frame covers both boards in whole millimetres and caps the image size', () => {
  const frame = comparisonFrame([[85500.5, 74500.5, 98999, 58999], [84975, 73975, 100050, 60050]]);
  assert.deepEqual([frame.x0, frame.y0, frame.widthMm, frame.heightMm, frame.pxPerMm], [83, 72, 104, 64, 20]);
  assert.equal(frame.width, 2080); assert.equal(frame.height, 1280);
  const capped = comparisonFrame([[0, 0, 1000000, 1000000]], { preferred: 20, maxPixels: 4e6 });
  assert.ok(capped.width * capped.height <= 4e6);
  assert.equal(capped.pxPerMm, 1);
  assert.throws(() => comparisonFrame([]), /no layer extents/);
});

test('Pixels are classified by half coverage; RGBA alpha is read with a stride', () => {
  const base = Uint8ClampedArray.from([0, 0, 0, 255, 0, 0, 0, 200, 0, 0, 0, 0, 0, 0, 0, 127]);
  const head = Uint8ClampedArray.from([0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 0]);
  const { codes, counts } = classify(base, head, { stride: 4, offset: 3 });
  assert.deepEqual([...codes], [COMMON, REMOVED, ADDED, NONE]);
  assert.deepEqual(counts, { common: 1, added: 1, removed: 1 });
  assert.throws(() => classify(new Uint8Array(4), new Uint8Array(8)), /differ in size/);
});

test('Changed pixels group into regions with exact boxes and areas', () => {
  const width = 40, height = 20, codes = new Uint8Array(width * height);
  const paint = (x0, y0, x1, y1, code) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) codes[y * width + x] = code; };
  paint(0, 0, 39, 19, COMMON);
  paint(2, 2, 5, 4, ADDED);      // 12 px
  paint(7, 2, 8, 3, REMOVED);    // 4 px, within one cell of the first: same region
  paint(30, 15, 30, 15, ADDED);  // 1 px, far away
  const regions = findRegions(codes, width, height, { cell: 4 });
  assert.equal(regions.length, 2);
  assert.deepEqual(regions[0], { x0: 2, y0: 2, x1: 8, y1: 4, added: 12, removed: 4 });
  assert.deepEqual(regions[1], { x0: 30, y0: 15, x1: 30, y1: 15, added: 1, removed: 0 });
  assert.equal(findRegions(codes, width, height, { cell: 1 }).length, 3);
  assert.throws(() => findRegions(codes, 10, 10), /does not match/);
});

test('Regions and totals convert to mm and mm²', () => {
  const frame = { x0: 80, y0: 70, pxPerMm: 20 };
  const box = regionToBoard({ x0: 20, y0: 40, x1: 39, y1: 49, added: 400, removed: 0 }, frame);
  assert.deepEqual(box, { x: 81, y: 72, width: 1, height: 0.5, addedMm2: 1, removedMm2: 0 });
  assert.equal(areaMm2(800, 20), 2);
  const regions = Array.from({ length: 60 }, (_, i) => ({ x0: i, y0: 0, x1: i, y1: 0, added: 1, removed: 0 }));
  const summary = summarise({ added: 60, removed: 400, common: 4000 }, regions, frame);
  assert.equal(summary.regionCount, 60); assert.equal(summary.regions.length, 50);
  assert.equal(summary.removedMm2, 1); assert.equal(summary.commonMm2, 10);
  assert.deepEqual([0, 0.004, 0.4234, 12.34, 456.7].map(formatArea), ['0 mm²', '< 0.01 mm²', '0.42 mm²', '12.3 mm²', '457 mm²']);
});
