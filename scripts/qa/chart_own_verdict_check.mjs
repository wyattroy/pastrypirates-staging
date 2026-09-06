/* chart_own_verdict_check.mjs — T-264: a row that declares itself finished with a bare
 * `✅ **...**` (no arrow) must leave Wyatt's Tasks list, UNLESS the marker it carries is really
 * about some OTHER ticket mentioned in its own prose (the T-073 trap: a still-open row's sub-note
 * can read "✅ **THE GATE IS CLEAR — `T-261` CLOSED...**" about a DIFFERENT handle entirely).
 *
 * Found on the live Chart: exactly one row (`T-243`) carries this shape — CEO 226 closed it
 * "through the gate" with a bare ✅ marker, and stateOf() never saw it because DECLARED requires an
 * arrow. Confirmed by scan (`scripts/wyclau/_t264_scan.mjs`) that no OTHER live row has this shape,
 * so the fix's blast radius is exactly this one row plus future ones written the same way.
 *
 * The arrow convention (`→ **...**`) stays the primary signal and is checked FIRST, unchanged —
 * this is a fallback that only fires when no arrow marker exists at all, so every row already using
 * the arrow convention is provably untouched by this change. */
import { stateOf } from "../wyclau/lib/chart_model.mjs";

const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("chart_own_verdict_check — a bare checkmark verdict must count, a mention of another ticket must not\n");

// 1. THE REAL SHAPE, T-243'S OWN. A row's opening line, its handle, then a bare ✅ verdict with no
// arrow anywhere in the block. Must read as finished.
const t243Shape = [
  '- **Wyatt, written on the Glass**: *"Regenerate sitemap.xml..."*',
  '      ⟨`T-243`⟩',
  '      ✅ **CLOSED PROPERLY 2026-09-06, CEO 226 (YES), through the gate this time.** The old warning',
  '      here (about a prior close landing on `T-137` instead) described a bug in `close_item.mjs`.',
].join("\n");
check("a bare ✅ verdict with no arrow anywhere in the block reads as finished",
  stateOf(t243Shape) === "finished", `got ${stateOf(t243Shape)}`);

// 2. THE TRAP. A row whose ONLY checkmark marker is about a DIFFERENT ticket's closure, mentioned
// inline. Must NOT read as finished — there is no verdict here that is genuinely this row's own.
const trapShape = [
  '- [ ] **Add New SFX to the game** — his own asset request.',
  '      ⟨`T-073`⟩',
  '      🔒 CLAIMED — in hand on the Mac. DO NOW.',
  '      ✅ **THE GATE IS CLEAR — `T-261` CLOSED 2026-09-06 (commit `826e26fd`), CEO 226 accepted the',
  '      fix), AND THIS ROW\'S OWN "GATED ON T-261" LINE WAS LEFT STANDING FOR HOURS AFTER THAT.**',
].join("\n");
check("a checkmark that only names a DIFFERENT ticket's closure does not finish this row",
  stateOf(trapShape) !== "finished", `got ${stateOf(trapShape)} — the T-073 trap fired`);

// 3. ORDER MATTERS, AND IT MUST BE FIRST-MATCH, NOT LAST. T-243's own two markers sit in the WRONG
// chronological order in the file (the final close is physically ABOVE an earlier partial note).
// First-match-wins is what gets the real row right, and it is also what DECLARED (the arrow form)
// has always done — this mirrors existing behaviour rather than inventing a new rule.
const wrongOrderShape = [
  '- **fixture row**',
  '      ⟨`T-900`⟩',
  '      ✅ **CLOSED PROPERLY, done.** ',
  '      ✅ **AN EARLIER PARTIAL NOTE THAT SAYS NOTHING ABOUT BEING FINISHED.**',
].join("\n");
check("the FIRST own-verdict marker wins when a row carries more than one",
  stateOf(wrongOrderShape) === "finished", `got ${stateOf(wrongOrderShape)}`);

// 4. THE ARROW STILL WINS OUTRIGHT. A row with both an arrow verdict (still open) and a checkmark
// verdict (closed) must resolve from the arrow — the checkmark fallback only fires when NO arrow
// marker exists at all, so existing arrow-only rows are provably unaffected by this change.
const arrowWinsShape = [
  '- **fixture row**',
  '      ⟨`T-901`⟩',
  '      → **STILL OPEN, waiting on him.**',
  '      ✅ **CLOSED, done.**',
].join("\n");
check("an existing arrow verdict is decided from the arrow, never overridden by a checkmark",
  stateOf(arrowWinsShape) === "open", `got ${stateOf(arrowWinsShape)}`);

// 5. NO MARKER AT ALL STILL READS OPEN.
const noMarkerShape = ['- **fixture row**', '      ⟨`T-902`⟩', '      just prose, no verdict.'].join("\n");
check("a row with no verdict marker at all still reads as open",
  stateOf(noMarkerShape) === "open", `got ${stateOf(noMarkerShape)}`);

// 6. THE SHAPE THAT ACTUALLY BROKE THE FIRST ATTEMPT AT THIS FIX: a row is not single-threaded. A
// genuine own-verdict checkmark sits at the TOP of the block, right under the handle, and a STALE
// arrow from an earlier pass ("NOT YET FATED") still sits further down, unremoved. "Any arrow beats
// any checkmark" picks the stale note; earliest-position-wins picks the real close.
const notSingleThreadedShape = [
  '- **fixture row**',
  '      ⟨`T-903`⟩',
  '      ✅ **CLOSED PROPERLY, through the gate this time.**',
  '      some more prose about what the close covered...',
  '      still more prose."* → **NOT YET FATED — harvested verbatim, not investigated.**',
].join("\n");
check("an early own-checkmark close outranks a stale arrow sitting later in the same block",
  stateOf(notSingleThreadedShape) === "finished", `got ${stateOf(notSingleThreadedShape)}`);

console.log(failures.length ? `\n${failures.length} FAILURE(S)` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
