import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardData } from '../tools/board-data.mjs';
import { fabCheck, pinNames, readPlacement, CENTROID_TOLERANCE_MM } from '../tools/fab-check.mjs';
import { insidePad, segmentDistance, hitTest } from '../web/fab-geometry.mjs';

const root = new URL('../', import.meta.url);
const pcbSource = readFileSync(new URL('src/pico_scale_controller.kicad_pcb', root), 'utf8');
const schSource = readFileSync(new URL('src/pico_scale_controller.kicad_sch', root), 'utf8');
const board = boardData(pcbSource);

// A placement file like the one the release writes: KiCad origins, Y flipped.
const cpl = rows => ['"Designator","Mid X","Mid Y","Layer","Rotation"', ...rows.map(r => `"${r.ref}","${r.x}","${-r.y}","${r.side}","${r.rotation}"`)].join('\n') + '\n';
const fromBoard = (ref, overrides = {}) => {
  const c = board.components.find(component => component.ref === ref);
  return { ref, x: c.x, y: c.y, side: c.layer === 'B.Cu' ? 'Bottom' : 'Top', rotation: c.rotation, ...overrides };
};

test('Pin names come from the schematic symbols (the datasheet check needs them)', () => {
  const names = pinNames(schSource);
  assert.deepEqual(names.get('Q4'), { 1: 'G', 2: 'S', 3: 'D' });
  assert.equal(names.get('D1')['1'], 'K');
  assert.equal(names.get('U5')['12'], 'DOUT');
});

test('Placement file Y is flipped back to board axes', () => {
  assert.deepEqual(readPlacement(cpl([{ ref: 'C1', x: 94.5, y: 117, side: 'Top', rotation: 180 }])).get('C1'), { x: 94.5, y: 117, rotation: 180, side: 'top' });
});

test('Centred parts pass; parts placed by pin 1 are reported', () => {
  const result = fabCheck({ pcbSource, schSource, board, placementCsv: cpl(['Q4', 'U5', 'J4'].map(ref => fromBoard(ref))), placementName: 'cpl.csv' });
  const q4 = result.parts.find(p => p.ref === 'Q4');
  assert.equal(q4.body.source, 'courtyard');
  assert.ok(q4.placement.offsetMm < CENTROID_TOLERANCE_MM);
  assert.deepEqual(q4.pads.map(p => `${p.number}${p.name}=${p.net}`), ['1G=USB5', '2S=SYS_PRE', '3D=BAT_P']);
  // The JST connector's footprint origin is pin 1, not the middle of the body.
  assert.deepEqual(result.findings.map(f => f.ref), ['J4']);
  assert.match(result.findings[0].message, /mm from the courtyard centre and [\d.]+ mm from the pad centre/);
  assert.match(result.findings[0].message, /confirm the position/);
});

test('Wrong side, unknown parts and rotation corrections are caught', () => {
  const result = fabCheck({ pcbSource, schSource, board, placementCsv: cpl([fromBoard('C1', { side: 'Bottom' }), { ref: 'X99', x: 100, y: 100, side: 'Top', rotation: 0 }, fromBoard('U5', { rotation: (fromBoard('U5').rotation + 90) % 360 })]), placementName: 'cpl.csv' });
  const errors = result.findings.filter(f => f.severity === 'error').map(f => f.ref).sort();
  assert.deepEqual(errors, ['C1', 'X99']);
  assert.equal(result.parts.find(p => p.ref === 'U5').placement.rotationDifference, 90);
});

test('Only factory-placed parts are checked for missing paste', () => {
  // The Pico module's pads have no paste: fine when it is fitted by hand, a finding when placed by the factory.
  const without = fabCheck({ pcbSource, schSource, board, placementCsv: cpl([fromBoard('C1')]), placementName: 'cpl.csv' });
  assert.ok(!without.findings.some(f => f.ref === 'J2'));
  const withPico = fabCheck({ pcbSource, schSource, board, placementCsv: cpl([fromBoard('J2')]), placementName: 'cpl.csv' });
  assert.ok(withPico.findings.some(f => f.ref === 'J2' && /no solder paste/.test(f.message)));
});

test('Without a placement file only the design is described', () => {
  const result = fabCheck({ pcbSource, schSource, board });
  assert.equal(result.placementFile, null);
  assert.deepEqual(result.findings, []);
  assert.ok(result.parts.every(p => p.placement === null));
});

test('Hit-testing finds rotated pads, tracks and part bodies', () => {
  const pad = { x: 10, y: 10, width: 2, height: 0.5, angle: 90 };
  assert.ok(insidePad(pad, [10, 10.9]));   // rotated 90°: long axis is now vertical
  assert.ok(!insidePad(pad, [10.9, 10]));
  assert.equal(segmentDistance([1, 1], [0, 0], [2, 0]), 1);
  const check = fabCheck({ pcbSource, schSource, board });
  const q4 = check.parts.find(p => p.ref === 'Q4'), pad1 = q4.pads.find(p => p.number === '1');
  const hit = hitTest(check, board, [pad1.x, pad1.y], { only: 'top' });
  assert.equal(hit.kind, 'pad'); assert.equal(hit.part.ref, 'Q4'); assert.equal(hit.net, 'USB5');
  const segment = board.segments.find(s => s.net && s.layer === 'F.Cu');
  const middle = [(segment.start[0] + segment.end[0]) / 2, (segment.start[1] + segment.end[1]) / 2];
  const onTrack = hitTest(check, board, middle, { only: 'top' });
  assert.ok(onTrack.kind === 'track' || onTrack.kind === 'pad');
  assert.equal(hitTest(check, board, [0, 0], { only: 'top' }), null);
});

test('A rotation sign error in pad hit-testing would be caught at 45°', () => {
  const pad = { x: 0, y: 0, width: 4, height: 0.4, angle: 45 };
  // KiCad turns counter-clockwise on screen with Y down: the long axis runs up-right.
  assert.ok(insidePad(pad, [1, -1]));
  assert.ok(!insidePad(pad, [1, 1]));
});

test('Hidden copper is never identified; the facing side is tried first', () => {
  const check = fabCheck({ pcbSource, schSource, board });
  const bz1 = check.parts.find(p => p.ref === 'BZ1'), pad = bz1.pads[0];
  assert.equal(hitTest(check, board, [pad.x, pad.y], { only: 'bottom' }).part.ref, 'BZ1');
  const top = hitTest(check, board, [pad.x, pad.y], { only: 'top' });
  assert.ok(!top || top.part?.ref !== 'BZ1');
  const preferred = hitTest(check, board, [pad.x, pad.y], { prefer: 'top' });
  assert.ok(preferred.kind !== 'pad' || preferred.part.side === 'top' || top === null);
});

test('A malformed placement file stops the build', () => {
  const header = '"Designator","Mid X","Mid Y","Layer","Rotation"\n';
  assert.throws(() => readPlacement('Ref,PosX,PosY,Rot,Side\n"C1",1,2,0,top\n'), /needs the columns/);
  assert.throws(() => readPlacement(header + '"C1","abc","-2","Top","0"\n'), /non-numeric/);
  assert.throws(() => readPlacement(header + '"C1","","-2","Top","0"\n'), /non-numeric/);
  assert.throws(() => readPlacement(header + '"C1","1","-2","Top","0"\n"C1","1","-2","Top","0"\n'), /appears twice/);
  assert.throws(() => readPlacement(header + '"C1","1","-2","Middle","0"\n'), /expected Top or Bottom/);
});

test('KiCad text markup is removed from pin names', () => {
  const names = [...pinNames(schSource).values()].flatMap(map => Object.values(map));
  assert.ok(!names.some(name => /[_^~]\{/.test(name)));
});
