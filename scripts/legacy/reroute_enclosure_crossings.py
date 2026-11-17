"""Give the charger ground return priority over three crossing nets."""
from route_board import *
from audit_symbols import parse,one,val,dump
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing');p=r.TMP/'routing-candidate.kicad_pcb'
nets=['/HX_DOUT','/CHG_PROG','/USB5'];tree=parse(p.read_text(encoding='utf-8'))
tree=[i for i in tree if not(isinstance(i,list) and i[0] in ['segment','via'] and val(one(i,'net')[1]) in nets)]
p.write_text(dump(tree),encoding='utf-8');b=k.LoadBoard(str(p));k.SaveBoard(str(p),b)
r.prepare(True,nets)
