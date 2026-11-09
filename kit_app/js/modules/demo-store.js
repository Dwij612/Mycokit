// demo-store.js — the pretend kit's memory, shared by every page of the demo.
// Kept in localStorage so Start on one page is still running on the next. If storage is unavailable
// (private browsing, the Wi-Fi pop-up window) it falls back to memory: each page still works alone.
//
// Model (version 2):
//   recording  = the one running now: { id, code, name, startedAt (wall ms), events: [], prompts: {} }
//   recordings = saved ones:          { id, code, name, startedAt, durationMs (recording time), events: [] }
//   event      = { kind: "marker" | "note" | "alert", at (ms into the recording), wall (wall-clock ms),
//                  label, probe? }
// "Recording time" runs TIME_SCALE times faster than the wall clock in the demo (config.js).

import { STORAGE_KEYS, TIME_SCALE } from "./config.js";

const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const VERSION = 2;
let memory = null;

function seed() {
  const now = Date.now();
  return {
    version: VERSION,
    recording: null,
    recordings: [
      { id: "r3", code: "FK-CW7A", name: "Alex", startedAt: now - 3 * HOUR, durationMs: 6 * MIN + 40e3,
        events: [] },
      { id: "r2", code: "FK-H4QM", name: "Sam", startedAt: now - 1 * DAY - 5 * HOUR, durationMs: 2 * HOUR + 40 * MIN,
        events: [
          { kind: "marker", at: 34 * MIN, wall: now - 1 * DAY - 5 * HOUR + 34 * MIN, label: "Touched the cap" },
          { kind: "alert", at: 71 * MIN, wall: now - 1 * DAY - 5 * HOUR + 71 * MIN, label: "Probe 2 jumped", probe: 2 },
        ] },
      { id: "r1", code: "FK-7Q2M", name: null, startedAt: now - 3 * DAY - 9 * HOUR, durationMs: 18 * HOUR,
        events: [] },
    ],
    storage: { totalHours: 52 },
  };
}

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.demo);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  if (!memory) memory = seed();
  return memory;
}

function write(state) {
  memory = state;
  try { localStorage.setItem(STORAGE_KEYS.demo, JSON.stringify(state)); } catch { /* memory only */ }
}

export function getState() {
  const s = read();
  if (!s || s.version !== VERSION) { const fresh = seed(); write(fresh); return fresh; }
  return s;
}

export function update(fn) {
  const s = getState();
  fn(s);
  write(s);
  return s;
}

export function reset() {
  try { localStorage.removeItem(STORAGE_KEYS.demo); } catch { /* ignore */ }
  memory = null;
  write(seed());
}

/* ---------------------------------------------------------------- time */

/** How much is in a recording, in recording time. Live ones grow; saved ones are fixed. */
export function lengthOf(r) {
  if (!r) return 0;
  return r.durationMs ?? (Date.now() - r.startedAt) * TIME_SCALE;
}

/** Wall-clock moment for a point in a recording (for display only). */
export function wallAt(r, atMs) {
  return r.startedAt + atMs / TIME_SCALE;
}

/* ---------------------------------------------------------------- recording lifecycle */

const CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY34679";   // no 0/O, 1/I/L, 2/Z, 5/S, 8/B: easy to read aloud
export function newCode() {
  let c = "FK-";
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export function startRecording(name) {
  return update((s) => {
    s.recording = { id: `r${Date.now()}`, code: newCode(), name: name || null, startedAt: Date.now(), events: [], prompts: {} };
  }).recording;
}

/** Add a marker, note or alert to the running recording, stamped with the moment it happened. */
export function addEvent(kind, label, extra = {}) {
  let ev = null;
  update((s) => {
    if (!s.recording) return;
    ev = { kind, at: Math.round(lengthOf(s.recording)), wall: Date.now(), label, ...extra };
    s.recording.events.push(ev);
  });
  return ev;
}

export function removeEvent(at, kind) {
  update((s) => { if (s.recording) s.recording.events = s.recording.events.filter((e) => !(e.at === at && e.kind === kind)); });
}

export function endRecording() {
  let saved = null;
  update((s) => {
    if (!s.recording) return;
    const { prompts, ...rest } = s.recording;
    saved = { ...rest, durationMs: Math.round(lengthOf(s.recording)) };
    s.recordings.unshift(saved);
    s.recording = null;
  });
  return saved;
}

export function deleteRecording(id) {
  update((s) => { s.recordings = s.recordings.filter((r) => r.id !== id); });
}

export function findRecording(id) {
  const s = getState();
  if (s.recording && s.recording.id === id) return { ...s.recording, live: true };
  return s.recordings.find((r) => r.id === id) || null;
}

/** Hours of space left: the card's capacity minus everything recorded (recording time). */
export function hoursLeft() {
  const s = getState();
  const used = s.recordings.reduce((h, r) => h + r.durationMs / HOUR, 0) + lengthOf(s.recording) / HOUR;
  return Math.max(0, s.storage.totalHours - used);
}
