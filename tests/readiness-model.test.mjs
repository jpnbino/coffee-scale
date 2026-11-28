import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBom, groupBlockers, readiness } from '../web/readiness-model.mjs';

const part = (Reference, Value, Footprint, Stage = 'factory', extra = {}) => ({ Reference, Value, Footprint, Stage, Side: 'top', MPN: '', Manufacturer: '', Supplier: '', SupplierPart: '', Verified: false, Notes: '', ...extra });
const parts = [part('C10', '100n', 'Capacitor_SMD:C_0603'), part('C2', '100n', 'Capacitor_SMD:C_0603'), part('C1', '10u', 'Capacitor_SMD:C_0603'),
  part('J2', 'Pico W', 'Scale:Pico', 'manual', { Notes: 'choose sockets' }), part('H1', 'Hole', 'MountingHole', 'mechanical')];

test('Identical lines are grouped with natural reference order, factory parts first', () => {
  const groups = groupBom(parts);
  assert.deepEqual(groups.map(g => [g.qty, g.refs.join(',')]), [[1, 'C1'], [2, 'C2,C10'], [1, 'J2'], [1, 'H1']]);
  assert.equal(groups[1].footprint, 'C_0603');
});

test('Different part numbers are never merged', () => {
  const groups = groupBom([part('R1', '10k', 'R_0603', 'factory', { MPN: 'A' }), part('R2', '10k', 'R_0603', 'factory', { MPN: 'B' })]);
  assert.equal(groups.length, 2);
});

test('Blockers are grouped by reason, largest group first', () => {
  const groups = groupBlockers(['R9: manufacturer/MPN missing', 'R18: manufacturer/MPN missing', 'R9: part and placement not reviewed', 'loose line']);
  assert.deepEqual(groups[0], { reason: 'manufacturer/MPN missing', refs: ['R9', 'R18'] });
  assert.equal(groups.length, 3);
});

test('Readiness separates bare and assembled orders and never claims more than the records show', () => {
  const check = { findings: [{ kind: 'placement', ref: 'J4', message: 'Placement point is 2.65 mm…' }], parts: [{ pads: [{ name: 'G' }, { name: 'S' }] }, { pads: [{ name: 'Pin_1' }] }] };
  const result = readiness({ validation: 'checks passed', order: { agrees: true }, parts, assembly: { ready: false }, check });
  assert.equal(result.bareState, 'pending');          // no manufacturability rows were given
  assert.equal(result.assembledState, 'todo');
  assert.ok(result.assembled.some(i => i.text.includes('0 of 3 factory-placed parts have a manufacturer part number')));
  assert.ok(result.assembled.some(i => i.text.includes('1 placement item to review (J4)')));
  assert.ok(result.assembled.some(i => i.text.startsWith('1 pin map to compare')));
  assert.deepEqual(result.hand.map(h => h.ref), ['J2']);
  const bad = readiness({ validation: 'x', order: { agrees: false }, parts, assembly: { ready: false }, check });
  assert.equal(bad.bareState, 'todo');
});
