// Assembly staging, candidate placements and readiness (formerly Build-Assembly.ps1).
import { readFileSync } from 'node:fs';
import { resolveChildPath, writeJson } from './lib/common.mjs';
import { ipcComponents, readCsv, writeCsv } from './lib/formats.mjs';

const STAGES = ['factory', 'manual', 'mechanical', 'wire-pad', 'dnp'];
const byKey = key => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

export function buildAssembly({ root, output, config, boardHash }) {
  const components = ipcComponents(readFileSync(`${output}/assembly/board.ipc2581.xml`, 'utf8'));
  if (!components.length) throw new Error('IPC-2581 contains no components; assembly cannot be generated.');
  const bom = new Map(readCsv(`${output}/assembly/bom-native.csv`).map(row => [row.Reference, row]));
  const positions = new Map(readCsv(`${output}/assembly/positions-native.csv`).map(row => [row.Ref, row]));
  const profile = new Map();
  for (const row of readCsv(resolveChildPath(root, config.assembly.profile))) {
    if (profile.has(row.Reference)) throw new Error(`Duplicate assembly profile reference: ${row.Reference}`);
    if (!STAGES.includes(row.Stage)) throw new Error(`Unknown assembly stage for ${row.Reference}`);
    profile.set(row.Reference, row);
  }
  const boardRefs = new Set(components.map(component => component.attributes.refDes));
  for (const ref of profile.keys()) if (!boardRefs.has(ref)) throw new Error(`Assembly profile contains absent reference: ${ref}`);

  const rows = []; const candidate = []; const issues = [];
  for (const { attributes } of components) {
    const ref = attributes.refDes; const item = bom.get(ref); const override = profile.get(ref); const position = positions.get(ref);
    let stage = override ? override.Stage : 'factory';
    if (item && ['1', 'true', 'yes'].includes(String(item.DNP).toLowerCase())) stage = 'dnp';
    const maker = override?.Manufacturer || item?.Manufacturer || '';
    const mpn = override?.MPN || item?.MPN || '';
    const verified = override?.Verified?.toLowerCase() === 'true';
    rows.push({
      Reference: ref, Value: item ? item.Value : (attributes.part ?? ''), Footprint: item ? item.Footprint : (attributes.packageRef ?? ''),
      Quantity: 1, Stage: stage, Manufacturer: maker, MPN: mpn, Verified: verified ? 'True' : 'False',
      Side: attributes.layerRef === 'B.Cu' ? 'bottom' : 'top', Notes: override ? override.Notes : 'Needs part selection and assembly review',
      Supplier: override?.Supplier ?? '', SupplierPart: override?.SupplierPart ?? '',
    });
    if (stage !== 'factory') continue;
    if (!maker || !mpn) issues.push(`${ref}: manufacturer/MPN missing`);
    if (!verified) issues.push(`${ref}: part and placement not reviewed`);
    if (!position) { issues.push(`${ref}: native placement missing; manual review required`); continue; }
    const offset = override?.RotationOffsetDeg ? Number(override.RotationOffsetDeg) : 0;
    const rotation = (((Number(position.Rot) + offset) % 360) + 360) % 360;
    if (!Number.isFinite(rotation)) throw new Error(`Invalid rotation for ${ref}`);
    candidate.push({ Designator: ref, 'Mid X': position.PosX, 'Mid Y': position.PosY, Layer: position.Side === 'top' ? 'Top' : 'Bottom', Rotation: String(Number(rotation.toFixed(6))) });
  }
  if (config.assembly.placementReviewBoardSha256 !== boardHash) issues.push('Placement review is not approved for this exact board checksum.');
  writeCsv(`${output}/assembly/bom-with-stages.csv`, rows.sort(byKey('Reference')));
  writeCsv(`${output}/assembly/jlcpcb-cpl-CANDIDATE.csv`, candidate.sort(byKey('Designator')), ['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation']);
  const readiness = {
    ready: issues.length === 0, target: config.assembly.target, factoryParts: candidate.length, totalBoardFeatures: rows.length,
    blockers: issues, boardSha256: boardHash, nativePlacementConvention: 'KiCad absolute X/Y-up millimetres; origins/rotations require supplier verification',
  };
  writeJson(`${output}/assembly/readiness.json`, readiness);
  console.log(`Assembly: ${candidate.length} candidate placements; ${issues.length} readiness blockers.`);
  return readiness;
}
