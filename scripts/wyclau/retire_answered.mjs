#!/usr/bin/env node
// scripts/wyclau/retire_answered.mjs
//
// RECORDING WYATT'S ANSWER AND RETIRING HIS QUESTION ARE ONE ACT. This script is that act.
//
//     node scripts/wyclau/retire_answered.mjs --qid=<id> --verdict="<his words, verbatim>"
//     node scripts/wyclau/retire_answered.mjs --list          # what is asking him, with ids
//
// ⚠ WHY IT EXISTS, IN HIS WORDS, 2026-09-02 6:57 PM ET — the sixth instance in twelve hours:
//
//     "the page continues to re-show me thw e questions AFTER they're harvested. this is NOT fixed
//      and it is a PRIORITY more than any of the SEO work"
//
// and, the time he photographed it: "I already answered both of these about 15 minutes ago. Please
// tell me why the page still shows them, and is still asking me to answer them again."
//
// NOTHING HE DID WAS WRONG AND NOTHING WAS LOST. He typed his answers into his page, the page saved
// them, the harvest read them, and they reached the record. **Every step worked except the one that
// removes the question**, because harvesting WRITES the ruling and DELETES NOTHING — so the row goes
// on rendering in the Glass's Your Call card and the page goes on asking. Two acts joined by a
// session remembering the second one is the shape `.claude/CLAUDE.md` rule 23 forbids by name.
//
// THE HARVEST OF 22:5xZ IS THE PROOF THAT A RUNBOOK STEP IS NOT ENOUGH. Its own commit says "all
// five rules-page questions in the Your Call table above are now answered" — and it left all five
// asking, because its mandate was harvest-and-publish. **It detected the exact condition and had no
// authority to act on it.** This script is that authority, in one command.
//
// THE SHAPE IS `close_item.mjs`'s, deliberately: that script writes the tick, the ledger entry and
// the INBOX fate together so they cannot disagree. This one writes the RULED row and the deletion
// together for the same reason. One file write, so a crash cannot leave half of it done.
//
// WHAT IT DELIBERATELY DOES NOT DO: invent the verdict. His words plus a session's summary are not
// derivable from anything on disk, so `--verdict` is required and is written verbatim. The
// atomicity this buys is over the two EDITS, which is where the drift was — not over the sentence.
//
// AND IT DOES NOT COMMIT. Three sessions have shared this checkout today and one lost another's work
// to a `git add -A`; a script that commits on its own behalf inside somebody else's staging area is
// how that happens again. It prints the commit line and lets the caller run it.
//
// ⚑ THE ACT ITSELF NOW LIVES IN `lib/retire.mjs`, AND THIS SCRIPT IS ONE OF ITS TWO CALLERS.
// 2026-09-03. CEO 125's residual (a) was that NOTHING CALLED THIS SCRIPT — it is a command a session
// types from a runbook step, and six times in twelve hours a session did every other step. The
// second caller is `mark_glass_harvest.mjs`, the one command a harvest cannot skip, which now
// retires in the same act that stamps its receipt. The moment there were two callers, the escaping,
// the qid stamp and the single-write atomicity had to stop being written out here.
// **This script is still the right way in by hand** — for a ruling that arrives outside a harvest.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripQid } from "./lib/chart_model.mjs";
import { liveQuestions, retireQuestion } from "./lib/retire.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHART = join(ROOT, ".planning", "CHART.md");

const argOf = (name) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : "";
};
const has = (name) => process.argv.slice(2).includes(`--${name}`);

const chart = readFileSync(CHART, "utf8");
const rows = liveQuestions(chart);

if (has("list") || (!argOf("qid") && !argOf("verdict"))) {
  if (!rows.length) {
    console.log("Nothing is asking him — `## BLOCKED ON WYATT` is empty.");
  } else {
    console.log(`${rows.length} question(s) asking him right now:\n`);
    for (const r of rows) {
      console.log(`  --qid=${r.id}${r.explicit ? "" : "   (derived from the prose — this row has no <!--qid:…--> marker)"}`);
      console.log(`      ${stripQid(r.cell).replace(/\*\*/g, "").slice(0, 110)}\n`);
    }
  }
  if (!has("list")) {
    console.error(`
REFUSING — retiring a question needs both halves of the one act:

  node scripts/wyclau/retire_answered.mjs --qid=<id> --verdict="<his words, verbatim>"

--verdict is his answer as he wrote it, plus where it is recorded. It is written into the Chart's
## RULED table with the "now" cell left empty (untriaged, per that table's own three-move process),
and the question row is deleted in the SAME write. Never do one without the other: that is the fault
this replaces, and he has reported it six times.`);
    process.exit(1);
  }
  process.exit(0);
}

const qid = argOf("qid").trim().toLowerCase();
const verdict = argOf("verdict").trim();

if (!qid) { console.error("REFUSING — --qid=<id> is required. Run with --list to see what is asking him."); process.exit(1); }
if (!verdict) { console.error("REFUSING — --verdict=\"<his words>\" is required. A question retired with no answer on record is his words deleted, which is strictly worse than the bug."); process.exit(1); }

/* THE ACT — ONE DEFINITION, IN `lib/retire.mjs`. What used to be forty lines here (the qid stamp,
   the pipe-and-newline escaping, the two edits computed against one string) moved there the day the
   harvest became a second caller. Everything below is this script's own job: saying what happened,
   in a sentence a person can act on. */
const result = retireQuestion(chart, qid, verdict);
if (!result.ok) {
  console.error(`REFUSING — ${result.error}`);
  console.error(rows.length
    ? `\nWhat IS asking him:\n${rows.map((r) => `  ${r.id}`).join("\n")}\n\nRun with --list for the full text of each.`
    : "\nThat section is empty — nothing is asking him at all.");
  process.exit(1);
}

writeFileSync(CHART, result.next);

console.log(`RETIRED "${qid}" — one act, both halves:
  · added to \`## RULED\` with the "now" cell empty (untriaged, per that table's three-move process)
  · DELETED from \`## BLOCKED ON WYATT\`, so his page stops asking

Verify, then commit both halves together:
  node scripts/qa/answered_question_retired_check.mjs
  node scripts/qa/rulings_triage_check.mjs
  git add .planning/CHART.md && git commit

⚠ AND THE RECORD BEING FIXED IS NOT THE SAME EVENT AS HIS PAGE BEING FIXED. The row is gone from
CHART.md; the Glass still shows the old question until it is REGENERATED AND REPUBLISHED. That
happened once already — rows retired at 6:26 PM, his page still reading "Your call (2)" afterwards.
From where he sits, a fix he cannot see is identical to nothing having happened.`);
