// page-upload.js — W3 Upload (Flow 7): access code → bundle → notes → preview → publish.
// Publishes straight away (Dwij, 5 Oct 2026). Removing a study later: email the team.
// 28 Oct 2026 (Dwij, after the summative test): no photo step. The photos are taken in the kit app and come inside
// the bundle (bundle.js), each with a simulated location; the bundle step shows them. "Session code" is now
// "Recording ID", as in the kit app.

import { checkAccessCode, publish, findByCode } from "./data.js";
import { readBundle, bucket } from "./bundle.js";
import { placeText } from "./photos.js";
import { renderStudy } from "./study-view.js";
import { createChart } from "./trace-chart.js";
// import { say, celebrate } from "./mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)
import { MOCK, ROUTES, TEAM_EMAIL } from "./config.js";
import { formatWhen, formatDuration, formatElapsed, download } from "./ui.js";
import { esc } from "./study-view.js";

const ORDER = ["code", "bundle", "notes", "preview"];
const $ = (s, r = document) => r.querySelector(s);

let step = "code";
let draft = null;          // { code, name, started_at, length_s, events, csv }
let photos = [];           // the photos inside the bundle
let cleanupPreview = null;
let codeOk = false;

export function initUpload() {
  setupCode();
  setupBundle();
  setupNav();
  show("code", false);
  // (mascot removed) say("upload-intro", "You'll need the access code from the kit, and the file the kit saved to your phone.", "ready");
}

/* ---------------------------------------------------------------- moving between steps */

function show(name, focus = true) {
  step = name;
  document.querySelectorAll("[data-step]").forEach((n) => { n.hidden = n.dataset.step !== name; });
  const i = ORDER.indexOf(name);
  $("[data-progress]").textContent = name === "done" ? "Done" : `Step ${i + 1} of ${ORDER.length}`;
  document.querySelectorAll("[data-dot]").forEach((d) => {
    const k = ORDER.indexOf(d.dataset.dot);
    d.dataset.state = name === "done" || k < i ? "done" : k === i ? "now" : "todo";
  });
  if (focus) {
    const h = $(`[data-step="${name}"] h2`);
    h?.focus();
    h?.scrollIntoView({ block: "start" });
  }
}

function setupNav() {
  document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => {
    const i = ORDER.indexOf(step);
    if (i > 0) show(ORDER[i - 1]);
  }));
  document.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", () => {
    const i = ORDER.indexOf(step);
    if (step === "bundle") draft.name = $("#shown-name").value.trim().slice(0, 24) || null;
    if (step === "notes") { renderPreview(); }
    show(ORDER[i + 1]);
    // (mascot removed) if (ORDER[i + 1] === "preview") say("upload-preview", "Check it over. Publish when you're happy.", "ready");
  }));
  $("[data-publish]").addEventListener("click", onPublish);
  $("[data-download-summary]").addEventListener("click", downloadSummary);
}

/* ---------------------------------------------------------------- 1. access code */

function setupCode() {
  const form = $("[data-code-form]");
  const input = $("#code");
  const err = $("[data-code-error]");
  // The dash is added for you: type FUNGI and "-" appears before LAB (Dwij, 7 Oct 2026).
  // Deleting right after the dash removes it rather than putting it straight back.
  input.addEventListener("input", (e) => {
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const deleting = (e.inputType || "").startsWith("delete");
    input.value = raw.length > 5 || (raw.length === 5 && !deleting) ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return fail("Type the access code printed on the kit.");
    if (!(await checkAccessCode(input.value))) return fail("That code isn't right. Check it against the one printed on the kit, under the QR code.");
    codeOk = true;
    err.hidden = true;
    input.removeAttribute("aria-invalid");
    show("bundle");
  });
  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }
}

/* ---------------------------------------------------------------- 2. the bundle */

let chart = null;
function setupBundle() {
  const input = $("[data-bundle-input]");
  const err = $("[data-bundle-error]");
  const next = $('[data-step="bundle"] [data-next]');
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    err.hidden = true;
    const r = await readBundle(file);
    if (!r.ok) {
      err.textContent = r.why;
      err.hidden = false;
      $("[data-bundle-card]").hidden = true;
      next.disabled = true;
      draft = null;
      photos = [];
      // (mascot removed) say("bundle-bad", "That's not the file from the kit. Look for one ending in .mycokit.json.", "alert");
      return;
    }
    const b = r.bundle;
    draft = { code: b.code, name: b.name, started_at: b.started_at, length_s: b.length_s, events: b.events, csv: b.csv };
    photos = b.photos;
    renderPhotos();
    $("[data-b-code]").textContent = b.code;
    const when = $("[data-b-when]");
    when.textContent = dateOnly(b.started_at);
    when.appendChild(Object.assign(document.createElement("span"), { className: "facts__time", textContent: time24(b.started_at) }));
    $("[data-b-length]").textContent = formatDuration(b.length_s * 1000);
    $("[data-b-events]").textContent = b.events.length ? String(b.events.length) : "None";
    $("[data-b-demo]").hidden = !b.demo;
    $("[data-b-again]").hidden = !(await findByCode(b.code));
    $("#shown-name").value = b.name || "";
    chart ||= createChart($("[data-b-chart]"), { label: "Signal from four probes in this recording", compact: true });
    const t0 = r.data.t[0], t1 = r.data.t[r.data.t.length - 1];
    chart.setData(bucket(r.data, 160), t0 * 1000, t1 * 1000);
    chart.setEvents(b.events.map((e) => ({ kind: e.kind, at: e.at_s * 1000, label: e.text, probe: e.probe })));
    $("[data-bundle-card]").hidden = false;
    next.disabled = false;
    // (mascot removed) say("bundle-ok", `Got it — ${b.code}. Check the name, then Continue.`, "happy");
  });
}

/* ---------------------------------------------------------------- the photos, from the bundle */
// 28 Oct 2026: was step 3, "Photos" — choose photos from the phone, each needing its own GPS location.

let thumbURLs = [];
function renderPhotos() {
  thumbURLs.forEach((u) => URL.revokeObjectURL(u));
  thumbURLs = [];
  const list = $("[data-photo-list]");
  list.innerHTML = "";
  photos.forEach((p, i) => {
    const url = URL.createObjectURL(p.blob);
    thumbURLs.push(url);
    const li = document.createElement("li");
    li.className = "photo-item";
    li.innerHTML = `
      <img src="${url}" alt="" class="photo-item__img">
      <div class="photo-item__text">
        <span class="photo-item__name">${esc(p.label || p.name)}</span>
        <span class="num">${placeText(p)}</span>
        <span>${p.taken_at ? `Taken ${formatWhen(p.taken_at)}` : "Time not saved"}</span>
      </div>`;
    li.querySelector("img").addEventListener("error", (e) => { e.target.replaceWith(Object.assign(document.createElement("span"), { className: "photo-item__img photo-item__img--none", textContent: "Photo" })); }, { once: true });
    list.appendChild(li);
  });
  $("[data-b-photos]").textContent = photos.length ? String(photos.length) : "None";
  $("[data-b-photos-none]").hidden = photos.length > 0;
}

/* ---------------------------------------------------------------- 5. preview and publish */

function currentStudy() {
  return {
    ...draft,
    id: "preview",
    notes: $("#notes").value.trim(),
    photos: photos.slice(),
    hidden: false, curated: false, example: false,
  };
}

function renderPreview() {
  cleanupPreview?.();
  cleanupPreview = renderStudy($("[data-preview]"), currentStudy(), { preview: true });
}

/** The upload is SIMULATED (Dwij, 5 Oct 2026): a short progress bar so the flow feels like the real thing,
 *  but nothing leaves the phone. Resolves when the bar is full. */
function simulateUpload(ms = 1800) {
  const box = $("[data-sim-progress]");
  const bar = $("[data-sim-bar]");
  const label = $("[data-sim-label]");
  box.hidden = false;
  bar.value = 0;
  label.textContent = "Uploading…";
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      bar.value = Math.round(p * 100);
      if (p < 1) { setTimeout(tick, 100); return; }
      label.textContent = "Uploaded";
      setTimeout(() => { box.hidden = true; resolve(); }, 250);
    };
    tick();
  });
}

async function onPublish() {
  if (!codeOk || !draft) { show("code"); return; }
  const btn = $("[data-publish]");
  const err = $("[data-publish-error]");
  const back = $('[data-step="preview"] [data-back]');
  btn.disabled = true;
  back.disabled = true;
  err.hidden = true;
  try {
    const { id: _ignore, ...study } = currentStudy();
    await simulateUpload();                 // uploads are simulated by design: nothing is sent anywhere
    const id = await publish(study);        // kept in this browser only, so the study can be looked at
    const link = $("[data-done-link]");
    link.href = `${ROUTES.study}?id=${encodeURIComponent(id)}&published=1`;
    $("[data-done-remove]").innerHTML = `Want it removed later? Email <a href="mailto:${TEAM_EMAIL}?subject=${encodeURIComponent(`Please remove study ${draft.code}`)}">${TEAM_EMAIL}</a> with your recording ID, <span class="num">${esc(draft.code)}</span>.`;
    $("[data-done-mock]").hidden = !MOCK;
    show("done");
    // (mascot removed) celebrate();
    // (mascot removed) say("done", "Published! Thank you for sharing.", "happy");
  } catch (e) {
    console.error(e);
    $("[data-sim-progress]").hidden = true;
    err.textContent = "That didn't publish. Press Publish again.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
    back.disabled = false;
  }
}

/* ---------------------------------------------------------------- dates, and the summary download */

/** "6 Oct 2026" — the date itself, never "Yesterday" (Dwij, 7 Oct 2026). */
function dateOnly(t) {
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** "19:38" — 24-hour clock. */
function time24(t) {
  return new Date(t).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** A plain-text summary of the study as it stands in the preview, saved to the phone. */
function downloadSummary() {
  if (!draft) return;
  const s = currentStudy();
  const lines = [
    "MycoKit study summary",
    "",
    `Recording ID: ${s.code}`,
    `Name shown: ${s.name || "(no name)"}`,
    `Recorded: ${dateOnly(s.started_at)}, ${time24(s.started_at)}`,
    `Length: ${formatDuration(s.length_s * 1000)}`,
    "",
    `Notes from the kit (${s.events.length || "none"}):`,
    ...s.events.map((e) => `  ${formatElapsed(e.at_s * 1000)}  ${e.kind}${e.probe ? ` (probe ${e.probe})` : ""}${e.text ? `: ${e.text}` : ""}`),
    "",
    "What you noticed:",
    `  ${s.notes || "(nothing written)"}`,
    "",
    `Photos (${s.photos.length || "none"}):`,
    ...s.photos.map((p) => `  ${p.name} — ${placeText(p)}${p.taken_at ? ` — taken ${dateOnly(p.taken_at)}, ${time24(p.taken_at)}` : ""}`),
    "",
  ];
  download(`${s.code}-summary.txt`, lines.join("\n"));
}
