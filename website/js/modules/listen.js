// listen.js — the Listen panel on a study page (8 Oct 2026, Dwij): the same sound as the kit app's Listen page,
// for the examples and for anything uploaded. Four voices, one per probe, pitch following the probe's value
// within its own range in the recording. The speeds are the kit app's: Real time is one second of sound per
// second recorded; the others turn minutes of recording into seconds of sound.

import * as sound from "./sound.js";
import { bucket } from "./bundle.js";

const SPEEDS = [
  { id: "realtime", label: "Real time", secPerMin: 60 },
  { id: "slow",     label: "Slow",      secPerMin: 2 },
  { id: "normal",   label: "Normal",    secPerMin: 1 },
  { id: "fast",     label: "Fast",      secPerMin: 0.25 },
  { id: "veryfast", label: "Very fast", secPerMin: 0.05 },
];
const CONTROL_HZ = 20;
const MAX_POINTS = 20000;

/** Sets up the Listen panel inside `root` for readings `data` ({ t: seconds, v: four arrays }). Returns a stop function. */
export function setupListen(root, data, chart, idSuffix) {
  const lenMs = (data.t[data.t.length - 1] - data.t[0]) * 1000;
  // start with the speed that plays the whole recording in about two minutes or less
  let speed = SPEEDS.find((s) => s.id !== "realtime" && (lenMs / 60000) * s.secPerMin <= 150) || SPEEDS[SPEEDS.length - 1];
  if (lenMs < 10 * 60000) speed = SPEEDS[0];
  let values = null, scale = null, playing = false, startedAt = 0, offset = 0, raf = 0;

  const $ = (sel) => root.querySelector(sel);
  $("[data-listen-speeds]").innerHTML = SPEEDS.map((s) => `
    <label><input type="radio" name="listen-speed-${idSuffix}" value="${s.id}"${s.id === speed.id ? " checked" : ""}> ${s.label}</label>`).join("");

  const duration = () => (lenMs / 60000) * speed.secPerMin;
  const fraction = () => Math.max(0, Math.min(1, (playing ? sound.now() - startedAt : offset) / (duration() || 1)));
  const clock = (pos, total) => {
    const f = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
    $("[data-listen-clock]").textContent = `${f(pos)} / ${f(total)}`;
  };

  function prepare() {
    const n = Math.min(MAX_POINTS, Math.max(240, Math.ceil(duration() * CONTROL_HZ)));
    values = bucket(data, n);
    scale = values.map((vals) => {
      const s = [...vals].sort((a, b) => a - b);
      const lo = s[Math.floor(s.length * 0.02)], hi = s[Math.ceil(s.length * 0.98) - 1];
      return hi - lo < 0.05 ? { lo: lo - 0.025, hi: hi + 0.025 } : { lo, hi };
    });
  }

  function loop() {
    const f = fraction();
    const i = Math.min(values[0].length - 1, Math.floor(f * values[0].length));
    const on = [...root.querySelectorAll(`input[name="listen-probe-${idSuffix}"]`)].map((c) => c.checked);
    values.forEach((vals, p) => sound.setVoice(p, on[p] ? sound.stepFor(vals[i], scale[p]) : null));
    chart.setPlayhead(f);
    clock(f * duration(), duration());
    if (f >= 1) { pause(); offset = duration(); return; }
    raf = requestAnimationFrame(loop);
  }

  async function play() {
    const ok = await sound.start();
    $("[data-listen-hint]").hidden = ok;
    if (!values) prepare();
    if (fraction() >= 1) offset = 0;
    startedAt = sound.now() - offset;
    playing = true;
    setButton();
    loop();
  }

  function pause() {
    if (playing) offset = sound.now() - startedAt;
    playing = false;
    sound.silence();
    cancelAnimationFrame(raf);
    setButton();
  }

  function setButton() {
    const b = $("[data-listen-play]");
    b.setAttribute("aria-pressed", String(playing));
    b.textContent = playing ? "Pause" : "Play";
  }

  $("[data-listen-play]").addEventListener("click", () => (playing ? pause() : play()));
  $("[data-listen-test]").addEventListener("click", async () => { $("[data-listen-hint]").hidden = await sound.testSound(); });
  root.querySelectorAll(`input[name="listen-speed-${idSuffix}"]`).forEach((r) => r.addEventListener("change", () => {
    const f = fraction(), was = playing;
    pause();
    speed = SPEEDS.find((s) => s.id === r.value);
    values = null;                                   // a different speed needs a different number of points
    offset = f * duration();
    clock(offset, duration());
    if (was) play();
  }));
  clock(0, duration());
  return pause;
}
