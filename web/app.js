"use strict";
import { selectedPromise,artifactUrl } from './revision.mjs';
const selectedVersion = await selectedPromise;
const isCurrent = selectedVersion.id === 'current';
const data = window.releaseData;
const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
// The parts list and order readiness live in manufacture.mjs.
if (document.getElementById("mechanical-status")) {
if (isCurrent) {
for (const assumption of data.mechanical.assumptions) document.getElementById("mechanical-assumptions").append(text("li", assumption));
document.getElementById("mechanical-status").textContent = data.mechanical.referenceReviewedForCurrentBoard ? "Reference assumptions match this board checksum; physical dimensions remain provisional." : "The board changed since the mechanical reference was reviewed. Recheck the origin, display stack and case interface.";
} else {
  document.getElementById('mechanical-intro').textContent='Historical package: populated and bare-board STEP models re-exported from this selected snapshot. Coordinates use the KiCad default origin; read the included guide.';
  document.getElementById('mechanical-status').textContent='No historical fit approval or component-origin report is available. Do not use current-build enclosure assumptions for this snapshot.';
  document.querySelector('[data-artifact="mechanical"] span').textContent='Populated and bare-board STEP · origin guide';
}
}
// Explore: three views. The interactive schematic + PCB is the main one and
// loads with the page; 3D and the static drawings load when first opened.
const tabs = [...document.querySelectorAll("[data-view]")];
const status = message => { const node = document.getElementById("viewer-status"); if (node) node.textContent = message; };
let designViewerStarted = false;
async function startDesignViewer() {
  if (designViewerStarted) return;
  designViewerStarted = true;
  try {
    const { mountDesignViewer } = await import("./design-viewer.mjs");
    await mountDesignViewer(selectedVersion);
  } catch (error) {
    document.getElementById("dv-status").textContent = `The interactive viewer could not load: ${error.message}. The drawings and the schematic PDF remain available under Drawings.`;
  }
}
function loadObject(object) { if (object && !object.hasAttribute("data")) object.setAttribute("data", object.dataset.src); }
function activateTab(tab) {
  for (const other of tabs) {
    const active = other === tab;
    other.setAttribute("aria-selected", String(active));
    other.tabIndex = active ? 0 : -1;
    document.getElementById(`view-${other.dataset.view}`).hidden = !active;
  }
  const view = tab.dataset.view;
  if (view === "design") startDesignViewer();
  if (view === "drawings") loadObject(document.querySelector(".drawing:not([hidden]) object"));
  if (view === "model") {
    const model = document.querySelector("#view-model model-viewer");
    if (!model.hasAttribute("src")) model.setAttribute("src", model.dataset.src);
    import("./vendor/model-viewer-4.4.0.min.js").catch(() => status("3D unavailable. Download the STEP files from Enclosure & mechanics."));
  }
}
tabs.forEach((tab, index) => {
  tab.tabIndex = index ? -1 : 0;
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); activateTab(tabs[next]);
  });
});
// Drawings: one of top copper, bottom copper or the schematic at a time.
const drawingButtons = [...document.querySelectorAll("[data-drawing]")];
for (const button of drawingButtons) button.addEventListener("click", () => {
  for (const other of drawingButtons) other.setAttribute("aria-pressed", String(other === button));
  for (const view of document.querySelectorAll("[data-drawing-view]")) view.hidden = view.dataset.drawingView !== button.dataset.drawing;
  loadObject(document.querySelector(`[data-drawing-view="${button.dataset.drawing}"] object`));
});
const resets = new Map();
function connectSvg(object) {
  try {
    const svg = object.contentDocument?.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg" || resets.has(object)) return;
    const original = svg.viewBox.baseVal;
    const initial = { x: original.x, y: original.y, width: original.width, height: original.height };
    if (!initial.width || !initial.height) return;
    let box = { ...initial }, drag;
    const draw = () => svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    const point = event => { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    svg.style.touchAction = "none"; svg.style.cursor = "grab";
    svg.addEventListener("wheel", event => {
      event.preventDefault(); const p = point(event), factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
      if (box.width * factor < initial.width / 50 || box.width * factor > initial.width * 4) return;
      box = { x: p.x - (p.x - box.x) * factor, y: p.y - (p.y - box.y) * factor, width: box.width * factor, height: box.height * factor }; draw();
    }, { passive: false });
    svg.addEventListener("pointerdown", event => { if (event.button !== 0) return; drag = point(event); svg.setPointerCapture(event.pointerId); });
    svg.addEventListener("pointermove", event => { if (!drag) return; const p = point(event); box.x += drag.x - p.x; box.y += drag.y - p.y; draw(); });
    for (const name of ["pointerup", "pointercancel"]) svg.addEventListener(name, () => { drag = null; });
    resets.set(object, () => { box = { ...initial }; draw(); });
  } catch {
    status("For interactive SVG and 3D, open this site with 'node preview.mjs' rather than a file:// URL.");
  }
}
document.querySelectorAll("object[type='image/svg+xml']").forEach(object => { object.addEventListener("load", () => connectSvg(object)); connectSvg(object); });
function resetView() {
  const panel = document.querySelector("#inspect [role=tabpanel]:not([hidden])");
  if (!panel) return;
  if (panel.id === "view-design") { document.getElementById("dv-fit")?.click(); return; }
  const object = panel.querySelector(".drawing:not([hidden]) object");
  if (object) resets.get(object)?.();
  const model = panel.querySelector("model-viewer");
  if (model) { model.cameraOrbit = "45deg 54.7356deg auto"; model.fieldOfView = "auto"; }
}
for (const button of document.querySelectorAll("[data-reset-view]")) button.addEventListener("click", resetView);
if (tabs.length) document.addEventListener("keydown", event => {
  if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
  if (event.key.toLowerCase() === "f") resetView();
});
const model = document.querySelector("model-viewer");
model?.addEventListener("error", () => status("3D could not load. The STEP package and the drawings remain available."));
model?.addEventListener("load", async () => { const {initializeColors}=await import("./model-colors.mjs");await initializeColors(model); });
// The interactive view is the default; links such as explore.html?net=HX_DOUT
// select their net or part once it has loaded (design-viewer.mjs).
if (tabs.length) activateTab(tabs[0]);
