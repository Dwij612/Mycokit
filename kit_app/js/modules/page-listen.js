// page-listen.js — Sonification. Flow 4.
//
// 8 Oct 2026 (Dwij): no 10-minute wait any more.
//   - Real time: from the moment a recording starts you can listen to it LIVE — each probe's tone follows its
//     newest reading as it arrives, once a second, uncompressed. A saved recording plays back at the same pace.
//   - The compressed speeds (Slow / Normal / Fast / Very fast: minutes of recording into seconds of sound)
//     unlock once a recording has 10 minutes in it (LISTEN_MIN_MS).
//   - "Example: Test 2" plays a real recording that ships with the app, so it can be tried before your own
//     recording has anything in it.
//   - Sound fixes (silent switch, volume, register, waiting for the audio to start): see sound.js.
//
// SOUND: four triangle-wave voices, pitch following each probe's value on a pentatonic scale. In playback each
// probe is scaled to its own range in that recording; live, to its own last two minutes (real probes sit tens
// of mV apart, and the change is the signal).

import * as kit from "./kit.js";
import * as store from "./demo-store.js";
import * as sound from "./sound.js";
import { sample as simSample } from "./signal-sim.js";
import { createChart } from "./trace-chart.js";
import { say } from "./mascot.js";
import { LISTEN_MIN_MS, LISTEN_SPEEDS, LIVE_WINDOW_MS, LIVE_POLL_MS } from "./config.js";
import { formatWhen, formatDuration, formatElapsed, recordingTitle, params } from "./ui.js";

const CONTROL_HZ = 20;                         // pitch updates per second of sound (playback)
const LIVE_RANGE_MS = 2 * 60 * 1000;           // live: each probe is scaled to its own last two minutes
const LIVE_MIN_SPAN = 0.2;                     // mV: live scaling never tighter than this, so noise isn't blown up
const SAMPLE = { id: "sample", url: "assets/sample/test2.json" };
const REALTIME = LISTEN_SPEEDS.find((s) => s.id === "realtime");

let rec = null, chart = null, options = [];
let speed = null;
let data = null;                               // playback: { len, values, scale }
let playing = false, startedAt = 0, offset = 0, raf = 0;
let mode = "playback";                         // "live" (the running recording, real time) | "playback"
const live = { t: [], v: [[], [], [], []], timer: 0, polling: false };

export async function initListen() {
  const views = Object.fromEntries([...document.querySelectorAll("[data-view]")].map((n) => [n.dataset.view, n]));
  try {
    options = (await kit.list()).recordings;
  } catch {
    options = [];
    say("listen-offline", "I can't reach the kit, but you can still hear the example recording.", "alert");
  }
  views.listen.hidden = false;

  const wanted = params.get("id");
  rec = options.find((r) => r.id === wanted) || options[0] || SAMPLE;

  const pick = document.querySelector("[data-pick]");
  pick.innerHTML = options.map((r) => `<option value="${r.id}">${r.live ? "Recording now (live)" : `${recordingTitle(r)} · ${formatWhen(r.startedAt)}`}</option>`).join("")
    + `<option value="${SAMPLE.id}">Example: Test 2 (a real 46-hour recording)</option>`;
  pick.value = rec.id;
  pick.addEventListener("change", () => {
    stop();
    rec = pick.value === SAMPLE.id ? SAMPLE : options.find((r) => r.id === pick.value);
    speed = null;
    load();
  });
  document.querySelector("[data-example]").addEventListener("click", () => {
    if (rec === SAMPLE) return;
    stop();
    rec = SAMPLE; pick.value = SAMPLE.id; speed = null;
    load();
  });

  chart = createChart(document.querySelector("[data-chart]"), { label: "Signal from four probes for the selected recording", compact: true });
  document.querySelector("[data-play]").addEventListener("click", () => (playing ? pause() : play()));
  document.querySelector("[data-test-sound]").addEventListener("click", async () => {
    const ok = await sound.testSound();
    showSoundHint(!ok);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && playing && mode === "playback") pause(); });

  load();
}

/* ---------------------------------------------------------------- choosing a recording and a speed */

async function load() {
  const mine = rec;
  clearInterval(live.timer);
  data = null;
  document.querySelector("[data-play]").disabled = true;
  document.querySelector("[data-example]").hidden = rec === SAMPLE;

  if (rec === SAMPLE) {
    document.querySelector("[data-selected]").textContent = "Example · Test 2 · 30 Aug – 1 Sep 2026 · 46 hours";
    document.querySelector("[data-clock]").textContent = "Loading…";
    let s;
    try { s = await (await fetch(SAMPLE.url)).json(); } catch { s = null; }
    if (rec !== mine) return;
    if (!s) { say("sample-failed", "The example didn't load. Reload the page to try again.", "alert"); return; }
    if (!speed || speed.id === "realtime") speed = LISTEN_SPEEDS.find((x) => x.id === "veryfast");   // 46 h → about 2 min 20 s
    renderSpeeds(s.length_ms, false);
    usePlayback(s.length_ms, s.values, thin(s.values, 240), []);
    say("listen-sample", "This is a real recording from the project. Tap Play and follow the purple line.", "ready");
    return;
  }

  if (rec.live) {                                     // the running one: refresh its length first
    try { const fresh = await kit.get(rec.id); if (fresh && rec === mine) rec = fresh; } catch { /* keep what we have */ }
    if (rec !== mine && rec.id !== mine.id) return;
  }
  const len = rec.lengthMs;
  speed ||= rec.live || len < LISTEN_MIN_MS ? REALTIME : LISTEN_SPEEDS.find((x) => x.id === "normal");
  if (speed.id !== "realtime" && len < LISTEN_MIN_MS) speed = REALTIME;
  renderSpeeds(len, true);
  describe();

  if (rec.live && speed.id === "realtime") { startLive(); return; }

  // playback: a snapshot of the recording (the live one up to this moment)
  const n = Math.min(20000, Math.max(240, Math.ceil((len / 60000) * Math.max(speed.secPerMin, 1) * CONTROL_HZ)));
  document.querySelector("[data-clock]").textContent = "Loading…";
  let values, picture;
  try {
    [values, picture] = await Promise.all([kit.series(rec, n), kit.series(rec, 240)]);
  } catch {
    if (rec !== mine) return;
    say(`listen-failed-${Date.now()}`, "The kit didn't send that recording. Try picking it again.", "alert");
    return;
  }
  if (rec !== mine) return;
  usePlayback(len, values, picture, rec.events || []);
  say(`listen-${rec.id}-${speed.id}`, speed.id === "realtime"
    ? "This plays at the pace it was recorded: one second of sound for every second. Higher notes mean more activity."
    : "Tap Play and follow the purple line. Higher notes mean more activity.", "ready");
}

function describe() {
  const time = (t) => new Date(t).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
  document.querySelector("[data-selected]").textContent = rec.live
    ? `Recording now${rec.name ? ` · ${rec.name}` : ""} · started ${time(rec.startedAt)}`
    : `${recordingTitle(rec)} · ${formatWhen(rec.startedAt)} · ${formatDuration(rec.lengthMs)}`;
}

/** The speed choices. Real time is always there (except for the example); the compressed ones need 10 minutes.
 *  28 Oct 2026 (Dwij): a menu above the graphs (was radio buttons inside "Change recording, speed or probes"). */
let speedMenuReady = false;
function renderSpeeds(len, withRealtime) {
  const menu = document.querySelector("[data-speed]");
  const compressedOk = len >= LISTEN_MIN_MS;
  const list = LISTEN_SPEEDS.filter((s) => withRealtime || s.id !== "realtime");
  menu.innerHTML = list.map((s) => {
    const off = s.id !== "realtime" && !compressedOk;
    const label = s.id === "realtime" ? (rec.live ? "Real time (live)" : "Real time") : `${s.label}${off ? " · opens at 10 min" : ""}`;
    return `<option value="${s.id}"${s.id === speed.id ? " selected" : ""}${off ? " disabled" : ""}>${label}</option>`;
  }).join("");
  const hint = document.querySelector("[data-speed-hint]");
  hint.hidden = compressedOk || !withRealtime;
  if (!compressedOk) {
    const left = Math.max(1, Math.ceil((LISTEN_MIN_MS - len) / 60000));
    hint.textContent = rec.live
      ? `The faster speeds play the whole recording in seconds. They open once it has 10 minutes in it: ${left} min to go.`
      : "The faster speeds need a recording of at least 10 minutes.";
  }
  if (speedMenuReady) return;
  speedMenuReady = true;
  menu.addEventListener("change", () => {
    const next = LISTEN_SPEEDS.find((s) => s.id === menu.value);
    const wasPlaying = playing;
    // switching between live and a snapshot reloads; switching between two playback speeds keeps the place
    if (rec.live && (next.id === "realtime" || speed.id === "realtime")) {
      stop(); speed = next; load().then(() => { if (wasPlaying) play(); });
      return;
    }
    if (data && (next.secPerMin > 1) !== (speed.secPerMin > 1)) {   // needs a different number of points
      const f = fraction();
      stop(); speed = next;
      load().then(() => { offset = f * duration(); renderClock(offset, duration()); if (wasPlaying) play(); });
      return;
    }
    const f = fraction();
    speed = next;
    offset = f * duration();
    if (playing) startedAt = sound.now() - offset;
    renderClock(offset, duration());
  });
}

/* ---------------------------------------------------------------- playback */

function usePlayback(len, values, picture, events) {
  mode = "playback";
  data = { len, values, scale: values.map(rangeOf) };
  chart.setData(picture, 0, len);
  chart.setEvents(events);
  chart.setPlayhead(0);
  offset = 0;
  renderClock(0, duration());
  setButton();
  document.querySelector("[data-play]").disabled = false;
}

/** This probe's range in the recording, ignoring the most extreme 2 % at each end. */
function rangeOf(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const lo = s[Math.floor(s.length * 0.02)], hi = s[Math.ceil(s.length * 0.98) - 1];
  return hi - lo < 0.05 ? { lo: lo - 0.025, hi: hi + 0.025 } : { lo, hi };
}

const duration = () => (data ? (data.len / 60000) * speed.secPerMin : 0);

function fraction() {
  if (!data) return 0;
  const t = playing ? sound.now() - startedAt : offset;
  return Math.max(0, Math.min(1, t / (duration() || 1)));
}

function loopPlayback() {
  const f = fraction();
  const N = data.values[0].length;
  const i = Math.min(N - 1, Math.floor(f * N));
  const on = probesOn();
  data.values.forEach((vals, p) => sound.setVoice(p, on[p] ? sound.stepFor(vals[i], data.scale[p]) : null));
  chart.setPlayhead(f);
  renderClock(f * duration(), duration());
  if (f >= 1) {
    pause(); offset = duration();
    say(`listen-end-${Date.now()}`, "That's the whole recording. Play it again, or try one probe on its own.", "happy");
    return;
  }
  raf = requestAnimationFrame(loopPlayback);
}

/* ---------------------------------------------------------------- live: the running recording, in real time */

function startLive() {
  mode = "live";
  live.t = []; live.v = [[], [], [], []];
  chart.setPlayhead(null);
  setButton();
  document.querySelector("[data-play]").disabled = false;
  document.querySelector("[data-clock]").textContent = "Live";
  pollLive();
  live.timer = setInterval(pollLive, kit.real ? Math.min(1000, LIVE_POLL_MS) : 500);
  say(`listen-live-${rec.id}`, "This is the mushroom right now, at its own pace. Tap Listen live, then watch the right-hand edge of the lines.", "ready");
}

async function pollLive() {
  if (live.polling) return;
  live.polling = true;
  try {
    let len;
    if (kit.real) {
      const since = live.t.length ? live.t[live.t.length - 1] : rec.lengthMs - LIVE_WINDOW_MS;
      const d = await kit.liveSince(since);
      if (!d || d.id !== rec.id) { clearInterval(live.timer); pause(); say("live-ended", "That recording has ended. Pick it from the list to play it back.", "ready"); return; }
      d.t.forEach((t, k) => { live.t.push(t); for (let i = 0; i < 4; i++) live.v[i].push(d.values[i][k]); });
      rec.events = d.events;
      len = d.lengthMs;
    } else {                                          // demo: the made-up signal, one reading per (recording) second
      const st = store.getState().recording;
      if (!st || st.id !== rec.id) { clearInterval(live.timer); pause(); return; }
      len = store.lengthOf(st);
      const from = live.t.length ? live.t[live.t.length - 1] + 1000 : Math.max(0, len - LIVE_WINDOW_MS);
      for (let at = Math.ceil(from / 1000) * 1000; at <= len; at += 1000) {
        live.t.push(at);
        for (let p = 1; p <= 4; p++) live.v[p - 1].push(simSample(rec.id, p, at, st.events || []));
      }
      rec.events = st.events || [];
    }
    // keep the last ten minutes
    let cut = 0;
    while (cut < live.t.length && live.t[cut] < len - LIVE_WINDOW_MS) cut++;
    if (cut) { live.t.splice(0, cut); live.v.forEach((c) => c.splice(0, cut)); }

    const crossed = rec.lengthMs < LISTEN_MIN_MS && len >= LISTEN_MIN_MS;
    rec.lengthMs = len;
    if (crossed) {
      renderSpeeds(len, true);
      say("listen-ten", "Ten minutes recorded! You can now play the whole recording faster — pick a speed.", "happy");
    }
    drawLive(len);
    if (playing) soundLive();
    document.querySelector("[data-clock]").textContent = `Live · ${formatElapsed(len)}`;
  } catch {
    /* keep trying; the Live page reports a lost kit */
  } finally {
    live.polling = false;
  }
}

function drawLive(len) {
  if (live.t.length < 2) return;
  const t1 = Math.max(len, LIVE_WINDOW_MS), t0 = t1 - LIVE_WINDOW_MS;
  const a0 = live.t[0], a1 = live.t[live.t.length - 1];
  const n = Math.max(2, Math.min(240, live.t.length));
  const pts = live.v.map((col) => Array.from({ length: n }, (_, k) => col[Math.round((k / (n - 1)) * (col.length - 1))]));
  chart.setData(pts, t0, t1, a0, a1);
  chart.setEvents(rec.events || []);
}

function soundLive() {
  const tEnd = live.t[live.t.length - 1];
  const on = probesOn();
  live.v.forEach((col, p) => {
    if (!on[p] || !col.length) { sound.setVoice(p, null); return; }
    let lo = Infinity, hi = -Infinity;
    for (let k = col.length - 1; k >= 0 && live.t[k] >= tEnd - LIVE_RANGE_MS; k--) { lo = Math.min(lo, col[k]); hi = Math.max(hi, col[k]); }
    const mid = (lo + hi) / 2, half = Math.max(LIVE_MIN_SPAN, hi - lo) / 2;
    sound.setVoice(p, sound.stepFor(col[col.length - 1], { lo: mid - half, hi: mid + half }), 0.25);
  });
}

/* ---------------------------------------------------------------- play / pause */

async function play() {
  if (mode === "playback" && !data) return;
  const ok = await sound.start();
  showSoundHint(!ok);
  playing = true;
  setButton();
  if (mode === "live") { if (live.t.length) soundLive(); return; }
  if (fraction() >= 1) offset = 0;
  startedAt = sound.now() - offset;
  loopPlayback();
}

function pause() {
  if (mode === "playback" && playing) offset = sound.now() - startedAt;
  playing = false;
  sound.silence();
  cancelAnimationFrame(raf);
  setButton();
}

function stop() {
  pause();
  clearInterval(live.timer);
  offset = 0;
  chart?.setPlayhead(mode === "live" ? null : 0);
}

const probesOn = () => [...document.querySelectorAll('input[name="probe"]')].map((c) => c.checked);

function setButton() {
  const b = document.querySelector("[data-play]");
  b.setAttribute("aria-pressed", String(playing));
  document.querySelector("[data-play-label]").textContent = playing ? (mode === "live" ? "Stop" : "Pause") : (mode === "live" ? "Listen live" : "Play");
}

function renderClock(pos, total) {
  const fmt = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
  document.querySelector("[data-clock]").textContent = `${fmt(pos)} / ${fmt(total)}`;
}

function showSoundHint(show) {
  document.querySelector("[data-sound-hint]").hidden = !show;
}

/** n evenly picked points per probe (for the example's picture). */
function thin(values, n) {
  return values.map((col) => Array.from({ length: n }, (_, k) => col[Math.round((k / (n - 1)) * (col.length - 1))]));
}
