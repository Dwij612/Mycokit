// page-recording.js — one saved recording. F-27 preview · F-28 listen · F-29 CSV · F-30 prepare upload · F-33 delete.
// Also the "Saved" screen at the end of Flow 6 (arrives with ?saved=1 after End recording).

// 5 Oct 2026: the recording and its data come from the Pi through kit.js (or the demo's pretend kit).

import * as kit from "./kit.js";
import { createChart } from "./trace-chart.js";
import { say, celebrate } from "./mascot.js";
import { ROUTES } from "./config.js";
import { formatWhen, formatDuration, formatElapsed, recordingTitle, confirmDialog, params } from "./ui.js";

export async function initRecording() {
  const id = params.get("id");
  const views = Object.fromEntries([...document.querySelectorAll("[data-view]")].map((n) => [n.dataset.view, n]));
  let r = null;
  try {
    r = id ? await kit.get(id) : null;
  } catch {
    views.missing.hidden = false;
    say("rec-offline", "I can't reach the kit. Is your phone on the MycoKit Wi-Fi?", "alert");
    return;
  }

  if (!r || r.live) {
    if (r?.live) { location.replace(ROUTES.live); return; }
    views.missing.hidden = false;
    say("rec-missing", "I can't find that one. It might have been deleted.", "alert");
    return;
  }
  views.detail.hidden = false;

  const $ = (s) => document.querySelector(s);
  $("[data-title]").textContent = recordingTitle(r);
  $("[data-when]").textContent = formatWhen(r.startedAt);
  const len = r.lengthMs;
  const events = r.events || [];
  $("[data-length]").textContent = formatDuration(len);
  $("[data-code]").textContent = r.code;
  const nNotes = events.filter((e) => e.kind === "note").length;
  $("[data-markers]").textContent = nNotes ? String(nNotes) : "None";
  document.title = `${recordingTitle(r)} — MycoKit`;

  const chart = createChart($("[data-chart]"), { label: "Signal from four probes for the whole recording", compact: true });
  kit.series(r, 200).then((vals) => { chart.setData(vals, 0, len); chart.setEvents(events); })
    .catch(() => say("rec-data-failed", "The kit didn't send the graph. Reload the page to try again.", "alert"));

  // review: every note, marker and alert, in order, with its time into the recording
  const KIND = { marker: "You tried", note: "Note", alert: "Unusual" };
  let n = 0;
  $("[data-review]").innerHTML = [...events].sort((a, b) => a.at - b.at).map((e) => `
    <li class="tl tl--${e.kind}">
      <span class="tl__time num">${formatElapsed(e.at)}</span>
      <span class="tl__kind">${e.kind === "note" ? `Note ${++n}` : KIND[e.kind]}</span>
      <span class="tl__text">${esc(e.label)}</span>
    </li>`).join("") || '<li class="notes-empty">No notes, markers or alerts in this recording.</li>';

  // Listen: every recording plays in real time; the faster speeds need 10 minutes (8 Oct 2026, was: no Listen under 10 minutes)
  $("[data-listen]").href = `${ROUTES.listen}?id=${encodeURIComponent(r.id)}`;
  $("[data-upload]").href = `${ROUTES.upload}?id=${encodeURIComponent(r.id)}`;

  $("[data-csv]").addEventListener("click", async () => {
    try {
      await kit.downloadCSV(r);
      say("csv", "The CSV is in your phone's downloads.", "happy");
    } catch {
      say(`csv-failed-${Date.now()}`, "The download didn't start. Check you're on the MycoKit Wi-Fi.", "alert");
    }
  });

  $("[data-delete]").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete this recording?",
      body: `${recordingTitle(r)} from ${formatWhen(r.startedAt)} will be removed from the kit. This can't be undone.`,
      confirm: "Delete it",
      cancel: "Keep it",
      danger: true,
    });
    if (!ok) return;
    try {
      await kit.remove(r.id);
      location.href = ROUTES.recordings;
    } catch {
      say(`delete-failed-${Date.now()}`, "The kit didn't delete it. Check you're on the MycoKit Wi-Fi and try again.", "alert");
    }
  });

  if (r.endReason === "power") $("[data-power-note]").hidden = false;

  if (params.get("saved") === "1") {
    $("[data-saved-banner]").hidden = false;
    celebrate();
    say("saved", "Saved! When you're ready, Prepare upload gets it ready for the project website.", "happy");
  } else {
    say("rec-detail", "Listen to it, download the data, or prepare it for the website.", "ready");
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
