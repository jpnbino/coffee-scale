"""Preserve the user's mechanical layout and align supporting circuit groups."""
from route_board import *
from audit_symbols import parse,dump
import shutil
REV=ROOT/'revision-revE';REV.mkdir(exist_ok=True);backup=ROOT/'backup-user-layout-before-revE';backup.mkdir(exist_ok=True)
for name in ['pico_scale_controller.kicad_pcb','pico_scale_controller.kicad_sch','pico_scale_controller.kicad_pro','pico_scale_controller.kicad_dru','Scale.kicad_sym']:
    if not (backup/name).exists():shutil.copy2(ROOT/name,backup/name)
for name in ['pico_scale_controller.kicad_sch','pico_scale_controller.kicad_pro','pico_scale_controller.kicad_dru','Scale.kicad_sym','fp-lib-table','sym-lib-table','current.net']:shutil.copy2(ROOT/name,REV/name)
for name in ['models','Scale.pretty']:shutil.copytree(ROOT/name,REV/name,dirs_exist_ok=True)
tree=parse((ROOT/'pico_scale_controller.kicad_pcb').read_text(encoding='utf-8'));tree=[i for i in tree if not(isinstance(i,list) and i[0] in ['segment','via','zone','gr_text','gr_line'])]
raw=TMP/'reve-base.kicad_pcb';raw.write_text(dump(tree),encoding='utf-8');b=k.LoadBoard(str(raw));fs={f.GetReference():f for f in b.GetFootprints()}
fixed=['J1','J2','J3','J4','J5','J6','SW1','SW2','SW3','SW6','U5','H1','H2','H3','H4','BZ1']
snapshot={r:{'position':xy(fs[r].GetPosition()),'orientation':fs[r].GetOrientationDegrees(),'layer':fs[r].GetLayerName()} for r in fixed}
(REV/'user-placement-lock.json').write_text(json.dumps(snapshot,indent=2)+'\n')
# Non-polar 0/180 degree parts share a horizontal physical axis. Electrical
# orientation is selected to keep supply/filter connections short.
groups=[
 {'name':'regulator switching cell','parts':{'U3':(139,127,0),'L1':(133,127,0),'C13':(139,123.5,0),'C14':(142.5,123.5,0),'C15':(143,127,0),'C16':(143,130.5,0)},'reach':3},
 {'name':'ADC supply and differential filter','parts':{'C3':(134.5,84,180),'C4':(138.5,92,0),'C5':(142,92,180),'C6':(145.8,92,180)},'reach':2},
 {'name':'Pico bypass bank','parts':{'C2':(95.5,114.5,180),'C1':(95.5,117,180)},'reach':2},
 {'name':'load switch and local capacitors','parts':{'U4':(171.5,101.5,0),'C11':(168,101.5,0),'C12':(175,101.5,0)},'reach':3},
 {'name':'charger and input network','parts':{'U1':(171,93,0),'R11':(175.5,86.5,0),'R12':(175.5,88.5,0),'R1':(175.5,90.5,0),'C8':(174.5,96.5,0),'C9':(170.5,96.5,180),'Q4':(163.5,93.5,0),'R13':(159.5,93.5,0),'D1':(163,98.5,0)},'reach':3},
 {'name':'battery protection','parts':{'U2':(158,82,0),'Q2':(153.5,82,0),'Q3':(153.5,87,0),'R14':(157.5,78,0),'C10':(161,78,0),'R15':(158,87,0)},'reach':3},
 {'name':'hold diode and RC row','parts':{'C20':(162,116.5,0),'D2':(165.5,116.5,0),'D3':(170,116.5,0),'R16':(173.5,116.5,0)},'reach':1},
 {'name':'navigation RC bank','parts':{'C17':(163,130,0),'C18':(166.5,130,0),'C19':(170,130,0),'R6':(163,132,0),'R7':(166.5,132,0),'R17':(170,132,0)},'reach':1},
 {'name':'buzzer driver','parts':{'Q1':(149,115,0),'R8':(145,114,0),'R9':(145,116.5,0),'R10':(153,115,0)},'reach':3},
 {'name':'display interface','parts':{'R2':(132,99,0),'R3':(132,101,0),'C7':(135.5,99,0)},'reach':3},
 {'name':'wake source','parts':{'Q5':(177,107,0),'R18':(181,108.5,0)},'reach':2},
 {'name':'wake sense','parts':{'Q6':(174,126.5,0)},'reach':2},
 {'name':'button pullups','parts':{'R4':(155.5,109.5,0),'R5':(155.5,123,0)},'reach':2}]
occupied=[box(fs[r]) for r in fixed if fs[r].GetLayer()==k.F_Cu];report=[]
for group in groups:
    parts=group['parts'];reach=int(group['reach']*2)
    candidates=[(dx*.5,dy*.5) for dx in range(-reach,reach+1) for dy in range(-reach,reach+1)];candidates.sort(key=lambda p:p[0]**2+p[1]**2)
    for dx,dy in candidates:
        bounds=[];valid=True
        for r,(x,y,a) in parts.items():
            f=fs[r];f.SetOrientationDegrees(a);f.SetPosition(pos(x+dx,y+dy));bb=box(f)
            if bb[0]<86 or bb[1]<75 or bb[2]>184 or bb[3]>133 or any(overlap(bb,o) for o in occupied+bounds):valid=False;break
            bounds.append(bb)
        if valid:
            occupied.extend(bounds);report.append({'group':group['name'],'offset':[dx,dy],'parts':list(parts)});break
    else:
        for r,(x,y,a) in parts.items():fs[r].SetOrientationDegrees(a);fs[r].SetPosition(pos(x,y))
        print({r:box(fs[r]) for r in parts})
        raise RuntimeError('Cannot place aligned group: '+group['name'])
assert set(fs)==set(fixed)|{r for g in groups for r in g['parts']}
for f in fs.values():f.Reference().SetVisible(False)
title=b.GetTitleBlock();title.SetRevision('E - user placement and aligned assembly');b.SetTitleBlock(title)
b.BuildConnectivity();k.SaveBoard(str(REV/'pico_scale_controller.kicad_pcb'),b)
(REV/'aligned-groups.json').write_text(json.dumps(report,indent=2)+'\n');print('Preserved',len(fixed),'user/mechanical anchors; aligned',len(groups),'functional groups')
