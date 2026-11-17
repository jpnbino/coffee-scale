# Assembly and testing

## Assembly variants

- **Bare PCB:** fabrication data only.
- **Assembled carrier:** factory-selected components; the Pico and remaining
  final-instrument parts are fitted separately according to the assembly profile.
- **Complete instrument:** future release including enclosure, battery, load cell,
  OLED, firmware, wiring, calibration and acceptance tests.

The current assembly profile is intentionally incomplete. Most components still
need exact manufacturer part numbers and supplier selection. The generated
readiness report lists each blocker. A correct electrical value alone does not
approve a footprint, package height, voltage rating or placement rotation.

The candidate CPL uses native KiCad placement origins. These are not automatically
validated suction centroids or supplier zero-angle conventions. The board checksum
must match the reviewed placement before strict assembly release is enabled.

## Prototype bring-up checklist

1. Inspect for shorts, solder bridges, polarity errors and incorrect parts.
2. Verify the actual cell limits and connector polarity before connecting a cell.
3. Verify regulated 3.3 V, charging/load-sharing operation and protection behaviour.
4. Measure wake margin, startup behaviour and shutdown current.
5. Exercise OLED, controls, buzzer and debug connections with firmware.
6. Calibrate using known masses; assess repeatability and noise with Wi-Fi,
   charging and buzzer operating.
7. Verify case fit, button travel, sound opening and mechanical load-cell isolation.

This is a planned test sequence, not a record of completed physical testing.
There is no firmware or tested production programming procedure in this release.
