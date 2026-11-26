import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function portalPages(template) {
  const sections = new Map([...template.matchAll(/<section id="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map(match => [match[1], match[0]]));
  const take = id => { if (!sections.has(id)) throw new Error(`Missing portal section: ${id}`); return sections.get(id); };
  const pages = [
    ['index', 'Overview', 'Purpose, specifications and prototype status.', ['overview']],
    ['explore', 'Explore board', 'PCB, schematic and interactive 3D model.', ['inspect']],
    ['statistics', 'Board statistics', 'Dimensions, components, routing and drills.', ['statistics']],
    ['stackup', 'Layer stackup', 'Materials, layer order and manufacturing traceability.', ['stackup']],
    ['gerbers', 'Gerber inspection', 'Inspect the actual manufacturing layers.', ['gerbers']],
    ['manufacture', 'Build & manufacture', 'Parts, assembly readiness and release downloads.', ['parts', 'downloads']],
    ['mechanical', 'Enclosure & mechanics', 'Models, mounting geometry and fit assumptions.', ['mechanical']],
    ['versions', 'Versions & changes', 'Compare snapshots and inspect their artifacts.', ['compare']],
    ['documentation', 'Documentation', 'Circuit explanations, interfaces and project notes.', []],
  ].map(([id, title, summary, ids]) => ({ id, title, summary, content: ids.map(take).join('\n') }));
  const articles = [...take('documentation').matchAll(/<article[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)].map(([, id, content]) => {
    const title = content.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
    if (!title || !/^[\w-]+$/.test(id)) throw new Error('Documentation requires a safe ID and a title');
    return { id, title, summary: 'Maintained project documentation for this build.', content: `<article class="doc-article" id="${id}">${content}</article>`, document: true };
  });
  const cards = list => `<div class="resource-grid">${list.map(page => `<a href="${page.id}.html"><strong>${page.title}</strong><span>${page.summary}</span></a>`).join('')}</div>`;
  pages[0].content = pages[0].content.replace('<figure class="hero">', `${cards(pages.slice(1))}<figure class="hero">`);
  pages.find(page => page.id === 'explore').content = take('inspect').replace(/<object data=/g, '<object data-src=').replace('<model-viewer src=', '<model-viewer data-src=');
  pages.find(page => page.id === 'statistics').content = take('statistics').replace('Selected comparison target:', 'Selected hardware snapshot:');
  pages.at(-1).content = `<section id="documentation-index"><h1>Project documentation</h1><p>Read a focused guide or inspect the corresponding design resources.</p>${cards(articles)}</section>`;
  pages.push(...articles);
  const navigation = pages.filter(page => !page.document);
  const shell = template.slice(0, template.indexOf('<main>')).replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<aside[\s\S]*?<\/aside>/, '{{RAIL}}')
    .replace('</head>', '<link rel="stylesheet" href="portal.css"><script src="data.js" defer></script><script type="module" src="app.js"></script><script type="module" src="revision.mjs"></script><script type="module" src="portal.mjs"></script><script type="module" src="viewer-controls.mjs"></script>{{SCRIPTS}}</head>')
    .replace('<html lang="en">','<html lang="en" class="revision-loading">')
    .replace('<body>', '<body><a class="skip-link" href="#main">Skip to content</a>');
  const top = template.match(/<header class="topline">[\s\S]*?<\/header>/)[0];
  const build = template.match(/<p>Build <code>([^<]+)<\/code><\/p>/)[1];
  const footer = template.match(/<footer>[\s\S]*?<\/footer>/)[0].replace('</footer>', `<p>Resolving selected revision…</p><small>Portal build ${build}</small></footer>`);
  const revision = template.match(/OPEN HARDWARE \/ REV ([^<]+)/)[1];
  const index = pages.map(page => ({url: `${page.id}.html`, title: page.title.replace(/<[^>]*>/g, ''), text: page.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')}));
  const files = new Map();
  const schematicSvg=template.match(/<object data="([^"]+)"[^>]*aria-label="Full schematic"/)[1];
  const artifactPaths={'pcb-top.svg':'pcbTop','pcb-bottom.svg':'pcbBottom',[schematicSvg]:'schematicSvg','schematic.pdf':'schematicPdf','board.glb':'model','top.png':'hero','stackup.json':'stackup','native/provenance.json':'nativeProvenance','native/board.kicad_pcb':'nativeBoard','native/schematic-nets.json':'schematicNets','files/fabrication.zip':'fabrication','files/assembly-DRAFT.zip':'assembly','files/source.zip':'source','files/validation.json':'validation','files/mechanical.zip':'mechanical','files/mechanical/README.md':'mechanicalGuide'};
  for (const page of pages) {
    const rail = `<aside class="rail"><a class="brand" href="index.html"><span class="mark">≈</span> COFFEE SCALE<span class="edition">OPEN HARDWARE / REV ${revision}</span></a><label class="search-label" for="portal-search">Find a page or topic</label><input id="portal-search" type="search" placeholder="Pinout, battery, HX711…" aria-controls="search-results"><div id="search-results" role="status"></div><nav aria-label="Project resources">${navigation.map(item => `<a href="${item.id}.html"${item.id === (page.document ? 'documentation' : page.id) ? ' aria-current="page"' : ''}>${item.title}</a>`).join('')}</nav><p class="rail-note">Current-build documentation. Historical hardware and artifacts are available under Versions & changes.</p></aside>`;
    const scripts = page.id === 'versions' ? '<script type="module" src="review.mjs"></script>' : page.id === 'gerbers' ? '<script type="module" src="gerber.mjs"></script>' : page.id === 'statistics' ? '<script type="module" src="statistics-page.mjs"></script>' : page.id === 'stackup' ? '<script type="module" src="stackup.mjs"></script>' : '';
    const exploreNav = ['explore', 'gerbers', 'statistics', 'stackup'].includes(page.id) ? `<nav class="resource-tabs" aria-label="Board resources">${navigation.filter(item => ['explore', 'gerbers', 'statistics', 'stackup'].includes(item.id)).map(item => `<a href="${item.id}.html"${item.id === page.id ? ' aria-current="page"' : ''}>${item.title}</a>`).join('')}</nav>` : '';
    const crumb = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Overview</a>${page.document ? ' / <a href="documentation.html">Documentation</a>' : ''}${page.id !== 'index' ? ` / <span aria-current="page">${page.title}</span>` : ''}</nav>`;
    const content=page.content.replace(/\b(?:href|src|data-src)="([^"]+)"/g,(attribute,path)=>artifactPaths[path]?`data-artifact="${artifactPaths[path]}"`:attribute).replace(/ poster="top.png"/g,'');
    const selector='<div class="revision-bar"><label for="global-revision">Hardware revision</label><select id="global-revision" disabled><option value="">Loading revisions…</option></select><p id="revision-status" role="status">Resolving revision and matching artifacts…</p><noscript>JavaScript is required to select and verify a revision before viewing its artifacts.</noscript></div>';
    files.set(`${page.id}.html`, shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${page.title} · Coffee scale hardware</title>`).replace('{{RAIL}}', rail).replace('{{SCRIPTS}}', scripts) + `<main id="main" tabindex="-1">${top}${selector}${crumb}${exploreNav}<div class="revision-content">${content}</div>${footer}</main></body></html>`);
  }
  files.set('search-index.json', JSON.stringify(index));
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const site = process.argv[2];
  for (const [name, content] of portalPages(await readFile(join(site, 'index.html'), 'utf8'))) await writeFile(join(site, name), content);
}
