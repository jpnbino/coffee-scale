import test from 'node:test';
import assert from 'node:assert/strict';
import { apertureShape, readFlashes } from '../tools/gerber-flashes.mjs';
import { pasteCoverage } from '../tools/fab-check.mjs';

const gerber = body => `%FSLAX46Y46*%\n%MOMM*%\n%AMRoundRect*\n1,1,$1*%\n${body}\nM02*\n`;

test('Aperture sizes and areas, including KiCad RoundRect', () => {
  assert.deepEqual(apertureShape('R', ['2', '1']), { width: 2, height: 1, area: 2 });
  assert.ok(Math.abs(apertureShape('C', ['1']).area - Math.PI / 4) < 1e-9);
  // 0.8 × 0.95 mm pad with 0.2 mm corners: 0.76 − (4 − π)·0.04.
  const rr = apertureShape('RoundRect', '0.2X-0.2X-0.275X0.2X-0.275X0.2X0.275X-0.2X0.275X0'.split('X'));
  assert.ok(Math.abs(rr.width - 0.8) < 1e-9 && Math.abs(rr.height - 0.95) < 1e-9);
  assert.ok(Math.abs(rr.area - (0.76 - (4 - Math.PI) * 0.04)) < 1e-9);
});

test('Flashes carry their part, pad and board coordinates (Y down)', () => {
  const { flashes } = readFlashes(gerber('%ADD10R,1.000000X2.000000*%\nD10*\n%TO.P,U1,1*%\nX10000000Y-20000000D03*\n%TO.P,U1,2*%\nX12000000D03*\n%TD*%'));
  assert.deepEqual(flashes.map(f => [f.ref, f.pad, f.x, f.y]), [['U1', '1', 10, 20], ['U1', '2', 12, 20]]);
  assert.throws(() => readFlashes('%FSLAX46Y46*%\n%MOIN*%\n'), /millimetre/);
});

test('Paste coverage: openings over copper, stacked duplicates counted once', () => {
  const pad = (number, x, extra = {}) => ({ number, x, y: 0, width: 1, height: 1, angle: 0, type: 'smd', ...extra });
  const parts = [{ ref: 'U1', side: 'top', pads: [pad('1', 0), pad('2', 5), pad('EP', 10, { width: 2, height: 2 })] }];
  const copper = gerber('%ADD10R,1.000000X1.000000*%\n%ADD11R,2.000000X2.000000*%\nD10*\n%TO.P,U1,1*%\nX0Y0D03*\n%TO.P,U1,2*%\nX5000000Y0D03*\nD11*\n%TO.P,U1,EP*%\nX10000000Y0D03*');
  const paste = gerber('%ADD10R,1.000000X1.000000*%\n%ADD11R,0.800000X0.800000*%\nD10*\n%TO.C,U1*%\nX0Y0D03*\nX0Y0D03*\nX5000000Y0D03*\nD11*\nX9500000Y-500000D03*\nX10500000Y-500000D03*\nX9500000Y500000D03*\nX10500000Y500000D03*');
  pasteCoverage(parts, [paste], [['top', copper]]);
  const [p1, p2, ep] = parts[0].pads;
  assert.equal(p1.pasteCoverage, 1);      // two identical openings count once
  assert.equal(p2.pasteCoverage, 1);
  assert.equal(ep.pasteOpenings, 4);
  assert.equal(ep.pasteCoverage, 0.64);   // 4 × 0.64 mm² over 4 mm²
});
