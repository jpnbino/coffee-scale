"""Synchronize corrected schematic nets and manufacturer footprints, emit patch."""
import correct_design as d
from audit_symbols import *
import copy,math
path=d.ROOT/'pico_scale_controller.kicad_pcb';old=path.read_text(encoding='utf-8');board=parse(old)
prev={val(next(p for p in cs(f,'property') if val(p[1])=='Reference')[2]):f for f in cs(board,'footprint')}
board[:]=[x for x in board if not(isinstance(x,list) and x and x[0]=='footprint')]
def fp_load(fp):
    if fp.startswith('Scale:'):return parse(d.changes[str(d.ROOT/'Scale.pretty'/f'{fp.split(":")[1]}.kicad_mod')][1])
    lib,n=fp.split(':');return parse((BASE/'footprints'/f'{lib}.pretty'/f'{n}.kicad_mod').read_text(encoding='utf-8'))
def getprop(f,n):return next((p for p in cs(f,'property') if val(p[1])==n),None)
def setprop(f,n,v):
    p=getprop(f,n)
    if p:p[2]=q(v)
    else:f.append(['property',q(n),q(v),['at','0','0','0'],['layer',q('F.Fab')],['hide','yes'],['effects',['font',['size','1','1'],['thickness','0.15']]]])
def reuuid(a):
    for x in a:
        if isinstance(x,list):
            if x[0]=='uuid':x[1]=d.uid()
            else:reuuid(x)
def bounds(f,x,y,ang):
    pts=[]
    for g in f:
        if not isinstance(g,list):continue
        if g[0]=='pad':
            a=one(g,'at');sz=one(g,'size');px,py=map(float,a[1:3]);w,h=map(float,sz[1:3]);pts.extend([(px-w/2,py-h/2),(px+w/2,py+h/2)])
        elif g[0].startswith('fp_') and one(g,'layer')[1:] in [[q('F.Courtyard')],[q('F.CrtYd')]]:
            for k in ['start','end','center']:
                if one(g,k):pts.append(tuple(map(float,one(g,k)[1:3])))
            for xy in cs(one(g,'pts'),'xy'):pts.append(tuple(map(float,xy[1:3])))
    if not pts:pts=[(-1,-1),(1,1)]
    a=math.radians(-ang);p=[(x+px*math.cos(a)-py*math.sin(a),y+px*math.sin(a)+py*math.cos(a)) for px,py in pts]
    return min(v[0] for v in p)-.25,min(v[1] for v in p)-.25,max(v[0] for v in p)+.25,max(v[1] for v in p)+.25
def hit(a,b):return a[0]<b[2] and a[2]>b[0] and a[1]<b[3] and a[3]>b[1]
occupied=[];pending=[];staged=[]
def place(f,x,y,ang):
    for pad in cs(f,'pad'):
        pa=one(pad,'at');local=float(pa[3]) if len(pa)>3 else 0
        pa[3:]=[str(local+ang)]
    for txt in cs(f,'fp_text'):
        ta=one(txt,'at')
        if ta:ta[3:]=[str((float(ta[3]) if len(ta)>3 else 0)+ang)]
    # Footprint zone polygons use absolute PCB coordinates (unlike pads).
    za=math.radians(-ang)
    for zone in cs(f,'zone'):
        for polygon in cs(zone,'polygon'):
            for xy in cs(one(polygon,'pts'),'xy'):
                zx,zy=map(float,xy[1:3]);xy[1:3]=[str(round(x+zx*math.cos(za)-zy*math.sin(za),5)),str(round(y+zx*math.sin(za)+zy*math.cos(za),5))]
    f[:]=[v for v in f if not(isinstance(v,list) and v and v[0]=='at')];f.insert(2,['at',str(x),str(y),str(ang)]);occupied.append(bounds(f,x,y,ang));board.append(f)
for ref,oldfp in prev.items():
    if not ref.startswith('H'):continue
    f=fp_load('MountingHole:MountingHole_3.2mm_M3');reuuid(f);f[1]=q('MountingHole:MountingHole_3.2mm_M3');setprop(f,'Reference',ref)
    f.append(['uuid',one(oldfp,'uuid')[1]]);x,y=map(float,one(oldfp,'at')[1:3])
    if ref=='H1':x=90.5
    place(f,x,y,0)
for ref,(s,a,fp) in d.parts.items():
    if not fp:continue
    f=fp_load(fp);reuuid(f);f[1]=q(fp)
    f[:]=[v for v in f if not(isinstance(v,list) and v and v[0] in ['version','generator','generator_version','uuid','path'])]
    f.append(['uuid',one(prev[ref],'uuid')[1] if ref in prev else d.uid()])
    f.append(['path',q('/'+val(d.rootid)+'/'+val(one(s,'uuid')[1]))]);setprop(f,'Reference',ref);setprop(f,'Value',val(getprop(s,'Value')[2]))
    for p in cs(f,'pad'):
        p[:]=[v for v in p if not(isinstance(v,list) and v and v[0] in ['net','pinfunction','pintype'])]
        n=val(p[1]);net=d.pin_nets[ref].get(n)
        if n and net:p.append(['net',q('/'+net)])
    if ref=='J2':place(f,111.55,98.5,-90)
    elif ref=='J1':place(f,160,77,180)
    elif ref=='BZ1':place(f,160,99,0)
    elif ref=='J3':place(f,135,80,90)
    elif ref in ['SW2','SW3','SW4','SW5']:
        place(f,177,{'SW2':87,'SW3':111,'SW4':95,'SW5':103}[ref],0)
    elif ref in ['J4']:
        at=one(prev[ref],'at')[1:];x,y=map(float,at[:2]);ang=float(at[2]) if len(at)>2 else 0;place(f,x,y,ang)
    else:
        anchor=(110,82) if ref.startswith(('U1','U2','U3','U4','Q2','Q3','Q4')) else (140,116)
        if ref=='J6':anchor=(154,78)
        if ref=='J5':anchor=(155,85)
        if ref=='SW6':anchor=(115,120)
        if ref=='SW1':anchor=(150,116)
        pending.append((ref,f,anchor,0))
# Place larger items first; search for non-overlapping courtyards.
pending.sort(key=lambda t:(bounds(t[1],0,0,t[3])[2]-bounds(t[1],0,0,t[3])[0])*(bounds(t[1],0,0,t[3])[3]-bounds(t[1],0,0,t[3])[1]),reverse=True)
for ref,f,anchor,angle in pending:
    candidates=[(x/2,y/2,ang) for ang in [angle,(angle+90)%180] for x in range(172,369,2) for y in range(150,247,2)]
    candidates.sort(key=lambda v:(v[0]-anchor[0])**2+(v[1]-anchor[1])**2)
    found=None
    for x,y,ang in candidates:
        b=bounds(f,x,y,ang)
        if b[0]<86 or b[1]<75 or b[2]>184 or b[3]>123:continue
        if any(hit(b,o) for o in occupied):continue
        found=(x,y,ang);break
    if found:place(f,*found)
    else:staged.append(ref);place(f,195+len(staged)%6*15,80+len(staged)//6*20,angle)
def canonical_layers(a):
    for v in a:
        if isinstance(v,list):
            if v[0]=='layer' and v[1]==q('F.Courtyard'):v[1]=q('F.CrtYd')
            canonical_layers(v)
canonical_layers(board)
# Keep assembly values on Fab. Put reference designators on free silkscreen
# positions rather than retaining library defaults inside neighbouring parts.
obstacles=[];label_boxes=[]
for f in cs(board,'footprint'):
    fx,fy,fa=map(float,one(f,'at')[1:]);theta=math.radians(-fa)
    def world(px,py):return fx+px*math.cos(theta)-py*math.sin(theta),fy+px*math.sin(theta)+py*math.cos(theta)
    for pad in cs(f,'pad'):
        pa=one(pad,'at');px,py=world(float(pa[1]),float(pa[2]));w,h=map(float,one(pad,'size')[1:3]);a=math.radians(float(pa[3]) if len(pa)>3 else 0);bw=abs(w*math.cos(a))+abs(h*math.sin(a));bh=abs(h*math.cos(a))+abs(w*math.sin(a));obstacles.append((px-bw/2-.2,py-bh/2-.2,px+bw/2+.2,py+bh/2+.2))
    for g in f:
        if not isinstance(g,list) or not g[0].startswith('fp_') or one(g,'layer')[1:]!=[q('F.SilkS')]:continue
        if g[0]=='fp_text':
            if val(getprop(f,'Reference')[2])!='J6':one(g,'layer')[1]=q('F.Fab')
            continue
        pts=[]
        for k in ['start','end','center']:
            if one(g,k):pts.append(world(*map(float,one(g,k)[1:3])))
        pts += [world(*map(float,xy[1:3])) for xy in cs(one(g,'pts'),'xy')]
        if pts:obstacles.append((min(p[0] for p in pts)-.2,min(p[1] for p in pts)-.2,max(p[0] for p in pts)+.2,max(p[1] for p in pts)+.2))
for f in cs(board,'footprint'):
    p=getprop(f,'Value')
    if p:one(p,'layer')[1]=q('F.Fab')
    ref=getprop(f,'Reference');name=val(ref[2]);fx,fy,fa=map(float,one(f,'at')[1:]);w=max(1.4,len(name)*.8+.4);h=1.3
    candidates=[(fx+dx/2,fy+dy/2) for dx in range(-14,15) for dy in range(-14,15)];candidates.sort(key=lambda p:(p[0]-fx)**2+(p[1]-fy)**2)
    chosen=None
    for x,y in candidates:
        b=(x-w/2,y-h/2,x+w/2,y+h/2)
        if b[0]<86 or b[1]<75.2 or b[2]>184 or b[3]>122.8 or any(hit(b,o) for o in obstacles+label_boxes):continue
        chosen=(x,y);label_boxes.append(b);break
    if name=='C13':chosen=None  # crowded Pico edge; retain reference on assembly layer
    ref[:]=[v for v in ref if not(isinstance(v,list) and v and v[0] in ['at','layer','effects','hide'])]
    if chosen:
        x,y=chosen;a=math.radians(fa);dx=x-fx;dy=y-fy
        ref += [['at',str(round(dx*math.cos(a)-dy*math.sin(a),4)),str(round(dx*math.sin(a)+dy*math.cos(a),4)),'0'],['layer',q('F.SilkS')],['effects',['font',['size','.8','.8'],['thickness','.12']]]]
    else:ref += [['at','0','0','0'],['layer',q('F.Fab')],['hide','yes'],['effects',['font',['size','.8','.8'],['thickness','.12']]]]
new='(kicad_pcb\n'+'\n'.join('  '+dump(x) if isinstance(x,list) else '  '+x for x in board[1:])+'\n)\n'
d.changes={str(path):(old,new)}
report='PCB synchronization: '+str(len(cs(board,'footprint')))+' footprints.\nUnplaced outside board: '+', '.join(staged)+'\nRouting remains unfinished.\n'
d.changes[str(d.ROOT/'placement-status.txt')]=(None,report)
if __name__=='__main__':d.emit()
