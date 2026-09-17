#!/usr/bin/env node
/* WHERE A CAPTAIN MAY SAIL THIS TURN IS ONE ANSWER — THE SQUARES THE CHOOSER IS OFFERED AND THE SQUARES EVERY OTHER SCREEN FRAMES.
   Architecture item 18, 2026-09-17 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural".
   THE FAULT IT HOLDS SHUT: two places decided it. The captain choosing was given gold squares from reachable() (ui/flow.js) —
   the sail search WITH the trade winds' rim; every screen watching that turn had its camera frame the squares camFitSail
   (ui/stage.js) got from Game.reachableFrom — the same search WITHOUT the rim — under a comment saying the two "agree by
   construction". Measured on 40 seeded boards: from 3,430 of 4,432 legal sea squares the chooser was offered rim squares the
   watchers' frame left out (18,267 squares), and on 3,296 the framed rectangle itself was smaller. Posed on a phone watching a bot
   sail from beside the current: 15 of its 16 choices framed, the rim square under the top bar cut off; after, 16 of 16.
   Now Game.sailChoices (engine) is the one answer; reachable(), camFitSail and Game.fleeSquares all ask it.
   RULES (each run against deliberately broken copies below, built in memory from the real source):
     1. THE ONE ANSWER — Game.sailChoices is the sail search with the rim allowed, and no other place in src/ builds the list of
        rim-allowed squares itself (Game.fleeSquares asks sailChoices).
     2. EVERY SCREEN ASKS IT — reachable() and camFitSail's no-squares frame both call sailChoices, and no screen file (anything
        outside src/engine) runs a sail search of its own: no sailStates(, sailSearch( or reachableFrom( call.
     3. POSED BOARDS — reachable() and camFitSail() compiled from the source text (real or broken) and Game.sailChoices /
        fleeSquares compiled onto a real Game: for every legal sea square on seeded boards, the squares a watching screen's camera
        frames (nothing drawn) are exactly the chooser's gold squares plus the captain's own square; the chooser's own screen (its
        squares drawn) frames the same set; sailChoices is the rim-allowed search square for square; the flee squares equal it.
        The rule must reach its subject: at least one pose must offer rim squares, or it cannot fail and says so.
   WHAT IS NOT THIS FACT, named so nobody "converges" it: a BOT's ordinary-move list (Game.reachableFrom, no rim, with each ride
   weighed as the head of the current in planTurnV3; strikeFrom) and a bot's ride legality (sailPlan) are how a bot CHOOSES —
   architecture item 7's route work, not where a captain may sail. sailSelfCheck (ui/flow.js) re-derives the legal set on purpose,
   as an independent witness, and runs no sail search. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const ENG = "src/engine/index.js", FLOW = "src/ui/flow.js", STAGE = "src/ui/stage.js";

/* A body by brace matching, after the whole parameter list. */
function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const methodRe = name => new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m");       // an engine METHOD definition, never a call
const method = (eng, name) => { const m = eng.match(methodRe(name)); return m ? bodyAt(eng, m.index) : ""; };
const fnBody = (src, head) => bodyAt(src, src.indexOf(head));
const count = (s, re) => (s.match(new RegExp(re.source, "g")) || []).length;
const RIM_LIST = /sailStates\([^)]*throughRim\s*:\s*true[^)]*\)\s*\.keys\(\)\s*\]|Array\.from\([^;]*sailStates\([^)]*throughRim\s*:\s*true/;
const SEARCH = /\b(?:sailStates|sailSearch|reachableFrom)\s*\(/;
const SEEDS = [1, 2, 3, 4, 5, 6];

function rules(files) {
  const S = Object.fromEntries(Object.entries(files).map(([f, s]) => [f, stripComments(s)]));
  const eng = S[ENG], out = [];
  const rule = (checks) => { const bad = checks.filter(c => !c[0]).map(c => c[1]); out.push({ ok: !bad.length, bad }); };
  const choices = method(eng, "sailChoices"), flee = method(eng, "fleeSquares");
  const reach = fnBody(S[FLOW], "export function reachable("), cam = fnBody(S[STAGE], "function camFitSail(");

  // 1. THE ONE ANSWER
  {
    const elsewhere = Object.entries(S).map(([f, s]) => [f, count(f === ENG ? s.replace(choices, "") : s, RIM_LIST)]).filter(([, n]) => n);
    rule([
      [!!choices, "Game.sailChoices is missing from the engine"],
      [/this\.sailStates\(\s*p\s*,\s*\{\s*throughRim\s*:\s*true\s*\}\s*\)/.test(choices), "Game.sailChoices is not the sail search with the rim allowed"],
      [!elsewhere.length, `the list of rim-allowed squares is built outside Game.sailChoices: ${elsewhere.map(([f, n]) => `${f} (${n})`).join(", ")}`],
      [/this\.sailChoices\(def\)/.test(flee), "Game.fleeSquares does not ask Game.sailChoices"],
    ]);
  }
  // 2. EVERY SCREEN ASKS IT
  {
    const screens = Object.entries(S).filter(([f]) => !f.startsWith("src/engine/")).filter(([, s]) => SEARCH.test(s)).map(([f]) => f);
    rule([
      [!!reach && /\.sailChoices\(\s*player\s*\)/.test(reach), "reachable() (the chooser's gold squares) does not ask Game.sailChoices"],
      [!!cam && /\bg\.sailChoices\(\s*who\s*\)/.test(cam), "camFitSail (the frame on a screen with no squares drawn) does not ask Game.sailChoices"],
      [!screens.length, `a screen runs a sail search of its own (sailStates / sailSearch / reachableFrom): ${screens.join(", ")}`],
    ]);
  }
  // 3. POSED BOARDS
  {
    let res;
    try { res = posed(eng, reach, cam); } catch (e) { res = { err: `the posed boards threw: ${e.message}` }; }
    out.posed = res;
    rule(res.err ? [[false, res.err]] : [
      [res.rimPoses > 0, `no pose offered a rim square (${res.poses} poses) — this rule cannot reach its subject`],
      [res.watcher === 0, `on ${res.watcher} of ${res.poses} posed squares a watching screen's frame is not the chooser's squares (first: ${res.first})`],
      [res.own === 0, `on ${res.own} of ${res.poses} posed squares the chooser's own frame is not its squares`],
      [res.rim === 0, `on ${res.rim} of ${res.poses} posed squares Game.sailChoices is not the rim-allowed sail search`],
      [res.flee === 0, `on ${res.flee} of ${res.poses} posed squares the flee squares are not Game.sailChoices`],
    ]);
  }
  return out;
}

function posed(eng, reachSrc, camSrc) {
  const compileMethod = name => { const m = eng.match(methodRe(name)); if (!m) throw new Error(`Game.${name} is missing`);
    const b = bodyAt(eng, m.index); return new Function(`return function(${m[1]}){${b.slice(m[0].length, -1)}}`)(); };
  const M = { sailChoices: compileMethod("sailChoices"), fleeSquares: compileMethod("fleeSquares") };
  if (!reachSrc || !camSrc) throw new Error("reachable() or camFitSail() could not be found");
  const reachable = new Function("appState", `${reachSrc.replace(/^export\s+/, "")}; return reachable;`);
  const camFitSail = new Function("S", "appState", "document", "camFitCells", `${camSrc}; return camFitSail;`);
  const key = c => c[0] + "," + c[1], same = (a, b) => a.size === b.size && [...a].every(k => b.has(k));
  const r = { poses: 0, rimPoses: 0, watcher: 0, own: 0, rim: 0, flee: 0, first: "" };
  for (const seed of SEEDS) {
    const g = new Game(roundCfg(["human", "pirate", "trader", "balanced"]), seed, false);
    Object.assign(g, M);
    const p = g.players[0], appState = { game: g, mySeat: 0 }, n = g.cfg.grid;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const c = [x, y];
      if (g.blocked(c) || g.isIsland(c) || g.isHome(c) || g.onRim(c)) continue;
      p.pos = c; r.poses++;
      const gold = reachable(appState)(p);
      if (gold.some(q => g.onRim(q))) r.rimPoses++;
      const chooser = new Set([...gold.map(key), key(c)]);
      let framed = null;
      camFitSail({}, appState, { querySelectorAll: () => [], querySelector: () => null }, cells => { framed = new Set(cells.map(key)); })(0);
      if (!framed || !same(framed, chooser)) { r.watcher++; if (!r.first) r.first = `seed ${seed} square ${key(c)}: offered ${chooser.size}, framed ${framed ? framed.size : "nothing"}`; }
      const drawn = [...gold, c].map(q => ({ dataset: { gx: q[0], gy: q[1] } }));
      let own = null;
      camFitSail({}, appState, { querySelectorAll: sel => sel === ".sailCell" ? drawn : [], querySelector: () => null }, cells => { own = new Set(cells.map(key)); })(0);
      if (!own || !same(own, chooser)) r.own++;
      if (!same(new Set(g.sailChoices(p).map(key)), new Set(g.sailStates(p, { throughRim: true }).keys()))) r.rim++;
      if (!same(new Set(g.fleeSquares(p).map(key)), new Set(g.sailChoices(p).map(key)))) r.flee++;
    }
  }
  return r;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = ["the one answer: Game.sailChoices is the sail search with the rim allowed, and nothing else builds that list (fleeSquares asks it)",
  "every screen asks it: reachable() and camFitSail call Game.sailChoices, and no screen runs a sail search of its own",
  "posed boards: a watching screen frames exactly the squares the chooser is offered, the chooser's own frame too, and the flee squares are the same answer"];
const real = rules(files);
if (real.posed && !real.posed.err) console.log(`sail_frame_same_squares — ${real.posed.poses} posed sea squares on ${SEEDS.length} seeded boards, ${real.posed.rimPoses} of them offering trade-wind squares`);
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${NAMES[i]}${r.ok ? "" : "\n          " + r.bad.join("\n          ")}`));

/* RED-PROOF: each mutant is the real source with ONE copy put back, and the rule(s) named must go red. */
const broken = (file, from, to) => files[file].includes(from) ? { ...files, [file]: files[file].replace(from, to) } : null;
const MUTANTS = [
  [[2, 3], "camFitSail back on reachableFrom (the frame without the rim) — the fault this item removed",
    broken(STAGE, "if (!drawn.length && who && typeof g.sailChoices === \"function\"){\n    try { cells = g.sailChoices(who)", "if (!drawn.length && who && typeof g.reachableFrom === \"function\"){\n    try { cells = g.reachableFrom(who)")],
  [[2], "reachable() building the squares itself again (the same squares today — a copy waiting to drift)",
    broken(FLOW, "return appState.game.sailChoices(player);", "return [...appState.game.sailStates(player,{throughRim:true}).keys()].map(k=>k.split(\",\").map(Number));")],
  [[1, 3], "the rim taken out of Game.sailChoices",
    broken(ENG, "sailChoices(p){return [...this.sailStates(p,{throughRim:true}).keys()]", "sailChoices(p){return [...this.sailStates(p,{}).keys()]")],
  [[1], "Game.fleeSquares running its own search again",
    broken(ENG, "return this.sailChoices(def);", "return [...this.sailStates(def,{throughRim:true}).keys()].map(k=>k.split(\",\").map(Number));")],
];
let proofOk = true;
for (const [ns, what, mutant] of MUTANTS) {
  const res = mutant ? rules(mutant) : null;
  const red = !!res && ns.every(n => !res[n - 1].ok);
  if (process.env.VERBOSE && res) ns.forEach(n => console.log(`          rule ${n}: ${res[n - 1].bad.join(" | ")}`));
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${ns.join(" + ")}): ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) broken${proofOk ? "" : ", and the red-proof did not hold"}`
  : `\nPASS — where a captain may sail is one engine answer, and a watching screen frames exactly the squares the chooser is offered; ${real.length} rules, ${MUTANTS.length} mutants, each red`);
process.exit(fails || !proofOk ? 1 : 0);
