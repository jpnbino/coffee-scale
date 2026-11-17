"""Close local escapes, add enclosure references and place clean silkscreen."""
from route_board import *
from audit_symbols import parse,dump
REV=ROOT/'enclosure-revB'
tree=parse(pathlib.Path('tmp/enclosure-routing/routing-candidate.kicad_pcb').read_text(encoding='utf-8'))
tree=[i for i in tree if not(isinstance(i,list) and i[0]=='gr_text')]
clean=pathlib.Path('tmp/enclosure-routing/clean-labels.kicad_pcb');clean.write_text(dump(tree),encoding='utf-8')
b=k.LoadBoard(str(clean))
fs={f.GetReference():f for f in b.GetFootprints()}
def track(net,a,e,layer=k.F_Cu):
    t=k.PCB_TRACK(b);t.SetStart(pos(*a));t.SetEnd(pos(*e));t.SetWidth(k.FromMM(.2));t.SetLayer(layer);t.SetNetCode(b.FindNet(net).GetNetCode());b.Add(t)
f=fs['SW6'];f.Models().clear();m=k.FP_3DMODEL();m.m_Filename='${KIPRJMOD}/models/JS102011SAQN_travel_envelope.wrl';f.Add3DModel(m)
# Treat top and bottom markings independently.
obstacles={l:[] for l in [k.F_SilkS,k.B_SilkS]}
def bb(poly,margin=.2):
    pts=[p for o in outline(poly) for p in o]
    if pts:return min(x for x,y in pts)-margin,min(y for x,y in pts)-margin,max(x for x,y in pts)+margin,max(y for x,y in pts)+margin
for f in fs.values():
    f.Value().SetVisible(False)
    for silk,cu in [(k.F_SilkS,k.F_Cu),(k.B_SilkS,k.B_Cu)]:
        for p in f.Pads():
            if p.GetLayerSet().Contains(cu):
                bounds=bb(p.GetEffectivePolygon(cu))
                if bounds:obstacles[silk].append(bounds)
        for g in f.GraphicalItems():
            if g.GetLayer()==silk:
                q=g.GetBoundingBox();obstacles[silk].append((mm(q.GetX())-.15,mm(q.GetY())-.15,mm(q.GetRight())+.15,mm(q.GetBottom())+.15))
for t in b.GetTracks():
    if isinstance(t,k.PCB_VIA):
        x,y=xy(t.GetPosition());rad=mm(t.GetWidth(k.F_Cu))/2+.2
        for l in obstacles:obstacles[l].append((x-rad,y-rad,x+rad,y+rad))
for d in b.GetDrawings():
    if isinstance(d,k.PCB_TEXT) and d.GetLayer() in obstacles:
        # Existing board legends are handled as obstacles; add new labels separately.
        q=d.GetBoundingBox();obstacles[d.GetLayer()].append((mm(q.GetX())-.15,mm(q.GetY())-.15,mm(q.GetRight())+.15,mm(q.GetBottom())+.15))
def label(item,text,x,y,layer):
    w=max(1.4,len(text)*.8+.4);h=1.3
    candidates=[(x+dx/2,y+dy/2) for dx in range(-20,21) for dy in range(-20,21)]
    candidates.sort(key=lambda p:(p[0]-x)**2+(p[1]-y)**2)
    for px,py in candidates:
        q=(px-w/2,py-h/2,px+w/2,py+h/2)
        if q[0]<86 or q[1]<75.2 or q[2]>184 or q[3]>122.8 or any(overlap(q,o) for o in obstacles[layer]):continue
        item.SetText(text);item.SetPosition(pos(px,py));item.SetTextAngle(k.EDA_ANGLE(0,k.DEGREES_T));item.SetTextSize(pos(.8,.8));item.SetTextThickness(k.FromMM(.12));item.SetLayer(layer);item.SetMirrored(layer==k.B_SilkS);item.SetVisible(True);obstacles[layer].append(q);return
    item.SetLayer(k.B_Fab if layer==k.B_SilkS else k.F_Fab);item.SetVisible(False)
for r,f in fs.items():
    x,y=xy(f.GetPosition());label(f.Reference(),r,x,y,k.B_SilkS if f.GetLayer()==k.B_Cu else k.F_SilkS)
for text,x,y,layer in [('ON',120,122,k.F_SilkS),('OFF',128,122,k.F_SilkS),('BAT+',100,86,k.F_SilkS),('DBG',155,79,k.F_SilkS),('3V3 REF',160,79,k.F_SilkS),('WAKE',141,122,k.F_SilkS),('BTN1',169,84,k.F_SilkS),('BTN2',169,114,k.F_SilkS),('BTN3',169,92,k.F_SilkS),('BTN4',169,100,k.F_SilkS),('SOUND',158,112,k.B_SilkS)]:
    t=k.PCB_TEXT(b);label(t,text,x,y,layer);b.Add(t)
title=b.GetTitleBlock();title.SetRevision('B - enclosure prototype');b.SetTitleBlock(title)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(REV/'pico_scale_controller.kicad_pcb'),b)
print('Saved Rev B: local connections, model references and silkscreen')
