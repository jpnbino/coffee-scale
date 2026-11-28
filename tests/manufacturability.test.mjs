import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardData } from '../tools/board-data.mjs';
import { measure, compare, verdict, padGap, padCorners, edgeDistance, segmentSegment } from '../web/manufacturability.mjs';

const pcb = readFileSync(new URL('../src/pico_scale_controller.kicad_pcb', import.meta.url), 'utf8');
const capabilities = JSON.parse(readFileSync(new URL('../fab-capabilities.json', import.meta.url), 'utf8'));
const board = boardData(pcb);

test('Maker limits are sourced and complete', () => {
  for (const fab of Object.values(capabilities.fabs)) assert.ok(fab.sources.length && fab.sources.every(url => url.startsWith('https://')));
  for (const rule of capabilities.rules) for (const fab of Object.keys(capabilities.fabs)) {
    assert.ok(rule[fab], `${rule.id}: ${fab} entry`);
    assert.ok(rule[fab].min === null || rule[fab].min > 0, `${rule.id}: ${fab} min`);
    if (rule[fab].min === null) assert.ok(rule[fab].note, `${rule.id}: ${fab} says why there is no value`);
  }
});

test('Geometry: pad gaps, rotated corners, rounded-outline distance', () => {
  const a = { x: 0, y: 0, width: 0.3, height: 1, angle: 0, shape: 'rect' }, b = { ...a, x: 0.5 };
  assert.ok(Math.abs(padGap(a, b) - 0.2) < 1e-9);
  assert.ok(Math.abs(padGap({ ...a, angle: 90 }, { ...b, angle: 90, x: 1.2 }) - 0.2) < 1e-9);
  assert.equal(padGap(a, { ...a, x: 0.1 }), 0);
  const corners = padCorners({ x: 0, y: 0, width: 2, height: 1, angle: 90 });
  assert.ok(corners.every(([x, y]) => Math.abs(Math.abs(x) - 0.5) < 1e-9 && Math.abs(Math.abs(y) - 1) < 1e-9));
  const outline = { start: [0, 0], end: [100, 60], radius: 5 };
  assert.ok(Math.abs(edgeDistance([50, 1], outline) - 1) < 1e-9);
  assert.ok(Math.abs(edgeDistance([5, 5], outline) - 5) < 1e-9);              // corner centre
  assert.ok(edgeDistance([0.5, 0.5], outline) < 0);                           // cut away by the radius
  assert.equal(segmentSegment([0, 0], [2, 2], [0, 2], [2, 0]), 0);
});

test('The Rev E board: values, locations and the one PCBWay finding', () => {
  const m = measure(board, { board: { min_track_clearance: '0.2010 mm' } });
  assert.equal(m.trackWidth.value, 0.2);
  assert.equal(m.clearance.value, 0.201);
  assert.equal(m.drill.value, 0.3);
  assert.equal(m.viaRing.value, 0.125);              // one 0.55/0.3 mm via
  assert.ok(m.copperToEdge.value > 0 && m.maskWeb.value > 0 && m.pthToTrack.value > 0);
  const rows = compare(m, capabilities);
  const ring = rows.find(r => r.id === 'viaRing').fabs;
  assert.deepEqual(ring.map(f => [f.fab, f.verdict, f.below]), [['jlcpcb', 'ok', 0], ['pcbway', 'below', 1]]);
  assert.ok(rows.find(r => r.id === 'silkscreen').fabs.every(f => f.verdict === 'unmeasured'));
});

test('Verdicts', () => {
  assert.equal(verdict(0.2, 0.1), 'ok');
  assert.equal(verdict(0.105, 0.1), 'tight');
  assert.equal(verdict(0.09, 0.1), 'below');
  assert.equal(verdict(0.2, null), 'unpublished');
  assert.equal(verdict(null, 0.1), 'unmeasured');
});
