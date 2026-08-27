#!/usr/bin/env node
/* A CONFIRMED QUANTITY MUST REACH THE DECISION LOG.
 *
 * playtest 21, the counter-offer stall. ask() logs which BUTTON was pressed; the coin slider's
 * number lived in a `ref` object the button knew nothing about. MEASURED on a real trade: the
 * captain dragged the slider to 6 and the decision log gained exactly `[0]`. A solo refresh then
 * replayed that trade at the slider's floor — a different offer, a different answer, a different
 * r() stream, and every later recorded decision landing on a prompt it was never recorded against.
 * From the seat: "the game was simply reset and stalled and the captains log was empty."
 *
 * WHY A SOURCE-SHAPE GATE RATHER THAN A PLAYED GAME. The failure needs a browser, a DOM slider and
 * a page reload to reproduce end to end — none of which a node harness has. What it does NOT need
 * is any of that to be *checked*: the invariant is structural. A quantity the player confirms is a
 * decision, so it passes through the one seam that records and replays decisions. This asserts that
 * shape, in the same style as ui_contract_check.js's assertion 7.
 *
 * It is deliberately narrow. It cannot tell you the seam is CORRECT — dlog_replay_test.js and a
 * driven refresh do that. It tells you nobody quietly added a third quantity control, or replaced
 * `logQuantity(n)` with a bare `n`, which is precisely how this bug arrived.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
/* COMMENTS ARE STRIPPED BEFORE ANYTHING IS COUNTED, and this gate learned that the hard way in the
   same commit that widened it: its first run over util.js failed on the SENTENCE documenting what
   the control does — "`sl.ref.value` is where the running position lands" — reading a line of prose
   as a second reader of the answer. HARD-WON-LESSONS §1b records the identical failure in
   seat_arg_check: "a check that cannot tell prose from code makes writing the explanation an
   offence." The shared tokenizer is used rather than a third hand-rolled stripper, because §1b's
   other half is that a naive scanner reads the lone quote in a regex literal like /"/g as a string
   and swallows the rest of the line. */
import { stripCommentSegments } from "./lib/js_region_tokenizer.js";

// THE GATE'S ROOT IS WHEREVER THIS FILE LIVES (HARD-WON-LESSONS §3): /4 and the root game have
// identical internal paths, so a relative walk from the cwd would happily scan the other tree and
// pass on code this milestone does not ship.
const HERE = dirname(fileURLToPath(import.meta.url));
const FLOW = join(HERE, "..", "src", "ui", "flow.js");
const rawSrc = readFileSync(FLOW, "utf8");
const src = stripCommentSegments(rawSrc);
/* WIDENED TO util.js IN THE SAME COMMIT AS THE CHANGE THAT MADE IT NECESSARY (05-01 Task 3).
   Before MP-08 the slider's `ref` was touched only in flow.js, so scanning one file was the whole
   truth. ask() now WRITES ref.value from util.js when a remote captain's {i,n} comes home — a file
   this gate did not read. Left alone it would have kept passing while a second writer existed,
   which is exactly the VACUOUS gate failure TRADE-SYSTEM §7 records: a check that cannot fire still
   reads as protection. TRADE-SYSTEM I4's corollary is the rule — list what reads a quantity, GATES
   INCLUDED, before changing how it is produced. */
const UTIL = join(HERE, "..", "src", "ui", "util.js");
const rawUsrc = readFileSync(UTIL, "utf8");
const usrc = stripCommentSegments(rawUsrc);

const fails = [];
const passes = [];
// detail explains a FAILURE — printing it beside a pass reads as a failure that passed
const ok = (name, cond, detail = "") => cond ? passes.push(name) : fails.push(name + (detail ? "  — " + detail : ""));

/* Slice a function body by brace-matching from its declaration, so the assertions below are made
 * against THAT function and not against a coincidence elsewhere in a 2,400-line file. */
function body(name, text = src) {
  const src = text;
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return null;
  const open = src.indexOf("{", i);
  if (open < 0) return null;
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(open, j + 1);
  }
  return null;
}

/* 1. The seam exists, and it is a REAL decision seam — it must both record live and consume on
 *    replay. One without the other is worse than neither: recording alone makes every replay one
 *    entry out of step from the first coined trade onwards. */
const lq = body("logQuantity");
ok("logQuantity() exists in src/ui/flow.js", !!lq);
if (lq) {
  ok("logQuantity() RECORDS the number when live", /onLogDecision\(\s*n\s*\)/.test(lq),
     "it must call netHandlers().onLogDecision(n)");
  ok("logQuantity() REPLAYS the recorded number", /appState\.dlog\[appState\.dlogIdx\+\+\]/.test(lq),
     "it must consume the next dlog entry while replaying");
  ok("logQuantity() leaves replay when the log runs out", /endReplay\(\)/.test(lq),
     "same fall-through ask()/pickCell()/bakeoffPrompt() use");
}

/* 2. Every control that confirms a quantity routes its answer through that seam. Both of them —
 *    which control a seat gets is decided by decisionIsLocal(), and a log whose LENGTH depends on
 *    that routing is a log that only replays under the same routing. */
/* ONE CONTROL NOW, SO ONE NAME. This list read ["coinSlider","coinStepper"] until 05-01 Task 3
   deleted the stepper (MP-08, D-55) — and it went RED by name the moment that happened, which is
   this re-anchor's own red-proof and is recorded in 05-01-SUMMARY.md. */
for (const fn of ["coinSlider"]) {
  const b = body(fn);
  ok(`${fn}() exists`, !!b);
  if (!b) continue;
  /* COUNTED, not pattern-matched against one return shape. The first version of this gate looked
     for `=== "ok") return <expr>;` and read the expression — which silently stopped seeing a
     confirm the moment that branch was reformatted into a block, leaving the gate green while
     covering half of what it claimed. Counting is immune to how the branch is written: every
     confirmed quantity in the function needs its own trip through the seam. */
  const confirms = (b.match(/===\s*"ok"/g) || []).length;
  const logged = (b.match(/logQuantity\(/g) || []).length;
  ok(`${fn}() has a confirm branch`, confirms > 0,
     'no `=== "ok"` found — has the confirm value been renamed?');
  ok(`${fn}() logs a quantity for every confirm`, confirms > 0 && logged >= confirms,
     `${confirms} confirm branch(es), ${logged} logQuantity() call(s) — a confirm returns its number unrecorded`);
}

/* 3. Nothing else may READ the slider's live value as an answer. `ref.value` is the control's
 *    running position — written by the input handler as the thumb moves — and the ANSWER is
 *    whatever the confirm hands to logQuantity. A second reader would be a second, unlogged
 *    quantity. Writes (`ref.value=`) are the handler doing its job and are not counted. */
const READ = /(?<!\.)\bref\.value(?!\s*=[^=])/g;
const reads = [...src.matchAll(READ)].length;
const inSlider = ((body("coinSlider") || "").match(READ) || []).length;
ok("the slider's live value is read only inside coinSlider()", reads === inSlider,
   `${reads} reads of ref.value in flow.js, ${inSlider} of them in coinSlider()`);

/* 4. THE STEPPER IS GONE AND MUST STAY GONE. Removing a mechanism means removing what fed it; an
 *    unused second quantity control is how a dead branch gets rebuilt, and while it existed the
 *    decision log's LENGTH depended on how the trade was routed (an N-coin counter cost N+2 entries
 *    remotely and 2 locally — measured 2026-08-23: 12 entries for one guest's 8-coin counter). */
ok("coinStepper() no longer exists in src/", !/function\s+coinStepper\s*\(/.test(src) && !/function\s+coinStepper\s*\(/.test(usrc),
   "a second quantity control is back — the decision log's length now depends on routing again");

/* 5. ONE BUILDER, AND ONLY ONE PLACE MAY WRITE THE ANSWER INTO IT (05-01 Task 3).
 *    `ref` is where the confirmed number lands. flow.js's wireSlider call and util.js's ask() are
 *    the only two writers there may be: the drag itself, and the remote {i,n} unpack. A third would
 *    be a second, unlogged quantity — the playtest-21 failure with a different shape. */
const UTIL_WRITES = /\bref\.value\s*=[^=]/g;
const utilWrites = [...usrc.matchAll(UTIL_WRITES)].length;
const inWire = ((body("wireSlider", usrc) || "").match(UTIL_WRITES) || []).length;
const inAsk = ((body("ask", usrc) || "").match(UTIL_WRITES) || []).length;
ok("every ref.value WRITE in util.js is inside wireSlider() or ask()", utilWrites === inWire + inAsk,
   `${utilWrites} writes in util.js, ${inWire} in wireSlider(), ${inAsk} in ask() — a third writer is a second, unlogged quantity`);
ok("ask() lands a remote captain's dragged number in ref", inAsk >= 1,
   "nothing in ask() writes ref.value — a guest's number never reaches logQuantity and the trade replays at the slider's floor (HARD-WON-LESSONS \u00a75)");
/* ITS OWN REGEX, AND THAT IS THE POINT. Reusing READ here was VACUOUS and its drill proved it:
 * READ carries a `(?<!\.)` lookbehind, written when the only reference was a bare local `ref` in
 * flow.js. Every mention in util.js is reached through an object — `sl.ref.value`,
 * `extra.slider.ref.value` — so the lookbehind blocked the match and the assertion could not fire
 * for the one shape it exists to catch. A check that cannot fail still reads as protection
 * (TRADE-SYSTEM §7). Caught by planting the fault and watching it pass; fixed by dropping the
 * lookbehind, which flow.js's own assertion still needs and this one must not have. */
const UTIL_READ = /\bref\.value(?!\s*=[^=])/g;
ok("util.js reads ref.value nowhere", [...usrc.matchAll(UTIL_READ)].length === 0,
   "util.js READS the running position — the answer belongs to the caller's confirm branch, which is what calls logQuantity()");

/* 6. THE SLIDER IS ONE BUILDER NAMED BY BOTH TIERS (MP-08, rule 23). The markup carries the two
 *    class names stage.js identifies the control by, so a second copy that differs by one of them
 *    gives a guest a flat card where the host gets the radial bloom. Orchestration parity is
 *    scripts/host_guest_parity_check.js's job; this asserts there is exactly ONE definition. */
const wrapDefs = (usrc.match(/export function sliderWrapHTML\s*\(/g) || []).length;
ok("exactly one sliderWrapHTML() definition", wrapDefs === 1, `${wrapDefs} found`);
ok("nothing builds apSliderWrap markup outside that builder",
   ((src + usrc).match(/class="apSliderWrap"/g) || []).length === 1,
   "a second piece of slider markup exists — stage.js reads .apSliderWrap and .apSlider BY CLASS, so a copy that differs by one name renders a flat card on whichever tier has it");

console.log("\ndlog quantity check — src/ui/flow.js + src/ui/util.js");
/* FALSIFIABLE, NOT A BARE "OK". The comment stripper is the one part that could quietly blank the
   thing it inspects, and a green run over nothing at all is a shape this project has shipped
   before (HARD-WON-LESSONS §1b). Print what was actually scanned. */
/* NON-WHITESPACE, not total length. stripCommentSegments replaces comment characters with SPACES
   so byte offsets stay valid, which means `src.length` is unchanged by stripping and a guard built
   on it could never fire — the very shape of vacuity this gate exists to refuse. Counting code
   characters is falsifiable: blank the file and this number collapses. */
const codeChars = t => t.replace(/\s+/g, "").length;
const flowCode = codeChars(src), utilCode = codeChars(usrc);
console.log(`scanned ${flowCode} code chars of flow.js and ${utilCode} of util.js ` +
            `(comments stripped: ${codeChars(rawSrc) - flowCode} and ${codeChars(rawUsrc) - utilCode} chars of prose set aside)`);
if (flowCode < 20000 || utilCode < 20000) fails.push(`the stripper blanked a file — flow.js ${flowCode} code chars, util.js ${utilCode}; refusing to report on source that cannot be the real one`);
console.log("\nPASS (" + passes.length + ")");
passes.forEach(s => console.log("  ok   " + s));
console.log("FAIL (" + fails.length + ")");
fails.forEach(s => console.log("  FAIL " + s));
if (fails.length) {
  console.log("\nA quantity the captain confirms is a DECISION. Route it through logQuantity() in");
  console.log("src/ui/flow.js, or a solo refresh replays it at the control's floor.\n");
  process.exit(1);
}
console.log("");
