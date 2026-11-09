// page-upload.js — Prepare upload (Flow 6, kit side). F-16 photos · F-30 bundle · F-31 recording ID · F-32 hand-off.
// The kit has no internet, so this is a download, not an upload.
//
// BUNDLE: one JSON file with the CSV inside, made by the Pi (fungikit_kit.py, format "fungikit-bundle/1").
// The phone adds the photos. The project website's upload step reads this file.
//
// 28 Oct 2026 (Dwij, after the summative test):
//   - the two photos are taken HERE, with the phone's camera, and go into the bundle as `photos` (smaller JPEGs,
//     each with a simulated location: see SIMULATED_LOCATION in config.js). The kit never keeps them.
//     `photos_taken` is still written, for older readers of the bundle.
//   - "session code" is now "Recording ID". Nobody types it, so there's no copy button; the hand-off says it
//     isn't the access code.

import * as kit from "./kit.js";
import { say, celebrate } from "./mascot.js";
import { ROUTES, SIMULATED_LOCATION } from "./config.js";
import { download, params, recordingTitle } from "./ui.js";
import { photosFor, keep, shrink } from "./photo-store.js";

const SLOTS = {
  mushroom: "A close-up of the mushroom",
  setup: "The whole setup, pins and all",
};

export async function initUpload() {
  const views = Object.fromEntries([...document.querySelectorAll("[data-view]")].map((n) => [n.dataset.view, n]));
  let r = null;
  try { r = await kit.get(params.get("id") || ""); } catch { r = null; }
  if (!r || r.live) {
    views.missing.hidden = false;
    say("upload-missing", "Open a saved recording first, then choose Prepare upload.", "ready");
    return;
  }
  const back = document.querySelector("[data-back]");
  back.href = `${ROUTES.recording}?id=${encodeURIComponent(r.id)}`;
  document.querySelectorAll("[data-code]").forEach((n) => { n.textContent = r.code; });
  views.prepare.hidden = false;

  // fetch the bundle now, so the download starts straight from the tap (phones block downloads that come late)
  let bundleReady = kit.bundle(r);
  bundleReady.catch(() => { bundleReady = null; });

  const warn = document.querySelector("[data-photo-warn]");
  const btn = document.querySelector("[data-download]");
  let warned = false;

  // the photos: any already taken for this recording come back (after a reload, or going back)
  const shots = await photosFor(r.id);
  const allTaken = () => Object.keys(SLOTS).every((slot) => shots[slot]);
  document.querySelectorAll("[data-shot]").forEach((row) => {
    const slot = row.dataset.shot;
    const input = row.querySelector("[data-shot-input]");
    showShot(row, shots[slot]);
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      row.querySelector("[data-shot-status]").textContent = "Saving…";
      try {
        const small = await shrink(file);
        shots[slot] = {
          recId: r.id, slot, label: SLOTS[slot], ...small,
          taken_at: new Date().toISOString(),
          location: { ...SIMULATED_LOCATION, simulated: true },
        };
        await keep(shots[slot]);
        showShot(row, shots[slot]);
        if (allTaken()) { warn.hidden = true; warned = false; btn.textContent = "Download bundle"; }
      } catch {
        showShot(row, shots[slot]);
        say(`photo-failed-${Date.now()}`, "That photo didn't save. Tap Take photo to try again.", "alert");
      }
    });
  });

  say("upload-intro", "Photos first — they're the one thing you can't do later.", "alert");

  btn.addEventListener("click", async () => {
    if (!allTaken() && !warned) {
      warned = true;
      warn.hidden = false;
      btn.textContent = "Continue without photos";
      say("upload-photos", "Wait! Photos can only be taken now, while you're with the mushroom.", "alert");
      return;
    }

    let bundle;
    btn.disabled = true;
    try {
      bundle = { ...(await (bundleReady ||= kit.bundle(r))) };
    } catch {
      bundleReady = null;
      say(`bundle-failed-${Date.now()}`, "The kit didn't send the bundle. Check you're on the MycoKit Wi-Fi and try again.", "alert");
      return;
    } finally {
      btn.disabled = false;
    }
    bundle.photos_taken = Object.fromEntries(Object.keys(SLOTS).map((slot) => [slot, Boolean(shots[slot])]));
    bundle.photos = Object.keys(SLOTS).filter((slot) => shots[slot]).map((slot) => {
      const p = shots[slot];
      return { slot, label: p.label, type: p.type, width: p.width, height: p.height, taken_at: p.taken_at, location: p.location, data: p.data };
    });
    download(`${r.code}.mycokit.json`, JSON.stringify(bundle, null, 2), "application/json");

    views.prepare.hidden = true;
    views.handoff.hidden = false;
    document.querySelector("#handoff-title").focus();
    window.scrollTo({ top: 0 });
    celebrate();
    say("handoff", "Done! Next stop: the website, once you're off the MycoKit Wi-Fi. You'll need the access code printed on the kit.", "happy");
    document.title = `Bundle ready — ${recordingTitle(r)} — MycoKit`;
  });
}

/** One photo row: the picture and "Retake", or the camera and "Take photo". */
function showShot(row, photo) {
  const preview = row.querySelector("[data-shot-preview]");
  const status = row.querySelector("[data-shot-status]");
  const label = row.querySelector("[data-shot-label]");
  if (photo) {
    row.dataset.taken = "";
    preview.style.backgroundImage = `url("${photo.data}")`;
    status.textContent = "Taken";
    label.textContent = "Retake";
  } else {
    row.removeAttribute("data-taken");
    preview.style.backgroundImage = "";
    status.textContent = "Not taken yet";
    label.textContent = "Take photo";
  }
}
