// Versions & changes: compare an earlier revision with the selected one (chosen
// once, in the sidebar). Summary first, then the board with the change list
// beside it, then each revision's files.
import { compareBoards } from "./review-core.mjs";
import { svgNode, drawBoard, drawChanges, drawOutline, attachViewport } from "./review-draw.mjs";
import { catalogPromise, loadVersion } from "./review-data.mjs";
import { selectedPromise } from './revision.mjs';

const byId = id => document.getElementById(id), text = (tag, value, props = {}) => Object.assign(document.createElement(tag), props, { textContent: value });
const svgs = [byId("comparison-overlay"), byId("comparison-base"), byId("comparison-head")];
const viewport = attachViewport(svgs);
const state = { mode: "overlay", layer: "all", kind: "all" };
let pair, diff, initialBox, blinker, request = 0, selectedVersions = [];
const defs = () => { const group = svgNode("defs"), marker = svgNode("marker", { id: "move-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }); marker.append(svgNode("path", { d: "M0,0 L10,5 L0,10 z", fill: "#b87519" })); group.append(marker); return group; };

// Segmented controls (view, copper layer, change type) share one pattern.
for (const [attribute, key] of [["data-mode", "mode"], ["data-layer", "layer"], ["data-kind", "kind"]]) {
  const buttons = [...document.querySelectorAll(`#compare [${attribute}]`)];
  for (const button of buttons) button.addEventListener("click", () => {
    state[key] = button.getAttribute(attribute);
    for (const other of buttons) other.setAttribute("aria-pressed", String(other === button));
    repaint();
  });
}

function repaint() {
  if (!pair) return;
  const { mode, layer } = state, kind = mode === "overlay" ? state.kind : "all";
  for (const button of document.querySelectorAll("#compare [data-kind]")) button.disabled = mode !== "overlay";
  byId("show-common").disabled = mode !== "overlay";
  byId("comparison-pair").hidden = mode !== "side"; byId("comparison-overlay").toggleAttribute("hidden", mode === "side");
  for (const svg of svgs) svg.replaceChildren();
  svgs[0].append(defs());
  const baseGroup = svgNode("g", { "data-version": "base" }), headGroup = svgNode("g", { "data-version": "head" });
  const common = svgNode("g", { opacity: byId("show-common").checked ? .18 : 0 });
  drawOutline(svgs[0], pair[1].board); drawBoard(common, pair[1].board, layer); svgs[0].append(common);
  if (mode === "blink") { drawBoard(baseGroup, pair[0].board, layer, "#bf4271"); drawBoard(headGroup, pair[1].board, layer, "#168566"); svgs[0].append(baseGroup, headGroup); }
  else drawChanges(svgs[0], diff, layer, kind);
  pair.forEach((version, index) => { drawOutline(svgs[index + 1], version.board); drawBoard(svgs[index + 1], version.board, layer, index ? "#168566" : "#bf4271"); });
  clearInterval(blinker);
  if (mode === "blink") { let phase = false; const swap = () => { phase = !phase; baseGroup.style.display = phase ? "" : "none"; headGroup.style.display = phase ? "none" : ""; }; swap(); blinker = setInterval(swap, 700); }
  viewport.set(viewport.get()); renderChangeList(kind);
}
function focus(item, button) {
  const p = item.after ?? item, at = p.at ?? (p.x !== undefined ? [p.x, p.y] : p.start);
  if (at) viewport.set([at[0] - 10, at[1] - 7, 20, 14]);
  for (const other of byId("change-list").querySelectorAll("button")) other.setAttribute("aria-current", String(other === button));
}
function renderChangeList(kind) {
  const groups = [];
  if (kind === "all" || kind === "components") groups.push(["Parts", [
    ...diff.components.modified.map(item => [`${item.after.ref}`, item.changes.map(c => c === "padSignature" ? "pads or connections" : c).join(", "), item]),
    ...diff.components.added.map(item => [item.ref, "added", item]), ...diff.components.removed.map(item => [item.ref, "removed", item])]]);
  if (kind === "all" || kind === "vias") groups.push(["Vias", ["added", "removed", "modified"].flatMap(name => diff.vias[name].map(item => [`Via ${(item.after ?? item).net?.replace(/^\//, "") || ""}`, `${name} at ${(item.after ?? item).at.map(v => +v.toFixed(2)).join(", ")} mm`, item]))]);
  if (kind === "all" || kind === "tracks") groups.push(["Tracks", ["added", "removed"].flatMap(name => [...diff.tracks[name], ...diff.arcs[name]].map(item => [String(item.net ?? "").replace(/^\//, "") || "unnamed", `${name} · ${item.layer === "B.Cu" ? "bottom" : "top"}`, item]))]);
  const list = byId("change-list"); list.replaceChildren();
  let total = 0;
  for (const [title, rows] of groups) {
    total += rows.length;
    if (!rows.length) continue;
    const heading = text("li", `${title} · ${rows.length}`, { className: "change-group" }); list.append(heading);
    for (const [name, detail, item] of rows.slice(0, 200)) {
      const button = text("button", ""); button.type = "button"; button.append(text("strong", name), text("span", detail));
      button.addEventListener("click", () => focus(item, button));
      const li = document.createElement("li"); li.append(button); list.append(li);
    }
    if (rows.length > 200) list.append(text("li", `… ${rows.length - 200} more; use the filters above`, { className: "muted" }));
  }
  byId("change-count").textContent = `Changes · ${total}`;
}
function summary(selected) {
  const root = byId("comparison-summary"); root.replaceChildren();
  const tile = (label, value, note) => { const div = text("div", "", { className: "change-tile" }); div.append(text("span", label), text("strong", value)); if (note) div.append(text("small", note)); root.append(div); };
  if (diff.hardwareSourceUnchanged) tile("PCB", "Unchanged", "Build, documentation or export metadata may differ");
  else tile("PCB", "Changed", `${selected[0].boardSha256.slice(0, 8)} → ${selected[1].boardSha256.slice(0, 8)}`);
  tile("Parts", `${diff.components.modified.length} changed`, `${diff.components.added.length} added, ${diff.components.removed.length} removed`);
  tile("Copper", `+${diff.tracks.added.length + diff.arcs.added.length} / −${diff.tracks.removed.length + diff.arcs.removed.length}`, "straight and arc track pieces");
  tile("Vias", `${pair[0].board.vias.length} → ${pair[1].board.vias.length}`, `${diff.vias.added.length} added, ${diff.vias.removed.length} removed, ${diff.vias.modified.length} moved`);
  tile("Schematic", selected[0].schematicSha256 === selected[1].schematicSha256 ? "Unchanged" : "Changed", "by source hash");
}
function artifacts(catalog) {
  const container = byId("version-catalog"); container.replaceChildren();
  for (const version of catalog.versions) {
    const article = text("article", "", { className: "version-card" });
    article.append(text("h3", version.label), text("p", version.validation), text("code", `PCB ${version.boardSha256.slice(0, 12)}`, { title: version.boardSha256 }));
    const links = text("p", "", { className: "version-links" });
    for (const [key, label] of [["pcbTop", "Top"], ["pcbBottom", "Bottom"], ["schematicPdf", "Schematic PDF"], ["fabricationZip", "Gerbers ZIP"], ["sourcePcb", "PCB source"]]) if (version[key]) links.append(text("a", label, { href: `review/${version[key]}` }));
    article.append(links); container.append(article);
  }
}
async function compare(catalog) {
  const ticket = ++request;
  try {
    selectedVersions = [byId("base-version").value, (await selectedPromise).id].map(id => catalog.versions.find(v => v.id === id));
    const loaded = await Promise.all(selectedVersions.map(loadVersion)); if (ticket !== request) return;
    pair = loaded; diff = compareBoards(pair[0].board, pair[1].board);
    const bounds = pair.map(p => p.board.bounds), x = Math.min(...bounds.map(b => b.minX)) - 3, y = Math.min(...bounds.map(b => b.minY)) - 3;
    initialBox = [x, y, Math.max(...bounds.map(b => b.maxX)) - x + 3, Math.max(...bounds.map(b => b.maxY)) - y + 3]; viewport.set(initialBox);
    byId("base-caption").textContent = selectedVersions[0].label; byId("head-caption").textContent = selectedVersions[1].label;
    summary(selectedVersions); repaint();
  } catch (error) { if (ticket === request) byId("comparison-summary").replaceChildren(text("p", `The comparison could not load: ${error.message}`)); }
}
const zoom = factor => { const [x, y, w, h] = viewport.get(); viewport.set([x + w * (1 - factor) / 2, y + h * (1 - factor) / 2, w * factor, h * factor]); };
byId("comparison-reset").addEventListener("click", () => initialBox && viewport.set(initialBox));
byId("comparison-zoom-in").addEventListener("click", () => zoom(1 / 1.4));
byId("comparison-zoom-out").addEventListener("click", () => zoom(1.4));
byId("show-common").addEventListener("change", repaint);
document.addEventListener("keydown", event => {
  if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === "f" && initialBox) viewport.set(initialBox); else if (key === "+" || key === "=") zoom(1 / 1.4); else if (key === "-") zoom(1.4);
});
try {
  const catalog = await catalogPromise; artifacts(catalog);
  const selected = await selectedPromise, base = new URLSearchParams(location.search).get('base');
  byId("head-label").textContent = selected.label;
  for (const version of catalog.versions) if (version.id !== selected.id) { const option = text("option", version.label); option.value = version.id; byId("base-version").append(option); }
  if (!byId("base-version").options.length) throw new Error("there is no other revision to compare with");
  byId("base-version").value = catalog.versions.some(v => v.id === base && v.id !== selected.id) ? base : byId("base-version").options[0].value;
  byId("base-version").addEventListener("change", () => { const url = new URL(location.href); url.searchParams.set('base', byId('base-version').value); history.replaceState(null, '', url); compare(catalog); });
  await compare(catalog);
} catch (error) { byId("comparison-summary").replaceChildren(text("p", `The comparison is unavailable: ${error.message}. Run "node preview.mjs" to serve the generated site.`)); }
