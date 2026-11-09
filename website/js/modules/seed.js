// seed.js — the example studies on the mock website (5 Oct 2026, Dwij: use Test 1 and Test 2).
//
// Real recordings from the thesis, listed in examples/examples.json:
//   Test 2 — the 46-hour run (Thesis/Test_2): its three photos, with location data removed
//   Test 1 — the first recording on the Pi (Thesis/Test_1): its data file
// Shown simply as "Test 1" and "Test 2" (Dwij, 5 Oct 2026).
// Each photo is read with the same check as an upload (photos.js), so what the page shows about it — where,
// when, which phone — comes from the photo itself. Data files are fetched only when a study is opened.

import { checkPhoto } from "./photos.js";

export const SEED_VERSION = 6;           // 6: Test 2 notes and end match the thesis (9 Nov 2026)
// was 5           // 5: Test 2 has its data (8 Oct 2026)
// was 4           // bump to replace the examples in browsers that already have older ones

export async function makeSeedStudies() {
  const manifest = await (await fetch("examples/examples.json", { cache: "no-store" })).json();
  const out = [];
  for (const d of manifest.studies) {
    const photos = [];
    for (const url of d.photos || []) {
      try {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], url.split("/").pop(), { type: blob.type || "image/jpeg" });
        const r = await checkPhoto(file);
        if (r.ok) photos.push(r.photo);
        else console.warn("[examples] photo left out:", url, r.why);
      } catch (err) {
        console.warn("[examples] photo did not load:", url, err);
      }
    }
    out.push({
      id: d.id,
      code: d.code,
      title: d.title || null,
      name: d.name || null,
      started_at: new Date(d.started_at).toISOString(),
      date_only: Boolean(d.date_only),
      length_s: d.length_s,
      published_at: new Date(d.started_at).toISOString(),
      notes: d.notes || "",
      events: d.events || [],
      csv: null,
      csv_url: d.csv || null,
      csv_missing_note: d.csv_missing_note || null,
      photos,
      hidden: false,
      curated: false,
      example: true,
    });
  }
  return out;
}
