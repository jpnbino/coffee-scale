import { loadVersion } from './review-data.mjs';
import { renderStatistics, renderManufacturability } from './statistics.mjs';
import { measure, compare } from './manufacturability.mjs';
import { selectedPromise } from './revision.mjs';
const grid = document.getElementById('board-statistics');
try {
  const current = await loadVersion(await selectedPromise);
  renderStatistics(grid, current.statistics, current.board);
  const capabilities = window.releaseData?.fabCapabilities;
  if (capabilities) renderManufacturability(compare(measure(current.board, current.statistics), capabilities), capabilities);
  else document.getElementById('mfg-body').replaceChildren(Object.assign(document.createElement('tr'), { textContent: 'Maker limits are not in this build.' }));
} catch (error) {
  grid.textContent = `Detailed statistics unavailable: ${error.message}`;
}
