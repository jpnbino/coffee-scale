// Documentation portal for a build (formerly Build-Site.ps1).
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { ensureDir, fileDigest, htmlEncode, htmlSafeJson, readJson, resolveChildPath, runNode, writeJson } from './lib/common.mjs';
import { markdownToHtml, readCsv } from './lib/formats.mjs';
import { versionSite } from './lib/cache-bust.mjs';

/**
 * Docs link to each other as `02-circuit.md` so the links also work when read on
 * GitHub. In the portal each document is the page `doc-02-circuit.html`.
 */
export const portalDocLinks = html => html
  .replace(/href="(\d\d-[\w-]+)\.md(#[^"]*)?"/g, (_, name, anchor = '') => `href="doc-${name}.html${anchor}"`)
  // Links to the published portal (needed on GitHub) stay inside the current
  // portal, so a local preview or a historical build links to itself.
  .replace(/href="https:\/\/jpnbino\.github\.io\/coffee-scale\/([^"]*)"/g, (_, path) => `href="${path || 'index.html'}"`);

export function buildSite({ root, output, config, buildId, assembly }) {
  const site = `${output}/site`; const web = resolveChildPath(root, config.siteDirectory);
  const name = config.project.basename;
  const lock = readJson(`${web}/vendor/lock.json`);
  for (const asset of lock.assets) {
    if (fileDigest(resolveChildPath(`${web}/vendor`, asset.file)) !== asset.sha256) throw new Error(`Viewer asset checksum mismatch: ${asset.file}`);
  }
  for (const file of ['style.css', 'app.js', 'review.css', 'portal.css', ...readdirSync(web).filter(f => f.endsWith('.mjs'))]) copyFileSync(`${web}/${file}`, `${site}/${file}`);
  cpSync(`${web}/vendor`, `${site}/vendor`, { recursive: true });
  ensureDir(`${site}/source`); ensureDir(`${site}/files`);
  for (const extension of ['kicad_sch', 'kicad_pcb']) copyFileSync(`${output}/source/${name}.${extension}`, `${site}/source/${name}.${extension}`);

  const docs = resolveChildPath(root, config.documentationDirectory);
  // Diagrams are versioned beside the docs and referenced as diagrams/*.svg.
  if (existsSync(join(docs, 'diagrams'))) cpSync(join(docs, 'diagrams'), `${site}/diagrams`, { recursive: true });
  const documentation = readdirSync(docs).filter(file => file.endsWith('.md')).sort().map(file => {
    const html = portalDocLinks(markdownToHtml(readFileSync(join(docs, file), 'utf8')));
    return `<article class="doc-article" id="doc-${htmlEncode(parse(file).name)}">${html}</article>`;
  });
  const svg = readdirSync(`${site}/schematic`).filter(file => file.endsWith('.svg')).sort();
  if (!svg.length) throw new Error('Schematic SVG export is missing.');
  const statistics = readJson(`${output}/reports/board-statistics.json`);
  const replacements = {
    TITLE: htmlEncode(config.project.name), REVISION: htmlEncode(config.project.revision), BUILD_ID: htmlEncode(buildId),
    SCHEMATIC_SVG: `schematic/${svg[0]}`, DOCUMENTATION: documentation.join('\n'),
    WIDTH: config.manufacturing.widthMm, HEIGHT: config.manufacturing.heightMm, FOOTPRINTS: statistics.components.total.total,
  };
  let template = readFileSync(`${web}/index.html`, 'utf8');
  for (const [key, value] of Object.entries(replacements)) template = template.replaceAll(`{{${key}}}`, () => String(value));
  writeFileSync(`${site}/index.html`, template, 'utf8');

  runNode(join(root, 'tools/build-viewer-data.mjs'), [site, `${output}/source/${name}.kicad_pcb`, `${output}/source/${name}.kicad_sch`], 'Viewer traceability export failed.');
  runNode(join(root, 'tools/build-portal.mjs'), [site], 'Documentation portal generation failed.');

  // CSV stores booleans as text; expose real booleans to the browser.
  const parts = readCsv(`${output}/assembly/bom-with-stages.csv`).map(part => ({ ...part, Verified: part.Verified === 'True' }));
  const data = { basename: name, parts, assembly, mechanical: readJson(`${output}/mechanical/interface.json`), statistics, manufacturing: config.manufacturing };
  writeFileSync(`${site}/data.js`, `window.releaseData = ${htmlSafeJson(data)};\n`, 'utf8');
  writeJson(`${site}/files/validation.json`, {
    buildId, hardwareRevision: config.project.revision, boardSha256: fileDigest(`${output}/source/${name}.kicad_pcb`),
    erc: readJson(`${output}/reports/erc.json`), drc: readJson(`${output}/reports/drc.json`), assemblyReady: assembly.ready, prototypeHardware: true,
  });
  cpSync(`${output}/mechanical`, `${site}/files/mechanical`, { recursive: true });
  // Last, once every page and script exists: stamp references with the build ID.
  versionSite(site, buildId);
  console.log('Documentation site generated with local viewer assets and SVG/PDF fallback.');
}
