import { arcPath } from "./review-core.mjs";
export const svgNode=(tag,attributes={})=>{const node=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v]of Object.entries(attributes))node.setAttribute(k,String(v));return node;};
const allowed=(item,layer)=>layer==="all"||item.layer===layer;
function line(parent,s,color){parent.append(svgNode("line",{x1:s.start[0],y1:s.start[1],x2:s.end[0],y2:s.end[1],stroke:color,"stroke-width":s.width,"stroke-linecap":"round"}));}
function via(parent,v,color){parent.append(svgNode("circle",{cx:v.at[0],cy:v.at[1],r:v.diameter/2,fill:color}),svgNode("circle",{cx:v.at[0],cy:v.at[1],r:v.drill/2,fill:"#fbfaf4"}));}
export function drawOutline(parent,board){
  for(const shape of board.outline){let node;
    if(shape.shape==="gr_poly")node=svgNode("polygon",{points:shape.points.map(p=>p.join(",")).join(" ")});
    else if(shape.shape==="gr_arc")node=svgNode("path",{d:arcPath(shape)});
    else if(shape.shape==="gr_rect")node=svgNode("rect",{x:Math.min(shape.start[0],shape.end[0]),y:Math.min(shape.start[1],shape.end[1]),width:Math.abs(shape.end[0]-shape.start[0]),height:Math.abs(shape.end[1]-shape.start[1])});
    else node=svgNode("line",{x1:shape.start[0],y1:shape.start[1],x2:shape.end[0],y2:shape.end[1]});
    node.setAttribute("fill","none");node.setAttribute("stroke","#718279");node.setAttribute("stroke-width","0.13");parent.append(node);
  }
}
export function drawBoard(parent,board,layer,color="#51665a"){
  for(const s of board.segments)if(allowed(s,layer))line(parent,s,color);
  for(const a of board.arcs)if(allowed(a,layer))parent.append(svgNode("path",{d:arcPath(a),fill:"none",stroke:color,"stroke-width":a.width}));
  for(const v of board.vias)if(layer==="all"||v.layers.includes(layer)||v.layers.includes("*.Cu"))via(parent,v,color);
  for(const component of board.components)for(const p of component.pads){
    if(!p.layers.some(l=>l==="*.Cu"||l===layer||(layer==="all"&&l.endsWith(".Cu"))))continue;
    const attributes={fill:color,transform:`rotate(${-p.angle} ${p.x} ${p.y})`};
    const node=p.shape==="circle"?svgNode("ellipse",{...attributes,cx:p.x,cy:p.y,rx:p.width/2,ry:p.height/2}):svgNode("rect",{...attributes,x:p.x-p.width/2,y:p.y-p.height/2,width:p.width,height:p.height,rx:p.shape==="roundrect"?Math.min(p.width,p.height)/4:p.shape==="oval"?Math.min(p.width,p.height)/2:0});
    if(p.type==="np_thru_hole"){node.setAttribute("fill","#fbfaf4");node.setAttribute("stroke",color);node.setAttribute("stroke-width","0.1");}
    parent.append(node);
    if(p.drill.length&&p.type!=="np_thru_hole")parent.append(svgNode("ellipse",{cx:p.x,cy:p.y,rx:p.drill[0]/2,ry:(p.drill[1]??p.drill[0])/2,fill:"#fbfaf4",transform:`rotate(${-p.angle} ${p.x} ${p.y})`}));
  }
}
function componentMarker(parent,c,color,dashed=false){
  const group=svgNode("g",{"data-reference":c.ref});const title=svgNode("title");title.textContent=`${c.ref}: ${c.value}`;group.append(title);
  group.append(svgNode("circle",{cx:c.x,cy:c.y,r:1.5,fill:"none",stroke:color,"stroke-width":.25,"stroke-dasharray":dashed?"0.5 0.3":"none"}));
  const label=svgNode("text",{x:c.x+1.8,y:c.y-1.5,fill:color,"font-size":1.4});label.textContent=c.ref;group.append(label);parent.append(group);
}
export function drawChanges(parent,diff,layer,kind){
  if(kind==="all"||kind==="tracks"){
    for(const s of diff.tracks.removed)if(allowed(s,layer))line(parent,s,"#bf4271");
    for(const s of diff.tracks.added)if(allowed(s,layer))line(parent,s,"#168566");
    for(const [items,color]of [[diff.arcs.removed,"#bf4271"],[diff.arcs.added,"#168566"]])for(const a of items)if(allowed(a,layer))parent.append(svgNode("path",{d:arcPath(a),fill:"none",stroke:color,"stroke-width":a.width}));
  }
  if(kind==="all"||kind==="vias"){
    const visible=v=>layer==="all"||v.layers.includes(layer)||v.layers.includes("*.Cu");
    for(const v of diff.vias.removed)if(visible(v))via(parent,v,"#bf4271");for(const v of diff.vias.added)if(visible(v))via(parent,v,"#168566");
    for(const v of diff.vias.modified)if(visible(v.after))via(parent,v.after,"#b87519");
  }
  if(kind==="all"||kind==="components"){
    for(const c of diff.components.removed)if(allowed(c,layer))componentMarker(parent,c,"#bf4271",true);
    for(const c of diff.components.added)if(allowed(c,layer))componentMarker(parent,c,"#168566");
    for(const item of diff.components.modified){
      const a=item.before,b=item.after;if(!allowed(a,layer)&&!allowed(b,layer))continue;
      componentMarker(parent,a,"#bf4271",true);componentMarker(parent,b,"#168566");
      if(a.x!==b.x||a.y!==b.y)parent.append(svgNode("path",{d:`M${a.x},${a.y} L${b.x},${b.y}`,fill:"none",stroke:"#b87519","stroke-width":.18,"marker-end":"url(#move-arrow)"}));
    }
  }
}
export function attachViewport(svgs,onBox,{minWidth=1,maxWidth=1000,canPan=()=>true}={}){
  let box=[0,0,100,60],start=null;
  const set=value=>{box=[...value];for(const svg of svgs)svg.setAttribute("viewBox",box.join(" "));onBox?.(box);};
  for(const svg of svgs){
    const point=event=>{const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
    svg.addEventListener("wheel",event=>{event.preventDefault();const p=point(event),factor=event.deltaY>0?1.15:1/1.15;if(box[2]*factor<minWidth||box[2]*factor>maxWidth)return;set([p.x-(p.x-box[0])*factor,p.y-(p.y-box[1])*factor,box[2]*factor,box[3]*factor]);},{passive:false});
    svg.addEventListener("pointerdown",event=>{if(event.button!==0||!canPan())return;start=point(event);svg.setPointerCapture(event.pointerId);});
    svg.addEventListener("pointermove",event=>{if(!start)return;const p=point(event);set([box[0]+start.x-p.x,box[1]+start.y-p.y,box[2],box[3]]);});
    for(const name of ["pointerup","pointercancel"])svg.addEventListener(name,()=>{start=null;});
  }
  return {set,get:()=>[...box]};
}
