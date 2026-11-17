// KiCad exports for a validated snapshot (formerly Export-Release.ps1).
import { ensureDir, runKiCad } from './lib/common.mjs';
import { buildMechanical } from './build-mechanical.mjs';

export function exportRelease({ root, output: o, config, kicad, pcb: p, sch: s, log }) {
  const run = args => runKiCad(kicad, args, log);
  run(['pcb', 'export', 'gerbers', '--output', `${o}/fabrication/gerbers`, '--layers', 'F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts', '--subtract-soldermask', '--check-zones', p]);
  run(['pcb', 'export', 'drill', '--output', `${o}/fabrication/gerbers`, '--format', 'excellon', '--excellon-units', 'mm', '--excellon-separate-th', '--excellon-oval-format', 'route', '--generate-report', '--report-path', `${o}/fabrication/drill-report.txt`, p]);
  run(['pcb', 'export', 'ipcd356', '--output', `${o}/fabrication/test-netlist.d356`, p]);
  run(['pcb', 'export', 'ipc2581', '--units', 'mm', '--output', `${o}/assembly/board.ipc2581.xml`, p]);
  ensureDir(`${o}/assembly/stencil`);
  run(['pcb', 'export', 'gerbers', '--output', `${o}/assembly/stencil`, '--layers', 'F.Paste,B.Paste,Edge.Cuts', p]);
  run(['pcb', 'export', 'pos', '--format', 'csv', '--units', 'mm', '--output', `${o}/assembly/positions-native.csv`, p]);
  run(['sch', 'export', 'netlist', '--format', 'kicadxml', '--output', `${o}/reports/netlist.xml`, s]);
  const bomFields = 'Reference,Value,Footprint,Manufacturer,MPN,Datasheet,DNP,EXCLUDE_FROM_BOM';
  run(['sch', 'export', 'bom', '--fields', bomFields, '--labels', bomFields, '--output', `${o}/assembly/bom-native.csv`, s]);
  run(['sch', 'export', 'pdf', '--output', `${o}/site/schematic.pdf`, s]);
  ensureDir(`${o}/site/schematic`);
  run(['sch', 'export', 'svg', '--output', `${o}/site/schematic`, s]);
  for (const side of ['top', 'bottom']) {
    const face = side === 'top' ? 'F' : 'B';
    run(['pcb', 'export', 'svg', '--layers', `${face}.Cu,${face}.SilkS,Edge.Cuts`, '--mode-single', '--fit-page-to-board', '--exclude-drawing-sheet', '--output', `${o}/site/pcb-${side}.svg`, p]);
    run(['pcb', 'export', 'pdf', '--layers', `${face}.Fab,${face}.SilkS,Edge.Cuts`, '--mode-single', '--sketch-pads-on-fab-layers', '--output', `${o}/assembly/assembly-${side}.pdf`, p]);
    run(['pcb', 'render', '--side', side, '--width', '1600', '--height', '1000', '--quality', 'basic', '--background', 'opaque', '--use-board-stackup-colors', '--output', `${o}/site/${side}.png`, p]);
  }
  run(['pcb', 'export', 'dxf', '--layers', 'Edge.Cuts', '--mode-single', '--output-units', 'mm', '--output', `${o}/mechanical/outline-absolute.dxf`, p]);
  const origin = config.mechanical.originAbsoluteMm.map(String).join('x') + 'mm';
  run(['pcb', 'export', 'step', '--force', '--subst-models', '--user-origin', origin, '--output', `${o}/mechanical/populated.step`, p]);
  run(['pcb', 'export', 'step', '--force', '--board-only', '--user-origin', origin, '--output', `${o}/mechanical/bare-board.step`, p]);
  run(['pcb', 'export', 'glb', '--force', '--subst-models', '--user-origin', origin, '--include-silkscreen', '--include-soldermask', '--output', `${o}/site/board.glb`, p]);
  buildMechanical({ root, output: o, config });
}
