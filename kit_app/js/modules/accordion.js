// accordion.js — Help topics that open and close (Dwij, 5 Oct 2026). Shared by the kit app and the website.
//
// Markup: <section data-topic id="…" [data-open]> <h2 data-topic-heading>Title</h2> <div data-topic-body id="…">…</div>
// The heading gets a button inside it (the WAI-ARIA disclosure pattern: the heading stays a heading for screen
// readers, the button says whether the topic is open). Without JavaScript nothing is hidden.
// A link to a topic (tutorial.html#tips), or to anything inside one, opens it.

const CHEV = '<svg class="topic__chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

export function initAccordion(root = document) {
  const items = [...root.querySelectorAll("[data-topic]")].map((el) => {
    const heading = el.querySelector("[data-topic-heading]");
    const body = el.querySelector("[data-topic-body]");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "topic__btn";
    btn.setAttribute("aria-controls", body.id);
    btn.innerHTML = `<span class="topic__label">${heading.innerHTML}</span>${CHEV}`;
    heading.replaceChildren(btn);
    const item = { el, btn, body };
    btn.addEventListener("click", () => set(item, btn.getAttribute("aria-expanded") !== "true"));
    set(item, el.hasAttribute("data-open"));
    return item;
  });

  const openFromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    const item = target && items.find((i) => i.el.contains(target));
    if (!item) return;
    set(item, true);
    target.scrollIntoView({ block: "start" });
  };
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
  return items;
}

function set({ el, btn, body }, open) {
  btn.setAttribute("aria-expanded", String(open));
  body.hidden = !open;
  el.classList.toggle("is-open", open);
}
