# Overview

What the board is, where it stands, and how to find your way around this release.

An open-hardware controller for a coffee weighing scale, using a Raspberry Pi
Pico W, HX711 bridge ADC, SSD1306 OLED and a rechargeable single-cell battery.
Wi-Fi is available for experiments such as recording brewing sessions and usage.

## Hardware status

Revision E is a routed, electrically checked prototype. There is no claim of
bench validation or production qualification. The release build checks the
saved schematic and PCB together and reports the exact source checksums.

The board is 100 × 60 mm, two copper layers and 1.6 mm thick, with rounded
corners and four 3.2 mm mounting holes. The Pico/debug are left, load-cell
interface is upper, and charging/power/navigation are on the right.

## Explore this release

Use the design viewer for PCB and schematic inspection, the parts table to
filter components, and the downloads for fabrication or enclosure development.
The assembly package is a draft until its readiness checks are resolved.
The PCB hardware revision is distinct from the timestamped build ID.

## Source of truth

KiCad source files define the circuit and geometry. Component fields and the
assembly profile define purchasing/population intent. These Markdown pages
explain design decisions and limitations. Generated output is never the place
to edit the authoritative design.
