// page-team.js — for the project team: hide a study (W-21), choose studies for iNaturalist (W-20),
// and remove one for good when its contributor emails to ask. Not linked from the menu.
// A shared team code; changes apply to the studies in this browser (uploads are simulated).

import { listStudies, setHidden, setCurated, removeStudy } from "./data.js";
import { TEAM_CODE, STORAGE_KEYS, ROUTES } from "./config.js";
import { formatWhen } from "./ui.js";
import { confirmDialog } from "./ui.js";
import { studyTitle, esc } from "./study-view.js";
// import { say } from "./mascot.js";   // mascot removed from the website (Dwij, 5 Oct 2026)

export function initTeam() {
  const form = document.querySelector("[data-team-form]");
  const input = document.querySelector("#team-code");
  const err = document.querySelector("[data-team-error]");
  const open = () => {
    form.hidden = true;
    document.querySelector("[data-team-hint]").hidden = true;
    document.querySelector("[data-team-list-panel]").hidden = false;
    render();
  };
  let remembered = false;
  try { remembered = sessionStorage.getItem(STORAGE_KEYS.team) === "1"; } catch { /* ignore */ }
  if (remembered) return open();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value.trim().toUpperCase() !== TEAM_CODE) {
      err.textContent = "That isn't the team code.";
      err.hidden = false;
      input.setAttribute("aria-invalid", "true");
      return;
    }
    try { sessionStorage.setItem(STORAGE_KEYS.team, "1"); } catch { /* ignore */ }
    open();
  });
  // (mascot removed) say("team", "This page is for the project team.", "ready");
}

async function render() {
  const list = document.querySelector("[data-team-list]");
  const studies = await listStudies({ includeHidden: true });
  list.innerHTML = studies.map((s) => `
    <li class="team-row" data-id="${esc(s.id)}">
      <div class="team-row__head">
        <a href="${ROUTES.study}?id=${encodeURIComponent(s.id)}">${esc(studyTitle(s))}</a>
        <span class="team-row__meta"><span class="num">${esc(s.code)}</span> · ${formatWhen(s.published_at)}${s.example ? " · example" : ""}${s.hidden ? " · <strong>hidden</strong>" : ""}</span>
      </div>
      <label class="switch"><input type="checkbox" data-hide ${s.hidden ? "checked" : ""}><span class="switch__track" aria-hidden="true"></span><span>Hidden from the website</span></label>
      <label class="switch"><input type="checkbox" data-curate ${s.curated ? "checked" : ""}><span class="switch__track" aria-hidden="true"></span><span>Chosen for iNaturalist</span></label>
      <button class="link-danger" type="button" data-remove>Remove for good</button>
    </li>`).join("") || "<li>No studies.</li>";

  list.querySelectorAll(".team-row").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector("[data-hide]").addEventListener("change", async (e) => { await setHidden(id, e.target.checked); render(); });
    row.querySelector("[data-curate]").addEventListener("change", async (e) => { await setCurated(id, e.target.checked); });
    row.querySelector("[data-remove]").addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Remove this study for good?",
        body: "Its data, photos and notes are deleted. This can't be undone.",
        confirm: "Remove it", cancel: "Keep it", danger: true,
      });
      if (!ok) return;
      await removeStudy(id);
      render();
    });
  });
}
