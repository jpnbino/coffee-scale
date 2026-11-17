"""Replace the rotary encoder with the specified TS43 directional switch."""
from audit_symbols import *
import shutil,uuid,copy
ROOT=pathlib.Path('pico_scale_controller');REV=ROOT/'concept-revD';REV.mkdir(exist_ok=True)
backup=ROOT/'backup-before-revD';backup.mkdir(exist_ok=True)
for name in ['pico_scale_controller.kicad_pcb','pico_scale_controller.kicad_sch','pico_scale_controller.kicad_pro','pico_scale_controller.kicad_dru','Scale.kicad_sym']:
    if not (backup/name).exists():shutil.copy2(ROOT/name,backup/name)
for name in ['pico_scale_controller.kicad_pro','pico_scale_controller.kicad_dru','fp-lib-table','sym-lib-table']:shutil.copy2(ROOT/name,REV/name)
for name in ['Scale.pretty','models']:shutil.copytree(ROOT/name,REV/name,dirs_exist_ok=True)
uid=lambda:q(str(uuid.uuid4()))
fp=['footprint',q('TS43_135255'),['version','20260206'],['generator',q('pcbnew')],['layer',q('F.Cu')],['attr','smd']]
for name,value,y in [('Reference','REF**',3),('Value','TS43-135255-10-BK-200-SMT-TR',5)]:fp.append(['property',q(name),q(value),['at','0',str(y),'0'],['layer',q('F.Fab')],['effects',['font',['size','1','1'],['thickness','.15']]]])
for num,x in zip(['1','2','3','C','4','5'],[-3.75,-2.25,-.75,.75,2.25,3.75]):fp.append(parse(f'(pad "{num}" smd rect (at {x} 0.85) (size 0.7 1.7) (layers "F.Cu" "F.Paste" "F.Mask"))'))
for x,y,w,h in [(-6.15,-.9,1.1,2),(6.15,-.9,1.1,2),(-4.85,.15,.7,.7),(4.85,.15,.7,.7)]:fp.append(parse(f'(pad "SH" smd rect (at {x} {y}) (size {w} {h}) (layers "F.Cu" "F.Paste" "F.Mask"))'))
for x in [-4.7,4.7]:fp.append(parse(f'(pad "" np_thru_hole circle (at {x} -4.7) (size .9 .9) (drill .9) (layers "*.Cu" "*.Mask"))'))
fp.append(parse('(fp_rect (start -7 -10.6) (end 7 2) (stroke (width .05) (type solid)) (fill none) (layer "F.CrtYd"))'))
fp.append(parse('(fp_rect (start -6.775 -10.2) (end 6.775 0) (stroke (width .1) (type solid)) (fill none) (layer "F.Fab"))'))
fp.append(parse('(model "${KIPRJMOD}/models/TS43_manufacturer.wrl" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))'))
(REV/'Scale.pretty/TS43_135255.kicad_mod').write_text(dump(fp)+'\n',encoding='utf-8')
lib=['symbol',q('Scale:TS43_3Way'),['pin_names',['offset','0.5']],['in_bom','yes'],['on_board','yes']]
for name,value,y in [('Reference','SW',10),('Value','TS43_3Way',8)]:lib.append(['property',q(name),q(value),['at','0',str(y),'0'],['effects',['font',['size','1.27','1.27']]]])
lib.append(parse('(symbol "TS43_3Way_0_1" (rectangle (start -5.08 7.62) (end 5.08 -7.62) (stroke (width .254) (type default)) (fill (type background))))'))
unit=['symbol',q('TS43_3Way_1_1')]
for num,name,x,y,angle in [('1','UP',-7.62,5.08,0),('5','DOWN',-7.62,0,0),('3','SELECT',-7.62,-5.08,0),('C','COMMON',7.62,5.08,180),('2','UP_FAST',7.62,0,180),('4','DOWN_FAST',7.62,-5.08,180),('SH','SHELL',0,-10.16,90)]:unit.append(parse(f'(pin passive line (at {x} {y} {angle}) (length 2.54) (name "{name}" (effects (font (size 1 1)))) (number "{num}" (effects (font (size 1 1)))))'))
lib.append(unit)
root=parse((ROOT/'pico_scale_controller.kicad_sch').read_text(encoding='utf-8'));sym=next(s for s in cs(root,'symbol') if val(next(p for p in cs(s,'property') if val(p[1])=='Reference')[2])=='SW1');oldlib=next(l for l in cs(one(root,'lib_symbols'),'symbol') if val(l[1])==val(one(sym,'lib_id')[1]));sx,sy=map(float,one(sym,'at')[1:3]);coords={(round(sx+float(one(p,'at')[1]),4),round(sy-float(one(p,'at')[2]),4)) for p in pins(oldlib)};ends=set();wires=set()
for w in cs(root,'wire'):
    pts={tuple(map(float,p[1:3])) for p in cs(one(w,'pts'),'xy')}
    if pts&coords:wires.add(one(w,'uuid')[1]);ends|=pts
root[:]=[i for i in root if not(isinstance(i,list) and ((i[0]=='wire' and one(i,'uuid')[1] in wires) or (i[0] in ['label','no_connect'] and tuple(map(float,one(i,'at')[1:3])) in coords|ends)))]
one(root,'lib_symbols').append(lib);one(sym,'lib_id')[1]=q('Scale:TS43_3Way')
for p in cs(sym,'property'):
    if val(p[1])=='Value':p[2]=q('TS43-135255-10-BK-200-SMT-TR')
    if val(p[1])=='Footprint':p[2]=q('Scale:TS43_135255')
nets={'1':'NAV_UP','5':'NAV_DOWN','3':'WAKE_N','C':'GND','SH':'GND'}
for pin in pins(lib):
    at=one(pin,'at');x,y=round(sx+float(at[1]),4),round(sy-float(at[2]),4);net=nets.get(val(one(pin,'number')[1]))
    if not net:root.append(['no_connect',['at',str(x),str(y)],['uuid',uid()]]);continue
    dx,dy={0:(-7.62,0),180:(7.62,0),90:(0,7.62)}[int(at[3])];ex,ey=round(x+dx,4),round(y+dy,4)
    root.append(parse(f'(wire (pts (xy {x} {y}) (xy {ex} {ey})) (stroke (width 0) (type default)) (uuid {uid()}))'))
    root.append(parse(f'(label "{net}" (at {ex} {ey} {180 if dx<0 else 0}) (effects (font (size 1.27 1.27)) (justify {"right" if dx<0 else "left"} bottom)) (uuid {uid()}))'))
for label in cs(root,'label'):
    name=val(label[1]);label[1]=q({'ENC_A':'NAV_UP','ENC_B':'NAV_DOWN','ENC_PUSH':'NAV_PUSH'}.get(name,name))
for text in cs(root,'text'):text[1]=q(val(text[1]).replace('ENC_PUSH','NAV_PUSH').replace('Press encoder','Press TS43 centre'))
(REV/'pico_scale_controller.kicad_sch').write_text('(kicad_sch\n'+'\n'.join('  '+dump(i) if isinstance(i,list) else '  '+i for i in root[1:])+'\n)\n',encoding='utf-8')
local=parse((ROOT/'Scale.kicad_sym').read_text(encoding='utf-8'));lc=copy.deepcopy(lib);lc[1]=q('TS43_3Way');local.append(lc);(REV/'Scale.kicad_sym').write_text(dump(local)+'\n',encoding='utf-8')
meta=json.loads((ROOT/'concept-revC/parts.json').read_text());meta['parts']['SW1'].update({'fp':'Scale:TS43_135255','value':'TS43-135255-10-BK-200-SMT-TR','nets':nets})
(REV/'parts.json').write_text(json.dumps(meta,indent=2)+'\n')
print('Prepared Rev D TS43 symbol, footprint, directional inputs and preserved isolated wake')
