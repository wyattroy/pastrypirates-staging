#!/usr/bin/env node
/* EVERY RULE OF A FIGHT IS DECIDED IN ONE PLACE — THE ENGINE — AND BOTH FIGHTS CALL IT.
   Architecture item 1 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   THE FAULT IT HOLDS SHUT: the fight was written twice. The engine's battle() ran only in headless voyages (every bot ladder); the fight a
   player plays is src/orchestrator.js asyncBattleRun, with its own copy of every rule. They drifted four times, and the fourth was his
   ruling — "in crosswinds, there should be no reflip option… if both get heads, there's simply no winner" (2026-09-15) — which reached only
   the engine, so every real game still asked "Fire again". Posed in a browser before the fix: .planning/architecture-cleanup-shots/.
   THE RULES (each red-proofed below against a mutant of the real source, built in memory):
     1. MAY THE ATTACKER FIRE AGAIN — decided only in Game.refireOffered (the crosswind collision and the purse); no coins-vs-refire test
        and no crosswind test anywhere else; both fights ask it. Posed: a crosswind double-heads → no; both tails, full purse → yes.
     2. THE RE-FIRE'S PRICE — leaves a purse and is recorded ({t:"refire"}) only in Game.payRefire; both fights pay through it.
     3. THE FLEE — where a fleeing ship may go (Game.fleeSquares, which IS Game.sailChoices — where any captain may sail, the rim
        allowed; architecture item 18 made it one call, and scripts/qa/sail_frame_same_squares_check.mjs holds that), whether a bot flees (Game.botWantsFlee), which square
        it takes (Game.botFleeSquare), and the record (Game.flee: the event with the fleeing captain, her square checked and her route
        drawn by Game.sailTo like every sail — architecture item 7, scripts/qa/one_sail_move_check.mjs — THEN the trade winds). Neither fight
        body reaches for a square search, a distance, a recipe or a position itself.
     4. THE PLUNDER — which crate a winner who is not asked takes (Game.botSpoilPick: needed → wanted by another captain → first), called by
        both fights and the bots' planner; the crate changes hands only in Game.takeSpoil. Posed: the other captain's crate is taken.
     5. THE ROUND — who scores and why (Game.resolveRound / resolveRefire: hit, wind, collide, miss), the round recorded, and a landed shot
        said (shotLands) — only in the engine. The narration line reads `why`; nothing re-derives "won on the wind".
     6. THE LEDGER — the battle count, attacker wins, the skirmish remembered and the ending events (battle / battlenull / battleflee)
        only in the engine's steps (beginBattle, winBattle, nullBattle, flee); never in the orchestrator or any other file.
     7. WHEN A DEFENDER MAY FLEE — both shots wild in the opening round, and somewhere to go — decided only in Game.mayFlee; both fights ask it.
   WHAT STAYS WRITTEN TWICE, deliberately (the item says so): the ORDER of the steps and the re-fire loop, one in each runner.
   Behavioural rules run the engine's OWN method text — real or mutant — compiled onto a real Game, so a red-proof reaches behaviour too. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { man, ilabelImg } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const ENG = "src/engine/index.js", ORCH = "src/orchestrator.js", UTIL = "src/ui/util.js";

/* A body by brace matching, after the parameter list (skipped whole). `head` is where to start looking. */
function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
// An engine METHOD definition: two-space indent, name, params, `{` — never a call.
const methodRe = name => new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m");
const method = (eng, name) => { const m = eng.match(methodRe(name)); return m ? bodyAt(eng, m.index) : ""; };
const fnBody = (src, head) => bodyAt(src, src.indexOf(head));
const count = (s, re) => (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;

const STEPS = ["beginBattle", "resolveRound", "resolveRefire", "landRound", "fightFlips", "refireOffered", "payRefire", "mayFlee", "fleeSquares", "sailChoices",
  "botWantsFlee", "botFleeSquare", "flee", "nullBattle", "winBattle", "botSpoilPick", "takeSpoil", "battle"];
/* Compile the engine's own method text (real or mutant) so the behavioural rules run what the SOURCE says. The only free names these
   methods may use are `man` and `ilabelImg`; anything else throws, and a throw is a failed rule. */
function compile(eng) {
  const M = {};
  for (const name of STEPS) {
    const m = eng.match(methodRe(name));
    if (!m) throw new Error(`Game.${name} is missing`);
    const b = bodyAt(eng, m.index);
    const inner = b.slice(m[0].length, -1);      // m[0] ends at the method's opening brace; b ends at its closing one
    M[name] = new Function("man", "ilabelImg", `return function(${m[1]}){${inner}}`)(man, ilabelImg);
  }
  return M;
}
/* A posed table: captains 0 and 1 side by side on open water, the others far off. `across` puts the defender across the wind (a
   crosswind fight); otherwise the attacker holds the gauge. The seed is searched, never assumed to hold open water. */
function pose(M, { across = true, rimEdge = false } = {}) {
  for (let s = 0; s < 80; s++) {
    const g = new Game(roundCfg(["bot", "bot", "bot", "bot"]), 4242 + s * 101, true);
    Object.assign(g, M);
    const n = g.cfg.grid, wet = c => !(g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c));
    for (let x = 1; x < n - 1; x++) for (let y = 1; y < n - 1; y++) {
      const a = [x, y], d = [x, y - 1];
      if (!wet(a) || !wet(d) || !wet([x + 1, y]) || !wet([x - 1, y])) continue;
      if (rimEdge && ![[x, y - 2], [x - 1, y - 1], [x + 1, y - 1]].some(c => g.onRim(c))) continue;
      const [att, def, far, far2] = g.players;
      att.pos = a; def.pos = d; far.pos = [0, 0]; far2.pos = [n - 1, n - 1];
      g.players.forEach(p => { p.done = false; p.baking = false; p.coins = 20; });
      def.ing = [g.ings[0]]; att.ing = [];
      g.windNow = across ? "E" : "N";      // wind N with the defender to the N: the attacker fires downwind
      g.events.length = 0;
      return { g, att, def, far };
    }
  }
  throw new Error("no board in 80 seeds could pose two captains side by side on open water — the probe cannot reach its subject");
}

function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = S[ENG], orch = S[ORCH], util = S[UTIL];
  const headless = method(eng, "battle"), live = fnBody(orch, "async function asyncBattleRun(");
  const fights = [["battle()", headless], ["asyncBattleRun", live]];
  const others = Object.entries(S).filter(([f]) => f !== ENG);
  const all = Object.values(S).join("\n");
  const out = [];
  const rule = (checks) => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  const bothCall = (name) => fights.every(([, b]) => new RegExp(`\\.${name}\\(`).test(b));
  let M = null, compileErr = null;
  try { M = compile(eng); } catch (e) { compileErr = e.message; }
  const behave = (fn) => { if (!M) return [false, `the engine's fight steps could not be compiled (${compileErr})`]; try { return fn(); } catch (e) { return [false, `the posed fight threw: ${e.message}`]; } };

  // 1. MAY THE ATTACKER FIRE AGAIN
  {
    const offer = method(eng, "refireOffered");
    const affordOutside = count(all.replace(offer, ""), /\.coins\s*(?:>=|<=|<|>)\s*[^;&|]*refire|refire[^;&|\n]*(?:>=|<=|<|>)\s*[\w.]*\.coins/);
    const crossOutside = count(all.replace(offer, ""), /\bcrossTie\b|===?\s*"collide"|"collide"\s*===?/)
      - count(orch, /why\s*===\s*"collide"\s*\?/);      // the watched fight choosing the WORDS for a collision is not a re-fire test
    rule([
      [/"collide"/.test(offer) && /\.coins\s*>=/.test(offer), "Game.refireOffered does not hold both the crosswind collision and the purse"],
      [affordOutside === 0, `the purse is tested against the re-fire price ${affordOutside} time(s) outside refireOffered`],
      [crossOutside === 0 && fights.every(([, b]) => !/!\s*[\w.]*downwind\b|downwind\s*[!=]==?\s*(?:null|undefined)/.test(b)), "a crosswind test is written outside refireOffered"],
      [bothCall("refireOffered"), "a fight does not ask Game.refireOffered"],
      behave(() => {
        const t1 = pose(M, { across: true }); const f1 = t1.g.beginBattle(t1.att, t1.def); t1.g.resolveRound(f1, true, true);
        const t2 = pose(M, { across: true }); const f2 = t2.g.beginBattle(t2.att, t2.def); t2.g.resolveRound(f2, false, false);
        const t3 = pose(M, { across: true }); const f3 = t3.g.beginBattle(t3.att, t3.def); t3.g.resolveRound(f3, false, false); t3.att.coins = (t3.g.cfg.refire || 0) - 1;
        const r = [t1.g.refireOffered(f1), t2.g.refireOffered(f2), t3.g.refireOffered(f3)];
        return [f1.downwind === null && r[0] === false && r[1] === true && r[2] === false,
          `posed: crosswind double-heads → ${r[0]} (must be false), both tails with a full purse → ${r[1]} (true), both tails one coin short → ${r[2]} (false)`];
      }),
    ]);
  }
  // 2. THE RE-FIRE'S PRICE
  {
    const pay = method(eng, "payRefire");
    const events = count(all, /t\s*:\s*"refire"/), takes = count(all, /\.coins\s*-=\s*[^;]*refire/);
    rule([
      [events === 1 && /t\s*:\s*"refire"/.test(pay) && /\.coins\s*-=\s*cost/.test(pay), `{t:"refire"} is recorded ${events} time(s), or not by Game.payRefire taking the price`],
      [takes === 0, `the re-fire price is taken from a purse ${takes} time(s) outside Game.payRefire`],
      [bothCall("payRefire"), "a fight does not pay its re-fire through Game.payRefire"],
    ]);
  }
  // 3. THE FLEE
  {
    const flee = method(eng, "flee"), squares = method(eng, "fleeSquares"), choices = method(eng, "sailChoices"), wants = method(eng, "botWantsFlee"), pick = method(eng, "botFleeSquare");
    const reach = fights.filter(([, b]) => /\breachable(?:From)?\(|\bsailStates\(|\bsailChoices\(|\bsailPath\(|\bman\(|\.pos\s*=[^=]|\brecipe\b|\bcnt\(|\btradewind\(/.test(b)).map(([n]) => n);
    const fleeEvents = count(all, /t\s*:\s*"battleflee"/);
    rule([
      [reach.length === 0, `${reach.join(" and ")} decide(s) a flee's square, a distance, a recipe crate or a move itself`],
      [/this\.sailChoices\(def\)/.test(squares) && /sailStates\([^)]*throughRim\s*:\s*true/.test(choices),
        "Game.fleeSquares does not allow the rim — it must ask Game.sailChoices (where a captain may sail, the rim included), and that must keep the rim"],
      [/\.recipe\b/.test(wants) && /\bcnt\(/.test(wants) && /\bman\(/.test(pick), "Game.botWantsFlee / botFleeSquare no longer hold the bot's flee choice"],
      [fleeEvents === 1 && /t\s*:\s*"battleflee"/.test(flee) && flee.search(/t\s*:\s*"battleflee"/) < flee.search(/tradewind\(/) && /\bp\s*:/.test(flee) && /this\.sailTo\(\s*def\s*,\s*dest\s*,/.test(flee),
        `{t:"battleflee"} is recorded ${fleeEvents} time(s), or Game.flee does not record the fleeing captain, sailed through Game.sailTo (her square and route; re-anchored by architecture item 7), BEFORE the trade winds`],
      [["fleeSquares", "botWantsFlee", "botFleeSquare", "flee"].every(bothCall), "a fight flees without going through fleeSquares / botWantsFlee / botFleeSquare / flee"],
      behave(() => {
        const t = pose(M, { across: true, rimEdge: true }); const f = t.g.beginBattle(t.att, t.def); t.g.resolveRound(f, false, false);
        const cells = t.g.fleeSquares(t.def), rim = cells.find(c => t.g.onRim(c));
        if (!rim) return [false, "posed a defender beside the rim: no rim square among its flee squares"];
        const n0 = t.g.events.length; t.g.flee(f, rim);
        const kinds = t.g.events.slice(n0).map(e => e.t), ev = t.g.events[n0];
        const tw = pose(M, { across: false }); tw.def.ing = [tw.g.ings[1]]; tw.def.recipe = [tw.g.ings[2]];
        const fw = tw.g.beginBattle(tw.att, tw.def);                                 // the wind against the defender
        const tc = pose(M, { across: true }); tc.def.ing = [tc.g.ings[1]]; tc.def.recipe = [tc.g.ings[2]];
        const fc = tc.g.beginBattle(tc.att, tc.def);                                 // crosswind, nothing on its recipe to lose
        const tk = pose(M, { across: true }); tk.def.ing = [tk.g.ings[1]]; tk.def.recipe = [tk.g.ings[1], tk.g.ings[2]];
        const fk = tk.g.beginBattle(tk.att, tk.def);                                 // crosswind, holding its only recipe crate
        const w = [tw.g.botWantsFlee(fw), tc.g.botWantsFlee(fc), tk.g.botWantsFlee(fk)];
        return [kinds[0] === "battleflee" && kinds[1] === "tradewind" && ev.p === t.def.idx && !!(ev.draw && ev.draw.route) && w[0] === true && w[1] === false && w[2] === true,
          `posed flee onto the rim → events ${JSON.stringify(kinds)} (must be battleflee then tradewind), fled captain ${ev && ev.p} (must be ${t.def.idx}), route drawn ${!!(ev && ev.draw)} (must be true); a bot flees: wind against it ${w[0]} (true), nothing to lose ${w[1]} (false), its only recipe crate ${w[2]} (true)`];
      }),
    ]);
  }
  // 4. THE PLUNDER
  {
    const take = method(eng, "takeSpoil"), pickM = method(eng, "botSpoilPick"), planner = method(eng, "planTurnV3");
    const splices = count(all, /\.ing\.splice\([^;]*\bpick\b/), orders = count(all, /\.ing\.filter\(\s*\w+\s*=>\s*this\.players\.some\(/);
    const mirrors = fights.concat([["planTurnV3", planner]]).filter(([, b]) => /\.ing\.filter\([^;]*needs\(/.test(b)).map(([n]) => n);
    rule([
      [splices === 1 && /\.ing\.splice\(/.test(take), `a won crate is spliced out of a hold ${splices} time(s), or not in Game.takeSpoil`],
      [orders === 1 && /likelyNeeds\(/.test(pickM) && mirrors.length === 0, `the plunder pick order is written outside Game.botSpoilPick (${orders} leverage filter(s)${mirrors.length ? "; re-derived in " + mirrors.join(", ") : ""})`],
      [bothCall("botSpoilPick") && /this\.botSpoilPick\(/.test(planner) && fights.every(([, b]) => /\.winBattle\(/.test(b)) && /this\.takeSpoil\(/.test(method(eng, "winBattle")),
        "a fight or the bots' planner picks a crate without Game.botSpoilPick, or the crate moves outside takeSpoil"],
      behave(() => {
        const t = pose(M, { across: true }); const [win, lose, other] = [t.att, t.def, t.far];
        win.recipe = [t.g.ings[4]]; win.ing = []; lose.ing = [t.g.ings[1], t.g.ings[2]];
        t.g.noteDemand(other, t.g.ings[2], 5);                                       // the whole table watched `other` chase ings[2]
        const pick = t.g.botSpoilPick(win, lose), took = t.g.takeSpoil(win, lose, pick);
        return [pick === t.g.ings[2] && took === pick && win.ing.length === 1 && lose.ing.length === 1,
          `posed: a loser holding [${t.g.ings[1]}, ${t.g.ings[2]}], the second wanted by another captain → pick ${pick} (must be ${t.g.ings[2]}); one crate moved: ${win.ing.length === 1 && lose.ing.length === 1}`];
      }),
    ]);
  }
  // 5. THE ROUND
  {
    const land = method(eng, "landRound"), rr = method(eng, "resolveRound"), rf = method(eng, "resolveRefire");
    const resolving = fights.filter(([, b]) => /\b[ad]h\s*(?:&&|\|\|)|!\s*[ad]h\b|downwind\s*===?\s*"[ad]"|rounds\.push\(|t\s*:\s*"shotLands"/.test(b)).map(([n]) => n);
    const pushes = count(eng, /rounds\.push\(/), shots = count(all, /t\s*:\s*"shotLands"/);
    rule([
      [resolving.length === 0, `${resolving.join(" and ")} resolve(s) a round or records a landed shot itself`],
      [pushes === 2 && /rounds\.push\(/.test(rr) && /rounds\.push\(/.test(rf) && /\bah\s*&&\s*dh\b/.test(rr), "a round is resolved or recorded outside Game.resolveRound / resolveRefire"],
      [shots === 1 && /t\s*:\s*"shotLands"/.test(land) && others.every(([, s]) => !/t\s*:\s*"shotLands"/.test(s)), `{t:"shotLands"} is recorded ${shots} time(s), or outside the engine's round`],
      [!/\bwonOnWind\b|\bdecidedRound\b/.test(util) && /\be\.why\s*===\s*"wind"/.test(util), "the narration re-derives \"won on the wind\" instead of reading the engine's `why`"],
      [bothCall("resolveRound") && bothCall("resolveRefire"), "a fight does not resolve its rounds through the engine"],
      behave(() => {
        const res = [];
        for (const [across, ah, dh] of [[true, true, false], [true, false, true], [false, true, true], [true, true, true], [true, false, false]]) {
          const t = pose(M, { across }); const f = t.g.beginBattle(t.att, t.def); const n0 = t.g.events.length;
          const r = t.g.resolveRound(f, ah, dh); res.push(`${r.scorer}/${r.why}/${t.g.events.slice(n0).filter(e => e.t === "shotLands").length}`);
        }
        return [res.join() === "a/hit/1,d/hit/1,a/wind/1,null/collide/0,null/miss/0",
          `posed rounds (H,T) (T,H) (H,H downwind) (H,H crosswind) (T,T) → ${res.join(", ")} (must be a/hit/1, d/hit/1, a/wind/1, null/collide/0, null/miss/0)`];
      }),
    ]);
  }
  // 6. THE LEDGER
  {
    const leak = others.filter(([, s]) => /\bbattles\s*\+\+|\battWins\s*\+\+|\brecordSkirmish\(|t\s*:\s*"(?:battle|battlenull|battleflee)"/.test(s)).map(([f]) => f);
    const where = (re, names) => { const n = count(eng, re); return n === names.length && names.every(nm => new RegExp(re.source).test(method(eng, nm))); };
    rule([
      [leak.length === 0, `the fight's ledger is kept outside the engine, in ${leak.join(", ")}`],
      [where(/\bbattles\s*\+\+/, ["beginBattle"]) && where(/\battWins\s*\+\+/, ["winBattle"]) && where(/t\s*:\s*"battle"/, ["winBattle"]) && where(/t\s*:\s*"battlenull"/, ["nullBattle"]),
        "the battle count, attacker wins or an ending event is kept somewhere other than beginBattle / winBattle / nullBattle"],
      [["beginBattle", "nullBattle", "winBattle"].every(bothCall), "a fight does not begin or end through the engine's steps"],
      behave(() => {
        const t = pose(M, { across: false }); const b0 = t.g.battles, w0 = t.g.attWins, c0 = t.att.coins;
        const f = t.g.beginBattle(t.att, t.def); t.g.resolveRound(f, true, true);
        const ev = t.g.winBattle(f, t.g.botSpoilPick(f.winner, t.def));
        const t2 = pose(M, { across: true }); const f2 = t2.g.beginBattle(t2.att, t2.def); t2.g.resolveRound(f2, true, true); const ev2 = t2.g.nullBattle(f2);
        return [t.g.battles === b0 + 1 && t.g.attWins === w0 + 1 && t.att.coins === c0 - (t.g.cfg.powder || 0) && ev.t === "battle" && ev.why === "wind" && ev.flips === 2 && ev2.t === "battlenull" && ev2.flips === 2,
          `posed: a downwind win → battles +${t.g.battles - b0}, attacker wins +${t.g.attWins - w0}, powder ${c0 - t.att.coins}, event ${ev && ev.t}/${ev && ev.why}/${ev && ev.flips} flips; a crosswind collision → ${ev2 && ev2.t}`];
      }),
    ]);
  }
  // 7. WHEN A DEFENDER MAY FLEE
  {
    const may = method(eng, "mayFlee");
    const tails = count(all.replace(may, ""), /===?\s*"miss"|"miss"\s*===?/);
    rule([
      [/"miss"/.test(may) && /fleeSquares\(/.test(may) && tails === 0, `the both-tails flee condition is written outside Game.mayFlee (${tails} other test(s) of "miss")`],
      [bothCall("mayFlee"), "a fight decides whether the defender may flee without Game.mayFlee"],
      behave(() => {
        const r = [];
        for (const [ah, dh] of [[false, false], [true, true], [true, false]]) { const t = pose(M, { across: true }); const f = t.g.beginBattle(t.att, t.def); t.g.resolveRound(f, ah, dh); r.push(t.g.mayFlee(f)); }
        const t = pose(M, { across: true }); const f = t.g.beginBattle(t.att, t.def); t.g.resolveRound(f, false, false); t.g.flee(f, null);
        r.push(t.g.mayFlee(f));
        return [r.join() === "true,false,false,false", `posed: both tails → ${r[0]} (true), both heads → ${r[1]} (false), heads and tails → ${r[2]} (false), after a flee → ${r[3]} (false)`];
      }),
    ]);
  }
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = ["may the attacker fire again: Game.refireOffered only (his crosswind ruling and the purse), asked by both fights",
  "the re-fire's price leaves the purse and is recorded only in Game.payRefire",
  "the flee's square (rim allowed), a bot's choice to flee and its square, and the record (captain + route, then the trade winds) only in the engine",
  "which crate a winner takes: Game.botSpoilPick, called by both fights and the bots' planner; the crate moves only in Game.takeSpoil",
  "who wins a round and why, the round recorded, and a landed shot said: only Game.resolveRound / resolveRefire; the line reads `why`",
  "the battle count, attacker wins, the skirmish and the ending events: only the engine's steps",
  "when a defender may flee: only Game.mayFlee, asked by both fights"];
const real = rules(files);
const sizes = STEPS.map(n => method(stripComments(files[ENG]), n).length);
console.log(`one_fight_rules — ${STEPS.length} engine fight steps found (${sizes.filter(Boolean).length} with a body, ${sizes.reduce((a, b) => a + b, 0)} chars); asyncBattleRun ${fnBody(stripComments(files[ORCH]), "async function asyncBattleRun(").length} chars`);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${NAMES[i]}${r.ok ? "" : "\n          " + r.bad.join("\n          ")}`));

/* RED-PROOF: each mutant is the real source with ONE copy put back (or one rule deleted), and the rule that guards it must go red. */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const MUTANTS = [
  [1, "the watched fight testing the purse itself again (refire&&att.coins>=refire), without refireOffered",
    broken(ORCH, "while(appState.game.refireOffered(F)){", "while(!F.winner&&!F.fled&&c.refire&&att.coins>=c.refire){")],
  [1, "the crosswind clause deleted from Game.refireOffered",
    broken(ENG, "    if(fight.why===\"collide\")return false;\n", "\n")],
  [2, "the re-fire's coins taken by the watched fight itself (att.coins-=refire)",
    broken(ORCH, "appState.game.payRefire(F);", "att.coins-=c.refire;appState.game.ev({t:\"refire\",a:att.idx,d:def.idx,cost:c.refire});")],
  [3, "the headless fight back on reachableFrom(def) for its flee squares",
    broken(ENG, "this.flee(fight,this.botFleeSquare(fight,this.fleeSquares(def)));", "this.flee(fight,this.botFleeSquare(fight,this.reachableFrom(def)));")],
  [3, "the watched fight's bot flee test written inline again",
    broken(ORCH, "else flee=appState.game.botWantsFlee(F);", "else flee=(F.downwind===\"a\")||def.ing.some(i=>def.recipe&&def.recipe.includes(i)&&appState.game.cnt(def.ing,i)<=1);")],
  [3, "Game.flee writing its own square again, with no route, instead of sailing through Game.sailTo (architecture item 7)",
    broken(ENG, "    const moved=this.sailTo(def,dest,flight);\n", "    const moved=dest?(def.pos=dest):null;\n")],
  [3, "the rim taken out of Game.sailChoices, which Game.fleeSquares asks",
    broken(ENG, "sailChoices(p){return [...this.sailStates(p,{throughRim:true}).keys()]", "sailChoices(p){return [...this.sailStates(p,{}).keys()]")],
  [3, "Game.fleeSquares running its own search again, without the rim",
    broken(ENG, "return this.sailChoices(def);", "return [...this.sailStates(def,{}).keys()].map(k=>k.split(\",\").map(Number));")],
  [4, "the watched fight's own plunder pick restored (needed → first, no leverage)",
    broken(ORCH, "else pick=appState.game.botSpoilPick(win,lose);", "else{const w2=lose.ing.filter(i=>appState.game.needs(win).includes(i));pick=w2[0]||lose.ing[0];}")],
  [4, "the leverage step deleted from Game.botSpoilPick",
    broken(ENG, "(leverage[0]!==undefined?leverage[0]:lose.ing[0])", "lose.ing[0]")],
  [5, "the watched fight resolving the round itself (if(ah&&dh)…)",
    broken(ORCH, "const {scorer,why}=appState.game.resolveRound(F,ah,dh);", "let scorer=null,why=\"miss\";if(ah&&dh){if(F.downwind){scorer=F.downwind;why=\"wind\";}else why=\"collide\";}else if(ah||dh){scorer=ah?\"a\":\"d\";why=\"hit\";}F.rounds.push([ah?1:0,dh?1:0,0,scorer]);")],
  [5, "the narration re-deriving \"won on the wind\" from the rounds",
    broken(UTIL, "e.why===\"wind\"?\"battle.downwind\"", "(e.downwind&&e.rounds.filter(r=>r[3]).pop()[3]===e.downwind)?\"battle.downwind\"")],
  [6, "the watched fight emitting battlenull itself",
    broken(ORCH, "appState.game.nullBattle(F);", "appState.game.recordSkirmish(att,def,null);appState.game.ev({t:\"battlenull\",a:att.idx,d:def.idx,rounds:F.rounds,downwind:F.downwind});")],
  [7, "the watched fight testing both tails itself (if(!ah&&!dh))",
    broken(ORCH, "if(appState.game.mayFlee(F)){", "if(!ah&&!dh){")],
  [7, "the both-tails condition deleted from Game.mayFlee",
    broken(ENG, "fight.rounds.length===1&&fight.why===\"miss\"&&", "")],
];
let proofOk = true;
for (const [n, what, mutant] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && !res[n - 1].ok;
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${n}): ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — every rule of a fight is one engine step both fights call; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
