# Circuit and power

## Controller and measurements

The Pico W connects to an I²C OLED and an HX711 with four solder pads for a
four-wire load cell. The intended cell capacity is 2 kg. Wire colours must be
identified from the actual load cell; they are not a universal pinout.

The carrier supplies regulated 3.3 V to Pico pin 36. Pin 37, 3V3_EN, is grounded
to disable the Pico's onboard regulator. VSYS and VBUS are unused. **Do not
connect the Pico USB port while using this external-power arrangement.**

## Battery and charging

USB-C is charging/power only, with separate CC pull-downs. An MCP73831 charges
a single 4.2 V lithium cell, provisionally at 100 mA with a 10 kΩ PROG resistor.
A Schottky/PMOS load-sharing network supports operation while charging.
DW01A protection and opposing MOSFETs separate raw cell negative, BATT_NEG,
from protected circuit ground. Do not bypass that protection by shorting them.

LP503040 describes the intended cell size, not a complete approved battery
specification. Cell chemistry, ratings, temperature limits and JST polarity
remain to be verified. There is no battery thermistor circuit.

## Controls and shutdown

Two top buttons provide TARE and START/STOP. The Same Sky TS43 switch provides
momentary up/down and centre press; it is not a quadrature encoder.
Centre press starts the hardware wake circuit. Firmware must assert PWR_HOLD
immediately, before Wi-Fi initialization, and wait for centre release before
shutdown. The intended inactivity timer is one hour; firmware is not included.

The master switch disconnects the system load. Charging and battery protection
remain active. The piezo buzzer is bottom-mounted and requires external PWM
drive, nominally around 4 kHz.
