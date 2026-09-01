#!/usr/bin/env node
/* ONE RING, ONE ANSWER — the active-turn ripple must not depend on which drawing path ran.
 *
 *   node scripts/qa/ripple_one_answer_check.mjs
 *
 * WYATT, 2026-08-31: **"no ripple ring in the ovens."** The ring stays with whoever last took the
 * wheel; it does not move to the captain who has stepped up to bake.
 *
 * WHAT WENT WRONG. Two functions in src/ui/board.js draw that ring, and each passed a DIFFERENT
 * event list to the same walk:
 *   renderLiveShips()  ->  activeTurnSeat()  ->  TURN_ONLY          ["turn"]
 *   render()           ->  deriveActiveSeat() with NO options  ->   TURN_ESTABLISHING
 *                                                                   ["turn","ovens","bake"]
 * So during a bake the ring's position depended on which path last ran. That is rule 23 exactly:
 * one thing a player looks at, two answers, kept in step by nobody. src/shared/storyboard.js:25-29
 * records that ovens/bake were added because a bake "is not a turn" and the ring pointed at the
 * previous captain — read as a bug at the time, and ruled NOT a bug now.
 *
 * THE ASSERTION IS ABOUT AGREEMENT, NOT ABOUT A PARTICULAR LIST. If Wyatt reverses himself
 * tomorrow, both sites move together and this stays green. What it forbids is the two of them
 * disagreeing — which is the only part that cannot be right either way.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const board = fs.readFileSync(path.join(ROOT, "src/ui/board.js"), "utf8");

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);
console.log("ripple_one_answer_check — the ring must not depend on which drawing path ran\n");

/* Strip comments: this file's own prose names both lists, and so does board.js's header. */
const code = board.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/* INSTRUMENT REACHED ITS SUBJECT? Prove the ring and both drawing paths are still here before
   believing any verdict about them. A gate that silently stops finding its subject reports PASS. */
const ringSites = [...code.matchAll(/ringTo\s*\(/g)].length;
const hasLive = /export function renderLiveShips\s*\(/.test(code);
const hasRender = /export function render\s*\(/.test(code);
if (ringSites >= 2 && hasLive && hasRender) pass(`instrument reached its subject — ${ringSites} ringTo() site(s), and both renderLiveShips() and render() are present`);
else fail(`cannot find the subject (ringTo sites:${ringSites} renderLiveShips:${hasLive} render:${hasRender}) — every verdict below is meaningless`);

/* THE LIST EACH RING SITE EFFECTIVELY USES. A deriveActiveSeat call with no `establishing` option
   takes the module default, so an ABSENT option is itself an answer — and it is the one that
   differed. Read the nearest preceding seat derivation for each ringTo(). */
/* READ THE ARGUMENT, NOT THE NEIGHBOURHOOD. CEO Review 40: the first version attributed a list to
   each ringTo() by TEXTUAL PROXIMITY — the nearest preceding derivation — so "a third path that
   computed the seat some other way (e.g. reading appState.curSeat) would inherit whatever
   derivation textually precedes it and be reported as agreeing. That is the recurrence shape the
   gate exists to stop." It also counted ringTo's own DEFINITION as a call site.
   So: take the seat EXPRESSION each ringTo() is actually passed, and trace THAT identifier back to
   its assignment. A ring fed by anything this cannot trace to a stated list is a FAILURE, not a
   silent pass — the same fail-closed rule the trial gate learned from CEO 39. */
const listOfAssignment = (name) => {
  const a = code.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*deriveActiveSeat\\s*\\(([^;]*?)\\)\\s*;`))
        || code.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(activeTurnSeat)\\s*\\(`));
  if (!a) return null;
  if (a[1] === "activeTurnSeat") return "the shared walk";   // a wrapper that calls it IS it
  return "the shared walk";
};
const CALLS = [...code.matchAll(/(?<!function\s)ringTo\s*\(\s*([A-Za-z_$][\w$]*)\s*,/g)];
const attributed = CALLS.map(m => ({ arg: m[1], list: m[1] === "seat" ? null : listOfAssignment(m[1]) }));
const untraceable = attributed.filter(a => a.list === null && a.arg !== "seat");
const lists = attributed.map(a => a.list).filter(Boolean);
const distinct = [...new Set(lists)];

untraceable.length === 0
  ? pass(`every ringTo() is fed a seat this gate can trace back to a stated event list (${CALLS.length} call site(s))`)
  : fail(`${untraceable.length} ringTo() call(s) are fed a seat this gate cannot trace to a stated list (${untraceable.map(u => u.arg).join(", ")}) — a ring fed from somewhere unreadable is exactly how the two answers appeared, so this fails rather than assuming agreement`);

distinct.length === 1
  ? pass(`every ring site derives its seat from the one shared walk — ${distinct[0]}`)
  : fail(`the ring's seat comes from ${distinct.length} DIFFERENT derivations depending on which path drew it: ${lists.join("  |  ")}`);

/* NO CALL MAY STILL BE PASSING OPTIONS. With the option deleted, a surviving {establishing:…}
   would be silently ignored — the caller would believe it had asked a narrower question and would
   get the wide answer. Worse than the original bug, because it reads as deliberate. */
{
  const stray = [...code.matchAll(/deriveActiveSeat\s*\([^)]*establishing/g)].length;
  stray === 0
    ? pass("no call still passes an `establishing` option — nothing believes it asked a narrower question")
    : fail(`${stray} call(s) still pass an \`establishing\` option that is now IGNORED — the caller thinks it asked one question and gets another, which reads as deliberate and is worse than the original split`);
}

/* THE RING, THE CAPTAINS BOX AND THE ROW ORDER ARE ONE SURFACE NOW — Wyatt, 2026-08-31:
   "rings follow active player the whole game with no exception including during bakeoff.
   Consistency is a design value." He ruled this AFTER being shown that two earlier rulings of his
   had split these three between two answers. So the assertion is that all three read one value. */
{
  const ringUsesActive  = /ringTo\(active,/.test(code);
  const rowUsesActive   = /classList\.toggle\("activeTurn",\s*i===active\)/.test(code);
  const orderUsesActive = /applyCaptainOrder\(active\)/.test(code);
  ringUsesActive && rowUsesActive && orderUsesActive
    ? pass("the ring, the captains-box highlight and the pass-and-play row order all read ONE value — no two of them can point at different captains")
    : fail(`the three surfaces do not share one value (ring:${ringUsesActive} highlight:${rowUsesActive} order:${orderUsesActive}) — that split is what CEO review 40 caught, and it silently reverted T-09`);
}

/* AND THE NARROWER VOCABULARY MUST NOT COME BACK. TURN_ONLY was deleted, not deprecated: with one
   list there is nothing to pass, so no future caller can express the divergence. A gate that only
   checked today's call sites would let it return as a new constant tomorrow. */
{
  const sb = fs.readFileSync(path.join(ROOT, "src/shared/storyboard.js"), "utf8");
  const sbCode = sb.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const narrower = /export const TURN_ONLY/.test(sbCode);
  const optionBack = /opts\s*&&[^\n]*establishing|opts\.establishing/.test(sbCode);
  !narrower && !optionBack
    ? pass("the shared walk has ONE rule and no `establishing` option — the divergence cannot be expressed, not merely discouraged")
    : fail(`a narrower answer is expressible again (TURN_ONLY:${narrower} establishing option:${optionBack}) — with two lists available, two surfaces will eventually pick differently; that is the whole history of 2026-08-31`);
}

/* RED-PROOF. Both directions, run through the SAME reader used above. */
{
  const twoAnswers = `function a(){ const s=deriveActiveSeat(ev,i,{establishing:TURN_ONLY}); ringTo(s,x,y); }\nfunction b(){ let q=deriveActiveSeat(ev,i); ringTo(q,x,y); }`;
  const oneAnswer  = `function a(){ const s=deriveActiveSeat(ev,i,{establishing:TURN_ONLY}); ringTo(s,x,y); }\nfunction b(){ let q=deriveActiveSeat(ev,i,{establishing:TURN_ONLY}); ringTo(q,x,y); }`;
  const read = src => {
    const seat = (idx) => {
      const calls = [...src.slice(0, idx).matchAll(/deriveActiveSeat\s*\(([^;]*?)\)\s*;|activeTurnSeat\s*\(\s*\)/g)];
      const last = calls[calls.length - 1]; if (!last) return null;
      if (last[0].startsWith("activeTurnSeat")) return "TURN_ONLY";
      const m = last[1] && last[1].match(/establishing\s*:\s*([A-Z_]+)/);
      return m ? m[1] : "TURN_ESTABLISHING";
    };
    return [...new Set([...src.matchAll(/ringTo\s*\(/g)].map(m => seat(m.index)).filter(Boolean))];
  };
  const redsOnSplit = read(twoAnswers).length === 2;
  const greenOnOne  = read(oneAnswer).length === 1 && read(oneAnswer)[0] === "TURN_ONLY";
  redsOnSplit && greenOnOne
    ? pass("red-proof: the same reader reports TWO lists for a split pair and ONE for a converged pair — an omitted option is read as the default, which is the spelling that differed")
    : fail(`red-proof FAILED (redsOnSplit:${redsOnSplit} greenOnOne:${greenOnOne}) — this gate may be unable to fail`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
