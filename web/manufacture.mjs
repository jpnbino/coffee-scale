// Build & manufacture: what is ready to order (bare and assembled), the parts
// list grouped as a buyer reads it, and the assembly blockers grouped by reason.
import { selectedPromise, artifactUrl } from './revision.mjs';
import { json } from './review-data.mjs';
import { orderChecks } from './stackup-model.mjs';
import { groupBom, groupBlockers, readiness } from './readiness-model.mjs';
import { measure, compare } from './manufacturability.mjs';

const el = (tag, text, props = {}) => Object.assign(document.createElement(tag), props, text === undefined ? {} : { textContent: text });
const STATE = { ok: ['✓', 'Agrees'], todo: ['!', 'To do'], pending: ['–', 'Not checked'] };
const data = window.releaseData;
const version = await selectedPromise;
const root = document.getElementById('order-readiness');

function checklist(title, lead, items, state) {
  const card = el('div', undefined, { className: `readiness-card state-${state}` });
  const head = el('div', undefined, { className: 'readiness-head' });
  head.append(el('h3', title), el('span', { ok: 'Files agree', todo: 'Not ready', pending: 'Partly checked' }[state], { className: 'readiness-chip' }));
  card.append(head, el('p', lead, { className: 'muted' }));
  const list = el('ul', undefined, { className: 'readiness-list' });
  for (const item of items) {
    const row = el('li', undefined, { className: `state-${item.state}` });
    row.append(el('span', STATE[item.state][0], { className: 'readiness-mark', title: STATE[item.state][1] }), el('span', item.text));
    if (item.link) row.append(el('a', item.link[0], { href: item.link[1] }));
    list.append(row);
  }
  card.append(list);
  return card;
}

if (version.id !== 'current') {
  document.getElementById('parts').replaceChildren(el('h2', 'Parts and assembly records'), el('p', 'Parts lists and assembly checks are recorded for the current build only. This snapshot\'s source package is under Release downloads; current-build data is not substituted.'));
} else {
  const [stackup, board, check] = await Promise.all([
    fetch(artifactUrl(version, 'stackup'), { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    version.metadata ? json(`review/${version.metadata}`).catch(() => null) : null,
    version.fabCheck ? json(`review/${version.fabCheck}`).catch(() => null) : null,
  ]);
  const order = stackup && data.manufacturing ? orderChecks(stackup, data.manufacturing, board?.bounds ?? null) : null;
  const statistics = version.statistics ? await json(`review/${version.statistics}`).catch(() => null) : null;
  const manufacturability = board && data.fabCapabilities ? compare(measure(board, statistics), data.fabCapabilities) : null;
  const result = readiness({ validation: version.validation, order, parts: data.parts, assembly: data.assembly, check, manufacturability });
  const cards = el('div', undefined, { className: 'readiness-grid' });
  cards.append(
    checklist('Bare boards', 'Ordering the PCB alone and fitting the parts yourself.', result.bare, result.bareState),
    checklist('Assembled boards', 'Ordering the board with the factory fitting the surface-mount parts.', result.assembled, result.assembledState));
  root.replaceChildren(cards);
  if (result.hand.length) {
    const hand = el('p', undefined, { className: 'muted readiness-hand' });
    hand.append(el('strong', 'Always fitted by hand: '), document.createTextNode(result.hand.map(part => `${part.ref} (${part.note || part.value})`).join('; ') + '.'));
    root.append(hand);
  }
  root.append(el('p', '“Agrees” means the release\'s own records are consistent. It is not a supplier review, a quote or a physical test.', { className: 'muted' }));

  const groups = groupBom(data.parts), body = document.getElementById('parts-body');
  const factory = data.parts.filter(part => part.Stage === 'factory').length;
  document.getElementById('assembly-status').textContent = data.assembly.ready
    ? 'Assembly profile reviewed for this board checksum.'
    : `Draft: ${data.parts.length} board features in ${groups.length} lines, ${factory} placed by the factory. Not approved for an assembly order.`;
  const render = (query = '') => {
    const q = query.trim().toLowerCase();
    const shown = groups.filter(group => !q || [group.refs.join(' '), group.value, group.footprint, group.stage, group.mpn, group.supplierPart, group.side].join(' ').toLowerCase().includes(q));
    body.replaceChildren(...shown.map(group => {
      const row = el('tr');
      const part = [group.manufacturer, group.mpn].filter(Boolean).join(' ') || (group.stage === 'factory' ? 'Not chosen' : '—');
      const status = group.verified ? 'Reviewed' : group.stage === 'factory' ? 'Needs review' : group.notes[0] ?? '—';
      for (const [value, cls] of [[group.qty, 'qty'], [group.refs.join(', '), 'refs'], [group.value], [group.footprint, 'fp'], [group.side], [group.stage], [part, group.mpn ? '' : 'missing'], [status, group.verified ? '' : 'missing']]) row.append(el('td', String(value), cls ? { className: cls } : {}));
      return row;
    }));
    document.getElementById('parts-count').textContent = `${shown.length} of ${groups.length} lines · ${shown.reduce((n, g) => n + g.qty, 0)} of ${data.parts.length} board features. Mounting holes and integral pads are listed but not bought.`;
  };
  render();
  document.getElementById('parts-search').addEventListener('input', event => render(event.target.value));

  const blockers = groupBlockers(data.assembly.blockers);
  document.getElementById('blockers-summary').textContent = `Assembly blockers · ${data.assembly.blockers.length} open, in ${blockers.length} groups`;
  document.getElementById('assembly-blockers').replaceChildren(...blockers.map(group => {
    const item = el('li'); item.append(el('strong', group.refs.length ? `${group.reason} · ${group.refs.length} parts` : group.reason)); if (group.refs.length) item.append(el('span', group.refs.join(', ')));
    return item;
  }));
}
