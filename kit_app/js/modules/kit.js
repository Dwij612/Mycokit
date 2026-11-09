// kit.js — the one place the pages get recordings from (5 Oct 2026).
//
// Real kit: asks the Pi (fungikit_kit.py) over the API in config.js.
// Demo (DEMO_MODE): the pretend kit in demo-store.js + signal-sim.js, exactly as before.
// Either way the pages get the same shapes back:
//
//   recording = { id, code, name, startedAt (wall ms), lengthMs, live, events, endReason, hasNotes }
//   event     = { kind: "marker" | "note" | "alert", at (ms into the recording), wall (wall ms), label, probe? }
//   series    = four arrays of evenly spaced values (mV), one per probe

import { API, DEMO_MODE, REQUEST_TIMEOUT_MS, TIME_SCALE } from "./config.js";
import * as store from "./demo-store.js";
import { series as simSeries, toCSV } from "./signal-sim.js";
import { download } from "./ui.js";

export const real = !DEMO_MODE;

/* ---------------------------------------------------------------- talking to the Pi */

async function request(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", ...options, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || `${url} → HTTP ${res.status}`), { status: res.status });
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const post = (url, body = {}, timeout) =>
  request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), timeout });

const piEvent = (e) => ({ kind: e.kind, at: e.at_ms, wall: Date.parse(e.wall), label: e.label, ...(e.probe ? { probe: e.probe } : {}) });

function piRecording(r) {
  const events = (r.events || []).map(piEvent);
  return {
    id: r.id, code: r.code, name: r.name || null,
    startedAt: r.started_epoch_ms ?? Date.parse(r.started_at),
    lengthMs: r.length_ms ?? 0,
    live: Boolean(r.live),
    events,
    endReason: r.end_reason || null,
    hasNotes: r.has_notes ?? events.some((e) => e.kind === "note"),
    settledAtMs: r.settled_at_ms ?? null,
    alertSettings: r.alert_settings || null,
  };
}

/* ---------------------------------------------------------------- the demo's pretend kit */

function demoRecording(r, live = false) {
  if (!r) return null;
  return {
    id: r.id, code: r.code, name: r.name || null, startedAt: r.startedAt,
    lengthMs: Math.round(store.lengthOf(r)), live, events: r.events || [], endReason: null,
    hasNotes: (r.events || []).some((e) => e.kind === "note"), settledAtMs: null, alertSettings: null,
  };
}

/* ---------------------------------------------------------------- what the pages use */

/** The recording running now, or null. */
export async function current() {
  if (!real) return demoRecording(store.getState().recording, true);
  const s = await request(API.status);
  if (!s.recording || !s.session) return null;
  return get(s.session.id);
}

/** Real kit only: the running recording's newest samples (after sinceMs) and its events. */
export async function liveSince(sinceMs = -1) {
  const d = await request(`${API.live}?since_ms=${Math.round(sinceMs)}`);
  if (!d.recording) return null;
  return {
    id: d.id, lengthMs: d.length_ms, t: d.t_ms, values: d.values, events: d.events.map(piEvent),
    settledAtMs: d.settled_at_ms, alertSettings: d.alert_settings, adcOk: d.adc_ok !== false,
  };
}

/** Everything on the card: the running one first, then newest first. */
export async function list() {
  if (!real) {
    const s = store.getState();
    const recs = s.recordings.map((r) => demoRecording(r));
    if (s.recording) recs.unshift(demoRecording(s.recording, true));
    return { recordings: recs, hoursLeft: store.hoursLeft() };
  }
  const d = await request(API.recordings);
  return { recordings: d.recordings.map(piRecording), hoursLeft: d.storage?.hours_left ?? null };
}

export async function get(id) {
  if (!real) {
    const r = store.findRecording(id);
    return r ? demoRecording(r, Boolean(r.live)) : null;
  }
  try {
    return piRecording(await request(`${API.recordings}/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/** Four arrays of n evenly spaced values over fromMs..toMs (default: the whole recording, up to now). */
export async function series(rec, n, fromMs = 0, toMs = rec.lengthMs) {
  if (!real) return simSeries(rec.id, fromMs, toMs, n, rec.events);
  const q = `n=${Math.round(n)}&from_ms=${Math.round(fromMs)}&to_ms=${Math.round(toMs)}`;
  const d = await request(`${API.recordings}/${encodeURIComponent(rec.id)}/series?${q}`, { timeout: 20000 });
  return d.values;
}

export async function addEvent(kind, label) {
  if (!real) return store.addEvent(kind, label);
  const d = await post(API.events, { kind, label });
  return piEvent(d.event);
}

export async function removeEvent(at, kind) {
  if (!real) return store.removeEvent(at, kind);
  return post(API.eventsDelete, { at_ms: at, kind });
}

export async function setAlertSettings(settings) {
  if (!real) return null;                         // the demo detects in the browser (page-live.js)
  return post(API.alertSettings, settings);
}

/** Ends the running recording. Returns its id. */
export async function end() {
  if (!real) return store.endRecording()?.id;
  const d = await post(API.end, {}, 15000);
  return d.id;
}

export async function remove(id) {
  if (!real) return store.deleteRecording(id);
  return post(`${API.recordings}/${encodeURIComponent(id)}/delete`);
}

/** Puts the recording's CSV in the phone's downloads. */
export async function downloadCSV(rec) {
  if (!real) return download(`${rec.code}.csv`, toCSV(rec, rec.lengthMs, store.wallAt), "text/csv");
  const a = Object.assign(document.createElement("a"), {
    href: `${API.recordings}/${encodeURIComponent(rec.id)}/csv`, download: `${rec.code}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** What the phone carries to the project website (the page adds which photos were taken). */
export async function bundle(rec) {
  if (!real) {
    return {
      format: "fungikit-bundle/demo-1",
      session_code: rec.code,
      name: rec.name,
      started_at: new Date(rec.startedAt).toISOString(),
      length_s: Math.round(rec.lengthMs / 1000),
      events: rec.events.map((e) => ({ kind: e.kind, at_s: Math.round(e.at / 1000), wall: new Date(e.wall).toISOString(), text: e.label, probe: e.probe ?? null })),
      note: "DEMO BUNDLE — made-up data, not a real recording.",
      csv: toCSV(rec, rec.lengthMs, store.wallAt, 10000),
    };
  }
  return request(`${API.recordings}/${encodeURIComponent(rec.id)}/bundle`, { timeout: 30000 });
}

export async function hoursLeft() {
  if (!real) return store.hoursLeft();
  const s = await request(API.status);
  return s.storage?.hours_left ?? null;
}

/** Recording time for the demo runs fast; the real kit's is the real time. */
export const timeScale = real ? 1 : TIME_SCALE;
