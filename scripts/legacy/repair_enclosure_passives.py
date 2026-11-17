"""Relocate congested passives and reroute their local connections."""
from route_board import *
from audit_symbols import parse,one,val,dump
import sys,runpy
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');path=r.TMP/'routing-candidate.kicad_pcb'
tree=parse(path.read_text(encoding='utf-8'));clean=[]
for i in tree:
    if not isinstance(i,list):clean.append(i);continue
    if i[0] in ['segment','via']:
        net=one(i,'net');name=val(net[1]) if net else ''
        if name=='/PROT_CS':continue
        if name=='/GND' and i[0]=='via' and one(i,'at')[1] in ['119.175']:continue
        if name=='/GND' and i[0]=='segment' and one(i,'start')[1:]==['119.175','79.5']:continue
    clean.append(i)
path.write_text(dump(clean),encoding='utf-8')
sys.argv=['ground_groups.py',str(r.TMP)];g=runpy.run_path(str(pathlib.Path(__file__).with_name('ground_groups.py')))
b=g['b'];fs={f.GetReference():f for f in b.GetFootprints()};pad=next(p for p in fs['R15'].Pads() if p.GetNumber()=='1')
group=next(group for group in g['groups'].values() if any(g['copper'][l].Contains(pad.GetPosition(),i) for l,i in group if l==k.F_Cu))
remove=set()
for t in b.GetTracks():
    if t.GetNetname()!='/GND' or isinstance(t,k.PCB_VIA):continue
    if any(g['copper'][l].Contains(t.GetStart(),i) for l,i in group if l==t.GetLayer()):remove.add(str(t.m_Uuid))
clean=[i for i in clean if not(isinstance(i,list) and i[0]=='segment' and val(one(i,'uuid')[1]) in remove)]
path.write_text(dump(clean),encoding='utf-8')
b=k.LoadBoard(str(path));fs={f.GetReference():f for f in b.GetFootprints()}
f=fs['R15'];f.Flip(f.GetPosition(),False);f.SetOrientationDegrees(0);f.SetPosition(pos(113,82))
fs['R3'].SetPosition(pos(148,95.5))
ground=next(p for p in f.Pads() if p.GetNumber()=='1');v=k.PCB_VIA(b);v.SetPosition(ground.GetPosition());v.SetWidth(k.FromMM(.6));v.SetDrill(k.FromMM(.3));v.SetViaType(k.VIATYPE_THROUGH);v.SetLayerPair(k.F_Cu,k.B_Cu);v.SetNetCode(b.FindNet('/GND').GetNetCode());b.Add(v)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(path),b)
r.prepare(True,['/3V3','/I2C_SCL','/PROT_CS'])
p=r.TMP/'repair-input.txt';lines=p.read_text().splitlines();at=2+int(lines[1]);at+=1+int(lines[at]);prefix=lines[:at]
terms={'/3V3':[(147.175,95.5,0),(151.54,90,0),(144.7,95,0),(143.175,88,0)],'/I2C_SCL':[(148.825,95.5,0),(154.08,90,0),(146.3,95,0)]}
terms['/PROT_CS']=[(*xy(pad.GetPosition()),0 if pad.GetLayerSet().Contains(k.F_Cu) else 1) for f in fs.values() for pad in f.Pads() if pad.GetNetname()=='/PROT_CS']
rows=[str(len(terms))]
for name,points in terms.items():
    rows.append(f'{b.FindNet(name).GetNetCode()} {name} 0.2 {len(points)}')
    rows.extend(f'{round((x-OX)/STEP)} {round((y-OY)/STEP)} {l}' for x,y,l in points)
p.write_text('\n'.join(prefix+rows)+'\n')
print('Removed old isolated ground branch; moved pull-up and protection resistor')
