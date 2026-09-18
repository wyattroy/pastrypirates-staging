/* ONE ENGINE, ONE DISPLAY, DIFFERENT INPUTS — the doors that have to stay shut.
 *
 * Wyatt, 2026-09-13, after finding a guest camera that did not frame anybody's sail and a dock coin
 * that no human ever saw: "I need you to write better code in accordance with my core principles of
 * consistency. one engine, one display, different inputs. Don't just patch this, fix its
 * architecture." And: "this is the 100th time I have noticed a problem like this."
 *
 * THE SHAPE OF EVERY ONE OF THOSE HUNDRED: a reaction to a game fact written into the code path that
 * was being looked at — almost always the host's turn loop, because a solo game only runs the host —
 * instead of into the one consumer every device runs. So this gate does not test behaviour; it
 * checks that the reactions live behind the right door, which is what stops the next one being
 * written in the wrong place. ABSENCE assertions on the old homes, PRESENCE assertions on the new.
 *
 *   node scripts/qa/one_display_door_check.mjs               the working tree
 *   node scripts/qa/one_display_door_check.mjs --ref=<sha>   the same files as they were at <sha>
 *
 * RED-PROOF: `--ref=c0917774` (dev before the 2026-09-13 convergence) must fail. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments as strip } from "./lib/strip_comments.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const refArg = process.argv.find(a => a.startsWith("--ref="));
const ref = refArg ? refArg.slice(6) : null;
const read = rel => ref
  ? execFileSync("git", ["show", `${ref}:${rel}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  : fs.readFileSync(path.join(REPO, rel), "utf8");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };

/* the body of a named function, brace-matched on comment-stripped source */
function fnBody(src, name){
  const m = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  if (!m) return null;
  let i = src.indexOf("{", m.index), depth = 0;
  for (let j = i; j < src.length; j++){
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(i, j + 1);
  }
  return null;
}

const orch  = strip(read("src/orchestrator.js"));
const flow  = strip(read("src/ui/flow.js"));
const lobby = strip(read("src/ui/lobby.js"));
const util  = strip(read("src/ui/util.js"));
const stage = strip(read("src/ui/stage.js"));
console.log(`one display door — ${ref ? "files at " + ref : "working tree"}\n`);

/* 1. THE DOCK COIN: drawn by the one consumer, for every non-local dock; never by a turn loop */
if (/flipDockCoin\s*\(|botDockCoin/.test(flow))
  fail("src/ui/flow.js draws a dock coin itself — a turn loop only runs where that turn is computed (the host), so other screens miss it");
else pass("no turn loop in src/ui/flow.js draws a dock coin");
const body = fnBody(orch, "consumeEventBody") || fnBody(orch, "consumeEvent") || "";
if (/flipDockCoin\s*\(/.test(body) && /decisionIsLocal\s*\(\s*e\.p\s*\)/.test(body))
  pass("the one consumer draws the dock coin, gated on this screen's locality (decisionIsLocal)");
else fail("consumeEvent does not draw the dock coin for non-local docks — bots and remote humans would dock unseen on some screen");

/* 2. THE TURN FRAME: decided by the one consumer from the turn event AND this screen's locality; never
   by the engine machine's pick. The locality half is architecture item 46 — Wyatt, 2026-09-17: "we cannot
   see other players sail squares (bots or humans) so ALL other players turns should be zoomed in on their
   boat for maximum immersion." A door that frames a turn without asking who is being asked cannot obey that. */
if (/e\.t\s*===\s*"turn"[^;]*turnFrame\s*\(\s*e\.p\s*,[^;]*decisionIsLocal\s*\(\s*e\.p\s*\)/.test(body))
  pass("the one consumer frames each captain's turn from the turn event and this screen's locality, on every device");
else fail("consumeEvent does not frame the turn from the event plus decisionIsLocal — either the frame lives somewhere only one machine runs, or a watching screen is framed by the same rule as the chooser");
const pick = fnBody(flow, "pickCell") || "";
if (/turnFrame\s*\(|sailCells\s*\(/.test(pick))
  fail("pickCell() calls the camera — pickCell runs on the engine's machine only, so a guest's camera would never frame this");
else pass("pickCell() makes no camera call of its own");

/* 3. PASS-AND-PLAY: the helm is offered only to a seat whose choice a HUMAN makes at this device */
const gate = fnBody(lobby, "passGate") || "";
if (/decisionIsLocal\s*\(/.test(gate)) pass("passGate asks the one locality answer (decisionIsLocal) before handing the device over");
else fail("passGate does not ask who the seat is — it will ask the table to pass the helm to a bot");

/* 4. BOARD DECORATIONS: the camera pans the HTML layers in the BOARD WINDOW's pixels, never the page's */
if (/const\s+W\s*=\s*vwPx\(\)\s*,\s*s2\s*=/.test(stage))
  fail("camFrame pans the HTML board layers by vwPx() — the page width — so ripples, rim arrows and coins drift off the board whenever the board is narrower than the page");
else pass("camFrame pans the HTML board layers by the board window's own width");

/* 5. NARRATION: every speaker waits for the one consumer to finish the event it describes */
const narr = fnBody(util, "narrateEvent") || "";
const wn = fnBody(orch, "watchNarr") || "";
if (/eventDrawn\s*\(/.test(narr) && /eventDrawn\s*\(/.test(wn))
  pass("both narrators (the host's one narrateEvent and a guest's watchNarr) wait on eventDrawn");
else fail("a narrator does not wait for its event to be drawn — a line can land on a coin still in the air on that device");

/* 6. ONE NARRATOR, WHOEVER CHOSE THE MOVE — Wyatt, 2026-09-13: "there should be no separate track of dialogy for
   botTurn() -- re-architect this away." A bot's beat (narrateCurrent) and a human's action (narrateLastEvent) only
   say WHICH event; both hand it to narrateEvent. Two bodies is how a bot's attack on a person reached that person in
   the third person, and how a bot's turn opened with a banner no human turn had. */
const panelSrc = strip(read("src/ui/panel.js"));
const botRoute = /narrateEvent\s*\(/.test(fnBody(util, "narrateCurrent") || "");
const humanRoute = /narrateEvent\s*\(/.test(fnBody(panelSrc, "narrateLastEvent") || "");
if (narr && botRoute && humanRoute)
  pass("a bot's beat (narrateCurrent) and a human's action (narrateLastEvent) both go through the one narrator, narrateEvent");
else fail(`two narration tracks (narrateEvent exists:${!!narr} bot beat routes to it:${botRoute} human action routes to it:${humanRoute}) — a bot's move and a human's are described by different code again`);

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════
   7-12. THE STORM: THE WIDE SHOT, AND THE BOATS IT MOVES — architecture item 24, 2026-09-18.

   It lives HERE, in the doors gate, rather than in a `storm_one_door_check.mjs` of its own, because the
   audit asked for that in its own words (.planning/ARCHITECTURE-AUDIT-2026-09-16.md line 55: this gate
   "checks only flow.js for dock coins, only pickCell for camera calls, and nothing for … stormCam … —
   extend with items 4, 5, 12, 24") and because, ON THE DAY THIS WAS WRITTEN, a new chain entry would not
   fit: MEASURED on Wy-Blade by binary search, the longest `scripts.test` cmd.exe will run is 8154
   characters and the chain was 8150. Four characters. A gate added under ANY name made `npm test` die
   with "The command line is too long" before a single check ran. That ceiling was a finding in its own
   right, was reported to the lead, and is GONE: architecture item 63 (2026-09-18) moved the list into
   `scripts/gates.manifest.json` and made `scripts.test` one 26-character command. The measurement above
   is left as the record of why the manifest exists — the placement of these six checks stands on the
   audit's own sentence, which is the reason that did not expire.

   THE FACT, in the game's words: when a storm arrives the camera pulls out to show every ship and where
   the wind is driving it, and then each ship is shown running downwind. Two things — the wide shot, and
   the boats moving — and the same door has to decide both for every screen.

   BEFORE — the wide shot, 3 deciders:
     src/ui/flow.js  runStormLive        stormCamForEvent(evStorm), one statement after this tier had
                                         already handed the same event to the drain (host only)
     src/orchestrator.js  consumeEvent    stormCamForEvent(e) — the one door, every device
     src/ui/stage.js  stageFlash          `if (evType === "storm") camFull()` — a DIFFERENT frame (the
                                         whole ocean), fed by a flag three files wrote
   BEFORE — the boats moving, 2 deciders:
     src/ui/flow.js  runStormLive        renderLiveShips() flushing the push, and paintShipAt(idx, was)
                                         before a rim sweep — this tier drawing hulls in its own loop
     src/orchestrator.js  consumeEvent    render(), off each ship's own record — every screen

   MEASURED BEFORE, two windows, a real crew room (host 1200x950, guest iPhone-13-mini 375x812 dsf3,
   touch), sampling the applied viewBox of #board and every ship group's computed transform at EVERY
   animation frame on BOTH screens, plus every write to a ship's group with the value it replaced:
     · the wide shot was aimed TWICE on the host and once on the guest — both host calls caught at the
       stage bridge with their stacks, t=-0.004s from consumeEvent and t=-0.003s from runStormLive. One
       millisecond apart, so both screens reached the identical viewBox 55-65 ms apart and nothing looked
       wrong: a second decider, not yet a second picture.
     · the whole-ocean shot never happened at all — in four storms, on both screens, neither ever applied
       "0 0 640 640", which is the only thing camFull() produces.
     · this tier's flush was UNDONE for most ships inside a millisecond, by the PREVIOUS ship's record
       reaching render():  0.773s seat 3 [3,6]->[3,3]   0.773s seat 3 [3,3]->[3,6]   1.545s seat 3 moves
       for real, on its own record.  It survived only where nothing was in flight to overwrite it, and
       those hulls were drawn 0.83s / 0.87s / 0.83s / 0.80s AHEAD of the guest across three runs. Every
       other hull agreed to within 38-54 ms, which is the wire.
   AFTER, same rig: every boat, both screens, 53-90 ms apart; the same squares; and every hull is home
   before the storm's summary on BOTH screens, which was not true of a guest before.

   Each rule has at least one named mutant below that turns IT red. Matching is on COMMENT-STRIPPED
   source throughout, so a tombstone quoting a deleted line cannot pass for the line.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
const STORM_FILES = ["src/ui/flow.js", "src/orchestrator.js", "src/ui/stage.js", "src/ui/util.js", "src/engine/index.js"];
const [S_FLOW, S_ORCH, S_STAGE, S_UTIL, S_ENG] = STORM_FILES;

function spanFrom(src, at) {                       // brace-matched body from a header offset
  if (at < 0) return "";
  let j = src.indexOf("{", at), d = 0;
  for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) return src.slice(at, j + 1); }
  return "";
}
const fnFrom = (src, head) => spanFrom(src, src.indexOf(head));
const methodHead = name => new RegExp(`^  ${name}\\(([^)]*)\\)\\{`, "m");
const methodOf = (eng, name) => { const m = eng.match(methodHead(name)); return m ? spanFrom(eng, m.index) : ""; };
const tally = (s, re) => (s.match(re) || []).length;

/* The engine module itself is always the WORKING TREE's — only the two methods that decide what a storm
   RECORDS are recompiled out of the source under test. Under --ref those two would be pinned to an old
   file inside a new class, which is not a thing that ever ran, so rule 12 declines to run there and says so. */
const { Game: StormGame, roundCfg: stormCfg } = await import(pathToFileURL(path.join(REPO, "src/engine/index.js")).href);
const { DIRS: STORM_DIRS, mulberry32: stormRand } = await import(pathToFileURL(path.join(REPO, "src/shared/index.js")).href);

function recompileStormMethods(engSrc) {
  const out = {};
  for (const name of ["noteStormOutcome", "stormStep"]) {
    const m = engSrc.match(methodHead(name));
    if (!m) throw new Error(`Game.${name} is missing from the source under test`);
    const body = spanFrom(engSrc, m.index), inner = body.slice(m[0].length, -1);
    out[name] = new Function("DIRS", `return function(${m[1]}){${inner}}`)(STORM_DIRS);
  }
  return out;
}
/* Seeded storms on real boards, ships SCATTERED rather than left on their docks — a storm off the docks
   exercises one outcome and this rule is about all of them. */
function posedStorms(engSrc, seeds = 60) {
  const { noteStormOutcome, stormStep } = recompileStormMethods(engSrc);
  const runs = [], kinds = { moved: 0, landHeld: 0, blocked: 0, swept: 0 };
  for (let s = 0; s < seeds; s++) {
    const g = new StormGame(stormCfg(["bot", "bot", "bot", "bot"]), 4201 + s * 131, true);
    g.noteStormOutcome = noteStormOutcome; g.stormStep = stormStep;
    g.beginVoyage([0, 1, 2, 3]);
    const r = stormRand(90210 + s * 7);
    const wet = [...g.valid].map(k => k.split(",").map(Number)).filter(c => !g.blocked(c) && !g.isIsland(c) && !g.isHome(c));
    if (wet.length < 8) continue;
    const taken = new Set();
    for (const p of g.players) {
      let c = null;
      for (let t = 0; t < 40 && !c; t++) { const q = wet[Math.floor(r() * wet.length)]; if (!taken.has(q.join(","))) c = q; }
      if (!c) break;
      taken.add(c.join(",")); p.pos = [...c]; p.done = false; p.baking = false;
    }
    if (taken.size < g.players.length) continue;
    const dir = "NSEW"[Math.floor(r() * 4)];
    g.windNow = dir; g.stormNow = true;
    const before = g.players.map(p => [...p.pos]);
    g.events.length = 0;
    g.runStorm(dir);
    for (const e of g.events) {
      if (e.t === "windmove" || e.t === "blownOut") kinds.moved++;
      else if (e.t === "anchorHold") kinds.landHeld++;
      else if (e.t === "blocked") kinds.blocked++;
      else if (e.t === "tradewind") kinds.swept++;
    }
    runs.push({ dir, before, after: g.players.map(p => [...p.pos]),
      events: g.events.map(e => ({ t: e.t, p: e.p, state: (e.state || []).map(x => (x && x.pos) ? [x.pos[0], x.pos[1]] : null) })) });
  }
  return { runs, kinds };
}
/* For every ship a storm MOVED: the first record whose state shows it on its final square must be its OWN.
   If it were a later ship's record, a screen drawing from records would move that hull in somebody else's beat. */
function ownRecordMovesIt(runs) {
  let checked = 0; const wrong = [];
  for (const run of runs) for (let i = 0; i < run.after.length; i++) {
    const b = run.before[i], a = run.after[i];
    if (b[0] === a[0] && b[1] === a[1]) continue;           // never moved — nothing for a screen to draw
    checked++;
    const at = run.events.findIndex(e => e.state[i] && e.state[i][0] === a[0] && e.state[i][1] === a[1]);
    if (at < 0) { wrong.push(`seat ${i} (${run.dir}) never reaches ${JSON.stringify(a)} in any record`); continue; }
    if (run.events[at].p !== i) wrong.push(`seat ${i} (${run.dir}) is first put on ${JSON.stringify(a)} by a "${run.events[at].t}" record about seat ${run.events[at].p}`);
  }
  return { checked, wrong };
}

/* The five source rules, over a file map, so a mutant can be run through exactly the same reader. */
function stormRules(raw, wholeTree) {
  const S = Object.fromEntries(Object.entries(raw).map(([f, s]) => [f, strip(s)]));
  const out = [], rule = (ok, good, bad) => out.push({ ok, text: ok ? good : bad });
  const driver = fnFrom(S[S_FLOW], "export async function runStormLive(");

  // 7. ONE PLACE AIMS THE STORM'S CAMERA. Call sites, not mentions: the definition and the import both
  //    name stormCamForEvent and neither aims anything.
  const callers = Object.entries(S)
    .map(([f, s]) => [f, tally(s, /\bstormCamForEvent\s*\(/g) - tally(s, /export function stormCamForEvent\s*\(/g)])
    .filter(([, n]) => n > 0);
  const aimed = callers.reduce((n, [, k]) => n + k, 0);
  const inConsumer = tally(fnFrom(S[S_ORCH], "export async function consumeEvent("), /\bstormCamForEvent\s*\(\s*e\s*\)/g);
  const inDriver = tally(driver, /\bstormCamForEvent\s*\(/g);
  rule(aimed === 1 && inConsumer === 1 && inDriver === 0,
    "the storm's wide shot is asked for in exactly ONE place — the one event consumer, off the `storm` event; the storm's driver asks for none",
    `the storm's wide shot is aimed from ${aimed} place(s) (${callers.map(([f, n]) => `${f}×${n}`).join(", ") || "nowhere"}); the one consumer has ${inConsumer}, runStormLive has ${inDriver} — a camera cue one tier fires twice is the fork this closed`);

  // 8. AND NOTHING ELSE TURNS A STORM INTO A SHOT — the dead whole-ocean cue is gone, and so is the flag
  //    that fed it. The rule is the FLAG: deleting the cue and leaving the flag is a fact nobody reads.
  const evTypeIn = Object.entries(S).filter(([, s]) => /\bevType\b/.test(s)).map(([f]) => f);
  rule(evTypeIn.length === 0,
    `the dead whole-ocean storm shot is gone, and so is the \`evType\` flag that fed it — nothing ${wholeTree ? "in src/" : "in the files this gate reads"} names it`,
    `\`evType\` is back in ${evTypeIn.join(", ")} — either the second storm camera returned or a flag nobody reads did`);

  // 9. THE STORM'S DRIVER DRAWS NO SHIP
  const draws = ["renderLiveShips", "paintShipAt", "paintShipAtPoint", "snapShipTo", "setShipGlideMs", "animateRimSweepRun"]
    .filter(n => new RegExp(`\\b${n}\\s*\\(`).test(driver));
  rule(!!driver && draws.length === 0,
    "runStormLive draws no ship of its own — every hull moves through the one consumer, off its own record",
    driver ? `runStormLive draws hulls itself: ${draws.join(", ")} — the second move path, which gave one boat a 0.8s head start on one screen`
           : "runStormLive could not be found — the reader did not reach its subject");

  // 10. THE RECORD IS PUBLISHED BEFORE THE BEAT, AND THE BEAT IS STILL THERE
  const note = driver.indexOf("g.noteStormOutcome(");
  const published = driver.indexOf("liveRender()", note);
  const beat = driver.search(/if\(drivenSquares\)await sleep\(STORM_STEP_MS\)/);
  const beats = tally(driver, /await sleep\(STORM_STEP_MS\)/g);
  const otherSleeps = (driver.match(/await sleep\(([^)]*)\)/g) || []).filter(x => !/STORM_STEP_MS/.test(x));
  rule(note > 0 && published > note && beat > published && beats === 1 && otherSleeps.length === 0,
    "each ship's record is published (noteStormOutcome, then liveRender) BEFORE the storm's one beat, and STORM_STEP_MS is the only thing pacing it",
    [note < 0 && "runStormLive no longer records each ship's outcome",
     note > 0 && published < note && "the record is not published after noteStormOutcome",
     beat < 0 && "the storm's beat (await sleep(STORM_STEP_MS), guarded by drivenSquares) is gone — a storm would flicker past",
     beat > 0 && beat < published && "the beat stands BEFORE the record is published — the old order, and how this tier got its head start",
     beats !== 1 && `STORM_STEP_MS is slept ${beats} times, not once per ship`,
     otherSleeps.length && `a second number paces the storm: ${otherSleeps.join(", ")} — STORM_STEP_MS is the one knob`].filter(Boolean).join("; "));

  // 11. THE ENGINE GIVES EVERY SHIP SOMETHING TO MOVE ON
  const nso = methodOf(S[S_ENG], "noteStormOutcome"), step = methodOf(S[S_ENG], "stormStep").replace(/\s+/g, "");
  const movedEv = /this\.ev\(\{t:blown\?"blownOut":"windmove",p:p\.idx\}\)/.test(nso);
  const heldEv = /this\.ev\(\{t:"anchorHold",p:p\.idx/.test(nso);
  const rimEv = /onRim\(nx\)\)\{this\.ev\(\{t:"windmove",p:p\.idx\}\);/.test(step);
  rule(movedEv && heldEv && rimEv,
    "the engine records every storm outcome where a screen can draw it: windmove/blownOut for a ship that moved, anchorHold for one land brought up, and windmove AT the rim square before a sweep",
    [!movedEv && "noteStormOutcome no longer records a moved ship's windmove/blownOut — nothing would move that hull on any screen",
     !heldEv && "noteStormOutcome no longer records anchorHold — a ship driven some way and then stopped by land is left behind",
     !rimEv && "stormStep no longer records windmove at the rim-entry square before sweeping — the ride has no square to start from"].filter(Boolean).join("; "));

  return out;
}

const stormRaw = Object.fromEntries(STORM_FILES.map(f => [f, read(f)]));
/* EVERY FILTER DECLARES ITSELF. In the working tree rule 8 walks the whole of src/; under --ref it can
   only read the files this gate names, which is a weaker claim, so it says which one it made. */
let wholeTree = false, treeFiles = stormRaw;
if (!ref) {
  const walkSrc = d => fs.readdirSync(path.join(REPO, d), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walkSrc(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
  treeFiles = Object.fromEntries(walkSrc("src").map(f => [f.split(path.sep).join("/"), fs.readFileSync(path.join(REPO, f), "utf8")]));
  wholeTree = true;
}
console.log(`\nthe storm's two doors (architecture item 24) — rule 8 reads ${wholeTree ? `all ${Object.keys(treeFiles).length} files under src/` : `only the ${STORM_FILES.length} files this gate names (--ref mode)`}`);
const stormOut = stormRules(treeFiles, wholeTree);

// 12. POSED AND RUN
if (ref) {
  console.log("  SKIP  the posed storm rule does not run under --ref: it recompiles two engine methods out of the source under test and drops them into the WORKING TREE's Game, which for an old ref is a pairing that never ran");
} else {
  try {
    const { runs, kinds } = posedStorms(treeFiles[S_ENG]);
    const { checked, wrong } = ownRecordMovesIt(runs);
    console.log(`  posed: ${runs.length} seeded storms, ${checked} hulls actually moved; outcomes reached — moved ${kinds.moved}, land-held ${kinds.landHeld}, hull-ahead ${kinds.blocked}, swept ${kinds.swept}`);
    const thin = [runs.length < 20 && "fewer than 20 storms could be posed", checked < 40 && "fewer than 40 hulls moved",
      !kinds.landHeld && "no ship was ever stopped by land", !kinds.swept && "no ship was ever swept into the trade winds"].filter(Boolean);
    stormOut.push({ ok: !wrong.length && !thin.length,
      text: (!wrong.length && !thin.length)
        ? `every one of the ${checked} hulls a storm moved is first put on its final square by its OWN record — a screen drawing only from records moves each hull in its own beat`
        : [...thin.map(t => `the corpus is too thin to be evidence: ${t}`), ...wrong.slice(0, 4)].join("; ") + (wrong.length > 4 ? ` (+${wrong.length - 4} more)` : "") });
  } catch (e) { stormOut.push({ ok: false, text: "the posed storm run threw: " + String(e && e.message || e) }); }
}
for (const r of stormOut) { if (r.ok) pass(r.text); else fail(r.text); }

/* RED-PROOF, in memory, against the real source. Only in working-tree mode: a mutant is a patch to the
   text this gate just read, and under --ref that text is not what is on disk. */
let stormProofOk = true;
if (ref) console.log("  (red-proof not run under --ref — the mutants patch the working tree's own source)");
else {
  const bent = (file, from, to) => (treeFiles[file] && treeFiles[file].includes(from))
    ? { ...treeFiles, [file]: treeFiles[file].replace(from, () => to) } : null;
  const MUTANTS = [
    ["the storm's driver aiming the camera itself again (this tier's second wide shot)",
      bent(S_FLOW, "  liveRender();\n  await narrateLastEvent();\n  if(stormGate)",
                   "  liveRender();\n  stormCamForEvent(g.events[g.events.length-1]);\n  await narrateLastEvent();\n  if(stormGate)"), [0]],
    ["the dead whole-ocean storm shot restored, flag and all",
      bent(S_STAGE, "  if (S.battle) { /* hold the shot on the fight until it resolves */ }",
                    "  const evType = S.evType; S.evType = null;\n  if (evType === \"storm\") camFull();\n  else if (S.battle) { /* hold the shot on the fight until it resolves */ }"), [1]],
    ["the flag kept alive after its only reader was deleted",
      bent(S_UTIL, "    window.__pp4.subjectSet = true;", "    window.__pp4.subjectSet = true;\n    window.__pp4.evType=e.t;"), [1]],
    ["this tier flushing the push itself again (renderLiveShips)",
      bent(S_FLOW, "    if(drivenSquares)await sleep(STORM_STEP_MS);", "    if(drivenSquares){renderLiveShips();await sleep(STORM_STEP_MS);}"), [2]],
    ["this tier painting the hull before a rim sweep again (paintShipAt)",
      bent(S_FLOW, "        publishNow();\n        await liveRender();",
                   "        if(drivenSquares){paintShipAt(player.idx,was);await sleep(RIM_SWEEP_TICK_MS);drivenSquares=false;}\n        publishNow();\n        await liveRender();"), [2]],
    ["the beat back above the record — the old order, and the head start with it",
      bent(S_FLOW, "    const moved=(player.pos[0]!==before[0]||player.pos[1]!==before[1]);\n    const evBefore=g.events.length;\n    g.noteStormOutcome(player,outcome,moved,wasDocked);",
                   "    if(drivenSquares)await sleep(STORM_STEP_MS);\n    const moved=(player.pos[0]!==before[0]||player.pos[1]!==before[1]);\n    const evBefore=g.events.length;\n    g.noteStormOutcome(player,outcome,moved,wasDocked);"), [3]],
    ["the storm's beat deleted, so a storm flickers past",
      bent(S_FLOW, "    if(drivenSquares)await sleep(STORM_STEP_MS);", "    if(drivenSquares){}"), [3]],
    ["a second, smaller knob added beside the storm's one beat",
      bent(S_FLOW, "    if(drivenSquares)await sleep(STORM_STEP_MS);", "    if(drivenSquares)await sleep(STORM_STEP_MS);\n    await sleep(120);"), [3]],
    ["the engine no longer recording a moved ship's push",
      bent(S_ENG, `this.ev({t:blown?"blownOut":"windmove",p:p.idx});`, `p.justDocked=p.justDocked;`), [4, 5]],
    ["the engine no longer recording the anchor a ship dropped short of land",
      bent(S_ENG, `if(outcome==="landHeld"){p.stormNote="held";this.ev({t:"anchorHold",p:p.idx,moved:moved?1:0});return;}`,
                  `if(outcome==="landHeld"){p.stormNote="held";return;}`), [4, 5]],
    ["the engine no longer recording the rim square a sweep started from",
      bent(S_ENG, `if(this.onRim(nx)){this.ev({t:"windmove",p:p.idx});this.tradewind(p,true);return "swept";}`,
                  `if(this.onRim(nx)){this.tradewind(p,true);return "swept";}`), [4]],
  ];
  for (const [what, mutant, idx] of MUTANTS) {
    let res = null;
    if (mutant) {
      try {
        res = stormRules(mutant, true);
        const { runs } = posedStorms(mutant[S_ENG], 60);
        const { checked, wrong } = ownRecordMovesIt(runs);
        res.push({ ok: !wrong.length && checked >= 40 });
      } catch (e) { if (res) res.push({ ok: false }); }
    }
    const red = !!res && idx.every(i => res[i] && !res[i].ok);
    if (!red) { stormProofOk = false; fails++; }
    console.log(`  ${red ? "PASS" : "FAIL"}  red-proof: ${what} ${red ? `turns rule${idx.length > 1 ? "s" : ""} ${idx.map(i => i + 7).join(", ")} red`
      : mutant ? (res ? `LEAVES rule(s) ${idx.filter(i => res[i] && res[i].ok).map(i => i + 7).join(", ")} GREEN` : "threw while being measured") : "could not be built (the source moved)"}`);
  }
}

console.log(fails ? `\nFAILED — ${fails} door(s) open${stormProofOk ? "" : " (and the storm red-proof did not hold)"}` : "\nPASSED — every reaction lives behind the one display door, the storm's wide shot and its boats included");
process.exit(fails ? 1 : 0);
