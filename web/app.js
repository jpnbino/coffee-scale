"use strict";
import { selectedPromise,artifactUrl } from './revision.mjs';
const selectedVersion = await selectedPromise;
const isCurrent = selectedVersion.id === 'current';
const data = window.releaseData;
const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });
const table = document.getElementById("parts-body");
function renderParts(query = "") {
  table.replaceChildren();
  const shown = data.parts.filter(part => Object.values(part).join(" ").toLowerCase().includes(query.toLowerCase()));
  for (const part of shown) {
    const row = document.createElement("tr");
    for (const value of [part.Reference, part.Value, part.Footprint, part.Side, part.Stage, part.Verified ? "Reviewed" : "Needs review"]) row.append(text("td", value));
    table.append(row);
  }
  document.getElementById("parts-count").textContent = `${shown.length} of ${data.parts.length} board features shown. Mechanical holes and integral pads are not purchased components.`;
}
if (table && isCurrent) {
renderParts();
document.getElementById("parts-search").addEventListener("input", event => renderParts(event.target.value));
document.getElementById("assembly-status").textContent = data.assembly.ready ? "Assembly profile reviewed for this board checksum." : `Assembly DRAFT — ${data.assembly.blockers.length} outstanding checks; these files are not approved for an assembly order.`;
for (const blocker of data.assembly.blockers) document.getElementById("assembly-blockers").append(text("li", blocker));
}
if (table && !isCurrent) document.getElementById('parts').replaceChildren(text('h2','Historical assembly records unavailable'),text('p','No BOM/placement approval profile was archived for this snapshot. Use its source package; current assembly data is not substituted.'));
if (document.getElementById("mechanical-status")) {
if (isCurrent) {
for (const assumption of data.mechanical.assumptions) document.getElementById("mechanical-assumptions").append(text("li", assumption));
document.getElementById("mechanical-status").textContent = data.mechanical.referenceReviewedForCurrentBoard ? "Reference assumptions match this board checksum; physical dimensions remain provisional." : "The board changed since the mechanical reference was reviewed. Recheck the origin, display stack and case interface.";
} else {
  document.querySelector('#mechanical>p:not(.eyebrow)').textContent='Historical package: populated and bare-board STEP models re-exported from this selected snapshot. Coordinates use the KiCad default origin; read the included guide.';
  document.getElementById('mechanical-status').textContent='No historical fit approval or component-origin report is available. Do not use current-build enclosure assumptions for this snapshot.';
  document.querySelector('[data-artifact="mechanical"] span').textContent='Populated and bare-board STEP · origin guide';
}
}
const tabs = [...document.querySelectorAll("[data-view]")];
function activateTab(tab) {
  for (const other of tabs) {
    const active = other === tab;
    other.setAttribute("aria-selected", String(active));
    other.tabIndex = active ? 0 : -1;
    document.getElementById(`view-${other.dataset.view}`).hidden = !active;
  }
  const panel = document.getElementById(`view-${tab.dataset.view}`);
  document.getElementById("model-options").hidden = tab.dataset.view !== "model";
  const object = panel.querySelector("object");
  if (object && !object.hasAttribute("data")) object.setAttribute("data", object.dataset.src);
  if (tab.dataset.view === "model") {
    const model = panel.querySelector("model-viewer");
    model.setAttribute("src", model.dataset.src);
    import("./vendor/model-viewer-4.4.0.min.js").catch(() => {
      document.getElementById("viewer-status").textContent = "3D unavailable. Download STEP from Enclosure & mechanics.";
    });
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
    document.getElementById("viewer-status").textContent = "For interactive SVG/3D, open this site using 'node preview.mjs' rather than a file:// URL.";
  }
}
document.querySelectorAll("object[type='image/svg+xml']").forEach(object => { object.addEventListener("load", () => connectSvg(object)); connectSvg(object); });
if (tabs.length) activateTab(tabs[0]);
document.getElementById("reset-view")?.addEventListener("click", () => {
  const panel = document.querySelector(".view-panel:not([hidden])");
  const object = panel.querySelector("object");
  if (object) resets.get(object)?.();
  const model = panel.querySelector("model-viewer");
  if (model) { model.cameraOrbit = "45deg 54.7356deg auto"; model.fieldOfView = "auto"; }
});
const model = document.querySelector("model-viewer");
model?.addEventListener("load", () => { document.getElementById("viewer-status").textContent = "3D model loaded from this release. Drag to rotate; scroll to zoom."; });
model?.addEventListener("error", () => { document.getElementById("viewer-status").textContent = "3D could not load. The STEP package and rendered views remain available."; });
model?.addEventListener("load", async () => { const {initializeColors}=await import("./model-colors.mjs");await initializeColors(model); });
let nativeStarted = false;
document.getElementById("try-native")?.addEventListener("click", async () => {
  if (nativeStarted) return;
  nativeStarted = true;
  const status = document.getElementById("kicanvas-status");
  status.textContent = "Starting the content-pinned KiCanvas compatibility viewer…";
  try {
    await import("./vendor/kicanvas.js");
    const embed = document.createElement("kicanvas-embed"); embed.setAttribute("controls", "full");
    embed.setAttribute("src", artifactUrl(selectedVersion,'native'));
    document.getElementById("kicanvas-host").append(embed);
    status.textContent = "Native viewer requested using the numeric-normalized copy. SVG/PDF remain the authoritative drawing reference.";
  } catch (error) { status.textContent = `Native viewer unavailable: ${error.message}. Use SVG/PDF above.`; }
});
