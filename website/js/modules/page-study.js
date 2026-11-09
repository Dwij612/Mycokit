// page-study.js — W2a Study page.

import { getStudy } from "./data.js";
import { renderStudy, studyTitle } from "./study-view.js";
// import { say } from "./mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)
import { params } from "./ui.js";

export async function initStudy() {
  const root = document.querySelector("[data-study]");
  const s = await getStudy(params.get("id") || "").catch(() => null);
  if (!s || s.hidden) {
    root.hidden = true;
    document.querySelector("[data-missing]").hidden = false;
    // (mascot removed) say("study-missing", "I can't find that study.", "alert");
    return;
  }
  document.title = `${studyTitle(s)} — The Underground Brain Project`;
  renderStudy(root, s);
  // (mascot removed) if (params.get("published") === "1") say("published", "It's up! This is your study.", "happy");
  // (mascot removed) else if (s.csv) say("study", "Try Make sheet music — it writes the signal out as notes.", "ready");
  // (mascot removed) else say("study", "Have a look at the photos — each one knows where it was taken.", "ready");
}
