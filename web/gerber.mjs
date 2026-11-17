import { catalogPromise,json } from "./review-data.mjs";
import { svgNode,attachViewport } from "./review-draw.mjs";
import { dimensions,drawRuler } from "./ruler.mjs";
import { selectedPromise,changeRevision } from './revision.mjs';
const byId=id=>document.getElementById(id),svg=byId("gerber-canvas");
let sequence=0,bounds,measurement=[],measuring=false,previewPoint=null;
const viewport=attachViewport([svg],()=>redrawRuler(),{minWidth:100,maxWidth:1000000,canPan:()=>!measuring});
function redrawRuler(){drawRuler(svg,previewPoint&&measurement.length===1?[measurement[0],previewPoint]:measurement,viewport.get()[2]);}
function clearRuler(){measurement=[];previewPoint=null;redrawRuler();byId("gerber-measure-status").textContent=measuring?"Click a start point, then an end point. Move the pointer to preview the ruler. Panning is paused while measuring.":"";}
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
const colorFor=kind=>({".gtl":"#d8aa61",".gbl":"#708fc4",".gts":"#42917a",".gbs":"#718477",".gto":"#f4efe2",".gbo":"#ddbbcd",".gm1":"#faf8ef",".drl":"#e77372"}[kind]);
async function render(version){
  const ticket=++sequence;byId("gerber-status").textContent="Reading exact released Gerber/drill layers…";
  try{
    const url=`review/${version.gerbers}`,report=await json(url),base=url.slice(0,url.lastIndexOf("/")+1);
    const layers=await Promise.all(report.layers.map(async layer=>{
      if(!layer.available)return {...layer};
      const response=await fetch(base+layer.svg);if(!response.ok)throw new Error(`Layer unavailable: ${layer.name}`);
      return {...layer,document:safeSvg(await response.text())};
    }));if(ticket!==sequence)return;
    svg.replaceChildren();byId("gerber-layers").replaceChildren();
    const group=svgNode("g");svg.append(group);const boxes=layers.filter(l=>l.available).map(l=>l.viewBox);
    if(!boxes.length)throw new Error("No renderable Gerber layers");
    const x=Math.min(...boxes.map(b=>b[0]))-1000,y=Math.min(...boxes.map(b=>b[1]))-1000;
    bounds=[x,y,Math.max(...boxes.map(b=>b[0]+b[2]))-x+1000,Math.max(...boxes.map(b=>b[1]+b[3]))-y+1000];viewport.set(bounds);
    const mirror=()=>{group.setAttribute("transform",byId("gerber-mirror").checked?`translate(${2*bounds[0]+bounds[2]},0) scale(-1,1)`:"");clearRuler();};
    byId("gerber-mirror").onchange=mirror;mirror();
    for(const layer of layers){
      const row=document.createElement("div"),label=document.createElement("label"),input=document.createElement("input");row.className="layer-control";input.type="checkbox";input.disabled=!layer.available;input.checked=layer.available&&[".gtl",".gm1",".drl"].includes(layer.kind);
      label.append(input,document.createTextNode(layer.label));row.append(label);byId("gerber-layers").append(row);
      if(!layer.document)continue;
      const drawing=svgNode("g",{color:colorFor(layer.kind),"data-layer":layer.name});
      for(const child of layer.document.children)drawing.append(document.importNode(child,true));
      drawing.style.display=input.checked?"":"none";group.append(drawing);
      input.addEventListener("change",()=>{drawing.style.display=input.checked?"":"none";});
      const opacity=document.createElement("input"),output=document.createElement("output");opacity.type="range";opacity.min=0;opacity.max=100;opacity.value=100;opacity.setAttribute("aria-label",`${layer.label} opacity`);output.textContent="100%";
      opacity.addEventListener("input",()=>{drawing.setAttribute("opacity",Number(opacity.value)/100);output.textContent=`${opacity.value}%`;});row.append(opacity,output);
    }
    const warnings=layers.flatMap(l=>l.warnings??[]),review=warnings.filter(w=>w.category!=="metadata");
    byId("gerber-status").textContent=`${version.label}: ${layers.filter(l=>l.available).length}/${layers.length} layers rendered · ${review.length} review-required warnings · ${warnings.length-review.length} ignored metadata attributes. X2 net attributes are not available for selection.`;
    byId("gerber-warning-detail").replaceChildren();
    for(const layer of layers){const p=document.createElement("p");p.textContent=`${layer.name}: ${layer.available?`${layer.warnings.length} parser notices`:`UNAVAILABLE: ${layer.error}`}; source SHA-256 ${layer.sourceSha256}`;byId("gerber-warning-detail").append(p);}
    const audit=document.createElement("a");audit.href=url;audit.textContent="Complete parser report and assumptions";byId("gerber-warning-detail").append(audit);
    clearRuler();
  }catch(error){if(ticket===sequence)byId("gerber-status").textContent=`Gerber view unavailable: ${error.message}`;}
}
byId("gerber-reset").addEventListener("click",()=>bounds&&viewport.set(bounds));
byId("gerber-measure").addEventListener("click",()=>{measuring=!measuring;byId("gerber-measure").setAttribute("aria-pressed",String(measuring));svg.style.cursor=measuring?"crosshair":"grab";clearRuler();});
svg.addEventListener("pointermove",event=>{if(measuring&&measurement.length===1){previewPoint=eventPoint(event);redrawRuler();}});
svg.addEventListener("click",event=>{
  if(!measuring)return;if(measurement.length===2)measurement=[];
  measurement.push(eventPoint(event));previewPoint=null;redrawRuler();
  if(measurement.length===2){const {distance,dx,dy}=dimensions(...measurement);byId("gerber-measure-status").textContent=`Distance: ${distance.toFixed(3)} mm · ΔX ${dx.toFixed(3)} mm · ΔY ${dy.toFixed(3)} mm (view axes). Click to begin another ruler.`;}
});
try{
  const catalog=await catalogPromise;
  for(const version of catalog.versions){const option=document.createElement("option");option.value=version.id;option.textContent=version.label;byId("gerber-version").append(option);}
  const selected=await selectedPromise;
  byId("gerber-version").value=selected.id;byId("gerber-version").addEventListener("change",()=>changeRevision(byId("gerber-version").value));
  await render(selected);
}catch(error){byId("gerber-status").textContent=error.message;}
