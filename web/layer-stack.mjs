// The Gerber layers as a physical stack: top silkscreen down to bottom
// silkscreen, then drills and outline. The same order decides which layer is
// drawn over which, flipped when the board is viewed from the bottom.

/** Fabrication layers from the top surface down, by Gerber file extension. */
export const STACK = [
  { kind: ".gto", side: "top", name: "Silkscreen" },
  { kind: ".gtp", side: "top", name: "Paste (stencil)" },
  { kind: ".gts", side: "top", name: "Mask openings" },
  { kind: ".gtl", side: "top", name: "Copper" },
  { kind: ".gbl", side: "bottom", name: "Copper" },
  { kind: ".gbs", side: "bottom", name: "Mask openings" },
  { kind: ".gbp", side: "bottom", name: "Paste (stencil)" },
  { kind: ".gbo", side: "bottom", name: "Silkscreen" },
];
const position = kind => STACK.findIndex(entry => entry.kind === kind);

/**
 * Rows for the panel: a heading per side, the core between the copper layers,
 * then drills, the outline and anything unrecognised.
 */
export function stackRows(layers) {
  const rows = [];
  for (const side of ["top", "bottom"]) {
    if (side === "bottom") rows.push({ type: "core" });
    rows.push({ type: "heading", label: side === "top" ? "Top side" : "Bottom side" });
    for (const entry of STACK.filter(e => e.side === side)) {
      for (const layer of layers.filter(l => l.kind === entry.kind)) rows.push({ type: "layer", layer, name: entry.name });
    }
  }
  const other = layers.filter(l => position(l.kind) < 0);
  if (other.length) {
    rows.push({ type: "heading", label: "Drills and outline" });
    const rank = l => (l.kind === ".drl" ? 0 : l.kind === ".gm1" ? 1 : 2);
    const short = layer => layer.kind === ".gm1" ? "Board outline" : layer.kind === ".drl" ? (/NPTH/i.test(layer.name) ? "Non-plated holes" : "Plated holes and slots") : layer.label;
    for (const layer of [...other].sort((a, b) => rank(a) - rank(b))) rows.push({ type: "layer", layer, name: short(layer) });
  }
  return rows;
}

/**
 * Paint order, first drawn = furthest away. Viewed from the top, bottom
 * silkscreen is furthest and top silkscreen nearest; from the bottom, the
 * reverse. Drills and then the outline are always drawn last, on top.
 */
export function drawOrder(layers, fromBottom = false) {
  const depth = layer => {
    const index = position(layer.kind);
    if (index < 0) return 100 + (layer.kind === ".gm1" ? 2 : layer.kind === ".drl" ? 1 : 0);
    return fromBottom ? index : STACK.length - 1 - index;
  };
  return [...layers].sort((a, b) => depth(a) - depth(b));
}

/** "Core · FR4 · 1.51 mm" from the release's stackup export, when there is one. */
export function coreLabel(stackup) {
  const cores = (stackup?.layers ?? []).filter(layer => /core|prepreg|dielectric/i.test(`${layer.type} ${layer.name}`));
  if (!cores.length) return "Core";
  const thickness = cores.reduce((sum, layer) => sum + (layer.thicknessMm ?? 0), 0);
  const materials = [...new Set(cores.map(layer => layer.material).filter(Boolean))].join(", ");
  return ["Core", materials, thickness ? `${Number(thickness.toFixed(3))} mm` : ""].filter(Boolean).join(" · ");
}
