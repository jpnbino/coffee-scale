import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardData } from '../tools/board-data.mjs';
import { stackupData } from '../tools/build-viewer-data.mjs';
import { copperWeightMm, orderChecks, trackCurrentA, trackWidths, swatch } from '../web/stackup-model.mjs';

const pcb = readFileSync(new URL('../src/pico_scale_controller.kicad_pcb', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const stackup = stackupData(pcb), board = boardData(pcb);

test('The release order settings describe the board KiCad defines', () => {
  const result = orderChecks(stackup, config.manufacturing, board.bounds);
  assert.deepEqual(result.rows.filter(row => !row.agrees), []);
  assert.equal(result.sum.totalMm, 1.6);
  assert.ok(result.agrees);
});

test('A drifted setting is caught', () => {
  for (const [key, value] of [['copperWeight', '2 oz'], ['finish', 'HASL'], ['mask', 'Green'], ['thicknessMm', 1.2], ['widthMm', 90]]) {
    const result = orderChecks(stackup, { ...config.manufacturing, [key]: value }, board.bounds);
    assert.equal(result.agrees, false, key);
  }
});

test('Copper weights convert to thickness', () => {
  assert.equal(copperWeightMm('1 oz'), 0.035);
  assert.equal(copperWeightMm('0.5 oz'), 0.0175);
  assert.equal(copperWeightMm('35 um'), null);
});

test('IPC-2221 estimate matches the published curve', () => {
  // 10 mil wide, 1 oz (1.378 mil) outer track, 10 °C rise: 0.048 · 10^0.44 · 13.78^0.725 ≈ 0.89 A.
  assert.ok(Math.abs(trackCurrentA(0.254, 0.035) - 0.89) < 0.01);
  assert.ok(trackCurrentA(0.4, 0.035) > trackCurrentA(0.2, 0.035));
});

test('Track widths per net put the narrowest width first', () => {
  const nets = trackWidths(board);
  const latch = nets.find(n => n.net === 'SYS_LATCH');
  assert.ok(latch.widths.length >= 1);
  assert.ok(latch.widths.every((w, i, all) => i === 0 || all[i - 1].widthMm <= w.widthMm));
  assert.ok(nets.every(n => !n.net.startsWith('/')));
});

test('Stackup colours become drawing colours', () => {
  assert.equal(swatch({ type: 'Top Solder Mask', color: 'Black' }), '#262626');
  assert.equal(swatch({ type: 'Top Silk Screen', color: 'White' }), '#f4f4f1');
  assert.equal(swatch({ type: 'copper' }), '#c88c43');
});
