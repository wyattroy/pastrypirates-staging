#!/usr/bin/env node
/* A SHIP SAILS IN ONE PLACE: WHETHER SHE MAY LAND WHERE SHE IS SENT, AND THE SQUARES SHE CROSSES TO GET THERE.
   Architecture item 7 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   THE FAULT IT HOLDS SHUT: five route requests and two legality paths. A bot's sail, headless (Game.takeTurn) and on screen (ui/flow.js
   botTurn), wrote the ship's square first (sailPlan) and then asked for the route WITHOUT the trade winds (sailPath {throughRim:false,
   from}); a person's sail (humanTurn) and Move instead (humanAct) each asked for their own route and wrote their own square; a flight
   (Game.flee) did the same again. A bot's square was checked by sailPlan; a person's went in unchecked and was checked only when a save
   was replayed (pickCell). So every bot sail INTO the current was recorded with no route — measured over 400 headless voyages, 1,958 of
   22,977 bot sails, every one route-less — and on screen that boat glided the straight chord to the current, over the islands, and was
   snatched onto the ride mid-glide (posed on a phone: 6 frames with its centre over land, one 138px jump in a single frame).
   Now Game.sailTo(p,dest,as) is the one place: one sail search with the rim allowed decides both halves, writes the square and records
   the move with its route. Every mover reaches it — sailPlan (both bot turn paths), humanTurn, humanAct, Game.flee.
   THE RULES (each red-proofed below against a mutant of the real source, built in memory):
     1. ONE RECORDER — a `sail` is recorded ({t:"sail"}) in exactly one place in src/: Game.sailTo.
     2. ONE SEARCH, ONE CHECK, AND EVERY MOVER THROUGH IT — no sailPath anywhere; the sail search's prev chain is walked only in sailTo,
        which searches with the rim allowed; sailSearch is asked only by sailStates and sailTo; humanTurn and humanAct sail through
        game.sailTo, botTurn and takeTurn through sailPlan, sailPlan through sailTo (the ride's square and the step) and no check of its
        own, Game.flee through sailTo; pickCell hands a replayed square back without testing it (sailTo does, for every square).
     3. NO SHIP'S SQUARE WRITTEN BESIDE IT — outside the engine a square is only ever copied from an event's snapshot (the guest's
        mirror in consumeEvent; fixEv's missing-field default); inside it, only where a ship starts (constructor), sails (sailTo), is
        carried by the current (tradewind), is shoved by a storm (stormStep), ducks into the current boxed in (rimEscape: one square,
        recorded as a `windmove` — not a sail) or is imagined and put back (turnsToWin3If).
     4. BEHAVIOURAL (the engine's own sailTo / sailPlan / stepToward / flee / takeTurn text, real or mutant, compiled onto a real Game):
        a. posed boards — for every square of the board, sailTo moves the captain exactly when Game.sailChoices offers that square,
           recording one sail whose route starts where she stood, ends where she landed, and steps square by square over water only
           through open sea; refused, it writes and records nothing. It must accept at least one trade-wind square, or it says so.
        b. a bot's plan that rides the current (plan.via), played by takeTurn: a sail recorded WITH its route, then the trade wind.
        c. a posed flight into the current: a battleflee with its route, then the trade wind; a flight to nowhere: no route, no wind.
        d. headless voyages: every sail and every moving flight carries its route, from the captain's square in the event before it —
           and at least one sail enters the current, or the rule cannot fail and says so.
   WHAT IS NOT THIS FACT, named so nobody "converges" it: where a captain MAY sail as the screens show it (Game.sailChoices,
   sail_frame_same_squares_check); the trade wind after a landing (Game.tradewind / afterSail, after_sail_one_step_check); how a bot
   CHOOSES a square (planTurnV3, stepToward, reachableFrom); drawing the route (storyboard present(), animateSailRoute). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg, PLAN } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { man, ilabelImg, DIRS } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const ENG = "src/engine/index.js", FLOW = "src/ui/flow.js", ORCH = "src/orchestrator.js", UTIL = "src/ui/util.js";

/* A body by brace matching, after the whole parameter list. */
function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const methodRe = name => new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m");        // an engine METHOD definition, never a call
const method = (eng, name) => { const m = eng.match(methodRe(name)); return m ? bodyAt(eng, m.index) : ""; };
const fnBody = (src, head) => bodyAt(src, src.indexOf(head));
const count = (s, re) => (s.match(new RegExp(re.source, "g")) || []).length;
const k = c => c[0] + "," + c[1];

/* The engine's own method text, real or mutant, compiled so the behavioural rules run what the SOURCE says. */
const STEPS = ["sailTo", "sailPlan", "stepToward", "flee", "takeTurn"];
function compile(eng) {
  const M = {};
  for (const name of STEPS) {
    const m = eng.match(methodRe(name));
    if (!m) throw new Error(`Game.${name} is missing`);
    const inner = bodyAt(eng, m.index).slice(m[0].length, -1);
    M[name] = new Function("man", "ilabelImg", "DIRS", "PLAN", `return function(${m[1]}){${inner}}`)(man, ilabelImg, DIRS, PLAN);
  }
  return M;
}
const table = (M, seed) => { const g = new Game(roundCfg(["bot", "bot", "bot", "bot"]), seed, true); Object.assign(g, M); g.players.forEach(p => { p.done = false; p.baking = false; }); return g; };
const sea = (g, c) => g.valid.has(k(c)) && !(g.blocked(c) || g.isIsland(c) || g.isHome(c));
/* a drawn route a ship could really have sailed: from `from` to `to`, one square at a time, over water, through open sea only */
function honest(g, route, from, to) {
  if (!Array.isArray(route) || route.length < 2) return "no route";
  if (k(route[0]) !== k(from)) return `starts at ${k(route[0])}, not where she stood (${k(from)})`;
  if (k(route[route.length - 1]) !== k(to)) return `ends at ${k(route[route.length - 1])}, not where she landed (${k(to)})`;
  for (let i = 1; i < route.length; i++) {
    if (man(route[i], route[i - 1]) !== 1) return `jumps ${k(route[i - 1])} -> ${k(route[i])}`;
    if (!sea(g, route[i])) return `crosses land at ${k(route[i])}`;
    if (i < route.length - 1 && g.onRim(route[i])) return `sails THROUGH the current at ${k(route[i])}`;
  }
  return null;
}

function behaviour(eng) {
  let M;
  try { M = compile(eng); } catch (e) { return [[false, `the engine's steps could not be compiled (${e.message})`]]; }
  const res = [];
  const guard = (what, fn) => { try { res.push(fn()); } catch (e) { res.push([false, `${what} threw: ${e.message}`]); } };
  // a. posed boards: sailTo moves exactly onto sailChoices
  guard("the posed boards", () => {
    let tried = 0, accepted = 0, rim = 0; const bad = [];
    for (const seed of [7919, 104729]) {
      const g = table(M, seed), me = g.players[0], n = g.cfg.grid;
      const froms = []; for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) if (sea(g, [x, y]) && !g.onRim([x, y]) && (x + y) % 3 === 0) froms.push([x, y]);
      for (const from of froms) {
        if (g.players.some(q => q !== me && k(q.pos) === k(from))) continue;
        me.pos = [...from];
        const legal = new Set(g.sailChoices(me).map(k));
        for (let x = 0; x < n && bad.length < 6; x++) for (let y = 0; y < n && bad.length < 6; y++) {
          const dest = [x, y], n0 = g.events.length; tried++;
          const r = g.sailTo(me, dest);
          const recorded = g.events.slice(n0);
          if (legal.has(k(dest))) {
            if (!r || k(me.pos) !== k(dest)) bad.push(`from ${k(from)} a sail to ${k(dest)} (offered by sailChoices) did not move her`);
            else if (recorded.length !== 1 || recorded[0].t !== "sail" || recorded[0].p !== 0) bad.push(`from ${k(from)} to ${k(dest)} recorded ${JSON.stringify(recorded.map(e => e.t))}, not one sail`);
            else { const why = honest(g, recorded[0].draw && recorded[0].draw.route, from, dest); if (why) bad.push(`from ${k(from)} to ${k(dest)}: the route ${why}`); accepted++; if (g.onRim(dest)) rim++; }
          } else if (r || k(me.pos) !== k(from) || recorded.length) bad.push(`from ${k(from)} a sail to ${k(dest)} (NOT offered by sailChoices) moved her to ${k(me.pos)} or recorded ${recorded.length} event(s)`);
          me.pos = [...from]; g.events.length = n0;
        }
      }
    }
    return [!bad.length && rim > 0, bad.length ? bad.join("; ") : `no trade-wind square was accepted in ${tried} posed sails (${accepted} accepted) — the rule cannot reach its subject`];
  });
  // b. a bot's plan that rides the current, played by takeTurn
  guard("the posed ride", () => {
    for (const seed of [7919, 104729, 31337]) {
      const g = table(M, seed), me = g.players[0], n = g.cfg.grid;
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
        if (!sea(g, [x, y]) || g.onRim([x, y]) || g.players.some(q => q !== me && k(q.pos) === k([x, y]))) continue;
        me.pos = [x, y];
        const via = g.sailChoices(me).find(c => g.onRim(c) && !g.isRimHead(c) && man(c, [x, y]) >= 2);
        if (!via) continue;
        const head = g.rimHead[k(via)], from = [x, y];
        g.planTurn = () => ({ type: "sail", why: "posed", cell: [...head], via: [...via] });
        const n0 = g.events.length; g.takeTurn(me, g.windNow, false);
        const E = g.events.slice(n0), i = E.findIndex(e => e.t === "sail" && e.p === 0);
        const s = E[i], why = s ? honest(g, s.draw && s.draw.route, from, via) : "no sail recorded";
        return [!why && E[i + 1] && E[i + 1].t === "tradewind" && k(me.pos) === k(head),
          `a bot riding into the current from ${k(from)} by ${k(via)} → ${JSON.stringify(E.map(e => e.t))}; its sail: ${why || "routed"}; she ends at ${k(me.pos)} (the head is ${k(head)})`];
      }
    }
    return [false, "no board posed a bot two squares from a trade-wind square — the rule cannot reach its subject"];
  });
  // c. a posed flight into the current, and a flight to nowhere
  guard("the posed flight", () => {
    for (const seed of [7919, 104729, 31337]) {
      const g = table(M, seed), [att, def] = g.players, n = g.cfg.grid;
      for (let x = 1; x < n - 1; x++) for (let y = 1; y < n - 1; y++) {
        if (!sea(g, [x, y]) || g.onRim([x, y]) || !sea(g, [x, y + 1]) || g.onRim([x, y + 1])) continue;
        if (g.players.slice(2).some(q => [k([x, y]), k([x, y + 1])].includes(k(q.pos)))) continue;
        def.pos = [x, y]; att.pos = [x, y + 1];
        const dest = g.sailChoices(def).find(c => g.onRim(c) && !g.isRimHead(c) && man(c, def.pos) >= 2);
        if (!dest) continue;
        const from = [x, y], fight = { att, def, downwind: null, rounds: [[0, 0, 0, null]], why: "miss", winner: null, fled: false };
        let n0 = g.events.length; const { evFlee, evWind } = g.flee(fight, [...dest]);
        const E = g.events.slice(n0), why = honest(g, E[0] && E[0].draw && E[0].draw.route, from, dest);
        def.pos = [...from]; n0 = g.events.length;
        const still = g.flee({ ...fight, fled: false }, null), E2 = g.events.slice(n0);
        return [E.map(e => e.t).join() === "battleflee,tradewind" && !why && evFlee === E[0] && evWind === E[1] && E2.map(e => e.t).join() === "battleflee" && !E2[0].draw && !still.evWind && k(def.pos) === k(from),
          `a flight into the current → ${JSON.stringify(E.map(e => e.t))} (route: ${why || "honest"}); a flight to nowhere → ${JSON.stringify(E2.map(e => e.t))}, drawn ${!!(E2[0] && E2[0].draw)}, wind ${!!still.evWind}`];
      }
    }
    return [false, "no board posed a defender two squares from a trade-wind square — the rule cannot reach its subject"];
  });
  // d. headless voyages
  guard("the headless voyages", () => {
    let sails = 0, into = 0, flights = 0; const bad = [];
    for (const [cfg, seed] of [[{}, 7919], [{}, 8020], [{ bakeoff: true }, 7919], [{ bakeoff: true }, 15838]]) {
      const g = new Game({ ...roundCfg(["pirate", "trader", "balanced", "rusher"]), ...cfg }, seed, true); Object.assign(g, M);
      g.play();
      const E = g.events;
      for (let i = 1; i < E.length && bad.length < 6; i++) {
        const e = E[i];
        if (e.t !== "sail" && !(e.t === "battleflee" && e.draw)) continue;
        let j = i - 1; while (j >= 0 && !E[j].state) j--;
        const from = E[j].state[e.p].pos, to = e.state[e.p].pos;
        if (e.t === "battleflee" && k(from) === k(to)) continue;
        if (e.t === "sail") { sails++; if (g.onRim(to)) into++; } else flights++;
        const why = honest(g, e.draw && e.draw.route, from, to);
        if (why) bad.push(`seed ${seed}${cfg.bakeoff ? " (bake-off)" : ""} event ${i} ${e.t} of captain ${e.p} ${k(from)} -> ${k(to)}${g.onRim(to) ? " INTO THE CURRENT" : ""}: ${why}`);
      }
    }
    return [!bad.length && into > 0, bad.length ? bad.join("; ") : `${sails} sails, none into the current — the rule cannot reach its subject`];
  });
  return res;
}

function rules(files, only) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = S[ENG], flow = S[FLOW], orch = S[ORCH];
  const out = [];
  const want = i => !only || only.includes(i);
  const rule = (i, fn) => { if (!want(i)) { out.push({ ok: null, bad: [] }); return; } const checks = fn(); const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  const sailTo = method(eng, "sailTo");

  // 1. ONE RECORDER
  rule(0, () => {
    const where = Object.entries(S).flatMap(([f, s]) => Array(count(s, /\bt\s*:\s*["'`]sail["'`]/)).fill(f));
    return [[where.length === 1 && /\bt\s*:\s*"sail"/.test(sailTo), `a sail is recorded ${where.length} time(s) (${where.join(", ") || "nowhere"}) — only Game.sailTo may record one`]];
  });
  // 2. ONE SEARCH, ONE CHECK, EVERY MOVER THROUGH IT
  rule(1, () => {
    const pathers = Object.entries(S).filter(([, s]) => /\bsailPath\b/.test(s)).map(([f]) => f);
    const walkers = Object.entries(S).flatMap(([f, s]) => Array(count(s, /\bbestK\s*\.\s*get\(/)).fill(f));
    const searchers = Object.entries(S).flatMap(([f, s]) => [...s.matchAll(/\.sailSearch\(/g)].map(m => {       // calls, never the definition
      const hs = [...s.slice(0, m.index).matchAll(/^  ([A-Za-z_$][\w$]*)\(([^)]*)\)\{/gm)]; return f === ENG && hs.length ? hs[hs.length - 1][1] : f; }));
    const plan = method(eng, "sailPlan"), flee = method(eng, "flee"), turn = method(eng, "takeTurn");
    const human = fnBody(flow, "export async function humanTurn("), act = fnBody(flow, "export async function humanAct("), bot = fnBody(flow, "export async function botTurn(");
    const pick = fnBody(flow, "export function pickCell(");
    return [
      [!pathers.length, `sailPath is still asked for a route in ${pathers.join(", ")}`],
      [!!sailTo && walkers.length === 1 && /bestK\s*\.\s*get\(/.test(sailTo) && /this\.sailSearch\(\s*p\s*,\s*\{\s*throughRim\s*:\s*true\s*\}\s*\)/.test(sailTo),
        `the sail search's route is walked ${walkers.length} time(s) (${walkers.join(", ")}), or Game.sailTo does not walk it from ONE search with the trade winds allowed`],
      [searchers.length === 2 && searchers.includes("sailStates") && searchers.includes("sailTo"), `the sail search is asked by ${searchers.join(", ")} — only sailStates and sailTo may ask it`],
      [/appState\.game\.sailTo\(\s*player\s*,\s*dest\s*\)/.test(human), "humanTurn's sail does not go through Game.sailTo"],
      [/appState\.game\.sailTo\(\s*player\s*,\s*dest\s*\)/.test(act), "humanAct's Move instead does not go through Game.sailTo"],
      [/\bg\.sailPlan\(\s*player\s*,\s*plan\s*\)/.test(bot) && /this\.sailPlan\(\s*p\s*,\s*plan\s*\)/.test(turn), "a bot's sail (botTurn on screen, takeTurn headless) does not go through Game.sailPlan"],
      [count(plan, /this\.sailTo\(/) === 2 && /this\.sailTo\(\s*p\s*,\s*plan\.via\s*\)/.test(plan) && /this\.sailTo\(\s*p\s*,\s*this\.stepToward\(/.test(plan) && !/sailStates\(|sailChoices\(|\.has\(|\.pos\s*=(?!=)/.test(plan),
        "Game.sailPlan does not sail the ride's square and the step through sailTo, or checks or writes a square itself"],
      [/this\.sailTo\(\s*def\s*,\s*dest\s*,/.test(flee), "Game.flee does not sail through Game.sailTo"],
      [!!pick && !/\bcells\s*\.\s*(?:some|find|findIndex|includes|indexOf|filter)\(/.test(pick), "pickCell tests a square against the offered squares itself — the check is Game.sailTo's, for every square"],
    ];
  });
  // 3. NO SHIP'S SQUARE WRITTEN BESIDE IT
  rule(2, () => {
    const ALLOWED = ["constructor", "sailTo", "tradewind", "stormStep", "rimEscape", "turnsToWin3If"];
    const engWriters = [...eng.matchAll(/\.pos\s*=(?!=)/g)].map(m => { const hs = [...eng.slice(0, m.index).matchAll(/^  ([A-Za-z_$][\w$]*)\(([^)]*)\)\{/gm)]; return hs.length ? hs[hs.length - 1][1] : "?"; });
    const strays = engWriters.filter(n => !ALLOWED.includes(n));
    const outside = Object.entries(S).filter(([f]) => !f.startsWith("src/engine/")).flatMap(([f, s]) => [...s.matchAll(/[\w$.\]]*\.pos\s*=(?!=)[^;]*/g)].map(m => [f, m[0].replace(/\s+/g, "")]));
    const MIRROR = [[ORCH, /^player\.pos=Array\.isArray\(s\.pos\)\?\[\.\.\.s\.pos\]:player\.pos$/], [UTIL, /^s\.pos=\[0,0\]\}\)$|^s\.pos=\[0,0\]$/]];
    const wrong = outside.filter(([f, t]) => !MIRROR.some(([mf, re]) => mf === f && re.test(t)));
    const consume = fnBody(orch, "export async function consumeEvent(");
    return [
      [!strays.length && engWriters.filter(n => n === "sailTo").length === 1, `the engine writes a ship's square in ${strays.join(", ") || "(sailTo missing)"} — a sail's square is written only by sailTo`],
      [!wrong.length && /player\.pos=Array\.isArray\(s\.pos\)/.test(consume.replace(/\s+/g, "")), `a ship's square is written outside the engine other than from an event's snapshot: ${wrong.map(([f, t]) => `${f}: ${t}`).join("; ")}`],
    ];
  });
  // 4. BEHAVIOURAL
  rule(3, () => behaviour(eng));
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = ["one recorder of a sail", "one search, one check, every mover through it", "no ship's square written beside it", "behavioural: posed boards, a bot's ride, a flight, headless voyages"];
const real = rules(files);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  rule ${i + 1}: ${NAMES[i]}${r.ok ? "" : " — " + r.bad.join("; ")}`));

/* RED-PROOF: each mutant is the real source broken the way a rule guards against; every rule it names must go red. */
const broken = (file, from, to) => { if (!files[file] || !files[file].includes(from)) return null; return { ...files, [file]: files[file].replace(from, to) }; };
const MUTANTS = [
  ["Game.sailTo searching without the trade winds (the old bot route request)",
    broken(ENG, "this.sailSearch(p,{throughRim:true});\n    let cur=bestK", "this.sailSearch(p,{throughRim:false});\n    let cur=bestK"), [3]],
  ["the old humanTurn sail lines pasted back (its own route, its own square, its own record)",
    broken(FLOW, "    if(dest&&appState.game.sailTo(player,dest)){\n      player.justDocked=false;\n",
      "    if(dest){\n      const fromSail=[...player.pos];\n      const routeSail=[fromSail,...appState.game.sailPath(player,dest,{throughRim:true})];\n      player.pos=dest;player.justDocked=false;const evSail=appState.game.ev({t:\"sail\",p:player.idx,route:routeSail});\n"), [0, 1, 2]],
  ["Game.flee writing its own square again, beside sailTo",
    broken(ENG, "    const moved=this.sailTo(def,dest,flight);\n", "    const moved=dest?(def.pos=dest):null;\n"), [1, 2, 3]],
  ["stepToward writing the bot's square itself again",
    broken(ENG, "    if(bestDist>=cur)return null;\n    return best;\n", "    if(bestDist>=cur)return null;\n    p.pos=[...best];return best;\n"), [2]],
  ["sailPlan checking the ride's square with a search of its own again",
    broken(ENG, "    return (plan.via&&this.sailTo(p,plan.via))||", "    if(plan.via&&this.sailStates(p,{throughRim:true}).has(plan.via[0]+\",\"+plan.via[1]))return this.sailTo(p,plan.via);\n    return "), [1]],
  ["pickCell checking a replayed square against the offered squares again",
    broken(FLOW, "      return Promise.resolve(rec==null?null:rec);", "      if(rec==null||!(cells&&cells.some(c=>c[0]===rec[0]&&c[1]===rec[1])))return Promise.resolve(null);\n      return Promise.resolve(rec);"), [1]],
  ["the guest's mirror copying a square from somewhere other than the snapshot",
    broken(ORCH, "player.pos=Array.isArray(s.pos)?[...s.pos]:player.pos;", "player.pos=Array.isArray(s.pos)?[...s.pos]:player.pos;if(e.t===\"sail\"&&e.p===i&&e.dest)player.pos=e.dest;"), [2]],
];
let proofOk = true;
for (const [what, mutant, idx] of MUTANTS) {
  const res = mutant ? rules(mutant, idx) : null;
  const red = !!res && idx.every(i => res[i].ok === false);
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${idx.map(i => i + 1).join(", ")}): ${what} ${red ? "goes red" : mutant ? `STAYS GREEN on rule(s) ${idx.filter(i => res[i].ok !== false).map(i => i + 1).join(", ")} — the gate cannot see it` : "could not be built (the source moved — re-anchor)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — a ship sails in one place: Game.sailTo checks the square and records the route, for every captain; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
