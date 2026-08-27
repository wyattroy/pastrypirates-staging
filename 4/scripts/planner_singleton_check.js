#!/usr/bin/env node
/* FIX-06 GATE — the engine ships exactly ONE bot planner, and still ships the live v3 helpers.
 *
 * WHY THIS EARNED A GATE RATHER THAN A READING. The project record claimed TWICE that the deleted
 * classic planner had "zero callers" — `.planning/REQUIREMENTS.md:130` and
 * `.planning/research/v2.0-intake/CODE-QUALITY.md:59`, both saying it occurred "exactly once in the
 * whole repo". Both were wrong: `scripts/bot_ladder4.js` held it in a live `const`, and that script
 * is the only thing in this repository that loads `4/`. Deleting the method without rewriting the
 * ladder would have broken the one instrument that measures this tree. An invariant the record has
 * already got wrong twice is worth checking mechanically instead of by reading it again.
 *
 * WHY BOTH DIRECTIONS ARE ASSERTED. The names differ by ONE CHARACTER. `legTurns` was dead;
 * `legTurns3` is the shipping brain's route costing. `turnsToWin`/`turnsToWin3`,
 * `turnsToWinIf`/`turnsToWin3If`, and the tour helper are the same shape. A gate that only asserted
 * an ABSENCE would pass just as happily against an emptied file, or against a tree where the LIVE
 * helper was deleted by mistake and the dead one left behind — the "reassuring, not silent" failure
 * mode of docs/HARD-WON-LESSONS.md §3. So every absence here is paired with a presence.
 *
 * WHAT IT GATES
 *   ONE PLANNER      Game.prototype carries no classic planner: the property is undefined AND the
 *                    name is absent from the prototype's own property names. Absence from a
 *                    prototype is checked at RUNTIME, because that is the only thing a caller can
 *                    actually reach; source text cannot tell you what a class ended up with.
 *   THE LIVE BRAIN   Game.prototype still carries planTurn, planTurnV3, chooseAction, and the four
 *                    v3-suffixed helpers. This is the half that catches the one-character mistake.
 *   NO DEAD SOURCE   4/src/engine/index.js contains the deleted planner's name zero times — code
 *                    AND comment, because a comment describing a function that no longer exists is
 *                    a lie the next reader has to disprove. Each of the four deleted helpers is
 *                    absent as a METHOD DECLARATION, matched on the declaration shape (line-start
 *                    indent, name, open paren) rather than the bare word, so a v3-suffixed name can
 *                    never be mistaken for its un-suffixed namesake. The same regex is run against
 *                    the four LIVE declarations and must FIND them, which is what proves the
 *                    matcher works rather than merely failing to match anything.
 *   ONE TOLERANCE    FIX-06's precision edge. The looser float tie-break tolerance lived only inside
 *                    the deleted planner, so it must now occur zero times, and the tighter one used
 *                    by the race planner must occur on exactly three lines. Resolved by removal, not
 *                    by reconciliation.
 *   DETERMINISM      4/src/engine/ still holds zero wall-clock and zero random sources. Phase 3
 *                    records a determinism corpus against this engine and a single non-seeded call
 *                    makes seeded lockstep replay meaningless (docs/DETERMINISM-RERECORD.md).
 *
 * QUOTED vs BARE. Every substring counted here is counted in 4/src/engine/index.js, never in this
 * file, so prose in this header may name the deleted symbols freely. That is deliberate: the trap
 * 4/scripts/seat_arg_check.js hit on its first run — failing on the comment documenting the bug it
 * existed to catch (HARD-WON-LESSONS §1b) — is avoided by scanning a different file, not by
 * censoring the explanation.
 *
 * CONTROLS, because a harness is unreviewed code (HARD-WON-LESSONS §3). Every run prints quantities
 * whose value is known before anything is measured: the engine source is non-empty, the prototype
 * carries a plausible number of methods (a green run over an empty class is the shape of check this
 * project has shipped before), and the declaration matcher is shown finding real declarations.
 *
 * WHY THE EXPLICIT EXIT. This gate imports the engine, following the convention
 * 4/scripts/stage_import_check.js and 4/scripts/pass_coin_test.js set. Every assertion runs before
 * the exit; the exit carries the failure count.
 *
 * FAILURE DEMONSTRATION (CLAUDE.md §4 — a check nobody has seen fail is not yet a check). Both
 * directions were demonstrated with observed exit codes and are recorded in 01-05-SUMMARY.md.
 *
 * Run: node 4/scripts/planner_singleton_check.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "../src/engine/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");                       // -> 4/
const ENGINE_DIR = path.join(ROOT, "src", "engine");           // -> 4/src/engine
const ENGINE_PATH = path.join(ENGINE_DIR, "index.js");
const ENGINE_SRC = fs.readFileSync(ENGINE_PATH, "utf8");

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(78)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

function countOf(src, needle) { return src.split(needle).length - 1; }
function countLines(src, needle) { return src.split("\n").filter((l) => l.includes(needle)).length; }
// A METHOD DECLARATION, not a bare word: line start, indent, the exact name, then the open paren.
// `legTurns` cannot match `  legTurns3(...)` because the paren must follow the name immediately,
// and it cannot match `const home=this.legTurns3(...)` because the name must start the line.
function declaredAsMethod(src, name) {
  return new RegExp("^[ \\t]*" + name + "[ \\t]*\\(", "m").test(src);
}

/* The names, written down once, in the two lists this gate exists to keep apart. */
const DEAD_PLANNER = "planTurnClassic";
const DEAD_HELPERS = ["legTurns", "turnsToWin", "turnsToWinIf", "denialValue"];
const LIVE_HELPERS = ["legTurns3", "turnsToWin3", "turnsToWin3If", "tour3"];
const LIVE_PLANNERS = ["planTurn", "planTurnV3", "chooseAction"];
const CLOCK_SOURCES = ["Math.random", "Date.now", "performance.now"];
const LOOSE_EPSILON = "1e-9";
const TIGHT_EPSILON = "1e-12";

console.log("\nFIX-06 — one planner in 4/src/engine/index.js\n");

/* ================= CONTROLS ================= */
console.log("  -- controls, known before anything is measured --");
checkTrue("CONTROL: the engine source was read and is non-empty", ENGINE_SRC.length > 0);
const protoNames = Object.getOwnPropertyNames(Game.prototype);
console.log(`         4/src/engine/index.js is ${ENGINE_SRC.split("\n").length} lines; Game.prototype carries ${protoNames.length} own properties`);
checkTrue("CONTROL: Game.prototype carries a plausible number of methods", protoNames.length > 50);
checkTrue("CONTROL: the declaration matcher finds a declaration it should find", declaredAsMethod(ENGINE_SRC, "chooseAction"));
checkTrue("CONTROL: the declaration matcher rejects a name that is only ever called", !declaredAsMethod(ENGINE_SRC, "this.tour3"));

/* ================= HALF ONE: the runtime prototype ================= */
console.log("\n  -- Game.prototype: exactly one whole-turn planner --");
check(`the classic planner is undefined on Game.prototype`, typeof Game.prototype[DEAD_PLANNER], "undefined");
check(`the classic planner is absent from the prototype's own property names`, protoNames.includes(DEAD_PLANNER), false);
for (const h of DEAD_HELPERS)
  check(`the dead helper ${h} is absent from the prototype`, protoNames.includes(h), false);

console.log("\n  -- Game.prototype: the shipping brain is all still there --");
for (const m of LIVE_PLANNERS) {
  check(`${m} is present on Game.prototype`, protoNames.includes(m), true);
  check(`${m} is callable`, typeof Game.prototype[m], "function");
}
for (const h of LIVE_HELPERS) {
  check(`the LIVE v3 helper ${h} is present on Game.prototype`, protoNames.includes(h), true);
  check(`the LIVE v3 helper ${h} is callable`, typeof Game.prototype[h], "function");
}

/* ================= HALF TWO: the source text ================= */
console.log("\n  -- 4/src/engine/index.js as raw text --");
check(`the classic planner's name appears nowhere, code or comment`, countOf(ENGINE_SRC, DEAD_PLANNER), 0);
for (const h of DEAD_HELPERS)
  check(`${h} is not declared as a method`, declaredAsMethod(ENGINE_SRC, h), false);
for (const h of LIVE_HELPERS)
  check(`the LIVE v3 helper ${h} IS declared as a method`, declaredAsMethod(ENGINE_SRC, h), true);
checkTrue("planTurn still dispatches to the race planner", /planTurn\s*\(p\)\s*\{\s*return this\.planTurnV3\(p\);/.test(ENGINE_SRC));

console.log("\n  -- FIX-06's precision edge: one tie-break tolerance, not two --");
check(`the looser tolerance is gone (it lived only inside the deleted planner)`, countLines(ENGINE_SRC, LOOSE_EPSILON), 0);
check(`the tighter tolerance is on exactly three lines`, countLines(ENGINE_SRC, TIGHT_EPSILON), 3);

console.log("\n  -- 4/src/engine/ is still determinism-clean --");
const engineFiles = fs.readdirSync(ENGINE_DIR).filter((f) => f.endsWith(".js")).sort();
checkTrue("CONTROL: the engine directory has files to scan", engineFiles.length > 0);
console.log(`         scanning ${engineFiles.length} file(s): ${engineFiles.join(", ")}`);
for (const src of CLOCK_SOURCES) {
  let n = 0;
  for (const f of engineFiles) n += countOf(fs.readFileSync(path.join(ENGINE_DIR, f), "utf8"), src);
  check(`no ${src} anywhere under 4/src/engine/`, n, 0);
}

console.log(`\n  ${protoNames.length} prototype member(s) inspected, ${failures} failure(s)\n`);
process.exit(failures ? 1 : 0);
