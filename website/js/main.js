// main.js — one entry point for every page of the website, chosen by <body data-page="…">.

import { initShell } from "./modules/shell.js";
// import { initMascot } from "./modules/mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)
import { MOCK } from "./modules/config.js";

const PAGES = {
  home:    () => import("./modules/page-home.js").then((m) => m.initHome()),
  studies: () => import("./modules/page-studies.js").then((m) => m.initStudies()),
  study:   () => import("./modules/page-study.js").then((m) => m.initStudy()),
  upload:  () => import("./modules/page-upload.js").then((m) => m.initUpload()),
  help:    () => import("./modules/page-help.js").then((m) => m.initHelp()),
  about:   () => import("./modules/page-about.js").then((m) => m.initAbout()),
  team:    () => import("./modules/page-team.js").then((m) => m.initTeam()),
};

initShell();
// initMascot();

const page = document.body.dataset.page;
(PAGES[page] || (() => Promise.resolve()))().catch((err) => console.error("[MycoKit website] page failed to start:", err));

if (MOCK) console.info("[MycoKit website] Uploads are simulated: nothing is sent anywhere; shared studies stay in this browser.");
