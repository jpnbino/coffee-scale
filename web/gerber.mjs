import { json } from "./review-data.mjs";
import { svgNode,attachViewport } from "./review-draw.mjs";
import { dimensions,drawRuler } from "./ruler.mjs";
import { selectedPromise,artifactUrl } from './revision.mjs';
import { stackRows,drawOrder,coreLabel } from "./layer-stack.mjs";
import { createFabOverlay } from "./fab-overlay.mjs";
const byId=id=>document.getElementById(id),svg=byId("gerber-canvas");
let sequence=0,bounds,measurement=[],measuring=false,previewPoint=null,layerControls=[],mirrorView=()=>{},orderLayers=()=>{};
const viewport=attachViewport([svg],()=>redrawRuler(),{minWidth:100,maxWidth:1000000,canPan:()=>!measuring});
const fab=createFabOverlay({svg,viewport,isMeasuring:()=>measuring,mirrored:()=>byId("gerber-mirror").checked});
// Layer presets for the checks made before ordering: each side as the assembler
// sees it (copper, mask openings, paste, silkscreen, outline, drills).
const PRESETS={top:{kinds:[".gtl",".gts",".gtp",".gto",".gm1",".drl"],mirror:false},bottom:{kinds:[".gbl",".gbs",".gbp",".gbo",".gm1",".drl"],mirror:true},copper:{kinds:[".gtl",".gbl",".gm1",".drl"],mirror:false},all:{kinds:null,mirror:false}};
let applyingPreset=false;
const presetButtons=[...document.querySelectorAll("[data-preset]")];
const pressPreset=name=>{for(const button of presetButtons)button.setAttribute("aria-pressed",String(button.dataset.preset===name));};
// Clicks identify only what can be seen: one copper side shown means only that
// side is hit-tested; with both shown the side facing the viewer comes first.
function updateSide(){
  const shown=kind=>layerControls.some(control=>control.kind===kind&&control.input.checked);
  const top=shown(".gtl"),bottom=shown(".gbl"),facing=byId("gerber-mirror").checked?"bottom":"top";
  fab.setSide(top&&!bottom?{only:"top"}:bottom&&!top?{only:"bottom"}:{prefer:facing});
}
for(const button of presetButtons){button.disabled=true;button.addEventListener("click",()=>{
  const preset=PRESETS[button.dataset.preset];applyingPreset=true;
  try{for(const {kind,input}of layerControls){if(input.disabled)continue;const on=!preset.kinds||preset.kinds.includes(kind);if(input.checked!==on){input.checked=on;input.dispatchEvent(new Event("change"));}}
    byId("gerber-mirror").checked=preset.mirror;mirrorView();showSide();}finally{applyingPreset=false;}
  pressPreset(button.dataset.preset);updateSide();
});}
// Collapsing the stack gives its width to the board (the SVG keeps its view and
// scales up). The choice is remembered per browser where storage is allowed.
{
  const workspace=byId("gerber-workspace"),toggle=byId("stack-toggle"),key="coffee-scale.gerber-stack-collapsed";
  const apply=collapsed=>{workspace?.classList.toggle("stack-collapsed",collapsed);toggle?.setAttribute("aria-expanded",String(!collapsed));if(toggle)toggle.title=collapsed?"Show the layer stack":"Hide the layer stack to give the board more room";};
  let stored=false;try{stored=localStorage.getItem(key)==="1";}catch{}
  apply(stored);
  toggle?.addEventListener("click",()=>{const collapsed=!workspace.classList.contains("stack-collapsed");apply(collapsed);try{localStorage.setItem(key,collapsed?"1":"0");}catch{}requestAnimationFrame(()=>redrawRuler());});
}
function redrawRuler(){drawRuler(svg,previewPoint&&measurement.length===1?[measurement[0],previewPoint]:measurement,viewport.get()[2]);}
const HINT="Scroll to zoom · drag to pan · click to identify";
function clearRuler(){measurement=[];previewPoint=null;redrawRuler();const chip=byId("gerber-measure-status");chip.hidden=true;chip.textContent="";byId("gerber-hint").textContent=measuring?"Click a start point, then an end point · Esc to stop measuring":HINT;}
function eventPoint(event){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function safeSvg(source){
  const parsed=new DOMParser().parseFromString(source,"image/svg+xml");
  if(parsed.querySelector("parsererror"))throw new Error("Malformed Gerber SVG");
  for(const element of parsed.querySelectorAll("*")){
    if(["script","foreignObject","image","iframe","style"].includes(element.localName))throw new Error("Unsafe SVG element");
    for(const attr of element.attributes){if(/^on/i.test(attr.name)||(/href$/.test(attr.name)&&!attr.value.startsWith("#"))||(/url\(/i.test(attr.value)&&!/url\(#[^)]+\)/.test(attr.value)))throw new Error("External or executable SVG reference rejected");}
  }
  return parsed.documentElement;
}
const colorFor=kind=>({".gtp":"#c3c9cf",".gbp":"#9fb0c4",".gtl":"#d8aa61",".gbl":"#708fc4",".gts":"#42917a",".gbs":"#718477",".gto":"#f4efe2",".gbo":"#ddbbcd",".gm1":"#faf8ef",".drl":"#e77372"}[kind]);
async function render(version){
  const ticket=++sequence;byId("gerber-hint").textContent="Loading the released Gerber files…";byId("gerber-alert").hidden=true;
  try{
    const url=`review/${version.gerbers}`,report=await json(url),base=url.slice(0,url.lastIndexOf("/")+1);
    const layers=await Promise.all(report.layers.map(async layer=>{
      if(!layer.available)return {...layer};
      const response=await fetch(base+layer.svg,{cache:'no-cache'});if(!response.ok)throw new Error(`Layer unavailable: ${layer.name}`);
      return {...layer,document:safeSvg(await response.text())};
    }));if(ticket!==sequence)return;
    svg.replaceChildren();byId("gerber-layers").replaceChildren();
    const group=svgNode("g");svg.append(group);const boxes=layers.filter(l=>l.available).map(l=>l.viewBox);
    if(!boxes.length)throw new Error("No renderable Gerber layers");
    const x=Math.min(...boxes.map(b=>b[0]))-1000,y=Math.min(...boxes.map(b=>b[1]))-1000;
    bounds=[x,y,Math.max(...boxes.map(b=>b[0]+b[2]))-x+1000,Math.max(...boxes.map(b=>b[1]+b[3]))-y+1000];viewport.set(bounds);
    const mirror=()=>{group.setAttribute("transform",byId("gerber-mirror").checked?`translate(${2*bounds[0]+bounds[2]},0) scale(-1,1)`:"");orderLayers();clearRuler();fab.redraw();};
    mirrorView=mirror;byId("gerber-mirror").onchange=()=>{mirror();showSide();pressPreset(null);updateSide();};layerControls=[];
    for(const button of presetButtons)button.disabled=true;pressPreset(null);
    const stack=byId("gerber-layers"),drawings=new Map();
    const stackup=await fetch(artifactUrl(version,"stackup"),{cache:"no-cache"}).then(r=>r.ok?r.json():null).catch(()=>null);if(ticket!==sequence)return;
    // Paint layers in physical order, nearest the viewer last; the check overlay stays on top.
    orderLayers=()=>{const fromBottom=byId("gerber-mirror").checked;for(const layer of drawOrder(layers.filter(l=>drawings.has(l)),fromBottom))group.append(drawings.get(layer));const overlay=group.querySelector('[data-layer="fab-check"]');if(overlay)group.append(overlay);const view=byId("stack-view");if(view)view.textContent=fromBottom?"Viewed from the bottom":"Viewed from the top";};
    const showOnly=target=>{applyingPreset=true;try{for(const control of layerControls){if(control.input.disabled)continue;const on=control.layer===target||control.kind===".gm1";if(control.input.checked!==on){control.input.checked=on;control.input.dispatchEvent(new Event("change"));}}}finally{applyingPreset=false;}pressPreset(null);updateSide();};
    const view=document.createElement("p");view.id="stack-view";view.className="stack-view";stack.append(view);
    for(const row of stackRows(layers)){
      if(row.type==="heading"){const h=document.createElement("p");h.className="stack-heading";h.textContent=row.label;stack.append(h);continue;}
      if(row.type==="core"){const c=document.createElement("p");c.className="stack-core";c.textContent=coreLabel(stackup);stack.append(c);continue;}
      const layer=row.layer,item=document.createElement("div"),label=document.createElement("label"),input=document.createElement("input"),swatch=document.createElement("span"),name=document.createElement("span");
      item.className="stack-row";item.title=layer.available?`${layer.label} · ${layer.name}`:`${layer.name}: ${layer.error}`;
      input.type="checkbox";input.disabled=!layer.available;input.checked=layer.available&&[".gtl",".gm1",".drl"].includes(layer.kind);
      swatch.className="stack-swatch";swatch.style.background=colorFor(layer.kind)??"#999";name.textContent=row.name;
      label.append(input,swatch,name);item.append(label);stack.append(item);layerControls.push({kind:layer.kind,input,layer});
      const only=document.createElement("button");only.type="button";only.className="stack-only";only.textContent="Only";only.disabled=!layer.available;only.setAttribute("aria-label",`Show only ${layer.label}`);only.addEventListener("click",()=>showOnly(layer));
      // Option/Alt-click a layer to show only it, as in other PCB viewers.
      label.addEventListener("click",event=>{if(event.altKey&&layer.available){event.preventDefault();showOnly(layer);}});
      const toggle=document.createElement("button"),opacity=document.createElement("input"),initial=/^\.g[tb]p$/.test(layer.kind)?70:100;
      toggle.type="button";toggle.className="stack-opacity";toggle.textContent=`${initial}%`;toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-label",`${layer.label} opacity ${initial}%`);toggle.disabled=!layer.available;
      opacity.type="range";opacity.min=0;opacity.max=100;opacity.value=initial;opacity.hidden=true;opacity.className="stack-slider";opacity.setAttribute("aria-label",`${layer.label} opacity`);
      toggle.addEventListener("click",()=>{opacity.hidden=!opacity.hidden;toggle.setAttribute("aria-expanded",String(!opacity.hidden));if(!opacity.hidden)opacity.focus();});
      item.append(only,toggle,opacity);
      if(!layer.document){item.classList.add("unavailable");continue;}
      const drawing=svgNode("g",{color:colorFor(layer.kind),"data-layer":layer.name,opacity:initial/100});drawings.set(layer,drawing);
      for(const child of layer.document.children)drawing.append(document.importNode(child,true));
      drawing.style.display=input.checked?"":"none";group.append(drawing);
      const sync=()=>{drawing.style.display=input.checked?"":"none";item.classList.toggle("off",!input.checked);};sync();
      input.addEventListener("change",()=>{sync();if(!applyingPreset){pressPreset(null);updateSide();}});
      opacity.addEventListener("input",()=>{drawing.setAttribute("opacity",Number(opacity.value)/100);toggle.textContent=`${opacity.value}%`;toggle.setAttribute("aria-label",`${layer.label} opacity ${opacity.value}%`);});
    }
    // Provenance sits below the board; only a failure or a real warning is raised above it.
    const warnings=layers.flatMap(l=>l.warnings??[]),review=warnings.filter(w=>w.category!=="metadata"),failed=layers.filter(l=>!l.available);
    byId("gerber-provenance").textContent=`Read from the released files: ${layers.length-failed.length} of ${layers.length} layers${review.length?`, ${review.length} warning${review.length>1?"s":""} to review`:", no warnings"} · checksums and parser notes`;
    const alert=byId("gerber-alert");alert.hidden=!(failed.length||review.length);
    alert.textContent=failed.length?`${failed.length} layer${failed.length>1?"s":""} could not be drawn: ${failed.map(l=>l.name).join(", ")}. See the notes below the board.`:review.length?`The Gerber reader reported ${review.length} warning${review.length>1?"s":""} that need review. See the notes below the board.`:"";
    byId("gerber-hint").textContent=HINT;
    byId("gerber-warning-detail").replaceChildren();
    for(const layer of layers){const p=document.createElement("p");p.textContent=`${layer.name}: ${layer.available?`${layer.warnings.length} parser notices (${layer.warnings.filter(w=>w.category==="metadata").length} ignored metadata attributes)`:`UNAVAILABLE: ${layer.error}`}; source SHA-256 ${layer.sourceSha256}`;byId("gerber-warning-detail").append(p);}
    const audit=document.createElement("a");audit.href=url;audit.textContent="Complete parser report and assumptions";byId("gerber-warning-detail").append(audit);
    mirror();updateSide();
    await fab.render(version,{group,bounds,ticket:()=>ticket===sequence});if(ticket!==sequence)return;
    mirror();for(const button of presetButtons)button.disabled=false;
    // gerbers.html?layer=gtl or ?layer=gbl,gbs (from the stackup page): show just
    // those layers with the outline; bottom-only links are viewed from the bottom.
    const linked=(new URLSearchParams(location.search).get("layer")??"").split(",").map(k=>`.${k.trim().replace(/^\./,"").toLowerCase()}`).filter(k=>/^\.[a-z0-9]{2,4}$/.test(k));
    if(linked.length&&layerControls.some(control=>linked.includes(control.kind))){
      applyingPreset=true;
      try{for(const control of layerControls){if(control.input.disabled)continue;const on=linked.includes(control.kind)||control.kind===".gm1";if(control.input.checked!==on){control.input.checked=on;control.input.dispatchEvent(new Event("change"));}}
        const bottom=linked.every(kind=>/^\.gb/.test(kind));if(byId("gerber-mirror").checked!==bottom){byId("gerber-mirror").checked=bottom;mirror();showSide();}}finally{applyingPreset=false;}
      pressPreset(null);updateSide();
    }
    clearRuler();
  }catch(error){if(ticket===sequence){const alert=byId("gerber-alert");alert.hidden=false;alert.textContent=`The Gerber view could not load: ${error.message}`;byId("gerber-hint").textContent="";}}
}
// View tools: fit, zoom about the centre, measure. Keys work while the page has focus.
const fit=()=>bounds&&viewport.set(bounds);
const zoom=factor=>{const [x,y,w,h]=viewport.get();viewport.set([x+w*(1-factor)/2,y+h*(1-factor)/2,w*factor,h*factor]);};
function setMeasuring(on){measuring=on;byId("gerber-measure").setAttribute("aria-pressed",String(on));svg.style.cursor=on?"crosshair":"grab";clearRuler();}
byId("gerber-reset").addEventListener("click",fit);
byId("gerber-zoom-in").addEventListener("click",()=>zoom(1/1.4));
byId("gerber-zoom-out").addEventListener("click",()=>zoom(1.4));
byId("gerber-measure").addEventListener("click",()=>setMeasuring(!measuring));
document.addEventListener("keydown",event=>{
  if(event.metaKey||event.ctrlKey||event.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName))return;
  const key=event.key.toLowerCase();
  if(key==="f")fit();else if(key==="m")setMeasuring(!measuring);else if(key==="escape"&&measuring)setMeasuring(false);
  else if(key==="+"||key==="=")zoom(1/1.4);else if(key==="-"||key==="_")zoom(1.4);else return;
});
// "View from" is the mirror state shown as words.
const sideButtons=[...document.querySelectorAll("[data-side]")];
function showSide(){const bottom=byId("gerber-mirror").checked;for(const button of sideButtons)button.setAttribute("aria-pressed",String((button.dataset.side==="bottom")===bottom));}
for(const button of sideButtons)button.addEventListener("click",()=>{const mirror=byId("gerber-mirror"),bottom=button.dataset.side==="bottom";if(mirror.checked===bottom)return;mirror.checked=bottom;mirror.dispatchEvent(new Event("change"));});
svg.addEventListener("pointermove",event=>{if(measuring&&measurement.length===1){previewPoint=eventPoint(event);redrawRuler();}});
svg.addEventListener("click",event=>{
  if(!measuring)return;if(measurement.length===2)clearRuler();
  measurement.push(eventPoint(event));previewPoint=null;redrawRuler();
  if(measurement.length===2){const {distance,dx,dy}=dimensions(...measurement),chip=byId("gerber-measure-status");chip.textContent=`${distance.toFixed(3)} mm · ΔX ${dx.toFixed(3)} · ΔY ${dy.toFixed(3)}`;chip.hidden=false;byId("gerber-hint").textContent="Click to start another measurement · Esc to stop";}
});
try{await render(await selectedPromise);}catch(error){const alert=byId("gerber-alert");alert.hidden=false;alert.textContent=error.message;}
