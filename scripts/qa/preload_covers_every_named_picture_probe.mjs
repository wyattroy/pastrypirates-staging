/* PROBE: is EVERY picture the game page can draw actually fetched at boot — or do some still
 * arrive cold, mid-voyage, the moment a player reaches the screen that needs them?
 *
 *   node scripts/qa/preload_covers_every_named_picture_probe.mjs
 *
 * WYATT'S OWN SENTENCE, AND IT IS THE WHOLE SPEC (INBOX-20260901T1335Z):
 *   "we need to load all game assets up front; i notice sometimes that the 'fire the ovens' graphic
 *    loads dynamically when it is called, which will make it appear blank on slow connections."
 *
 * `preload_covers_icons_probe.mjs` answers this for ONE family — the icons, because that family was
 * the one CEO Review 80 caught missing. **It cannot fail for any other family**, which is the gap
 * this probe closes: the question he asked was "all game assets", not "the icons".
 *
 * WHY IT DOES NOT ASK `preloadAssets()` WHAT IT WARMS. That would be a tautology — the list doing
 * the warming cannot also be the list saying whether the warming is complete, and a check that
 * cannot fail is not a check (CLAUDE.md rule 6). So the expected set is derived from the four
 * places the game NAMES its art:
 *
 * ⚠ AND ONLY ONE OF THOSE FOUR IS GENUINELY INDEPENDENT OF THE WARM-UP — CEO 108's finding, and
 * the first version of this header overstated it. Sources 1, 3 and 4 below are the same lists
 * `preloadAssets()` already walks, so for those the comparison really is close to circular: it can
 * only catch a fetch that failed, never a name that was never on the list. **Source 2 —
 * `index.html` — is the independent one, and it is the one that found the defect.** The probe is
 * still not a check that cannot fail (it measures real browser fetches against a set built
 * elsewhere), but the honest claim is narrower than "four independent sources", and the next
 * reader should know which quarter of it is doing the work.
 *
 *   1. `*_IMG` constants in `src/shared/index.js`      — the derivation `sharedAssetUrls()` uses
 *   2. `assets/…` URLs written into `index.html`       — `<img src>`, `href`, and `url(...)` in CSS,
 *                                                        which NO JavaScript constant can see
 *   3. `PASTRY_FILES` + the `r.img=` template in `src/ui/recipe.js`  — the 21 recipe illustrations
 *   4. `BADGE_POOL` + `FALLBACK_BADGE` in `src/ui/util.js`          — the End-of-Voyage emblems
 *
 * Each is lifted out of the game's own source and evaluated, never restated here — the technique
 * `recipe_art_exists_check.mjs` and `asset_paths_exist_check.mjs` already use.
 *
 * POSED, NOT PLAYED (rule 26). It boots to the bare welcome screen and stops. No voyage is started,
 * so nothing has been drawn by a screen that needed it: every asset URL in the resource log got
 * there because the preloader asked for it. That is a yes/no question about one moment, so it does
 * not want a rate over a voyage.
 *
 * ⚠ THE THREE BUCKETS, AND WHY THE THIRD IS NOT A VERDICT. This probe reports:
 *     WARMED             — named by the game AND fetched at boot
 *     COLD               — named by the game and NOT fetched: the defect, and the only failing bucket
 *     ON SCREEN ALREADY  — fetched, but also drawn on the welcome screen, so it proves nothing
 *   It deliberately does NOT report "files on disk that nobody named" as a fault. That is the
 *   mistake `asset_display_size_probe.mjs` made on this same item, where NOT SEEN got read as
 *   "unused" — a probe's silence is a fact about the probe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openChrome } from "../lib/cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (u) => u.replace(/^\.\//, "").split("?")[0].split("#")[0];

/* ---- 1. the `*_IMG` constants, by sharedAssetUrls()'s own derivation ---- */
const shared = await import(pathToFileURL(path.join(ROOT, "src/shared/index.js")).href);
const named = new Map();               // url -> where it was named
function name(url, where) {
  const u = norm(url);
  if (!u.startsWith("assets/")) return;
  if (!named.has(u)) named.set(u, where);
}
for (const [k, val] of Object.entries(shared)) {
  if (!k.endsWith("_IMG")) continue;
  const vals = typeof val === "string" ? [val]
    : Array.isArray(val) ? val
    : val && typeof val === "object" ? Object.values(val) : [];
  for (const u of vals) if (typeof u === "string") name(u, `src/shared/index.js ${k}`);
}
const fromConstants = named.size;

/* ---- 2. every assets/ URL written into the game's own page ---- */
const HTML_URL_RE = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g;
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
for (const m of indexHtml.matchAll(HTML_URL_RE)) {
  const u = m[1] || m[2];
  if (!u || /^https?:/.test(u)) continue;
  if (/(^|\/)assets\//.test(u)) name(u, "index.html");
}
const fromHtml = named.size - fromConstants;

/* ---- 3. the recipe illustrations (recipe_art_exists_check.mjs's technique) ---- */
const recipeSrc = fs.readFileSync(path.join(ROOT, "src/ui/recipe.js"), "utf8");
const pastryList = recipeSrc.match(/const PASTRY_FILES\s*=\s*\[[\s\S]*?\];/);
const pastryTmpl = recipeSrc.match(/r\.img\s*=\s*(`[^`]*`)/);
if (!pastryList || !pastryTmpl) {
  console.error("FAIL — cannot find PASTRY_FILES / r.img in src/ui/recipe.js: this probe has gone blind, which is not the same as the art being fine.");
  process.exit(1);
}
for (const u of new Function("ASSET_BASE", `${pastryList[0]}\nreturn PASTRY_FILES.map((_, i) => ${pastryTmpl[1]});`)(shared.ASSET_BASE))
  name(u, "src/ui/recipe.js PASTRY_FILES");
const fromRecipes = named.size - fromConstants - fromHtml;

/* ---- 4. the End-of-Voyage award emblems ---- */
const utilSrc = fs.readFileSync(path.join(ROOT, "src/ui/util.js"), "utf8");
const poolBlock = utilSrc.match(/const BADGE_POOL\s*=\s*\[[\s\S]*?\n\];/);
const fallback = utilSrc.match(/const FALLBACK_BADGE\s*=\s*\{[^}]*\}/);
if (!poolBlock || !fallback) {
  console.error("FAIL — cannot find BADGE_POOL / FALLBACK_BADGE in src/ui/util.js: this probe has gone blind.");
  process.exit(1);
}
// The extension is typed into the game in two places (util.js and board.js); lift it, never retype it.
const badgeTmpl = utilSrc.match(/badges\/\$\{[^}]*\}(\.\w+)/);
if (!badgeTmpl) {
  console.error("FAIL — cannot find the badges/${…}.ext template in src/ui/util.js: this probe has gone blind.");
  process.exit(1);
}
for (const b of [...poolBlock[0].matchAll(/img:\s*"([^"]+)"/g), ...fallback[0].matchAll(/img:\s*"([^"]+)"/g)])
  name(`${shared.ASSET_BASE}badges/${b[1]}${badgeTmpl[1]}`, "src/ui/util.js BADGE_POOL");
const fromBadges = named.size - fromConstants - fromHtml - fromRecipes;

/* A DERIVATION THAT COLLAPSES MUST FAIL LOUDLY, not report a clean sheet. */
if (named.size < 100) {
  console.error(`FAIL — only ${named.size} pictures derived from the game's own source. This probe has gone blind rather than the art having shrunk.`);
  process.exit(1);
}

console.log(`the game names ${named.size} pictures:`);
console.log(`  ${fromConstants} from *_IMG constants · ${fromHtml} from index.html · ${fromRecipes} recipe illustrations · ${fromBadges} award emblems`);

/* ---- boot, posed, and see what the browser actually asked for ---- */
const t = await openChrome({
  W: 1280, H: 900, dbgPort: 9432, httpPort: 8432, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-preload-all-profile"), dsf: 1,
});
let result;
try {
  await t.send("Network.enable");
  await t.send("Network.clearBrowserCache");
  await t.nav("http://127.0.0.1:8432/index.html");
  await sleep(2000);
  await t.ev("localStorage.clear()");
  await t.send("Network.clearBrowserCache");
  await t.nav("http://127.0.0.1:8432/index.html");
  await sleep(15000);   // preloadAssets() is fired without being awaited on the fresh-visit path

  result = await t.ev(`(() => {
    const res = performance.getEntriesByType('resource')
      .filter(e => { try { return new URL(e.name).pathname.replace(/^\\//, '').startsWith('assets/'); } catch { return false; } });
    const bytes = res.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0);
    const last  = res.reduce((n, e) => Math.max(n, e.responseEnd), 0);
    return {
      fetched: res.map(e => new URL(e.name).pathname.replace(/^\\//, '')),
      onScreen: [...document.images].map(i => new URL(i.src, location.href).pathname.replace(/^\\//, '')),
      bytes, last,
      gameStarted: !!(window.appState && appState.game && appState.game.players && appState.game.players.some(p => p.strategy === 'human')),
    };
  })()`);
} finally {
  await t.close();
}

if (!result || result.__err) { console.error("probe failed:", result); process.exit(1); }
if (result.gameStarted) { console.error("FAIL — a game had started, so this is not the posed welcome screen and the result means nothing."); process.exit(1); }

const fetched = new Set(result.fetched);
const onScreen = new Set(result.onScreen);
const cold = [...named.keys()].filter((u) => !fetched.has(u));
const warmedUnseen = [...named.keys()].filter((u) => fetched.has(u) && !onScreen.has(u));

console.log(`\nat the bare welcome screen, with a cleared cache:`);
console.log(`  ${fetched.size} pictures fetched, ${(result.bytes / 1048576).toFixed(2)} MB over the wire, last one finished at ${(result.last / 1000).toFixed(1)}s`);
console.log(`  WARMED (fetched, nothing on screen needed it): ${warmedUnseen.length}`);
console.log(`  COLD   (the game names it, boot never asked for it): ${cold.length}`);

if (cold.length) {
  const by = new Map();
  for (const u of cold) {
    const w = named.get(u);
    by.set(w, [...(by.get(w) || []), u]);
  }
  console.error(`\nFAIL — ${cold.length} picture(s) the game can draw are NOT warmed at boot.`);
  console.error(`Each one is fetched the first time a player reaches the screen that needs it — Wyatt's own`);
  console.error(`complaint: "appear blank on slow connections".`);
  for (const [where, list] of by) {
    console.error(`  named in ${where}:`);
    for (const u of list.slice(0, 10)) console.error(`      ${u}`);
    if (list.length > 10) console.error(`      …and ${list.length - 10} more`);
  }
  process.exit(1);
}
console.log(`\nPASS — every one of the ${named.size} pictures the game names was already fetched before a voyage began.`);
