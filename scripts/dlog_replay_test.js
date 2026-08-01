#!/usr/bin/env node
// notes/edits BUG-03/BUG-04: covers the Wave 0 gap from 01-VALIDATION.md — the host-refresh
// replay-shortfall detector had no automated coverage at all, and the reported failure ("refresh
// reset the ENTIRE game") is exactly what an undetected short replay looks like.
//
// Like scripts/real_game_test.js, this runs the REAL code rather than a reimplementation — but
// it needs two separate sources, because the two things it exercises live in different places:
//   1. The `Game`/`roundCfg` engine, obtained the same way real_game_test.js gets it — a native
//      `import` via scripts/lib/load_engine.js — so a realistic event count comes from an
//      actually played game instead of a magic number invented by this test.
//   2. `replayShortfall`/`REPLAY_SHORTFALL_TOLERANCE`, which used to live inside a sentinel-comment
//      region in the classic-script multiplayer/Firebase section of index.html, sliced out via
//      `node:vm` at test time because nothing could `import` a plain classic-script global.
//      Phase 11 (11-02) moved both into src/ui/util.js as real named exports, so this now does a
//      native `import` of that module instead — the sentinel-slicing hack is retired. The
//      surrounding recovery logic (resumeHostGame/endReplay) is still welded to Firebase and the
//      DOM and stays untestable this way; only the pure shortfall-classification function moved.
//
// If either source drifts, this throws loudly. A harness that silently passes because its
// extraction boundaries moved is worse than no harness.

import { loadEngine } from "./lib/load_engine.js";
import { replayShortfall, REPLAY_SHORTFALL_TOLERANCE } from "../src/ui/util.js";

/* ---------- source 1: the Game engine (same seam real_game_test.js uses) ---------------------- */
// Routed through scripts/lib/load_engine.js (D-12) — the shared seam both harnesses now use.
const { Game, roundCfg } = await loadEngine();

/* ---------- source 2: the real, moved replayShortfall (src/ui/util.js, 11-02) ------------------ */
if (typeof replayShortfall !== "function") {
  throw new Error("replayShortfall did not come from src/ui/util.js — has it moved or been renamed?");
}
if (typeof REPLAY_SHORTFALL_TOLERANCE !== "number") {
  throw new Error("REPLAY_SHORTFALL_TOLERANCE did not come from src/ui/util.js, or is not a number.");
}

/* ---------- cases ----------------------------------------------------------------------------- */
let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(58)} got=${String(actual).padEnd(6)} want=${expected}`);
}

console.log(`replayShortfall — real extracted helper (tolerance=${REPLAY_SHORTFALL_TOLERANCE})\n`);

console.log("synthetic cases:");
let r;
r = replayShortfall(120, 120, false);
check("healthy, exact match -> incomplete", r.incomplete, false);
check("healthy, exact match -> shortfall", r.shortfall, 0);

r = replayShortfall(118, 120, false);
check("healthy, one in-flight decision -> incomplete", r.incomplete, false);

r = replayShortfall(0, 214, false);
check("catastrophic empty dlog -> incomplete", r.incomplete, true);
check("catastrophic empty dlog -> shortfall", r.shortfall, 214);
check("catastrophic empty dlog -> reason", r.reason, "short-replay");

r = replayShortfall(214, 214, true);
check("read failure dominates matching counts", r.incomplete, true);
check("read failure -> reason", r.reason, "read-failed");

r = replayShortfall(0, 0, false);
check("degenerate brand-new game -> incomplete", r.incomplete, false);

r = replayShortfall(300, 120, false);
check("rebuilt past frontier -> incomplete", r.incomplete, false);
check("rebuilt past frontier -> shortfall clamped", r.shortfall, 0);

/* ---------- one realistic end-to-end case, from an actually played game ----------------------- */
const strategies = ["pirate", "trader", "balanced", "rusher"];
// third arg is `record` — without it Game.ev() early-returns and no events accumulate at all
const g = new Game(roundCfg(strategies), 12345, true);
g.play();
const realLen = g.events.length;
if (!realLen) throw new Error("Played game produced zero events — engine extraction is suspect.");

console.log(`\nreal game (seed 12345, ${strategies.length} bots, ${realLen} events):`);
check("one unlogged in-flight decision -> healthy",
  replayShortfall(realLen - 1, realLen, false).incomplete, false);
check("nothing rebuilt -> incomplete",
  replayShortfall(0, realLen, false).incomplete, true);

console.log(`\n${failures === 0 ? "All cases passed." : failures + " case(s) FAILED."}`);
process.exit(failures === 0 ? 0 : 1);
