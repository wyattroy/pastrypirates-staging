#!/usr/bin/env node
// GATE: the Glass's "done" number must survive the Chart being swept clean, and must mean TODAY.
//
// WYATT'S RULING, question UI, 2026-09-02. Offered "done this week" and "remove it entirely", he
// picked TODAY. His reason is already on the record, 2026-08-31, on the Glass itself: "I want to
// see that the work is being done, right at the top, at a glance." A number that only ever grows
// cannot do that job — 27, then 28, then 29 says nothing about whether today went anywhere. A
// daily one does, and it costs him nothing to read.
//
// WHY THIS GATE EXISTS AT ALL, and it is the reason the sweep sat blocked for eight hours: the
// count used to be `stepSec.match(/^- \[x\]/gim).length` — the ticked rows in CHART.md. His other
// ruling the same day is that every completed row LEAVES CHART.md immediately. Ship one without
// the other and his card reads "0 done" on the day the most work shipped. The two rulings are not
// in tension; the derivation was simply pointed at a file that was about to stop holding the fact.
//
// THE FACT MOVED, SO THE READER MOVES: the count comes from `.planning/CHART-LOG.md`, which is
// where a finished row now lives, and counts the entries stamped with today's date.
//
// RED-PROOFED BOTH WAYS, because a count is exactly the kind of thing that can be green while
// meaning nothing: a Chart with no ticked rows and a log with three of today's entries must render
// 3 (the old code renders 0), and a log holding only YESTERDAY's entries must render 0 (a code that
// simply counts log entries renders 3).
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");

let failed = false;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed = true; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log('the Glass\'s "done" number reads the log, and means today\n');

const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

/* THE REAL GENERATOR, IN A THROWAWAY TREE — never a paraphrase of it, and never the real
   .planning/. `glass.mjs --note` REWRITES .planning/wyclau/glass.html AND CLEARS GLASS-NOTE.md
   unconditionally; a watch's unpublished note to Wyatt has already been destroyed once by a command
   run only to inspect the page (INBOX-20260902T0350Z). A gate must not be the second time. */
function renderWith(chart, log) {
  const dir = mkdtempSync(join(tmpdir(), "glass-done-today-"));
  mkdirSync(join(dir, "scripts", "wyclau"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), readFileSync(GLASS));
  writeFileSync(join(dir, "scripts", "wyclau", "lib", "chart_model.mjs"),
    readFileSync(join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs")));
  writeFileSync(join(dir, ".planning", "CHART.md"), chart);
  if (log !== null) writeFileSync(join(dir, ".planning", "CHART-LOG.md"), log);
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", "gate: glass_done_today"], { stdio: "pipe" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return html;
}

/* The heading is located by STRUCTURE, not by its words — the same correction
   `rulings_triage_check.mjs` had to make when he renamed the card. It is the one `<h2>` carrying
   both counts, which is a fact about what the card IS rather than what it is called. */
const heading = (html) => (/<h2>[^<]*\bdone\b[^<]*\bopen\b[^<]*<\/h2>/.exec(html) || [""])[0];
const doneNumber = (html) => {
  const m = /([\d]+)\s*done/.exec(heading(html));
  return m ? Number(m[1]) : null;
};

const SWEPT_CHART = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **THE ONE THING STILL OPEN.** Filed 2026-09-02T04:19Z.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

*(empty)*
`;

const logWith = (date) => `# THE CHART LOG — closed rows, kept forever

## T-801 — ${date} — **THE FIRST FINISHED THING**

- [x] **THE FIRST FINISHED THING**

## T-802 — ${date} — **THE SECOND FINISHED THING**

- [x] **THE SECOND FINISHED THING**

## T-803 — ${date} — **THE THIRD FINISHED THING**

- [x] **THE THIRD FINISHED THING**
`;

// 1/5 -- THE COUNT SURVIVES A SWEPT CHART. This is the whole reason the sweep was blocked.
{
  const n = doneNumber(renderWith(SWEPT_CHART, logWith(day(0))));
  if (n === null) fail("could not find the Tasks card's `N done · N open` heading at all — the card he steers by is gone or renamed beyond recognition");
  else if (n === 0) fail("his card reads \"0 done\" on a day three rows were finished — the count is still being read from the ticked rows in CHART.md, which his other ruling empties");
  else if (n !== 3) fail(`the card reads "${n} done" against three of today's entries in the log`);
  else pass("three rows finished today, a Chart with none ticked, and the card reads 3");
}

// 2/5 -- AND IT RESETS. A code that simply counts log entries passes case 1 and fails here.
{
  const n = doneNumber(renderWith(SWEPT_CHART, logWith(day(-1))));
  if (n !== 0) fail(`yesterday's three finished rows still count as "${n} done" today — he asked for TODAY, over "this week", so a number that never resets is the thing he rejected`);
  else pass("yesterday's finished rows do not count toward today");
}

// 3/5 -- MIXED: today's are counted, older ones are not, in the same log.
{
  const n = doneNumber(renderWith(SWEPT_CHART, `${logWith(day(-3))}\n## T-804 — ${day(0)} — **FINISHED TODAY**\n\n- [x] **FINISHED TODAY**\n`));
  if (n !== 1) fail(`a log holding three old entries and one from today reads "${n} done" — it must read 1`);
  else pass("today's entry is counted and the three older ones are not");
}

// 4/5 -- A MISSING LOG IS UNREADABLE, NEVER "0 done". The house rule this file family already
//        carries: a source that cannot be read renders as unreadable, never as empty success. A
//        machine with no log yet and a machine where nothing shipped today must not look the same.
{
  const html = renderWith(SWEPT_CHART, null);
  const n = doneNumber(html);
  if (n !== 0) fail(`no CHART-LOG.md at all and the card claims "${n} done" — it is counting something that does not exist`);
  else pass("no log renders as 0 done rather than crashing the page");
}

// 5/5 -- HE MUST BE ABLE TO TELL IT IS A DAILY NUMBER. An unlabelled count that silently resets
//        overnight reads as work having been LOST, which is worse than the stale number it replaced.
{
  const h = heading(renderWith(SWEPT_CHART, logWith(day(0))));
  if (!/today/i.test(h)) fail(`the heading is "${h.replace(/<[^>]+>/g, "").trim()}" — the number resets every midnight and nothing on the card says so, so on Tuesday morning it reads as Monday's work having vanished`);
  else pass("the card says the number is today's");
}

console.log(failed ? "\nFAIL" : "\nPASS");
process.exit(failed ? 1 : 0);
