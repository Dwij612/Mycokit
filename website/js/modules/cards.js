// cards.js — one study as a card in a list (Home, Studies).

import { ROUTES } from "./config.js";
import { formatDuration } from "./ui.js";
import { studyTitle, whenText, esc } from "./study-view.js";

const CHEVRON = '<svg class="rec-card__chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

/** Returns the <li> for one study, and the object URL it made (free it when the list goes). */
export function studyCard(s, level = 3) {
  const li = document.createElement("li");
  li.className = "study-card";
  const photo = s.photos?.[0];
  const url = photo ? URL.createObjectURL(photo.blob) : null;
  li.innerHTML = `
    <div class="study-card__thumb">${url ? `<img src="${url}" alt="" loading="lazy">` : `<span class="study-card__nophoto" aria-hidden="true">No photo</span>`}</div>
    <div class="study-card__body">
      <h${level} class="study-card__title"><a href="${ROUTES.study}?id=${encodeURIComponent(s.id)}">${esc(studyTitle(s))}</a></h${level}>
      <p class="study-card__meta">${whenText(s)} · ${formatDuration((s.length_s || 0) * 1000)}</p>
      <!-- session code, photo count, "notes" and the Example tag were taken off the card (Dwij, 5 Oct 2026: keep it clean) -->
    </div>
    ${CHEVRON}`;
  li.querySelector("img")?.addEventListener("error", (e) => { e.target.replaceWith(Object.assign(document.createElement("span"), { className: "study-card__nophoto", textContent: "Photo" })); }, { once: true });
  return { li, url };
}
