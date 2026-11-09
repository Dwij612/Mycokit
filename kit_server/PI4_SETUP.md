# Moving MycoKit onto the Raspberry Pi 4 — step by step

Written 5 Oct 2026. Short answer first: **yes, use the same SD card.** The 64-bit Raspberry Pi OS
image is the same one for the Pi 4 and the Pi 5, so a card set up on the Pi 5 boots on a Pi 4
without changes. Your hotspot, the two services, I²C and the recordings all come with it.

The ADC, the wiring and every file in the Thesis folder are unchanged. Only the board is new.

---

## Part A — On your Mac, before touching the Pi (5 min)

### Step 1 — Back up the recordings on the card

The card has been sitting in a dead board, so copy the data off before anything else.

1. Put the SD card in your Mac (card reader or adapter).
2. A drive called **bootfs** appears on the Desktop / in Finder. (Only this one shows. The other
   part of the card is a Linux drive the Mac can't read — that's normal.)
3. Open **bootfs**. Copy the folder **fungikit_data** to
   `Desktop/Thesis/Pi_card_backup_2026-10-05/`.
4. If macOS asks to **initialise** or **format** the card: click **Ignore**. Never format it.

### Step 2 — Quick look at the settings file (read only)

In **bootfs**, open `config.txt` with TextEdit and check this line is there and not commented out:

```
dtparam=i2c_arm=on
```

That is the I²C switch. Anything under a `[pi5]` heading is ignored by a Pi 4, so leave it alone.
Close without saving, then **eject** the card (right-click bootfs → Eject).

### Step 3 — Power supply

- The Pi 4 needs **5 V, 3 A, USB-C** — the official **15 W Pi 4 supply** is the safe choice.
- The Pi 5's **27 W** supply should also work: it has a standard 5 V / 3 A mode for devices
  that don't ask for more. If you see a lightning-bolt warning or the red light blinks, swap
  to a 15 W Pi 4 supply.
- **Only power it through the USB-C port.** No batteries on the pins or pads — that is very
  likely what killed the Pi 5.

---

## Part B — The hardware (10 min, power OFF)

### Step 4 — Wire the ADC exactly as before

The Pi 4 header is the same as the Pi 5's.

| ADS1219 board | Pi 4 pin | Pi name |
|---|---|---|
| 3V3 | **1** | 3.3 V |
| SDA | **3** | GPIO 2 (SDA) |
| SCL | **5** | GPIO 3 (SCL) |
| GND | **6** | Ground |

Pin 1 is at the end of the header furthest from the USB ports, on the inner row (towards the middle of the board). If you can, **solder a
header into the ADC board** this time — the friction-fit jumpers fall out with one bump.

### Step 5 — Card in, power on

1. SD card into the slot underneath the Pi 4 (contacts facing the board).
2. Plug in power.
3. **Red light** = power. **Green light flickering** = reading the card. That's good.
4. Wait **about 2 minutes**. The first boot on a new board is slower than usual.

---

## Part C — Check everything came back (10 min)

### Step 6 — Join the Pi's Wi-Fi

On your Mac: Wi-Fi menu → **MycoKit**, password `fungi123`. "No internet" is expected.

> **No MycoKit network after 3 minutes?** Jump to *If the hotspot doesn't appear* at the bottom.

### Step 7 — Log in

Open Terminal on the Mac:

```bash
ssh fungikit@10.42.0.1
```

**If it says `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED`:** run this on the Mac, then try again:

```bash
ssh-keygen -R 10.42.0.1
```

(Same card should mean same identity, but this clears it if not.)

### Step 8 — Health check, one command at a time

Paste each line, one at a time, into the SSH window:

```bash
cat /proc/device-tree/model; echo
```
Should say **Raspberry Pi 4 Model B**.

```bash
vcgencmd get_throttled
```
Should say **throttled=0x0**. Anything else means the power supply is too weak.

```bash
sudo i2cdetect -y 1
```
Should show **40** in the grid. If it's all `--`, the ADC wiring is loose (Step 4).

```bash
systemctl status fungikit-web fungikit-logger --no-pager
```
Both should say **active (running)**.

```bash
cat /home/fungikit/files/latest.json; echo; sleep 2; cat /home/fungikit/files/latest.json; echo
```
**seq** should go up between the two. Values with no electrodes in: about a millivolt of drifting
noise, not exact zeros.

```bash
df -h /boot/firmware
```
Shows how much space is left for recordings (they live on this small partition so the Mac can
read the card directly).

### Step 9 — Install the new app

Follow **APP_SETUP.md** (same folder). It replaces the earlier dashboard with the new phone app: copy three
things across, run one script, then a short test run on your phone.

### Step 10 — Turning it off

Don't just pull the plug:

```bash
sudo shutdown -h now
```

Wait until the green light stops flickering (about 10 s), **then** unplug.

---

## If the hotspot doesn't appear

You need a screen for this once. The Pi 4 uses **micro-HDMI** (not full-size like a laptop).

1. Plug in micro-HDMI to a monitor and a USB keyboard, then power on.
2. Log in as `fungikit`.
3. Run:

```bash
sudo raspi-config nonint do_wifi_country AU
sudo rfkill unblock wifi
sudo nmcli connection up FungiKit-AP
nmcli device status
```

`wlan0` should now say **connected** to **FungiKit-AP**. Then carry on from Step 6.

## If the card doesn't boot at all

(No green flicker, or the hotspot never comes up even with a screen attached.) Start fresh — the
backup from Step 1 is safe on your Mac:

1. **Raspberry Pi Imager** → Device: **Raspberry Pi 4** → OS: **Raspberry Pi OS Lite (64-bit)**
   → your card.
2. In the settings: hostname `fungikit`, username `fungikit`, your password, **your home Wi-Fi**
   (it needs internet once, to install things), country AU, time zone Brisbane, **SSH on**.
3. Tell me when it's booted on your home Wi-Fi — the rebuild (I²C, smbus2, the two services, the
   hotspot) is about 15 commands and I'll write them out against what's actually on the card.

---

## What does NOT change

- The hotspot name/password, `10.42.0.1`, the `fungikit` login.
- Where recordings go: `/boot/firmware/fungikit_data/` (= `bootfs/fungikit_data` on the Mac).
- Measurement: same ADC, same 1 sample a second, same CSV columns.

## What comes next

Step 9: **APP_SETUP.md** puts the new phone app (Final_UI) on this Pi.
