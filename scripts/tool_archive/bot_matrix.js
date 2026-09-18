#!/usr/bin/env node
// scripts/bot_matrix.js
//
// SHOW THE WORKING. Wyatt, 2026-08-09: *"Show me your whole matrix of actions that are weighted so I
// can see an example turn."*
//
// Plays a seeded game and, for a chosen turn, prints every candidate the planner scored and the
// arithmetic behind each number. This is the artefact that makes the bot arguable — you can read a
// turn and say "that weight is wrong" instead of inferring it from aggregate statistics, which is how
// three bad bots got built before it existed.
//
// Every value on the table answers ONE question:
//
//     turnsToWin(now)  -  turnsToWin(after)
//
// "How many turns closer to winning does this leave me?" Sailing a full leg toward the next island
// scores +1 — it IS a turn of progress. Zero means the turn bought nothing; negative means it made
// the voyage longer, which is what an idle turn at a berth actually does.
//
//   node scripts/bot_matrix.js [seed] [turnIndex]

import { Game, roundCfg } from "../v2bakeoff/src/engine/index.js";

const SEED = +(process.argv[2] || 7919);
// Turn index to open up. Pass "rich" (the default) to auto-pick the first turn that offers a real
// choice — at least one berth AND at least one enemy in reach — because a turn with only sailing
// options shows the calibration but not the trade-off.
const ARG = process.argv[3] || "rich";
const SHOW = ARG === "rich" ? null : +ARG;
const STRATS = ["pirate", "trader", "balanced", "rusher"];
const ING = { wheat: "wheat", dairy: "milk", sugar: "sugar", eggs: "eggs", cocoa: "cocoa", spice: "spice", vanilla: "vanilla" };
const nm = i => (ING[i] || i);

const g = new Game({ ...roundCfg(STRATS), bakeoff: true }, SEED, true);
const oTake = Game.prototype.takeTurn;
let n = 0, shown = false;

Game.prototype.takeTurn = function (p, w, st) {
  n++;
  // in "rich" mode, score every turn quietly and open up the first one with a genuine choice
  const probe = SHOW === null && !shown;
  const open = SHOW !== null ? n === SHOW : false;
  if (open || probe) this.explain = [];
  // snapshot BEFORE the turn — the whole point is the state the planner decided from
  const before = this.turnsToWin(p);
  const hold = p.ing.slice(), need = this.needs(p).slice(), purse = p.coins, day = this.round, wind = this.windNow;
  const rivals = this.players.filter(q => q !== p).map(q => ({ idx: q.idx, ing: q.ing.slice(), t: this.threatTurns(q) }));
  oTake.call(this, p, w, st);
  const rows = this.explain || []; this.explain = null;
  if (!open) {
    const kinds = new Set(rows.map(r => r.type));
    if (!(probe && kinds.has("dock") && kinds.has("attack"))) return;
  }
  shown = true;

  console.log(`\n=== turn ${n}: ${STRATS[p.idx]} (seat ${p.idx}), day ${day}, wind ${wind} — state AS DECIDED FROM ===`);
  console.log(`hold: [${hold.map(nm).join(", ") || "empty"}]   still needs: [${need.map(nm).join(", ") || "nothing"}]   purse: ${purse}`);
  console.log(`turnsToWin right now: ${before.toFixed(2)}`);
  console.log(`\nrivals (public estimate only — distinct crates carried + distance home):`);
  for (const q of rivals)
    console.log(`   seat ${q.idx} ${STRATS[q.idx].padEnd(9)} holds [${q.ing.map(nm).join(", ") || "empty"}]  ` +
      `threatTurns ${q.t.toFixed(1)}${q.t < before ? "   <-- AHEAD OF ME" : ""}`);

  rows.sort((a, b) => b.value - a.value);
  console.log(`\n${rows.length} candidate turns scored. value = turnsToWin(now) - turnsToWin(after):\n`);
  console.log(`   ${"value".padStart(7)}  ${"voyage".padEnd(11)} ${"action".padEnd(22)} ${"square".padEnd(9)} why / arithmetic`);
  console.log(`   ${"-".repeat(7)}  ${"-".repeat(11)} ${"-".repeat(22)} ${"-".repeat(9)} ${"-".repeat(44)}`);
  for (const r of rows.slice(0, 24)) {
    const act = r.type === "dock" ? `dock at ${nm(r.ing)}`
      : r.type === "attack" ? `attack seat ${r.target}`
        : r.type === "trade" ? `hail the table` : `sail`;
    let note = r.why;
    if (r.detail && r.type === "dock")
      note = `${r.why}: ${r.detail.buys ? (r.detail.needsIt ? `buys ${nm(r.ing)} for ${r.detail.price}` : `crate not needed`) : "no crate affordable"}`;
    if (r.detail && r.type === "trade")
      note = `sails to [${r.detail.park}] AND hails: move +${r.detail.move}, crate +${r.detail.crate}`;
    if (r.detail && r.type === "attack")
      note = `${r.detail.downwind ? "DOWNWIND" : "upwind  "} pWin ${r.detail.pWin}  move ${r.detail.stand}` +
        `  win +${r.detail.win} lose -${r.detail.lose} denial +${r.detail.denial}` + (r.detail.rematch ? ` rematch -${r.detail.rematch}` : "");
    const mark = r.value > 0 ? " " : "x";
    // value IS base - after, so the whole voyage plan behind every row can be shown rather than
    // asserted. Nothing on this table is a constant; each number is the difference between two
    // complete solves of the remaining game.
    const after = (before - r.value);
    const voyage = `${before.toFixed(0)} -> ${after.toFixed(after % 1 ? 2 : 0)}`;
    console.log(` ${mark} ${r.value.toFixed(2).padStart(7)}  ${voyage.padEnd(11)} ${act.padEnd(22)} ${("[" + r.cell + "]").padEnd(9)} ${note}`);
  }
  const pos = rows.filter(r => r.value > 0).length;
  console.log(`\n   ${pos} of ${rows.length} candidates shorten the voyage. CHOSEN: the top row.`);
  console.log(`   The "voyage" column is the whole point: every value is the difference between two`);
  console.log(`   COMPLETE solves of the remaining game — all orderings of the crates still needed,`);
  console.log(`   real water paths, the wind that will actually blow, real prices, through to the bake.`);
  console.log(`   Nothing on this table is a hardcoded weight.`);
};

g.play();
Game.prototype.takeTurn = oTake;
if (!shown) console.log(`game ended before turn ${SHOW}; try a lower turn index`);
