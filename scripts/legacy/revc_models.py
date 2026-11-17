"""Create datasheet-based encoder clearance solids and a removable wheel."""
from pathlib import Path
import math
import FreeCAD as A
import Part,Mesh
out=Path('pico_scale_controller/concept-revC/models');out.mkdir(exist_ok=True)
doc=A.newDocument('RevCControls')
def box(x,y,z,dx,dy,dz):return Part.makeBox(dx,dy,dz,A.Vector(x,y,z))
def cyl(radius,length,x,y,z):return Part.makeCylinder(radius,length,A.Vector(x,y,z),A.Vector(1,0,0))
def save(name,shapes,colors):
    o=doc.addObject('PartDesign::Feature',name);o.Shape=Part.makeCompound(shapes);Part.export([o],str(out/(name+'.step')))
    lines=['#VRML V2.0 utf8']
    for shape,color in zip(shapes,colors):
        p,t=shape.tessellate(.06);coords=','.join(f'{v.x/2.54:.6f} {v.y/2.54:.6f} {v.z/2.54:.6f}' for v in p);indices=','.join(f'{a} {b} {c} -1' for a,b,c in t)
        lines.append('Shape { appearance Appearance { material Material { diffuseColor '+color+' } } geometry IndexedFaceSet { coord Coordinate { point ['+coords+'] } coordIndex ['+indices+'] } }')
    (out/(name+'.wrl')).write_text('\n'.join(lines))
    return o
# Clearance envelope, not a manufacturer-supplied production model. Axis is
# nominally 10mm above the PCB; verify this and press travel with physical parts.
y0=-2.5;z0=10
shaft=cyl(3,10.7,-14.25,y0,z0).cut(box(-14.25,y0+1.5,6,5,3,8))
shapes=[box(-3.55,-9,3.3,4.9,13,13.4),box(1.35,-9,3.3,4.8,13,13.4),cyl(3.5,4.2,-7.75,y0,z0),shaft]
colors=['0.65 0.66 0.68','0.07 0.07 0.07','0.60 0.61 0.63','0.06 0.06 0.06']
for x,y in [(0,0),(0,-2.5),(0,-5),(2.5,0),(2.5,-5)]:shapes.append(box(x-.4,y-.4,-2.8,.8,.8,6.1));colors.append('0.65 0.65 0.67')
for y in [3.95,-8.95]:shapes.append(box(2.6,y-.7,-2.8,1.8,1.4,6.1));colors.append('0.65 0.65 0.67')
save('PEC12R_clearance_reference',shapes,colors)
wheel=cyl(7,2.6,-17.5,y0,z0).fuse(cyl(4.5,6,-17.5,y0,z0))
hole=cyl(3.1,8,-18,y0,z0).common(box(-18,y0-4,z0-4,8,5.6,8))
wheel=wheel.cut(hole)
for i in range(40):
    a=i*math.pi/20;wheel=wheel.cut(cyl(.30,2.8,-17.6,y0+7*math.cos(a),z0+7*math.sin(a)))
save('Thumbwheel_D14_prototype',[wheel],['0.055 0.055 0.06'])
printable=wheel.copy();printable.rotate(A.Vector(),A.Vector(0,1,0),-90);bb=printable.BoundBox;printable.translate(A.Vector(-bb.XMin,-bb.YMin,-bb.ZMin));printable.exportStl(str(out/'Thumbwheel_D14_prototype.stl'))
assert wheel.isValid() and wheel.Volume>0
print('Created encoder clearance envelope, aligned wheel STEP/VRML and print-oriented STL')
