// Project 3D models: the STEP twin of every VRML model the board uses must be
// coloured, because STEP/GLB exports (and the portal's 3D view) use the STEP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorStep, stepEntities, vrmlShapes } from '../tools/color-step-models.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const board = readFileSync(join(root, 'src/pico_scale_controller.kicad_pcb'), 'utf8');
const projectModels = [...new Set([...board.matchAll(/\(model "\$\{KIPRJMOD\}\/models\/([^"]+)\.wrl"/g)].map(match => match[1]))];

test('board references project VRML models', () => assert.ok(projectModels.length >= 1));

for (const name of projectModels) {
  test(`STEP twin of ${name} carries one colour per solid, matching the VRML`, () => {
    const stepPath = join(root, 'src/models', `${name}.step`);
    assert.ok(existsSync(stepPath), `${name}.step is missing; STEP/GLB exports would drop this part`);
    const { entities } = stepEntities(readFileSync(stepPath, 'utf8'));
    const bodies = [...entities.values()];
    const solids = bodies.filter(body => /^MANIFOLD_SOLID_BREP\s*\(/.test(body)).length;
    const colours = bodies.filter(body => /^COLOUR_RGB\s*\(/.test(body)).map(body => body.match(/COLOUR_RGB\('[^']*',([^)]*)\)/)[1].split(',').map(Number));
    assert.equal(bodies.filter(body => /^STYLED_ITEM\s*\(/.test(body)).length, solids);
    assert.deepEqual(colours, vrmlShapes(readFileSync(join(root, 'src/models', `${name}.wrl`), 'utf8')).map(shape => shape.color));
  });
}

test('colouring refuses a STEP that is already coloured', () => {
  const name = projectModels[0];
  assert.throws(() => colorStep(readFileSync(join(root, 'src/models', `${name}.step`), 'utf8'), readFileSync(join(root, 'src/models', `${name}.wrl`), 'utf8')), /already/);
});
