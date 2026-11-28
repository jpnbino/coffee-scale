// Keep links to the original single-page reference useful.
import { selectedPromise } from './revision.mjs';
import { revisionUrl } from './revision-core.mjs';
const legacy = { overview:'index', inspect:'explore', statistics:'statistics', compare:'versions', gerbers:'gerbers', parts:'manufacture', mechanical:'mechanical', documentation:'documentation', downloads:'manufacture' };
const anchor = location.hash.slice(1);
if (location.pathname.endsWith('/') || location.pathname.endsWith('/index.html')) {
  const page = legacy[anchor] ?? (/^doc-[\w-]+$/.test(anchor) ? anchor : null);
  if (page && page !== 'index') location.replace(`${page}.html${location.search}${location.hash}`);
}
const input = document.getElementById('portal-search'), results = document.getElementById('search-results');
let indexPromise;
input.addEventListener('input', async () => {
  const query = input.value.trim().toLowerCase(); results.replaceChildren();
  if (!query) return;
  try {
    indexPromise ??= fetch('search-index.json', { cache: 'no-cache' }).then(response => { if (!response.ok) throw new Error('Search unavailable'); return response.json(); });
    const index = await indexPromise,version=await selectedPromise;
    if (input.value.trim().toLowerCase() !== query) return;
    const matches = index.filter(page => (version.id==='current'||!page.url.startsWith('doc-')) && `${page.title} ${page.text}`.toLowerCase().includes(query));
    results.textContent = `${matches.length} matching pages`;
    for (const page of matches.slice(0, 10)) {
      const link = document.createElement('a'); link.href = revisionUrl(page.url,version.id,location.href); link.textContent = page.title; results.append(link);
    }
  } catch { results.textContent = 'Search unavailable. Use the resource links below.'; indexPromise = undefined; }
});

// Phone layout: the sidebar folds into a menu button.
const rail = document.querySelector('.rail'), menu = document.querySelector('.rail-menu');
menu?.addEventListener('click', () => { const open = !rail.classList.contains('open'); rail.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); menu.textContent = open ? 'Close' : 'Menu'; });
