import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSexpr, child, children, atom } from './kicad-sexpr.mjs';
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
  await writeFile(join(site,'native/provenance.json'), JSON.stringify({sourceSha256:sha(source), viewerSha256:sha(normalized.content), numericTokensNormalized:normalized.replacements, purpose:'Viewer-only numeric spelling compatibility. Original schematic is unchanged.'},null,2));
  await writeFile(join(site,'stackup.json'), JSON.stringify(stackupData(await readFile(pcb,'utf8')),null,2));
  await writeFile(join(site,'model-materials.json'), JSON.stringify(materialMap(await readFile(join(site,'board.glb'))),null,2));
}
