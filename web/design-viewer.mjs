// Interactive design viewer: KiCanvas schematic + PCB side by side, with
// whole-net highlighting in both, part cross-probing and viewer-only themes.
//
// KiCanvas has no public API for this. The few internals used here (the
// viewer object, select/zoom, highlight_net, theme colours, camera) are
// pinned by the vendored bundle's checksum in vendor/lock.json.
import { artifactUrl } from './revision.mjs';
import { json } from './review-data.mjs';
import { PALETTES, applyPalette, snapshotTheme } from './viewer-themes.mjs';

const byId = id => document.getElementById(id);
const pointKey = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
const storage = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

/** Find the KiCanvas viewer object inside an embed's shadow DOM once it has loaded. */
function viewerOf(embed, timeout = 30000) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const look = () => {
      const seen = new Set();
      const walk = (node, depth) => {
        if (!node || depth > 10 || seen.has(node)) return null;
        seen.add(node);
        if (node.viewer?.select && (node.viewer.board || node.viewer.schematic)) return node.viewer;
        for (const kid of [...(node.shadowRoot?.children ?? []), ...(node.children ?? [])]) { const found = walk(kid, depth + 1); if (found) return found; }
        return null;
      };
      const viewer = walk(embed, 0);
      // `loaded` opens once KiCanvas has parsed, painted and positioned its camera.
      if (viewer?.viewport?.camera && viewer.loaded?.isOpen) return resolve(viewer);
      if (performance.now() - started > timeout) return reject(new Error('the viewer did not finish loading'));
      setTimeout(look, 150);
    };
    look();
  });
}

function embedFor(src) {
  const embed = document.createElement('kicanvas-embed');
  embed.setAttribute('controls', 'full');
  // No click-to-interact layer: it swallows the first click after every focus
  // change, which breaks cross-probing. Scrolling over a viewer zooms it.
  embed.setAttribute('controlslist', 'nooverlay');
  const source = document.createElement('kicanvas-source');
  source.setAttribute('src', src);
  embed.append(source);
  return embed;
}

export async function mountDesignViewer(version) {
  const app = byId('design-viewer-app'), status = byId('dv-status');
  status.textContent = 'Loading the schematic and PCB viewers…';
  await import('./vendor/kicanvas.js');
  const [board, nets] = await Promise.all([json(`review/${version.metadata}`), json(artifactUrl(version, 'schematicNets'))]);
  const schEmbed = embedFor(artifactUrl(version, 'native')), pcbEmbed = embedFor(artifactUrl(version, 'nativeBoard'));
  const overlay = Object.assign(document.createElement('canvas'), { className: 'dv-overlay' });
  overlay.setAttribute('aria-hidden', 'true');
  byId('dv-sch-pane').append(schEmbed, overlay);
  byId('dv-pcb-pane').append(pcbEmbed);
  app.hidden = false;
  const [sch, pcb] = await Promise.all([viewerOf(schEmbed), viewerOf(pcbEmbed)]);

  // ------------------------------------------------------------ themes
  const builtIn = { schematic: snapshotTheme(sch.theme), board: snapshotTheme(pcb.theme) };
  const themeSelect = byId('dv-theme');
  function setTheme(name) {
    const palette = PALETTES[name] ?? PALETTES.kicad;
    applyPalette(sch.theme, palette.schematic ?? builtIn.schematic);
    applyPalette(pcb.theme, palette.board ?? builtIn.board);
    sch.paint(); pcb.paint();
    reapplyHighlight();
    sch.draw(); pcb.draw();
    storage.set('coffee-scale.viewer-theme', name);
  }
  themeSelect.value = PALETTES[storage.get('coffee-scale.viewer-theme')] ? storage.get('coffee-scale.viewer-theme') : 'kicad';
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

  // ------------------------------------------------------------ nets
  const padsByNet = new Map();
  for (const component of board.components) for (const pad of component.pads) {
    if (!pad.net) continue;
    if (!padsByNet.has(pad.net)) padsByNet.set(pad.net, []);
    const pads = padsByNet.get(pad.net);
    // Some footprints repeat a pad number (e.g. castellated + through-hole copper of one pin).
    if (!pads.some(p => p.ref === component.ref && p.pad === pad.number)) pads.push({ ref: component.ref, pad: pad.number, value: component.value });
  }
  const pcbNetNumber = name => pcb.board.nets.find(net => net.name === name)?.number;
  const BBox = pcb.layers.by_name('Edge.Cuts').bbox.constructor;
  function zoomTo(viewer, points, margin) {
    if (!points.length) return;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const [x, y] = [Math.min(...xs) - margin, Math.min(...ys) - margin];
    viewer.viewport.camera.bbox = new BBox(x, y, Math.max(...xs) + margin - x, Math.max(...ys) + margin - y);
    viewer.draw();
  }
  function zoomToNet(name, { schematic = true, board: zoomBoard = true } = {}) {
    const geometry = nets.nets[name];
    if (schematic && geometry) zoomTo(sch, [...geometry.wires.flatMap(([x1, y1, x2, y2]) => [[x1, y1], [x2, y2]]), ...geometry.pins, ...geometry.labels], 10);
    if (zoomBoard) {
      const points = board.components.flatMap(c => c.pads.filter(p => p.net === name).map(p => [p.x, p.y]));
      for (const s of [...board.segments, ...board.arcs]) if (s.net === name) points.push(s.start, s.end);
      for (const v of board.vias) if (v.net === name) points.push(v.at);
      zoomTo(pcb, points, 3);
    }
  }
  const netAtPoint = new Map();
  for (const [name, geometry] of Object.entries(nets.nets)) {
    for (const [x1, y1, x2, y2] of geometry.wires) { netAtPoint.set(pointKey(x1, y1), name); netAtPoint.set(pointKey(x2, y2), name); }
    for (const [x, y] of [...geometry.labels, ...geometry.pins]) netAtPoint.set(pointKey(x, y), name);
  }

  let currentNet = null, syncing = false;
  const kicanvasHighlight = pcb.highlight_net.bind(pcb);
  // KiCanvas paints every item into its highlight layer when given "no net";
  // clearing must empty that layer instead.
  // While a net is highlighted, fade copper pours and other tracks so the
  // highlighted net (drawn on KiCanvas's overlay layer) stands out.
  const fade = on => { pcb.zone_opacity = on ? 0.25 : 1; pcb.track_opacity = on ? 0.45 : 1; pcb.via_opacity = on ? 0.45 : 1; };
  const originalHighlight = number => {
    if (number === null || number === undefined || number === 0) { fade(false); pcb.layers.overlay.clear(); pcb.draw(); }
    else { fade(true); kicanvasHighlight(number); }
  };
  // Clicking a track or pad in KiCanvas highlights its net without an event; observe it.
  pcb.highlight_net = number => { originalHighlight(number); if (!syncing) { const name = pcb.board.nets[number]?.name ?? null; later(() => selectNet(name, { fromPcb: true })); } };

  function drawOverlay() {
    const canvas = sch.canvas, ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect(), host = byId('dv-sch-pane').getBoundingClientRect();
    Object.assign(overlay.style, { left: `${rect.left - host.left}px`, top: `${rect.top - host.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    overlay.width = Math.round(rect.width * ratio); overlay.height = Math.round(rect.height * ratio);
    const g = overlay.getContext('2d'); g.setTransform(ratio, 0, 0, ratio, 0, 0); g.clearRect(0, 0, rect.width, rect.height);
    const geometry = currentNet && nets.nets[currentNet];
    if (!geometry) return;
    const camera = sch.viewport.camera, at = (x, y) => { const p = camera.world_to_screen({ x, y }); return [p.x, p.y]; };
    const scale = Math.hypot(...at(1, 0).map((v, i) => v - at(0, 0)[i]));
    const colour = PALETTES[themeSelect.value]?.highlight ?? '#ff00cc';
    g.strokeStyle = colour; g.fillStyle = colour; g.lineCap = 'round'; g.globalAlpha = 0.75;
    g.lineWidth = Math.max(3, scale * 0.5);
    g.beginPath();
    for (const [x1, y1, x2, y2] of geometry.wires) { g.moveTo(...at(x1, y1)); g.lineTo(...at(x2, y2)); }
    g.stroke();
    const radius = Math.max(3.5, scale * 0.6);
    for (const [x, y] of [...geometry.pins, ...geometry.labels]) { g.beginPath(); g.arc(...at(x, y), radius, 0, Math.PI * 2); g.fill(); }
  }
  const originalDraw = sch.on_draw.bind(sch);
  sch.on_draw = (...args) => { const result = originalDraw(...args); drawOverlay(); return result; };
  new ResizeObserver(() => drawOverlay()).observe(byId('dv-sch-pane'));

  function reapplyHighlight() {
    syncing = true;
    try { if (currentNet) originalHighlight(pcbNetNumber(currentNet)); } finally { syncing = false; }
  }

  function selectNet(name, { fromPcb = false, fromSch = false, zoom = false } = {}) {
    currentNet = name && (nets.nets[name] || padsByNet.has(name)) ? name : null;
    if (currentNet && (zoom || fromPcb || fromSch)) zoomToNet(currentNet, { schematic: zoom || fromPcb, board: zoom || fromSch });
    if (!fromPcb) { syncing = true; try { originalHighlight(currentNet ? pcbNetNumber(currentNet) : null); } finally { syncing = false; } }
    sch.draw();
    renderNetDetail();
    for (const item of byId('dv-net-list').querySelectorAll('button')) item.setAttribute('aria-current', String(item.dataset.net === currentNet));
    status.textContent = currentNet
      ? `Net ${currentNet}: ${padsByNet.get(currentNet)?.length ?? 0} pads highlighted on the PCB${nets.nets[currentNet] ? ' and its wires, labels and pins in the schematic' : '; no schematic geometry was traced for it'}.`
      : 'Click a part to find it in both views; click a track, pad, wire or label to highlight its net.';
  }

  function selectPart(ref, from) {
    if (!ref) return;
    syncing = true;
    try {
      if (from !== 'pcb') { pcb.select(ref); if (pcb.selected) pcb.zoom_to_selection(); }
      if (from !== 'sch') { sch.select(ref); if (sch.selected) sch.zoom_to_selection(); }
    } finally { syncing = false; }
    const part = board.components.find(component => component.ref === ref);
    status.textContent = `${ref}${part ? ` · ${part.value} · ${part.footprint.replace(/^.*:/, '')} · ${part.layer === 'B.Cu' ? 'bottom' : 'top'} side` : ''} — selected in both views.`;
  }

  // Cross-probe after the originating viewer has finished dispatching its
  // selection: changing another KiCanvas viewer's selection from inside that
  // dispatch does not stick.
  const later = fn => setTimeout(fn, 0);
  sch.addEventListener('kicanvas:select', event => {
    if (syncing) return;
    const item = event.detail?.item;
    if (!item) return;
    if (item.reference && item.lib_id !== undefined) return later(() => selectPart(item.reference, 'sch'));
    const position = item.at?.position ?? item.pts?.[0];
    const name = position && (netAtPoint.get(pointKey(position.x, position.y)) ?? item.pts?.map(p => netAtPoint.get(pointKey(p.x, p.y))).find(Boolean));
    if (name) later(() => selectNet(name, { fromSch: true }));
  });
  pcb.addEventListener('kicanvas:select', event => {
    if (syncing) return;
    const item = event.detail?.item;
    const ref = item?.reference ?? item?.properties?.get?.('Reference')?.value;
    if (ref) later(() => selectPart(ref, 'pcb'));
  });

  // ------------------------------------------------------------ net list
  const search = byId('dv-net-search'), showUnconnected = byId('dv-show-unconnected');
  const allNets = [...padsByNet.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  function renderNetList() {
    const query = search.value.trim().toLowerCase();
    const list = byId('dv-net-list'); list.replaceChildren();
    const shown = allNets.filter(name => (showUnconnected.checked || !name.startsWith('unconnected-')) && name.toLowerCase().includes(query));
    for (const name of shown) {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: name });
      button.dataset.net = name; button.setAttribute('aria-current', String(name === currentNet));
      button.append(Object.assign(document.createElement('span'), { textContent: `${padsByNet.get(name).length} pads` }));
      button.addEventListener('click', () => selectNet(name === currentNet ? null : name, { zoom: true }));
      const item = document.createElement('li'); item.append(button); list.append(item);
    }
    byId('dv-net-count').textContent = `${shown.length} of ${allNets.length} nets`;
  }
  function renderNetDetail() {
    const detail = byId('dv-net-detail'); detail.replaceChildren();
    if (!currentNet) return;
    detail.append(Object.assign(document.createElement('h3'), { textContent: currentNet }));
    const pads = byId('dv-net-pads') ?? document.createElement('ul');
    pads.id = 'dv-net-pads'; pads.replaceChildren();
    for (const pad of padsByNet.get(currentNet) ?? []) {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: `${pad.ref}.${pad.pad}` });
      button.title = `${pad.ref} (${pad.value}), pad ${pad.pad}`;
      button.addEventListener('click', () => selectPart(pad.ref));
      const item = document.createElement('li'); item.append(button); pads.append(item);
    }
    detail.append(pads);
  }
  search.addEventListener('input', renderNetList);
  showUnconnected.addEventListener('change', renderNetList);
  byId('dv-clear').addEventListener('click', () => { search.value = ''; renderNetList(); selectNet(null); });

  // ------------------------------------------------------------ layout
  const fit = () => { sch.zoom_to_page?.(); pcb.zoom_to_board(); sch.draw(); pcb.draw(); };
  for (const button of document.querySelectorAll('[data-dv-layout]')) button.addEventListener('click', () => {
    app.dataset.layout = button.dataset.dvLayout;
    for (const other of document.querySelectorAll('[data-dv-layout]')) other.setAttribute('aria-pressed', String(other === button));
    requestAnimationFrame(() => requestAnimationFrame(fit));
  });
  byId('dv-fit').addEventListener('click', fit);

  setTheme(themeSelect.value);
  renderNetList();
  requestAnimationFrame(fit);
  if (nets.conflicts.length || nets.limitations.length) {
    byId('dv-warnings').textContent = [...nets.limitations, ...nets.conflicts.map(c => `Schematic group joins several PCB nets (${c.nets.join(', ')}); not highlighted.`)].join(' ');
  }
  selectNet(null);
}
