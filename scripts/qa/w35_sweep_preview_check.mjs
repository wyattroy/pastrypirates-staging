/* W3-5 — THE TRADE-WIND PREVIEW CLEARS WHEN YOU TAP ANYWHERE ELSE, INCLUDING ANOTHER SAIL SQUARE.
 * Wyatt: "A trade-wind square's preview stays on screen after you click a trade-wind square and then
 * click a yellow sailing square. It should be removed."
 *
 * THE CAUSE WAS A COMMENT THAT DESCRIBED WHAT THE CODE WAS MEANT TO DO. The line above the guard in
 * src/ui/stage.js read "any tap that is NOT on a previewed square clears the preview and forgets
 * it" — and the clear was nested inside `if (!cell)`, so it only fired when the tap missed every
 * sail square. Tap a plain yellow square and `cell` exists, the guard returns, and the dashed track,
 * the end circle and the ghost hull all stay on the board. Rule 6, in the shape the rulebook names:
 * a comment is a statement of intent by somebody who has since left the room.
 *
 * WHAT THIS ASSERTS — the BEHAVIOUR, not the shape of the line: on the non-previewed path, the
 * preview is torn down and the armed square forgotten, unconditionally. Stated that way it survives
 * the guard being rewritten and fails the moment the teardown is put back behind any condition.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const js = strip(fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8"));

const fn = (js.match(/function sweepGuard\(\)\s*\{[\s\S]*?\n\}/) || [""])[0];
if (!fn) fail("could not find sweepGuard() — re-anchor this assertion, do not delete it");
else {
  /* The guard clause is the one that returns when the tap is not on a previewed swept square. */
  /* THE LINE, NOT A PAREN-BALANCED MATCH. The first attempt used `[^)]*` and could not cross the
     nested parens in `cell.classList.contains("sailSwept")`, so it reported "could not find the
     guard" on a tree where the guard was plainly there — the assertion failed for a reason that had
     nothing to do with the code under test. Take the statement that mentions sailSwept and returns. */
  const guard = (fn.split("\n").find(l => /sailSwept/.test(l) && /return;/.test(l)) || "");
  if (!guard) fail("could not find the not-a-previewed-square guard inside sweepGuard() — re-anchor this assertion");
  else {
    const clears = /clearSweep\(\)/.test(guard);
    const forgets = /sweepBtn\s*=\s*null/.test(guard);
    /* THE TEARDOWN MUST NOT SIT BEHIND A FURTHER CONDITION — that nesting IS the bug.
       CEO REVIEW 28 WALKED WYATT'S OWN BUG PAST THIS, in a brace-less spelling:
         `{ if (!cell) clearSweep(), sweepBtn = null; return; }`
       The old test required a `{` after the inner `if`, so a one-line `if` sailed through and the
       gate printed "it is NOT nested inside an `if (!cell)`" about a tree where it was. ANY inner
       `if` before the teardown now fails it, braces or not — the requirement is that nothing
       stands between the branch and the clear. */
    const beforeClear = guard.slice(0, guard.indexOf("clearSweep()"));
    const nested = /\bif\s*\(/.test(beforeClear.slice(beforeClear.indexOf("{") + 1));
    if (clears && forgets && !nested)
      pass("found: the `!cell || !cell.classList.contains(\"sailSwept\")` branch calls clearSweep() and sets sweepBtn=null, and it is NOT nested inside an `if (!cell)` — whether that clears the preview on screen is watched by scripts/qa/w35_sweep_preview_live.mjs");
    else
      fail(`the trade-wind preview survives a tap on another sail square (clears:${clears} forgets:${forgets} still-nested-behind-a-condition:${nested}) — that is Wyatt's W3-5: the dashed track, the end circle and the ghost hull stay on the board`);
  }
  /* AND THE SECOND TAP STILL COMMITS. The preview is a two-tap gesture and Wyatt's own pick; a
     "fix" that cleared on every tap would break the commit and pass a naive assertion. */
  /* AND stopPropagation MUST COME AFTER IT, WHICH IS THE HALF THAT WAS MISSING.
     CEO Review 28 moved `e.stopPropagation()` ABOVE the second-tap branch and every gate stayed
     green — a capture-phase stop kills the square's own bubble-phase handler (src/ui/flow.js:590),
     so TRADE-WIND SQUARES BECOME UNSAILABLE. A player who can never ride a trade wind is a worse
     bug than the one W3-5 filed, and nothing in the repo said a word. The old test was
     `/sweepBtn === cell/ && /return;/` — a substring, against a `return;` that appears five times
     in this function. ORDER IS THE REQUIREMENT, so order is what is read. */
  const commitAt = fn.search(/sweepBtn\s*===\s*cell/);
  const stopAt = fn.search(/e\.stopPropagation\(\)/);
  const commits = commitAt >= 0 && stopAt >= 0 && commitAt < stopAt;
  if (commits) pass(`found: the \`sweepBtn === cell\` branch at offset ${commitAt} comes BEFORE \`e.stopPropagation()\` at ${stopAt}, so a second tap on the same square is not intercepted — whether it actually sails is watched in a browser, not asserted here`);
  else fail(`the second tap can be intercepted (commit branch at:${commitAt} stopPropagation at:${stopAt}) — a capture-phase stop above the commit branch kills the square's own handler and the trade-wind square becomes UNSAILABLE, which is a worse bug than the one this item filed`);
}
/* And the teardown itself must still remove all three drawn parts. */
{
  const cs = (js.match(/function clearSweep\(\)\s*\{[^}]*\}/) || [""])[0];
  const parts = ["sweepPath", "sweepEnd", "sweepGhost"].filter(p => cs.includes(p));
  if (parts.length === 3) pass("found: clearSweep()'s selector names all three classes — .sweepPath, .sweepEnd, .sweepGhost");
  else fail(`clearSweep() only removes ${parts.length} of the preview's three drawn parts (${parts.join(", ") || "none"}) — a partial teardown leaves the fault he reported, in pieces`);
}
console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — the TEXT found: the teardown branch is unconditional, the second-tap branch does not intercept, and clearSweep names all three parts. WHETHER THE PREVIEW ACTUALLY LEAVES THE SCREEN is measured in a browser with real mouse events by scripts/qa/w35_sweep_preview_live.mjs — run it; this gate reads source and reports no runtime result of its own.");
process.exit(fails ? 1 : 0);
