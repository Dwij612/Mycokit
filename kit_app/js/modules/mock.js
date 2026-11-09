// mock.js — a pretend kit, so the page can be built and tested without the Pi.
// Behaves like the API in README §API, including keeping a recording "running" after Start.
//
// Scenario "demo" (the default in the demo build) is backed by demo-store.js, so a recording started
// here is still running on live.html, and ending it there makes it appear in Saved recordings.

import * as store from "./demo-store.js";

const HOUR = 3600 * 1000;

function scenario(name) {
  const all = [true, true, true, true];
  const base = { recording: false, session: null, storage: { hours_left: 41.5, percent_free: 82 }, probes: all };
  switch (name) {
    case "partial":   return { ...base, probes: [true, true, false, true] };
    case "none":      return { ...base, probes: [false, false, false, false] };
    case "low":       return { ...base, storage: { hours_left: 4.2, percent_free: 9 } };
    case "full":      return { ...base, storage: { hours_left: 0.4, percent_free: 1 } };
    case "recording": return { ...base, recording: true,
                               session: { name: "Sam", started_at: new Date(Date.now() - 2 * HOUR - 14 * 60e3).toISOString() } };
    default:          return base;   // "ready", "flaky", "offline"
  }
}

function createDemoMock() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let polls = 0;
  return {
    async status() {
      await sleep(polls === 0 ? 600 : 100);
      polls += 1;
      const s = store.getState();
      const h = store.hoursLeft();
      return {
        recording: Boolean(s.recording),
        session: s.recording ? { name: s.recording.name, started_at: new Date(s.recording.startedAt).toISOString() } : null,
        storage: { hours_left: h, percent_free: Math.round((h / s.storage.totalHours) * 100) },
        // the signal check, acted out: probes come alive one by one over the first few seconds
        probes: [1, 2, 3, 4].map((id) => ({ id, reading: s.recording ? true : id <= polls })),
        clock_synced: true,
      };
    },
    async start(personName) {
      await sleep(500);
      const r = store.startRecording(personName);
      return { ok: true, session: { name: r.name, started_at: new Date(r.startedAt).toISOString() } };
    },
    async settime() { return { outcome: "demo: no change", synced: true }; },
  };
}

export function createMock(name) {
  if (name === "demo") return createDemoMock();
  const state = scenario(name);
  let polls = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function snapshot() {
    polls += 1;
    let probes = state.probes;
    if (name === "flaky" && !state.recording) {
      // pins being pushed in one at a time
      const n = Math.min(4, Math.floor(polls / 2));
      probes = [0, 1, 2, 3].map((i) => i < n);
    }
    return {
      recording: state.recording,
      session: state.session,
      storage: state.storage,
      probes: probes.map((reading, i) => ({ id: i + 1, reading })),
      clock_synced: true,
    };
  }

  return {
    async status() {
      await sleep(polls === 0 ? 700 : 120);
      if (name === "offline") throw new Error("mock: kit unreachable");
      return snapshot();
    },
    async start(personName) {
      await sleep(600);
      if (name === "offline") throw new Error("mock: kit unreachable");
      state.recording = true;
      state.session = { name: personName || null, started_at: new Date().toISOString() };
      return { ok: true, session: state.session };
    },
    async settime() {
      await sleep(80);
      return { outcome: "mock: no change", synced: true };
    },
  };
}
