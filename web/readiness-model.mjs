// "Can I order?": the release's own records turned into the two questions a
// maker asks — can I order bare boards, and can I order them assembled — plus a
// parts list grouped the way a buyer reads it. Pure, so it can be unit-tested.

const short = footprint => String(footprint ?? '').replace(/^.*:/, '');
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/** One row per distinct purchasable line: same value, footprint, stage, side and part number. */
export function groupBom(parts) {
  const groups = new Map();
  for (const part of parts) {
    const key = [part.Value, part.Footprint, part.Stage, part.Side, part.MPN, part.SupplierPart].join('\u0000');
    const group = groups.get(key) ?? { refs: [], value: part.Value, footprint: short(part.Footprint), stage: part.Stage, side: part.Side,
      manufacturer: part.Manufacturer || '', mpn: part.MPN || '', supplier: part.Supplier || '', supplierPart: part.SupplierPart || '', verified: true, notes: new Set() };
    group.refs.push(part.Reference);
    group.verified &&= Boolean(part.Verified);
    if (part.Notes) group.notes.add(part.Notes);
    groups.set(key, group);
  }
  const stageOrder = { factory: 0, manual: 1, 'wire-pad': 2, mechanical: 3 };
  return [...groups.values()].map(group => ({ ...group, refs: group.refs.sort(natural), qty: group.refs.length, notes: [...group.notes] }))
    .sort((a, b) => (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9) || natural(a.refs[0], b.refs[0]));
}

/** "R18: manufacturer/MPN missing" lines grouped by reason, with the references for each. */
export function groupBlockers(blockers) {
  const groups = new Map();
  for (const line of blockers) {
    const match = /^([^:]+):\s*(.+)$/.exec(line);
    const [ref, reason] = match ? [match[1].trim(), match[2].trim()] : ['', line];
    groups.set(reason, [...(groups.get(reason) ?? []), ref].filter(Boolean));
  }
  return [...groups].map(([reason, refs]) => ({ reason, refs: refs.sort(natural) })).sort((a, b) => b.refs.length - a.refs.length);
}

/**
 * Checklists for a bare-board order and an assembled order. Each item is
 * { state: 'ok' | 'todo' | 'pending', text, link? }. "ok" never means
 * approved by a supplier: only that the release's own records agree.
 */
export function readiness({ validation, order, parts, assembly, check, manufacturability = null }) {
  const factory = parts.filter(part => part.Stage === 'factory');
  const withMpn = factory.filter(part => part.MPN).length, reviewed = factory.filter(part => part.Verified).length;
  const kindOf = f => f.kind ?? (/paste/i.test(f.message) ? 'paste' : 'placement');
  const placement = check?.findings.filter(f => ['placement', 'side', 'unknown'].includes(kindOf(f))) ?? [];
  const paste = check?.findings.filter(f => kindOf(f).startsWith('paste')) ?? [];
  const measuredPaste = check?.parts.some(part => part.pads.some(pad => pad.pasteCoverage !== undefined));
  const pinParts = check?.parts.filter(part => part.pads.some(pad => pad.name && !/^(Pin_)?\d+$/i.test(pad.name))).length ?? 0;
  const bare = [
    { state: 'ok', text: `Design checks: ${validation}` },
    { state: 'ok', text: 'Fabrication package complete: seven Gerber layers, job file, plated and non-plated drills', link: ['Gerber inspection', 'gerbers.html'] },
    order ? { state: order.agrees ? 'ok' : 'todo', text: order.agrees ? 'Order parameters agree with the KiCad stackup and outline' : 'Order parameters disagree with the KiCad stackup or outline', link: ['Layer stackup', 'stackup.html'] }
      : { state: 'pending', text: 'Order parameters could not be checked for this revision' },
    manufacturability ? manufacturabilityItem(manufacturability) : { state: 'pending', text: 'Manufacturability against JLCPCB and PCBWay limits: not checked for this revision' },
  ];
  const assembled = [
    { state: withMpn === factory.length ? 'ok' : 'todo', text: `${withMpn} of ${factory.length} factory-placed parts have a manufacturer part number` },
    { state: reviewed === factory.length ? 'ok' : 'todo', text: `${reviewed} of ${factory.length} factory-placed parts reviewed` },
    check ? { state: placement.length ? 'todo' : 'ok', text: placement.length ? `${placement.length} placement item${placement.length > 1 ? 's' : ''} to review (${placement.map(f => f.ref).join(', ')})` : 'Placement file agrees with the board', link: ['Gerber inspection', 'gerbers.html'] }
      : { state: 'pending', text: 'Placement not checked for this revision' },
    check ? { state: paste.length ? 'todo' : 'ok', text: paste.length ? `${paste.length} solder paste item${paste.length > 1 ? 's' : ''} to review (${[...new Set(paste.map(f => f.ref))].join(', ')})` : measuredPaste ? 'Every factory-placed pad gets solder paste, 50–110 % of its copper' : 'Every factory-placed pad gets solder paste', link: ['Gerber inspection', 'gerbers.html'] } : null,
    check ? { state: 'todo', text: `${pinParts} pin map${pinParts === 1 ? "" : "s"} to compare with datasheets`, link: ['Pin maps', 'gerbers.html'] } : null,
  ].filter(Boolean);
  const hand = parts.filter(part => part.Stage === 'manual' || part.Stage === 'wire-pad').map(part => ({ ref: part.Reference, value: part.Value, note: part.Notes }));
  const verdict = list => list.some(item => item.state === 'todo') ? 'todo' : list.some(item => item.state === 'pending') ? 'pending' : 'ok';
  return { bare, assembled, hand, bareState: verdict(bare), assembledState: assembly?.ready ? verdict(assembled) : 'todo' };
}

/** One checklist line from the manufacturability comparison: "todo" if any maker's published minimum is not met. */
function manufacturabilityItem(rows) {
  const fabs = [...new Set(rows.flatMap(row => row.fabs.map(f => f.fab)))];
  const below = fabs.map(fab => ({ fab, rows: rows.filter(row => row.fabs.find(f => f.fab === fab)?.verdict === 'below') }));
  const name = fab => ({ jlcpcb: 'JLCPCB', pcbway: 'PCBWay' })[fab] ?? fab;
  const text = below.map(({ fab, rows: r }) => r.length ? `${name(fab)}: ${r.length} below (${r.map(x => x.label.toLowerCase()).join(', ')})` : `${name(fab)}: all clear`).join(' · ');
  return { state: below.some(b => b.rows.length) ? 'todo' : 'ok', text: `Published limits: ${text}`, link: ['Board statistics', 'statistics.html'] };
}
