import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ICONS } from './lib/icons.mjs';

// View-tool buttons are written once as <button data-icon="fit" title="Fit board (F)"></button>:
// the icon, an aria-label (the title without its key hint) and the fullscreen
// toggle state are filled in here, so every toolbar looks and reads the same.
export function expandIcons(template) {
  return template.replace(/<button([^>]*?) data-icon="([\w-]+)"([^>]*)><\/button>/g, (match, before, name, after) => {
    if (!ICONS[name]) throw new Error(`Unknown view-tool icon: ${name}`);
    let attributes = `${before}${after}`;
    const title = attributes.match(/ title="([^"]*)"/)?.[1];
    if (!title) throw new Error(`View-tool button "${name}" needs a title`);
    if (!/ aria-label=/.test(attributes)) attributes += ` aria-label="${title.replace(/\s*\([^)]*\)$/, '')}"`;
    if (/ data-fullscreen/.test(attributes) && !/ aria-pressed=/.test(attributes)) attributes += ' aria-pressed="false"';
    return `<button${attributes}>${ICONS[name]}</button>`;
  });
}

export function portalPages(template) {
  template = expandIcons(template);
  const sections = new Map([...template.matchAll(/<section id="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map(match => [match[1], match[0]]));
  const take = id => { if (!sections.has(id)) throw new Error(`Missing portal section: ${id}`); return sections.get(id); };
  // Each page: id, title, sidebar group, one-sentence lead (also the card summary), template sections.
  const pages = [
    ['index', 'Overview', null, 'Purpose, specifications and prototype status.', ['overview']],
    ['explore', 'Explore board', 'Board', 'The PCB, schematic and 3D model of the selected revision, with net highlighting and cross-probing.', ['inspect']],
    ['statistics', 'Board statistics', 'Board', 'How the board\'s smallest features compare with JLCPCB\'s and PCBWay\'s published limits, and its size, counts and drills.', ['statistics']],
    ['stackup', 'Layer stackup', 'Board', 'What the board is made of, the values to order it with, and what that means for the design.', ['stackup']],
    ['gerbers', 'Gerber inspection', 'Manufacturing', 'The exact files the factory receives, with the checks to run before you order.', ['gerbers']],
    ['manufacture', 'Build & manufacture', 'Manufacturing', 'Parts, assembly readiness and the release downloads.', ['parts', 'downloads']],
    ['mechanical', 'Enclosure & mechanics', 'Manufacturing', 'What a case designer needs: models, mounting geometry and the assumptions still to check.', ['mechanical']],
    ['versions', 'Versions & changes', 'Project', 'Compare two revisions and open each one\'s files.', ['compare']],
    ['documentation', 'Documentation', 'Project', 'Guides to the circuit, interfaces, assembly, revisions and manufacturing.', []],
].map(([id, title, group, summary, ids]) => ({ id, title, group, summary, content: ids.map(take).join('\n') }));
  const articles = [...take('documentation').matchAll(/<article[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)].map(([, id, content]) => {
    const title = content.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
    if (!title || !/^[\w-]+$/.test(id)) throw new Error('Documentation requires a safe ID and a title');
    // Each document opens with a one-sentence lead; it becomes the card summary.
    const lead = content.match(/<\/h1>\s*<p>([\s\S]*?)<\/p>/)?.[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!lead) throw new Error(`Documentation ${id} needs a lead paragraph under its title`);
    return { id, title, summary: lead, content: `<article class="doc-article" id="${id}">${content}</article>`, document: true };
  });
  const cards = list => `<div class="resource-grid">${list.map(page => `<a href="${page.id}.html"><strong>${page.title}</strong><span>${page.summary}</span></a>`).join('')}</div>`;
  pages.find(page => page.id === 'explore').content = take('inspect').replace(/<object data=/g, '<object data-src=').replace('<model-viewer src=', '<model-viewer data-src=');
  pages.at(-1).content = `<section id="documentation-index">${cards(articles)}</section>`;
  pages.push(...articles);
  const navigation = pages.filter(page => !page.document);
  const shell = template.slice(0, template.indexOf('<main>')).replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<aside[\s\S]*?<\/aside>/, '{{RAIL}}')
    .replace('</head>', '<link rel="stylesheet" href="portal.css"><script src="data.js" defer></script><script type="module" src="app.js"></script><script type="module" src="revision.mjs"></script><script type="module" src="portal.mjs"></script><script type="module" src="viewer-controls.mjs"></script>{{SCRIPTS}}</head>')
    .replace('<html lang="en">','<html lang="en" class="revision-loading">')
    .replace('<body>', '<body><a class="skip-link" href="#main">Skip to content</a>');
  const build = template.match(/<p>Build <code>([^<]+)<\/code><\/p>/)[1];
  const footer = template.match(/<footer>[\s\S]*?<\/footer>/)[0].replace('</footer>', `<small class="build-id">Portal build ${build}</small></footer>`);
  const index = pages.map(page => ({url: `${page.id}.html`, title: page.title.replace(/<[^>]*>/g, ''), text: page.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')}));
  const files = new Map();
  // Each tool page names the guide that explains it, and each guide lists the
  // tools it explains, so a reader can go from a view to its method and back.
  const guides = {
    explore: ['doc-02-circuit', '', 'What the circuit does'], statistics: ['doc-07-manufacturing-control', ''], stackup: ['doc-07-manufacturing-control', ''],
    gerbers: ['doc-06-revision-review', 'checks-before-ordering'], manufacture: ['doc-04-assembly-testing', 'state-of-the-assembly-data'],
    mechanical: ['doc-05-mechanics-notes', 'enclosure-collaboration'], versions: ['doc-06-revision-review', 'comparing-layouts'],
  };
  const guideFor = page => {
    const [doc, anchor, label = 'How this page works'] = guides[page.id] ?? [];
    const article = doc && articles.find(item => item.id === doc);
    return article ? `<p class="page-guide">${label}: <a href="${doc}.html${anchor ? `#${anchor}` : ''}">${article.title}</a></p>` : '';
  };
  const toolsFor = page => {
    const tools = navigation.filter(item => guides[item.id]?.[0] === page.id);
    return tools.length ? `<p class="page-guide">Open the tool${tools.length > 1 ? 's' : ''}: ${tools.map(item => `<a href="${item.id}.html">${item.title}</a>`).join(' · ')}</p>` : '';
  };
  const schematicSvg=template.match(/<object data="([^"]+)"[^>]*aria-label="Full schematic"/)[1];
  const artifactPaths={'pcb-top.svg':'pcbTop','pcb-bottom.svg':'pcbBottom',[schematicSvg]:'schematicSvg','schematic.pdf':'schematicPdf','board.glb':'model','top.png':'hero','stackup.json':'stackup','native/provenance.json':'nativeProvenance','native/board.kicad_pcb':'nativeBoard','native/schematic-nets.json':'schematicNets','files/fabrication.zip':'fabrication','files/assembly-DRAFT.zip':'assembly','files/source.zip':'source','files/validation.json':'validation','files/mechanical.zip':'mechanical','files/mechanical/README.md':'mechanicalGuide'};
  for (const page of pages) {
    const current = page.document ? 'documentation' : page.id;
    const groups = [...new Set(navigation.map(item => item.group))];
    const links = group => navigation.filter(item => item.group === group).map(item => `<a href="${item.id}.html"${item.id === current ? ' aria-current="page"' : ''}>${item.title}</a>`).join('');
    // The revision is chosen once, in the sidebar; every view and download follows it.
    const rail = `<aside class="rail"><div class="rail-top"><a class="brand" href="index.html"><span class="mark">≈</span> COFFEE SCALE</a><button type="button" class="rail-menu" aria-expanded="false" aria-controls="rail-body">Menu</button></div><div class="rail-body" id="rail-body"><div class="revision-bar"><label for="global-revision">Revision</label><select id="global-revision" disabled title="Every view and download follows this revision"><option value="">Loading revisions…</option></select><p id="revision-status" role="status">Resolving revision…</p><noscript>JavaScript is required to select and verify a revision before viewing its artifacts.</noscript></div><label class="search-label" for="portal-search">Find a page or topic</label><input id="portal-search" type="search" placeholder="Pinout, battery, HX711…" aria-controls="search-results"><div id="search-results" role="status"></div><nav aria-label="Project resources">${groups.map(group => group ? `<p class="nav-group">${group}</p>${links(group)}` : links(group)).join('')}</nav></div></aside>`;
    const scripts = page.id === 'versions' ? '<script type="module" src="review.mjs"></script>' : page.id === 'gerbers' ? '<script type="module" src="gerber.mjs"></script>' : page.id === 'statistics' ? '<script type="module" src="statistics-page.mjs"></script>' : page.id === 'stackup' ? '<script type="module" src="stackup.mjs"></script>' : page.id === 'manufacture' ? '<script type="module" src="manufacture.mjs"></script>' : page.id === 'mechanical' ? '<script type="module" src="mechanics.mjs"></script>' : '';
    // Pages get one standard heading; the section's own eyebrow and title give way to it.
    const strip = html => html.replace(/^(\s*<section[^>]*>)\s*<p class="eyebrow">[^<]*<\/p>\s*<h[12]>[\s\S]*?<\/h[12]>(\s*<p class="lead">[\s\S]*?<\/p>)?/, '$1');
    const body = page.id === 'index' || page.document ? page.content : strip(page.content).replace(/<p class="eyebrow">\d\d \/ [^<]*<\/p>/g, '');
    const head = page.id === 'index' || page.document ? '' : `<header class="page-head"><p class="eyebrow">${page.group.toUpperCase()}</p><h1>${page.title}</h1><p class="lead">${page.summary}</p></header>`;
    const crumb = page.document ? `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="documentation.html">Documentation</a> / <span aria-current="page">${page.title}</span></nav>` : '';
    const content=(head+body+(page.document ? toolsFor(page) : guideFor(page))).replace(/\b(?:href|src|data-src)="([^"]+)"/g,(attribute,path)=>artifactPaths[path]?`data-artifact="${artifactPaths[path]}"`:attribute).replace(/ poster="top.png"/g,'');
    const banner='<p id="revision-banner" class="revision-banner" role="status" hidden></p>';
    files.set(`${page.id}.html`, shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${page.title} · Coffee scale hardware</title>`).replace('{{RAIL}}', rail).replace('{{SCRIPTS}}', scripts) + `<main id="main" tabindex="-1">${banner}${crumb}<div class="revision-content">${content}</div>${footer}</main></body></html>`);
  }
  files.set('search-index.json', JSON.stringify(index));
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const site = process.argv[2];
  for (const [name, content] of portalPages(await readFile(join(site, 'index.html'), 'utf8'))) await writeFile(join(site, name), content);
}
