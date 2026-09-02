#!/usr/bin/env node
// INBOX-20260901T1335Z ("we need to load all game assets up front... the 'fire the ovens' graphic
// loads dynamically when it is called, which will make it appear blank on slow connections").
// Measured mechanism: RECIPE_BOOK's pastry art and BADGE_POOL's award emblems are plain
// `<img src>` tags (recipe.js .recipeThumb/.recipeModalThumb/.victoryRecipe, util.js
// .awardEmblem) that were never in preloadAssets()'s eager list, so they fetch cold the first
// time the recipe picker, recipe modal, or End-of-Voyage screen renders them.
//
// This gate reads the REAL preloadAssets() function body out of src/ui/util.js (never a
// hand-copied re-implementation) and checks it references RECIPE_BOOK and BADGE_POOL, so the
// eager-preload promise actually covers both asset families rather than a description of them.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const UTIL = path.join(here, "..", "..", "src", "ui", "util.js");

const src = fs.readFileSync(UTIL, "utf8");
const m = src.match(/export function preloadAssets\(\)\{([\s\S]*?)\n\}/);
if (!m) {
  console.log("FAIL -- could not find preloadAssets() in src/ui/util.js");
  process.exit(1);
}
const body = m[1];

const checks = [
  ["RECIPE_BOOK's pastry art is in the eager preload list", /RECIPE_BOOK\.map\(/.test(body)],
  ["BADGE_POOL's award emblems are in the eager preload list", /BADGE_POOL\.map\(/.test(body)],
  ["the guaranteed-fallback badge (anchor) is also covered", /FALLBACK_BADGE/.test(body)],
];

let fail = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? "OK" : "FAIL"} -- ${label}`);
  if (!ok) fail = true;
}
process.exit(fail ? 1 : 0);
