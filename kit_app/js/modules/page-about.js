// page-about.js — About the project (F-37, F-38), plus the demo reset.

import * as store from "./demo-store.js";
import { say } from "./mascot.js";
import { DEMO_MODE, ROUTES } from "./config.js";
import { confirmDialog } from "./ui.js";

export function initAbout() {
  say("about-intro", "This is what the project is about. Thanks for listening with me!", "happy");

  if (!DEMO_MODE) return;
  const tools = document.querySelector("[data-demo-tools]");
  tools.hidden = false;
  tools.querySelector("[data-reset]").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Reset the demo?",
      body: "Any recording started or saved during this session will be cleared.",
      confirm: "Reset", cancel: "Cancel", danger: true,
    });
    if (!ok) return;
    store.reset();
    try { localStorage.removeItem("fungikit.seenExplain"); localStorage.removeItem("fungikit.dismissed"); } catch { /* ignore */ }
    location.href = ROUTES.landing;
  });
}
