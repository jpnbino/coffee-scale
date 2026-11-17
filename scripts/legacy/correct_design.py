"""Generate reviewable KiCad corrections; emit apply_patch, never overwrite source files."""
from audit_symbols import *
import copy,uuid,math,difflib
ROOT=pathlib.Path.cwd()/'src'
def uid():return q(str(uuid.uuid4()))
schpath=ROOT/'pico_scale_controller.kicad_sch'
old=schpath.read_text(encoding='utf-8'); root=parse(old)
rootid=one(root,'uuid')[1]
original={val(one(s,'property')[2]):s for s in []}
instances={val(next(p for p in cs(s,'property') if val(p[1])=='Reference')[2]):s for s in cs(root,'symbol')}
root[:]=[x for x in root if not(isinstance(x,list) and x and x[0] in ['symbol','wire','label','junction','no_connect','rectangle','text','lib_symbols'])]
one(root,'paper')[1:]=[q('A1')]
libs=['lib_symbols'];root.append(libs)
parts={}; pin_nets={}; changes={}
def raw(s):return parse(s)
def add(ref,lib,value,fp,x,y,nets):
    a=copy.deepcopy(load(lib));a[1]=q(lib)
    if lib=='MCU_Module:RaspberryPi_Pico_W_Debug':
        # This carrier supplies 3V3 externally and grounds 3V3_EN.
        # Reflect that supply mode in the ERC pin types.
        for p in pins(a):
            if val(one(p,'name')[1]) in ['GND','AGND']:p[1]='passive'
            if val(one(p,'number')[1])=='36':p[1]='power_in'
        lib='Scale:Pico_W_External3V3';a[1]=q(lib)
        for sub in cs(a,'symbol'):sub[1]=q('Pico_W_External3V3_'+val(sub[1]).rsplit('_',2)[-2]+'_'+val(sub[1]).rsplit('_',2)[-1])
    if not any(x[1]==a[1] for x in cs(libs,'symbol')):libs.append(a)
    s=['symbol',['lib_id',q(lib)],['at',str(x),str(y),'0'],['unit','1'],['in_bom','yes'],['on_board','yes'],['dnp','no'],['uuid',one(instances[ref],'uuid')[1] if ref in instances else uid()]]
    for name,v,dy,hide in [('Reference',ref,-5,False),('Value',value,-2,False),('Footprint',fp,0,True)]:
        p=['property',q(name),q(v),['at',str(x+3),str(y+dy),'0'],['effects',['font',['size','1.27','1.27']],['justify','left']]]
        template=next((v for v in cs(a,'property') if val(v[1])==name),None)
        if template and one(template,'at') and not hide:
            pos=one(template,'at');p[3]=['at',str(round(x+float(pos[1]),4)),str(round(y-float(pos[2]),4)),'0']
        if lib.split(':')[0] in ['MCU_Module','Analog_ADC','Battery_Management','Regulator_Switching','Power_Management'] and not hide:
            top=max(float(one(pin,'at')[2]) for pin in pins(a))
            p[3]=['at',str(x),str(round(y-top-(12.7 if name=='Reference' else 10.16),4)),'0']
            p[4]=['effects',['font',['size','1.27','1.27']]]
        if lib=='Scale:Pico_W_External3V3' and not hide:
            p[3]=['at',str(x),str(y-38.1-(12.7 if name=='Reference' else 10.16)),'0'];p[4]=['effects',['font',['size','1.27','1.27']]]
        if lib in ['Device:R','Device:C','Device:L'] and not hide:
            p[3]=['at',str(x+3.81),str(y+(-1.27 if name=='Reference' else 1.27)),'0']
        if hide:p.append(['hide','yes'])
        s.append(p)
    s.append(['instances',['project',q('pico_scale_controller'),['path',rootid,['reference',q(ref)],['unit','1']]]])
    root.append(s);parts[ref]=(s,a,fp);pin_nets[ref]={};seen={}
    for p in pins(a):
        n=val(one(p,'number')[1]);at=one(p,'at');px=round(x+float(at[1]),4);py=round(y-float(at[2]),4);ang=int(at[3]);net=nets.get(n)
        pin_nets[ref][n]=net
        if (px,py) in seen:
            assert seen[px,py]==net,(ref,n,net,seen[px,py]);continue
        seen[px,py]=net
        if net is None:
            root.append(['no_connect',['at',str(px),str(py)],['uuid',uid()]]);continue
        dx,dy={0:(-7.62,0),180:(7.62,0),90:(0,7.62),270:(0,-7.62)}[ang];ex=round(px+dx,4);ey=round(py+dy,4)
        root.append(['wire',['pts',['xy',str(px),str(py)],['xy',str(ex),str(ey)]],['stroke',['width','0'],['type','default']],['uuid',uid()]])
        root.append(['label',q(net),['at',str(ex),str(ey),'0' if dx>=0 else '180'],['effects',['font',['size','1.27','1.27']],['justify','left' if dx>=0 else 'right','bottom']],['uuid',uid()]])
def box(title,x1,y1,x2,y2,note=''):
    root.append(['rectangle',['start',str(x1),str(y1)],['end',str(x2),str(y2)],['stroke',['width','0.254'],['type','default']],['fill',['type','none']],['uuid',uid()]])
    root.append(['text',q(title+ ('\n'+note if note else '')),['at',str(x1+5),str(y1+8),'0'],['effects',['font',['size','1.52','1.52']],['justify','left']],['uuid',uid()]])
RFP='Resistor_SMD:R_0603_1608Metric';CFP='Capacitor_SMD:C_0603_1608Metric';SOT='Package_TO_SOT_SMD:SOT-23'
def r(ref,v,x,y,a,b):add(ref,'Device:R',v,RFP,x,y,{'1':a,'2':b})
def c(ref,v,x,y,a,b='GND'):
    fp=CFP
    if ref in ['C8','C9','C13','C15','C16']:v='22u 10V X5R';fp='Capacitor_SMD:C_0805_2012Metric'
    add(ref,'Device:C',v,fp,x,y,{'1':a,'2':b})
def header(ref,count,value,x,y,nets,fp=None):add(ref,f'Connector_Generic:Conn_01x{count:02}',value,fp or f'Connector_PinHeader_2.54mm:PinHeader_1x{count:02}_P2.54mm_Vertical',x,y,{str(i+1):n for i,n in enumerate(nets)})
box('PICO W / DEBUG',10,10,205,170,'GP13 holds power ON; release for shutdown. Onboard SMPS disabled.')
pico={'1':'UART_TX','2':'UART_RX','6':'I2C_SDA','7':'I2C_SCL','9':'HX_DOUT','10':'HX_SCK','11':'BTN1','12':'BTN2','14':'BTN3','15':'BTN4','16':'BUZZ_PWM','17':'PWR_HOLD','36':'3V3','37':'GND','D1':'SWCLK','D3':'SWDIO'}
for n in ['3','8','13','18','23','28','33','38','D2']:pico[n]='GND'
add('J2','MCU_Module:RaspberryPi_Pico_W_Debug','RaspberryPi_Pico_W','Scale:Pico_W_Hybrid',83.82,81.28,pico)
header('J5',6,'DEBUG_3V3_REF_ONLY',167.64,50.8,['SWCLK','SWDIO','GND','3V3','UART_TX','UART_RX'])
c('C1','10u 10V',160.02,116.84,'3V3');c('C2','100n 10V',187.96,116.84,'3V3')
box('HX711 / 4-WIRE LOAD CELL',215,10,430,170,'3.3V analog supply; 10 samples/s. E+/E-/A+/A- solder pads.')
add('U5','Analog_ADC:HX711','HX711','Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',299.72,76.2,{'1':'3V3','3':'3V3','4':'GND','5':'GND','6':'HX_VBG','7':'CELL_A_N','8':'CELL_A_P','9':'GND','10':'GND','11':'HX_SCK','12':'HX_DOUT','14':'GND','15':'GND','16':'3V3'})
header('J6',4,'LOAD_CELL',393.7,58.42,['3V3','GND','CELL_A_P','CELL_A_N'],'Scale:LoadCell_4Pads')
c('C3','100n 10V',246.38,127,'3V3');c('C4','10u 10V',279.4,127,'3V3');c('C5','100n 10V',312.42,127,'HX_VBG');c('C6','10n C0G',370.84,127,'CELL_A_P','CELL_A_N')
box('OLED / BUTTONS',440,10,650,170,'OLED pin order from supplied module: GND / VCC / SCL / SDA')
header('J3',4,'OLED_SSD1306_3V3',482.6,48.26,['GND','3V3','I2C_SCL','I2C_SDA'])
r('R2','4.7k',535.94,45.72,'3V3','I2C_SDA');r('R3','4.7k',591.82,45.72,'3V3','I2C_SCL');c('C7','100n 10V',629.92,45.72,'3V3')
swfp='Button_Switch_SMD:SW_Push_1P1T_NO_E-Switch_TL3301NxxxxxG'
for i,(x,y) in enumerate([(480.06,96.52),(584.2,96.52),(480.06,147.32),(584.2,147.32)],1):
    add(f'SW{i+1}','Switch:SW_Push','TL3301NF160QG',swfp,x,y,{'1':f'BTN{i}','2':'GND'});r(f'R{i+3}','10k',x+35.56,y,'3V3',f'BTN{i}')
box('PIEZO DRIVER',660,10,820,170,'CPT-1203-03-SMT-TR: external PWM ~4 kHz. Manufacturer land pattern: 6x3mm pads, 12mm centres.')
add('BZ1','Device:Buzzer','CPT-1203-03-SMT-TR','Scale:CPT-1203-03-SMT-TR',741.68,53.34,{'1':'3V3','2':'BUZZ_D'})
add('Q1','Transistor_FET:AO3400A','AO3400A',SOT,741.68,106.68,{'1':'BUZZ_G','2':'GND','3':'BUZZ_D'})
r('R8','100',688.34,106.68,'BUZZ_PWM','BUZZ_G');r('R9','100k',784.86,106.68,'BUZZ_G','GND');r('R10','1k',784.86,53.34,'3V3','BUZZ_D')
box('USB-C / 100mA CHARGER / LOAD SHARING',10,185,420,375,'USB power only. MCP73831 4.2V. RPROG=10k. Battery remains chargeable when system OFF.')
usb={n:'USB5' for n in ['A4','A9','B4','B9']};usb.update({n:'GND' for n in ['A1','A12','B1','B12','SH']});usb.update({'A5':'CC1','B5':'CC2'})
add('J1','Connector:USB_C_Receptacle_USB2.0_16P','USB4105-GF-A','Scale:USB4105_GND_Rounded',48.26,251.46,usb)
r('R11','5.1k 1%',104.14,220.98,'CC1','GND');r('R12','5.1k 1%',147.32,220.98,'CC2','GND')
add('U1','Battery_Management:MCP73831-2-OT','MCP73831T-2ACI/OT','Package_TO_SOT_SMD:SOT-23-5',233.68,241.3,{'2':'GND','3':'BAT_P','4':'USB5','5':'CHG_PROG'})
r('R1','10k 1% (100mA)',198.12,294.64,'CHG_PROG','GND');c('C8','4.7u 10V',246.38,294.64,'USB5');c('C9','4.7u 10V',294.64,294.64,'BAT_P')
add('D1','Device:D_Schottky','SS14','Diode_SMD:D_SMA',355.6,220.98,{'1':'SYS_PRE','2':'USB5'})
add('Q4','Transistor_FET:Q_PMOS_GSD','AO3401A',SOT,355.6,274.32,{'1':'USB5','2':'SYS_PRE','3':'BAT_P'})
r('R13','100k',355.6,330.2,'USB5','GND')
box('BATTERY PROTECTION',430,185,820,375,'JST PH 2.00mm. Verify battery cable polarity before connection. Raw cell negative = BATT_NEG.')
header('J4',2,'S2B-PH-K-S',480.06,226.06,['BAT_P','BATT_NEG'],'Connector_JST:JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal')
add('U2','Battery_Management:DW01A','DW01A-G','Package_TO_SOT_SMD:SOT-23-6',584.2,246.38,{'1':'PROT_OD','2':'PROT_CS','3':'PROT_OC','5':'PROT_VCC','6':'BATT_NEG'})
r('R14','100',535.94,309.88,'BAT_P','PROT_VCC');c('C10','100n 10V',584.2,309.88,'PROT_VCC','BATT_NEG');r('R15','1k',632.46,309.88,'GND','PROT_CS')
add('Q2','Transistor_FET:AO3400A','AO3400A',SOT,711.2,246.38,{'1':'PROT_OD','2':'BATT_NEG','3':'PROT_D'})
add('Q3','Transistor_FET:AO3400A','AO3400A',SOT,777.24,246.38,{'1':'PROT_OC','2':'GND','3':'PROT_D'})
box('MASTER OFF / WAKE / FIRMWARE POWER HOLD',10,390,420,555,'Hold WAKE while starting. Firmware drives GP13 HIGH early; LOW after 1h inactivity.')
add('SW6','Switch:SW_SPDT','JS102011SAQN','Button_Switch_SMD:SW_SPDT_CK_JS102011SAQN',58.42,449.58,{'1':'SYS_PRE','2':'RAW_SW'})
add('SW1','Switch:SW_Push','WAKE_TL3301NF160QG',swfp,147.32,449.58,{'1':'RAW_SW','2':'HOLD_EN'})
add('D2','Device:D_Schottky','BAT54WS','Diode_SMD:D_SOD-323',208.28,449.58,{'1':'HOLD_EN','2':'PWR_HOLD'})
r('R16','100k',208.28,508,'HOLD_EN','GND')
add('U4','Power_Management:TPS22919DCK','TPS22919DCKR','Package_TO_SOT_SMD:SOT-363_SC-70-6',302.26,449.58,{'1':'RAW_SW','2':'GND','3':'HOLD_EN','6':'SYS_LATCH'})
c('C11','1u 10V',355.6,505.46,'RAW_SW');c('C12','1u 10V',396.24,505.46,'SYS_LATCH')
box('3.3V BUCK-BOOST',430,390,820,555,'TPS63031: fixed 3.3V; feedback connected to output. Keep switching loop compact.')
add('U3','Regulator_Switching:TPS63031DSK','TPS63031DSKR','Package_SON:WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm',584.2,459.74,{'1':'3V3','2':'SW_L2','3':'GND','4':'SW_L1','5':'SYS_LATCH','6':'SYS_LATCH','7':'GND','8':'SYS_LATCH','9':'GND','10':'3V3','11':'GND'})
add('L1','Device:L','SRN4018-1R5Y 1.5uH','Inductor_SMD:L_Bourns-SRN4018',477.52,462.28,{'1':'SW_L1','2':'SW_L2'})
c('C13','10u 10V',472.44,518.16,'SYS_LATCH');c('C14','100n 10V',520.7,518.16,'SYS_LATCH');c('C15','10u 10V',680.72,459.74,'3V3');c('C16','10u 10V',739.14,459.74,'3V3')
# Flag actual externally supplied rails so ERC can trace their source.
for i,(net,x,y) in enumerate([('USB5',99.06,340.36),('RAW_SW',99.06,518.16),('BATT_NEG',528.32,345.44),('GND',779.78,518.16),('PROT_VCC',680.72,345.44)]):
    add(f'#FLG0{i+1}','power:PWR_FLAG','PWR_FLAG','',x,y,{'1':net})
    one(parts[f'#FLG0{i+1}'][0],'in_bom')[1]='no';one(parts[f'#FLG0{i+1}'][0],'on_board')[1]='no'
new=dump(root)+'\n'
# Per-top-level formatting keeps the generated diff inspectable.
def pretty_root(a):return '(kicad_sch\n'+'\n'.join('  '+dump(x) if isinstance(x,list) else '  '+x for x in a[1:])+'\n)\n'
new=pretty_root(root)
changes[str(schpath)]=(old,new)
# Hybrid Pico footprint: keep official castellated pads, add socket holes at
# the module's actual 17.78mm row spacing.
hybrid=parse((BASE/'footprints/Module.pretty/RaspberryPi_Pico_W_SMD_HandSolder.kicad_mod').read_text(encoding='utf-8'))
hybrid[1]=q('Pico_W_Hybrid')
hybrid[:]=[v for v in hybrid if not(isinstance(v,list) and v and v[0]=='pad' and val(v[1])=='' and one(v,'layers')[1:]==[q('F.Paste')])]
for n in range(1,41):
    x=-8.89 if n<=20 else 8.89;y=-24.13+(n-1)*2.54 if n<=20 else 24.13-(n-21)*2.54
    hybrid.append(raw(f'(pad "{n}" thru_hole circle (at {x:.4f} {y:.4f}) (size 1.7 1.7) (drill 1) (layers "*.Cu" "*.Mask"))'))
changes[str(ROOT/'Scale.pretty/Pico_W_Hybrid.kicad_mod')]=(None,dump(hybrid)+'\n')
cell=raw('(footprint "LoadCell_4Pads" (version 20260206) (generator pcbnew) (layer "F.Cu") (attr exclude_from_pos_files))')
for i,n in enumerate(['E+','E-','A+','A-']):
    cell.append(raw(f'(pad "{i+1}" smd rect (at {i*4} 0) (size 3 5) (layers "F.Cu" "F.Mask"))'))
    cell.append(['fp_text','user',q(n),['at',str(i*4),'3.75'],['layer',q('F.SilkS')],['effects',['font',['size','1','1'],['thickness','0.15']]]])
cell.append(raw('(fp_rect (start -2 -3) (end 14 4.5) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))'))
changes[str(ROOT/'Scale.pretty/LoadCell_4Pads.kicad_mod')]=(None,dump(cell)+'\n')
buzz=raw('(footprint "CPT-1203-03-SMT-TR" (version 20260206) (generator pcbnew) (layer "F.Cu") (attr smd) (descr "Same Sky CPT-1203-03-SMT-TR; manufacturer drawing 2025-08-04 page 2; non-polar piezo"))')
for n,y in [('1',-6),('2',6)]:buzz.append(raw(f'(pad "{n}" smd rect (at 0 {y}) (size 6 3) (layers "F.Cu" "F.Paste" "F.Mask"))'))
buzz.append(raw('(fp_rect (start -6 -6) (end 6 6) (stroke (width 0.1) (type solid)) (fill none) (layer "F.Fab"))'))
buzz.append(raw('(fp_rect (start -6.75 -8.25) (end 6.75 8.25) (stroke (width 0.05) (type solid)) (fill none) (layer "F.CrtYd"))'))
changes[str(ROOT/'Scale.pretty/CPT-1203-03-SMT-TR.kicad_mod')]=(None,dump(buzz)+'\n')
usbf=parse((BASE/'footprints/Connector_USB.pretty/USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal.kicad_mod').read_text(encoding='utf-8'))
usbf[1]=q('USB4105_GND_Rounded')
for p in cs(usbf,'pad'):
    if val(p[1]) in ['A1','A12','B1','B12']:one(p,'roundrect_rratio')[1]='0.5'
changes[str(ROOT/'Scale.pretty/USB4105_GND_Rounded.kicad_mod')]=(None,dump(usbf)+'\n')
rulespath=ROOT/'pico_scale_controller.kicad_dru'
rules='(version 1)\n(rule "USB4105 internal NPTH clearance - JLCPCB 0.20mm" (condition "A.Reference == \'J1\' && B.Reference == \'J1\'") (constraint hole_clearance (min 0.20mm)))\n'
changes[str(rulespath)]=(rulespath.read_text(encoding='utf-8') if rulespath.exists() else None,rules)
tablepath=ROOT/'fp-lib-table';tablebefore=tablepath.read_text(encoding='utf-8') if tablepath.exists() else None
table=parse(tablebefore) if tablebefore else ['fp_lib_table',['version','7']]
if not any(one(x,'name')[1:]==[q('Scale')] for x in cs(table,'lib')):table.append(raw('(lib (name "Scale") (type "KiCad") (uri "${KIPRJMOD}/Scale.pretty") (options "") (descr "Scale controller local footprints"))'))
changes[str(tablepath)]=(tablebefore,dump(table)+'\n')
localpico=copy.deepcopy(next(v for v in cs(libs,'symbol') if val(v[1])=='Scale:Pico_W_External3V3'));localpico[1]=q('Pico_W_External3V3')
changes[str(ROOT/'Scale.kicad_sym')]=(None,dump(['kicad_symbol_lib',['version','20241209'],['generator',q('kicad_symbol_editor')],localpico])+'\n')
symtablepath=ROOT/'sym-lib-table';symbefore=symtablepath.read_text(encoding='utf-8') if symtablepath.exists() else None
symtable=parse(symbefore) if symbefore else ['sym_lib_table',['version','7']]
if not any(one(v,'name')[1:]==[q('Scale')] for v in cs(symtable,'lib')):symtable.append(raw('(lib (name "Scale") (type "KiCad") (uri "${KIPRJMOD}/Scale.kicad_sym") (options "") (descr "Externally powered Pico W"))'))
changes[str(symtablepath)]=(symbefore,dump(symtable)+'\n')
def emit():
    out=['*** Begin Patch']
    for path,(before,after) in changes.items():
        if before is None and pathlib.Path(path).exists():before=pathlib.Path(path).read_text(encoding='utf-8')
        if before==after:continue
        if before is None:out+=['*** Add File: '+path]+['+'+l for l in after.splitlines()]
        else:
            out+=['*** Update File: '+path]
            diff=list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3))[2:]
            out += ['@@' if line.startswith('@@') else line for line in diff]
    out+=['*** End Patch'];print('\n'.join(out))
if __name__=='__main__':emit()
