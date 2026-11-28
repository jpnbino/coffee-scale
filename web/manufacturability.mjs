// Manufacturability: measure the board's smallest features from the release's
// board data and compare them with the makers' published limits
// (fab-capabilities.json). Pure, so it can be unit-tested and run at build time.
// Geometry is in board millimetres; pad angles turn counter-clockwise on screen.

const round = value => Math.round(value * 1000) / 1000;
const strip = net => String(net ?? '').replace(/^\//, '');
const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

/** Distance from point p to segment a–b. */
export function pointSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}
const segmentsCross = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
/** Distance between segments a–b and c–d. */
export function segmentSegment(a, b, c, d) {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}

/** Corners of a rectangular pad on the board (KiCad angle: counter-clockwise on screen, Y down). */
export function padCorners(pad) {
  const a = pad.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), w = pad.width / 2, h = pad.height / 2;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([u, v]) => [pad.x + u * c + v * s, pad.y - u * s + v * c]);
}
const edges = corners => corners.map((p, i) => [p, corners[(i + 1) % corners.length]]);
const inside = (p, corners) => edges(corners).every(([a, b]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-9) || edges(corners).every(([a, b]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 1e-9);

/** Pad copper as a shape: a circle, or a convex polygon. */
const padShape = pad => pad.shape === 'circle' || (pad.shape === 'oval' && pad.width === pad.height)
  ? { circle: [pad.x, pad.y], r: pad.width / 2 }
  : { poly: padCorners(pad) };

/** Edge-to-edge gap between two pad shapes (0 when they touch or overlap). */
export function padGap(a, b) {
  const A = padShape(a), B = padShape(b);
  if (A.circle && B.circle) return Math.max(0, dist(A.circle, B.circle) - A.r - B.r);
  if (A.circle || B.circle) {
    const [C, P] = A.circle ? [A, B] : [B, A];
    if (inside(C.circle, P.poly)) return 0;
    return Math.max(0, Math.min(...edges(P.poly).map(([p, q]) => pointSegment(C.circle, p, q))) - C.r);
  }
  if (A.poly.some(p => inside(p, B.poly)) || B.poly.some(p => inside(p, A.poly))) return 0;
  return Math.min(...edges(A.poly).flatMap(([p, q]) => edges(B.poly).map(([r, s]) => segmentSegment(p, q, r, s))));
}

/** Inside distance from point p to a rounded-rectangle outline (gr_rect with radius). */
export function edgeDistance(p, outline) {
  const [x0, y0] = outline.start, [x1, y1] = outline.end, r = outline.radius ?? 0;
  const c = [(x0 + x1) / 2, (y0 + y1) / 2], half = [Math.abs(x1 - x0) / 2 - r, Math.abs(y1 - y0) / 2 - r];
  const q = [Math.abs(p[0] - c[0]) - half[0], Math.abs(p[1] - c[1]) - half[1]];
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0)) + Math.min(Math.max(q[0], q[1]), 0) - r;
  return -outside;
}

/** A plated hole as a segment with a radius (a round hole is a zero-length segment). */
function holeOf(pad) {
  if (pad.drill.length < 2 || pad.drill[0] === pad.drill[1]) return { a: [pad.x, pad.y], b: [pad.x, pad.y], r: (pad.drill[0] ?? 0) / 2 };
  const [dw, dh] = pad.drill, a = pad.angle * Math.PI / 180, long = Math.max(dw, dh), r = Math.min(dw, dh) / 2, half = long / 2 - r;
  const [u, v] = dw >= dh ? [half, 0] : [0, half];
  const off = [u * Math.cos(a) + v * Math.sin(a), -u * Math.sin(a) + v * Math.cos(a)];
  return { a: [pad.x - off[0], pad.y - off[1]], b: [pad.x + off[0], pad.y + off[1]], r };
}

function smallest(items, value, describe) {
  let best = null;
  for (const item of items) { const v = value(item); if (v !== null && Number.isFinite(v) && (!best || v < best.value)) best = { value: v, item }; }
  // All values are kept so a page can say how many features fall below a limit.
  return best ? { value: round(best.value), where: describe(best.item), values: items.map(value).filter(v => v !== null && Number.isFinite(v)).map(round) } : null;
}

/**
 * The board's smallest features, each with where it occurs. `statistics` is
 * KiCad's board statistics export (its clearance is DRC-measured); `board`
 * is the release's board.json.
 */
export function measure(board, statistics = null) {
  const pads = board.components.flatMap(c => c.pads.map(p => ({ ...p, ref: c.ref, net: strip(p.net) })));
  const plated = pads.filter(p => p.type === 'thru_hole' && p.drill.length);
  const tracks = [...board.segments, ...(board.arcs ?? [])].map(t => ({ ...t, net: strip(t.net), start: t.start, end: t.end ?? t.start }));
  const vias = board.vias.map(v => ({ ...v, net: strip(v.net) }));
  const outline = board.outline?.find(o => o.shape === 'gr_rect');
  const at = (ref, pad, extra = '') => ({ ref, label: `${ref}${pad ? ` pad ${pad}` : ''}${extra}` });
  const results = {};

  results.trackWidth = smallest(tracks, t => t.width, t => ({ net: t.net, label: `${t.net || 'unnamed'} track` }));
  const clearance = parseFloat(statistics?.board?.min_track_clearance);
  results.clearance = Number.isFinite(clearance) ? { value: clearance, where: { label: 'measured by KiCad DRC' } } : null;
  results.drill = smallest([...vias.map(v => ({ v })), ...plated.map(p => ({ p }))], ({ v, p }) => v ? v.drill : Math.min(...p.drill), ({ v, p }) => v ? { net: v.net, label: `${v.net} via` } : at(p.ref, p.number));
  results.viaRing = smallest(vias, v => (v.diameter - v.drill) / 2, v => ({ net: v.net, label: `${v.net} via (${v.diameter}/${v.drill} mm)` }));
  results.pthRing = smallest(plated, p => {
    const [dw, dh = dw] = p.drill; return Math.min(p.width - dw, p.height - dh) / 2;
  }, p => at(p.ref, p.number));
  results.npthDrill = smallest(pads.filter(p => p.type === 'np_thru_hole' && p.drill.length), p => Math.min(...p.drill), p => at(p.ref, '', ' mounting or locating hole'));
  results.platedSlot = smallest(plated.filter(p => p.drill.length === 2 && p.drill[0] !== p.drill[1]), p => Math.min(...p.drill), p => at(p.ref, p.number));

  const holes = plated.map(p => ({ ...holeOf(p), owner: p }));
  const viaHoles = vias.map(v => ({ a: v.at, b: v.at, r: v.drill / 2, owner: v }));
  const pairs = (list, value, describe) => {
    let best = null;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const v = value(list[i], list[j]); if (!best || v < best.value) best = { value: v, i: list[i], j: list[j] }; }
    return best ? { value: round(best.value), where: describe(best.i, best.j) } : null;
  };
  const holeGap = (h, k) => segmentSegment(h.a, h.b, k.a, k.b) - h.r - k.r;
  results.viaHoleSpacing = pairs(viaHoles, holeGap, (h, k) => ({ net: h.owner.net, label: `vias on ${h.owner.net} and ${k.owner.net}` }));
  results.padHoleSpacing = pairs(holes.filter(h => h.owner.ref), holeGap, (h, k) => ({ ref: h.owner.ref, label: `${h.owner.ref} pad ${h.owner.number} and ${k.owner.ref} pad ${k.owner.number}` }));
  const toTracks = (list, describe) => smallest(list.flatMap(h => tracks.filter(t => t.net !== (h.owner.net ?? '') && t.layer?.endsWith('.Cu')).map(t => ({ h, t }))),
    ({ h, t }) => segmentSegment(h.a, h.b, t.start, t.end) - h.r - t.width / 2, ({ h, t }) => describe(h, t));
  results.viaToTrack = toTracks(viaHoles, (h, t) => ({ net: t.net, label: `${h.owner.net} via to a ${t.net} track` }));
  results.pthToTrack = toTracks(holes, (h, t) => ({ ref: h.owner.ref, label: `${h.owner.ref} pad ${h.owner.number} to a ${t.net} track` }));

  if (outline) {
    const copperPads = pads.filter(p => p.layers.some(l => /Cu$/.test(l)) && p.type !== 'np_thru_hole');
    results.copperToEdge = smallest([
      ...tracks.map(t => ({ value: Math.min(edgeDistance(t.start, outline), edgeDistance(t.end, outline)) - t.width / 2, where: { net: t.net, label: `${t.net || 'unnamed'} track` } })),
      ...vias.map(v => ({ value: edgeDistance(v.at, outline) - v.diameter / 2, where: { net: v.net, label: `${v.net} via` } })),
      ...copperPads.map(p => { const s = padShape(p); return { value: s.circle ? edgeDistance(s.circle, outline) - s.r : Math.min(...s.poly.map(q => edgeDistance(q, outline))), where: at(p.ref, p.number) }; }),
    ], x => x.value, x => x.where);
  }

  // Mask strips between neighbouring SMD pads of one part. Pads that touch are one
  // opening (exposed-pad paste segments); KiCad's mask expansion is not applied.
  let web = null;
  for (const component of board.components) {
    const smd = component.pads.filter(p => p.type === 'smd' && p.layers.some(l => /Mask$/.test(l)));
    for (let i = 0; i < smd.length; i++) for (let j = i + 1; j < smd.length; j++) {
      const gap = padGap(smd[i], smd[j]);
      if (gap > 1e-6 && (!web || gap < web.value)) web = { value: gap, where: at(component.ref, `${smd[i].number}/${smd[j].number}`) };
    }
  }
  results.maskWeb = web && { value: round(web.value), where: web.where };
  results.silkscreen = null;
  return results;
}

/** How far a feature clears a published minimum: ok, tight (within 10 %), below, or unknown. */
export function verdict(value, min) {
  if (value === null || value === undefined) return 'unmeasured';
  if (min === null || min === undefined) return 'unpublished';
  if (value < min - 1e-9) return 'below';
  return value - min < Math.max(0.1 * min, 0.01) ? 'tight' : 'ok';
}

/** Rows for the page: each rule with the board's value and a verdict per maker. */
export function compare(measured, capabilities) {
  return capabilities.rules.map(rule => ({
    id: rule.id, label: rule.label, board: measured[rule.id] ?? null,
    fabs: Object.keys(capabilities.fabs).map(fab => {
      const min = rule[fab]?.min ?? null, values = measured[rule.id]?.values;
      return { fab, min, note: rule[fab]?.note ?? null, verdict: verdict(measured[rule.id]?.value, min), below: values && min !== null ? values.filter(v => v < min - 1e-9).length : null };
    }),
  }));
}
