// POSED CHECK, not a sea trial (CLAUDE.md rule 26): the question is "are these image FAMILIES
// fetched at boot, before they are ever shown on screen" -- a deterministic yes/no this
// resolves in seconds, not a rate a stochastic voyage would take 85 minutes to estimate.
//
// Loads the real game to a bare, fresh HOME screen (no game started, so the recipe picker,
// the recipe modal and the End-of-Voyage screen have never been rendered) and reads the
// browser's own resource-timing table for every request the page actually made. If pastry
// and badge art appear there, preloadAssets() fetched them eagerly, unprompted by any of
// their real call sites.
import { openChrome, sleep } from "../lib/cdp.mjs";
import { gameURL } from "../lib/chrome.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const dbgPort = 9401, httpPort = 8401;
const c = await openChrome({ W: 1280, H: 900, dbgPort, httpPort, serveRoot: repoRoot,
  profileDir: path.join(repoRoot, ".pw-profile-preload-probe") });
try {
  await c.nav(gameURL(httpPort)); // one spelling of where the game is served — never hardcoded here
  await sleep(4000); // boot + fire-and-forget preloadAssets() to get well underway
  const names = await c.ev(`performance.getEntriesByType('resource').map(e=>e.name)`);
  const fetched = Array.isArray(names) ? names : [];
  const pastries = fetched.filter(u => /assets\/pastries\//.test(u));
  const badges = fetched.filter(u => /assets\/badges\//.test(u));
  const onRecipeOrEov = await c.ev(`!!(document.querySelector('.recipeThumb,.recipeModalThumb,.victoryRecipe,.awardEmblem'))`);
  console.log(`pastry images fetched by boot: ${pastries.length} of 21`);
  console.log(`badge images fetched by boot: ${badges.length}`);
  console.log(`a recipe/badge <img> is on screen right now (should be false -- home screen only): ${onRecipeOrEov}`);
  const ok = pastries.length >= 21 && badges.length >= 9 && onRecipeOrEov === false;
  console.log(ok ? "PASS -- pastry and badge art are warm before either is ever shown"
    : "FAIL -- one or both asset families were not fetched at boot");
  process.exit(ok ? 0 : 1);
} finally {
  c.close();
}
