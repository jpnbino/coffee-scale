// What the stackup means: the values for a factory order form, whether the
// KiCad stackup and the release's manufacturing settings agree, and track
// current estimates from the copper thickness. Pure, so the release build can
// run the same agreement check and fail on a mismatch.

const OUNCE_MM = 0.035; // 1 oz/ft² copper, the industry convention (≈34.8 µm)

/** "1 oz" → 0.035, "0.5 oz" → 0.0175; null when the text isn't a copper weight. */
export function copperWeightMm(text) {
  const match = /^\s*([\d.]+)\s*oz\s*$/i.exec(String(text ?? ''));
  return match ? Number(match[1]) * OUNCE_MM : null;
}

const norm = value => String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
const copperLayers = stackup => stackup.layers.filter(layer => layer.type === 'copper');
const layerColour = (stackup, pattern) => stackup.layers.find(layer => pattern.test(layer.type) && layer.color)?.color ?? null;

/** Rows for the order card, each compared with KiCad where KiCad records it. */
export function orderChecks(stackup, manufacturing, bounds = null) {
  const m = manufacturing, rows = [];
  const add = (label, value, kicad, agrees) => rows.push({ label, value, kicad, agrees });
  const copper = copperLayers(stackup), copperMm = copperWeightMm(m.copperWeight);
  add('Layers', `${m.copperLayers}`, `${copper.length} copper`, copper.length === m.copperLayers);
  add('Thickness', `${m.thicknessMm} mm`, `${stackup.boardThicknessMm} mm`, Math.abs(stackup.boardThicknessMm - m.thicknessMm) < 0.001);
  const thicknesses = [...new Set(copper.map(layer => layer.thicknessMm))];
  add('Copper', `${m.copperWeight} (${copperMm === null ? '?' : Math.round(copperMm * 1000)} µm)`, thicknesses.map(t => `${t} mm`).join(', '),
    copperMm !== null && thicknesses.every(t => t !== null && Math.abs(t - copperMm) < 0.002));
  add('Finish', m.finish, stackup.finish || 'not set', norm(stackup.finish) === norm(m.finish));
  const mask = layerColour(stackup, /mask/i), silk = layerColour(stackup, /silk/i);
  add('Mask', m.mask, mask ?? 'not set', norm(mask) === norm(m.mask));
  add('Silkscreen', m.silkscreen, silk ?? 'not set', norm(silk) === norm(m.silkscreen));
  add('Material', m.material, [...new Set(stackup.layers.map(layer => layer.material).filter(Boolean))].join(', ') || 'not set',
    stackup.layers.some(layer => norm(layer.material) === norm(m.material)));
  if (bounds) {
    const width = bounds.maxX - bounds.minX, height = bounds.maxY - bounds.minY;
    add('Size', `${m.widthMm} × ${m.heightMm} mm`, `${+width.toFixed(2)} × ${+height.toFixed(2)} mm outline`, Math.abs(width - m.widthMm) < 0.05 && Math.abs(height - m.heightMm) < 0.05);
  }
  // The layers KiCad gives a thickness should add up to the board; silkscreen
  // and paste are surface processes without one.
  const total = stackup.layers.reduce((sum, layer) => sum + (layer.thicknessMm ?? 0), 0);
  const sum = { totalMm: Math.round(total * 1000) / 1000, agrees: Math.abs(total - stackup.boardThicknessMm) < 0.02 };
  return { rows, sum, agrees: rows.every(row => row.agrees) && sum.agrees };
}

/**
 * IPC-2221 external-layer estimate of the current a track carries for a given
 * temperature rise: I = 0.048 · ΔT^0.44 · A^0.725, A in mil².
 */
export function trackCurrentA(widthMm, copperMm, riseC = 10) {
  const areaMil2 = (widthMm / 0.0254) * (copperMm / 0.0254);
  return 0.048 * riseC ** 0.44 * areaMil2 ** 0.725;
}

/** Per net: its track widths with length at each, the narrowest first. Pours and arcs are not included. */
export function trackWidths(board) {
  const nets = new Map();
  for (const segment of board?.segments ?? []) {
    const net = String(segment.net ?? '').replace(/^\//, '');
    if (!net) continue;
    const widths = nets.get(net) ?? new Map(), length = Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]);
    widths.set(segment.width, (widths.get(segment.width) ?? 0) + length);
    nets.set(net, widths);
  }
  return [...nets].map(([net, widths]) => ({ net, widths: [...widths].map(([widthMm, lengthMm]) => ({ widthMm, lengthMm })).sort((a, b) => a.widthMm - b.widthMm) }))
    .sort((a, b) => b.widths.at(-1).widthMm - a.widths.at(-1).widthMm || a.net.localeCompare(b.net, undefined, { numeric: true }));
}

/** The Gerber file extension each KiCad stackup layer becomes. */
export const GERBER_KIND = { 'F.SilkS': '.gto', 'F.Paste': '.gtp', 'F.Mask': '.gts', 'F.Cu': '.gtl', 'B.Cu': '.gbl', 'B.Mask': '.gbs', 'B.Paste': '.gbp', 'B.SilkS': '.gbo' };

/** Drawing colour for a KiCad stackup colour name. */
export function swatch(layer) {
  if (layer.type === 'copper') return '#c88c43';
  if (/core|prepreg/i.test(layer.type)) return '#c9c58f';
  if (/paste/i.test(layer.type)) return '#9aa0a6';
  const named = { black: '#262626', matteblack: '#2b2b2b', white: '#f4f4f1', green: '#1f6b3a', mattegreen: '#2c6e45', blue: '#1d4f91', red: '#a32d2d', yellow: '#d9b44a', purple: '#5b3a8c' };
  return named[norm(layer.color)] ?? (/silk/i.test(layer.type) ? '#f4f4f1' : '#3f6f5c');
}
