// sound.js — the sonification voices (same file as the kit app, Final_UI/js/modules/sound.js).
//
// 8 Oct 2026 (Dwij: "I couldn't hear anything"). Four fixes over the first version:
//   1. iPhone silent switch: Safari treats Web Audio as "ambient" sound, which the ringer switch mutes.
//      navigator.audioSession.type = "playback" (Safari 16.4+) makes it media sound instead; on older
//      iPhones a silent looping <audio> element does the same job.
//   2. Louder: the voices were at about 4 % of full scale. Now about 30 %, through a compressor so four
//      voices together can't clip.
//   3. Higher: the voices sat at 220–400 Hz, which phone speakers barely play. Now from A4 (440 Hz) upward.
//   4. The audio context is awaited until it is actually running, and the page is told if it isn't.

const PENTA = [0, 2, 4, 7, 9];                 // major pentatonic: no clashing notes between voices
const ROOTS = [69, 72, 76, 79];                // A4, C5, E5, G5 — one register per probe
export const STEPS = 10;                       // pitch steps over a probe's range (two pentatonic octaves)

// a short silent WAV, looped, so iOS plays this page's sound as media (ignores the silent switch)
const SILENT_WAV = "data:audio/wav;base64,UklGRvQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdAHAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

let ctx = null, voices = [], master = null, keepAlive = null;

/** Starts the audio (call from a tap). Resolves true once sound can actually play. */
export async function start() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch { /* not supported */ }
  if (!keepAlive) {
    keepAlive = new Audio(SILENT_WAV);
    keepAlive.loop = true;
    keepAlive.setAttribute("playsinline", "");
  }
  keepAlive.play().catch(() => {});
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    voices = [0, 1, 2, 3].map(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      gain.gain.value = 0;
      osc.connect(gain).connect(master);
      osc.start();
      return { osc, gain };
    });
  }
  try { await ctx.resume(); } catch { /* reported below */ }
  return ctx.state === "running";
}

export const running = () => Boolean(ctx) && ctx.state === "running";

/** Sets probe p's voice: step 0..STEPS-1 on the pentatonic scale, or null for silent. */
export function setVoice(p, step, glide = 0.03) {
  if (!ctx) return;
  const v = voices[p];
  if (step === null || step === undefined || !Number.isFinite(step)) {
    v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    return;
  }
  const s = Math.max(0, Math.min(STEPS - 1, Math.round(step)));
  const midi = ROOTS[p] + PENTA[s % 5] + 12 * Math.floor(s / 5);
  v.osc.frequency.setTargetAtTime(440 * 2 ** ((midi - 69) / 12), ctx.currentTime, glide);
  v.gain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.04);
}

/** value → step, within a probe's range { lo, hi }. */
export function stepFor(value, { lo, hi }) {
  if (!Number.isFinite(value)) return null;
  return ((value - lo) / (hi - lo || 1)) * (STEPS - 1);
}

export function silence() {
  if (!ctx) return;
  voices.forEach((v) => v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05));
}

/** A short rising chord on all four voices, so the person can check their phone makes sound. */
export async function testSound() {
  const ok = await start();
  if (!ok) return false;
  [0, 1, 2, 3].forEach((p) => setTimeout(() => setVoice(p, 2 + p), p * 180));
  setTimeout(silence, 1400);
  return true;
}

export const now = () => (ctx ? ctx.currentTime : 0);
