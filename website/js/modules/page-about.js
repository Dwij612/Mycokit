// page-about.js — W5 About and reference: iNaturalist link, privacy, removing a study, clearing this browser.

import { INAT_URL, MOCK, TEAM_EMAIL, ROUTES } from "./config.js";
import { resetMock } from "./data.js";
import { confirmDialog } from "./ui.js";
// import { say } from "./mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)

export function initAbout() {
  document.querySelector("[data-inat]").href = INAT_URL;
  const mail = document.querySelector("[data-email]");
  mail.href = `mailto:${TEAM_EMAIL}?subject=${encodeURIComponent("Please remove my MycoKit study")}`;
  mail.textContent = `Email ${TEAM_EMAIL}`;
  // (the "Where it is kept" line went when uploads became simulated — the Privacy text now says nothing is uploaded)
  const where = document.querySelector("[data-where]");
  if (where) where.textContent = "in this browser, on this phone only.";

  if (MOCK) {
    const tools = document.querySelector("[data-mock-tools]");
    tools.hidden = false;
    tools.querySelector("[data-reset]").addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Clear what you've shared?",
        body: "Every study shared from this browser is removed, and the example studies come back.",
        confirm: "Clear", cancel: "Cancel", danger: true,
      });
      if (!ok) return;
      await resetMock();
      location.href = ROUTES.home;
    });
  }
  // (mascot removed) say("about", "Photos keep where they were taken. That's what makes them useful to the project.", "ready");
}
