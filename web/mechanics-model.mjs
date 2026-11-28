// What a case designer needs from the board data: mounting holes and the parts
// that meet the board edge or take up a lot of room, in the mechanical
// package's coordinates (origin at the outline's top-left, X right, Y down).
const round = value => Math.round(value * 100) / 100;

/** Edge distance per side for a body box (negative = beyond the edge). */
function edgeGaps(body, b) {
  return { left: body.minX - b.minX, top: body.minY - b.minY, right: b.maxX - body.maxX, bottom: b.maxY - body.maxY };
}

/**
 * Mounting holes, edge parts (body within `edgeMm` of the outline or past it)
 * and large parts (body area over `largeMm2`). Bodies come from fab-check.json
 * (courtyards, or pads when a footprint has none).
 */
export function mechanicsFeatures(board, check, { origin = null, edgeMm = 1.5, largeMm2 = 150, minAreaMm2 = 10 } = {}) {
  const b = board.bounds, [ox, oy] = origin ?? [b.minX, b.minY];
  const rel = ([x, y]) => [round(x - ox), round(y - oy)];
  const holes = board.components.filter(c => /^H\d/.test(c.ref)).flatMap(c => c.pads.filter(p => p.drill.length).map(p => ({ ref: c.ref, at: rel([p.x, p.y]), abs: [p.x, p.y], drillMm: Math.min(...p.drill), plated: p.type === 'thru_hole' })));
  const parts = [];
  for (const part of check?.parts ?? []) {
    const body = part.body; if (!body) continue;
    const width = body.maxX - body.minX, height = body.maxY - body.minY, area = width * height;
    if (area < minAreaMm2) continue;
    const gaps = edgeGaps(body, b), [side, gap] = Object.entries(gaps).sort((x, y) => x[1] - y[1])[0];
    const atEdge = gap < edgeMm, large = area > largeMm2;
    if (!atEdge && !large) continue;
    parts.push({ ref: part.ref, value: part.value, side: part.side, body, from: rel([body.minX, body.minY]), size: [round(width), round(height)], edge: atEdge ? side : null, overhangMm: atEdge && gap < 0 ? round(-gap) : 0, gapMm: atEdge && gap >= 0 ? round(gap) : null, large, source: body.source });
  }
  parts.sort((x, y) => (x.edge ? 0 : 1) - (y.edge ? 0 : 1) || y.overhangMm - x.overhangMm || x.ref.localeCompare(y.ref, undefined, { numeric: true }));
  return { origin: [ox, oy], size: [round(b.maxX - b.minX), round(b.maxY - b.minY)], holes, parts };
}
