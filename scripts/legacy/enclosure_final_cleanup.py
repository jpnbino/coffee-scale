"""Remove unused transitions and shift a via away from a clearance limit."""
from route_board import *
from audit_symbols import parse,one,dump
p=pathlib.Path('tmp/enclosure-routing/routing-candidate.kicad_pcb');tree=parse(p.read_text(encoding='utf-8'))
remove=[(119.5,77.5),(113,86.6),(144.635,75.8)]
tree=[i for i in tree if not(isinstance(i,list) and i[0]=='via' and tuple(float(x) for x in one(i,'at')[1:3]) in remove)]
p.write_text(dump(tree),encoding='utf-8');b=k.LoadBoard(str(p))
for t in b.GetTracks():
    if t.GetNetname()!='/HX_DOUT':continue
    if isinstance(t,k.PCB_VIA):
        if xy(t.GetPosition())==(109.025,87.675):t.SetPosition(pos(109,87.65))
    else:
        if xy(t.GetStart())==(109.025,87.675):t.SetStart(pos(109,87.65))
        if xy(t.GetEnd())==(109.025,87.675):t.SetEnd(pos(109,87.65))
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(p),b)
