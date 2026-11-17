"""Identify physically separate ground copper components across both layers."""
from route_board import *
import sys
if len(sys.argv)>1:TMP=pathlib.Path(sys.argv[1])
b=k.LoadBoard(str(TMP/'routing-candidate.kicad_pcb'));gnd=b.FindNet('/GND').GetNetCode();copper={l:k.SHAPE_POLY_SET() for l in [k.F_Cu,k.B_Cu]}
for z in b.Zones():
    if not z.GetIsRuleArea() and z.GetNetCode()==gnd:copper[z.GetLayer()].BooleanAdd(z.GetFilledPolysList(z.GetLayer()))
for f in b.GetFootprints():
    for p in f.Pads():
        if p.GetNetCode()!=gnd:continue
        for l in copper:
            if p.GetLayerSet().Contains(l):copper[l].BooleanAdd(p.GetEffectivePolygon(l))
for t in b.GetTracks():
    if t.GetNetCode()!=gnd:continue
    for l in copper:
        if not t.GetLayerSet().Contains(l):continue
        ps=k.SHAPE_POLY_SET();t.TransformShapeToPolygon(ps,l,0,k.FromMM(.001),k.ERROR_INSIDE);copper[l].BooleanAdd(ps)
nodes=[(l,i) for l,ps in copper.items() for i in range(ps.OutlineCount())];parent={n:n for n in nodes}
def find(n):
    if parent[n]!=n:parent[n]=find(parent[n])
    return parent[n]
def union(a,b):parent[find(a)]=find(b)
bridges=[]
for f in b.GetFootprints():
    for p in f.Pads():
        if p.GetNetCode()==gnd and p.GetLayerSet().Contains(k.F_Cu) and p.GetLayerSet().Contains(k.B_Cu):bridges.append(p.GetPosition())
for t in b.GetTracks():
    if isinstance(t,k.PCB_VIA) and t.GetNetCode()==gnd:bridges.append(t.GetPosition())
for pt in bridges:
    hits=[n for n in nodes if copper[n[0]].Contains(pt,n[1])]
    for n in hits[1:]:union(hits[0],n)
groups=collections.defaultdict(list)
for n in nodes:groups[find(n)].append(n)
print('GROUND COPPER COMPONENTS',len(groups),flush=True)
anchors=[]
for group in groups.values():
    choices=[]
    for l,i in group:
        chain=copper[l].Outline(i);bb=chain.BBox();cx=mm(bb.GetCenter().x);cy=mm(bb.GetCenter().y)
        o=[xy(chain.CPoint(j)) for j in range(chain.PointCount())]
        candidates=[(cx,cy)]+[(xi/10,yi/10) for xi in range(math.ceil(mm(bb.GetX())*10),math.floor(mm(bb.GetRight())*10)+1) for yi in range(math.ceil(mm(bb.GetY())*10),math.floor(mm(bb.GetBottom())*10)+1)]
        for x,y in candidates:
            if all(copper[l].Contains(pos(x+.13*math.cos(math.radians(a)),y+.13*math.sin(math.radians(a))),i) for a in range(0,360,45)):
                choices.append((x,y,0 if l==k.F_Cu else 1));break
    if choices:anchors.append(choices[0]);print('GROUP',group,'ANCHOR',choices[0],flush=True)
(TMP/'ground-anchors.json').write_text(json.dumps(anchors))
