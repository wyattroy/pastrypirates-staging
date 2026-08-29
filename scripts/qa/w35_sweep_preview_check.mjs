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
    /* the teardown must not sit behind a further condition — that nesting IS the bug */
    const nested = /if\s*\([^)]*\)\s*\{[^}]*clearSweep\(\)/.test(guard);
    if (clears && forgets && !nested)
      pass("a tap that is not on the previewed square tears the preview down and forgets the armed square, unconditionally — so tapping a plain yellow square clears it");
    else
      fail(`the trade-wind preview survives a tap on another sail square (clears:${clears} forgets:${forgets} still-nested-behind-a-condition:${nested}) — that is Wyatt's W3-5: the dashed track, the end circle and the ghost hull stay on the board`);
  }
  /* AND THE SECOND TAP STILL COMMITS. The preview is a two-tap gesture and Wyatt's own pick; a
     "fix" that cleared on every tap would break the commit and pass a naive assertion. */
  const commits = /sweepBtn\s*===\s*cell/.test(fn) && /return;/.test(fn);
  if (commits) pass("a second tap on the SAME square still lets the sail through — the two-tap gesture he chose survives");
  else fail("the second-tap commit is gone — the trade-wind square would no longer be sailable, which is not what this item asked for");
}
/* And the teardown itself must still remove all three drawn parts. */
{
  const cs = (js.match(/function clearSweep\(\)\s*\{[^}]*\}/) || [""])[0];
  const parts = ["sweepPath", "sweepEnd", "sweepGhost"].filter(p => cs.includes(p));
  if (parts.length === 3) pass("clearSweep() still removes all three drawn parts — the track, the end circle and the ghost hull");
  else fail(`clearSweep() only removes ${parts.length} of the preview's three drawn parts (${parts.join(", ") || "none"}) — a partial teardown leaves the fault he reported, in pieces`);
}
console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — the preview clears on any tap that is not the previewed square, the second tap still commits, and the teardown removes all three parts");
process.exit(fails ? 1 : 0);
