/* SCRATCH (T-216) — is the Best Baker's THIRD tiebreak really "whoever got home first"?
 *
 * I reported this claim RIGHT from reading bakeRank(), which ends
 *     return this.finishOrder.indexOf(a)-this.finishOrder.indexOf(b);
 * That is only "who got home first" if finishOrder is in ARRIVAL order. I never checked how it is
 * FILLED on the shipped bake-off path. Measure it, do not read it.
 *
 * The test: two captains tied on crates and coins, one of whom lit the ovens DAYS EARLIER, both
 * finishing on the same day (which is the only way two seats are ever ranked together — playBakeoff
 * returns to resolveEnd the first day anybody bakes). If the third key is arrival, the early
 * arriver wins. If it is seat order, the lower seat index wins regardless.
 */
import { Game, roundCfg } from "../../src/engine/index.js";

function run(earlyArriverSeat) {
  const cfg = roundCfg(["human", "bot", "bot", "bot"]);
  cfg.bakeoff = true;
  const g = new Game(cfg, 4242, true);
  const a = g.players[0], b = g.players[1];

  // tie them exactly on both earlier keys, so ONLY the third key can decide
  a.ing = ["x", "y", "z"]; b.ing = ["x", "y", "z"];
  a.coins = 7; b.coins = 7;

  // whoever "got home first" lit their ovens days earlier and has been failing bakes since
  const early = earlyArriverSeat === 0 ? a : b;
  const late = earlyArriverSeat === 0 ? b : a;
  early.baking = true; early.arrivedDay = 3;
  late.baking = true;  late.arrivedDay = 9;

  // both bake perfectly on the SAME day — this is what endBakeDay sees
  a.bakedToday = true; b.bakedToday = true;
  a.recipe = []; b.recipe = [];   // needs() empty, so eligibleFinishers keeps both

  g.endBakeDay();
  const order = g.finishOrder.slice();
  const winner = g.resolveEnd();
  return { order, winner, earlyArriverSeat };
}

for (const seat of [0, 1]) {
  const r = run(seat);
  console.log(
    `early arriver = seat ${r.earlyArriverSeat}  ->  finishOrder ${JSON.stringify(r.order)}  ` +
    `Best Baker = seat ${r.winner}  ` +
    (r.winner === r.earlyArriverSeat ? "(the EARLY arriver won)" : "(the LATE arriver won)")
  );
}
console.log("");
console.log("If the third tiebreak were 'whoever got home first', the early arriver would win BOTH runs.");
