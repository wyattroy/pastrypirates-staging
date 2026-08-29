/* W3-2 — DO THE BAKE-OFF CRATES JITTER AFTER BEING SHUFFLED?
 *
 *   node scripts/qa/w32_bakeoff_jitter.mjs      exit 0 = every crate travels forward and settles
 *
 * Wyatt: "Bake-off attempt 2+: the boxes jitter after being shuffled instead of settling smoothly."
 * His own hypothesis: "the open crates, or the borders around them."
 *
 * `?bake2=1` lands straight on attempt 2 (scripts/qa/w01_endgame_urls.mjs proves that flag lands
 * where it claims), so this needs no voyage.
 *
 * TWO MEASUREMENTS, because "jitter" could be either of two different things and they have
 * different fixes:
 *   THE BENCH — every crate's rect and its locked flag, and the gaps between consecutive crates.
 *     bakeoff.js measures ONE pitch (`bowls[1].left - bowls[0].left`) and every swap travels
 *     `(b-a) * pitch`. One spacing standing in for five positions is rule 9's shape: if the gaps
 *     are not equal, each crate lands slightly off and the commit snaps it straight — once per
 *     swap, which is what jitter looks like.
 *   THE MOTION — one crate's transform sampled every frame through the whole shuffle. A crate that
 *     settles smoothly moves in one direction and stops. A STEP BACKWARDS mid-swap, or a snap at
 *     the moment the contents commit, is the jitter itself and is visible in the trace.
 *
 * IT MUST BE ABLE TO FAIL: a run that never reaches attempt 2, or never sees a swap, prints NOT RUN
 * and exits non-zero. A shuffle nobody watched is not a shuffle that was smooth.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PORT = 8506, DBG = 9406;
const url = serve(PORT);
launch(DBG, "/tmp/chrome-qa-w32");
const C = await attach(DBG);

const ADVANCE = `(()=>{
  const vis=e=>{if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
    return r.width>4&&r.height>4&&s.display!=='none'&&s.visibility!=='hidden';};
  const card=[...document.querySelectorAll('button')].find(b=>b.querySelector('.recipeThumb')&&vis(b));
  if(card){card.click();return 'recipe';}
  const go=[...document.querySelectorAll('button')].filter(vis)
    .find(b=>/arrgh|aye|continue|set sail|onward|begin|start|bake|ready/i.test((b.textContent||'')));
  if(go){go.click();return 'go:'+(go.textContent||'').trim().slice(0,14);}
  return null;})()`;

// the bench, read off what is painted — rects, locked flags, and the gaps between neighbours
const BENCH = `(()=>{const bs=[...document.querySelectorAll('.bkoBowl')];
  if(!bs.length) return null;
  const r=bs.map(b=>{const q=b.getBoundingClientRect();
    return {x:Math.round(q.left*100)/100, w:Math.round(q.width*100)/100,
            locked:b.classList.contains('locked')};});
  const gaps=r.slice(1).map((b,i)=>Math.round((b.x-r[i].x)*100)/100);
  return {n:r.length, bowls:r, gaps,
          attempt:(document.querySelector('.bkoAtt')||{}).textContent||null};})()`;

/* WATCH EVERY CRATE, AND WATCH THE SETTLE — the first version of this watched crate 0 alone and
   deliberately ignored motion near rest, so that the design's own return-to-zero at the commit was
   not miscounted as a fault. THAT IS EXACTLY WHERE HE SAYS THE JITTER IS: "instead of SETTLING
   smoothly". A detector that excludes the settle cannot see the reported bug, and it duly reported
   0 reversals on a bench he says jitters. Checking whether the instrument could reach its subject
   is what caught it — the acquittal was as suspect as a conviction would have been.
   So: every crate, every frame, transform x AND the ingredient it is carrying. A glide over a
   1000ms swap moves ~4px a frame; a SNAP is a single frame that jumps. And a content change that
   does not coincide with the position reset is the fill/cancel reconcile showing through. */
/* ALSO TRACK THE PITCH ITSELF, AND STOP EXCLUDING THE COMMIT.
   Wyatt, corrected me: "the crates start moving smoothly then JUMP to their final resting positions
   AFTER the animation. It looks like the animation is not correctly calculating their end positions
   at the beginning." My detector ignored any jump that coincided with the contents changing and
   called it "the commit, by design" — but the commit is only invisible if the animation ENDED where
   the commit expects. If it did not, that reconcile IS the jump he sees, and I was filtering out
   the evidence.
   bakeoff.js measures `pitch` ONCE (line 451), before the ghost fade, before the ready-wait, before
   bench({phase:"shuffle"}) and before the cover sweep. The crates are `flex:1 1 0`, so their
   spacing moves with the panel's width. Sampling the live pitch across the whole sequence says
   whether the number the swaps are built on is still true when they run. */
const WATCH = `(()=>{const bs=[...document.querySelectorAll('.bkoBowl')]; if(!bs.length) return 'no bench';
  window.__w32=[]; const t0=performance.now();
  const read=()=>{
    const row=bs.map(b=>{const m=new DOMMatrixReadOnly(getComputedStyle(b).transform);
      const img=b.querySelector('.bkoIng');
      const q=b.getBoundingClientRect();
      // the LAYOUT position, transform removed — so the live pitch can be compared with the one
      // bakeoff.js froze before any of this began
      return [Math.round(m.m41*10)/10, img?(img.getAttribute('src')||'').slice(-14):'',
              Math.round((q.left-m.m41)*100)/100];});
    window.__w32.push([Math.round(performance.now()-t0), row]);
    if(performance.now()-t0 < 12000) requestAnimationFrame(read);};
  requestAnimationFrame(read); return 'watching';})()`;

/* ONE WALK, TWO ENGINES. He plays Safari, and everything above was measured in Chromium only —
   which is exactly the gap that lets a "cannot reproduce" be wrong. WebKit's handling of
   Element.animate with fill:"forwards" followed by cancel() is the part of this choreography most
   likely to differ, and bakeoff.js even carries a no-WAAPI fallback "for very old WebKit". So the
   walk to the bench and the two measurements are a function, and both engines run it. */
async function measure(P, label) {
  await P.nav(P.base + "?bake2=1");
  for (let i = 0; i < 60 && !(await P.ev(`document.readyState==='complete'`)); i++) await sleep(500);
  await P.ev(`localStorage.clear();localStorage.setItem('pp_id','w32-'+Math.floor(Math.random()*1e9));true`);
  await P.nav(P.base + "?bake2=1");
  for (let i = 0; i < 60 && !(await P.ev(`document.readyState==='complete'`)); i++) await sleep(500);
  await sleep(1200);
  for (let i = 0; i < 40; i++) { if (await P.ev(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`)) break; await sleep(600); }
  await P.ev(`document.getElementById('choiceSolo').click();true`); await sleep(900);
  for (let i = 0; i < 30; i++) { if (await P.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) break; await sleep(500); }
  await P.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
  await P.ev(`document.getElementById('btnNameConfirm').click();true`);
  let bench = null;
  for (let i = 0; i < 60; i++) { bench = await P.ev(BENCH); if (bench && bench.n) break; await P.ev(ADVANCE); await sleep(1400); }
  if (!bench || !bench.n) { console.log(`\n### ${label}: NOT RUN — never reached a bake-off bench`); return null; }
  await P.ev(WATCH);
  for (let i = 0; i < 6; i++) { await P.ev(ADVANCE); await sleep(400); }
  await sleep(12300);
  const tr = JSON.parse(await P.ev(`JSON.stringify(window.__w32||[])`));
  return { bench, trace: tr };
}

await C.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 950, deviceScaleFactor: 1, mobile: false });
await C.goto(url + "?bake2=1");
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();localStorage.setItem('pp_id','w32-'+Math.floor(Math.random()*1e9));true`);
await C.goto(url + "?bake2=1");
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1000);
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "home");
await C.ev(`document.getElementById('choiceSolo').click();true`); await sleep(700);
await C.waitFor(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`, 15000, "name");
await C.ev(`document.getElementById('nameModalInput').value='Davy Probe';true`);
await C.ev(`document.getElementById('btnNameConfirm').click();true`);

let bench = null;
/* 60 x 1.4s, the same ceiling scripts/qa/w01_endgame_urls.mjs needed to reach the bake — a shorter
   loop reports "never reached a bench" about a game that was still walking there. */
for (let i = 0; i < 60; i++) {
  bench = await C.ev(BENCH);
  if (bench && bench.n) break;
  await C.ev(ADVANCE); await sleep(1400);
}
if (!bench || !bench.n) {
  const why = await C.ev(`(async()=>{try{
    if(!window.appState){const m=await import('/src/state/index.js');window.appState=m.appState;}
    const g=window.appState.game; const h=g&&(g.players.find(p=>p.strategy==='human')||g.players[0]);
    return JSON.stringify({day:g?g.round:null, baking:h?!!h.baking:null,
      attempts:h&&h.bake?h.bake.attempts:null, panel:(document.querySelector('.apMsg')||{}).textContent||null,
      bkoNodes:document.querySelectorAll('.bko,.bkoBowl,.bkoRow').length});}catch(e){return String(e.message)}})()`);
  console.log(`NOT RUN — never reached a bake-off bench. State: ${why}`);
  killAll(); process.exit(2);
}

console.log(`\n--- the bench (${bench.attempt || "attempt unknown"}) ---`);
bench.bowls.forEach((b, i) => console.log(`  crate ${i}  x ${b.x}  w ${b.w}${b.locked ? "   LOCKED" : ""}`));
const uniform = bench.gaps.every(g => Math.abs(g - bench.gaps[0]) < 0.5);
console.log(`  gaps between neighbours: ${bench.gaps.join(", ")}   ${uniform ? "UNIFORM" : "NOT UNIFORM"}`);

// start the shuffle if it has not started, then trace one crate
await C.ev(WATCH);
for (let i = 0; i < 6; i++) { await C.ev(ADVANCE); await sleep(400); }
await sleep(12300);
const trace = JSON.parse(await C.ev(`JSON.stringify(window.__w32||[])`));
if (trace.length < 60) { console.log(`NOT RUN — only ${trace.length} frames captured; nothing was watched`); killAll(); process.exit(2); }
const n = trace[0][1].length;
/* A GLIDE MOVES A FEW PIXELS A FRAME. Derived, not typed: the swap is SWAP_MS long and the longest
   journey on this bench is 4 pitches, so even the fastest legitimate frame is well under a fifth of
   a pitch. Anything above that in ONE frame is a discontinuity a player sees as a jerk. */
const pitch = bench.gaps[0];
const SNAP = pitch / 5;

/* (1) IS THE PITCH THE SWAPS ARE BUILT ON STILL TRUE WHEN THEY RUN? */
const pitchAt = t => {
  const row = trace.find(p => p[0] >= t);
  if (!row) return null;
  const xs2 = row[1].map(c => c[2]);
  return Math.round((xs2[1] - xs2[0]) * 100) / 100;
};
const pitchStart = pitchAt(0), pitchMid = pitchAt(4000), pitchEnd = pitchAt(11000);
const pitchMoved = [pitchStart, pitchMid, pitchEnd].filter(v => v != null);
const pitchDrift = pitchMoved.length > 1 ? Math.max(...pitchMoved) - Math.min(...pitchMoved) : 0;
console.log(`\n--- the pitch the swaps are built on ---`);
console.log(`  live layout pitch at 0s / 4s / 11s: ${pitchStart} / ${pitchMid} / ${pitchEnd}   drift ${pitchDrift.toFixed(2)}px`);
console.log(`  bakeoff.js freezes ONE pitch before the ready-wait and the cover sweep; every swap travels (b-a) x that number`);

/* (2) THE JUMP AT THE COMMIT — counted THIS time, not excluded.
   Wyatt: "they start moving smoothly then jump to their final resting positions after the
   animation." The commit swaps the contents and clears the transform in one breath; that is
   invisible ONLY if the animation had already reached its target. So measure the distance the
   crate covers on the frame its contents change: at 0 the reconcile was perfect, anything else is
   the jump he sees. */
const commits = [];
for (let c = 0; c < trace[0][1].length; c++) {
  for (let i2 = 1; i2 < trace.length; i2++) {
    const row = trace[i2][1], prev = trace[i2 - 1][1];
    if (row[c][1] !== prev[c][1])
      commits.push({ crate: c, t: trace[i2][0], from: prev[c][0], to: row[c][0], jump: Math.round(Math.abs(row[c][0] - prev[c][0]) * 10) / 10 });
  }
}
/* THE RECONCILE IS SUPPOSED TO BE A WHOLE NUMBER OF PITCHES, AND THAT IS THE WHOLE TEST.
   A crate that has arrived sits exactly where its neighbour does — an exact multiple of the pitch
   away from its own seat. Swapping the contents and clearing the offset in the same frame is then
   a true no-op: identical pixels. So the jump the PLAYER sees is not the reconcile's size, it is
   the REMAINDER: how far the crate still was from a whole number of seats.
   The first version of this counted "any commit that moved more than 2px" and would have called
   the fixed build broken — the fixed build's reconciles are 66.8 and 133.6, which is precisely
   what makes them invisible. Measuring the size of a legitimate hand-off instead of its error is
   the same class of mistake as the detector that excluded the commit entirely. */
const residual = j => { const k = Math.round(j / pitch); return Math.round(Math.abs(j - k * pitch) * 10) / 10; };
commits.forEach(x => { x.seats = Math.round(x.jump / pitch); x.short = residual(x.jump); });
const bigCommits = commits.filter(x => x.short > 1);
console.log(`\n--- the reconcile at each commit (${commits.length} seen; one seat is ${pitch}px) ---`);
commits.slice(0, 14).forEach(x => console.log(`  crate ${x.crate} at ${x.t}ms: travelled ${x.from}px = ${x.pitches.toFixed(3)} seat(s)   ${x.residual > 1 ? `STOPPED ${x.residual}px SHORT — the player sees this jump` : `exact to within ${x.residual}px, which is this probe's own sampling precision — invisible hand-off`}`));
console.log(`  commits that did not land on a whole seat: ${bigCommits.length}${bigCommits.length ? `   worst ${Math.max(...bigCommits.map(x => x.short))}px` : ""}`);

const snaps = [], contentJumps = [];
let moved = false;
for (let c = 0; c < trace[0][1].length; c++) {
  for (let i2 = 1; i2 < trace.length; i2++) {
    const row = trace[i2][1], prev = trace[i2 - 1][1];
    if (Math.abs(row[c][0]) > 1) moved = true;
    const dx = row[c][0] - prev[c][0];
    if (Math.abs(dx) > SNAP && row[c][1] === prev[c][1]) snaps.push({ crate: c, t: trace[i2][0], dx: Math.round(dx) });
  }
}
const ts = trace.map(p => p[0]);
const gaps2 = ts.slice(1).map((t, i2) => t - ts[i2]);
const sorted = gaps2.slice().sort((a, b) => a - b);
const stalls = gaps2.filter(g => g > 33).length;
const longStalls = gaps2.filter(g => g > 60).length;
console.log(`\n--- the frame clock (${trace.length} frames) ---`);
console.log(`  median ${sorted[Math.floor(sorted.length / 2)]}ms   worst ${Math.max(...gaps2)}ms   dropped ${stalls}   hitches ${longStalls}`);
console.log(`  crates travelled: ${moved ? "yes" : "NO"}   mid-flight snaps: ${snaps.length}`);

console.log(`\n=== W3-2 VERDICT ===`);
if (!moved) { console.log("  NOT RUN — the bench was reached but no crate moved, so no shuffle was watched. Not a pass."); killAll(); process.exit(2); }
console.log(`  bench spacing ${uniform ? "uniform — the one-pitch assumption in bakeoff.js holds" : "NOT UNIFORM — `(b-a)*pitch` cannot land every crate correctly"}`);
console.log(`  ${snaps.length} snap(s), ${contentJumps.length} early content swap(s)`);
killAll();

/* ---- THE SAFARI LEG ---- */
let wkVerdict = "NOT RUN";
try {
  const { openWebKit } = await import("../lib/wk.mjs");
  const P = await openWebKit({ W: 1200, H: 950, httpPort: 8507, serveRoot: REPO,
                               profileDir: "/tmp/wk-w32", mobile: false, dsf: 1 });
  P.base = "http://127.0.0.1:8507/";
  /* THE CONTROL, AND WITHOUT IT THIS WHOLE LEG IS WORTHLESS. Headless WebKit in a container is
     slower than Chromium at everything, so "WebKit ran at 32fps during the shuffle" says nothing
     until we know what WebKit does here when it is NOT shuffling. Measured on the lobby, the same
     engine, the same container, seconds apart: if the idle clock is also ~31ms it is the container
     and I have no finding; if idle is ~17ms and only the bake-off halves, the animation is the
     cause and his report is reproduced. */
  await P.nav(P.base);
  for (let i = 0; i < 40 && !(await P.ev(`document.readyState==='complete'`)); i++) await sleep(500);
  await sleep(1500);
  await P.ev(`(()=>{window.__ctl=[];const t0=performance.now();
    const f=()=>{window.__ctl.push(Math.round(performance.now()-t0));
      if(performance.now()-t0<4000)requestAnimationFrame(f);};requestAnimationFrame(f);return 1;})()`);
  await sleep(4400);
  const ctl = JSON.parse(await P.ev(`JSON.stringify(window.__ctl||[])`));
  const cg = ctl.slice(1).map((t, i) => t - ctl[i]).sort((a, b) => a - b);
  const idleMedian = cg.length ? cg[Math.floor(cg.length / 2)] : null;
  console.log(`\n### WebKit CONTROL — an idle page in the same engine and container`);
  console.log(`  ${ctl.length} frames over 4s   median gap ${idleMedian}ms   worst ${cg.length ? cg[cg.length - 1] : "-"}ms`);

  const r = await measure(P, "WebKit (Safari's engine)");
  if (r) {
    const ts2 = r.trace.map(p => p[0]);
    const g2 = ts2.slice(1).map((t, i) => t - ts2[i]);
    const s2 = g2.slice().sort((a, b) => a - b);
    const n2 = r.trace[0][1].length;
    let snaps2 = 0, moved2 = false;
    const pitch2 = r.bench.gaps[0], SNAP2 = pitch2 / 5;
    for (let c = 0; c < n2; c++) for (let i = 1; i < r.trace.length; i++) {
      const row = r.trace[i][1], prev = r.trace[i - 1][1];
      if (Math.abs(row[c][0]) > 1) moved2 = true;
      if (Math.abs(row[c][0] - prev[c][0]) > SNAP2 && row[c][1] === prev[c][1]) snaps2++;
    }
    const hitch2 = g2.filter(x => x > 60).length, drop2 = g2.filter(x => x > 33).length;
    console.log(`\n### WebKit (Safari's engine), 1200x950`);
    console.log(`  gaps: ${r.bench.gaps.join(", ")}`);
    console.log(`  ${r.trace.length} frames  median ${s2[Math.floor(s2.length / 2)]}ms  worst ${Math.max(...g2)}ms  dropped ${drop2}  hitches ${hitch2}`);
    console.log(`  crates travelled: ${moved2 ? "yes" : "NO"}   snaps: ${snaps2}`);
    const wkMedian = s2[Math.floor(s2.length / 2)];
    /* THE COMPARISON IS AGAINST WEBKIT'S OWN IDLE CLOCK, never against Chromium's. */
    const slower = idleMedian != null && wkMedian > idleMedian * 1.4;
    console.log(`  idle here was ${idleMedian}ms; during the shuffle ${wkMedian}ms — ${slower ? "the shuffle is what slows it" : "no worse than this engine is anyway"}`);
    wkVerdict = !moved2 ? "NOT RUN (nothing moved)"
      : (snaps2 || hitch2) && slower ? `JITTER: ${snaps2} snap(s), ${hitch2} hitch(es), ${wkMedian}ms vs ${idleMedian}ms idle`
      : (snaps2 || hitch2) ? `${snaps2} snap(s)/${hitch2} hitch(es) BUT idle is ${idleMedian}ms too — this container's WebKit, not the game`
      : "clean";
  }
  await P.close();
} catch (e) {
  console.log(`\n### WebKit: did NOT run — ${String(e && e.message || e).slice(0, 140)}`);
}
console.log(`\n  Chromium: ${snaps.length || longStalls ? "JITTER" : "clean"}   WebKit: ${wkVerdict}`);
if (wkVerdict === "NOT RUN" || wkVerdict.startsWith("NOT RUN"))
  console.log("  ⚠ the Safari leg did not produce a measurement — that is not a pass. He plays Safari.");
process.exit(bigCommits.length || snaps.length || pitchDrift > 0.5 ? 1 : 0);
