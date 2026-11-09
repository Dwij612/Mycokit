// config.js — one place for every setting the project website depends on.

// ============================================================================================
// UPLOADS ARE SIMULATED, by design (Dwij, 5 Oct 2026). The whole sharing flow works, but nothing is uploaded:
// a "published" study is kept in THIS browser only (IndexedDB) and nothing leaves the device. The thesis is about
// interaction design and the citizen-science flow, so the project does not store anyone's data.
// MOCK = true is what switches on the simulation wording (badge, upload notes, About → Clear what I've shared).
// ============================================================================================
export const MOCK = true;

// Upload needs this code, printed on the kit (W-01). Checked in the page — fine, since nothing is really uploaded.
export const ACCESS_CODE = "FUNGI-LAB";

// The team page (moderation, iNaturalist list). Works on what is in this browser.
export const TEAM_CODE = "TEAM-2026";

// Removing a study: contributors email the team (Dwij, 5 Oct 2026). PLACEHOLDER — put the real address here.
export const TEAM_EMAIL = "mycokit-team@example.org";

// The project's iNaturalist page (W-13).
export const INAT_URL = "https://www.inaturalist.org/projects/the-underground-brain-mycowave-recordings";

export const ROUTES = {
  home:     "index.html",
  studies:  "studies.html",
  study:    "study.html",
  upload:   "upload.html",
  tutorial: "tutorial.html",
  about:    "about.html",
  team:     "team.html",
};

// Photos (W-03). 28 Oct 2026 (Dwij): taken in the kit app and read from the bundle (bundle.js), at most PHOTO_MAX,
// each with a SIMULATED location. (5 Oct – 28 Oct 2026: chosen here, each needing its own GPS location.)
export const PHOTO_MAX = 6;
export const PHOTO_MAX_MB = 25;

export const STORAGE_KEYS = {
  muted: "fungikit.web.mascotMuted",
  notes: "fungikit.web.dismissed",
  team:  "fungikit.web.team",
};
