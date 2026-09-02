/* DOES THE BOARD ACTUALLY DRAW? In a real browser, in BOTH games, and it leaves a picture.
 *
 *   node scripts/qa/board_decodes_probe.mjs
 *
 * A gate can prove the file is on disk (`asset_paths_exist_check.mjs`) and prove the tree is light
 * enough (`asset_weight_check.mjs`) and both can be green while a player sees nothing — because
 * `src/ui/board.js:272` attaches an `error` handler to the SVG <image> that REMOVES the element
 * when it fails to load. A board that will not decode therefore leaves no console error, no broken-
 * image icon and no failing assertion; it leaves a bare grid. CLAUDE.md rule 19: look at the
 * rendered picture, not the DOM.
 *
 * So this asks the browser the one question no static check can: did the <image> the game put on
 * the board resolve, at what natural size, and does the screenshot show the art. Both trees, because
 * `/classic` reads the same converted file and is the half a player would never report to us.
 *
 * ⚠ THE FIRST VERSION OF THIS PROBE CONDEMNED BOTH GAMES AND WAS WRONG, and the correction is kept
 * because it is the whole of rule 6. It read the WELCOME screen, found no <image> under `svg#board`,
 * and reported "the art element was removed" for the game AND for /classic. The welcome screen's
 * attract board simply does not carry the base art — `svg#board` exists there with no board <image>
 * in it, so the probe's own subject was never present and its verdict was about ITSELF. Measured
 * against the same build the moment it was doubted: the file serves 200 at 204,050 bytes, decodes
 * 2132x2132 in the browser, and appears in a real solo game as `image href=assets/board.webp` with
 * zero console errors. **A check that has not reached its subject cannot fail, and this one failed
 * loudly instead — which is worse, because it is believable.** It now DRIVES INTO A GAME first.
 *
 * ⚠ AND IT ASKS SAFARI, BECAUSE CEO 97 CAUGHT THE FIRST VERSION ASKING ONLY CHROME — the same fault
 * CEO 96 had raised ninety minutes earlier about the recipe art. Three things make the board its own
 * question rather than one the recipe art already answered:
 *   1. the recipe art is an HTML <img> (`src/ui/recipe.js`); the board is an **SVG <image href>**
 *      (`src/ui/board.js:271`), which WebKit loads through different machinery;
 *   2. this file carries an ICC profile and an alpha plane at 2132x2132 lossy, which those do not;
 *   3. **the failure is silent BY DESIGN** — the error handler above deletes the element, so a
 *      WebKit that refuses this file gives a player a bare grid and gives us nothing at all.
 * A probe that describes that failure mode in its own header and then tests the one engine where it
 * is least likely is theatre. Both engines, and an engine that could not be reached is reported as
 * NOT ASKED and fails — never as a silent pass.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome } from "../lib/cdp.mjs";
import { openWebKit } from "../lib/wk.mjs";
import { GAME_PATH, CLASSIC_PATH } from "../lib/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let bad = 0;

async function boardDrawsIn(t, origin, engine) {
  for (const game of [
    /* Both addresses come from chrome.mjs — see `game_url_check.js` case 1b's header. */
    { name: "the game", url: `${origin}${GAME_PATH}index.html` },
    { name: "/classic", url: `${origin}${CLASSIC_PATH}index.html` },
  ]) {
    await t.nav(game.url);
    await sleep(1800);
    await t.ev("localStorage.clear()");
    await t.nav(game.url);
    await sleep(3000);

    /* INTO A REAL GAME — the welcome screen's attract board carries no base art (see the note at
       the top). §3 of DRIVING-THE-GAME.md: the mode card first, then the name modal. */
    await t.ev(`(()=>{const b=document.getElementById('choiceSolo');if(b)b.click();})()`);
    await sleep(1400);
    await t.ev(`(()=>{const i=document.getElementById('nameModalInput');if(i)i.value='Wyatt';
                      const b=document.getElementById('btnNameConfirm');if(b)b.click();})()`);
    await sleep(6500);

    const r = await t.ev(`(async()=>{
      const im=document.querySelector('svg#board image, #board image');
      if(!im) return JSON.stringify({found:false});
      const href=im.getAttribute('href')||im.getAttribute('xlink:href');
      // <image> exposes no naturalWidth, so decode the same URL independently — this is what tells
      // a resolved board from a removed one.
      let w=0,h=0,ok=false;
      try{const p=new Image();p.src=href;await p.decode();w=p.naturalWidth;h=p.naturalHeight;ok=true;}catch(e){}
      const box=im.getBoundingClientRect();
      return JSON.stringify({found:true,href,ok,w,h,drawn:[Math.round(box.width),Math.round(box.height)]});
    })()`);
    const d = JSON.parse(r);
    const tag = game.name === "/classic" ? "classic" : "game";
    await t.shot(path.join(OUT, `board-webp-after-${engine}-${tag}.png`));
    const who = `${engine}, ${game.name}`;
    if (!d.found) { console.error(`FAIL — ${who}: no <image> on the board at all. The art element was removed — a player sees a bare grid.`); bad++; continue; }
    if (!d.ok || !d.w) { console.error(`FAIL — ${who}: the board's ${d.href} did NOT decode. A player sees a bare grid.`); bad++; continue; }
    console.log(`  ${who}: ${d.href} decoded ${d.w}x${d.h}, drawn ${d.drawn[0]}x${d.drawn[1]} CSS px`);
    if (d.w !== 2132 || d.h !== 2132) { console.error(`FAIL — ${who}: the board is ${d.w}x${d.h}, not 2132x2132. It was resized, and it must not be.`); bad++; }
  }
  if (t.consoleErrs && t.consoleErrs.length) console.log(`  ${engine} console errors: ${t.consoleErrs.slice(0, 4).join(" | ")}`);
}

const chrome = await openChrome({
  W: 1280, H: 900, dbgPort: 9411, httpPort: 8411, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-board-decodes"), dsf: 2,
});
try { await boardDrawsIn(chrome, "http://127.0.0.1:8411", "chromium"); }
finally { await chrome.close(); }

/* SAFARI'S ENGINE. A phone seat, because that is where Wyatt plays and where the weight matters. */
let wk = null, wkVerdict = "not attempted";
try {
  wk = await openWebKit({
    W: 390, H: 844, httpPort: 9412, serveRoot: ROOT,
    profileDir: path.join(ROOT, ".tmp-board-decodes-wk"), dsf: 3, mobile: true,
  });
} catch (e) {
  wkVerdict = `UNREACHABLE — ${String(e && e.message).slice(0, 160)}`;
}
if (wk) {
  const before = bad;
  console.log("");
  try { await boardDrawsIn(wk, "http://127.0.0.1:9412", "webkit"); wkVerdict = bad === before ? "CLEAN" : "FAILURES ABOVE"; }
  finally { await wk.close(); }
}

console.log(`\n  Safari's engine: ${wkVerdict}`);
if (wkVerdict.startsWith("UNREACHABLE") || wkVerdict === "not attempted") {
  /* NOT A PASS AND NOT A SILENT SKIP. Playwright's WebKit is not Safari and no report may say it
     is — but an engine nobody asked is the one thing this probe must never round up to green. */
  console.error("  ⚠ WEBKIT WAS NOT ASKED. Nothing here says anything about Safari; do not report that it does.");
  bad++;
}

console.log(bad ? `\nFAIL — ${bad} problem(s).` : `\nPASS — the board decodes at 2132x2132 in both games and both engines; screenshots in .planning/posed/`);
process.exit(bad ? 1 : 0);
