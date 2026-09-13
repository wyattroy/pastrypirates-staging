/* IS THE BOARD A SQUARE, AND IS THE WHOLE PLAQUE ON THE SCREEN?
   Wyatt, 2026-09-12: "I wanted the board to always be a square and the captain's box ratios to be
   related to the space left underneath a square board as a constraint." And later the same night,
   with a photograph of his phone and one of his laptop: "the bottom of the captain's box is cut off
   -- the board has to shrink by about 15 pixels, i'd guess. measure it."

   ⚠ WHY THIS WAS REWRITTEN. The first version asked "are all four captains' ROWS on screen?" and
   printed 4/4 at every size — while the plaque's own bottom rope and padding hung off the screen by
   up to 38px. Rows on screen is not plaque on screen. It now asks the question he asked: does the
   box's own bottom edge sit inside the window? And it FAILS, with an exit code, when it does not.

   THE SIZES ARE HIS. His phone is an iPhone 13 mini (docs/QA-PROCESS.md, "HIS PHONE"): 375 wide,
   and Safari hands the page 684px with its bar compact and 667px with it expanded — both checked. 711x840
   is his laptop's Safari window from the photograph. The rest are the sizes that failed on
   2026-09-12 before the fix: 390x664 (29px cut), 375x668 (10), 700x800 (31), 1024x768 (38). */
import path from "node:path"; import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT=8980+(process.pid%25), DBG=9680+(process.pid%25);
const url=serve(PORT); launch(DBG, path.join(REPO,`.tmp-sq-${process.pid}`));
const C=await attach(DBG);
let bad=0;
const waitFor=async(e,ms=40000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(await C.ev(e))return 1}catch{}await sleep(200)}throw new Error("timed out: "+e)};
const M=`JSON.stringify((()=>{
  const R=e=>e&&e.getBoundingClientRect();
  const bw=R(document.getElementById('boardwrap'));
  const cap=R(document.getElementById('pp4Cap'));
  const vh=window.innerHeight, vw=window.innerWidth;
  return { vw, vh,
    boardW: bw? Math.round(bw.width):0, boardH: bw? Math.round(bw.height):0,
    boardTop: bw? Math.round(bw.top):0,
    capTop: cap? Math.round(cap.top):0, capBottom: cap? Math.round(cap.bottom):0, capH: cap? Math.round(cap.height):0,
    side: document.body.classList.contains('pp4Side') };
})())`;
/* ⚠ HIS PHONE'S HEIGHTS ARE THE PAGE'S, NOT THE SCREEN'S. The first draft of this list used 711 and
   728 — where Safari's bar starts on his SCREEN, measured off his recording. But this page has no
   viewport-fit=cover, so it begins UNDER the 44px status bar: the page Safari actually hands the
   game is 711-44 = 667 tall with the bar expanded and 728-44 = 684 with it compact. The check
   passed at 711 with 33px to spare while his real screen was cutting 19px off — the wrong
   number, not a working layout. */
const sizes=[[375,667,1,"HIS iPhone 13 mini, Safari bar expanded"],[375,684,1,"HIS iPhone 13 mini, Safari bar compact"],
             [711,840,0,"HIS laptop Safari window"],
             [375,668,1,"short 375 phone"],[390,664,1,"short 390 phone"],[390,844,1,"iPhone 14/15"],
             [700,800,0,"narrow window"],[768,1024,1,"tablet"],[1024,768,0,"landscape tablet"],[1280,800,0,"laptop"]];
try{
  for (const [w,h,m,label] of sizes) {
    await C.send("Emulation.setDeviceMetricsOverride",{width:w,height:h,deviceScaleFactor:m?3:2,mobile:!!m});
    await C.ev(`location.href=${JSON.stringify(url)}`).catch(()=>{}); await sleep(900);
    await C.ev(`localStorage.clear()`); await C.ev(`location.reload()`).catch(()=>{}); await sleep(2200);
    await waitFor(`!!document.getElementById('choiceSolo')`);
    await C.ev(`document.getElementById('choiceSolo').click()`);
    await waitFor(`(()=>{const b=document.getElementById('btnNameConfirm');return !!(b&&b.offsetParent)})()`);
    await C.ev(`document.getElementById('nameModalInput').value='Wyargh'`);
    await C.ev(`document.getElementById('btnNameConfirm').click()`);
    await waitFor(`(()=>{const p=document.getElementById('actionPanel');return !!(p&&/ahoy/i.test(p.textContent))})()`);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/yarr/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(700);
    await C.ev(`(()=>{const b=[...document.querySelectorAll('#actionPanel .apBtn')].find(x=>/start/i.test(x.textContent));if(b)b.click()})()`);
    await waitFor(`document.querySelectorAll('#players .player-row').length>=4`);
    await sleep(1500);
    /* the recipe band is part of the box's height, so the box is judged AFTER a recipe is picked */
    await C.ev(`(()=>{const c=document.querySelector('#actionPanel .apBtn.recipeCard'); if(c)c.click();})()`).catch(()=>{});
    await sleep(700);
    await C.ev(`(()=>{const p=[...document.querySelectorAll('#actionPanel .apBtn, #actionPanel button')].find(b=>/bake this/i.test(b.textContent)); if(p)p.click();})()`).catch(()=>{});
    await sleep(2600);   // three geometry beats (~900ms each) after the band appears
    const o = JSON.parse(await C.ev(M));
    const square = o.side || Math.abs(o.boardW - o.boardH) <= 2;
    const over = o.capBottom - o.vh;
    const plaqueOn = o.side || over <= 0;
    const verdict = (square && plaqueOn) ? "PASS" : "FAIL";
    if (verdict === "FAIL") bad++;
    console.log(`${verdict} ${label.padEnd(40)} ${w}x${h}  board ${o.boardW}x${o.boardH}${o.side?" (side column)":""}` +
      `  box ${o.capTop}..${o.capBottom} of ${o.vh}` +
      (plaqueOn ? `  (${-over}px to spare)` : `  ⛔ ${over}px of plaque OFF the screen`) +
      (square ? "" : "  ⛔ board NOT square"));
  }
} catch(e){ console.log("PROBE FAILED: "+(e&&e.message||e)); bad++; } finally { await killAll(); }
console.log(bad ? `\nFAILED — ${bad} size(s)` : "\nPASSED — the board is square and the whole plaque is on screen at every size");
process.exit(bad?1:0);
