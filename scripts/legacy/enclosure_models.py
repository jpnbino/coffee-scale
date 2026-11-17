"""Generate explicitly provisional enclosure reference solids using FreeCAD."""
from pathlib import Path
import FreeCAD as A
import Part

out=Path('src/models');out.mkdir(exist_ok=True)
doc=A.newDocument('EnclosureReferences')
def obj(name,shape,color):
    o=doc.addObject('PartDesign::Feature',name);o.Shape=shape
    return o
def box(x,y,z,dx,dy,dz):return Part.makeBox(dx,dy,dz,A.Vector(x,y,z))
def vrml(filename,shapes,colors):
    lines=['#VRML V2.0 utf8']
    # KiCad VRML unit is 0.1 inch; convert mm to 2.54mm units.
    for s,c in zip(shapes,colors):
        points,triangles=s.tessellate(.08)
        coords=','.join(f'{p.x/2.54:.6f} {p.y/2.54:.6f} {p.z/2.54:.6f}' for p in points)
        indices=','.join(f'{a} {b} {c} -1' for a,b,c in triangles)
        lines.append('Shape { appearance Appearance { material Material { diffuseColor '+c+' } } geometry IndexedFaceSet { coord Coordinate { point ['+coords+'] } coordIndex ['+indices+'] } }')
    (out/filename).write_text('\n'.join(lines),encoding='utf-8')
# Photo dimensions: 27.38 x 27.72 PCB; hole centre spacing 21.24 x 21.70.
# Header-to-edge offset, hole diameter, thickness and height remain assumptions.
pcb=box(-9.88,-25.02,10,27.38,27.72,1.2)
for x in [-6.81,14.43]:
    for y in [-22.01,-.31]:pcb=pcb.cut(Part.makeCylinder(1.1,1.2,A.Vector(x,y,10)))
shapes=[pcb,box(-8.88,-20.82,11.2,25.38,18,1.2),box(-6.54,-18.12,12.4,21.70,10.85,.1)]
shapes.append(box(-1.27,-1.27,0,10.16,2.54,8.5))
for x in [0,2.54,5.08,7.62]:shapes.append(box(x-.32,-.32,8.5,.64,.64,2.7))
# Transform horizontal picture/header into KiCad local header Y axis.
for s in shapes:s.rotate(A.Vector(),A.Vector(0,0,1),-90)
oled=obj('OLED_photo_reference',Part.makeCompound(shapes),(0,0,1))
Part.export([oled],str(out/'OLED_096_photo_reference.step'))
vrml('OLED_096_photo_reference.wrl',shapes,['0.02 0.10 0.35','0.025 0.025 0.035','0.04 0.11 0.16','0.03 0.03 0.03']+['0.8 0.7 0.3']*4)
bz=obj('Buzzer_envelope',box(-6,-6,0,12,12,3),(0,0,0))
Part.export([bz],str(out/'Buzzer_12mm_envelope.step'))
vrml('Buzzer_12mm_envelope.wrl',[bz.Shape],['0.04 0.04 0.04'])
switch_shapes=[box(-4.5,-1.8,0,9,3.6,3.5),box(-2,-3.8,1,3.5,2,1.5)]
sw=obj('Power_switch_travel_envelope',Part.makeCompound(switch_shapes),(0,0,0))
Part.export([sw],str(out/'JS102011SAQN_travel_envelope.step'))
vrml('JS102011SAQN_travel_envelope.wrl',switch_shapes,['0.6 0.6 0.6','0.03 0.03 0.03'])
print('Exported OLED photo reference and provisional buzzer body envelope')
