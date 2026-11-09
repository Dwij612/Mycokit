# MycoKit — Final UI (kit app)

The web app the Pi serves over its own Wi-Fi. **Mobile first.**

> **Real kit (5 Oct 2026).** The Pi serves this folder and its data with `FungiKit_Pi_Web/fungikit_kit.py`.
> Install: `FungiKit_Pi_Web/APP_SETUP.md`. Every page gets its data through `js/modules/kit.js`.
>
> **The demo is still here** (3 Oct 2026): the whole flow with no Pi and made-up data. Open any page with
> `?demo=1` (it stays on in that browser until `?demo=0`, or **About → Leave the demo**).

> **After the summative test (28 Oct 2026, Dwij).** Prompts play a sound (`beeper.js`, the chime) and are yellow;
> a countdown above the mushroom says when the next prompt comes; tapping the mushroom shows its latest message;
> its eyes stay open once settled; the "I did it" marker shows without Numbers; "Space left" → "Storage on the kit";
> End recording → **End and save**, in green; the start screen asks for sound on, and Live has **Test sound**;
> Listen's speed is a menu above the graphs; photos are taken **in the app** at Prepare upload and go into the
> bundle with a **simulated location** (http pages can't get the phone's location: see `config.js`);
> "session code" → **Recording ID**, with no copy button.

Design sources: `Design/03_Feature_List.md` (F-01 to F-38), `Design/03a_Site_Map.md`, `Design/03b_User_Flows.md` (Flows 1–6), the Figma frame of 2 Oct 2026 (palette, mascot), and the DECO7140 method (semantic HTML, CSS split, one-purpose JS modules, WCAG 2.1 AA).

---

## The flow (the demo describes it at 30× speed)

### Pages

| Page | File | Flow | Features |
|---|---|---|---|
| Start | `index.html` | 1 | F-01 – F-07 (Saved recordings button removed 3 Oct; probe check F-05 switched off 3 Oct, `SHOW_PROBE_CHECK`; space on the card is a quiet line at the bottom) |
| Live | `live.html` | 2, 3, 5 | F-08 – F-19 |
| Listen | `sonify.html` | 4 | F-20 – F-25 |
| Saved recordings | `recordings.html` | 6 | F-26 |
| One recording (and the "Saved" screen) | `recording.html?id=…` | 6 | F-27 – F-29, F-33 |
| Prepare upload and hand-off | `upload.html?id=…` | 6 | F-16, F-30 – F-32 |
| Help (tutorial, pixel placement drawing, tips, glossary, sources) | `tutorial.html` | — | F-34 – F-36 |
| About the project | `about.html` | — | F-37, F-38 |

Every page shares one navigation (Live · Listen · Recordings · Help), added by `js/modules/shell.js`. Since 3 Oct the start screen has it too, because Saved recordings is reached only from the menu.

### Walking the flow

**Time runs 30× fast in the demo** (`TIME_SCALE` in `config.js`): 10 minutes of recording take about 20 seconds. The real build runs at 1×.

1. **Start** — add a name (optional), press **Start recording**. Starburst, then Live. The menu (Live · Listen · Recordings · Help) is now on the start page too; Saved recordings is reached from there only.
2. **Live**
   - **Settling** — for the first 2 minutes, and until the lines are steady, nothing else happens: no prompts, no alerts. A status box shows the progress.
   - **The mushroom's prompts** start a minute after settling, then come at least 10 minutes apart, one at a time. "I did it" drops a yellow marker. The photo prompt comes at 15 minutes.
   - **Unusual-activity alerts** — the earlier dashboard's detector (each probe against its own last 3 minutes, median and MAD). A beep (a different pitch per probe), a red notch on that probe's line, a message from the mushroom, and an entry in the Timeline. At most one alert per probe every 5 minutes. The demo signal now spikes rarely (about one alert every 15–20 minutes of recording, with one sure spike between minutes 12 and 16 so there is always one to show). **Alert settings**: beep on/off, how sensitive, which probes to watch. Browsers only allow sound after the first tap on the page.
   - **Research notes** — below the Timeline on the Live page; tap **Research notes +** to open the note box. Each note is stamped with the time into the recording (to the second) and the clock time, appears on the graph as a purple flag, and is listed for review. Notes go into the upload bundle.
   - **Timeline** — every marker, note and alert, newest first.
   - **Reading time** — after the mushroom says something, it waits at least 15 real seconds (`MASCOT_READ_MS`) before the next prompt or alert message, so lines can be read. Beeps, notches and the Timeline are not delayed.
   - **Listen** appears in the bottom bar only after 10 minutes of recording; until then the bar shows how long to go.
3. **Listen** — loads the recording running now, from its start up to this moment (or a saved one picked from the list). Locked below 10 minutes, live or saved. (28 Oct 2026: **Speed** is now a menu above the graphs; **Change recording or probes** holds the rest.) **Change recording, speed or probes** opened the choices: the recording, the speed (**Normal** is 1 minute of recording → 1 second of sound; also Slow / Fast / Very fast) and which probes play.
4. **End and save** — the green button at the bottom of Live, below Research notes (was the red "End recording") → confirm → the **Saved** screen, with the recording's notes and timeline.
5. **Prepare upload** → **Take photo** twice (the phone's camera; the photos go into the bundle, location simulated) or be reminded → **Download bundle** → the hand-off: the recording ID and what to do on the website.

**About → Demo tools → Reset the demo** puts back the example recordings (one is 7 minutes long, to show the Listen lock) for the next participant.

The data is made up (`js/modules/signal-sim.js`) and labelled "Demo" in the header and under every graph. It includes a settling drift at the start, and a small bump on three probes a few minutes after a marker, so the flow has something to show. Real fungi make no such promise.

### Where the numbers live

All in `js/modules/config.js`: `TIME_SCALE`, `LISTEN_MIN_MS` (10 min), `LISTEN_SPEEDS`, `SETTLE_MS` (2 min) and `SETTLE_STEADY_MV`, `PROMPTS` (pacing), `ALERTS` (detector, sensitivity, minimum gap), `LIVE_WINDOW_MS` (10 min on screen).

---

## Run it on a laptop (no Pi needed)

**With a pretend kit server** (same API as the Pi, made-up signal, labelled "Test" in the header):

```bash
cd Thesis/FungiKit_Pi_Web
FUNGIKIT_FAKE_ADC=1 FUNGIKIT_PORT=8000 FUNGIKIT_APP_DIR=../Final_UI \
FUNGIKIT_DATA_DIR=/tmp/fungikit_data FUNGIKIT_STATE_DIR=/tmp/fungikit_state python3 fungikit_kit.py
```

Open <http://localhost:8000/>. Add `FUNGIKIT_SPEED=30` to run the kit's clock 30× fast (10 minutes in 20 seconds).

**The demo only** (no server code at all): `python3 -m http.server 8000` in this folder, then
<http://localhost:8000/?demo=1>.

The start screen's single states can still be shown on their own with `?mock=` (a test aid):

| URL | What you see |
|---|---|
| `?mock=ready` | Plenty of space, ready to start |
| `?mock=low` | About 4 hours of space left — warning |
| `?mock=full` | Card full — Start disabled |
| `?mock=recording` | A recording already running (state B) |
| `?mock=offline` | Kit unreachable — the "Can't reach the kit" screen |
| `?mock=partial`, `none`, `flaky` | Probe-check states (the probe check is switched off) |

## Files

```
index.html                  Landing page (semantic HTML; three views + loading)
css/reset.css               Structure-only reset
css/base.css                Colour tokens, fonts, type scale, focus style — every colour lives here
css/layout.css              Header and main column
css/components.css          Shared pieces: panel, buttons, action bar, field, meter, mascot dock
css/page_css/landing.css    Start screen: name, space-on-card line, session cards (probe tiles kept, unused)
live.html, sonify.html, recordings.html, recording.html, upload.html, tutorial.html, about.html
css/page_css/*.css          One small file per page
js/main.js                  Entry point: picks the page module from <body data-page>
js/modules/config.js        Paths, poll intervals, thresholds, mock switch
js/modules/kit.js           Every page's recordings and data: the Pi's API, or the demo's pretend kit
js/modules/api.js           Start screen: status, Start, clock (talks to the Pi; normalises responses)
js/modules/mock.js          The pretend kit
js/modules/clock.js         F-03 silent clock sync (existing /api/settime)
js/modules/mascot.js        The sticky mushroom: moods, bubble, mute, celebration
js/modules/landing.js       Landing logic: polling, the two states, the Start gate
js/modules/storage-local.js Guarded localStorage (remembered name, mute)
js/modules/shell.js         Shared navigation, demo badge, mascot dock
js/modules/ui.js            Formatting, confirm dialog, downloads, dismissible notes
js/modules/trace-chart.js   The four probe lanes (SVG), markers, playhead
js/modules/demo-store.js    DEMO: the pretend kit's memory across pages
js/modules/signal-sim.js    DEMO: made-up probe data, CSV
js/modules/detector.js      Unusual-activity detector (ported from the earlier dashboard)
js/modules/beeper.js        The alert beep and the prompt chime
js/modules/photo-store.js   The two photos from Prepare upload: made smaller, kept in this browser until the bundle
js/modules/page-*.js        One module per page
js/modules/accordion.js     Help topics that open and close (same file on the website)
assets/fonts/               Geist Pixel, Geist, Geist Mono — bundled, OFL (licence included)
assets/mascot/              The four mushroom faces, cut from the Figma sheet
```

Nothing loads from the internet. The Pi has none.

---

## The Pi's API (fungikit_kit.py)

All JSON. Times inside a recording are **ms into the recording**; clock times are ISO strings.

| Call | What it does |
|---|---|
| `GET /api/status` | recording or not, the session (`id`, `code`, `name`, `started_at`), `storage` (`hours_left`, `percent_free`), `adc_ok`, `clock_synced`, `fake` |
| `POST /api/recording/start` `{name, epoch_ms, tz}` | starts a recording; the phone's time is applied first, so row one is stamped right |
| `POST /api/recording/end` | ends it → `{ok, id}` |
| `GET /api/live?since_ms=` | the running recording's samples newer than `since_ms` (at most the last 10 min), its events, `settled_at_ms`, `alert_settings` |
| `POST /api/recording/events` `{kind: marker\|note, label}` | stamped by the kit at the moment it arrives |
| `POST /api/recording/events/delete` `{kind: note, at_ms}` | notes only |
| `POST /api/recording/alert-settings` `{sensitivity, watch[4]}` | the kit detects alerts, so these live on the kit |
| `GET /api/recordings` | everything on the card, running one first |
| `GET /api/recordings/<id>` | one recording with its events |
| `GET /api/recordings/<id>/series?n=&from_ms=&to_ms=` | n evenly spaced points per probe (bucket means) for graphs and Listen |
| `GET /api/recordings/<id>/csv` | the CSV, as a download |
| `GET /api/recordings/<id>/bundle` | the upload bundle (`fungikit-bundle/1`, CSV inside) |
| `POST /api/recordings/<id>/delete` | not while it is running |
| `POST /api/settime` `{epoch_ms, tz}` | unchanged from `fungikit_web.py` |

On the card (`/boot/firmware/fungikit_data/`, readable on a Mac as `bootfs/fungikit_data`) each recording is
`<date>_<time>_<code>.csv` (`Time,Elapsed_s,AIN0_mV..AIN3_mV`, one row a second) plus a `.json` beside it
(name, events, alert settings, how it ended).

**Decisions (5 Oct 2026):** a power cut ends the recording (closed at its last row, marked "ended when the kit
lost power"); alerts are detected on the Pi; only this app is served; the mushroom's prompts are per phone.

## Decisions worth knowing

- **The primary action sits in a bar fixed to the bottom of the screen**, beside the mushroom. On a phone it is always in the thumb zone and never hidden under the mascot. It stays in the form in the DOM, so the tab order reads name → Start → Saved recordings → help.
- **Start is disabled when the card is too full** (under 1 hour; the Pi refuses too). Below 6 hours Start is allowed with a warning. Thresholds in `config.js`. (With the probe check switched back on, Start also waits for at least one probe.)
- **Probe tiles never rely on colour**: tick vs cross, solid vs dashed border, raised vs pushed-in, a word, and a screen-reader label.
- **Pixel font only for headings and buttons**; Geist for body text; Geist Mono for the timer.
- **The mushroom**: one line at a time, hides itself after 9 s, tap it to bring the line back, mute it from the speaker button. Moods: ready (eyes open, smiling), happy (eyes closed, smiling), alert (eyes open, "o"), waiting (eyes closed, "o"). One celebration only: a starburst when a recording starts. Respects reduced motion.
- **Contrast** (measured): navy text on every surface 12–18:1; white on purple 5.1:1; status colours ≥ 4.6:1 on their backgrounds. axe-core: no violations in any state.

## Still to do

- Test on the Pi 4 with real electrodes (`FungiKit_Pi_Web/APP_SETUP.md`), including a power cut mid-recording.
- The website QR code and address (placeholders).
- The real-kit settling rule (`STEADY_MV` in `fungikit_kit.py`, 0.25 mV between two 30 s averages, or 10 minutes
  at most) and the alert thresholds were set from Test_1/Test_2 numbers; check them against the first real runs.
- The mushroom's bubble sits over content while it's showing. It hides itself after 9 s and can be closed or muted; prompts that ask for an action stay until answered.
