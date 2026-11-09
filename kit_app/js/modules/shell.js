// shell.js — the parts every inner page shares: the navigation under the wordmark, the kit chip,
// the demo badge and the mascot dock. One source, so the pages can't drift apart (WCAG 3.2.3).

import { API, DEMO_MODE, ROUTES } from "./config.js";
import * as store from "./demo-store.js";

const NAV = [
  { page: "live",       href: ROUTES.live,       label: "Live" },
  { page: "listen",     href: ROUTES.listen,     label: "Listen" },
  { page: "recordings", href: ROUTES.recordings, label: "Recordings" },
  { page: "help",       href: ROUTES.tutorial,   label: "Help" },
];

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
    <p class="mascot__next" data-mascot-next hidden aria-hidden="true"></p>
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

  // demo badge — participants in a session should know the data is made up
  if (DEMO_MODE && header && !header.querySelector(".demo-badge")) {
    const wm = header.querySelector(".wordmark");
    wm?.insertAdjacentHTML("afterend", '<span class="demo-badge" title="Demo: no kit connected, made-up data">Demo</span>');
  }

  // "Demo data" captions under the graphs only belong to the demo
  if (!DEMO_MODE) document.querySelectorAll(".demo-note").forEach((n) => n.remove());

  // navigation, on every page. Sub-pages light up their parent tab.
  const PARENT = { recording: "recordings", upload: "recordings", about: "help" };
  const here = PARENT[page] || page;
  // 3 Oct 2026: the start screen gets the menu too, since Saved recordings now lives only there.
  // (Previously: every page except Landing.)
  if (page && header && !header.querySelector(".site-nav")) {
    const items = NAV.map((n) => {
      // the exact page gets aria-current="page"; a parent tab of a sub-page is only styled as current
      const attr = n.page === page ? ' aria-current="page"' : n.page === here ? ' data-current="true"' : "";
      return `
      <li><a class="site-nav__link" href="${n.href}"${attr}>${n.label}</a></li>`;
    }).join("");
    header.insertAdjacentHTML("beforeend", `<nav class="site-nav" aria-label="Main"><ul class="site-nav__list">${items}</ul></nav>`);
  }

  // kit chip: connected / recording / not connected. The start screen runs its own chip (landing.js).
  const chip = document.querySelector("[data-kit-chip]");
  const ownChip = chip && page !== "landing";
  const setChip = (state) => {
    if (!ownChip) return;
    chip.dataset.state = state;
    chip.querySelector("[data-kit-chip-text]").textContent =
      state === "recording" ? "Recording" : state === "offline" ? "Not connected" : "Kit connected";
  };
  if (DEMO_MODE) {
    setChip(store.getState().recording ? "recording" : "online");
  } else {
    const check = () => fetch(API.status, { cache: "no-store" })
      .then((r) => r.json()).then((s) => {
        setChip(s.recording ? "recording" : "online");
        // a kit server started with the fake ADC (testing without the hardware) says so on every page
        if (s.fake && header && !header.querySelector(".demo-badge")) {
          header.querySelector(".wordmark")?.insertAdjacentHTML("afterend",
            '<span class="demo-badge" title="Test kit: made-up signal, not a mushroom">Test</span>');
        }
      })
      .catch(() => setChip("offline"));
    check();
    if (ownChip) setInterval(check, 15000);
  }

  if (!document.querySelector("[data-mascot]")) document.body.insertAdjacentHTML("beforeend", MASCOT_HTML);
}
