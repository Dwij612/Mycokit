// api.js — the only module that talks to the Pi. Everything else gets plain objects back.

import { API, MOCK, REQUEST_TIMEOUT_MS, PROBE_COUNT } from "./config.js";
import { createMock } from "./mock.js";

const mock = MOCK ? createMock(MOCK) : null;

async function request(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Normalise whatever the Pi sends into one predictable shape, so a missing field never breaks the page.
function normaliseStatus(raw = {}) {
  const probes = Array.from({ length: PROBE_COUNT }, (_, i) => {
    const p = (raw.probes || []).find((x) => Number(x.id) === i + 1) || {};
    return { id: i + 1, reading: p.reading === true ? true : p.reading === false ? false : null };
  });
  const s = raw.storage || {};
  return {
    recording: Boolean(raw.recording),
    session: raw.session && raw.session.started_at
      ? { name: raw.session.name || null, startedAt: new Date(raw.session.started_at) }
      : null,
    storage: {
      hoursLeft: Number.isFinite(s.hours_left) ? s.hours_left : null,
      percentFree: Number.isFinite(s.percent_free) ? s.percent_free : null,
    },
    probes,
    clockSynced: raw.clock_synced !== false,
  };
}

export async function getStatus() {
  const raw = mock ? await mock.status() : await request(API.status);
  return normaliseStatus(raw);
}

export async function startRecording(name) {
  // the phone that presses Start also hands the kit the time, so the recording's clock is right from row one
  const body = { name: name || null, epoch_ms: Date.now(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "?" };
  const raw = mock
    ? await mock.start(body.name)
    : await request(API.start, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!raw || raw.ok === false) throw new Error(raw?.error || "start refused");
  return raw;
}

// Existing endpoint on the Pi: {"epoch_ms": <number>, "tz": "<IANA name>"}
export async function sendClock() {
  const body = { epoch_ms: Date.now(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "?" };
  return mock
    ? mock.settime(body)
    : request(API.settime, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export const isMock = Boolean(mock);
