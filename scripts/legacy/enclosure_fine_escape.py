"""Resolve narrow but valid Pico header escape channels on a finer grid."""
from route_board import *
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');r.STEP=.025;r.W=4001;r.H=2001
r.prepare(True,['/USB5','/HX_DOUT'])
b=k.LoadBoard(str(r.TMP/'routing-candidate.kicad_pcb'));p=r.TMP/'repair-input.txt';lines=p.read_text().splitlines();at=2+int(lines[1]);at+=1+int(lines[at]);prefix=lines[:at]
terms={'/USB5':[(113,86.6,0),(159.9,81.4,1)],'/HX_DOUT':[(144.635,75.8,0),(115.36,89.61,1)]};rows=['2']
for name,points in terms.items():
    rows.append(f'{b.FindNet(name).GetNetCode()} {name} 0.2 2');rows.extend(f'{round((x-OX)/r.STEP)} {round((y-OY)/r.STEP)} {l}' for x,y,l in points)
p.write_text('\n'.join(prefix+rows)+'\n')
