#!/usr/bin/env node
// scripts/battle_two_shots.js
//
// "What is the statistical likelihood of winning a battle if aiming downwind let you shoot twice?"
// — Wyatt, 2026-08-09
//
// A rules question, answered by MEASUREMENT against the real engine rather than by arithmetic on a
// whiteboard, because the whiteboard leaves out the two things that actually decide a v2 battle:
// the defender's FREE escape on a both-tails round (rule 9a) and the attacker's paid re-fire chain
// (rule 9b). Both fire often enough to move the headline number by double digits.
//
// The rig stages a CONTROLLED DUEL — two ships one square apart with the wind set deliberately —
// and calls the engine's own battle() thousands of times, tallying the events it emits. Nothing
// about the odds is asserted here; they are counted.
//
// Four arms. The first is today's rule; the rest are the readings of "shoot twice":
//
//   today        one shot each. Both heads -> the downwind ship takes it (rule 9).
//   two-heads    downwind attacker flips TWICE and must land HEADS ON BOTH; the defender still
//                flips once. This is Wyatt's rule as stated, and it is a HANDICAP, not a buff —
//                the attacker's shot lands a quarter of the time instead of half.
//   extra-shot   downwind attacker flips twice and needs heads on EITHER. The other reading of
//                the same sentence, kept alongside because the two differ by 50 points.
//   replaces     downwind attacker flips twice for either, and LOSES the tiebreak — the second
//                barrel IS the whole edge, and both-heads goes back to being a collision.
//   symmetric    both ships flip twice for either when downwind (a rule about the wind rather
//                than about attacking). Shown because the defender is downwind exactly as often.
//
//   node scripts/battle_two_shots.js [trials]

import { Game, roundCfg } from "../v2bakeoff/src/engine/index.js";
import { DIRS } from "../v2bakeoff/src/shared/index.js";

const TRIALS = +(process.argv[2] || 20000);
const STRATS = ["balanced", "balanced", "balanced", "balanced"];

// Two adjacent open-water squares along the wind, found on the real board rather than guessed —
// a duel staged on an island would be thrown out by the engine's own legality checks.
function pickWater(g, w) {
  for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) {
    const a = [x, y], b = [x + w[0], y + w[1]];
    if (!g.isIsland(a) && !g.isIsland(b) && g.valid.has(a + "") && g.valid.has(b + "")) return a;
  }
  throw new Error("no adjacent water pair found on this board");
}

// ---- the duel rig ------------------------------------------------------------------------------
// A fresh game per arm, but the SAME seed sequence per trial across arms, so the comparison is
// paired: trial k sees the same coin stream in every arm until the rules make it diverge.
function duel({ trials, variant, attackerDownwind, purse }) {
  const tally = { win: 0, lose: 0, flee: 0, nul: 0, shots: 0, refires: 0 };
  for (let t = 0; t < trials; t++) {
    const g = new Game({ ...roundCfg(STRATS), bakeoff: false }, 1000 + t, true);
    const att = g.players[0], def = g.players[1];
    // pin the weather rather than rolling for it: the question is about a KNOWN gauge, and a storm
    // round would answer a different question. Everything else in the fight still rolls.
    g.windNow = "E"; g.stormNow = false; g.windNow2 = null;
    // stage the adjacency: the wind runs attacker -> defender when the attacker holds the gauge
    const w = DIRS[g.windNow];
    const base = pickWater(g, w);
    att.pos = attackerDownwind ? base : [base[0] + w[0], base[1] + w[1]];
    def.pos = attackerDownwind ? [base[0] + w[0], base[1] + w[1]] : base;
    // a legal target must be carrying something, and a legal attacker must be able to pay powder
    def.ing = ["wheat", "sugar"];
    att.ing = [];
    att.coins = purse;
    def.coins = 6;
    g.events.length = 0;

    // count barrels ACTUALLY fired, not the engine's flips field — that is incremented by hand
    // (flips+=2) and so cannot see the second barrel a variant adds. A tally that silently ignores
    // the thing under test is worse than no tally.
    g.barrels = 0;
    applyVariant(g, variant);
    g.battle(att, def);

    const ev = g.events.filter(e => e.t === "battle" || e.t === "battleflee" || e.t === "battlenull");
    tally.refires += g.events.filter(e => e.t === "refire").length;
    const e = ev[ev.length - 1];
    tally.shots += g.barrels;
    if (!e) { tally.nul++; continue; }
    if (e.t === "battleflee") tally.flee++;
    else if (e.t === "battlenull") tally.nul++;
    else if (e.winner === att.idx) tally.win++;
    else tally.lose++;
  }
  return tally;
}

// ---- the rule variants -------------------------------------------------------------------------
// Each one re-implements ONLY the opening broadside and then hands control back to the engine's own
// flee and re-fire code, so the parts of the rule that are not under question stay exactly as they
// ship. The trick is to leave battle() untouched and instead swap what a "flip" means for a ship
// that holds the weather gauge — one extra barrel is precisely `flip() || flip()`.
function applyVariant(g, variant) {
  const countingFlip = g.flip.bind(g);
  if (variant === "today") { g.flip = (p) => { g.barrels++; return countingFlip(p); }; return; }
  const realFlip = g.flip.bind(g);
  const side = g.downwindSide.bind(g);
  let duo = null; // which player object gets the second barrel this battle
  const realBattle = g.battle.bind(g);
  g.battle = function (att, def) {
    const dw = side(att, def);
    duo = variant === "symmetric" ? (dw === "a" ? att : dw === "d" ? def : null)
      : (dw === "a" ? att : null);
    // "replaces": the second barrel IS the edge, so the tiebreak goes away and both-heads collides
    if (variant === "replaces" || variant === "symmetric")
      g.downwindSide = () => null;
    let first = true;
    g.flip = (p) => {
      // only the OPENING broadside is doubled — a paid re-fire is one barrel, as it is today
      const two = p === duo && first;
      g.barrels += two ? 2 : 1;
      const a = realFlip(p);
      if (!two) return a;
      const b = realFlip(p);
      // the whole difference between the two readings of "flip twice" lives on this line
      return variant === "two-heads" ? (a && b) : (a || b);
    };
    // the opening round consumes both cannons; everything after it is a re-fire
    const out = realBattle(att, def);
    first = false;
    g.flip = realFlip;
    g.downwindSide = side;
    return out;
  };
}

// ---- report ------------------------------------------------------------------------------------
const pct = (n, d) => (100 * n / d).toFixed(1).padStart(5) + "%";
function row(label, t) {
  const n = TRIALS;
  console.log(`  ${label.padEnd(12)} ${pct(t.win, n)} ${pct(t.lose, n)} ${pct(t.flee, n)} ${pct(t.nul, n)}` +
    `   ${(t.shots / n).toFixed(2).padStart(5)}  ${(t.refires / n).toFixed(2).padStart(5)}`);
}

for (const [title, attackerDownwind] of [["ATTACKER HOLDS THE GAUGE", true], ["ATTACKER IS UPWIND", false]]) {
  for (const purse of [2, 12]) {
    console.log(`\n=== ${title} — attacker's purse ${purse}🌕 ${purse === 2 ? "(powder only, no re-fire affordable)" : "(deep pockets)"} ===`);
    console.log(`  ${"rule".padEnd(12)} ${"win".padStart(6)} ${"lose".padStart(6)} ${"flee".padStart(6)} ${"null".padStart(6)}   shots  refire`);
    for (const v of ["today", "two-heads", "extra-shot", "replaces", "symmetric"])
      row(v, duel({ trials: TRIALS, variant: v, attackerDownwind, purse }));
  }
}
console.log(`\n${TRIALS} staged duels per row. "win" is the attacker taking the crate; "flee" is the`);
console.log(`defender's free escape on a both-tails round; "null" is a fight that ended with nobody`);
console.log(`gaining anything. Counted from the engine's own events — no odds are asserted here.`);
