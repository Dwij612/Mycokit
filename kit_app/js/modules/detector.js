// detector.js — unusual-activity detection, ported from the earlier live dashboard
// (FungiKit_Pi_Web/index.html, "LIVE SPIKE CLICKS", verified by verify/verify_live_detector.js).
//
// Same idea, same maths:
//   - each probe is judged against its OWN recent baseline, because a fixed mV threshold either fires
//     on the drift all the time or never;
//   - the baseline is a median and a MAD (median absolute deviation, × 1.4826 ≈ one standard deviation),
//     so a spike doesn't drag its own baseline up;
//   - a GUARD of a few samples sits between the baseline window and the sample judged, so a spike's
//     rising edge isn't part of what it is measured against.
// Stricter than the click version for alerts: a higher sigma, and a minimum gap per probe (config.js).

import { ALERTS } from "./config.js";

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function createDetector({ sigma, minGapMs = ALERTS.minGapMs } = {}) {
  const hist = [[], [], [], []];                 // recent samples per probe
  const lastAlertAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  let k = sigma;

  /**
   * Feed one sample per probe at `at` ms into the recording.
   * Returns the probes that crossed: [{ probe, z, dir }].
   */
  function push(at, values, enabled = [true, true, true, true]) {
    const hits = [];
    values.forEach((v, i) => {
      const h = hist[i];
      h.push(v);
      const need = ALERTS.baselineN + ALERTS.guardN + 1;
      if (h.length > need) h.shift();
      if (h.length < need) return;
      const base = h.slice(0, ALERTS.baselineN);
      const med = median(base);
      const mad = median(base.map((x) => Math.abs(x - med))) * 1.4826 || 1e-6;
      const z = (v - med) / mad;
      if (Math.abs(z) >= k && enabled[i] && at - lastAlertAt[i] >= minGapMs) {
        lastAlertAt[i] = at;
        hits.push({ probe: i + 1, z, dir: z > 0 ? "up" : "down" });
      }
    });
    return hits;
  }

  return { push, setSigma: (s) => { k = s; } };
}
