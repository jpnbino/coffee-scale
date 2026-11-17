"""Assign explicit NC nets and mark mechanical-only footprints for parity."""
from route_board import *
from audit_symbols import parse,cs,one,val
netlist=parse((ROOT/'corrected.net').read_text(encoding='utf-8'));mapping={}
for net in cs(one(netlist,'nets'),'net'):
    for node in cs(net,'node'):mapping[val(one(node,'ref')[1]),val(one(node,'pin')[1])]=val(one(net,'name')[1])
b=k.LoadBoard(str(ROOT/'pico_scale_controller.kicad_pcb'));added=0
for f in b.GetFootprints():
    if f.GetReference() in ['H1','H2','H3','H4']:f.SetAttributes(f.GetAttributes()|k.FP_BOARD_ONLY)
    for p in f.Pads():
        name=mapping.get((f.GetReference(),p.GetNumber()))
        if not name:continue
        if p.GetNetname():assert p.GetNetname()==name,(f.GetReference(),p.GetNumber(),p.GetNetname(),name)
        else:
            net=b.FindNet(name)
            if not net:net=k.NETINFO_ITEM(b,name);b.Add(net)
            p.SetNet(net);added+=1
b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(TMP/'routing-final.kicad_pcb'),b)
print('Assigned',added,'intentional NC pad nets; mounting holes marked board-only')
