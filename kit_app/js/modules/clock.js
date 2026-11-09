// clock.js — F-03. The Pi has no clock battery; every phone that connects hands it the right time.
// Silent by design: the user never sees this unless it matters.

import { sendClock } from "./api.js";

let done = false;

export async function syncClockOnce() {
  if (done) return;
  done = true;
  try {
    const r = await sendClock();
    console.info("[MycoKit] clock sync:", r && r.outcome);
  } catch (err) {
    done = false;                       // try again on the next successful status poll
    console.warn("[MycoKit] clock sync failed:", err.message);
  }
}
