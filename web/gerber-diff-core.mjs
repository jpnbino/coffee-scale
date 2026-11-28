// Gerber difference between two revisions: the pure parts (layer pairing,
// the comparison frame, pixel classification, area accounting and grouping of
// changed pixels into regions). The browser side rasterises each revision's
// rendered layer SVG into a coverage image; everything here works on those
// images, so it can be tested without a browser.
//
// Units: rendered layer SVGs use 1000 units per mm, absolute KiCad X right /
// Y down, the same frame for every revision. Results here are in mm and mm².

/** Layers in physical order, top silkscreen down to bottom silkscreen, then drills and outline. */
export const DIFF_LAYERS = [
  { key: '.gto', title: 'Top silkscreen' },
  { key: '.gtp', title: 'Top paste (stencil)' },
  { key: '.gts', title: 'Top mask openings' },
  { key: '.gtl', title: 'Top copper' },
  { key: '.gbl', title: 'Bottom copper' },
  { key: '.gbs', title: 'Bottom mask openings' },
  { key: '.gbp', title: 'Bottom paste (stencil)' },
  { key: '.gbo', title: 'Bottom silkscreen' },
  { key: '.drl:pth', title: 'Plated drills and slots' },
  { key: '.drl:npth', title: 'Non-plated drills' },
  { key: '.gm1', title: 'Board outline' },
];

/** Which layer of the other revision a layer corresponds to: its kind; drill files also by plating. */
export function layerKey(layer) {
  const kind = String(layer?.kind ?? '').toLowerCase();
  if (kind === '.drl') return /NPTH/i.test(String(layer.name ?? '')) ? '.drl:npth' : '.drl:pth';
  return kind;
}

/**
 * One row per layer kind found in either revision, in physical stack order
 * (unrecognised kinds last, alphabetically). status is "both" when both
 * revisions have a drawable layer, "base-only"/"head-only" when only one has
 * the file, and "unavailable" when a file exists but could not be drawn.
 * identical: both files have the same recorded SHA-256.
 */
export function pairLayers(baseLayers = [], headLayers = []) {
  const first = layers => { const map = new Map(); for (const layer of layers) { const key = layerKey(layer); if (!map.has(key)) map.set(key, layer); } return map; };
  const base = first(baseLayers), head = first(headLayers);
  const known = DIFF_LAYERS.map(entry => entry.key);
  const extra = [...new Set([...base.keys(), ...head.keys()])].filter(key => !known.includes(key)).sort();
  const rows = [];
  for (const key of [...known, ...extra]) {
    const a = base.get(key), b = head.get(key);
    if (!a && !b) continue;
    const title = DIFF_LAYERS.find(entry => entry.key === key)?.title ?? (a ?? b).label ?? key;
    let status = 'both';
    if (!a) status = 'head-only'; else if (!b) status = 'base-only';
    else if (!a.available || !b.available) status = 'unavailable';
    rows.push({ key, title, base: a ?? null, head: b ?? null, status, identical: Boolean(a?.sourceSha256 && a.sourceSha256 === b?.sourceSha256) });
  }
  return rows;
}

/**
 * The comparison frame: the union of every given layer viewBox (SVG units,
 * 1000 per mm), widened to whole millimetres plus a margin, and a resolution
 * in whole pixels per mm, reduced from the preferred one until the image fits
 * in maxPixels. Pixel (i, j) covers x0 + i/pxPerMm … x0 + (i+1)/pxPerMm mm.
 */
export function comparisonFrame(viewBoxes, { preferred = 20, maxPixels = 8e6, marginMm = 1 } = {}) {
  const boxes = viewBoxes.filter(box => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite));
  if (!boxes.length) throw new Error('no layer extents to compare');
  const x0 = Math.floor(Math.min(...boxes.map(b => b[0])) / 1000) - marginMm, y0 = Math.floor(Math.min(...boxes.map(b => b[1])) / 1000) - marginMm;
  const x1 = Math.ceil(Math.max(...boxes.map(b => b[0] + b[2])) / 1000) + marginMm, y1 = Math.ceil(Math.max(...boxes.map(b => b[1] + b[3])) / 1000) + marginMm;
  const widthMm = x1 - x0, heightMm = y1 - y0;
  let pxPerMm = Math.max(1, Math.floor(preferred));
  while (pxPerMm > 1 && widthMm * heightMm * pxPerMm * pxPerMm > maxPixels) pxPerMm--;
  return { x0, y0, widthMm, heightMm, pxPerMm, width: widthMm * pxPerMm, height: heightMm * pxPerMm };
}

export const NONE = 0, COMMON = 1, ADDED = 2, REMOVED = 3;

/**
 * Per-pixel classification of two coverage images of equal size. Coverage is
 * read from every stride-th byte starting at offset (RGBA alpha: stride 4,
 * offset 3); a pixel counts as covered at or above threshold (half of 255 by
 * default). ADDED: covered only in head; REMOVED: covered only in base.
 */
export function classify(base, head, { stride = 1, offset = 0, threshold = 128 } = {}) {
  if (base.length !== head.length) throw new Error('coverage images differ in size');
  const size = Math.floor((base.length - offset + stride - 1) / stride);
  const codes = new Uint8Array(size), counts = { common: 0, added: 0, removed: 0 };
  for (let i = 0, j = offset; i < size; i++, j += stride) {
    const a = base[j] >= threshold, b = head[j] >= threshold;
    if (a && b) { codes[i] = COMMON; counts.common++; }
    else if (b) { codes[i] = ADDED; counts.added++; }
    else if (a) { codes[i] = REMOVED; counts.removed++; }
  }
  return { codes, counts };
}

/** Area in mm² of a pixel count at pxPerMm. */
export const areaMm2 = (pixels, pxPerMm) => pixels / (pxPerMm * pxPerMm);

/**
 * Groups changed pixels (ADDED or REMOVED) into regions. Pixels are binned in
 * square cells of `cell` pixels; touching changed cells (8-neighbourhood) form
 * one region, so changes up to about one cell apart merge. Each region carries
 * its exact pixel bounding box (inclusive) and added/removed pixel counts.
 * Returns every region, largest change first.
 */
export function findRegions(codes, width, height, { cell = 10 } = {}) {
  if (codes.length !== width * height) throw new Error('code image does not match its size');
  cell = Math.max(1, Math.floor(cell));
  const cw = Math.ceil(width / cell), ch = Math.ceil(height / cell), cells = new Map();
  for (let y = 0; y < height; y++) {
    const row = y * width, cy = Math.floor(y / cell) * cw;
    for (let x = 0; x < width; x++) {
      const code = codes[row + x];
      if (code !== ADDED && code !== REMOVED) continue;
      const id = cy + Math.floor(x / cell);
      let c = cells.get(id);
      if (!c) { c = { x0: x, y0: y, x1: x, y1: y, added: 0, removed: 0 }; cells.set(id, c); }
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y > c.y1) c.y1 = y;
      if (code === ADDED) c.added++; else c.removed++;
    }
  }
  const seen = new Set(), regions = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const region = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, added: 0, removed: 0 }, queue = [start];
    seen.add(start);
    while (queue.length) {
      const id = queue.pop(), c = cells.get(id), cx = id % cw, cy = Math.floor(id / cw);
      region.x0 = Math.min(region.x0, c.x0); region.y0 = Math.min(region.y0, c.y0); region.x1 = Math.max(region.x1, c.x1); region.y1 = Math.max(region.y1, c.y1);
      region.added += c.added; region.removed += c.removed;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const next = ny * cw + nx;
        if (cells.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    regions.push(region);
  }
  return regions.sort((a, b) => (b.added + b.removed) - (a.added + a.removed) || a.y0 - b.y0 || a.x0 - b.x0);
}

/** A pixel region in board coordinates: box in mm and areas in mm². */
export function regionToBoard(region, frame) {
  const s = 1 / frame.pxPerMm;
  return {
    x: frame.x0 + region.x0 * s, y: frame.y0 + region.y0 * s,
    width: (region.x1 - region.x0 + 1) * s, height: (region.y1 - region.y0 + 1) * s,
    addedMm2: areaMm2(region.added, frame.pxPerMm), removedMm2: areaMm2(region.removed, frame.pxPerMm),
  };
}

/** Summary of one compared layer: totals in mm² and the largest regions in board coordinates. */
export function summarise(counts, regions, frame, { limit = 50 } = {}) {
  return {
    addedMm2: areaMm2(counts.added, frame.pxPerMm), removedMm2: areaMm2(counts.removed, frame.pxPerMm),
    commonMm2: areaMm2(counts.common, frame.pxPerMm), regionCount: regions.length,
    regions: regions.slice(0, limit).map(region => regionToBoard(region, frame)),
  };
}

/** "0.42 mm²", with fewer decimals for large areas and "0" for none. */
export function formatArea(mm2) {
  if (!mm2) return '0 mm²';
  if (mm2 < 0.01) return '< 0.01 mm²';
  return `${mm2 >= 100 ? mm2.toFixed(0) : mm2 >= 10 ? mm2.toFixed(1) : mm2.toFixed(2)} mm²`;
}
