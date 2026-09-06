#!/usr/bin/env node
/* bakerank_ovens_day_check.mjs — T-216 / t216-baker-tiebreak, his ruling 2026-09-03T21:30:35Z:
 * "record the day each captain lights their ovens and rank on it" when two captains bake on the
 * same day and are tied on crates and coins. Best Baker's third tiebreak must go to whoever LIT
 * THE OVENS (arrived home) on the earlier day — never to seat order.
 *
 * Drives the real engine path (lightOvens, endBakeDay, bakeRank, resolveEnd), not a hand-forged
 * finishOrder — a captain who arrives on round 3 and one who arrives on round 9, tied on crates
 * and coins, both finishing the bake on the same day. Run twice with the seats swapped so a
 * seat-order bug cannot pass by accident.
 */
"use strict";
import { Game, roundCfg } from "../../src/engine/index.js";

function run(earlySeat) {
  const cfg = roundCfg(["human", "bot", "bot", "bot"]);
  cfg.bakeoff = true;
  const g = new Game(cfg, 4242, true);
  const a = g.players[0], b = g.players[1];

  a.ing = ["x", "y", "z"]; b.ing = ["x", "y", "z"];
  a.coins = 7; b.coins = 7;
  a.recipe = []; b.recipe = []; // needs() empty -> canBake() true, eligibleFinishers keeps both

  const early = earlySeat === 0 ? a : b;
  const late = earlySeat === 0 ? b : a;

  g.round = 3;
  if (!g.lightOvens(early)) throw new Error(`lightOvens refused for the early arriver (seat ${earlySeat === 0 ? 0 : 1})`);
  g.round = 9;
  if (!g.lightOvens(late)) throw new Error(`lightOvens refused for the late arriver (seat ${earlySeat === 0 ? 1 : 0})`);

  // both finish baking on the SAME day, which is the only way two seats are ranked together
  a.bakedToday = true; b.bakedToday = true;
  g.endBakeDay();
  const winner = g.resolveEnd();
  return { winner, earlySeat, order: g.finishOrder.slice() };
}

let fails = 0;
for (const earlySeat of [0, 1]) {
  const r = run(earlySeat);
  const ok = r.winner === earlySeat;
  console.log(
    `early arriver = seat ${earlySeat}  ->  finishOrder ${JSON.stringify(r.order)}  ` +
    `Best Baker = seat ${r.winner}  ${ok ? "PASS (early arriver won)" : "FAIL (seat order won instead)"}`
  );
  if (!ok) fails++;
}

if (fails) {
  console.log(`\nFAIL: ${fails}/2 — Best Baker's tiebreak is deciding by seat order, not by who lit the ovens first.`);
  process.exit(1);
}
console.log("\nPASS: Best Baker's tiebreak goes to whoever lit the ovens on the earlier day, in both seatings.");
