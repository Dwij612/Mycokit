// page-help.js — (website copy of the kit app's Help page) Digital tutorial (F-34 steps with a check each). Ticks are not saved: the tutorial is
// for doing the steps now, and the next person to use the kit should start from zero.

// import { say } from "./mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)
import { initAccordion } from "./accordion.js";

export function initHelp() {
  initAccordion();                       // topics open and close (Dwij, 5 Oct 2026)
  const checks = [...document.querySelectorAll("[data-step-check]")];
  const progress = document.querySelector("[data-progress]");

  const update = () => {
    const n = checks.filter((c) => c.checked).length;
    progress.textContent = `${n} of ${checks.length} done`;
    // (mascot removed) if (n === checks.length) say("help-done", "All five done. Join the kit's Wi-Fi and start a recording!", "happy");
  };
  checks.forEach((c) => c.addEventListener("change", update));
  update();

  // (mascot removed) say("help-intro", "Tick each step as you do it. The card in the box shows the same five.", "ready");
}
