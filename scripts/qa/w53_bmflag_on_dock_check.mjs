/* W5-3 — THE BLACK MARKET FLAG STANDS ON ITS DOCK, AT EVERY ORIENTATION.
 * Wyatt: "The black market flags are not attached to the docks. For every dock orientation, set the
 * base of the flag on the dock."
 *
 * THE CAUSE, read from the two placements sitting a few lines apart in src/ui/board.js:
 *   the DOCK is drawn straddling the shared edge with its island —
 *       px = (d[0] + .5 + adj[0]*.5) * cell,  py = (d[1] + .5 + adj[1]*.5) * cell
 *   the FLAG was drawn at the raw dock CELL, with a hand-picked vertical fraction —
 *       x  = (fd[0] + .5) * cell,             y  = (fd[1] + .42) * cell
 * `adj` is the direction of the island, so the dock moves half a cell toward it and the flag did
 * not. When the dock faces up the two nearly coincide, which is why it looks fine sometimes; when
 * it faces down, left or right the flag floats half a cell off it. The `.42` is the tell: a typed
 * fraction standing in for a position the code already computes.
 *
 * WHAT THIS ASSERTS: the flag's position is DERIVED FROM THE DOCK'S OWN PLACEMENT — the same `adj`
 * offset — rather than from the bare cell. Stated that way it survives the art changing and fails
 * the moment somebody puts a hand-tuned fraction back.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const board = strip(fs.readFileSync(path.join(REPO, "src/ui/board.js"), "utf8"));

/* the flag's own creation, found by the id it carries rather than by line number */
/* THE WHOLE FLAG BODY, not the element call alone. The first version started the capture AT
   `const f = el("text"` and looked forward — so the lines that compute the position, which sit
   ABOVE it, were outside the window and the assertion failed a correct tree. Capture from the
   blackMarket condition through to the id. */
const blk = (board.match(/cfg\.blackMarket[\s\S]{0,900}?bmflag_/) || [""])[0];
if (!blk) fail("could not find where the black-market flag is created in board.js — re-anchor this assertion, do not delete it");
else {
  /* (1) IT FOLLOWS THE DOCK. The dock's placement is the only thing that knows which way it faces. */
  const usesFacing = /adj/.test(blk) || /dockPx|dockPy/.test(blk);
  if (usesFacing)
    pass("the flag's position is derived from the dock's own placement, so it follows the dock at every orientation");
  else
    fail("the flag is still placed from the bare dock CELL and ignores which way the dock faces — the dock is drawn half a cell toward its island (adj) and the flag is not, so it floats off the dock on three of four orientations");

  /* (2) AND NO HAND-PICKED FRACTION. `.42` was a typed number standing in for a position the code
     already computes; a fix that keeps one has moved the fault rather than removed it. */
  const tuned = blk.match(/\+\s*\.\d+\s*\)\s*\*\s*cell/g) || [];
  const onlyHalves = tuned.every(t => /\+\s*\.5\s*\)/.test(t));
  if (onlyHalves)
    pass(`no hand-tuned vertical fraction remains — the only cell fractions left are the .5 cell-centre the whole board uses (${tuned.length} found)`);
  else
    fail(`the flag still carries a hand-picked cell fraction (${tuned.join(", ")}) — that is a typed number standing in for a position the dock's own placement already computes (rule 9)`);
}

/* (3) THE DOCK'S OWN PLACEMENT IS UNCHANGED — this item is about the flag, and a "fix" that moved
   the dock to meet the flag would satisfy the assertions above while changing the board. */
{
  const dock = /px\s*=\s*adj\s*\?\s*\(d\[0\]\s*\+\s*\.5\s*\+\s*adj\[0\]\s*\*\s*\.5\)\s*\*\s*cell/.test(board);
  if (dock) pass("the dock still straddles the shared edge with its island exactly as before — only the flag moved");
  else fail("the DOCK's own placement has changed — this item is about the flag standing on the dock, not about moving the dock");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)`
  : "\nPASSED — the flag is placed from the dock's own facing, carries no hand-tuned fraction, and the dock itself is untouched");
process.exit(fails ? 1 : 0);
