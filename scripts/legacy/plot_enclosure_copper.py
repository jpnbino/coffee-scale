"""Render local copper geometry for routing review, independent of GUI state."""
from route_board import *
from PIL import Image,ImageDraw
b=k.LoadBoard('tmp/enclosure-routing/routing-candidate.kicad_pcb')
colors={'/GND':'#558855','/USB5':'#ed4040','/CHG_PROG':'#ffff00','/HX_DOUT':'#0088ff'}
for name,x0,y0,x1,y1 in [('charge',104,79,114,88),('adc',140,75,149,85),('gpio',110,86,120,95)]:
    for layer in [k.F_Cu,k.B_Cu]:
        scale=90;im=Image.new('RGB',(int((x1-x0)*scale),int((y1-y0)*scale)),'#151515');d=ImageDraw.Draw(im)
        def pt(p):return ((p[0]-x0)*scale,(p[1]-y0)*scale)
        def poly(ps,color):
            for o in outline(ps):d.polygon([pt(p) for p in o],fill=color)
        for f in b.GetFootprints():
            for p in f.Pads():
                if p.GetLayerSet().Contains(layer):poly(p.GetEffectivePolygon(layer),colors.get(p.GetNetname(),'#777777'))
        for t in b.GetTracks():
            if not t.GetLayerSet().Contains(layer):continue
            ps=k.SHAPE_POLY_SET();t.TransformShapeToPolygon(ps,layer,0,k.FromMM(.005),k.ERROR_OUTSIDE);poly(ps,colors.get(t.GetNetname(),'#777777'))
        for x in range(math.ceil(x0),math.ceil(x1)):
            for y in range(math.ceil(y0),math.ceil(y1)):d.text(pt((x,y)),f'{x},{y}',fill='white')
        im.save(f'tmp/{name}-{layer}.png')
