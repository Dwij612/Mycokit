// photos.js — photo locations, and (until 28 Oct 2026) checking photos chosen on the website (W-03).
//
// 28 Oct 2026 (Dwij, after the summative test): photos are now taken in the kit app and arrive inside the bundle
// (bundle.js), with a SIMULATED location. checkPhoto() below is no longer used by the upload page; it is kept for
// the day the website takes photos from the phone again. placeText() marks a simulated location as such.
//
// Earlier rule:
// Rule (Dwij, 5 Oct 2026): the photo's own location metadata (GPS EXIF) is needed and is KEPT, never stripped.
// A photo without it is refused. No photos at all is fine.
//
// The file is stored exactly as chosen — the original bytes, with all of its metadata — and the location,
// time taken and camera are also read out here so the study page can show them.
//
// Reading the metadata uses exifr (MIT licence, vendor/exifr-lite.esm.js): JPEG, HEIC and TIFF.

import * as exifr from "../../vendor/exifr-lite.esm.js";
import { PHOTO_MAX_MB } from "./config.js";

const IMAGE_EXT = /\.(jpe?g|heic|heif|png|tiff?|webp)$/i;

/** Resolves to { ok: true, photo } or { ok: false, why } — `why` in plain words, with how to fix it. */
export async function checkPhoto(file) {
  const isImage = (file.type && file.type.startsWith("image/")) || IMAGE_EXT.test(file.name || "");
  if (!isImage) return { ok: false, why: `${file.name} isn't a photo.` };
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) return { ok: false, why: `${file.name} is over ${PHOTO_MAX_MB} MB.` };

  let tags = null;
  try { tags = await exifr.parse(file, { tiff: true, exif: true, gps: true }); } catch { tags = null; }
  const gps = tags && Number.isFinite(tags.latitude) ? { latitude: tags.latitude, longitude: tags.longitude } : null;

  if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude) || (gps.latitude === 0 && gps.longitude === 0)) {
    return { ok: false, why: `${file.name} has no location saved in it, so it can't be added.`, noLocation: true };
  }
  const taken = tags?.DateTimeOriginal || tags?.CreateDate || null;
  return {
    ok: true,
    photo: {
      id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name || "photo",
      type: file.type || guessType(file.name),
      blob: file,                                   // the original file, metadata and all
      lat: round(gps.latitude, 6),
      lon: round(gps.longitude, 6),
      alt: Number.isFinite(tags?.GPSAltitude) ? round(tags.GPSAltitude, 1) : null,
      taken_at: taken instanceof Date && !isNaN(taken) ? taken.toISOString() : null,
      make: tags?.Make || null,
      model: tags?.Model || null,
    },
  };
}

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

function guessType(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", heic: "image/heic", heif: "image/heif", png: "image/png", tif: "image/tiff", tiff: "image/tiff", webp: "image/webp" }[ext] || "application/octet-stream";
}

/** "-27.49930, 153.01440" (with "simulated" when it is) and a link that opens the spot on OpenStreetMap. */
export function placeText(p) {
  if (!hasPlace(p)) return "Location not recorded";
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}${p.simulated ? " (simulated)" : ""}`;
}
export const hasPlace = (p) => Boolean(p) && Number.isFinite(p.lat) && Number.isFinite(p.lon);
export function mapLink(p) {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=19/${p.lat}/${p.lon}`;
}
