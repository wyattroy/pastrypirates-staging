/* DOES EVERY PICTURE THE GAME NAMES ACTUALLY DECODE? In both engines, in both games.
 *
 *   node scripts/qa/art_decodes_probe.mjs
 *
 * WHY THIS IS NOT `asset_paths_exist_check.mjs` WEARING A BROWSER. That gate asks the FILESYSTEM
 * whether a path exists. This asks a BROWSER whether the bytes behind that path are something it
 * can draw — and after 2026-09-02 those are different questions, because `assets/` is no longer one
 * format. 32 files became WebP that morning (`T-057` the board, `T-058` the rest), the folder is
 * now deliberately mixed PNG/WebP/JPEG per file, and **WebP support is the one thing on that list
 * an engine can decline.** A Safari that refuses one island gives a player a gap on the board and
 * gives us nothing: `src/ui/board.js` removes an SVG <image> that fails to load, so there is no
 * console error and no broken-image glyph to find.
 *
 * ⚠ IT OVERLAPS `board_decodes_probe.mjs` AND SHOULD EVENTUALLY ABSORB IT. That one asks the same
 * question about one file, in the same two engines, with its own copy of the drive-into-a-game
 * dance. Two instruments asking one question in two places is the fault rule 23 is about, and this
 * note is here so the next person merges them instead of adding a third. Kept separate today only
 * because retiring a gate mid-change is how evidence goes missing.
 *
 * AN ENGINE THAT COULD NOT BE REACHED IS A FAILURE, NEVER A SILENT PASS — the trial's "NOT RUN"
 * column rule, applied here. Playwright's WebKit is not Safari and this never claims it is; it is
 * the closest engine available offline, and saying so is the honest version.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openChrome } from "../lib/cdp.mjs";
import { openWebKit } from "../lib/wk.mjs";
import { GAME_PATH, CLASSIC_PATH } from "../lib/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;

/* The list is DERIVED from each tree's own shared module, the same way the gate does it — a probe
   carrying its own list of art could not fail when the art changed. */
async function urlsFor(sharedRel) {
  const mod = await import(pathToFileURL(path.join(ROOT, sharedRel)).href);
  const base = mod.ASSET_BASE;
  const out = new Set();
  for (const [name, val] of Object.entries(mod)) {
    if (!name.endsWith("_IMG")) continue;
    const vals = typeof val === "string" ? [val] : Array.isArray(val) ? val
      : val && typeof val === "object" ? Object.values(val) : [];
    for (const u of vals) if (typeof u === "string" && u.startsWith(base)) out.add(u);
  }
  return [...out];
}

/* The PAGE each tree is served at comes from chrome.mjs, never from this file — see the header of
   `game_url_check.js` case 1b. The `shared:` paths beside them are repo-relative FILE reads, a
   different question, and deliberately not laundered through the same constants. */
const TREES = [
  { name: "the game", page: `${GAME_PATH}index.html`, shared: "src/shared/index.js" },
  { name: "/classic", page: `${CLASSIC_PATH}index.html`, shared: "classic/src/shared/index.js" },
];

async function decodesIn(t, origin, engine) {
  for (const tree of TREES) {
    const urls = await urlsFor(tree.shared);
    /* A LIST THAT CAME BACK EMPTY WOULD MAKE THIS PROBE PASS WHILE LOOKING AT NOTHING. */
    if (urls.length < 20) {
      console.error(`FAIL — ${engine}, ${tree.name}: only ${urls.length} art paths derived. The probe has gone blind.`);
      bad++;
      continue;
    }
    await t.nav(origin + tree.page);
    await sleep(2200);
    const r = await t.ev(`(async()=>{
      const urls=${JSON.stringify(urls)};
      const bad=[], sizes={};
      for(const u of urls){
        try{const i=new Image(); i.src=u; await i.decode();
            if(!i.naturalWidth) bad.push([u,"decoded to 0x0"]); else sizes[u]=[i.naturalWidth,i.naturalHeight];}
        catch(e){ bad.push([u,String(e&&e.name||e).slice(0,60)]); }
      }
      return JSON.stringify({n:urls.length,bad,webp:urls.filter(u=>/\\.webp$/i.test(u)).length});
    })()`);
    const d = JSON.parse(r);
    const who = `${engine}, ${tree.name}`;
    if (d.bad.length) {
      bad += d.bad.length;
      console.error(`FAIL — ${who}: ${d.bad.length} of ${d.n} pictures did NOT decode:`);
      for (const [u, why] of d.bad.slice(0, 8)) console.error(`         ${u}  —  ${why}`);
    } else {
      console.log(`  ${who}: all ${d.n} pictures decoded (${d.webp} of them WebP)`);
    }
  }
}

const chrome = await openChrome({
  W: 1280, H: 900, dbgPort: 9413, httpPort: 8413, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-art-decodes"), dsf: 2,
});
try { await decodesIn(chrome, "http://127.0.0.1:8413", "chromium"); }
finally { await chrome.close(); }

/* A PHONE SEAT ON SAFARI'S ENGINE — where Wyatt plays and where the weight was worth removing. */
let wk = null, wkVerdict = "not attempted";
try {
  wk = await openWebKit({
    W: 390, H: 844, httpPort: 9414, serveRoot: ROOT,
    profileDir: path.join(ROOT, ".tmp-art-decodes-wk"), dsf: 3, mobile: true,
  });
} catch (e) {
  wkVerdict = `UNREACHABLE — ${String(e && e.message).slice(0, 160)}`;
}
if (wk) {
  const before = bad;
  console.log("");
  try { await decodesIn(wk, "http://127.0.0.1:9414", "webkit"); wkVerdict = bad === before ? "CLEAN" : "FAILURES ABOVE"; }
  finally { await wk.close(); }
}

console.log(`\n  Safari's engine: ${wkVerdict}`);
if (wkVerdict.startsWith("UNREACHABLE") || wkVerdict === "not attempted") {
  console.error("FAIL — the second engine was never asked, so half the question is unanswered.");
  console.error("       That is a NOT-RUN, and a not-run leg is not a passing leg.");
  bad++;
}
if (bad) { console.error(`\nFAIL — ${bad} problem(s).`); process.exit(1); }
console.log("\nPASS — every picture both games name decodes in both engines.");
