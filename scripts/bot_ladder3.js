#!/usr/bin/env node
// scripts/bot_ladder3.js
//
// THE GATE FOR THE /3 BOT BRAIN. Same instrument as scripts/bot_ladder.js (read its header for why
// a control run, not 25%-a-seat, is the yardstick) — pointed at 3/src/engine, where the v3 brain
// lives beside the incumbent it must beat.
//
// The dispatch is at planTurn(), not takeTurn(): both brains share the same turn mechanics (sail,
// re-check adjacency, act, fallback dock), and 3/'s engine keeps the incumbent BYTE-IDENTICAL as
// planTurnClassic. Control seats therefore run exactly the brain that ships at /v2bakeoff; new
// seats run planTurnV3. Nothing else differs, so the only thing being measured is the decision.
//
// Red-proofed both ways before it was believed (same discipline as the parent ladder):
//   - planTurnV3 delegating to planTurnClassic must read edge +0.0 on every row;
//   - a deliberately lobotomized planTurnV3 (never leaves its square) must read WORSE.
//
//   node scripts/bot_ladder3.js [games] [seedMult]
//
// seedMult picks the seed family (seed = game# × seedMult, default 7919 — the parent ladder's).
// Every layer and constant of the v3 brain was accepted or rejected on the 7919 family, so the
// final pre-ship run MUST also be shown on a family the development never touched (e.g. 104729):
// an edge that only exists on the seeds it was chosen on is a fit, not a bot.

import { Game, roundCfg } from "../3/src/engine/index.js";

const GAMES = +(process.argv[2] || 400);
const SEEDMULT = +(process.argv[3] || 7919);
const STRATS = ["pirate", "trader", "balanced", "rusher"];

const V3_PLAN = Game.prototype.planTurnV3;
const CLASSIC_PLAN = Game.prototype.planTurnClassic;

function run(seatsUsingNew) {
  Game.prototype.planTurn = function (p) {
    return seatsUsingNew.has(p.idx) ? V3_PLAN.call(this, p) : CLASSIC_PLAN.call(this, p);
  };
  const wins = STRATS.map(() => 0);
  let rounds = 0, unfinished = 0;
  for (let s = 1; s <= GAMES; s++) {
    const g = new Game({ ...roundCfg(STRATS), bakeoff: true }, s * SEEDMULT, true);
    const w = g.play();          // returns a SEAT INDEX; `w == null` is the only "nobody won"
    rounds += g.round;
    if (w == null) { unfinished++; continue; }
    wins[w]++;
  }
  Game.prototype.planTurn = function (p) { return this.planTurnV3(p); };
  return { wins, rounds: rounds / GAMES, unfinished, played: wins.reduce((a, b) => a + b, 0) };
}

// control: nobody uses the new brain, so these are the seats' natural win shares
const control = run(new Set());
const share = (r, seats) => 100 * [...seats].reduce((a, i) => a + r.wins[i], 0) / (r.played || 1);

function ladder(label, newSeats) {
  const r = run(newSeats);
  return {
    label, rounds: r.rounds, unfinished: r.unfinished,
    nw: [...newSeats].reduce((a, i) => a + r.wins[i], 0),
    ow: r.played - [...newSeats].reduce((a, i) => a + r.wins[i], 0),
    got: share(r, newSeats), fair: share(control, newSeats),
  };
}

const rows = [
  ladder("1 new vs 3 old (seat 0)", new Set([0])),
  ladder("1 new vs 3 old (seat 1)", new Set([1])),
  ladder("2 new vs 2 old", new Set([0, 2])),
  ladder("3 new vs 1 old", new Set([0, 1, 2])),
];

console.log(`\n${GAMES} games per row, same seeds (family ×${SEEDMULT}), 4-seat table — v3 brain vs /v2bakeoff incumbent`);
console.log(`control (all seats on the incumbent): wins ${control.wins.join("/")}  rounds ${control.rounds.toFixed(1)}  unfinished ${control.unfinished}\n`);
for (const r of rows)
  console.log(`  ${r.label.padEnd(26)} new ${String(r.nw).padStart(4)}  old ${String(r.ow).padStart(4)}` +
    `  won ${r.got.toFixed(1).padStart(5)}%  vs control ${r.fair.toFixed(1).padStart(5)}%` +
    `  edge ${(r.got - r.fair >= 0 ? "+" : "") + (r.got - r.fair).toFixed(1)}  rounds ${r.rounds.toFixed(1)}`);

// The verdict rests on the multi-seat rows, which average away the large seat effect.
const judged = rows.slice(2);
const edge = judged.reduce((a, r) => a + (r.got - r.fair), 0) / (judged.length || 1);
console.log(`\nmean edge over fair share, 2v2 and 3v1: ${edge >= 0 ? "+" : ""}${edge.toFixed(1)} points`);
console.log(edge > 1 ? "BETTER — the v3 brain out-wins the incumbent."
  : edge < -1 ? "WORSE — do not ship, whatever the behaviour statistics say."
    : "NO DIFFERENCE worth shipping — the change is cosmetic at the scoreboard.");
