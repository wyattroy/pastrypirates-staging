#!/usr/bin/env node
/* FIX-01 GATE — the new game's turn-clock preference must not reach the game real players play.
 *
 * WHY THIS EXISTS. playpastrypirates.com and playpastrypirates.com/4 are two games served from ONE
 * origin, so they share one localStorage namespace. The new game used to write the un-namespaced
 * pp_timerOff; the live game READS that key at src/orchestrator.js:1399 and PUSHES IT TO THE WHOLE
 * ROOM at :1404. So opening /4 switched the clock off in the live game, and a host who had visited
 * /4 handed that setting to everyone at their table. This gate is what stops it coming back.
 *
 * WHAT IT GATES
 *   D-01  All five 4/-side sites use the per-game key, and the legacy key literal survives in
 *         exactly ONE place tree-wide — inside cleanupLegacyTimerKey, where it is being removed.
 *   D-02  The cleanup is marker-guarded and runs at most once per browser. A delete-on-every-load
 *         would mean /4 permanently vandalises the live game's preference — the exact defect
 *         FIX-01 exists to fix, from the other direction. This is the assertion that matters most
 *         in this file, and it has been observed failing (see FAILURE DEMONSTRATION below).
 *   D-03  The turn-clock default is UNCHANGED and still OFF. FIX-01 changed the key, never the
 *         default. The OFF default is Wyatt's deliberate call (REQUIREMENTS.md:169) and reads like
 *         a bug only to someone who has seen v1. Asserted here so nobody "fixes" it.
 *   D-04  The three shared identity keys stay un-prefixed — share who you are, split how you play.
 *         Namespacing them would break the player's own name and id at the Phase 6 cutover, when
 *         the promoted game and /classic share one origin.
 *
 * TWO HALVES. Half one reads src/**\/*.js as raw text (the source-text assertion convention of
 * scripts/ui_contract_check.js — deliberately NO comment stripping on a raw substring match).
 * Half two IMPORTS cleanupLegacyTimerKey and drives it against a fake store, because source shape
 * cannot tell you whether the marker guard actually works. That import is only possible because
 * 01-01 made src/ui/stage.js load under Node at all; before that commit this half could not
 * have been written.
 *
 * QUOTED vs BARE. Half one counts QUOTED key literals, so a key name mentioned in PROSE must be
 * written bare. That is not pedantry — it is HARD-WON-LESSONS §1b, where a gate's first run failed
 * on the comment documenting the bug it existed to catch, making writing the explanation an
 * offence. cleanupLegacyTimerKey's own header carries the same note for the next editor.
 *
 * WHY THE EXPLICIT EXIT. Importing stage.js arms its module-scope setInterval watchdog, which
 * holds Node's event loop open forever after a perfectly SUCCESSFUL import. Same reason
 * scripts/stage_import_check.js forces its exit. A gate that hangs CI is worse than no gate.
 *
 * FAILURE DEMONSTRATION (CLAUDE.md §4 — a check nobody has seen fail is not yet a check). The
 * marker guard was temporarily bypassed so the cleanup ran on every call; the D-02 assertions
 * failed by name and the gate exited 1. Recorded in 01-02-SUMMARY.md with the observed output.
 *
 * Run: node scripts/pp4_timeroff_check.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");          // -> 4/
const SRC = path.join(ROOT, "src");               // -> src
const STAGE_PATH = path.join(SRC, "ui", "stage.js");
const ORCH_PATH = path.join(SRC, "orchestrator.js");

const LEGACY_KEY = '"pp_timerOff"';
const GAME_KEY = '"pp4_timerOff"';
const MARKER_KEY = '"pp4_timerOffCleaned"';
const CLEANUP_FN = "cleanupLegacyTimerKey";

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(72)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}
function checkTrue(name, actual) { check(name, actual, true); }

// ---------------------------------------------------------------------------
// Half one — source assertions
// ---------------------------------------------------------------------------

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out.sort();
}

const files = walkJs(SRC);
// A count is falsifiable; a bare "OK" is not. A green run over an empty tree is a shape this
// project has shipped before (HARD-WON-LESSONS §3), so the scan size is printed and asserted.
console.log(`Scanned ${files.length} file(s) under src/**/*.js`);
checkTrue("the scan found a non-trivial number of files (not an empty tree)", files.length >= 20);

// Every quoted occurrence of the legacy key, with file:line, across the whole tree.
const legacyHits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes(LEGACY_KEY)) legacyHits.push(`${path.relative(ROOT, f)}:${i + 1}`);
  });
}
check(`D-01 the legacy key literal appears exactly once under src/ (at ${legacyHits.join(", ") || "nowhere"})`,
  legacyHits.length, 1);

/* Locate the cleanup function's body by matching braces, NOT by line number — line numbers rot.
 * The scanner skips string and template literals, line comments and block comments, so a brace
 * inside a quoted string can never miscount. The scanner is itself unreviewed code and is the one
 * part that could quietly blank the thing it inspects, so it is followed immediately by controls
 * whose values are already known. */
function functionBody(src, declNeedle) {
  const declAt = src.indexOf(declNeedle);
  if (declAt < 0) return null;
  const openAt = src.indexOf("{", src.indexOf(")", declAt));
  if (openAt < 0) return null;
  let depth = 0;
  for (let i = openAt; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '"' || c === "'" || c === "`") {           // skip a string literal
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) { if (src[i] === "\\") i++; i++; }
      continue;
    }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i = src.indexOf("*/", i + 2); if (i < 0) return null; i++; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(openAt, i + 1); }
  }
  return null;
}

const stageSrc = fs.readFileSync(STAGE_PATH, "utf8");
const orchSrc = fs.readFileSync(ORCH_PATH, "utf8");
const cleanupBody = functionBody(stageSrc, `export function ${CLEANUP_FN}`);

// Controls on the brace scanner itself — if it returned garbage, these fail loudly rather than
// letting the D-01 containment assertion below go vacuous.
checkTrue("control: the cleanup body was extracted at all", cleanupBody != null);
checkTrue("control: the extracted body is plausibly sized (50..2000 chars)",
  cleanupBody != null && cleanupBody.length > 50 && cleanupBody.length < 2000);
checkTrue("control: the extracted body contains the removal call it is supposed to contain",
  cleanupBody != null && cleanupBody.includes("store.removeItem("));
checkTrue("control: the extracted body stops before initStage (it is one function, not the rest of the file)",
  cleanupBody != null && !cleanupBody.includes("export function initStage"));

checkTrue(`D-01 the one legacy key literal sits INSIDE ${CLEANUP_FN}`,
  cleanupBody != null && cleanupBody.includes(LEGACY_KEY));

// The five renamed sites. grep-style line counts, matching the plan's acceptance criteria.
const countLines = (src, needle) => src.split("\n").filter(l => l.includes(needle)).length;
checkTrue("D-02 the one-time marker key literal is present in src/ui/stage.js",
  stageSrc.includes(MARKER_KEY));
checkTrue(`D-02 ${CLEANUP_FN} is exported from src/ui/stage.js`,
  stageSrc.includes(`export function ${CLEANUP_FN}`));
checkTrue(`D-02 initStage() calls ${CLEANUP_FN}`, stageSrc.includes(`${CLEANUP_FN}(localStorage)`));

/* D-03's seed assertion (off-by-default, written inside initStage) left with the shot clock,
 * 2026-08-28 — there is no live seed to assert. The per-game KEY is deliberately left on players'
 * devices so their preference is honoured when the clock returns; the D-02 legacy-key cleanup
 * checks above still stand, because that hygiene is about the classic game's namespace. */

/* D-04 — the three shared identity keys are still present, un-prefixed, somewhere under src/.
 * Asserted as PRESENCE, never as absence-of-a-prefixed-variant: an absence assertion is satisfied
 * by an empty tree and would go green if these keys were deleted outright. */
const allSrc = files.map(f => fs.readFileSync(f, "utf8")).join("\n");
for (const key of ['"pp_id"', '"pp_lastName"', '"pp_muted"']) {
  checkTrue(`D-04 the shared identity key ${key} is still present un-prefixed under src/`,
    allSrc.includes(key));
}

// ---------------------------------------------------------------------------
// Half two — the cleanup's real runtime behaviour, against a fake store
// ---------------------------------------------------------------------------

const { cleanupLegacyTimerKey } = await import("../src/ui/stage.js");
check(`${CLEANUP_FN} is exported as a function`, typeof cleanupLegacyTimerKey, "function");

/* A fake store, backed by a Map, that also RECORDS the keys removeItem was called with. The D-02
 * case turns on "no removal was attempted", which a store that only reports final contents cannot
 * distinguish from "removed, then something put it back". */
function fakeStore(seed) {
  const m = new Map(Object.entries(seed || {}));
  const removals = [];
  return {
    removals,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { removals.push(k); m.delete(k); },
    has: k => m.has(k),
    peek: k => (m.has(k) ? m.get(k) : null),
  };
}
const throwingStore = {
  getItem() { throw new Error("storage unavailable"); },
  setItem() { throw new Error("storage unavailable"); },
  removeItem() { throw new Error("storage unavailable"); },
};

// Case 1 — marker absent, legacy key holds the string one.
let s = fakeStore({ pp_timerOff: "1" });
check("case 1 (marker absent, legacy=1): returns true", cleanupLegacyTimerKey(s), true);
check("case 1: the legacy key is gone", s.has("pp_timerOff"), false);
check("case 1: the marker is set to the string one", s.peek("pp4_timerOffCleaned"), "1");

// Case 2 — marker absent, legacy key absent. "Ran and found nothing" must become distinguishable
// from "never ran", and the MARKER is what carries that, never the legacy value.
s = fakeStore({});
check("case 2 (marker absent, legacy absent): returns true", cleanupLegacyTimerKey(s), true);
check("case 2: the marker is set even though there was nothing to delete", s.peek("pp4_timerOffCleaned"), "1");
check("case 2: a second call now returns false — ran-and-found-nothing is not never-ran",
  cleanupLegacyTimerKey(s), false);

// Case 3 — marker absent, legacy key holds the EMPTY STRING. A falsy-but-present value must not be
// skipped: "" and "0" are both legitimate stored values and both falsy (HARD-WON-LESSONS §3).
s = fakeStore({ pp_timerOff: "" });
check("case 3 (marker absent, legacy=empty string): returns true", cleanupLegacyTimerKey(s), true);
check("case 3: the empty-string legacy key is removed, not skipped as falsy", s.has("pp_timerOff"), false);
check("case 3: the marker is set", s.peek("pp4_timerOffCleaned"), "1");

// Case 4 — D-02, THE ONE THAT MATTERS. Marker already present, legacy key re-planted by the live
// game. The cleanup must not touch it. A delete-on-every-load fails here and nowhere else.
s = fakeStore({ pp_timerOff: "1", pp4_timerOffCleaned: "1" });
check("case 4 (D-02, second load, legacy re-planted): returns false", cleanupLegacyTimerKey(s), false);
check("case 4 (D-02): the re-planted legacy key SURVIVES untouched", s.peek("pp_timerOff"), "1");
check("case 4 (D-02): no removal was even attempted", s.removals.length, 0);

// Case 5 — every store method throws (Safari private mode). Returns false, throws nothing, logs
// nothing — the try/catch-swallow convention at src/ui/audio.js:177-183.
let threw = false, ret = null;
try { ret = cleanupLegacyTimerKey(throwingStore); } catch (e) { threw = true; }
check("case 5 (every store call throws): does not throw", threw, false);
check("case 5: returns false", ret, false);

console.log(failures
  ? `\nFAILED — ${failures} failing check(s)`
  : "\nPASSED — 0 failing check(s)");
// Explicit exit: stage.js's watchdog interval holds the event loop open after a successful import.
process.exit(failures ? 1 : 0);
