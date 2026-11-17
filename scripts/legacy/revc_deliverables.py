"""Write BOM and actual Rev C enclosure coordinates; preserve nominal caveats."""
from route_board import *
import csv
REV=ROOT/'concept-revC';b=k.LoadBoard(str(REV/'pico_scale_controller.kicad_pcb'));fs={f.GetReference():f for f in b.GetFootprints()}
coords={name:{'x':round(xy(f.GetPosition())[0]-85,5),'y':round(xy(f.GetPosition())[1]-74,5),'rotation_deg':f.GetOrientationDegrees(),'side':'bottom' if f.GetLayer()==k.B_Cu else 'top'} for name,f in fs.items()}
data={'revision':'C','units':'mm','origin':'top-left PCB outline corner, top view, X right / Y down','board':{'width':100,'height':60,'thickness':1.6,'corner_radius':5,'hole_diameter':3.2},'footprint_origins':coords,'OLED_provisional':{'PCB_bounds':[50.31,10.14,77.69,37.86],'mounting_holes':[[x,y] for x in [53.38,74.62] for y in [13.15,34.85]],'assumed_hole_diameter':2.2,'underside_above_PCB_top':10,'top_above_PCB_top':12.5},'encoder_reference':{'part':'PEC12R-2217F-S0024','axis_topview':[85.75,43.0],'assumed_axis_height_above_PCB_top':10,'body_envelope_height':16.7,'wheel_diameter':14,'wheel_outer_side_X':103.25,'axial_press_travel_nominal':.5,'wheel_file':'models/Thumbwheel_D14_prototype.stl'},'case_review':['Encoder body/shaft height and wheel fit require physical verification; model is a clearance envelope.','Allow at least 17.5mm above PCB top for this encoder envelope, plus case/lid tolerances.','Pico sockets and battery envelope are not modelled.','Support encoder loads on the fixed case; keep weighing platform mechanically isolated.']}
(REV/'enclosure-coordinates.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
with (REV/'bom.csv').open('w',newline='',encoding='utf-8-sig') as out:
    w=csv.writer(out);w.writerow(['Reference','Value / part','Footprint','Side'])
    for name,f in sorted(fs.items()):w.writerow([name,f.GetValue(),str(f.GetFPID().GetLibItemName()),coords[name]['side']])
stats={'footprints':len(fs),'named_pads':sum(bool(p.GetNetname()) for f in fs.values() for p in f.Pads()),'segments':sum(not isinstance(t,k.PCB_VIA) for t in b.GetTracks()),'vias':sum(isinstance(t,k.PCB_VIA) for t in b.GetTracks())}
(REV/'board-statistics.json').write_text(json.dumps(stats,indent=2)+'\n');print(stats)
