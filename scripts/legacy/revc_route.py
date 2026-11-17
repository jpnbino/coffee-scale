"""Route Rev C in an isolated workspace with the approved 100x60mm bounds."""
import route_board as r
import pathlib,sys,shutil
r.TMP=pathlib.Path('tmp/revc-routing');r.TMP.mkdir(exist_ok=True)
r.ROOT=pathlib.Path('src/concept-revC');r.H=1201
if sys.argv[1]=='prepare':
    shutil.copy2(r.ROOT/'pico_scale_controller.kicad_pcb',r.TMP/'routing-placed.kicad_pcb');r.prepare()
elif sys.argv[1]=='import':r.import_route()
elif sys.argv[1]=='stitch':r.stitch()
elif sys.argv[1]=='repair_import':r.import_route(True)
