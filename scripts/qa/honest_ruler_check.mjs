#!/usr/bin/env node
/* THE BOT'S RULER IS HONEST — three facts about how a bot prices a turn, held here so they cannot
   drift back. 2026-09-18, on Wyatt's own diagnosis.

   WHAT HE SAW: a bot was raided on the sugar dock it needed, then spent three turns leaving,
   drifting and coming back, never buying. Measured over 200 seeded voyages, before this gate
   existed: 588 bot turns standing on a berth for a crate it needed and did not hold; it sailed
   away from 75 of them; 71 of those ended in a muse earning 71 coins where the berths it walked
   off would have paid 142. The bots KNOW the rates — the planner branches heads and tails and
   prices a berth at their average. The arithmetic threw the knowledge away three times over:

     1. THE SAIL COST WAS CEILED, and its own comment said that was wrong. `sailTurns`'s comment
        has read "FRACTIONAL, NOT CEILED — load-bearing for the objective" since 1bec0989, and the
        line under it has said Math.ceil since that same commit. Checked across all reachable
        history with `git log -S` on both spellings: the fractional form had never existed. A fix
        described and never landed reads exactly like a fix that landed.
     2. THE EARNING COST WAS CEILED, in three places that each wrote the conversion out again.
        Needing 5 coins at 2 a berth turn is 2.5 turns, not 3, and a ruler that cannot see half a
        turn cannot see a berth beating a muse.
     3. A PLAIN SAIL WAS NOT CREDITED WITH THE COIN IT WILL BE PAID. `doPass` pays cfg.passCoin;
        the planner priced position only — so a muse earned 1 coin in the game and 0 in the model
        while the berth beside it correctly credited its flip.

   And the fourth, which is strategy rather than arithmetic and is why rule 5 exists — Wyatt:
   "If you dock to get a coin, your distance to that ingredient is zero. That's worth more than if
   you move one square away to muse a coin. It's also a better move because it blocks others from
   using the dock." `dockOccupiedBy` was read four times and every reading was a COST to this bot
   when somebody ELSE held the berth; nothing credited this bot for BEING the one parked.

   RED-PROOFED BELOW. Every rule is re-run against a deliberately broken copy of the source (or,
   for the behavioural ones, a deliberately broken copy of the engine module loaded from a temp
   file) and MUST go red. A case that cannot fail is decoration — it returns the same answer on
   both sides of the fault and lends its green to the cases beside it. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_PATH = path.join(REPO, "src/engine/index.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");
// comments are stripped before matching, so a rule can never be satisfied by prose describing it —
// which is the exact failure this gate was written after (a comment that said FRACTIONAL for
// thirteen months above a line that ceiled).
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* ---------------------------------------------------------------- structural rules */
const rules = [
  ["1. the sail cost is FRACTIONAL — sailTurns does not round its own answer",
   s => /sailTurns\(from,to,wind\)\{[\s\S]{0,900}?return d\/\(upwind\?SAIL_RANGE_UPWIND:SAIL_RANGE\);/.test(s),
   s => s.replace("return d/(upwind?SAIL_RANGE_UPWIND:SAIL_RANGE);",
                  "return Math.ceil(d/(upwind?SAIL_RANGE_UPWIND:SAIL_RANGE));"),
   "re-ceil sailTurns"],

  ["2. what a berth pays a turn is derived in ONE place (dockPay), not written out again",
   s => (s.match(/dockPay\(\)\{/g) || []).length === 1 &&
        (s.match(/\(\(this\.cfg\.dockHeads\|\|0\)\+\(this\.cfg\.dockTails\|\|0\)\)\/2/g) || []).length === 1,
   s => s.replace("const pay=this.dockPay();",
                  "const pay=((this.cfg.dockHeads||0)+(this.cfg.dockTails||0))/2||1;"),
   "write the rate out a second time in tour3"],

  ["3. the earning cost is FRACTIONAL — coinTurns is not ceiled by anybody who asks it",
   s => /coinTurns\(n\)\{\s*return n<=0\?0:n\/this\.dockPay\(\);\s*\}/.test(s) &&
        !/Math\.ceil\(\s*this\.coinTurns\(/.test(s) &&
        !/Math\.ceil\(\(\s*\w*price-coins\)\/pay\)/.test(s),
   s => s.replace("const earn=this.coinTurns(short);", "const earn=Math.ceil(this.coinTurns(short));"),
   "re-ceil the earning cost in acquireTurns"],

  ["3b. ...and the tour and the rival's plan ask coinTurns rather than dividing again",
   s => (s.match(/this\.coinTurns\(price-coins\)/g) || []).length === 2 &&
        (s.match(/this\.coinTurns\(bprice-coins\)/g) || []).length === 1,
   s => s.replace("const earn=this.coinTurns(price-coins);",
                  "const earn=Math.max(0,Math.ceil((price-coins)/pay));"),
   "divide again (and re-ceil) inside tour3"],

  ["4. a pass's coin is priced where a pass is priced — passCoinAt reads cfg.passCoin, once",
   s => (s.match(/passCoinAt\(p,cell\)\{/g) || []).length === 1 &&
        /passCoinAt\(p,cell\)\{[\s\S]{0,400}?this\.cfg\.passCoin/.test(s),
   s => s.replace(/passCoinAt\(p,cell\)\{[\s\S]*?\n  \}/, "passCoinAt(p,cell){ return 0; }"),
   "make the muse worth nothing again"],

  ["4b. ...and every plain-sail candidate the planner scores is credited with it",
   s => (s.match(/this\.passCoinAt\(p,cell\)/g) || []).length === 2 &&
        /type:"sail",value:this\.raceScore3\(sailT/.test(s) &&
        /const sailT=this\.turnsToWin3If\(p,\{cell,coins:p\.coins\+museCoin\},ctx\);/.test(s),
   s => s.replace("const sailT=this.turnsToWin3If(p,{cell,coins:p.coins+museCoin},ctx);",
                  "const sailT=this.turnsToWin3If(p,{cell},ctx);"),
   "drop the coin from the sail candidate"],

  ["5. a berth's denial is scored through the ONE rival-plan overlay — berthHold is read in one place",
   // ctor; read in rivalPlan3 and put aside/back there for its monotonicity check; saved, set and
   // restored in planTurnV3's berth branch. Seven, and no eighth: an eighth is a second mechanism.
   s => (s.match(/this\.berthHold/g) || []).length === 7 &&
        /rivalPlan3\(q\)\{[\s\S]{0,1200}?const hold=this\.berthHold;/.test(s) &&
        (s.match(/this\.berthHold=\{ing:port,until:hold,by:p\}/g) || []).length === 1,
   s => s.replace("const hold=this.berthHold;", "const hold=null;"),
   "stop the rival's plan from reading the held berth"],

  ["5b. ...and the block's length is DERIVED, never a typed number of turns",
   s => /const hold=this\.cfg\.singleDock\?1\+this\.coinTurns\(\(price===null\?0:price\)-purse\):0;/.test(s),
   s => s.replace(/const hold=this\.cfg\.singleDock\?1\+this\.coinTurns\(\(price===null\?0:price\)-purse\):0;/,
                  "const hold=this.cfg.singleDock?2.5:0;"),
   "price the block at a constant 2.5 turns"],
];

let bad = 0;
console.log("  structural — the fact is decided in one place, and that place says the right thing");
for (const [name, ok, mutate, mutantName] of rules) {
  const green = ok(CODE);
  const mutated = mutate(SRC);
  if (mutated === SRC) { console.log(`  FAIL  ${name}  <- the mutant "${mutantName}" changed nothing; the rule is unproven`); bad++; continue; }
  const red = !ok(mutated.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1"));
  console.log(`  ${green && red ? "PASS" : "FAIL"}  ${name}` +
    `${green ? "" : "  <- NOT TRUE OF THE SOURCE"}${red ? `  [red on: ${mutantName}]` : `  <- the check cannot fail on "${mutantName}"; it proves nothing`}`);
  if (!green || !red) bad++;
}

/* ---------------------------------------------------------------- behavioural rules
   A posed board, and the engine's own answer. These are the ones that would still be true if every
   regex above were satisfied by a rewrite that spelled things differently — and they are the ones
   that say the numbers are right, not merely that the code looks right. */
const { Game, roundCfg } = await import(pathToFileURL(SRC_PATH).href);
const STRATS = ["pirate", "trader", "balanced", "rusher"];
const fresh = () => new Game({ ...roundCfg(STRATS), bakeoff: true }, 79190, true);

const behaviour = [];
// A missing method must read as a FAILED RULE, never as a stack trace: a gate that dies tells the
// next reader nothing about WHICH fact broke, and an unrun red has to defend its evidence.
const posed = (name, fn) => {
  try { const [ok, detail] = fn(); behaviour.push([name, ok, detail]); }
  catch (e) { behaviour.push([name, false, `the posed board threw: ${e.message}`]); }
};

posed("B1. two squares costs HALF the turn four squares costs", () => {
  const g = fresh();
  // two squares, no wind: half a turn at four squares a turn. Ceiled it would be 1.
  const half = g.sailTurns([2, 2], [2, 4], null);
  const full = g.sailTurns([2, 2], [2, 6], null);
  return [Math.abs(half - 0.5) < 1e-9 && Math.abs(full - 1) < 1e-9,
          `two squares = ${half}, four squares = ${full}`];
});

posed("B2. one coin short is a FRACTION of a berth turn, not a whole one", () => {
  const g = fresh();
  const one = g.coinTurns(1), five = g.coinTurns(5), pay = g.dockPay();
  return [Math.abs(one - 1 / pay) < 1e-9 && Math.abs(five - 5 / pay) < 1e-9 && one % 1 !== 0,
          `a berth pays ${pay} a turn; 1 coin = ${one} turns, 5 coins = ${five} turns`];
});

posed("B3. a turn that just sails is priced at the muse coin; one that ends in a free berth is not", () => {
  const g = fresh(), p = g.players[0];
  // open water: the rail pays. A berth under the ship: takeTurn's fallback WORKS the berth instead,
  // so the muse coin is not what that square's turn is worth.
  const ing = g.ings[0], berth = g.dockOf[ing];
  const open = g.passCoinAt(p, [g.home[0], g.home[1] - 3]);
  const atBerth = g.passCoinAt(p, [berth[0], berth[1]]);
  return [open === g.cfg.passCoin && atBerth === 0 && g.cfg.passCoin > 0,
          `open water = ${open} (cfg.passCoin ${g.cfg.passCoin}); on the ${ing} berth = ${atBerth}`];
});

posed("B4. a berth held against a rival lengthens their voyage, and NEVER shortens it", () => {
  /* Both halves, because each alone can pass while the fact is broken. "It lengthens" alone would
     miss the greedy's re-ordering artefact (a cost on one leg tipping the walk into an order that
     beats the one it was taking, so a BLOCKED rival comes back FASTER — measured here at 20 -> 19
     before the guard went in). "It never shortens" alone would pass on an engine that models
     denial not at all. Every rival on the board, every berth their own plan calls at. */
  const g = fresh();
  let longer = 0, shorter = 0, same = 0, worst = null, best = null;
  for (const q of g.players.filter(x => g.inPlay(x))) {
    const base = g.rivalPlan3(q);
    for (const b of base.buys) {
      g.berthHold = { ing: b.ing, until: 4, by: g.players.find(x => x !== q) };
      const held = g.rivalPlan3(q);
      g.berthHold = null;
      if (g.rivalPlan3(q).eta !== base.eta) return [false, "holding a berth left a mark after it cleared — the hypothesis is not being put back"];
      if (held.eta > base.eta) { longer++; if (!worst || held.eta - base.eta > worst.d) worst = { ing: b.ing, d: held.eta - base.eta, base: base.eta, held: held.eta }; }
      else if (held.eta < base.eta) { shorter++; best = { ing: b.ing, base: base.eta, held: held.eta }; }
      else same++;
    }
  }
  const detail = `${longer} of ${longer + shorter + same} posed blocks lengthened the rival's own plan` +
    (worst ? ` (worst: ${worst.ing}, ${worst.base} -> ${worst.held})` : "") +
    `, ${same} left it unchanged, ${shorter} SHORTENED it` + (best ? ` (${best.ing}, ${best.base} -> ${best.held})` : "");
  return [longer > 0 && shorter === 0, detail];
});

console.log("\n  behavioural — a posed board, and the engine's own answer");
for (const [name, ok, detail] of behaviour) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}\n          ${detail}`);
  if (!ok) bad++;
}

/* Red-proof for the behavioural rules: load a MUTANT copy of the engine from a temp file and assert
   each one goes red on it. Without this they are four greens nobody has ever seen fail. */
const mutants = [
  ["B1", "re-ceil sailTurns",
   s => s.replace("return d/(upwind?SAIL_RANGE_UPWIND:SAIL_RANGE);",
                  "return Math.ceil(d/(upwind?SAIL_RANGE_UPWIND:SAIL_RANGE));"),
   g => Math.abs(g.sailTurns([2, 2], [2, 4], null) - 0.5) < 1e-9],
  ["B2", "re-ceil coinTurns",
   s => s.replace("coinTurns(n){ return n<=0?0:n/this.dockPay(); }",
                  "coinTurns(n){ return n<=0?0:Math.ceil(n/this.dockPay()); }"),
   g => g.coinTurns(1) % 1 !== 0],
  ["B3", "make the muse worth nothing",
   s => s.replace(/passCoinAt\(p,cell\)\{[\s\S]*?\n  \}/, "passCoinAt(p,cell){ return 0; }"),
   g => g.passCoinAt(g.players[0], [0, 0]) === g.cfg.passCoin],
  ["B4", "stop the rival's plan reading the held berth",
   s => s.replace("const hold=this.berthHold;", "const hold=null;"),
   g => {
     let longer = 0;
     for (const q of g.players.filter(x => g.inPlay(x))) {
       const base = g.rivalPlan3(q);
       for (const b of base.buys) {
         g.berthHold = { ing: b.ing, until: 4, by: g.players.find(x => x !== q) };
         if (g.rivalPlan3(q).eta > base.eta) longer++;
         g.berthHold = null;
       }
     }
     return longer > 0;          // with the read gone nothing can lengthen, so the rule must go red
   }],
  ["B4b", "let the greedy's re-ordering stand (the monotonicity guard removed)",
   s => s.replace("if(hold&&buys.some(b=>b.ing===hold.ing)){", "if(false){"),
   g => {
     let shorter = 0;
     for (const q of g.players.filter(x => g.inPlay(x))) {
       const base = g.rivalPlan3(q);
       for (const b of base.buys) {
         g.berthHold = { ing: b.ing, until: 4, by: g.players.find(x => x !== q) };
         if (g.rivalPlan3(q).eta < base.eta) shorter++;
         g.berthHold = null;
       }
     }
     return shorter === 0;       // without the guard a blocked rival gets FASTER: the rule must go red
   }],
];
console.log("\n  red-proof — each behavioural rule re-run against a deliberately broken engine");
for (const [tag, what, mutate, stillTrue] of mutants) {
  const body = mutate(SRC);
  if (body === SRC) { console.log(`  FAIL  ${tag} mutant "${what}" changed nothing`); bad++; continue; }
  // the engine imports its siblings by relative path, so the mutant has to live where the original
  // does — same dot-prefixed, pid-tagged, always-unlinked shape the_sea_is_one_sea_check.mjs uses
  const f = path.join(REPO, "src/engine", `.tmp-honest-ruler-${tag}-${process.pid}.js`);
  try {
    fs.writeFileSync(f, body, "utf8");
    const m = await import(pathToFileURL(f).href);
    const gm = new m.Game({ ...m.roundCfg(STRATS), bakeoff: true }, 79190, true);
    const survives = stillTrue(gm);
    console.log(`  ${survives ? "FAIL" : "PASS"}  ${tag} goes red on "${what}"${survives ? "  <- it did NOT; the case cannot fail" : ""}`);
    if (survives) bad++;
  } catch (e) {
    console.log(`  FAIL  ${tag} mutant "${what}" would not load: ${e.message}`);
    bad++;
  } finally { try { fs.unlinkSync(f); } catch {} }
}

const total = rules.length + behaviour.length + mutants.length;
console.log(bad ? `\nFAIL — ${bad} of ${total}` : `\nPASS — ${rules.length} structural + ${behaviour.length} behavioural rule(s), each red-proofed`);
process.exit(bad ? 1 : 0);
