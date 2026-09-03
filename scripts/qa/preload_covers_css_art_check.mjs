#!/usr/bin/env node
/* GATE: art that exists ONLY inside a stylesheet must still be warmed at boot.
 *
 *   node scripts/qa/preload_covers_css_art_check.mjs
 *
 * INBOX-20260901T1335Z, his words: "we need to load all game assets up front; i notice sometimes
 * that the 'fire the ovens' graphic loads dynamically when it is called, which will make it appear
 * blank on slow connections."
 *
 * MEASURED 2026-09-02 by `preload_covers_every_named_picture_probe.mjs`: of the 144 pictures the
 * game names, exactly ONE was never fetched at boot — `assets/rain-streaks.png`, the storm's rain
 * texture, which is named in a CSS `url(...)` inside `index.html` and in no JavaScript constant
 * anywhere. `sharedAssetUrls()` derives from `*_IMG` constants, so it is BLIND TO CSS BY
 * CONSTRUCTION: no amount of care in that function could ever have covered this. The first storm of
 * a voyage fetched its own rain mid-storm.
 *
 * WHAT THIS GATE ASSERTS, AND WHY IT CAN ACTUALLY FAIL. It does not check that `preloadAssets()`
 * mentions a magic word. It checks the CONDITION that made the defect real:
 *
 *   for every `assets/…` URL written in a CSS `url(...)` in index.html —
 *     it is either ALSO named by a `*_IMG` constant (so the JS derivation already reaches it),
 *     or `preloadAssets()` carries a derivation over the page's own stylesheets.
 *
 * So deleting the `cssAssetUrls()` call from `preloadAssets()` makes this gate go red, because
 * `rain-streaks.png` is genuinely CSS-only — red-proofed that way when it was written. And if the
 * day comes that no stylesheet names any art, the gate says so plainly instead of passing on an
 * empty set: a check with nothing to check has told you about ITSELF, not about the game.
 *
 * IT DELIBERATELY DOES NOT NAME `rain-streaks.png`. A gate holding its own copy of the answer
 * cannot fail when the answer changes — the next CSS-named picture is covered the moment it is
 * written, which is the whole reason the fix was a derivation and not a fifth name on a list.
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const shared = await import(pathToFileURL(path.join(ROOT, "src/shared/index.js")).href);

/* every asset path any `*_IMG` constant names — sharedAssetUrls()'s own derivation, not a copy */
const fromConstants = new Set();
for (const [k, val] of Object.entries(shared)) {
  if (!k.endsWith("_IMG")) continue;
  const vals = typeof val === "string" ? [val]
    : Array.isArray(val) ? val
    : val && typeof val === "object" ? Object.values(val) : [];
  for (const u of vals) if (typeof u === "string" && u.startsWith(shared.ASSET_BASE)) fromConstants.add(u);
}

/* every asset path a CSS url(...) in the game's own page names */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const cssArt = new Set();
for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
  const u = (m[1] || "").split("?")[0].split("#")[0];
  if (u.startsWith(shared.ASSET_BASE) && !/^https?:/.test(u)) cssArt.add(u);
}

const utilSrc = fs.readFileSync(path.join(ROOT, "src/ui/util.js"), "utf8");
const body = utilSrc.match(/export function preloadAssets\(\)\{([\s\S]*?)\n\}/);
if (!body) {
  console.log("FAIL -- could not find preloadAssets() in src/ui/util.js; this gate has gone blind.");
  process.exit(1);
}
/* "derives from the page's own stylesheets" means exactly that: the warm-up list is built from
   document.styleSheets, not from a name somebody typed. Both halves are required — a call with no
   stylesheet read behind it is a name in disguise. */
const helper = utilSrc.match(/function cssAssetUrls\(\)\{([\s\S]*?)\n\}/);
const derivesFromStylesheets = /cssAssetUrls\(\)/.test(body) && !!helper && /document\.styleSheets/.test(helper[1]);

let fail = false;
const say = (ok, label) => { console.log(`${ok ? "OK" : "FAIL"} -- ${label}`); if (!ok) fail = true; };

say(cssArt.size > 0,
  `index.html's stylesheet names ${cssArt.size} picture(s) — a gate with nothing to check would pass on an empty set`);

const cssOnly = [...cssArt].filter((u) => !fromConstants.has(u));
if (cssOnly.length === 0) {
  say(true, "every CSS-named picture is also a *_IMG constant, so the JavaScript derivation already reaches it");
} else {
  say(derivesFromStylesheets,
    `${cssOnly.length} picture(s) exist ONLY in CSS (${cssOnly.join(", ")}) — preloadAssets() must derive from document.styleSheets to warm them`);
}

if (fail) {
  console.log("");
  console.log("A picture named only in CSS is fetched the first time the screen that uses it appears.");
  console.log("On a slow connection the player gets a blank there — Wyatt's own complaint, INBOX-20260901T1335Z.");
  console.log("Restore the derivation in preloadAssets(); do not add the filename to a list by hand.");
}
process.exit(fail ? 1 : 0);
