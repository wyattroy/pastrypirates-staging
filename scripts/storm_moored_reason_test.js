#!/usr/bin/env node
// scripts/storm_moored_reason_test.js
//
// STORM-01 (D-19/D-21): DOM-free coverage for Game.mooredReason(p)/moored(p) and the folded
// isIsland(nx)||isHome(nx) windPush land branch. One boolean used to cover three unrelated
// causes ("docked last turn", "standing on a dock", "parked at a Tortuga berth") — now every
// `moored` event carries a `reason` naming which one actually fired, and the D-19 berth-
// protection invariant (a ship parked at Tortuga can never be wrecked by a storm) is proven by
// test, not assumed.
//
// Convention (matches determinism_baseline.js/hail_ranking_test.js): no assertion library, a
// local check(name, actual, expected) counter, plain console.log, process.exit(failures?1:0).
// Constructed-instance style, directly-poked player fields — mirrors 14-RESEARCH.md's own D-12
// live-repro session and 14-01/14-02's precedent, using the real generated board rather than
// fabricated engine internals: geometric preconditions (a real dock adjacent to its own island,
// an open-water cell adjacent to some island, a Tortuga berth with an island one further step
// outward) are located by scanning the actual constructed Game, searching a small range of seeds
// only if a single seed's board happens not to offer every shape this battery needs.

import { loadEngine } from "./lib/load_engine.js";
import { DIRS } from "../src/shared/index.js";

const { Game, roundCfg } = await loadEngine();

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

function freshGame(seed) {
  return new Game(roundCfg(["pirate", "balanced", "trader", "rusher"]), seed, true);
}

// A real dock cell + a real direction that lands on that dock's own island — proves adjPort(p)
// genuinely returns non-null at `approach` under cfg.singleDock. Docks can never coincide with a
// Tortuga berth (the constructor pre-claims the four berth cells before assigning docks), so
// man(approach, home) > 1 always holds here — no separate check needed.
function findDockApproach(g) {
  for (const ing of g.ings) {
    const dock = g.dockOf[ing];
    for (const dk of Object.keys(DIRS)) {
      const d = DIRS[dk];
      const nx = [dock[0] + d[0], dock[1] + d[1]];
      if (g.isIsland(nx)) return { approach: [...dock], dir: d, ing };
    }
  }
  return null;
}

// Any real open-water cell adjacent to an island — for the justDocked case, which short-circuits
// mooredReason() before any dock/home condition is even considered.
function findIslandApproach(g) {
  for (const key of Object.keys(g.islands)) {
    const [ix, iy] = key.split(",").map(Number);
    for (const dk of Object.keys(DIRS)) {
      const d = DIRS[dk];
      const wx = ix - d[0], wy = iy - d[1];
      if (g.blocked([wx, wy]) || g.isIsland([wx, wy]) || g.isHome([wx, wy])) continue;
      return { approach: [wx, wy], dir: d };
    }
  }
  return null;
}

// A Tortuga berth with a real island cell one further step outward — the "parked at a berth,
// pushed toward an adjacent island" case (D-19's `home` reason firing for a non-home destination).
function findBerthIslandPush(g) {
  for (const dk1 of Object.keys(DIRS)) {
    const bd = DIRS[dk1];
    const berth = [g.home[0] + bd[0], g.home[1] + bd[1]];
    for (const dk2 of Object.keys(DIRS)) {
      const d2 = DIRS[dk2];
      const nx = [berth[0] + d2[0], berth[1] + d2[1]];
      if (g.isHome(nx)) continue; // that's the toward-home case, tested separately below
      if (g.isIsland(nx)) return { berth, dir: d2 };
    }
  }
  return null;
}

// A Tortuga berth and the direction straight back toward home itself.
function findBerthHomePush(g) {
  for (const dk of Object.keys(DIRS)) {
    const bd = DIRS[dk];
    const berth = [g.home[0] + bd[0], g.home[1] + bd[1]];
    const back = [-bd[0], -bd[1]];
    if (g.isHome([berth[0] + back[0], berth[1] + back[1]])) return { berth, dir: back };
  }
  return null;
}

// Search a small range of seeds for one whose generated board satisfies every geometric
// precondition this battery needs, rather than hardcoding board coordinates against one frozen
// seed (which would make the test fragile to unrelated board-generation changes).
let seed = null;
for (let s = 12345; s < 12345 + 60; s++) {
  const g = freshGame(s);
  if (findDockApproach(g) && findIslandApproach(g) && findBerthIslandPush(g) && findBerthHomePush(g)) {
    seed = s;
    break;
  }
}
if (seed === null) {
  console.error("could not find a seed whose generated board satisfies the test battery's geometric preconditions");
  process.exit(1);
}

console.log(`Game.mooredReason(p)/moored(p) — the three storm-moor causes (D-19/D-21), seed ${seed}\n`);

/* ---------- reason: "justDocked" ---------- */

{
  const g = freshGame(seed);
  const { approach } = findIslandApproach(g);
  const [p] = g.players;
  p.pos = [...approach];
  p.justDocked = true;
  check("mooredReason: justDocked -> \"justDocked\"", g.mooredReason(p), "justDocked");
  check("moored() agrees with mooredReason()!==null (justDocked)", g.moored(p), g.mooredReason(p) !== null);
}

{
  // end-to-end through windPush: a justDocked player pushed toward an island moors with reason
  const g = freshGame(seed);
  const { approach, dir } = findIslandApproach(g);
  const [p] = g.players;
  p.pos = [...approach];
  p.justDocked = true;
  g.windPush(p, dir, 1);
  const ev = g.events[g.events.length - 1];
  check("windPush: justDocked player emits a moored event", ev.t, "moored");
  check("windPush(justDocked): reason field is exactly \"justDocked\"", ev.reason, "justDocked");
  check("windPush(justDocked): position unchanged (moored, no move)", `${p.pos}`, `${approach}`);
}

/* ---------- reason: "dock" ---------- */

{
  const g = freshGame(seed);
  const { approach, ing } = findDockApproach(g);
  const [p] = g.players;
  p.pos = [...approach];
  p.justDocked = false;
  check(`precondition: dock approach for ${ing} is > 1 from home (not a berth)`, mDist(approach, g.home) > 1, true);
  check("mooredReason: standing on a dock, not justDocked, not within 1 of home -> \"dock\"", g.mooredReason(p), "dock");
  check("moored() agrees with mooredReason()!==null (dock)", g.moored(p), g.mooredReason(p) !== null);
}

{
  const g = freshGame(seed);
  const { approach, dir } = findDockApproach(g);
  const [p] = g.players;
  p.pos = [...approach];
  p.justDocked = false;
  g.windPush(p, dir, 1);
  const ev = g.events[g.events.length - 1];
  check("windPush: dock-standing player emits moored with reason \"dock\"", ev.t, "moored");
  check("windPush(dock): reason field is exactly \"dock\"", ev.reason, "dock");
  check("windPush(dock): position unchanged (moored, no move)", `${p.pos}`, `${approach}`);
}

/* ---------- reason: "home" (berth, pushed toward an adjacent island) ---------- */

{
  const g = freshGame(seed);
  const { berth } = findBerthIslandPush(g);
  const [p] = g.players;
  p.pos = [...berth];
  p.justDocked = false;
  check("precondition: berth is not a dock cell (singleDock adjPort returns null)", g.cfg.singleDock && g.adjPort(p) === null, true);
  check("mooredReason: berth, not justDocked, not on a dock -> \"home\"", g.mooredReason(p), "home");
  check("moored() agrees with mooredReason()!==null (home/berth)", g.moored(p), g.mooredReason(p) !== null);
}

{
  const g = freshGame(seed);
  const { berth, dir } = findBerthIslandPush(g);
  const [p] = g.players;
  p.pos = [...berth];
  p.justDocked = false;
  g.windPush(p, dir, 1);
  const ev = g.events[g.events.length - 1];
  check("windPush: berth player pushed toward an island emits moored with reason \"home\"", ev.t, "moored");
  check("windPush(berth->island): reason field is exactly \"home\"", ev.reason, "home");
  check("windPush(berth->island): position unchanged (moored, no move)", `${p.pos}`, `${berth}`);
}

/* ---------- D-19 regression guard: a berth pushed TOWARD home stays un-wreckable ---------- */

{
  const g = freshGame(seed);
  const { berth, dir } = findBerthHomePush(g);
  const [p] = g.players;
  p.pos = [...berth];
  p.justDocked = false;
  p.coins = 0; // worst case for the aground ladder: broke, so a bad outcome would be shipwrecked
  p.ing = [];  // and holding nothing, so it can't even "lose a crate" instead
  g.windPush(p, dir, 1);
  const ev = g.events[g.events.length - 1];
  check("D-19 regression guard: berth pushed toward home never shipwrecks", p.shipwrecked, false);
  check("D-19 regression guard: berth pushed toward home never runs aground", ev.t !== "aground" && ev.t !== "shipwrecked", true);
  check("D-19 regression guard: berth pushed toward home moors with reason \"home\"", ev.t, "moored");
  check("D-19 regression guard: reason field is exactly \"home\"", ev.reason, "home");
}

/* ---------- mooredReason(p) === null for a player who is none of the three ---------- */

{
  const g = freshGame(seed);
  const { approach, dir } = findIslandApproach(g);
  // stand two squares back from the island approach cell (still open water, not justDocked, not
  // on a dock cell, and far enough that man(pos,home) is not <=1)
  const p = g.players[0];
  const farApproach = [approach[0] - dir[0], approach[1] - dir[1]];
  if (!g.blocked(farApproach) && !g.isIsland(farApproach) && !g.isHome(farApproach) && mDist(farApproach, g.home) > 1) {
    p.pos = farApproach;
    p.justDocked = false;
    check("mooredReason: none of the three causes -> null", g.mooredReason(p), null);
    check("moored() agrees with mooredReason()!==null (no cause)", g.moored(p), g.mooredReason(p) !== null);
  } else {
    console.log("  SKIP  (no reachable non-moored water cell found for this seed's board shape)");
  }
}

/* ---------- windPush never emits a bare `moored` event ---------- */

{
  const g = freshGame(seed);
  const cases = [findIslandApproach(g), (() => { const d = findDockApproach(g); return d && { approach: d.approach, dir: d.dir }; })(), (() => { const b = findBerthIslandPush(g); return b && { approach: b.berth, dir: b.dir }; })(), (() => { const b = findBerthHomePush(g); return b && { approach: b.berth, dir: b.dir }; })()];
  let allTagged = true, sawMoored = false;
  for (const c of cases) {
    if (!c) continue;
    const g2 = freshGame(seed);
    const p = g2.players[0];
    p.pos = [...c.approach];
    p.justDocked = (c === cases[0]); // the justDocked case is the only one that sets this
    g2.windPush(p, c.dir, 1);
    for (const ev of g2.events) {
      if (ev.t !== "moored") continue;
      sawMoored = true;
      if (!ev.reason || !["justDocked", "dock", "home"].includes(ev.reason)) allTagged = false;
    }
  }
  check("every moored event across the whole battery carries a reason in {justDocked,dock,home}", sawMoored && allTagged, true);
}

/* ---------- blocked/off-grid and zero-distance edge cases ---------- */

{
  const g = freshGame(seed);
  const p = g.players[0];
  const before = [...p.pos];
  const evCountBefore = g.events.length;
  // push off the top-left corner of the grid — guaranteed off-grid/blocked
  p.pos = [0, 0];
  g.windPush(p, [-1, -1], 1);
  check("windPush off-grid: no event emitted", g.events.length, evCountBefore);
  check("windPush off-grid: position unchanged", `${p.pos}`, `${[0, 0]}`);
}

{
  const g = freshGame(seed);
  const p = g.players[0];
  const before = [...p.pos];
  const evCountBefore = g.events.length;
  g.windPush(p, DIRS.N, 0);
  check("windPush(p,d,0): no event emitted", g.events.length, evCountBefore);
  check("windPush(p,d,0): position unchanged", `${p.pos}`, `${before}`);
}

function mDist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failing check(s)`);
process.exit(failures ? 1 : 0);
