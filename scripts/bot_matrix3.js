#!/usr/bin/env node
// scripts/bot_matrix3.js
//
// SHOW THE WORKING, v3. Sibling of scripts/bot_matrix.js, pointed at the /3 race planner. Plays a
// seeded game and, for a chosen turn, prints every candidate the planner scored and the arithmetic
// behind each number — the artefact that makes the bot arguable in the game's own terms.
//
// Every value on this table answers ONE question:
//
//     P(win) = Π over rivals q of σ( (ETA_q − myFinish + RACE_BIAS) / RACE_SPREAD )
//
// "How likely am I to finish this race first if I end my turn like this?" A candidate's value is a
// probability, not a turn count — a fight's three outcomes are each a full state of the race,
// scored separately and averaged, which is where the leader-plays-safe / trailer-gambles behaviour
// comes from. The myT column is the contested tour behind each probability: every ordering of the
// crates still needed, real water by the real movement rule, the wind that will actually blow, and
// the shelves as rivals' predicted buys will have left them.
//
//   node scripts/bot_matrix3.js [seed] [turnIndex|rich]

import { Game, roundCfg } from "../3/src/engine/index.js";

const SEED = +(process.argv[2] || 7919);
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
  const probe = SHOW === null && !shown;
  const open = SHOW !== null ? n === SHOW : false;
  if (open || probe) this.explain = [];
  // snapshot BEFORE the turn — the state the planner decided from
  const ctx = this.raceContext3(p);
  const baseT = this.turnsToWin3(p, ctx);
  const baseP = this.raceScore3(baseT, ctx.plans);
  const hold = p.ing.slice(), need = this.needs(p).slice(), purse = p.coins, day = this.round, wind = this.windNow;
  const rivals = ctx.plans.map(e => ({ idx: e.q.idx, ing: e.q.ing.slice(), eta: e.plan.eta,
    buys: e.plan.buys.map(b => `${nm(b.ing)}@t${b.t}`).join(" ") }));
  oTake.call(this, p, w, st);
  const rows = this.explain || []; this.explain = null;
  if (!open) {
    const kinds = new Set(rows.map(r => r.type));
    if (!(probe && kinds.has("dock") && kinds.has("attack"))) return;
  }
  shown = true;

  console.log(`\n=== turn ${n}: ${STRATS[p.idx]} (seat ${p.idx}), day ${day}, wind ${wind} — state AS DECIDED FROM ===`);
  console.log(`hold: [${hold.map(nm).join(", ") || "empty"}]   still needs: [${need.map(nm).join(", ") || "nothing"}]   purse: ${purse}`);
  console.log(`contested tour right now: ${baseT} turns   P(win) standing still: ${(100 * baseP).toFixed(1)}%`);
  console.log(`\nrivals (public evidence only — predicted voyage, and the buys that deplete MY shelves):`);
  for (const q of rivals)
    console.log(`   seat ${q.idx} ${STRATS[q.idx].padEnd(9)} holds [${q.ing.map(nm).join(", ") || "empty"}]  ` +
      `ETA ${String(q.eta).padStart(2)}${q.eta < baseT + 1 ? "  <-- AHEAD OF ME" : ""}   buys: ${q.buys || "none"}`);

  rows.sort((a, b) => b.value - a.value);
  console.log(`\n${rows.length} candidate turns scored. value = P(win) if I end the turn this way:\n`);
  console.log(`   ${"P(win)".padStart(7)}  ${"action".padEnd(22)} ${"square".padEnd(9)} why / arithmetic`);
  console.log(`   ${"-".repeat(7)}  ${"-".repeat(22)} ${"-".repeat(9)} ${"-".repeat(52)}`);
  for (const r of rows.slice(0, 28)) {
    const act = r.type === "dock" ? `dock at ${nm(r.ing)}`
      : r.type === "attack" ? `attack seat ${r.target}`
        : r.type === "trade" ? `hail the table` : `sail`;
    let note = r.why;
    if (r.detail && r.type === "sail" && r.detail.myT !== undefined)
      note = `${r.why}: tour ${baseT} -> ${r.detail.myT}`;
    if (r.detail && r.type === "dock") {
      const b = r.detail.branches.map(x => `${x.pay}🌕:${x.take ? "buy," : ""}T${x.myT},P${x.s}`).join("  ");
      note = `${r.why}: price ${r.detail.price === null ? "—" : r.detail.price}  heads/tails ${b}`;
    }
    if (r.detail && r.type === "trade")
      note = `parks [${r.detail.park}], tour -> ${r.detail.myT} if the offer lands`;
    if (r.detail && r.type === "attack")
      note = `${r.detail.downwind ? "DOWNWIND" : "upwind  "} pWin ${r.detail.pWin} takes ${nm(r.detail.spoil)}` +
        `  P: win ${r.detail.sWin} flee ${r.detail.sFlee} lose ${r.detail.sLose}` +
        (r.detail.rematch ? ` rematch drag ${r.detail.rematch}t` : "");
    const mark = r.value >= baseP ? " " : "x";
    console.log(` ${mark} ${(100 * r.value).toFixed(2).padStart(6)}%  ${act.padEnd(22)} ${("[" + r.cell + "]").padEnd(9)} ${note}`);
  }
  const pos = rows.filter(r => r.value >= baseP).length;
  console.log(`\n   ${pos} of ${rows.length} candidates beat standing still (${(100 * baseP).toFixed(1)}%). CHOSEN: the top row`);
  console.log(`   (ties break on ground made toward the tour's first stop).`);
  console.log(`   Every probability is a product of pairwise logistic races against the rivals' ETAs;`);
  console.log(`   every myT behind it is a complete solve of my remaining game on a board where the`);
  console.log(`   rivals' predicted buys have already emptied what they will empty. No hardcoded weights.`);
};

g.play();
Game.prototype.takeTurn = oTake;
if (!shown) console.log(`game ended before the chosen turn; try a lower turn index`);
