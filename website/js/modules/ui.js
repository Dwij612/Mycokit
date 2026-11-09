// ui.js — small helpers the pages share: formatting, the confirm dialog, downloads, dismissible notes.

import { STORAGE_KEYS } from "./config.js";
import { load, save } from "./storage-local.js";

export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function formatDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function formatWhen(t) {
  const d = new Date(t);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? "Today" : same(d, yest) ? "Yesterday"
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${time}`;
}

export function recordingTitle(r) {
  return r.name ? `${r.name}'s recording` : "Recording";
}

export function formatHours(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} minutes`;
  if (h < 10) return `${Math.round(h * 2) / 2} hours`.replace(".0", "");
  return `${Math.round(h)} hours`;
}

/** Confirm with a native <dialog>. Resolves true/false. Focus returns to the opener. */
export function confirmDialog({ title, body, confirm = "Yes", cancel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const d = document.createElement("dialog");
    d.className = "dialog";
    d.setAttribute("aria-labelledby", "dlg-title");
    d.innerHTML = `
      <h2 id="dlg-title" class="dialog__title">${title}</h2>
      <p class="dialog__body">${body}</p>
      <div class="dialog__actions">
        <button type="button" class="btn ${danger ? "btn--danger" : "btn--primary"}" value="yes">${confirm}</button>
        <button type="button" class="btn btn--quiet" value="no">${cancel}</button>
      </div>`;
    document.body.appendChild(d);
    const done = (v) => { d.close(); d.remove(); opener?.focus?.(); resolve(v); };
    d.querySelector('[value="yes"]').addEventListener("click", () => done(true));
    d.querySelector('[value="no"]').addEventListener("click", () => done(false));
    d.addEventListener("cancel", (e) => { e.preventDefault(); done(false); });
    d.showModal();
    d.querySelector('[value="no"]').focus();      // the safe choice gets focus
  });
}

export function download(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A note the user can close for good (e.g. "You can close this page"). */
export function dismissible(node, id) {
  if (!node) return;
  const gone = (load(STORAGE_KEYS.notes, "") || "").split(",");
  if (gone.includes(id)) { node.hidden = true; return; }
  node.querySelector("[data-dismiss]")?.addEventListener("click", () => {
    node.hidden = true;
    save(STORAGE_KEYS.notes, [...gone.filter(Boolean), id].join(","));
  });
}

export const params = new URLSearchParams(location.search);
