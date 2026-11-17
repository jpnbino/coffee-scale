"""Remove exact retraces before the final connectivity and fabrication checks."""
from audit_symbols import *
import pcbnew as k
p=pathlib.Path('tmp/reve-routing/routing-candidate.kicad_pcb');tree=parse(p.read_text(encoding='utf-8'));seen=set();clean=[];count=0
for i in tree:
    key=None
    if isinstance(i,list) and i[0]=='segment':key=(one(i,'net')[1],one(i,'layer')[1],one(i,'width')[1],*sorted([tuple(one(i,'start')[1:]),tuple(one(i,'end')[1:])]))
    if isinstance(i,list) and i[0]=='via':key=('via',one(i,'net')[1],tuple(one(i,'at')[1:]),one(i,'size')[1],one(i,'drill')[1])
    if key and key in seen:count+=1;continue
    if key:seen.add(key)
    clean.append(i)
p.write_text(dump(clean),encoding='utf-8');b=k.LoadBoard(str(p));b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(p),b)
print('Removed',count,'exact retraces')
