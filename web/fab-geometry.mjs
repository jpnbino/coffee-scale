// Hit-testing for the Gerber page's pre-order checks, in board millimetres
// (X right, Y down). Kept free of DOM and network so it can be unit-tested.

export const strip = name => String(name ?? "").replace(/^\//, "");

/** Is board point p (mm) inside pad (centre, size, angle in degrees, counter-clockwise)? */
export function insidePad(pad, [x, y], margin = 0) {
  const a = pad.angle * Math.PI / 180, dx = x - pad.x, dy = y - pad.y;
  // Undo the pad rotation (KiCad angles turn counter-clockwise on screen, Y down).
  const u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(u) <= pad.width / 2 + margin && Math.abs(v) <= pad.height / 2 + margin;
}

/** Distance from point p to the segment a–b (all mm). */
export function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * What lies under a board point: the smallest pad, else a track or via, else a
 * part body. `side` is { only: 'top'|'bottom' } when one copper side is shown,
 * or { prefer: 'top'|'bottom' } to try the facing side first.
 */
export function hitTest(check, board, point, side = null) {
  if (side?.prefer) {
    const other = side.prefer === "top" ? "bottom" : "top";
    return hitTest(check, board, point, { only: side.prefer }) ?? hitTest(check, board, point, { only: other });
  }
  const only = side?.only ?? null;
  const onSide = part => !only || part.side === only;
  let best = null;
  for (const part of check.parts) for (const pad of part.pads) {
    const visible = onSide(part) || pad.type === "thru_hole";
    if (visible && insidePad(pad, point) && (!best || pad.width * pad.height < best.pad.width * best.pad.height)) best = { part, pad };
  }
  if (best) return { kind: "pad", ...best, net: best.pad.net };
  const layer = only === "bottom" ? "B.Cu" : only === "top" ? "F.Cu" : null;
  for (const segment of board?.segments ?? []) {
    if (layer && segment.layer !== layer) continue;
    if (segmentDistance(point, segment.start, segment.end) <= segment.width / 2 + 0.05 && segment.net) return { kind: "track", net: strip(segment.net), layer: segment.layer };
  }
  for (const via of board?.vias ?? []) if (Math.hypot(point[0] - via.at[0], point[1] - via.at[1]) <= via.diameter / 2 && via.net) return { kind: "via", net: strip(via.net) };
  const bodies = check.parts.filter(part => onSide(part) && part.body && point[0] >= part.body.minX && point[0] <= part.body.maxX && point[1] >= part.body.minY && point[1] <= part.body.maxY);
  bodies.sort((a, b) => (a.body.maxX - a.body.minX) * (a.body.maxY - a.body.minY) - (b.body.maxX - b.body.minX) * (b.body.maxY - b.body.minY));
  return bodies.length ? { kind: "part", part: bodies[0] } : null;
}
