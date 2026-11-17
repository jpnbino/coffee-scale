PICO W SCALE CONTROLLER - PROTOTYPE REVISION A
HISTORICAL EXPORT: superseded by ../revB after the enclosure layout changes.
Use the Rev B package for the current primary project.
Fabrication export: 2026-11-04, KiCad 10.0.8

UPLOAD PACKAGE
Use pico_scale_controller-revA-gerbers.zip for PCB fabrication only.
It contains top/bottom copper, top/bottom solder mask, top/bottom silkscreen,
the board profile, a Gerber job file and separate PTH/NPTH Excellon drills.
Paste/stencil layers and assembly placement files are intentionally omitted.
The IPC-D-356 electrical test netlist is supplied separately.

ORDERING SETTINGS
Board: two-layer FR-4, nominal 100.00 x 50.00mm, 1.6mm thick.
Rounded corners: 5.0mm radius. Four 3.2mm non-plated mounting holes.
Copper: standard 1oz outer copper. Green solder mask, white silkscreen.
Surface finish: lead-free HASL is suitable for prototype ordering; ENIG may be
selected for flatter fine-pitch pads. No impedance-control option is required.
Minimum routed track width/spacing: 0.20/0.20mm.
Vias: 0.60mm copper diameter, 0.30mm finished drill.
USB shell anchors use 0.60mm plated routed slots; keep PTH and NPTH separate.
Gerbers and drills use matching absolute coordinates and metric units.
The job-file 100.05 x 50.05mm bounding box includes the 0.05mm profile stroke;
the profile centreline defines the actual 100.00 x 50.00mm board outline.

VALIDATION
KiCad schematic ERC: 0 errors/warnings.
KiCad PCB DRC, including all track errors: 0 errors/warnings.
Unconnected items: 0. Schematic/PCB parity issues: 0.
270 named pads cross-checked against the schematic netlist.
61 footprints, 709 track segments, 180 vias and two ground pours.
Drills: 239 plated holes/slots (including 180 vias), 12 non-plated holes.
See final-drc.json, final-drc.rpt, final-erc.rpt and verification.txt.

PROTOTYPE REVIEW BEFORE ORDERING / POWERING
This board has not been built or electrically tested.
Confirm the actual LP503040 battery is a 4.2V single Li-ion/polymer cell,
its allowed charging/discharging limits, and its JST cable polarity. The
100mA charge setting is provisional pending the actual cell datasheet.
There is no cell thermistor input. Keep the Pico antenna region free of
metal, battery foil and enclosure obstructions. Review OLED standoffs and
connector orientation against the physical display before enclosure assembly.

FIRMWARE / DEBUG
Pico GP13 must assert PWR_HOLD early in boot and release it on the one-hour
inactivity timeout. Hold WAKE while initially programming an unconfigured Pico.
The debug header 3V3 pin is a target reference, not an external power input.
For socket mounting, connect the Pico's three SWD pads with jumper wires;
the 40-pin sockets alone do not carry SWD.
The master switch disconnects the system load; battery charging remains active.
Firmware and cell-specific certification are outside this hardware export.

PREVIEW
board-top.png is a visual preview. The custom buzzer has no 3D body model, so
its two large pads are shown; the fabrication footprint follows its datasheet.
