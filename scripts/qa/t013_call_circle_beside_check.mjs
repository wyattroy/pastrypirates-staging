/* T-013 — A CALL CIRCLE MUST STAND BESIDE THE CAPTAIN IT NAMES.
 *
 *   node scripts/qa/t013_call_circle_beside_check.mjs            PASS/FAIL, exit 1 on FAIL
 *   node scripts/qa/t013_call_circle_beside_check.mjs --red=nudge   plant the fault, prove it bites
 *
 * WYATT, TWICE — W5-2 and INBOX-20260901T1332Z: the buttons that call the battling captains must be
 * "directly beside the boats — side, top or bottom", and "not on top of, or next to, someone else".
 *
 * WHAT THIS GATE IS, AND WHAT IT IS NOT. `t013_which_instrument.mjs` REPORTS — it prints ANCHORED
 * vs STRANDED and always exits 0, because its job was to settle which of two probes was honest.
 * This one JUDGES, on the one statement that is his: a circle whose captain is standing right there
 * on screen has to be beside that captain.
 *
 * ⛔ IT IS POSED, AND THE FIRST VERSION ONLY SAID SO. This header claimed "the same seeded board
 * every run" while `startSinglePlayer` (`src/ui/flow.js:3232`) took `Math.floor(Math.random()*1e9)`
 * and nothing here set it — so every run built a DIFFERENT board, the count of rows it could even
 * judge swung 23 → 14 between two runs, and a before/after read off those two numbers was a rate
 * over a shifting sample: the exact thing rule 26 exists to replace, wearing rule 26's own words.
 * Caught by CEO 167. `--seed=` now pins it (default `T013_SEED`), so before and after are the same
 * board and the comparison is an A/B rather than two samples.
 *
 * ⚠ IT JUDGES ONLY THE ROWS IT CAN ANSWER. When the named hull is off screen there is no boat to be
 * beside, and calling that "wrong" would be a measurement that cannot fail (rule 6 — and CEO 146
 * caught exactly that fault in this item's previous instrument). Those rows are counted and printed
 * as UNANSWERABLE and they do not decide the verdict. That is a SECOND, still-open mechanism.
 *
 * THE THRESHOLD IS DERIVED, NOT TUNED: one petal (the circle's own rendered width). A circle placed
 * beside its boat sits a few px off the hull; one whole petal of slack is more room than the
 * placement rule ever asks for, so anything beyond it was put there by something else.
 *
 * NOT IN `npm test`, DELIBERATELY: it drives three real browsers for about four minutes, and the
 * 114-gate chain is a fast static suite. It is this item's own check and is named on its Chart row.
 */
import path from "node:path";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const RED = (process.argv.find(a => a.startsWith("--red=")) || "").slice(6);
/* THE BOARD IS PINNED HERE, NOT WISHED FOR. `startSinglePlayer` takes its voyage seed from
   `Math.random()`, and the bot temperaments and the sea sightings come from the same well — so the
   only way to hand two runs the same board is to make that well deterministic before the game is
   started. mulberry32 is the generator the engine itself uses (see PROJECT: "the multiplayer engine
   is seeded (mulberry32)"), so this is the game's own arithmetic, not a second one. */
const SEED = Number((process.argv.find(a => a.startsWith("--seed=")) || "--seed=20260903").slice(7)) >>> 0;
const PIN_RANDOM = `(()=>{let s=${SEED}>>>0;Math.random=function(){s|=0;s=s+0x6D2B79F5|0;
  let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};return true;})()`;
const PORT = 8498, DBG = 9398;
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-t013g")));
const url = serve(PORT);
const C = await attach(DBG);

const ADVANCE = `(()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis)
    .find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro';}
  return null;})()`;

const SHAPE = `(async()=>{try{
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  return {players:g.players.length, me:st.mySeat};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

const pose = (a, d, ax, ay, dx, dy) => `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const b=await import('/src/ui/board.js');
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  g.players[${a}].pos=[${ax},${ay}]; g.players[${d}].pos=[${dx},${dy}];
  b.snapShipTo(${a}, g.players[${a}].pos); b.snapShipTo(${d}, g.players[${d}].pos);
  f.localAsk("\\u2694\\uFE0F "+(g.players[${a}].name||"Captain")+" \\u2014 a battle's brewing! Call the winner \\u2014 it's free, and ye get 2\\uD83C\\uDF15 if yer right.",
    [{label:"Call "+(g.players[${a}].name||("Captain "+${a})),value:"a",seat:${a}},
     {label:"Call "+(g.players[${d}].name||("Captain "+${d})),value:"d",seat:${d}}]);
  return {ok:true};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

/* THE RED PROOF. Not a change to the game and not a lowered threshold: it shoves one already-placed
   circle 200px sideways, which is precisely the fault this gate claims to see. If the gate stays
   green through that, it is measuring something other than what it names (rule 6). */
const NUDGE = `(()=>{const ap=document.getElementById('actionPanel'); if(!ap) return false;
  const b=[...ap.querySelectorAll('.apBtn')].filter(x=>x.offsetWidth>4)[0]; if(!b) return false;
  b.style.left=(parseFloat(b.style.left||0)+200)+'px'; return true;})()`;

const SHIPSIG = `(async()=>{try{
  const b=await import('/src/ui/board.js');
  return (b.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return Math.round(r.left/8)+','+Math.round(r.top/8);}).join(' ');
}catch(e){return ''}})()`;

const MEASURE = `(async()=>{try{
  const bd=await import('/src/ui/board.js');
  const ap=document.getElementById('actionPanel'); if(!ap) return {err:'no actionPanel'};
  const btns=[...ap.querySelectorAll('.apBtn')].filter(b=>b.offsetWidth>4);
  if(!btns.length) return {err:'no buttons'};
  const vw=innerWidth, vh=innerHeight;
  const D=Math.round(btns[0].offsetWidth||66);
  const boats=(bd.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    /* FULLY on screen, not merely intersecting: a hull hanging half off the edge is a different
       argument and this gate refuses to judge it either way. */
    return {l:r.left,t:r.top,r:r.right,b:r.bottom, on:r.left>=0&&r.top>=0&&r.right<=vw&&r.bottom<=vh};});
  const gap=(a,c)=>{const dx=Math.max(c.l-a.r,a.l-c.r,0),dy=Math.max(c.t-a.b,a.t-c.b,0);
    return Math.round(Math.hypot(dx,dy));};
  const rows=btns.map(bt=>{const r0=bt.getBoundingClientRect();
    const r={l:r0.left,t:r0.top,r:r0.right,b:r0.bottom};
    const seat=bt.dataset&&bt.dataset.seat!=null?+bt.dataset.seat:null;
    const mine=seat!=null&&boats[seat]?boats[seat]:null;
    let nearest=null,nd=1e9; boats.forEach((bo,i)=>{const g=gap(r,bo); if(g<nd){nd=g;nearest=i;}});
    return {seat, on: mine?mine.on:false, gapToMine: mine?gap(r,mine):null, nearest};});
  return {D, rows};
}catch(e){return {err:String(e.message).slice(0,200)}}})()`;

async function boot(tag, w, h, mobile){
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  // a FIXED player id too — `pp_id` is what the stats page excludes by, and a random one is one
  // more thing that differs between the run you measured before and the run you measured after
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t013g-fixed');true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await C.ev(PIN_RANDOM);          // BEFORE the game is started — see the SEED note at the top
  await sleep(1000);
  await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, `${tag}: home`);
  await C.ev(`document.getElementById('choiceSolo').click();true`);
  await sleep(800);
  await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, `${tag}: name`);
  await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
  await C.ev(`document.getElementById('btnNameConfirm').click();true`);
  for (let i = 0; i < 90; i++){
    const live = await C.ev(`(()=>{const b=document.getElementById('pp4Prompt');const a=document.getElementById('actionPanel');
      return !!(b&&b.classList.contains('radial')&&a&&!a.dataset.pp4Stage&&a.querySelector('.apBtn'))})()`);
    if (live) return true;
    await C.ev(ADVANCE); await sleep(900);
  }
  return false;
}

const LEGS = [["phone", 390, 844, true], ["phone-short", 390, 664, true], ["tablet", 768, 1024, false]];
const N = 12;
const POSES = [];
for (const row of [0, 1, 2, Math.floor(N / 2), N - 2]) POSES.push([2, row, 5, row]);
POSES.push([1, 0, 2, 1]);
POSES.push([Math.max(0, N - 3), 0, Math.max(0, N - 2), 1]);

let judged = 0, beside = 0, notRun = 0, unanswerable = 0;
const fails = [];

for (const [tag, w, h, mob] of LEGS){
  console.log(`\n--- ${tag} ${w}x${h} ---`);
  if (!(await boot(tag, w, h, mob))){ console.log("  NOT RUN — never reached a live radial board prompt"); notRun++; continue; }
  const shape = await C.ev(SHAPE);
  if (!shape || shape.err){ console.log(`  NOT RUN — ${shape ? shape.err : "no shape"}`); notRun++; continue; }
  const seats = [];
  for (let i = 0; i < shape.players && seats.length < 2; i++) if (i !== shape.me) seats.push(i);
  for (const [ax, ay, dx, dy] of POSES){
    const p = await C.ev(pose(seats[0], seats[1], ax, ay, dx, dy));
    if (!p || p.err){ console.log(`  pose(${ax},${ay})/(${dx},${dy}): NOT RUN — ${p ? p.err : "no result"}`); notRun++; continue; }
    // wait for the hulls themselves to stop, bounded — a rect read mid-glide is a rect about to move
    let last = "", same = 0;
    for (let i = 0; i < 60; i++){
      const sig = await C.ev(SHIPSIG);
      if (sig && sig === last){ if (++same >= 3) break; } else { same = 0; last = sig; }
      await sleep(250);
    }
    if (RED === "nudge") await C.ev(NUDGE);
    const m = await C.ev(MEASURE);
    if (!m || m.err){ console.log(`  pose(${ax},${ay})/(${dx},${dy}): NOT RUN — ${m ? m.err : "no result"}`); notRun++; continue; }
    for (const r of m.rows){
      if (r.seat == null) continue;
      if (!r.on){ unanswerable++; continue; }
      judged++;
      if (r.gapToMine <= m.D){ beside++; continue; }
      fails.push(`${tag} pose(${ax},${ay})/(${dx},${dy}) seat ${r.seat}: ${r.gapToMine}px from its own hull (one petal is ${m.D}px), nearest hull is seat ${r.nearest}`);
    }
  }
}

console.log(`\n=== T-013 — IS THE CALL CIRCLE BESIDE ITS CAPTAIN? ===`);
console.log(`  judged (named hull fully on screen) ... ${judged}`);
console.log(`  beside its own captain ............... ${beside}`);
console.log(`  UNANSWERABLE (named hull off screen) . ${unanswerable}   <- a second, still-open mechanism; not judged`);
console.log(`  NOT RUN .............................. ${notRun}`);
console.log(`  seed ................................. ${SEED}   (same board every run; --seed= to change it)`);
if (RED) console.log(`  RED PROOF ACTIVE: --red=${RED}`);
fails.forEach(f => console.log(`  FAIL  ${f}`));
killAll();
if (!judged){ console.log("\nFAIL — nothing was judged, so this gate proved nothing"); process.exit(1); }
if (fails.length){ console.log(`\nFAIL — ${fails.length} of ${judged} call circles are not beside the captain they name`); process.exit(1); }
console.log(`\nPASS — all ${judged} judged call circles stand beside their own captain`);
process.exit(0);
