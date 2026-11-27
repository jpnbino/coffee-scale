// Final package checks: Gerber set, READMEs, archives and site links (formerly Complete-Release.ps1).
import { orderChecks } from '../web/stackup-model.mjs';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileDigest, readJson, resolveChildPath } from './lib/common.mjs';
import { verifyZip, zipDirectory } from './lib/formats.mjs';

export function completeRelease({ output, config }) {
  const gerberDir = `${output}/fabrication/gerbers`;
  const gerbers = readdirSync(gerberDir, { withFileTypes: true }).filter(e => e.isFile()).map(e => ({ name: e.name, ext: extname(e.name).toLowerCase(), path: join(gerberDir, e.name) }));
  const withExt = ext => gerbers.filter(file => file.ext === ext);
  const layers = ['.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo', '.gm1'];
  for (const ext of [...layers, '.gbrjob']) if (withExt(ext).length !== 1) throw new Error(`Missing or duplicate fabrication layer ${ext}`);
  if (withExt('.drl').length !== 2 || gerbers.length !== 10) throw new Error('Expected seven Gerber layers, job file and separate plated/non-plated drill files.');
  for (const file of gerbers.filter(f => layers.includes(f.ext))) {
    const content = readFileSync(file.path, 'utf8');
    if (!content.includes('%MOMM*%') || !content.trimEnd().endsWith('M02*')) throw new Error(`Invalid or incomplete Gerber: ${file.name}`);
  }
  const job = readJson(withExt('.gbrjob')[0].path);
  const m = config.manufacturing;
  if (job.GeneralSpecs.LayerNumber !== m.copperLayers || Math.abs(job.GeneralSpecs.BoardThickness - m.thicknessMm) > 0.001) {
    throw new Error('Gerber job stackup differs from manufacturing configuration.');
  }
  writeFileSync(`${output}/fabrication/README.txt`, `PCB fabrication: ${config.project.name}, hardware revision ${config.project.revision}.
${m.material}, ${m.copperLayers} layers,
${m.widthMm} x ${m.heightMm} mm,
${m.thicknessMm} mm thick, ${m.copperWeight} copper.
Mask: ${m.mask}; silk: ${m.silkscreen}; finish: ${m.finish}.
Preserve separate PTH/NPTH drills and plated routed USB slots.
The fabrication ZIP contains manufacturing data only; no assembly is ordered.
Prototype hardware: electrical checks are not physical functional validation.
`, 'utf8');
  writeFileSync(`${output}/assembly/README.txt`, `ASSEMBLY DRAFT — NOT APPROVED FOR ORDERING
Consult readiness.json for missing part selections, sourcing and placement review.
Native coordinates are millimetres, absolute KiCad XY with Y up.
The JLCPCB CPL is a CANDIDATE: footprint origins/rotations require supplier review.
Positions-native.csv is not filtered to SMT only; assembly stages control selection.
Integral PCB pads and mounting-hole features are not purchased factory parts.
stencil/ contains top/bottom paste and outline Gerbers for stencil review.
The carrier does not include a separate BOM item for the off-board OLED module,
battery, load cell, socket strips, wiring, case or fasteners; procure these in
the final-instrument BOM. No firmware/calibration or functional acceptance is implied.
`, 'utf8');
  const archives = { fabrication: 'fabrication/gerbers', 'assembly-DRAFT': 'assembly', mechanical: 'mechanical', source: 'source' };
  for (const [name, directory] of Object.entries(archives)) {
    const archive = `${output}/site/files/${name}.zip`;
    zipDirectory(`${output}/${directory}`, archive);
    if (!verifyZip(archive).length) throw new Error(`Empty archive: ${name}`);
  }
  // Fail on broken internal links, including files generated after the HTML page.
  const site = `${output}/site`;
  for (const page of readdirSync(site).filter(file => file.endsWith('.html'))) {
    const html = readFileSync(join(site, page), 'utf8');
    for (const [, link] of html.matchAll(/(?:href|src|data)="([^"#]+)"/g)) {
      if (/^[a-zA-Z]+:/.test(link) || link.startsWith('//')) continue;
      const local = link.split('#')[0].split('?')[0];
      if (!existsSync(resolveChildPath(site, local))) throw new Error(`Broken site link: ${link}`);
    }
  }
  console.log('Archives and internal site links verified.');
  const catalog = readJson(`${site}/review/catalog.json`);
  for (const version of catalog.versions) {
    for (const asset of Object.values(version.artifacts)) {
      if (asset && !existsSync(resolveChildPath(site, asset))) throw new Error(`Missing selected-revision artifact: ${version.id} / ${asset}`);
    }
    const at = key => resolveChildPath(site, version.artifacts[key]);
    const stackup = readJson(at('stackup')); const native = readJson(at('nativeProvenance')); const materials = readJson(at('modelMaterials'));
    if (stackup.sourceSha256 !== version.boardSha256 || native.sourceSha256 !== version.schematicSha256) throw new Error(`Selected-revision provenance mismatch: ${version.id}`);
    if (fileDigest(at('model')) !== materials.sourceSha256) throw new Error(`Selected-revision 3D material map mismatch: ${version.id}`);
    if (fileDigest(at('native')) !== native.viewerSha256) throw new Error(`Selected-revision native schematic mismatch: ${version.id}`);
    if (native.board?.sourceSha256 !== version.boardSha256 || fileDigest(at('nativeBoard')) !== native.board.viewerSha256) throw new Error(`Selected-revision viewer board mismatch: ${version.id}`);
    const nets = readJson(at('schematicNets'));
    if (nets.sourceSha256 !== version.schematicSha256 || nets.boardSha256 !== version.boardSha256) throw new Error(`Selected-revision schematic net map mismatch: ${version.id}`);
  }
  // The order settings in release.json must describe the board KiCad defines.
  const current = catalog.versions.find(version => version.id === 'current');
  const order = orderChecks(readJson(resolveChildPath(site, current.artifacts.stackup)), config.manufacturing, readJson(resolveChildPath(site, `review/${current.metadata}`)).bounds);
  if (!order.agrees) throw new Error(`release.json manufacturing settings disagree with the KiCad stackup: ${[...order.rows.filter(row => !row.agrees).map(row => `${row.label} ${row.value} vs ${row.kicad}`), ...(order.sum.agrees ? [] : [`layers sum to ${order.sum.totalMm} mm`])].join('; ')}`);
  console.log('Selected-revision artifact existence and provenance verified.');
}
