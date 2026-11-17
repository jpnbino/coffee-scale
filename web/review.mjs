import { compareBoards } from "./review-core.mjs";
import { svgNode,drawBoard,drawChanges,drawOutline,attachViewport } from "./review-draw.mjs";
import { catalogPromise, loadVersion } from "./review-data.mjs";
import { selectedPromise,changeRevision } from './revision.mjs';

const byId=id=>document.getElementById(id),text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const svgs=[byId("comparison-overlay"),byId("comparison-base"),byId("comparison-head")];
const viewport=attachViewport(svgs);let pair,diff,initialBox,blinker,request=0;
const defs=()=>{const group=svgNode("defs"),marker=svgNode("marker",{id:"move-arrow",viewBox:"0 0 10 10",refX:9,refY:5,markerWidth:4,markerHeight:4,orient:"auto-start-reverse"});marker.append(svgNode("path",{d:"M0,0 L10,5 L0,10 z",fill:"#b87519"}));group.append(marker);return group;};
function repaint(){
  if(!pair)return;const layer=byId("comparison-layer").value;
  const mode=byId("comparison-mode").value;
  const kind=mode==="overlay"?byId("comparison-kind").value:"all";
  byId("comparison-kind").disabled=mode!=="overlay";byId("show-common").disabled=mode!=="overlay";
  byId("comparison-pair").hidden=mode!=="side";byId("comparison-overlay").toggleAttribute("hidden",mode==="side");
  for(const svg of svgs)svg.replaceChildren();
  svgs[0].append(defs());
  const baseGroup=svgNode("g",{"data-version":"base"}),headGroup=svgNode("g",{"data-version":"head"});
  const common=svgNode("g",{opacity:byId("show-common").checked ? .18 : 0});
  drawOutline(svgs[0],pair[1].board);drawBoard(common,pair[1].board,layer);svgs[0].append(common);
  if(mode==="blink"){
    drawBoard(baseGroup,pair[0].board,layer,"#bf4271");drawBoard(headGroup,pair[1].board,layer,"#168566");svgs[0].append(baseGroup,headGroup);
  }else drawChanges(svgs[0],diff,layer,kind);
  pair.forEach((version,index)=>{drawOutline(svgs[index+1],version.board);drawBoard(svgs[index+1],version.board,layer,index?"#168566":"#bf4271");});
  clearInterval(blinker);
  if(mode==="blink"){let phase=false;const swap=()=>{phase=!phase;baseGroup.style.display=phase?"":"none";headGroup.style.display=phase?"none":"";};swap();blinker=setInterval(swap,700);}
  viewport.set(viewport.get());renderChangeList(kind);
}
function focus(item){const p=item.after??item;const at=p.at??(p.x!==undefined?[p.x,p.y]:p.start);if(at)viewport.set([at[0]-10,at[1]-7,20,14]);}
function renderChangeList(kind){
  const rows=[];
  if(kind==="all"||kind==="components"){
    for(const item of diff.components.modified)rows.push([`${item.after.ref}: ${item.changes.map(c=>c==="padSignature"?"pads/connectivity":c).join(", ")}`,item]);
    for(const item of diff.components.added)rows.push([`${item.ref}: added`,item]);for(const item of diff.components.removed)rows.push([`${item.ref}: removed`,item]);
  }
  if(kind==="all"||kind==="vias")for(const name of ["added","removed","modified"])for(const item of diff.vias[name])rows.push([`Via ${name} at ${(item.after??item).at.join(", ")} mm`,item]);
  if(kind==="all"||kind==="tracks")for(const name of ["added","removed"])for(const item of [...diff.tracks[name],...diff.arcs[name]])rows.push([`Track ${name}: ${item.net} / ${item.layer}`,item]);
  byId("change-list").replaceChildren();
  for(const [label,item]of rows.slice(0,250)){const button=text("button",label);button.type="button";button.addEventListener("click",()=>focus(item));const li=document.createElement("li");li.append(button);byId("change-list").append(li);}
  byId("change-count").textContent=`${rows.length} change entries; ${Math.min(250,rows.length)} listed. Click to zoom; use filters for large reroutes.`;
}
function artifacts(catalog){
  const container=byId("version-catalog");container.replaceChildren();
  for(const version of catalog.versions){const article=document.createElement("article");article.className="version-card";article.append(text("h3",version.label),text("p",version.validation),text("code",version.boardSha256.slice(0,16)));
    const links=document.createElement("p");for(const [key,label]of [["pcbTop","Top"],["pcbBottom","Bottom"],["schematicPdf","Schematic PDF"],["fabricationZip","Gerbers ZIP"],["sourcePcb","PCB source"]]){const link=text("a",label);link.href=`review/${version[key]}`;links.append(link,document.createTextNode(" · "));}article.append(links);container.append(article);}
}
async function compare(catalog){
  const ticket=++request;
  try{
    byId("comparison-status").textContent="Loading version geometry…";
    const selected=[byId("base-version").value,byId("head-version").value].map(id=>catalog.versions.find(v=>v.id===id));
    const loaded=await Promise.all(selected.map(loadVersion));if(ticket!==request)return;pair=loaded;diff=compareBoards(pair[0].board,pair[1].board);
    const bounds=pair.map(p=>p.board.bounds);const x=Math.min(...bounds.map(b=>b.minX))-3,y=Math.min(...bounds.map(b=>b.minY))-3;
    initialBox=[x,y,Math.max(...bounds.map(b=>b.maxX))-x+3,Math.max(...bounds.map(b=>b.maxY))-y+3];viewport.set(initialBox);
    byId("comparison-status").textContent=diff.hardwareSourceUnchanged?"PCB source unchanged. Build/documentation or export metadata may differ; no PCB source revision change.":`PCB source changed. ${diff.components.modified.length} modified, ${diff.components.added.length} added and ${diff.components.removed.length} removed components/features. Schematics ${selected[0].schematicSha256===selected[1].schematicSha256?"unchanged":"changed (not semantically compared here)"}.`;
    byId("comparison-deltas").textContent=`Vias ${pair[0].board.vias.length} → ${pair[1].board.vias.length} · Straight track objects ${pair[0].board.segments.length} → ${pair[1].board.segments.length} · Changed straight copper portions +${diff.tracks.added.length} / −${diff.tracks.removed.length}`;
    byId("base-caption").textContent=selected[0].label;byId("head-caption").textContent=selected[1].label;
    repaint();
  }catch(error){if(ticket===request)byId("comparison-status").textContent=error.message;}
}
try{
  const catalog=await catalogPromise;artifacts(catalog);
  for(const id of ["base-version","head-version"])for(const version of catalog.versions){const option=text("option",version.label);option.value=version.id;byId(id).append(option);}
  const selected=await selectedPromise,base=new URLSearchParams(location.search).get('base');
  byId("base-version").value=catalog.versions.some(v=>v.id===base)?base:catalog.versions.find(v=>v.id!==selected.id).id;byId("head-version").value=selected.id;
  byId("head-version").addEventListener("change",()=>changeRevision(byId("head-version").value));
  byId("base-version").addEventListener("change",()=>{const url=new URL(location.href);url.searchParams.set('base',byId('base-version').value);history.replaceState(null,'',url);compare(catalog);});
  for(const id of ["comparison-layer","comparison-kind","comparison-mode","show-common"])byId(id).addEventListener("change",repaint);
  byId("comparison-reset").addEventListener("click",()=>initialBox&&viewport.set(initialBox));
  await compare(catalog);
}catch(error){byId("comparison-status").textContent=`Review unavailable: ${error.message}. Run "node preview.mjs" to serve the generated site.`;}
