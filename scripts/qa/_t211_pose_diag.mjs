/* T-211 DIAGNOSTIC — NOT A GATE. It never judges and it always exits 0.
 *
 *   node scripts/qa/_t211_pose_diag.mjs
 *
 * ONE QUESTION ONLY, and it is falsifier A+B of
 * `.planning/wyclau/PREDICTION-20260903T1215Z-T-211.md`: are the UNANSWERABLE rows in
 * `t013_call_circle_beside_check.mjs` (34 of 42) produced by the PROBE re-posing the same sentence,
 * or by something a player would meet?
 *
 * It walks the SAME seven poses on the SAME pinned board twice per leg:
 *   run A — every pose asks the SAME sentence (exactly what the gate does today)
 *   run B — every pose asks a DISTINCT sentence, so `S.frameKey` genuinely changes
 * and prints, per pose, how many named hulls are FULLY on screen. Same measurement the gate uses.
 *
 * Throwaway. Delete it when T-211 closes.
 */
import path from "node:path";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const SEED = Number((process.argv.find(a => a.startsWith("--seed=")) || "--seed=20260903").slice(7)) >>> 0;
const PIN_RANDOM = `(()=>{let s=${SEED}>>>0;Math.random=function(){s|=0;s=s+0x6D2B79F5|0;
  let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};return true;})()`;
const PORT = 8499, DBG = 9399;
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-t211")));
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

// `tail` is what makes run B's sentence distinct; run A passes "".
const pose = (a, d, ax, ay, dx, dy, tail) => `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const b=await import('/src/ui/board.js');
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  g.players[${a}].pos=[${ax},${ay}]; g.players[${d}].pos=[${dx},${dy}];
  b.snapShipTo(${a}, g.players[${a}].pos); b.snapShipTo(${d}, g.players[${d}].pos);
  f.localAsk("\\u2694\\uFE0F "+(g.players[${a}].name||"Captain")+" \\u2014 a battle's brewing! Call the winner \\u2014 it's free, and ye get 2\\uD83C\\uDF15 if yer right.${tail}",
    [{label:"Call "+(g.players[${a}].name||("Captain "+${a})),value:"a",seat:${a}},
     {label:"Call "+(g.players[${d}].name||("Captain "+${d})),value:"d",seat:${d}}]);
  return {ok:true};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

const SHIPSIG = `(async()=>{try{
  const b=await import('/src/ui/board.js');
  return (b.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return Math.round(r.left/8)+','+Math.round(r.top/8);}).join(' ');
}catch(e){return ''}})()`;

// the gate's own MEASURE, plus the frame key so the mechanism is observed rather than inferred
const MEASURE = `(async()=>{try{
  const bd=await import('/src/ui/board.js');
  const sg=await import('/src/ui/stage.js');
  const ap=document.getElementById('actionPanel'); if(!ap) return {err:'no actionPanel'};
  const btns=[...ap.querySelectorAll('.apBtn')].filter(b=>b.offsetWidth>4);
  if(!btns.length) return {err:'no buttons'};
  const vw=innerWidth, vh=innerHeight;
  const boats=(bd.boardShipEls()||[]).map(e=>{const r=e.getBoundingClientRect();
    return {on:r.left>=0&&r.top>=0&&r.right<=vw&&r.bottom<=vh};});
  const rows=btns.map(bt=>{
    const seat=bt.dataset&&bt.dataset.seat!=null?+bt.dataset.seat:null;
    return {seat, on: seat!=null&&boats[seat]?boats[seat].on:false};});
  const fk=(sg.__ppFrameKey&&sg.__ppFrameKey())||null;
  return {rows, fk};
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
const N = 12;
const POSES = [];
for (const row of [0, 1, 2, Math.floor(N / 2), N - 2]) POSES.push([2, row, 5, row]);
POSES.push([1, 0, 2, 1]);
POSES.push([Math.max(0, N - 3), 0, Math.max(0, N - 2), 1]);

const tally = { A: { on: 0, off: 0 }, B: { on: 0, off: 0 } };
const perPose = { A: [], B: [] };

for (const [tag, w, h, mob] of LEGS){
  console.log(`\n--- ${tag} ${w}x${h} ---`);
  if (!(await boot(tag, w, h, mob))){ console.log("  NOT RUN — never reached a live radial board prompt"); continue; }
  const shape = await C.ev(SHAPE);
  if (!shape || shape.err){ console.log(`  NOT RUN — ${shape ? shape.err : "no shape"}`); continue; }
  const seats = [];
  for (let i = 0; i < shape.players && seats.length < 2; i++) if (i !== shape.me) seats.push(i);

  for (const run of ["A", "B"]){
    console.log(`  run ${run} — ${run === "A" ? "SAME sentence every pose (what the gate does)" : "DISTINCT sentence every pose"}`);
    for (let pi = 0; pi < POSES.length; pi++){
      const [ax, ay, dx, dy] = POSES[pi];
      const tail = run === "B" ? ` [${run}${pi}]` : "";
      const p = await C.ev(pose(seats[0], seats[1], ax, ay, dx, dy, tail));
      if (!p || p.err){ console.log(`    pose ${pi}: NOT RUN — ${p ? p.err : "no result"}`); continue; }
      let last = "", same = 0;
      for (let i = 0; i < 60; i++){
        const sig = await C.ev(SHIPSIG);
        if (sig && sig === last){ if (++same >= 3) break; } else { same = 0; last = sig; }
        await sleep(250);
      }
      const m = await C.ev(MEASURE);
      if (!m || m.err){ console.log(`    pose ${pi}: NOT RUN — ${m ? m.err : "no result"}`); continue; }
      const on = m.rows.filter(r => r.seat != null && r.on).length;
      const off = m.rows.filter(r => r.seat != null && !r.on).length;
      tally[run].on += on; tally[run].off += off;
      perPose[run].push(`${tag} pose ${pi}: on ${on} / off ${off}`);
      console.log(`    pose ${pi} (${ax},${ay})/(${dx},${dy}): named hull fully on screen ${on}, off ${off}`);
    }
  }
}

console.log(`\n=== T-211 DIAGNOSTIC — is the UNANSWERABLE count the probe's own doing? ===`);
console.log(`  run A (same sentence, frame key never changes) : on ${tally.A.on}  off ${tally.A.off}`);
console.log(`  run B (distinct sentence, frame key changes)   : on ${tally.B.on}  off ${tally.B.off}`);
console.log(`  seed ${SEED}`);
console.log(`\n  This script JUDGES NOTHING and exits 0. It answers falsifiers A and B only.`);
killAll();
process.exit(0);
