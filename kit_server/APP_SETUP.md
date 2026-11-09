# Putting the new MycoKit app on the Pi — step by step

Written 5 Oct 2026. Do **PI4_SETUP.md** first (Steps 1–8: the Pi 4 boots, the hotspot works, the ADC answers).
You can skip its Step 9 — this guide replaces the earlier dashboard with the new app.

**What changes on the Pi**

- One program, `fungikit_kit.py`, now does everything: it reads the ADC, records between **Start** and **End**
  (pressed in the app), spots unusual activity, and serves the app.
- The Pi **no longer records from power-on**. A recording starts when someone presses Start.
- A **power cut ends the recording**. Everything up to that moment is kept; the app says it ended that way.
- Only the new app is served. The earlier dashboard files stay on the Pi, untouched, in case you want them back.

Three files/folders go across from your Mac:

| From your Mac | To the Pi |
|---|---|
| `Thesis/FungiKit_Pi_Web/fungikit_kit.py` | `/home/fungikit/fungikit_kit.py` |
| `Thesis/FungiKit_Pi_Web/pi_setup_app.sh` | `/home/fungikit/pi_setup_app.sh` |
| everything **inside** `Thesis/Final_UI/` | `/home/fungikit/app/` |

---

## Step 1 — Join the Pi's Wi-Fi

Pi switched on (wait about a minute), then on your Mac: Wi-Fi → **MycoKit**, password `fungi123`.

## Step 2 — Make the app folder on the Pi

In Terminal:

```bash
ssh fungikit@10.42.0.1
```

Then, now on the Pi:

```bash
mkdir -p ~/app
```

Leave this window open.

## Step 3 — Copy the files (in a SECOND Terminal window, on your Mac)

`Cmd + N` for a new window. These run **on your Mac**, not inside the SSH window.

```bash
scp ~/Desktop/Thesis/FungiKit_Pi_Web/fungikit_kit.py ~/Desktop/Thesis/FungiKit_Pi_Web/pi_setup_app.sh fungikit@10.42.0.1:~/
```

```bash
scp -r ~/Desktop/Thesis/Final_UI/* fungikit@10.42.0.1:~/app/
```

Each asks for the Pi's password. Lines ending in `100%` mean it worked.

> The `/*` matters: it puts the app's files straight into `app`, not into `app/Final_UI`.

## Step 4 — Run the setup script (back in the SSH window)

```bash
sudo bash ~/pi_setup_app.sh
```

It checks the files, Python, smbus2 and I²C, points the web service at the new program, switches the old logger
off, restarts, and asks the app for its status. Every line should say **ok**. The important ones:

- `fungikit-web is running`
- `the ADC is answering`
- `real ADC mode`

If one says **FAIL**, it prints the fix underneath. Nothing is half-changed when it stops.

## Step 5 — Open it on your phone

1. Phone: Wi-Fi → **MycoKit** (`fungi123`). If the phone says *No internet connection*, choose to stay connected.
2. Browser: **`http://10.42.0.1`** — type the `http://`, not `https://`.
3. You should see **Let's listen to a mushroom** and **Kit connected** at the top.

## Step 6 — A first test run (about 15 minutes)

Electrodes in or not — without them you'll just record noise, which is fine for this test.

1. Add a name, press **Start recording**. You land on **Live**.
2. The lines start drawing. After about **2 minutes** the box says **Settled**.
3. About a minute later the mushroom asks you to try something → tap **I did it** → a yellow line appears.
4. **Research notes +** → write a note → **Add note**.
5. At **10 minutes**, **Listen to it** appears at the bottom. Tap it, press Play.
6. Back on Live: **End recording** → **End and save**. You land on the saved recording.
7. Try **Download data (CSV)** and **Prepare upload** — both should save a file to the phone.
8. Delete this test recording when you're done (bottom of its page).

## Step 7 — The power-cut test

1. Start a recording. Wait a minute.
2. Pull the power. Wait 10 seconds. Plug it back in. Wait about a minute.
3. Rejoin **MycoKit**, open `http://10.42.0.1` → **Recordings**. The recording is there, and its page says
   **"This recording ended when the kit lost power."**

## Step 8 — Check the files on the card (optional)

Shut down properly first (`sudo shutdown -h now`, wait for the green light to stop), then card into the Mac →
**bootfs** → **fungikit_data**. Each recording is two files:

- `2026-10-05_14-30-02_FK-7Q2M.csv` — the data, same columns as before (`Time,Elapsed_s,AIN0_mV … AIN3_mV`)
- `2026-10-05_14-30-02_FK-7Q2M.json` — its name, notes, markers, alerts and how it ended

The older `record-….csv` files from before stay there; the app just doesn't list them.

---

## Updating the app later

Repeat **Step 3** (both commands). App pages update when the phone reloads. If `fungikit_kit.py` changed too:

```bash
sudo systemctl restart fungikit-web
```

(Restarting while a recording runs ends that recording, the same as a power cut.)

## Going back to the earlier dashboard

```bash
sudo bash ~/pi_setup_app.sh --undo
```

## When something goes wrong

| What you see | What to do |
|---|---|
| Phone says the page can't be opened | Check you're on **MycoKit** Wi-Fi and typed `http://10.42.0.1` |
| **Not connected** at the top | Same as above; or the Pi is still starting — wait a minute |
| Mushroom says **the kit can't read the probes** | ADC wires loose (pins 1, 3, 5, 6). Fix, then `sudo systemctl restart fungikit-web` |
| Lines flat at exactly zero, or wildly off | Same as above |
| Start does nothing / says it didn't start | `sudo journalctl -u fungikit-web -n 40` and send me the output |
| Old-looking page after updating | Reload; on iPhone pull down to refresh |
| **Test** label next to MycoKit | The program is in fake-ADC test mode — that only happens on a laptop; rerun Step 4 on the Pi |

**What the program writes to its log:** `sudo journalctl -u fungikit-web -f` (Ctrl+C to stop watching). It notes
starts, ends, power-cut closes, ADC drop-outs and clock corrections.

## Trying it on the Mac, without the Pi

```bash
cd ~/Desktop/Thesis/FungiKit_Pi_Web
FUNGIKIT_FAKE_ADC=1 FUNGIKIT_PORT=8000 FUNGIKIT_APP_DIR=../Final_UI FUNGIKIT_DATA_DIR=/tmp/fungikit_data FUNGIKIT_STATE_DIR=/tmp/fungikit_state python3 fungikit_kit.py
```

Open `http://localhost:8000`. Made-up signal, labelled **Test**. Add `FUNGIKIT_SPEED=30` before `python3` to run
30× fast. Ctrl+C to stop.
