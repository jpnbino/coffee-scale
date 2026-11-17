COFFEE SCALE - REV D PROTOTYPE - 2026-11-04

HISTORICAL PACKAGE: superseded by ../revE after the owner's placement update.
Archive: pico_scale_controller-revD-gerbers.zip, PCB fabrication only.
FR-4, 2 layers, 100 x 60mm profile, R5 corners, 1.6mm, 1oz copper.
Black solder mask, white silkscreen, ENIG. No controlled impedance.
Track/spacing minimum 0.20/0.20mm; vias 0.60mm / 0.30mm drill.
Four 3.2mm NPTH mounting holes; TS43 has two additional 0.9mm NPTH locating holes.
Preserve separate plated/non-plated drills and USB plated routed slots.
Gerber job bounding size includes the 0.05mm outline stroke; centreline is
100.00 x 60.00mm. ZIP contains seven layers, job file and two Excellon files.
No assembly/stencil service is included; IPC-D-356, BOM and reports are separate.

CHECKS: configured ERC/DRC 0, unconnected 0, schematic parity 0.
All 288 named pads cross-check against the schematic. 68 footprints, 571
segments and 176 vias. No new DRC exclusions. This hardware is unbuilt/untested.

REV D: battery connector near USB; Pico/debug moved left; HX711 and load-cell
pads at the upper edge. SW1 is Same Sky TS43-135255-10-BK-200-SMT-TR. It uses
momentary UP/DOWN and centre select, not rotary encoder pulses. Centre also
starts the isolated hardware wake circuit. The old Bourns wheel is not used.
The primary project is current Rev D; Rev C sources are in backup-before-revD.

Read concept-revD/REVISION_D_NOTES.txt for the custom land pattern, 0.9mm locating
hole allowance, manufacturer CAD alignment, GPIO mapping and wake sequencing.
Use concept-revD/coffee-scale-revD.step for the electronics enclosure reference.
OLED stack and Pico socket height remain provisional; measure physical parts.
Allow room for the TS43 +/-20deg lever and centre travel, top button plungers,
buzzer sound opening and mechanically isolated load-cell/platform mounting.

Before powering, confirm the actual LP503040 cell limits and JST polarity.
Charging remains nominally 100mA; protection/load sharing retained; no cell
thermistor. Do not short raw BATT_NEG to protected GND. Pico uses external 3.3V
with onboard regulator disabled; do not connect its USB. Debug 3V3 is reference
only; socket mounting needs SWD jumpers. Master OFF leaves charging active.
Firmware must hold GP13 early at startup and read GP10/11 as debounced direction
switches, GP14 as active-high centre press. Release centre before shutdown.
Bench-test wake margin, charging, shutdown current and weighing noise before use.
