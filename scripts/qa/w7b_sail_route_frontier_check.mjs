/* W7b — THE GUEST DROPS THE RIDE WHEN A SECOND EVENT LANDS FIRST.
 *
 *   node scripts/qa/w7b_sail_route_frontier_check.mjs
 *
 * W7 put the sailed route on the wire and taught the guest to walk it. A tester then drove two real
 * crew rooms over eight sails and found the guest walked five of them and SLID across the islands on
 * three — two of the three were corner routes, the exact thing W7 exists to remove. The frame
 * timeline on the clearest failure was unbroken (225 frames over 3954ms, no gap above 60ms) and the
 * drawn position changed exactly once, so nothing was dropping frames: the ride never started.
 *
 * WHY THIS IS POSED AND NOT ANOTHER CREW RUN (rule 26). "Does the boat walk?" looked like a rate —
 * five in eight — and a rate over a driven voyage is the wrong quantity for a question you can pose.
 * Eight sails cost a tester two real rooms and an hour. The three cases below cost seconds, are
 * deterministic, and cannot be argued with, because each one hands the walker an event stream in a
 * shape it will meet on a real guest and asks it one question: did you ride?
 *
 * IT DRIVES THE REAL FUNCTION. The page's own module instance is reached with a dynamic import, so
 * this walks the shipped animateSailRoute off a real Game with a real baked draw lane. Nothing here
 * is a re-implementation of it.
 *
 * THE THREE CASES:
 *   A  CONTROL — the sail is the last event. Must ride. If this fails, the instrument never reached
 *      its subject and the other two verdicts mean nothing, so it aborts rather than reporting.
 *   B  THE DEFECT — the sail is followed by one more event before anything drains, which is what
 *      watchEvents (src/orchestrator.js) produces every time a second event lands while consumeEvent
 *      is parked on `await animateRimSweepIfAny()`, and what the engine produces directly by calling
 *      this.tradewind(p) in the same breath as the sail (src/engine/index.js). Must ride.
 *   C  THE SIBLING — a second voyage in the same page load. The ride frontier is module-local, so a
 *      sail landing on the index the previous voyage last rode is silently dropped. Must ride.
 *
 * RED-PROOFED DOWNWARD, not upward: with the fix in place, reverting animateSailRoute to read
 * g.events[g.events.length-1] turns B red again while A stays green.
 */
import { serve, launch, attach, killAll, sleep } from "../mp_rig.mjs";
import { gameURL, PYTHON } from "../lib/chrome.mjs";   // never a hand-typed URL: game_url_check exists because a probe once pointed at a page with no game on it
import { spawn } from "node:child_process";
import path from "node:path";

/* --tree=/some/copy — serve a COPY of the game instead of this checkout, so the downward red-proof
   above can be RE-RUN by anyone without editing the working tree. The sibling gate
   (w7_sail_route_on_wire_check.mjs) carries the same affordance for the same reason: a red-proof
   that requires breaking the tree everyone else is building in is a red-proof nobody repeats, and
   an unrepeated red-proof decays into the comment that claims it happened. */
const PORT = 8531, DBG = 9433;
const treeArg = process.argv.find(a => a.startsWith("--tree="));
let altServer = null;
const url = (() => {
  if (!treeArg) return serve(PORT);
  const root = path.resolve(treeArg.slice(7));
  altServer = spawn(PYTHON, ["-m", "http.server", String(PORT)], { cwd: root, stdio: "ignore" });
  console.log(`TREE UNDER TEST — ${root}`);
  return gameURL(PORT);
})();
// kill the alt server BY PID, never a bare pattern that can match this command line
const stopAlt = () => { if (altServer && altServer.pid) { try { process.kill(altServer.pid); } catch {} altServer = null; } };
process.on("exit", stopAlt);
launch(DBG, "/tmp/chrome-w7b");
const C = await attach(DBG);

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
/* An instrument that reports NOT FOUND has told you about ITSELF, not about the world. */
const missed = async m => { console.log("INSTRUMENT DID NOT REACH ITS SUBJECT — " + m); stopAlt(); killAll(); process.exit(2); };

console.log("W7b — does the guest's walker ride the sail it is handed, or only the last event on the pile?\n");

/* ── get to a live solo board. Solo is the cheapest board that has a real Game on it, and the
   question here is not a host/guest one: the walker is ONE function both tiers call. ───────── */
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

/* ── THE ONE PROBE, and it drives the GUEST'S REAL DOOR. ──────────────────────────────────────
   It does not call the walker. It calls consumeEvent — the one event consumer both tiers draw
   through — and then WATCHES THE SHIP, counting how many distinct positions it is actually painted
   at. That is the same signal the tester read off two real crew rooms: on a walked sail the host
   showed 17-35 drawn steps, and on the three failures the guest's drawn position changed exactly
   once while its frame timeline stayed unbroken. Asserting on the drawn picture rather than on the
   walker's return value means this check keeps its meaning if the walker is rewritten again.

   `extra` is how many further events land before the consumer is called: 0 is the host turn loop's
   order, 1 is what a guest sees when the next event arrives while consumeEvent is parked on the
   await above the ride. The extra event is a `pass` ON PURPOSE — a `tradewind` is the commonest
   real producer of this shape (the engine emits a sail and calls tradewind(p) in the same breath),
   but a tradewind can start a rim sweep, which would move the ship for a reason that is not the
   sail and could hand this check a PASS it did not earn. What is being posed is "anything landed
   behind the sail", which is what watchEvents produces whatever the event happens to be. */
const RIDE = (extra, sign = 1) => `(async()=>{
  const s=await import('/src/state/index.js');
  const o=await import('/src/orchestrator.js');
  const b=await import('/src/ui/board.js');
  const g=s.appState.game, p=g.players[0];
  // A REAL EMIT, not a hand-written event object: Game.ev bakes the draw lane and REFUSES a route
  // that does not land on the pos beside it, so posing through it proves the lane is genuine.
  const from=[...p.pos], d=${sign};
  const mid=[from[0]+d,from[1]], dest=[from[0]+d,from[1]+d];   // an L: a corner, which is the case that matters
  p.pos=dest;
  const evSail=g.ev({t:"sail",p:p.idx,route:[from,mid,dest]});
  const sailAt=g.events.length-1;
  const baked=!!(evSail.draw&&evSail.draw.route&&evSail.draw.route.length===3);
  for(let i=0;i<${extra};i++) g.ev({t:"pass",p:p.idx});
  s.appState.evIdx=g.events.length-1;    // what watchEvents sets before it awaits the consumer
  const el=(b.boardShipEls()||[])[p.idx];
  if(!el) return JSON.stringify({noship:true});
  const seen=new Set(), t0=Date.now();
  const done=o.consumeEvent(evSail);     // UNAWAITED on purpose — the ship is watched while it runs
  let settled=false; done.then(()=>{settled=true;});
  for(let i=0;i<200&&!settled;i++){ seen.add(el.style.transform); await new Promise(r=>setTimeout(r,16)); }
  await done;
  seen.add(el.style.transform);
  return JSON.stringify({baked,steps:seen.size,ms:Date.now()-t0,sailAt,tail:g.events.length-1});
})()`;

/* WALKED vs SLID. A dropped ride paints the destination and nothing else; a walked one paints every
   interpolated point along the route. The control below is what fixes the threshold honestly —
   it is reported next to every verdict rather than asserted against a number pulled from the air. */
const WALKED = 5;

/* A — CONTROL. The sail is the tail, which is the host turn loop's order. */
const a = JSON.parse(await C.ev(RIDE(0, 1)));
if (a.noship) await missed("no ship element on the board — boardShipEls() is empty, so nothing was watched.");
if (!a.baked) await missed("Game.ev refused to bake a draw lane for a route that ends on the posed pos — the poser is wrong, not the walker.");
if (a.steps < WALKED) await missed(`the boat was painted at only ${a.steps} position(s) in ${a.ms}ms for a sail sitting at the TAIL (event ${a.sailAt} of ${a.tail}). This check cannot read a WALKED at all, so cases B and C would be meaningless.`);
pass(`A control — a sail at the tail is WALKED: the boat is painted at ${a.steps} positions over ${a.ms}ms (event ${a.sailAt})`);

/* B — THE DEFECT. One more event lands before the consumer is called. */
const b = JSON.parse(await C.ev(RIDE(1, -1)));
if (!b.baked) await missed("case B: Game.ev refused to bake the draw lane.");
if (b.steps >= WALKED) pass(`B the guest's order — a sail at event ${b.sailAt} with a later event at ${b.tail} is still WALKED: ${b.steps} positions over ${b.ms}ms`);
else fail(`B the guest's order — the sail at event ${b.sailAt} SLID: the boat was painted at ${b.steps} position(s) in ${b.ms}ms because event ${b.tail} landed behind it, against ${a.steps} positions for the identical sail at the tail. This is the boat cutting across the islands — watchEvents pushes each event before awaiting consumeEvent, and the engine emits a sail and calls tradewind in the same breath, so the consumer is regularly handed a sail that is no longer the top of the pile.`);

/* C — THE SIBLING. A second voyage in the same page load, where the walker's re-entry bookkeeping
   used to be a module-local INDEX that survived the new Game.

   THE FIRST CUT OF THIS CASE PASSED AND PROVED NOTHING, which is worth keeping written down: it
   aimed the new voyage's sail at `old.events.length-1`, assuming that was the index the walker had
   last ridden. It was not — case B is a DROPPED ride, so it never advanced the frontier, and C was
   posing a collision that could not happen. A case that cannot fail is not a case. So C now RIDES
   ONE MORE SAIL ON THE OLD VOYAGE FIRST and takes the frontier from the ride that actually
   happened. */
const c = JSON.parse(await C.ev(`(async()=>{
  const s=await import('/src/state/index.js');
  const o=await import('/src/orchestrator.js');
  const b=await import('/src/ui/board.js');
  const old=s.appState.game, op=old.players[0];
  const of=[...op.pos], om=[of[0]-1,of[1]], od=[of[0]-1,of[1]-1];
  op.pos=od;
  const evOld=old.ev({t:"sail",p:op.idx,route:[of,om,od]});
  const frontier=old.events.length-1;            // the index the ride below actually uses
  s.appState.evIdx=frontier;
  await o.consumeEvent(evOld);
  s.appState.gameStarted=false;
  o.beginGame(old.cfg,old.seed);                 // exactly what starting another voyage runs
  const g=s.appState.game;
  if(g===old) return JSON.stringify({err:"beginGame did not build a new Game"});
  while(g.events.length<frontier) g.ev({t:"pass",p:0});
  const p=g.players[0], from=[...p.pos];
  const mid=[from[0]+1,from[1]], dest=[from[0]+1,from[1]+1];
  p.pos=dest;
  const evSail=g.ev({t:"sail",p:p.idx,route:[from,mid,dest]});
  const sailAt=g.events.length-1;
  if(sailAt!==frontier) return JSON.stringify({err:"could not land the new voyage's sail on event "+frontier+" (it landed on "+sailAt+"), so no collision was posed"});
  if(!(evSail.draw&&evSail.draw.route)) return JSON.stringify({err:"no draw lane baked on the new voyage's sail"});
  s.appState.evIdx=sailAt;
  const el=(b.boardShipEls()||[])[p.idx];
  if(!el) return JSON.stringify({err:"the new voyage has no ship element to watch"});
  const seen=new Set(), t0=Date.now();
  const done=o.consumeEvent(evSail);
  let settled=false; done.then(()=>{settled=true;});
  for(let i=0;i<200&&!settled;i++){ seen.add(el.style.transform); await new Promise(r=>setTimeout(r,16)); }
  await done; seen.add(el.style.transform);
  return JSON.stringify({steps:seen.size,ms:Date.now()-t0,sailAt,frontier});
})()`));
if (c.err) console.log(`  (C NOT RUN — ${c.err}. Not a pass.)`);
else if (c.steps >= WALKED) pass(`C a second voyage — a sail landing on event ${c.sailAt}, the very index the previous voyage rode, is still WALKED: ${c.steps} positions over ${c.ms}ms`);
else fail(`C a second voyage — the sail on event ${c.sailAt} SLID: ${c.steps} position(s) in ${c.ms}ms. The walker's re-entry bookkeeping survives the new Game, so "Play again" in the same page load silently loses the ride for whichever sail lands on the index the last voyage finished on.`);

killAll();
console.log(fails
  ? `\nFAILED — ${fails} assertion(s). The walker takes its subject from the last event on the pile rather than the event being consumed, so a guest drops the ride whenever anything lands behind the sail.`
  : "\nPASSED — the walker rides the sail it is handed, whatever else has landed behind it, and a new voyage starts with a clean frontier");
process.exit(fails ? 1 : 0);
