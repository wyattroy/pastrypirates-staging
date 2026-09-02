#!/usr/bin/env node
/* chart_model_agrees_with_glass_check.mjs — the Chartkeeper and the Glass must count the same list.
 *
 * RULE 23, THE DESIGN-TIME QUESTION: *what makes these two agree?* Today the honest answer is
 * "nothing — they are kept in step", and the rulebook says in those words that two things kept in
 * step by discipline are two things that will drift. So this gate exists to make the drift LOUD.
 *
 * WHY THEY COULD NOT SIMPLY BE MADE ONE THING IN THE WATCH THAT WROTE THIS. `scripts/wyclau/glass.mjs`
 * is VENDORED from claude-kit (`.claude/wyclau/MANIFEST.sha256`, and `scripts/qa/vendor_check.mjs`
 * fails the build on drift), and the kit is outside this session's allowed working directory —
 * measured, not assumed: an `ls` of the kit path is refused outright. Converging `glass.mjs` onto
 * `lib/chart_model.mjs` is one small edit IN THE KIT, and it is filed in
 * `.planning/wyclau/PENDING-KIT-PATCHES.md`. Until then, this.
 *
 * WHAT IT ACTUALLY DOES, because a gate that greps source text is the fault it is guarding against.
 * It builds a throwaway tree, copies the REAL glass.mjs into it, points it at a fixture Chart,
 * runs it, and reads the number off the page it renders. Then it asks `chart_model.mjs` the same
 * question. Two real executions, one comparison. The sea trial's scorecard gate "greps source text,
 * so it is green and cannot fail" (CHART.md) — that is the standard being avoided here.
 *
 * THE NUMBER IS THE ONE WYATT STEERS BY. glass.mjs:393 is `checklist = { done, open: tasks.length }`
 * and :386 is `tasks = [...openChecklist, ...openInbox.map(shortTask)]` — open checklist rows PLUS
 * every IDEA INBOX entry with no declared fate. CEO 89 caught the Chartkeeper's own spec missing
 * that second half; if it drifts back out, the Chartkeeper re-orders a list his phone does not show.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChart } from "../wyclau/lib/chart_model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log("the Chartkeeper and the Glass count the same open list\n");

if (!existsSync(GLASS)) {
  fail("scripts/wyclau/glass.mjs is missing — nothing to agree with");
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "chart-agree-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

/* glass.mjs derives its own ROOT from its file location, so a copy two levels below a throwaway
   directory reads that directory's .planning/ and writes that directory's glass.html. Nothing it
   touches here is real — and in particular it never sees, and so can never reset, the live
   GLASS-NOTE.md, which is how a watch's screenshot results were destroyed on 2026-09-02. */
mkdirSync(join(tmp, "scripts", "wyclau"), { recursive: true });
mkdirSync(join(tmp, ".planning", "wyclau", "status"), { recursive: true });
copyFileSync(GLASS, join(tmp, "scripts", "wyclau", "glass.mjs"));

/* The fixture deliberately puts BOTH halves of the count in play: three open checklist rows and
   two IDEA INBOX entries, one of which has declared a fate and one of which has not. A model that
   forgets the inbox answers 3; a model that forgets the fate test answers 5; only 4 is right. */
const FIXTURE = `# THE CHART — fixture

## THE LAUNCH LINE

| # | Step | State |
|---|---|---|
| 1 | **The reboot** | IN PROGRESS |

## STEP 1 CHECKLIST — the reboot

- [ ] **Open row one** — an ordinary piece of work nobody has done.
- [ ] **Open row two** — another, with an indented continuation line under it
      that must not be counted as a second row.
- [x] **A closed row** — SHIPPED 2026-08-01.
- [ ] **Open row three** — GATED: blocked, but still a row he can see.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

- **An idea with no fate yet** — he wrote this and nobody has ruled on it.
- **An idea with a fate** — dealt with → **SHIPPED** 2026-08-30.
`;
writeFileSync(join(tmp, ".planning", "CHART.md"), FIXTURE);

let glassOpen = null;
try {
  // stderr is discarded on purpose: glass.mjs shells out to git for its "last progress" line, and
  // a throwaway directory is not a repo, so it prints three harmless `not a git repository` lines.
  // Letting those into `npm test`'s output would train a reader to skim past real errors.
  execFileSync(process.execPath, [join(tmp, "scripts", "wyclau", "glass.mjs")], { encoding: "utf8", cwd: tmp, stdio: ["ignore", "pipe", "ignore"] });
  const html = readFileSync(join(tmp, ".planning", "wyclau", "glass.html"), "utf8");
  // The Tasks card's own heading is the number he reads. Written by glass.mjs from
  // `checklist.open`; matched loosely so a wording change fails LOUDLY rather than silently.
  const m = /(\d+)\s*(?:open|done\s*·\s*(\d+)\s*open)/i.exec(html.replace(/\\u003c/g, "<"));
  const all = [...html.matchAll(/(\d+)\s+open/gi)].map((x) => Number(x[1]));
  glassOpen = all.length ? all[0] : (m ? Number(m[2] ?? m[1]) : null);
} catch (e) {
  fail(`the real glass.mjs would not run against a fixture tree: ${String(e.message).slice(0, 200)}`);
}

const model = parseChart(FIXTURE);
const modelOpen = model.tasks.length;

if (modelOpen !== 4)
  fail(`chart_model counted ${modelOpen} open tasks on a fixture built to have exactly 4 (3 checklist rows + 1 unfated idea) — the model is wrong before any comparison`);
else pass("chart_model counts the 3 open checklist rows plus the 1 unfated idea, and not the fated one");

if (glassOpen === null) fail("could not read an open count off the rendered Glass — the comparison did not happen, so this gate proved nothing this run");
else if (glassOpen !== modelOpen)
  fail(`the Glass says ${glassOpen} open and chart_model says ${modelOpen} — they have drifted, and the Chartkeeper is now re-ordering a list Wyatt's phone does not render`);
else pass(`both derivations answer ${glassOpen} on the same Chart`);

/* The continuation line is the specific way this drifts in practice: an indented line under a row
   looks like prose to one parser and like a row to another, and the count silently gains one. */
if (model.openRows.length !== 3)
  fail(`chart_model found ${model.openRows.length} open checklist rows, not 3 — an indented continuation line is being read as a row of its own`);
else pass("an indented continuation line is part of its row, not a row of its own");

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
