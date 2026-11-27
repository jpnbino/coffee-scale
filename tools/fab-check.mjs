// Pre-order checks for one revision: what the assembler's placement file says,
// where each part's pads and body really are, and which pad carries which pin.
// The Gerber page draws this over the released manufacturing layers.
//
// Usage: node tools/fab-check.mjs <board.kicad_pcb> <schematic.kicad_sch> <board.json> <out.json> [placement.csv]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseSexpr, child, children, atom, point, angle } from './kicad-sexpr.mjs';
import { parseCsv } from './lib/formats.mjs';

/** A placement point further than this from the part's body is reported. */
export const CENTROID_TOLERANCE_MM = 0.5;

const round = value => Number(value.toFixed(4));
const toBoard = (x, y, rotation, [lx, ly]) => {
  const a = rotation * Math.PI / 180;
  return [x + lx * Math.cos(a) + ly * Math.sin(a), y - lx * Math.sin(a) + ly * Math.cos(a)];
};
const box = points => points.length ? {
  minX: Math.min(...points.map(p => p[0])), minY: Math.min(...points.map(p => p[1])),
  maxX: Math.max(...points.map(p => p[0])), maxY: Math.max(...points.map(p => p[1])),
} : null;
const centre = b => [round((b.minX + b.maxX) / 2), round((b.minY + b.maxY) / 2)];

/** Courtyard outline of every footprint, in board millimetres (X right, Y down). */
export function courtyards(pcbSource) {
  const board = parseSexpr(pcbSource), result = new Map();
  for (const footprint of children(board, 'footprint')) {
    const ref = children(footprint, 'property').find(p => p[1] === 'Reference')?.[2];
    const at = child(footprint, 'at'), [x, y] = point(at), rotation = angle(at?.[3]);
    const points = [];
    for (const graphic of footprint.filter(item => Array.isArray(item) && /^fp_(line|rect|poly|circle|arc)$/.test(item[0]))) {
      if (!/CrtYd$/.test(atom(graphic, 'layer'))) continue;
      const local = graphic[0] === 'fp_poly' ? children(child(graphic, 'pts') ?? [], 'xy').map(point)
        : graphic[0] === 'fp_circle' ? (() => { const c = point(child(graphic, 'center')), e = point(child(graphic, 'end')), r = Math.hypot(e[0] - c[0], e[1] - c[1]); return [[c[0] - r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r], [c[0] + r, c[1] - r]]; })()
        : graphic[0] === 'fp_rect' ? (() => { const s = point(child(graphic, 'start')), e = point(child(graphic, 'end')); return [s, e, [s[0], e[1]], [e[0], s[1]]]; })()
        : ['start', 'mid', 'end'].map(name => child(graphic, name)).filter(Boolean).map(point);
      points.push(...local.map(p => toBoard(x, y, rotation, p)));
    }
    if (ref && points.length) result.set(ref, box(points));
  }
  return result;
}

/** Symbol pin names per reference and pin number, e.g. Q4 → { 1: 'G', 2: 'S', 3: 'D' }. */
export function pinNames(schSource) {
  const schematic = parseSexpr(schSource), library = new Map();
  for (const symbol of children(child(schematic, 'lib_symbols') ?? [], 'symbol')) {
    const names = {};
    for (const unit of [symbol, ...children(symbol, 'symbol')]) for (const pin of children(unit, 'pin')) {
      const numberOf = child(pin, 'number')?.[1], name = child(pin, 'name')?.[1];
      if (numberOf !== undefined && name && name !== '~') names[numberOf] = name;
    }
    library.set(symbol[1], names);
  }
  const result = new Map();
  for (const symbol of children(schematic, 'symbol')) {
    const ref = children(symbol, 'property').find(p => p[1] === 'Reference')?.[2];
    if (ref && !ref.startsWith('#')) result.set(ref, { ...(result.get(ref) ?? {}), ...(library.get(atom(symbol, 'lib_id')) ?? {}) });
  }
  return result;
}

/** The assembler's placement file (JLCPCB CPL columns); Y is flipped back to board axes. */
export function readPlacement(csv) {
  return new Map(parseCsv(csv).map(row => [row.Designator, {
    x: round(Number(row['Mid X'])), y: round(-Number(row['Mid Y'])), rotation: Number(row.Rotation),
    side: String(row.Layer).toLowerCase() === 'bottom' ? 'bottom' : 'top',
  }]));
}

const pin1Of = pads => pads.find(p => p.number === '1') ?? pads.find(p => /^A1$/i.test(p.number)) ?? null;

export function fabCheck({ pcbSource, schSource, board, placementCsv = null, placementName = null }) {
  const yards = courtyards(pcbSource), names = pinNames(schSource);
  const placement = placementCsv ? readPlacement(placementCsv) : null;
  const findings = [];
  const add = (severity, ref, at, message) => findings.push({ severity, ref, at, message });
  const parts = board.components.filter(c => c.ref && !c.ref.startsWith('#')).map(component => {
    const side = component.layer === 'B.Cu' ? 'bottom' : 'top';
    const copperPads = component.pads.filter(p => p.layers.some(l => /\.Cu$|^\*\.Cu$/.test(l)));
    const padBox = box(copperPads.flatMap(p => [[p.x - p.width / 2, p.y - p.height / 2], [p.x + p.width / 2, p.y + p.height / 2]]));
    const body = yards.get(component.ref) ?? padBox;
    const pinNamesOf = names.get(component.ref) ?? {};
    const pads = copperPads.map(p => ({
      number: p.number, name: pinNamesOf[p.number] ?? null, net: p.net.replace(/^\//, ''), type: p.type, shape: p.shape,
      x: p.x, y: p.y, width: p.width, height: p.height, angle: p.angle,
      paste: p.layers.some(l => /Paste$/.test(l)),
    }));
    const pin1 = pin1Of(pads);
    const part = {
      ref: component.ref, value: component.value, footprint: component.footprint.replace(/^.*:/, ''), side,
      origin: [component.x, component.y], rotation: component.rotation,
      body: body && { ...Object.fromEntries(Object.entries(body).map(([k, v]) => [k, round(v)])), source: yards.has(component.ref) ? 'courtyard' : 'pads' },
      pads, pin1: pin1 ? [pin1.x, pin1.y] : null, placement: null,
    };

    // Reflow solders only pads that get paste. A pad without its own opening may
    // still be covered by a paste-only aperture of the same footprint (exposed
    // pads). Only parts the assembler places are checked: hand-fitted parts are
    // soldered without paste.
    const pasteOnly = component.pads.filter(p => !p.layers.some(l => /Cu$/.test(l)) && p.layers.some(l => /Paste$/.test(l)));
    part.unpasted = pads.filter(p => p.type === 'smd' && !p.paste && !pasteOnly.some(a => Math.abs(a.x - p.x) <= p.width / 2 + 0.01 && Math.abs(a.y - p.y) <= p.height / 2 + 0.01)).map(p => p.number);
    return part;
  });

  if (placement) {
    const byRef = new Map(parts.map(part => [part.ref, part]));
    for (const [ref, place] of placement) {
      const part = byRef.get(ref);
      if (!part) { add('error', ref, [place.x, place.y], `${placementName} places ${ref}, which is not on the board.`); continue; }
      part.placement = place;
      if (place.side !== part.side) add('error', ref, [place.x, place.y], `${placementName} puts ${ref} on the ${place.side}; the board has it on the ${part.side}.`);
      if (part.body) {
        const [cx, cy] = centre(part.body), offset = Math.hypot(place.x - cx, place.y - cy);
        part.placement.offsetMm = round(offset);
        if (offset > CENTROID_TOLERANCE_MM) add('review', ref, [place.x, place.y], `Placement point is ${offset.toFixed(2)} mm from the centre of the part's ${part.body.source === 'courtyard' ? 'courtyard' : 'pads'}. Assemblers place the body centre there: check the assembler's preview or correct the position.`);
      }
      if (part.unpasted.length) {
        const first = part.pads.find(p => p.number === part.unpasted[0]);
        add('review', ref, [first.x, first.y], `${part.unpasted.length === 1 ? `Pad ${part.unpasted[0]} has` : `Pads ${part.unpasted.join(', ')} have`} copper but no solder paste, so reflow will not solder ${part.unpasted.length === 1 ? 'it' : 'them'}. Confirm that is intended.`);
      }
      const native = ((place.rotation - part.rotation) % 360 + 360) % 360;
      if (native) part.placement.rotationCorrection = native;
    }
  }
  const order = { error: 0, review: 1 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  return {
    schemaVersion: 1,
    coordinates: 'Board millimetres, X right / Y down, the same axes as the rendered Gerber layers (1 mm = 1000 SVG units).',
    placementFile: placementName,
    centroidToleranceMm: CENTROID_TOLERANCE_MM,
    parts: parts.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true })),
    findings,
    limitations: [
      'Checks compare the design, the placement file and paste apertures. They do not replace DRC, the assembler\'s own review or a datasheet check of each pin map.',
      'Missing paste is checked only for parts in the placement file; hand-fitted parts are soldered without paste.',
      'The body centre is taken from the footprint courtyard, or from the pads when there is no courtyard.',
      placement ? 'Rotation is shown as the placement file gives it; whether it matches the assembler\'s part orientation can only be confirmed in their preview.' : 'No placement file is recorded for this revision.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [pcb, sch, boardJson, out, placementPath] = process.argv.slice(2);
  const hasPlacement = placementPath && existsSync(placementPath);
  const result = fabCheck({
    pcbSource: readFileSync(pcb, 'utf8'), schSource: readFileSync(sch, 'utf8'), board: JSON.parse(readFileSync(boardJson, 'utf8')),
    placementCsv: hasPlacement ? readFileSync(placementPath, 'utf8') : null, placementName: hasPlacement ? placementPath.replace(/^.*[\\/]/, '') : null,
  });
  writeFileSync(out, JSON.stringify(result));
  console.log(`Fab check: ${result.parts.length} parts, ${result.findings.length} findings.`);
}
