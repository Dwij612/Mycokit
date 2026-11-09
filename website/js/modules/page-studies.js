// page-studies.js — W2 Browse studies (W-10), newest first.

import { listStudies } from "./data.js";
import { studyCard } from "./cards.js";
// import { say } from "./mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)

export async function initStudies() {
  const list = document.querySelector("[data-list]");
  try {
    const studies = await listStudies();
    list.innerHTML = "";
    studies.forEach((s) => list.appendChild(studyCard(s, 2).li));
    document.querySelector("[data-count]").textContent = `${studies.length} ${studies.length === 1 ? "study" : "studies"}.`;
    document.querySelector("[data-empty]").hidden = studies.length > 0;
    list.hidden = studies.length === 0;
  } catch (err) {
    console.error(err);
    list.innerHTML = '<li class="cards__loading">The studies didn\'t load. Reload the page to try again.</li>';
  }
  // (mascot removed) say("studies", "Tap a study to see its signal, photos and sheet music.", "ready");
}
