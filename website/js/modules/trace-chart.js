// trace-chart.js — (shared with the kit app, Final_UI/js/modules/trace-chart.js; here every lane fits its own data)
// four probe lanes, stacked, as in the Figma frame: a white card per probe on a navy panel,
// a line plus a soft band of its recent range. SVG, so it stays sharp at any phone size.
// Each lane is named ("Probe 1") — the colour is identity, never the only cue (WCAG 1.4.1).
// Numbers are hidden by default and shown by the raw-values toggle (F-10).
//
// Two ways to scale a lane:
//   fixed — the demo's made-up signal: one fixed range, so the lines don't jump as data arrives
//   auto  — the real kit (5 Oct 2026): each probe sits at its own offset (tens of mV apart, electrode chemistry,
//           not fungi), and the signal is the change, so each lane fits its own data. Never tighter than
//           MIN_SPAN, so plain noise is not blown up to fill the lane.


const Y_MIN = 0.70, Y_MAX = 1.05;            // mV, the fixed (demo) range
const MIN_SPAN = 0.5;                        // mV, the smallest range an auto lane will show
const W = 300, H = 60;                       // viewBox; stretched to the lane's real size

export function createChart(container, { label = "Probe signals", compact = false, auto = true } = {}) {
  container.classList.add("trace");
  if (compact) container.classList.add("trace--compact");
  container.innerHTML = `
    <div class="trace__lanes" role="img" aria-label="${label}">
      ${[1, 2, 3, 4].map((p) => `
        <div class="lane" style="--line: var(--probe-${p}-line); --band: var(--probe-${p})">
          <div class="lane__head">
            <span class="lane__name"><span class="lane__swatch" aria-hidden="true"></span>Probe ${p}</span>
            <span class="lane__value num" data-value hidden>—</span>
          </div>
          <div class="lane__plot">
            <span class="lane__tick lane__tick--top num" data-tick aria-hidden="true" hidden>1.00 mV</span>
            <span class="lane__tick lane__tick--bottom num" data-tick aria-hidden="true" hidden>0.75 mV</span>
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
              <line class="lane__grid" x1="0" x2="${W}" y1="${gridY(0)}" y2="${gridY(0)}" />
              <line class="lane__grid" x1="0" x2="${W}" y1="${gridY(1)}" y2="${gridY(1)}" />
              <path class="lane__band" d="" />
              <polyline class="lane__line" points="" />
            </svg>
          </div>
        </div>`).join("")}
      <div class="trace__overlay" aria-hidden="true" data-overlay></div>
    </div>`;

  const lanes = [...container.querySelectorAll(".lane")];
  const overlay = container.querySelector("[data-overlay]");
  let span = { t0: 0, t1: 1 };

  /**
   * series: four arrays of evenly spaced values covering a0..a1. The axis runs t0..t1, so a line can
   * grow from the left of a fixed window (a0 = t0, a1 < t1). Defaults: the data fills the axis.
   */
  function setData(series, t0, t1, a0 = t0, a1 = t1) {
    span = { t0, t1 };
    const xOf = (k, n) => (((a0 + ((a1 - a0) * k) / (n - 1 || 1)) - t0) / (t1 - t0 || 1)) * W;
    series.forEach((vals, i) => {
      const lane = lanes[i];
      const n = vals.length;
      if (!n) return;
      const sc = scaleFor(vals);
      const yv = (v) => yIn(v, sc).toFixed(1);
      const pad = (sc.hi - sc.lo) * 0.034;          // the band's soft edge, in mV
      const pts = vals.map((v, k) => `${xOf(k, n).toFixed(1)},${yv(v)}`).join(" ");
      lane.querySelector(".lane__line").setAttribute("points", pts);
      // band: rolling min/max over a few samples — the soft halo in the Figma frame
      const k = Math.max(2, Math.round(n / 40));
      const hi = [], lo = [];
      for (let j = 0; j < n; j++) {
        const win = vals.slice(Math.max(0, j - k), Math.min(n, j + k + 1));
        const x = xOf(j, n).toFixed(1);
        hi.push(`${x},${yv(Math.max(...win) + pad)}`);
        lo.unshift(`${x},${yv(Math.min(...win) - pad)}`);
      }
      lane.querySelector(".lane__band").setAttribute("d", `M${hi.join("L")}L${lo.join("L")}Z`);
      lane.querySelector("[data-value]").textContent = `${vals[n - 1].toFixed(3)} mV`;
      const ticks = lane.querySelectorAll("[data-tick]");
      ticks[0].textContent = `${gridValue(sc, 0).toFixed(2)} mV`;
      ticks[1].textContent = `${gridValue(sc, 1).toFixed(2)} mV`;
    });
  }

  // the range a lane shows: fixed for the demo, fitted to its own data on the real kit
  function scaleFor(vals) {
    if (!auto) return { lo: Y_MIN, hi: Y_MAX };
    let lo = Infinity, hi = -Infinity;
    for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const mid = (lo + hi) / 2;
    const half = Math.max(MIN_SPAN, (hi - lo) * 1.2) / 2;
    return { lo: mid - half, hi: mid + half };
  }

  /**
   * Events on the timeline (times are ms into the recording, like setData's span).
   *   marker — "I did it": a yellow dashed line across all lanes, with its label
   *   note   — research note: a purple line with a numbered flag
   *   alert  — unusual activity on one probe: a red notch at the top of that probe's lane
   */
  function setEvents(events = []) {
    overlay.querySelectorAll(".marker").forEach((m) => m.remove());
    container.querySelectorAll(".alert-tick").forEach((m) => m.remove());
    let noteN = 0;
    const flagXs = [];                      // stagger flags that would overlap
    for (const e of [...events].sort((a, b) => a.at - b.at)) {
      if (e.kind === "note") noteN += 1;
      const f = (e.at - span.t0) / (span.t1 - span.t0);
      if (f < 0 || f > 1) continue;
      const left = `${(f * 100).toFixed(2)}%`;
      if (e.kind === "alert") {
        const plot = lanes[(e.probe || 1) - 1]?.querySelector(".lane__plot");
        plot?.insertAdjacentHTML("beforeend", `<span class="alert-tick" style="left:${left}" title="${escapeHTML(e.label)}" aria-hidden="true"></span>`);
        continue;
      }
      const edge = f > 0.7 ? " marker--end" : f < 0.3 ? " marker--start" : "";
      const near = flagXs.filter((x) => Math.abs(x - f) < 0.16).length;
      flagXs.push(f);
      const row = near % 3;                 // up to three rows of flags, then they repeat
      const flag = e.kind === "note" ? `Note ${noteN}` : escapeHTML(e.label || "You");
      overlay.insertAdjacentHTML("beforeend",
        `<span class="marker marker--${e.kind}${edge}" style="left:${left}"><span class="marker__flag" style="--row:${row}">${flag}</span></span>`);
    }
  }
  // kept for the earlier callers: markers only
  const setMarkers = (markers = []) => setEvents(markers.map((m) => ({ kind: "marker", ...m })));

  function setPlayhead(fraction) {
    let ph = overlay.querySelector(".playhead");
    if (fraction === null || fraction === undefined) { ph?.remove(); return; }
    if (!ph) { overlay.insertAdjacentHTML("beforeend", '<span class="playhead"></span>'); ph = overlay.querySelector(".playhead"); }
    ph.style.left = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  function setShowValues(on) {
    container.querySelectorAll("[data-value], [data-tick]").forEach((n) => { n.hidden = !on; });
  }

  return { setData, setEvents, setMarkers, setPlayhead, setShowValues };
}

// grid lines sit at fixed heights; their labels say what value that height is in this lane
const GRID = [0.2, 0.8];                      // fraction of the lane height, from the top
const gridY = (g) => GRID[g] * H;
const gridValue = (sc, g) => sc.hi - GRID[g] * (sc.hi - sc.lo);

function yIn(v, { lo, hi }) {
  const f = (v - lo) / (hi - lo || 1);
  return H - Math.max(0, Math.min(1, f)) * H;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
