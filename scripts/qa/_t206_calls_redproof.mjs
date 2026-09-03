#!/usr/bin/env node
/* RED-PROOF for `_t206_calls_reach_him_check.mjs`.
 *
 * The check went FAIL → PASS on the live Chart, which proves the "row missing" branch and the
 * happy path. Its other two branches — a row that numbers nothing, and a row that numbers its
 * options but marks none (recommended) — have never been reached, and CLAUDE.md rule 6 is exactly
 * about the check that cannot fail. This drives all four against fixtures.
 *
 * It works on a COPY of the Chart in a temp dir and never touches `.planning/CHART.md`.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = join("scripts", "qa", "_t206_calls_reach_him_check.mjs");
const chart = readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8");

function runOn(chartText) {
  const dir = mkdtempSync(join(tmpdir(), "t206-redproof-"));
  mkdirSync(join(dir, ".planning"), { recursive: true });
  mkdirSync(join(dir, "scripts", "qa"), { recursive: true });
  writeFileSync(join(dir, ".planning", "CHART.md"), chartText);
  cpSync(join(ROOT, CHECK), join(dir, CHECK));
  try {
    execFileSync(process.execPath, [CHECK], { cwd: dir, stdio: "pipe" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: String(e.stdout ?? "") };
  }
}

const cases = [];

/* 1 — the tree as it stands: both rows present and well formed. */
cases.push(["the live Chart passes", runOn(chart).code === 0]);

/* 2 — the row is gone entirely. */
const gone = chart.split("\n").filter((l) => !l.includes("qid:t206-cookie-choice")).join("\n");
{
  const r = runOn(gone);
  cases.push(["a deleted question row is caught", r.code === 1 && /no row .* carries qid:t206-cookie-choice/.test(r.out)]);
}

/* 3 — the row exists but its options cell is prose, so his page would draw generic buttons.
 *
 * ⚠ THE MUTATION IS BUILT FROM THE ROW'S OWN CELLS, NOT FROM A LITERAL THAT GUESSES ITS SHAPE.
 * The first version matched `/\| 1\. The public pages[\s\S]*?\| \|$/` — it assumed the row ended in
 * an EMPTY `since` cell. Two hours later `numbered_options_check` (rightly) demanded a date, the
 * cell became `| 2026-09-03 |`, the mutation stopped applying, and this case fed the check a
 * fixture IDENTICAL to the real Chart: the check passed, so the case reported FAIL and the branch
 * it exists to exercise was never reached. **A red-proof that hard-codes the shape of the thing it
 * mutates goes stale the moment that thing is edited** — and CEO 178 found `CHART.md` asserting
 * "four branches red-proofed" while this one was red. Same fault as the shadowed counter it was
 * written alongside: an instrument reporting a property of itself.
 * The assertion is also loosened from "0 options" to "fewer than 2", because prose with one
 * numeral in it counts as 1 and is just as unrenderable as none. */
const prosed = chart.split("\n").map((l) => {
  if (!l.includes("qid:t206-which-pages")) return l;
  const cells = l.split("|");
  cells[2] = " Public pages only, I think. ";   // [0] is empty (leading pipe), [1] is the question
  return cells.join("|");
}).join("\n");
{
  const r = runOn(prosed);
  cases.push(["a question with no numbered options is caught", r.code === 1 && /declares [01] numbered option/.test(r.out)]);
}

/* 4 — numbered, but nothing marked (recommended); he asked for the mark twice. */
const unmarked = chart.replace(/ \(recommended\)/g, "");
{
  const r = runOn(unmarked);
  cases.push(["numbered options with no recommendation are caught", r.code === 1 && /marks none \(recommended\)/.test(r.out)]);
}

/* 5 — THE GUARD THE STALENESS ABOVE NEEDED, and it is the reusable half of CEO 178's finding.
   Every mutation must actually CHANGE the Chart. A mutation that silently becomes a no-op feeds
   the check the real file and then blames the check for passing — which is exactly how case 3 sat
   red for two hours while `CHART.md` said all four branches were proved. This costs three lines
   and it cannot be fooled by a future edit to the row's shape. */
for (const [name, text] of [["deleted-row", gone], ["prosed-options", prosed], ["unmarked", unmarked]]) {
  cases.push([`the ${name} mutation actually changes the Chart (a no-op mutation proves nothing)`, text !== chart]);
}

let bad = 0;
for (const [name, ok] of cases) { console.log(`${ok ? "PASS" : "FAIL"} -- ${name}`); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
