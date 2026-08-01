#!/usr/bin/env node
// notes/edits #5 (rewritten 2026-07-22): headless battle-mechanics simulator for the
// "current best guess" ruleset from the battle-balance design thread, replacing the old
// broadside-reflip mechanic ported from asyncBattle(). Dev-only analysis tool — not loaded
// by the game itself.
//
// The rules being tested (revised 2026-07-22, second pass — dropped the downwind reflip
// entirely to cut flip count and let the HH point carry the wind advantage on its own; gated
// the flee option so early escapes aren't free):
//   1. No downwind reflip. Wind's only effect is rule 3 below (HH scoring) — fewer flips per
//      battle, and the HH point alone is already a big force, so stacking a reflip on top of it
//      was double-dipping the same advantage.
//   2. Defender flee: after a double-tails round (nobody scored), the defender may pay 2
//      dubloons to immediately flee/end the battle — but ONLY once the attacker has scored at
//      least 1 point. Before the attacker's first point, there's nothing to flee from yet.
//      2 dubloons mirrors the attacker's 2-dubloon cost to start a fight.
//   3. Heads-Heads scores for the downwind fighter (does nothing crosswind, i.e. still cancels
//      when neither fighter is downwind).
//   First to 2 points wins, same as before (NEED = 2).
//
// Wind engagement policy — the key real-game dynamic this rewrite adds: wind is set BEFORE a
// player starts their turn. They can see it and choose whether/how to engage, so a player would
// never knowingly attack upwind. The raw wind roll (pAttDownwind/pDefDownwind, default 25%/25%,
// remainder crosswind) models the board geometry; the policy below models what the attacker does
// with that information before picking a fight:
//   - "naive"          — attacker fights regardless of wind (old assumption, kept as a baseline).
//   - "avoidUpwind"     — attacker never attacks while upwind of the target; if the roll comes up
//                          defender-downwind, they wait for a better position (reroll wind).
//   - "preferDownwind"  — attacker only ever attacks while downwind (reroll until attacker-downwind).
//                          A ceiling case — assumes free repositioning, not usually true in-game.
//
// "live" mechanic is kept as a reference point: the mechanic as it actually shipped before this
// redesign (one-time-per-battle downwind reflip, one paid attacker broadside reflip, defender
// flee only when behind, 1-dubloon flee cost).
//
// Simplifying assumptions (game economy isn't modeled):
//   - Both fighters are given a fixed coin pool per battle (COIN_POOL) to spend on flee fees.
//   - The defender's flee always has somewhere to flee TO (the real game checks reachable tiles;
//     this script doesn't simulate the board).
//   - Downwind is drawn from the same geometry the real game uses: attacker/defender are adjacent,
//     storm wind is one of 4 directions drawn uniformly => 25%/25%/50% split by default.
//
// ---- knobs ----
const COIN_POOL = 3;
const P_ATTACKER_DOWNWIND = 0.25;
const P_DEFENDER_DOWNWIND = 0.25;
const MECHANIC_VERSION = "proposed"; // "proposed" | "live"
const WIND_POLICY = "avoidUpwind";   // "naive" | "avoidUpwind" | "preferDownwind"

const N_BATTLES = process.argv[2] ? parseInt(process.argv[2], 10) : 20000;
const NEED = 2;
const REROLL_CAP = 1000; // safety valve for policies that can't be satisfied by the given wind %s

function coinFlip(rng) { return rng() < 0.5; } // true = heads

function pickDownwind(rng, pAttDownwind, pDefDownwind, policy) {
  for (let i = 0; i < REROLL_CAP; i++) {
    const r = rng();
    let dir;
    if (r < pAttDownwind) dir = "a";
    else if (r < pAttDownwind + pDefDownwind) dir = "d";
    else dir = null;
    if (policy === "avoidUpwind" && dir === "d") continue;
    if (policy === "preferDownwind" && dir !== "a") continue;
    return dir;
  }
  return null; // gave up waiting for acceptable wind (only reachable with degenerate % configs)
}

function simBattle(rng, cfg) {
  const { coinPool, pAttDownwind, pDefDownwind, windPolicy, mechanic } = cfg;
  const downwind = pickDownwind(rng, pAttDownwind, pDefDownwind, windPolicy);

  const isProposed = mechanic === "proposed";
  // downwind free reflip and the paid broadside reflip only exist in the "live" reference
  // mechanic — "proposed" has no reflips at all, wind acts purely through HH scoring.
  let freeAAvailable = !isProposed && downwind === "a";
  let freeDAvailable = !isProposed && downwind === "d";
  let broadsideLeft = isProposed ? 0 : 1;
  const broadsideCost = 1;
  const fleeCost = isProposed ? 2 : 1;

  let attCoins = coinPool, defCoins = coinPool;
  let a = 0, d = 0, round = 0, fled = false, flips = 0;
  const roundOutcomes = []; // "HH" | "HT" | "TH" | "TT" per round

  const flip = () => { flips++; return coinFlip(rng); };

  while (a < NEED && d < NEED) {
    round++;
    let ah = flip();
    if (!ah && freeAAvailable) {
      ah = flip();
      freeAAvailable = false;
    }
    while (!ah && broadsideLeft > 0 && attCoins >= broadsideCost) {
      attCoins -= broadsideCost;
      broadsideLeft--;
      ah = flip();
    }

    let dh = flip();
    if (!dh && freeDAvailable) {
      dh = flip();
      freeDAvailable = false;
    }

    roundOutcomes.push((ah ? "H" : "T") + (dh ? "H" : "T"));

    if (ah && dh) {
      // double-heads scores for whichever side is downwind, else cancels (crosswind)
      if (downwind === "a") a++;
      else if (downwind === "d") d++;
    } else if (ah) { a++; }
    else if (dh) { d++; }
    // else both tails: no score this round

    const bothTails = !ah && !dh;
    // "proposed": flee unlocks only once the attacker has scored — nothing to flee from before
    // that. "live": flee only when currently behind (legacy heuristic, implies a>=1 anyway).
    const fleeEligible = isProposed ? a >= 1 : true;
    if (bothTails && a < NEED && d < NEED && defCoins >= fleeCost && fleeEligible) {
      const flee = isProposed ? true : (d < a);
      if (flee) { defCoins -= fleeCost; fled = true; break; }
    }
  }

  return { downwind, a, d, round, flips, fled, roundOutcomes, winner: fled ? null : (a >= NEED ? "a" : "d") };
}

// xorshift32 for a fast, seedable RNG independent of Math.random
function xorshift32(seed) {
  let x = seed | 0 || 0x9e3779b9;
  return function () {
    x ^= x << 13; x |= 0;
    x ^= x >>> 17;
    x ^= x << 5; x |= 0;
    return ((x >>> 0) / 4294967296);
  };
}

function run(n, seed, cfg) {
  const rng = xorshift32(seed);
  const stats = {
    total: n,
    fled: 0,
    overall: { aWins: 0, dWins: 0, decided: 0 },
    byDownwind: {
      a: { battles: 0, aWins: 0, dWins: 0, fled: 0, rounds: 0 },
      d: { battles: 0, aWins: 0, dWins: 0, fled: 0, rounds: 0 },
      none: { battles: 0, aWins: 0, dWins: 0, fled: 0, rounds: 0 },
    },
    roundOutcomeCounts: { HH: 0, HT: 0, TH: 0, TT: 0 },
    totalRounds: 0,
    totalFlips: 0,
    maxFlips: 0,
    over10Flips: 0,
  };
  for (let i = 0; i < n; i++) {
    const r = simBattle(rng, cfg);
    const key = r.downwind || "none";
    const bucket = stats.byDownwind[key];
    bucket.battles++;
    bucket.rounds += r.round;
    if (r.fled) { bucket.fled++; stats.fled++; }
    else if (r.winner === "a") { bucket.aWins++; stats.overall.aWins++; stats.overall.decided++; }
    else { bucket.dWins++; stats.overall.dWins++; stats.overall.decided++; }
    stats.totalRounds += r.round;
    stats.totalFlips += r.flips;
    if (r.flips > stats.maxFlips) stats.maxFlips = r.flips;
    if (r.flips > 10) stats.over10Flips++;
    for (const o of r.roundOutcomes) stats.roundOutcomeCounts[o]++;
  }
  return stats;
}

function pct(n, d) { return d === 0 ? "n/a" : (100 * n / d).toFixed(1) + "%"; }

const cfg = {
  coinPool: COIN_POOL,
  pAttDownwind: P_ATTACKER_DOWNWIND,
  pDefDownwind: P_DEFENDER_DOWNWIND,
  windPolicy: WIND_POLICY,
  mechanic: MECHANIC_VERSION,
};
const stats = run(N_BATTLES, 42, cfg);

console.log(`Battle simulation — ${N_BATTLES} battles (seed 42, COIN_POOL=${COIN_POOL}, mechanic=${MECHANIC_VERSION}, windPolicy=${WIND_POLICY})`);
console.log(`Base wind roll: pAttDownwind=${P_ATTACKER_DOWNWIND} pDefDownwind=${P_DEFENDER_DOWNWIND}\n`);

console.log("Win rate by wind position (excludes fled battles from the win-rate denominator):");
for (const [key, label] of [["a", "Attacker downwind"], ["d", "Defender downwind"], ["none", "Crosswind (no advantage)"]]) {
  const b = stats.byDownwind[key];
  const decided = b.battles - b.fled;
  console.log(`  ${label.padEnd(28)} battles=${b.battles.toString().padEnd(6)} attacker-wins=${pct(b.aWins, decided).padEnd(7)} defender-wins=${pct(b.dWins, decided).padEnd(7)} flee-rate=${pct(b.fled, b.battles)}`);
}

console.log(`\nAverage coin flips per battle (headline pacing metric): ${(stats.totalFlips / stats.total).toFixed(2)}`);
console.log(`Max flips seen in a single battle: ${stats.maxFlips}`);
console.log(`Battles exceeding 10 flips: ${pct(stats.over10Flips, stats.total)}`);
console.log(`Overall attacker win rate (excl. fled): ${pct(stats.overall.aWins, stats.overall.decided)}`);
console.log(`Overall flee rate: ${pct(stats.fled, stats.total)}`);
console.log(`Average battle length: ${(stats.totalRounds / stats.total).toFixed(2)} rounds`);

console.log("\nPer-round flip-outcome distribution (attacker/defender heads-tails):");
const totalRoundFlips = Object.values(stats.roundOutcomeCounts).reduce((s, v) => s + v, 0);
for (const k of ["HH", "HT", "TH", "TT"]) {
  console.log(`  ${k}: ${pct(stats.roundOutcomeCounts[k], totalRoundFlips)}`);
}
console.log(`\n"Something happens every flip" check: TT rounds (${pct(stats.roundOutcomeCounts.TT, totalRoundFlips)}) either continue the`);
console.log(`battle (both fighters keep fighting) or trigger a flee decision — they never resolve with zero`);
console.log(`consequence, since a flee always costs the defender a coin and ends the battle outright.`);
