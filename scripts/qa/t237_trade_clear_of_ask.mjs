/* T-237 — DOES A TRADE-OFFER CIRCLE SIT ON THE QUESTION IT ANSWERS, AFTER THE T-235 BIGGER-CIRCLE FIX?
 *
 *   node scripts/qa/t237_trade_clear_of_ask.mjs        exit 0 = the pill is never covered
 *
 * THE FINDING THIS EXISTS FOR. Sea trial 2026-09-03T2031Z, build 2026.09.03.4 (the T-235 fix
 * already shipped), leg `crew-desktop-guest`: a structural `no-cover-ask` hit on
 * `crew-desktop-guest-021-settled.png` — the "Flaky Jack" trade-offer circle drawn across the
 * right edge of its own prompt's ask pill ("Fer yer Cacao Pods the table…", flow.js:2209). CEO
 * 184 predicted this risk when the T-235 fix shipped bigger circles (finding 5, "bigger circles
 * cover more of the ask pill … NOT yet measured either way") and CEO 198 verified the trial's hit
 * is real (not a cross-prompt false positive) but could not prove causation without pixel tooling
 * to compare disc sizes. This is that measurement.
 *
 * POSED, NOT SAILED (CLAUDE.md rule 26). Sibling of scripts/qa/w54_call_clear_of_ask.mjs, same
 * geometry, same settle-detection, same overlap math — but this poses humanTrade()'s "table
 * answers" prompt (flow.js:2160-2210) instead of collectSideBets()'s "call the winner" prompt.
 * THE ANCHOR IS DIFFERENT AND THAT IS THE POINT: a trade opt carries no `seat` field
 * (flow.js:2170-2188 never sets one), so stage.js's `onBoats` branch never fires for this prompt
 * — the fan anchors to the ASKER'S OWN boat (`stage.js:2931`, `boatUXY(appState.mySeat ?? 0)`),
 * not to a named opponent. So this probe walks the ASKER's boat across the board, not a pair of
 * named captains.
 *
 * THE GEOMETRY IS THE GATE'S OWN, NOT A RE-DERIVATION — `near()` below is copied in shape from
 * `shapeOverlap` in scripts/lib/checks.mjs (circle centre to nearest point on the box, tol 4), the
 * same instrument CEO 198 verified against the real screenshot.
 *
 * MEASUREMENT ONLY — this poses the exact opts/short/msg shape humanTrade() (flow.js) already
 * builds, via localAsk() directly, so nothing about the trade rule, price or invariant (I1-I4,
 * docs/TRADE-SYSTEM.md) is exercised or changed; only the RENDERED layout is measured.
 */
import path from "node:path";
import { serve, launch, attach, killAll, sleep, REPO } from "../mp_rig.mjs";
import { freshProfileDir } from "../lib/cdp.mjs";

const PORT = 8497, DBG = 9397;
const SHOOT_ALL = process.argv.includes("--shoot-all");
const TAG = (process.argv.find(a => a.startsWith("--tag=")) || "").slice(6);
const url = serve(PORT);
launch(DBG, freshProfileDir(path.join(REPO, ".tmp-chrome-t237")));
const C = await attach(DBG);

const ADVANCE = `(()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis)
    .find(b=>/arrgh|aye|continue|set sail|onward|begin|start/i.test((b.textContent||'')));
  if(go){go.click();return 'intro:'+(go.textContent||'').trim().slice(0,16);}
  return null;})()`;

const SHAPE = `(async()=>{try{
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  return {pos:JSON.stringify(g.players[0].pos), n:g.N||g.n||g.size||null,
    players:g.players.length, me:st.mySeat};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

/* Build the exact prompt humanTrade() builds (flow.js:2160-2210), using the game's own helper
   functions so the label text, icon markup and multi-line `short` form are byte-for-byte what a
   real trade produces — not an approximation of it. Two scenarios per pose: an ACCEPT alongside a
   COUNTER carrying a crate icon and coins (the shape of the shot that caught the defect), and a
   COUNTER-only "instead" swap (the longest single line the real code can produce). */
const pose = (asker, r1, r2, ax, ay, scenario) => `(async()=>{try{
  const f=await import('/src/ui/flow.js');
  const b=await import('/src/ui/board.js');
  const sh=await import('/src/shared/index.js');
  const u=await import('/src/ui/util.js');
  const st=(await import('/src/state/index.js')).appState; const g=st.game; if(!g) return {err:'no game'};
  g.players[${asker}].pos=[${ax},${ay}];
  b.snapShipTo(${asker}, g.players[${asker}].pos);
  const want='cocoa';
  const bitsOf=(ing,coins)=>[ing?sh.ilabelImg(ing):null,coins?coins+'\\uD83C\\uDF15':null].filter(Boolean).join(' + ');
  const answerLines=[]; const opts=[];
  if('${scenario}'==='accept-and-counter'){
    answerLines.push(sh.iconImg(sh.CHECKMARK_IMG)+' '+u.pn(${r1})+' takes yer '+(sh.ilabelImg(want)||'offer'));
    opts.push({label:sh.iconImg(sh.CHECKMARK_IMG)+' '+u.pn(${r1})+' accepts',
      short:sh.iconImg(sh.CHECKMARK_IMG)+'<br>'+u.pn(${r1}),value:0});
    const bits=bitsOf('vanilla',3);
    answerLines.push('\\uD83D\\uDCB0 '+u.pn(${r2})+' wants '+bits+' <i>instead</i>');
    opts.push({label:'\\uD83D\\uDCB0 '+u.pn(${r2})+' wants '+bits,
      short:u.pn(${r2})+'<br>'+sh.iconImg(sh.ING_IMG.vanilla)+'+3\\uD83C\\uDF15',value:1});
  } else {
    const bits=bitsOf('vanilla',5);
    answerLines.push('\\uD83D\\uDCB0 '+u.pn(${r1})+' wants '+bits+' <i>instead</i>');
    opts.push({label:'\\uD83D\\uDCB0 '+u.pn(${r1})+' wants '+bits,
      short:u.pn(${r1})+'<br>'+sh.iconImg(sh.ING_IMG.vanilla)+'+5\\uD83C\\uDF15',value:0});
    const bits2=bitsOf('sugar',2);
    answerLines.push('\\uD83D\\uDCB0 '+u.pn(${r2})+' wants '+bits2+' <i>instead</i>');
    opts.push({label:'\\uD83D\\uDCB0 '+u.pn(${r2})+' wants '+bits2,
      short:u.pn(${r2})+'<br>'+sh.iconImg(sh.ING_IMG.sugar)+'+2\\uD83C\\uDF15',value:1});
  }
  opts.push({label:'\\uD83D\\uDEAB Walk away',value:-1});
  f.localAsk('Fer yer '+sh.ilabelImg(want)+' the table answers:<br>'+answerLines.join('<br>')+'<br>Take a deal, or walk away?',opts);
  return {ok:true};
}catch(e){return {err:String(e.message).slice(0,200)}}})()`;

const SETTLED = `(()=>{try{
  const ap=document.getElementById('actionPanel'); if(!ap) return '';
  const msg=ap.querySelector('.apMsg'); if(!msg) return '';
  const btns=[...ap.querySelectorAll('.apBtn')];
  const shown=btns.filter(b=>{const s=getComputedStyle(b); const r=b.getBoundingClientRect();
    return r.width>4 && s.visibility!=='hidden' && parseFloat(s.opacity||'1')>0.5;});
  if(!shown.length) return '';
  const q=v=>Math.round(v/8);
  const rect=e=>{const r=e.getBoundingClientRect();return q(r.left)+','+q(r.top)+','+q(r.width)+','+q(r.height);};
  return (msg.textContent||'').length+'|'+rect(msg)+'|'+shown.map(rect).join(';');
}catch(e){return ''}})()`;

const MEASURE = `(async()=>{try{
  const ap=document.getElementById('actionPanel'); if(!ap) return {err:'no actionPanel'};
  const box=document.getElementById('pp4Prompt');
  const msg=ap.querySelector('.apMsg'); if(!msg) return {err:'no .apMsg'};
  const btns=[...ap.querySelectorAll('.apBtn')].filter(b=>b.offsetWidth>4);
  if(!btns.length) return {err:'no buttons'};
  const R=e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
  const mr=R(msg);
  const near=(c,box2)=>{const cx=c.l+c.w/2, cy=c.t+c.h/2;
    const px=Math.max(box2.l,Math.min(cx,box2.r)), py=Math.max(box2.t,Math.min(cy,box2.b));
    return Math.min(c.w,c.h)/2 - Math.hypot(cx-px,cy-py);};
  const rows=btns.map(bt=>{const r=R(bt); const d=near(r,mr);
    return {label:(bt.textContent||'').trim().slice(0,18),
      x:Math.round(r.l), y:Math.round(r.t), w:Math.round(r.w), h:Math.round(r.h),
      onAsk: d > 4, deep: Math.round(d*100)/100};});
  return {radial: !!(box&&box.classList.contains('radial')),
    stage: ap.dataset?(ap.dataset.pp4Stage||null):null,
    msg:(msg.textContent||'').trim().slice(0,40),
    pillTop:Math.round(mr.t), pillH:Math.round(mr.h), pillL:Math.round(mr.l), pillW:Math.round(mr.w),
    rows, covered: rows.some(r=>r.onAsk)};
}catch(e){return {err:String(e.message).slice(0,160)}}})()`;

async function boot(tag, w, h, mobile){
  await C.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: load`);
  await C.ev(`localStorage.clear();localStorage.setItem('pp_id','t237-'+Math.floor(Math.random()*1e9));true`);
  await C.goto(url);
  await C.waitFor(`document.readyState==='complete'`, 30000, `${tag}: reload`);
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

const LEGS = [["phone", 390, 844, true], ["tablet", 768, 1024, false], ["desktop", 1400, 900, false]];
let covered = 0, measured = 0, notRun = 0, stillMoving = 0;
const shots = [];

for (const [tag, w, h, mob] of LEGS){
  console.log(`\n--- ${tag} ${w}x${h} ---`);
  if (!(await boot(tag, w, h, mob))){ console.log("  NOT RUN — never reached a live radial board prompt"); notRun++; continue; }
  const shape = await C.ev(SHAPE);
  if (!shape || shape.err){ console.log(`  NOT RUN — ${shape ? shape.err : "no shape"}`); notRun++; continue; }
  console.log(`  board: pos=${shape.pos} n=${shape.n} players=${shape.players} me=${shape.me}`);
  const me = shape.me ?? 0;
  const others = [];
  for (let i = 0; i < shape.players && others.length < 2; i++) if (i !== me) others.push(i);
  if (others.length < 2){ console.log("  NOT RUN — need two other captains for the answer lines"); notRun++; continue; }
  const N = shape.n || 12;
  const POSES = [];
  for (const row of [0, 1, 2, Math.floor(N / 2), N - 2]) POSES.push([2, row]);
  POSES.push([0, 0]);            // top-left corner
  POSES.push([N - 1, 0]);        // top-right corner
  for (const [ax, ay] of POSES){
    for (const scenario of ["accept-and-counter", "counter-and-counter"]){
      const p = await C.ev(pose(me, others[0], others[1], ax, ay, scenario));
      if (!p || p.err){ console.log(`  pose(${ax},${ay}) ${scenario}: POSE FAILED — ${p ? p.err : "no result"}`); notRun++; continue; }
      let last = "", same = 0, settled = false;
      for (let i = 0; i < 50; i++){
        const sig = await C.ev(SETTLED);
        if (sig && sig === last){ if (++same >= 3){ settled = true; break; } } else { same = 0; last = sig; }
        await sleep(200);
      }
      const m = await C.ev(MEASURE);
      if (!m || m.err){ console.log(`  pose(${ax},${ay}) ${scenario}: NOT RUN — ${m ? m.err : "no measurement"}`); notRun++; continue; }
      if (!m.radial){ console.log(`  pose(${ax},${ay}) ${scenario}: NOT RUN — not radial (stage=${m.stage})`); notRun++; continue; }
      measured++;
      const flag = m.covered ? "  <-- COVERED" : "";
      if (!settled) stillMoving++;
      console.log(`  ship (${ax},${ay}) ${scenario}  ${settled ? "settled" : "STILL MOVING at the 10s cap"}  pill top ${m.pillTop} h${m.pillH} w${m.pillW}  msg "${m.msg}"${flag}`);
      for (const r of m.rows) console.log(`      "${r.label}" at ${r.x},${r.y} ${r.w}x${r.h}  clearance ${-r.deep}px${r.onAsk ? "  ON THE ASK" : ""}`);
      if (m.covered) covered++;
      if ((SHOOT_ALL || m.covered) && shots.length < 30){
        const f = `t237${TAG ? "-" + TAG : ""}-${tag}-${scenario}-${ax}${ay}.png`; await C.shot(f); shots.push(f);
      }
    }
  }
}

console.log(`\n=== T-237 VERDICT ===`);
console.log(`  poses measured: ${measured}   NOT RUN: ${notRun}   still moving at the cap: ${stillMoving}`);
console.log(`  circle on the ask: ${covered}`);
if (shots.length) console.log(`  shots: ${shots.join(", ")}`);
if (!measured){ console.log("  NOTHING MEASURED — not a pass."); killAll(); process.exit(2); }
killAll();
process.exit(covered ? 1 : 0);
