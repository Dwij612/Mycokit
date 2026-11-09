// landing.js — the start screen. Asks the Pi one question ("is a recording running?") and shows one of
// two states (site map §5). Traces to the feature list: F-01 name, F-02 two states, F-04 help link,
// F-05 signal check (switched off: SHOW_PROBE_CHECK), F-07 space on the card (quiet line at the bottom).

import { getStatus, startRecording, isMock } from "./api.js";
import { syncClockOnce } from "./clock.js";
import { say, celebrate, setMood } from "./mascot.js";
import { load, save } from "./storage-local.js";
import {
  POLL_MS, STORAGE_HOURS, STORAGE_KEYS, NAME_MAX, ROUTES, GO_LIVE_AFTER_START, GO_LIVE_DELAY_MS, TIME_SCALE, SHOW_PROBE_CHECK,
} from "./config.js";

const ICONS = {
  reading:  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>',
  silent:   '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>',
  checking: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8h2M7 8h2M12 8h2" stroke="currentColor" stroke-width="2.4"/></svg>',
};
const STATUS_WORD = { reading: "OK", silent: "Check", checking: "…" };   // visible, fits a phone-width tile
const SR_WORD = { reading: "reading", silent: "no signal", checking: "checking" };

let el = {};
let view = "loading";
let pollTimer = null;
let tickTimer = null;
let last = null;            // last normalised status
let starting = false;
let lastProbeStates = [];

export function initLanding(root = document) {
  el = {
    views:        Object.fromEntries([...root.querySelectorAll("[data-view]")].map((n) => [n.dataset.view, n])),
    chip:         root.querySelector("[data-kit-chip]"),
    chipText:     root.querySelector("[data-kit-chip-text]"),
    form:         root.querySelector("[data-start-form]"),
    name:         root.querySelector("#name"),
    startBtn:     root.querySelector("[data-start-button]"),
    startReason:  root.querySelector("[data-start-reason]"),
    storage:      root.querySelector("[data-storage]"),
    storageText:  root.querySelector("[data-storage-text]"),
    storageMeter: root.querySelector("[data-storage-meter]"),
    storageFill:  root.querySelector("[data-storage-fill]"),
    probes:       root.querySelector("[data-probes]"),
    probesSummary: root.querySelector("[data-probes-summary]"),
    elapsed:      root.querySelector("[data-session-elapsed]"),
    started:      root.querySelector("[data-session-started]"),
    retry:        root.querySelector("[data-retry]"),
  };

  // keep the mock scenario when moving between pages during development
  if (isMock) {
    root.querySelectorAll("[data-link]").forEach((a) => { a.href = ROUTES[a.dataset.link] + location.search; });
  }

  el.name.maxLength = NAME_MAX;
  el.name.value = load(STORAGE_KEYS.name, "") || "";
  if (SHOW_PROBE_CHECK) buildProbes();

  el.form.addEventListener("submit", onStart);
  el.retry.addEventListener("click", () => { setChip("checking"); say("checking", "Trying the kit again…", "waiting"); poll(); });

  say("checking", "Hang on, I'm checking the kit.", "waiting");
  poll();
}

/* ---------------------------------------------------------------- polling */

async function poll() {
  clearTimeout(pollTimer);
  try {
    const status = await getStatus();
    last = status;
    setChip("online");
    syncClockOnce();
    if (status.recording) showRecording(status);
    else showIdle(status);
    pollTimer = setTimeout(poll, status.recording ? POLL_MS.recording : POLL_MS.idle);
  } catch (err) {
    console.warn("[MycoKit] status failed:", err.message);
    showOffline();
    pollTimer = setTimeout(poll, POLL_MS.offline);
  }
}

// Pause polling while the tab is hidden; check straight away when it comes back.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(pollTimer);
  else poll();
});

/* ---------------------------------------------------------------- views */

function switchView(next) {
  if (view === next) return;
  const moveFocus = view !== "loading";     // don't steal focus on first load
  view = next;
  for (const [name, node] of Object.entries(el.views)) node.hidden = name !== next;
  if (moveFocus) {
    const h1 = el.views[next].querySelector("h1");
    if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: false }); }
  }
}

function showIdle(status) {
  switchView("idle");
  clearInterval(tickTimer);
  renderStorage(status.storage);
  if (SHOW_PROBE_CHECK) renderProbes(status.probes);
  renderStartGate(status);
}

function showRecording(status) {
  switchView("recording");
  const s = status.session;
  if (s) {
    const time = s.startedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const day = isToday(s.startedAt) ? "Today" : s.startedAt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    el.started.textContent = `${day}, ${time}${s.name ? ` · ${s.name}` : ""}`;
  }
  clearInterval(tickTimer);
  // recording time (runs TIME_SCALE× fast in the demo; 1× on the real kit)
  const tick = () => { el.elapsed.textContent = s ? formatElapsed((Date.now() - s.startedAt.getTime()) * TIME_SCALE) : "—"; };
  tick();
  tickTimer = setInterval(tick, 1000);
  if (!starting) say("recording", "I'm still recording! Tap Go to live recording to see the signal.", "happy");
}

function showOffline() {
  setChip("offline");
  clearInterval(tickTimer);
  switchView("offline");
  say("offline", "I can't hear the kit. Is it switched on, and are you on the MycoKit Wi-Fi?", "alert");
}

/* ---------------------------------------------------------------- kit check */

function buildProbes() {
  // Mobile first: four compact tiles in one row. Each carries its number, an icon whose SHAPE changes
  // (tick / cross / dots) and a full text label for screen readers — never colour alone (WCAG 1.4.1).
  el.probes.innerHTML = [1, 2, 3, 4].map((n) => `
    <li class="probe" data-probe="${n}" data-state="checking" style="--probe-colour: var(--probe-${n})">
      <span class="probe__num" aria-hidden="true">${n}</span>
      <span class="probe__swatch" aria-hidden="true"></span>
      <span class="probe__icon" aria-hidden="true">${ICONS.checking}</span>
      <span class="probe__word">${STATUS_WORD.checking}</span>
      <span class="visually-hidden" data-sr>Probe ${n}: ${SR_WORD.checking}</span>
    </li>`).join("");
}

function renderProbes(probes) {
  probes.forEach((p, i) => {
    const node = el.probes.children[i];
    const state = p.reading === true ? "reading" : p.reading === false ? "silent" : "checking";
    if (node.dataset.state === state) return;
    node.dataset.state = state;
    node.querySelector(".probe__icon").innerHTML = ICONS[state];
    node.querySelector(".probe__word").textContent = STATUS_WORD[state];
    node.querySelector("[data-sr]").textContent = `Probe ${i + 1}: ${SR_WORD[state]}`;
    if (lastProbeStates.length) {               // a little pop when a pin starts or stops reading
      node.removeAttribute("data-changed"); void node.offsetWidth; node.setAttribute("data-changed", "");
    }
  });
  lastProbeStates = probes.map((p) => p.reading);

  const reading = probes.filter((p) => p.reading === true).length;
  const silent = probes.filter((p) => p.reading === false).map((p) => p.id);
  const summary = reading === probes.length ? `All ${probes.length} probes reading.`
    : reading === 0 ? "No probes reading yet."
    : silent.length ? `${reading} of ${probes.length} reading · ${listProbes(silent)} ${silent.length > 1 ? "have" : "has"} no signal.`
    : `${reading} of ${probes.length} probes reading.`;
  if (el.probesSummary.textContent !== summary) el.probesSummary.textContent = summary;
}

function renderStorage({ hoursLeft, percentFree }) {
  if (hoursLeft === null) {
    el.storage.dataset.level = "ok";
    el.storageText.textContent = "Couldn't read the space on the card.";
    return;
  }
  const level = hoursLeft < STORAGE_HOURS.block ? "block" : hoursLeft < STORAGE_HOURS.warn ? "warn" : "ok";
  el.storage.dataset.level = level;
  el.storageText.textContent = `Room for about ${formatHours(hoursLeft)} of recording`;
  if (!el.storageMeter) return;                // the meter went with the kit-check box; the bottom line is text only
  const pct = Math.max(0, Math.min(100, percentFree ?? 0));
  el.storageFill.style.setProperty("--fill", `${pct}%`);
  el.storageMeter.setAttribute("aria-valuenow", String(Math.round(pct)));
  el.storageMeter.setAttribute("aria-valuetext", `${Math.round(pct)} percent free, about ${formatHours(hoursLeft)}`);
}

/* ---------------------------------------------------------------- the Start gate (L8: constraints) */

function renderStartGate(status) {
  // with the probe check off, every probe counts as reading: Start depends only on space on the card
  const probes = SHOW_PROBE_CHECK ? status.probes : status.probes.map((p) => ({ ...p, reading: true }));
  const silent = probes.filter((p) => p.reading === false).map((p) => p.id);
  const reading = probes.filter((p) => p.reading === true).length;
  const h = status.storage.hoursLeft;
  const full = h !== null && h < STORAGE_HOURS.block;
  const low = h !== null && !full && h < STORAGE_HOURS.warn;

  let enabled = false, reason = "", tone = "", key, msg, mood;

  if (full) {
    reason = "The card is full. Delete an old recording in Saved recordings first.";
    tone = "bad";
    key = "full"; mood = "alert";
    msg = "The card is full, so I can't record. Delete an old recording in Saved recordings, then come back.";
  } else if (reading === 0) {
    reason = "Waiting for at least one probe to read.";
    key = "none"; mood = "alert";
    msg = "I can't feel any probes yet. Check the placement card, or tap the help link below.";
  } else {
    enabled = true;
    if (silent.length) {
      reason = `${listProbes(silent)} ${silent.length > 1 ? "aren't" : "isn't"} reading. You can still start.`;
      tone = "warn";
      key = `partial-${silent.join("")}`; mood = "alert";
      msg = `${listProbes(silent)} ${silent.length > 1 ? "aren't" : "isn't"} reading. Push ${silent.length > 1 ? "them" : "it"} a little further in, or start with the others.`;
    } else if (low) {
      reason = `The card only has room for about ${formatHours(h)}.`;
      tone = "warn";
      key = "low"; mood = "alert";
      msg = `The card is getting full. There's room for about ${formatHours(h)} — fine for a short session.`;
    } else {
      reason = "";
      key = "ready"; mood = "ready";
      msg = SHOW_PROBE_CHECK
        ? "All four probes are reading. Add your name if you like, then press Start."
        : "The kit's ready. Add your name if you like, then press Start.";
    }
  }

  if (!starting) {
    el.startBtn.disabled = !enabled;
    el.startReason.textContent = reason;
    if (tone) el.startReason.dataset.tone = tone; else delete el.startReason.dataset.tone;
    say(key, msg, mood);
  }
}

async function onStart(e) {
  e.preventDefault();
  if (starting || el.startBtn.disabled) return;

  const name = el.name.value.trim().slice(0, NAME_MAX);
  starting = true;
  el.startBtn.dataset.busy = "true";
  el.startBtn.disabled = true;
  el.startReason.textContent = "Starting…";
  delete el.startReason.dataset.tone;
  setMood("waiting");

  try {
    await startRecording(name);
    save(STORAGE_KEYS.name, name || null);
    celebrate();
    say("started", "We're recording! You can close this page. I'll keep going.", "happy");
    if (GO_LIVE_AFTER_START) {
      setTimeout(() => { location.href = ROUTES.live; }, GO_LIVE_DELAY_MS);
    } else {
      await poll();                            // mock: shows the Recording state (keeps the "started" line)
      starting = false;
      delete el.startBtn.dataset.busy;
    }
  } catch (err) {
    console.warn("[MycoKit] start failed:", err.message);
    starting = false;
    delete el.startBtn.dataset.busy;
    el.startBtn.disabled = false;
    el.startReason.textContent = "That didn't start. Check you're still on the MycoKit Wi-Fi, then try again.";
    el.startReason.dataset.tone = "bad";
    say(`start-failed-${Date.now()}`, "That didn't work. Try pressing Start again in a moment.", "alert");
  }
}

/* ---------------------------------------------------------------- helpers */

function setChip(state) {
  el.chip.dataset.state = state;
  el.chipText.textContent = state === "online" ? "Kit connected" : state === "offline" ? "Not connected" : "Looking for the kit…";
}

function listProbes(ids) {
  if (ids.length === 1) return `Probe ${ids[0]}`;
  return `Probes ${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;
}

function formatHours(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes`;
  if (h < 10) return `${Math.round(h * 2) / 2} hours`.replace(".0", "");
  return `${Math.round(h)} hours`;
}

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function isToday(d) {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
