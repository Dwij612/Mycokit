// config.js — one place for every number and path the kit app depends on.

const params = new URLSearchParams(location.search);
const mockParam = params.get("mock");

// ============================================================================================
// REAL KIT (5 Oct 2026). The app talks to the Pi: fungikit_kit.py serves these files and the API below.
//
// DEMO BUILD (3 Oct 2026, kept): the whole user flow on a pretend kit, with no Pi, wherever the files
// are opened. State is kept in the browser so the flow carries from page to page.
//
//   >>> For the demo again (no Pi, made-up data): set DEMO_MODE = true. <<<
//   On a laptop without a Pi, the demo also starts by itself: open any page with ?demo=1.
// ============================================================================================
export const DEMO_MODE = (() => {
  // ?demo=1 switches this browser to the demo until ?demo=0 (so it survives moving between pages)
  const KEY = "fungikit.demoMode";
  try {
    if (params.get("demo") === "1") localStorage.setItem(KEY, "1");
    if (params.get("demo") === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return params.get("demo") === "1";
  }
})();

// Real kit: the landing screen's pretend states, only when asked for (a test aid):
//   ?mock=ready | partial | none | low | full | recording | offline | flaky
// (Until 5 Oct 2026 a laptop got "ready" by default; now a laptop runs fungikit_kit.py with a fake ADC instead.)
const REAL_MOCK = mockParam && mockParam !== "off" ? mockParam : null;

// In the demo the default pretend kit is "demo" (stateful, shared across pages). A ?mock= scenario
// still overrides it, so each landing state can be shown on its own.
export const MOCK = DEMO_MODE ? (mockParam && mockParam !== "off" ? mockParam : "demo") : REAL_MOCK;

export const API = {
  status:        "/api/status",                    // GET   kit state, space left, clock
  start:         "/api/recording/start",           // POST  {name, epoch_ms, tz}
  end:           "/api/recording/end",             // POST
  live:          "/api/live",                      // GET   ?since_ms= — the running recording's newest samples + events
  events:        "/api/recording/events",          // POST  {kind: marker|note, label}
  eventsDelete:  "/api/recording/events/delete",   // POST  {kind, at_ms}
  alertSettings: "/api/recording/alert-settings",  // POST  {sensitivity, watch[4]}
  recordings:    "/api/recordings",                // GET   list; /<id>, /<id>/series?n=, /<id>/csv, /<id>/bundle; POST /<id>/delete
  settime:       "/api/settime",                   // POST  {epoch_ms, tz}
};

// Real kit: how often the Live page asks the Pi for new samples
export const LIVE_POLL_MS = 2000;

export const ROUTES = {
  landing:    "index.html",
  live:       "live.html",
  listen:     "sonify.html",
  recordings: "recordings.html",
  recording:  "recording.html",
  upload:     "upload.html",
  tutorial:   "tutorial.html",
  about:      "about.html",
};

export const POLL_MS = {
  idle:      2000,   // probes change as people push pins in, so check often
  recording: 10000,
  offline:   5000,
};

export const REQUEST_TIMEOUT_MS = 4000;

// Space on the card (F-07). Below WARN: start allowed with a warning. Below BLOCK: start disabled.
export const STORAGE_HOURS = { warn: 6, block: 1 };

export const PROBE_COUNT = 4;
export const NAME_MAX = 24;

// Probe check on the start screen (F-05). Off since 3 Oct 2026 (Dwij): in the first seconds the kit can only tell
// "connected" from "not connected", not good contact from poor. Set true to bring the OK / Check tiles back
// (the markup is commented out in index.html).
export const SHOW_PROBE_CHECK = false;

// After a successful start, go to Home (Live). In the demo, live.html now exists, so this is on.
// (Real kit, previously: GO_LIVE_AFTER_START = !MOCK)
export const GO_LIVE_AFTER_START = true;
export const GO_LIVE_DELAY_MS = 1800;   // long enough to see the celebration

// ============================================================================================
// TIME. Everything about a recording is measured in "recording time".
// In the demo the clock runs TIME_SCALE times faster, so 10 minutes of recording arrive in 20 s.
// The real build runs at 1.
// ============================================================================================
export const TIME_SCALE = DEMO_MODE ? 30 : 1;

const MIN = 60 * 1000;

// Listening (8 Oct 2026, Dwij): real time is available from the start; the compressed speeds unlock once a
// recording has at least this much in it.
export const LISTEN_MIN_MS = 10 * MIN;

// Sonification pace: seconds of sound per minute of recording. "Normal" is 1 minute → 1 second.
export const LISTEN_SPEEDS = [
  { id: "realtime", label: "Real time", secPerMin: 60 },   // one second of sound per second recorded (live: the newest reading)
  { id: "slow",     label: "Slow",      secPerMin: 2 },
  { id: "normal",   label: "Normal",    secPerMin: 1 },
  { id: "fast",     label: "Fast",      secPerMin: 0.25 },
  { id: "veryfast", label: "Very fast", secPerMin: 0.05 },
];

// Settling: no prompts and no alerts until the recording is at least this old AND the lines are steady.
// 8 Oct 2026 (Dwij): 2 min → 30 s. The steadiness check compares two 15 s windows (was 30 s) so it can pass at 30 s.
export const SETTLE_MS = 30 * 1000;
export const SETTLE_WINDOW_MS = 15 * 1000;
export const SETTLE_STEADY_MV = 0.012;   // max change in each probe's average between the last two windows

// The mushroom's prompts, paced in recording time once the signal has settled.
// 11 Oct 2026 (Dwij): the usability sessions are a short demo, so prompts come every 2 minutes and a participant
// meets two or three of them. Set PROMPT_PACING to "full" for real recordings (10-minute gaps).
export const PROMPT_PACING = "session";   // "session" | "full"
const PROMPT_SETS = {
  session: {
    firstStimulusAfterSettle: 1 * MIN,
    gapBetweenStimuli:        2 * MIN,
    watchAfterMarker:         1 * MIN,   // "look at your marker" comes this long after "I did it" (before the next prompt)
    photoAt:                  15 * MIN,  // the photo prompt, if not done yet
    photoRetry:               10 * MIN,
  },
  full: {
    firstStimulusAfterSettle: 1 * MIN,
    gapBetweenStimuli:        10 * MIN,
    watchAfterMarker:         3 * MIN,
    photoAt:                  15 * MIN,
    photoRetry:               10 * MIN,
  },
};
export const PROMPTS = PROMPT_SETS[PROMPT_PACING];

// Reading time, in REAL seconds: after the mushroom says something on Live, no new prompt or alert message
// for this long. Matters in the demo, where 30× time would otherwise fire "I did it" → "look" → next prompt
// within a few seconds. On the real kit the recording-time gaps above are far longer than this anyway.
export const MASCOT_READ_MS = 15000;

// Unusual-activity alerts — the earlier dashboard's detector (FungiKit_Pi_Web/index.html), stricter for alerts.
// Each probe is compared with its own recent baseline: median and MAD, a guard gap, then a threshold in sigma.
export const ALERTS = {
  sampleEveryMs: 5000,                    // detector samples, in recording time
  baselineN: 36,                          // 3 minutes of baseline
  guardN: 3,
  sensitivity: { low: 9, medium: 7, high: 5 },   // sigma; the old click detector defaulted to 5
  defaultSensitivity: "medium",
  minGapMs: 5 * MIN,                      // per probe: at most one alert every 5 minutes
};

export const LIVE_WINDOW_MS = 10 * MIN;   // the Live trace shows the last 10 minutes

// ============================================================================================
// PHOTOS (28 Oct 2026, Dwij, after the summative test). Photos are taken in the app at Prepare upload, with the
// phone's own camera, and go into the bundle — the kit never keeps them, and the website no longer has a photo step.
//
// LOCATION IS SIMULATED. Browsers only give a page the phone's location on a secure (https) page, and the kit app
// is served over plain http from the kit's own offline Wi-Fi (http://10.42.0.1). So every photo gets this fixed
// place, marked "simulated" in the bundle and on the website. Future work: serve the kit over https, then ask for
// the location when the photo is taken (with a notice when the person says no or has location off).
// ============================================================================================
export const SIMULATED_LOCATION = { lat: -27.49930, lon: 153.01440 };   // UQ St Lucia
export const PHOTO_MAX_PX = 1600;         // longest side; keeps two photos in the bundle to about 1 MB
export const PHOTO_QUALITY = 0.85;        // JPEG

export const STORAGE_KEYS = {
  name:  "fungikit.name",
  muted: "fungikit.mascotMuted",
  demo:  "fungikit.demoState",
  notes: "fungikit.dismissed",
  notesMode: "fungikit.notesMode",        // not used since 3 Oct 2026: notes open with + instead of a switch
  alertPrefs: "fungikit.alertPrefs",
};
