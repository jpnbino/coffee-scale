import { loadVersion } from './review-data.mjs';
import { renderStatistics } from './statistics.mjs';
import { selectedPromise } from './revision.mjs';
try {
  const current = await loadVersion(await selectedPromise);
  renderStatistics(document.getElementById('board-statistics'), current.statistics, current.board);
  document.getElementById('statistics-version').textContent = current.version.label;
} catch (error) {
  document.getElementById('statistics-version').textContent = `Detailed statistics unavailable: ${error.message}`;
}
