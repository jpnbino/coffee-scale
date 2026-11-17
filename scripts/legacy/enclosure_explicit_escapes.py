"""Use explicit bottom-layer terminals at the remaining pad transitions."""
from route_board import *
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');p=r.TMP/'routing-candidate.kicad_pcb';b=k.LoadBoard(str(p))
f=next(f for f in b.GetFootprints() if f.GetReference()=='R1');pad=next(p for p in f.Pads() if p.GetNumber()=='1')
v=k.PCB_VIA(b);v.SetPosition(pad.GetPosition());v.SetWidth(k.FromMM(.6));v.SetDrill(k.FromMM(.3));v.SetViaType(k.VIATYPE_THROUGH);v.SetLayerPair(k.F_Cu,k.B_Cu);v.SetNetCode(pad.GetNetCode());b.Add(v)
k.SaveBoard(str(p),b);r.prepare(True,['/USB5','/CHG_PROG','/HX_DOUT'])
p=r.TMP/'repair-input.txt';lines=p.read_text().splitlines();at=2+int(lines[1]);at+=1+int(lines[at]);prefix=lines[:at]
terms={'/USB5':[(117.8,82.95),(109.05,85)],'/CHG_PROG':[(111.1375,81.05),(106,85.825)],'/HX_DOUT':[(144.635,78.525),(115.36,89.61)]}
rows=['3']
for name,points in terms.items():
    rows.append(f'{b.FindNet(name).GetNetCode()} {name} 0.2 2')
    rows.extend(f'{round((x-OX)/STEP)} {round((y-OY)/STEP)} 1' for x,y in points)
p.write_text('\n'.join(prefix+rows)+'\n')
