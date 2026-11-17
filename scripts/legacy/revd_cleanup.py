"""Deduplicate retraced copper and update navigation notes without moving nets."""
from audit_symbols import *
import pcbnew as k
root=pathlib.Path('src/concept-revD');p=pathlib.Path('tmp/revd-routing/routing-candidate.kicad_pcb');tree=parse(p.read_text(encoding='utf-8'));seen=set();clean=[];count=0
for i in tree:
    key=None
    if isinstance(i,list) and i[0]=='segment':key=(one(i,'net')[1],one(i,'layer')[1],one(i,'width')[1],*sorted([tuple(one(i,'start')[1:]),tuple(one(i,'end')[1:])]))
    if isinstance(i,list) and i[0]=='via':key=('via',one(i,'net')[1],tuple(one(i,'at')[1:]),one(i,'size')[1],one(i,'drill')[1])
    if key and key in seen:count+=1;continue
    if key:seen.add(key)
    clean.append(i)
p.write_text(dump(clean),encoding='utf-8');b=k.LoadBoard(str(p));b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(p),b)
s=root/'pico_scale_controller.kicad_sch';sch=parse(s.read_text(encoding='utf-8'))
for text in cs(sch,'text'):text[1]=q(val(text[1]).replace('ENC_PUSH','NAV_PUSH').replace('Press encoder','Press TS43 centre'))
s.write_text('(kicad_sch\n'+'\n'.join('  '+dump(i) if isinstance(i,list) else '  '+i for i in sch[1:])+'\n)\n',encoding='utf-8');print('Removed',count,'duplicate tracks; navigation notes updated')
