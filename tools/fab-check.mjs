// Pre-order checks for one revision: what the assembler's placement file says,
// where each part's pads and body really are, and which pad carries which pin.
// The Gerber page draws this over the released manufacturing layers.
//
// Usage: node tools/fab-check.mjs <board.kicad_pcb> <schematic.kicad_sch> <board.json> <out.json> [placement.csv]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseSexpr, child, children, atom, point, angle } from './kicad-sexpr.mjs';
import { parseCsv } from './lib/formats.mjs';
import { insidePad } from '../web/fab-geometry.mjs';
import { readFlashes } from './gerber-flashes.mjs';

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

/**
 * Filled copper pours, for click-to-identify: each filled polygon of each zone
 * with its net and layer, as a flat [x0, y0, x1, y1, …] list rounded to 0.01 mm
 * and thinned where points are closer than 0.1 mm (the fill KiCad saved).
 */
export function pours(pcbSource) {
  const board = parseSexpr(pcbSource), result = [];
  for (const zone of children(board, 'zone')) {
    if (child(zone, 'keepout')) continue;
    const net = String(child(zone, 'net')?.[1] ?? '').replace(/^\//, '');
    for (const fill of children(zone, 'filled_polygon')) {
      const layer = atom(fill, 'layer') ?? atom(zone, 'layer');
      const points = [];
      for (const [x, y] of children(child(fill, 'pts') ?? [], 'xy').map(point)) {
        const n = points.length;
        if (!n || Math.hypot(x - points[n - 2], y - points[n - 1]) >= 0.1) points.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
      }
      if (points.length >= 6) result.push({ net, layer, points });
    }
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
      // KiCad text markup: V_{SS} → VSS, ~{RESET} → RESET (overbar).
      if (numberOf !== undefined && name && name !== '~') names[numberOf] = name.replace(/[_^~]\{([^}]*)\}/g, '$1');
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

const PLACEMENT_COLUMNS = ['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'];

/**
 * The assembler's placement file (JLCPCB CPL columns); Y is flipped back to board
 * axes. Anything malformed stops the build rather than producing "no findings".
 */
export function readPlacement(csv) {
  const rows = parseCsv(csv), result = new Map();
  const missing = PLACEMENT_COLUMNS.filter(column => rows.length && !(column in rows[0]));
  if (!rows.length || missing.length) throw new Error(`Placement file needs the columns ${PLACEMENT_COLUMNS.join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : '; it has no rows'}.`);
  rows.forEach((row, index) => {
    const ref = String(row.Designator ?? '').trim(), line = index + 2;
    const values = ['Mid X', 'Mid Y', 'Rotation'].map(column => String(row[column] ?? '').trim());
    if (!ref) throw new Error(`Placement file line ${line}: empty designator.`);
    if (result.has(ref)) throw new Error(`Placement file line ${line}: ${ref} appears twice.`);
    if (values.some(value => value === '' || !Number.isFinite(Number(value)))) throw new Error(`Placement file line ${line}: ${ref} has a missing or non-numeric position or rotation.`);
    if (!/^(top|bottom)$/i.test(String(row.Layer).trim())) throw new Error(`Placement file line ${line}: ${ref} has layer "${row.Layer}", expected Top or Bottom.`);
    result.set(ref, { x: round(Number(values[0])), y: round(-Number(values[1])), rotation: Number(values[2]), side: String(row.Layer).trim().toLowerCase() });
  });
  return result;
}

const pin1Of = pads => pads.find(p => p.number === '1') ?? pads.find(p => /^A1$/i.test(p.number)) ?? null;

/** Paste coverage below or above these fractions of a pad's copper is reported. */
export const PASTE_COVERAGE = { min: 0.5, max: 1.1 };

/**
 * Paste coverage per pad from the released Gerbers: the stencil openings whose
 * centre lies on the pad, as a fraction of the pad's copper flash area.
 */
export function pasteCoverage(parts, pasteSources, copperSources) {
  // Stacked pads (USB-C A1/B12 share one land) give identical openings; count each once.
  const paste = [...new Map(pasteSources.flatMap(source => readFlashes(source).flashes).filter(f => f.ref).map(f => [[f.ref, f.x, f.y, f.width, f.height].join(), f])).values()];
  const copper = new Map();
  for (const [side, source] of copperSources) for (const f of readFlashes(source).flashes) if (f.ref && f.pad) {
    const key = `${f.ref}\u0000${f.pad}\u0000${side}`; copper.set(key, [...(copper.get(key) ?? []), f]);
  }
  for (const part of parts) for (const pad of part.pads) {
    if (pad.type !== 'smd') continue;
    const flashes = copper.get(`${part.ref}\u0000${pad.number}\u0000${part.side}`) ?? [];
    const own = flashes.find(f => Math.abs(f.x - pad.x) < 0.01 && Math.abs(f.y - pad.y) < 0.01) ?? (flashes.length === 1 ? flashes[0] : null);
    if (!own) continue;
    const openings = paste.filter(f => f.ref === part.ref && insidePad(pad, [f.x, f.y], 0.01));
    pad.copperAreaMm2 = Math.round(own.area * 1000) / 1000;
    pad.pasteOpenings = openings.length;
    pad.pasteCoverage = Math.round(openings.reduce((sum, f) => sum + f.area, 0) / own.area * 1000) / 1000;
  }
}

export function fabCheck({ pcbSource, schSource, board, placementCsv = null, placementName = null, pasteSources = [], copperSources = [] }) {
  const yards = courtyards(pcbSource), names = pinNames(schSource);
  const placement = placementCsv ? readPlacement(placementCsv) : null;
  const findings = [];
  // kind: placement (off-centre), side, unknown (not on the board) or paste.
  const add = (severity, ref, at, message, kind) => findings.push({ severity, kind, ref, at, message });
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
      pads, pin1: pin1 ? [pin1.x, pin1.y] : null, placement: null, padCentre: padBox ? centre(padBox) : null,
    };

    // Reflow solders only pads that get paste. A pad without its own opening may
    // still be covered by a paste-only aperture of the same footprint (exposed
    // pads). Only parts the assembler places are checked: hand-fitted parts are
    // soldered without paste.
    const pasteOnly = component.pads.filter(p => !p.layers.some(l => /Cu$/.test(l)) && p.layers.some(l => /Paste$/.test(l)));
    part.unpasted = pads.filter(p => p.type === 'smd' && !p.paste && !pasteOnly.some(a => insidePad(p, [a.x, a.y], 0.01))).map(p => p.number);
    return part;
  });

  const measured = pasteSources.length && copperSources.length;
  if (measured) pasteCoverage(parts, pasteSources, copperSources);
  if (placement) {
    const byRef = new Map(parts.map(part => [part.ref, part]));
    for (const [ref, place] of placement) {
      const part = byRef.get(ref);
      if (!part) { add('error', ref, [place.x, place.y], `${placementName} places ${ref}, which is not on the board.`, 'unknown'); continue; }
      part.placement = place;
      if (place.side !== part.side) add('error', ref, [place.x, place.y], `${placementName} puts ${ref} on the ${place.side}; the board has it on the ${part.side}.`, 'side');
      if (part.body) {
        const [cx, cy] = centre(part.body), offset = Math.hypot(place.x - cx, place.y - cy);
        const padCentre = part.padCentre, padOffset = padCentre ? Math.hypot(place.x - padCentre[0], place.y - padCentre[1]) : null;
        Object.assign(part.placement, { offsetMm: round(offset), padOffsetMm: padOffset === null ? null : round(padOffset) });
        if (offset > CENTROID_TOLERANCE_MM) {
          const b = board.bounds, overhang = part.body.minX < b.minX || part.body.minY < b.minY || part.body.maxX > b.maxX || part.body.maxY > b.maxY;
          add('review', ref, [place.x, place.y], `Placement point is ${offset.toFixed(2)} mm from the ${part.body.source === 'courtyard' ? 'courtyard' : 'pad'} centre${padOffset === null ? '' : ` and ${padOffset.toFixed(2)} mm from the pad centre`}.${overhang ? ' The courtyard extends past the board edge, so it may include an overhanging body.' : ''} The assembler's centroid for this part is not known here: confirm the position in their placement preview.`, 'placement');
        }
      }
      if (part.unpasted.length) {
        const first = part.pads.find(p => p.number === part.unpasted[0]);
        add('review', ref, [first.x, first.y], `${part.unpasted.length === 1 ? `Pad ${part.unpasted[0]} has` : `Pads ${part.unpasted.join(', ')} have`} copper but no solder paste, so reflow will not solder ${part.unpasted.length === 1 ? 'it' : 'them'}. Confirm that is intended.`, 'paste');
      }
      // Paste volume: too little leaves dry joints, more than the pad invites bridges.
      for (const pad of measured ? part.pads.filter(p => p.pasteCoverage !== undefined && p.pasteOpenings) : []) {
        const exposed = pad.pasteOpenings > 1 || (pad.copperAreaMm2 ?? 0) > 2;
        if (pad.pasteCoverage < PASTE_COVERAGE.min) add('review', ref, [pad.x, pad.y], `Pad ${pad.number}${pad.name ? ` (${pad.name})` : ''} gets paste over ${Math.round(pad.pasteCoverage * 100)} % of its copper${exposed ? ' (an exposed pad, usually 50–80 %)' : ''}. Check the stencil opening.`, 'paste-coverage');
        else if (pad.pasteCoverage > PASTE_COVERAGE.max) add('review', ref, [pad.x, pad.y], `Pad ${pad.number}${pad.name ? ` (${pad.name})` : ''} has a stencil opening ${Math.round(pad.pasteCoverage * 100)} % of its copper; paste beyond the pad can bridge. Check the stencil opening.`, 'paste-coverage');
      }
      const native = ((place.rotation - part.rotation) % 360 + 360) % 360;
      if (native) part.placement.rotationDifference = native;
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
    pours: pours(pcbSource),
    findings,
    limitations: [
      'Checks compare the design, the placement file and the paste openings defined on each footprint pad. They do not replace DRC, the assembler\'s own review or a datasheet check of each pin map.',
      'Missing paste is checked only for parts in the placement file; hand-fitted parts are soldered without paste.',
      measured ? `Paste coverage is the stencil openings centred on a pad as a share of the pad's copper, from the released Gerbers; under ${PASTE_COVERAGE.min * 100} % or over ${PASTE_COVERAGE.max * 100} % is reported. Stencil thickness and the assembler's own aperture changes are not known here.` : 'Paste coverage was not measured: the stencil files are recorded for the current build only.',
      'The body centre is estimated from the footprint courtyard (or the pads when there is none). A courtyard can include overhangs, so a reported offset is a prompt to check, not a confirmed error.',
      placement ? 'Rotation is shown as the placement file gives it; whether it matches the assembler\'s part orientation, including their convention for bottom-side parts, can only be confirmed in their preview.' : 'No placement file is recorded for this revision.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), options = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
  const [pcb, sch, boardJson, out, placementPath] = args.filter(a => !a.startsWith('--'));
  const files = list => (list ? list.split(',') : []).filter(Boolean);
  const pasteSources = files(options.paste).map(path => readFileSync(path, 'utf8'));
  const copperSources = files(options.copper).map(path => [/\.gbl$|B_Cu/i.test(path) ? 'bottom' : 'top', readFileSync(path, 'utf8')]);
  if (placementPath && !existsSync(placementPath)) throw new Error(`Placement file not found: ${placementPath}`);
  const hasPlacement = Boolean(placementPath);
  const result = fabCheck({
    pcbSource: readFileSync(pcb, 'utf8'), schSource: readFileSync(sch, 'utf8'), board: JSON.parse(readFileSync(boardJson, 'utf8')),
    placementCsv: hasPlacement ? readFileSync(placementPath, 'utf8') : null, placementName: hasPlacement ? placementPath.replace(/^.*[\\/]/, '') : null,
    pasteSources, copperSources,
  });
  writeFileSync(out, JSON.stringify(result));
  console.log(`Fab check: ${result.parts.length} parts, ${result.findings.length} findings.`);
}
