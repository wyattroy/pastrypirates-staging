#!/usr/bin/env node
// scripts/bot_storm_narration_test.js
//
// STORM-01 (D-09/D-10/D-11): DOM-free proof of the invariant botWindLeg (src/ui/flow.js) depends
// on — that delegating a storm push to the engine ONE SQUARE AT A TIME (via repeated
// windPush(p,d,1,dodgedOnce) calls, stopping exactly when the engine itself would have stopped) is
// indistinguishable from a single windPush(p,d,2,dodgedOnce) call: identical final position,
// identical event stream. botWindLeg itself needs the DOM (liveRender/flash/sleep), but this
// invariant does not — and it is the load-bearing part: if a per-square push ever diverged from a
// two-square push, bots would silently start playing a different game from the one the simulator
// and the human path both agree on.
//
// Convention (matches determinism_baseline.js/hail_ranking_test.js/storm_moored_reason_test.js): no
// assertion library, a local check(name, actual, expected) counter, plain console.log,
// process.exit(failures?1:0). Constructed-instance style, directly-poked player fields, seed-search
// for geometric preconditions rather than hardcoded board coordinates against one frozen seed.
//
// Deliberately does NOT import src/ui/flow.js or reference `document` — this script proves the
// engine-level invariant only; botWindLeg's own DOM-facing narration/pacing is exercised by manual
// UAT (14-06), same split storm_moored_reason_test.js already draws for windPush vs. windLeg.

import { loadEngine } from "./lib/load_engine.js";
import { DIRS } from "../src/shared/index.js";
import { EVENT_NARRATION, describe, movedSinceTurnStart } from "../src/ui/util.js";
import { appState } from "../src/state/index.js";

const { Game, roundCfg } = await loadEngine();

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

function freshGame(seed) {
  return new Game(roundCfg(["pirate", "balanced", "trader", "rusher"]), seed, true);
}
function mDist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }

// Per-square delegator mirroring botWindLeg's OWN stopping predicate exactly (event added ->
// stop; moved but landed on the rim -> stop; neither moved nor recorded anything (blocked) ->
// stop; otherwise the square was ordinary open water — continue). This is the invariant
// botWindLeg's real DOM-facing code depends on; reproducing it here, DOM-free, is what lets this
// script prove the invariant instead of merely assuming it.
function twoStepPush(g, p, dir, once) {
  for (let step = 0; step < 2; step++) {
    const before = [...p.pos];
    const evBefore = g.events.length;
    g.windPush(p, dir, 1, once);
    if (g.events.length > evBefore) return; // the square's own outcome ends the leg
    if (p.pos[0] === before[0] && p.pos[1] === before[1]) return; // blocked (off-grid) — silent stop
    if (g.onRim(p.pos)) return; // the engine already resolved the rim; no further square to push
    // else: ordinary open water — continue to the next square
  }
}

/* ---------- geometric-precondition finders (scan the real generated board) ---------- */

// Two consecutive clean squares in some direction from some cell: no blocked/island/home/other-
// ship/rim on either intermediate cell. The "open water ahead" and "another ship ahead" (the
// second cell gets a ship placed on it afterward) scenarios both start from this.
function findOpenRun(g, excludeSeats) {
  const n = g.cfg.grid;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
    const pos = [x, y];
    if (g.blocked(pos) || g.isIsland(pos) || g.isHome(pos) || g.onRim(pos)) continue;
    for (const dk of Object.keys(DIRS)) {
      const d = DIRS[dk];
      const s1 = [pos[0] + d[0], pos[1] + d[1]];
      const s2 = [pos[0] + d[0] * 2, pos[1] + d[1] * 2];
      const clean = c => !g.blocked(c) && !g.isIsland(c) && !g.isHome(c) && !g.onRim(c)
        && !g.players.some((q, qi) => !excludeSeats.includes(qi) && q.pos[0] === c[0] && q.pos[1] === c[1]);
      if (clean(s1) && clean(s2)) return { pos, dir: d, s1, s2 };
    }
  }
  return null;
}

// An open-water cell one square before an island, with NEITHER a dock cell NOR within 1 of home —
// guarantees mooredReason(p)===null there (with p.justDocked=false), so windPush's decision ladder
// (pay/flip/aground/shipwreck) actually runs instead of an immediate moored/anchorHold short-circuit.
function findFreeIslandApproach(g) {
  for (const key of Object.keys(g.islands)) {
    const [ix, iy] = key.split(",").map(Number);
    for (const dk of Object.keys(DIRS)) {
      const d = DIRS[dk];
      const w = [ix - d[0], iy - d[1]];
      if (g.blocked(w) || g.isIsland(w) || g.isHome(w)) continue;
      if (g.dockCells.has(w[0] + "," + w[1])) continue; // would satisfy the "dock" reason instead
      if (mDist(w, g.home) <= 1) continue; // would satisfy the "home" reason instead (a berth)
      // also require a clean cell BEFORE w in the same direction, so a full 2-square push can
      // advance cleanly through w's own predecessor and hit the island on square 2, not square 1
      const before = [w[0] - d[0], w[1] - d[1]];
      if (g.blocked(before) || g.isIsland(before) || g.isHome(before) || g.onRim(before)) continue;
      return { before, approach: w, dir: d };
    }
  }
  return null;
}

// A Tortuga berth with the direction straight back toward home itself — an immediate (square-1)
// "home ahead" stop, reproducing the D-19 berth-protection guarantee.
function findBerthHomePush(g) {
  for (const dk of Object.keys(DIRS)) {
    const bd = DIRS[dk];
    const berth = [g.home[0] + bd[0], g.home[1] + bd[1]];
    const back = [-bd[0], -bd[1]];
    if (g.isHome([berth[0] + back[0], berth[1] + back[1]])) return { berth, dir: back };
  }
  return null;
}

let seed = null;
let picked = {};
for (let s = 12345; s < 12345 + 80; s++) {
  const g = freshGame(s);
  const openRun = findOpenRun(g, []);
  const islandApproach = findFreeIslandApproach(g);
  const berthHome = findBerthHomePush(g);
  if (openRun && islandApproach && berthHome) {
    seed = s;
    picked = { openRun, islandApproach, berthHome };
    break;
  }
}
if (seed === null) {
  console.error("could not find a seed whose generated board satisfies the test battery's geometric preconditions");
  process.exit(1);
}
console.log(`Bot storm-push equivalence (D-09/D-10/D-11) — seed ${seed}\n`);

/* ---------- scenario 1: open water ahead (both squares clean, no event either way) ---------- */

{
  const { pos, dir } = picked.openRun;
  const gA = freshGame(seed), gB = freshGame(seed);
  const pA = gA.players[0], pB = gB.players[0];
  pA.pos = [...pos]; pB.pos = [...pos];
  const onceA = { v: false }, onceB = { v: false };
  const evBeforeA = gA.events.length, evBeforeB = gB.events.length;
  gA.windPush(pA, dir, 2, onceA);
  twoStepPush(gB, pB, dir, onceB);
  check("open water: dist=2 and two dist=1 calls leave an identical final position", `${pA.pos}`, `${pB.pos}`);
  check("open water: identical event stream (both empty)", JSON.stringify(gA.events.slice(evBeforeA)), JSON.stringify(gB.events.slice(evBeforeB)));
  check("open water: no event is appended by either path", gA.events.length, evBeforeA);
}

/* ---------- scenario 2: island ahead (square 2), mooredReason===null — the decision ladder ---------- */

{
  const { before, dir } = picked.islandApproach;
  const gA = freshGame(seed), gB = freshGame(seed);
  const pA = gA.players[0], pB = gB.players[0];
  pA.pos = [...before]; pA.justDocked = false;
  pB.pos = [...before]; pB.justDocked = false;
  const onceA = { v: false }, onceB = { v: false };
  const evBeforeA = gA.events.length, evBeforeB = gB.events.length;
  gA.windPush(pA, dir, 2, onceA);
  twoStepPush(gB, pB, dir, onceB);
  check("island ahead: dist=2 and two dist=1 calls leave an identical final position", `${pA.pos}`, `${pB.pos}`);
  check("island ahead: identical event stream", JSON.stringify(gA.events.slice(evBeforeA)), JSON.stringify(gB.events.slice(evBeforeB)));
  check("island ahead: exactly one event appended (one outcome square, one event)", gA.events.length - evBeforeA, 1);
  const evA = gA.events[gA.events.length - 1];
  checkTrue("island ahead: outcome is one of the decision-ladder events", ["dodge", "anchor", "aground", "shipwrecked"].includes(evA.t));
}

/* ---------- scenario 3: another ship ahead (square 2 occupied) ---------- */

{
  const { pos, dir, s2 } = picked.openRun;
  const gA = freshGame(seed), gB = freshGame(seed);
  const pA = gA.players[0], pB = gB.players[0];
  pA.pos = [...pos]; pB.pos = [...pos];
  // seat 1 blocks square 2 in both instances — an identically-placed ship, not a random one
  gA.players[1].pos = [...s2]; gA.players[1].done = false;
  gB.players[1].pos = [...s2]; gB.players[1].done = false;
  const onceA = { v: false }, onceB = { v: false };
  const evBeforeA = gA.events.length, evBeforeB = gB.events.length;
  gA.windPush(pA, dir, 2, onceA);
  twoStepPush(gB, pB, dir, onceB);
  check("ship ahead: dist=2 and two dist=1 calls leave an identical final position", `${pA.pos}`, `${pB.pos}`);
  check("ship ahead: identical event stream", JSON.stringify(gA.events.slice(evBeforeA)), JSON.stringify(gB.events.slice(evBeforeB)));
  check("ship ahead: exactly one event appended", gA.events.length - evBeforeA, 1);
  check("ship ahead: the one event is \"blocked\"", gA.events[gA.events.length - 1].t, "blocked");
  check("ship ahead: the ship advanced exactly one square, not two", `${pA.pos}`, `${s1of(pos, dir)}`);
}
function s1of(pos, dir) { return [pos[0] + dir[0], pos[1] + dir[1]]; }

/* ---------- scenario 4: home ahead (berth pushed toward Tortuga — immediate, square 1) ---------- */

{
  const { berth, dir } = picked.berthHome;
  const gA = freshGame(seed), gB = freshGame(seed);
  const pA = gA.players[0], pB = gB.players[0];
  pA.pos = [...berth]; pA.justDocked = false;
  pB.pos = [...berth]; pB.justDocked = false;
  const onceA = { v: false }, onceB = { v: false };
  const evBeforeA = gA.events.length, evBeforeB = gB.events.length;
  gA.windPush(pA, dir, 2, onceA);
  twoStepPush(gB, pB, dir, onceB);
  check("home ahead: dist=2 and two dist=1 calls leave an identical final position", `${pA.pos}`, `${pB.pos}`);
  check("home ahead: identical event stream", JSON.stringify(gA.events.slice(evBeforeA)), JSON.stringify(gB.events.slice(evBeforeB)));
  check("home ahead: exactly one event appended", gA.events.length - evBeforeA, 1);
  const evA = gA.events[gA.events.length - 1];
  check("home ahead: the event is \"moored\"", evA.t, "moored");
  check("home ahead: reason is exactly \"home\"", evA.reason, "home");
  checkTrue("home ahead: reason is a member of {justDocked,dock,home} (assertion 3)", ["justDocked", "dock", "home"].includes(evA.reason));
}

/* ---------- scenario 5: off-grid edge ahead (blocked immediately — the no-op edge) ---------- */

{
  const gA = freshGame(seed), gB = freshGame(seed);
  const pA = gA.players[0], pB = gB.players[0];
  pA.pos = [0, 0]; pB.pos = [0, 0];
  const dir = [-1, -1]; // guaranteed off-grid regardless of board shape
  const onceA = { v: false }, onceB = { v: false };
  const evBeforeA = gA.events.length, evBeforeB = gB.events.length;
  gA.windPush(pA, dir, 2, onceA);
  twoStepPush(gB, pB, dir, onceB);
  check("off-grid: dist=2 and two dist=1 calls leave an identical (unchanged) position", `${pA.pos}`, `${pB.pos}`);
  check("off-grid: identical event stream (both empty — the no-op edge stays a no-op)", JSON.stringify(gA.events.slice(evBeforeA)), JSON.stringify(gB.events.slice(evBeforeB)));
  check("off-grid: position genuinely unchanged from [0,0]", `${pA.pos}`, `${[0, 0]}`);
  check("off-grid: no event appended", gA.events.length, evBeforeA);
}

/* ---------- scenario 6: a second leg after a first-leg dodge — dodgedOnce carries over ---------- */

{
  const { approach, dir } = picked.islandApproach;
  const g = freshGame(seed);
  const p = g.players[0];
  p.pos = [...approach]; p.justDocked = false;
  const dodgedOnce = { v: false };
  g.windPush(p, dir, 1, dodgedOnce); // leg 1: hits the island, pays/flips, sets dodgedOnce.v=true
  const firstEv = g.events[g.events.length - 1];
  checkTrue("second leg: leg 1's outcome is a real decision-ladder event", ["dodge", "anchor", "aground", "shipwrecked"].includes(firstEv.t));
  checkTrue("second leg: leg 1 sets dodgedOnce.v", dodgedOnce.v, true);
  const posAfterLeg1 = [...p.pos];
  const evBefore2 = g.events.length;
  g.windPush(p, dir, 1, dodgedOnce); // leg 2, SAME direction, SHARED dodgedOnce: a free pass
  check("second leg: exactly one more event appended", g.events.length - evBefore2, 1);
  check("second leg: the second island encounter is a free pass (anchorHold), not a repeat flip", g.events[g.events.length - 1].t, "anchorHold");
  check("second leg: position unchanged across both legs (moored/anchorHold never move a ship)", `${p.pos}`, `${posAfterLeg1}`);
}

/* ---------- assertion 4: EVENT_NARRATION.moored — engine reasons stay distinct; narration collapses justDocked/home ---------- */

// Wyatt's copy decision (2026-07-26, 14-06 Task 1/2): the engine still tags every moored event
// with a distinct `reason` (justDocked/dock/home — untouched, still asserted at the engine level
// above and in scripts/storm_moored_reason_test.js). But at the NARRATION layer only, `home` (a
// Tortuga berth) now renders the exact same line as `justDocked`, since D-18 treats Tortuga as a
// normal island/dock and it should not get bespoke wording.
//
// BUG-2 (.planning/debug/resolved/storm-push-not-rendered.md) refined `dock` further: it is NOT
// unconditionally its own line. reason `dock` fires whenever the ship is standing on a dock when a
// gust would run it aground, and that covers two different stories — the storm shoved it onto that
// dock earlier in the same push (D-20's lucky save, which the "the gust shoves…" copy describes),
// or it was parked there before the storm and never moved (which that copy misdescribes; Wyatt
// watched it announce a shove that never happened). The engine cannot distinguish them and must
// not change (`reason` is serialized into all 31 determinism fixtures), so src/ui/util.js's
// movedSinceTurnStart() decides the wording from the position snapshots already in the event
// stream. These checks pin BOTH halves of that rule against real engine-built event streams.
{
  const at = () => [0, 0];
  const f = EVENT_NARRATION.moored;
  const texts = ["justDocked", "dock", "home"].map(reason => f({ t: "moored", p: 0, reason }, at).txt);
  check("EVENT_NARRATION.moored: justDocked and home render the identical narration line", texts[0], texts[2]);
  const bare = f({ t: "moored", p: 0 }, at).txt;
  checkTrue("EVENT_NARRATION.moored: no-reason event renders a real (non-empty, non-undefined) line", !!bare && !/undefined/.test(bare));
  checkTrue("describe(): a reasoned moored event still produces a non-null captain's-log line", describe({ t: "moored", p: 0, reason: "dock" }) !== null);
  // the safe default: a detached/fabricated event carries no snapshot to compare, so the wording
  // must fall back to the honest "still docked" line and never claim a shove it cannot evidence
  check("EVENT_NARRATION.moored: reason \"dock\" with no position evidence renders the \"still docked\" line, not the shove line", texts[1], texts[0]);
}

/* ---------- assertion 5 (BUG-2): reason "dock" picks its wording from whether the ship moved ---------- */

// A storm's second gust always blows PERPENDICULAR to its first (PERP, src/shared/index.js:148),
// never back along it, so a storm can never return a ship to the square it started the turn on.
// That is what makes "position at the `turn` event !== position now" an exact test for "this storm
// actually moved this ship", and it is the comparison movedSinceTurnStart() performs.

// A dock cell whose island lies one step further along `dir`, with the square BEFORE the dock
// (dock - dir) ordinary open water — so a ship starting there is pushed ONTO the dock and only
// then meets the island. This is D-20's genuine lucky save, the one case the shove copy describes.
function findShovedOntoDock(g) {
  for (const ing of g.ings) {
    const dock = g.dockOf[ing];
    for (const dk of Object.keys(DIRS)) {
      const d = DIRS[dk];
      if (!g.isIsland([dock[0] + d[0], dock[1] + d[1]])) continue;
      const from = [dock[0] - d[0], dock[1] - d[1]];
      if (g.blocked(from) || g.isIsland(from) || g.isHome(from) || g.onRim(from)) continue;
      if (mDist(from, g.home) <= 1) continue;   // a berth would moor with reason "home" instead
      return { from, dock: [...dock], dir: d };
    }
  }
  return null;
}

// The already-parked case: standing ON a dock with its island straight ahead — the ship never moves.
function findParkedOnDock(g) {
  for (const ing of g.ings) {
    const dock = g.dockOf[ing];
    for (const dk of Object.keys(DIRS)) {
      const d = DIRS[dk];
      if (g.isIsland([dock[0] + d[0], dock[1] + d[1]])) return { dock: [...dock], dir: d };
    }
  }
  return null;
}

{
  const at = () => [0, 0];
  const f = EVENT_NARRATION.moored;
  const stillDockedLine = f({ t: "moored", p: 0, reason: "justDocked" }, at).txt;

  // movedSinceTurnStart() reads the live event stream off appState.game — the same stream the
  // captain's log, every remote guest and a reload-replay all describe() from. Pointing appState at
  // the constructed game is all this DOM-free harness needs to exercise the real code path.
  const shoved = findShovedOntoDock(freshGame(seed));
  const parked = findParkedOnDock(freshGame(seed));
  if (!shoved || !parked) {
    console.log("  FAIL  BUG-2: seed's board offers no shoved-onto-dock / parked-on-dock geometry");
    failures++;
  } else {
    {
      // moved: open water -> pushed onto the dock -> island. The shove really happened.
      const g = freshGame(seed);
      appState.game = g;
      const [p] = g.players;
      g.players.forEach((q, i) => { if (i) q.done = true; });
      p.pos = [...shoved.from];
      p.justDocked = false;
      g.ev({ t: "turn", p: p.idx });
      g.windPush(p, shoved.dir, 2, { v: false });
      const ev = g.events[g.events.length - 1];
      check("BUG-2 (moved): the engine still emits moored/dock for a ship shoved onto a dock", `${ev.t}/${ev.reason}`, "moored/dock");
      check("BUG-2 (moved): the ship genuinely advanced onto the dock square", `${p.pos}`, `${shoved.dock}`);
      checkTrue("BUG-2 (moved): movedSinceTurnStart() reports true", movedSinceTurnStart(ev) === true);
      checkTrue("BUG-2 (moved): narration IS the \"gust shoves … onto a dock\" line", /gust shoves/.test(f(ev, at).txt));
    }
    {
      // never moved: parked on the dock before the storm. The shove line would be a lie.
      const g = freshGame(seed);
      appState.game = g;
      const [p] = g.players;
      g.players.forEach((q, i) => { if (i) q.done = true; });
      p.pos = [...parked.dock];
      p.justDocked = false;
      g.ev({ t: "turn", p: p.idx });
      g.windPush(p, parked.dir, 1, { v: false });
      const ev = g.events[g.events.length - 1];
      check("BUG-2 (not moved): the engine still emits the SAME moored/dock reason (event stream unchanged)", `${ev.t}/${ev.reason}`, "moored/dock");
      check("BUG-2 (not moved): the ship never left its dock square", `${p.pos}`, `${parked.dock}`);
      checkTrue("BUG-2 (not moved): movedSinceTurnStart() reports false", movedSinceTurnStart(ev) === false);
      checkTrue("BUG-2 (not moved): narration does NOT claim a shove", !/gust shoves/.test(f(ev, at).txt));
      check("BUG-2 (not moved): narration is the already-approved \"still docked\" line", f(ev, at).txt, stillDockedLine);
    }
    {
      // boundary: an INTERVENING event sits between the turn event and the moored event. This is
      // the ordinary two-leg storm — botWindLeg emits a `windmove` summary when leg 1 ends, and
      // that event's snapshot already holds the moved-to square. The anchor must remain the `turn`
      // event; anchoring on "the previous event" instead would read this genuine shove as "never
      // moved" and silently lose D-20's lucky-save line. (Mutation-checked: relaxing the
      // turn-event search in movedSinceTurnStart survives every other case in this battery.)
      const g = freshGame(seed);
      appState.game = g;
      const [p] = g.players;
      g.players.forEach((q, i) => { if (i) q.done = true; });
      p.pos = [...shoved.from];
      p.justDocked = false;
      g.ev({ t: "turn", p: p.idx });
      g.windPush(p, shoved.dir, 1, { v: false });   // leg 1: steps onto the dock square, emits nothing
      g.ev({ t: "windmove", p: p.idx });            // ...then the leg-end summary botWindLeg emits
      g.windPush(p, shoved.dir, 1, { v: false });   // leg 2: meets the island, moors against the dock
      const ev = g.events[g.events.length - 1];
      check("BUG-2 (intervening event): the moored/dock reason still arrives after a leg-end windmove", `${ev.t}/${ev.reason}`, "moored/dock");
      checkTrue("BUG-2 (intervening event): movedSinceTurnStart() still anchors on the turn event, not the windmove", movedSinceTurnStart(ev) === true);
      checkTrue("BUG-2 (intervening event): the lucky-save shove line survives an intervening event", /gust shoves/.test(f(ev, at).txt));
    }
    {
      // boundary: the nearest preceding `turn` belongs to ANOTHER seat, so there is no valid
      // anchor to measure against — must report "can't tell" and fall back to the honest line
      const g = freshGame(seed);
      appState.game = g;
      const [p] = g.players;
      g.players.forEach((q, i) => { if (i) q.done = true; });
      p.pos = [...parked.dock];
      p.justDocked = false;
      g.ev({ t: "turn", p: 1 }); // a different seat's turn — the wrong anchor
      g.windPush(p, parked.dir, 1, { v: false });
      const ev = g.events[g.events.length - 1];
      checkTrue("BUG-2 (wrong anchor): movedSinceTurnStart() reports null rather than guessing", movedSinceTurnStart(ev) === null);
      checkTrue("BUG-2 (wrong anchor): narration falls back to the no-shove line", !/gust shoves/.test(f(ev, at).txt));
    }
  }
}

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failing check(s)`);
process.exit(failures ? 1 : 0);
