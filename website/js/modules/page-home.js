// page-home.js — W1 Home: the three latest studies.

import { listStudies } from "./data.js";
import { studyCard } from "./cards.js";
// import { say } from "./mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)

export async function initHome() {
  const list = document.querySelector("[data-latest]");
  try {
    const studies = (await listStudies()).slice(0, 3);
    list.innerHTML = "";
    studies.forEach((s) => list.appendChild(studyCard(s).li));
    if (!studies.length) list.innerHTML = '<li class="cards__loading">No studies yet.</li>';
  } catch (err) {
    console.error(err);
    list.innerHTML = '<li class="cards__loading">The studies didn\'t load. Reload the page to try again.</li>';
  }
  // (mascot removed) say("home", "Hello! Have a look at what people recorded, or share your own.", "ready");
}
