# Mechanics, revisions and open work

What a case designer needs, what changed in Revision E, and what is still open.

## Enclosure collaboration

Share the entire mechanical package. It includes populated/bare STEP, the
native outline DXF, a local mounting-hole DXF, all component origins and a
coordinate guide. All 68 board features are read from the current IPC-2581
export; this includes the mounting holes and integral load-cell pads.

The display is parallel to the PCB, provisionally 10 mm above its top surface
at the module underside. Pico socket height, battery envelope and load-cell
mounting are not modelled. Confirm these with the physical parts.

The right-side controls deliberately extend beyond the board. Provide actuator
clearance, button plungers, USB/battery openings and a bottom buzzer opening.
Keep metal, battery foil and wiring away from the Pico antenna region.

## Revision E

Preserved the owner's controller, ADC, connector and control positions.
Repositioned supporting circuitry, aligned resistor/capacitor axes, completed
routing and refilled protected-ground pours. The project remains unbuilt.

## Still to complete

- Manufacturer-approved part selection and placement review.
- Measured mechanical stack, enclosure and load-cell/platform arrangement.
- Firmware for this board, calibration, and physical testing of a Rev E board.
- A hardware and documentation license. The repository is public, but until a
  license is chosen others may read the design without permission to reuse it.
- Tagged GitHub Releases carrying the manufacturing packages.

Every push to `main` is validated and built in CI, and this portal is published
from that build. No manufacturing order has been placed.
