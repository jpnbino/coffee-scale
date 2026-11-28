// Revision-review snapshots: current build plus verified historical releases (formerly Build-Review.ps1).
import { copyFileSync, cpSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ensureDir, fileDigest, readJson, resolveChildPath, runKiCad, runNode, writeJson } from './lib/common.mjs';
import { zipDirectory } from './lib/formats.mjs';

const copyInto = (files, folder) => { for (const file of files) copyFileSync(file, join(folder, basename(file))); };
const filesIn = folder => readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(folder, entry.name));

export function buildReview({ root, output, config, buildId, kicad }) {
  const tools = join(root, 'tools');
  const review = ensureDir(`${output}/site/review`);
  const log = `${output}/reports/build.log`;
  const name = config.project.basename;
  const run = args => runKiCad(kicad, args, log);
  const versions = [];
  const definitions = [...config.history, { id: 'current', label: `Rev ${config.project.revision} · current build`, projectDirectory: null, releaseDirectory: null }];
  for (const definition of definitions) {
    if (!/^[a-zA-Z0-9-]+$/.test(definition.id)) throw new Error('Unsafe or invalid version ID.');
    const { id } = definition; const folder = `${review}/${id}`;
    ensureDir(`${folder}/source`); ensureDir(`${folder}/gerbers`);
    let project, gerbers, statistics, nativePcb, nativeSch, validation;
    if (id === 'current') {
      project = `${output}/source`; gerbers = `${output}/fabrication/gerbers`;
      statistics = `${output}/reports/board-statistics.json`;
      nativePcb = `${project}/${name}.kicad_pcb`; nativeSch = `${project}/${name}.kicad_sch`;
      validation = 'Fresh current-build ERC/DRC/parity checks passed';
      copyInto([`${output}/site/pcb-top.svg`, `${output}/site/pcb-bottom.svg`, `${output}/site/schematic.pdf`], folder);
    } else {
      const original = resolveChildPath(root, definition.projectDirectory);
      const release = resolveChildPath(root, definition.releaseDirectory);
      const manifest = readJson(`${release}/manifest.json`);
      if (fileDigest(`${original}/${name}.kicad_pcb`) !== manifest.board_sha256 || fileDigest(`${original}/${name}.kicad_sch`) !== manifest.schematic_sha256) {
        throw new Error(`Historical source mismatch: ${id}`);
      }
      project = ensureDir(`${output}/.runtime/history/${id}`);
      for (const file of config.inputFiles) if (existsSync(`${original}/${file}`)) copyFileSync(`${original}/${file}`, `${project}/${file}`);
      for (const directory of config.inputDirectories) cpSync(`${original}/${directory}`, `${project}/${directory}`, { recursive: true });
      nativePcb = `${project}/${name}.kicad_pcb`; nativeSch = `${project}/${name}.kicad_sch`;
      gerbers = `${release}/gerbers`; statistics = `${folder}/statistics.json`;
      for (const [file, hash] of Object.entries(manifest.files)) {
        if (fileDigest(resolveChildPath(gerbers, file)) !== hash) throw new Error(`Historical manufacturing file mismatch: ${id} / ${file}`);
      }
      run(['pcb', 'export', 'stats', '--format', 'json', '--units', 'mm', '--output', statistics, nativePcb]);
      for (const side of ['top', 'bottom']) {
        const face = side === 'top' ? 'F' : 'B';
        run(['pcb', 'export', 'svg', '--layers', `${face}.Cu,${face}.SilkS,Edge.Cuts`, '--mode-single', '--fit-page-to-board', '--exclude-drawing-sheet', '--output', `${folder}/pcb-${side}.svg`, nativePcb]);
      }
      run(['sch', 'export', 'pdf', '--output', `${folder}/schematic.pdf`, nativeSch]);
      ensureDir(`${folder}/schematic`); ensureDir(`${folder}/mechanical`);
      run(['sch', 'export', 'svg', '--output', `${folder}/schematic`, nativeSch]);
      run(['pcb', 'render', '--side', 'top', '--width', '1600', '--height', '1000', '--quality', 'basic', '--background', 'opaque', '--use-board-stackup-colors', '--output', `${folder}/top.png`, nativePcb]);
      run(['pcb', 'export', 'glb', '--force', '--subst-models', '--include-silkscreen', '--include-soldermask', '--output', `${folder}/board.glb`, nativePcb]);
      for (const kind of ['populated', 'bare-board']) {
        run(['pcb', 'export', 'step', '--force', '--subst-models', '--output', `${folder}/mechanical/${kind}.step`, ...(kind === 'bare-board' ? ['--board-only'] : []), nativePcb]);
      }
      writeFileSync(`${folder}/mechanical/README.md`, `Historical mechanical preview re-exported from verified ${id} sources with the current KiCad toolchain. STEP uses KiCad default origin (not the current release's custom origin). No historical mounting-hole coordinate report, assembly profile or fit approval is supplied. Inspect coordinate alignment before enclosure work.\n`, 'utf8');
      runNode(join(tools, 'build-viewer-data.mjs'), [folder, nativePcb, nativeSch], `Historical viewer data failed: ${id}`);
      copyFileSync(`${release}/manifest.json`, `${folder}/historical-validation.json`);
      validation = 'Historical validation record; source/manufacturing hashes verified. Review drawings re-rendered with current toolchain.';
    }
    copyInto([nativePcb, nativeSch], `${folder}/source`);
    if (statistics !== `${folder}/statistics.json`) copyFileSync(statistics, `${folder}/statistics.json`);
    copyInto(filesIn(gerbers), `${folder}/gerbers`);
    runNode(join(tools, 'board-data.mjs'), [nativePcb, `${folder}/board.json`], `Board metadata failed: ${id}`);
    // The stencil (paste) layers are an assembly output, so they are drawn for the
    // current build only; they are not part of the fabrication package.
    const stencil = id === 'current' ? [`${output}/assembly/stencil`] : [];
    runNode(join(tools, 'render-gerbers.mjs'), [gerbers, `${folder}/rendered`, id, ...stencil], `Gerber conversion failed: ${id}`);
    const placement = id === 'current' ? [`${output}/assembly/jlcpcb-cpl-CANDIDATE.csv`] : [];
    if (placement.length && !existsSync(placement[0])) throw new Error('The current build has no placement file for the fab check.');
    // Paste coverage needs the stencil (current build only) and the copper layers it sits on.
    const pick = (dir, pattern) => filesIn(dir).filter(file => pattern.test(file));
    const pasteArgs = stencil.length ? [`--paste=${pick(stencil[0], /\.g[tb]p$/i).join(',')}`, `--copper=${pick(gerbers, /\.g[tb]l$/i).join(',')}`] : [];
    runNode(join(tools, 'fab-check.mjs'), [nativePcb, nativeSch, `${folder}/board.json`, `${folder}/fab-check.json`, ...placement, ...pasteArgs], `Fab check failed: ${id}`);
    zipDirectory(`${folder}/gerbers`, `${folder}/fabrication.zip`);
    if (id !== 'current') {
      zipDirectory(project, `${folder}/source.zip`);
      zipDirectory(`${folder}/mechanical`, `${folder}/mechanical.zip`);
    }
    const assetBase = id === 'current' ? '' : `review/${id}/`;
    const svgFolder = id === 'current' ? `${output}/site/schematic` : `${folder}/schematic`;
    const schematicSvg = readdirSync(svgFolder).filter(file => file.endsWith('.svg')).sort()[0];
    if (!schematicSvg) throw new Error(`Schematic SVG export is missing: ${id}`);
    const artifacts = {
      pcbTop: `${assetBase}pcb-top.svg`, pcbBottom: `${assetBase}pcb-bottom.svg`, schematicSvg: `${assetBase}schematic/${schematicSvg}`,
      schematicPdf: `${assetBase}schematic.pdf`, model: `${assetBase}board.glb`, modelMaterials: `${assetBase}model-materials.json`,
      hero: `${assetBase}top.png`, stackup: `${assetBase}stackup.json`, native: `${assetBase}native/schematic.kicad_sch`,
      nativeProvenance: `${assetBase}native/provenance.json`, nativeBoard: `${assetBase}native/board.kicad_pcb`, schematicNets: `${assetBase}native/schematic-nets.json`, fabrication: `review/${id}/fabrication.zip`,
      ...(id === 'current'
        ? { source: 'files/source.zip', mechanical: 'files/mechanical.zip', mechanicalGuide: 'files/mechanical/README.md', assembly: 'files/assembly-DRAFT.zip', validation: 'files/validation.json' }
        : { source: `review/${id}/source.zip`, mechanical: `review/${id}/mechanical.zip`, mechanicalGuide: `review/${id}/mechanical/README.md`, assembly: null, validation: `review/${id}/historical-validation.json` }),
    };
    versions.push({
      id, label: definition.label, artifacts, buildId: id === 'current' ? buildId : null,
      boardSha256: fileDigest(nativePcb), schematicSha256: fileDigest(nativeSch),
      metadata: `${id}/board.json`, statistics: `${id}/statistics.json`, gerbers: `${id}/rendered/layers.json`, fabCheck: `${id}/fab-check.json`,
      pcbTop: `${id}/pcb-top.svg`, pcbBottom: `${id}/pcb-bottom.svg`, schematicPdf: `${id}/schematic.pdf`,
      fabricationZip: `${id}/fabrication.zip`, sourcePcb: `${id}/source/${name}.kicad_pcb`, validation,
    });
    console.log(`Review snapshot: ${definition.label}`);
  }
  writeJson(`${review}/catalog.json`, { schemaVersion: 2, current: 'current', versions, gitIntegration: 'Not configured; these are explicit local snapshots, not Git commits.' });
}
