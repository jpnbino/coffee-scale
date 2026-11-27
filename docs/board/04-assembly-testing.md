# Assembly and testing

What you need to build one, how to power it up safely the first time, and the state of the assembly data.

## Build options

- **Bare PCB:** fabrication data only.
- **Assembled carrier:** factory-fitted components; the Pico and the off-board
  parts are added separately, as the assembly profile describes.
- **Complete instrument:** a future release with enclosure, battery, load cell,
  OLED, firmware, wiring, calibration and acceptance tests.

## What you need

Besides the PCB and its components:

| Item | Notes |
| --- | --- |
| Raspberry Pi Pico W | Soldered by its castellated edges, or on 2.54 mm socket strips. Socket-mounted boards need separate SWD jumpers (see [Interfaces](03-interfaces.md)). |
| SSD1306 0.96" I²C OLED module | 4-pin header in the order GND, 3V3, SCL, SDA (J3). Check your module's pin order; they vary. Mounting height is provisional. |
| Single lithium cell with JST PH 2.0 mm plug | LP503040 is the intended size only. Chemistry, ratings and plug polarity must be checked against J4 (pin 1 BAT_P) before connecting. |
| Four-wire load cell | 2 kg capacity intended. Identify the wires from the cell's datasheet; colours are not standard. |
| Case, platform and load-cell mount | Not designed yet. One end of the cell fixed, the other free. |

## First power-on

1. Inspect for shorts, solder bridges, polarity and wrong parts. With no cell
   connected, measure the resistance from 3V3 to GND.
2. Power from USB-C with **no cell and no Pico**. Check the 3V3 rail.
3. Fit the Pico. **Do not plug a USB cable into the Pico itself**: the board
   powers it directly and its own regulator is disabled.
4. Only after checking the cell's specification and plug polarity, connect the
   cell and check charging and protection.

## Bring-up checklist

1. Verify regulated 3.3 V, charging, load sharing and battery protection.
2. Measure wake margin, start-up behaviour and shutdown current.
3. Exercise the OLED, controls, buzzer and debug port with firmware.
4. Calibrate with known masses; check repeatability and noise with Wi-Fi,
   charging and the buzzer active.
5. Check case fit, button travel, the sound opening and load-cell isolation.

This is a planned sequence, not a record of completed testing. Prototype
firmware for a breadboard build is in
[coffee-scale-firmware](https://github.com/jpnbino/coffee-scale-firmware); it is
not yet ported to this board. There is no tested production programming
procedure.

## State of the assembly data

The assembly profile is intentionally incomplete. Most components still need
exact manufacturer part numbers and supplier selection, and the generated
readiness report lists every blocker. A correct electrical value alone does not
approve a footprint, package height, voltage rating or placement rotation.

The candidate placement file uses KiCad's native origins. The Gerber page flags
every part whose origin is far from the centre of its body, and lists the pin map
of every named part to compare with datasheets (see
[Checks before ordering](06-revision-review.md#checks-before-ordering)). The
assembler's own zero-angle conventions are not checked. Strict
assembly release stays blocked until placement has been reviewed for this exact
board checksum.
