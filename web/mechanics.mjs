// Enclosure & mechanics: a dimensioned top-view drawing generated from the
// release's board data, and the features a case must respect.
import { selectedPromise } from './revision.mjs';
import { json } from './review-data.mjs';
import { svgNode, attachViewport } from './review-draw.mjs';
import { mechanicsFeatures } from './mechanics-model.mjs';

const byId = id => document.getElementById(id);
const el = (tag, text, props = {}) => Object.assign(document.createElement(tag), props, text === undefined ? {} : { textContent: text });
const svg = byId('mech-drawing'), body = byId('mech-features');
const ink = '#242b28', accent = '#98613c', green = '#244f43', faint = '#b9c0b6';

function label(parent, x, y, text, { size = 1.6, anchor = 'middle', fill = ink, weight = 400 } = {}) {
  const t = svgNode('text', { x, y, 'font-size': size, 'text-anchor': anchor, fill, 'font-weight': weight, 'font-family': 'system-ui, sans-serif' });
  t.textContent = text; parent.append(t); return t;
}
function dimension(parent, [x1, y1], [x2, y2], offset, text) {
  // A dimension line parallel to the measured edge, with extension lines and arrows.
  const horizontal = y1 === y2, [dx, dy] = horizontal ? [0, offset] : [offset, 0];
  const a = [x1 + dx, y1 + dy], b = [x2 + dx, y2 + dy];
  const g = svgNode('g', { stroke: green, 'stroke-width': 0.18, fill: 'none' });
  g.append(svgNode('line', { x1, y1, x2: a[0] + Math.sign(dx) * 0.8, y2: a[1] + Math.sign(dy) * 0.8 }), svgNode('line', { x1: x2, y1: y2, x2: b[0] + Math.sign(dx) * 0.8, y2: b[1] + Math.sign(dy) * 0.8 }));
  g.append(svgNode('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'marker-start': 'url(#mech-arrow)', 'marker-end': 'url(#mech-arrow)' }));
  parent.append(g);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const t = label(parent, mid[0] + (horizontal ? 0 : -1.2 * Math.sign(-offset)), mid[1] + (horizontal ? (offset < 0 ? -1 : 2.4) : 0.6), text, { fill: green, weight: 600, anchor: horizontal ? 'middle' : offset < 0 ? 'end' : 'start' });
  return t;
}

function draw(board, features) {
  const outline = board.outline?.find(o => o.shape === 'gr_rect');
  const b = board.bounds, [ox, oy] = features.origin, margin = 14;
  svg.replaceChildren();
  const defs = svgNode('defs'), marker = svgNode('marker', { id: 'mech-arrow', viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  marker.append(svgNode('path', { d: 'M0,1 L9,5 L0,9 z', fill: green })); defs.append(marker); svg.append(defs);
  const r = outline?.radius ?? 0;
  svg.append(svgNode('rect', { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY, rx: r, ry: r, fill: '#fffef9', stroke: ink, 'stroke-width': 0.3 }));
  // Context: every footprint body, faint.
  const featureRefs = new Set(features.parts.map(p => p.ref));
  const all = svgNode('g', { fill: 'none', stroke: faint, 'stroke-width': 0.12 });
  for (const part of features.allBodies) if (!featureRefs.has(part.ref)) all.append(svgNode('rect', { x: part.body.minX, y: part.body.minY, width: part.body.maxX - part.body.minX, height: part.body.maxY - part.body.minY, 'stroke-dasharray': part.side === 'bottom' ? '0.6 0.4' : 'none' }));
  svg.append(all);
  for (const part of features.parts) {
    const { body: p } = part, colour = part.edge ? accent : green;
    svg.append(svgNode('rect', { x: p.minX, y: p.minY, width: p.maxX - p.minX, height: p.maxY - p.minY, fill: part.edge ? 'rgba(152,97,60,.08)' : 'rgba(36,79,67,.06)', stroke: colour, 'stroke-width': 0.22, 'stroke-dasharray': part.side === 'bottom' ? '0.8 0.5' : 'none' }));
    label(svg, (p.minX + p.maxX) / 2, (p.minY + p.maxY) / 2 + 0.6, part.ref, { fill: colour, weight: 600, size: 1.8 });
  }
  for (const hole of features.holes) {
    svg.append(svgNode('circle', { cx: hole.abs[0], cy: hole.abs[1], r: hole.drillMm / 2, fill: '#e7e9e2', stroke: ink, 'stroke-width': 0.2 }));
    svg.append(svgNode('path', { d: `M${hole.abs[0] - 2.4} ${hole.abs[1]}h4.8M${hole.abs[0]} ${hole.abs[1] - 2.4}v4.8`, stroke: ink, 'stroke-width': 0.1 }));
    const below = hole.abs[1] < (b.minY + b.maxY) / 2;
    label(svg, hole.abs[0], hole.abs[1] + (below ? 4.2 : -3), `Ø${hole.drillMm} · ${hole.at[0]}, ${hole.at[1]}`, { size: 1.4 });
  }
  dimension(svg, [b.minX, b.minY], [b.maxX, b.minY], -7, `${features.size[0]} mm`);
  dimension(svg, [b.minX, b.minY], [b.minX, b.maxY], -7, `${features.size[1]} mm`);
  if (r) label(svg, b.maxX - r * 0.3, b.maxY + 3.4, `R${r} corners`, { size: 1.4, anchor: 'end', fill: green });
  // Origin and axes, as the mechanical package defines them.
  const axes = svgNode('g', { stroke: accent, 'stroke-width': 0.25, fill: 'none' });
  axes.append(svgNode('path', { d: `M${ox} ${oy}h6`, 'marker-end': 'url(#mech-arrow)' }), svgNode('path', { d: `M${ox} ${oy}v6`, 'marker-end': 'url(#mech-arrow)' }), svgNode('circle', { cx: ox, cy: oy, r: 0.7, fill: accent }));
  svg.append(axes);
  label(svg, ox + 7, oy + 0.6, 'X', { size: 1.5, anchor: 'start', fill: accent, weight: 600 });
  label(svg, ox + 0.3, oy + 8.2, 'Y', { size: 1.5, anchor: 'start', fill: accent, weight: 600 });
  label(svg, ox - 1, oy - 1, '0, 0', { size: 1.5, anchor: 'end', fill: accent, weight: 600 });
  return [b.minX - margin, b.minY - margin, b.maxX - b.minX + 2 * margin, b.maxY - b.minY + 2 * margin];
}

function table(features) {
  const rows = [
    ...features.holes.map(h => [h.ref, `Mounting hole Ø${h.drillMm} mm${h.plated ? ', plated' : ''}`, 'both', `${h.at[0]}, ${h.at[1]} (centre)`, `Ø${h.drillMm}`, '—']),
    ...features.parts.map(p => [p.ref, p.value, p.side, `${p.from[0]}, ${p.from[1]} (top-left)`, `${p.size[0]} × ${p.size[1]}`,
      p.edge ? (p.overhangMm ? `${p.edge}: ${p.overhangMm} mm past the edge` : `${p.edge}: ${p.gapMm} mm inside`) : 'large part']),
  ];
  body.replaceChildren(...rows.map(values => { const tr = el('tr'); values.forEach((v, i) => tr.append(el('td', String(v), i === 5 && /past/.test(v) ? { className: 'overhang' } : {}))); return tr; }));
}

try {
  const version = await selectedPromise;
  const [board, check] = await Promise.all([json(`review/${version.metadata}`), version.fabCheck ? json(`review/${version.fabCheck}`).catch(() => null) : null]);
  const origin = version.id === 'current' ? window.releaseData?.mechanical?.originAbsoluteMm ?? null : null;
  const features = mechanicsFeatures(board, check, { origin });
  features.allBodies = (check?.parts ?? []).filter(p => p.body);
  const box = draw(board, features);
  const viewport = attachViewport([svg]); viewport.set(box);
  const zoom = f => { const [x, y, w, h] = viewport.get(); viewport.set([x + w * (1 - f) / 2, y + h * (1 - f) / 2, w * f, h * f]); };
  byId('mech-fit').addEventListener('click', () => viewport.set(box));
  byId('mech-zoom-in').addEventListener('click', () => zoom(1 / 1.4));
  byId('mech-zoom-out').addEventListener('click', () => zoom(1.4));
  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase(); if (key === 'f') viewport.set(box); else if (key === '+' || key === '=') zoom(1 / 1.4); else if (key === '-') zoom(1.4);
  });
  table(features);
  if (!check) byId('mech-note').textContent = 'Part outlines are not recorded for this revision; only the outline and mounting holes are drawn.';
} catch (error) { body.replaceChildren(el('tr', `The drawing could not load: ${error.message}`)); }
