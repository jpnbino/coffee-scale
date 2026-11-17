"""Validate preserved owner placements, passive axes and schematic connectivity."""
from audit_symbols import *
import pcbnew as k,sys
root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('src/revision-revE')
netlist=parse((root/'current.net').read_text(encoding='utf-8'));mapping={}
for net in cs(one(netlist,'nets'),'net'):
    for node in cs(net,'node'):mapping[val(one(node,'ref')[1]),val(one(node,'pin')[1])]=val(one(net,'name')[1])
b=k.LoadBoard(str(root/'pico_scale_controller.kicad_pcb'));fs={f.GetReference():f for f in b.GetFootprints()}
lock=json.loads((root/'user-placement-lock.json').read_text())
for ref,item in lock.items():
    f=fs[ref];assert all(abs(k.ToMM(v)-target)<1e-6 for v,target in zip([f.GetPosition().x,f.GetPosition().y],item['position'])),ref
    assert abs(f.GetOrientationDegrees()-item['orientation'])<1e-6 and f.GetLayerName()==item['layer'],ref
checked=0;aligned=[]
for ref,f in fs.items():
    for p in f.Pads():
        if p.GetNetname():assert mapping.get((ref,p.GetNumber()))==p.GetNetname(),(ref,p.GetNumber(),p.GetNetname());checked+=1
    if ref.startswith(('R','C')) and ref[1:].isdigit():
        assert abs(f.GetOrientationDegrees()%180)<1e-6,ref
        aligned.append(ref)
assert len(fs)==68 and checked==288
bb=b.GetBoardEdgesBoundingBox();assert abs(k.ToMM(bb.GetWidth())-100.05)<.001 and abs(k.ToMM(bb.GetHeight())-60.05)<.001
assert b.GetCopperLayerCount()==2 and b.GetDesignSettings().GetBoardThickness()==k.FromMM(1.6)
for ref in ['H1','H2','H3','H4']:
    p=next(iter(fs[ref].Pads()));assert p.GetDrillSize().x==k.FromMM(3.2)
assert len([z for z in b.Zones() if not z.GetIsRuleArea()])==2
print(f'PASS: {len(lock)} owner anchors preserved, {len(aligned)} horizontal R/C axes, {checked} pads match schematic, 68 footprints, 100x60x1.6mm, two copper layers.')
