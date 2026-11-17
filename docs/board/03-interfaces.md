# Interfaces and firmware contract

| Pico GPIO | Signal | Purpose |
|---|---|---|
| GP0 / GP1 | UART_TX / UART_RX | Debug UART |
| GP4 / GP5 | I2C_SDA / I2C_SCL | OLED I²C |
| GP6 / GP7 | HX_DOUT / HX_SCK | HX711 |
| GP8 / GP9 | BTN1 / BTN2 | TARE / START-STOP, active low |
| GP10 / GP11 | NAV_UP / NAV_DOWN | Direction contacts, active low |
| GP12 | BUZZ_PWM | Buzzer drive |
| GP13 | PWR_HOLD | Assert high early to keep system powered |
| GP14 | NAV_PUSH | Isolated centre-press signal, active high |

| Connector | Pins in order |
|---|---|
| J3 OLED, 2.54 mm | 1 GND; 2 3V3; 3 SCL; 4 SDA |
| J4 JST PH S2B-PH-K-S, 2.00 mm | 1 BAT_P; 2 raw BATT_NEG |
| J5 debug | 1 SWCLK; 2 SWDIO; 3 GND; 4 3V3 reference; 5 TX; 6 RX |
| J6 load cell | 1 E+; 2 E−; 3 A+; 4 A− |

J5 pin 4 is a target-voltage reference, not an independent power input.
Cross UART TX/RX to the probe. Socket-mounted Pico boards require separate
SWD jumpers because the SWD pads are outside the 40-pin socket rows.

The inactivity timer should reset on user button activity, meaningful load-cell
changes or explicit user Wi-Fi interactions. Background network traffic should
not keep the scale awake indefinitely. Debouncing, calibration, tare, startup,
shutdown and logging all remain firmware work.
