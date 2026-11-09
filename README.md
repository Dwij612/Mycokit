# MycoKit

MycoKit lets people record the electrical signals of a living mushroom, watch and listen to them live on a phone, and share the recording with The Underground Brain Project at The University of Queensland. Nothing needs installing and no programming is involved: the kit makes its own Wi-Fi network and serves the app to the phone's browser.

It was built for my Master of Interaction Design thesis, *MycoKit: an interaction flow for recording fungal electrical signals* (REIT7841, The University of Queensland, November 2026), supervised by Professor Janet Wiles.

## What is here

| Folder | What it is |
|---|---|
| `kit_server/` | `fungikit_kit.py`, the one program the Raspberry Pi runs. It reads the ADS1219 converter once a second, records between Start and End, watches each probe for unusual activity and serves the kit app over the kit's own Wi-Fi. `PI4_SETUP.md` and then `APP_SETUP.md` set up a Pi; `pi_setup_app.sh` is the script they use. |
| `kit_app/` | The phone app the kit serves: HTML, CSS and JavaScript modules, with no build step. |
| `website/` | The project website: a tutorial, example studies from two test recordings, and the upload. Uploads are simulated, so a published study stays in that phone's browser. Live at <https://fungikit-website.vercel.app/> |

These are the final versions, after the changes made on 28 October 2026 in response to the summative evaluation.

## Hardware

- Raspberry Pi 4, powered from a USB power bank
- SparkFun Qwiic ADS1219 24-bit converter on I²C, address `0x40`
- Four probes in the mushroom and a reference pin in the soil or growing block beside it

| ADS1219 | Raspberry Pi 4 pin |
|---|---|
| 3.3V | 1 |
| SDA | 3 (GPIO 2) |
| SCL | 5 (GPIO 3) |
| GND | 6 |

`AIN0` to `AIN3` are Probes 1 to 4, each measured single-ended against the reference pin (`GND`), at a gain of 1 with the internal 2.048 V reference, converting at 20 samples per second. The kit records one reading per probe every second, in millivolts.

## Trying it without the kit

Both need Python 3 and a web browser. Nothing else needs installing.

Kit app with a made-up signal (not fungal data), from the `kit_server` folder:

```sh
FUNGIKIT_FAKE_ADC=1 FUNGIKIT_PORT=8080 FUNGIKIT_APP_DIR=../kit_app \
FUNGIKIT_DATA_DIR=/tmp/mycokit/data FUNGIKIT_STATE_DIR=/tmp/mycokit/state python3 fungikit_kit.py
```

then open <http://localhost:8080>. The app's layout is for phones, so a phone-sized window works best.

Website, from the `website` folder:

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000>.

## Names

FungiKit was the project's working name until October 2026; MycoKit is its final name. Files written before the change keep the old name (for example `fungikit_kit.py`), because renaming them would break the code.

The setup guides refer to the working folders the files came from: `FungiKit_Pi_Web` is `kit_server`, `Final_UI` is `kit_app` and `Website` is `website`.

## Credits

- The converter settings and the conversion from the converter's raw value to millivolts come from Dr Matthew D'Souza's firmware for the project's portable kit. I ported that code from the M5Stack firmware to Python for the Raspberry Pi with Claude.
- Fonts: Geist, Geist Mono and Geist Pixel, under the SIL Open Font License (licence files in each `assets/fonts` folder).
- The website uses [abcjs](https://github.com/paulrosen/abcjs) for sheet music and [exifr](https://github.com/MikeKovarik/exifr) to read photo details, with their licences in `website/vendor`.
