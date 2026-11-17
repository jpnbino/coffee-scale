"""Reserve a short charger ground return before rerouting crossing signals."""
from route_board import *
p=pathlib.Path('tmp/enclosure-routing/routing-candidate.kicad_pcb');b=k.LoadBoard(str(p))
t=k.PCB_TRACK(b);t.SetStart(pos(108.8625,82));t.SetEnd(pos(110.95,85));t.SetWidth(k.FromMM(.2));t.SetLayer(k.B_Cu);t.SetNetCode(b.FindNet('/GND').GetNetCode());b.Add(t)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(p),b)
