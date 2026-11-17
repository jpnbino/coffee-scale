"""Provide explicit pad escapes for the two remaining connections."""
import route_board as r
from route_board import *
r.TMP=pathlib.Path('tmp/revc-routing');r.W=4001;r.H=2401;r.STEP=.025
p=r.TMP/'routing-candidate.kicad_pcb';b=k.LoadBoard(str(p))
def via(name,x,y):
    v=k.PCB_VIA(b);v.SetPosition(pos(x,y));v.SetWidth(k.FromMM(.6));v.SetDrill(k.FromMM(.3));v.SetViaType(k.VIATYPE_THROUGH);v.SetLayerPair(k.F_Cu,k.B_Cu);v.SetNetCode(b.FindNet(name).GetNetCode());b.Add(v)
for name,x,y in [('/CELL_A_N',96.525,101.175),('/CELL_A_N',95.775,91.5),('/SYS_LATCH',170.9,103.35),('/SYS_LATCH',162.05,101)]:via(name,x,y)
t=k.PCB_TRACK(b);t.SetStart(pos(169.8375,103.35));t.SetEnd(pos(170.9,103.35));t.SetWidth(k.FromMM(.2));t.SetLayer(k.F_Cu);t.SetNetCode(b.FindNet('/SYS_LATCH').GetNetCode());b.Add(t)
k.SaveBoard(str(p),b);r.prepare(True,['/CELL_A_N','/SYS_LATCH'])
p=r.TMP/'repair-input.txt';lines=p.read_text().splitlines();at=2+int(lines[1]);at+=1+int(lines[at]);prefix=lines[:at];rows=['2']
for name,points in [('/CELL_A_N',[(96.525,101.175),(95.775,91.5)]),('/SYS_LATCH',[(170.9,103.35),(162.05,101)])]:
    rows.append(f'{b.FindNet(name).GetNetCode()} {name} 0.2 2');rows.extend(f'{round((x-OX)/r.STEP)} {round((y-OY)/r.STEP)} 1' for x,y in points)
p.write_text('\n'.join(prefix+rows)+'\n')
