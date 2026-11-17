import { svgNode } from './review-draw.mjs';
export function dimensions(a,b,units=1000) {
  return {dx:(b.x-a.x)/units,dy:(b.y-a.y)/units,distance:Math.hypot(b.x-a.x,b.y-a.y)/units};
}
export function drawRuler(svg,points,width) {
  svg.querySelector('[data-ruler]')?.remove(); if (!points.length) return;
  const group=svgNode('g',{'data-ruler':'true','pointer-events':'none'}),size=width/45;
  for(const p of points)group.append(svgNode('circle',{cx:p.x,cy:p.y,r:size/3,fill:'#fff',stroke:'#eb335e','stroke-width':size/8}));
  if(points.length===2){
    const [a,b]=points,measure=dimensions(a,b);
    group.append(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#eb335e','stroke-width':size/6}));
    const label=svgNode('text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-size,fill:'#fff',stroke:'#20252b','stroke-width':size/5,'paint-order':'stroke','text-anchor':'middle','font-size':size,'font-family':'system-ui'});
    label.textContent=`${measure.distance.toFixed(3)} mm`;group.append(label);
  }
  svg.append(group);
}
