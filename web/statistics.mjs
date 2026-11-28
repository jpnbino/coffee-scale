// Board statistics: manufacturability against the makers' published limits,
// then the board's facts in plain, rounded numbers.
const make = (tag, value, props = {}) => Object.assign(document.createElement(tag), props, value === undefined ? {} : { textContent: value });
const mm = value => `${Number(value).toFixed(3).replace(/\.?0+$/, '')} mm`;
const num = text => parseFloat(text);
const grouped = value => Math.round(value).toLocaleString('en-US');

export function statisticsRows(stats, metadata) {
  const board = stats.board, via = stats.vias, pads = stats.pads, components = stats.components;
  const others = [['blind', via.blind], ['buried', via.buried], ['micro', via.micro]].filter(([, n]) => n).map(([kind, n]) => `${n} ${kind}`);
  return [
    ['Board size', `${num(board.width)} × ${num(board.height)} mm, ${num(board.board_thickness)} mm thick`],
    ['Board area', `${grouped(num(board.area))} mm²`],
    ['Footprints', `${components.total.total} (${components.total.front} top, ${components.total.back} bottom)`],
    ['Surface-mount / through-hole / other', `${components.smd.total} / ${components.tht.total} / ${components.unspecified.total}`],
    ['Pads', `${pads.smd} SMD, ${pads.through_hole} plated, ${pads.npth} non-plated`],
    ['Vias', [`${via.through} through`, ...others].join(', ')],
    ['Copper area, top / bottom', `${grouped(num(board.front_copper_area))} / ${grouped(num(board.back_copper_area))} mm²`],
    ...(metadata ? [['Track segments', `${metadata.routing.segmentObjects} straight${metadata.routing.arcObjects ? `, ${metadata.routing.arcObjects} arcs` : ''}`], ['Straight track length', `${grouped(metadata.routing.straightTrackLengthMm)} mm`]] : []),
  ];
}

const VERDICT = { ok: ['✓', 'Clears the published minimum'], tight: ['≈', 'Within 10 % of the published minimum'], below: ['✗', 'Below the published minimum'], unpublished: ['–', 'No published value'], unmeasured: ['–', 'Not measured here'] };

/** The manufacturability table, a one-paragraph summary and the method notes. */
export function renderManufacturability(rows, capabilities, measures = null) {
  const body = document.getElementById('mfg-body'); if (!body) return;
  body.replaceChildren(...rows.map(row => {
    const tr = make('tr', undefined, { className: row.fabs.some(f => f.verdict === 'below') ? 'mfg-below' : '' });
    tr.append(make('td', row.label));
    const value = make('td');
    if (row.board) {
      value.append(make('strong', mm(row.board.value)));
      const where = row.board.where ?? {};
      const href = where.ref ? `gerbers.html?part=${encodeURIComponent(where.ref)}` : where.net ? `gerbers.html?net=${encodeURIComponent(where.net)}` : null;
      value.append(href ? make('a', where.label, { href, className: 'mfg-where' }) : make('span', where.label ?? '', { className: 'mfg-where' }));
    } else value.append(make('span', 'not measured here', { className: 'muted' }));
    tr.append(value);
    for (const fab of row.fabs) {
      const cell = make('td', undefined, { className: `mfg-${fab.verdict}`, title: [VERDICT[fab.verdict][1], fab.note].filter(Boolean).join('. ') });
      cell.append(make('span', VERDICT[fab.verdict][0], { className: 'mfg-mark' }), document.createTextNode(fab.min === null ? ' not published' : ` ≥ ${mm(fab.min)}`));
      if (fab.below) cell.append(make('small', `${fab.below} below`));
      // Notes are shown where they matter (a limit that is tight, missed or unpublished); otherwise they stay in the tooltip.
      if (fab.note && fab.verdict !== 'ok') cell.append(make('small', fab.note, { className: 'mfg-note' }));
      tr.append(cell);
    }
    return tr;
  }));
  const summary = Object.entries(capabilities.fabs).map(([id, fab]) => {
    const own = rows.map(row => ({ row, f: row.fabs.find(x => x.fab === id) }));
    const below = own.filter(x => x.f.verdict === 'below'), tight = own.filter(x => x.f.verdict === 'tight');
    return `${fab.name}: ${below.length ? `${below.length} below the published minimum (${below.map(x => x.row.label.toLowerCase()).join(', ')})` : 'every measured feature clears the published minimums'}${tight.length ? `; ${tight.length} within 10 % (${tight.map(x => x.row.label.toLowerCase()).join(', ')})` : ''}.`;
  });
  document.getElementById('mfg-summary').textContent = `${summary.join(' ')} Published limits only: not a DFM review, a quote or an approval.`;
  const method = document.getElementById('mfg-method');
  method.replaceChildren(
    make('p', `Maker pages read on ${capabilities.accessed}. Where a maker publishes two values for one limit, the stricter is used and the cell's note says so.`, { className: 'muted' }),
    ...Object.values(capabilities.fabs).map(fab => { const p = make('p', `${fab.name} (${fab.process}): `); fab.sources.forEach((url, i) => { if (i) p.append(', '); p.append(make('a', url.replace(/^https:\/\//, ''), { href: url })); }); return p; }),
    make('p', methodNote(measures), { className: 'muted' }));
}

/** What the table was measured from; says plainly what is left out. */
export function methodNote(measures) {
  const pours = measures?.pours, silk = measures?.silkscreen;
  return [
    'Measured from board.json: tracks and arcs, vias, pad copper and drills, and the board outline. Clearance is KiCad DRC\'s measured minimum.',
    pours ? `Copper pours are included in the edge and hole distances, measured from the ${pours.filledPolygons} filled copper areas saved in the board file (hole edge to filled copper, for via and plated pad holes on other nets); a fill that is out of date in KiCad is measured as saved.` : 'Copper pours are not included in the edge and hole distances.',
    'The mask strip is the gap between neighbouring pad edges of one part, before any mask expansion.',
    silk ? 'Silkscreen line width covers graphic lines and text strokes as set in KiCad (filled shapes are not lines); text height is KiCad\'s text size for visible silkscreen text.' : 'Silkscreen is not measured.',
  ].join(' ');
}

export function renderStatistics(container, stats, metadata) {
  container.replaceChildren();
  for (const [label, value] of statisticsRows(stats, metadata)) {
    const card = make('div', ''); card.className = 'stat-card'; card.append(make('dt', label), make('dd', String(value))); container.append(card);
  }
  const table = document.getElementById('drill-table-body'); table.replaceChildren();
  for (const hole of stats.drill_holes) { const row = document.createElement('tr'); for (const value of [hole.count, hole.source, hole.shape, `${num(hole.x_size)} × ${num(hole.y_size)} mm`, hole.plated ? 'Plated' : 'Non-plated', `${hole.start_layer} → ${hole.stop_layer}`]) row.append(make('td', String(value))); table.append(row); }
}
