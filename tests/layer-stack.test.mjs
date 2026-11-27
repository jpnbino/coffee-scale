import test from 'node:test';
import assert from 'node:assert/strict';
import { stackRows, drawOrder, coreLabel } from '../web/layer-stack.mjs';

const layers = ['.gbl', '.gbs', '.gbo', '.gm1', '.gtl', '.gts', '.gto', '.drl', '.drl', '.gbp', '.gtp'].map((kind, i) => ({ kind, label: kind, name: i === 7 ? 'x-NPTH.drl' : `f${i}` }));
const kinds = list => list.map(l => l.kind);

test('The panel lists layers top surface to bottom, core between the copper', () => {
  const rows = stackRows(layers).map(r => r.type === 'layer' ? r.layer.kind : r.type === 'core' ? 'core' : `#${r.label}`);
  assert.deepEqual(stackRows(layers).filter(r => r.layer?.kind === '.drl').map(r => r.name), ['Non-plated holes', 'Plated holes and slots']);
  assert.deepEqual(rows, ['#Top side', '.gto', '.gtp', '.gts', '.gtl', 'core', '#Bottom side', '.gbl', '.gbs', '.gbp', '.gbo', '#Drills and outline', '.drl', '.drl', '.gm1']);
});

test('The side facing the viewer is painted last; drills and outline always on top', () => {
  assert.deepEqual(kinds(drawOrder(layers)), ['.gbo', '.gbp', '.gbs', '.gbl', '.gtl', '.gts', '.gtp', '.gto', '.drl', '.drl', '.gm1']);
  assert.deepEqual(kinds(drawOrder(layers, true)), ['.gto', '.gtp', '.gts', '.gtl', '.gbl', '.gbs', '.gbp', '.gbo', '.drl', '.drl', '.gm1']);
});

test('Core label comes from the stackup export', () => {
  assert.equal(coreLabel({ layers: [{ name: 'F.Cu', type: 'copper', thicknessMm: 0.035 }, { name: 'dielectric 1', type: 'core', thicknessMm: 1.51, material: 'FR4' }] }), 'Core · FR4 · 1.51 mm');
  assert.equal(coreLabel(null), 'Core');
});
