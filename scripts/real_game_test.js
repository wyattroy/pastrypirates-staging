#!/usr/bin/env node
// notes/edits #12: unlike scripts/battle_sim.js (a hand-written reimplementation of the battle
// mechanic, not trusted for this — see its own header comment), this harness runs the REAL
// `Game` class, unmodified, with real bots playing full real games — no reimplementation, no
// simplifying assumptions about board state or coin economy.
//
// How it works: the deterministic engine (constants, helper functions, the `Game` class itself)
// lives in its own DOM-free ES module (src/engine/index.js, importing shared leaf constants from
// src/shared/index.js). scripts/lib/load_engine.js obtains it via a native `import`, so this test
// is exercising the exact same source the browser runs — not a port, not a rewrite.

import { loadEngine } from "./lib/load_engine.js";

const N_GAMES = process.argv[2] ? parseInt(process.argv[2], 10) : 2000;
const SEED_BASE = 12345;

const { Game, roundCfg } = await loadEngine();

// same personality roster the live game's BOT_STRATS uses (index.html, welcome-flow bot fill-in)
const BOT_STRATS = ["pirate", "trader", "balanced", "rusher", "monopolist"];

function pct(n, d) { return d === 0 ? "n/a" : (100 * n / d).toFixed(1) + "%"; }
function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

const stats = {
  games: 0,
  battlesPerGame: [],
  roundsPerGame: [],
  flipsPerBattle: [],
  roundsPerBattle: [],
  attWins: 0, defWins: 0, fled: 0, totalBattles: 0,
  byDownwind: {
    a: { battles: 0, attWins: 0, defWins: 0, fled: 0 },
    d: { battles: 0, attWins: 0, defWins: 0, fled: 0 },
    none: { battles: 0, attWins: 0, defWins: 0, fled: 0 },
  },
};

for (let i = 0; i < N_GAMES; i++) {
  // rotate the 4 seats through all 5 personalities across the run for broad coverage, not just
  // one fixed matchup repeated N times
  const strategies = [0, 1, 2, 3].map(s => BOT_STRATS[(i + s) % BOT_STRATS.length]);
  const cfg = roundCfg(strategies);
  const g = new Game(cfg, SEED_BASE + i, true); // record=true — Game.ev() is a no-op otherwise
  g.play();

  stats.games++;
  stats.battlesPerGame.push(g.battles);
  stats.roundsPerGame.push(g.round);

  for (const e of g.events) {
    if (e.t !== "battle" && e.t !== "battleflee") continue;
    stats.totalBattles++;
    stats.flipsPerBattle.push(e.flips || 0);
    stats.roundsPerBattle.push((e.rounds || []).length);
    const key = e.downwind || "none";
    const bucket = stats.byDownwind[key];
    bucket.battles++;
    if (e.t === "battleflee") { stats.fled++; bucket.fled++; }
    else if (e.winner === e.a) { stats.attWins++; bucket.attWins++; }
    else { stats.defWins++; bucket.defWins++; }
  }
}

console.log(`Real-game battle-mechanic test — ${N_GAMES} full games, real bots, real Game.play()/Game.battle() (seed base ${SEED_BASE})\n`);

console.log(`Battles per game: avg=${avg(stats.battlesPerGame).toFixed(2)}  min=${Math.min(...stats.battlesPerGame)}  max=${Math.max(...stats.battlesPerGame)}`);
console.log(`Rounds (turns) per game: avg=${avg(stats.roundsPerGame).toFixed(1)}`);
console.log(`Total battles across all games: ${stats.totalBattles}\n`);

console.log(`Average flips per battle: ${avg(stats.flipsPerBattle).toFixed(2)}`);
console.log(`Average rounds per battle: ${avg(stats.roundsPerBattle).toFixed(2)}\n`);

console.log("Win/loss/flee — attacker vs defender (overall):");
console.log(`  attacker wins=${pct(stats.attWins, stats.totalBattles)}  defender wins=${pct(stats.defWins, stats.totalBattles)}  flee=${pct(stats.fled, stats.totalBattles)}\n`);

console.log("Wind-direction effect (win rate by who's downwind, flee excluded from the win-rate split):");
for (const [key, label] of [["a", "Attacker downwind"], ["d", "Defender downwind"], ["none", "Crosswind (no advantage)"]]) {
  const b = stats.byDownwind[key];
  const decided = b.battles - b.fled;
  console.log(`  ${label.padEnd(28)} battles=${String(b.battles).padEnd(6)} attacker-wins=${pct(b.attWins, decided).padEnd(7)} defender-wins=${pct(b.defWins, decided).padEnd(7)} flee-rate=${pct(b.fled, b.battles)}`);
}
