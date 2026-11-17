"""Apply final functional silkscreen, artwork and black/ENIG stackup."""
from route_board import *
from audit_symbols import parse,dump
import sys
is_d=len(sys.argv)>1 and sys.argv[1]=='D'
is_e=len(sys.argv)>1 and sys.argv[1]=='E'
REV=ROOT/('revision-revE' if is_e else 'concept-revD' if is_d else 'concept-revC');source=pathlib.Path('tmp/reve-routing/routing-candidate.kicad_pcb' if is_e else 'tmp/revd-routing/routing-candidate.kicad_pcb' if is_d else 'tmp/revc-routing/routing-candidate.kicad_pcb')
tree=parse(source.read_text(encoding='utf-8'));tree=[i for i in tree if not(isinstance(i,list) and i[0] in ['gr_text','gr_line'])]
setup=next(i for i in tree if isinstance(i,list) and i[0]=='setup')
setup[:]=[i for i in setup if not(isinstance(i,list) and i[0]=='stackup')]
setup.append(parse('(stackup (layer "F.SilkS" (type "Top Silk Screen") (color "White")) (layer "F.Paste" (type "Top Solder Paste")) (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01) (color "Black") (epsilon_r 3.3) (loss_tangent 0)) (layer "F.Cu" (type "copper") (thickness 0.035)) (layer "dielectric 1" (type "core") (thickness 1.51) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02)) (layer "B.Cu" (type "copper") (thickness 0.035)) (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01) (color "Black") (epsilon_r 3.3) (loss_tangent 0)) (layer "B.Paste" (type "Bottom Solder Paste")) (layer "B.SilkS" (type "Bottom Silk Screen") (color "White")) (copper_finish "ENIG") (dielectric_constraints no) (edge_connector no) (castellated_pads no) (edge_plating no))'))
raw=TMP/'revc-finishing.kicad_pcb';raw.write_text(dump(tree),encoding='utf-8');b=k.LoadBoard(str(raw));fs={f.GetReference():f for f in b.GetFootprints()}
f=fs['SW1'];f.Models().clear()
for file in (['TS43_manufacturer.wrl'] if is_d or is_e else ['PEC12R_clearance_reference.wrl','Thumbwheel_D14_prototype.wrl']):
    m=k.FP_3DMODEL();m.m_Filename='${KIPRJMOD}/models/'+file;f.Add3DModel(m)
obstacles={k.F_SilkS:[],k.B_SilkS:[]}
for f in fs.values():
    f.Value().SetVisible(False);f.Reference().SetVisible(False);f.Reference().SetLayer(k.B_Fab if f.GetLayer()==k.B_Cu else k.F_Fab)
    for silk,cu in [(k.F_SilkS,k.F_Cu),(k.B_SilkS,k.B_Cu)]:
        for p in f.Pads():
            if p.GetLayerSet().Contains(cu):
                pts=[p for o in outline(p.GetEffectivePolygon(cu)) for p in o]
                if pts:obstacles[silk].append((min(x for x,y in pts)-.2,min(y for x,y in pts)-.2,max(x for x,y in pts)+.2,max(y for x,y in pts)+.2))
        for g in f.GraphicalItems():
            if g.GetLayer()==silk:
                q=g.GetBoundingBox();obstacles[silk].append((mm(q.GetX())-.15,mm(q.GetY())-.15,mm(q.GetRight())+.15,mm(q.GetBottom())+.15))
for t in b.GetTracks():
    if isinstance(t,k.PCB_VIA):
        x,y=xy(t.GetPosition());r=mm(t.GetWidth(k.F_Cu))/2+.2
        for obs in obstacles.values():obs.append((x-r,y-r,x+r,y+r))
def label(text,x,y,layer=k.F_SilkS,size=.8,reach=5):
    w=len(text)*size+.4;h=size+0.5;candidates=[(x+dx/2,y+dy/2) for dx in range(-reach*2,reach*2+1) for dy in range(-reach*2,reach*2+1)];candidates.sort(key=lambda p:(p[0]-x)**2+(p[1]-y)**2)
    for px,py in candidates:
        bb=(px-w/2,py-h/2,px+w/2,py+h/2)
        if bb[0]<86 or bb[1]<75.2 or bb[2]>184 or bb[3]>132.8 or any(overlap(bb,o) for o in obstacles[layer]):continue
        t=k.PCB_TEXT(b);t.SetText(text);t.SetPosition(pos(px,py));t.SetLayer(layer);t.SetMirrored(layer==k.B_SilkS);t.SetTextSize(pos(size,size));t.SetTextThickness(k.FromMM(.12));b.Add(t);obstacles[layer].append(bb);return
    print('No silk position:',text)
for r in ['U1','U2','U3','U4','U5','Q5','Q6','J1','J3','J4','J5','J6']:
    x,y=xy(fs[r].GetPosition());label(r,x,y)
for text,x,y in [('TARE',143,132),('START / STOP',157,132),('MENU / WAKE',174,108),('ON',180,96),('OFF',180,104),('BAT+',101,88),('SWD / UART',106,125),('3V3 REF',106,127),('COFFEE',98,111),('SCALE',98,114)]:
    if is_e:
        x,y={'TARE':(165.5,105),'START / STOP':(161,128),'MENU / WAKE':(176,111),'ON':(180,96),'OFF':(180,104),'BAT+':(169,85),'SWD / UART':(93,109),'3V3 REF':(93,111),'COFFEE':(115,128),'SCALE':(115,131)}[text]
    elif is_d:
        if text=='BAT+':x,y=169,88
        elif text=='MENU / WAKE':x,y=171,127
        elif text in ['SWD / UART','3V3 REF']:x=96
        elif text in ['COFFEE','SCALE']:x=91
    label('MENU' if is_e and text=='MENU / WAKE' else text,x,y,size=1 if text in ['COFFEE','SCALE'] else .8)
label('PIEZO',148,127,k.B_SilkS)
for j in range(4):
    pts=[(88+i*.25,120+j*.5+.05*(i*.25)**2) for i in range(23)] if is_d or is_e else [(92+i*.5,118+j*.8+.025*(i*.5)**2) for i in range(23)]
    for a,e in zip(pts,pts[1:]):
        bb=(min(a[0],e[0])-.2,min(a[1],e[1])-.2,max(a[0],e[0])+.2,max(a[1],e[1])+.2)
        if any(overlap(bb,o) for o in obstacles[k.F_SilkS]):continue
        g=k.PCB_SHAPE(b);g.SetShape(k.SHAPE_T_SEGMENT);g.SetStart(pos(*a));g.SetEnd(pos(*e));g.SetLayer(k.F_SilkS);g.SetWidth(k.FromMM(.1));b.Add(g)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(REV/'pico_scale_controller.kicad_pcb'),b)
print('Finished black/ENIG revision and functional markings:',REV)
