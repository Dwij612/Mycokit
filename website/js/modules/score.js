// score.js — sheet music from a study's CSV (added 5 Oct 2026, Dwij: "make sheet music from the CSV").
//
// The NUMBERS are the kit sonification's, at its defaults (FungiKit_Pi_Web/sonify.html, "Repeating patterns"):
//   median-normalise → smooth (j = 20 samples) → detrend (k = 250 samples) → one note per 60 s (bin mean)
//   → scale between the 2nd and 98th percentile → C major pentatonic ladder, 3 octaves from C3 (16 steps)
//   → direction of each note: up / flat / down, beyond max(3 × per-note noise, 1 % of the range)
// The NOTATION follows the Ch14 score of 15 Sep 2026 (Thesis/sonify/score):
//   every note a semiquaver, crotchet = 90 · a flat note at the same pitch as the one before is tied to it ·
//   rising notes: accent + staccato · a run of falling notes is slurred, a single falling note gets a tenuto ·
//   grand staff, split at middle C. (The Ch14 score's "spike" text marks are not drawn here.)
// The result is ABC notation, drawn and turned into MIDI by abcjs (MIT licence, vendor/abcjs-basic-min.js).

export const SETTINGS = { j: 20, k: 250, secPerNote: 60, octaves: 3, tempo: 90, notesPerBar: 16, barsPerLine: 4 };
const PENTA = [0, 2, 4, 7, 9];

/* ---------------------------------------------------------------- the sonification's numbers */

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sorted = (a) => Float64Array.from(a).sort();
function median(a) { const s = sorted(a), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function pct(a, p) { const s = sorted(a), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); }
function stdev(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); }

function smooth(x, j) {                       // edge-clamped moving average, window 2j+1 (as sonify.html)
  if (j <= 0) return Float64Array.from(x);
  const n = x.length, out = new Float64Array(n), w = 2 * j + 1;
  const at = (i) => x[i < 0 ? 0 : i > n - 1 ? n - 1 : i];
  let sum = 0;
  for (let k = -j; k <= j; k++) sum += at(k);
  out[0] = sum / w;
  for (let i = 1; i < n; i++) { sum += at(i + j) - at(i - j - 1); out[i] = sum / w; }
  return out;
}
const detrend = (x, k) => { const b = smooth(x, k); return x.map((v, i) => v - b[i]); };
const bandpass = (x, j, k) => detrend(smooth(x, j), k);

function ladder(oct) {
  const out = [];
  for (let o = 0; o < oct; o++) for (const p of PENTA) out.push(48 + 12 * o + p);
  out.push(48 + 12 * oct);
  return out;                                 // 48 = C3
}

/** One probe's samples → notes [{ midi, dir }]; null if the recording is too short for a tune. */
export function notesFor(values, t, s = SETTINGS) {
  const dts = []; for (let i = 1; i < Math.min(t.length, 200); i++) dts.push(t[i] - t[i - 1]);
  const dt = dts.length ? median(dts) || 1 : 1;
  const med = median(values);
  const norm = Float64Array.from(values, (v) => v - med);
  const series = bandpass(norm, s.j, s.k);
  const spn = Math.max(1, Math.round(s.secPerNote / dt));
  const vals = [];
  for (let p = 0; p + spn <= series.length; p += spn) {
    let sum = 0; for (let q = 0; q < spn; q++) sum += series[p + q];
    vals.push(sum / spn);
  }
  if (vals.length < 4) return null;
  const lo = pct(vals, 0.02), hi = pct(vals, 0.98), span = hi - lo || 1;
  const lad = ladder(s.octaves);
  const raw = Array.from(bandpass(norm, 0, 3));
  const perSample = stdev(raw.length > 70 ? raw.slice(60, -5) : raw);
  const thresh = Math.max(3 * (perSample / Math.sqrt(spn)), 0.01 * span);
  return vals.map((x, i) => {
    const f = Math.min(1, Math.max(0, (x - lo) / span));
    const d = i === 0 ? 0 : x - vals[i - 1];
    return { midi: lad[Math.round(f * (lad.length - 1))], dir: i === 0 ? 0 : d > thresh ? 1 : d < -thresh ? -1 : 0 };
  });
}

/* ---------------------------------------------------------------- notation */

function abcPitch(midi) {
  const letter = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" }[midi % 12];
  const oct = Math.floor(midi / 12) - 1;      // C4 = 60
  if (oct >= 5) return letter.toLowerCase() + "'".repeat(oct - 5);
  return letter + ",".repeat(4 - oct);
}

const REST_LENGTHS = [16, 12, 8, 6, 4, 3, 2, 1];
function rests(n) {
  const out = [];
  while (n > 0) { const l = REST_LENGTHS.find((x) => x <= n); out.push(l === 1 ? "z" : `z${l}`); n -= l; }
  return out.join(" ");
}

/** notes → ABC text for a grand staff. */
export function toABC(notes, { title = "MycoKit study", subtitle = "" } = {}, s = SETTINGS) {
  const n = notes.length;
  const voiceOf = (m) => (m >= 60 ? 0 : 1);   // 0 = right hand (treble), 1 = left hand (bass)

  // decorations per note, decided on the whole melody
  const deco = notes.map(() => ({ pre: "", tie: false, slurOpen: false, slurClose: false }));
  for (let i = 0; i < n; i++) {
    const nt = notes[i];
    if (nt.dir === 1) deco[i].pre = "!>!.";
    if (i > 0 && nt.dir === 0 && nt.midi === notes[i - 1].midi) deco[i - 1].tie = true;
  }
  // falling runs, split wherever the hand changes (a slur can't jump staves)
  for (let i = 0; i < n;) {
    if (notes[i].dir !== -1) { i++; continue; }
    let j = i;
    while (j + 1 < n && notes[j + 1].dir === -1 && voiceOf(notes[j + 1].midi) === voiceOf(notes[i].midi)) j++;
    if (j > i) { deco[i].slurOpen = true; deco[j].slurClose = true; } else deco[i].pre = "!tenuto!";
    i = j + 1;
  }

  const bars = [[], []];                          // per voice: array of bar strings
  for (let b = 0; b * s.notesPerBar < n; b++) {
    const lines = [[], []];
    const restRun = [0, 0];
    const flush = (v) => { if (restRun[v]) { lines[v].push(rests(restRun[v])); restRun[v] = 0; } };
    for (let i = b * s.notesPerBar; i < Math.min(n, (b + 1) * s.notesPerBar); i++) {
      const v = voiceOf(notes[i].midi), o = 1 - v;
      flush(v);
      const d = deco[i];
      lines[v].push(`${d.slurOpen ? "(" : ""}${d.pre}${abcPitch(notes[i].midi)}${d.tie && voiceOf(notes[i + 1]?.midi ?? 0) === v ? "-" : ""}${d.slurClose ? ")" : ""}`);
      restRun[o] += 1;
    }
    const used = Math.min(n, (b + 1) * s.notesPerBar) - b * s.notesPerBar;
    if (used < s.notesPerBar) { restRun[0] += s.notesPerBar - used; restRun[1] += s.notesPerBar - used; }
    flush(0); flush(1);
    bars[0].push(lines[0].join(" "));
    bars[1].push(lines[1].join(" "));
  }

  const head = [
    "X:1",
    `T:${title.replace(/[\r\n]/g, " ")}`,
    subtitle ? `T:${subtitle.replace(/[\r\n]/g, " ")}` : null,
    "C:MycoKit · 1 note = 1 minute",
    "M:4/4",
    "L:1/16",
    `Q:1/4=${s.tempo}`,
    "%%score {RH | LH}",
    "V:RH clef=treble",
    "V:LH clef=bass",
    "K:C",
  ].filter(Boolean);
  const body = [];
  for (let b = 0; b < bars[0].length; b += s.barsPerLine) {
    const end = Math.min(bars[0].length, b + s.barsPerLine);
    const last = end === bars[0].length;
    body.push(`[V:RH] ${bars[0].slice(b, end).join(" | ")} ${last ? "|]" : "|"}`);
    body.push(`[V:LH] ${bars[1].slice(b, end).join(" | ")} ${last ? "|]" : "|"}`);
  }
  return [...head, ...body].join("\n");
}

/** A short summary of a tune, for the page. */
export function describe(notes) {
  return {
    notes: notes.length,
    minutes: notes.length * (SETTINGS.secPerNote / 60),
    bars: Math.ceil(notes.length / SETTINGS.notesPerBar),
    seconds: Math.round((notes.length / 4) * (60 / SETTINGS.tempo)),   // 4 semiquavers a beat
  };
}
