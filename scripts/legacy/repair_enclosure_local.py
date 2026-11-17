"""Local grounded pad escapes and two-terminal pull-up routing repair."""
import sys
from route_board import *
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing')
if sys.argv[1]=='prepare':
    b=k.LoadBoard(str(r.TMP/'routing-candidate.kicad_pcb'));fs={f.GetReference():f for f in b.GetFootprints()}
    fs['R3'].SetPosition(pos(145.5,95))
    for x,y in [(108.8625,82),(119.175,80.5)]:
        v=k.PCB_VIA(b);v.SetPosition(pos(x,y));v.SetWidth(k.FromMM(.6));v.SetDrill(k.FromMM(.3));v.SetViaType(k.VIATYPE_THROUGH);v.SetLayerPair(k.F_Cu,k.B_Cu);v.SetNetCode(b.FindNet('/GND').GetNetCode());b.Add(v)
    t=k.PCB_TRACK(b);t.SetStart(pos(119.175,79.5));t.SetEnd(pos(119.175,80.5));t.SetWidth(k.FromMM(.2));t.SetLayer(k.F_Cu);t.SetNetCode(b.FindNet('/GND').GetNetCode());b.Add(t)
    b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(r.TMP/'routing-candidate.kicad_pcb'),b)
    r.prepare(True,['/3V3','/I2C_SCL'])
    p=r.TMP/'repair-input.txt';lines=p.read_text().splitlines();at=2+int(lines[1]);at+=1+int(lines[at]);prefix=lines[:at]
    terms={'/3V3':[(144.675,95),(151.54,90),(143.175,88)],'/I2C_SCL':[(146.325,95),(154.08,90)]}
    # The old 3V3 pad escape is included so its branch ends on the repaired net.
    rows=['2']
    for name,points in terms.items():
        rows.append(f'{b.FindNet(name).GetNetCode()} {name} 0.2 {len(points)}')
        rows.extend(f'{round((x-OX)/STEP)} {round((y-OY)/STEP)} 0' for x,y in points)
    p.write_text('\n'.join(prefix+rows)+'\n')
elif sys.argv[1]=='import':r.import_route(True)
