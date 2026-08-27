#!/usr/bin/env node
// scripts/bot_ladder.js
//
// PRINCIPLE 10, MADE MECHANICAL: prove a bot change against the previous bot, not against a proxy.
//
// Why this exists. On 2026-08-09 a whole-turn planner was built to satisfy the first three bot
// design principles (see the engine's AI header). Every behaviour proxy improved, some of them
// dramatically:
//
//     trades struck            26  ->  140 per 300-game corpus
//     shots fired with the wind  25.5% -> 88.6%
//     turns ending blank          8.8% ->  6.8%
//     dock-vs-fight               compared honestly for the first time
//
// It was one command away from shipping. Then this ladder ran it against the bot it replaced and it
// won BELOW its fair share in three of four configurations. It was a worse player that looked like a
// better one, and nothing in the behaviour statistics could have told anyone that.
//
// So: a bot change is not "better" because it fights more, trades more, dawdles less or reads more
// cleverly. It is better if it WINS MORE against what it replaces, over the same seeds. That is the
// only question this script asks.
//
// HOW IT WORKS. Both brains have to exist at once for a head-to-head, which means the old turn has
// to be kept somewhere. It lives in this file, as OLD_TURN below, copied verbatim from the commit it
// was current in and stamped with that commit. Game.takeTurn is then dispatched per seat, so the two
// brains play the same board under the same seed with no other difference.
//
// KEEPING IT HONEST as the engine moves on:
//   - when you change the bot, do NOT edit OLD_TURN. It is the incumbent, and the whole point is
//     that it does not move while you measure against it.
//   - when a change PASSES and ships, replace OLD_TURN with the newly-shipped turn and re-stamp the
//     commit. The incumbent is always "what is live", never "what was live three changes ago".
//   - if OLD_TURN ever calls something the engine has deleted, that is the signal to re-stamp, not
//     to patch around it.
//
// READ THE SEAT ROWS WITH CARE. Seat effects in this game are large — the same brain measured 17.3%
// in seat 0 and 27.8% in seat 1 against identical opposition. The 2v2 and 3v1 rows are the ones to
// trust, because they average over seats; a single-seat row is a hint, not a verdict.
//
//   node scripts/bot_ladder.js [games]

import { Game, roundCfg } from "../v2bakeoff/src/engine/index.js";

const GAMES = +(process.argv[2] || 400);
const STRATS = ["pirate", "trader", "balanced", "rusher"];
const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

const NEW_TURN = Game.prototype.takeTurn;

// ---- THE INCUMBENT, as shipped at 706971a ("bots: take the weather gauge on the turn they fire").
// Verbatim. Do not "improve" it; it is the thing being measured against.
function OLD_TURN(g, p) {
  g.ev({ t: "turn", p: p.idx });
  const port0 = g.adjPort(p);
  if (!port0) p.dockedNow.clear();
  const target = g.chooseTarget(p);
  const before = [...p.pos];
  if (man(p.pos, target) > 0) {
    const moved = g.stepToward(p, target);
    if (moved) g.ev({ t: "sail", p: p.idx });
    else if (g.boxedIn(p) && g.rimEscape(p)) { /* rim sweep records its own event */ }
  }
  if (p.pos[0] !== before[0] || p.pos[1] !== before[1]) p.justDocked = false;
  if (!g.adjPort(p)) p.dockedNow.clear();
  const a = g.chooseAction(p);
  if (a.type === "attack") { g.battle(p, a.target); return; }
  if (a.type === "trade" && g.tryTrade(p)) return;
  if (a.type === "dock" && g.doDock(p, a.ing)) return;
  const fb = g.adjPort(p);
  if (fb && g.canDock(p, fb) && g.doDock(p, fb)) return;
  g.ev({ t: "pass", p: p.idx, sea: g.nextSeaCreature(p) });
}

/* THE YARDSTICK IS A CONTROL RUN, NOT 25% A SEAT — and this was itself a bug, caught by red-proofing
   the ladder against an unchanged engine. The four archetypes are NOT equally strong: with one brain
   on the whole table, seat wins measured 59/79/88/74 over 300 games, i.e. 19.7% / 26.3% / 29.3% /
   24.7%. Judging a one-seat arm against a flat 25% therefore credits seat 2 with +4 points and
   penalises seat 0 by -5 before the brain does anything at all. Run with new === old the naive
   version reported "+2.5 points, BETTER", which is exactly the false pass this file exists to stop.
   So every configuration is compared against the SAME seats playing the incumbent brain. */
function run(seatsUsingNew) {
  Game.prototype.takeTurn = function (p, w, st) {
    return seatsUsingNew.has(p.idx) ? NEW_TURN.call(this, p, w, st) : OLD_TURN(this, p);
  };
  const wins = STRATS.map(() => 0);
  let rounds = 0, unfinished = 0;
  for (let s = 1; s <= GAMES; s++) {
    const g = new Game({ ...roundCfg(STRATS), bakeoff: true }, s * 7919, true);
    const w = g.play();          // returns a SEAT INDEX; `w == null` is the only "nobody won"
    rounds += g.round;
    if (w == null) { unfinished++; continue; }
    wins[w]++;
  }
  Game.prototype.takeTurn = NEW_TURN;
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

console.log(`\n${GAMES} games per row, same seeds, 4-seat table`);
console.log(`control (all seats on the incumbent): wins ${control.wins.join("/")}  rounds ${control.rounds.toFixed(1)}  unfinished ${control.unfinished}\n`);
for (const r of rows)
  console.log(`  ${r.label.padEnd(26)} new ${String(r.nw).padStart(4)}  old ${String(r.ow).padStart(4)}` +
    `  won ${r.got.toFixed(1).padStart(5)}%  vs control ${r.fair.toFixed(1).padStart(5)}%` +
    `  edge ${(r.got - r.fair >= 0 ? "+" : "") + (r.got - r.fair).toFixed(1)}  rounds ${r.rounds.toFixed(1)}`);

// The verdict rests on the multi-seat rows, which average away the large seat effect.
const judged = rows.slice(2);
const edge = judged.reduce((a, r) => a + (r.got - r.fair), 0) / (judged.length || 1);
console.log(`\nmean edge over fair share, 2v2 and 3v1: ${edge >= 0 ? "+" : ""}${edge.toFixed(1)} points`);
console.log(edge > 1 ? "BETTER — the new brain out-wins the incumbent."
  : edge < -1 ? "WORSE — do not ship, whatever the behaviour statistics say."
    : "NO DIFFERENCE worth shipping — the change is cosmetic at the scoreboard.");
