#!/usr/bin/env node
/* AFTER A BOAT LANDS, THE TRADE WIND — APPLIED, SHOWN, AND A RIDE OF NO SQUARES EXPLAINED, IN ONE PLACE FOR EVERY CAPTAIN.
   Architecture item 19 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   THE FAULT IT HOLDS SHUT: the step after a sail was written four times — a human's sail (humanTurn), a human's Move instead (humanAct),
   a bot's sail (botTurn) and a flight from a fight — and only the first explained a boat that comes into the current AT its head, a
   ride of no squares (/4 playtest 8, Wyatt: silence there reads as a stall). It said so itself, with sayFlash("rim.head"). A human who
   took Move instead, every bot, and a captain fleeing a fight who landed there got nothing. Measured before the fix over 500 headless
   voyages: 22 bot sails and 10 flees landed at a head and none recorded anything; 280 posed human landings, only the sail path spoke.
   THE RULES (each red-proofed below against a mutant of the real source, built in memory):
     1. ONE STEP IN THE DISPLAY CODE — the engine's trade-wind step (Game.tradewind) is called exactly once outside the engine, by
        src/ui/flow.js afterSail, and humanTurn, humanAct (Move instead) and botTurn all land through afterSail. A flight from a fight
        reaches the same engine step inside Game.flee (one_fight_rules_check rule 3), and the watched fight shows what it recorded
        through the same display step, showTheWind, before the calls settle (without it a flee's wind was never said: the settled
        calls are the last thing the attacker's closing narration finds). showTheWind narrates the event it is handed. No file but
        the engine records a ride.
     2. ONE PLACE WORDS IT — "rim.head" is said by nothing but the narration table's `rimhead` entry (src/ui/util.js), and no turn
        function tests for the head of the current itself.
     3. THE ENGINE RECORDS EVERY LANDING (behavioural: the engine's own tradewind / flee / takeTurn text, real or mutant, compiled onto a
        real Game) — a human's sail and a Move instead (a sail event, then the step), a bot's sail (takeTurn), and a flee (Game.flee)
        that land AT the head each record exactly one `rimhead` for that captain, and the step hands it back so afterSail narrates it;
        a real ride records a `tradewind` and no `rimhead`; a storm blown onto a head records nothing (the storm's summary tells it).
     4. THE ONE TABLE WORDS IT FOR BOTS AND HUMANS ALIKE — every other screen reads the captain's name, the captain's own screen "ye". */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { man, ilabelImg, DIRS } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
const { describeFor, NEUTRAL_VIEWER } = await import(pathToFileURL(path.join(REPO, "src/ui/util.js")).href);
const { appState } = await import(pathToFileURL(path.join(REPO, "src/state/index.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const ENG = "src/engine/index.js", FLOW = "src/ui/flow.js", UTIL = "src/ui/util.js", ORCH = "src/orchestrator.js";

function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const methodRe = name => new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m");
const method = (eng, name) => { const m = eng.match(methodRe(name)); return m ? bodyAt(eng, m.index) : ""; };
const fnBody = (src, head) => bodyAt(src, src.indexOf(head));
const count = (s, re) => (s.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;

/* The engine's own method text, real or mutant, compiled so the behavioural rules run what the SOURCE says. */
const STEPS = ["tradewind", "flee", "takeTurn"];
function compile(eng) {
  const M = {};
  for (const name of STEPS) {
    const m = eng.match(methodRe(name));
    if (!m) throw new Error(`Game.${name} is missing`);
    const inner = bodyAt(eng, m.index).slice(m[0].length, -1);
    M[name] = new Function("man", "ilabelImg", "DIRS", `return function(${m[1]}){${inner}}`)(man, ilabelImg, DIRS);
  }
  return M;
}
/* A posed table: captain `who` on open water beside a head of the current it may sail onto, a second captain beside it (for a fight),
   the others parked far away. The seed is searched, never assumed. `ride` asks instead for a rim square whose head is elsewhere. */
function pose(M, { ride = false } = {}) {
  for (let s = 0; s < 60; s++) {
    const g = new Game(roundCfg(["bot", "bot", "bot", "bot"]), 7919 + s * 101, true);
    Object.assign(g, M);
    const n = g.cfg.grid, wet = c => g.valid.has(c[0] + "," + c[1]) && !(g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c));
    const [me, foe, far, far2] = g.players;
    far.pos = [0, 0]; far2.pos = [n - 1, n - 1];
    g.players.forEach(p => { p.done = false; p.baking = false; p.coins = 20; });
    for (const k of g.rim) {
      const c = k.split(",").map(Number);
      if (g.isRimHead(c) === ride) continue;
      for (const d of Object.values(DIRS)) {
        const from = [c[0] + d[0], c[1] + d[1]];
        if (!wet(from)) continue;
        const beside = Object.values(DIRS).map(e => [from[0] + e[0], from[1] + e[1]]).find(b => wet(b) && !(b[0] === c[0] && b[1] === c[1]));
        if (!beside) continue;
        me.pos = [...from]; foe.pos = [...beside];
        if (!g.sailChoices(me).some(q => q[0] === c[0] && q[1] === c[1])) continue;
        me.ing = [g.ings[0]]; foe.ing = [g.ings[1]];
        g.events.length = 0;
        return { g, me, foe, dest: c };
      }
    }
  }
  throw new Error("no board in 60 seeds could pose a captain beside a " + (ride ? "rim square" : "head of the current") + " — the probe cannot reach its subject");
}
const kindsFrom = (g, n0) => g.events.slice(n0).map(e => e.t);

function rules(files, narrate = describeFor) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = S[ENG], flow = S[FLOW], util = S[UTIL], orch = S[ORCH];
  const display = Object.entries(S).filter(([f]) => !f.startsWith("src/engine/") && f !== "src/shared/words.js");   // words.js HOLDS the line; it says nothing
  const out = [];
  const rule = (checks) => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  let M = null, compileErr = null;
  try { M = compile(eng); } catch (e) { compileErr = e.message; }
  const behave = (fn) => { if (!M) return [false, `the engine's steps could not be compiled (${compileErr})`]; try { return fn(); } catch (e) { return [false, `the posed landing threw: ${e.message}`]; } };

  // 1. ONE STEP IN THE DISPLAY CODE
  {
    const callers = display.flatMap(([f, s]) => Array(count(s, /\.tradewind\(/)).fill(f));
    const after = fnBody(flow, "async function afterSail(");
    const paths = [["humanTurn", fnBody(flow, "export async function humanTurn(")], ["humanAct (Move instead)", fnBody(flow, "export async function humanAct(")],
      ["botTurn", fnBody(flow, "export async function botTurn(")]];
    const skipping = paths.filter(([, b]) => !/\bafterSail\(\s*player\s*\)/.test(b)).map(([n]) => n);
    const recorders = Object.entries(S).flatMap(([f, s]) => [...s.matchAll(/t\s*:\s*"(tradewind|rimhead)"/g)].map(m => `${m[1]} in ${f}`));
    const tw = method(eng, "tradewind");
    const show = fnBody(flow, "export async function showTheWind("), fight = fnBody(orch, "async function asyncBattleRun(");
    /* re-anchored 2026-09-17 (architecture item 9): the fight has one way out now, so a flight's wind is shown on the way to the one
       settlement — from what Game.flee handed back (the flight and its wind), before the calls settle */
    const flightVar = (fight.match(/([A-Za-z_$][\w$]*)\s*=\s*appState\.game\.flee\(/) || [])[1];   // what Game.flee recorded: the flight and its wind
    const windShown = flightVar ? fight.search(new RegExp(`showTheWind\\(\\s*${flightVar}\\.evWind\\s*\\)`)) : -1;
    const settledAt = fight.search(/settleSideBets\(/);
    rule([
      [callers.length === 1 && /showTheWind\(\s*appState\.game\.tradewind\(\s*player\s*\)\s*\)/.test(after), `the trade-wind step is called ${callers.length} time(s) in the display code (${callers.join(", ") || "none"}) — it must be once, in flow.js afterSail`],
      [skipping.length === 0, `${skipping.join(" and ")} land(s) a boat without going through afterSail`],
      [recorders.length === 2 && /t\s*:\s*"tradewind"/.test(tw) && /t\s*:\s*"rimhead"/.test(tw), `a ride is recorded outside Game.tradewind (${recorders.join(", ")})`],
      [!/\.tradewind\(/.test(fight) && windShown >= 0 && settledAt > windShown,
        "the watched fight does not show its flee's trade wind through showTheWind (with Game.flee's own evWind) before the calls settle"],
      [/narrateEvent\(\s*ev\s*\)/.test(show) && /publishNow\(\)/.test(show) && /liveRender\(\)/.test(show) && !/events\s*\[/.test(show),
        "showTheWind does not tell the table, wait on the drain and narrate the event it is handed"],
    ]);
  }
  // 2. ONE PLACE WORDS IT
  {
    const said = display.flatMap(([f, s]) => Array(count(s, /["'`]rim\.head["'`]/)).fill(f));
    const table = (util.match(/\brimhead\s*:\s*\([^)]*\)\s*=>[^\n]*/) || [""])[0];
    const turns = [["humanTurn", fnBody(flow, "export async function humanTurn(")], ["humanAct", fnBody(flow, "export async function humanAct(")],
      ["botTurn", fnBody(flow, "export async function botTurn(")], ["afterSail", fnBody(flow, "async function afterSail(")], ["asyncBattleRun", fnBody(orch, "async function asyncBattleRun(")]];
    const testing = turns.filter(([, b]) => /\bonRim\(|\bisRimHead\(|\brimHead\s*\[/.test(b)).map(([n]) => n);
    rule([
      [said.length === 1 && /"rim\.head"/.test(table), `"rim.head" is said ${said.length} time(s) outside words.js (${said.join(", ") || "none"}) — only the narration table's rimhead entry may word it`],
      [testing.length === 0, `${testing.join(" and ")} test(s) for the head of the current itself — the engine decides it`],
    ]);
  }
  // 3. THE ENGINE RECORDS EVERY LANDING
  rule([
    behave(() => {
      const res = [];
      for (const how of ["a human's sail", "a Move instead"]) {                 // humanTurn and humanAct: Game.sailTo (item 7), then the step
        const t = pose(M); const n0 = t.g.events.length;
        t.g.sailTo(t.me, [...t.dest]);
        const r = t.g.tradewind(t.me), k = kindsFrom(t.g, n0);
        res.push([k.join() === "sail,rimhead" && r && r.t === "rimhead" && r.p === t.me.idx, `${how} onto the head → ${JSON.stringify(k)}, step returned ${r && r.t}`]);
      }
      { const t = pose(M); const n0 = t.g.events.length;                          // a bot's sail, the headless voyage's own turn
        t.g.planTurn = () => ({ type: "sail", why: "posed", cell: [...t.dest], via: [...t.dest] });
        t.g.takeTurn(t.me, t.g.windNow, false);
        const k = kindsFrom(t.g, n0), i = k.indexOf("sail"), ev = t.g.events[n0 + i + 1];
        res.push([i >= 0 && k[i + 1] === "rimhead" && ev.p === t.me.idx && k.filter(x => x === "rimhead").length === 1, `a bot's sail onto the head → ${JSON.stringify(k)}`]); }
      { const t = pose(M); const n0 = t.g.events.length;                          // a flee
        const fight = { att: t.foe, def: t.me, downwind: null, rounds: [[0, 0, 0, null]], why: "miss", winner: null, fled: false };
        const { evWind } = t.g.flee(fight, [...t.dest]); const k = kindsFrom(t.g, n0);
        res.push([k.join() === "battleflee,rimhead" && evWind && evWind.p === t.me.idx, `a flee onto the head → ${JSON.stringify(k)}`]); }
      { const t = pose(M, { ride: true }); t.me.pos = [...t.dest]; const n0 = t.g.events.length;   // a real ride
        const r = t.g.tradewind(t.me); const k = kindsFrom(t.g, n0);
        res.push([k.join() === "tradewind" && r && r.t === "tradewind", `a real ride → ${JSON.stringify(k)}`]); }
      { const t = pose(M); t.me.pos = [...t.dest]; const n0 = t.g.events.length;  // a storm blown onto the head
        const r = t.g.tradewind(t.me, true); const k = kindsFrom(t.g, n0);
        res.push([k.length === 0 && !r, `a storm blowing a ship onto the head → ${JSON.stringify(k)} (must be nothing; the storm's summary tells it)`]); }
      const bad = res.filter(x => !x[0]).map(x => x[1]);
      return [!bad.length, bad.join("; ")];
    }),
  ]);
  // 4. THE ONE TABLE WORDS IT FOR BOTS AND HUMANS ALIKE
  rule([
    (() => {
      try {
        const g = new Game(roundCfg(["human", "bot", "bot", "bot"]), 7919, true); appState.game = g;
        const res = [0, 1].map(p => { const e = { t: "rimhead", p }; return [narrate(e, NEUTRAL_VIEWER), narrate(e, p)]; });
        const ok = res.every(([other, own], p) => other && own && /head o' the current/.test(other.txt) && !/\bye\b/.test(other.txt) && /\bye\b/.test(own.txt) && other.txt !== own.txt);
        return [ok, `the narration table's rimhead entry: another screen reads ${JSON.stringify(res.map(r => r[0] && r[0].txt.replace(/<[^>]*>/g, "")))}, the captain's own ${JSON.stringify(res.map(r => r[1] && r[1].txt.replace(/<[^>]*>/g, "")))}`];
      } catch (e) { return [false, `the narration table threw: ${e.message}`]; }
    })(),
  ]);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = ["one step in the display code", "one place words it", "the engine records every landing", "the one table words it for bots and humans alike"];
const real = rules(files);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  rule ${i + 1}: ${NAMES[i]}${r.ok ? "" : " — " + r.bad.join("; ")}`));

/* RED-PROOF: each mutant is the real source broken the way a rule guards against; the rule it names must go red. */
const broken = (file, from, to) => { if (!files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const MUTANTS = [
  ["the wind block inlined back into botTurn", broken(FLOW, "      await botBeat();\n      await afterSail(player);}",
    "      await botBeat();\n      const evWind=g.tradewind(player);\n      if(evWind){publishNow();await liveRender();await narrateLastEvent();}}"), 0],
  ["sayFlash(\"rim.head\") back in humanTurn", broken(FLOW, "      await afterSail(player);\n    }\n  }",
    "      await afterSail(player);\n      if(appState.game.onRim(player.pos))await sayFlash(\"rim.head\",{p:seat(player.idx)});\n    }\n  }"), 1],
  ["Move instead landing without afterSail (its own step, no line)", broken(FLOW, "      publishNow();await liveRender();\n      await afterSail(player);}\n    await humanAct(player,sailCtx);return;",
    "      publishNow();await liveRender();\n      if(appState.game.tradewind(player)){publishNow();await liveRender();await narrateLastEvent();}}\n    await humanAct(player,sailCtx);return;"), 0],
  ["a second recorder of the head, in the display code", broken(FLOW, "async function afterSail(player){", "async function afterSail(player){\n  if(false)appState.game.ev({t:\"rimhead\",p:player.idx});"), 0],
  ["the engine's step back to silence at the head (the old body)", broken(ENG, "return blown?false:this.ev({t:\"rimhead\",p:p.idx});", "return false;"), 2],
  ["the engine's step explaining a storm too", broken(ENG, "return blown?false:this.ev({t:\"rimhead\",p:p.idx});", "return this.ev({t:\"rimhead\",p:p.idx});"), 2],
  ["a flight's trade wind no longer shown by the fight (said by nobody, as before item 19)", broken(ORCH, "  await showTheWind(flight.evWind);\n", ""), 0],
  ["showTheWind narrating the top of the pile instead of its event", broken(FLOW, "publishNow();await liveRender();await narrateEvent(ev);", "publishNow();await liveRender();await narrateLastEvent();"), 0],
  ["a bot's headless sail skipping the trade-wind step", broken(ENG, "if(this.sailPlan(p,plan))this.tradewind(p);", "if(this.sailPlan(p,plan)){}"), 2],   // re-anchored by item 7: the sail is sailPlan -> sailTo
  ["the line worded with a ready-made name, the same on every screen (never \"ye\")", files, 3, (e) => describeFor(e, NEUTRAL_VIEWER)],
];
let proofOk = true;
for (const [what, mutant, idx, narrate] of MUTANTS) {
  const res = mutant ? rules(mutant, narrate) : null;
  const red = !!res && !res[idx].ok;
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${idx + 1}): ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved — re-anchor)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — after a boat lands, the trade wind is one engine step and one line, for every captain; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
