#!/bin/bash
# MycoKit — switch the Pi over to the new phone app (Final_UI + fungikit_kit.py).
#
# Run this ON THE PI, as root, after copying the files across (APP_SETUP.md, step 3):
#     sudo bash ~/pi_setup_app.sh
#
# What it changes, all reversible:
#   - fungikit-web now runs fungikit_kit.py (a systemd drop-in file; the original unit file is not edited)
#   - fungikit-logger is stopped and switched off (the new program does the logging, between Start and End)
# What it never touches: your recordings, the hotspot, the old files.
#
# To undo:
#     sudo bash ~/pi_setup_app.sh --undo

set -u

GREEN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
ok()   { echo "  ${GREEN}ok${OFF}    $*"; }
bad()  { echo "  ${RED}FAIL${OFF}  $*"; }
warn() { echo "  ${YEL}note${OFF}  $*"; }
step() { echo; echo "${DIM}--- $* ---${OFF}"; }

HOME_DIR=/home/fungikit
KIT_PY=$HOME_DIR/fungikit_kit.py
APP=$HOME_DIR/app
STATE=$HOME_DIR/state
DATA=/boot/firmware/fungikit_data
DROPIN_DIR=/etc/systemd/system/fungikit-web.service.d
DROPIN=$DROPIN_DIR/fungikit-app.conf

if [ "$(id -u)" != "0" ]; then
  echo "${RED}Run this with sudo:${OFF}  sudo bash ~/pi_setup_app.sh"; exit 1
fi

# ---------------------------------------------------------------- undo ----
if [ "${1:-}" = "--undo" ]; then
  step "putting the earlier setup back"
  rm -f "$DROPIN" && ok "removed $DROPIN"
  systemctl daemon-reload
  systemctl enable fungikit-logger >/dev/null 2>&1 && ok "fungikit-logger switched back on"
  systemctl restart fungikit-web fungikit-logger
  ok "both services restarted with their earlier settings"
  echo
  echo "Done. The earlier dashboard is back at http://10.42.0.1 (it records from power-on again)."
  exit 0
fi

echo "MycoKit — new app setup"
echo "${DIM}$(date)${OFF}"

# ------------------------------------------------------- 1. files here? ----
step "1. checking the files arrived"
MISSING=0
for f in "$KIT_PY" "$APP/index.html" "$APP/live.html" "$APP/js/modules/kit.js"; do
  if [ -f "$f" ]; then ok "$f"; else bad "missing: $f"; MISSING=1; fi
done
if [ "$MISSING" = "1" ]; then
  echo
  echo "${RED}Stopping.${OFF} Re-run the scp commands from your Mac (APP_SETUP.md, step 3), then try again."
  exit 1
fi
if [ -d "$APP/Final_UI" ]; then
  warn "found $APP/Final_UI — the app's files should sit directly in $APP (see APP_SETUP.md, step 3)"
fi

# --------------------------------------------------- 2. dependencies ----
step "2. checking Python, smbus2 and I2C"
python3 -c "import sys; assert sys.version_info >= (3, 8)" 2>/dev/null \
  && ok "python3 $(python3 -c 'import platform; print(platform.python_version())')" \
  || { bad "python3 is too old (needs 3.8 or newer)"; exit 1; }
# The service runs as root. smbus2 may have been installed for the fungikit user only (pip without sudo);
# then root is pointed at that copy, because the Pi has no internet to install it again.
EXTRA_PATH=""
if python3 -c "import smbus2" 2>/dev/null; then
  ok "smbus2"
elif USER_SITE=$(sudo -u fungikit python3 -c "import smbus2, os; print(os.path.dirname(os.path.dirname(smbus2.__file__)))" 2>/dev/null); then
  EXTRA_PATH="$USER_SITE"
  ok "smbus2 (installed for the fungikit user: $USER_SITE)"
else
  bad "smbus2 missing"
  echo "      fix (needs internet once): sudo pip install smbus2 --break-system-packages"
  exit 1
fi
if [ -e /dev/i2c-1 ]; then ok "/dev/i2c-1 (I2C is on)"; else bad "/dev/i2c-1 missing — I2C is off"; echo "      fix: sudo raspi-config nonint do_i2c 0, then reboot"; exit 1; fi
python3 -m py_compile "$KIT_PY" && ok "fungikit_kit.py reads cleanly" || { bad "fungikit_kit.py has an error"; exit 1; }

# ------------------------------------------------------- 3. folders ----
step "3. folders"
mkdir -p "$STATE" "$DATA"
ok "$STATE (clock record)"
ok "$DATA (recordings — bootfs/fungikit_data on a Mac)"

# ------------------------------------------------ 4. the two services ----
step "4. pointing fungikit-web at the new program"
mkdir -p "$DROPIN_DIR"
cat > "$DROPIN" <<EOF
# Added by pi_setup_app.sh ($(date +%F)). Delete this file (or run pi_setup_app.sh --undo) to go back.
[Service]
ExecStart=
ExecStart=/usr/bin/python3 $KIT_PY
User=root
Restart=always
RestartSec=2
EOF
if [ -n "$EXTRA_PATH" ]; then echo "Environment=PYTHONPATH=$EXTRA_PATH" >> "$DROPIN"; fi
ok "$DROPIN"

step "5. switching off the old logger (the new program records between Start and End)"
systemctl stop fungikit-logger 2>/dev/null
systemctl disable fungikit-logger >/dev/null 2>&1
ok "fungikit-logger stopped and switched off"

step "6. restarting"
systemctl daemon-reload
systemctl enable fungikit-web >/dev/null 2>&1
systemctl restart fungikit-web
sleep 4
if systemctl is-active --quiet fungikit-web; then ok "fungikit-web is running"; else
  bad "fungikit-web did not start"; echo "      see why: sudo journalctl -u fungikit-web -n 40"; exit 1; fi

# --------------------------------------------------------- 7. check ----
step "7. asking the app for its status"
STATUS=$(curl -s -m 5 http://127.0.0.1/api/status || true)
if [ -z "$STATUS" ]; then
  bad "no answer from http://127.0.0.1/api/status"; echo "      see why: sudo journalctl -u fungikit-web -n 40"; exit 1
fi
echo "      $STATUS" | cut -c1-220
echo "$STATUS" | grep -q '"adc_ok": true' && ok "the ADC is answering" \
  || warn "the ADC is NOT answering — check the four wires (pins 1, 3, 5, 6), then: sudo systemctl restart fungikit-web"
echo "$STATUS" | grep -q '"fake": false' && ok "real ADC mode" || warn "fake ADC mode is on — this is a test setup"

echo
echo "${GREEN}Done.${OFF} On your phone: join MycoKit Wi-Fi, open http://10.42.0.1"
echo "To go back to the earlier setup:  sudo bash ~/pi_setup_app.sh --undo"
