#!/usr/bin/env node
/* HOW A VOYAGE STARTS, HOW EACH DAY BEGINS, AND HOW THE WINNER IS CROWNED — EACH DECIDED IN ONE PLACE, THE ENGINE.
   Architecture item 2 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   THE FAULT IT HOLDS SHUT: every voyage-level rule was written twice or three times. The game a player plays (src/orchestrator.js
   runLiveNet) staggered the starting purses 3/4/5/6; the headless engine (playBakeoff / playClassic — every bot ladder) gave everyone 3.
   Only the live day-start record carried the storm `streak`. The 150-day cap was typed three times. The winner was crowned by two copies
   (Game.resolveEnd and liveResolveEndNet). Measured before the fix: headless voyages on seeds 7919, 104729, 12345 started at [3,3,3,3].
   The stagger is the played rule since 06005ae8 (2026-07-18), kept by Mac: Dev relaying Wyatt (2026-09-16); the engine follows the live game.
   THE RULES (each red-proofed below against a mutant of the real source, built in memory; comments stripped first):
     1. THE STARTING PURSES — the purse rule is read in one place (shared startingPurse); the sailing order is shuffled, the purses dealt and
        the order published only in Game.beginVoyage; every voyage (playBakeoff, playClassic, runLiveNet) begins there.
        Posed: a started voyage deals startCoins, +1, +2… in sailing order and publishes that order.
     2. THE DAY-START RECORD — {t:"newround"} is written once, in Game.beginDay, and carries `streak`; the day is counted and the wind
        advanced only there; every voyage's day begins there. Posed: a second storm running is recorded with streak 2, a calm day with 0.
     3. THE DAY CAP — one named engine constant (DAY_CAP), read only by beginDay; no voyage compares the day to a number; its value is typed
        nowhere else in the engine or the orchestrator. Posed: the last day begins, the day after it does not.
     4. THE CROWNING — who may be crowned, the winner and the shared bakery ({t:"collab"}) only in Game.crownWinner; {t:"end"} only in
        Game.declareEnd; the headless ending (resolveEnd) and the live one (liveResolveEndNet) both go through the two.
        Posed: a finisher without a full recipe is not crowned; two finishers bake together and the fuller hold wins; nobody → no winner.
   Behavioural rules run the engine's OWN method text — real or mutant — compiled onto a real Game, so a red-proof reaches behaviour too.
   NOT HELD HERE (the item says so): crow's-nest calls (the live loop's flow.js) and the ORDER of a day's steps inside each runner. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const ENG = "src/engine/index.js", ORCH = "src/orchestrator.js", SHARED = "src/shared/index.js";

/* A body by brace matching, after the parameter list (skipped whole). */
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
const has = (s, re) => new RegExp(re.source, re.flags.replace("g", "")).test(s);

/* Compile the engine's own step text (real or mutant), and the shared purse rule, so behaviour follows the SOURCE. */
const STEPS = ["beginVoyage", "beginDay", "crownWinner", "declareEnd", "resolveEnd"];
function compile(eng, shared) {
  const pm = shared.match(/function startingPurse\(([^)]*)\)\{/);
  if (!pm) throw new Error("startingPurse is missing from src/shared/index.js");
  const pb = bodyAt(shared, pm.index);
  const startingPurse = new Function(`return function(${pm[1]}){${pb.slice(pm[0].length, -1)}}`)();
  const cap = eng.match(/\bconst DAY_CAP\s*=\s*(\d+)\s*;/);
  if (!cap) throw new Error("const DAY_CAP is missing from the engine");
  const M = {};
  for (const name of STEPS) {
    const m = eng.match(methodRe(name));
    if (!m) throw new Error(`Game.${name} is missing`);
    const b = bodyAt(eng, m.index);
    M[name] = new Function("startingPurse", "DAY_CAP", `return function(${m[1]}){${b.slice(m[0].length, -1)}}`)(startingPurse, +cap[1]);
  }
  return { M, DAY_CAP: +cap[1] };
}
const table = (C, n, seed = 4242) => { const g = new Game(roundCfg(["bot", "bot", "bot", "bot"].slice(0, n)), seed, true); Object.assign(g, C.M); return g; };

function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = S[ENG], orch = S[ORCH], shared = S[SHARED];
  const all = Object.values(S).join("\n");
  const voyages = [["playBakeoff", method(eng, "playBakeoff")], ["playClassic", method(eng, "playClassic")], ["runLiveNet", fnBody(orch, "export async function runLiveNet(")]];
  const endings = [["resolveEnd", method(eng, "resolveEnd")], ["liveResolveEndNet", fnBody(orch, "export async function liveResolveEndNet(")]];
  const out = [];
  const rule = (checks) => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  const allCall = (list, name) => list.filter(([, b]) => !new RegExp(`\\.${name}\\(\\)`).test(b)).map(([n]) => n);
  let C = null, compileErr = null;
  try { C = compile(eng, shared); } catch (e) { compileErr = e.message; }
  const behave = (fn) => { if (!C) return [false, `the engine's voyage steps could not be compiled (${compileErr})`]; try { return fn(); } catch (e) { return [false, `the posed voyage threw: ${e.message}`]; } };

  // 1. THE STARTING PURSES
  {
    const voyage = method(eng, "beginVoyage"), purse = fnBody(shared, "function startingPurse(");
    const words = count(all, /\bstartCoins\b/);                                   // the tuning value, the rules page's fact name, the one read
    const outside = Object.entries(S).filter(([f]) => f !== ENG && f !== SHARED).filter(([, s]) => has(s, /\bstartingPurse\(/)).map(([f]) => f);
    const engCalls = count(eng, /\bstartingPurse\(/), ctorPurse = count(eng, /\bcoins\s*:\s*startingPurse\(cfg,0\)/);
    const missing = allCall(voyages, "beginVoyage");
    rule([
      [words === 3 && has(purse, /\.startCoins\b/) && has(eng, /\bstartCoins\s*:\s*\d/) && has(shared, /\bstartCoins\s*:\s*startingPurse\(/),
        `"startCoins" appears ${words} time(s) in src/ — it may be only the tuning value (roundCfg), the rules page's fact name (rulesFacts) and the one read (startingPurse)`],
      [outside.length === 0, `the purse rule is called outside the engine and its leaf tier, in ${outside.join(", ")}`],
      [has(voyage, /\bstartingPurse\(/) && engCalls === 1 + ctorPurse && ctorPurse <= 1, "a purse is dealt in the engine somewhere other than Game.beginVoyage (and the opening purse before the order is drawn)"],
      [count(all, /\.shuffle\(\s*order\s*\)/) === 1 && has(voyage, /this\.shuffle\(\s*order\s*\)/), "the sailing order is shuffled outside Game.beginVoyage"],
      [count(all, /\.setTurnOrder\(/) === 1 && has(voyage, /this\.setTurnOrder\(/), "the sailing order is published outside Game.beginVoyage"],
      [missing.length === 0, `${missing.join(" and ")} do(es) not begin the voyage through Game.beginVoyage`],
      behave(() => {
        const rows = [];
        let ok = true;
        for (const n of [4, 3, 2]) {
          const g = table(C, n, 7919 * n);
          const opening = g.players.map(p => p.coins);
          const order = g.beginVoyage();
          const purses = order.map(i => g.players[i].coins);
          const ev = g.events.find(e => e.t === "turnOrder");
          const want = order.map((_, k) => g.cfg.startCoins + k);
          const good = JSON.stringify(purses) === JSON.stringify(want) && opening.every(c => c === g.cfg.startCoins)
            && !!ev && JSON.stringify(ev.order) === JSON.stringify(order) && JSON.stringify(ev.order.map(i => ev.state[i].coins)) === JSON.stringify(want);
          if (!good) ok = false;
          rows.push(`${n} captains: order ${JSON.stringify(order)}, purses in order ${JSON.stringify(purses)} (must be ${JSON.stringify(want)}), turnOrder event ${ev ? "recorded" : "MISSING"}`);
        }
        return [ok, "posed: " + rows.join("; ")];
      }),
    ]);
  }
  // 2. THE DAY-START RECORD
  {
    const day = method(eng, "beginDay");
    const records = count(all, /\bt\s*:\s*"newround"/), winds = count(all, /\.advanceWind\(/), notes = count(all, /\.noteWind\(/), days = count(all, /\.round\s*(?:\+\+|\+=)/);
    const missing = allCall(voyages, "beginDay");
    rule([
      [records === 1 && has(day, /\bt\s*:\s*"newround"[^}]*\bstreak\s*:/), `{t:"newround"} is written ${records} time(s) in src/, or not by Game.beginDay with its storm streak`],
      [winds === 1 && notes === 1 && has(day, /this\.advanceWind\(/) && has(day, /this\.noteWind\(/), `the day's wind is advanced ${winds} / noted ${notes} time(s) — only Game.beginDay may`],
      [days === 1 && has(day, /this\.round\s*\+\+/), `the day is counted ${days} time(s) — only Game.beginDay may`],
      [missing.length === 0, `${missing.join(" and ")} do(es) not begin each day through Game.beginDay`],
      behave(() => {
        /* REPOINTED 2026-09-17 (architecture item 44): this pose used to count TOMORROW's roll as the second storm (cfg.storm 1, the
           count written by the draw) — the very read-after-draw fault item 44 fixed. The count is today's now, kept by advanceWind
           before tomorrow is drawn, so the pose is yesterday's storm running into today's, with tomorrow's roll calm.
           scripts/qa/storm_continues_one_place_check.mjs holds the count itself. */
        const g = table(C, 4, 104729); g.beginVoyage(); g.cfg.storm = 0;
        g.next = { dir: "E", storm: true }; g.stormStreak = 1;                     // yesterday a storm, today's forecast a second one running
        const d1 = g.beginDay(), e1 = g.events[g.events.length - 1];
        g.cfg.storm = 0; g.next = { dir: "N", storm: false }; g.stormStreak = 0;     // a calm day
        g.beginDay(); const e2 = g.events[g.events.length - 1];
        const fields = e => e && e.t === "newround" && ["dir", "streak", "windStreak", "next", "nextStorm"].every(k => k in e);
        return [!!d1 && d1.storm === true && d1.wind === "E" && fields(e1) && e1.streak === 2 && fields(e2) && e2.streak === 0,
          `posed: a storm day with another storm running → ${e1 && e1.t} streak ${e1 && e1.streak} (must be 2); a calm day → streak ${e2 && e2.streak} (must be 0); every record carries dir, streak, windStreak, next, nextStorm: ${fields(e1) && fields(e2)}`];
      }),
    ]);
  }
  // 3. THE DAY CAP
  {
    const day = method(eng, "beginDay");
    const def = eng.match(/\bconst DAY_CAP\s*=\s*(\d+)\s*;/), N = def ? def[1] : null;
    const reads = count(all, /\bDAY_CAP\b/), compares = count(all, /\bround\s*(?:<=?|>=?)\s*\d/);
    const typed = N ? count(eng, new RegExp(`\\b${N}\\b`)) + count(orch, new RegExp(`\\b${N}\\b`)) : -1;
    rule([
      [!!def && count(all, /\bconst DAY_CAP\b/) === 1, "the day cap is not one named engine constant (const DAY_CAP)"],
      [reads === 2 && has(day, /\bDAY_CAP\b/), `DAY_CAP is named ${reads} time(s) in src/ — its definition and Game.beginDay only`],
      [compares === 0, `a voyage compares the day to a number itself (${compares} time(s))`],
      [typed === 1, `the cap's value (${N}) is typed ${typed} time(s) in the engine and orchestrator code — only its definition may`],
      behave(() => {
        const g = table(C, 4, 12345); g.beginVoyage();
        g.round = C.DAY_CAP - 1;
        const last = g.beginDay(), r1 = g.round, n1 = g.events.length;
        const after = g.beginDay(), r2 = g.round, n2 = g.events.length;
        return [!!last && r1 === C.DAY_CAP && after === null && r2 === C.DAY_CAP && n2 === n1,
          `posed: day ${C.DAY_CAP - 1} → the last day begins (${!!last}, day ${r1}); the next → ${after === null ? "no day" : "ANOTHER DAY"} (day ${r2}, ${n2 - n1} new record(s))`];
      }),
    ]);
  }
  // 4. THE CROWNING
  {
    const crown = method(eng, "crownWinner"), end = method(eng, "declareEnd");
    const collabs = count(all, /\bt\s*:\s*"collab"/), ends = count(all, /\bt\s*:\s*"end"/);
    const eligible = count(all, /\.eligibleFinishers\(/), ranks = count(all, /\.bakeRank\(/);
    const live = endings[1][1];
    const missing = endings.filter(([, b]) => !/\.crownWinner\(\)/.test(b) || !/\.declareEnd\(\)/.test(b) || b.search(/\.crownWinner\(\)/) > b.search(/\.declareEnd\(\)/)).map(([n]) => n);
    rule([
      [collabs === 1 && has(crown, /\bt\s*:\s*"collab"/) && eligible === 1 && has(crown, /this\.eligibleFinishers\(/) && ranks === 1 && has(crown, /this\.bakeRank\(/),
        `who may be crowned, the ranking or the shared bakery is decided outside Game.crownWinner ({t:"collab"} ×${collabs}, eligibleFinishers ×${eligible}, bakeRank ×${ranks})`],
      [ends === 1 && has(end, /\bt\s*:\s*"end"/), `{t:"end"} is written ${ends} time(s) in src/, or not by Game.declareEnd`],
      [missing.length === 0 && !/\.finishOrder\s*=[^=]|\.winner\s*=[^=]/.test(live), `${missing.length ? missing.join(" and ") + " do(es) not crown through Game.crownWinner then Game.declareEnd" : "liveResolveEndNet writes the finishers or the winner itself"}`],
      behave(() => {
        const g = table(C, 4, 2026); const [a, b, c] = g.players; const ing = g.ings;
        a.recipe = [ing[0]]; a.ing = [ing[0], ing[1], ing[2]];      // full recipe, three in the hold
        b.recipe = [ing[0]]; b.ing = [ing[0]];                      // full recipe, one in the hold
        c.recipe = [ing[3]]; c.ing = [];                            // finished once, robbed since: no recipe to bake
        g.finishOrder = [b.idx, c.idx, a.idx];
        const n0 = g.events.length, together = g.crownWinner(), kinds = g.events.slice(n0).map(e => e.t);
        const w = g.declareEnd(), e = g.events[g.events.length - 1];
        const g2 = table(C, 4, 2027); g2.winner = 3; g2.finishOrder = [];
        const w2 = g2.resolveEnd(), k2 = g2.events.map(x => x.t);
        const g3 = table(C, 4, 2028); const s = g3.players[1]; s.recipe = [g3.ings[0]]; s.ing = [g3.ings[0]]; g3.finishOrder = [s.idx];
        const t3 = g3.crownWinner(), w3 = g3.declareEnd(), k3 = g3.events.map(x => x.t);
        return [together === true && kinds.join() === "collab" && w === a.idx && e.t === "end" && e.winner === a.idx && !g.finishOrder.includes(c.idx)
            && w2 === null && g2.winner === null && k2.join() === "end" && t3 === false && w3 === s.idx && k3.join() === "end",
          `posed: two full recipes and a robbed finisher → shared bakery ${together} (${kinds.join()}), crowned ${w} (must be ${a.idx}, the fuller hold), robbed captain still listed ${g.finishOrder.includes(c.idx)}; nobody finished → winner ${w2} (${k2.join()}); one finisher → shared ${t3}, crowned ${w3} (${k3.join()})`];
      }),
    ]);
  }
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = ["the starting purses: one purse rule, dealt with the sailing order only in Game.beginVoyage, which every voyage begins with",
  "the day-start record: {t:\"newround\"} with its storm streak only in Game.beginDay, which every voyage's day begins with",
  "the day cap: one named engine constant, read only by Game.beginDay",
  "the crowning: Game.crownWinner then Game.declareEnd, for the headless ending and the live one"];
const real = rules(files);
console.log(`one_voyage_start — ${STEPS.length} engine voyage steps; voyages checked: playBakeoff, playClassic, runLiveNet; endings: resolveEnd, liveResolveEndNet`);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${NAMES[i]}${r.ok ? "" : "\n          " + r.bad.join("\n          ")}`));

/* RED-PROOF: each mutant is the real source with ONE copy put back (or one rule deleted), and the rule that guards it must go red. */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const OLD_LIVE_START = "  let order=appState.game.players.map((_,i)=>i);\n  appState.game.shuffle(order);\n  order.forEach((i,pos)=>{appState.game.players[i].coins=appState.game.cfg.startCoins+pos;});\n  appState.game.setTurnOrder(order);";
const OLD_LIVE_DAY = "  while(appState.game.round<150&&!ended){\n    appState.game.round++;\n    appState.game.advanceWind();\n    appState.game.ev({t:\"newround\",dir:appState.game.windNow,streak:appState.game.stormNow?appState.game.stormStreak:0,windStreak:appState.game.noteWind(appState.game.windNow),next:appState.game.forecastWind(),nextStorm:appState.game.stormNext});liveRender();";
const OLD_LIVE_CROWN = "  appState.game.finishOrder=appState.game.eligibleFinishers();\n  if(!appState.game.finishOrder.length)appState.game.winner=null;\n  else if(appState.game.finishOrder.length===1)appState.game.winner=appState.game.finishOrder[0];\n  else{\n    const ranked=appState.game.finishOrder.slice().sort((x,y)=>appState.game.bakeRank(x,y));\n    appState.game.winner=ranked[0];\n    appState.game.ev({t:\"collab\",finishers:ranked.slice(),winner:appState.game.winner,crates:ranked.map(i=>appState.game.players[i].ing.length),coins:ranked.map(i=>appState.game.players[i].coins)});\n    liveRender();\n    await narrateLastEvent();\n  }\n  appState.game.ev({t:\"end\",winner:appState.game.winner});";
const MUTANTS = [
  [1, "the stagger pasted back into the live voyage (order.forEach((i,pos)=>{…startCoins+pos}))",
    broken(ORCH, "  const order=appState.game.beginVoyage();", "  const order=appState.game.beginVoyage();\n  order.forEach((i,pos)=>{appState.game.players[i].coins=appState.game.cfg.startCoins+pos;});")],
  [1, "the live voyage shuffling, staggering and publishing the order itself again",
    broken(ORCH, "  const order=appState.game.beginVoyage();", OLD_LIVE_START)],
  [1, "the headless voyage back on its own shuffle, dealing no purses",
    broken(ENG, "  playBakeoff(){\n    const order=this.beginVoyage();", "  playBakeoff(){\n    let order=this.players.map((_,i)=>i);\n    this.shuffle(order);")],
  [1, "the purse rule flattened (every captain the same purse)",
    broken(SHARED, "function startingPurse(cfg,place){ return cfg.startCoins+place; }", "function startingPurse(cfg,place){ return cfg.startCoins; }")],
  [2, "`streak` dropped from Game.beginDay's record",
    broken(ENG, "streak:this.stormStreak,", "")],
  [2, "the live voyage counting the day, advancing the wind and writing newround itself again",
    broken(ORCH, "  while(!ended&&appState.game.beginDay()){\n    liveRender();", OLD_LIVE_DAY)],
  [3, "the cap typed as a bare number inside beginDay",
    broken(ENG, "if(this.round>=DAY_CAP)return null;", "if(this.round>=150)return null;")],
  [3, "the cap deleted from beginDay",
    broken(ENG, "if(this.round>=DAY_CAP)return null;", "")],
  [3, "the classic voyage comparing the day to 150 itself",
    broken(ENG, "  playClassic(){\n    const order=this.beginVoyage();\n    for(let day;(day=this.beginDay());){", "  playClassic(){\n    const order=this.beginVoyage();\n    for(let day;this.round<150&&(day=this.beginDay());){")],
  [4, "the live ending ranking the finishers and writing collab/end itself again",
    broken(ORCH, "  if(appState.game.crownWinner()){\n    liveRender();\n    await narrateLastEvent();\n  }\n  appState.game.declareEnd();", OLD_LIVE_CROWN)],
  [4, "the full-recipe guard deleted from Game.crownWinner",
    broken(ENG, "    this.finishOrder=this.eligibleFinishers();\n    this.winner=null;", "    this.winner=null;")],
];
let proofOk = true;
for (const [n, what, mutant] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && !res[n - 1].ok;
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${n}): ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — a voyage's start, each day's start and the crowning are one engine step each, called by every voyage; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
