"""Build the approved two-button / encoder hardware revision as a candidate."""
import correct_design as d
from audit_symbols import *
import copy,shutil
REV=d.ROOT/'concept-revC';REV.mkdir(exist_ok=True)
backup=d.ROOT/'backup-before-revC';backup.mkdir(exist_ok=True)
for ext in ['kicad_pcb','kicad_sch','kicad_pro','kicad_dru']:
    p=d.ROOT/('pico_scale_controller.'+ext)
    if not (backup/p.name).exists():shutil.copy2(p,backup/p.name)
for name in ['pico_scale_controller.kicad_pro','pico_scale_controller.kicad_dru','fp-lib-table','sym-lib-table','Scale.kicad_sym']:
    shutil.copy2(d.ROOT/name,REV/name)
for name in ['Scale.pretty','models']:shutil.copytree(d.ROOT/name,REV/name,dirs_exist_ok=True)
refs=['J2','SW1','SW4','SW5','R6','R7']
coordinates=set();ids=set()
for ref in refs:
    s,a,fp=d.parts[ref];ids.add(one(s,'uuid')[1]);x,y=map(float,one(s,'at')[1:3])
    for pin in pins(a):
        at=one(pin,'at');coordinates.add((round(x+float(at[1]),4),round(y-float(at[2]),4)))
wireids=set();labelpoints=set()
for wire in cs(d.root,'wire'):
    pts=[tuple(map(float,p[1:3])) for p in cs(one(wire,'pts'),'xy')]
    if any(p in coordinates for p in pts):wireids.add(one(wire,'uuid')[1]);labelpoints.update(pts)
def remove(item):
    if not isinstance(item,list):return False
    if item[0]=='symbol':return one(item,'uuid')[1] in ids
    if item[0]=='wire':return one(item,'uuid')[1] in wireids
    if item[0] in ['label','no_connect']:
        return tuple(map(float,one(item,'at')[1:3])) in coordinates|labelpoints
    return False
d.root[:]=[i for i in d.root if not remove(i)]
for ref in refs:d.parts.pop(ref);d.pin_nets.pop(ref)
pico={'1':'UART_TX','2':'UART_RX','6':'I2C_SDA','7':'I2C_SCL','9':'HX_DOUT','10':'HX_SCK','11':'BTN1','12':'BTN2','14':'ENC_A','15':'ENC_B','16':'BUZZ_PWM','17':'PWR_HOLD','19':'ENC_PUSH','36':'3V3','37':'GND','D1':'SWCLK','D3':'SWDIO'}
for n in ['3','8','13','18','23','28','33','38','D2']:pico[n]='GND'
d.add('J2','MCU_Module:RaspberryPi_Pico_W_Debug','RaspberryPi_Pico_W','Scale:Pico_W_Hybrid',83.82,81.28,pico)
enc=copy.deepcopy(load('Device:RotaryEncoder_Switch_MP'));enc[1]=q('Scale:Encoder_PEC12R')
for sub in cs(enc,'symbol'):sub[1]=q(val(sub[1]).replace('RotaryEncoder_Switch_MP','Encoder_PEC12R'))
for pin in pins(enc):
    if val(one(pin,'number')[1])=='MP':one(pin,'number')[1]=q('SH')
oldload=d.load;d.load=lambda lib:enc if lib=='Scale:Encoder_PEC12R' else oldload(lib)
fp='Rotary_Encoder:RotaryEncoder_Bourns_Horizontal_PEC12R-2x17F-Sxxxx'
d.add('SW1','Scale:Encoder_PEC12R','PEC12R-2217F-S0024',fp,482.6,144.78,{'A':'ENC_A','B':'ENC_B','C':'GND','SH':'GND','S1':'WAKE_N','S2':'GND'})
d.r('R6','10k',535.94,144.78,'3V3','ENC_A');d.r('R7','10k',591.82,144.78,'3V3','ENC_B')
d.c('C17','10n',535.94,118.11,'ENC_A');d.c('C18','10n',591.82,118.11,'ENC_B')
d.add('Q5','Transistor_FET:Q_PMOS_GSD','AO3401A',d.SOT,116.84,449.58,{'1':'WAKE_N','2':'RAW_SW','3':'WAKE_HI'})
d.r('R18','10k',63.5,505.46,'RAW_SW','WAKE_N')
d.add('D3','Device:D_Schottky','BAT54WS','Diode_SMD:D_SOD-323',172.72,449.58,{'1':'HOLD_EN','2':'WAKE_HI'})
d.add('Q6','Transistor_FET:AO3400A','AO3400A',d.SOT,251.46,502.92,{'1':'WAKE_N','2':'GND','3':'ENC_PUSH'})
d.r('R17','10k',302.26,505.46,'3V3','ENC_PUSH')
d.c('C19','10n',355.6,449.58,'ENC_PUSH')
d.add('C20','Device:C','10u 10V X5R','Capacitor_SMD:C_0805_2012Metric',157.48,508,{'1':'HOLD_EN','2':'GND'})
for s in cs(d.root,'text'):
    text=val(s[1]).replace('OLED / BUTTONS','OLED / TWO BUTTONS / SCROLL + SELECT').replace('Hold WAKE while starting. Firmware drives GP13 HIGH early; LOW after 1h inactivity.','Press encoder to wake. GP13 holds power. ENC_PUSH is ACTIVE HIGH; GPIO isolated from RAW_SW.')
    s[1]=q(text)
(REV/'pico_scale_controller.kicad_sch').write_text(d.pretty_root(d.root),encoding='utf-8')
local=parse((REV/'Scale.kicad_sym').read_text(encoding='utf-8'));custom=copy.deepcopy(enc);custom[1]=q('Encoder_PEC12R');local.append(custom)
(REV/'Scale.kicad_sym').write_text(dump(local)+'\n',encoding='utf-8')
meta={ref:{'uuid':val(one(s,'uuid')[1]),'fp':fp,'value':val(next(p for p in cs(s,'property') if val(p[1])=='Value')[2]),'nets':d.pin_nets[ref]} for ref,(s,a,fp) in d.parts.items() if fp}
(REV/'parts.json').write_text(json.dumps({'root_uuid':val(d.rootid),'parts':meta},indent=2)+'\n')
print('Created Rev C schematic:',len(meta),'electrical footprints; encoder press has isolated wake and GPIO paths')
