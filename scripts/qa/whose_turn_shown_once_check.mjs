#!/usr/bin/env node
/* WHOSE TURN THE SCREEN SHOWS — ONE ANSWER, READ BY EVERY SURFACE, WRITTEN BY NOTHING.
   Architecture item 3 (.planning/ARCHITECTURE-AUDIT-2026-09-16.md), under Wyatt's ruling on "architectural" (DECISIONS.md, 2026-09-16).
   His ruling it carries (DECISIONS.md, 2026-09-16): "The top bar shows whose turn it is -- which is the active player who decided to
   attack. this does not need to change during a battle; it should not."
   THE FAULT IT HOLDS SHUT: "whose turn is it" had FOUR answers. The top bar drew a slot (appState.curSeat / stage.js S.activeSeat) that
   19 callers wrote — most of them for whoever was being ASKED, and the one event consumer for whichever seat each event named — so the
   defender's coin and every crow's-nest caller moved every screen's top bar off the attacker (and lit the ⏩ chip on the human's own
   turn). The ring, the captains-box highlight and the row order walked the event stream. The bobbing boat started on `turn` events only.
   "Check my recipe" read a flag humanTurn alone set. Measured before the fix (a posed solo phone fight, seed 202609160): the top bar
   lit the defender while the ring and the box stayed on the attacker.
   THE RULES (each red-proofed below against a mutant of the real source, built in memory; comments stripped first):
     1. THE TOP BAR reads the one helper, util.js whoseTurn() — never S.activeSeat, never a stored seat — and the ⏩ chip reads the same.
     2. THE RING, THE BOX HIGHLIGHT, THE ROW ORDER, THE BOB AND CHECK MY RECIPE read it too; whoseTurn() is the only caller of the pure
        rule (storyboard.js turnShown) and turnShown the only caller of the walk (deriveActiveSeat).
     3. NOTHING WRITES THE TURN. No applyActiveSeat, setActor, curSeat, activeTurnSeat or S.activeSeat anywhere; "who is being asked" is
        its own fact, appState.askedSeat, written only by raiseLocalPrompt; every ask() names the captain it asks as its first argument;
        the one event consumer writes neither.
     4. BEHAVIOURAL — storyboard.js's own turnShown (real or mutant) on posed streams: a fight on seat 0's turn (turn p0 … coinflip p1 …
        sidebet p2 … sidebet p3, with seat 1 being asked) shows seat 0 at every step; before the recipes are set (the recipe draft, his
        settled call that its top bar keeps what it showed) it shows the captain being asked; a baking captain's bench (bakeTurn) shows
        the baker; a finished captain holds no turn. And the engine
        records a baking captain's turn — Game.bakeTurn — for both the headless bake (bakeAttempt) and the live one (bakeTurnLive). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./lib/strip_comments.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const walk = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
const UTIL = "src/ui/util.js", STAGE = "src/ui/stage.js", BOARD = "src/ui/board.js", ORCH = "src/orchestrator.js", FLOW = "src/ui/flow.js", SB = "src/shared/storyboard.js", ENG = "src/engine/index.js";
const { Game, roundCfg } = await import(pathToFileURL(path.join(REPO, ENG)).href);

/* A body by brace matching, after the parameter list (skipped whole). */
function bodyAt(src, h) {
  if (h < 0) return "";
  let j = src.indexOf("(", h), d = 0;
  for (; j < src.length; j++) { if (src[j] === "(") d++; else if (src[j] === ")") { d--; if (!d) break; } }
  j = src.indexOf("{", j); d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}") { d--; if (!d) break; } }
  return src.slice(h, j + 1);
}
const fnBody = (src, head) => bodyAt(src, src.indexOf(head));
const count = (s, re) => (s.match(new RegExp(re.source, "g")) || []).length;
/* The first top-level argument of every call to `name(` (not its definition), string-aware. */
function firstArgs(src, name) {
  const out = [];
  for (const m of src.matchAll(new RegExp(`(?<![\\w.$])${name}\\(`, "g"))) {
    const before = src.slice(Math.max(0, m.index - 9), m.index);
    if (/function\s*$/.test(before)) continue;
    let i = m.index + m[0].length, d = 0, q = null, arg = "";
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { arg += c; if (c === "\\") { arg += src[++i]; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; arg += c; continue; }
      if ("([{".includes(c)) d++;
      if (")]}".includes(c)) { if (!d) break; d--; }
      if (c === "," && !d) break;
      arg += c;
    }
    out.push({ at: src.slice(0, m.index).split("\n").length, arg: arg.trim() });
  }
  return out;
}

function rules(files) {
  const C = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, stripComments(v)]));
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  const all = Object.values(C).join("\n");

  /* 1. the top bar */
  const tick = fnBody(C[STAGE], "function ribbonTick(");
  const actLine = (tick.match(/const act\s*=[^;]*;/) || [""])[0];
  const turnRead = (tick.match(/const (\w+)\s*=\s*whoseTurn\(\s*\)\s*;/) || [])[1];
  rule(!!tick && !!turnRead && new RegExp(`\\b${turnRead}\\b`).test(actLine) && /classList\.toggle\("on",\s*i\s*===\s*act\)/.test(tick)
       && /watchingAnotherSeat:\s*act\b/.test(tick) && !/S\.activeSeat|curSeat/.test(tick),
    "the top bar lights the boat whose turn it is from whoseTurn() — and the ⏩ chip reads that same `act`",
    `ribbonTick does not light the top bar from whoseTurn() (act: ${actLine || "not found"})`);

  /* 2. every other surface */
  const render = fnBody(C[BOARD], "export function render(");
  const live = fnBody(C[BOARD], "export function renderLiveShips(");
  const bob = fnBody(C[BOARD], "export function bobTheTurn(");
  const consume = fnBody(C[ORCH], "export async function consumeEvent(");
  const helper = fnBody(C[UTIL], "export function whoseTurn(");
  const surf = {
    "render reads whoseTurn() once": /const active\s*=\s*whoseTurn\(\s*\)\s*;/.test(render),
    "ring": /ringTo\(active,/.test(render),
    "box highlight": /toggle\("activeTurn",\s*i\s*===\s*active\)/.test(render),
    "row order": /applyCaptainOrder\(active\)/.test(render),
    "Check my recipe": /offersRecipeCheck\(\{[^}]*isActiveSeat:\s*i\s*===\s*active\b/.test(render),
    "the ring that rides a moving ship": /const a\s*=\s*whoseTurn\(\s*\)/.test(live) && /ringTo\(a,/.test(live),
    "the bob": /whoseTurn\(\s*\)/.test(bob) && /bobShip\(seat\)/.test(bob) && /bobTheTurn\(\s*\)/.test(consume) && !/bobShip\(/.test(consume),
  };
  const miss = Object.entries(surf).filter(([, v]) => !v).map(([k]) => k);
  const shownCalls = count(all, /(?<![\w.$])turnShown\(/) - count(all, /function turnShown\(/);
  const walkCalls = count(all, /(?<![\w.$])deriveActiveSeat\(/) - count(all, /function deriveActiveSeat\(/);
  rule(!miss.length && shownCalls === 1 && /turnShown\(/.test(helper) && walkCalls === 1 && /deriveActiveSeat\(/.test(fnBody(C[SB], "export function turnShown(")),
    "the ring, the box highlight, the row order, the bob and Check my recipe read whoseTurn() too — the only caller of turnShown, the only caller of the walk",
    `a surface reads whose turn it is some other way (missing: ${miss.join(", ") || "none"}; turnShown called ${shownCalls}x, deriveActiveSeat ${walkCalls}x)`);

  /* 3. nothing writes the turn; who is being asked is its own fact */
  const stale = ["applyActiveSeat(", "setActor(", "curSeat", "activeTurnSeat", "S.activeSeat", "__pp4.actor"].filter(w => all.includes(w));
  const door = fnBody(C[UTIL], "export function raiseLocalPrompt(");
  const askedWrites = count(all, /appState\.askedSeat\s*=(?!=)/), askedInDoor = count(door, /appState\.askedSeat\s*=(?!=)/);
  const askBody = fnBody(C[UTIL], "export function ask(");
  const askParam = (C[UTIL].match(/export function ask\((\w+),/) || [])[1];
  const calls = [...firstArgs(C[FLOW], "ask").map(c => ({ ...c, f: FLOW })), ...firstArgs(C[ORCH], "ask").map(c => ({ ...c, f: ORCH }))];
  const seatless = calls.filter(c => !/^[A-Za-z_$][\w$]*(\.idx)?$/.test(c.arg));
  rule(!stale.length && askedWrites === askedInDoor && askedInDoor >= 1 && !!askParam && new RegExp(`const askSeat\\s*=\\s*${askParam}\\s*;`).test(askBody)
       && !/askedSeat/.test(askBody) && calls.length >= 15 && !seatless.length && !/askedSeat|whoseTurn/.test(consume),
    `nothing writes the turn: no slot for it survives; who is being asked is written only by raiseLocalPrompt; all ${calls.length} ask() calls name the captain first; the consumer writes neither`,
    `the turn is written, or who is being asked leaks into it (stale: ${stale.join(", ") || "none"}; askedSeat writes ${askedWrites}, in the door ${askedInDoor}; ask's own seat param ${askParam || "missing"}; seatless ask() calls: ${seatless.map(c => `${c.f}:${c.at} ask(${c.arg.slice(0, 30)}…`).join(" | ") || "none"}; of ${calls.length})`);
  return out;
}

/* 4. behaviour — the pure rule's OWN text (real or mutant), imported as a module, on posed streams; and the engine's record */
async function behaviour(files) {
  const out = [], rule = (ok, pass, fail) => out.push({ ok, text: ok ? pass : fail });
  let turnShown;
  try { ({ turnShown } = await import("data:text/javascript;base64," + Buffer.from(files[SB]).toString("base64"))); }
  catch (e) { rule(false, "", `storyboard.js would not load: ${e.message}`); return out; }
  if (typeof turnShown !== "function") { rule(false, "", "storyboard.js exports no turnShown"); return out; }
  const st = (done = []) => [0, 1, 2, 3].map(i => ({ pos: [0, i], coins: 3, ing: [], done: done.includes(i) }));
  const ev = (t, p, extra) => Object.assign({ t, state: st() }, p == null ? {} : { p }, extra || {});
  const opening = [ev("turnOrder"), ev("recipeSet", 0), ev("recipeSet", 1), ev("recipeSet", 2), ev("recipeSet", 3)];
  const fight = [...opening, ev("newround"), ev("turn", 0), ev("sail", 0), ev("powder", 0), ev("coinflip", 0), ev("coinflip", 1),
    ev("shotLands"), ev("battle", null, { a: 0, d: 1 }), ev("sidebet", 2), ev("sidebet", 3)];
  const from = fight.findIndex(e => e.t === "turn");
  const seen = []; for (let i = from; i < fight.length; i++) seen.push(turnShown({ events: fight, playhead: i, askedSeat: i > from + 3 ? 1 : null }));
  rule(seen.every(s => s === 0),
    `a fight on seat 0's turn shows seat 0 at every one of its ${seen.length} steps — the defender's coin, the crow's-nest callers and seat 1 being asked move nothing`,
    `a fight on seat 0's turn shows ${seen.join(" → ")} — the top bar leaves the attacker`);
  const draft = [ev("turnOrder")];
  const d = [null, 2, 0].map(a => turnShown({ events: draft, playhead: 0, askedSeat: a }));
  rule(d[0] === null && d[1] === 2 && d[2] === 0,
    "during the recipe draft (before the recipes are set) the screen shows the captain it is asking, and nobody when nobody is asked",
    `the recipe draft shows ${d.join(", ")} for nobody/2/0 being asked — his settled call keeps the draft's top bar as it was`);
  const bake = [...opening, ev("newround"), ev("turn", 1), ev("sail", 1), ev("bakeTurn", 2)];
  const b = turnShown({ events: bake, playhead: bake.length - 1, askedSeat: null });
  const won = [...bake, Object.assign(ev("bake", 2), { state: st([2]) })];
  const w = turnShown({ events: won, playhead: won.length - 1, askedSeat: null });
  rule(b === 2 && w === null,
    "a baking captain's bench shows the baker, and a captain who has finished holds no turn",
    `a bake shows ${b} (want 2) and a finished captain ${w} (want nobody)`);
  // the engine records the bake turn, for the headless bake and the live one
  const g = new Game(roundCfg(["bot", "bot", "bot", "bot"]), 7919); g.record = true;
  const n0 = g.events.length; let rec = null;
  try { if (typeof g.bakeTurn === "function") { g.bakeTurn(g.players[2]); rec = g.events.slice(n0); } } catch (e) { rec = null; }
  const eng = stripComments(files[ENG]), orch = stripComments(files[ORCH]);
  const attempt = (eng.match(/^  bakeAttempt\(p,guess\)\{[\s\S]*?\n  \}/m) || [""])[0];
  const liveBake = fnBody(orch, "async function bakeTurnLive(");
  rule(!!rec && rec.length === 1 && rec[0].t === "bakeTurn" && rec[0].p === 2 && /this\.bakeTurn\(p\)/.test(attempt) && /\.bakeTurn\(player\)/.test(liveBake),
    "the engine records a baking captain's turn (Game.bakeTurn → {t:\"bakeTurn\",p}), and both the headless bake and the live one begin with it",
    `a baking captain's turn is not recorded as it begins (Game.bakeTurn emitted ${rec ? JSON.stringify(rec.map(e => e.t + ":" + e.p)) : "nothing"}; bakeAttempt calls it: ${/this\.bakeTurn\(p\)/.test(attempt)}; bakeTurnLive calls it: ${/\.bakeTurn\(player\)/.test(liveBake)})`);
  return out;
}

const files = Object.fromEntries(walk("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
const NAMES = ["the top bar", "every other surface", "nothing writes the turn", "behaviour: a fight", "behaviour: the draft", "behaviour: a bake", "behaviour: the engine's record"];
const all = async fl => [...rules(fl), ...await behaviour(fl)];
const real = await all(files);
console.log("whose_turn_shown_once — one answer to whose turn the screen shows");
real.forEach((r, i) => console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${i + 1}. ${r.text}`));

/* RED-PROOF: each mutant is the real source with ONE copy put back, and the rule that guards it must go red. */
const broken = (file, from, to) => files[file].includes(from) ? { ...files, [file]: files[file].replace(from, to) } : null;
const MUTANTS = [
  [1, "the top bar back on the slot every prompt wrote (the audit's mutant)",
    broken(STAGE, "  const turn = whoseTurn();\n  const act = turn == null ? -1 : turn;", "  const act = (S.activeSeat != null) ? S.activeSeat : (appState.curSeat ?? -1);")],
  [3, "applyActiveSeat(s.idx) back in collectSideBets (the audit's mutant)",
    broken(FLOW, "      const who=await ask(s.idx,", "      applyActiveSeat(s.idx);\n      const who=await ask(s.idx,")],
  [2, "the ring and the box walking the stream themselves again",
    broken(BOARD, "  const active=whoseTurn();", "  const active=deriveActiveSeat(appState.game.events,appState.evIdx);")],
  [2, "the bob back on `turn` events only",
    broken(ORCH, "if(!appState.replaying)bobTheTurn();", "if(e.t===\"turn\"&&!appState.replaying)bobShip(e.p);")],
  [2, "Check my recipe back on a flag of its own",
    broken(BOARD, "isActiveSeat:i===active,", "isActiveSeat:i===appState.activeTurnSeat,")],
  [3, "an ask() that does not say who it asks",
    broken(FLOW, "      const who=await ask(s.idx,say(", "      const who=await ask(say(")],
  [3, "the event consumer writing who is being asked from the event",
    broken(ORCH, "if(!appState.replaying)bobTheTurn();", "appState.askedSeat=e.p;if(!appState.replaying)bobTheTurn();")],
  [4, "the pure rule answering from whichever seat the latest event named (the old top bar's rule)",
    broken(SB, "  const seat = deriveActiveSeat(events, playhead);", "  let seat = null; for (let i = Math.min(playhead, events.length - 1); i >= 0; i--) { if (events[i] && events[i].p != null) { seat = events[i].p; break; } }")],
  [5, "the recipe draft losing its phase (nobody shown while a captain chooses)",
    broken(SB, "return askedSeat == null ? null : askedSeat;", "return null;")],
  [6, "a baking captain's turn no longer establishing whose turn it is",
    broken(SB, "\"turn\", \"ovens\", \"bakeTurn\", \"bake\"", "\"turn\", \"ovens\", \"bake\"")],
  [7, "bakeTurnLive no longer recording the bake turn",
    broken(ORCH, "  g.bakeTurn(player);\n", "")],
];
let proofOk = true;
for (const [n, what, mutant] of MUTANTS) {
  const res = mutant ? await all(mutant) : null;
  const red = !!res && !res[n - 1].ok;
  if (!red) proofOk = false;
  console.log(`  ${red ? "PASS" : "FAIL"}  red-proof (rule ${n}, ${NAMES[n - 1]}): ${what} ${red ? "goes red" : mutant ? "STAYS GREEN — the gate cannot see it" : "could not be built (the source moved)"}`);
}
const fails = real.filter(r => !r.ok).length;
console.log(fails || !proofOk ? `\nFAIL — ${fails} rule(s) red${proofOk ? "" : ", and a red-proof did not hold"}` : "\nPASS — whose turn the screen shows is one answer, read by every surface and written by nothing");
process.exit(fails || !proofOk ? 1 : 0);
