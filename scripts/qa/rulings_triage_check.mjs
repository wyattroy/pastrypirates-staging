// GATE: "YOUR RULINGS, IN HAND" MUST HOLD ONLY RULINGS NOBODY HAS TRIAGED YET.
//
// Wyatt, 2026-09-01 (INBOX-20260901T1310Z): "The Glass's Your Rulings -- In Hand are stale; there
// must be a process that triages them and adds them to the Tasks list, then removes them from the
// Your Rulings list."
//
// What he was looking at: the Glass renders every row of the Chart's "## RULED" table under that
// heading, forever. Five of the eight had been shipped, closed or root-caused days earlier. A
// card called "in hand" that never empties is a card he stops reading.
//
// THE PROCESS THIS GATE ENFORCES (the Chart states it in full, above its own RULED table):
//   1. a freshly harvested ruling lands in ## RULED with an EMPTY "now" cell -- untriaged;
//   2. if it still needs work, a "- [ ] Your ruling: ..." row goes in the STEP 1 CHECKLIST,
//      which is what the Glass builds its Tasks card from -- no second list to keep in step;
//   3. the row moves to ## SETTLED RULINGS with its verdict, and leaves the card.
//
// WHY THE FIX IS IN THE RECORD AND NOT IN THE PAGE, because the next reader will ask. The Glass
// generator (scripts/wyclau/glass.mjs) is VENDORED from claude-kit, which lives on Wyatt's Mac:
// scripts/qa/vendor_check.mjs fails the build on any edit to it here, and there is no way to
// re-vendor from this machine. Doing it in CHART.md is not a workaround -- his word was
// "process", and a lifecycle the record carries works for any surface that reads the record,
// including the next Glass.
//
// BOTH DIRECTIONS ARE RED-PROOFED BELOW (cases 3 and 4), because a gate that has only ever been
// green on the tree it was written against has not been shown to fail.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");

let failed = false;
const fail = (m) => { console.error(`FAIL -- ${m}`); failed = true; };
const pass = (m) => console.log(`PASS -- ${m}`);

// A verdict is DECLARED in this table's own convention: bold at the head of the "now" cell.
// Anything else -- including an empty cell -- is untriaged, which is the safe default: he
// steers by this card, so a ruling wrongly SHOWN costs far less than one wrongly hidden.
const DECLARED = /^\*\*[^*]{1,200}\*\*/;
// Outstanding work, i.e. this ruling still owes a task. Only unambiguous waiting phrases are
// trusted, and deliberately NOT the bare word "scheduled": "the stall test passed through the
// scheduled task" is Windows' Task Scheduler in a finished verdict, and an earlier draft of this
// filed that closed ruling as live work. A state word in passing prose is not a state.
const OUTSTANDING = /\bAWAIT(?:S|ED|ING)?\b|\bSTILL OPEN\b|\bNOT YET\b|\bPENDING\b|\bGATED ON\b|\bWAIT(?:S|ING)? (?:ON|FOR)\b|\*\*SCHEDULED\*\*/i;

function sectionRows(md, heading) {
  const sec = md.split(new RegExp(`^## ${heading}[^\\n]*$`, "m"))[1]?.split(/^## /m)[0] ?? "";
  return sec.split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*item\b/i.test(l) && !/^\|\s*-+/.test(l))
    .map((l) => {
      const c = l.split("|").map((x) => x.trim());
      return { item: c[1] ?? "", call: c[2] ?? "", now: c[3] ?? "" };
    });
}
const checklistRows = (md) => (md.split(/^## STEP 1 CHECKLIST[^\n]*$/m)[1]?.split(/^## /m)[0] ?? "")
  .match(/^- \[ \] .*$/gm) || [];

function renderWith(chart) {
  const dir = mkdtempSync(join(tmpdir(), "rulings-triage-"));
  mkdirSync(join(dir, "scripts", "wyclau"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  writeFileSync(join(dir, "scripts", "wyclau", "glass.mjs"), readFileSync(GLASS));
  writeFileSync(join(dir, ".planning", "CHART.md"), chart);
  execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "glass.mjs"), "--note", "triage gate"], { stdio: "pipe" });
  const html = readFileSync(join(dir, ".planning", "wyclau", "glass.html"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return {
    rulingsCard: (/<table id="ruled">([\s\S]*?)<\/table>/.exec(html) || ["", ""])[1],
    tasksCard: (/<h2>Tasks \(([\s\S]*?)<\/section>/.exec(html) || ["", ""])[0],
  };
}

// The rule, in one function, so the real Chart and the red-proof fixtures are judged identically.
function violations(md) {
  const out = [];
  for (const r of sectionRows(md, "RULED")) {
    if (DECLARED.test(r.now)) out.push(`"${r.item.slice(0, 60)}" sits in ## RULED with a verdict already written (${r.now.slice(0, 40)}…) -- a ruling with a fate has been triaged and belongs in ## SETTLED RULINGS, off the card.`);
  }
  /* ⚠ ONLY THE TAGGED ROWS COUNT, and the first version of this got it wrong. Searching the WHOLE
     checklist for the ruling's words made case 4's red-proof pass silently: delete the cutover
     ruling's row and "cutover" is still there in "Rulebook cutover: CLAUDE-next.md replaces…",
     "moment" still there in "GATED: same quiet moment". The gate looked green while the thing it
     guards was gone. Scoped to rows that declare themselves, so an accidental word match in
     somebody else's task can never stand in for a ruling's own row. */
  const checklist = checklistRows(md).filter((l) => /Your ruling:/i.test(l)).join("\n").toLowerCase();
  for (const r of sectionRows(md, "SETTLED RULINGS")) {
    if (!OUTSTANDING.test(r.now)) continue;
    const key = r.item.replace(/[`*]/g, "").toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 3);
    if (!key.length || !key.every((w) => checklist.includes(w))) {
      out.push(`settled ruling "${r.item.slice(0, 60)}" still owes work but has no "- [ ] Your ruling: …" row in the STEP 1 CHECKLIST -- it has left the rulings card without reaching the Tasks card, so it is on no surface he can see.`);
    }
  }
  return out;
}

const realChart = readFileSync(join(ROOT, ".planning", "CHART.md"), "utf8");

// 1/5 -- THE REAL CHART OBEYS THE LIFECYCLE.
{
  const v = violations(realChart);
  if (v.length) v.forEach((m) => fail(m));
  else pass(`the Chart's rulings lifecycle holds: ${sectionRows(realChart, "RULED").length} waiting to be triaged, ${sectionRows(realChart, "SETTLED RULINGS").length} settled.`);
}

// 2/5 -- WHAT HE ACTUALLY SEES, through the real generator: no settled ruling in the card, and
//        every settled ruling that still owes work is in Tasks. The record could be tidy and the
//        page still wrong; only rendering it can tell.
{
  const { rulingsCard, tasksCard } = renderWith(realChart);
  const settled = sectionRows(realChart, "SETTLED RULINGS");
  const leaked = settled.filter((r) => rulingsCard.includes(r.item.replace(/[`*]/g, "").slice(0, 30)));
  const owing = settled.filter((r) => OUTSTANDING.test(r.now));
  const missing = owing.filter((r) => !tasksCard.toLowerCase().includes(r.item.replace(/[`*]/g, "").toLowerCase().slice(0, 25)));
  if (leaked.length) fail(`${leaked.length} settled ruling(s) still render in "Your rulings, in hand" -- e.g. "${leaked[0].item.slice(0, 50)}".`);
  else if (missing.length) fail(`${missing.length} ruling(s) with work outstanding are on neither card -- e.g. "${missing[0].item.slice(0, 50)}".`);
  else pass(`the rendered page agrees: 0 settled rulings in the card, all ${owing.length} still-owing ruling(s) visible in Tasks.`);
}

// 3/5 -- RED-PROOF, DIRECTION ONE: a settled ruling left in the waiting room must FAIL.
{
  const bad = realChart.replace(/^## RULED[^\n]*$/m, "$&\n\n| The cutover moment | **\"After the exit test verdict\"** | **SCHEDULED** — gated on the exit test verdict. |");
  if (!violations(bad).length) fail("the gate cannot fail: a ruling carrying a verdict was planted in ## RULED and nothing objected.");
  else pass("red-proof: a verdict-carrying row planted in ## RULED is caught.");
}

// 4/5 -- RED-PROOF, DIRECTION TWO: an owing ruling with no checklist row must FAIL.
{
  /* ⚠ WENT STALE 2026-09-02 AND SAID SO — which is the whole reason this line is worth reading.
     The pattern used to be `^- \[ \] Your ruling: the cutover moment`, anchored to the checkbox with
     nothing allowed between it and the words. The Chartkeeper build then began giving every row a
     stable id, so CHART.md:431 now reads "- [ ] `T-007` Your ruling: the cutover moment" and this
     fixture matched nothing.
     IT FAILED LOUDLY RATHER THAN PASSING, and that is the design working: the message below says
     "the fixture is stale, so case 4 proves nothing" instead of quietly reporting a green case-4 that
     had tested nothing at all. The comment at :86 records that an earlier version DID pass silently
     here, and this is the guard that was added because of it.
     FIXED THE WAY :91 ALREADY WORKS — match the row by its WORDS, not by an exact prefix, so any
     future row-head decoration (an id, a star, a size tag) cannot break it again. */
  const bad = realChart.replace(/^- \[ \] .*Your ruling: the cutover moment.*$/m, "");
  if (bad === realChart) fail("the red-proof could not find the checklist row it meant to delete -- the fixture is stale, so case 4 proves nothing.");
  else if (!violations(bad).length) fail("the gate cannot fail: a ruling that still owes work had its only task row deleted and nothing objected.");
  else pass("red-proof: deleting an owing ruling's checklist row is caught.");
}

// 5/5 -- AN UNTRIAGED RULING IS STILL SHOWN. Over-hiding is the failure that would replace the
//        one he reported, and it would be harder to notice.
{
  const chart = `# Chart\n\n## STEP 1 CHECKLIST\n\n## BLOCKED ON WYATT\n\n## THE IDEA INBOX\n\n*(empty)*\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n| Whether the tutorial ships before launch | **"Yes, before"** | |\n`;
  const { rulingsCard } = renderWith(chart);
  if (violations(chart).length) fail("an untriaged ruling with an empty verdict cell was reported as a violation -- that is the one state this section exists to hold.");
  else if (!rulingsCard.includes("tutorial ships before launch")) fail("an untriaged ruling does not render in 'Your rulings, in hand' -- the card would be empty while a real ruling waits.");
  else pass("an untriaged ruling is legal and still renders in the card.");
}

process.exit(failed ? 1 : 0);
