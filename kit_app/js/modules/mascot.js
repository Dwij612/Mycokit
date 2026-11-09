// mascot.js — the sticky mushroom, bottom right, on every page.
// One short line at a time. Comes and goes. Can be muted. Never moves if the phone asks for reduced motion.
//
// Moods map to the four faces in the Figma sheet:
//   ready   — eyes open, smiling      → all good, waiting for you
//   happy   — eyes closed, smiling    → done, it worked
//   alert   — eyes open, "o" mouth    → something needs you
//   waiting — eyes closed, "o" mouth  → hang on, I'm busy
//
// 28 Oct 2026 (Dwij, after the summative test):
//   - a prompt (something to do) can be said with { tone: "prompt" }: the bubble turns yellow, the same yellow
//     as the marker it leads to, so it stands out from the purple screen
//   - setNext(text): a small countdown above the mushroom ("Next prompt in 1:40"); null hides it
//   - tapping the mushroom shows its latest message again (as before)

import { STORAGE_KEYS } from "./config.js";
import { load, save } from "./storage-local.js";

const FACES = {
  ready:   "assets/mascot/ready.png",
  happy:   "assets/mascot/happy.png",
  alert:   "assets/mascot/alert.png",
  waiting: "assets/mascot/waiting.png",
};
const AUTO_HIDE_MS = 9000;

let el = {};
let current = { key: null, text: "", mood: "ready" };
let hideTimer = null;
let muted = false;

export function initMascot(root = document) {
  el = {
    dock:   root.querySelector("[data-mascot]"),
    bubble: root.querySelector("[data-mascot-bubble]"),
    text:   root.querySelector("[data-mascot-text]"),
    close:  root.querySelector("[data-mascot-close]"),
    face:   root.querySelector("[data-mascot-face]"),
    img:    root.querySelector("[data-mascot-img]"),
    mute:   root.querySelector("[data-mascot-mute]"),
    muteLabel: root.querySelector("[data-mascot-mute-label]"),
    burst:  root.querySelector("[data-mascot-burst]"),
    announce: root.querySelector("[data-mascot-announce]"),
    actions: root.querySelector("[data-mascot-actions]"),
    next:   root.querySelector("[data-mascot-next]"),
  };
  if (!el.dock) return;

  // preload the faces so mood changes never flash
  Object.values(FACES).forEach((src) => { const i = new Image(); i.src = src; });

  muted = load(STORAGE_KEYS.muted) === "1";
  renderMute();

  el.close.addEventListener("click", () => hide());
  el.face.addEventListener("click", () => (el.bubble.hidden ? show(true) : hide()));
  el.mute.addEventListener("click", () => {
    muted = !muted;
    save(STORAGE_KEYS.muted, muted ? "1" : null);
    renderMute();
    if (muted) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.bubble.hidden) hide();
  });
}

/**
 * Say something. Same key twice in a row does nothing, so polling can call this freely.
 * @param {string} key   identity of the message (dedupe)
 * @param {string} text  plain text; keep it to one or two short sentences
 * @param {"ready"|"happy"|"alert"|"waiting"} mood
 */
export function say(key, text, mood = "ready", opts = {}) {
  if (!el.dock) return;
  setMood(mood);
  if (key === current.key) return;
  current = { key, text, mood, persist: Boolean(opts.persist || opts.actions?.length) };
  el.text.textContent = text;
  if (opts.tone) el.bubble.dataset.tone = opts.tone;
  else el.bubble.removeAttribute("data-tone");
  renderActions(opts.actions || []);
  // A prompt that asks the user to do something is shown even when muted, because it is part of the task.
  if (!muted || current.persist) {
    // a region that is always in the page, so screen readers hear it even as the bubble appears
    el.announce.textContent = text;
    show(false);
  }
}

/** Buttons inside the bubble, e.g. "I did it". Each runs its handler, then the bubble closes. */
function renderActions(actions) {
  if (!el.actions) return;
  el.actions.innerHTML = "";
  el.actions.hidden = actions.length === 0;
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `mascot__action${a.secondary ? " mascot__action--quiet" : ""}`;
    b.textContent = a.label;
    b.addEventListener("click", () => { hide(); a.onClick?.(); });
    el.actions.appendChild(b);
  }
}

/** The countdown above the mushroom (Live): a short line, or null to hide it. */
export function setNext(text) {
  if (!el.next) return;
  if (!text) { el.next.hidden = true; return; }
  if (el.next.textContent !== text) el.next.textContent = text;
  el.next.hidden = false;
}

/** True when the person has muted the mushroom (its sounds stay off too). */
export const isMuted = () => muted;

/** True while a prompt that needs an answer is on screen — others should wait their turn. */
export function isBusy() {
  return Boolean(current.persist && el.bubble && !el.bubble.hidden);
}

/** Forget the current line, so the same key can be said again later. */
export function clear() {
  current = { key: null, text: "", mood: current.mood };
  hide();
}

export function setMood(mood) {
  if (!el.dock || !FACES[mood]) return;
  if (el.dock.dataset.mood !== mood) {
    el.dock.dataset.mood = mood;
    el.img.src = FACES[mood];
  }
}

/** The one celebration: a starburst behind the mushroom. */
export function celebrate() {
  if (!el.burst) return;
  el.burst.removeAttribute("data-on");
  void el.burst.offsetWidth;            // restart the animation
  el.burst.setAttribute("data-on", "");
}

function show(byUser) {
  clearTimeout(hideTimer);
  el.bubble.removeAttribute("data-leaving");
  el.bubble.hidden = false;
  el.face.setAttribute("aria-label", "Hide the mushroom's message");
  if (!byUser && !current.persist) hideTimer = setTimeout(hide, AUTO_HIDE_MS);
}

function hide() {
  clearTimeout(hideTimer);
  if (el.bubble.hidden) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finish = () => {
    el.bubble.hidden = true;
    el.bubble.removeAttribute("data-leaving");
    el.face.setAttribute("aria-label", "Show the mushroom's message");
  };
  if (reduce) return finish();
  el.bubble.setAttribute("data-leaving", "");
  el.bubble.addEventListener("animationend", finish, { once: true });
}

function renderMute() {
  el.mute.setAttribute("aria-pressed", String(muted));
  el.muteLabel.textContent = muted ? "Unmute the mushroom" : "Mute the mushroom";
  el.mute.title = el.muteLabel.textContent;
}
