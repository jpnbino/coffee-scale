"""Open the blocked regulator output escape and reconnect the Pico bypass bank."""
from audit_symbols import *
import route_board as r
r.TMP=pathlib.Path('tmp/reve-routing');r.STEP=.025;r.W=4001;r.H=2401
p=r.TMP/'routing-candidate.kicad_pcb';tree=parse(p.read_text(encoding='utf-8'))
tree=[i for i in tree if not(isinstance(i,list) and i[0] in ['segment','via'] and val(one(i,'net')[1])=='/SYS_LATCH')]
p.write_text(dump(tree),encoding='utf-8');b=r.k.LoadBoard(str(p))
for a,e in [((140.2125,126),(141.55,126)),((141.55,126),(141.65,125.9)),((95.275,114.5),(95.275,117)),((95.275,114.5),(98.28,114.5)),((98.28,114.5),(98.31,114.47)),((98.31,114.47),(99.11,114.47))]:
    t=r.k.PCB_TRACK(b);t.SetStart(r.pos(*a));t.SetEnd(r.pos(*e));t.SetWidth(r.k.FromMM(.2));t.SetLayer(r.k.F_Cu);t.SetNetCode(b.FindNet('/3V3').GetNetCode());b.Add(t)
b.BuildConnectivity();r.k.ZONE_FILLER(b).Fill(b.Zones());r.k.SaveBoard(str(p),b)
r.prepare(True,['/3V3'])
