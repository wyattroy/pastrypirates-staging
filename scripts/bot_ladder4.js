#!/usr/bin/env node
// scripts/bot_ladder4.js
//
// THE /4 BALANCE MEASUREMENT. One brain, one table, a TIME axis.
//
// This script used to be a head-to-head: two planners seated against each other at one table, the
// control seats running the incumbent whole-turn planner that /4 inherited from /v2bakeoff. That
// planner is being deleted, and it is deliberately not named anywhere in this file — naming a
// method a later commit removes is how a tuning tool breaks silently. The arrangement is gone and
// it is not coming back —
// `/4` ships exactly one bot brain, `planTurn()` dispatches to it unconditionally, and tuning a bot
// against a planner the game does not use measures a game nobody plays. So there is no longer a
// SEAT axis to compare within a run.
//
// What replaces it is a TIME axis: run the IDENTICAL command on the same seeds either side of the
// change you are measuring, and diff the two records. Every seat runs the shipping brain in both
// runs, so anything that moved, the change moved.
//
//   node scripts/bot_ladder4.js [games] [seedMult] [--json]
//
// USING IT AS A BEFORE/AFTER GATE.
//   1. On the tree BEFORE the change:  node scripts/bot_ladder4.js 400 7919 --json > before.json
//   2. Land the change.
//   3. On the tree AFTER the change:   node scripts/bot_ladder4.js 400 7919 --json > after.json
//   4. Diff them. Same seeds, same ruleset, same brain — the delta is the change.
// Roughly 420ms a game, so 400 games is about 7 minutes a side. The dev seed family is ×7919; the
// held-out family is ×104729, and it exists to be called for when a dev-family result reads close.
//
// WHAT IT REPORTS, AND WHAT IT DELIBERATELY DOES NOT.
// Pass rate and voyage length, both derived from the event stream the engine ALREADY records — the
// `{t:"turn"}` and `{t:"pass"}` entries, each tagged with its seat. Nothing here instruments the
// engine, adds a field, or changes what the engine emits; doing so would cost a determinism
// re-record (docs/DETERMINISM-RERECORD.md).
//
// It prints NO verdict. There is no threshold in this file for what counts as a material movement,
// and there must never be one: a constant cannot be right for a bot's first crate and its last
// (docs/BOT-DESIGN-PRINCIPLES.md principle 10, .claude/CLAUDE.md §2). The one derived comparison it
// offers is the SPREAD of pass rate across the four strategy seats WITHIN a single run — the game's
// own natural variation, measured on the same games, so a reader can see whether a between-run
// movement is bigger than the noise this game makes on its own. It is a yardstick, not a gate, and
// it moves with the game because it is computed from the game.
//
// THE HARNESS CHECKS ITSELF, because a harness is unreviewed code (docs/HARD-WON-LESSONS.md §3).
// Every run prints controls whose values are known in advance of measuring anything: wins plus
// unfinished must account for every game; turn events must be non-zero (`ev()` opens with
// `if(!this.record)return;`, so a missing record flag reads as a plausible, entirely fabricated
// "bots never pass"); no seat can take more turns than the voyage had rounds; no seat can pass more
// often than it took a turn. Two figures that cannot both be true mean the harness is wrong.
//
// `w == null`, never `!w` — `play()` returns a SEAT INDEX, so seat 0 winning returns 0, and a falsy
// test counts every seat-0 win as an unfinished voyage (docs/HARD-WON-LESSONS.md §3).
//
// `roundCfg()` returns `bakeoff:true` headless, and this passes it explicitly too: these numbers are
// the BAKE-OFF ruleset, which is what /4 ships.
//
// scripts/bot_ladder3.js targets `3/` and is a different tree's instrument. It is deliberately left
// alone by this rewrite; Phase 6 deletes `3/`.

import { Game, roundCfg } from "../4/src/engine/index.js";

const ARGV = process.argv.slice(2);
const FLAGS = ARGV.filter((a) => a.startsWith("--"));
const POS = ARGV.filter((a) => !a.startsWith("--"));
const JSON_OUT = FLAGS.includes("--json");

const GAMES = +(POS[0] || 400);
const SEEDMULT = +(POS[1] || 7919);
const STRATS = ["pirate", "trader", "balanced", "rusher"];

function run() {
  const wins = STRATS.map(() => 0);
  const passes = STRATS.map(() => 0);
  const turns = STRATS.map(() => 0);
  let rounds = 0, unfinished = 0;
  // controls: quantities whose value is known BEFORE the run, checked against what it produced
  let seatTurnsOverRounds = 0;   // no seat plays twice in a round, so this can never exceed 1
  for (let s = 1; s <= GAMES; s++) {
    const g = new Game({ ...roundCfg(STRATS), bakeoff: true }, s * SEEDMULT, true);
    const w = g.play();          // returns a SEAT INDEX; `w == null` is the only "nobody won"
    rounds += g.round;
    // the record flag above is what fills g.events; every turn and every pass is already in there,
    // tagged with the seat that took it. Nothing new is instrumented.
    const gTurns = STRATS.map(() => 0);
    for (const e of g.events) {
      if (e.t === "turn") { turns[e.p]++; gTurns[e.p]++; }
      else if (e.t === "pass") passes[e.p]++;
    }
    if (g.round > 0)
      seatTurnsOverRounds = Math.max(seatTurnsOverRounds, Math.max(...gTurns) / g.round);
    if (w == null) { unfinished++; continue; }
    wins[w]++;
  }
  return { wins, passes, turns, rounds, unfinished, seatTurnsOverRounds };
}

const t0 = Date.now();
const r = run();
const wallMs = Date.now() - t0;

const rate = (p, t) => (t > 0 ? p / t : null);
const round6 = (x) => (x == null ? null : Number(x.toFixed(6)));

const seats = STRATS.map((strategy, i) => ({
  seat: i,
  strategy,
  wins: r.wins[i],
  turns: r.turns[i],
  passes: r.passes[i],
  passRate: round6(rate(r.passes[i], r.turns[i])),
}));

const totalTurns = r.turns.reduce((a, b) => a + b, 0);
const totalPasses = r.passes.reduce((a, b) => a + b, 0);
const played = r.wins.reduce((a, b) => a + b, 0);
const definedRates = seats.map((s) => s.passRate).filter((v) => v != null);

const record = {
  script: "scripts/bot_ladder4.js",
  command: `node scripts/bot_ladder4.js ${GAMES} ${SEEDMULT}${JSON_OUT ? " --json" : ""}`,
  games: GAMES,
  seedMult: SEEDMULT,
  ruleset: "bakeoff",
  brain: "one brain — planTurn() dispatches unconditionally; every seat plans the same way",
  strategies: STRATS,
  seats,
  totals: {
    turns: totalTurns,
    passes: totalPasses,
    passRate: round6(rate(totalPasses, totalTurns)),
  },
  // the in-run yardstick: how far apart the four seats' pass rates sit on THESE games. Not a
  // threshold, not a verdict — the game's own variation, for reading a between-run delta against.
  passRateSpreadAcrossSeats: definedRates.length
    ? round6(Math.max(...definedRates) - Math.min(...definedRates))
    : null,
  meanRoundsPerVoyage: round6(r.rounds / GAMES),
  unfinished: r.unfinished,
  winsBySeat: r.wins,
  gamesWon: played,
  // NOTE: the wall clock is deliberately NOT in this record. Two runs of the same command on the
  // same tree must produce BYTE-IDENTICAL stdout, so that a before/after diff shows only what the
  // change moved and never the machine's mood. The duration goes to stderr instead.
  harnessControls: [
    {
      name: "every game accounted for",
      why: "play() returns a seat index or null; wins + unfinished must equal games. seat 0 is a real winner, so this is tested with == null, never !w",
      expected: GAMES,
      actual: played + r.unfinished,
      holds: played + r.unfinished === GAMES,
    },
    {
      name: "the event stream was recorded",
      why: "ev() opens with if(!this.record)return; — with the flag off every derived count is 0, which reads as a plausible finding instead of a broken harness",
      expected: "> 0",
      actual: totalTurns,
      holds: totalTurns > 0,
    },
    {
      name: "no seat took more turns than the voyage had rounds",
      why: "each seat plays at most once per round, so the worst per-game ratio cannot exceed 1",
      expected: "<= 1",
      actual: round6(r.seatTurnsOverRounds),
      holds: r.seatTurnsOverRounds <= 1,
    },
    {
      name: "no seat passed more often than it took a turn",
      why: "a pass event ends a turn, so passes are a subset of turns for every seat",
      expected: "<= 1 per seat",
      actual: round6(Math.max(...definedRates.concat(0))),
      holds: seats.every((s) => s.passes <= s.turns),
    },
  ],
};

if (JSON_OUT) {
  console.log(JSON.stringify(record, null, 2));
  console.error(`${(wallMs / 1000).toFixed(1)}s wall clock (stderr, so stdout stays byte-identical between runs)`);
} else {
  console.log(`\n${GAMES} games, seed family ×${SEEDMULT}, 4-seat table, bake-off ruleset — /4, one brain on every seat`);
  console.log(`Run the SAME command both sides of the change being measured; the axis is time, not seat.\n`);
  console.log(`  seat  strategy   wins   turns  passes  pass rate`);
  for (const s of seats)
    console.log(`  ${String(s.seat).padStart(4)}  ${s.strategy.padEnd(9)}` +
      `${String(s.wins).padStart(5)}  ${String(s.turns).padStart(6)}  ${String(s.passes).padStart(6)}` +
      `  ${s.passRate == null ? "    n/a" : (100 * s.passRate).toFixed(2).padStart(6) + "%"}`);
  console.log(`\n  all seats                 ${String(record.totals.turns).padStart(6)}  ${String(record.totals.passes).padStart(6)}` +
    `  ${record.totals.passRate == null ? "    n/a" : (100 * record.totals.passRate).toFixed(2).padStart(6) + "%"}`);
  console.log(`  pass-rate spread across the four seats, within this run: ` +
    `${record.passRateSpreadAcrossSeats == null ? "n/a" : (100 * record.passRateSpreadAcrossSeats).toFixed(2) + " points"}`);
  console.log(`  mean rounds per voyage ${record.meanRoundsPerVoyage}   unfinished ${record.unfinished}   wins ${record.winsBySeat.join("/")}`);
  console.log(`\n  harness controls (known before the run, checked against what it produced):`);
  for (const c of record.harnessControls)
    console.log(`    ${c.holds ? "holds" : "BROKEN"}  ${c.name.padEnd(52)} expected ${String(c.expected).padEnd(8)} actual ${c.actual}`);
  console.log(`\n  ${(wallMs / 1000).toFixed(1)}s. Re-run with --json to emit this record for an exact before/after diff.`);
  console.log(`  This script reports what moved. Whether a movement is material is a judgement made against these numbers, not by them.\n`);
}
