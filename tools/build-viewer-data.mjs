import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSexpr, child, children, atom } from './kicad-sexpr.mjs';
import { boardData } from './board-data.mjs';
import { schematicNets } from './schematic-nets.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function stackupData(source) {
  const board = parseSexpr(source), stack = child(child(board, 'setup'), 'stackup');
  if (!stack) throw new Error('No explicit KiCad stackup: cannot infer a manufacturing stack');
  return { sourceSha256: sha(source), status: 'Design intent — supplier approval not recorded',
    boardThicknessMm: Number(atom(child(board, 'general'), 'thickness')),
    finish: atom(stack, 'copper_finish'), dielectricConstraints: atom(stack, 'dielectric_constraints'),
    layers: children(stack, 'layer').map(layer => ({name:layer[1], type:atom(layer,'type'),
      thicknessMm: child(layer,'thickness') ? Number(atom(layer,'thickness')) : null,
      material:atom(layer,'material'), color:atom(layer,'color'), epsilonR:atom(layer,'epsilon_r'), lossTangent:atom(layer,'loss_tangent')})) };
}
/**
 * KiCad 10 boards name nets inline (`(net "/GND")`) and no longer carry the
 * numbered net table that KiCanvas reads, so it finds no nets. For the
 * viewer-only copy, number every net in order of first use, rewrite each
 * reference as `(net N "name")` and declare the table before the footprints.
 * Quoted text and comments are never rewritten. Boards that already have a
 * numbered table are returned unchanged.
 */
export function numberViewerNets(source) {
  const empty = { content: source, nets: [], references: 0 };
  if (/^\s*\(net \d+ "/m.test(source)) return empty;
  const names = ['']; const index = new Map([['', 0]]); let references = 0;
  const content = source.replace(/"(?:\\.|[^"\\])*"|;[^\n]*|\(net "((?:\\.|[^"\\])*)"\)/g, (token, raw) => {
    if (raw === undefined) return token;
    const name = JSON.parse(`"${raw}"`);
    if (!index.has(name)) { index.set(name, names.length); names.push(name); }
    references++;
    return `(net ${index.get(name)} "${raw}")`;
  });
  if (!references) return empty;
  const anchor = content.search(/\n[ \t]*\(footprint /);
  if (anchor < 0) throw new Error('Cannot place the viewer net table: the board has no footprints');
  const indent = content.slice(anchor + 1).match(/^[ \t]*/)[0];
  const table = names.map((name, i) => `${indent}(net ${i} ${JSON.stringify(name)})`).join('\n');
  return { content: content.slice(0, anchor + 1) + table + '\n' + content.slice(anchor + 1), nets: names.slice(1), references };
}

export function normalizeViewerNumbers(source) {
  let replacements = 0;
  const content = source.replace(/"(?:\\.|[^"\\])*"|;[^\n]*|[^\s()";]+/g, token => {
    if (!/^[+-]?\.\d+(?:e[+-]?\d+)?$/i.test(token)) return token;
    replacements++; return token.replace('.', '0.');
  });
  return { content, replacements };
}
export function materialMap(bytes) {
  if (bytes.toString('ascii',0,4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw new Error('Expected GLB v2');
  const gltf = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const names = suffix => [...new Set(gltf.meshes.filter(mesh=>mesh.name?.endsWith(suffix)).flatMap(mesh=>mesh.primitives.map(p=>p.material)))].map(index=>gltf.materials[index]?.name).filter(Boolean);
  return { soldermask:names('_soldermask'), silkscreen:names('_silkscreen'), sourceSha256:sha(bytes) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [site,pcb,sch] = process.argv.slice(2);
  const source = await readFile(sch,'utf8'), normalized = normalizeViewerNumbers(source);
  await mkdir(join(site,'native'), {recursive:true});
  await writeFile(join(site,'native/schematic.kicad_sch'), normalized.content);
  const boardSource = await readFile(pcb,'utf8'), boardNumbers = normalizeViewerNumbers(boardSource), boardNets = numberViewerNets(boardNumbers.content);
  await writeFile(join(site,'native/board.kicad_pcb'), boardNets.content);
  await writeFile(join(site,'native/provenance.json'), JSON.stringify({sourceSha256:sha(source), viewerSha256:sha(normalized.content), numericTokensNormalized:normalized.replacements, purpose:'Viewer-only numeric spelling compatibility. Original schematic is unchanged.',
    board:{sourceSha256:sha(boardSource), viewerSha256:sha(boardNets.content), numericTokensNormalized:boardNumbers.replacements, netsNumbered:boardNets.nets.length, netReferencesRewritten:boardNets.references, purpose:'Viewer-only copy: KiCad 10 inline net names given a numbered net table so the browser viewer can highlight nets. Original board is unchanged.'}},null,2));
  const nets = schematicNets(source, boardData(boardSource));
  await writeFile(join(site,'native/schematic-nets.json'), JSON.stringify(nets));
  await writeFile(join(site,'stackup.json'), JSON.stringify(stackupData(boardSource),null,2));
  await writeFile(join(site,'model-materials.json'), JSON.stringify(materialMap(await readFile(join(site,'board.glb'))),null,2));
}
