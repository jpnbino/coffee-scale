// Pre-order checks drawn over the released Gerber layers: where the assembler's
// placement file puts each part, pin 1, findings from tools/fab-check.mjs, and
// click-to-identify for pads, tracks and parts. Board millimetres × 1000 are the
// rendered Gerber units, so overlay geometry needs no other transform.
import { json } from "./review-data.mjs";
import { svgNode } from "./review-draw.mjs";
import { viewerLink, resolveNet } from "./viewer-link.mjs";
import { hitTest, strip } from "./fab-geometry.mjs";

const U = 1000;
const byId = id => document.getElementById(id);
const el = (tag, text, attributes = {}) => Object.assign(document.createElement(tag), attributes, text === undefined ? {} : { textContent: text });
const shownNet = name => (/^unconnected-/.test(name) ? "not connected" : name);
// One row per pad number: modules such as the Pico footprint repeat pad numbers
// (castellation and through-hole), and unnumbered pads are mechanical.
const pinRows = pads => [...new Map(pads.filter(pad => pad.number).map(pad => [pad.number, pad])).values()];
// Generic pin names say nothing a datasheet check needs.
const meaningfulName = name => name && !/^(Pin_)?\d+$/i.test(name);

export function createFabOverlay({ svg, viewport, isMeasuring, mirrored }) {
  let check = null, board = null, group = null, bounds = null, layer = null, version = null, side = null;
  const onlySide = () => side?.only ?? null;
  let selection = null; // { part?, net? }

  const view = ([x, y]) => [mirrored() ? 2 * bounds[0] + bounds[2] - x * U : x * U, y * U];
  function zoomTo(points, marginMm = 4) {
    const xs = points.map(p => view(p)[0]), ys = points.map(p => view(p)[1]), m = marginMm * U;
    const [, , w0, h0] = viewport.get(), aspect = h0 / w0;
    let w = Math.max(...xs) - Math.min(...xs) + 2 * m, h = Math.max(...ys) - Math.min(...ys) + 2 * m;
    if (h / w > aspect) w = h / aspect; else h = w * aspect;
    viewport.set([(Math.min(...xs) + Math.max(...xs) - w) / 2, (Math.min(...ys) + Math.max(...ys) - h) / 2, w, h]);
  }

  function text(x, y, value, size, fill, anchor = "start") {
    // Keep labels readable when the whole board is mirrored for a bottom view.
    const node = svgNode("text", { x: 0, y: 0, "font-size": size * U, fill, "text-anchor": anchor, "font-family": "system-ui, sans-serif", transform: `translate(${x * U} ${y * U})${mirrored() ? " scale(-1 1)" : ""}` });
    node.textContent = value;
    return node;
  }
  const padShape = (pad, attributes) => pad.shape === "circle"
    ? svgNode("ellipse", { cx: pad.x * U, cy: pad.y * U, rx: pad.width / 2 * U, ry: pad.height / 2 * U, ...attributes })
    : svgNode("rect", { x: (pad.x - pad.width / 2) * U, y: (pad.y - pad.height / 2) * U, width: pad.width * U, height: pad.height * U, transform: `rotate(${-pad.angle} ${pad.x * U} ${pad.y * U})`, ...attributes });

  function redraw() {
    if (!layer) return;
    layer.replaceChildren();
    const flagged = new Set(check.findings.map(f => f.ref));
    const showPlacement = byId("fab-placement")?.checked ?? true, showLabels = byId("fab-labels")?.checked ?? false;
    const highlight = "#ffd84d", marker = "#5fd4ff", warn = "#ff7a59";

    // Selection first, so markers stay on top of it.
    if (selection?.net) {
      for (const segment of board?.segments ?? []) if (strip(segment.net) === selection.net && (!onlySide() || segment.layer === (onlySide() === "bottom" ? "B.Cu" : "F.Cu")))
        layer.append(svgNode("line", { x1: segment.start[0] * U, y1: segment.start[1] * U, x2: segment.end[0] * U, y2: segment.end[1] * U, stroke: highlight, "stroke-width": Math.max(segment.width, 0.2) * U, "stroke-linecap": "round", opacity: 0.55 }));
      for (const part of check.parts) for (const pad of part.pads) if (pad.net === selection.net)
        layer.append(padShape(pad, { fill: highlight, "fill-opacity": 0.35, stroke: highlight, "stroke-width": 0.12 * U }));
    }
    if (selection?.part?.body) {
      const b = selection.part.body;
      layer.append(svgNode("rect", { x: b.minX * U, y: b.minY * U, width: (b.maxX - b.minX) * U, height: (b.maxY - b.minY) * U, fill: "none", stroke: highlight, "stroke-width": 0.15 * U, "stroke-dasharray": `${0.5 * U} ${0.3 * U}` }));
      for (const pad of selection.part.pads) layer.append(padShape(pad, { fill: "none", stroke: highlight, "stroke-width": 0.12 * U }));
    }

    for (const part of check.parts) {
      if (onlySide() && part.side !== onlySide()) continue;
      const bad = flagged.has(part.ref), colour = bad ? warn : marker;
      if (showPlacement && part.pin1) layer.append(svgNode("circle", { cx: part.pin1[0] * U, cy: part.pin1[1] * U, r: 0.28 * U, fill: colour, opacity: 0.9 }));
      if (showPlacement && part.placement) {
        const { x, y } = part.placement, r = 0.7 * U;
        const cross = svgNode("g", { stroke: colour, "stroke-width": 0.12 * U, fill: "none" });
        cross.append(svgNode("line", { x1: x * U - r, y1: y * U, x2: x * U + r, y2: y * U }), svgNode("line", { x1: x * U, y1: y * U - r, x2: x * U, y2: y * U + r }), svgNode("circle", { cx: x * U, cy: y * U, r: r * 0.55 }));
        layer.append(cross);
        if (bad && part.body) {
          const cx = (part.body.minX + part.body.maxX) / 2, cy = (part.body.minY + part.body.maxY) / 2;
          layer.append(svgNode("line", { x1: x * U, y1: y * U, x2: cx * U, y2: cy * U, stroke: warn, "stroke-width": 0.12 * U, "stroke-dasharray": `${0.4 * U} ${0.25 * U}` }));
          layer.append(svgNode("rect", { x: part.body.minX * U, y: part.body.minY * U, width: (part.body.maxX - part.body.minX) * U, height: (part.body.maxY - part.body.minY) * U, fill: "none", stroke: warn, "stroke-width": 0.1 * U, opacity: 0.8 }));
        }
      }
      if (showLabels || bad || selection?.part === part) {
        const at = part.body ? [(part.body.minX + part.body.maxX) / 2, part.body.minY - 0.3] : part.origin;
        layer.append(text(at[0], at[1], part.ref, 0.9, bad ? warn : "#f6f3eb", "middle"));
      }
    }
  }

  // ---------------------------------------------------------------- panels
  const designLink = query => el("a", "Open in the design viewer", { href: `explore.html?${query}&rev=${encodeURIComponent(version.id)}` });
  function netButton(net) {
    if (!net || /^unconnected-/.test(net)) return el("span", shownNet(net));
    const button = el("button", net, { type: "button", className: "link-button" });
    button.addEventListener("click", () => select({ net }, { zoom: true }));
    return button;
  }
  function pinTable(part) {
    const table = el("table", undefined, { className: "fab-pins" });
    const head = el("tr"); for (const label of ["Pad", "Pin", "Net"]) head.append(el("th", label));
    table.append(head);
    for (const pad of pinRows(part.pads)) {
      const row = el("tr"); row.append(el("td", pad.number), el("td", pad.name ?? "—"));
      const cell = el("td"); cell.append(netButton(pad.net)); row.append(cell); table.append(row);
    }
    return table;
  }
  function describePart(part, container) {
    container.append(el("h3", `${part.ref} · ${part.value}`));
    container.append(el("p", `${part.footprint} · ${part.side} side`, { className: "muted" }));
    const facts = el("ul", undefined, { className: "fab-facts" });
    if (part.placement) {
      const p = part.placement;
      facts.append(el("li", `Placement file: X ${p.x.toFixed(2)}, Y ${(-p.y).toFixed(2)} mm, ${p.rotation}°${p.rotationDifference ? ` (differs from KiCad's ${part.rotation}° by ${p.rotationDifference}°)` : ""}`));
      if (Number.isFinite(p.offsetMm)) facts.append(el("li", `Placement point to ${part.body?.source ?? "body"} centre: ${p.offsetMm.toFixed(2)} mm${Number.isFinite(p.padOffsetMm) ? ` · to pad centre: ${p.padOffsetMm.toFixed(2)} mm` : ""}`));
    } else facts.append(el("li", check.placementFile ? "Not in the placement file: fitted by hand or not fitted." : "No placement file recorded for this revision."));
    for (const finding of check.findings.filter(f => f.ref === part.ref)) facts.append(el("li", finding.message, { className: `fab-${finding.severity}` }));
    container.append(facts, pinTable(part), designLink(`part=${encodeURIComponent(part.ref)}`));
  }
  function renderSelection(hit) {
    const panel = byId("fab-selection");
    if (!panel) return;
    panel.replaceChildren();
    if (!selection) { panel.append(el("h3", "Click a pad, track or part"), el("p", "It is identified here and its net is highlighted. Drag to pan; scroll to zoom.", { className: "muted" })); return; }
    if (hit?.kind === "pad") panel.append(el("p", hit.pad.number ? `Pad ${hit.pad.number}${hit.pad.name ? ` (${hit.pad.name})` : ""} of ${hit.part.ref}` : `Unnumbered pad or hole of ${hit.part.ref}`, { className: "fab-hit" }));
    if (selection.net) {
      const pads = [...new Set(check.parts.flatMap(part => part.pads.filter(pad => pad.net === selection.net).map(pad => `${part.ref}.${pad.number}`)))];
      panel.append(el("h3", `Net ${shownNet(selection.net)}`), el("p", `${pads.length} pads: ${pads.join(", ")}`, { className: "muted" }), designLink(`net=${encodeURIComponent(selection.net)}`));
    }
    if (selection.part) describePart(selection.part, panel);
  }
  function select(next, { zoom = false, hit = null } = {}) {
    selection = next;
    redraw(); renderSelection(hit);
    if (!zoom || !selection) return;
    if (selection.part?.body) { const b = selection.part.body; zoomTo([[b.minX, b.minY], [b.maxX, b.maxY]]); }
    else if (selection.net) {
      const points = check.parts.flatMap(part => part.pads.filter(pad => pad.net === selection.net).map(pad => [pad.x, pad.y]));
      if (points.length) zoomTo(points);
    }
  }
  function renderFindings() {
    const list = byId("fab-findings"), summary = byId("fab-summary");
    if (!list) return;
    list.replaceChildren();
    const errors = check.findings.filter(f => f.severity === "error").length, reviews = check.findings.length - errors;
    summary.textContent = !check.placementFile
      ? `No placement file is recorded for this revision, so only pin maps can be reviewed. ${check.findings.length ? `${check.findings.length} other notes.` : ""}`
      : check.findings.length
        ? `${errors ? `${errors} error${errors > 1 ? "s" : ""} and ` : ""}${reviews} item${reviews === 1 ? "" : "s"} to review against ${check.placementFile}.`
        : `No findings against ${check.placementFile}.`;
    for (const finding of check.findings) {
      const button = el("button", undefined, { type: "button", className: `fab-finding fab-${finding.severity}` });
      button.append(el("strong", finding.ref), document.createTextNode(` ${finding.message}`));
      const part = check.parts.find(p => p.ref === finding.ref);
      button.addEventListener("click", () => { if (part) select({ part }, { zoom: true }); else { select(null); zoomTo([finding.at]); } });
      const item = el("li"); item.append(button); list.append(item);
    }
    const maps = byId("fab-pinmap-list");
    if (!maps) return;
    maps.replaceChildren();
    // Small parts first: a swapped SOT-23 or diode is the likeliest mistake and the quickest check.
    const parts = check.parts.filter(part => part.pads.some(pad => meaningfulName(pad.name))).sort((a, b) => pinRows(a.pads).length - pinRows(b.pads).length || a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    byId("fab-pinmap-count").textContent = `${parts.length} parts`;
    const table = el("table", undefined, { className: "fab-pinmaps" });
    const head = el("tr"); for (const label of ["Part", "Value", "Footprint", "Pad → pin → net"]) head.append(el("th", label));
    table.append(head);
    for (const part of parts) {
      const row = el("tr"), ref = el("td"), button = el("button", part.ref, { type: "button", className: "link-button" });
      button.addEventListener("click", () => { select({ part }, { zoom: true }); svg.scrollIntoView({ block: "center" }); });
      ref.append(button);
      row.append(ref, el("td", part.value), el("td", part.footprint), el("td", pinRows(part.pads).map(pad => `${pad.number} ${pad.name ?? "—"} → ${shownNet(pad.net)}`).join(" · ")));
      table.append(row);
    }
    maps.append(table);
  }

  // ---------------------------------------------------------------- input
  let down = null;
  svg.addEventListener("pointerdown", event => { down = [event.clientX, event.clientY]; });
  svg.addEventListener("click", event => {
    if (!check || !group || isMeasuring()) return;
    if (down && Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4) return; // a drag, not a click
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const local = p.matrixTransform(group.getScreenCTM().inverse());
    const hit = hitTest(check, board, [local.x / U, local.y / U], side);
    if (!hit) return select(null);
    if (hit.kind === "pad") select({ part: hit.part, net: /^unconnected-/.test(hit.net) ? null : hit.net || null }, { hit });
    else if (hit.kind === "part") select({ part: hit.part }, { hit });
    else select({ net: hit.net }, { hit });
  });
  for (const id of ["fab-placement", "fab-labels"]) byId(id)?.addEventListener("change", redraw);

  return {
    redraw,
    setSide(value) { side = value; redraw(); },
    async render(nextVersion, context) {
      group = context.group; bounds = context.bounds; version = nextVersion; selection = null; check = null; layer = null;
      const panel = byId("fab-panels"), pinmap = document.querySelector(".fab-pinmap");
      const show = on => { if (panel) panel.hidden = !on; if (pinmap) pinmap.hidden = !on; };
      show(false);
      if (!version.fabCheck) return;
      try {
        const [loadedCheck, loadedBoard] = await Promise.all([json(`review/${version.fabCheck}`), json(`review/${version.metadata}`).catch(() => null)]);
        if (!context.ticket()) return;
        check = loadedCheck; board = loadedBoard;
      } catch (error) {
        // The layers are still worth inspecting without the checks.
        byId("gerber-status").textContent += ` Pre-order checks unavailable: ${error.message}.`;
        return;
      }
      show(true);
      layer = svgNode("g", { "data-layer": "fab-check", "pointer-events": "none" });
      group.append(layer);
      renderFindings(); renderSelection();
      const link = viewerLink(location.search);
      const net = resolveNet(link.net, name => check.parts.some(part => part.pads.some(pad => pad.net === strip(name))));
      const part = link.part && check.parts.find(p => p.ref === link.part);
      if (part || net) requestAnimationFrame(() => select({ part: part || null, net: net ? strip(net) : null }, { zoom: true }));
      else redraw();
    },
  };
}
