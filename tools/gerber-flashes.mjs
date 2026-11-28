// Reads the flashed openings of a Gerber layer (as KiCad writes stencil and
// mask layers): each flash's position, the part it belongs to (%TO.C) and the
// aperture's size and area. Enough to measure paste coverage per pad; it is
// not a general Gerber renderer (regions and draws are counted, not drawn).

/** Size and area of a standard or KiCad RoundRect aperture. */
export function apertureShape(type, params) {
  const p = params.map(Number);
  if (type === 'C') return { width: p[0], height: p[0], area: Math.PI * (p[0] / 2) ** 2 };
  if (type === 'R') return { width: p[0], height: p[1], area: p[0] * p[1] };
  if (type === 'O') { const r = Math.min(p[0], p[1]) / 2; return { width: p[0], height: p[1], area: p[0] * p[1] - (4 - Math.PI) * r * r }; }
  if (type === 'RoundRect') {
    // KiCad's macro: corner radius, then the four corner centres (x, y) already rotated.
    const r = p[0], xs = [p[1], p[3], p[5], p[7]], ys = [p[2], p[4], p[6], p[8]];
    const width = Math.max(...xs) - Math.min(...xs) + 2 * r, height = Math.max(...ys) - Math.min(...ys) + 2 * r;
    const inner = Math.abs((xs[0] * ys[1] - xs[1] * ys[0]) + (xs[1] * ys[2] - xs[2] * ys[1]) + (xs[2] * ys[3] - xs[3] * ys[2]) + (xs[3] * ys[0] - xs[0] * ys[3])) / 2;
    const perimeter = [0, 1, 2, 3].reduce((sum, i) => sum + Math.hypot(xs[(i + 1) % 4] - xs[i], ys[(i + 1) % 4] - ys[i]), 0);
    return { width, height, area: inner + perimeter * r + Math.PI * r * r };
  }
  return null;
}

/**
 * Flashes (D03) with board coordinates in mm (Y flipped to the board's
 * Y-down axes), the owning reference (%TO.C, or %TO.P with its pad number on
 * copper layers) and the aperture.
 */
export function readFlashes(source) {
  const format = /%FSLAX(\d)(\d)Y(\d)(\d)\*%/.exec(source), decimals = format ? Number(format[2]) : 6;
  if (!/%MOMM\*%/.test(source)) throw new Error('Only millimetre Gerbers are supported');
  const apertures = new Map(), flashes = [];
  for (const [, id, type, params] of source.matchAll(/%ADD(\d+)([A-Za-z]+),?([^*]*)\*%/g)) apertures.set(Number(id), apertureShape(type, params.split('X').filter(Boolean)));
  let aperture = null, ref = null, pad = null, x = 0, y = 0, region = false, regions = 0;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('%TO.C,')) { ref = line.slice(6, -2); continue; }
    if (line.startsWith('%TO.P,')) { [ref, pad] = line.slice(6, -2).split(','); continue; }
    if (line === '%TD*%') { ref = null; pad = null; continue; }
    if (line === 'G36*') { region = true; regions++; continue; }
    if (line === 'G37*') { region = false; continue; }
    const select = /^D(\d{2,})\*$/.exec(line);
    if (select) { aperture = apertures.get(Number(select[1])) ?? null; continue; }
    const op = /^(?:X(-?\d+))?(?:Y(-?\d+))?D0?([123])\*$/.exec(line);
    if (!op) continue;
    if (op[1] !== undefined) x = Number(op[1]) / 10 ** decimals;
    if (op[2] !== undefined) y = Number(op[2]) / 10 ** decimals;
    if (op[3] === '3' && !region && aperture) flashes.push({ ref, pad, x, y: -y, ...aperture });
  }
  return { flashes, regions };
}
