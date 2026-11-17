"""Record the final TS43 layout, BOM and enclosure reference coordinates."""
from route_board import *
import csv
import sys
revision='E' if len(sys.argv)>1 and sys.argv[1]=='E' else 'D'
REV=ROOT/('revision-revE' if revision=='E' else 'concept-revD');b=k.LoadBoard(str(REV/'pico_scale_controller.kicad_pcb'));fs={f.GetReference():f for f in b.GetFootprints()}
coords={name:{'x':round(xy(f.GetPosition())[0]-85,5),'y':round(xy(f.GetPosition())[1]-74,5),'rotation_deg':f.GetOrientationDegrees(),'side':'bottom' if f.GetLayer()==k.B_Cu else 'top'} for name,f in fs.items()}
data={'revision':'D','units':'mm','origin':'top-left PCB outline; X right / Y down, top view','board':{'width':100,'height':60,'thickness':1.6,'corner_radius':5,'corner_hole_diameter':3.2},'footprint_origins':coords,'OLED_provisional':{'PCB_bounds':[39.12,19.3,66.5,47.02],'hole_centres':[[x,y] for x in [42.19,63.43] for y in [22.31,44.01]],'assumed_hole_diameter':2.2,'PCB_underside_above_main_PCB_top':10,'top_above_main_PCB_top':12.5},'TS43':{'part':'TS43-135255-10-BK-200-SMT-TR','function':'momentary CCW / CW and centre push, not quadrature','model_source':'manufacturer STEP, aligned to land pattern','body_height_above_main_PCB_top_in_model':2.7,'locating_hole_diameter':.9,'locating_hole_note':'Prototype allowance over nominal 0.7mm recommendation; both model tab vertex envelopes fit.'},'case_assumptions':{'top_clearance_above_main_PCB_top_minimum_provisional':13,'bottom_clearance_minimum':4,'starting_standoff_height':6},'limitations':['OLED heights/hole diameters remain provisional; physical measurement required.','Pico socket height, battery envelope and load-cell mounts are not modelled.','Check TS43 lever and centre press travel with the physical switch and case.']}
data['revision']=revision
(REV/'enclosure-coordinates.json').write_text(json.dumps(data,indent=2)+'\n')
with (REV/'bom.csv').open('w',newline='',encoding='utf-8-sig') as out:
    w=csv.writer(out);w.writerow(['Reference','Value / part','Footprint','Side'])
    for name,f in sorted(fs.items()):w.writerow([name,f.GetValue(),str(f.GetFPID().GetLibItemName()),coords[name]['side']])
stats={'footprints':len(fs),'named_pads':sum(bool(p.GetNetname()) for f in fs.values() for p in f.Pads()),'segments':sum(not isinstance(t,k.PCB_VIA) for t in b.GetTracks()),'vias':sum(isinstance(t,k.PCB_VIA) for t in b.GetTracks())};(REV/'board-statistics.json').write_text(json.dumps(stats,indent=2)+'\n');print(stats)
