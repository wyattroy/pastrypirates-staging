#!/usr/bin/env node
/* WHAT A SPOKEN HAIL COSTS THE CAPTAIN WHO MADE IT — ONE RULE, FOR EVERY CAPTAIN WHO HAILS.
   Architecture item 14 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   HIS CALL (relayed by Mac: Dev, 2026-09-17): a hail put to the table ENDS THE TURN, struck or refused, everywhere —
   docs/TRADE-SYSTEM.md "A trade is one captain's turn ACTION"; rules.html "Ye see every answer together, then take one or walk away."
   THE FAULT IT HOLDS SHUT: it was decided in three places that disagreed. The simulator's turn (Game.takeTurn) ended only on a STRUCK
   deal — `if(plan.type==="trade"&&this.tryTrade(p))return;` — so a refused bot went on to dock or muse in the same turn: measured over
   150 voyages, 114 of 264 hails struck no deal and every one of them then docked (19) or mused (95); the rules audit counted 195 of 416
   in 200. A live bot (botTurn) ended its turn when anybody answered, but docked or mused after a hail nobody answered; a person
   (humanAct) always ended it. The bot ladder, the economy and the guarded hails-per-game number were all measured on the generous copy.
   NOW: every hail runner — Game.tryTrade (the simulator), botOpenTradeLive (a bot on screen), humanTrade (a person) — hands back
   {spoken, struck}, and the one rule, Game.hailEndsTurn, says what `spoken` costs. A trade that was never spoken (nothing worth
   offering from where the ship ended up; a person backing out of the picker) costs nothing: a bot still works the berth or muses, a
   person is back at the menu.
   THE RULES (each red-proofed below, against a mutant of the real source built in memory):
     1. ONE RULE — Game.hailEndsTurn is written once, reads the hail's `spoken` (never `struck`), and nothing else in src reads `.spoken`.
     2. EVERY TURN ASKS IT — the simulator's turn, botTurn and humanAct hand their runner's result straight to hailEndsTurn, and every
        call of tryTrade / botOpenTradeLive / humanTrade in src is one of those three.
     3. EVERY HAIL SAYS WHETHER IT WAS SPOKEN — the three runners never return a bare value: {spoken:false,…} only before their
        `openoffer` is recorded, {spoken:true,…} on every return after it.
     4. BEHAVIOURAL — 10 simulator voyages (trade_offer_measure's seating and seeds), the engine's OWN takeTurn / tryTrade /
        hailEndsTurn text, real or mutant, compiled onto a real Game: every `openoffer` — the ones that strike no deal included — is
        followed by no dock, muse or sail by that captain in the same turn; tryTrade's `spoken` is exactly whether it recorded an
        `openoffer`; and a trade plan that was never spoken still docks or muses. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { man } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const ENG = "src/engine/index.js", FLOW = "src/ui/flow.js";
/* WHY 10 VOYAGES (item 14 follow-up, 2026-09-17; it was 50, ~17 s of every npm test). A mutant plays exactly like the real tree
   until its first refused hail (or first never-spoken trade plan), so it goes red whenever the real tree's voyages hold one — and
   the vacuity check below turns the REAL tree red if they hold none. Measured on 5 seed bases (7919, 104729, 1299709, 15485863,
   179424673): 3 voyages is the fewest that catch the old simulator line on all five; 47% of voyages hold no refused hail, and the
   longest dry run seen in 200 was 5. 10 is the fewest where the WORST base still holds 5 refused hails, so an engine change that
   reshuffles these seeds is ~0.05% likely (0.47^10) to leave the gate vacuous. */
const VOYAGES = 10, STRATS = ["pirate", "trader", "balanced", "rusher"];

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

/* The engine's own method text, real or mutant, compiled so the behavioural rule runs what the SOURCE says. */
const STEPS = ["takeTurn", "tryTrade", "hailEndsTurn"];
function compile(eng) {
  const M = {};
  for (const name of STEPS) {
    const m = eng.match(methodRe(name));
    if (!m) throw new Error(`Game.${name} is missing`);
    const inner = bodyAt(eng, m.index).slice(m[0].length, -1);
    M[name] = new Function("man", `return function(${m[1]}){${inner}}`)(man);
  }
  return M;
}

function textRules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = S[ENG], flow = S[FLOW], src = Object.entries(S);
  const out = [], rule = checks => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };

  // 1. ONE RULE
  {
    const defs = src.flatMap(([f, s]) => Array(count(s, /^\s*(?:(?:export\s+)?(?:async\s+)?function\s+)?hailEndsTurn\s*\([^)]*\)\s*\{/m)).fill(f));
    const rule1 = method(eng, "hailEndsTurn");
    const readers = src.flatMap(([f, s]) => Array(count(s, /\.spoken\b/)).fill(f));
    rule([
      [defs.length === 1 && !!rule1, `hailEndsTurn is written ${defs.length} time(s) (${defs.join(", ") || "none"}) — it must be once, on Game`],
      [/\.spoken\b/.test(rule1) && !/\.struck\b/.test(rule1), "Game.hailEndsTurn does not decide on whether the hail was SPOKEN (it must read .spoken, and never .struck)"],
      [readers.length === count(rule1, /\.spoken\b/), `something besides Game.hailEndsTurn reads whether a hail was spoken (${readers.length - count(rule1, /\.spoken\b/)} extra .spoken read(s) in ${[...new Set(readers)].join(", ")})`],
    ]);
  }
  // 2. EVERY TURN ASKS IT
  {
    const turn = method(eng, "takeTurn"), bot = fnBody(flow, "export async function botTurn("), act = fnBody(flow, "export async function humanAct(");
    const calls = (name, def) => src.reduce((n, [, s]) => n + count(s, new RegExp(`\\b${name}\\(`)), 0) - src.reduce((n, [, s]) => n + count(s, def), 0);
    const wrapped = name => src.reduce((n, [, s]) => n + count(s, new RegExp(`\\bhailEndsTurn\\(\\s*(?:await\\s+)?(?:this\\.)?${name}\\(`)), 0);
    const runners = [["tryTrade", /^\s*tryTrade\s*\(\s*\w+\s*\)\s*\{/m], ["botOpenTradeLive", /function\s+botOpenTradeLive\s*\(/], ["humanTrade", /function\s+humanTrade\s*\(/]];
    const stray = runners.map(([n, d]) => [n, calls(n, d), wrapped(n)]).filter(([, c, w]) => c !== 1 || w !== 1);
    rule([
      [/plan\.type\s*===\s*"trade"\s*&&\s*this\.hailEndsTurn\(\s*this\.tryTrade\(\s*p\s*\)\s*\)\s*\)\s*return\s*;/.test(turn), "the simulator's turn (Game.takeTurn) does not end on this.hailEndsTurn(this.tryTrade(p))"],
      [/plan\.type\s*===\s*"trade"\s*&&\s*g\.hailEndsTurn\(\s*await\s+botOpenTradeLive\(\s*player\s*\)\s*\)\s*\)\s*return\s*;/.test(bot), "botTurn does not end on g.hailEndsTurn(await botOpenTradeLive(player))"],
      [/if\s*\(\s*!\s*g\.hailEndsTurn\(\s*await\s+humanTrade\(\s*player\s*\)\s*\)\s*\)\s*await\s+humanAct\(\s*player\s*,\s*sailCtx\s*\)/.test(act), "humanAct does not go back to the menu only when !g.hailEndsTurn(await humanTrade(player))"],
      [stray.length === 0, `a hail runner's result is read outside hailEndsTurn: ${stray.map(([n, c, w]) => `${n} called ${c} time(s), ${w} through hailEndsTurn`).join("; ")}`],
    ]);
  }
  // 3. EVERY HAIL SAYS WHETHER IT WAS SPOKEN
  {
    const bodies = [["Game.tryTrade", method(eng, "tryTrade")], ["botOpenTradeLive", fnBody(flow, "export async function botOpenTradeLive(")], ["humanTrade", fnBody(flow, "export async function humanTrade(")]];
    const bad = [];
    for (const [name, b] of bodies) {
      const k = b.search(/t\s*:\s*"openoffer"/);
      if (!b || k < 0) { bad.push(`${name}: no openoffer recorded`); continue; }
      const rets = [...b.matchAll(/\breturn\b([^;]*);/g)].map(m => ({ at: m.index, x: m[1].trim() }));
      for (const r of rets) {
        if (!r.x.startsWith("{")) bad.push(`${name}: "return ${r.x.slice(0, 40)}" is not a {spoken, struck}`);
        else if (r.at < k && /\bspoken\s*:\s*true\b/.test(r.x)) bad.push(`${name}: says spoken before a word was said ("return ${r.x.slice(0, 40)}")`);
        else if (r.at > k && !/^\{\s*spoken\s*:\s*true\s*,\s*struck\s*:/.test(r.x)) bad.push(`${name}: after its openoffer, "return ${r.x.slice(0, 40)}" does not say spoken:true`);
      }
      if (!rets.some(r => r.at < k && /^\{\s*spoken\s*:\s*false\s*,\s*struck\s*:\s*false\s*\}$/.test(r.x))) bad.push(`${name}: no {spoken:false,struck:false} for a trade that was never spoken`);
      if (!rets.some(r => r.at > k)) bad.push(`${name}: returns nothing after its openoffer`);
    }
    rule([[bad.length === 0, bad.join(" | ")]]);
  }
  return out;
}

/* 4. BEHAVIOURAL — VOYAGES voyages, the engine's own text */
function behaviourRule(files) {
  let M;
  try { M = compile(stripComments(files[ENG])); } catch (e) { return { ok: false, bad: [`the engine's turn could not be compiled (${e.message})`] }; }
  const bad = [], seen = { hails: 0, noDeal: 0, unspoken: 0 };
  try {
    for (let i = 0; i < VOYAGES && bad.length < 3; i++) {
      const g = new Game(roundCfg(STRATS), 7919 + i * 101, true);
      Object.assign(g, M);
      const tries = [];
      g.tryTrade = function (p) {
        const n0 = this.events.length, r = M.tryTrade.call(this, p);
        tries.push({ p: p.idx, at: this.events.length, said: this.events.slice(n0).some(e => e.t === "openoffer"), r });
        return r;
      };
      g.play();
      const E = g.events;
      const restOfTurn = from => { const out = []; for (let k = from; k < E.length && E[k].t !== "turn"; k++) out.push(E[k]); return out; };
      const acts = (evs, who) => evs.filter(e => (e.t === "dock" || e.t === "pass" || e.t === "sail") && e.p === who).map(e => e.t);
      E.forEach((e, j) => {
        if (e.t !== "openoffer") return;
        seen.hails++;
        const rest = restOfTurn(j + 1), struck = rest.some(x => x.t === "trade" && x.a === e.p), then = acts(rest, e.p);
        if (!struck) seen.noDeal++;
        if (then.length && bad.length < 3) bad.push(`voyage ${i}: captain ${e.p}'s hail ${struck ? "struck a deal" : "struck no deal"} and then ${then.join(", ")} in the same turn`);
      });
      for (const t of tries) {
        if (!t.r || typeof t.r !== "object" || t.r.spoken !== t.said) { if (bad.length < 3) bad.push(`voyage ${i}: tryTrade returned ${JSON.stringify(t.r)} for a hail that ${t.said ? "WAS" : "was NOT"} put to the table`); continue; }
        if (t.said) continue;
        seen.unspoken++;
        const then = acts(restOfTurn(t.at), t.p).filter(x => x !== "sail");
        if (!then.length && bad.length < 3) bad.push(`voyage ${i}: captain ${t.p}'s trade was never spoken, and the turn ended without the dock or muse it is free to take`);
      }
    }
  } catch (e) { bad.push(`a voyage threw: ${e.message}`); }
  if (!bad.length && (!seen.noDeal || !seen.unspoken)) bad.push(`vacuous: ${VOYAGES} voyages held ${seen.noDeal} hail(s) that struck no deal and ${seen.unspoken} unspoken trade plan(s) — the rule was never exercised`);
  return { ok: !bad.length, bad, seen };
}

const TEXT = ["ONE RULE — Game.hailEndsTurn, written once, decides on `spoken`; nothing else reads it",
  "EVERY TURN ASKS IT — the simulator's turn, botTurn and humanAct end (or go on) only through hailEndsTurn",
  "EVERY HAIL SAYS WHETHER IT WAS SPOKEN — tryTrade, botOpenTradeLive and humanTrade return {spoken, struck}"];
const run = (fs_, behaviour) => { const t = textRules(fs_); return behaviour ? [...t, behaviourRule(fs_)] : t; };

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = run(files, true);
real.forEach((r, k) => {
  const label = k < 3 ? TEXT[k] : `BEHAVIOURAL, ${VOYAGES} simulator voyages — every hail put to the table ends that captain's turn (${r.seen ? `${r.seen.hails} hails, ${r.seen.noDeal} struck no deal` : "?"}); a trade never spoken still docks or muses (${r.seen ? r.seen.unspoken : "?"})`;
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${label}${r.ok ? "" : `\n        ${r.bad.join("\n        ")}`}`);
});

/* ---------- RED-PROOF: each rule must go red on a copy of the real source broken the way it guards against ---------- */
const put = (file, from, to) => (files[file] && files[file].includes(from)) ? { ...files, [file]: files[file].replace(from, to) } : null;
const SIM = 'if(plan.type==="trade"&&this.hailEndsTurn(this.tryTrade(p)))return;';
const RULE = "return !!(hail&&hail.spoken);";
const MUTANTS = [
  ["the spec's red-proof: the simulator's old `if(plan.type===\"trade\"&&this.tryTrade(p))return;` back", put(ENG, SIM, 'if(plan.type==="trade"&&this.tryTrade(p))return;'), [1, 3]],
  ["the old rule's current spelling: the simulator ending its turn only on `.struck`", put(ENG, SIM, 'if(plan.type==="trade"&&this.tryTrade(p).struck)return;'), [1, 3]],
  ["the one rule deciding on struck instead of spoken", put(ENG, RULE, "return !!(hail&&hail.struck);"), [0, 3]],
  ["botTurn deciding for itself again: `(await botOpenTradeLive(player)).struck`", put(FLOW, "g.hailEndsTurn(await botOpenTradeLive(player))", "(await botOpenTradeLive(player)).struck"), [1]],
  ["humanAct reading `.spoken` itself", put(FLOW, "if(!g.hailEndsTurn(await humanTrade(player)))", "if(!(await humanTrade(player)).spoken)"), [0, 1]],
  ["botOpenTradeLive's `return responses.length>0` back (a hail nobody answered is free again)", put(FLOW, "  return {spoken:true,struck:hail.struck};", "  return responses.length>0;"), [2]],
  ["humanTrade calling a Back out of the picker a spoken hail", put(FLOW, 'if(want==="__back__"||want==null)return {spoken:false,struck:false};', 'if(want==="__back__"||want==null)return {spoken:true,struck:false};'), [2]],
  ["Game.tryTrade saying nothing was spoken after it hailed", put(ENG, "return {spoken:true,struck:this.resolveHail(", "return {spoken:false,struck:this.resolveHail("), [2, 3]],
];
let proofOk = true;
for (const [what, mutant, idxs] of MUTANTS) {
  const res = mutant ? run(mutant, idxs.includes(3)) : null;
  const red = !!res && idxs.every(k => res[k] && !res[k].ok);
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `turns rule${idxs.length > 1 ? "s" : ""} ${idxs.map(k => k + 1).join(" and ")} red` : mutant ? `STAYS GREEN on rule(s) ${idxs.filter(k => res[k] && res[k].ok).map(k => k + 1).join(", ")} — the gate cannot see it` : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}` : `\nPASS — a hail put to the table ends the turn by one rule, for the simulator, a bot on screen and a person; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
