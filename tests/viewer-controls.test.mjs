import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stackupData,normalizeViewerNumbers,materialMap } from '../tools/build-viewer-data.mjs';
import { parseSexpr } from '../tools/kicad-sexpr.mjs';
import { dimensions } from '../web/ruler.mjs';
import { attachViewport } from '../web/review-draw.mjs';
const root=new URL('../',import.meta.url);
test('Real stackup retains material provenance and nominal thickness',async()=>{
  const stack=stackupData(await readFile(new URL('pico_scale_controller/pico_scale_controller.kicad_pcb',root),'utf8'));
  assert.equal(stack.layers.filter(layer=>layer.type==='copper').length,2);
  assert.equal(stack.layers.find(layer=>layer.material).thicknessMm,1.51);
  assert.ok(Math.abs(stack.layers.reduce((sum,layer)=>sum+(layer.thicknessMm??0),0)-stack.boardThicknessMm)<1e-9);
  assert.equal(stack.layers[0].thicknessMm,null);assert.equal(stack.finish,'ENIG');assert.match(stack.sourceSha256,/^[a-f0-9]{64}$/);
});
test('Compatibility conversion changes numeric tokens, never quoted text or comments',()=>{
  assert.deepEqual(normalizeViewerNumbers('(x .254 -.5 +.2 1.2 ".25") ; .4'),{content:'(x 0.254 -0.5 +0.2 1.2 ".25") ; .4',replacements:3});
});
test('Actual schematic compatibility conversion preserves parsed numeric meaning',async()=>{
  const source=await readFile(new URL('pico_scale_controller/pico_scale_controller.kicad_sch',root),'utf8');
  const normalized=normalizeViewerNumbers(source);assert.ok(normalized.replacements>0);
  const canonical=node=>Array.isArray(node)?node.map(canonical):/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(node)?Number(node):node;
  assert.deepEqual(canonical(parseSexpr(normalized.content)),canonical(parseSexpr(source)));
});
test('Ruler converts SVG micrometres to millimetres and retains axis signs',()=>{
  assert.deepEqual(dimensions({x:10000,y:20000},{x:13000,y:16000}),{dx:3,dy:-4,distance:5});
  assert.equal(dimensions({x:0,y:0},{x:90000,y:0}).distance,90);
});
test('Material map targets named board meshes rather than component colours',()=>{
  const json=Buffer.from(JSON.stringify({materials:[{name:'component'},{name:'mask'},{name:'silk'}],meshes:[{name:'resistor',primitives:[{material:0}]},{name:'board_soldermask',primitives:[{material:1}]},{name:'board_silkscreen',primitives:[{material:2}]}]}));
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(json.length,12);
  const result=materialMap(Buffer.concat([header,json]));assert.deepEqual(result.soldermask,['mask']);assert.deepEqual(result.silkscreen,['silk']);
});
test('Gerber zoom uses micrometre limits and measurement mode prevents pan',()=>{
  const events=new Map();let captured=false;
  const svg={setAttribute(){},addEventListener(name,callback){events.set(name,callback);},
    createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},
    getScreenCTM(){return {inverse(){return {};}};},setPointerCapture(){captured=true;}};
  const viewport=attachViewport([svg],undefined,{minWidth:100,maxWidth:1000000,canPan:()=>false});
  viewport.set([0,0,102000,62000]);events.get('wheel')({preventDefault(){},clientX:51000,clientY:31000,deltaY:-1});
  assert.ok(viewport.get()[2]<102000);assert.ok(viewport.get()[2]>80000);
  events.get('pointerdown')({button:0});assert.equal(captured,false);
});
