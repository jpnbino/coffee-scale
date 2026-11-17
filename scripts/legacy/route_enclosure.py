"""Reuse the checked routing exporter in an isolated Rev B workspace."""
import sys,pathlib
import route_board as r
from audit_symbols import parse,dump
r.TMP=pathlib.Path('tmp/enclosure-routing');r.TMP.mkdir(exist_ok=True)
candidate=pathlib.Path('src/enclosure-revB/pico_scale_controller.kicad_pcb')
if sys.argv[1]=='prepare':
    tree=parse(candidate.read_text(encoding='utf-8'))
    tree=[i for i in tree if not(isinstance(i,list) and i[0]=='zone')]
    (r.TMP/'routing-placed.kicad_pcb').write_text(dump(tree),encoding='utf-8')
    r.prepare()
elif sys.argv[1]=='import':r.import_route()
elif sys.argv[1]=='stitch':r.stitch()
elif sys.argv[1]=='repair_prepare':r.prepare(True,['/GND','/I2C_SCL'])
elif sys.argv[1]=='repair_import':r.import_route(True)
