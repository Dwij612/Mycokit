// bundle.js — reading what the kit hands over, and the CSV inside it.
//
// The kit's "Prepare upload" saves one JSON file (fungikit_kit.py → /api/recordings/<id>/bundle):
//   { format: "fungikit-bundle/1", session_code, name, started_at, length_s, events: [...], kit, csv, photos_taken }
// The kit app's demo saves "fungikit-bundle/demo-1" with the same fields; it is accepted and marked as demo data.
//
// 28 Oct 2026 (Dwij, after the summative test): the photos are taken in the kit app and come INSIDE the bundle:
//   photos: [{ slot: "mushroom" | "setup", label, type: "image/jpeg", width, height, taken_at,
//              location: { lat, lon, simulated: true }, data: "data:image/jpeg;base64,…" }]
// so the website has no photo step. The location is simulated: the kit app runs over plain http, where phones
// don't share their location (see the kit app's config.js). Bundles without photos still work.

import { PHOTO_MAX } from "./config.js";

const FORMATS = ["fungikit-bundle/1", "fungikit-bundle/demo-1"];
const MAX_MB = 60;

/** Reads a bundle file. Resolves to { ok: true, bundle } or { ok: false, why } with a plain-words reason. */
export async function readBundle(file) {
  if (!file) return { ok: false, why: "No file was chosen." };
  if (file.size > MAX_MB * 1024 * 1024) return { ok: false, why: `That file is over ${MAX_MB} MB, too big to be a MycoKit bundle.` };
  let b;
  try {
    b = JSON.parse(await file.text());
  } catch {
    return { ok: false, why: "That file is not a MycoKit bundle. Look for the file ending in .mycokit.json in your downloads." };
  }
  if (!b || !FORMATS.includes(b.format)) {
    return { ok: false, why: "That file is not a MycoKit bundle. Look for the file ending in .mycokit.json in your downloads." };
  }
  if (!b.session_code || typeof b.csv !== "string") return { ok: false, why: "That bundle is incomplete — it has no session code or no data. Make it again on the kit." };
  const data = parseCSV(b.csv);
  if (!data || data.t.length < 2) return { ok: false, why: "That bundle has no readings in it. Make it again on the kit." };
  return {
    ok: true,
    bundle: {
      code: String(b.session_code).slice(0, 16),
      name: b.name ? String(b.name).slice(0, 24) : null,
      started_at: b.started_at || new Date().toISOString(),
      length_s: Number(b.length_s) || data.t[data.t.length - 1],
      events: Array.isArray(b.events) ? b.events.map(cleanEvent).filter(Boolean) : [],
      csv: b.csv,
      demo: b.format.includes("demo"),
      endReason: b.end_reason || null,
      photos: Array.isArray(b.photos) ? b.photos.map((p, i) => photoFrom(p, i, b.session_code)).filter(Boolean).slice(0, PHOTO_MAX) : [],
    },
    data,
  };
}

/** One photo from the bundle → the website's photo shape ({ id, name, type, blob, lat, lon, … }), or null. */
function photoFrom(p, i, code) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(p?.data || ""));
  if (!m) return null;
  let bytes;
  try { bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch { return null; }
  const lat = Number(p.location?.lat), lon = Number(p.location?.lon);
  const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
  const slot = ["mushroom", "setup"].includes(p.slot) ? p.slot : `photo-${i + 1}`;
  return {
    id: `p-${Date.now().toString(36)}-${i}`,
    name: `${String(code || "photo").slice(0, 16)}-${slot}.${ext}`,
    label: p.label ? String(p.label).slice(0, 80) : null,
    type: m[1],
    blob: new Blob([bytes], { type: m[1] }),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    alt: null,
    simulated: Boolean(p.location?.simulated),
    taken_at: p.taken_at && !isNaN(Date.parse(p.taken_at)) ? new Date(p.taken_at).toISOString() : null,
    make: null,
    model: null,
  };
}

function cleanEvent(e) {
  if (!e || !["marker", "note", "alert"].includes(e.kind)) return null;
  return { kind: e.kind, at_s: Number(e.at_s) || 0, wall: e.wall || null, text: String(e.text || "").slice(0, 500), probe: e.probe ?? null };
}

/**
 * The kit's CSV → { t: seconds into the recording, v: four arrays of mV }.
 * Understands the kit's columns (Time,Elapsed_s,AIN0_mV…), the kit demo's (seconds,time_iso,probe_1_mV…),
 * and the older logger's (Time,AIN0_mV… with no elapsed column, which is worked out from Time).
 */
export function parseCSV(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const head = lines[0].split(",").map((h) => h.trim());
  const lower = head.map((h) => h.toLowerCase());
  let tCol = lower.findIndex((h) => h === "elapsed_s" || h === "seconds");
  const timeCol = lower.findIndex((h) => h === "time" || h === "time_iso");
  const vCols = head.map((h, i) => (/ain\d|probe_\d|adc\d/i.test(h) ? i : -1)).filter((i) => i >= 0).slice(0, 4);
  if (vCols.length === 0) return null;
  const t = [], v = vCols.map(() => []);
  let t0 = null;
  for (let k = 1; k < lines.length; k++) {
    const p = lines[k].split(",");
    let ts;
    if (tCol >= 0) ts = Number(p[tCol]);
    else if (timeCol >= 0) { const ms = Date.parse(p[timeCol]); if (t0 === null) t0 = ms; ts = (ms - t0) / 1000; }
    else ts = k - 1;
    if (!Number.isFinite(ts)) continue;
    const vals = vCols.map((c) => Number(p[c]));
    if (vals.some((x) => !Number.isFinite(x))) continue;
    t.push(ts);
    vals.forEach((x, i) => v[i].push(x));
  }
  while (v.length < 4) v.push(v[0].map(() => 0));
  return { t, v };
}

/** n evenly spaced points per probe over the whole recording (bucket means; gaps carried forward). */
export function bucket({ t, v }, n, a0 = t[0], a1 = t[t.length - 1]) {
  const sums = v.map(() => new Array(n).fill(0)), cnt = new Array(n).fill(0);
  for (let k = 0; k < t.length; k++) {
    if (t[k] < a0 || t[k] > a1) continue;
    const b = Math.min(n - 1, Math.round(((t[k] - a0) / (a1 - a0 || 1)) * (n - 1)));
    cnt[b] += 1;
    for (let i = 0; i < v.length; i++) sums[i][b] += v[i][k];
  }
  return sums.map((s) => {
    let last = null;
    const out = s.map((x, b) => (cnt[b] ? (last = x / cnt[b]) : last));
    const first = out.find((x) => x !== null) ?? 0;
    return out.map((x) => (x === null ? first : x));
  });
}
