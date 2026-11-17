"""Align the manufacturer TS43 model to its recommended PCB land pattern."""
import FreeCAD as A,Part
from pathlib import Path
out=Path('pico_scale_controller/concept-revD/models');s=Part.read('tmp/ts43-manufacturer.step')
s.rotate(A.Vector(),A.Vector(0,0,1),-90);s.translate(A.Vector(0,3.6,.45))
doc=A.newDocument('TS43');o=doc.addObject('PartDesign::Feature','TS43');o.Shape=s;Part.export([o],str(out/'TS43_manufacturer.step'))
lines=['#VRML V2.0 utf8']
for i,shape in enumerate(s.Solids):
    p,t=shape.tessellate(.04);color='0.06 0.06 0.06' if i in [1,9] else '0.70 0.70 0.72';coords=','.join(f'{v.x/2.54:.6f} {v.y/2.54:.6f} {v.z/2.54:.6f}' for v in p);indices=','.join(f'{a} {b} {c} -1' for a,b,c in t)
    lines.append('Shape { appearance Appearance { material Material { diffuseColor '+color+' } } geometry IndexedFaceSet { coord Coordinate { point ['+coords+'] } coordIndex ['+indices+'] } }')
(out/'TS43_manufacturer.wrl').write_text('\n'.join(lines));assert all(t.isValid() for t in s.Solids)
print('Aligned manufacturer TS43:',s.BoundBox)
