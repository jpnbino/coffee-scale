"""Check the TS43 pinout, power isolation and requested Rev D placement."""
from audit_symbols import *
import pcbnew as k,sys
root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('pico_scale_controller/concept-revD');n=parse((root/'current.net').read_text(encoding='utf-8'));mapping={}
for net in cs(one(n,'nets'),'net'):
    for node in cs(net,'node'):mapping[val(one(node,'ref')[1]),val(one(node,'pin')[1])]=val(one(net,'name')[1])
expected={'J2':{'11':'BTN1','12':'BTN2','14':'NAV_UP','15':'NAV_DOWN','19':'NAV_PUSH','17':'PWR_HOLD','36':'3V3','37':'GND'},'SW1':{'1':'NAV_UP','5':'NAV_DOWN','3':'WAKE_N','C':'GND','SH':'GND'},'Q5':{'1':'WAKE_N','2':'RAW_SW','3':'WAKE_HI'},'Q6':{'1':'WAKE_N','2':'GND','3':'NAV_PUSH'},'D3':{'1':'HOLD_EN','2':'WAKE_HI'},'D2':{'1':'HOLD_EN','2':'PWR_HOLD'},'J4':{'1':'BAT_P','2':'BATT_NEG'},'J6':{'1':'3V3','2':'GND','3':'CELL_A_P','4':'CELL_A_N'}}
for ref,pins in expected.items():
    for pin,net in pins.items():assert mapping[ref,pin]=='/'+net,(ref,pin,mapping.get((ref,pin)),net)
for pin in ['2','4']:assert mapping['SW1',pin].startswith('unconnected-')
b=k.LoadBoard(str(root/'pico_scale_controller.kicad_pcb'));fs={f.GetReference():f for f in b.GetFootprints()};checked=0
assert len(fs)==68 and 'SW4' not in fs and 'SW5' not in fs
assert fs['SW1'].GetOrientationDegrees()==-90
assert abs(k.ToMM(fs['J2'].GetPosition().x)-112)<.01
assert abs(k.ToMM(fs['J5'].GetPosition().x)-97)<.01
assert abs(k.ToMM(fs['J4'].GetPosition().x)-169)<.01
assert k.ToMM(fs['U5'].GetPosition().y)<95 and k.ToMM(fs['J6'].GetPosition().y)<80
for ref,f in fs.items():
    for p in f.Pads():
        if p.GetNetname():assert mapping.get((ref,p.GetNumber()))==p.GetNetname(),(ref,p.GetNumber(),p.GetNetname());checked+=1
bb=b.GetBoardEdgesBoundingBox();assert abs(k.ToMM(bb.GetWidth())-100.05)<.001 and abs(k.ToMM(bb.GetHeight())-60.05)<.001
assert b.GetDesignSettings().GetBoardThickness()==k.FromMM(1.6)
assert len([z for z in b.Zones() if not z.GetIsRuleArea()])==2
assert sum(p.GetAttribute()==k.PAD_ATTRIB_NPTH for p in fs['SW1'].Pads())==2
print(f'PASS: {checked} named pads match schematic; TS43 UP/DOWN/select pinout and isolated wake; 68 footprints; left Pico/debug, upper ADC/pads, battery near USB; 100x60x1.6mm.')
