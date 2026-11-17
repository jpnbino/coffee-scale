COFFEE SCALE CONTROLLER - REV B PROTOTYPE - 2026-11-04
HISTORICAL EXPORT: superseded by ../revC for the current primary project.

Current enclosure-oriented layout. This replaces Rev A for the current design.
Use pico_scale_controller-revB-gerbers.zip for PCB fabrication only.
Two-layer FR-4, 100 x 50mm outline, R5 corners, nominal 1.6mm thickness,
standard 1oz copper, green mask/white silkscreen. Lead-free HASL or ENIG.
No controlled impedance. Minimum track/spacing 0.20/0.20mm.
Vias 0.60mm diameter / 0.30mm drill. Four 3.2mm NPTH mounting holes.
USB shell anchors include 0.60mm plated slots; retain separate PTH/NPTH drills.
Job-file outline bounding size includes 0.05mm profile stroke; actual profile
centreline is 100.00 x 50.00mm. No stencil or assembly services are included.

Package: seven Gerber layer files, Gerber job file and two Excellon drill files.
Separate IPC-D-356 electrical test netlist and drill report are included nearby.
See final-drc.json, final-drc.rpt, final-erc.rpt and verification.txt.
Configured KiCad checks: zero ERC/DRC violations, zero unconnected items and
zero schematic parity issues. 270 named pads match the schematic netlist.
61 footprints; 793 track segments; 191 vias. No new DRC exclusions were added.

Placement changes: right-edge USB-C, top-edge load-cell pads, nearby HX711,
top-accessible buttons, underside buzzer/R3/R15, retained battery connector.
The current PCB and its models are in the main project. The complete mechanical
reference STEP, PNG previews, SVG layout and coordinate JSON are in enclosure-revB.
Read enclosure-revB/ENCLOSURE_NOTES.txt before designing or printing the case.
OLED dimensions from the supplied photo: PCB 27.38 x 27.72mm, hole spacing
21.24 x 21.70mm. Thickness, hole diameter, connector offsets and stack height
are provisional. The model is a clearance reference, not a manufacturer model.

This prototype has not been built, weighed with a load cell or electrically tested.
Confirm the actual LP503040 cell's rating/charge limits and connector polarity
before powering. Charge current remains 100mA; no cell thermistor is fitted.
Pico GP13 must hold power after boot; firmware must implement the one-hour timeout.
Socket-mounted Pico SWD needs three jumper wires. The debug 3V3 pin is reference
only. The master switch shuts off the load while charging remains active.
Account for actual Pico socket height, display supports, switch/plunger travel,
buzzer sound clearance and load-cell mounting/overload stops in the case.
