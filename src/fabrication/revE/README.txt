COFFEE SCALE - REV E PROTOTYPE - 2026-11-04

CURRENT PACKAGE: pico_scale_controller-revE-gerbers.zip, PCB fabrication only.
FR-4, 2 layers, 100x60mm centreline profile, R5 corners, 1.6mm, 1oz copper.
Black mask, white silkscreen, ENIG. No controlled impedance.
Minimum copper track/spacing: 0.20/0.20mm. Power trunks also use 0.40mm tracks.
Vias: 164 at 0.60/0.30mm; one load-switch escape at 0.55/0.30mm.
Four 3.2mm NPTH mounting holes; preserve both separate PTH/NPTH drill files
and USB plated routed slots. Gerber job bounding dimensions include the
0.05mm outline stroke. ZIP contains seven layers, job file and two drill files.

CHECKS: ERC 0, full-track DRC 0, unconnected 0, schematic parity 0.
68 footprints, 288 schematic-verified pads, 501 track segments, 165 vias.
All 16 owner anchors preserved; 38 resistor/capacitor axes aligned horizontally.
No new DRC exclusions. Prototype hardware remains unbuilt/untested.

The primary PCB and revision-revE are current; older release folders are
historical. Use ../../revision-revE/coffee-scale-revE.step for case development.
See ../../revision-revE/REVISION_E_NOTES.txt for placement and model assumptions.

bom.csv and assembly-reference.csv are separate reference files, not an
assembler-approved BOM/CPL. The CSV excludes footprints with through holes
and uses native KiCad absolute millimetre coordinates with Y-up. Bottom buzzer
remains fitted. Rotation, part sourcing and assembly programming need review
by the assembler before any assembly order. No order was submitted.

Battery/charger/protection/wake circuitry is unchanged. Verify the actual
LP503040 cell ratings and JST polarity, then bench-test charging, startup,
shutdown current and load-cell noise. See ../../DESIGN_NOTES.txt.
