"""Verify netlist parity and the approved controller/wake/mechanical interfaces."""
from audit_symbols import *
import pcbnew as k
import sys
root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('pico_scale_controller/concept-revC');n=parse((root/'current.net').read_text(encoding='utf-8'));mapping={}
for net in cs(one(n,'nets'),'net'):
    for node in cs(net,'node'):mapping[val(one(node,'ref')[1]),val(one(node,'pin')[1])]=val(one(net,'name')[1])
expected={'J2':{'11':'BTN1','12':'BTN2','14':'ENC_A','15':'ENC_B','19':'ENC_PUSH','17':'PWR_HOLD','36':'3V3','37':'GND'},'SW1':{'A':'ENC_A','B':'ENC_B','C':'GND','SH':'GND','S1':'WAKE_N','S2':'GND'},'Q5':{'1':'WAKE_N','2':'RAW_SW','3':'WAKE_HI'},'Q6':{'1':'WAKE_N','2':'GND','3':'ENC_PUSH'},'D3':{'1':'HOLD_EN','2':'WAKE_HI'},'D2':{'1':'HOLD_EN','2':'PWR_HOLD'},'R18':{'1':'RAW_SW','2':'WAKE_N'},'R17':{'1':'3V3','2':'ENC_PUSH'},'C20':{'1':'HOLD_EN','2':'GND'},'J4':{'1':'BAT_P','2':'BATT_NEG'},'J6':{'1':'3V3','2':'GND','3':'CELL_A_P','4':'CELL_A_N'}}
for ref,pins in expected.items():
    for pin,net in pins.items():assert mapping[ref,pin]=='/'+net,(ref,pin,mapping.get((ref,pin)),net)
b=k.LoadBoard(str(root/'pico_scale_controller.kicad_pcb'));fs={f.GetReference():f for f in b.GetFootprints()};checked=0
assert len(fs)==68 and 'SW4' not in fs and 'SW5' not in fs
assert fs['J2'].GetOrientationDegrees()==180
assert fs['J1'].GetOrientationDegrees()==90 and fs['SW6'].GetOrientationDegrees()==90 and fs['SW1'].GetOrientationDegrees()==180
assert fs['BZ1'].GetLayer()==k.B_Cu
for name,f in fs.items():
    for p in f.Pads():
        if p.GetNetname():assert mapping.get((name,p.GetNumber()))==p.GetNetname(),(name,p.GetNumber(),p.GetNetname());checked+=1
bb=b.GetBoardEdgesBoundingBox();assert abs(k.ToMM(bb.GetWidth())-100.05)<.001 and abs(k.ToMM(bb.GetHeight())-60.05)<.001
assert b.GetDesignSettings().GetBoardThickness()==k.FromMM(1.6)
assert len([z for z in b.Zones() if not z.GetIsRuleArea()])==2
for name in ['H1','H2','H3','H4']:assert next(iter(fs[name].Pads())).GetDrillSize().x==k.FromMM(3.2)
print(f'PASS: {checked} named pads match schematic; 68 footprints; 100x60x1.6mm; four 3.2mm holes; approved Pico/control orientations; isolated active-high encoder wake interface.')
