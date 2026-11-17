"""Prepare geometry, import checked two-layer routing, and fill ground pours.

Outputs are candidate boards under tmp; the main PCB is updated via apply_patch
only after validation.
"""
import argparse, math, pathlib, collections, json
import pcbnew as k
ROOT=pathlib.Path('src');TMP=pathlib.Path('tmp');TMP.mkdir(exist_ok=True)
STEP=.05;OX=85.;OY=74.;W=2001;H=1001
def mm(v):return k.ToMM(v)
def xy(p):return mm(p.x),mm(p.y)
def pos(x,y):return k.VECTOR2I(k.FromMM(x),k.FromMM(y))
def outline(poly):
    return [[xy(poly.Outline(i).CPoint(j)) for j in range(poly.Outline(i).PointCount())] for i in range(poly.OutlineCount())]
def box(f):
    poly=f.GetCourtyard(k.F_Cu)
    points=[p for o in outline(poly) for p in o]
    if not points:
        for p in f.Pads():
            if not(p.GetLayerSet().Contains(k.F_Cu) or p.GetLayerSet().Contains(k.B_Cu)):continue
            for o in outline(p.GetEffectivePolygon(k.F_Cu)):points.extend(o)
    if not points:return (0,0,0,0)
    return min(p[0] for p in points)-.10,min(p[1] for p in points)-.10,max(p[0] for p in points)+.10,max(p[1] for p in points)+.10
def overlap(a,b):return a[0]<b[2] and a[2]>b[0] and a[1]<b[3] and a[3]>b[1]
def place():
    b=k.LoadBoard(str(ROOT/'pico_scale_controller.kicad_pcb'))
    assert not list(b.GetTracks()),'Input now contains routing; do not overwrite user tracks'
    fs={f.GetReference():f for f in b.GetFootprints()}
    anchors={
      'U3':(108,116,0),'L1':(102,116,0),'C13':(107,112,0),'C14':(110,112,0),'C15':(112,116,0),'C16':(112,120,0),
      'U4':(116,113,0),'C11':(119,112,0),'C12':(116,116,0),'SW6':(124,121,0),
      'U5':(145,100,0),'C3':(150,96,90),'C4':(150,99,90),'C5':(140,104,90),'C6':(140,99,0),
      'R4':(170,87,0),'R5':(170,95,0),'R6':(170,103,0),'R7':(170,111,0),
      'R2':(135,83,0),'R3':(138,83,0),'C7':(142,80,0),
      'Q1':(160,110,90),'R8':(164,110,0),'R9':(164,113,0),'R10':(151,106,90),
      'R11':(157,82.5,90),'R12':(160,82.5,90),'C8':(110,85,0),'C9':(113,85,0),'R1':(106,85,90),
      'D1':(170,80,90),'Q4':(169,89,0),'R13':(168,90,0),
      'C10':(113,77,0),'R14':(107,77,90),'R15':(120,80,0),'R16':(154,116,0),
      'C1':(129,111.8,0),'C2':(132,111.8,0)
    }
    fixed=['H1','H2','H3','H4','J2','J3','J1','J4','J5','J6','BZ1','SW2','SW3','SW4','SW5','SW1']
    occupied=[box(fs[r]) for r in fixed]
    # First place regulator and ADC blocks; relocate remaining passives near anchors.
    order=['U3','U5','L1','C13','C15','C16','C14','C3','C4','C5','C6','U4','SW6','D1','Q4']
    rest=[r for r in fs if r not in fixed+order]
    rest.sort(key=lambda r:-(box(fs[r])[2]-box(fs[r])[0])*(box(fs[r])[3]-box(fs[r])[1]))
    report=[]
    for r in order+rest:
        f=fs[r];x,y,a=anchors.get(r,(*xy(f.GetPosition()),f.GetOrientationDegrees()))
        reach=12 if r in order else 30
        f.SetOrientationDegrees(a);candidates=[(x+dx*.5,y+dy*.5) for dx in range(-reach,reach+1) for dy in range(-reach,reach+1)]
        candidates.sort(key=lambda p:(p[0]-x)**2+(p[1]-y)**2);placed=False
        for px,py in candidates:
            f.SetPosition(pos(px,py));bb=box(f)
            if bb[0]<86 or bb[1]<75 or bb[2]>184 or bb[3]>123 or any(overlap(bb,o) for o in occupied):continue
            occupied.append(bb);report.append((r,px,py,a));placed=True;break
        if not placed:
            f.SetPosition(pos(x,y));bb=box(f)
            print('FAILED BOUNDS',r,bb,'overlaps',[(i,o) for i,o in enumerate(occupied) if overlap(bb,o)],flush=True)
            raise RuntimeError('No placement near critical anchor '+r)
    k.SaveBoard(str(TMP/'routing-placed.kicad_pcb'),b)
    print('PLACED',report,flush=True)
def prepare(repair=False,repair_nets=None):
    b=k.LoadBoard(str(TMP/('routing-candidate.kicad_pcb' if repair else 'routing-placed.kicad_pcb')));polygons=[];terms=collections.defaultdict(list);pth=[]
    fs=list(b.GetFootprints())
    def polygon(points,layers,net,margin,novia=0):
        if len(points)>2:polygons.append((layers,net,margin,novia,points))
    for f in fs:
        for p in f.Pads():
            layers=sum((1<<i) for i,l in enumerate([k.F_Cu,k.B_Cu]) if p.GetLayerSet().Contains(l))
            if p.GetAttribute()==k.PAD_ATTRIB_NPTH:
                hole=k.SHAPE_POLY_SET();p.TransformHoleToPolygon(hole,0,k.FromMM(.001),k.ERROR_OUTSIDE)
                for pts in outline(hole):polygon(pts,3,65535,.385)
                continue
            if not layers:continue
            net=p.GetNetCode() if p.GetNetCode()>0 and p.GetNetname() else 65535
            points=outline(p.GetEffectivePolygon(k.F_Cu if layers&1 else k.B_Cu))
            is_npth=p.GetAttribute()==k.PAD_ATTRIB_NPTH
            for pts in points:
                polygon(pts,layers,net,.385 if is_npth else .31 if repair else .335)
                polygon(pts,3,65535,.35,1)
            x,y=xy(p.GetPosition());gx=round((x-OX)/STEP);gy=round((y-OY)/STEP)
            if net!=65535:
                terms[net].append((gx,gy,-1 if layers==3 else 0 if layers==1 else 1))
                if layers==3:pth.append((gx,gy,net))
        for z in f.Zones():
            if not z.GetIsRuleArea() or not z.GetDoNotAllowTracks():continue
            layers=sum((1<<i) for i,l in enumerate([k.F_Cu,k.B_Cu]) if z.GetLayerSet().Contains(l))
            for pts in outline(z.Outline()):polygon(pts,layers,65535,.13)
    if repair:
        for t in b.GetTracks():
            net=t.GetNetCode();width=mm(t.GetWidth(k.F_Cu) if isinstance(t,k.PCB_VIA) else t.GetWidth());layers=3 if isinstance(t,k.PCB_VIA) else 1 if t.GetLayer()==k.F_Cu else 2
            a=xy(t.GetPosition()) if isinstance(t,k.PCB_VIA) else xy(t.GetStart());e=a if isinstance(t,k.PCB_VIA) else xy(t.GetEnd())
            angle=math.atan2(e[1]-a[1],e[0]-a[0]);pts=[]
            for centre,base in [(e,angle-math.pi/2),(a,angle+math.pi/2)]:
                pts += [(centre[0]+width/2*math.cos(base+i*math.pi/12),centre[1]+width/2*math.sin(base+i*math.pi/12)) for i in range(13)]
            polygon(pts,layers,net,.31)
            if isinstance(t,k.PCB_VIA):
                pth.append((round((a[0]-OX)/STEP),round((a[1]-OY)/STEP),net));polygon(pts,3,65535,.30,1)
    nets=[]
    for n,t in terms.items():
        t=list(dict.fromkeys(t));name=b.FindNet(n).GetNetname();width=.4 if name in ['/3V3','/USB5','/BAT_P','/BATT_NEG','/SYS_PRE','/SYS_LATCH','/RAW_SW','/PROT_D','/SW_L1','/SW_L2'] else .2
        if repair and name not in (repair_nets or ['/PROT_VCC','/BATT_NEG','/GND']):continue
        if repair and name=='/GND':
            anchors=json.loads((TMP/'ground-anchors.json').read_text());t=[(round((x-OX)/STEP),round((y-OY)/STEP),l) for x,y,l in anchors]
        if name=='/GND':width=.2
        priority=0 if '/SW_L' in name else 1 if name.startswith(('/CELL_','/HX_VBG','/PROT_')) else 2 if width>.2 else 4 if name=='/GND' else 3
        if repair and name=='/BATT_NEG':priority=-1
        nets.append((priority,len(t),n,name,width,t))
    nets.sort()
    with (TMP/('repair-input.txt' if repair else 'routing-input.txt')).open('w') as out:
        out.write(f'{W} {H} {STEP} {OX} {OY}\n{len(polygons)}\n')
        for l,n,m,nv,pts in polygons:out.write(f'{l} {n} {m} {nv} {len(pts)} '+' '.join(f'{x:.6f} {y:.6f}' for x,y in pts)+'\n')
        out.write(str(len(pth))+'\n')
        for x,y,n in pth:out.write(f'{x} {y} {n}\n')
        out.write(str(len(nets))+'\n')
        for _,_,n,name,w,t in nets:
            out.write(f'{n} {name} {w} {len(t)}\n')
            for x,y,l in t:out.write(f'{x} {y} {l}\n')
    print('Prepared',len(polygons),'obstacles;',len(nets),'nets',flush=True)
def import_route(repair=False):
    b=k.LoadBoard(str(TMP/('routing-candidate.kicad_pcb' if repair else 'routing-placed.kicad_pcb')));fail=[];segments=0;vias=0;seen=set()
    for line in (TMP/('repair-paths.txt' if repair else 'routing-paths.txt')).read_text().splitlines():
        v=line.split()
        if v[0]=='FAIL':fail.append(line);continue
        n=int(v[1]);item=None
        if v[0]=='S':
            _,_,layer,width,x1,y1,x2,y2=v;key=tuple(v)
            if key in seen:continue
            seen.add(key);item=k.PCB_TRACK(b);item.SetStart(pos(float(x1),float(y1)));item.SetEnd(pos(float(x2),float(y2)));item.SetWidth(k.FromMM(float(width)));item.SetLayer(k.F_Cu if layer=='0' else k.B_Cu);segments+=1
        elif v[0]=='V':
            _,_,x,y=v;key=('V',n,x,y)
            if key in seen:continue
            seen.add(key);item=k.PCB_VIA(b);item.SetPosition(pos(float(x),float(y)));item.SetWidth(k.FromMM(.6));item.SetDrill(k.FromMM(.3));item.SetViaType(k.VIATYPE_THROUGH);item.SetLayerPair(k.F_Cu,k.B_Cu);vias+=1
        if item:item.SetNetCode(n);b.Add(item)
    for layer in ([] if repair else [k.F_Cu,k.B_Cu]):
        z=k.ZONE(b);z.SetLayer(layer);z.SetNetCode(b.FindNet('/GND').GetNetCode());z.SetLocalClearance(k.FromMM(.25));z.SetMinThickness(k.FromMM(.2));z.SetThermalReliefGap(k.FromMM(.25));z.SetThermalReliefSpokeWidth(k.FromMM(.3));z.SetPadConnection(k.ZONE_CONNECTION_THT_THERMAL);z.SetIslandRemovalMode(k.ISLAND_REMOVAL_MODE_ALWAYS)
        z.Outline().NewOutline()
        for x,y in [(OX+.5,OY+.5),(OX+(W-1)*STEP-.5,OY+.5),(OX+(W-1)*STEP-.5,OY+(H-1)*STEP-.5),(OX+.5,OY+(H-1)*STEP-.5)]:z.Outline().Append(int(k.FromMM(x)),int(k.FromMM(y)))
        b.Add(z)
    for f in b.GetFootprints():
        if f.GetReference()=='J1':
            for p in f.Pads():
                if p.GetNumber()=='SH':p.SetLocalZoneConnection(k.ZONE_CONNECTION_FULL)
        if f.GetReference()=='U3':
            for p in f.Pads():
                if p.GetNumber()=='11':p.SetLocalZoneConnection(k.ZONE_CONNECTION_FULL)
    b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(TMP/'routing-candidate.kicad_pcb'),b)
    print('IMPORTED',segments,'segments',vias,'vias; failed:',fail,flush=True)
def repair_place():
    b=k.LoadBoard(str(TMP/'routing-candidate.kicad_pcb'));fs={f.GetReference():f for f in b.GetFootprints()}
    fs['D2'].SetOrientationDegrees(0);fs['D2'].SetPosition(pos(144,121))
    fs['C10'].SetOrientationDegrees(90);fs['C10'].SetPosition(pos(118,76.5))
    for t in list(b.GetTracks()):
        if t.GetNetname() in ['/PROT_VCC','/HOLD_EN','/PWR_HOLD']:b.Remove(t)
    b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(TMP/'routing-candidate.kicad_pcb'),b)
def stitch():
    b=k.LoadBoard(str(TMP/'routing-candidate.kicad_pcb'));gnd=b.FindNet('/GND').GetNetCode();zones={z.GetLayer():z for z in b.Zones() if z.GetNetCode()==gnd and not z.GetIsRuleArea()}
    polys={l:z.GetFilledPolysList(l) for l,z in zones.items()};holes=[]
    for f in b.GetFootprints():
        for p in f.Pads():
            ds=p.GetDrillSize()
            if ds.x or ds.y:holes.append((*xy(p.GetPosition()),mm(max(ds.x,ds.y))/2))
    for t in b.GetTracks():
        if isinstance(t,k.PCB_VIA):holes.append((*xy(t.GetPosition()),mm(t.GetDrillValue())/2))
    count=0
    def add(x,y):
        nonlocal count
        if any(math.hypot(x-hx,y-hy)<r+.42 for hx,hy,r in holes):return False
        for l,poly in polys.items():
            for a in range(0,360,30):
                v=pos(x+.36*math.cos(math.radians(a)),y+.36*math.sin(math.radians(a)))
                if not poly.Contains(v):return False
        via=k.PCB_VIA(b);via.SetPosition(pos(x,y));via.SetWidth(k.FromMM(.6));via.SetDrill(k.FromMM(.3));via.SetViaType(k.VIATYPE_THROUGH);via.SetLayerPair(k.F_Cu,k.B_Cu);via.SetNetCode(gnd);b.Add(via);holes.append((x,y,.15));count+=1;return True
    # Stitch every reasonably wide top/bottom island to the opposing pour.
    for l,poly in polys.items():
        for o in outline(poly):
            x0=min(p[0] for p in o);x1=max(p[0] for p in o);y0=min(p[1] for p in o);y1=max(p[1] for p in o)
            done=False
            for yi in range(math.ceil(y0*2),math.floor(y1*2)+1):
                for xi in range(math.ceil(x0*2),math.floor(x1*2)+1):
                    x,y=xi/2,yi/2
                    if add(x,y):done=True;break
                if done:break
    for yi in range(78,123,5):
        for xi in range(90,184,5):add(xi,yi)
    b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(TMP/'routing-candidate.kicad_pcb'),b);print('Added',count,'ground stitching vias',flush=True)
def repair_power():
    b=k.LoadBoard(str(TMP/'routing-candidate.kicad_pcb'))
    fs=list(b.GetFootprints())
    for f in fs:
        if f.GetReference()=='J2':
            for p in f.Pads():
                if p.GetNumber()=='33':p.SetLocalZoneConnection(k.ZONE_CONNECTION_FULL)
    for t in list(b.GetTracks()):
        if t.GetNetname() in ['/PROT_VCC','/BATT_NEG']:b.Remove(t)
    b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(TMP/'routing-candidate.kicad_pcb'),b)
if __name__=='__main__':
    import sys
    {'place':place,'prepare':prepare,'import':import_route,'repair_prepare':lambda:prepare(True),'repair_import':lambda:import_route(True),'repair_place':repair_place,'stitch':stitch,'repair_power':repair_power}[sys.argv[1]]()
