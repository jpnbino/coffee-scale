import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSexpr } from "../tools/kicad-sexpr.mjs";
import { boardData } from "../tools/board-data.mjs";
import { diffSegments,diffComponents,diffVias,compareBoards } from "../web/review-core.mjs";
import { renderGerber } from "../tools/render-gerbers.mjs";
const segment=(start,end,extra={})=>({start,end,width:.2,layer:"F.Cu",net:"/GND",...extra});
test("quoted parentheses, escaped quotes and scientific notation parse",()=>{assert.deepEqual(parseSexpr('(root (name "a (b) \\"c\\"") (at 1e-6 -2))'.replaceAll('\\\\','\\')),['root',['name','a (b) "c"'],['at','1e-6','-2']]);});
test("malformed input is rejected",()=>{assert.throws(()=>parseSexpr('(root "unfinished)'));assert.throws(()=>parseSexpr('(root))'));});
test("reversing track endpoints is not a change",()=>{assert.deepEqual(diffSegments([segment([1,2],[3,4])],[segment([3,4],[1,2])]),{added:[],removed:[]});});
test("splitting and merging collinear copper is not a change",()=>{assert.deepEqual(diffSegments([segment([0,0],[10,10])],[segment([0,0],[4,4]),segment([10,10],[4,4])]),{added:[],removed:[]});});
test("overlapping collinear tracks are unioned",()=>{assert.deepEqual(diffSegments([segment([0,0],[8,0]),segment([4,0],[10,0])],[segment([0,0],[10,0])]),{added:[],removed:[]});});
test("only an added extension is highlighted",()=>{const d=diffSegments([segment([0,0],[10,0])],[segment([0,0],[12,0])]);assert.equal(d.removed.length,0);assert.deepEqual(d.added[0].start,[10,0]);assert.deepEqual(d.added[0].end,[12,0]);});
test("track width and net reassignment remain meaningful changes",()=>{for(const extra of [{width:.4},{net:'/3V3'},{layer:'B.Cu'}]){const d=diffSegments([segment([0,0],[10,0])],[segment([0,0],[10,0],extra)]);assert.equal(d.added.length,1);assert.equal(d.removed.length,1);}});
test("negative coordinates and non-45-degree lines preserve endpoints",()=>{const d=diffSegments([],[segment([-2.25,-5.125],[3.75,7.875])]);assert.deepEqual(d.added[0].start,[-2.25,-5.125]);assert.deepEqual(d.added[0].end,[3.75,7.875]);});
test("component IDs survive renaming; reference fallback survives regenerated IDs",()=>{const a={id:'a',ref:'R1',x:1,y:2,rotation:0,padSignature:[]};const moved=diffComponents([a],[{...a,ref:'R2',x:3}]);assert.deepEqual(moved.modified[0].changes,['ref','x']);assert.equal(diffComponents([a],[{...a,id:'new'}]).modified.length,0);});
test("via drill and type changes are highlighted",()=>{const v={at:[1,2],diameter:.6,drill:.3,layers:['F.Cu','B.Cu'],type:'through',net:'/GND'};const d=diffVias([v],[{...v,drill:.2,type:'micro'}]);assert.equal(d.modified.length,1);assert.equal(d.added.length,0);});
test("actual D/E metadata has expected counts and differs",()=>{const d=boardData(readFileSync('src/concept-revD/pico_scale_controller.kicad_pcb','utf8')),e=boardData(readFileSync('src/pico_scale_controller.kicad_pcb','utf8'));assert.equal(d.vias.length,176);assert.equal(e.vias.length,165);assert.equal(e.components.length,68);const comparison=compareBoards(d,e);assert.ok(comparison.components.modified.length>0);assert.ok(comparison.tracks.added.length>0);assert.equal(compareBoards(e,e).tracks.added.length,0);});
const header='%FSLAX46Y46*%\n%MOMM*%\n%ADD10C,1.000*%\nD10*\n';
test("Gerber pad bounds use declared metric coordinates",async()=>{const result=await renderGerber(header+'X1000000Y-2000000D03*\nM02*');assert.equal(result.units,'mm');assert.deepEqual(result.viewBox,[500,-2500,1000,1000]);});
test("Gerber clear polarity is rendered as masking",async()=>{const result=await renderGerber(header+'X1000000Y1000000D03*\n%LPC*%\nX1100000Y1000000D03*\nM02*');assert.match(result.svg,/<mask\b/);});
test("routed Excellon slots retain tool width and endpoints",async()=>{const result=await renderGerber('M48\nMETRIC\nT1C0.600\n%\nT1\nG00X1.0Y-1.0\nM15\nG01X3.0Y-1.0\nM16\nM30\n','slot',{filetype:'drill',units:'mm',zero:'L'});assert.equal(result.units,'mm');assert.deepEqual(result.viewBox,[700,-1300,2600,600]);});
test("actual Rev E drill renders retain plated round holes and all NPTH features",async()=>{
  const board=boardData(readFileSync('src/pico_scale_controller.kicad_pcb','utf8'));
  const pads=board.components.flatMap(c=>c.pads),round=pads.filter(p=>p.type==='thru_hole'&&p.drill.length===1).length+board.vias.length;
  const npth=pads.filter(p=>p.type==='np_thru_hole').length;
  for(const [name,expected]of [['PTH',round],['NPTH',npth]]){
    const source=readFileSync(`src/fabrication/revE/gerbers/pico_scale_controller-${name}.drl`,'utf8');
    const result=await renderGerber(source,name,{filetype:'drill',units:'mm',zero:'L'});
    assert.equal((result.svg.match(/<use\b/g)??[]).length,expected);
    assert.equal(result.warnings.length,0);
  }
});
