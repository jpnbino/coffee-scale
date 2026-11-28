import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardData } from '../tools/board-data.mjs';
import { fabCheck } from '../tools/fab-check.mjs';
import { mechanicsFeatures } from '../web/mechanics-model.mjs';

const pcbSource = readFileSync(new URL('../src/pico_scale_controller.kicad_pcb', import.meta.url), 'utf8');
const schSource = readFileSync(new URL('../src/pico_scale_controller.kicad_sch', import.meta.url), 'utf8');
const board = boardData(pcbSource), check = fabCheck({ pcbSource, schSource, board });

test('Mounting holes and edge parts in package coordinates', () => {
  const f = mechanicsFeatures(board, check, { origin: [85, 74] });
  assert.deepEqual(f.size, [100, 60]);
  assert.equal(f.holes.length, 4);
  assert.ok(f.holes.every(h => h.drillMm === 3.2 && h.at[0] > 0 && h.at[1] > 0 && h.at[0] < 100 && h.at[1] < 60));
  const byRef = Object.fromEntries(f.parts.map(p => [p.ref, p]));
  for (const ref of ['J1', 'J4', 'SW1', 'SW6']) assert.ok(byRef[ref]?.edge, `${ref} meets the edge`);
  assert.ok(byRef.SW1.overhangMm > 3);                    // the thumbwheel overhangs the outline
  assert.ok(byRef.J2.large);                              // the Pico module
  assert.ok(!byRef.R6, 'tiny parts near the edge are left out');
  assert.equal(f.parts[0].edge !== null, true);           // edge parts first
});

test('Without part outlines only holes are reported', () => {
  const f = mechanicsFeatures(board, null);
  assert.equal(f.parts.length, 0);
  assert.equal(f.holes.length, 4);
});
