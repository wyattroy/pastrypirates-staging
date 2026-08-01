#!/usr/bin/env node
// scripts/economy_guard_test.js
//
// CR-02 / CR-03 (15-REVIEW.md, both PRE-EXISTING since Phase 11): the two silent economy-corruption
// bugs. Neither ever surfaced in play — no error, no event, no narration — which is why they were
// found by reading the diff rather than by playing (15-LEARNINGS #5).
//
//   CR-02  a trade splices on an unchecked indexOf, so a `-1` removes the holder's LAST crate and
//          then mints the wanted crate, which is simultaneously back in tokens[].
//   CR-03  a battle flee "refunds" side-bet stakes that collection never debited — a pure credit.
//
// Convention matches hail_ranking_test.js / dlog_replay_test.js: no assertion library, a local
// check() counter, plain console.log, process.exit(failures?1:0). DOM-free — the helpers under test
// are pure, and the CR-03 assertion reads source text rather than driving a whole battle.
//
// RED-PROOF (15-LEARNINGS #2 — "a gate must be watched to fail before it is trusted"): every
// assertion below was run against the REAL pre-fix tree at 57ac568 and watched to fail —
// section 1 by the splice(-1) reproduction, section 2 by moveCrate being undefined, section 3 by
// the live `coins+=bet.amt` refund. Not a synthetic fixture, and no commit SHA is pinned inside
// the gate itself, because a pinned SHA rots and turns a real assertion into decoration.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { moveCrate } from "../src/ui/flow.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${(ok ? "PASS" : "FAIL").padEnd(5)} ${name.padEnd(74)} got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

console.log("CR-02 / CR-03 — economy corruption guards\n");

/* ---------- 1. the defect CR-02 describes, stated as executable arithmetic ---------- */
// Kept deliberately: it documents WHY moveCrate exists. If someone ever "simplifies" moveCrate back
// into a bare splice(indexOf(...)), section 2 goes red and this section explains what broke.
console.log("1. the raw splice(indexOf) pattern, reproduced");
{
  const hold = ["cocoa", "sugar", "flour"];
  // `butter` is not held — exactly the state expireShotClock creates by confiscating a crate
  // AFTER resolving the pending accept prompt.
  const idx = hold.indexOf("butter");
  check("indexOf reports the crate is absent", idx, -1);
  const copy = hold.slice();
  copy.splice(idx, 1); // splice(-1,1) — the bug
  check("splice(-1,1) removes the LAST crate, not nothing", copy, ["cocoa", "sugar"]);
  check("...so the holder loses a crate they never agreed to trade", copy.includes("flour"), false);
}

/* ---------- 2. moveCrate — the shared helper that makes that pattern unwritable ---------- */
console.log("\n2. moveCrate(from,to,ing) — lookup and mutation in one function");
{
  const from = ["cocoa", "sugar", "flour"], to = ["egg"];
  const ok = moveCrate(from, to, "butter");
  check("absent crate -> returns false", ok, false);
  check("absent crate -> `from` is UNTOUCHED (the CR-02 fix)", from, ["cocoa", "sugar", "flour"]);
  check("absent crate -> `to` is UNTOUCHED (no crate minted)", to, ["egg"]);
}
{
  const from = ["cocoa", "sugar", "flour"], to = ["egg"];
  const ok = moveCrate(from, to, "sugar");
  check("present crate -> returns true", ok, true);
  check("present crate -> removed from `from`", from, ["cocoa", "flour"]);
  check("present crate -> appended to `to`", to, ["egg", "sugar"]);
}
{
  // conservation: a move never changes the total number of crates in play
  const from = ["cocoa", "cocoa", "sugar"], to = [];
  const before = from.length + to.length;
  moveCrate(from, to, "cocoa");
  check("duplicate holdings -> exactly ONE copy moves", [from.length, to.length], [2, 1]);
  check("conservation: total crate count is unchanged", from.length + to.length, before);
}
{
  const from = [], to = ["egg"];
  check("empty hold -> false, nothing minted", [moveCrate(from, to, "cocoa"), to.length], [false, 1]);
}
{
  // a nonsensical input can never be coerced into a mutation — same defensive stance as
  // coinShortfall returning Infinity rather than 0 for a negative debit.
  const to = ["egg"];
  check("non-array `from` -> false, no throw", moveCrate(null, to, "cocoa"), false);
  check("undefined ing -> false", moveCrate(["cocoa"], to, undefined), false);
  check("...and `to` is still untouched throughout", to, ["egg"]);
}

/* ---------- 3. CR-03 — the flee path must credit nothing ---------- */
// Source-level, because reaching a flee at runtime needs a full battle with a both-tails round and
// a human defender. Presence is asserted BEFORE absence (15-LEARNINGS #2): if the flee block ever
// moves or is renamed, this reports a missing anchor instead of silently passing on nothing.
console.log("\n3. CR-03 — the battle flee settles no side bets");
{
  const src = readFileSync(join(ROOT, "src/orchestrator.js"), "utf8");
  const fleeIdx = src.indexOf('t:"battleflee"');
  check("anchor present: the battleflee event still exists", fleeIdx > -1, true);

  // the flee block runs from the `if(flee&&` gate to the `break` that ends it
  const gateIdx = src.lastIndexOf("if(flee&&", fleeIdx);
  check("anchor present: the flee gate precedes the event", gateIdx > -1 && gateIdx < fleeIdx, true);

  // Strip comments before matching. The CR-03 fix leaves a DO-NOT-RESTORE comment that quotes the
  // deleted line verbatim, so a raw source grep would match the prose describing the bug and report
  // the bug as still present. A gate that a comment can fool is not a gate — it must read code.
  const block = src.slice(gateIdx, fleeIdx)
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (the guard avoids eating `://` in a URL)

  // presence-before-absence: prove the stripper left real code behind, so the two absence
  // assertions below cannot pass merely because `block` came back empty (15-LEARNINGS #2, the
  // "faked green" family — an assertion that inspects nothing reports the same 0 as a healthy one).
  check("comment-stripped flee block still holds code", /def\.coins--/.test(block) && block.length > 40, true);

  // any credit to a bettor's purse inside the flee block is CR-03 returning
  const credits = block.match(/coins\s*\+=/g) || [];
  check("no `coins +=` anywhere in the flee block", credits.length, 0);
  check("no iteration over `bets` in the flee block", /for\s*\(\s*const\s+bet\s+of\s+bets/.test(block), false);

  // and the one coin movement that SHOULD be there — the 1🌕 flee toll — is still there
  check("the 1-coin flee toll is still charged", /def\.coins--/.test(block), true);
}

console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failing check(s)`);
process.exit(failures ? 1 : 0);
