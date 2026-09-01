/* W7c — DOES THE "GUEST SLID" VERDICT SURVIVE ITS OWN MEASUREMENT WINDOW?
 *
 *   node <this file>            # the burst case  -> expected RED
 *   node <this file> --extra=0  # the red-proof   -> expected GREEN
 *
 * THE SUBJECT IS THE INSTRUMENT, NOT THE WALKER. The crew harness that produced "the guest slid on
 * 7 of 14 sails" (w7b_frames.mjs) keeps a traced frame only when THAT TIER'S OWN g.events.length
 * sat inside [n-1, n+1], where n is the host's events.length at the moment the sail was spotted:
 *
 *     const grab = `...(window.__tr.rows||[]).filter(r=>r.ev>=${e.n-1}&&r.ev<=${e.n+1})`
 *
 * On the HOST the ride runs inside the turn loop before anything else is emitted, so events.length
 * stays n and every ride frame is kept. On the GUEST the wire keeps pushing while the consumer is
 * parked (src/orchestrator.js:1587 `appState.game.events.push(e)` — before `await consumeEvent(e)`
 * on :1605), so as soon as TWO more events land during the ~1.5s ride every ride frame carries
 * ev >= n+2 and is thrown away. What is left is the idle second BEFORE the sail arrived: ~100 rows,
 * boat parked on the route's first square, camera still on the previous seat. That is exactly the
 * reported failure shape, and it is produced here with a walker that is working.
 *
 * WHAT IT POSES (rule 26 — the question is a picture, not a rate): one solo board, one real emitted
 * sail with a real baked draw lane, consumeEvent called exactly as watchEvents calls it, and N more
 * events pushed DURING the ride the way the wire pushes them. Every frame is traced with both a
 * wall clock and this tier's events.length, so the SAME frames can be read two ways.
 *
 * IT FAILS when the two readings disagree — i.e. when the boat visibly walked and the crew
 * harness's window would have called it a slide.
 */
/* ⚠ RELATIVE, NEVER MACHINE-ROOTED. These two lines used to name /home/user/pastrypirates
   outright, which resolves on exactly ONE machine and dies everywhere else with a module-not-found
   that reads like a missing file rather than a typed path. Same fault CEO Review 37 caught in
   whose_turn_one_fact_check.mjs; tree_health_check case 5 now fails the build on either spelling. */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import { gameURL } from "../lib/chrome.mjs";

const PORT = 8547, DBG = 9447;
const EXTRA = Number((process.argv.find(a => a.startsWith("--extra=")) || "--extra=0").slice(8));
const PRE   = Number((process.argv.find(a => a.startsWith("--pre="))   || "--pre=2").slice(6));   // events already delivered by the wire before the parked consumer reaches this sail
const WALKED = 5;   // the control below reports the real number next to every verdict

serve(PORT);
launch(DBG, "/tmp/chrome-w7c");
const C = await attach(DBG);
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const missed = async m => { console.log("INSTRUMENT DID NOT REACH ITS SUBJECT — " + m); killAll(); process.exit(2); };

const url = gameURL(PORT);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "load");
await C.ev(`localStorage.clear();true`);
await C.goto(url);
await C.waitFor(`document.readyState==='complete'`, 30000, "reload");
await sleep(1200);
await C.waitFor(`(()=>{const e=document.getElementById('choiceSolo');return !!(e&&e.offsetParent)})()`, 25000, "Solo visible");
await C.ev(`document.getElementById('choiceSolo').click();true`);
await sleep(900);
if (await C.ev(`(()=>{const m=document.getElementById('nameModalInput');return !!(m&&m.offsetParent)})()`)) {
  await C.ev(`document.getElementById('nameModalInput').value="Wyatt";document.getElementById('btnNameConfirm').click();true`);
}
try {
  await C.waitFor(`(async()=>{const s=await import('/src/state/index.js');return !!(s.appState.game&&s.appState.game.players&&s.appState.game.players.length)})()`,
                  40000, "a live Game on appState");
} catch (e) { await missed("no live Game after starting a solo voyage — " + e.message); }

const PROBE = (extra, pre, sign) => `(async()=>{
  const s=await import('/src/state/index.js');
  const o=await import('/src/orchestrator.js');
  const b=await import('/src/ui/board.js');
  const g=s.appState.game,p=g.players[0];
  const el=(b.boardShipEls()||[])[p.idx];
  if(!el) return JSON.stringify({noship:true});
  // THE CREW HARNESS'S OWN TRACER, verbatim in shape: every animation frame, the drawn transform
  // and THIS TIER'S events.length.
  const rows=[]; let stop=false;
  const tick=()=>{rows.push({t:Date.now(),ev:g.events.length,tr:el.style.transform});
                  if(!stop&&rows.length<6000)requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
  await new Promise(r=>setTimeout(r,1000));            // the idle second before the sail lands
  const d=${sign}, from=[...p.pos], mid=[from[0]+d,from[1]], dest=[from[0]+d,from[1]+d];
  p.pos=dest;
  const evSail=g.ev({t:"sail",p:p.idx,route:[from,mid,dest]});   // a REAL emit: Game.ev bakes the lane
  const baked=!!(evSail.draw&&evSail.draw.route&&evSail.draw.route.length===3);
  const N=g.events.length;                              // exactly what the crew harness read as e.n
  /* THE GUEST IS BEHIND. watchEvents pushes every arriving event the instant it lands
     (orchestrator.js:1587) whether or not the consumer has reached the previous one, so a guest
     that is a beat behind the host is already holding the events that follow the sail when its
     own ride finally starts. */
  for(let i=0;i<${pre};i++) g.ev({t:"pass",p:p.idx});
  s.appState.evIdx=g.events.length-1;
  const t0=Date.now();
  const done=o.consumeEvent(evSail);                    // UNAWAITED, as watchEvents leaves it
  // the wire keeps pushing WHILE the consumer is parked — orchestrator.js:1587
  for(let i=0;i<${extra};i++) setTimeout(()=>{g.ev({t:"pass",p:p.idx});s.appState.evIdx=g.events.length-1;},150+i*150);
  let settled=false; done.then(()=>{settled=true;});
  for(let i=0;i<200&&!settled;i++) await new Promise(r=>setTimeout(r,16));
  await done; const t1=Date.now(); stop=true;
  const distinct=rs=>{const o=[];let q=null;for(const r of rs){if(r.tr!==q){o.push(r);q=r.tr;}}return o;};
  const ride=rows.filter(r=>r.t>=t0-16&&r.t<=t1+16);   // the honest window: wall clock, the ride itself
  const win=rows.filter(r=>r.ev>=N-1&&r.ev<=N+1);      // the tester's window: THIS TIER'S events.length in [n-1,n+1]
  const sbd=rows.filter(r=>r.t>=t0&&r.t<=t0+1500);     // starboard's window: 1500ms from the sail landing (w7b_crew_sail_measure.mjs:75,97)
  return JSON.stringify({baked,ms:t1-t0,N,tail:g.events.length,
    rideRows:ride.length,ridePts:distinct(ride).length,
    winRows:win.length,winPts:distinct(win).length,
    sbdRows:sbd.length,sbdPts:distinct(sbd).length,
    winEnd:win.length?win[win.length-1].t-t0:null});
})()`;

console.log(`W7c — one traced ride, read two ways (${PRE} event(s) already landed, ${EXTRA} landing during it)\n`);
const r = JSON.parse(await C.ev(PROBE(EXTRA, PRE, 1)));
if (r.noship) await missed("no ship element on the board — nothing was watched.");
if (!r.baked) await missed("Game.ev refused to bake a draw lane for the posed route — the poser is wrong.");
console.log("  raw:", JSON.stringify(r));

if (r.ridePts < WALKED)
  await missed(`the boat was painted at only ${r.ridePts} position(s) in ${r.ms}ms on the WALL-CLOCK window — this probe cannot read a walk at all, so its verdict on the other window would be meaningless.`);
pass(`the ride itself: the boat is painted at ${r.ridePts} distinct positions over ${r.ms}ms (${r.rideRows} frames) — WALKED`);

console.log(`  starboard's rule (1500ms from the sail landing): ${r.sbdPts} distinct positions over ${r.sbdRows} kept frames -> ${r.sbdPts>=WALKED?"WALKED":"SLID"}`);
console.log(`  the tester's rule  (events.length in [n-1,n+1]):  ${r.winPts} distinct positions over ${r.winRows} kept frames -> ${r.winPts>=WALKED?"WALKED":"SLID"}`);

if (r.winPts >= WALKED)
  pass(`the crew harness's window agrees: ${r.winPts} distinct positions over ${r.winRows} kept frames`);
else
  fail(`SAME FRAMES, OPPOSITE VERDICT — the crew harness's window [n-1,n+1] keeps ${r.winRows} frames and reads ${r.winPts} distinct position(s), i.e. "the guest never moved", on a ride this probe just watched walk ${r.ridePts} positions. Its kept frames stop ${r.winEnd}ms after the consumer started, before the ride. scripts trace filter: w7b_frames.mjs line 66 (r.ev>=n-1 && r.ev<=n+1); the pushes that break it: src/orchestrator.js:1587.`);

console.log(fails ? `\nRED (${fails})` : "\nGREEN");
killAll();
process.exit(fails ? 1 : 0);
