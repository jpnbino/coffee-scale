// Copy per-solid colours from a project VRML model (.wrl) into its STEP twin.
//
// KiCad's 3D viewer draws the .wrl model, but STEP/GLB exports substitute the
// .step model of the same name. The project's FreeCAD-generated STEP files
// carried no colour, so the portal's 3D view showed them plain white/grey.
//
//   node tools/color-step-models.mjs src/models/OLED_096_photo_reference.step [...]
//
// Geometry is not touched: only AP214 presentation entities (STYLED_ITEM and
// its colour chain) are appended. Each VRML shape is matched to the STEP solid
// in the same position, and the match is verified by bounding box.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const VRML_UNIT_MM = 2.54; // KiCad VRML units are 0.1 inch

/** Per-shape diffuse colour and bounding box (mm) from a KiCad VRML file. */
export function vrmlShapes(text) {
  return [...text.matchAll(/Shape\s*\{\s*appearance[\s\S]*?diffuseColor\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)[\s\S]*?point\s*\[([^\]]*)\]/g)].map(match => {
    const values = match[4].trim().split(/[\s,]+/).map(Number);
    const box = emptyBox();
    for (let i = 0; i + 2 < values.length; i += 3) include(box, values.slice(i, i + 3).map(v => v * VRML_UNIT_MM));
    return { color: match.slice(1, 4).map(Number), box };
  });
}

const emptyBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function include(box, point) { for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], point[i]); box.max[i] = Math.max(box.max[i], point[i]); } }

/** STEP DATA entities: Map<id, text> plus the DATA section's closing offset. */
export function stepEntities(text) {
  const data = text.indexOf('\nDATA;');
  const end = text.indexOf('\nENDSEC;', data);
  if (data < 0 || end < 0) throw new Error('STEP file has no DATA section');
  const entities = new Map();
  for (const [, id, body] of text.slice(data, end + 1).matchAll(/#(\d+)\s*=\s*([\s\S]*?);\s*(?=#\d+\s*=|$)/g)) entities.set(Number(id), body);
  return { entities, end };
}

const refs = body => [...body.matchAll(/#(\d+)/g)].map(match => Number(match[1]));

/** Bounding box (mm) of the vertices reachable from one solid. */
function solidBox(entities, solid) {
  const box = emptyBox(); const seen = new Set(); const stack = [solid];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const body = entities.get(id) ?? '';
    const vertex = body.match(/^VERTEX_POINT\s*\(\s*'[^']*'\s*,\s*#(\d+)/);
    if (vertex) {
      const point = (entities.get(Number(vertex[1])) ?? '').match(/CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(([^)]*)\)/);
      if (point) include(box, point[1].split(',').map(Number));
      continue;
    }
    stack.push(...refs(body));
  }
  return box;
}

const inside = (inner, outer, tolerance) => [0, 1, 2].every(i => inner.min[i] >= outer.min[i] - tolerance && inner.max[i] <= outer.max[i] + tolerance);
const format = value => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/** Return STEP text with one colour per solid, taken from the matching VRML shapes. */
export function colorStep(stepText, vrmlText, { tolerance = 0.1 } = {}) {
  const { entities, end } = stepEntities(stepText);
  if ([...entities.values()].some(body => /^STYLED_ITEM\s*\(/.test(body))) throw new Error('STEP already has styled (coloured) items');
  const solids = [...entities].filter(([, body]) => /^MANIFOLD_SOLID_BREP\s*\(/.test(body)).map(([id]) => id);
  const shapes = vrmlShapes(vrmlText);
  if (!solids.length || solids.length !== shapes.length) throw new Error(`STEP has ${solids.length} solids but VRML has ${shapes.length} shapes`);
  solids.forEach((solid, index) => {
    if (!inside(solidBox(entities, solid), shapes[index].box, tolerance)) throw new Error(`STEP solid #${solid} does not match VRML shape ${index + 1} by position`);
  });
  const representation = [...entities.values()].find(body => /^(ADVANCED_BREP_)?SHAPE_REPRESENTATION\s*\(/.test(body) && solids.every(id => refs(body).includes(id)));
  if (!representation) throw new Error('No shape representation lists all solids');
  const context = refs(representation).at(-1);

  let next = Math.max(...entities.keys()) + 1;
  const lines = []; const styled = [];
  const add = body => { const id = next++; lines.push(`#${id} = ${body};`); return id; };
  solids.forEach((solid, index) => {
    const [r, g, b] = shapes[index].color;
    const colour = add(`COLOUR_RGB('',${format(r)},${format(g)},${format(b)})`);
    const fillColour = add(`FILL_AREA_STYLE_COLOUR('',#${colour})`);
    const fill = add(`FILL_AREA_STYLE('',(#${fillColour}))`);
    const surfaceFill = add(`SURFACE_STYLE_FILL_AREA(#${fill})`);
    const side = add(`SURFACE_SIDE_STYLE('',(#${surfaceFill}))`);
    const usage = add(`SURFACE_STYLE_USAGE(.BOTH.,#${side})`);
    const assignment = add(`PRESENTATION_STYLE_ASSIGNMENT((#${usage}))`);
    styled.push(add(`STYLED_ITEM('color',(#${assignment}),#${solid})`));
  });
  add(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.map(id => `#${id}`).join(',')}),#${context})`);
  return stepText.slice(0, end + 1) + lines.join('\n') + '\n' + stepText.slice(end + 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node tools/color-step-models.mjs <model.step> [...]'); process.exitCode = 1; }
  for (const step of files) {
    try {
      const vrml = step.replace(/\.(step|stp)$/i, '.wrl');
      writeFileSync(step, colorStep(readFileSync(step, 'utf8'), readFileSync(vrml, 'utf8')));
      console.log(`Coloured ${step} from ${vrml}`);
    } catch (error) { console.error(`FAIL ${step}: ${error.message}`); process.exitCode = 1; }
  }
}
