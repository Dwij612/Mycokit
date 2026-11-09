// page-recordings.js — Saved recordings (F-26). The kit is shared, so every recording on it is listed,
// labelled with the name given at the start (site map §5).

// 5 Oct 2026: the list comes from the Pi through kit.js (or the demo's pretend kit).

import * as kit from "./kit.js";
import { say } from "./mascot.js";
import { ROUTES } from "./config.js";
import { formatWhen, formatDuration, formatHours, recordingTitle } from "./ui.js";

const CHEVRON = '<svg class="rec-card__chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

export async function initRecordings() {
  const list = document.querySelector("[data-list]");
  let d;
  try {
    d = await kit.list();
  } catch {
    document.querySelector("[data-empty]").hidden = false;
    say("recordings-offline", "I can't reach the kit. Is your phone on the MycoKit Wi-Fi?", "alert");
    return;
  }
  const live = d.recordings.find((r) => r.live);
  const saved = d.recordings.filter((r) => !r.live);
  const items = [];

  if (live) {
    items.push(`
      <li class="rec-card rec-card--live">
        <span class="rec-card__badge"><span class="live-dot" aria-hidden="true"></span>Recording now</span>
        <h2 class="rec-card__title"><a href="${ROUTES.live}">${esc(recordingTitle(live))}</a></h2>
        <p class="rec-card__meta">Started ${formatWhen(live.startedAt)} · still running</p>
        ${CHEVRON}
      </li>`);
  }
  for (const r of saved) {
    items.push(`
      <li class="rec-card">
        <h2 class="rec-card__title"><a href="${ROUTES.recording}?id=${encodeURIComponent(r.id)}">${esc(recordingTitle(r))}</a></h2>
        <p class="rec-card__meta">${formatWhen(r.startedAt)} · ${formatDuration(r.lengthMs)} · <span class="num">${r.code}</span>${r.hasNotes ? " · has notes" : ""}</p>
        ${CHEVRON}
      </li>`);
  }
  list.innerHTML = items.join("");
  document.querySelector("[data-empty]").hidden = items.length > 0;
  document.querySelector("[data-space]").textContent = d.hoursLeft === null ? ""
    : `Room on the card for about ${formatHours(d.hoursLeft)} more recording.`;

  if (live) {
    const a = document.querySelector("[data-primary]");
    a.href = ROUTES.live;
    a.textContent = "Go to live recording";
  }

  say("recordings-intro", saved.length
    ? "Open a recording to listen to it, or to get it ready for the website."
    : "Nothing saved yet. End a recording and it lands here.", "ready");
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
