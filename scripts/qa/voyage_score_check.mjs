#!/usr/bin/env node
/* voyage_score_check.mjs — the victory card's voyage score and closeness order (docs/VICTORY-CARD-PRD.md §3–4).
 *
 * FACT: what each captain scored on a voyage, who came closest to winning, and who announced the end.
 * Decided in ONE place: the leaf rules (src/shared/index.js voyageScoreRows / voyageWinBonus / voyageCloseness),
 * summed once by Game.voyageSummary into the `end` event, which only Game.declareEnd emits.
 *
 * 1. STRUCTURE — `t:"end"` is written once in src (Game.declareEnd), never in the orchestrator or the UI;
 *    Game.crownWinner is the only writer of `t:"collab"`; the live ending calls crownWinner then declareEnd.
 * 2. THE EXAMPLE VOYAGE, SCORED BY HAND — the PRD's four captains posed on a real Game, every total checked
 *    against numbers worked out on paper (not by calling the code under test).
 * 3. HIS RULE — "Players who WIN should get at least double the points as players who don't win": 2000 seeded
 *    random voyages, the WORST possible winner against the BEST posed non-winner each time.
 * 4. CLOSENESS — one posed pair per tie-break, each in both seatings.
 * RED-PROOF — the property check runs against three in-memory mutants and must turn red on each:
 *    the perfect bonus paid to non-winners; the coin cap removed; the win bonus typed as a flat 200.
 */
"use strict";
import fs from "node:fs";
import { Game, roundCfg } from "../../src/engine/index.js";
import { VOYAGE_POINTS, voyageScoreRows, voyageWinBonus, voyageCloseness, mulberry32 } from "../../src/shared/index.js";

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/* ---------- 1. STRUCTURE ---------- */
const src = f => strip(fs.readFileSync(new URL(`../../src/${f}`, import.meta.url), "utf8"));
const engine = src("engine/index.js"), orch = src("orchestrator.js");
const count = (s, re) => (s.match(re) || []).length;
const uiFiles = fs.readdirSync(new URL("../../src/ui/", import.meta.url)).filter(f => f.endsWith(".js"));
ok(count(engine, /t\s*:\s*"end"/g) === 1, `engine writes t:"end" ${count(engine, /t\s*:\s*"end"/g)} times — expected once, in declareEnd`);
ok(/declareEnd\(\)\s*\{\s*this\.ev\(\{t:"end"/.test(engine), `the one t:"end" is not inside Game.declareEnd`);
ok(count(orch, /t\s*:\s*"end"/g) === 0, `the orchestrator writes its own t:"end"`);
ok(count(engine, /t\s*:\s*"collab"/g) === 1 && count(orch, /t\s*:\s*"collab"/g) === 0, `t:"collab" is written outside Game.crownWinner`);
for (const f of uiFiles) ok(count(src(`ui/${f}`), /t\s*:\s*"end"\s*[,}]/g) === 0, `src/ui/${f} writes an end event`);
const live = orch.slice(orch.indexOf("async function liveResolveEndNet"));
ok(/crownWinner\(\)[\s\S]*?declareEnd\(\)/.test(live.slice(0, 1500)), `liveResolveEndNet does not call crownWinner() then declareEnd()`);
ok(!/eligibleFinishers|bakeRank/.test(live.slice(0, 1500)), `liveResolveEndNet ranks finishers itself again`);

/* ---------- 2. THE EXAMPLE VOYAGE, BY HAND ---------- */
function posed() {
  const cfg = roundCfg(["human", "bot", "bot", "bot"]); cfg.bakeoff = true;
  const g = new Game(cfg, 7919, true);
  const H = g.home, [p0, p1, p2, p3] = g.players;
  const at = (dx, dy) => [H[0] + dx, H[1] + dy];
  for (const p of g.players) p.recipe = p.recipe.slice(0, 5);
  // the winner: every crate, solved on the first try, lit the ovens day 15 against a navigator's 18, 5 doubloons, 1 trade
  Object.assign(p0, { ing: p0.recipe.slice(), pos: at(0, 1), coins: 5, trades: 1, done: true, ovensDay: 15, navDay: 18,
    bake: { order: p0.recipe.slice().reverse(), locked: [true, true, true, true, true], attempts: 1, solved: true } });
  // at the ovens: every crate, 3 of 5 named, lit day 15 against 16, 7 doubloons
  Object.assign(p1, { ing: p1.recipe.slice(), pos: at(1, 0), coins: 7, trades: 0, baking: true, ovensDay: 15, navDay: 16,
    bake: { order: p1.recipe.slice(), slots: [p1.recipe[4], p1.recipe[0], p1.recipe[2], p1.recipe[1], p1.recipe[3]], locked: [false, true, true, false, true], attempts: 2, solved: false } });
  // one ingredient short, 4 squares out, 4 doubloons, 2 trades
  Object.assign(p2, { ing: p2.recipe.slice(0, 4), pos: at(2, 2), coins: 4, trades: 2 });
  // three crates, 7 squares out, 11 doubloons (the coin cap is 10), 1 trade
  Object.assign(p3, { ing: p3.recipe.slice(0, 3), pos: at(-3, 4), coins: 11, trades: 1 });
  g.finishOrder = [0];
  g.round = 16;
  return g;
}
{
  const g = posed();
  g.crownWinner(); g.declareEnd();
  const end = g.events[g.events.length - 1];
  ok(end.t === "end" && end.winner === 0, `posed voyage did not end with seat 0 crowned`);
  const v = end.voyage || {};
  // BY HAND, with crate 20 · ovens 50 · named 15 · perfect 300 · day 10 (cap 5) · coin 3 (cap 10) · trade 10 (cap 3):
  //   the win is a FLAT 500 — his call, 2026-09-17: "I think winning should just give you +500, make it a clean number."
  //   It was 445, derived so the slowest winner still doubled the best loser; 500 keeps that property anyway, because a winner
  //   has by definition reached the ovens and finished: 100 + 50 + 75 + 500 = 725, against a non-winner's ceiling of
  //   5·20 + 50 + 5·15 + 5·10 + 10·3 + 3·10 = 335, and 725 ≥ 2·335. The property check below is what proves it, not this comment.
  //   seat 0: 100 + 50 + 75 + 300 + 500 + 30 + 15 + 10 = 1080
  //   seat 1: 100 + 50 + 45 + 0 + 0 + 10 + 21 + 0     = 226
  //   seat 2:  80 + 0 + 0 + 0 + 0 + 0 + 12 + 20       = 112
  //   seat 3:  60 + 0 + 0 + 0 + 0 + 0 + 30 + 10       = 100
  const want = [1080, 226, 112, 100];
  ok(JSON.stringify(VOYAGE_POINTS) === JSON.stringify({ crate: 20, ovens: 50, named: 15, perfect: 300, day: 10, dayCap: 5, coin: 3, coinCap: 10, trade: 10, tradeCap: 3 }),
    `VOYAGE_POINTS changed (${JSON.stringify(VOYAGE_POINTS)}) — re-work this check's hand arithmetic from his sheet before trusting it`);
  (v.captains || []).forEach((c, i) => ok(c.score === want[i], `seat ${i} scored ${c.score}, by hand ${want[i]} — rows ${JSON.stringify(c.rows && c.rows.map(r => r.key + ":" + r.pts))}`));
  ok(v.captains && v.captains.length === 4, `the end event carries ${v.captains && v.captains.length} captains`);
  ok(JSON.stringify(v.order) === "[0,1,2,3]", `closeness order ${JSON.stringify(v.order)}, expected [0,1,2,3]`);
  /* the named crates are the ones in LOCKED BENCH SEATS — posed on a shuffled bench (slots) whose locks are neither the
     first n nor aligned with the recipe order, so both earlier wrong readings fail this */
  { const c1 = v.captains[1], r = g.players[1].recipe, want = [r[0], r[2], r[3]].slice().sort();
    ok(Array.isArray(c1.bakeOrder) && JSON.stringify(c1.bakeOrder) === JSON.stringify(g.players[1].bake.order), `the end event does not carry the bake's own order`);
    ok(Array.isArray(c1.namedCrates) && JSON.stringify(c1.namedCrates.slice().sort()) === JSON.stringify(want),
      `the end event names ${JSON.stringify(c1.namedCrates)} as named right; the locked bench seats hold ${JSON.stringify(want)}`);
    const byOrderMistake = g.players[1].bake.order.filter((x, i) => g.players[1].bake.locked[i]).slice().sort();
    ok(JSON.stringify(byOrderMistake) !== JSON.stringify(want), `RED-PROOF: the pose cannot tell "locks read in recipe order" from the truth — re-pose it`); }
  ok(voyageWinBonus(VOYAGE_POINTS, 5) === 500, `the win pays ${voyageWinBonus(VOYAGE_POINTS, 5)}, and his call is a flat 500`);
  // a shared bakery: a captain who also solved first try but was not crowned gets every named crate, never the perfect bonus
  const g2 = posed(); const q = g2.players[1];
  Object.assign(q, { done: true, baking: false, bake: { locked: [true, true, true, true, true], attempts: 1, solved: true } });
  g2.finishOrder = [0, 1]; g2.crownWinner(); g2.declareEnd();
  const v2 = g2.events[g2.events.length - 1].voyage, loser = v2.captains.find(c => c.seat !== g2.winner);
  ok(loser.rows.find(r => r.key === "perfect").pts === 0, `a co-baker who was not crowned was paid the perfect bonus`);
  ok(g2.events.some(e => e.t === "collab"), `two finishers recorded no shared bakery`);
  // nobody finished: no crown, everyone still ranked by closeness
  const g3 = posed(); Object.assign(g3.players[0], { done: false, bake: null, ovensDay: null, ing: g3.players[0].recipe.slice(0, 2) }); g3.finishOrder = [];
  g3.crownWinner(); g3.declareEnd();
  const e3 = g3.events[g3.events.length - 1];
  ok(e3.winner === null && e3.voyage.captains.every(c => !c.won), `nobody finished still crowned someone`);
  ok(JSON.stringify(e3.voyage.order) === "[1,2,3,0]", `nobody finished: closeness ${JSON.stringify(e3.voyage.order)}, expected [1,2,3,0]`);
}

/* ---------- 3. HIS RULE: any winner doubles any non-winner ---------- */
function propertyHolds(rowsFn, winBonusOk = true) {
  const rnd = mulberry32(20260916), P = VOYAGE_POINTS, size = 5, R = n => Math.floor(rnd() * (n + 1));
  const total = c => rowsFn(c, P, size).reduce((s, r) => s + r.pts, 0);
  for (let i = 0; i < 2000; i++) {
    const worstWinner = { won: 1, crates: size, ovensDay: 20, named: size, tries: 3 + R(3), ahead: 0, coins: 0, trades: 0 };
    const loser = { won: 0, crates: R(size), ovensDay: rnd() < .5 ? 10 : null, named: R(size), tries: rnd() < .3 ? 1 : 0,
      ahead: R(20), coins: R(40), trades: R(12) };
    if (total(worstWinner) < 2 * total(loser)) return false;
  }
  return winBonusOk;
}
ok(propertyHolds(voyageScoreRows), `a winner scored less than double a non-winner`);
const mutants = {
  "perfect paid to non-winners": (c, P, s) => voyageScoreRows({ ...c, won: 1 }, P, s).map(r => r.key === "won" && !c.won ? { ...r, pts: 0 } : r),
  "coin cap removed from a non-winner": (c, P, s) => c.won ? voyageScoreRows(c, P, s) : voyageScoreRows(c, { ...P, coinCap: 1e9 }, s),
  "win typed as a flat 200": (c, P, s) => voyageScoreRows(c, P, s).map(r => r.key === "won" && c.won ? { ...r, pts: 200 } : r),
  "the win cut to 350": (c, P, s) => voyageScoreRows(c, P, s).map(r => r.key === "won" && c.won ? { ...r, pts: 350 } : r),
};
for (const [name, fn] of Object.entries(mutants)) ok(!propertyHolds(fn), `RED-PROOF: the mutant "${name}" did not turn the double-the-points check red`);

/* ---------- 4. CLOSENESS, one tie-break at a time, both seatings ---------- */
const base = { won: 0, baked: 0, named: 0, crates: 3, squares: 5, coins: 4 };
const pairs = [
  ["the winner first", { won: 1 }, {}],
  ["baked before still sailing", { baked: 1 }, { named: 0, crates: 5 }],
  ["more bake-off crates named", { baked: 1, named: 3 }, { baked: 1, named: 2 }],
  ["more recipe crates held", { crates: 4 }, { crates: 3, squares: 1 }],
  ["nearer Tortuga", { squares: 2 }, { squares: 6, coins: 20 }],
  ["more doubloons", { coins: 9 }, { coins: 3 }],
];
for (const [why, better, worse] of pairs) for (const [sa, sb] of [[0, 1], [1, 0]]) {
  const a = { ...base, ...better, seat: sa }, b = { ...base, ...worse, seat: sb };
  ok([b, a].sort(voyageCloseness)[0] === a, `closeness: "${why}" lost when seated ${sa} vs ${sb}`);
}

if (fails.length) { console.log("FAIL voyage_score_check\n  " + fails.join("\n  ")); process.exit(1); }
console.log("PASS voyage_score_check — the end is declared once, the example voyage scores 1080/226/112/100 as worked by hand, any winner doubles any non-winner over 2000 voyages (4 mutants red), and closeness breaks every tie in both seatings");
