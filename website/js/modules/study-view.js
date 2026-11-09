// study-view.js — draws one study (W2a). Used by the study page and by the upload preview (W-06), so the
// preview is exactly the page others will see.

import { createChart } from "./trace-chart.js";
import { setupListen } from "./listen.js";
import { parseCSV, bucket } from "./bundle.js";
import { placeText, mapLink, hasPlace } from "./photos.js";
import { notesFor, toABC, describe, SETTINGS } from "./score.js";
import { TEAM_EMAIL } from "./config.js";
import { formatWhen, formatDuration, download } from "./ui.js";

const KIND = { marker: "You tried", note: "Note", alert: "Unusual" };
export const studyTitle = (s) => s.title || (s.name ? `${s.name}'s study` : "A study");

/** When it was recorded. Some examples only know the day (the Pi's clock wasn't set). */
export const whenText = (s) => (s.date_only
  ? new Date(s.started_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
  : formatWhen(s.started_at));

/** Draws study `s` into `root`. Returns a cleanup function (frees photo URLs). */
export function renderStudy(root, s, { preview = false } = {}) {
  const data = s.csv ? parseCSV(s.csv) : null;
  const noData = !data || data.t.length < 2;
  const urls = [];
  const lenMs = (s.length_s || 0) * 1000;
  const photoCount = (s.photos || []).length;
  const located = (s.photos || []).find(hasPlace);
  let stopListen = null;

  root.innerHTML = `
    <section class="panel" aria-labelledby="st-title">
      <p class="eyebrow">Study</p>  <!-- the Example tag was taken off (Dwij, 5 Oct 2026) -->
      <h1 id="st-title" class="panel__title">${esc(studyTitle(s))}</h1>
      <dl class="facts">
        <div><dt>Recorded</dt><dd>${whenText(s)}</dd></div>
        <div><dt>Length</dt><dd>${formatDuration(lenMs)}</dd></div>
        <div><dt>Recording ID</dt><dd class="num">${esc(s.code)}</dd></div>
        <div><dt>Where</dt><dd>${located ? `<a href="${mapLink(located)}" target="_blank" rel="noopener">${placeText(located)}</a>` : "Not recorded"}</dd></div>
      </dl>
      ${s.curated ? '<p class="tag tag--inat">Chosen for the project\'s iNaturalist page</p>' : ""}
    </section>

    <section class="panel" aria-labelledby="st-signal">
      <h2 id="st-signal" class="panel__h2">The signal</h2>
      ${noData ? `<p class="note note--plain">${esc(s.csv_missing_note || "This study has no data file.")}</p>` : "<div data-chart></div>"}
      <p class="trace__legend"${noData ? " hidden" : ""}>The whole recording, start on the left. Each probe has its own scale. Yellow lines are "I did it" markers, purple are notes, red notches are unusual moments.</p>
      ${s.events?.length ? `
      <details class="explain">
        <summary>Timeline <span class="timeline__count">${s.events.length}</span></summary>
        <ol class="timeline__list explain__body">${[...s.events].sort((a, b) => a.at_s - b.at_s).map((e) => `
          <li class="tl tl--${e.kind}"><span class="tl__time num">${hms(e.at_s)}</span><span class="tl__kind">${KIND[e.kind] || e.kind}</span><span class="tl__text">${esc(e.text)}</span></li>`).join("")}
        </ol>
      </details>` : ""}
    </section>

    <section class="panel" aria-labelledby="st-listen"${noData ? " hidden" : ""}>
      <h2 id="st-listen" class="panel__h2">Listen</h2>
      <p>The signal as sound: each probe is its own voice, and higher activity plays higher notes. The purple line on the graph above follows along.</p>
      <fieldset class="choice choice--inline">
        <legend class="field__label">Speed</legend>
        <div class="choice__row" data-listen-speeds></div>
      </fieldset>
      <fieldset class="choice choice--inline">
        <legend class="field__label">Probes to hear</legend>
        ${[1, 2, 3, 4].map((p) => `<label><input type="checkbox" name="listen-probe-${s.id}" value="${p}" checked> Probe ${p}</label>`).join("")}
      </fieldset>
      <div class="listen-bar">
        <button class="btn btn--primary" type="button" data-listen-play aria-pressed="false">Play</button>
        <span class="num listen-bar__clock" data-listen-clock>0:00 / 0:00</span>
        <button class="btn btn--outline btn--small" type="button" data-listen-test>Test sound</button>
      </div>
      <p class="field__hint" data-listen-hint hidden role="status">No sound? Check your phone isn't on silent and the volume is up, then tap Test sound.</p>
    </section>

    <section class="panel" aria-labelledby="st-photos">
      <h2 id="st-photos" class="panel__h2">Photos</h2>
      ${photoCount ? `<div class="photos" data-photos></div>` : "<p>No photos with this study.</p>"}
    </section>

    <section class="panel" aria-labelledby="st-notes">
      <h2 id="st-notes" class="panel__h2">What they noticed</h2>
      ${s.notes?.trim() ? `<p class="study-notes">${esc(s.notes)}</p>` : "<p>No notes with this study.</p>"}
    </section>

    <section class="panel" aria-labelledby="st-score"${noData ? " hidden" : ""}>
      <h2 id="st-score" class="panel__h2">Sheet music</h2>
      <p>The signal written as music: one note for each minute of the recording, higher notes for higher activity. One probe at a time.</p>
      <fieldset class="choice choice--inline">
        <legend class="field__label">Probe</legend>
        ${[1, 2, 3, 4].map((p) => `<label><input type="radio" name="score-probe-${s.id}" value="${p}"${p === 1 ? " checked" : ""}> Probe ${p}</label>`).join("")}
      </fieldset>
      <button class="btn btn--secondary" type="button" data-make-score>Make sheet music</button>
      <p class="field__hint" data-score-status aria-live="polite"></p>
      <div class="score" data-score hidden>
        <div class="score__sheet" data-score-sheet></div>
        <div class="btn-row">
          <button class="btn btn--outline btn--small" type="button" data-score-midi>Download MIDI</button>
          <button class="btn btn--outline btn--small" type="button" data-score-print>Print or save as PDF</button>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="st-data">
      <h2 id="st-data" class="panel__h2">The data</h2>
      <p>The kit's readings, one row a second: time, seconds into the recording, and the four probes in millivolts.</p>
      ${noData ? "<p>Not on the website yet.</p>" : '<button class="btn btn--outline btn--small" type="button" data-csv>Download CSV</button>'}
      ${preview ? "" : `<p class="field__hint study__remove">Is this your study and you'd like it removed? <a href="mailto:${TEAM_EMAIL}?subject=${encodeURIComponent(`Please remove study ${s.code}`)}">Email the team</a> with its recording ID.</p>`}
    </section>`;

  // the signal
  if (!noData) {
    const chart = createChart(root.querySelector("[data-chart]"), { label: `Signal from four probes, the whole recording of ${studyTitle(s)}`, compact: true });
    const t0 = data.t[0], t1 = data.t[data.t.length - 1];
    chart.setData(bucket(data, 240), t0 * 1000, t1 * 1000);
    chart.setEvents((s.events || []).map((e) => ({ kind: e.kind, at: e.at_s * 1000, label: e.text, probe: e.probe })));
    stopListen = setupListen(root, data, chart, s.id);
  }

  // photos: the original files, with what their metadata says
  const box = root.querySelector("[data-photos]");
  (s.photos || []).forEach((p, i) => {
    const url = URL.createObjectURL(p.blob);
    urls.push(url);
    const fig = document.createElement("figure");
    fig.className = "photo";
    fig.innerHTML = `
      <img src="${url}" alt="Photo ${i + 1} of ${photoCount}${p.label ? `: ${esc(p.label)}` : ""}${p.taken_at ? `, taken ${formatWhen(p.taken_at)}` : ""}" loading="lazy">
      <figcaption>
        <span>${p.taken_at ? `Taken ${formatWhen(p.taken_at)}` : "Time not recorded"}${p.make || p.model ? ` · ${esc([p.make, p.model].filter(Boolean).join(" "))}` : ""}</span>
        ${hasPlace(p) ? `<a href="${mapLink(p)}" target="_blank" rel="noopener" class="num">${placeText(p)}</a>` : `<span>${placeText(p)}</span>`}
        ${preview ? "" : `<a href="${url}" download="${esc(p.name)}">Original file</a>`}
      </figcaption>`;
    fig.querySelector("img").addEventListener("error", (e) => {
      // HEIC photos only display in Safari; the file and its metadata are still there
      e.target.replaceWith(Object.assign(document.createElement("div"), { className: "photo__nopreview", textContent: `${p.name} — this browser can't show this photo type, but it is kept as taken.` }));
    }, { once: true });
    box?.appendChild(fig);
  });

  // data
  root.querySelector("[data-csv]")?.addEventListener("click", () => download(`${s.code}.csv`, s.csv, "text/csv"));

  // sheet music
  if (!noData) setupScore(root, s, data);

  return () => { stopListen?.(); urls.forEach((u) => URL.revokeObjectURL(u)); };
}

/* ---------------------------------------------------------------- sheet music */

let abcjsReady = null;
function loadAbcjs() {
  abcjsReady ||= new Promise((resolve, reject) => {
    if (window.ABCJS) return resolve(window.ABCJS);
    const sc = Object.assign(document.createElement("script"), { src: "vendor/abcjs-basic-min.js" });
    sc.onload = () => resolve(window.ABCJS);
    sc.onerror = () => { abcjsReady = null; reject(new Error("abcjs did not load")); };
    document.head.appendChild(sc);
  });
  return abcjsReady;
}

function setupScore(root, s, data) {
  const btn = root.querySelector("[data-make-score]");
  const status = root.querySelector("[data-score-status]");
  const out = root.querySelector("[data-score]");
  const sheet = root.querySelector("[data-score-sheet]");
  let tune = null, probe = 1, printABC = null;

  btn.addEventListener("click", async () => {
    probe = Number(root.querySelector(`input[name="score-probe-${s.id}"]:checked`)?.value || 1);
    if (!data || data.t.length < 2) { status.textContent = "This study has no readings to write out."; return; }
    btn.disabled = true;
    status.textContent = "Writing it out…";
    try {
      const ABCJS = await loadAbcjs();
      const notes = notesFor(data.v[probe - 1], data.t);
      if (!notes) { status.textContent = "This recording is too short for sheet music — it needs at least 4 minutes."; out.hidden = true; return; }
      const heading = { title: `${studyTitle(s)} · probe ${probe}`, subtitle: `${s.code} · ${new Date(s.started_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` };
      // bars per line follow the space: one on a phone, so the notes stay readable; four on paper
      const w = sheet.clientWidth || 340;
      const perLine = w < 520 ? 1 : w < 900 ? 2 : 4;
      out.hidden = false;
      tune = ABCJS.renderAbc(sheet, toABC(notes, heading, { ...SETTINGS, barsPerLine: perLine }), { responsive: "resize", add_classes: true, paddingleft: 0, paddingright: 0 })[0];
      printABC = toABC(notes, heading, { ...SETTINGS, barsPerLine: 4 });
      const d = describe(notes);
      const playLen = d.seconds < 90 ? `${d.seconds} seconds` : `${Math.round(d.seconds / 60)} minutes`;
      status.textContent = `Probe ${probe}: ${d.notes} notes in ${d.bars} bars — about ${playLen} of music for ${formatDuration(d.minutes * 60000)} of recording.`;
      sheet.setAttribute("role", "img");
      sheet.setAttribute("aria-label", `Sheet music for probe ${probe}: ${d.notes} notes, grand staff.`);
    } catch (err) {
      console.error(err);
      status.textContent = "The sheet music didn't load. Check your internet connection and try again.";
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector("[data-score-midi]").addEventListener("click", () => {
    if (!tune || !window.ABCJS) return;
    const bytes = window.ABCJS.synth.getMidiFile(tune, { midiOutputType: "binary" });
    const arr = Array.isArray(bytes) ? bytes[0] : bytes;
    const url = URL.createObjectURL(new Blob([arr], { type: "audio/midi" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${s.code}-probe${probe}.mid` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  root.querySelector("[data-score-print]").addEventListener("click", () => {
    if (!printABC || !window.ABCJS) return;
    // laid out again for A4, four bars a line, in a window of its own
    const tmp = Object.assign(document.createElement("div"), { style: "position:absolute;left:-9999px;width:720px" });
    document.body.appendChild(tmp);
    window.ABCJS.renderAbc(tmp, printABC, { staffwidth: 700, add_classes: true });
    const svg = tmp.querySelector("svg")?.outerHTML || "";
    tmp.remove();
    const w = window.open("", "_blank");
    if (!w) { status.textContent = "Your browser blocked the print window. Allow pop-ups for this site and try again."; return; }
    w.document.write(`<!doctype html><title>${esc(studyTitle(s))} · probe ${probe}</title>
      <style>body{margin:0;font-family:system-ui,sans-serif} svg{width:100%;height:auto} @page{size:A4;margin:12mm}</style>
      ${svg}<script>window.onload=()=>{window.print()}<\/script>`);
    w.document.close();
  });
}

/* ---------------------------------------------------------------- helpers */

function hms(sec) {
  const s = Math.max(0, Math.floor(sec));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
}

export const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
