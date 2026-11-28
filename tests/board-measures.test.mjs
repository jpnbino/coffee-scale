import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSexpr } from '../tools/kicad-sexpr.mjs';
import { boardData } from '../tools/board-data.mjs';
import { boardMeasures, silkscreen, pourPolygons, ring, insideRing, holeToRing, toBoard } from '../tools/board-measures.mjs';
import { measure, compare, segmentSegment } from '../web/manufacturability.mjs';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

// A minimal board: a rounded 0..40 × 0..30 outline, one footprint rotated 90°,
// board silkscreen, a GND pour with a via antipad slit into it, and a via on another net.
const pcb = (extra = '') => `(kicad_pcb (version 20260206) (generator "test")
  (net 0 "") (net 1 "/GND") (net 2 "/SIG")
  (gr_rect (start 0 0) (end 40 30) (radius 2) (stroke (width 0.05) (type solid)) (fill no) (layer "Edge.Cuts"))
  (gr_line (start 1 1) (end 5 1) (stroke (width 0.1) (type default)) (layer "F.SilkS"))
  (gr_line (start 1 2) (end 5 2) (stroke (width 0.05) (type default)) (layer "F.Fab"))
  (gr_poly (pts (xy 1 3) (xy 2 3) (xy 2 4)) (stroke (width 0) (type solid)) (fill yes) (layer "F.SilkS"))
  (gr_text "LOGO" (at 30 5 0) (layer "B.SilkS") (effects (font (size 1.2 1.2) (thickness 0.18))))
  (gr_text "FACE" (at 30 8 0) (layer "F.SilkS") (effects (font (face "Arial") (size 1.5 1.5))))
  (footprint "Lib:R_0603" (layer "F.Cu") (at 20 15 90)
    (property "Reference" "R1" (at 0 -1.5 90) (layer "F.SilkS") (effects (font (size 0.7 0.7) (thickness 0.11))))
    (property "Value" "10k" (at 0 1.5 90) (layer "F.SilkS") (hide yes) (effects (font (size 0.5 0.5) (thickness 0.05))))
    (fp_text user "\${REFERENCE}" (at 0 0 0) (layer "F.Fab") (effects (font (size 0.3 0.3) (thickness 0.04))))
    (fp_line (start 1 0.5) (end 2 0.5) (stroke (width 0.13) (type solid)) (layer "F.SilkS"))
    (fp_rect (start -1 -1) (end 1 1) (stroke (width 0.05) (type solid)) (fill yes) (layer "F.SilkS"))
    (pad "1" thru_hole circle (at 3 0 90) (size 1.6 1.6) (drill 0.8) (layers "*.Cu") (net 2 "/SIG")))
  (via (at 10 10) (size 0.6) (drill 0.3) (layers "F.Cu" "B.Cu") (net 2))
  (zone (net 1) (net_name "/GND") (layer "F.Cu")
    (polygon (pts (xy 1 1) (xy 39 1) (xy 39 29) (xy 1 29)))
    (filled_polygon (layer "F.Cu") (pts
      (xy 1.5 1.5) (xy 38.5 1.5) (xy 38.5 28.5) (xy 1.5 28.5) (xy 1.5 10)
      (xy 9.5 10) (xy 10 9.5) (xy 10.5 10) (xy 10 10.5) (xy 9.5 10) (xy 1.5 10))))
  ${extra})`;

test('Footprint-local points turn counter-clockwise on screen', () => {
  assert.deepEqual(toBoard([20, 15, 90], [1, 0]), [20, 14]);
  assert.deepEqual(toBoard([20, 15, 0], [1, 0.5]), [21, 15.5]);
});

test('Silkscreen: lines and text on silk layers only, filled shapes and hidden text left out', () => {
  const s = silkscreen(parseSexpr(pcb()));
  assert.equal(s.lineWidth.value, 0.1);                      // the board line, not the 0.05 Fab line
  assert.equal(s.lineWidth.count, 2);                        // board line + R1 fp_line
  assert.equal(s.excluded.filledShapes, 2);                  // filled gr_poly and fp_rect
  assert.equal(s.textHeight.value, 0.7);
  assert.equal(s.textHeight.where.ref, 'R1');
  assert.match(s.textHeight.where.label, /R1 reference “R1” \(R_0603\)/);
  assert.deepEqual(s.textHeight.where.at, [18.5, 15]);       // (0, -1.5) turned 90°
  assert.equal(s.textHeight.count, 3);                       // R1, LOGO, FACE; the hidden value is skipped
  assert.equal(s.excluded.hiddenText, 1);
  assert.equal(s.textThickness.value, 0.11);
  assert.equal(s.textThickness.count, 2);                    // the TrueType text has no stroke
  assert.equal(s.excluded.outlineFontText, 1);
  // Old-style bare hide flag and a zero-width unfilled line.
  const old = silkscreen(parseSexpr(pcb('(gr_text "X" (at 1 1) (layer "F.SilkS") hide (effects (font (size 0.2 0.2) (thickness 0.02)))) (gr_line (start 0 0) (end 1 0) (stroke (width 0) (type solid)) (layer "F.SilkS"))')));
  assert.equal(old.textHeight.value, 0.7);
  assert.equal(old.excluded.zeroWidthLines, 1);
});

test('Pour geometry: fractured outlines, inside test and hole distances', () => {
  const [poly] = pourPolygons(parseSexpr(pcb()));
  assert.equal(poly.net, 'GND');
  assert.equal(poly.layer, 'F.Cu');
  assert.ok(insideRing([5, 5], poly));
  assert.ok(!insideRing([10, 10], poly));                    // in the slit-in antipad
  assert.ok(!insideRing([0.5, 0.5], poly));
  // Via at (10, 10), hole radius 0.15; the antipad diamond's edges are 0.5/√2 from the centre.
  close(holeToRing({ a: [10, 10], b: [10, 10], r: 0.15 }, poly), 0.5 / Math.SQRT2 - 0.15);
  assert.equal(holeToRing({ a: [5, 5], b: [5, 5], r: 0.15 }, poly), 0);  // centre in copper
  // The chunk prefilter agrees with a brute-force search on a long ring.
  const circle = ring(Array.from({ length: 2000 }, (_, i) => [50 + 10 * Math.cos(i * Math.PI / 1000), 50 + 10 * Math.sin(i * Math.PI / 1000)]));
  for (const p of [[50, 50], [55, 52], [62, 50], [30, 30]]) {
    const hole = { a: p, b: p, r: 0.2 };
    let brute = Infinity;
    for (let i = 0; i < circle.points.length; i++) brute = Math.min(brute, segmentSegment(p, p, circle.points[i], circle.points[(i + 1) % circle.points.length]) - 0.2);
    const fast = holeToRing(hole, circle);
    close(fast, insideRing(p, circle) ? 0 : brute);
  }
});

test('Board measures: pour to edge, and to holes of other nets only', () => {
  const m = boardMeasures(pcb());
  assert.equal(m.pours.filledPolygons, 1);
  close(m.pours.toEdge.value, 2 - Math.hypot(0.5, 0.5), 0.001); // the fill's square corner against the 2 mm outline radius
  assert.equal(m.pours.toEdge.where.net, 'GND');
  close(m.pours.viaHoleToPour.value, Math.round((0.5 / Math.SQRT2 - 0.15) * 1000) / 1000);
  assert.equal(m.pours.viaHoleToPour.where.net, 'SIG');
  // R1 pad 1 (SIG) is at (20, 12) inside the copper: reported as 0, which a real fill never has.
  assert.equal(m.pours.padHoleToPour.value, 0);
  assert.equal(m.pours.padHoleToPour.where.ref, 'R1');
  // A GND via is the pour's own net and is not measured.
  const same = boardMeasures(pcb().replace('(net 2))\n  (zone', '(net 1))\n  (zone'));
  assert.equal(same.pours.viaHoleToPour, null);
});

test('The Rev E board: silkscreen and pour measurements', () => {
  const source = readFileSync(new URL('../src/pico_scale_controller.kicad_pcb', import.meta.url), 'utf8');
  const capabilities = JSON.parse(readFileSync(new URL('../fab-capabilities.json', import.meta.url), 'utf8'));
  const m = boardMeasures(source), s = m.silkscreen, p = m.pours;
  // Values observed on the board as committed (KiCad sizes, saved fills).
  close(s.lineWidth.value, 0.1, 1e-6);                       // board artwork lines; footprint lines are 0.12 mm
  assert.equal(s.lineWidth.where.layer, 'F.SilkS');
  close(s.textHeight.value, 0.8, 1e-6);
  close(s.textThickness.value, 0.12, 1e-6);
  assert.ok(s.textHeight.count >= 20 && s.lineWidth.count >= 300);
  assert.ok(p.filledPolygons >= 2 && p.points > 1000);
  close(p.toEdge.value, 0.5, 0.01);
  assert.equal(p.toEdge.where.net, 'GND');
  close(p.viaHoleToPour.value, 0.4, 0.01);
  close(p.padHoleToPour.value, 0.475, 0.01);
  assert.ok([p.toEdge, p.viaHoleToPour, p.padHoleToPour].every(x => x.value > 0));

  const board = boardData(source), withMeasures = measure(board, null, m), without = measure(board, null);
  assert.equal(without.silkscreen, null);
  assert.equal(without.silkText, null);
  assert.ok(withMeasures.copperToEdge.value <= without.copperToEdge.value);
  assert.equal(withMeasures.copperToEdge.value, p.toEdge.value);      // the pour is nearer the edge than any track, via or pad
  assert.ok(withMeasures.pthToTrack.value <= without.pthToTrack.value);
  assert.ok(withMeasures.viaToTrack.value <= without.viaToTrack.value);
  const rows = Object.fromEntries(compare(withMeasures, capabilities).map(r => [r.id, Object.fromEntries(r.fabs.map(f => [f.fab, f.verdict]))]));
  assert.deepEqual(rows.silkscreen, { jlcpcb: 'below', pcbway: 'below' }); // 0.1 and 0.12 mm lines against 0.15 mm
  assert.deepEqual(rows.silkText, { jlcpcb: 'below', pcbway: 'tight' });   // 0.8 mm text against 1.0 / 0.8 mm
  assert.equal(rows.copperToEdge.jlcpcb, 'ok');
});

test('The method note says what is measured', async () => {
  const { methodNote } = await import('../web/statistics.mjs');
  assert.match(methodNote(null), /Copper pours are not included.*Silkscreen is not measured/);
  const note = methodNote(boardMeasures(pcb()));
  assert.doesNotMatch(note, /not included|not measured/);
  assert.match(note, /1 filled copper areas/);
});
