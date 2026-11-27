// Layer stackup page: the values to order the board with (checked against
// KiCad), a cross-section linked to the Gerber files, what the copper and
// dielectric mean for the design, and the raw KiCad record.
import { selectedPromise, artifactUrl } from './revision.mjs';
import { json } from './review-data.mjs';
import { orderChecks, trackCurrentA, trackWidths, GERBER_KIND, swatch, copperWeightMm } from './stackup-model.mjs';

const root = document.getElementById('stackup-content');
const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, text, props = {}) => Object.assign(document.createElement(tag), props, text === undefined ? {} : { textContent: text });
const svgEl = (tag, attributes = {}) => { const node = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, v); return node; };
const mm = value => (value === null || value === undefined ? 'thickness not set' : value < 0.1 ? `${Math.round(value * 1000)} µm` : `${value} mm`);

/** "Top Silk Screen" → "Top silkscreen", F.Cu → "Top copper". */
function friendly(layer) {
  if (layer.type === 'copper') return `${layer.name.startsWith('B.') ? 'Bottom' : 'Top'} copper`;
  if (/core|prepreg/i.test(layer.type)) return `${layer.type[0].toUpperCase()}${layer.type.slice(1)}`;
  return layer.type.replace(/Silk Screen/i, 'silkscreen').replace(/Solder Mask/i, 'solder mask').replace(/Solder Paste/i, 'paste (stencil)');
}

function orderCard(stackup, manufacturing, bounds, isCurrent) {
  const card = el('div', undefined, { className: 'stackup-card' });
  const head = el('div', undefined, { className: 'stackup-card-head' });
  head.append(el('h3', 'Order parameters'));
  card.append(head);
  if (!isCurrent || !manufacturing) {
    card.append(el('p', `${stackup.layers.filter(l => l.type === 'copper').length} copper layers · ${stackup.boardThicknessMm} mm · ${stackup.finish || 'finish not set'}. Order settings are recorded for the current build only; this is the revision's KiCad stackup.`, { className: 'muted' }));
    return card;
  }
  const result = orderChecks(stackup, manufacturing, bounds);
  const grid = el('dl', undefined, { className: 'order-grid' });
  for (const row of result.rows) {
    const item = el('div', undefined, { className: row.agrees ? '' : 'disagrees' });
    item.append(el('dt', row.label), el('dd', row.value), el('small', `KiCad: ${row.kicad}`));
    grid.append(item);
  }
  card.append(grid);
  card.append(el('p', result.agrees
    ? `✓ The KiCad stackup and the release's manufacturing settings agree · layers with a thickness sum to ${result.sum.totalMm} mm`
    : `The KiCad stackup and the release's manufacturing settings disagree: check the highlighted values before ordering.`, { className: result.agrees ? 'order-ok' : 'order-bad' }));
  const summary = `PCB: ${manufacturing.copperLayers} layers, ${manufacturing.material}, ${manufacturing.thicknessMm} mm, ${manufacturing.copperWeight} copper, ${manufacturing.finish}, ${manufacturing.mask.toLowerCase()} solder mask, ${manufacturing.silkscreen.toLowerCase()} silkscreen, ${manufacturing.widthMm} × ${manufacturing.heightMm} mm`;
  const copy = el('button', 'Copy', { type: 'button', className: 'copy-button', title: summary });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(summary); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  });
  head.append(copy);
  return card;
}

/** Cross-section with an SMD pad and a plated through-hole; exaggerated or to scale. */
function section(stackup, trueScale) {
  const board = stackup.layers.filter(layer => !/paste/i.test(layer.type));
  const width = 560, P = [70, 170], H = [360, 400], top = 34;
  const isCore = layer => /core|prepreg/i.test(layer.type);
  const height = layer => trueScale ? Math.max((layer.thicknessMm ?? 0.008) * 125, 1) : isCore(layer) ? 96 : layer.type === 'copper' ? 11 : 7;
  const coreIndex = board.findIndex(isCore);
  // Horizontal extents per layer: openings for the pad (top only) and the hole.
  const spans = (layer, index) => {
    const bottom = index > coreIndex;
    if (isCore(layer)) return [[0, H[0] - 4], [H[1] + 4, width]];
    if (layer.type === 'copper') return bottom
      ? [[0, H[0] - 18], [H[0] - 10, H[0]], [H[1], H[1] + 10], [H[1] + 18, width]]
      : [[0, P[0] - 8], [P[0], P[1]], [P[1] + 8, H[0] - 18], [H[0] - 10, H[0]], [H[1], H[1] + 10], [H[1] + 18, width]];
    return bottom ? [[0, H[0] - 14], [H[1] + 14, width]] : [[0, P[0] - 4], [P[1] + 4, H[0] - 14], [H[1] + 14, width]];
  };
  const total = board.reduce((sum, layer) => sum + height(layer), 0);
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${total + top + 34}`, role: 'img', class: 'stackup-section', 'aria-label': `Cross-section of the ${stackup.boardThicknessMm} mm board with an SMD pad and a plated through-hole${trueScale ? ', drawn to scale' : ', thin layers exaggerated'}` });
  let y = top; const at = new Map();
  board.forEach((layer, index) => {
    const h = height(layer); at.set(layer, [y, h]);
    for (const [a, b] of spans(layer, index)) svg.append(svgEl('rect', { x: a, y, width: b - a, height: h, fill: swatch(layer), stroke: /silk/i.test(layer.type) ? '#c8c8c2' : 'none', 'stroke-width': 0.5 }));
    y += h;
  });
  const coppers = board.filter(layer => layer.type === 'copper');
  const [topY] = at.get(coppers[0]), [bottomY, bottomH] = at.get(coppers.at(-1));
  const copper = swatch(coppers[0]), gold = '#e2b93b';
  // Plated barrel joining the copper layers, then ENIG on every exposed copper face.
  for (const x of [H[0] - 4, H[1]]) svg.append(svgEl('rect', { x, y: topY, width: 4, height: bottomY + bottomH - topY, fill: copper }));
  const g = trueScale ? 2 : 3;
  for (const [x, w, yy] of [[P[0], P[1] - P[0], topY - g], [H[0] - 10, 10, topY - g], [H[1], 10, topY - g], [H[0] - 10, 10, bottomY + bottomH], [H[1], 10, bottomY + bottomH]]) svg.append(svgEl('rect', { x, y: yy, width: w, height: g, fill: gold }));
  svg.append(svgEl('path', { d: `M${P[0] + 16} ${topY - g} q ${(P[1] - P[0] - 32) / 2} -16 ${P[1] - P[0] - 32} 0 z`, fill: '#9aa0a6' }));
  const label = (x, yy, text) => { const t = svgEl('text', { x, y: yy, 'text-anchor': 'middle', 'font-size': 12, fill: '#64716a' }); t.textContent = text; svg.append(t); };
  label((P[0] + P[1]) / 2, 14, 'SMD pad: mask opening, paste, ENIG');
  label((H[0] + H[1]) / 2, 14, 'Plated through-hole');
  const core = board[coreIndex]; const [coreY, coreH] = at.get(core);
  label(200, coreY + coreH / 2 + 4, `${core.material || 'Core'} ${core.type} · ${mm(core.thicknessMm)}`);
  label(width / 2, total + top + 26, trueScale ? 'Drawn to scale: the copper and mask really are this thin.' : 'Not to scale: thin layers are exaggerated.');
  return svg;
}

function sectionFigure(stackup) {
  const figure = el('figure', undefined, { className: 'stackup-figure' });
  const drawing = el('div', undefined, { className: 'stackup-drawing' });
  const toggle = el('label', undefined, { className: 'inline-check' });
  const input = el('input', undefined, { type: 'checkbox' });
  toggle.append(input, document.createTextNode('Draw to scale'));
  const draw = () => drawing.replaceChildren(section(stackup, input.checked));
  input.addEventListener('change', draw); draw();
  const legend = el('ul', undefined, { className: 'stackup-legend' });
  for (const layer of stackup.layers) {
    const item = el('li');
    const chip = el('span', undefined, { className: 'stackup-chip' }); chip.style.background = swatch(layer);
    item.append(chip, el('span', friendly(layer)), el('small', mm(layer.thicknessMm)));
    const kind = GERBER_KIND[layer.name];
    if (kind) item.append(el('a', kind, { href: `gerbers.html?layer=${kind.slice(1)}`, title: `Open ${friendly(layer).toLowerCase()} in Gerber inspection` }));
    legend.append(item);
  }
  legend.append(el('li', 'Gold edges: ENIG finish on exposed copper', { className: 'muted' }));
  const side = el('div'); side.append(legend, toggle);
  figure.append(drawing, side);
  return figure;
}

function currentCard(board, copperMm) {
  const card = el('div', undefined, { className: 'stackup-card' });
  card.append(el('h3', 'Track current (estimate)'));
  if (!board || !copperMm) { card.append(el('p', 'Track data or copper thickness is missing for this revision.', { className: 'muted' })); return card; }
  const nets = trackWidths(board), byWidth = new Map();
  for (const { net, widths } of nets) for (const { widthMm } of widths) byWidth.set(widthMm, [...(byWidth.get(widthMm) ?? []), net]);
  const list = el('ul', undefined, { className: 'current-list' });
  for (const [width, names] of [...byWidth].sort((a, b) => b[0] - a[0])) list.append(el('li', `${width} mm tracks ≈ ${trackCurrentA(width, copperMm).toFixed(1)} A · ${names.length} net${names.length > 1 ? 's' : ''}`));
  card.append(list);
  const narrowing = nets.filter(n => n.widths.length > 1);
  if (narrowing.length) card.append(el('p', `Narrower in places, so the narrowest width sets the limit: ${narrowing.map(n => `${n.net} ${n.widths[0].widthMm} mm for ${n.widths[0].lengthMm.toFixed(1)} mm (≈ ${trackCurrentA(n.widths[0].widthMm, copperMm).toFixed(1)} A)`).join('; ')}.`));
  const details = el('details'); details.append(el('summary', `Every net's track widths · ${nets.length} nets`));
  const table = el('table'); const head = el('tr'); for (const label of ['Net', 'Widths (length)', 'Estimate']) head.append(el('th', label)); table.append(head);
  for (const { net, widths } of nets) { const row = el('tr'); row.append(el('td', net), el('td', widths.map(w => `${w.widthMm} mm (${w.lengthMm.toFixed(1)} mm)`).join(', ')), el('td', `≈ ${trackCurrentA(widths[0].widthMm, copperMm).toFixed(2)} A`)); table.append(row); }
  const scroll = el('div', undefined, { className: 'table-scroll' }); scroll.append(table); details.append(scroll);
  card.append(details, el('p', `IPC-2221 outer-layer estimate for ${Math.round(copperMm * 1000)} µm copper and a 10 °C rise. Straight tracks only: copper pours and arcs are not included. An estimate, not a measurement.`, { className: 'muted' }));
  return card;
}

function impedanceCard(stackup) {
  const card = el('div', undefined, { className: 'stackup-card' });
  card.append(el('h3', 'Impedance'));
  const off = /^no$/i.test(String(stackup.dielectricConstraints));
  card.append(el('p', off ? 'Impedance control is off in the KiCad stackup.' : 'The KiCad stackup has impedance constraints enabled: confirm them with the factory.'));
  const context = document.getElementById('stackup-impedance-context');
  if (off && context) card.append(el('p', context.textContent));
  const core = stackup.layers.find(layer => /core|prepreg/i.test(layer.type));
  if (core?.epsilonR) card.append(el('p', `εr ${core.epsilonR} and tan δ ${core.lossTangent} are KiCad's ${core.material || 'core'} entries, not data from a supplier.`, { className: 'muted' }));
  return card;
}

function provenance(stackup, version) {
  const details = el('details', undefined, { className: 'stackup-provenance' });
  details.append(el('summary', `From the KiCad stackup in PCB ${stackup.sourceSha256.slice(0, 8)} · ${stackup.status} · raw table, JSON and checksum`));
  const table = el('table'); const head = el('tr'); for (const label of ['KiCad layer', 'Type', 'Thickness', 'Material', 'Colour', 'εr', 'tan δ']) head.append(el('th', label)); table.append(head);
  for (const layer of stackup.layers) { const row = el('tr'); for (const value of [layer.name, layer.type, mm(layer.thicknessMm), layer.material, layer.color, layer.epsilonR, layer.lossTangent]) row.append(el('td', value || '—')); table.append(row); }
  const scroll = el('div', undefined, { className: 'table-scroll' }); scroll.append(table);
  const links = el('p'); links.append(el('a', 'Download the stackup JSON', { href: artifactUrl(version, 'stackup') }), document.createTextNode(' · '), el('a', 'Manufacturing control roadmap', { href: 'doc-07-manufacturing-control.html' }));
  details.append(scroll, el('p', `PCB source SHA-256: ${stackup.sourceSha256}`, { className: 'muted' }), links);
  return details;
}

try {
  const version = await selectedPromise;
  const response = await fetch(artifactUrl(version, 'stackup'), { cache: 'no-cache' });
  if (!response.ok) throw new Error('the stackup export is missing');
  const stackup = await response.json();
  const board = version.metadata ? await json(`review/${version.metadata}`).catch(() => null) : null;
  const manufacturing = window.releaseData?.manufacturing ?? null, isCurrent = version.id === 'current';
  const copperMm = isCurrent && manufacturing ? copperWeightMm(manufacturing.copperWeight) : stackup.layers.find(l => l.type === 'copper')?.thicknessMm ?? null;
  const cards = el('div', undefined, { className: 'stackup-cards' }); cards.append(currentCard(board, copperMm), impedanceCard(stackup));
  root.replaceChildren(orderCard(stackup, manufacturing, board?.bounds ?? null, isCurrent), sectionFigure(stackup), cards, provenance(stackup, version));
} catch (error) { root.textContent = `The stackup is unavailable: ${error.message}.`; }
