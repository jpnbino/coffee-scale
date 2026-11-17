/** Pure comparison logic shared by browser UI and regression tests. Units: mm. */
const stable = value => JSON.stringify(value);
const nm = value => BigInt(Math.round(value * 1e6));
const gcd = (a,b) => { a=a<0n?-a:a; b=b<0n?-b:b; while(b){[a,b]=[b,a%b];}return a; };
export function segmentGroups(segments) {
  const groups = new Map();
  for (const s of segments) {
    const [x,y] = s.start.map(nm), [ex,ey] = s.end.map(nm);
    let dx=ex-x,dy=ey-y; const divisor=gcd(dx,dy); if(!divisor)continue;
    dx/=divisor;dy/=divisor;if(dx<0n||(dx===0n&&dy<0n)){dx=-dx;dy=-dy;}
    const cross=dx*y-dy*x, denominator=dx*dx+dy*dy;
    const key=stable([s.layer,s.net,String(nm(s.width)),String(dx),String(dy),String(cross)]);
    const group=groups.get(key) ?? {dx,dy,cross,denominator,layer:s.layer,net:s.net,width:s.width,intervals:[]};
    const a=dx*x+dy*y,b=dx*ex+dy*ey;group.intervals.push(a<b?[a,b]:[b,a]);groups.set(key,group);
  }
  for(const group of groups.values()){
    group.intervals.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);const merged=[];
    for(const interval of group.intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]){if(interval[1]>last[1])last[1]=interval[1];}else merged.push([...interval]);}
    group.intervals=merged;
  }
  return groups;
}
function subtract(intervals, cutters) {
  const result=[];
  for(const [start,end] of intervals){let cursor=start;for(const [a,b] of cutters){if(b<=cursor)continue;if(a>=end)break;if(a>cursor)result.push([cursor,a]);if(b>cursor)cursor=b;if(cursor>=end)break;}if(cursor<end)result.push([cursor,end]);}
  return result;
}
function segmentsFrom(group, intervals) {
  const point=t=>[Number((group.dx*t-group.dy*group.cross)/group.denominator)/1e6,Number((group.dy*t+group.dx*group.cross)/group.denominator)/1e6];
  return intervals.map(([a,b])=>({start:point(a),end:point(b),width:group.width,layer:group.layer,net:group.net}));
}
export function diffSegments(base,head) {
  const a=segmentGroups(base),b=segmentGroups(head),added=[],removed=[];
  for(const [key,g] of a)removed.push(...segmentsFrom(g,subtract(g.intervals,b.get(key)?.intervals??[])));
  for(const [key,g] of b)added.push(...segmentsFrom(g,subtract(g.intervals,a.get(key)?.intervals??[])));
  return {added,removed};
}
export function diffComponents(base,head) {
  const ids=new Map(base.map(c=>[c.id,c])),refs=new Map(base.map(c=>[c.ref,c])),used=new Set();
  const added=[],removed=[],modified=[];
  for(const current of head){
    const previous=ids.get(current.id)??refs.get(current.ref);
    if(!previous||used.has(previous)){added.push(current);continue;}used.add(previous);
    const changes=[];
    for(const field of ["ref","value","footprint","layer","x","y","rotation","padSignature"])if(stable(previous[field])!==stable(current[field]))changes.push(field);
    if(changes.length)modified.push({before:previous,after:current,changes});
  }
  for(const previous of base)if(!used.has(previous))removed.push(previous);
  return {added,removed,modified};
}
export function diffVias(base,head) {
  const key=v=>stable(v.at),available=new Map();
  for(const v of base){const k=key(v);available.set(k,[...(available.get(k)??[]),v]);}
  const added=[],removed=[],modified=[];
  for(const v of head){const matches=available.get(key(v));const previous=matches?.shift();if(!previous){added.push(v);continue;}if(stable([previous.diameter,previous.drill,previous.layers,previous.type,previous.net])!==stable([v.diameter,v.drill,v.layers,v.type,v.net]))modified.push({before:previous,after:v});}
  for(const matches of available.values())removed.push(...matches);
  return {added,removed,modified};
}
const arcKey=a=>stable([a.layer,a.net,a.width,...[a.start,a.end].map(stable).sort(),a.mid]);
export function compareBoards(base,head) {
  const oldArcs=new Map(base.arcs.map(a=>[arcKey(a),a])),newArcs=new Map(head.arcs.map(a=>[arcKey(a),a]));
  return {hardwareSourceUnchanged:base.boardSha256===head.boardSha256,components:diffComponents(base.components,head.components),tracks:diffSegments(base.segments,head.segments),vias:diffVias(base.vias,head.vias),arcs:{removed:[...oldArcs].filter(([k])=>!newArcs.has(k)).map(([,a])=>a),added:[...newArcs].filter(([k])=>!oldArcs.has(k)).map(([,a])=>a)}};
}
export function arcPath(a) {
  const [x1,y1]=a.start,[x2,y2]=a.mid,[x3,y3]=a.end;
  const d=2*(x1*(y2-y3)+x2*(y3-y1)+x3*(y1-y2));
  if(Math.abs(d)<1e-12)return `M${x1},${y1} L${x3},${y3}`;
  const q1=x1*x1+y1*y1,q2=x2*x2+y2*y2,q3=x3*x3+y3*y3;
  const cx=(q1*(y2-y3)+q2*(y3-y1)+q3*(y1-y2))/d,cy=(q1*(x3-x2)+q2*(x1-x3)+q3*(x2-x1))/d;
  const r=Math.hypot(x1-cx,y1-cy),sweep=d>0?1:0;
  const start=Math.atan2(y1-cy,x1-cx),end=Math.atan2(y3-cy,x3-cx);
  const delta=((sweep?end-start:start-end)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  return `M${x1},${y1} A${r},${r} 0 ${delta>Math.PI?1:0},${sweep} ${x3},${y3}`;
}
