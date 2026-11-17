"""Adjust two clearance escapes after exact KiCad DRC feedback."""
from route_board import *
p=pathlib.Path('tmp/enclosure-routing/routing-candidate.kicad_pcb');b=k.LoadBoard(str(p))
for t in b.GetTracks():
    if t.GetNetname()!='/GND':continue
    if isinstance(t,k.PCB_VIA):
        if xy(t.GetPosition())==(119.175,80.5):t.SetPosition(pos(119.175,78.7))
    else:
        if xy(t.GetStart())==(119.175,80.5):t.SetStart(pos(119.175,78.7))
        if xy(t.GetEnd())==(119.175,80.5):t.SetEnd(pos(119.175,78.7))
f=next(f for f in b.GetFootprints() if f.GetReference()=='R3');f.SetPosition(pos(145.5,94.5))
for x,name in [(144.7,'/3V3'),(146.3,'/I2C_SCL')]:
    t=k.PCB_TRACK(b);t.SetStart(pos(x,94.5));t.SetEnd(pos(x,95));t.SetWidth(k.FromMM(.2));t.SetLayer(k.F_Cu);t.SetNetCode(b.FindNet(name).GetNetCode());b.Add(t)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(p),b)
