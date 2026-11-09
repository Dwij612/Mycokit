// beeper.js — the kit app's two short sounds on Live.
//   beep(probe) — the unusual-activity alert: a short two-note blip, one pitch per probe, so you can tell which
//                 probe it was without looking.
//   chime()     — the mushroom's prompt (28 Oct 2026, Dwij: "think Nintendo, think fun"): a quick rising
//                 8-bit arpeggio on a narrow pulse wave, so it can't be mistaken for an alert beep.
//
// Browsers only allow sound after the person has touched the page. 28 Oct 2026: the unlock now listens for
// pointerup / touchend / click / keydown and keeps trying until the audio is actually running. (It used to
// listen once, on pointerdown, which phones don't count as a tap — so the first touch often left it locked
// for good.) Until it runs, alerts and prompts are visual only.

const PITCH = [523.25, 659.25, 783.99, 1046.5];   // C5, E5, G5, C6

// the prompt chime: G5 C6 E6 G6, then a held C7 — a major arpeggio, up and away
const CHIME = [
  { f: 783.99,  at: 0.00, len: 0.06 },
  { f: 1046.5,  at: 0.06, len: 0.06 },
  { f: 1318.51, at: 0.12, len: 0.06 },
  { f: 1567.98, at: 0.18, len: 0.06 },
  { f: 2093.0,  at: 0.25, len: 0.22 },
];

const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"];

let ctx = null;
let pulse = null;                                  // 25 % pulse wave: the classic handheld-console tone

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  return ctx;
}

function unlock() {
  const c = audio();
  if (!c) return;
  if (c.state !== "running") c.resume().then(stopListening, () => {});
  try {                                            // a silent one-sample buffer, played inside the tap (iOS)
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch { /* nothing to unlock */ }
  stopListening();
}

// once the audio runs, the page no longer needs to listen for taps
function stopListening() {
  if (ctx?.state !== "running") return;
  UNLOCK_EVENTS.forEach((ev) => document.removeEventListener(ev, unlock, { capture: true }));
}

export function initBeeper() {
  UNLOCK_EVENTS.forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));
}

export const canBeep = () => ctx?.state === "running";

export function beep(probe = 1) {
  if (!canBeep()) return false;
  const t = ctx.currentTime;
  const f = PITCH[(probe - 1) % 4];
  [0, 0.12].forEach((d, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = i ? f * 1.5 : f;           // up a fifth: a little "blip-bloop"
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.06, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.1);
    osc.connect(g).connect(ctx.destination);
    osc.start(t + d);
    osc.stop(t + d + 0.12);
  });
  return true;
}

function pulseWave(c) {
  if (pulse) return pulse;
  const N = 32, duty = 0.25;
  const real = new Float32Array(N), imag = new Float32Array(N);
  for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  pulse = c.createPeriodicWave(real, imag);
  return pulse;
}

function playChime(c) {
  const t = c.currentTime + 0.02;
  const out = c.createGain();
  out.gain.value = 0.11;
  out.connect(c.destination);
  for (const n of CHIME) {
    const osc = c.createOscillator();
    const g = c.createGain();
    try { osc.setPeriodicWave(pulseWave(c)); } catch { osc.type = "square"; }
    osc.frequency.value = n.f;
    if (n.len > 0.1) {                               // the last note wobbles a little, like a power-up
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = 9;
      depth.gain.value = n.f * 0.012;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t + n.at);
      lfo.stop(t + n.at + n.len + 0.02);
    }
    g.gain.setValueAtTime(0, t + n.at);
    g.gain.linearRampToValueAtTime(1, t + n.at + 0.005);
    g.gain.setValueAtTime(1, t + n.at + n.len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.at + n.len);
    osc.connect(g).connect(out);
    osc.start(t + n.at);
    osc.stop(t + n.at + n.len + 0.02);
  }
}

/** The prompt sound. Plays only once the page's audio is running. Returns true if it played. */
export function chime() {
  if (!canBeep()) return false;
  playChime(ctx);
  return true;
}

/** From a tap (the Test sound button): unlock if needed, then play. Resolves true if sound is running. */
export async function testChime() {
  const c = audio();
  if (!c) return false;
  unlock();
  try { await c.resume(); } catch { /* reported below */ }
  if (c.state !== "running") return false;
  playChime(c);
  return true;
}
