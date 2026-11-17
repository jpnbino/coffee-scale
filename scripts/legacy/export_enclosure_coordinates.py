"""Export actual board coordinates and a dimensioned top-view case reference."""
from route_board import *
rev=ROOT/'enclosure-revB';b=k.LoadBoard(str(ROOT/'pico_scale_controller.kicad_pcb'))
fs={f.GetReference():f for f in b.GetFootprints()}
points={ref:{'x':round(xy(fs[ref].GetPosition())[0]-85,4),'y':round(xy(fs[ref].GetPosition())[1]-74,4),'rotation_deg':fs[ref].GetOrientationDegrees(),'side':'bottom' if fs[ref].GetLayer()==k.B_Cu else 'top'} for ref in ['H1','H2','H3','H4','J1','J3','J4','J6','U5','BZ1','SW1','SW2','SW3','SW4','SW5','SW6']}
data={'units':'mm','origin':'PCB top-left outline corner; top view; x right, y down','board':{'width':100,'height':50,'thickness':1.6,'corner_radius':5,'mounting_hole_diameter':3.2},'footprint_origins':points,'OLED_provisional':{'PCB_bounds':[54.12,13.30,81.50,41.02],'mounting_holes':[[x,y] for x in [57.19,78.43] for y in [16.31,38.01]],'assumed_hole_diameter':2.2,'PCB_underside_above_main_PCB_top':10,'nominal_total_height_above_main_PCB_top':12.5,'active_window_bounds_assumed':[57.46,23.27,79.16,34.12]},'case_assumptions':{'bottom_clearance_minimum':4,'starting_standoff_height':6,'top_clearance_minimum_provisional':13,'power_switch_tip_recess_from_bottom_edge':1.7},'limitations':['OLED reference thickness, hole diameter, header offsets and glass dimensions must be measured.','No enclosure, battery envelope, socket height or load-cell mechanical model is supplied.']}
(rev/'enclosure-coordinates.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="140mm" height="90mm" viewBox="-15 -15 140 90">','<style>text{font:2px sans-serif} .small{font:1.5px sans-serif}</style>','<rect x="0" y="0" width="100" height="50" rx="5" fill="#ecf5ec" stroke="#333" stroke-width=".25"/>','<text x="0" y="-7">Coffee scale Rev B — 100 × 50 mm, R5, four Ø3.2 holes</text>','<text x="0" y="-3">Top view: origin upper left; dimensions in mm. OLED height provisional.</text>']
for ref in ['H1','H2','H3','H4']:
    p=points[ref];svg.append(f'<circle cx="{p["x"]}" cy="{p["y"]}" r="1.6" fill="white" stroke="#333" stroke-width=".2"/>')
svg.append('<rect x="54.12" y="13.3" width="27.38" height="27.72" fill="#729ace" fill-opacity=".35" stroke="#245299" stroke-width=".2"/>')
for x,y in data['OLED_provisional']['mounting_holes']:svg.append(f'<circle cx="{x}" cy="{y}" r="1.1" fill="white" stroke="#245299" stroke-width=".15"/>')
svg.append('<text x="56" y="27">OLED above PCB</text>')
for ref,tag in [('SW2','BTN1'),('SW4','BTN3'),('SW5','BTN4'),('SW3','BTN2'),('SW1','WAKE')]:
    p=points[ref];svg.append(f'<circle cx="{p["x"]}" cy="{p["y"]}" r="1.8" fill="#333"/><text x="{p["x"]+3}" y="{p["y"]+.7}">{tag}</text>')
svg.extend(['<path d="M100 22 h7" stroke="#c33" stroke-width=".5"/><text x="103" y="20">USB-C</text>','<path d="M39 48.3 v7" stroke="#333" stroke-width=".4"/><text x="25" y="59">Power slider: recessed 1.7 mm</text>','<rect x="67" y="24" width="12" height="12" fill="none" stroke="#995b13" stroke-dasharray="1 1" stroke-width=".2"/><text x="67" y="39" class="small">Buzzer underneath</text>','<text x="3" y="10">Battery JST retained</text>','<text x="38" y="7">Load-cell pads / HX711</text>','<text x="0" y="66">Mount PCB and controls to the fixed case base; keep the weighing platform mechanically free.</text>','</svg>'])
(rev/'enclosure-layout.svg').write_text('\n'.join(svg),encoding='utf-8')
print('Exported case coordinates and top-view SVG')
