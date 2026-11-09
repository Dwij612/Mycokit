// page-live.js — Home (Live). Flows 2, 3, 5 and the first part of 6.
//   trace (F-08) · explanation (F-09) · numbers (F-10) · timer + close-page note (F-11) · space (F-12)
//   End recording (F-13) · mascot prompts + "I did it" marker (F-14/15) · photo prompt (F-16)
// Added 3 Oct 2026 (Dwij):
//   - settling: no prompts and no alerts until the recording is 30 s old AND the lines are steady (2 min until 8 Oct 2026)
//   - prompts paced in recording time after settling
//   - unusual-activity alerts with beeps (the earlier dashboard's detector)
//   - research notes, opened with + below the timeline, timestamped to the second, reviewable
//   - Listen: live (real time) from the start since 8 Oct 2026; the faster speeds open at 10 minutes
// 5 Oct 2026 — the real kit:
//   - the signal, settling and alerts come from the Pi (fungikit_kit.py): alerts are detected there,
//     so they are caught with the phone closed; this page beeps and shows the ones it hasn't seen yet
//   - the mushroom's prompts are per phone (kept in this browser, one set per recording)
//   - the demo still runs everything in the browser, exactly as before (DEMO_MODE)
// 28 Oct 2026 — after the summative test (Dwij):
//   - each prompt plays a sound (beeper.js chime) and its bubble is yellow, like the marker it leads to
//   - a countdown above the mushroom says when the next prompt comes; tapping the mushroom shows its latest message
//   - the mushroom's eyes stay open once the signal has settled (closed eyes read as "no signal")
//   - the yellow "I did it" marker shows without Numbers; "Space left" is "Storage on the kit"
//   - End recording is "End and save", in green
//   - photos are taken in the app at Prepare upload, so the photo reminder here points there
// All times are "recording time": ms into the recording (TIME_SCALE runs it 30× fast in the demo only).

import * as kit from "./kit.js";
import * as store from "./demo-store.js";
import { sample } from "./signal-sim.js";
import { createChart } from "./trace-chart.js";
import { createDetector } from "./detector.js";
import { initBeeper, beep, chime, testChime } from "./beeper.js";
import { say as sayNow, isBusy, setNext, isMuted } from "./mascot.js";
import {
  ROUTES, STORAGE_KEYS, SETTLE_MS, SETTLE_WINDOW_MS, SETTLE_STEADY_MV, PROMPTS, ALERTS, LISTEN_MIN_MS, LIVE_WINDOW_MS,
  MASCOT_READ_MS, LIVE_POLL_MS,
} from "./config.js";
import { formatElapsed, formatWhen, formatHours, confirmDialog, dismissible } from "./ui.js";
import { load, save } from "./storage-local.js";

// Everything the mushroom says on Live goes through here, so prompts and alert messages can wait until the last
// line has had time to be read (MASCOT_READ_MS, real time).
let lastTalk = 0;
function say(...args) { lastTalk = Date.now(); return sayNow(...args); }
const stillReading = () => Date.now() - lastTalk < MASCOT_READ_MS;

const POINTS = 121;

// stimuli that don't move the kit (Flow 3, design caution: stomping and loud noises shake the wires)
const STIMULI = [
  { ask: "gently touch the top of the cap with one finger", label: "Touched the cap" },
  { ask: "spray some water on the mushroom, away from the pins", label: "Sprayed water" },
  { ask: "shade the mushroom with your hand for a minute, without touching it", label: "Shaded" },   // 14 Oct 2026 (Dwij): was "drop of water on the soil" and "room light off" (no room light outdoors)
];

let rec = null, chart = null, $ = null;
let events = [];             // this recording's markers, notes and alerts
let settled = false;
let unlocked = false;
let prefs = null;            // alert settings: beep is per phone; sensitivity and probes are the kit's (real kit)

// real kit
const buf = { t: [], v: [[], [], [], []] };  // the last 10 minutes of samples
let lenAt = { len: 0, at: Date.now() };      // the recording's length when last heard, and when that was
let seenAlerts = null;                       // alerts already shown (so a reload doesn't beep for old ones)
let polling = false, pollFails = 0;

// demo only
let detector = null, fedUntil = 0;

/** Recording time now (ms into the recording). */
function now() {
  if (!kit.real) return store.lengthOf(store.getState().recording || rec);
  return lenAt.len + (Date.now() - lenAt.at);
}

export async function initLive() {
  const views = Object.fromEntries([...document.querySelectorAll("[data-view]")].map((n) => [n.dataset.view, n]));
  try {
    rec = await kit.current();
  } catch (err) {
    console.warn("[MycoKit] live:", err.message);
    views.none.hidden = false;
    say("live-offline", "I can't reach the kit. Is your phone still on the MycoKit Wi-Fi?", "alert");
    return;
  }
  if (!rec) {
    views.none.hidden = false;
    say("live-none", "Nothing's recording right now. Start one from the start screen.", "ready");
    return;
  }
  views.live.hidden = false;
  $ = (s) => document.querySelector(s);
  events = rec.events;
  lenAt = { len: rec.lengthMs, at: Date.now() };

  $("[data-started]").textContent = `Started ${formatWhen(rec.startedAt)}${rec.name ? ` · ${rec.name}` : ""}`;
  dismissible($("[data-note-close-page]"), "close-page");

  const explain = $("[data-explain]");
  if (load("fungikit.seenExplain") !== "1") { explain.open = true; save("fungikit.seenExplain", "1"); }

  chart = createChart($("[data-chart]"), { label: "Live signal from four probes, last ten minutes", linesWithValues: true });
  const raw = $("[data-raw-toggle]");
  raw.addEventListener("change", () => chart.setShowValues(raw.checked));

  setupAlerts();
  setupNotes();

  $("[data-end]").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "End this recording?",
      body: "The kit stops recording and saves what it has. You can't add to this recording afterwards.",
      confirm: "End and save",
      cancel: "Keep recording",
      save: true,
    });
    if (!ok) return;
    try {
      const id = await kit.end();
      location.href = `${ROUTES.recording}?id=${encodeURIComponent(id)}&saved=1`;
    } catch {
      say(`end-failed-${Date.now()}`, "That didn't work — the kit didn't answer. Check you're on the MycoKit Wi-Fi and try again.", "alert");
    }
  });

  // Test sound: plays the prompt sound, and the tap lets the page play sound from now on
  $("[data-test-chime]").addEventListener("click", async () => {
    const ok = await testChime();
    $("[data-chime-hint]").hidden = ok;
  });

  // if the page was reloaded while a prompt was waiting for an answer, it will simply be asked again
  if (promptState().active) setPrompt({ active: null });

  if (kit.real) {
    await poll(true);
    setInterval(poll, LIVE_POLL_MS);
    refreshSpace();
    setInterval(refreshSpace, 60000);
  } else {
    settled = Boolean(promptState().settledAt);
    primeDetector();
    setInterval(draw, 500);
  }
  unlocked = now() >= LISTEN_MIN_MS;
  if (!settled) say("settling", "The probes need about 30 seconds to settle. Try not to touch the kit.", "waiting");
  else say("live-back", "Still recording. Everything that happened is in the Timeline.", "ready");

  draw();
  tick();
  setInterval(tick, 250);
}

/* ---------------------------------------------------------------- real kit: asking the Pi */

async function poll(first = false) {
  if (polling) return;
  polling = true;
  try {
    const since = buf.t.length ? buf.t[buf.t.length - 1] : -1;
    const d = await kit.liveSince(since);
    if (!d || d.id !== rec.id) {                        // ended on another phone, or by a power cut
      location.href = `${ROUTES.recording}?id=${encodeURIComponent(rec.id)}`;
      return;
    }
    pollFails = 0;
    lenAt = { len: d.lengthMs, at: Date.now() };
    d.t.forEach((t, k) => { buf.t.push(t); for (let i = 0; i < 4; i++) buf.v[i].push(d.values[i][k]); });
    const keepFrom = d.lengthMs - LIVE_WINDOW_MS - 60e3;
    let cut = 0;
    while (cut < buf.t.length && buf.t[cut] < keepFrom) cut++;
    if (cut) { buf.t.splice(0, cut); buf.v.forEach((c) => c.splice(0, cut)); }

    events = d.events;
    if (!d.adcOk) say("adc-off", "The kit can't read the probes right now. Check the four wires between the Pi and the ADC board.", "alert");
    if (!settled && d.settledAtMs !== null && d.settledAtMs !== undefined) onSettled(first);
    if (first && d.alertSettings) applyKitAlertSettings(d.alertSettings);
    newAlerts();
    renderNotes();
    renderTimeline();
    draw();
  } catch (err) {
    pollFails += 1;
    if (pollFails === 3) say("live-lost", "I've lost the kit. It keeps recording — check you're on the MycoKit Wi-Fi.", "alert");
  } finally {
    polling = false;
  }
}

async function refreshSpace() {
  try {
    const h = await kit.hoursLeft();
    $("[data-space]").textContent = h === null ? "—" : `room for about ${formatHours(h)}`;
  } catch { /* keep the last value */ }
}

/** Alerts the Pi found that this phone hasn't shown yet: beep and say so. The first look only takes note. */
function newAlerts() {
  const key = (e) => `${e.at}-${e.probe}`;
  const alerts = events.filter((e) => e.kind === "alert");
  if (!seenAlerts) { seenAlerts = new Set(alerts.map(key)); return; }
  for (const e of alerts) {
    if (seenAlerts.has(key(e))) continue;
    seenAlerts.add(key(e));
    announceAlert(e.at, e.probe, e.label);
  }
}

/* ---------------------------------------------------------------- the trace */

function draw() {
  const n0 = now();
  const t0 = Math.max(0, n0 - LIVE_WINDOW_MS);
  const t1 = Math.max(n0, LIVE_WINDOW_MS);          // a fixed 10-minute window that the line grows across
  const n = Math.max(2, Math.round(POINTS * ((n0 - t0) / (t1 - t0))));
  if (kit.real) {
    if (buf.t.length < 2) return;
    const a1 = buf.t[buf.t.length - 1];
    const a0 = Math.max(t0, buf.t[0]);
    chart.setData(bucket(buf, a0, a1, n), t0, t1, a0, a1);
  } else {
    chart.setData(simSeries(t0, n0, n), t0, t1, t0, n0);
  }
  chart.setEvents(events);
}

function simSeries(a0, a1, n) {
  const out = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const at = a0 + ((a1 - a0) * i) / (n - 1 || 1);
    for (let p = 1; p <= 4; p++) out[p - 1].push(sample(rec.id, p, at, events));
  }
  return out;
}

/** n evenly spaced points over a0..a1 from the live buffer: the mean of each bucket, gaps carried forward. */
function bucket({ t, v }, a0, a1, n) {
  const sums = v.map(() => new Array(n).fill(0)), cnt = new Array(n).fill(0);
  for (let k = 0; k < t.length; k++) {
    if (t[k] < a0 || t[k] > a1) continue;
    const b = Math.min(n - 1, Math.round(((t[k] - a0) / (a1 - a0 || 1)) * (n - 1)));
    cnt[b] += 1;
    for (let i = 0; i < 4; i++) sums[i][b] += v[i][k];
  }
  return sums.map((s) => {
    let last = null;
    const out = s.map((x, b) => (cnt[b] ? (last = x / cnt[b]) : last));
    const first = out.find((x) => x !== null) ?? 0;
    return out.map((x) => (x === null ? first : x));
  });
}

/* ---------------------------------------------------------------- the clock: everything paced here */

function tick() {
  const n0 = now();
  $("[data-elapsed]").textContent = formatElapsed(n0);
  if (!kit.real) $("[data-space]").textContent = `room for about ${formatHours(store.hoursLeft())}`;
  $("[data-note-at]").textContent = `at ${formatElapsed(n0)}`;

  updateSettling(n0);
  updateUnlock(n0);
  if (!kit.real) feedDetector(n0);
  runPrompts(n0);
  updateNext(n0);
}

/* ---------------------------------------------------------------- settling */

// demo only: compare each probe's average over the last window with the window before it (the Pi does this itself)
function steadyAt(n0) {
  const avg = (p, a, b) => { let s = 0; for (let i = 0; i < 6; i++) s += sample(rec.id, p, a + ((b - a) * i) / 5, []); return s / 6; };
  const w = SETTLE_WINDOW_MS;
  for (let p = 1; p <= 4; p++) {
    if (Math.abs(avg(p, n0 - w, n0) - avg(p, n0 - 2 * w, n0 - w)) > SETTLE_STEADY_MV) return false;
  }
  return true;
}

function updateSettling(n0) {
  const box = $("[data-settle]");
  if (settled) {
    box.dataset.state = "settled";
    $("[data-settle-text]").textContent = "Settled. Alerts and the mushroom's suggestions are on.";
    return;
  }
  const f = Math.min(1, n0 / SETTLE_MS);
  $("[data-settle-fill]").style.setProperty("--fill", `${f * 100}%`);
  if (n0 < SETTLE_MS) {
    $("[data-settle-text]").textContent = `Letting the signal settle… ${formatElapsed(n0).slice(3)} of ${formatElapsed(SETTLE_MS).slice(3)}`;
    return;
  }
  if (kit.real || !steadyAt(n0)) {               // the real kit says when it has settled (poll → onSettled)
    $("[data-settle-text]").textContent = "Nearly settled — waiting for the lines to steady.";
    return;
  }
  onSettled(false);
}

function onSettled(quiet) {
  settled = true;
  if (!promptState().settledAt) setPrompt({ settledAt: now() });
  if (!quiet) say("settled", "Settled! The lines are steady now. I'll let you know if anything unusual happens.", "ready");
}

/* ---------------------------------------------------------------- Listen: live from the start, faster speeds at 10 minutes */
// 8 Oct 2026 (Dwij): no lock. Listen is always there (live, in real time); at 10 minutes the mushroom says the
// faster speeds are open.

function updateUnlock(n0) {
  const wasUnlocked = unlocked;
  unlocked = n0 >= LISTEN_MIN_MS;
  if (unlocked && !wasUnlocked && !isBusy() && !stillReading()) {
    say("unlocked", "Ten minutes recorded — on Listen you can now play the whole thing faster!", "ready");
  }
}

/* ---------------------------------------------------------------- unusual-activity alerts */

function setupAlerts() {
  initBeeper();
  try { prefs = JSON.parse(load(STORAGE_KEYS.alertPrefs, "null")); } catch { prefs = null; }
  prefs ||= { beep: true, sens: ALERTS.defaultSensitivity, watch: [true, true, true, true] };

  const beepT = $("[data-beep-toggle]");
  beepT.checked = prefs.beep;
  beepT.addEventListener("change", () => { prefs.beep = beepT.checked; savePrefs(); });

  document.querySelectorAll('input[name="sens"]').forEach((r) => {
    r.checked = r.value === prefs.sens;
    r.addEventListener("change", () => {
      prefs.sens = r.value;
      detector?.setSigma(ALERTS.sensitivity[r.value]);
      savePrefs();
      sendKitAlertSettings();
    });
  });
  document.querySelectorAll('input[name="watch"]').forEach((c, i) => {
    c.checked = prefs.watch[i];
    c.addEventListener("change", () => { prefs.watch[i] = c.checked; savePrefs(); sendKitAlertSettings(); });
  });

  if (!kit.real) detector = createDetector({ sigma: ALERTS.sensitivity[prefs.sens] });
}

function savePrefs() { save(STORAGE_KEYS.alertPrefs, JSON.stringify(prefs)); }

// real kit: sensitivity and probes-to-watch live on the Pi, with the recording (it does the detecting)
function applyKitAlertSettings(s) {
  prefs.sens = s.sensitivity || prefs.sens;
  prefs.watch = Array.isArray(s.watch) ? s.watch.map(Boolean) : prefs.watch;
  document.querySelectorAll('input[name="sens"]').forEach((r) => { r.checked = r.value === prefs.sens; });
  document.querySelectorAll('input[name="watch"]').forEach((c, i) => { c.checked = prefs.watch[i]; });
}

async function sendKitAlertSettings() {
  if (!kit.real) return;
  try {
    await kit.setAlertSettings({ sensitivity: prefs.sens, watch: prefs.watch });
  } catch {
    say(`alert-set-failed-${Date.now()}`, "The kit didn't take that setting. Try again in a moment.", "alert");
  }
}

// demo: fill the baseline from the recent past without alerting, so a reload doesn't fire on old data
function primeDetector() {
  const n0 = now();
  const span = (ALERTS.baselineN + ALERTS.guardN + 1) * ALERTS.sampleEveryMs;
  for (let at = Math.max(0, n0 - span); at <= n0; at += ALERTS.sampleEveryMs) {
    detector.push(at, [1, 2, 3, 4].map((p) => sample(rec.id, p, at, events)), [false, false, false, false]);
    fedUntil = at;
  }
}

function feedDetector(n0) {
  while (fedUntil + ALERTS.sampleEveryMs <= n0) {
    fedUntil += ALERTS.sampleEveryMs;
    const at = fedUntil;
    const vals = [1, 2, 3, 4].map((p) => sample(rec.id, p, at, events));
    const hits = detector.push(at, vals, settled ? prefs.watch : [false, false, false, false]);
    for (const h of hits) {
      const label = `Probe ${h.probe} ${h.dir === "up" ? "jumped up" : "dropped"}`;
      store.addEvent("alert", label, { probe: h.probe });
      events = store.getState().recording?.events || events;
      announceAlert(at, h.probe, label);
    }
  }
}

function announceAlert(at, probe, label) {
  const sounded = prefs.beep && beep(probe);
  if (!isBusy() && !stillReading()) {          // the beep, notch and timeline entry happen regardless
    say(`alert-${at}-${probe}`, `${label} at ${formatElapsed(at)}. It's marked on its line${sounded || !prefs.beep ? "." : ". (Tap the screen once so I can beep next time.)"}`, "alert");
  }
  renderTimeline();
}

// Removed 3 Oct 2026 (Dwij): renderAlertLine(), the "N unusual moments so far · last: …" line under the chart.

/* ---------------------------------------------------------------- the mushroom's prompts, paced */
// Per phone (Dwij, 5 Oct 2026): kept in this browser, one set per recording.

const promptKey = () => `fungikit.prompts.${rec.id}`;
function promptState() {
  try { return JSON.parse(load(promptKey(), "null")) || {}; } catch { return {}; }
}
function setPrompt(patch) { save(promptKey(), JSON.stringify({ ...promptState(), ...patch })); }

function runPrompts(n0) {
  if (!settled) return;
  const p = promptState();
  if (p.active) return;                         // one prompt at a time, until it's answered
  if (isBusy()) return;
  if (stillReading()) return;                   // give the last message time to be read

  const nextStim = p.nextStimulusAt ?? ((p.settledAt ?? n0) + PROMPTS.firstStimulusAfterSettle);
  if (p.watchAt && n0 >= p.watchAt) {
    setPrompt({ watchAt: null });
    say(`look-${p.watchAt}`, "Look just after your marker. Did any line change? It might, or it might not — both are results.", "ready", { tone: "prompt" });
    promptSound();
    return;
  }
  // the photo prompt goes first when both are due, so it isn't pushed back by every stimulus
  const photoAt = p.photoNextAt ?? PROMPTS.photoAt;
  if (!p.photoDone && n0 >= photoAt) { askPhoto(); return; }
  if (n0 >= nextStim) askStimulus(n0);
}

function askStimulus(n0) {
  const n = events.filter((e) => e.kind === "marker").length;
  const s = STIMULI[n % STIMULI.length];
  setPrompt({ active: "stimulus" });
  promptSound();
  say(`stimulus-${n0}`, `Let's try something: ${s.ask}. Tap "I did it" the moment you do.`, "ready", {
    tone: "prompt",
    actions: [
      { label: "I did it", onClick: async () => {
        try {
          const ev = await kit.addEvent("marker", s.label);
          events = [...events.filter((e) => !(e.kind === ev.kind && e.at === ev.at)), ev];
          setPrompt({ active: null, watchAt: ev.at + PROMPTS.watchAfterMarker, nextStimulusAt: ev.at + PROMPTS.gapBetweenStimuli });
          say(`marked-${ev.at}`, "Marked! The yellow line shows when. Keep watching for a few minutes.", "ready");
          renderTimeline();
          draw();
        } catch {
          setPrompt({ active: null });
          say(`mark-failed-${Date.now()}`, "I couldn't reach the kit to mark that. I'll ask again in a bit.", "alert");
        }
      } },
      { label: "Not now", secondary: true, onClick: () => {
        setPrompt({ active: null, nextStimulusAt: now() + PROMPTS.gapBetweenStimuli });
      } },
    ],
  });
}

// 28 Oct 2026 (Dwij): photos are taken in the app, at Prepare upload, and go into the bundle. This reminder says so.
// (Was: "take two photos with your phone's camera … You'll add them on the website later", with Done / Later.)
function askPhoto() {
  setPrompt({ active: "photo" });
  say("photo", "Remember the photos: when you end and save, Prepare upload asks for two — the mushroom close up and the whole setup. Take them before you pack up.", "ready", {
    actions: [
      { label: "OK", onClick: () => setPrompt({ active: null, photoDone: true }) },
    ],
  });
}

/** The prompt sound — unless the mushroom is muted. (Silent until the page has had a tap: see beeper.js.) */
function promptSound() {
  if (!isMuted()) chime();
}

/** The countdown above the mushroom: how long until the next prompt, in real time. */
function updateNext(n0) {
  const p = settled ? promptState() : null;
  if (!p || p.active) { setNext(null); return; }
  const nextStim = p.nextStimulusAt ?? ((p.settledAt ?? n0) + PROMPTS.firstStimulusAfterSettle);
  const left = (nextStim - n0) / kit.timeScale;
  if (left <= 1000) { setNext("Next prompt soon"); return; }
  const s = Math.ceil(left / 1000);
  setNext(`Next prompt in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
}

/* ---------------------------------------------------------------- research notes */

function setupNotes() {
  // no on/off switch any more: the section opens with +, and the box gets focus when it does
  const fold = $("[data-notes]");
  fold.addEventListener("toggle", () => { if (fold.open) $("#note-text").focus(); });

  const text = $("#note-text");
  const button = $("[data-note-form] button[type=submit]");
  $("[data-note-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = text.value.trim();
    if (!v) { text.focus(); return; }
    button.disabled = true;
    try {
      const ev = await kit.addEvent("note", v);
      events = kit.real ? [...events, ev] : (store.getState().recording?.events || events);
      text.value = "";
      renderNotes();
      renderTimeline();
      draw();
      say(`noted-${ev.at}`, `Noted at ${formatElapsed(ev.at)}.`, settled ? "ready" : "waiting");
    } catch {
      say(`note-failed-${Date.now()}`, "That note didn't reach the kit. It's still in the box — try Add note again.", "alert");
    } finally {
      button.disabled = false;
    }
  });
  renderNotes();
  renderTimeline();
}

let notesShown = null;
function renderNotes() {
  const notes = events.filter((e) => e.kind === "note");
  const sig = notes.map((n) => `${n.at}:${n.label}`).join("|");
  if (sig === notesShown) return;                // don't rebuild (and lose a pressed button) on every poll
  notesShown = sig;
  const list = $("[data-notes-list]");
  list.innerHTML = notes.map((n, i) => ({ n, i })).reverse().map(({ n, i }) => `
    <li class="note-item">
      <p class="note-item__meta"><span class="note-item__tag">Note ${i + 1}</span> <span class="num">${formatElapsed(n.at)}</span> into the recording · ${new Date(n.wall).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
      <p class="note-item__text">${esc(n.label)}</p>
      <button class="link-danger note-item__del" type="button" data-del="${n.at}">Delete</button>
    </li>`).join("") || '<li class="notes-empty">No notes yet.</li>';
  list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const at = Number(b.dataset.del);
    try {
      await kit.removeEvent(at, "note");
      events = kit.real ? events.filter((e) => !(e.kind === "note" && e.at === at)) : (store.getState().recording?.events || events);
      renderNotes(); renderTimeline(); draw();
    } catch {
      say(`del-failed-${Date.now()}`, "The kit didn't answer, so the note is still there. Try again.", "alert");
    }
  }));
}

/* ---------------------------------------------------------------- timeline */

const KIND = { marker: "You tried", note: "Note", alert: "Unusual" };

let timelineShown = null;
function renderTimeline() {
  const ev = [...events].sort((a, b) => b.at - a.at);
  const sig = ev.map((e) => `${e.kind}${e.at}${e.label}`).join("|");
  if (sig === timelineShown) return;
  timelineShown = sig;
  $("[data-timeline-count]").textContent = String(ev.length);
  $("[data-timeline-list]").innerHTML = ev.map((e) => `
    <li class="tl tl--${e.kind}">
      <span class="tl__time num">${formatElapsed(e.at)}</span>
      <span class="tl__kind">${KIND[e.kind]}</span>
      <span class="tl__text">${esc(e.label)}</span>
    </li>`).join("") || '<li class="notes-empty">Nothing yet. Markers, notes and alerts appear here.</li>';
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
