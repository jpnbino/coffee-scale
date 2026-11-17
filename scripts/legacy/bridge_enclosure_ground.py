"""Join isolated ground pours only where both layers have verified clearance."""
from route_board import *
import runpy,sys
folder=sys.argv[1] if len(sys.argv)>1 else 'tmp/enclosure-routing'
path=pathlib.Path(folder)/'routing-candidate.kicad_pcb';b=k.LoadBoard(str(path))
old=(142.65,82.35);new=(142.6,82.3)
for t in ([] if len(sys.argv)>1 else b.GetTracks()):
    if t.GetNetname()!='/3V3':continue
    if isinstance(t,k.PCB_VIA):
        if xy(t.GetPosition())==old:t.SetPosition(pos(*new))
    else:
        if xy(t.GetStart())==old:t.SetStart(pos(*new))
        if xy(t.GetEnd())==old:t.SetEnd(pos(*new))
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(path),b)
sys.argv=['ground_groups.py',folder];g=runpy.run_path(str(pathlib.Path(__file__).with_name('ground_groups.py')));b=g['b']
groups=list(g['groups'].values());main=max(groups,key=len);foreign={l:k.SHAPE_POLY_SET() for l in [k.F_Cu,k.B_Cu]}
for f in b.GetFootprints():
    for p in f.Pads():
        if p.GetNetCode()==g['gnd']:continue
        for l in foreign:
            if p.GetLayerSet().Contains(l):foreign[l].BooleanAdd(p.GetEffectivePolygon(l))
for t in b.GetTracks():
    if t.GetNetCode()==g['gnd']:continue
    for l in foreign:
        if t.GetLayerSet().Contains(l):
            ps=k.SHAPE_POLY_SET();t.TransformShapeToPolygon(ps,l,0,k.FromMM(.001),k.ERROR_OUTSIDE);foreign[l].BooleanAdd(ps)
for group in groups:
    if group==main:continue
    found=False
    for l,i in group:
        bb=g['copper'][l].Outline(i).BBox()
        for xi in range(math.ceil(mm(bb.GetX())*10),math.floor(mm(bb.GetRight())*10)+1):
            for yi in range(math.ceil(mm(bb.GetY())*10),math.floor(mm(bb.GetBottom())*10)+1):
                p=pos(xi/10,yi/10);other=k.B_Cu if l==k.F_Cu else k.F_Cu
                if not all(g['copper'][l].Contains(pos(xi/10+.31*math.cos(a),yi/10+.31*math.sin(a)),i) for a in [j*math.pi/4 for j in range(8)]):continue
                if not any(ml==other and g['copper'][ml].Contains(p,mi) for ml,mi in main):continue
                if any(ps.Collide(p,k.FromMM(.56)) for ps in foreign.values()):continue
                v=k.PCB_VIA(b);v.SetPosition(p);v.SetWidth(k.FromMM(.6));v.SetDrill(k.FromMM(.3));v.SetViaType(k.VIATYPE_THROUGH);v.SetLayerPair(k.F_Cu,k.B_Cu);v.SetNetCode(g['gnd']);b.Add(v)
                print('GROUND BRIDGE',xi/10,yi/10);found=True;break
            if found:break
        if found:break
    if not found:raise RuntimeError('No safe direct ground bridge')
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(path),b)
