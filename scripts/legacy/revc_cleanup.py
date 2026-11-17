"""Remove exact retraced duplicates and keep encoder filters in their block."""
from audit_symbols import *
import pcbnew as k
REV=pathlib.Path('pico_scale_controller/concept-revC');p=pathlib.Path('tmp/revc-routing/routing-candidate.kicad_pcb')
tree=parse(p.read_text(encoding='utf-8'));seen=set();clean=[];count=0
for i in tree:
    key=None
    if isinstance(i,list) and i[0]=='segment':key=(one(i,'net')[1],one(i,'layer')[1],one(i,'width')[1],*sorted([tuple(one(i,'start')[1:]),tuple(one(i,'end')[1:])]))
    if isinstance(i,list) and i[0]=='via':key=('via',one(i,'net')[1],tuple(one(i,'at')[1:]),one(i,'size')[1],one(i,'drill')[1])
    if key and key in seen:count+=1;continue
    if key:seen.add(key)
    clean.append(i)
p.write_text(dump(clean),encoding='utf-8');b=k.LoadBoard(str(p));b.BuildConnectivity();k.ZONE_FILLER(b).Fill(b.Zones());k.SaveBoard(str(p),b)
s=REV/'pico_scale_controller.kicad_sch';root=parse(s.read_text(encoding='utf-8'));libs={val(a[1]):a for a in cs(one(root,'lib_symbols'),'symbol')}
for name,nx,ny in [('C17',535.94,118.11),('C18',591.82,118.11)]:
    sym=next(a for a in cs(root,'symbol') if val(next(p for p in cs(a,'property') if val(p[1])=='Reference')[2])==name)
    ox,oy=map(float,one(sym,'at')[1:3]);dx,dy=nx-ox,ny-oy
    points={(round(ox+float(one(p,'at')[1]),4),round(oy-float(one(p,'at')[2]),4)) for p in pins(libs[val(one(sym,'lib_id')[1])])}
    endpoints=set()
    for wire in cs(root,'wire'):
        pts=cs(one(wire,'pts'),'xy')
        if any(tuple(map(float,pt[1:3])) in points for pt in pts):
            for pt in pts:endpoints.add(tuple(map(float,pt[1:3])));pt[1:3]=[str(round(float(pt[1])+dx,4)),str(round(float(pt[2])+dy,4))]
    for a in cs(root,'label')+cs(root,'no_connect'):
        at=one(a,'at')
        if tuple(map(float,at[1:3])) in endpoints|points:at[1:3]=[str(round(float(at[1])+dx,4)),str(round(float(at[2])+dy,4))]
    for a in [sym]+cs(sym,'property'):
        at=one(a,'at');at[1:3]=[str(round(float(at[1])+dx,4)),str(round(float(at[2])+dy,4))]
s.write_text('(kicad_sch\n'+'\n'.join('  '+dump(i) if isinstance(i,list) else '  '+i for i in root[1:])+'\n)\n',encoding='utf-8')
print('Removed',count,'exact duplicate routing items; encoder filters aligned in OLED/menu block')
