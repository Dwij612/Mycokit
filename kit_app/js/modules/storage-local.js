// storage-local.js — browser storage for small conveniences only (remembered name, mascot mute).
// It can be empty or throw (private browsing, the Wi-Fi pop-up window), so every call is guarded
// and nothing on the page depends on it.

export function load(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    if (value === null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* not available — fine */
  }
}
