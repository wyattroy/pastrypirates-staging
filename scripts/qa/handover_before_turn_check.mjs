#!/usr/bin/env node
/* THE DEVICE CHANGES HANDS BEFORE THE SCREEN CHANGES CAPTAIN.
 *
 *   node scripts/qa/handover_before_turn_check.mjs
 *
 * WYATT, 2026-08-31: "Move it, I trust the plan." The plan
 * (.planning/architecture-one-director.html §04) puts pass-and-play's hand-over in the Decider —
 * it is a precondition on OBTAINING a decision from a seat, not a look, and not part of the turn.
 *
 * WHAT MEASURING FIRST FOUND, and it is a better argument than the plan's: TWO OF THE THREE
 * PASS-AND-PLAY PATHS ALREADY DID IT RIGHT, and nobody had noticed the third disagreed.
 *
 *   src/ui/flow.js  the secret draft   passGate(seat) -> applyActiveSeat(seat) -> ask   correct
 *   src/ui/flow.js  a bake turn        passGate(p.idx) first                            correct
 *   src/ui/flow.js  humanTurn          applyActiveSeat -> passGate -> applyActiveSeat   BACKWARDS
 *
 * WHAT THE BACKWARDS ONE COST A PLAYER: the board switched to the incoming captain — ring,
 * captains-box highlight, row order — and THEN the hand-over card appeared. For that instant the
 * OUTGOING captain, still holding the device, was looking at the next captain's board.
 *
 * SO THIS GATE IS ABOUT ORDER, NOT ABOUT A CALL EXISTING. Every passGate must come BEFORE the
 * applyActiveSeat that switches the screen to that seat. Consistency is a core value (rule 8) and
 * one of three disagreeing is exactly the drift it names.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = fs.readFileSync(path.join(ROOT, "src/ui/flow.js"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);
const lineOf = (i) => code.slice(0, i).split("\n").length;
console.log("handover_before_turn_check — the device changes hands before the screen changes captain\n");

/* INSTRUMENT REACHED ITS SUBJECT. If passGate is gone or renamed, silence here means nothing. */
const gates = [...code.matchAll(/await\s+passGate\s*\(\s*([\w.]+)\s*\)/g)];
gates.length >= 3
  ? pass(`instrument reached its subject — ${gates.length} passGate call site(s) in flow.js`)
  : fail(`found only ${gates.length} passGate call site(s); this gate cannot see its subject`);

/* THE ORDER, AT EVERY SITE. For each gate, look at the ~400 characters BEFORE it: an
   applyActiveSeat for the same seat sitting there means the screen switched first. */
{
  const bad = [];
  for (const g of gates) {
    const seat = g[1];
    const before = code.slice(Math.max(0, g.index - 400), g.index);
    const seatEsc = seat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`applyActiveSeat\\s*\\(\\s*${seatEsc}\\s*\\)`).test(before))
      bad.push(`flow.js:${lineOf(g.index)} — the screen switches to ${seat} BEFORE the device changes hands`);
  }
  bad.length === 0
    ? pass(`all ${gates.length} hand-over(s) come before the screen switches captain — the outgoing captain never sees the incoming captain's board`)
    : fail(`${bad.length} site(s) switch the screen first: ${bad.join(" | ")}`);
}

/* AND THE SEAT IS STILL APPLIED AFTERWARDS — moving the gate must not lose the switch entirely,
   which would leave the board on the outgoing captain for the whole turn. */
{
  const orphan = gates.filter(g => {
    const seatEsc = g[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`applyActiveSeat\\s*\\(\\s*${seatEsc}\\s*\\)`).test(code.slice(g.index, g.index + 400));
  });
  orphan.length === 0
    ? pass("every hand-over is still followed by the seat switch — the board does change captain, just after the tap")
    : fail(`${orphan.length} hand-over(s) are not followed by applyActiveSeat — the board would stay on the outgoing captain`);
}

/* RED-PROOF, through the same reader. */
{
  const wrong = `applyActiveSeat(p.idx); await passGate(p.idx); applyActiveSeat(p.idx);`;
  const right = `await passGate(p.idx); applyActiveSeat(p.idx);`;
  const readsBad = (s) => [...s.matchAll(/await\s+passGate\s*\(\s*([\w.]+)\s*\)/g)]
    .some(g => new RegExp(`applyActiveSeat\\s*\\(\\s*${g[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\)`)
      .test(s.slice(Math.max(0, g.index - 400), g.index)));
  readsBad(wrong) && !readsBad(right)
    ? pass("red-proof: the same reader flags the backwards order and passes the corrected one")
    : fail(`red-proof FAILED (flagsWrong:${readsBad(wrong)} passesRight:${!readsBad(right)})`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
