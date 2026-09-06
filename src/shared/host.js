// src/shared/host.js — ONE ANSWER TO "WHICH HOST IS THIS?", for the whole project.
//
// CEO 189, finding 6: "`analyticsShouldRun()` in src/analytics.js is a second hostname policy
// sitting beside `devHost()`. Two things kept in step by discipline — rule 23's exact shape."
//
// IT WAS THREE, NOT TWO. Reading the tree before fixing it found a third in `src/ui/usage.js`, and
// the third DISAGREED with the second: usage pings counted `www.playpastrypirates.com`, analytics
// did not. Nothing made them agree, and nothing would have said so — which is the whole of rule 23.
//
// ⚠ AND THE DISAGREEMENT HAS NO PLAYER CONSEQUENCE TODAY, measured rather than assumed:
// `curl -L https://www.playpastrypirates.com/` 301s to the apex, so by the time any of this code
// runs `location.hostname` is already `playpastrypirates.com` and the `www` branch is unreachable.
// So this is a convergence, NOT the repair of a live undercount, and it is written down that way so
// nobody later reads a drama into it. The reason `www` stays in the list is that a redirect is a
// DNS/Pages configuration, not a property of this code: the day it changes, one list moves.
//
// THE DESIGN-TIME QUESTION, and it is the whole rule: *what makes these agree?* Before this file the
// honest answer was "nothing — we keep them in step". Now there is one of them.
//
// WHY ITS OWN FILE RATHER THAN `shared/index.js`, which already holds `devHost()`: `index.html`,
// `about.html` and `rules.html` load `src/analytics.js` as a standalone module, and `shared/index.js`
// is 756 lines. Importing it for a hostname test would put the game's shared helpers on the About
// page to answer one question. This file is a leaf — it imports nothing, and it never will.

/* THE LIVE GAME. Exact strings, never `endsWith()`: a suffix test also admits
   `playpastrypirates.com.evil.example`, and the value of this list is that it is short enough to
   read. `staging.` is deliberately NOT here — it is a developer's machine (below), which is what
   keeps a sea trial from being counted as real players. */
export const LIVE_HOSTS = Object.freeze([
  "playpastrypirates.com",
  "www.playpastrypirates.com",
]);

/* A DEVELOPER'S MACHINE. `""` is a `file://` checkout. STAGING COUNTS (W0-1, 2026-08-27): it is
   where Wyatt plays work in progress, so dev flags must work there and nothing there may ever be
   counted as a player. */
export const DEV_HOSTS = Object.freeze([
  "localhost", "127.0.0.1", "0.0.0.0", "",
  "staging.playpastrypirates.com",
]);

/* Pure functions of a hostname string, so a gate can drive them without a browser. */
export function isLiveHost(hostname) {
  return LIVE_HOSTS.includes(String(hostname));
}

export function isDevHost(hostname) {
  const h = String(hostname);
  return DEV_HOSTS.includes(h) || h.endsWith(".local");
}

/* The reading-the-browser wrapper. Kept with EXACTLY the old name, signature and swallow-everything
   behaviour, because `scripts/dev_flag_gate_check.js` imports `devHost` from `shared/index.js` and
   drives it against a stubbed `location` — and because every dev flag in `src/` hangs off this call
   by name. Changing its shape would be a rename dressed as a refactor. */
export function devHost() {
  try { return isDevHost(location.hostname); } catch (err) { return false; }
}
