// data.js — every study the website shows or keeps goes through here.
//
// UPLOADS ARE SIMULATED, by design (Dwij, 5 Oct 2026). Everything is kept in this browser's IndexedDB, seeded with
// the example studies (seed.js). Nothing is sent to any server — the thesis studies the flow, not data storage.
// (The earlier plan to go live on Supabase is dropped.)
//
// A study:
//   { id, code, name, started_at (ISO), length_s, published_at (ISO), notes, events: [{kind, at_s, wall, text, probe}],
//     csv (the kit's CSV, as text), photos: [{ id, name, type, blob, lat, lon, alt, taken_at, make, model }],
//     hidden, curated (chosen for iNaturalist), example (one of the example studies),
//     and on examples: title, date_only, csv_url (fetched when opened), csv_missing_note }

import { ACCESS_CODE } from "./config.js";
import { makeSeedStudies, SEED_VERSION } from "./seed.js";

const DB_NAME = "fungikit-website", STORE = "studies", VERSION = 1;
let dbp = null;

function db() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(st)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function all() {
  return tx("readonly", (st) => req2p(st.getAll()));
}

let seeded = null;
const SEED_KEY = "fungikit.web.seedVersion";

/** Puts the example studies in, and replaces them when the examples change (SEED_VERSION). Uploads are kept. */
async function ensureSeeded() {
  seeded ||= (async () => {
    let have = null;
    try { have = localStorage.getItem(SEED_KEY); } catch { /* private window: seed every time it's empty */ }
    const n = await tx("readonly", (st) => req2p(st.count()));
    if (n > 0 && have === String(SEED_VERSION)) return;
    const old = (await all()).filter((x) => x.example);
    const fresh = await makeSeedStudies();
    await tx("readwrite", (st) => { old.forEach((x) => st.delete(x.id)); fresh.forEach((x) => st.put(x)); });
    try { localStorage.setItem(SEED_KEY, String(SEED_VERSION)); } catch { /* ignore */ }
  })().catch((err) => { seeded = null; throw err; });
  return seeded;
}

/* ---------------------------------------------------------------- reading (no code needed) */

/** Newest first. Hidden studies only for the team. Without the CSV, to keep lists light. */
export async function listStudies({ includeHidden = false } = {}) {
  await ensureSeeded();
  return (await all())
    .filter((s) => includeHidden || !s.hidden)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .map(({ csv, ...rest }) => rest);
}

export async function getStudy(id) {
  await ensureSeeded();
  const s = await tx("readonly", (st) => req2p(st.get(id)));
  if (!s) return null;
  // example studies keep their data file next to the site, and fetch it the first time they're opened
  if (!s.csv && s.csv_url) {
    try {
      s.csv = await (await fetch(s.csv_url)).text();
      await tx("readwrite", (st) => { st.put(s); });
    } catch (err) {
      console.warn("[data] the example's data file didn't load:", err);
    }
  }
  return s;
}

/* ---------------------------------------------------------------- uploading (access code) */

export async function checkAccessCode(code) {
  // Simulated upload: checked in the page (nothing is sent anywhere, so there is nothing to protect server-side).
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "") === ACCESS_CODE;
}

/** Publishes straight away (Dwij, 5 Oct 2026). Returns the new study's id. */
export async function publish(draft) {
  await ensureSeeded();
  const existing = await all();
  let id = `s-${draft.code.toLowerCase()}`;
  if (existing.some((s) => s.id === id)) id = `${id}-${Date.now().toString(36)}`;
  const study = { ...draft, id, published_at: new Date().toISOString(), hidden: false, curated: false, example: false };
  await tx("readwrite", (st) => { st.put(study); });
  return id;
}

/** Has this bundle (by its session code) been published from this browser before? */
export async function findByCode(code) {
  await ensureSeeded();
  return (await all()).find((s) => s.code === code) || null;
}

/* ---------------------------------------------------------------- the team */

async function patch(id, change) {
  const s = await getStudy(id);
  if (!s) return null;
  Object.assign(s, change);
  await tx("readwrite", (st) => { st.put(s); });
  return s;
}

export const setHidden = (id, hidden) => patch(id, { hidden: Boolean(hidden) });
export const setCurated = (id, curated) => patch(id, { curated: Boolean(curated) });

/** Removes a study for good. Contributors ask by email; the team does it here. */
export async function removeStudy(id) {
  await tx("readwrite", (st) => { st.delete(id); });
}

/** Mock only: put the example studies back and forget everything uploaded in this browser. */
export async function resetMock() {
  await tx("readwrite", (st) => { st.clear(); });
  try { localStorage.removeItem(SEED_KEY); } catch { /* ignore */ }
  seeded = null;
  await ensureSeeded();
}
