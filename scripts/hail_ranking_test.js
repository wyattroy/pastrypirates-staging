#!/usr/bin/env node
// scripts/hail_ranking_test.js
//
// AI-01 (D-04/D-06/D-07): DOM-free unit coverage for rankHailTargets/priceHailOffer/hailWorthIt —
// the pure bot-hail targeting/pricing/eligibility helpers extracted from botTurn's hail block
// (src/ui/flow.js). Uses the same loadEngine() seam every hand-rolled test script in this repo
// uses (D-12), then pokes a real Game instance's player fields directly, mirroring
// 14-RESEARCH.md's own live-repro style and 14-01's precedent (constructed-instance, no DOM).
//
// Convention (matches dlog_replay_test.js/determinism_baseline.js): no assertion library, a local
// check(name, actual, expected) counter, plain console.log, process.exit(failures?1:0).

import { loadEngine } from "./lib/load_engine.js";
import { rankHailTargets, priceHailOffer, hailWorthIt } from "../src/ui/flow.js";

const { Game, roundCfg } = await loadEngine();

const HAIL_BASE_PRICE = 5, HAIL_RESERVE = 1; // mirrors src/ui/flow.js's own module constants (D-07)

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

function gameWith(strategies) {
  return new Game(roundCfg(strategies), 12345, true);
}
function freshGame() {
  return gameWith(["pirate", "human", "human", "balanced"]);
}

console.log("rankHailTargets / priceHailOffer / hailWorthIt — pure bot-hail helpers (AI-01)\n");

/* ---------- rankHailTargets — D-06 ranking rules ---------- */

{
  // rule 1: the seller holding 2+ spares ranks before a single-holder
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, sellerA, sellerB] = g.players;
  sellerA.ing = [ing, ing];
  sellerB.ing = [ing];
  sellerA.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  sellerB.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  const ranked = rankHailTargets(g, bot, ing);
  check("D-06 rule 1: the 2-holder ranks before the 1-holder", ranked[0].idx, sellerA.idx);
  check("D-06 rule 1: both eligible holders are returned", ranked.length, 2);
}

{
  // rule 2: among two single-holders, the one for whom giving it up hurts LESS (not on their own
  // recipe) ranks first — the essential/cnt<=1 proxy from humanTrade, per <planner_corrections>
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, sellerA, sellerB] = g.players;
  sellerA.ing = [ing];
  sellerB.ing = [ing];
  sellerA.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)]; // essential to sellerA
  sellerB.recipe = g.ings.filter(i => i !== ing).slice(0, 5); // not on sellerB's recipe at all
  const ranked = rankHailTargets(g, bot, ing);
  check("D-06 rule 2: the holder for whom it is NOT essential ranks first", ranked[0].idx, sellerB.idx);
}

{
  // rule 3: proximity is a tiebreaker ONLY once rules 1-2 are tied
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, sellerA, sellerB] = g.players;
  sellerA.ing = [ing];
  sellerB.ing = [ing];
  sellerA.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  sellerB.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  g.islandOf[ing] = [0, 0];
  sellerA.pos = [1, 0]; // Manhattan distance 1
  sellerB.pos = [5, 5]; // Manhattan distance 10
  const ranked = rankHailTargets(g, bot, ing);
  check("D-06 rule 3: proximity breaks a surviving tie", ranked[0].idx, sellerA.idx);
}

{
  // total order: a FULL tie (spares, hurt-flag, and proximity all equal) breaks by seat index
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, sellerA, sellerB] = g.players;
  sellerA.ing = [ing];
  sellerB.ing = [ing];
  sellerA.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  sellerB.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  g.islandOf[ing] = [0, 0];
  sellerA.pos = [0, 0];
  sellerB.pos = [0, 0];
  const ranked = rankHailTargets(g, bot, ing);
  check("D-06 total order: a full tie breaks by seat index", ranked[0].idx, Math.min(sellerA.idx, sellerB.idx));
}

{
  // exclusions: bots, finished players, and non-holders never appear in the ranked list
  const g = gameWith(["pirate", "human", "human", "human", "balanced"]);
  const ing = g.ings[0];
  const [bot, sellerEligible, nonHolder, finishedHolder, otherBot] = g.players;
  sellerEligible.ing = [ing];
  sellerEligible.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  nonHolder.ing = []; // human, but does not hold the ingredient
  finishedHolder.ing = [ing]; finishedHolder.done = true; // human holder, but finished
  otherBot.ing = [ing]; // holds it, but is a bot, not a human
  const ranked = rankHailTargets(g, bot, ing);
  check("excludes bots, finished players, and non-holders", ranked.map(q => q.idx).join(","), String(sellerEligible.idx));
}

/* ---------- priceHailOffer — D-07 combined desperation + seller-cost scaling ---------- */

{
  // desperation term: the last remaining need costs more than three-or-more remaining needs,
  // holding the seller (and therefore seller cost) constant
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, seller] = g.players;
  seller.ing = [ing, ing]; // 2 spares, held constant across both prices below
  seller.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  bot.coins = 20;
  bot.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)];
  bot.ing = bot.recipe.slice(1); // needs only `ing` — the bot's last remaining need
  const lastNeedPrice = priceHailOffer(g, bot, seller, ing);
  bot.ing = []; // needs all 5 — three-or-more remaining needs
  const manyNeedsPrice = priceHailOffer(g, bot, seller, ing);
  check("priceHailOffer: last-remaining-need costs more than three-remaining-needs", lastNeedPrice > manyNeedsPrice, true);
}

{
  // seller-cost term: a single-holder for whom it's essential costs more than a 2-spare holder,
  // holding the bot's own need (and therefore desperation) constant
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, sellerSpare, sellerEssential] = g.players;
  bot.coins = 20;
  bot.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)];
  bot.ing = []; // held constant across both prices below
  sellerSpare.ing = [ing, ing]; // cheap to give one up
  sellerSpare.recipe = g.ings.filter(i => i !== ing).slice(0, 5);
  sellerEssential.ing = [ing]; // only one, and it's on their own recipe — costly to give up
  sellerEssential.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)];
  const spareSellerPrice = priceHailOffer(g, bot, sellerSpare, ing);
  const essentialSellerPrice = priceHailOffer(g, bot, sellerEssential, ing);
  check("priceHailOffer: an essential single-holder seller costs more than a 2-spare seller", essentialSellerPrice > spareSellerPrice, true);
}

{
  // bankruptcy guard: the offer never exceeds p.coins - HAIL_RESERVE, even at maximal desperation
  // and maximal seller cost combined
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, seller] = g.players;
  bot.coins = HAIL_RESERVE; // barely above nothing
  bot.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)];
  bot.ing = bot.recipe.slice(1); // maximal desperation — last remaining need
  seller.ing = [ing];
  seller.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)]; // maximal seller cost too
  const price = priceHailOffer(g, bot, seller, ing);
  check("priceHailOffer never exceeds p.coins - HAIL_RESERVE (large-desperation, tiny-purse case)", price <= bot.coins - HAIL_RESERVE, true);
}

/* ---------- hailWorthIt — D-04 selectivity gate ---------- */

{
  const g = freshGame();
  const ing = g.ings[0];
  const [bot] = g.players;
  bot.coins = 20;
  bot.recipe = g.ings.slice(0, 5);
  bot.ing = []; // three-or-more remaining needs
  g.boxedIn = () => false; // explicit — must not pass via the boxed-in escape hatch by accident
  check("hailWorthIt: false with 3+ remaining needs and not boxed in", hailWorthIt(g, bot, ing), false);
}

{
  const g = freshGame();
  const ing = g.ings[0];
  const [bot] = g.players;
  bot.coins = 20;
  bot.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)];
  bot.ing = bot.recipe.slice(1); // needs only `ing` and one other — among the last two needs
  check("hailWorthIt: true when the ingredient is among the bot's last two needs", hailWorthIt(g, bot, ing), true);
}

{
  const g = freshGame();
  const ing = g.ings[0];
  const [bot] = g.players;
  bot.coins = 20;
  bot.recipe = g.ings.slice(0, 5);
  bot.ing = []; // 5 remaining needs — would normally fail the selectivity gate...
  g.boxedIn = () => true; // ...but the bot is stuck, so D-04's boxed-in escape hatch applies
  check("hailWorthIt: true when the bot is boxed in, regardless of remaining needs", hailWorthIt(g, bot, ing), true);
}

{
  const g = freshGame();
  const ing = g.ings[0];
  const [bot] = g.players;
  bot.coins = HAIL_BASE_PRICE; // exactly the base offer, with nothing left for the reserve
  bot.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)];
  bot.ing = bot.recipe.slice(1); // last remaining need — would otherwise pass
  check("hailWorthIt: false when the purse cannot cover the base price with the reserve intact", hailWorthIt(g, bot, ing), false);
}

/* ---------- purity / idempotency ---------- */

{
  const g = freshGame();
  const ing = g.ings[0];
  const [bot, sellerA, sellerB] = g.players;
  sellerA.ing = [ing, ing]; sellerB.ing = [ing];
  bot.coins = 20; bot.recipe = [ing, ...g.ings.filter(i => i !== ing).slice(0, 4)]; bot.ing = bot.recipe.slice(1);
  const callsBefore = g.randCalls;
  const rank1 = rankHailTargets(g, bot, ing).map(q => q.idx);
  const price1 = priceHailOffer(g, bot, sellerA, ing);
  const worth1 = hailWorthIt(g, bot, ing);
  const callsMid = g.randCalls;
  const rank2 = rankHailTargets(g, bot, ing).map(q => q.idx);
  const price2 = priceHailOffer(g, bot, sellerA, ing);
  const worth2 = hailWorthIt(g, bot, ing);
  const callsAfter = g.randCalls;
  check("idempotency: rankHailTargets returns the same order twice", rank1.join(","), rank2.join(","));
  check("idempotency: priceHailOffer returns the same price twice", price1, price2);
  check("idempotency: hailWorthIt returns the same verdict twice", worth1, worth2);
  check("purity: no g.r() calls consumed evaluating the helpers (before -> mid)", callsMid, callsBefore);
  check("purity: no g.r() calls consumed evaluating the helpers (mid -> after)", callsAfter, callsMid);
}

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failing check(s)`);
process.exit(failures ? 1 : 0);
