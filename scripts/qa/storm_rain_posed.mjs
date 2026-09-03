// POSE THE STORM — photograph the rain, on a slow connection, at the moment a storm starts.
//
// The picture behind INBOX-20260901T1335Z's second sentence: "the 'fire the ovens' graphic loads
// dynamically when it is called, which will make it appear blank on slow connections." The storm's
// rain is the one picture in the game still in that state as of 2026-09-02 — it lives in a CSS
// `url(...)` and no JavaScript constant names it, so `sharedAssetUrls()` cannot see it.
//
//   node scripts/qa/storm_rain_posed.mjs --tag=before     (with cssAssetUrls() removed from preloadAssets)
//   node scripts/qa/storm_rain_posed.mjs --tag=after      (with the fix in place)
//
// POSED, NOT PLAYED (rule 26, docs/DRIVING-THE-GAME.md §5e): the storm is INJECTED by adding the
// game's own `.storming` class to `#boardwrap`, rather than sailing until the weather turns. Same
// board, same moment, both runs — so any difference between the two pictures is the preload and
// nothing else. Sailing to a real storm would give two different boards and settle nothing.
//
// The connection is throttled with the browser's own emulation so that "arrives late" is a state
// that can actually be photographed; on localhost every fetch lands instantly and the bug is
// invisible by construction.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome, sleep } from "../lib/cdp.mjs";
import { gameURL } from "../lib/chrome.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tag = (process.argv.find((a) => a.startsWith("--tag=")) || "--tag=shot").slice(6);
const OUT = path.join(ROOT, ".planning", "posed");
fs.mkdirSync(OUT, { recursive: true });

const c = await openChrome({
  W: 1280, H: 800, dbgPort: 9433, httpPort: 8433, serveRoot: ROOT,
  profileDir: path.join(ROOT, ".tmp-storm-pose-profile"), dsf: 1,
});
/* SEEDED BEFORE ANY DOCUMENT SCRIPT — `asset_posed_pair.mjs`'s own technique, and the first version
   of this script was missing it. Without it the two runs lay out two DIFFERENT boards, so the two
   pictures cannot be compared and calling them a matched pair would be false. The game has no seed
   parameter; replacing Math.random with a fixed mulberry32 before the first script runs is how a
   pose is made here. */
const SEED_SCRIPT = `
  (() => {
    let a = 0x9e3779b9;
    Math.random = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
`;

try {
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: SEED_SCRIPT });
  await c.send("Network.enable");
  await c.send("Network.clearBrowserCache");
  // A deliberately slow link — this is the condition his sentence is about.
  // 1.5 Mbps / 150ms — a real slow mobile link, and CHOSEN BY MEASUREMENT rather than by feel: at
  // 200 kbps the game's own 3.45 MB of art takes over two minutes to arrive and the welcome screen
  // never became clickable inside a sane timeout, so the pose could not be reached at all.
  await c.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: 1500 * 1024 / 8, uploadThroughput: 750 * 1024 / 8,
  });
  await c.nav(gameURL(8433));
  await sleep(1500);
  await c.ev("localStorage.clear()");
  await c.nav(gameURL(8433));

  // On a throttled link the welcome screen itself takes a while to be clickable, so WAIT for each
  // control rather than sleeping a guessed number of milliseconds — a driver that clicks nothing
  // and then reports a clean picture is the "measurement that cannot fail" this project keeps
  // paying for.
  const waitFor = async (js, what) => {
    for (let i = 0; i < 90; i++) { if (await c.ev(js)) return true; await sleep(500); }
    console.error(`FAIL — ${what} never appeared; this is not the pose.`);
    process.exit(1);
  };
  // The card must be BOX-VISIBLE, not merely present: on a throttled link the welcome screen paints
  // before its handlers are attached, and a click into that gap does nothing and reports nothing.
  await waitFor("(() => { const e = document.getElementById('choiceSolo'); return !!e && e.getBoundingClientRect().width > 10; })()", "the solo card");
  await sleep(1200);
  await c.ev("document.getElementById('choiceSolo').click()");
  // docs/DRIVING-THE-GAME.md §3's own wait, verbatim: `btnNameConfirm` is in the DOM from boot, so
  // waiting on its existence returns instantly and the confirm fires into a closed modal. Two runs
  // were lost to that on 2026-08-14; this is the wait that file says to use.
  await waitFor("(() => { const b = document.getElementById('btnNameConfirm'); return !!(b && b.offsetParent); })()", "the name box");
  await c.ev("document.getElementById('nameModalInput').value='Probe'");
  await c.ev("document.getElementById('btnNameConfirm').click()");

  let started = false;
  for (let i = 0; i < 60; i++) {
    started = await c.ev(`(async()=>{ if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;} const g=window.appState.game; return !!(g&&g.players&&g.players.some(p=>p.strategy==='human')); })()`);
    if (started) break;
    await sleep(400);
  }
  if (!started) { console.error("FAIL — no solo game started; this is not the pose and the picture would mean nothing."); process.exit(1); }

  /* ⚠ WHAT THIS POSE MEASURES, AND WHAT IT DELIBERATELY GAVE UP ON, because the first version was
     wrong and the correction is worth more than the picture.
     The first attempt injected the game's own `.storming` class onto `#boardwrap` and photographed
     the rain. It came back with **0 rain layers**: `#stormOverlay .rlayer` elements do not exist
     until the game builds them for a real storm, so the class alone paints nothing, requests
     nothing, and a screenshot of it proves nothing. A picture of an element that is not there is
     not evidence of anything.
     So the pose became the honest question instead: **on a slow link, has the rain texture arrived
     BEFORE any storm needs it?** That is the whole of Wyatt's sentence, it has a yes/no answer, and
     it is the same pose before and after — a solo voyage begun on a 1.5 Mbps link. */
  const settle = Date.now();
  let rain = null;
  /* The poll window and the photograph are the SAME 45 seconds, deliberately: a run that polled
     until it FOUND something and a run that polled until it GAVE UP would photograph two different
     moments, which is the fault the note below the loop describes. */
  for (let i = 0; i < 45; i++) {
    rain = await c.ev(`(() => {
      const e = performance.getEntriesByType('resource').find(e => /rain-streaks/.test(e.name));
      const res = performance.getEntriesByType('resource').filter(e => { try { return new URL(e.name).pathname.includes('/assets/'); } catch { return false; } });
      return { rainAt: e ? +(e.responseEnd/1000).toFixed(2) : null, assets: res.length,
               lastAsset: +(res.reduce((n,x)=>Math.max(n,x.responseEnd),0)/1000).toFixed(2) };
    })()`);
    if (rain && rain.rainAt !== null) break;
    await sleep(1000);
  }
  const waited = ((Date.now() - settle) / 1000).toFixed(1);

  /* ⚠ PHOTOGRAPH BOTH RUNS AT THE SAME ELAPSED TIME, and this line was earned by getting it wrong.
     The first pair broke its polling loop the moment the rain arrived — so the "after" shot was
     taken at 9s and the "before" shot at 91s, and one island was still mid-load in the earlier one.
     Two pictures taken at different moments are not a pair; the difference they show is the clock,
     not the change. Whoever reads them would have seen a regression that does not exist. */
  const PHOTO_AT = 45000;
  while (Date.now() - settle < PHOTO_AT) await sleep(500);
  const shot = path.join(OUT, `storm-rain-${tag}.png`);
  await c.shot(shot);

  console.log(`--tag=${tag}`);
  console.log(`  a solo voyage is under way on a 1.5 Mbps link, ${waited}s after it began`);
  console.log(`  pictures fetched so far: ${rain.assets}, the last at ${rain.lastAsset}s`);
  console.log(`  the storm's rain texture arrived at: ${rain.rainAt === null ? "NEVER — it waits for the first storm" : rain.rainAt + "s, before any storm asked for it"}`);
  console.log(`  picture: ${path.relative(ROOT, shot)}`);
} finally {
  await c.close();
}
