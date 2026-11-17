"""Use a fine grid for the two remaining signal/power escapes."""
import route_board as r
from route_board import k,pathlib
r.TMP=pathlib.Path('tmp/revc-routing');r.H=2401;r.W=4001;r.STEP=.025
p=r.TMP/'routing-candidate.kicad_pcb';b=k.LoadBoard(str(p))
for f in b.GetFootprints():
    if f.GetReference()=='J2':
        for pad in f.Pads():
            if pad.GetNumber()=='13':pad.SetLocalZoneConnection(k.ZONE_CONNECTION_FULL)
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(p),b)
r.prepare(True,['/CELL_A_N','/SYS_LATCH'])
