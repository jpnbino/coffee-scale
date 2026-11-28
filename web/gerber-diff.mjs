// Gerber difference, browser side: load each revision's rendered layers,
// rasterise a layer of both revisions over one shared frame, classify the
// pixels and paint the difference image. The arithmetic lives in
// gerber-diff-core.mjs.
import { json } from "./review-data.mjs";
import { pairLayers, comparisonFrame, classify, findRegions, summarise, ADDED, REMOVED, COMMON } from "./gerber-diff-core.mjs";

export const COLORS = { common: [196, 203, 196, 255], added: [22, 133, 102, 255], removed: [191, 66, 113, 255] };
/** Changes closer than this merge into one listed region. */
export const REGION_GAP_MM = 0.5;

const layerLists = new Map(), svgTexts = new Map();

/** A revision's rendered layer list (layers.json) with each layer's SVG URL. */
export function loadLayerList(version) {
  if (!version.gerbers) return Promise.reject(new Error(`${version.label} has no rendered Gerber layers`));
  if (!layerLists.has(version.id)) {
    const url = `review/${version.gerbers}`, base = url.slice(0, url.lastIndexOf("/") + 1);
    const promise = json(url).then(report => ({ report, layers: (report.layers ?? []).map(layer => ({ ...layer, url: layer.svg ? base + layer.svg : null })) }));
    promise.catch(() => layerLists.delete(version.id));
    layerLists.set(version.id, promise);
  }
  return layerLists.get(version.id);
}

function layerText(layer) {
  if (!svgTexts.has(layer.url)) {
    const promise = fetch(layer.url, { cache: "no-cache" }).then(response => { if (!response.ok) throw new Error(`cannot load ${layer.name} (${response.status})`); return response.text(); });
    promise.catch(() => svgTexts.delete(layer.url));
    svgTexts.set(layer.url, promise);
  }
  return svgTexts.get(layer.url);
}

// The same checks as the Gerber page: no scripts, foreign content or external references.
function parseLayer(source, name) {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml"), root = parsed.documentElement;
  if (parsed.querySelector("parsererror") || root.localName !== "svg") throw new Error(`${name}: malformed SVG`);
  for (const element of parsed.querySelectorAll("*")) {
    if (["script", "foreignObject", "image", "iframe", "style"].includes(element.localName)) throw new Error(`${name}: unsafe SVG element`);
    for (const attr of element.attributes) if (/^on/i.test(attr.name) || (/href$/.test(attr.name) && !attr.value.startsWith("#")) || (/url\(/i.test(attr.value) && !/url\(#[^)]+\)/.test(attr.value))) throw new Error(`${name}: external or executable SVG reference rejected`);
  }
  return root;
}

/** The layer drawn in black over the frame, as RGBA bytes (alpha = coverage). */
async function rasterise(layer, frame) {
  const root = parseLayer(await layerText(layer), layer.name);
  root.setAttribute("viewBox", [frame.x0, frame.y0, frame.widthMm, frame.heightMm].map(v => v * 1000).join(" "));
  root.setAttribute("width", frame.width); root.setAttribute("height", frame.height);
  root.setAttribute("preserveAspectRatio", "none"); root.setAttribute("color", "#000");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)], { type: "image/svg+xml" }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = frame.width; canvas.height = frame.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, frame.width, frame.height);
    return context.getImageData(0, 0, frame.width, frame.height).data;
  } catch (error) { throw new Error(`${layer.name}: could not be drawn (${error.message || "image decode failed"})`); }
  finally { URL.revokeObjectURL(url); }
}

/** The difference image as a PNG object URL; the caller revokes it. */
function paint(codes, frame) {
  const canvas = document.createElement("canvas"); canvas.width = frame.width; canvas.height = frame.height;
  const context = canvas.getContext("2d"), image = context.createImageData(frame.width, frame.height), data = image.data;
  const palette = { [COMMON]: COLORS.common, [ADDED]: COLORS.added, [REMOVED]: COLORS.removed };
  for (let i = 0; i < codes.length; i++) { const color = palette[codes[i]]; if (color) data.set(color, i * 4); }
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("could not encode the difference image")), "image/png"));
}

/**
 * A comparison session for one pair of revisions: the paired layer rows, the
 * shared frame and a cached comparison per layer.
 */
export async function openPair(baseVersion, headVersion) {
  const [base, head] = await Promise.all([baseVersion, headVersion].map(loadLayerList));
  const rows = pairLayers(base.layers, head.layers);
  const drawable = [...base.layers, ...head.layers].filter(layer => layer.available && layer.url);
  if (!drawable.length) throw new Error("neither revision has drawable Gerber layers");
  const frame = comparisonFrame(drawable.map(layer => layer.viewBox));
  const results = new Map();
  const compare = row => {
    if (row.status !== "both") return Promise.resolve(null);
    if (!results.has(row.key)) {
      const promise = (async () => {
        const [a, b] = await Promise.all([rasterise(row.base, frame), rasterise(row.head, frame)]);
        const { codes, counts } = classify(a, b, { stride: 4, offset: 3 });
        const regions = findRegions(codes, frame.width, frame.height, { cell: Math.max(1, Math.round(REGION_GAP_MM * frame.pxPerMm)) });
        return { ...summarise(counts, regions, frame), image: await paint(codes, frame) };
      })();
      promise.catch(() => results.delete(row.key));
      results.set(row.key, promise);
    }
    return results.get(row.key);
  };
  const dispose = async () => { for (const promise of results.values()) promise.then(result => result && URL.revokeObjectURL(result.image), () => {}); results.clear(); };
  return { rows, frame, compare, dispose, renderer: head.report.renderer ?? base.report.renderer ?? "unknown renderer" };
}
