// Mechanical handoff data derived from the exported IPC-2581 (formerly Build-Mechanical.ps1).
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileDigest, readJson, resolveChildPath, toMillimetres, writeJson } from './lib/common.mjs';
import { ipcComponents, writeCsv } from './lib/formats.mjs';

const round6 = value => Math.round(value * 1e6) / 1e6;

export function buildMechanical({ root, output, config }) {
  const components = ipcComponents(readFileSync(`${output}/assembly/board.ipc2581.xml`, 'utf8'));
  const origin = config.mechanical.originAbsoluteMm;
  const rows = components.map(({ attributes, location, xform }) => {
    if (!location) throw new Error(`IPC-2581 component without a location: ${attributes.refDes}`);
    return {
      Reference: attributes.refDes,
      Xmm: round6(Number(location.x) - origin[0]),
      Ymm: round6(-Number(location.y) - origin[1]),
      IPC_Rotation: xform ? (xform.rotation ?? '') : '0',
      IPC_Mirror: xform ? (xform.mirror ?? '') : 'false',
      Side: attributes.layerRef ?? '',
      Package: attributes.packageRef ?? '',
    };
  }).sort((a, b) => (a.Reference < b.Reference ? -1 : a.Reference > b.Reference ? 1 : 0));
  writeCsv(`${output}/mechanical/component-origins.csv`, rows);
  const reviewed = fileDigest(`${output}/source/${config.project.basename}.kicad_pcb`) === config.mechanical.referenceBoardSha256;
  writeJson(`${output}/mechanical/interface.json`, {
    units: 'mm', coordinateConvention: 'Top-left PCB outline; X right / Y down, top view', originAbsoluteMm: origin,
    rotationConvention: 'IPC-2581 rotation with separate mirror flag; not a pick-and-place rotation',
    board: config.manufacturing, componentOrigins: rows, referenceReviewedForCurrentBoard: reviewed, assumptions: config.mechanical.assumptions,
  });
  copyFileSync(resolveChildPath(root, config.mechanical.reference), `${output}/mechanical/enclosure-reference-PROVISIONAL.json`);

  const stats = readJson(`${output}/reports/board-statistics.json`);
  if (rows.length !== stats.components.total.total) throw new Error('IPC-2581 component count differs from the board statistics.');
  const hole = config.manufacturing.mountingHoleMm;
  const matching = stats.drill_holes.filter(drill => !drill.plated && Math.abs(toMillimetres(drill.x_size) - hole) < 0.001);
  const holes = rows.filter(row => ['H1', 'H2', 'H3', 'H4'].includes(row.Reference));
  if (holes.length !== 4 || matching.reduce((sum, drill) => sum + drill.count, 0) !== 4) throw new Error('Expected four mounting-hole features were not found.');

  const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  for (const h of holes) dxf.push('0', 'CIRCLE', '8', 'MOUNTING_HOLES', '10', String(h.Xmm), '20', String(-h.Ymm), '30', '0', '40', String(hole / 2));
  dxf.push('0', 'ENDSEC', '0', 'EOF');
  writeFileSync(`${output}/mechanical/mounting-holes-local.dxf`, dxf.join('\n') + '\n', 'ascii');

  writeFileSync(`${output}/mechanical/README.md`, `# Mechanical handoff

Populated and bare-board STEP: local XY origin at the top-left outline corner;
X right, Y up. Mounting-hole DXF uses the same local XY convention.
outline-absolute.dxf uses native absolute KiCad XY coordinates; translate by
(-${origin[0]}, +${origin[1]}) mm to align it with the STEP/hole DXF.
component-origins.csv and interface.json use X right, Y down for top-view drawings.
STEP Z follows KiCad export; inspect top and bottom clearances in your CAD tool.

Reference assumptions reviewed for current PCB hash: ${reviewed}.
The enclosure reference is PROVISIONAL; do not mistake its assumed display
height or missing socket/battery/load-cell envelopes for measured geometry.
`, 'utf8');
}
