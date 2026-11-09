// signal-sim.js — DEMO DATA. A believable-looking trace for four probes, made up on the spot.
// Deterministic: the same recording and the same moment always give the same value, so a recording
// looks the same on Live, on its detail page and on Listen. Nothing here is fungal data.
//
// Time is "ms into the recording" (recording time). Shapes, roughly:
//   settling  — each probe starts off its resting level and creeps back over the first half minute
//   drift     — slow wander over tens of minutes
//   spikes    — now and then on a probe (about one every hour per probe), ~30–60 s wide
//   markers   — in the demo only, a gentle bump on three probes a few minutes after "I did it"

const BASE = [0.86, 0.80, 0.91, 0.84];          // mV, roughly where each probe rests
const SETTLE_FROM = [0.13, -0.10, 0.08, -0.14]; // mV offset at the moment the pins go in

function rand(seed, n) {
  let x = (seed ^ Math.imul(n, 0x9E3779B1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function seedOf(id) {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Value of one probe at `at` ms into the recording. */
export function sample(recId, probe, at, events = []) {
  const seed = seedOf(recId) + probe * 7919;
  const s = at / 1000;                                      // seconds into the recording
  const settle = SETTLE_FROM[probe - 1] * Math.exp(-s / 8);    // settles in about 30 s (was 35 s decay, 8 Oct 2026)
  const drift = 0.03 * Math.sin(s / (900 + probe * 170) + probe) + 0.015 * Math.sin(s / (230 + probe * 40));
  const noise = (rand(seed, Math.floor(s / 5)) - 0.5) * 0.016;
  // spikes: in 20-minute slots, ~30 % of slots carry one, ~40 s wide. Across four probes that is roughly one
  // alert every 15–20 minutes of recording, leaving room for the mushroom's prompts.
  // (Was 4-minute slots at ~45 % until 3 Oct 2026 — far too many alerts.)
  const SLOT = 1200;
  const slot = Math.floor(s / SLOT);
  const spikeAt = slot * SLOT + 60 + rand(seed, slot) * (SLOT - 120);
  const spike = s > 150 && rand(seed + 1, slot) > 0.70 ? (0.07 + 0.06 * rand(seed + 2, slot)) * Math.exp(-(((s - spikeAt) / 18) ** 2)) : 0;
  // one sure spike between minutes 12 and 16 on one probe, so a demo always has an alert to show
  const sureProbe = 1 + (seedOf(recId) % 4), sureAt = 720 + rand(seedOf(recId), 99) * 240;
  const sure = probe === sureProbe ? 0.11 * Math.exp(-(((s - sureAt) / 18) ** 2)) : 0;
  let bump = 0;
  for (const e of events) {
    if (e.kind !== "marker" || probe === 2) continue;
    const dt = (at - e.at) / 1000;
    if (dt > 20 && dt < 600) bump += 0.05 * Math.exp(-(((dt - 150) / 70) ** 2));
  }
  return BASE[probe - 1] + settle + drift + noise + spike + sure + bump;
}

/** n evenly spaced samples per probe between a0 and a1 (ms into the recording). */
export function series(recId, a0, a1, n, events = []) {
  const out = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const at = a0 + ((a1 - a0) * i) / (n - 1 || 1);
    for (let p = 1; p <= 4; p++) out[p - 1].push(sample(recId, p, at, events));
  }
  return out;
}

/** CSV of a whole recording: seconds into the recording, a clock time, four probes. */
export function toCSV(rec, lengthMs, wallAt, everyMs = 5000) {
  const rows = ["seconds,time_iso,probe_1_mV,probe_2_mV,probe_3_mV,probe_4_mV"];
  const step = Math.max(everyMs, Math.ceil(lengthMs / 20000));   // cap the demo file at ~20k rows
  for (let at = 0; at <= lengthMs; at += step) {
    rows.push([(at / 1000).toFixed(0), new Date(wallAt(rec, at)).toISOString(),
      ...[1, 2, 3, 4].map((p) => sample(rec.id, p, at, rec.events).toFixed(4))].join(","));
  }
  return rows.join("\n");
}
