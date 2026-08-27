// Measure what the bots actually OFFER at the table, and what the table does with it.
//
// Playtest 21 item 4 (Wyatt): "The bots offer trades that are far too low to be enticing, early
// on — no one would trade a resource that cost them 3 for 5, when it would waste them a turn, and
// save their opponent travel across the board. Find an elegant way to increase the theory of mind
// of the bots with trades; in fact i think the logic is already in there."
//
// He is right that it is already in there, and this harness exists to say so with numbers rather
// than with an opinion: respondToOffer prices a crate properly (crateCostTurns vs offerValueTurns,
// tilted by each archetype's dealBias), while composeOffer bids a HARDCODED 2 coins alongside a
// crate and 5 coins alone, having asked nobody anything.
//
// WHAT THIS PRINTS, and why each column is here:
//   openoffers      how many hails were made at all
//   mean coins      the size of the opening bid — the number Wyatt is calling too low
//   open offers     THE OTHER NUMBER THAT MATTERS, and the one this harness's first version was
//                   too soft about. A hail reaches the WHOLE TABLE (rule 4), so a hail is not one
//                   captain being asked — it is every captain, the human included, being
//                   interrupted. "The announcement IS the spam" is the recorded lesson
//                   (HARD-WON-LESSONS; the trade-memory work drove offers 706 -> 375), and Wyatt's
//                   ruling is explicit: "We dont want the table continuously spammed with shitty
//                   trade requests, it's exhausting for players to swat them away." 03a683c held
//                   hails at ~2.8 a game on purpose. A change that improves offers by making MORE
//                   of them has failed, however good the offers are.
//                   Do NOT be reassured by IDENTICAL re-hails staying flat — a re-hail at a better
//                   price is still an announcement to swat away. That mistake cost a round here.
//   trades struck   the outcome that matters; a bid nobody takes is not generosity
//   mean voyage     THE SCOREBOARD (BOT-DESIGN-PRINCIPLES §0). Bidding more must not lengthen the
//                   voyage — a bot that buys crates it cannot afford to buy has optimised the
//                   process and lost the game.
//
// CONTROLS, because a harness is unreviewed code and this project has shipped three vacuous ones:
//   - dock buys must be non-zero. Crate-buying is the entire economy; if it reads 0 the harness is
//     broken, not the game (this is the exact tell that caught the empty-events bug — see
//     HARD-WON-LESSONS §3).
//   - winners must be counted with `== null`, NEVER `if(!w)`. play() returns a SEAT INDEX, so seat
//     0 winning is a falsy 0 and a truth-test reports it as an unfinished voyage. That invented a
//     crisis that survived three runs and drove two rewrites of code that was never wrong.
//   - every ingredient named in an offer is asserted against the engine's own ING list, so a
//     fixture cannot quietly trade in a currency the game does not have (the "lemon" incident).
//
// Usage:  node 4/scripts/trade_offer_measure.js [games]

import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const engine = await import(path.join(HERE, "..", "src", "engine", "index.js"));
const { Game, roundCfg } = engine;

const GAMES = Number(process.argv[2] || 300);
const SEED0 = 7919;
// the same four archetypes every other harness in this repo tables, and in the same order — the
// archetypes are NOT equally strong (one brain across the table wins 44/50/61/45 by seat), so
// comparing two runs is only meaningful if the seating is identical between them
const STRATS = ["pirate", "trader", "balanced", "rusher"];

const st = {
  games: 0, finished: 0, unfinished: 0,
  offers: 0, coinSum: 0, coinsWithCrate: [], coinsAlone: [],
  accept: 0, counter: 0, deny: 0,
  trades: 0, dockBuys: 0, roundsSum: 0,
  earlyOffers: 0, earlyCoinSum: 0, repeatHails: 0, identicalHails: 0,          // "early on" is Wyatt's own framing — rounds 1-5
  bogusIng: [],
};

const ROUND_EARLY = 5;

for (let i = 0; i < GAMES; i++) {
  // third arg IS `record` — without it g.events stays empty and every count below reads 0,
  // which looks exactly like "the bots never trade" rather than like a broken harness
  const g = new Game(roundCfg(STRATS), SEED0 + i * 101, true);
  const w = g.play();

  st.games++;
  if (w == null) st.unfinished++; else st.finished++;   // == null, never !w — seat 0 is a real winner
  st.roundsSum += g.round;

  const legal = new Set(g.ings);
  // THE SPAM CONTROL. Wyatt, 2026-08-05: "bots must remember trades they've requested and been
  // rejected from, and not request the same ones again if they've failed, unless the table has
  // substantively changed." Raw hail COUNT is the wrong alarm — a bot that hails for five
  // different crates is negotiating; one that hails for the same crate five times is spam. So
  // count repeats of (asker, crate) within a voyage, which is what that ruling actually forbids.
  // TWO metrics, because they mean opposite things and conflating them hid the answer for a round.
  //   identical  — the SAME captain hailing for the SAME crate at the SAME price. Nothing has
  //                changed and nothing was learned; this is the spam his ruling forbids, and it is
  //                the metric the 2026-08-05 work moved 365 -> 31.
  //   re-hail    — same captain, same crate, but a DIFFERENT (better) price. That is haggling, and
  //                a bot that improves its offer after a no is doing exactly what a human does.
  const hailSeen = new Map(), sameSeen = new Map();
  for (const e of g.events) {
    if (e.t === "openoffer") {
      const k = e.p + "|" + e.want;
      const kk = k + "|" + (e.offer || "");
      const n = (hailSeen.get(k) || 0) + 1;
      hailSeen.set(k, n);
      if (n > 1) st.repeatHails++;
      const m = (sameSeen.get(kk) || 0) + 1;
      sameSeen.set(kk, m);
      if (m > 1) st.identicalHails++;
    }
  }
  for (const e of g.events) {
    if (e.t === "openoffer") {
      st.offers++;
      if (!legal.has(e.want) && st.bogusIng.length < 5) st.bogusIng.push(e.want);
      // the offer label carries the coins; read the number back out of it
      const m = /(\d+)\s*coins/.exec(e.offer || "");
      const coins = m ? Number(m[1]) : 0;
      const hasCrate = /^[^\d]/.test((e.offer || "").trim()) && !/^\d+\s*coins$/.test((e.offer || "").trim());
      st.coinSum += coins;
      (hasCrate ? st.coinsWithCrate : st.coinsAlone).push(coins);
      if (e.round == null ? false : e.round <= ROUND_EARLY) { st.earlyOffers++; st.earlyCoinSum += coins; }
    }
    if (e.t === "trade") st.trades++;
    if (e.t === "parley") st.deny++;
    if (e.t === "dock" && (e.got === "bought" || e.price > 0)) st.dockBuys++;
  }
}

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f = (n, d = 2) => Number(n).toFixed(d);

console.log(`\ngames ${st.games}   finished ${st.finished}   unfinished ${st.unfinished}`);
console.log(`mean voyage            ${f(st.roundsSum / st.games, 1)} rounds     <- THE SCOREBOARD`);
console.log(`open offers            ${st.offers}  (${f(st.offers / st.games, 2)} per game)`);
console.log(`mean coins offered     ${f(st.coinSum / Math.max(1, st.offers))}`);
console.log(`  ...alongside a crate ${f(mean(st.coinsWithCrate))}   (n=${st.coinsWithCrate.length})  [cap was 2]`);
console.log(`  ...coins alone       ${f(mean(st.coinsAlone))}   (n=${st.coinsAlone.length})  [cap was 5]`);
console.log(`trades struck          ${st.trades}  (${f(st.trades / st.games, 2)} per game)`);
console.log(`offers -> trade rate   ${f(100 * st.trades / Math.max(1, st.offers), 1)}%`);
console.log(`\nCONTROLS`);
console.log(`  dock buys            ${st.dockBuys}   ${st.dockBuys > 0 ? "ok" : "*** ZERO — HARNESS IS BROKEN, NOT THE GAME ***"}`);
console.log(`  IDENTICAL re-hails    ${st.identicalHails}  (${f(100*st.identicalHails/Math.max(1,st.offers),1)}% of hails)  <- THE spam metric`);
console.log(`  re-hails (better price) ${st.repeatHails - st.identicalHails}  = haggling, not spam`);
console.log(`  any repeat hail         ${st.repeatHails}  (${f(100*st.repeatHails/Math.max(1,st.offers),1)}% of hails)  <- the anti-spam metric`);
console.log(`  illegal ingredients  ${st.bogusIng.length ? "*** " + st.bogusIng.join(",") + " ***" : "none"}`);
console.log(`  early offers (r<=${ROUND_EARLY})  ${st.earlyOffers}, mean ${f(st.earlyCoinSum / Math.max(1, st.earlyOffers))} coins   <- Wyatt's "early on"`);
console.log("");
