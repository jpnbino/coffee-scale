// Schematic net geometry for the portal's whole-net highlighting.
//
// The browser viewer (KiCanvas) draws the schematic but has no net
// highlighting. This traces schematic connectivity from the original
// .kicad_sch (wires, local/global labels, power symbols and symbol pins),
// then names each connected group with the PCB net its pins belong to. The
// release's DRC schematic-parity check has already verified that schematic
// and board connectivity agree; any disagreement found here is reported as a
// conflict rather than guessed.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { atom, child, children, number, parseSexpr } from './kicad-sexpr.mjs';
import { boardData } from './board-data.mjs';

const round2 = value => Math.round(value * 100) / 100;
const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;

/** Connection point of a library pin placed by a symbol (same transform KiCanvas draws with). */
export function placePin(symbolAt, mirror, pinAt) {
  let [x, y] = pinAt;
  const rotation = ((Math.round(symbolAt[2] ?? 0) % 360) + 360) % 360;
  if (rotation % 90) throw new Error(`Unsupported symbol rotation ${symbolAt[2]}`);
  for (let i = 0; i < rotation / 90; i++) [x, y] = [-y, x];
  if (mirror === 'x') y = -y;
  if (mirror === 'y') x = -x;
  return [round2(symbolAt[0] + x), round2(symbolAt[1] - y)];
}

function libraryPins(schematic) {
  const library = new Map();
  for (const symbol of children(child(schematic, 'lib_symbols') ?? [], 'symbol')) {
    const base = symbol[1].replace(/^.*:/, '');
    const pins = [];
    for (const unit of children(symbol, 'symbol')) {
      const match = String(unit[1]).match(/_(\d+)_(\d+)$/);
      const [unitNumber, style] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
      for (const pin of children(unit, 'pin')) {
        const at = child(pin, 'at');
        pins.push({ number: child(pin, 'number')?.[1] ?? '', type: pin[1], unit: unitNumber, style, at: [number(at?.[1]), number(at?.[2])] });
      }
    }
    library.set(symbol[1], { base, power: Boolean(child(symbol, 'power')), pins });
  }
  return library;
}

/** Plain connectivity items from a .kicad_sch source. */
export function schematicItems(source) {
  const schematic = parseSexpr(source);
  if (schematic[0] !== 'kicad_sch') throw new Error('Expected a KiCad schematic');
  const library = libraryPins(schematic);
  const wires = children(schematic, 'wire').map(wire => children(child(wire, 'pts'), 'xy').map(p => [number(p[1]), number(p[2])]));
  const labels = ['label', 'global_label', 'hierarchical_label'].flatMap(kind => children(schematic, kind).map(label => {
    const at = child(label, 'at');
    return { kind, text: label[1], at: [number(at?.[1]), number(at?.[2])] };
  }));
  const symbols = children(schematic, 'symbol').map(symbol => {
    const name = atom(symbol, 'lib_name') ? atom(symbol, 'lib_name') : atom(symbol, 'lib_id');
    const lib = library.get(name) ?? [...library.values()].find(entry => entry.base === name.replace(/^.*:/, ''));
    if (!lib) throw new Error(`Library symbol missing from schematic cache: ${name}`);
    const at = child(symbol, 'at'); const position = [number(at?.[1]), number(at?.[2]), number(at?.[3])];
    const unit = Number(atom(symbol, 'unit', '1')); const style = Number(atom(symbol, 'body_style', atom(symbol, 'convert', '1')));
    const properties = Object.fromEntries(children(symbol, 'property').map(p => [p[1], p[2]]));
    const pins = lib.pins.filter(pin => (pin.unit === 0 || pin.unit === unit) && (pin.style === 0 || pin.style === style))
      .map(pin => ({ number: pin.number, type: pin.type, at: placePin(position, atom(symbol, 'mirror'), pin.at) }));
    return { ref: properties.Reference ?? '', value: properties.Value ?? '', power: lib.power, pins };
  });
  return { wires, labels, symbols, hierarchical: children(schematic, 'sheet').length > 0 };
}

function onSegment([px, py], [ax, ay], [bx, by]) {
  const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  if (Math.abs(cross) > 1e-3) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  return dot > 1e-6 && dot < (bx - ax) ** 2 + (by - ay) ** 2 - 1e-6;
}

/**
 * Net geometry keyed by PCB net name. `board` is tools/board-data.mjs output
 * for the matching PCB, supplying each pad's net.
 */
export function schematicNets(source, board) {
  const { wires, labels, symbols, hierarchical } = schematicItems(source);
  const parent = new Map();
  const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const add = k => { if (!parent.has(k)) parent.set(k, k); return k; };
  const union = (a, b) => { const ra = find(add(a)), rb = find(add(b)); if (ra !== rb) parent.set(ra, rb); };

  const points = [];
  for (const wire of wires) { for (const p of wire) points.push(p); for (let i = 1; i < wire.length; i++) union(key(...wire[i - 1]), key(...wire[i])); }
  for (const label of labels) { add(key(...label.at)); points.push(label.at); }
  for (const symbol of symbols) for (const pin of symbol.pins) { add(key(...pin.at)); points.push(pin.at); }
  // A wire end, pin or label touching the middle of a wire joins it.
  for (const wire of wires) for (let i = 1; i < wire.length; i++) {
    for (const p of points) if (onSegment(p, wire[i - 1], wire[i])) union(key(...p), key(...wire[i]));
  }
  const byName = new Map();
  const join = (name, k) => { if (byName.has(name)) union(byName.get(name), k); else byName.set(name, k); };
  for (const label of labels) join(`${label.kind === 'label' ? 'local' : 'global'}:${label.text}`, key(...label.at));
  // As in KiCad, only a power symbol's power-input pin creates a global net
  // named by its value; PWR_FLAG (power-output pin) joins nothing.
  const globalPower = (symbol, pin) => symbol.power && pin.type === 'power_in';
  for (const symbol of symbols) for (const pin of symbol.pins) if (globalPower(symbol, pin)) join(`power:${symbol.value}`, key(...pin.at));

  const pads = new Map();
  for (const component of board.components) for (const pad of component.pads) if (pad.net) pads.set(`${component.ref}\u0000${pad.number}`, pad.net);
  const boardNets = new Set(pads.values());
  const groups = new Map();
  const group = k => { const root = find(k); if (!groups.has(root)) groups.set(root, { nets: new Set(), wires: [], labels: [], pins: [] }); return groups.get(root); };
  for (const symbol of symbols) for (const pin of symbol.pins) {
    const g = group(key(...pin.at)); g.pins.push([...pin.at, symbol.ref, pin.number]);
    const net = !symbol.power && pads.get(`${symbol.ref}\u0000${pin.number}`);
    if (net) g.nets.add(net);
  }
  for (const label of labels) {
    const g = group(key(...label.at)); g.labels.push([...label.at, label.text]);
    if (!g.nets.size && boardNets.has(`/${label.text}`)) g.nets.add(`/${label.text}`);
  }
  for (const wire of wires) for (let i = 1; i < wire.length; i++) group(key(...wire[i])).wires.push([...wire[i - 1], ...wire[i]]);
  for (const symbol of symbols) for (const pin of symbol.pins) if (globalPower(symbol, pin)) {
    const g = group(key(...pin.at)); if (!g.nets.size && boardNets.has(symbol.value)) g.nets.add(symbol.value);
  }

  const nets = {}; const conflicts = []; let unassigned = 0;
  for (const g of groups.values()) {
    if (g.nets.size > 1) { conflicts.push({ nets: [...g.nets].sort(), pins: g.pins.map(p => `${p[2]}.${p[3]}`).sort() }); continue; }
    if (!g.nets.size) { unassigned++; continue; }
    const name = [...g.nets][0];
    const entry = nets[name] ??= { wires: [], labels: [], pins: [] };
    entry.wires.push(...g.wires); entry.labels.push(...g.labels); entry.pins.push(...g.pins);
  }
  const missing = [...boardNets].filter(name => !nets[name]).sort();
  return {
    schemaVersion: 1, sourceSha256: createHash('sha256').update(source).digest('hex'), boardSha256: board.boardSha256,
    nets, conflicts, missing, unassignedGroups: unassigned,
    limitations: hierarchical ? ['Hierarchical sheets are not traced; only the root sheet is highlighted.'] : [],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sch, pcb, output] = process.argv.slice(2);
  const result = schematicNets(readFileSync(sch, 'utf8'), boardData(readFileSync(pcb, 'utf8')));
  writeFileSync(output, JSON.stringify(result));
  console.log(`Schematic nets: ${Object.keys(result.nets).length} traced, ${result.conflicts.length} conflicts, ${result.missing.length} board nets without schematic geometry.`);
}
