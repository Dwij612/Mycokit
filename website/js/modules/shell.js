// shell.js — what every page of the website shares: the navigation and the simulation badge.
// The mushroom dock was removed from the website (Dwij, 5 Oct 2026); its markup is kept below, unused.
// (The kit app's shell.js, cut down: there is no kit to connect to here.)

import { MOCK, ROUTES } from "./config.js";

const NAV = [
  { page: "studies", href: ROUTES.studies,  label: "Studies" },
  { page: "upload",  href: ROUTES.upload,   label: "Upload" },
  { page: "help",    href: ROUTES.tutorial, label: "Help" },
  { page: "about",   href: ROUTES.about,    label: "About" },
];
const PARENT = { study: "studies", team: "about" };

const MASCOT_HTML = `
  <aside class="mascot" data-mascot aria-label="Mushroom helper">
    <p class="visually-hidden" data-mascot-announce aria-live="polite"></p>
    <div class="mascot__bubble" data-mascot-bubble hidden>
      <p class="mascot__text" data-mascot-text></p>
      <div class="mascot__actions" data-mascot-actions hidden></div>
      <button class="mascot__close" type="button" data-mascot-close aria-label="Hide this message">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>
      </button>
    </div>
    <div class="mascot__body">
      <span class="mascot__burst" data-mascot-burst aria-hidden="true"></span>
      <button class="mascot__face" type="button" data-mascot-face aria-label="Show the mushroom's message">
        <img src="assets/mascot/ready.png" alt="" width="256" height="256" data-mascot-img>
      </button>
      <button class="mascot__mute" type="button" data-mascot-mute aria-pressed="false">
        <span class="visually-hidden" data-mascot-mute-label>Mute the mushroom</span>
        <svg class="mascot__mute-on" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 5.5c1 .8 1 4.2 0 5M13 4c2 1.6 2 6.4 0 8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        <svg class="mascot__mute-off" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.6"/></svg>
      </button>
    </div>
  </aside>`;

export function initShell() {
  const page = document.body.dataset.page;
  const header = document.querySelector(".site-header");

  if (MOCK && header && !header.querySelector(".demo-badge")) {
    header.querySelector(".wordmark")?.insertAdjacentHTML("afterend",
      '<span class="demo-badge" title="Uploads are simulated: nothing is sent anywhere">Simulation</span>');
  }

  const here = PARENT[page] || page;
  if (header && !header.querySelector(".site-nav")) {
    const items = NAV.map((n) => {
      const attr = n.page === page ? ' aria-current="page"' : n.page === here ? ' data-current="true"' : "";
      return `<li><a class="site-nav__link" href="${n.href}"${attr}>${n.label}</a></li>`;
    }).join("");
    header.insertAdjacentHTML("beforeend", `<nav class="site-nav" aria-label="Main"><ul class="site-nav__list">${items}</ul></nav>`);
  }

  // if (!document.querySelector("[data-mascot]")) document.body.insertAdjacentHTML("beforeend", MASCOT_HTML);   // mascot removed
}
