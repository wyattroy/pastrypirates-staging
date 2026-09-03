#!/usr/bin/env node
// GATE: the sweep may never lose a row, and the two records may never both claim one.
//
// This is the guardrail `SPEC-CHARTKEEPER.md` PASS 4 asks for by name — *every closed `T-nnn`
// appears in exactly one of the two files, never both, never neither* — and it is the reason the
// spec chose a dedicated `.planning/CHART-LOG.md` over `CTO-LEDGER.md`: against a 1,700-line file
// carrying six other kinds of entry, this assertion cannot be written at all.
//
// WHY IT IS A GATE ON THE REAL FILES AND NOT ONLY A FIXTURE CASE. `chartkeeper_check.mjs` proves
// the TOOL conserves rows on a fixture. It cannot see the tree. Sweeping is the only thing in this
// whole system that DELETES from the document Wyatt reads, so the tree itself is worth an assertion
// — and it caught its own subject the day it was written: another session, in this same checkout,
// ran the sweep on the real Chart while the tool was still being edited. 612 lines left CHART.md.
// Nothing but a check on the real files can tell you whether that was a move or a deletion.
//
// WHAT IS DELIBERATELY *NOT* ASSERTED: that CHART.md holds no `- [x]` row. A row is ticked by
// `close_item.mjs` and swept in the same act, but a person may tick one by hand between two runs,
// and failing the build for that would punish the record-keeping rather than the record. The sweep
// takes it on the next pass. What must never happen is a row existing twice, or not at all.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHART = join(ROOT, ".planning", "CHART.md");
/* ⛔ THE OTHER CHART. Added 2026-09-03 — this gate read `CHART.md` alone and therefore reported
 * every row of the Glass chart as a handle "owned by nothing".
 *
 * He split the list on 2026-09-02: *"take every Glass-focused task on the Chart... YOU will work on
 * the chart -- the Watch will work on the game."* From that moment this gate was measuring a third
 * of the rows and judging the other two thirds missing. **The orphan count GREW as work went well**
 * — 38 → 112 → 106 across one night — because closing a row moves its handle into the half the
 * gate could not see. An instrument that gets louder the more you fix is measuring itself.
 *
 * ⚠ THIS IS THE FIFTH TOOL TONIGHT WITH THIS EXACT FAULT, and that is the finding worth carrying:
 * `close_item.mjs` (no `--chart=`), `chartkeeper.mjs` (parsed sections the new file lacked),
 * `tick_rows.mjs` (same), the ranker, and now this. **One instruction of his split one list in two,
 * and every tool that had the path written into it went quietly wrong in a different way.** Not one
 * of them errored; they all reported confidently about a file they could no longer fully see. */
const GLASS_CHART = join(ROOT, ".planning", "GLASS-CHART.md");
const LOG = join(ROOT, ".planning", "CHART-LOG.md");

let failed = false;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed = true; };
const pass = (m) => console.log(`  ok    ${m}`);
/* A finding this gate has MEASURED but does not own — it prints in full and is counted into the
   verdict line, so a run can never read as clean while naming defects. See cases 1 and 3. */
const REPORTS = [];
const report = (m) => { REPORTS.push(m); console.log(`  REPORT  ${m}`); };

console.log("a swept row is in exactly one of the two records\n");

if (!existsSync(CHART)) {
  fail(`no Chart at ${CHART} — this gate cannot check anything, which is worse than failing`);
  console.log("\nFAIL");
  process.exit(1);
}
const chart = readFileSync(CHART, "utf8")
  + (existsSync(GLASS_CHART) ? String.fromCharCode(10) + readFileSync(GLASS_CHART, "utf8") : "");
const log = existsSync(LOG) ? readFileSync(LOG, "utf8") : null;

/* A row's handle, read from the row it belongs to — never from a whole-file grep. His tables and
   other rows NAME handles as references, and a reference is not a claim of ownership. The owner of
   `T-007` is the checklist row (Chart) or the `## T-007 — …` entry (log) that carries its body. */
/* ⚠ AND OWNERSHIP IS THE TOOL'S OWN MARKER LINE, NOT A RECONSTRUCTION OF IT. The first version of
   this file split on `- [ ]`/`- [x]` — which misses every IDEA INBOX row, because those start
   `- **`. Measured before it was fixed: **16 handles reported as owned by nothing**, one of them
   `T-084`, a row filed an hour earlier. A conservation check that invents 16 lost rows is worse
   than no conservation check, because the first person to read it learns to ignore it. */
/* ⚠ A THEORY DIED HERE ON 2026-09-03T02:2xZ AND THE NOTE IS KEPT SO NOBODY RE-RUNS IT. A watch read
   this pattern — `⟨`(T-\d{3})`⟩`, handle alone — against `chart_model.mjs:205-213`, which documents
   fixing exactly that shape to allow `⟨`T-121` · size: S⟩`, and concluded this file was a stale
   private copy causing a false FAIL. **It replaced the line with the shared `idOfRow` reader and
   then measured both, on HEAD and on the live tree: 50 owned, max T-128, IDENTICAL, zero handles
   seen by one and not the other.** The change was a no-op and was reverted. What actually happened
   is that a peer session rewrote CHART.md between two gate runs, so the run that named T-120..T-123
   and the file inspected afterwards were different files. **The FAIL was true: those four rows had
   genuinely left both records.** If you are about to make this edit, measure the two readers against
   the same bytes first — the difference is zero. */
/* ⛔ A HANDLE LINE MAY CARRY MODIFIERS, AND THIS REGEX USED TO REFUSE THEM.
 * It required the handle to be the ENTIRE contents of the brackets — `⟨`T-nnn`⟩` and nothing else.
 * But the Chart writes `⟨`T-120` · size: M⟩` and `⟨`T-076` · now: yes⟩`, so **every row carrying a
 * size or his DO NOW pin was invisible as an owner** and reported as a row that had vanished.
 *
 * That is what the last four "losses" were: `T-120`…`T-123`, all four `· size:` rows, sitting in
 * GLASS-CHART.md the whole time. Nothing had left any record. **A gate whose job is "the sweep may
 * never lose a row" was manufacturing losses out of its own strictness** — and this file's header
 * still says of those four "the FAIL was true: those four rows had genuinely left both records",
 * which was believed and is wrong.
 *
 * ⚠ AND IT IS THE SAME FAULT AS `close_item.mjs`'s, hours earlier: a tool that asks for a row's
 * IDENTITY and then only accepts one exact spelling of it. Match the handle; allow what follows. */
const ownedIn = (md) => [...md.matchAll(/^\s*⟨`(T-\d{3})`[^⟩]*⟩\s*$/gm)].map((m) => m[1]);
const archivedIn = (md) => (md.match(/^## (T-\d{3}) — /gm) || []).map((h) => /T-\d{3}/.exec(h)[0]);
const chartOwned = new Set(ownedIn(chart));
const logOwned = new Set(archivedIn(log ?? ""));

/** Handles allocated below the highest one and owned by no row in either record. */
/* ⛔ EVIDENCE A ROW EXISTED — NOT A GAP IN A NUMBER LINE. Rewritten 2026-09-03 after this check
 * cried wolf twice in one night, from two different hands.
 *
 * It used to walk 1..max(owned) and accuse every integer nobody owned. **A hand-minted handle
 * therefore manufactured a vanished row for every number it skipped.** My own `T-203` invented
 * **68**; another session's `T-204`–`T-206` invented **60** four hours later. Neither had lost
 * anything. **A fault that recurs from two independent hands is the design's, not the hands'.**
 *
 * The header above promises "the sweep may never LOSE a row". A gap is not a loss — it is also an
 * id minted for a row never written, or a number the allocator stepped over. So the rule is now:
 * **a handle is accused only if there is EVIDENCE it ever existed** — it appears as text somewhere
 * in the two charts or the log — **and yet no row owns it.** That is a row that was here and left.
 *
 * ⛔ WHAT THIS GIVES UP — **AND THE FIRST VERSION OF THIS PARAGRAPH UNDERSTATED IT BADLY, IN THE
 * FLATTERING DIRECTION.** It said *"a row deleted along with every mention of it anywhere is now
 * invisible"*, which reads like a corner case. **It is the ordinary case.** CEO 160 asked for the
 * number and it is one command:
 *
 *   MEASURED 2026-09-03 on the live records — 83 owned rows, and if a row were deleted outright:
 *     .planning/CHART.md         56 rows — 14 still caught, **42 invisible**
 *     .planning/GLASS-CHART.md   27 rows — 14 still caught, **13 invisible**
 *     total                      83 rows — 28 still caught, **55 invisible (66%)**
 *   (Method: a handle survives deletion only if it appears somewhere BESIDES its own owner line.
 *    Most rows are mentioned exactly once, on that line. `T-121`, `T-123`, `T-142` and `T-206` each
 *    appear precisely once — and `T-123`, the row that produced this very change, is in the
 *    invisible set.)
 *
 * **SO THIS IS A STOPGAP, LABELLED AS ONE.** It is still the right trade today — the old rule's red
 * was 60 accusations with nothing lost, which is 100% loss of power because it teaches a session to
 * step over the failure, and two independent hands hit it in one night. But two thirds is not a
 * corner, and the recovery is cheap: **have `--sweep` write the handles it owned into
 * `CHART-LOG.md` as it runs.** Then every handle has a witness that outlives its row, the number
 * line is not needed, and this check goes back to full power. Until that lands, read this gate as
 * *"catches a third of deletions"*, not as *"catches deletions"*.
 *
 * ⚠ WHY THE SCAN READS ONLY THE THREE RECORD FILES — **and the reason written here first was the
 * REVERSE of the truth, which is rule 6's other half biting inside a shipped gate.** It claimed
 * that this function's own failure output landing back in a record file would make every accused
 * handle count as evidence and the check would *"quietly stop firing"*. CEO 160 measured that:
 * pasting the failure line into a chart takes accusations from **1 to 3**. It gets LOUDER, never
 * quieter — because being SEEN is a precondition for being accused, not an exemption. The only
 * exemption is being OWNED.
 *
 * **The real reason is the sentence twelve lines below, which was right all along: prose about a
 * handle is not evidence that handle ever owned a row.** A wide corpus manufactures false
 * accusations; that is what the limit prevents. */
function missingHandles(inChart, inLog, corpus) {
  const owned = new Set([...inChart, ...inLog]);
  if (!owned.size) return [];
  const seen = new Set((corpus.match(/T-\d{3}/g) || []));

  /* ⚠ TWO EXCLUSIONS. **THE FIRST RUN PRODUCED TWO FALSE ACCUSATIONS AND I WROTE DOWN THE WRONG
   * CAUSE FOR THEM** — this comment used to say my predicted self-reference trap had *"fired in a
   * milder form"*. It had not fired; CEO 160 showed it CANNOT fire (see the header — being seen is
   * a precondition for accusation, so that output makes the gate louder, not quieter).
   * **What I actually observed was two false accusations; what I wrote down was my explanation of
   * them, in the same voice, and the explanation was wrong.** That is CEO 158's finding recurring
   * in a new medium: looking at a result licenses you to report the RESULT, never the MECHANISM.
   *
   * The two survivors, correctly stated: `T-203`, accused because a row EXPLAINS that it was
   * renumbered away, and `T-802`, accused because a row QUOTES a gate's fixture output.
   * **Prose ABOUT a handle is not evidence that handle ever owned a row.** That one sentence is the
   * whole reason for both exclusions and for the narrow corpus.
   *
   * (a) A DOCUMENTED RENUMBER IS A RETIREMENT, not a loss. `RENUMBERED T-203 → T-135` is a row
   *     saying out loud where that id went; treating it as a vanished row punishes the record for
   *     being honest about itself.
   * (b) `T-8xx` IS THE FIXTURE RANGE. `chartkeeper_check` and `do_now_check` build throwaway charts
   *     with `T-801`/`T-802`/`T-803`, and a row that quotes their output is discussing a test, not
   *     naming a task. Encoded because the convention already exists in three gates. */
  const renumberedAway = new Set(
    [...corpus.matchAll(/RENUMBERED\s+`?(T-\d{3})`?\s*(?:→|->)/g)].map((m) => m[1]));

  /* (c) ⛔ AN ID MINTED AND REVERTED IS NOT A LOST ROW EITHER — the same shape as (a), and the third
   *     face of the one sentence this function turns on: **prose ABOUT a handle is not evidence that
   *     handle ever owned a row.**
   *
   *     Added 2026-09-03 after this gate failed the whole shared branch for hours. A watch's write
   *     went wrong, allocated `T-233`/`T-234`, and was reverted WITH the ids — then wrote the
   *     incident up on the Chart, honestly, naming them. The write-up was the only trace either id
   *     ever had, and this check read that trace as *"two rows existed and have vanished"*. **The
   *     record was punished for being honest about itself**, which is word for word the fault (a)
   *     exists to prevent, arriving through a door (a) does not cover.
   *
   *     ⛔ AND THE FIRST VERSION OF THIS EXCLUSION WAS A LOOSENING, WHICH CEO 186 PROVED RATHER THAN
   *     ARGUED. It called a line exempt if the line anywhere contained *"spurious"*, *"reverted"* or
   *     *"never written"*, and swept every id on it. On the live records that already exempted **6
   *     handles where 2 were intended** — and the CEO then hid a REAL lost row behind it: delete
   *     `T-207`'s owner line and the gate names it; add eleven ordinary words — *"(the first attempt
   *     at this was reverted.)"* — to some other line, and the gate prints *"no row has fallen
   *     between the two files."*
   *     **A prose keyword is not a declaration. It is prose, which is the exact thing this whole
   *     function refuses to treat as evidence** — the fault arrived inside the fix for itself.
   *
   *     So it is now an EXPLICIT MARKER, symmetrical with (a)'s `RENUMBERED T-nnn →`: a record must
   *     write `NEVER OWNED A ROW: T-233, T-234` on purpose. Ordinary English cannot trip it, one
   *     line cannot exempt ids it does not name, and the exemption is as auditable as the accusation. */
  const declaredNeverReal = new Set();
  for (const m of corpus.matchAll(/NEVER OWNED A ROW:?\s*((?:`?T-\d{3}`?[,\s]+)*`?T-\d{3}`?)/g))
    for (const h of m[1].matchAll(/T-\d{3}/g)) declaredNeverReal.add(h[0]);

  const out = [];
  for (const h of seen) {
    if (owned.has(h)) continue;
    if (renumberedAway.has(h)) continue;
    if (declaredNeverReal.has(h)) continue;
    if (/^T-8\d\d$/.test(h)) continue;
    out.push(h);
  }
  return out.sort();
}

/* 1/4 -- NEVER BOTH, AND THIS ONE REPORTS RATHER THAN FAILS. READ WHY BEFORE CHANGING IT.
 *
 * A handle owning a row in BOTH files means the two records can disagree about one item. On the day
 * this gate was written it found two — `T-078` and `T-079` — and **neither was caused by the
 * sweep.** They are the already-filed duplicate-handle defect: `CHART.md` carries three separate
 * open rows all stamped `T-079` and a second `T-078`, found 2026-09-02T12:5xZ by the watch that
 * closed `T-079`, and written up as its own row with the repair already chosen ("give the NEWER row
 * a free handle"). The sweep simply moved one of each pair to the log, so the collision changed
 * address without changing shape.
 *
 * SO THIS IS A SCOPE LINE, NOT A WEAKENING, and the difference matters: failing the build here
 * would block every watch on a defect that predates this change and belongs to another open row,
 * and *fixing* it here would close that row without the CEO verdict `close_item.mjs` requires.
 * What it must never do is go quiet — a duplicate handle is load-bearing now that ranking,
 * blocking and citations all key on `T-nnn`. So it prints the whole list, by name, every run.
 *
 * ⚑ TURN THIS INTO A `fail()` THE DAY THE DUPLICATE-HANDLE ROW CLOSES. That is one word. */
{
  const both = [...chartOwned].filter((h) => logOwned.has(h));
  if (both.length) report(`${both.length} handle(s) own a row in BOTH files — ${both.join(", ")}. Not this gate's to fail: it is the open duplicate-handle row on CHART.md, whose repair is "give the newer row a free handle". Fail this case the day that row closes.`);
  else pass(`${chartOwned.size} row(s) on the Chart and ${logOwned.size} in the log, with no handle in both`);
}

/* 2/4 -- NEVER NEITHER. THIS is the assertion the spec asks for by name, and it is the one the
 *        sweep genuinely owns. Two halves, and the first version of this file only had the weaker
 *        one — CEO 107 caught exactly that: "case 2 only checks entries that ALREADY ARRIVED."
 *
 *   (a) A HANDLE THAT EXISTED AND IS NOW OWNED BY NOTHING. Handles are allocated sequentially by
 *       `nextId()` and never reused, so a GAP below the highest one is a row that was allocated and
 *       has since left both records. **That is derivable from the two files alone** — no git
 *       archaeology, nothing to keep in step, and it fails the day a sweep drops something on the
 *       floor. Measured on the real tree the day it was written: 87 distinct handles up to T-087,
 *       ZERO gaps.
 *   (b) An entry with no body: the row left the Chart and its text did not arrive. A deletion
 *       wearing a heading.
 *
 *  RED-PROOFED BELOW, in case 2r, because a conservation check that has only ever been green on a
 *  conserved tree has not been shown to fail. */
{
  if (log === null) { pass("no CHART-LOG.md yet — nothing has been swept on this machine"); }
  else {
    const gaps = missingHandles(chartOwned, logOwned, chart + String.fromCharCode(10) + (log ?? ""));
    if (gaps.length) fail(`${gaps.length} allocated handle(s) are owned by NOTHING in either file — ${gaps.slice(0, 8).join(", ")}. Handles are allocated once and never reused, so a gap is a row that existed and has left both records: the one failure a sweep cannot undo`);
    else pass(`every handle up to the highest allocated is owned by exactly one row — no row has fallen between the two files`);

    const empty = (log.split(/^## (?=T-\d{3} — )/m).slice(1))
      .filter((e) => e.split("\n").slice(1).join("").trim().length < 20)
      .map((e) => e.slice(0, 9));
    if (empty.length) fail(`${empty.length} archived entr(y/ies) carry no body — ${empty.join(", ")}. The row left the Chart and its text did not arrive, which is a deletion wearing a heading`);
    else pass("every archived entry carries the row's own text");
  }
}

/* 2r/4 -- THE RED-PROOF FOR BOTH HALVES OF CASE 2, on fabricated records rather than the tree.
 *         The commit that first shipped this gate claimed it was red-proofed and it was not — the
 *         claim is corrected here rather than quietly dropped, because an unearned "red-proofed" is
 *         the same currency as an unmeasured defect (rule 6). CEO 107 found it in one pass. */
{
  /* ⚠ THE FIXTURE MOVED WITH THE SEMANTICS, AND SAYING SO MATTERS. The check used to walk the
     integer line, so a bare gap at T-002 was enough to catch. It now accuses only handles there is
     EVIDENCE existed, so the fixture must supply that evidence -- the mention of T-002 in the first
     row body IS the subject of this test. Without it the case would pass vacuously, which is the
     fault this gate own header is about. */
  const chartFixture = "- [ ] **A ROW** (split out of `T-002`, which is not here)\n      ⟨`T-001`⟩\n- [ ] **ANOTHER**\n      ⟨`T-003`⟩\n";
  const logFixture = "## T-004 — 2026-09-02 — **AN ARCHIVED ROW**\n\n- [x] **AN ARCHIVED ROW** with a body long enough to count.\n";
  const gaps = missingHandles(new Set(ownedIn(chartFixture)), new Set(archivedIn(logFixture)), chartFixture + logFixture);
  if (!gaps.includes("T-002")) fail(`the gap check cannot fail: handles 1, 3 and 4 exist, 2 does not, and it reported ${JSON.stringify(gaps)}`);
  else pass("red-proof: a handle owned by neither record is caught");

  const hollow = ("## T-005 — 2026-09-02 — **A HOLLOW ENTRY**\n\n\n").split(/^## (?=T-\d{3} — )/m).slice(1)
    .filter((e) => e.split("\n").slice(1).join("").trim().length < 20);
  if (!hollow.length) fail("the empty-body check cannot fail: an archive entry with nothing under its heading was not caught");
  else pass("red-proof: an archived entry with no body is caught");
}

/* 3/4 -- HANDLES ARE NEVER REUSED. The whole value of `T-nnn` is that a CEO verdict, a commit
 *        message and a ledger line written weeks apart all mean the same row. Same scope line as
 *        case 1, same reason, and it found the same defect from the other side: three open rows on
 *        the Chart stamped `T-079`, and two archive entries apiece for `T-057` and `T-058` from
 *        eras a month apart. Printed in full, owned by the duplicate-handle row. */
{
  const dupes = (where, list) => {
    const seen = new Map();
    for (const m of list) seen.set(m, (seen.get(m) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${where}:${k}×${n}`);
  };
  const chartList = chart.split(/^- \[[ xX]\] /m).slice(1)
    .map((b) => (/`(T-\d{3})`/.exec(b.split(/^- \[/m)[0]) || [])[1]).filter(Boolean);
  const logList = (log ?? "").match(/^## (T-\d{3}) — /gm)?.map((x) => /T-\d{3}/.exec(x)[0]) ?? [];
  const bad = [...dupes("chart", chartList), ...dupes("log", logList)];
  if (bad.length) report(`a handle is allocated twice — ${bad.join(", ")}. Two rows sharing a handle is worse than neither having one, and it is the open duplicate-handle row's to repair.`);
  else pass("every handle is allocated to exactly one row, in each file");
}

// 4/4 -- THE SETTLED RULINGS TABLE LIVES IN EXACTLY ONE PLACE. His ruling swept it to the log; a
//        copy left behind in the Chart is a second source of truth for his own decisions.
{
  const inChart = /^## SETTLED RULINGS/m.test(chart);
  const inLog = /^## SETTLED RULINGS/m.test(log ?? "");
  if (inChart && inLog) fail("`## SETTLED RULINGS` exists in BOTH CHART.md and CHART-LOG.md — his answered rulings now have two homes, and nothing says which one anything reads");
  else pass(inLog ? "his settled rulings live in the log, and only there" : "his settled rulings are still in the Chart, awaiting the first sweep");
}

/* ⚠ "PASS" ALONE READ AS A CLEAN BILL WHILE SIX DEFECTS WERE PRINTED ABOVE IT — CEO 107's words,
   and it was right: a verdict line that ignores its own REPORT lines is the shape of every
   reassuring gate this project has been burned by. The count goes in the verdict. */
const reported = REPORTS.length;
console.log(failed
  ? "\nFAIL"
  : reported
    ? `\nPASS — the sweep conserved everything. ${reported} finding(s) REPORTED above and owned by the open duplicate-handle row, not by this gate.`
    : "\nPASS");
process.exit(failed ? 1 : 0);
