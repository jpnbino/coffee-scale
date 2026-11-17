"""Final reference placement, exact duplicate removal and board metadata."""
from route_board import *
b=k.LoadBoard(str(TMP/'routing-candidate.kicad_pcb'));fs=list(b.GetFootprints());obstacles=[];label_boxes=[]
def polybox(poly,margin=.15):
    pts=[p for o in outline(poly) for p in o]
    if pts:return min(x for x,y in pts)-margin,min(y for x,y in pts)-margin,max(x for x,y in pts)+margin,max(y for x,y in pts)+margin
for f in fs:
    for p in f.Pads():
        if p.GetLayerSet().Contains(k.F_Cu):
            bb=polybox(p.GetEffectivePolygon(k.F_Cu),.2)
            if bb:obstacles.append(bb)
    for g in f.GraphicalItems():
        if g.GetLayer()==k.F_SilkS:
            bb=g.GetBoundingBox();obstacles.append((mm(bb.GetX())-.15,mm(bb.GetY())-.15,mm(bb.GetRight())+.15,mm(bb.GetBottom())+.15))
    f.Value().SetLayer(k.F_Fab);f.Value().SetVisible(False)
for t in b.GetTracks():
    if isinstance(t,k.PCB_VIA):
        x,y=xy(t.GetPosition());r=mm(t.GetWidth(k.F_Cu))/2+.2;obstacles.append((x-r,y-r,x+r,y+r))
hidden=[]
for f in fs:
    ref=f.Reference();name=f.GetReference();fx,fy=xy(f.GetPosition());w=max(1.4,len(name)*.8+.4);h=1.3
    candidates=[(fx+dx/2,fy+dy/2) for dx in range(-16,17) for dy in range(-16,17)];candidates.sort(key=lambda p:(p[0]-fx)**2+(p[1]-fy)**2)
    chosen=None
    for x,y in candidates:
        bb=(x-w/2,y-h/2,x+w/2,y+h/2)
        if bb[0]<86 or bb[1]<75.2 or bb[2]>184 or bb[3]>122.8 or any(overlap(bb,o) for o in obstacles+label_boxes):continue
        chosen=(x,y);label_boxes.append(bb);break
    ref.SetTextAngle(k.EDA_ANGLE(0,k.DEGREES_T));ref.SetTextSize(pos(.8,.8));ref.SetTextThickness(k.FromMM(.12))
    if chosen:ref.SetLayer(k.F_SilkS);ref.SetVisible(True);ref.SetPosition(pos(*chosen))
    else:ref.SetLayer(k.F_Fab);ref.SetVisible(False);hidden.append(name)
def legend(text,anchor):
    w=len(text)*.7+.4;h=1.3;ax,ay=anchor;candidates=[(ax+dx/2,ay+dy/2) for dx in range(-4,5) for dy in range(-4,5)];candidates.sort(key=lambda p:(p[0]-ax)**2+(p[1]-ay)**2)
    for x,y in candidates:
        bb=(x-w/2,y-h/2,x+w/2,y+h/2)
        if bb[0]<86 or bb[1]<75.2 or bb[2]>184 or bb[3]>122.8 or any(overlap(bb,o) for o in obstacles+label_boxes):continue
        t=k.PCB_TEXT(b);t.SetText(text);t.SetPosition(pos(x,y));t.SetLayer(k.F_SilkS);t.SetTextSize(pos(.8,.8));t.SetTextThickness(k.FromMM(.12));b.Add(t);label_boxes.append(bb);return
for text,anchor in [('ON',(120,122)),('OFF',(128,122)),('WAKE',(150,122)),('BAT+',(100,86)),('DBG',(161,88)),('3V3 REF',(161,90))]:legend(text,anchor)
title=b.GetTitleBlock();title.SetTitle('Pico W Scale Controller');title.SetRevision('A - prototype');title.SetDate('2026-11-04')
# Native routing repair can retrace an existing branch; remove exact duplicates.
seen=set();remove=[]
tracks=list(b.GetTracks())
for t in tracks:
    if isinstance(t,k.PCB_VIA):key=('via',t.GetNetCode(),t.GetPosition().x,t.GetPosition().y,t.GetWidth(k.F_Cu),t.GetDrillValue())
    else:
        p=sorted([(t.GetStart().x,t.GetStart().y),(t.GetEnd().x,t.GetEnd().y)]);key=('seg',t.GetNetCode(),t.GetLayer(),t.GetWidth(),*p)
    if key in seen:remove.append(t)
    else:seen.add(key)
for t in remove:b.Remove(t)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(TMP/'routing-final.kicad_pcb'),b)
print('Finalized labels; references on assembly layer:',hidden,'; duplicate items removed:',len(remove),flush=True)
