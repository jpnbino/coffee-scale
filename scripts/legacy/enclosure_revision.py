"""Create a separate Rev B enclosure-layout candidate; preserve routed Rev A."""
from route_board import *
import shutil
from audit_symbols import parse,one,val,dump
REV=ROOT/'enclosure-revB';REV.mkdir(exist_ok=True)
source=ROOT/'pico_scale_controller.kicad_pcb'
backup=ROOT/'backup-before-enclosure';backup.mkdir(exist_ok=True)
for suffix in ['kicad_pcb','kicad_sch','kicad_pro','kicad_dru']:
    p=ROOT/('pico_scale_controller.'+suffix)
    if not (backup/p.name).exists():shutil.copy2(p,backup/p.name)
b=k.LoadBoard(str(source));fs={f.GetReference():f for f in b.GetFootprints()}
# Keep battery, Pico, mounting holes and the top button bank fixed.
positions={'J1':(181.325,96,90),'J6':(124,77.2,0),'U5':(144,81,90),
 'C3':(151,85,0),'C4':(154,85,0),'C5':(138,85,0),'C6':(151,81,0),
 'Q3':(120,84,0),'R15':(120,79,0),'J3':(149,90,90),
 'R2':(144,85,0),'R3':(144,87,0),'BZ1':(158,104,0),
 'R11':(174,92,90),'R12':(174,96,90),'D1':(165,82,90),
 'J5':(155,75.8,90),
 'SW2':(169,87,0),'SW4':(169,95,0),'SW5':(169,103,0),'SW3':(169,111,0),
 'R4':(163,87,0),'R5':(163,95,0),'R6':(163,103,0),'R7':(163,111,0)}
positions['SW1']=(141,118.5,0)
moved=set(positions)
# Delete routes on affected nets, retaining unaffected detailed power routing.
affected={p.GetNetname() for r in moved for p in fs[r].Pads() if p.GetNetname()}
tree=parse(source.read_text(encoding='utf-8'))
tree=[item for item in tree if not (isinstance(item,list) and item[0] in ['segment','via'])]
stripped=TMP/'enclosure-stripped.kicad_pcb';stripped.write_text(dump(tree),encoding='utf-8')
b=k.LoadBoard(str(stripped));fs={f.GetReference():f for f in b.GetFootprints()}
for r,(x,y,a) in positions.items():
    f=fs[r]
    if r=='BZ1':f.Flip(f.GetPosition(),False)
    f.SetOrientationDegrees(a);f.SetPosition(pos(x,y))
    f.Reference().SetPosition(pos(x,y-4));f.Reference().SetLayer(k.B_SilkS if r=='BZ1' else k.F_SilkS)
    if r=='BZ1':f.Reference().SetMirrored(True)
for r,filename in [('J3','OLED_096_photo_reference.wrl'),('BZ1','Buzzer_12mm_envelope.wrl')]:
    f=fs[r];f.Models().clear();model=k.FP_3DMODEL()
    model.m_Filename='${KIPRJMOD}/models/'+filename;f.Add3DModel(model)
fixed=['J1','J2','J3','J4','J5','J6','H1','H2','H3','H4','SW1','SW2','SW3','SW4','SW5','SW6']
occupied=[box(fs[r]) for r in fixed]
order=['U5','U3','L1','C13','C14','C15','C16','C6','C3','C4','C5','U1','U2','U4']
order += [r for r in fs if r not in fixed+order+['BZ1']]
for r in order:
    f=fs[r];x,y=xy(f.GetPosition())
    candidates=[(x+dx*.5,y+dy*.5) for dx in range(-32,33) for dy in range(-32,33)]
    candidates.sort(key=lambda p:(p[0]-x)**2+(p[1]-y)**2)
    for px,py in candidates:
        f.SetPosition(pos(px,py));bb=box(f)
        if bb[0]<86 or bb[1]<75 or bb[2]>184 or bb[3]>123 or any(overlap(bb,o) for o in occupied):continue
        occupied.append(bb);break
    else:raise RuntimeError('Cannot place '+r)
title=b.GetTitleBlock();title.SetRevision('B enclosure candidate');b.SetTitleBlock(title)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones())
k.SaveBoard(str(REV/'pico_scale_controller.kicad_pcb'),b)
# A complete project beside the candidate keeps KIPRJMOD/model paths portable.
for suffix in ['kicad_pro','kicad_sch','kicad_dru']:
    shutil.copy2(ROOT/('pico_scale_controller.'+suffix),REV/('pico_scale_controller.'+suffix))
for name in ['fp-lib-table','sym-lib-table','Scale.kicad_sym']:
    shutil.copy2(ROOT/name,REV/name)
shutil.copytree(ROOT/'Scale.pretty',REV/'Scale.pretty',dirs_exist_ok=True)
shutil.copytree(ROOT/'models',REV/'models',dirs_exist_ok=True)
print('Created separate candidate; reroute nets:',sorted(affected))
