/* T-206 — MOVE 3 OF THE RULINGS LIFECYCLE, done as a script rather than by hand.
 *
 *   node scripts/qa/_t206_triage.mjs
 *
 * The Chart's ## RULED table states the process in full: a harvested ruling lands there, gets a
 * task row in the STEP 1 CHECKLIST, and then MOVES to ## SETTLED RULINGS in CHART-LOG.md with a
 * verdict in its `now` cell. Step 3 is the one that keeps getting skipped -- CHART-LOG's own first
 * settled row says so, twice, and it had `npm test` red both nights.
 *
 * WHY A SCRIPT AND NOT A HAND EDIT. The ruling row is ~2,000 characters of his words. Retyping it
 * to move it is how a quote gets silently shortened, and this row's whole value is that it is
 * verbatim. This lifts the exact bytes and re-writes only the third cell.
 *
 * Idempotent: if the row is already gone from ## RULED it says so and changes nothing.
 * Throwaway probe for one item. Delete after the commit lands.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHART = path.join(ROOT, ".planning", "CHART.md");
const LOG = path.join(ROOT, ".planning", "CHART-LOG.md");
const QID = "| <!--qid:t206-ga-turn-on-->";

const VERDICT =
  "**PLAN DELIVERED 2026-09-03T17:0xZ — the artifact you asked for is written, and the ball is " +
  "back with you.** `.planning/ANALYTICS-PLAN.html`, in publishable shape: what you already " +
  "collect (237 boots / 123 browsers / 44 starts / 8 finishes, re-read off the live database that " +
  "morning, not remembered), the four reasons the 123→19 drop-off reads worse than it is, the " +
  "three things Google adds that you genuinely do not have, and five numbered steps to switch it " +
  "on. **Nothing was installed** — you asked for instructions and a plan, and consent is yours. " +
  "**It ends on two questions for you**, both with a recommendation marked: which pages get the " +
  "tag, and cookie or cookieless. ⚠ **One claim on that page is unverified and says so on its own " +
  "face** — this machine has no web access, so GA4's no-storage setting rests on how it has " +
  "worked rather than on Google's current docs; it gets checked before anything is installed. " +
  "**Your third sentence — the sea-trial depth control — is NOT in here**; it is its own checklist " +
  "row, because it changes the testing machinery and not the game. Photographed at 390px and " +
  "1280px: `.planning/posed/t206-analytics-plan-phone.png`, `…-desktop.png`.";

const chart = fs.readFileSync(CHART, "utf8");
const i = chart.indexOf(QID);
if (i === -1) {
  console.log("nothing to do — the t206-ga-turn-on row is not in ## RULED any more.");
  process.exit(0);
}
const j = chart.indexOf("\n", i);
const row = chart.slice(i, j);

// The row is `| item | HIS RULING | now |`. Only the LAST cell is rewritten; his words are untouched.
const cells = row.split(" | ");
if (cells.length < 3) { console.error("row shape unexpected — refusing to guess"); process.exit(1); }
const tail = cells[cells.length - 1];
if (tail.trim() !== "|") { console.error(`the 'now' cell is not empty (${tail.trim().slice(0,60)}) — refusing to overwrite a verdict`); process.exit(1); }
const settled = cells.slice(0, -1).join(" | ") + " | " + VERDICT + " |";

// 1. delete it from the Chart's waiting room (take the trailing newline with it)
fs.writeFileSync(CHART, chart.slice(0, i) + chart.slice(j + 1), "utf8");

// 2. append it under SETTLED RULINGS in CHART-LOG.md, at the end of that table
const log = fs.readFileSync(LOG, "utf8");
const h = log.indexOf("## SETTLED RULINGS");
if (h === -1) { console.error("no ## SETTLED RULINGS heading in CHART-LOG.md"); process.exit(1); }
// find the last line of the table that follows the heading
const after = log.slice(h);
const lines = after.split("\n");
let last = -1;
for (let k = 0; k < lines.length; k++) {
  if (lines[k].startsWith("|")) last = k;
  else if (last !== -1 && lines[k].trim() === "") break;
}
if (last === -1) { console.error("no table found under ## SETTLED RULINGS"); process.exit(1); }
lines.splice(last + 1, 0, settled);
fs.writeFileSync(LOG, log.slice(0, h) + lines.join("\n"), "utf8");

console.log(`moved ${row.length} chars of his ruling from ## RULED -> ## SETTLED RULINGS`);
console.log(`verdict cell: ${VERDICT.length} chars`);
