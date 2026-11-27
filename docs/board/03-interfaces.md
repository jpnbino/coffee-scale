# Interfaces and firmware contract

Every Pico pin and connector the firmware relies on, and the behaviour firmware must implement.

Each signal and connector links to the interactive design viewer, which
highlights the net or part on the schematic and the PCB. The power-up and
shutdown timing firmware must respect is drawn in
[Circuit and power](02-circuit.md#controls-and-shutdown).

| Pico GPIO | Signal | Purpose |
|---|---|---|
| GP0 / GP1 | [UART_TX](https://jpnbino.github.io/coffee-scale/explore.html?net=UART_TX) / [UART_RX](https://jpnbino.github.io/coffee-scale/explore.html?net=UART_RX) | Debug UART |
| GP4 / GP5 | [I2C_SDA](https://jpnbino.github.io/coffee-scale/explore.html?net=I2C_SDA) / [I2C_SCL](https://jpnbino.github.io/coffee-scale/explore.html?net=I2C_SCL) | OLED I²C |
| GP6 / GP7 | [HX_DOUT](https://jpnbino.github.io/coffee-scale/explore.html?net=HX_DOUT) / [HX_SCK](https://jpnbino.github.io/coffee-scale/explore.html?net=HX_SCK) | HX711 |
| GP8 / GP9 | [BTN1](https://jpnbino.github.io/coffee-scale/explore.html?net=BTN1) / [BTN2](https://jpnbino.github.io/coffee-scale/explore.html?net=BTN2) | TARE / START-STOP, active low |
| GP10 / GP11 | [NAV_UP](https://jpnbino.github.io/coffee-scale/explore.html?net=NAV_UP) / [NAV_DOWN](https://jpnbino.github.io/coffee-scale/explore.html?net=NAV_DOWN) | Direction contacts, active low |
| GP12 | [BUZZ_PWM](https://jpnbino.github.io/coffee-scale/explore.html?net=BUZZ_PWM) | Buzzer drive |
| GP13 | [PWR_HOLD](https://jpnbino.github.io/coffee-scale/explore.html?net=PWR_HOLD) | Assert high early to keep system powered |
| GP14 | [NAV_PUSH](https://jpnbino.github.io/coffee-scale/explore.html?net=NAV_PUSH) | Isolated centre-press signal, active high |

| Connector | Pins in order |
|---|---|
| [J3](https://jpnbino.github.io/coffee-scale/explore.html?part=J3) OLED, 2.54 mm | 1 GND; 2 3V3; 3 SCL; 4 SDA |
| [J4](https://jpnbino.github.io/coffee-scale/explore.html?part=J4) JST PH S2B-PH-K-S, 2.00 mm | 1 BAT_P; 2 raw BATT_NEG |
| [J5](https://jpnbino.github.io/coffee-scale/explore.html?part=J5) debug | 1 SWCLK; 2 SWDIO; 3 GND; 4 3V3 reference; 5 TX; 6 RX |
| [J6](https://jpnbino.github.io/coffee-scale/explore.html?part=J6) load cell | 1 E+; 2 E−; 3 A+; 4 A− |

J5 pin 4 is a target-voltage reference, not an independent power input.
Cross UART TX/RX to the probe. Socket-mounted Pico boards require separate
SWD jumpers because the SWD pads are outside the 40-pin socket rows.

The inactivity timer should reset on user button activity, meaningful load-cell
changes or explicit user Wi-Fi interactions. Background network traffic should
not keep the scale awake indefinitely. Debouncing, calibration, tare, startup,
shutdown and logging all remain firmware work.
