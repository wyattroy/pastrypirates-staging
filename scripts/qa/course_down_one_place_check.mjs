#!/usr/bin/env node
/* THE DOTTED COURSE COMES DOWN IN ONE PLACE: THE ONE EVENT CONSUMER, WHEN A TURN BEGINS OR A BOAT MOVES.
   Architecture item 12, 2026-09-17. The fact, in the game's words: the dotted course is shown only on its captain's turn — Wyatt,
   2026-09-10: "the dotted line is ONLY visible on the player's turn, and auto updates with their current location each turn"; and
   2026-09-11: "It should disappear the moment your boat starts animatedly sailing".
   It was decided in two places: takeTurn (ui/flow.js) cleared it at the top of every turn — but takeTurn runs only on the machine
   running the game, so a crew GUEST's course was never cleared by it — and consumeEvent (orchestrator.js) cleared it, on every
   screen, only on an event that moves a boat. Measured before the change, a real two-window room: a guest (parrot on) who stayed
   put kept its dotted line on the sea into the next captain's turn, until somebody sailed; its recipe picker's line stayed up
   into the host's first turn the same way, until the host sailed.
   RULES (every one runs against deliberately broken copies below — a gate that cannot fail proves nothing):
     1. no turn function clears the course: takeTurn, humanTurn and botTurn call neither forgetCourse nor clearCourse
     2. consumeEvent clears it on a `turn` and on any event that moves a boat — posed events: a turn, a sail, a flee (any event
        carrying a route), a trade-wind ride all clear it; a dock, a muse, the turnOrder draw do not; the answer is the same on a
        host and a guest, for a local captain and a remote one — and before the consumer's first await, so it is gone the moment
        the boat starts to move, not when it arrives.
        EXCEPT WHILE THIS SCREEN'S OWN SAIL PROMPT IS OPEN (sailWindowOpen, ui/flow.js — the gold squares on the sea): then nothing
        clears it. Measured while building this gate, a real crew room, the guest a phone: the guest's prompt drew its course,
        its own `turn` event was drawn 1.0 s later (the prompt and the feed are two wires, and the drain was still walking a
        boat), and a bare `turn` test took the course off the sea with the squares still up. A course an open prompt drew IS the
        turn being played.
     3. nothing else takes the course down on a turn or a move. Every other caller is named here, each a DIFFERENT rule:
          · renderPickPrompt (ui/flow.js), twice, and only with the parrot OFF — the answered prompt's teardown and the draw's
            `else`: they forget the REQUEST so the parrot toggle cannot bring back a course for a sail already chosen (Wyatt,
            2026-09-07 item 9, the toggle restores; 2026-09-09, with the parrot on the line lasts the turn)
          · clearGlow (ui/stage.js) — the recipe picker's teardown
          · the parrot toggle (ui/stage.js) — clearCourse, which keeps the request so the toggle can restore it
        and nothing outside course.js reaches the course's drawing (.pp4Course) directly.
   If a new caller is a genuinely different rule, name it in rule 3 with its reason; if it clears the course when a turn begins
   or a boat moves, it is a second copy of consumeEvent's line and belongs there. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // comments never count as code
/* A function's body: skip the whole parameter list first, then match braces. */
function body(src, head) {
  const h = src.indexOf(head); if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const count = (s, re) => (s.match(re) || []).length;
const FORGET = /\bforgetCourse\s*\(/g, CLEAR = /\bclearCourse\s*\(/g, DRAWING = /\bpp4Course\b/g;

function rules(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const flow = code(files["src/ui/flow.js"]), orch = code(files["src/orchestrator.js"]), stage = code(files["src/ui/stage.js"]);

  // 1. NO TURN FUNCTION CLEARS THE COURSE
  const turnFns = [["takeTurn", "export async function takeTurn("], ["humanTurn", "export async function humanTurn("], ["botTurn", "async function botTurn("]]
    .map(([n, h]) => [n, body(flow, h)]);
  const missing = turnFns.filter(([, b]) => !b).map(([n]) => n);
  const clearing = turnFns.filter(([, b]) => b && (count(b, FORGET) || count(b, CLEAR) || count(b, DRAWING))).map(([n]) => n);
  rule(!missing.length && !clearing.length,
    "no turn function clears the course — takeTurn, humanTurn and botTurn leave it to the one consumer",
    missing.length ? `cannot find ${missing.join(", ")} in ui/flow.js — this rule cannot see its subject`
                   : `${clearing.join(", ")} clear(s) the course itself — a second copy of the consumer's rule, on one machine only`);

  // 2. THE CONSUMER CLEARS IT ON A TURN AND ON A MOVE, ON EVERY SCREEN, BEFORE ITS FIRST AWAIT
  const consume = body(orch, "export async function consumeEvent(e){");
  const stmts = [...consume.matchAll(/if\s*\(([^;{}]*)\)\s*forgetCourse\(\s*\)\s*;/g)];
  const movesDef = consume.match(/const\s+moves\s*=\s*([^;]+);/);
  let posed = null, why = "";
  if (!consume) why = "cannot find consumeEvent in orchestrator.js";
  else if (count(consume, FORGET) !== 1 || stmts.length !== 1) why = `consumeEvent must clear the course in exactly one guarded statement (found ${count(consume, FORGET)} call(s), ${stmts.length} readable \`if(…)forgetCourse();\`)`;
  else {
    try {
      const decide = new Function("e", "appState", "decisionIsLocal", "sailWindowOpen", `${movesDef ? `const moves=${movesDef[1]};` : ""}return !!(${stmts[0][1]});`);
      const route = [[3, 3], [3, 4], [3, 5]];
      const cases = [
        [{ t: "turn", p: 1 }, true, "a turn"], [{ t: "sail", p: 1, draw: { route } }, true, "a sail"],
        [{ t: "flee", p: 1, draw: { route } }, true, "a flee (an event carrying a route)"], [{ t: "tradewind", p: 1 }, true, "a trade-wind ride"],
        [{ t: "dock", p: 1 }, false, "a dock"], [{ t: "muse", p: 1 }, false, "a muse"], [{ t: "turnOrder", order: [0, 1] }, false, "the turnOrder draw"],
        [{ t: "sail", p: 1 }, false, "a sail with no route (nothing moves on screen)"],
      ];
      const wrong = [];
      for (const [e, want0, name] of cases) for (const isHost of [true, false]) for (const local of [true, false]) for (const open of [false, true]) {
        const want = want0 && !open;   // under this screen's open gold squares, nothing clears it
        const got = decide(e, { isHost, replaying: false, mySeat: 0 }, () => local, () => open);
        if (got !== want) wrong.push(`${name} on a ${isHost ? "host" : "guest"}${local ? " (its own captain)" : ""}${open ? " with this screen's sail prompt OPEN" : ""} ${want ? "keeps" : "clears"} the course`);
      }
      posed = [...new Set(wrong)];
    } catch (err) { why = `consumeEvent's clearing statement cannot be read (${String(err.message).slice(0, 80)})`; }
  }
  const at = consume.search(FORGET), firstAwait = consume.search(/\bawait\b/);
  const early = at >= 0 && (firstAwait < 0 || at < firstAwait);
  const readsSquares = /return\s*!!\s*document\.querySelector\(\s*"\.sailCell"\s*\)/.test(body(flow, "export function sailWindowOpen("));
  rule(!why && posed && !posed.length && early && readsSquares,
    "consumeEvent clears the course on a turn and on any move, on every screen, before its first await, and never under this screen's open sail prompt — posed: turn, sail, flee, trade wind clear it; dock, muse, turnOrder do not",
    why || (posed && posed.length ? `consumeEvent's rule is wrong on posed events: ${posed.slice(0, 4).join("; ")}`
      : !early ? "consumeEvent clears the course only after an await — the course would stay up while the boat is already moving"
      : "sailWindowOpen (ui/flow.js) no longer reads whether the gold squares are on the sea"));

  // 3. EVERY OTHER CALLER IS A NAMED, DIFFERENT RULE
  const pick = body(flow, "export function renderPickPrompt(").replace(/\s+/g, " ");
  const glow = body(stage, "function clearGlow(");
  const offForms = count(pick, /if\s*\(\s*!pilotIsOn\(\)\s*\)\s*forgetCourse\(\)/g) + count(pick, /if\s*\(\s*pilotIsOn\(\)[^;]*\)\s*showCourseFor\([^;]*\);\s*else\s+forgetCourse\(\)/g);
  const stray = [];
  for (const [f, raw] of Object.entries(files)) {
    if (f === "src/ui/course.js") continue;
    const s = code(raw);
    const allowedForget = f === "src/orchestrator.js" ? 1 : f === "src/ui/flow.js" ? 2 : f === "src/ui/stage.js" ? 1 : 0;
    const allowedClear = f === "src/ui/stage.js" ? 1 : 0;
    if (count(s, FORGET) !== allowedForget) stray.push(`${f}: ${count(s, FORGET)} forgetCourse call(s), ${allowedForget} named`);
    if (count(s, CLEAR) !== allowedClear) stray.push(`${f}: ${count(s, CLEAR)} clearCourse call(s), ${allowedClear} named`);
    if (count(s, DRAWING)) stray.push(`${f}: reaches .pp4Course directly`);
  }
  if (count(pick, FORGET) !== 2 || offForms !== 2) stray.push(`renderPickPrompt: ${count(pick, FORGET)} forgetCourse call(s), ${offForms} of them the parrot-off forms`);
  if (count(glow, FORGET) !== 1) stray.push("clearGlow (the recipe picker's teardown) no longer holds stage.js's one forgetCourse");
  if (!/if\s*\(\s*on\s*\)\s*redrawCourse\(\s*\)\s*;?\s*else\s+clearCourse\(\s*\)/.test(stage)) stray.push("the parrot toggle no longer holds stage.js's one clearCourse");
  rule(!stray.length,
    "nothing else takes the course down on a turn or a move — the other callers are the named parrot-off prompt teardowns, the recipe picker's teardown and the parrot toggle",
    `the course is taken down somewhere this gate has not named: ${stray.slice(0, 4).join("; ")}`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const real = rules(files);
for (const r of real) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.text}`);

/* RED-PROOF — each mutant is the real source with one deliberate copy put back, in memory. */
const put = (file, from, to) => files[file].includes(from) ? { ...files, [file]: files[file].replace(from, to) } : null;
const FWD = "export async function takeTurn(player){\n  await passGate(player.idx);\n";
const CONSUME_LINE = `if((moves||e.t==="turn")&&!sailWindowOpen())forgetCourse();`;
const mutants = [
  ["forgetCourse(); back at the top of takeTurn (the spec's red-proof)", put("src/ui/flow.js", FWD, FWD + "  forgetCourse();\n"), [0, 2]],
  ["consumeEvent clearing on moves only (the line before this item)", put("src/orchestrator.js", CONSUME_LINE, "if(moves)forgetCourse();"), [1]],
  ["the tree before this item — both copies at once", (() => { const a = put("src/ui/flow.js", FWD, FWD + "  forgetCourse();\n"); return a && a["src/orchestrator.js"].includes(CONSUME_LINE) ? { ...a, "src/orchestrator.js": a["src/orchestrator.js"].replace(CONSUME_LINE, "if(moves)forgetCourse();") } : null; })(), [0, 1, 2]],
  ["the consumer's clear gated to the captain's own screen", put("src/orchestrator.js", CONSUME_LINE, `if((moves||e.t==="turn")&&!sailWindowOpen()&&decisionIsLocal(e.p))forgetCourse();`), [1]],
  ["a bare turn test — a late-drawn turn takes an open prompt's course off the sea (measured on a crew guest)", put("src/orchestrator.js", CONSUME_LINE, `if(moves||e.t==="turn")forgetCourse();`), [1]],
  ["sailWindowOpen no longer reading the gold squares", put("src/ui/flow.js", `return !!document.querySelector(".sailCell");`, "return false;"), [1]],
  ["the clear moved after the walk (gone on arrival, not at the start)", (() => { const o = files["src/orchestrator.js"], w = "  await animateSailRoute(e);"; return o.includes(CONSUME_LINE) && o.includes(w) ? { ...files, "src/orchestrator.js": o.replace(CONSUME_LINE, "").replace(w, w + CONSUME_LINE) } : null; })(), [1]],
  ["a second copy in the host's turn loop", put("src/orchestrator.js", "    await takeTurn(player);", "    forgetCourse();await takeTurn(player);"), [2]],
  ["botTurn clearing the drawing by hand", put("src/ui/flow.js", "async function botTurn(player){", `async function botTurn(player){document.querySelectorAll(".pp4Course").forEach(n=>n.remove());`), [0, 2]],
];
let redOk = true;
for (const [name, m, want] of mutants) {
  if (!m) { redOk = false; console.log(`  FAIL  red-proof: "${name}" could not be built — the source moved; rebuild the mutant`); continue; }
  const r = rules(m), red = want.filter(i => !r[i].ok);
  const ok = red.length === want.length;
  if (!ok) redOk = false;
  console.log(`  ${ok ? "PASS" : "FAIL"}  red-proof: ${name} ${ok ? `turns rule(s) ${want.map(i => i + 1).join(",")} red` : `LEAVES rule(s) ${want.filter(i => r[i].ok).map(i => i + 1).join(",")} GREEN`}`);
}
const fails = real.filter(r => !r.ok).length, bad = fails || !redOk;
console.log(bad ? `\nFAIL — ${fails} rule(s)${redOk ? "" : ", and a red-proof did not go red"}` : "\nPASS — the dotted course comes down in one place: the one consumer, when a turn begins or a boat moves");
process.exit(bad ? 1 : 0);
