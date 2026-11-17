"""Escape two enclosed routing pockets into open top-layer copper."""
from route_board import *
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');p=r.TMP/'routing-candidate.kicad_pcb';b=k.LoadBoard(str(p))
for net,points in [('/USB5',[(109.05,85),(109.05,86.5),(109.55,87),(113,87)]),('/HX_DOUT',[(144.635,78.525),(144.635,76.5)])]:
    for a,e in zip(points,points[1:]):
        t=k.PCB_TRACK(b);t.SetStart(pos(*a));t.SetEnd(pos(*e));t.SetWidth(k.FromMM(.2));t.SetLayer(k.B_Cu);t.SetNetCode(b.FindNet(net).GetNetCode());b.Add(t)
    v=k.PCB_VIA(b);v.SetPosition(pos(*points[-1]));v.SetWidth(k.FromMM(.6));v.SetDrill(k.FromMM(.3));v.SetViaType(k.VIATYPE_THROUGH);v.SetLayerPair(k.F_Cu,k.B_Cu);v.SetNetCode(b.FindNet(net).GetNetCode());b.Add(v)
k.SaveBoard(str(p),b);r.prepare(True,['/USB5','/HX_DOUT'])
p=r.TMP/'repair-input.txt';lines=p.read_text().splitlines();at=2+int(lines[1]);at+=1+int(lines[at]);prefix=lines[:at]
terms={'/USB5':[(113,87),(117.8,82.95)],'/HX_DOUT':[(144.635,76.5),(115.36,89.61)]};rows=['2']
for name,points in terms.items():
    rows.append(f'{b.FindNet(name).GetNetCode()} {name} 0.2 2');rows.extend(f'{round((x-OX)/STEP)} {round((y-OY)/STEP)} 0' for x,y in points)
p.write_text('\n'.join(prefix+rows)+'\n')
