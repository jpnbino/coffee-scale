// Interactive viewer data: KiCad 10 net numbering for the viewer copy,
// schematic net tracing, and the viewer-only colour themes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { numberViewerNets } from '../tools/build-viewer-data.mjs';
import { placePin, schematicNets } from '../tools/schematic-nets.mjs';
import { boardData } from '../tools/board-data.mjs';
import { children, parseSexpr } from '../tools/kicad-sexpr.mjs';
import { PALETTES, applyPalette, parseColour, snapshotTheme } from '../web/viewer-themes.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const revisions = ['src', 'src/concept-revD', 'src/revision-revE'];

test('viewer net numbering rewrites references, adds a table and leaves text alone', () => {
  const board = '(kicad_pcb\n\t(gr_text "(net \\"x\\")")\n\t(footprint "R" (pad "1" (net "/A")) (pad "2" (net "/B")))\n\t(segment (net "/A")) ; (net "/C")\n)';
  const { content, nets, references } = numberViewerNets(board);
  assert.deepEqual(nets, ['/A', '/B']); assert.equal(references, 3);
  assert.match(content, /\t\(net 0 ""\)\n\t\(net 1 "\/A"\)\n\t\(net 2 "\/B"\)\n\t\(footprint/);
  assert.match(content, /\(pad "1" \(net 1 "\/A"\)\)/); assert.match(content, /\(segment \(net 1 "\/A"\)\) ; \(net "\/C"\)/);
  assert.match(content, /\(gr_text "\(net \\"x\\"\)"\)/);
  assert.equal(numberViewerNets(content).content, content, 'already-numbered boards are unchanged');
});

for (const dir of revisions) {
  test(`viewer copy of ${dir} board differs only by net numbering`, () => {
    const source = read(`${dir}/pico_scale_controller.kicad_pcb`), result = numberViewerNets(source);
    assert.ok(result.nets.length > 50);
    const strip = node => Array.isArray(node) ? (node[0] === 'net' ? ['net', node.at(-1)] : node.map(strip)) : node;
    const viewer = parseSexpr(result.content);
    assert.equal(children(viewer, 'net').length, result.nets.length + 1);
    assert.deepEqual(strip(viewer.filter(item => !(Array.isArray(item) && item[0] === 'net'))), strip(parseSexpr(source)));
  });

  test(`schematic net tracing for ${dir} matches every board net without conflicts`, () => {
    const nets = schematicNets(read(`${dir}/pico_scale_controller.kicad_sch`), boardData(read(`${dir}/pico_scale_controller.kicad_pcb`)));
    assert.deepEqual(nets.conflicts, []); assert.deepEqual(nets.missing, []); assert.equal(nets.unassignedGroups, 0);
    // Every traced pin must belong to the PCB net it is filed under.
    const pads = new Map(boardData(read(`${dir}/pico_scale_controller.kicad_pcb`)).components.flatMap(c => c.pads.map(p => [`${c.ref}.${p.number}`, p.net])));
    for (const [name, geometry] of Object.entries(nets.nets)) for (const [, , ref, pin] of geometry.pins) {
      if (pads.has(`${ref}.${pin}`)) assert.equal(pads.get(`${ref}.${pin}`), name, `${ref}.${pin}`);
    }
  });
}

test('PWR_FLAG markers do not join the nets they flag', () => {
  const nets = schematicNets(read('src/pico_scale_controller.kicad_sch'), boardData(read('src/pico_scale_controller.kicad_pcb')));
  const flagged = Object.entries(nets.nets).filter(([, g]) => g.pins.some(p => String(p[2]).startsWith('#FLG'))).map(([name]) => name);
  assert.ok(flagged.length >= 2, 'flags sit on several distinct nets');
});

test('symbol pin placement follows KiCad rotation and mirroring', () => {
  // Library Y points up; schematic Y points down.
  assert.deepEqual(placePin([100, 50, 0], '', [0, 3.81]), [100, 46.19]);
  assert.deepEqual(placePin([100, 50, 90], '', [0, 3.81]), [96.19, 50]);
  assert.deepEqual(placePin([100, 50, 180], '', [0, 3.81]), [100, 53.81]);
  assert.deepEqual(placePin([100, 50, 270], '', [0, 3.81]), [103.81, 50]);
  assert.deepEqual(placePin([100, 50, 0], 'y', [2.54, 0]), [97.46, 50]);
  assert.deepEqual(placePin([100, 50, 0], 'x', [0, 3.81]), [100, 53.81]);
  assert.throws(() => placePin([0, 0, 45], '', [1, 0]), /rotation/);
});

class Colour { constructor(r, g, b, a = 1) { Object.assign(this, { r, g, b, a }); } }

test('viewer palettes parse, apply in place and restore', () => {
  assert.deepEqual(parseColour('#ff0080'), [1, 0, 128 / 255, 1]);
  assert.equal(parseColour('#00000080')[3], 128 / 255);
  assert.throws(() => parseColour('red'));
  const theme = { background: new Colour(0, 0, 0), copper: { f: new Colour(0, 0, 0), b: new Colour(0, 0, 0) }, note: 'not a colour' };
  const original = snapshotTheme(theme);
  applyPalette(theme, { background: '#f5f4ef', copper: { f: '#c83434' }, unknown: '#ffffff', note: '#ffffff' });
  assert.ok(theme.background instanceof Colour); assert.equal(Math.round(theme.background.r * 255), 245);
  assert.equal(Math.round(theme.copper.f.r * 255), 200); assert.equal(theme.copper.b.r, 0);
  assert.equal(theme.note, 'not a colour'); assert.ok(!('unknown' in theme));
  applyPalette(theme, original);
  assert.deepEqual(snapshotTheme(theme), original);
  for (const palette of Object.values(PALETTES)) for (const group of [palette.schematic, palette.board]) if (group) applyPalette(structuredClone(theme), group);
});
