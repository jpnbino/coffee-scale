"""Provide explicit layer transitions at three congested SMD pad escapes."""
from route_board import *
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');path=r.TMP/'routing-candidate.kicad_pcb';b=k.LoadBoard(str(path));fs={f.GetReference():f for f in b.GetFootprints()}
for ref,pin in [('C8','1'),('U1','5'),('U5','12')]:
    p=next(p for p in fs[ref].Pads() if p.GetNumber()==pin)
    v=k.PCB_VIA(b);v.SetPosition(p.GetPosition());v.SetWidth(k.FromMM(.6));v.SetDrill(k.FromMM(.3));v.SetViaType(k.VIATYPE_THROUGH);v.SetLayerPair(k.F_Cu,k.B_Cu);v.SetNetCode(p.GetNetCode());b.Add(v)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(path),b)
r.prepare(True,['/HX_DOUT','/CHG_PROG','/USB5'])
