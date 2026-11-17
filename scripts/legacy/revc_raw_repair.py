"""Reroute the raw supply around the load-switch output escape."""
import route_board as r
from route_board import *
from audit_symbols import parse,one,val,dump
r.TMP=pathlib.Path('tmp/revc-routing');r.STEP=.025;r.W=4001;r.H=2401
p=r.TMP/'routing-candidate.kicad_pcb';tree=parse(p.read_text(encoding='utf-8'));keep=[]
for i in tree:
    if isinstance(i,list) and i[0] in ['segment','via']:
        if val(one(i,'net')[1])=='/RAW_SW':continue
        if i[0]=='via' and tuple(map(float,one(i,'at')[1:3])) in [(95.775,91.5),(96.525,101.175)]:continue
    keep.append(i)
p.write_text(dump(keep),encoding='utf-8');b=k.LoadBoard(str(p));k.SaveBoard(str(p),b)
r.prepare(True,['/RAW_SW'])
