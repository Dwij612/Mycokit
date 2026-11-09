// photo-store.js — the two photos taken at Prepare upload (28 Oct 2026, Dwij).
//
// The photo is taken with the phone's own camera (a file input with capture), made smaller on the phone, and kept
// in this browser (IndexedDB) until it goes into the bundle, so a reload or going back doesn't lose it. Nothing is
// sent to the kit. Only the latest recording's photos are kept: taking one for a new recording clears the rest.

import { PHOTO_MAX_PX, PHOTO_QUALITY } from "./config.js";

const DB_NAME = "mycokit-photos";
const STORE = "photos";

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

/** This recording's photos, as { slot: photo }. Empty if storage isn't available. */
export async function photosFor(recId) {
  try {
    const all = await tx("readonly", (s) => s.getAll());
    return Object.fromEntries(all.filter((p) => p.recId === recId).map((p) => [p.slot, p]));
  } catch {
    return {};
  }
}

/** Keeps one photo (replacing that slot's), and drops photos from other recordings. Never throws. */
export async function keep(photo) {
  try {
    await tx("readwrite", (s) => {
      const req = s.getAll();
      req.onsuccess = () => req.result.filter((p) => p.recId !== photo.recId).forEach((p) => s.delete(p.key));
      s.put({ ...photo, key: `${photo.recId}:${photo.slot}` });
    });
  } catch { /* the photo is still in memory for this visit */ }
}

/**
 * The file from the camera → a smaller JPEG as a data URL, the right way up.
 * Resolves { data, type, width, height }.
 */
export async function shrink(file) {
  const img = await decode(file);
  const w0 = img.width, h0 = img.height;
  const k = Math.min(1, PHOTO_MAX_PX / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  img.close?.();
  return { data: canvas.toDataURL("image/jpeg", PHOTO_QUALITY), type: "image/jpeg", width: w, height: h };
}

// createImageBitmap turns the photo the right way up by itself; an <img> is the fallback for older phones
async function decode(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
