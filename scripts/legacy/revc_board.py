"""Place Concept C using native geometry and the exported schematic netlist."""
from route_board import *
from audit_symbols import parse,one,cs,val,dump,q,BASE
import uuid,sys
is_d=len(sys.argv)>1 and sys.argv[1]=='D'
REV=ROOT/('concept-revD' if is_d else 'concept-revC');meta=json.loads((REV/'parts.json').read_text());parts=meta['parts']
tree=parse((ROOT/'pico_scale_controller.kicad_pcb').read_text(encoding='utf-8'))
def ref(f):return val(next(p for p in cs(f,'property') if val(p[1])=='Reference')[2])
kept=[]
for i in tree:
    if not isinstance(i,list):kept.append(i);continue
    if i[0] in ['segment','via','zone','gr_text','gr_line','gr_arc']:continue
    if i[0]=='footprint' and (ref(i) not in parts and not ref(i).startswith('H')):continue
    if i[0]=='footprint' and ref(i)=='SW1':continue
    kept.append(i)
one(next(i for i in kept if isinstance(i,list) and i[0]=='gr_rect'),'end')[2]='134'
present={ref(i) for i in kept if isinstance(i,list) and i[0]=='footprint'}
def reuuid(a):
    for v in a:
        if isinstance(v,list):
            if v[0]=='uuid':v[1]=q(str(uuid.uuid4()))
            else:reuuid(v)
for name,p in parts.items():
    if name in present:continue
    lib,fname=p['fp'].split(':');fpath=REV/'Scale.pretty'/f'{fname}.kicad_mod' if lib=='Scale' else BASE/'footprints'/f'{lib}.pretty'/f'{fname}.kicad_mod';f=parse(fpath.read_text(encoding='utf-8'));reuuid(f)
    f[1]=q(p['fp']);f[:]=[i for i in f if not(isinstance(i,list) and i[0] in ['version','generator','generator_version'])]
    one(next(x for x in cs(f,'property') if val(x[1])=='Reference'),'at')[1:]=['0','0','0']
    next(x for x in cs(f,'property') if val(x[1])=='Reference')[2]=q(name)
    next(x for x in cs(f,'property') if val(x[1])=='Value')[2]=q(p['value'])
    f.append(['path',q('/'+meta['root_uuid']+'/'+p['uuid'])]);f.append(['uuid',q(str(uuid.uuid4()))]);kept.append(f)
raw=TMP/'revc-base.kicad_pcb';raw.write_text(dump(kept),encoding='utf-8');b=k.LoadBoard(str(raw));fs={f.GetReference():f for f in b.GetFootprints()}
netlist=parse((REV/'current.net').read_text(encoding='utf-8'));mapping={}
for net in cs(one(netlist,'nets'),'net'):
    name=val(one(net,'name')[1]);item=b.FindNet(name)
    if not item:item=k.NETINFO_ITEM(b,name);b.Add(item)
    for node in cs(net,'node'):mapping[val(one(node,'ref')[1]),val(one(node,'pin')[1])]=item
for name,f in fs.items():
    if f.GetLayer()==k.B_Cu:f.Flip(f.GetPosition(),False)
    if name in parts:f.SetValue(parts[name]['value'])
    for p in f.Pads():
        net=mapping.get((name,p.GetNumber()));p.SetNet(net if net else b.FindNet(0))
    if name.startswith('H'):f.SetAttributes(f.GetAttributes()|k.FP_BOARD_ONLY)
anchors={'J2':(122,100,180),'J4':(101.5,82.45,180),'J6':(88.5,104,90),'U5':(99,98,0),'J5':(107,109,0),
 'J3':(145.19,86.84,90),'SW2':(143,127,0),'SW3':(157,127,0),'SW1':(170.75,119.5,180),
 'SW6':(181.2,100,90),'J1':(181.325,88,90),'BZ1':(148,117,0),
 'H1':(90,79,0),'H2':(180,79,0),'H3':(90,129,0),'H4':(180,129,0),
 'U1':(170,84,0),'C8':(170,80,0),'C9':(170,88,0),'R1':(166,84,0),'R11':(174,88,90),'R12':(174,91,90),
 'D1':(171,96,0),'Q4':(165,94,0),'R13':(164,98,0),
 'U2':(158,82,0),'Q2':(154,82,0),'Q3':(153,87,0),'R14':(159,78,0),'R15':(158,88,0),'C10':(154,78,0),
 'U4':(169,104,0),'C11':(174,102,0),'C12':(171,107,0),
 'U3':(163,105,0),'L1':(157,105,0),'C13':(163,101,0),'C14':(166,101,0),'C15':(163,109,0),'C16':(160,109,0),
 'Q5':(177,105,0),'Q6':(174,110,0),'R18':(178,109,0),'R17':(174,113,0),'D2':(168,111,0),'D3':(171,111,0),'R16':(166,115,0),'C20':(169,115,0),
 'C3':(104,94,90),'C4':(104,97,90),'C5':(94,102,90),'C6':(94,97,0),
 'R2':(139,89,0),'R3':(139,92,0),'C7':(148,82,0),'R4':(138,121,0),'R5':(155,121,0),
 'R6':(162,117,0),'R7':(162,120,0),'C17':(158,117,0),'C18':(158,120,0),'C19':(176,116,0),
 'Q1':(146,116,90),'R8':(141,116,0),'R9':(141,119,0),'R10':(151,116,90),'C1':(137,113,0),'C2':(137,116,0)}
if is_d:
    anchors.update({'J2':(112,100,180),'J5':(97,109,0),'J4':(169,82.45,180),'J6':(136,77.2,0),'U5':(145,87.5,90),'J3':(134,96,90),'SW1':(175,117,-90),'C3':(151,93,0),'C4':(154,93,0),'C5':(139,92,0),'C6':(151,88,0),'U1':(171,93,0),'C8':(172,89,0),'C9':(168,93,0),'R1':(168,96,90),'R2':(132,98,0),'R3':(132,101,0),'C7':(142,93,0)})
fixed=['J1','J2','J3','J4','J5','J6','SW1','SW2','SW3','SW6','H1','H2','H3','H4']
for name,f in fs.items():
    x,y,a=anchors.get(name,(*xy(f.GetPosition()),0));f.SetOrientationDegrees(a);f.SetPosition(pos(x,y))
f=fs['BZ1'];f.Flip(f.GetPosition(),False);f.SetOrientationDegrees(0);f.SetPosition(pos(148,117))
occupied=[box(fs[name]) for name in fixed]
order=['U5','U1','U3','L1','C13','C14','C15','C16','U4','Q5','Q6','C3','C4','C5','C6']
order += [name for name in fs if name not in fixed+order+['BZ1']]
for name in order:
    f=fs[name];x,y=xy(f.GetPosition());candidates=[(x+dx*.5,y+dy*.5) for dx in range(-24,25) for dy in range(-24,25)];candidates.sort(key=lambda p:(p[0]-x)**2+(p[1]-y)**2)
    for px,py in candidates:
        f.SetPosition(pos(px,py));bb=box(f)
        if bb[0]<86 or bb[1]<75 or bb[2]>184 or bb[3]>133 or any(overlap(bb,o) for o in occupied):continue
        occupied.append(bb);break
    else:raise RuntimeError('No placement '+name)
    f.Reference().SetVisible(False)
title=b.GetTitleBlock();title.SetRevision('D - TS43 and upper ADC' if is_d else 'C - two buttons and encoder');b.SetTitleBlock(title)
for f in fs.values():f.Reference().SetVisible(False)
b.BuildConnectivity();k.SaveBoard(str(REV/'pico_scale_controller.kicad_pcb'),b)
print('Placed',len(fs),'footprints on 100x60mm Rev C')
