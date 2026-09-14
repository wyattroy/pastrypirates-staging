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
import { fileURLToPath } from "node:url";
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

/* 2. THE TURN FRAME: decided by the one consumer from the turn event; never by the engine machine's pick */
if (/e\.t\s*===\s*"turn"[^;]*sailCells\s*\(\s*e\.p\s*\)/.test(body))
  pass("the one consumer frames each captain's turn from the turn event, on every device");
else fail("consumeEvent does not frame the turn — the sail frame lives somewhere only one machine runs");
const pick = fnBody(flow, "pickCell") || "";
if (/sailCells\s*\(/.test(pick))
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

console.log(fails ? `\nFAILED — ${fails} door(s) open` : "\nPASSED — every reaction lives behind the one display door");
process.exit(fails ? 1 : 0);
