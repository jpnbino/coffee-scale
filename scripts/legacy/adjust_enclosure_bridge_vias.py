"""Move escape transitions into clear gaps between existing copper features."""
from route_board import *
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');p=r.TMP/'routing-candidate.kicad_pcb';b=k.LoadBoard(str(p))
for net,old,new in [('/USB5',(113,87),(113,86.6)),('/HX_DOUT',(144.635,76.5),(144.635,75.8))]:
    for t in b.GetTracks():
        if t.GetNetname()!=net:continue
        if isinstance(t,k.PCB_VIA):
            if xy(t.GetPosition())==old:t.SetPosition(pos(*new))
        else:
            if xy(t.GetStart())==old:t.SetStart(pos(*new))
            if xy(t.GetEnd())==old:t.SetEnd(pos(*new))
k.SaveBoard(str(p),b);r.prepare(True,['/USB5','/HX_DOUT'])
p=r.TMP/'repair-input.txt';lines=p.read_text().splitlines();at=2+int(lines[1]);at+=1+int(lines[at]);prefix=lines[:at]
terms={'/USB5':[(113,86.6),(117.8,82.95)],'/HX_DOUT':[(144.635,75.8),(115.36,89.61)]};rows=['2']
for name,points in terms.items():
    rows.append(f'{b.FindNet(name).GetNetCode()} {name} 0.2 2');rows.extend(f'{round((x-OX)/STEP)} {round((y-OY)/STEP)} 0' for x,y in points)
p.write_text('\n'.join(prefix+rows)+'\n')
