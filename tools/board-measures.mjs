// Board features board.json does not carry: silkscreen line widths and text
// sizes, and the distances from filled copper pours (the fills KiCad saves in
// the board file) to the board outline and to holes of other nets. The Board
// statistics page compares them with the makers' published limits.
//
// Usage: node tools/board-measures.mjs <board.kicad_pcb> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseSexpr, child, children, atom, number, point, angle } from './kicad-sexpr.mjs';
import { boardData } from './board-data.mjs';
import { edgeDistance, holeOf, segmentSegment } from '../web/manufacturability.mjs';

const round = value => Math.round(value * 1000) / 1000;
const strip = net => String(net ?? '').replace(/^\//, '');
const SILK = /^[FB]\.SilkS$/;
const GRAPHIC = /^(fp|gr)_(line|rect|circle|arc|poly|curve)$/;
const TEXT = /^(fp|gr)_text(_box)?$/;

/** Footprint-local point to board millimetres (KiCad angles turn counter-clockwise on screen, Y down). */
export function toBoard([x, y, rotation], [lx, ly]) {
  const a = rotation * Math.PI / 180;
  return [round(x + lx * Math.cos(a) + ly * Math.sin(a)), round(y - lx * Math.sin(a) + ly * Math.cos(a))];
}

// A flag such as hide may be a bare atom (old files), (hide yes) on the item, or (hide yes) in its effects.
const flag = (node, name) => node.includes(name) || ['yes', 'true'].includes(atom(node, name)) || (child(node, 'effects') && (child(node, 'effects').includes(name) || ['yes', 'true'].includes(atom(child(node, 'effects'), name))));
const filled = node => { const f = child(node, 'fill'); return Boolean(f) && !['no', 'none', 'false'].includes(String(f[1] ?? 'no')); };
const strokeWidth = node => { const s = child(node, 'stroke'); const w = s ? atom(s, 'width', null) : atom(node, 'width', null); return w === null ? null : number(w); };
function firstPoint(node) {
  for (const name of ['start', 'center', 'at']) if (child(node, name)) return point(child(node, name));
  const xy = child(child(node, 'pts') ?? [], 'xy');
  return xy ? point(xy) : [0, 0];
}

/**
 * Silkscreen line widths and text sizes, footprint and board items alike.
 * Filled shapes are not lines; a zero stroke on an unfilled shape is counted
 * as excluded rather than as a 0 mm line; hidden or empty text is skipped.
 */
export function silkscreen(pcb) {
  const lines = [], heights = [], thicknesses = [];
  const excluded = { filledShapes: 0, zeroWidthLines: 0, hiddenText: 0, emptyText: 0, outlineFontText: 0 };
  const owners = [{ node: pcb, frame: [0, 0, 0], ref: null, footprint: null }, ...children(pcb, 'footprint').map(node => {
    const at = child(node, 'at'), [x, y] = point(at);
    return { node, frame: [x, y, angle(at?.[3])], ref: children(node, 'property').find(p => p[1] === 'Reference')?.[2] ?? null, footprint: String(node[1]).replace(/^.*:/, '') };
  })];
  for (const { node, frame, ref, footprint } of owners) {
    const own = ref ? { ref, footprint } : {};
    for (const item of node.filter(entry => Array.isArray(entry))) {
      const layer = atom(item, 'layer');
      if (!SILK.test(layer)) continue;
      if (GRAPHIC.test(item[0])) {
        if (filled(item)) { excluded.filledShapes++; continue; }
        const width = strokeWidth(item);
        if (!width) { excluded.zeroWidthLines++; continue; }
        const kind = item[0].replace(/^(fp|gr)_/, '');
        const at = toBoard(frame, firstPoint(item));
        lines.push({ value: width, where: { ...own, layer, at, label: ref ? `${ref} ${kind} (${footprint})` : `board ${kind} on ${layer} at (${at.join(', ')})` } });
        continue;
      }
      const isText = TEXT.test(item[0]) || (item[0] === 'property' && ref);
      if (!isText) continue;
      const text = item[0] === 'property' ? String(item[2] ?? '') : item[0] === 'fp_text' ? String(item[2] ?? '') : String(item[1] ?? '');
      if (flag(item, 'hide')) { excluded.hiddenText++; continue; }
      if (!text.trim()) { excluded.emptyText++; continue; }
      const font = child(child(item, 'effects') ?? [], 'font') ?? [];
      const size = child(font, 'size');
      if (!size) continue;
      const shown = text.replace(/\$\{REFERENCE\}/g, ref ?? '').replace(/\$\{VALUE\}/g, children(node, 'property').find(p => p[1] === 'Value')?.[2] ?? '');
      const name = item[0] === 'property' ? item[1].toLowerCase() : item[0] === 'fp_text' && item[1] !== 'user' ? item[1] : 'text';
      const where = { ...own, layer, at: toBoard(frame, item[0].endsWith('_box') ? firstPoint(item) : point(child(item, 'at'))), label: ref ? `${ref} ${name} “${shown}” (${footprint})` : `board text “${shown}” on ${layer}` };
      heights.push({ value: number(size[1]), where });
      // An outline (TrueType) font has no stroke thickness.
      if (child(font, 'face')) { excluded.outlineFontText++; continue; }
      const thickness = atom(font, 'thickness', null);
      if (thickness !== null) thicknesses.push({ value: number(thickness), where });
    }
  }
  return { lineWidth: smallest(lines), textHeight: smallest(heights), textThickness: smallest(thicknesses), excluded };
}

function smallest(items) {
  if (!items.length) return null;
  const best = items.reduce((a, b) => b.value < a.value ? b : a);
  return { value: round(best.value), where: best.where, count: items.length, values: items.map(i => round(i.value)) };
}

/** Filled copper of every copper zone, as closed rings of board points (fractured outlines with holes slit in). */
export function pourPolygons(pcb) {
  const nets = new Map(children(pcb, 'net').map(net => [net[1], net[2] ?? net[1]]));
  const zones = [pcb, ...children(pcb, 'footprint')].flatMap(owner => children(owner, 'zone'));
  const result = [];
  for (const zone of zones) {
    if (child(zone, 'keepout')) continue;
    const netNode = child(zone, 'net'), name = atom(zone, 'net_name', null) ?? (netNode ? (nets.get(netNode[1]) ?? netNode[1]) : '');
    for (const fill of children(zone, 'filled_polygon')) {
      const layer = atom(fill, 'layer', atom(zone, 'layer'));
      if (!/\.Cu$/.test(layer)) continue;
      const points = children(child(fill, 'pts') ?? [], 'xy').map(point);
      if (points.length >= 3) result.push(ring(points, { net: strip(name), layer }));
    }
  }
  return result;
}

/** A ring with its edges grouped in chunks, each with a bounding box, for fast nearest-edge searches. */
const CHUNK = 32;
export function ring(points, info = {}) {
  const chunks = [];
  for (let start = 0; start < points.length; start += CHUNK) {
    const end = Math.min(points.length, start + CHUNK);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = start; i <= end; i++) { const [x, y] = points[i % points.length]; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    chunks.push({ start, end, minX, minY, maxX, maxY });
  }
  return { ...info, points, chunks };
}

/** Even-odd test; the zero-width slits of a fractured outline cancel out. */
export function insideRing(p, { points }) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Edge-to-edge distance from a hole (segment a–b with radius r) to the copper of
 * one ring: 0 when the hole's centre lies in the copper. Edges further than
 * `limit` are skipped by their chunk's bounding box.
 */
export function holeToRing(hole, poly, limit = Infinity) {
  const { a, b, r } = hole;
  const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1])], hi = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  let best = limit;
  for (const c of poly.chunks) {
    const dx = Math.max(c.minX - hi[0], lo[0] - c.maxX, 0), dy = Math.max(c.minY - hi[1], lo[1] - c.maxY, 0);
    if (Math.hypot(dx, dy) - r >= best) continue;
    for (let i = c.start; i < c.end; i++) {
      const d = segmentSegment(a, b, poly.points[i], poly.points[(i + 1) % poly.points.length]) - r;
      if (d < best) best = d;
    }
  }
  if (best < limit && insideRing(a, poly)) return 0;
  return best;
}

/** Pour measurements: filled copper to the board outline, and to via and plated pad holes of other nets. */
export function pours(pcb, board) {
  const polys = pourPolygons(pcb);
  const outline = board.outline.length === 1 && board.outline[0].shape === 'gr_rect' ? board.outline[0] : null;
  const label = p => `${p.net || 'unnamed'} pour (${p.layer})`;
  let toEdge = null;
  if (outline) {
    const perPoly = polys.map(p => {
      let best = null;
      for (const q of p.points) { const d = edgeDistance(q, outline); if (!best || d < best.value) best = { value: d, at: q }; }
      return { value: best.value, where: { net: p.net, layer: p.layer, at: best.at.map(round), label: label(p) } };
    });
    toEdge = smallest(perPoly);
  }
  const holes = (list, describe) => {
    const items = [];
    for (const hole of list) {
      let best = null;
      for (const p of polys) {
        if (p.net === hole.net) continue;
        const d = holeToRing(hole, p, best ? best.value : Infinity);
        if (!best || d < best.value) best = { value: d, poly: p };
      }
      if (best && Number.isFinite(best.value)) items.push({ value: Math.max(0, best.value), where: describe(hole, best.poly) });
    }
    return smallest(items);
  };
  const vias = board.vias.map(v => ({ a: v.at, b: v.at, r: v.drill / 2, net: strip(v.net), owner: v }));
  const pads = board.components.flatMap(c => c.pads.filter(p => p.type === 'thru_hole' && p.drill.length).map(p => ({ ...holeOf(p), net: strip(p.net), owner: { ...p, ref: c.ref } })));
  return {
    zones: new Set(polys.map(p => `${p.net}|${p.layer}`)).size, filledPolygons: polys.length, points: polys.reduce((n, p) => n + p.points.length, 0),
    outline: outline ? 'gr_rect' : null,
    toEdge,
    viaHoleToPour: holes(vias, (h, p) => ({ net: h.net, at: h.a.map(round), label: `${h.net || 'unnamed'} via to the ${label(p)}` })),
    padHoleToPour: holes(pads, (h, p) => ({ ref: h.owner.ref, at: [h.owner.x, h.owner.y].map(round), label: `${h.owner.ref} pad ${h.owner.number} to the ${label(p)}` })),
  };
}

export function boardMeasures(source) {
  const pcb = parseSexpr(source);
  if (pcb[0] !== 'kicad_pcb') throw new Error('Expected a KiCad PCB file');
  const board = boardData(source);
  return {
    schemaVersion: 1,
    boardSha256: createHash('sha256').update(source).digest('hex'),
    coordinates: 'Board millimetres, X right / Y down (KiCad axes); "at" is where the feature is.',
    silkscreen: silkscreen(pcb),
    pours: pours(pcb, board),
    limitations: [
      'Silkscreen sizes are the values set in KiCad (stroke width, text size height and stroke thickness); text height is KiCad\'s text size, not a measured glyph height. Filled silkscreen shapes are not lines and are not counted; outline (TrueType) fonts have no stroke thickness.',
      'Pours are measured from the fills saved in the board file: refill zones in KiCad before a release so they match the design. The outline distance needs a single gr_rect outline.',
      'Pour-to-hole distances are hole edge to filled copper edge, for via holes and plated pad holes on other nets; non-plated holes are not included.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node tools/board-measures.mjs <board.kicad_pcb> <out.json>');
  const result = boardMeasures(readFileSync(input, 'utf8'));
  writeFileSync(output, JSON.stringify(result));
  const s = result.silkscreen, p = result.pours, v = x => x ? `${x.value} mm` : 'n/a';
  console.log(`Board measures: silk line ${v(s.lineWidth)}, text height ${v(s.textHeight)}, text stroke ${v(s.textThickness)}; pour to edge ${v(p.toEdge)}, via hole ${v(p.viaHoleToPour)}, pad hole ${v(p.padHoleToPour)}.`);
}
