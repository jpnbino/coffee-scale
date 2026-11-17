"""Place underside passives against actual copper, then rebuild affected nets."""
from route_board import *
from audit_symbols import parse,one,val,dump
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');path=r.TMP/'routing-candidate.kicad_pcb'
tree=parse(path.read_text(encoding='utf-8'));clean=[]
for i in tree:
    if isinstance(i,list) and i[0] in ['segment','via']:
        name=val(one(i,'net')[1])
        if name in ['/3V3','/I2C_SCL','/PROT_CS']:continue
        if i[0]=='via' and name=='/GND' and float(one(i,'at')[1])==112.175:continue
    clean.append(i)
path.write_text(dump(clean),encoding='utf-8');b=k.LoadBoard(str(path));fs={f.GetReference():f for f in b.GetFootprints()}
obstacles={l:k.SHAPE_POLY_SET() for l in [k.F_Cu,k.B_Cu]}
for f in fs.values():
    if f.GetReference() in ['R15','R3']:continue
    for p in f.Pads():
        for l in obstacles:
            if p.GetLayerSet().Contains(l):obstacles[l].BooleanAdd(p.GetEffectivePolygon(l))
for t in b.GetTracks():
    for l in obstacles:
        if t.GetLayerSet().Contains(l):
            poly=k.SHAPE_POLY_SET();t.TransformShapeToPolygon(poly,l,0,k.FromMM(.001),k.ERROR_OUTSIDE);obstacles[l].BooleanAdd(poly)
for name,anchor in [('R15',(112,95)),('R3',(149,94))]:
    f=fs[name]
    if f.GetLayer()!=k.B_Cu:f.Flip(f.GetPosition(),False)
    f.SetOrientationDegrees(0);ax,ay=anchor
    candidates=[(ax+dx*.5,ay+dy*.5) for dx in range(-16,17) for dy in range(-16,17)];candidates.sort(key=lambda p:(p[0]-ax)**2+(p[1]-ay)**2)
    for x,y in candidates:
        f.SetPosition(pos(x,y))
        if any(p.GetEffectivePolygon(k.B_Cu).Collide(obstacles[k.B_Cu],k.FromMM(.3)) for p in f.Pads()):continue
        if 150<x<167 and 96<y<112:continue # buzzer body courtyard
        for p in f.Pads():obstacles[k.B_Cu].BooleanAdd(p.GetEffectivePolygon(k.B_Cu))
        print('Placed',name,x,y,'B.Cu',flush=True);break
    else:raise RuntimeError('No clear placement for '+name)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(path),b)
r.prepare(True,['/3V3','/I2C_SCL','/PROT_CS'])
