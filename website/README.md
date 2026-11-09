# MycoKit — project website (uploads simulated)

The online half of MycoKit: where people look at shared studies and upload their own, after recording on the kit.
**Mobile first**, same look as the kit app (`Final_UI`).

> **Uploads are simulated, by design (Dwij, 5 Oct 2026).** Every page and the whole sharing flow work, with two
> example studies from the thesis recordings (Test 1 and Test 2). When someone "publishes", nothing is uploaded:
> the study is kept **in that browser only** (IndexedDB) and nothing leaves the phone. See "Why uploads are
> simulated" at the end.

Design sources: `Design/03a_Site_Map.md` §3 (W1–W5), `Design/03b_User_Flows.md` Flow 7 and 8,
`Design/03_Feature_List.md` W-01 – W-21, `Design/03c_Two_System_Note.md`. The website has no interview evidence
behind it (it was decided after the interviews), so its pages stay marked design-led.

---

## Pages

| Page | File | Features |
|---|---|---|
| W1 Home | `index.html` | what the project is, latest studies, how it works |
| W2 Studies | `studies.html` | W-10 gallery, newest first |
| W2a A study | `study.html?id=…` | W-09 photos · date · trace · notes · place; W-14 CSV; **sheet music** (W-17) |
| W3 Upload | `upload.html` | W-01 access code · W-02 bundle (with its photos) · W-04 notes · W-06 preview · publish |
| W4 Tutorial | `tutorial.html` | W-11 (the kit app's Help page, reachable before joining the kit) |
| W5 About | `about.html` | W-13 iNaturalist link · W-08 privacy · W-07 removing a study |
| Team | `team.html` (footer link only) | W-21 hide a study · W-20 choose for iNaturalist · remove for good |

Kept out of search engines (W-19): `robots.txt`, a `noindex` meta tag on every page, and `_headers`
(`X-Robots-Tag`, read by Netlify and Cloudflare Pages). **Unlisted, not private**: anyone with the link can read it.

## Decisions (Dwij, 5 Oct 2026)

- **Uploads are simulated** — the full flow, nothing sent or stored on a server. (Replaces the earlier
  "mock first, then live on Supabase" plan.)
- **Publish straight away.** The team can hide a study afterwards.
- **Photos come inside the bundle (28 Oct 2026, after the summative test).** They are taken in the kit app at
  Prepare upload, so the upload has no photo step any more (access code → bundle → notes → preview). Each photo
  carries a **simulated** location, shown as "(simulated)": the kit app is served over http on the kit's offline
  Wi-Fi, and browsers only share the phone's location with https pages. Future work: https on the kit, then ask for
  the location when the photo is taken. (5–28 Oct 2026: photos were chosen here and had to carry their own GPS
  location — see the section below, kept for reference.)
- **Removing a study: contributors email the team** with the recording ID (was "session code"). In the
  simulation they can also use About → **Clear what I've shared**.
- **No mascot on the website**; study cards show only the title ("Test 1", "Test 2"), date, time and length;
  body text is 15px on phones; the footer is small and sits at the bottom of the screen.
- **Scope:** used in and around the lab, by people who know the project — not public collection.
- **Sheet music from the CSV** (see below), now rather than later.

## Photos and location — what phones do (until 28 Oct 2026)

Phones protect location when a website asks for a photo, so the upload page explained how to keep it:

- **iPhone (iOS 17 and later):** in the photo picker, tap **Options** and turn **Location** on. Or save the photo to
  Files and use **Choose from Files**. Location Services must be on for the Camera when the photo is taken.
- **Android:** recent versions remove location from photos handed to websites. If a photo keeps saying
  "no location", upload from a computer (copy the photo across with a cable).
- The page has two buttons on purpose: **Choose photos** (`accept="image/*"`, the photo picker) and
  **Choose from Files** (no `accept`, the file browser, which hands over the original file).

Location is read with exifr (JPEG, HEIC, TIFF). HEIC photos only display in Safari; elsewhere the page says so,
and the file and its metadata are still kept.

## Sheet music

On every study page: pick a probe → **Make sheet music** → the score, **Download MIDI**, **Print or save as PDF**.

The numbers are the kit sonification's, at its defaults (`FungiKit_Pi_Web/sonify.html`, "Repeating patterns"):
median-normalise → smooth (j = 20) → detrend (k = 250) → one note per minute → 2nd–98th percentile → C major
pentatonic, 3 octaves from C3. The notation follows the Ch14 score (`sonify/score`, 15 Sep 2026): semiquavers at
crotchet = 90, repeated flat notes tied, rising notes accent + staccato, falling runs slurred (a single falling note
tenuto), grand staff split at middle C. The Ch14 score's "spike" text marks are not drawn. Code: `js/modules/score.js`;
drawn by abcjs. On a phone the score shows one bar a line; printing lays it out four bars a line on A4.

## Example studies

Listed in `examples/examples.json`; the files are copies from the Thesis folder.

| Study | Data | Photos |
|---|---|---|
| **Test 2** — the 46-hour run (30 Aug – 1 Sep 2026) | not in the Thesis folder yet (`record20260830182703.csv`, 13 MB) | `Test_2/Images`: three iPhone 15 photos, location kept |
| **Test 1** — the first recording on the Pi (6 Aug 2026) | `Test_1/record-2026-07-08-04-23-02.csv` | none in the Thesis folder |

The notes on each are taken from the Test 1 and Test 2 reports. Test 1's date is the real one (6 August); the times
inside its file say 8 July because the Pi's clock wasn't set. The mini study and an iNaturalist observation were
left out (Dwij, 5 Oct 2026).

To add Test 2's data later: put the CSV in `examples/test-2/`, set `"csv": "examples/test-2/<file name>"` for
`s-test-2` in `examples/examples.json`, and raise `SEED_VERSION` in `js/modules/seed.js` so browsers reload the examples.

## Run it on a laptop

ES modules need a server:

```bash
cd Thesis/Website
python3 -m http.server 8000
```

Open <http://localhost:8000/>. Codes: access code **FUNGI-LAB**, team code **TEAM-2026**.
**About → Clear what I've shared** brings the examples back and forgets studies shared from that browser
(use it between participants).

A bundle to upload: on the kit app, **Prepare upload** saves `FK-XXXX.mycokit.json`. The kit app's demo bundles
work too (marked as demo data).

## Files

```
index.html studies.html study.html upload.html tutorial.html about.html team.html
robots.txt, _headers           kept out of search engines
css/reset.css base.css layout.css components.css   copies of the kit app's, so the two look the same
css/site.css                   website-only pieces (cards, photos, footer, score)
css/page_css/*.css             one per page
js/main.js                     picks the page module from <body data-page>
js/modules/config.js           codes, team email, iNaturalist link, photo limits  ← placeholders to fill
js/modules/data.js             every read and write — IndexedDB in this browser (uploads are simulated)
js/modules/seed.js             loads the example studies listed in examples/examples.json
examples/                      the example studies' files: Test 1's data, Test 2's photos (copies from the Thesis folder)
js/modules/bundle.js           reads the kit's bundle and CSV (kit, kit demo, and older logger columns)
js/modules/photos.js           photo locations (marks simulated ones); the old photo check, unused since 28 Oct 2026
js/modules/score.js            sheet music: the sonification numbers → ABC notation
js/modules/study-view.js       draws one study (study page and upload preview)
js/modules/cards.js            a study as a card
js/modules/page-*.js           one per page
js/modules/trace-chart.js, ui.js, storage-local.js, accordion.js   shared with the kit app (accordion: Help topics that open and close)
js/modules/mascot.js           not used any more (mascot removed from the website); kept, as is assets/mascot/
vendor/abcjs-basic-min.js      abcjs 6.7.1 (MIT) — draws the score, makes the MIDI
vendor/exifr-lite.esm.js       exifr 7.1.3 (MIT) — reads photo metadata
assets/                        fonts (OFL), icon.svg (the tab icon)
```

## Placeholders to fill

- `TEAM_EMAIL` in `js/modules/config.js`.
- The site's address and QR code: on the kit card, in the kit app's About page and its upload hand-off.

---

## Why uploads are simulated

Dwij, 5 Oct 2026: the thesis is about interaction design — the citizen-science user flow from kit to website —
not about back ends or data security. So the website runs the whole flow (access code → recording file, with its
photos → notes → preview → **Publish**, with a short "Uploading…" bar → done → the study on the Studies page),
but nothing is sent anywhere and the project holds nobody's data. The page says so plainly: a line at the top of
Upload, the done screen, the **Simulation** badge in the header, and About → Privacy.

What that means in practice:

- A "published" study lives in IndexedDB in the participant's browser, on their phone. Nobody else sees it.
- The access code is checked in the page — fine, since there is nothing on a server to protect.
- The team page works on the studies in the browser it is opened in.
- The earlier Supabase plan (tables, buckets, row-level security) is dropped. It is in the README's history
  before 5 Oct 2026 if it is ever wanted again.

## Platform icons (step 2 of Upload)

Where to find the recording file is shown on two lines, iPhone and Android, each with a small icon. The icons
are a generic phone outline: the Apple and Android logos are the companies' trademarks, so they are not drawn
here. To use official icons, put the files in `assets/platform/` and swap each `<svg class="os-hint__icon">` in
`upload.html` for an `<img class="os-hint__icon" src="assets/platform/…" alt="">`.
Check each company's brand rules first — the Android robot is free to use with attribution; Apple does not
allow its logo on third-party sites.
