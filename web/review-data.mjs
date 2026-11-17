export async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url} (${response.status})`);
  return response.json();
}
export const catalogPromise = json('review/catalog.json');
const cache = new Map();
export function loadVersion(version) {
  if (!cache.has(version.id)) cache.set(version.id, Promise.all([
    json(`review/${version.metadata}`), json(`review/${version.statistics}`)
  ]).then(([board, statistics]) => ({ version, board, statistics })));
  return cache.get(version.id);
}
