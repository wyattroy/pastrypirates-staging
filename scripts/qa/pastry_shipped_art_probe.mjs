/* LOOK AT THE PICTURE — the shipped recipe art, in both games, on a phone.
 *
 *   node scripts/qa/pastry_shipped_art_probe.mjs
 *
 * Rule 19: before handing a change over, open it and look at the RENDERED IMAGE, not the DOM and
 * not a state dump. `recipe_art_exists_check.mjs` proves the 21 files are on disk under the names
 * the game builds; it cannot prove a browser can DECODE them, and "the file exists" is exactly the
 * kind of number that stays right while the picture goes wrong (W5-1: an opaque master passed every
 * decode check and put a block behind the art).
 *
 * So this asks the browser itself, in both trees:
 *   - every one of the 21 recipe illustrations decodes, with naturalWidth > 0
 *   - the recipe modal is photographed at the phone size Wyatt plays on, through each game's own
 *     openRecipeModal() (recipe.js) rather than by hand-building a card — ONE DISPLAY PATH
 *
 * AND IT ASKS SAFARI'S ENGINE, NOT ONLY CHROME'S. Safari is a stated core requirement of this
 * game, and a format change is exactly the class of change that can be perfect in one engine and
 * blank in the other. CEO Review 96 caught the first version of this probe running Chrome only
 * while the repo's own WebKit driver (`scripts/lib/wk.mjs`, three Safari legs in the sea trial)
 * sat unused, and while the watch's own written prediction had named Safari as the thing that
 * would prove it wrong. **An engine that cannot be reached is reported, never skipped quietly** —
 * a probe that says nothing about WebKit and a probe that found WebKit clean must not print the
 * same thing.
 *
 * It writes .planning/posed/pastry-webp-shipped-phone.png, and — for the frozen v1 that shares the
 * same assets/ folder — .planning/posed/pastry-webp-shipped-classic.png.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";
import { openWebKit } from "../lib/wk.mjs";
/* WHERE EACH GAME LIVES IS NOT THIS FILE'S TO DECIDE. The first version of this probe hand-typed
   `/classic/src/ui/recipe.js`, which is precisely what `game_url_check.js` forbids and why it
   exists — and it turned the whole suite red for about ninety minutes on 2026-09-02. Both trees
   now come from the one place that owns them. */
import { GAME_PATH, CLASSIC_PATH } from "../lib/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(ROOT, ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

const RECIPE_INDEX = 20;   // the same subject every earlier step of this item photographed

const TREES = [
  { name: "the game", page: `${GAME_PATH}index.html`, mod: `${GAME_PATH}src/ui/recipe.js` },
  { name: "/classic", page: `${CLASSIC_PATH}index.html`, mod: `${CLASSIC_PATH}src/ui/recipe.js` },
];

let bad = 0;

/* ONE QUESTION, ASKED OF WHICHEVER ENGINE IS HANDED IN. Chrome and WebKit expose the same handle
   shape (nav / ev / shot / close), so the decode question is written once and asked twice rather
   than copied — the thing that would otherwise drift is the question itself. */
async function decodesIn(t, base, engine) {
  for (const tree of TREES) {
    await t.nav(`${base}${tree.page}`);
    await sleep(2000);
    const verdict = await t.ev(`(async()=>{
      const m = await import(${JSON.stringify("__MOD__")});
      if (m.attachPastryArt) m.attachPastryArt();
      const out = [];
      for (const r of m.RECIPE_BOOK) {
        const im = new Image();
        im.src = r.img;
        try { await im.decode(); out.push([r.img, im.naturalWidth, im.naturalHeight]); }
        catch (e) { out.push([r.img, 0, 0]); }
      }
      return JSON.stringify(out);
    })()`.replace("__MOD__", tree.mod));
    let rows;
    try { rows = JSON.parse(verdict); } catch (e) { rows = null; }
    if (!rows || !rows.length) {
      console.error(`  FAIL — ${engine} / ${tree.name}: could not ask the page about its recipe art (${JSON.stringify(verdict).slice(0, 160)})`);
      bad++;
      continue;
    }
    const dead = rows.filter(([, w]) => !w);
    console.log(`  ${engine} / ${tree.name}: ${rows.length - dead.length} of ${rows.length} recipe illustrations decoded` +
      `, first is ${rows[0][1]}x${rows[0][2]} (${rows[0][0]})`);
    for (const [u] of dead) console.error(`     DEAD  ${u}`);
    bad += dead.length;
  }
}

const t = await openChrome({
  W: 390, H: 844, dbgPort: 9433, httpPort: 9434, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-pastryshipped"), dsf: 3, mobile: true,
});
try {
  const base = `http://127.0.0.1:9434`;

  // ---- 1. every recipe illustration DECODES, asked of the module that names them ----
  await decodesIn(t, base, "chromium");

  /* ---- 2. THE FROZEN v1's OWN MODAL, photographed. It shares these files and nobody here opens
     it, so a picture of it is the only thing that can say it is really all right. Its modal takes
     an ingredient list and needs no game, so it opens directly. ---- */
  await t.nav(`${base}${CLASSIC_PATH}index.html`);
  await sleep(2500);
  const classicOpened = await t.ev(`(async()=>{
    const m=await import('${CLASSIC_PATH}src/ui/recipe.js');
    if(m.attachPastryArt) m.attachPastryArt();
    m.openRecipeModal(m.RECIPE_BOOK[${RECIPE_INDEX}].ings);
    const im=document.querySelector('.recipeModalThumb');
    if(!im) return 'no thumb';
    await im.decode().catch(()=>{});
    const r=im.getBoundingClientRect();
    return JSON.stringify({slot:[Math.round(r.width),Math.round(r.height)],
                           natural:[im.naturalWidth,im.naturalHeight], src:im.getAttribute('src')});
  })()`);
  console.log(`\n  /classic recipe modal: ${classicOpened}`);
  if (typeof classicOpened !== "string" || classicOpened[0] !== "{") bad++;
  await sleep(600);
  await t.shot(path.join(OUT, "pastry-webp-shipped-classic.png"));
  console.log(`  wrote .planning/posed/pastry-webp-shipped-classic.png`);

  // ---- 3. photograph the modal in the real game, at the phone size he plays on ----
  await t.nav(`${base}${GAME_PATH}index.html`);
  await sleep(1200);
  await t.ev("localStorage.clear()");
  await t.nav(`${base}${GAME_PATH}index.html`);
  await sleep(2500);
  await t.ev(`document.getElementById('choiceSolo').click()`);
  for (let i = 0; i < 40; i++) {
    if (await t.ev(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`) === true) break;
    await sleep(250);
  }
  await t.ev(`document.getElementById('nameModalInput').value='Wyatt'`);
  await t.ev(`document.getElementById('btnNameConfirm').click()`);
  for (let i = 0; i < 80; i++) {
    if (await t.ev(`(()=>{try{return !!(appState.game&&appState.game.players.some(p=>p.strategy==='human'))}catch(e){return false}})()`) === true) break;
    await sleep(300);
  }
  await sleep(2500);
  const opened = await t.ev(`(async()=>{
    const m=await import('${GAME_PATH}src/ui/recipe.js');
    m.openRecipeModal(m.RECIPE_BOOK[${RECIPE_INDEX}].ings);
    const im=document.querySelector('.recipeModalThumb');
    if(!im) return 'no thumb';
    await im.decode().catch(()=>{});
    const r=im.getBoundingClientRect();
    return JSON.stringify({slot:[Math.round(r.width),Math.round(r.height)],
                           natural:[im.naturalWidth,im.naturalHeight], src:im.getAttribute('src')});
  })()`);
  console.log(`\n  recipe modal: ${opened}`);
  if (typeof opened !== "string" || opened[0] !== "{") bad++;
  await sleep(600);
  await t.shot(path.join(OUT, "pastry-webp-shipped-phone.png"));
  console.log(`  wrote .planning/posed/pastry-webp-shipped-phone.png`);
} finally {
  await t.close();
}

/* ---- 4. SAFARI'S ENGINE. A separate mount, so a WebKit that cannot start is reported as
   UNREACHABLE rather than quietly leaving this probe saying nothing about the engine half the
   project's core value names. THIS IS THE HALF THAT MATTERS FOR A FORMAT CHANGE: a codec is
   exactly the thing that can be perfect in Chromium and blank in WebKit. ---- */
let wkVerdict = "NOT REACHED";
let wk = null;
try {
  wk = await openWebKit({
    W: 390, H: 844, httpPort: 9436, serveRoot: ROOT,
    profileDir: path.join(ROOT, ".tmp-pastryshipped-wk"), dsf: 3, mobile: true,
  });
} catch (e) {
  wkVerdict = `UNREACHABLE — ${String(e && e.message).slice(0, 160)}`;
}
if (wk) {
  const before = bad;
  try {
    console.log("");
    await decodesIn(wk, `http://127.0.0.1:9436`, "webkit");
    wkVerdict = bad === before ? "CLEAN" : "FAILURES ABOVE";
  } finally {
    await wk.close();
  }
}

console.log(`\n  Safari's engine: ${wkVerdict}`);
if (wkVerdict.startsWith("UNREACHABLE")) {
  // Not a pass and not a silent skip. The report says the engine was not asked, and the caller
  // decides — a probe that prints the same thing whether it looked or not is worthless.
  console.error("  ⚠ WEBKIT WAS NOT ASKED. Nothing here says anything about Safari; do not report that it does.");
  bad++;
}

if (bad) { console.error(`\nFAIL — ${bad} problem(s) with the shipped recipe art.`); process.exit(1); }
console.log(`\nPASS — every shipped recipe illustration decodes in both games and in both engines, and both modals are photographed.`);
