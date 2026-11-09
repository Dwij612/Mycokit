// main.js — one entry point for every page. Module scripts run after the document is parsed,
// so no DOMContentLoaded wrapper is needed. Each page is chosen by <body data-page="…">.

import { initShell } from "./modules/shell.js";
import { initMascot } from "./modules/mascot.js";
import { isMock } from "./modules/api.js";
import { MOCK, DEMO_MODE } from "./modules/config.js";

const PAGES = {
  landing:    () => import("./modules/landing.js").then((m) => m.initLanding()),
  live:       () => import("./modules/page-live.js").then((m) => m.initLive()),
  listen:     () => import("./modules/page-listen.js").then((m) => m.initListen()),
  recordings: () => import("./modules/page-recordings.js").then((m) => m.initRecordings()),
  recording:  () => import("./modules/page-recording.js").then((m) => m.initRecording()),
  upload:     () => import("./modules/page-upload.js").then((m) => m.initUpload()),
  help:       () => import("./modules/page-help.js").then((m) => m.initHelp()),
  about:      () => import("./modules/page-about.js").then((m) => m.initAbout()),
};

initShell();
initMascot();

const page = document.body.dataset.page;
(PAGES[page] || (() => Promise.resolve()))().catch((err) => {
  console.error("[MycoKit] page failed to start:", err);
});

if (DEMO_MODE) console.info("[MycoKit] DEMO build — no Pi, made-up data. Set DEMO_MODE = false in js/modules/config.js for the real kit.");
else if (isMock) console.info(`[MycoKit] mock kit: "${MOCK}". Add ?mock=off to talk to a real Pi.`);
