/* T-211 — WHEN THE QUESTION IS ABOUT DIFFERENT CAPTAINS, THE DIRECTOR MUST RE-AIM.
 *
 *   node scripts/qa/t211_reframe_on_new_captains_check.mjs          PASS/FAIL, exit 1 on FAIL
 *   node scripts/qa/t211_reframe_on_new_captains_check.mjs --seed=20260903
 *
 * WYATT, `INBOX-20260901T1332Z`: a call button must sit "directly beside the boats", "not on top of,
 * or next to, someone else". `T-013` fixed one road to that symptom (the pill evicting the circle).
 * THIS IS THE OTHER ROAD, and it is the bigger half: **there is no boat to be beside, because the
 * captain the button names is not on screen at all.**
 *
 * THE MECHANISM, read out of the code and then measured (not the other way round).
 * `src/ui/stage.js` asks the camera to frame the fight only when `S.frameKey` changes, and that key
 * was `turnSerial + the ask's TEXT`. `turnSerial` moves only when the wheel passes to another
 * captain (`stage.js`, `actor:`), so **two prompts inside one captain's turn that share a sentence
 * share a key** — and the director is told the shot is already right while the question is now
 * about somebody else entirely. `anchorSeats` — the captains the question IS about — was computed
 * one line above and left out of the key.
 *
 * IT IS REACHABLE WITHOUT CONTRIVING ANYTHING. `src/ui/flow.js:2538` asks **"Attack whom?"** — a
 * FIXED sentence whose seat-carrying options are whoever is attackable right now. Open it, go Back,
 * move, open it again: same turn, same sentence, a different set of captains, and under the old key
 * the camera never re-aims.
 *
 * WHAT THIS GATE ASSERTS, and it is deliberately narrower than "is the hull on screen".
 * It first makes the director PROVE, on this leg, that it can frame at all — by asking with a
 * unique sentence, which forces the key to change whatever the code under test does. Only then does
 * it pose five fights with THE SAME SENTENCE, which is the condition the fault needs. So a hull off
 * screen here means the camera did not try, not that it could not.
 *
 * ⛔ TWO ADMISSIONS, BOTH FOUND BY BEING WRONG FIRST, AND NEITHER IS A TUNING.
 * 1. THE WARM-UP IS REAL. For the first seconds after the opening ceremony the director re-aims for
 *    nothing at all — with the key forced to change every time, the first ONE TO THREE poses still
 *    left both hulls off screen, and how many varied by leg. The gate now waits for the director to
 *    demonstrate it is awake instead of assuming it. A leg that never wakes is NOT RUN.
 * 2. THE POSES ARE ON ROWS 2 AND BELOW. On a 390px phone the top board row cannot be brought fully
 *    into the band at all — 6 rows of 42 stayed off screen even with the key varying. That is a
 *    SEPARATE, still-open finding (filed on the Chart), and folding it in here would make this gate
 *    unable to pass for a reason it does not name.
 *
 * NOT IN `npm test`: it drives three real browsers for a few minutes. Named on `T-211`'s Chart row.
 */
import path from "node:path";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const SEED = Number((process.argv.find(a => a.startsWith("--seed=")) || "--seed=20260903").slice(7)) >>> 0;
/* The board is PINNED, not wished for — `startSinglePlayer` seeds itself from `Math.random`, so two
   runs are two different boards unless the well itself is made deterministic first. mulberry32 is
   the engine's own generator. Same reasoning, same code, as `t013_call_circle_beside_check.mjs`. */
const PIN_RANDOM = `(()=>{let s=${SEED}>>>0;Math.random=function(){s|=0;s=s+0x6D2B79F5|0;
  let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};return true;})()`;
const PORT = 8497, DBG = 9397;
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-t211g")));
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

/* ONE SENTENCE FOR EVERY JUDGED POSE — that is the condition under test, not an oversight. It is
   the shape of `flow.js`'s own "Attack whom?", whose text never varies while its boats move.
   `tail` is EMPTY for a judged pose. The warm-up passes a unique one, which is what makes the key
   change no matter what the code under test does — see WARMING UP below. */
const pose = (a, d, ax, ay, dx, dy, tail = "") => `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const b=await import('/src/ui/board.js');
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  g.players[${a}].pos=[${ax},${ay}]; g.players[${d}].pos=[${dx},${dy}];
  b.snapShipTo(${a}, g.players[${a}].pos); b.snapShipTo(${d}, g.players[${d}].pos);
  f.localAsk("Attack whom?${tail}",
    [{label:"Call "+(g.players[${a}].name||("Captain "+${a})),value:"a",seat:${a}},
     {label:"Call "+(g.players[${d}].name||("Captain "+${d})),value:"d",seat:${d}}]);
  return {ok:true};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

const SHIPSIG = `(async()=>{try{
  const b=await import('/src/ui/board.js');
  return (b.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return Math.round(r.left/8)+','+Math.round(r.top/8);}).join(' ');
}catch(e){return ''}})()`;

/* FULLY on screen, not merely intersecting — a hull hanging half off the edge is a different
   argument and this gate refuses to judge it either way. Same rule the T-013 gate uses. */
const MEASURE = `(async()=>{try{
  const bd=await import('/src/ui/board.js');
  const ap=document.getElementById('actionPanel'); if(!ap) return {err:'no actionPanel'};
  const btns=[...ap.querySelectorAll('.apBtn')].filter(b=>b.offsetWidth>4);
  if(!btns.length) return {err:'no buttons'};
  const vw=innerWidth, vh=innerHeight;
  const boats=(bd.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return {on:r.left>=0&&r.top>=0&&r.right<=vw&&r.bottom<=vh,
            l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)};});
  const rows=btns.map(bt=>{
    const seat=bt.dataset&&bt.dataset.seat!=null?+bt.dataset.seat:null;
    const mine=seat!=null&&boats[seat]?boats[seat]:null;
    return {seat, on: mine?mine.on:false, box: mine?[mine.l,mine.t,mine.r,mine.b]:null};});
  return {rows, vw, vh};
}catch(e){return {err:String(e.message).slice(0,200)}}})()`;

async function boot(tag, w, h, mobile){
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t211-fixed');true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
  await C.ev(PIN_RANDOM);
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
// rows 2 and below only — see the admission in the header
const POSES = [[2, 2, 5, 2], [2, 6, 5, 6], [2, 10, 5, 10], [1, 3, 9, 9], [9, 2, 10, 3]];

let judged = 0, framed = 0, notRun = 0;
const fails = [];

// pose, wait for the hulls to stop (bounded — a rect read mid-glide is a rect about to move), measure
async function poseAndMeasure(a, d, sq, tail){
  const p = await C.ev(pose(a, d, sq[0], sq[1], sq[2], sq[3], tail));
  if (!p || p.err) return { err: p ? p.err : "no result" };
  let last = "", same = 0;
  for (let i = 0; i < 60; i++){
    const sig = await C.ev(SHIPSIG);
    if (sig && sig === last){ if (++same >= 3) break; } else { same = 0; last = sig; }
    await sleep(250);
  }
  const m = await C.ev(MEASURE);
  return (!m || m.err) ? { err: m ? m.err : "no result" } : m;
}
const allOn = m => m.rows.filter(r => r.seat != null).every(r => r.on);

for (const [tag, w, h, mob] of LEGS){
  console.log(`\n--- ${tag} ${w}x${h} ---`);
  if (!(await boot(tag, w, h, mob))){ console.log("  NOT RUN — never reached a live radial board prompt"); notRun++; continue; }
  const shape = await C.ev(SHAPE);
  if (!shape || shape.err){ console.log(`  NOT RUN — ${shape ? shape.err : "no shape"}`); notRun++; continue; }
  const seats = [];
  for (let i = 0; i < shape.players && seats.length < 2; i++) if (i !== shape.me) seats.push(i);

  /* WARMING UP, AND IT IS A PRECONDITION THIS GATE OBSERVES RATHER THAN ASSUMES.
     For the first seconds after the opening ceremony the director does not re-aim for ANY prompt —
     measured: with a unique sentence every time (so the key changes whatever the code does), the
     first one to three poses still left both hulls off screen, and the count varied by leg. Judging
     those would blame this bug for something it does not cause.
     So: ask with a UNIQUE sentence until one lands both named hulls on screen. That is the director
     demonstrating, on this leg, that it CAN frame. Only then does judging start — and a leg where it
     never happens is NOT RUN, never a pass and never a fail. */
  let awake = false;
  for (let k = 0; k < 6 && !awake; k++){
    const m = await poseAndMeasure(seats[0], seats[1], POSES[k % POSES.length], ` [wake ${k}]`);
    if (m.err){ console.log(`  wake ${k}: ${m.err}`); continue; }
    awake = allOn(m);
    console.log(`  wake ${k}: director ${awake ? "IS framing — judging starts" : "did not frame yet"}`);
  }
  if (!awake){ console.log("  NOT RUN — the director never framed even with the key forced to change"); notRun++; continue; }

  for (const sq of POSES){
    const [ax, ay, dx, dy] = sq;
    // no tail: the same sentence every time, which is the condition under test
    const m = await poseAndMeasure(seats[0], seats[1], sq, "");
    if (m.err){ console.log(`  pose(${ax},${ay})/(${dx},${dy}): NOT RUN — ${m.err}`); notRun++; continue; }
    for (const r of m.rows){
      if (r.seat == null) continue;
      judged++;
      if (r.on){ framed++; continue; }
      fails.push(`${tag} pose(${ax},${ay})/(${dx},${dy}) seat ${r.seat}: hull at [${r.box}] is not fully inside ${m.vw}x${m.vh} — the director never re-aimed`);
    }
  }
}

console.log(`\n=== T-211 — DOES THE DIRECTOR RE-AIM WHEN THE CAPTAINS CHANGE BUT THE SENTENCE DOES NOT? ===`);
console.log(`  judged (a named captain per button) .. ${judged}`);
console.log(`  named captain fully on screen ....... ${framed}`);
console.log(`  NOT RUN ............................. ${notRun}`);
console.log(`  seed ................................ ${SEED}   (same board every run; --seed= to change it)`);
fails.forEach(f => console.log(`  FAIL  ${f}`));
killAll();
if (!judged){ console.log("\nFAIL — nothing was judged, so this gate proved nothing"); process.exit(1); }
if (fails.length){ console.log(`\nFAIL — ${fails.length} of ${judged} named captains are off screen when the question is asked`); process.exit(1); }
console.log(`\nPASS — all ${judged} named captains were framed, sentence unchanged`);
process.exit(0);
