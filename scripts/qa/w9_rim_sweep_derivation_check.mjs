/* W9 — THE RIM RIDE THE GUEST NEVER SEES.
 *
 * `animateRimSweepIfAny` (src/ui/flow.js) is the ONE animation that carries a ship around the
 * outer rim to the whirlpool. It takes no parameters and decides what to draw by reading
 * `g.events[n-1]` and the snapshot of `g.events[n-2]`: the previous event's recorded position is
 * used as the ride's starting square, and the ride is refused unless that square is ON THE RIM
 * (src/ui/flow.js:1043).
 *
 * THE STORM NEVER PUTS THAT SQUARE IN THE STREAM. src/engine/index.js:469 —
 *     p.pos=nx; if(this.onRim(nx)){this.tradewind(p,true);return "swept";}
 * — steps the ship onto the rim and sweeps it in the same breath, emitting NOTHING in between. So
 * the event before the `tradewind` still holds the ship one square INLAND, `onRim(from)` is false,
 * and the ride is refused.
 *
 * THE HOST HAS AN ESCAPE HATCH AND THE GUEST HAS NONE. src/ui/flow.js:1326-1328 (runStormLive)
 * reconstructs the entry square from the pre-step square plus the wind, and calls
 * animateRimSweepRun directly. runStormLive runs on the HOST ONLY — the host/guest fork is
 * src/orchestrator.js:2354 (`if(appState.isHost){runLiveNet()...}else{watchEvents()...}`), and
 * animateRimSweepRun has exactly ONE call site in the whole tree, that one. The guest's only route
 * is animateRimSweepIfAny() from consumeEvent (src/orchestrator.js:1572) — the very call the host
 * had to work around. Host watches a ride; guest watches a teleport. That is CLAUDE.md rule 23.
 *
 * WHY THIS GATE RUNS THE REAL THING INSTEAD OF READING IT. The claim is about a DERIVATION over a
 * real event stream, so the stream is POSED with the real engine (a real Game, a real stormStep on
 * a real rim cell) and the real animator is executed. Nothing below stubs anything the animator
 * uses to decide. Every ship painter in src/ui/board.js early-returns on an empty shipEls, so the
 * ride executes and simply draws nothing.
 *
 * EACH CASE GETS A FRESH flow.js. `_lastSweptEvIdx` (src/ui/flow.js:1023) is module-local state,
 * so cases sharing one import contaminate each other — except case 4, which shares one on purpose.
 *
 * THE ARGUMENTS ARE HANDED OVER. Every call passes the event being consumed and its index, the way
 * a consumer that knows its subject would. Today's animator ignores both. A fix that uses them
 * stays honest here; a fix that keeps reading the top of the pile stays red.
 *
 * RUN IT AGAINST A DIFFERENT TREE:  node scripts/qa/w9_rim_sweep_derivation_check.mjs --tree=/some/copy
 * (used to red-proof it: a copy whose stormStep emits at the rim entry makes the storm legs pass.)
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const treeArg = process.argv.find(a => a.startsWith("--tree="));
const TREE = treeArg ? path.resolve(treeArg.slice(7)) : REPO;

let fails = 0;
const pass = m => console.log("  PASS  " + m);
const fail = m => { console.log("  FAIL  " + m); fails++; };
/* An instrument that reports NOT FOUND has told you about ITSELF, not about the world. */
const missed = m => { console.log("INSTRUMENT DID NOT REACH ITS SUBJECT — " + m); process.exit(2); };

for (const rel of ["src/ui/flow.js", "src/state/index.js", "src/engine/index.js", "src/shared/index.js"])
  if (!fs.existsSync(path.join(TREE, rel))) missed(`${rel} does not exist under ${TREE}`);

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.getComputedStyle = () => ({ display: "none" });
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, documentElement: { style: {} },
};

const u = rel => `file://${path.join(TREE, rel)}`;
const { Game, roundCfg } = await import(u("src/engine/index.js"));
const { DIRS } = await import(u("src/shared/index.js"));
const { appState } = await import(u("src/state/index.js"));

const STRATS = ["pirate", "trader", "balanced", "rusher"];
const SEAT = 0;

let loads = 0;
/* Only flow.js is cache-busted. Busting src/state/index.js too would hand this harness a SECOND
   appState while flow.js kept importing the original, so nothing posed here would be visible. */
async function freshFlow() {
  const flow = await import(u("src/ui/flow.js") + `?w9=${++loads}-${Date.now()}`);
  for (const fn of ["animateRimSweepIfAny", "animateRimSweepRun", "rimSweepPath"])
    if (typeof flow[fn] !== "function")
      missed(`src/ui/flow.js does not export ${fn} — re-anchor this gate; do not delete it.`);
  return flow;
}

function newGame(seed) {
  const g = new Game({ ...roundCfg(STRATS) }, seed, true);
  if (!g.isRound) missed("the posed Game has no round board — there is no trade-wind rim to sweep along");
  if (!g.players || !g.players.length) missed("the posed Game has no players");
  return g;
}

/* Find a rim entry cell whose arc head is elsewhere, reachable by ONE downwind step from an
   ordinary inland water square. Prefer the SHORTEST arc so each ride costs the gate little time. */
function findPose(g, flow) {
  const cands = [];
  for (const cell of g.rim) {
    const [ex, ey] = cell.split(",").map(Number);
    const head = g.rimHead[cell];
    if (!head || (head[0] === ex && head[1] === ey)) continue;
    const len = flow.rimSweepPath(g, [ex, ey]).length;
    if (!len) continue;
    for (const [dirKey, d] of Object.entries(DIRS)) {
      const inner = [ex - d[0], ey - d[1]];
      const ik = inner[0] + "," + inner[1];
      if (!g.valid.has(ik) || g.rim.has(ik)) continue;
      if (g.blocked(inner) || g.isIsland(inner) || g.isHome(inner)) continue;
      cands.push({ dirKey, inner, entry: [ex, ey], head: [...head], len });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.len - b.len);
  return cands[0];
}

/* Park every other captain on the home square so nobody blocks the posed step. */
function clearOthers(g) { g.players.forEach((q, i) => { if (i !== SEAT) q.pos = [...g.home]; }); }

function useGame(g) { appState.replaying = false; appState.game = g; appState.evIdx = g.events.length - 1; }
const lastOf = g => ({ e: g.events[g.events.length - 1], i: g.events.length - 1 });

/* THE STORM: the real engine steps the ship onto the rim and sweeps it, emitting nothing between. */
function poseStormSwept(g, pose) {
  const p = g.players[SEAT];
  clearOthers(g);
  p.pos = [...pose.inner];
  g.ev({ t: "storm", dir: pose.dirKey, dist: 3 });     // the event runStormLive emits first
  const outcome = g.stormStep(p, pose.dirKey);
  if (outcome !== "swept")
    missed(`the posed storm step returned "${outcome}", not "swept" — this gate never created the state it measures`);
  const last = g.events[g.events.length - 1];
  if (!last || last.t !== "tradewind")
    missed(`the posed storm sweep did not emit a tradewind event (got "${last && last.t}")`);
  return p;
}

/* THE RIM ESCAPE: an event AT the rim entry, then the sweep — the shape the animator was built for
   and the one already checked clean (src/engine/index.js rimEscape). This is the CONTROL. */
function poseEntryThenSweep(g, pose, filler = 1) {
  const p = g.players[SEAT];
  clearOthers(g);
  for (let i = 0; i < filler; i++) g.ev({ t: "newround", p: SEAT });
  p.pos = [...pose.entry];
  g.ev({ t: "windmove", p: SEAT });                    // snapshot taken AT the rim entry
  if (!g.tradewind(p)) missed("tradewind() refused the posed rim entry — no ride exists to measure");
  return p;
}

console.log(`TREE UNDER TEST — ${TREE}`);
console.log(`SUBJECT REACHED — running src/ui/flow.js animateRimSweepIfAny() for real over a POSED engine event stream\n`);

/* ─── 0. THE INSTRUMENT, BOTH WAYS. A check that cannot fail is not a measurement; a check that
       cannot pass condemns working code. Prove both before believing any verdict below. ─────── */
{
  const flow = await freshFlow();
  const g = newGame(4242);
  const pose = findPose(g, flow);
  if (!pose) missed("no rim entry with a non-trivial arc exists on the posed board");
  poseEntryThenSweep(g, pose);
  useGame(g);
  const { e, i } = lastOf(g);
  if (await flow.animateRimSweepIfAny(e, i) === true)
    pass(`CONTROL (must ride): an event AT the rim entry then a tradewind DOES ride — the instrument reaches the animator (arc ${pose.len} cells)`);
  else missed("the rim-escape shape — the one this animator documents as working — did not ride. The harness is not reaching the animator; every verdict below would be meaningless.");

  const f2 = await freshFlow();
  const g2 = newGame(4242);
  const p2 = g2.players[SEAT];
  clearOthers(g2);
  g2.ev({ t: "newround", p: SEAT }); g2.ev({ t: "newround", p: SEAT });
  useGame(g2);
  const l2 = lastOf(g2);
  if (await f2.animateRimSweepIfAny(l2.e, l2.i) !== true)
    pass("CONTROL (must NOT ride): a stream whose last event is not a tradewind does not ride — this gate can return false");
  else missed("a non-tradewind stream reported a ride. This instrument cannot fail and must not be trusted.");
  void p2;
}

/* ─── 1. THE STORM, ON THE GUEST'S ONLY ROUTE. This is the item. ──────────────────────────── */
let guestRodeStorm = null;
{
  const flow = await freshFlow();
  const g = newGame(4242);
  const pose = findPose(g, flow);
  const p = poseStormSwept(g, pose);
  useGame(g);
  const { e, i } = lastOf(g);
  const rode = await flow.animateRimSweepIfAny(e, i) === true;
  guestRodeStorm = rode;
  if (rode)
    pass("a STORM sweep rides on the guest's route (animateRimSweepIfAny from consumeEvent)");
  else
    fail(`a STORM sweep DID NOT RIDE on the guest's route. The ship was at [${pose.inner}] in the previous event's `
       + `snapshot and is at [${p.pos}] in the tradewind's; the rim entry [${pose.entry}] appears in NO event, because `
       + `src/engine/index.js:469 steps onto the rim and sweeps in one breath. So onRim(from) is false at `
       + `src/ui/flow.js:1043 and the ride is refused. On the wire this is a guest watching a ship TELEPORT to the `
       + `whirlpool while the host watches it carried around the rim.`);
}

/* ─── 2. THE SAME POSED STORM, ON THE HOST'S ROUTE. If this rides and case 1 does not, the two
       tiers are drawing the same game differently — CLAUDE.md rule 23, measured. ───────────── */
{
  const flow = await freshFlow();
  const g = newGame(4242);
  const pose = findPose(g, flow);
  const p = poseStormSwept(g, pose);
  useGame(g);
  const hostRode = await flow.animateRimSweepRun(SEAT, pose.entry, [...p.pos]) === true;
  if (hostRode && guestRodeStorm === false)
    fail(`HOST/GUEST DIVERGENCE, on one posed storm: the host's reconstructed-entry fallback `
       + `(src/ui/flow.js:1326-1328, runStormLive) RIDES the same sweep the guest's route refused in case 1. `
       + `runStormLive is host-only (src/orchestrator.js:2354) and animateRimSweepRun has no other call site in `
       + `the tree, so the guest has no way to reach it. Same board, same event, two different pictures.`);
  else
    pass(`the two tiers agree on the posed storm (guest rode=${guestRodeStorm}, host rode=${hostRode}) — no rule-23 divergence here`);
}

/* Case 3 — THE FLEEING SHIP — has its own gate, scripts/qa/w9_rim_sweep_flee_check.mjs: two faults
   at one site (no route on the wire; the rim ride skipped), both on BOTH screens, and a different
   severity from the host/guest divergence measured here. Three defects, three before-pictures. */

/* ─── 4. THE RACE. A tradewind consumed while a LATER event already sits on top of the pile. ─
       watchEvents (src/orchestrator.js) pushes each arriving event BEFORE awaiting consumeEvent,
       so the top of the pile is regularly not the event being consumed — measured on sails as
       3 in 8 (w7_route_derivation_check.mjs). The rim ride reads the pile the same way. */
{
  const flow = await freshFlow();
  const g = newGame(4242);
  const pose = findPose(g, flow);
  poseEntryThenSweep(g, pose);
  const tw = lastOf(g);                                 // the tradewind, before anything lands behind it
  g.ev({ t: "newround", p: SEAT });                     // a later event arrives while the consumer is suspended
  useGame(g);
  if (await flow.animateRimSweepIfAny(tw.e, tw.i) === true)
    pass("a tradewind consumed while a LATER event already sits on top of the pile still rides");
  else
    fail(`a tradewind consumed while a LATER event sits at events[n-1] DID NOT RIDE. The animator reads `
       + `g.events[n-1] (src/ui/flow.js:1031) instead of the event it was handed, finds a non-tradewind and `
       + `returns. Every event that lands behind a sweep before its consumer runs costs a guest the ride.`);
}

/* ─── 5. THE SECOND VOYAGE. `_lastSweptEvIdx` (src/ui/flow.js:1023) is a module-local ARRAY
       POSITION that survives a new Game, so Play again in one page load refuses whichever sweep
       lands on the index the last voyage finished on. ONE shared module, on purpose. ───────── */
{
  const flow = await freshFlow();
  const g1 = newGame(4242);
  const pose1 = findPose(g1, flow);
  poseEntryThenSweep(g1, pose1);
  useGame(g1);
  const l1 = lastOf(g1);
  if (await flow.animateRimSweepIfAny(l1.e, l1.i) !== true)
    missed("voyage 1's own sweep did not ride — this case cannot set up its collision");
  const idx1 = l1.i;

  const g2 = newGame(1717);                             // a brand-new Game, as beginGame builds
  const pose2 = findPose(g2, flow);
  if (!pose2) missed("voyage 2's board offers no rim entry to pose");
  poseEntryThenSweep(g2, pose2, /* filler */ idx1 - 1); // land the tradewind on the SAME index
  useGame(g2);
  const l2 = lastOf(g2);
  if (l2.i !== idx1) missed(`voyage 2's tradewind landed at index ${l2.i}, not ${idx1} — the collision was not built`);
  if (await flow.animateRimSweepIfAny(l2.e, l2.i) === true)
    pass("the first sweep of a SECOND voyage in one page load rides — the guard is not stranded across voyages");
  else
    fail(`the first sweep of a SECOND voyage in one page load DID NOT RIDE. _lastSweptEvIdx is a module-local array `
       + `position that survives the new Game (src/ui/flow.js:1023,1036), so it still holds voyage 1's index ${idx1} `
       + `and refuses a brand-new sweep that lands on the same one.`);
}

console.log(fails
  ? `\nFAILED — ${fails} case(s). The rim ride is decided from the top of the event pile and from a starting square `
    + `the storm never records, so the guest — whose only route is animateRimSweepIfAny — loses rides the host keeps.`
  : "\nPASSED — the rim ride is drawn for the event it is given, on a storm, after a flee, behind a later event, and across voyages");
process.exit(fails ? 1 : 0);   // src/ui/stage.js arms a 500ms interval at module load; nothing clears it
