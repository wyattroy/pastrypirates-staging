#!/usr/bin/env node
// scripts/bakeoff_parity_test.js
//
// THE TWO BAKE-OFF DAY LOOPS MUST NOT DRIFT.
//
// The bake-off day exists twice: Game.playBakeoff() (src/engine/index.js) drives every headless
// balance run, and runLiveDayBakeoff() (src/orchestrator.js) drives a real browser voyage. Every
// "over N voyages" number this project has ever quoted — median voyage length, the bot ladder, how
// often two captains tie — comes from the headless loop and is worth exactly nothing if the live
// loop plays a different game. A comment saying "keep these in step" is not a mechanism; this is.
//
// ============================================================================
//  WHY IT IS BEING REWRITTEN — architecture item 54, 2026-09-18
// ============================================================================
// This gate was never in `npm test`. Re-pointed and run by hand it reported the two loops playing
// DIFFERENT GAMES on 6 of 6 seeds, which would have meant every balance number in the project was
// measured on something nobody plays. OPENED BEFORE IT WAS BELIEVED, and it was the gate:
//
//   - it imported `../v2bakeoff/src/engine/index.js`, a tree DELETED at the /4 cutover (fb74eedc).
//     As committed it could not run at all — `ERR_MODULE_NOT_FOUND` on line 32.
//   - its hand-written copy of the live loop was stale by three landed changes: A-1 (2026-08-28,
//     a baking captain's attempt moved into their own turn slot — the copy still had the old
//     end-of-day bake phase); architecture item 2 (2026-09-16, Game.beginVoyage/Game.beginDay —
//     the copy still shuffled by hand, dealt no staggered purses and wrote its own round header);
//     and architecture item 3 (2026-09-16, the `bakeTurn` record — the copy never made one).
//
// MEASURED, all seeds, nothing dropped: against today's engine the stale copy differs from
// playBakeoff on 40/40 seeds (reproducing the reported seed 1 winner 0->2 round 13->16 and seed 4
// round 15->21 events 277->418 exactly), while a copy of TODAY's live loop differs on 0/40. The
// day loops agree. The report was three weeks of drift in this file.
//
// ============================================================================
//  SO THE COPY IS NO LONGER TRUSTED TO BE HONEST — IT IS PINNED TO THE ORIGINAL
// ============================================================================
// A gate that asserts against a copy of itself drifts with nothing pushing back
// (docs/HARD-WON-LESSONS.md §12i). That is this file's whole history. So rule 2 below reads the
// REAL runLiveDayBakeoff and bakeTurnLive out of src/orchestrator.js and asserts that liveShaped()
// makes the same engine calls in the same order. The day anyone changes the live loop, rule 2 goes
// red naming both sequences — instead of rule 1 quietly reporting that the game is broken.
//
// ============================================================================
//  WHAT IS COMPARED, AND WHAT IS DELIBERATELY NOT (each exclusion, and which way its error runs)
// ============================================================================
// This asserts parity of the DAY STRUCTURE: which seats take a turn, when the ovens light, who is
// enrolled in today's bake, the order attempts resolve in, and when the day ends.
//
//   EXCLUDED 1 — the inside of a turn. Held constant at Game.takeTurn on both sides. botTurn()
//     (src/ui/flow.js) does not call takeTurn() at all; it reimplements the turn so each step can
//     animate, and that gap predates the bake-off. ERROR RUNS AGAINST THIS GATE'S GREEN: holding
//     the turn constant can only make the two loops look MORE alike, so a pass here is a FLOOR —
//     "the day structure agrees", never "the whole voyage agrees".
//
//   EXCLUDED 2 — bakeRewatch, the one live call with no headless twin. It sits on bakeTurnLive's
//     `appState.replaying` branch and draws no random number (the engine says so at its
//     definition). ERROR RUNS TOWARD THIS GATE'S GREEN, so it is not taken on trust: rule 2b
//     asserts the call is still inside that replaying test, and goes red if it ever escapes it.
//
//   EXCLUDED 3 — the storm, ALMOST. runStormLive (src/ui/flow.js) is Game.runStorm open-coded so
//     the push can be animated one square at a time, so this file's driver calls Game.runStorm and
//     the live game does not. Rule 2c pins them anyway: same engine calls in the same order, with
//     the one substitution (the engine's stormPush where the live loop steps) CHECKED rather than
//     assumed — stormPush's own body must still be a loop over stormStep bounded by its `dist` that
//     returns on the first non-"moved" outcome, and the live loop must still be bounded by
//     STORM_PUSH and break on the same condition. WHAT IT STILL DOES NOT PIN: the live loop's bound
//     is read as the constant's NAME, not its value, so a storm whose two sides pushed different
//     distances would pass. ERROR RUNS TOWARD THIS GATE'S GREEN, and it is named here rather than
//     argued away.
//
//   EXCLUDED 4 — the recipe draft. THIS ONE IS A REAL, LIVE DIVERGENCE AND IT IS NOT THIS GATE'S
//     TO FIX: recipeDraftNet (src/orchestrator.js) draws one r() per bot and coin-flips between
//     that captain's two recipe cards; playBakeoff never drafts at all, so every headless bot bakes
//     card A. That is architecture item 45. Measured 2026-09-18, 150 seeds, nothing dropped: it is
//     the ONLY remaining difference between the two loops, and with the four extra draws held
//     constant it moves mean voyage length 16.40 -> 16.31 days. Rule 3 asserts the divergence still
//     EXISTS, so that the day somebody converges them this exclusion is reported stale rather than
//     sitting here describing a world that has moved on.
//
//   node scripts/bakeoff_parity_test.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Game, roundCfg } from "../src/engine/index.js";
import { stripComments as strip } from "./qa/lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENG = fs.readFileSync(path.join(REPO, "src/engine/index.js"), "utf8");
const ORCH = fs.readFileSync(path.join(REPO, "src/orchestrator.js"), "utf8");
const FLOW = fs.readFileSync(path.join(REPO, "src/ui/flow.js"), "utf8");
const SELF = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");

/* GAMES is the behavioural sample. It was 120 and the run took over two minutes, which is why
   nobody ever put this in the chain — and a gate nobody runs has never had to be right. Sized
   from what it has to catch instead: the weakest mutant below parts company with the engine on
   about three seeds in four, so sixteen seeds miss it with probability 0.25^16. */
const GAMES = 16;
const STRATS = ["pirate", "trader", "balanced", "rusher"];
let failures = 0;
function check(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++; console.log("FAIL " + name + (detail ? "  — " + detail : ""));
}

// The same event filter the flag-off baseline uses, so both gates agree on what "the same game"
// means and neither churns on a copy edit.
function stream(g) {
  const keep = ["t", "p", "a", "d", "dir", "ing", "winner", "heads", "got", "kind", "spoilIng", "dist", "round",
    "attempt", "correct", "left", "solved"];
  return g.events.map(e => keep.filter(k => e[k] !== undefined).map(k => k + "=" + e[k]).join(",")).join(";");
}
function fingerprint(g, winner) {
  return JSON.stringify({ winner, round: g.round, rand: g.randCalls, evs: g.events.length,
    finishOrder: g.finishOrder, stream: stream(g) });
}
const newGame = seed => new Game({ ...roundCfg(STRATS), bakeoff: true }, seed, true);

// A: the engine's own loop.
function headless(seed) {
  const g = newGame(seed);
  const winner = g.playBakeoff();
  return fingerprint(g, winner);
}

/* B: runLiveNet + runLiveDayBakeoff + liveResolveEndNet, longhand. Written out rather than
   imported because the orchestrator is DOM-bound — and PINNED TO IT by rule 2, which is the part
   that was missing for three weeks. Every engine call below is in the live loop's own order. */
function liveShaped(seed) {
  const g = newGame(seed);
  const order = g.beginVoyage();                    // runLiveNet
  let ended = false, day;
  while (!ended && (day = g.beginDay())) {          // runLiveNet's day
    const { wind, storm } = day;
    if (storm) g.runStorm(wind);                    // runStormLive
    for (const i of order) {                        // runLiveDayBakeoff
      const p = g.players[i];
      if (p.done) continue;
      if (p.baking) { g.bakeTurn(p); const s = g.bakeSetup(p); g.bakeResolve(p, s.fallback); continue; }
      g.takeTurn(p, wind, storm);
      if (g.lightOvens(p)) { g.bakeTurn(p); const s = g.bakeSetup(p); g.bakeResolve(p, s.fallback); }
    }
    ended = g.endBakeDay();
  }
  g.crownWinner();                                  // liveResolveEndNet
  return fingerprint(g, g.declareEnd());
}

/* ---------- reading the real loops out of the real source ---------- */
/* ⚠ A DEFINITION, NEVER THE FIRST MENTION. The first version took the first `<name>(` in the file —
   and `bakeTurnLive` is CALLED at src/orchestrator.js:1024, eight lines above where it is defined.
   So it read runLiveDayBakeoff's tail as bakeTurnLive's body, and rule 2b then reported "bakeRewatch
   is gone from bakeTurnLive" and passed. A gate that cannot find its subject reports about ITSELF.
   A definition is `<name>( … ) {` with nothing but space between the close paren and the brace, and
   no `.` in front of the name — which accepts both `async function bakeTurnLive(player){` and the
   engine's bare class methods (`playBakeoff(){`), and rejects every call site of either. */
function fnBody(src, name) {
  const clean = strip(src);
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  let m;
  while ((m = re.exec(clean))) {
    if (clean[m.index - 1] === ".") continue;                 // a call on the game, not a definition
    let k = m.index + m[0].length - 1, depth = 0;             // sit on the open paren
    for (; k < clean.length; k++) {
      if (clean[k] === "(") depth++;
      else if (clean[k] === ")") { depth--; if (!depth) break; }
    }
    let i = k + 1;
    while (i < clean.length && /\s/.test(clean[i])) i++;
    if (clean[i] !== "{") continue;                           // `…);` — a call
    depth = 0;
    let j = i;
    for (; j < clean.length; j++) {
      if (clean[j] === "{") depth++;
      else if (clean[j] === "}") { depth--; if (!depth) break; }
    }
    return clean.slice(i, j + 1);
  }
  return null;
}
/* The names are the ENGINE'S OWN, read off Game.prototype — never a list typed here, which would be
   a second place deciding what an engine call is. */
const METHODS = new Set(Object.getOwnPropertyNames(Game.prototype));
/* Every engine call in a body, in source order. `recv` is what the loop calls the game (`this` in
   the engine, `g` in the orchestrator). `also` catches the loop's own helpers so they can be
   expanded in place — bakeTurnLive live, bakeAttempt headless — and the bare `takeTurn(` the
   orchestrator imports from flow.js (EXCLUDED 1: held constant at the engine's takeTurn). */
function calls(body, recv, also = []) {
  const rx = recv.replace(/\./g, "\\.");
  /* An EMPTY alternative matches everywhere — `(?:g\.(\w+)|())\(` would call every parenthesis an
     engine call. So the second branch only exists when there is something to put in it. */
  const alt = also.length ? `|(${[...also].sort((a, b) => b.length - a.length).join("|")})` : "";
  const re = new RegExp(`\\b(?:${rx}\\.(\\w+)${alt})\\s*\\(`, "g");
  const out = []; let m;
  while ((m = re.exec(body))) {
    const n = m[1] || m[2];
    if (m[2] || METHODS.has(n)) out.push(n);
  }
  return out;
}
function expand(seq, table) {
  return seq.flatMap(n => (table[n] ? table[n] : [n]));
}
/* The live loop's engine calls, expanded through bakeTurnLive, with EXCLUDED 2 removed. */
function liveSequence(orch) {
  const bake = calls(fnBody(orch, "bakeTurnLive") || "", "g").filter(n => n !== "bakeRewatch");
  return expand(calls(fnBody(orch, "runLiveDayBakeoff") || "", "g", ["bakeTurnLive", "takeTurn"]),
                { bakeTurnLive: bake });
}
/* This file's own longhand, read the same way, so the two can only agree by actually agreeing. */
function copySequence(self) {
  const body = fnBody(self, "liveShaped") || "";
  const day = body.slice(body.indexOf("for (const i of order)"), body.indexOf("crownWinner"));
  return calls(day, "g");
}
/* Does `needle` appear in `hay`, in order, allowing gaps? */
const subseq = (hay, needle) => {
  let i = 0;
  for (const h of hay) if (h === needle[i]) i++;
  return i === needle.length;
};

/* ---------- the rules, each a pure function of source text so a mutant can be posed ---------- */
/* ⚠ AND IT MUST HAVE REACHED ITS SUBJECT. Two empty sequences agree perfectly, and that agreement
   is a statement about this file's regexes, not about the game (rule 6: an instrument that reports
   NOT FOUND has told you something about ITSELF). So the live loop has to look like a day. */
const REACHED = ["takeTurn", "lightOvens", "endBakeDay", "bakeResolve"];
function rule2(orch, self) {
  const live = liveSequence(orch), copy = copySequence(self);
  const found = REACHED.every(n => live.includes(n) && copy.includes(n));
  return { ok: found && live.join(">") === copy.join(">"),
    why: (found ? "" : "the reader did not reach its subject — ") +
      "live " + (live.join(">") || "(nothing found)") + "   vs   this file " + (copy.join(">") || "(nothing found)") };
}
function rule2b(orch) {
  const body = fnBody(orch, "bakeTurnLive") || "";
  const m = body.match(/if\s*\([^)]*replaying[^)]*\)\s*g\.bakeRewatch\s*\(/);
  return { ok: !!m || !/bakeRewatch/.test(body),
    why: /bakeRewatch/.test(body) ? "bakeRewatch is no longer behind an `appState.replaying` test — it is a live call this gate does not compare"
                                  : "bakeRewatch is gone from bakeTurnLive" };
}
/* EXCLUDED 3 — the storm, pinned rather than waved through. The two loops must make the same engine
   calls in the same order; the one substitution (stormPush where the live loop steps) is CHECKED
   against both bodies, so the equivalence is a measurement and not a sentence in a comment. */
function rule2c(eng, flow) {
  const head = calls(fnBody(eng, "runStorm") || "", "this");
  const live = calls(fnBody(flow, "runStormLive") || "", "g");
  const push = (fnBody(eng, "stormPush") || "").replace(/\s+/g, " ");
  const loop = (fnBody(flow, "runStormLive") || "").replace(/\s+/g, " ");
  const pushIsLoop = /for\(let s=0;s<dist;s\+\+\)/.test(push) && /this\.stormStep\(/.test(push)
    && /if\(outcome!=="moved"\)return outcome;/.test(push);
  const liveIsLoop = /for\(let s=0;s<STORM_PUSH;s\+\+\)/.test(loop) && /if\(outcome!=="moved"\)break;/.test(loop);
  const mapped = head.map(n => (n === "stormPush" ? "stormStep" : n));
  const reached = head.includes("stormOrder") && live.includes("stormOrder");
  return { ok: reached && pushIsLoop && liveIsLoop && mapped.join(">") === live.join(">"),
    why: (reached ? "" : "the reader did not reach its subject — ") +
      (pushIsLoop ? "" : "Game.stormPush is no longer a bounded loop over stormStep that stops on the first non-moved outcome — the substitution below is not safe. ") +
      (liveIsLoop ? "" : "runStormLive's push is no longer bounded by STORM_PUSH with the same early stop. ") +
      "engine " + (mapped.join(">") || "(nothing found)") + "   vs   live " + (live.join(">") || "(nothing found)") };
}
function rule3frame(eng, orch) {
  const head = calls(fnBody(eng, "playBakeoff") || "", "this");
  const net = calls(fnBody(orch, "runLiveNet") || "", "appState.game", ["runLiveDayBakeoff", "liveResolveEndNet"]);
  const end = calls(fnBody(orch, "liveResolveEndNet") || "", "appState.game");
  const okH = subseq(head, ["beginVoyage", "beginDay", "endBakeDay", "resolveEnd"]);
  const okN = subseq(net, ["beginVoyage", "beginDay", "runLiveDayBakeoff", "liveResolveEndNet"]);
  const okE = subseq(end, ["crownWinner", "declareEnd"]);
  return { ok: okH && okN && okE,
    why: `playBakeoff ${okH ? "ok" : "[" + head.join(">") + "]"} · runLiveNet ${okN ? "ok" : "[" + net.join(">") + "]"} · liveResolveEndNet ${okE ? "ok" : "[" + end.join(">") + "]"}` };
}
function rule4draft(eng, orch) {
  const draft = fnBody(orch, "recipeDraftNet") || "";
  const liveDrafts = /strategy\s*!==\s*"human"\s*\)\s*picks\[[^\]]+\]\s*=\s*appState\.game\.r\(\)/.test(draft.replace(/\s+/g, " "))
    || (/appState\.game\.r\(\)/.test(draft) && /setRecipe/.test(draft));
  const headlessDrafts = /recipeChoices|setRecipe/.test(fnBody(eng, "playBakeoff") || "");
  return { ok: liveDrafts && !headlessDrafts,
    why: `live draws for the draft: ${liveDrafts} · playBakeoff drafts: ${headlessDrafts} — if both are now true the loops have converged and EXCLUDED 4 above is stale; if both are false the live draft has gone` };
}

/* ---------- 1. the behavioural rule ---------- */
const HEAD = [];
for (let s = 1; s <= GAMES; s++) HEAD.push(headless(s));
{
  const diffs = [];
  for (let s = 1; s <= GAMES; s++) {
    const a = HEAD[s - 1], b = liveShaped(s);
    if (a !== b) {
      const A = JSON.parse(a), B = JSON.parse(b);
      const moved = ["winner", "round", "rand", "evs"].filter(k => String(A[k]) !== String(B[k]));
      diffs.push("seed " + s + ": " + (moved.length ? moved.map(k => k + " " + A[k] + " -> " + B[k]).join(", ")
        : "event streams differ at char " + firstDiff(A.stream, B.stream)));
    }
  }
  check("1. playBakeoff() and the live day loop play " + GAMES + " identical games (0 seeds dropped)",
    diffs.length === 0, diffs.length ? ("\n  " + diffs.slice(0, 6).join("\n  ")) : "");
}

/* ---------- 2-4. the source rules, on the real files ---------- */
{
  const r2 = rule2(ORCH, SELF);
  check("2. this file's live copy makes the SAME engine calls, in order, as the real runLiveDayBakeoff", r2.ok, r2.why);
  const r2b = rule2b(ORCH);
  check("2b. the one live call with no headless twin (bakeRewatch) is still replay-only", r2b.ok, r2b.why);
  const r2c = rule2c(ENG, FLOW);
  check("2c. the live storm (runStormLive) makes the engine's own runStorm calls, in order", r2c.ok, r2c.why);
  const r3 = rule3frame(ENG, ORCH);
  check("3. the day-loop FRAME is the engine's on both sides (beginVoyage / beginDay / the end)", r3.ok, r3.why);
  const r4 = rule4draft(ENG, ORCH);
  check("4. EXCLUDED 4 is still true: the live game drafts recipes and playBakeoff does not (item 45)", r4.ok, r4.why);
  console.log("   [declared] compared: the day structure, and the storm by its engine calls (rule 2c). NOT compared:");
  console.log("   [declared] the inside of a turn (held at Game.takeTurn on both sides), bakeRewatch (replay-only, no");
  console.log("   [declared] r()), the storm's push DISTANCE (read as the constant's name, not its value), and the");
  console.log("   [declared] recipe draft (item 45, a REAL live divergence). Every one of those can only make the two");
  console.log("   [declared] loops look MORE alike than they are, so a pass here is a FLOOR, never a clean bill.");
}

/* ---------- the red-proof: every rule goes red on a mutant of the real source ---------- */
{
  // Rule 1 must be able to fail: reorder the day — resolve each bake the instant its captain
  // arrives, and again at day end, the rule this loop was written to kill.
  const broken = (seed) => {
    const g = newGame(seed);
    const order = g.beginVoyage();
    let ended = false, day;
    while (!ended && (day = g.beginDay())) {
      const { wind, storm } = day;
      if (storm) g.runStorm(wind);
      for (const i of order) {
        const p = g.players[i];
        if (p.done || p.baking) continue;
        g.takeTurn(p, wind, storm);
        if (g.lightOvens(p)) g.bakeAttempt(p, null);   // <-- mid-day, the wrong rule
      }
      for (const i of g.bakersToday(order)) g.bakeAttempt(g.players[i], null);
      ended = g.endBakeDay();
    }
    g.crownWinner();
    return fingerprint(g, g.declareEnd());
  };
  let moved = 0;
  for (let s = 1; s <= GAMES; s++) if (HEAD[s - 1] !== broken(s)) moved++;
  check("RED 1: resolving bakes mid-day parts the two loops on " + moved + "/" + GAMES + " games",
    moved >= Math.ceil(GAMES * 0.75), "only " + moved + " of " + GAMES + " moved — rule 1 may not be measuring anything");

  /* And each source rule, against a mutant of the file it reads. Built in memory from the REAL
     text, never a fixture: a rule proved against a hand-written fake is proved against nothing. */
  const mutants = [
    ["a live loop this file can no longer find at all (the reached-its-subject guard)",
      () => rule2(ORCH.replace("async function runLiveDayBakeoff(order){", "async function runLiveDayBakeoffRenamed(order){"), SELF).ok],
    ["a live loop that goes back to the end-of-day bake phase",
      () => rule2(ORCH.replace("if(player.baking){await bakeTurnLive(player);continue;}", "if(player.baking)continue;"), SELF).ok],
    ["a live loop that stops lighting the ovens in the turn slot",
      () => rule2(ORCH.replace("if(g.lightOvens(player)){liveRender();await narrateLastEvent();await bakeTurnLive(player);}",
                               "g.lightOvens(player);"), SELF).ok],
    ["a live bake that scores without recording whose turn it is",
      () => rule2(ORCH.replace("g.bakeTurn(player);", ""), SELF).ok],
    ["a re-watch charged outside the replay branch",
      () => rule2b(ORCH.replace("if(dec.w&&appState.replaying)g.bakeRewatch(player,dec.w);", "g.bakeRewatch(player,dec.w);")).ok],
    ["a live storm that stops recording each ship's outcome",
      () => rule2c(ENG, FLOW.replace("g.noteStormOutcome(", "uiOnlyNote(")).ok],
    ["a stormPush that is no longer a bounded loop over stormStep",
      () => rule2c(ENG.replace("outcome=this.stormStep(p,dirKey);", 'outcome="moved";'), FLOW).ok],
    ["a live push that no longer stops at the first ship it is held by",
      () => rule2c(ENG, FLOW.replace('if(outcome!=="moved")break;', "")).ok],
    ["a headless loop that starts the voyage itself again",
      () => rule3frame(ENG.replace("playBakeoff(){\n    const order=this.beginVoyage();",
                                   "playBakeoff(){\n    const order=this.players.map((_,i)=>i);this.shuffle(order);"), ORCH).ok],
    ["a live voyage that ends without crowning anyone",
      () => rule3frame(ENG, ORCH.replace("if(appState.game.crownWinner()){", "if(false){")).ok],
    ["a headless loop that has learned to draft (EXCLUDED 4 gone stale)",
      () => rule4draft(ENG.replace("playBakeoff(){\n    const order=this.beginVoyage();",
                                   "playBakeoff(){\n    this.players.forEach(p=>this.setRecipe(p,p.recipeChoices[0]));\n    const order=this.beginVoyage();"), ORCH).ok],
  ];
  const survived = [];
  for (const [what, run] of mutants) {
    let stillGreen = true;
    try { stillGreen = run() !== false; } catch { stillGreen = false; }
    if (stillGreen) survived.push(what);
  }
  check("RED 2: all " + mutants.length + " source mutants turn a rule red", survived.length === 0,
    survived.length ? ("these were not caught: " + survived.join("; ")) : "");
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i + " (…" + a.slice(Math.max(0, i - 40), i + 40) + " | …" + b.slice(Math.max(0, i - 40), i + 40) + ")";
  return String(n);
}

console.log(failures ? ("\n" + failures + " FAILED") : "\nthe two bake-off day loops agree, and the copy is pinned to the original");
process.exit(failures ? 1 : 0);
