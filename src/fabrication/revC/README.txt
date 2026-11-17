COFFEE SCALE - IMPLEMENTED REV C PROTOTYPE - 2026-11-04
HISTORICAL EXPORT: superseded by ../revD with the TS43 and revised placement.

CURRENT PACKAGE: pico_scale_controller-revC-gerbers.zip, PCB fabrication only.
FR-4, 2 layers, 100 x 60mm outline, R5 corners, 1.6mm thickness, 1oz copper.
Black solder mask, white silkscreen, ENIG (gold pads) for the approved appearance.
No impedance control. Minimum track width/spacing 0.20/0.20mm.
Vias: 0.60mm diameter, 0.30mm drill. Four 3.2mm NPTH mounting holes.
Separate plated/non-plated Excellon files; preserve routed slots for USB and
encoder anchors. Job-file bounding size includes the 0.05mm profile stroke;
the actual centreline profile is 100.00 x 60.00mm.

ZIP CONTENTS: top/bottom copper, top/bottom mask, top/bottom silkscreen,
outline, Gerber job file and separate PTH/NPTH drills. No stencil/assembly order.
IPC-D-356 netlist, BOM, drill report and validation reports are supplied nearby.

CHECKS: configured ERC 0, DRC 0, unconnected 0, schematic parity 0.
All 285 named pads match the schematic netlist. 68 footprints, 643 segments,
175 vias. No new DRC exclusions. This is unbuilt, untested prototype hardware.

The primary project contains Rev C. The previous Rev B source files are in
backup-before-revC. Rev A/B manufacturing ZIPs do not describe this revision.
concept-revC contains the actual PCB renders, schematic PDF, STEP assembly,
wheel prototype STL, coordinates and REVISION_C_NOTES.txt.

KEY CHANGES: vertical Pico W, retained battery connector, left-side load-cell/
HX711, right-side charging/USB-C/master/encoder, two top buttons, bottom buzzer.
SW1 = PEC12R-2217F-S0024 encoder with push. Push starts hardware power latch
and gives GP14 an isolated ACTIVE HIGH press signal. Assert GP13 immediately
at boot; release the button before firmware shuts down. New GPIO mapping and
the RC wake/filter details are in REVISION_C_NOTES.txt; firmware is not included.

BEFORE BUILD / POWER: verify actual LP503040 cell specification and JST polarity.
Charging remains nominal 100mA with protection; no cell thermistor is fitted.
Pico uses external 3.3V with its regulator disabled; do not connect Pico USB.
Debug header 3V3 is reference only; socketed Pico needs three SWD jumpers.
The master switch leaves the charging/protection circuits active.

MECHANICAL LIMITS: OLED and encoder/wheel models are clearance references.
Measure OLED height, module holes, actual encoder axis/shaft/press travel and
Pico socket height before finalizing the enclosure. The supplied 14mm wheel STL
is a fit prototype. Start with 17.5mm top clearance and at least 4mm bottom
clearance for this model set; account for tolerances and actual sockets.
No complete case or load-cell mounting assembly is supplied.
