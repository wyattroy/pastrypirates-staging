#!/usr/bin/env node
/* chartkeeper_check.mjs — the Chart must re-prioritise itself, and must never close anything.
 *
 * WHY (Wyatt, 2026-09-02, and it is the FOURTH time he has asked): "audit the chart ('tasks') which
 * has MANY completed tasks still stale on it, and design ... a system that will dynamically
 * reprioritize it, update it, and move things around it that is built into this process somehow."
 * The first three asks (00:59:32Z, 03:45:45Z/03:46:13Z, 03:49:02Z) are still sitting in the idea
 * inbox marked SCHEDULED. **The fix for the Chart's inability to re-prioritise was itself filed on
 * the Chart and never rose** — which is the spec's own acceptance test and is checked below.
 *
 * THIS GATE IS BEHAVIOURAL, NOT A SOURCE GREP. Every case builds a fixture Chart on disk, runs the
 * real `scripts/wyclau/chartkeeper.mjs` against it, and reads what it actually did. The project has
 * paid twice for the other kind: the sea trial's scorecard gate "greps source text, so it is green
 * and cannot fail" (CHART.md), and `doc_command_check.js` had a skip branch that could never fire.
 * A check that cannot fail is not a check.
 *
 * RED-PROOFED BOTH DIRECTIONS, which is guardrail 2 of the spec and the reason half these cases
 * exist: a reaper that flags everything is exactly as useless as one that flags nothing. So there
 * is a live row that must be LEFT ALONE and a dead row that must be FLAGGED, in the same fixture.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEEPER = join(ROOT, "scripts", "wyclau", "chartkeeper.mjs");

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log("the Chart re-prioritises itself, and never closes anything\n");

if (!existsSync(KEEPER)) {
  fail("scripts/wyclau/chartkeeper.mjs does not exist — the Chart has no way to re-order itself, so his four asks stay in file order");
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "chartkeeper-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

/* Fixtures are written as real Chart files — the same two sections the Glass reads
   (`## STEP 1 CHECKLIST` and `## THE IDEA INBOX`), because the Chartkeeper's whole job is to be
   right about the list HIS PHONE renders, not about a tidier list of its own. */
const chartFile = (name, body) => {
  const p = join(tmp, `${name}.md`);
  writeFileSync(p, body);
  return p;
};

/* ⚠ EVERY RUN IS PINNED TO A THROWAWAY ARCHIVE, AND THE FIRST VERSION WAS NOT. Found by looking at
   `git status` rather than by any assertion: cases that pass `--write` without `--log` fell back to
   the tool's DEFAULT archive path, so this gate wrote three fixture rows — "A DONE ROW FROM LONG
   AGO — SHIPPED 2001-02-03" — into the repo's real `.planning/CHART-LOG.md`, and burned real row
   ids doing it. **A test that writes into the tree it measures is the same fault as an instrument
   that writes into the thing it measures**, which is the bug this gate caught in the tool itself an
   hour earlier. Pinning it in the helper means a future case cannot forget. */
/* ⚠ AND THE PIN IS PER-CHART, NOT ONE SHARED DEFAULT — the second half of the same lesson, learned
   when SWEEP started READING the archive as well as writing it. `chartkeeper.mjs` now merges the
   log's `## SETTLED RULINGS` into his rulings, because that table moved house and every signal
   reading it had to follow (see `derive`). The moment it did, one shared fixture archive became a
   channel between cases: case 7 swept MIXED's settled table — which names `T-902` — into the common
   log, and case 12c, whose whole point is that exactly ONE of its twins has a live ruling, found
   BOTH of them named and went red. Nothing was wrong with the tool.
   **A shared scratch file is fine while it is only ever written and never read back.** The day
   anything reads it, it is shared state between tests, and shared state between tests is how a
   green suite starts describing a system nobody has. Derive the log from the chart it belongs to. */
const run = (args) => {
  const chartArg = args.find((a) => a.startsWith("--chart="))?.slice(8) ?? "default";
  const own = `${chartArg.split(/[\\/]/).pop().replace(/\.md$/, "")}-LOG.md`;
  const pinned = args.some((a) => a.startsWith("--log=")) ? args : [...args, `--log=${join(tmp, own)}`];
  try {
    return { code: 0, out: execFileSync(process.execPath, [KEEPER, ...pinned], { encoding: "utf8", cwd: ROOT }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const runJson = (args) => {
  const r = run([...args, "--json"]);
  try { return { ...r, json: JSON.parse(r.out) }; } catch { return { ...r, json: null }; }
};

/* ── THE MIXED FIXTURE. One live row and one dead row, side by side, so a reaper that answers the
   same way to everything fails on one of the two no matter which way it is stuck. ── */
const TODAY = new Date().toISOString().slice(0, 10);
const MIXED = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **A LIVE ROW WITH A LIVE POINTER — See BLOCKED ON WYATT** for the taste call on the
      ⟨\`T-901\`⟩
      lantern colour. Nothing about this row is finished.
- [ ] **A DEAD POINTER — See BLOCKED ON WYATT** for the deploy permission. He answered this
      ⟨\`T-902\`⟩
      hours ago and nothing moved it.
- [ ] **A ROW CITING A TRIAL REPORT THAT DOES NOT EXIST** — see
      \`.planning/SEA-TRIAL-fixture-never-written.md\`, verdict pending.
- [ ] **A ROW WHOSE EVIDENCE IS RETIRED** — measured on build \`2000.01.01.1\`, which is not the
      stamp in the tree.
- [ ] **A GATED ROW** that must sink — GATED: waiting for the quiet moment. Filed 2026-09-02T04:19Z.
- [x] **A DONE ROW FROM LONG AGO** — SHIPPED 2001-02-03.
- [x] **A DONE ROW FROM TODAY** — SHIPPED ${TODAY}.

⚠ THE LETTER Z ABOVE IS LOAD-BEARING AND MUST NOT BE TIDIED AWAY. The first version of this
fixture contained no capital Z anywhere, and that is the only reason the idempotence case below
passed while the section splice was broken: it used the lookahead \`(?=^## |\\Z)\`, and \`\\Z\` is
not a JavaScript anchor — it matches a literal Z. On the real Chart, which writes UTC times in
every other line, one run spliced the section after about a line and a second run tripled the file.
The fixture now carries a Z the way the real file does.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|
| **What colour should the lantern be?** the taste call on the lantern colour — holds up \`T-901\` | Recommended: brass | 2026-09-02 |

## SETTLED RULINGS — triaged, and kept on the record forever

| item | HIS RULING | now |
|---|---|---|
| The deploy permission, which \`T-902\` is still waiting on | **"we fixed it"** | CLOSED, already done. |

## THE IDEA INBOX

- **An unfated idea about the lantern colour** — he wrote this on the Glass and nobody has
  given it a fate yet.
- **A fated idea** — already handled → **SHIPPED** 2026-09-01.
`;

/* 1. IT MUST NEVER TICK A BOX. The single most important property, and the reason REAP only ever
      measures the POINTER and never the WORK. `mark_glass_published.mjs` is the cautionary tale in
      this same directory: a stamp that could only say one thing recorded a publish that never
      happened. An instrument allowed to erase work from the record will eventually erase some. */
{
  const p = chartFile("no-tick", MIXED);
  const before = (readFileSync(p, "utf8").match(/^- \[x\]/gm) || []).length;
  run([`--chart=${p}`, "--reap", "--rank", "--write"]);
  const after = readFileSync(p, "utf8");
  const afterDone = (after.match(/^- \[x\]/gm) || []).length;
  if (afterDone > before) fail(`ticked ${afterDone - before} box(es) — closing is a claim about WORK and belongs to a watch behind close_item.mjs, never to an unattended reaper`);
  else pass("ticked no boxes — flags a pointer, never closes an item");
  if (!/- \[ \]/.test(after)) fail("no open rows survived the write at all — the reaper rewrote the list out of existence");
  else pass("open rows survive the write");
}

/* 2. RED-PROOFED BOTH WAYS, IN ONE PASS. The live row must be left alone and the dead one flagged.
      Guardrail 2 of the spec, in its own words: "a reaper that flags everything is as useless as
      one that flags nothing." */
{
  const p = chartFile("both-ways", MIXED);
  const r = runJson([`--chart=${p}`, "--reap"]);
  if (!r.json) { fail(`--reap --json produced no JSON a caller can read. Got: ${r.out.trim().slice(0, 160)}`); }
  else {
    const flagged = (r.json.reap || []).map((x) => x.title || "").join(" | ");
    if (/A LIVE ROW WITH A LIVE POINTER/.test(flagged))
      fail("flagged the live row — its pointer resolves to a real BLOCKED ON WYATT question, so nothing about it is stale");
    else pass("left the live row alone (its pointer still resolves)");
    if (!/A DEAD POINTER/.test(flagged))
      fail("did not flag the dead pointer — its BLOCKED ON WYATT question is gone, which is exactly the stale row he reads five of every day");
    else pass("flagged the dead pointer");
    if (!/TRIAL REPORT THAT DOES NOT EXIST/.test(flagged))
      fail("did not flag the row citing a trial report that is not on disk");
    else pass("flagged the row citing a report that does not exist");
    if (!/EVIDENCE IS RETIRED/.test(flagged))
      fail("did not flag the row whose build stamp is older than the stamp in the tree — its measurement no longer describes this game");
    else pass("flagged the row whose evidence is retired");
    const unexplained = (r.json.reap || []).filter((x) => !x.reason || !String(x.reason).trim());
    if (unexplained.length) fail(`flagged ${unexplained.length} row(s) with no derived reason — an unexplained flag is an opinion`);
    else pass("every flag carries the derived reason that produced it");
  }
}

/* 3. IT MUST BE ABLE TO SAY THE CHART IS FINE. Guardrail 4. A pass that always finds something is
      measuring itself, and the next reader learns to ignore it — which is how the whole gate
      becomes decoration. */
{
  const CLEAN = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **A perfectly ordinary open row** with no pointers, no pids and no build stamps in it.
- [ ] **A second ordinary open row** describing work in \`src/ui/flow.js\` that nobody has done.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;
  const p = chartFile("clean", CLEAN);
  const r = runJson([`--chart=${p}`, "--reap"]);
  if (!r.json) fail("no JSON on the clean fixture");
  else if ((r.json.reap || []).length !== 0)
    fail(`flagged ${r.json.reap.length} row(s) on a Chart with nothing stale in it — a reaper that always finds something is measuring itself`);
  else pass("says the Chart is fine when it is fine");
}

/* 4. RANK MUST SINK EVERY BLOCKED ROW BELOW EVERY UNBLOCKED ONE, AND EXPLAIN EVERY POSITION.
      The spec: "blocked sinks to the bottom, always. This alone fixes most of the present list."

      ⚠ THIS ASSERTION WAS WRONG ON ITS FIRST RUN AND THE CORRECTION IS THE USEFUL PART. It first
      demanded the GATED row be LAST, full stop — and the tool put it second-to-last, correctly,
      because THE FIXTURE HAS TWO BLOCKED ROWS: the GATED one, and the one waiting on a live
      BLOCKED ON WYATT question. Both belong at the bottom and their relative order is arbitrary.
      An over-specified check fails on correct behaviour, which trains the next reader to edit the
      check rather than the code — so it is written here as the property that actually matters. */
{
  const p = chartFile("rank", MIXED);
  const r = runJson([`--chart=${p}`, "--rank"]);
  if (!r.json || !Array.isArray(r.json.rank)) fail("--rank --json produced no ordered list");
  else {
    const titles = r.json.rank.map((x) => x.title || "");
    const gatedAt = titles.findIndex((t) => /A GATED ROW/.test(t));
    const unblockedBelow = r.json.rank.slice(gatedAt + 1).filter((x) => x.score > 0);
    if (gatedAt === -1) fail("the GATED row vanished from the ranking — a blocked row is still a row he can see");
    else if (unblockedBelow.length) fail(`${unblockedBelow.length} unblocked row(s) ranked BELOW the GATED row — blocked must sink beneath everything actionable`);
    else if (r.json.rank[gatedAt].score > 0) fail("the GATED row scored positive — GATED must be a sinking signal, not a neutral one");
    else pass("the GATED row sank beneath every actionable row");
    const mute = r.json.rank.filter((x) => !x.whyNow || !String(x.whyNow).trim());
    if (mute.length) fail(`ranked ${mute.length} row(s) with no why-now phrase — an order he cannot read is an order he cannot overrule`);
    else pass("every ranked row carries a why-now phrase he can read and overrule");
  }
}

/* 4b. THE ORDER MUST BE DERIVED FROM THE ROWS, NOT FROM FILE ORDER. If the ranking is a permutation
      that happens to equal the input every time, RANK is a very expensive no-op — and it would look
      exactly like a working one on the day it shipped. So: move one row to the top of the file and
      the ranking must come out identical. */
{
  const pA = chartFile("derived-a", MIXED);
  const a = runJson([`--chart=${pA}`, "--rank"]);
  // The row to move is DERIVED from the fixture, never re-typed. It was re-typed once, the fixture
  // gained a timestamp, the two silently stopped matching, and the "shuffle" quietly became
  // "duplicate the GATED row" — which then failed for a reason that had nothing to do with ranking.
  const gatedRow = `${(MIXED.match(/^- \[ \] \*\*A GATED ROW\*\*[^\n]*$/m) || [])[0]}\n`;
  const shuffled = MIXED
    .replace(gatedRow, "")
    .replace("## STEP 1 CHECKLIST — the reboot\n\n", `## STEP 1 CHECKLIST — the reboot\n\n${gatedRow}`);
  const gatedCount = (s) => (s.match(/A GATED ROW/g) || []).length;
  if (shuffled === MIXED) fail("the shuffled fixture is identical to the original — this case cannot fail and is therefore not a check");
  else if (gatedCount(shuffled) !== gatedCount(MIXED)) fail("the shuffle changed how many rows exist, so it is testing something other than order");
  const pB = chartFile("derived-b", shuffled);
  const b = runJson([`--chart=${pB}`, "--rank"]);
  if (!a.json || !b.json) fail("could not rank one of the two orderings");
  else {
    const ta = a.json.rank.map((x) => x.title);
    const tb = b.json.rank.map((x) => x.title);
    if (JSON.stringify(ta) !== JSON.stringify(tb))
      fail(`the same rows in a different file order produced a different ranking — the score is reading position, not the row.\n        ${JSON.stringify(ta)}\n        ${JSON.stringify(tb)}`);
    else pass("the same rows ranked identically from two different file orders — the order is derived from the rows");
  }
}

/* 5. SWEEP TAKES EVERY COMPLETED ROW, IMMEDIATELY, AND LEAVES NO STUB — HIS RULING, and it
      OVERRULES the design the first version of this case defended.

      Wyatt, 2026-09-02, `SPEC-CHARTKEEPER.md`'s 🛑 banner: *"SWEEP takes EVERY completed row,
      immediately, and leaves NO stub. Not 'older than 7 days'."* And the sentence the spec says
      outranks the rest of that document: *"The chart should therefore only show WHERE WE ARE
      GOING — accurately, constantly updating."*

      ⚠ THIS CASE USED TO ASSERT THE OPPOSITE, IN BOTH HALVES, AND WAS GREEN. It demanded that a
      row finished today STAY ("the 7-day window is the whole point") and that a one-line stub
      REMAIN ("an old reference to that row now lands nowhere"). Both are the draft he read and
      changed. **Three green cases were holding the overruled design in place**, which is why this
      had to go red before it went green — the age threshold is a constant nobody could defend
      (rule 9), and a stub is still the past sitting in a document about the future.

      THE THREE THINGS THIS NOW PROVES, and the third is the one the old filter silently dropped:
      every done row leaves whatever its age · nothing is left behind pointing at the archive ·
      **a done row carrying NO readable date leaves too.** `sweepable`'s old `x.when && …` meant a
      row nobody had dated could never be archived at all, so "sweep every completed row" would
      still have quietly kept some — a second, invisible reason a finished row stays on his list. */
const SWEEP_ALL = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **SOMETHING STILL OPEN** so the section is not all-done. Filed 2026-09-02T04:19Z.
- [x] **A DONE ROW FROM LONG AGO** — SHIPPED 2001-02-03.
- [x] **A DONE ROW FROM TODAY** — SHIPPED ${TODAY}.
      This row has a second line, and the essay must reach the archive verbatim: PRESERVE-ME.
- [x] **A DONE ROW CARRYING NO DATE AT ALL** — finished, and nobody ever wrote down when.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## SETTLED RULINGS — triaged, and kept on the record forever

| item | HIS RULING | now |
|---|---|---|
| The deploy permission, long since dealt with | **"we fixed it"** | CLOSED, already done. |

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;
{
  const p = chartFile("sweep", SWEEP_ALL);
  const log = join(tmp, "CHART-LOG.md");
  const doneBefore = (readFileSync(p, "utf8").match(/^- \[x\]/gm) || []).length;
  run([`--chart=${p}`, `--log=${log}`, "--sweep", "--write"]);
  const after = readFileSync(p, "utf8");
  const doneAfter = (after.match(/^- \[x\]/gm) || []).length;
  if (doneBefore !== 3) fail(`the fixture no longer has the three done rows this case is about (found ${doneBefore}) — it proves nothing`);
  else if (doneAfter !== 0)
    fail(`${doneAfter} of ${doneBefore} finished rows are still on the Chart after a sweep — his ruling is EVERY completed row, immediately, and "MANY completed tasks still stale on it" was the complaint that started this`);
  else pass("every finished row left the Chart — none survived on age or on a missing date");

  if (/↳/.test(after))
    fail("a stub was left behind — he overruled the stub: a pointer to the past is still the past sitting in a document about the future");
  else if (/A DONE ROW FROM LONG AGO|A DONE ROW FROM TODAY|A DONE ROW CARRYING NO DATE/.test(after))
    fail("a swept row's title is still somewhere in CHART.md — the row is meant to leave completely");
  else pass("nothing was left behind pointing at the archive — no stub, no title");

  if (!/SOMETHING STILL OPEN/.test(after))
    fail("the sweep took an OPEN row with it — a sweep that eats unfinished work is worse than a long Chart");
  else pass("the open row is untouched");

  if (!existsSync(log)) fail("wrote no archive file — a sweep that deletes instead of archiving loses the record");
  else {
    const archived = readFileSync(log, "utf8");
    for (const t of ["A DONE ROW FROM LONG AGO", "A DONE ROW FROM TODAY", "A DONE ROW CARRYING NO DATE AT ALL"]) {
      if (!archived.includes(t)) fail(`"${t}" is on neither the Chart nor the log — the sweep dropped it on the floor`);
    }
    if (!archived.includes("PRESERVE-ME"))
      fail("a swept row's body did not reach the archive — the essays are the graveyard (rule 10) and nothing may be summarised on the way out");
    else pass("all three rows, bodies included, are in the archive verbatim");
  }
}

/* 5b. THE SETTLED RULINGS TABLE GOES TOO — his ruling, question UI, 2026-09-02, made against a
       recommendation to KEEP it. The strict reading of his own sentence wins: nothing
       backward-looking survives in CHART.md, including a lookup table of decisions already made. */
{
  const p = chartFile("sweep-rulings", SWEEP_ALL);
  const log = join(tmp, "CHART-LOG-rulings.md");
  run([`--chart=${p}`, `--log=${log}`, "--sweep", "--write"]);
  const after = readFileSync(p, "utf8");
  const archived = existsSync(log) ? readFileSync(log, "utf8") : "";
  if (/^## SETTLED RULINGS/m.test(after))
    fail("the SETTLED RULINGS table is still in CHART.md — he was offered KEEP with a recommendation and overruled it");
  else if (!/The deploy permission, long since dealt with/.test(archived))
    fail("the SETTLED RULINGS table left CHART.md and did not arrive in the log — that is a deletion, not a sweep");
  else pass("the SETTLED RULINGS table moved to the log with everything else");
}

/* 5d. THE ARCHIVE'S OWN PREAMBLE MUST NOT GO STALE — and it did, within four minutes, in the change
       whose entire purpose is killing stale records. CEO 107, 2026-09-02: the log holding 36 rows
       opened with *"swept off CHART.md after seven days done"* (the design Wyatt overruled) and
       *"Empty as of 2026-09-02, and correctly so"*. Cause was one ternary: the header was written
       only when the file did not exist, so it froze at whatever the first sweep on that machine
       said. **A header written once is a comment that can rot**, in the one file he would open to
       check nothing was lost.
       This case plants the exact overruled wording and requires a sweep to remove it WITHOUT
       touching the entries underneath — the second half matters, because "delete the whole file and
       start again" would pass the first half and lose the record. */
{
  const p = chartFile("sweep-preamble", SWEEP_ALL);
  const log = join(tmp, "CHART-LOG-preamble.md");
  writeFileSync(log, `# THE CHART LOG — closed rows, kept forever

*Rows the Chartkeeper swept off CHART.md after seven days done. Empty as of 2026-09-02, and
correctly so.*

## T-800 — 2026-08-30 — **AN ENTRY ARCHIVED BEFORE ALL THIS**

- [x] **AN ENTRY ARCHIVED BEFORE ALL THIS** — its text must survive a preamble rewrite. KEEP-ME.
`);
  run([`--chart=${p}`, `--log=${log}`, "--sweep", "--write"]);
  const after = readFileSync(log, "utf8");
  if (/seven days done|Empty as of/.test(after))
    fail("the archive still describes itself as the seven-day design he overruled — the preamble is written once and frozen, so it says whatever the FIRST sweep on this machine said");
  else pass("the stale preamble was re-emitted from the tool, not inherited from the file");
  if (!/KEEP-ME/.test(after) || !/^## T-800 /m.test(after))
    fail("rewriting the preamble destroyed an entry that was already in the archive — a header repair must never cost a row");
  else pass("the entries already in the archive survived the preamble rewrite");
  /* AND IT MUST BE IDEMPOTENT: two sweeps in a row cannot keep appending preambles or re-stacking
     entries. Two sessions share this branch and a rewrite that differs every run conflicts on every
     push — the same reason the whole write pass is idempotent by construction. */
  run([`--chart=${p}`, `--log=${log}`, "--sweep", "--write"]);
  const twice = readFileSync(log, "utf8");
  if ((twice.match(/^# THE CHART LOG/gm) || []).length !== 1 || (twice.match(/^## T-800 /gm) || []).length !== 1)
    fail(`a second sweep duplicated the header or an entry:\n${twice.slice(0, 400)}`);
  else pass("a second sweep leaves one header and one copy of each entry");
}

/* 5c. THE GUARDRAIL THE SPEC ASKS FOR BY NAME: every closed handle appears in EXACTLY ONE of the
       two files — never both, never neither. This is the check that makes a destructive rewrite of
       the file he reads safe to run unattended, and it is the reason the spec chose a dedicated
       CHART-LOG.md over the ledger: against a 1,700-line file carrying six other kinds of entry,
       this assertion cannot be written at all. */
{
  const p = chartFile("sweep-conserve", SWEEP_ALL);
  const log = join(tmp, "CHART-LOG-conserve.md");
  /* ⚠ `--write` ON ITS OWN RUNS EVERY PASS, SWEEP INCLUDED (`anyPass` is false, so all four are
     on). The first version of this case used it to "just allocate handles" and then had nothing
     left to follow — the rows it meant to track had already been archived by the setup step. Name
     the pass you want. */
  run([`--chart=${p}`, "--rank", "--write"]);           // allocate handles WITHOUT sweeping
  const before = readFileSync(p, "utf8");
  const doneHandles = before.split(/^- \[[xX]\] /m).slice(1)
    .map((b) => (/T-\d{3}/.exec(b.split(/^- \[/m)[0]) || [])[0]).filter(Boolean);
  run([`--chart=${p}`, `--log=${log}`, "--sweep", "--write"]);
  const after = readFileSync(p, "utf8");
  const archived = existsSync(log) ? readFileSync(log, "utf8") : "";
  if (doneHandles.length !== 3) fail(`expected three finished handles to follow, found ${doneHandles.length} — this case cannot see its own subject`);
  else {
    const both = doneHandles.filter((h) => after.includes(h) && archived.includes(h));
    const neither = doneHandles.filter((h) => !after.includes(h) && !archived.includes(h));
    if (neither.length) fail(`${neither.join(", ")} is in NEITHER file — a swept row was lost, which is the one failure that cannot be undone`);
    else if (both.length) fail(`${both.join(", ")} is in BOTH files — the Chart still carries what the log now owns, so the two records can disagree`);
    else pass("every finished handle is in exactly one of the two files — never both, never neither");
  }
}

/* 6. IT MUST COVER THE UNFATED IDEA INBOX ENTRIES. Caught by CEO 89 before a line was built, and it
      is the difference between ordering HIS list and ordering a list of our own: `glass.mjs:385-386`
      is `tasks = [...openChecklist, ...openInbox.map(shortTask)]`, so an idea with no declared fate
      is a task on his phone. A Chartkeeper blind to those perfectly reorders the wrong list. */
{
  const p = chartFile("inbox", MIXED);
  const r = runJson([`--chart=${p}`, "--rank"]);
  if (!r.json) fail("no JSON for the inbox case");
  else {
    const titles = r.json.rank.map((x) => x.title || "").join(" | ");
    if (!/An unfated idea about the lantern colour/.test(titles))
      fail("the unfated IDEA INBOX entry is missing from the ranking — the Glass counts it as an open task, so this is ordering a list he does not read");
    else pass("the unfated IDEA INBOX entry is ranked alongside the checklist rows");
    if (/A fated idea/.test(titles))
      fail("ranked an idea that has already declared a fate — that inflates the open count Wyatt steers by");
    else pass("the fated idea is not counted as open");
  }
}

/* 7. A ROW MUST GET A HANDLE THAT SURVIVES THE FILE MOVING. The spec shipped with two stale line
      numbers IN THE COMMIT THAT PUBLISHED IT, which is the best possible argument for this: a line
      number is not a durable handle. An id is allocated once and never reused, so a comment, a CEO
      verdict and an archive stub can all point at the same row. */
{
  const p = chartFile("ids", MIXED);
  run([`--chart=${p}`, "--write"]);
  const once = readFileSync(p, "utf8");
  /* HANDLES ALLOCATED TO ROWS, NOT REFERENCES TO THEM. His BLOCKED ON WYATT and SETTLED RULINGS
     tables NAME rows by handle — that link is the whole of how "waiting on your answer" is derived
     — so a whole-file grep counts one row's id three times and calls it a duplicate allocation.
     Table lines are his; row lines are the tool's. */
  const rowsOnly = (s) => s.split("\n").filter((l) => !l.trim().startsWith("|")).join("\n");
  const ids = rowsOnly(once).match(/\bT-\d{3}\b/g) || [];
  if (ids.length === 0) fail("allocated no T-nnn ids — every reference to a row stays a line number, and line numbers go stale in the commit that writes them");
  else pass(`allocated ${ids.length} stable row ids`);
  if (new Set(ids).size !== ids.length) fail(`allocated a duplicate id (${ids.length} ids, ${new Set(ids).size} distinct) — two rows sharing a handle is worse than neither having one`);
  else pass("every allocated id is distinct");
  run([`--chart=${p}`, "--write"]);
  const ids2 = (rowsOnly(readFileSync(p, "utf8")).match(/\bT-\d{3}\b/g) || []);
  /* THE COUNTS WERE THE ONLY THING THIS MESSAGE PRINTED, AND THEY MATCHED WHILE THE IDS DIFFERED —
     "7 → 7" told a reader nothing about a case that had genuinely failed. Print the lists. */
  if (ids2.join(",") !== ids.join(",")) fail(`a second run changed the ids — ids must be allocated once and never reused\n        run 1: ${ids.join(" ")}\n        run 2: ${ids2.join(" ")}`);
  else pass("a second run allocates nothing new — ids are stable across runs");
}

/* 7b. THE ROW'S FIRST LINE IS WYATT'S, AND THE WRITE MUST NOT TOUCH A CHARACTER OF IT.
      ⚠ THIS CASE EXISTS BECAUSE THERE WAS NO CASE LIKE IT AND THE TOOL SHIPPED A REGRESSION ONTO
      HIS PHONE. `glass.mjs:386` renders each open row's FIRST LINE as a task; `glass.mjs:122`
      strips `**` and `~~` and NOT backticks. The first version put the handle inline after the
      checkbox, so all 32 tasks on his page came out reading "`T-001` ★ NEXT ITEM, AT HIS
      INSTRUCTION…" — literal backticks, and the handle eating one of the sixteen words the card
      shows him. Twenty-two green cases, and every one of them was looking at structure while the
      thing that broke was the picture. Found by a CEO that opened the rendered page.
      The rule this encodes: **a handle is for machines, and the first line is for him.** */
{
  const p = chartFile("first-line", MIXED);
  const before = (readFileSync(p, "utf8").match(/^- \[[ x]\][^\n]*/gm) || []);
  run([`--chart=${p}`, "--reap", "--rank", "--write"]);
  const after = (readFileSync(p, "utf8").match(/^- \[[ x]\][^\n]*/gm) || []);
  const changed = before.filter((l) => !after.includes(l));
  if (changed.length)
    fail(`the write altered ${changed.length} row first-line(s), which is exactly what the Glass renders to Wyatt. First: ${JSON.stringify(changed[0].slice(0, 90))}`);
  else pass("every row's first line survived the write byte for byte — nothing machine-readable leaks onto his page");
  // Every ROW gets a handle — the checklist's `- [ ]`/`- [x]` rows AND the IDEA INBOX's `- **…**`
  // blocks, because the Glass counts both as tasks. Derived from the fixture, never hand-typed.
  const inboxRows = (MIXED.split(/^## THE IDEA INBOX$/m)[1] || "").match(/^- /gm) || [];
  const expected = before.length + inboxRows.length;
  const handles = (readFileSync(p, "utf8").match(/^\s*⟨[^⟩]*⟩\s*$/gm) || []);
  if (handles.length !== expected)
    fail(`${handles.length} handle line(s) for ${expected} rows (${before.length} checklist + ${inboxRows.length} inbox) — every row needs exactly one, on its own line`);
  else if (new Set(handles.map((h) => h.trim())).size !== handles.length)
    fail("two rows carry the same handle line — a duplicate handle is worse than none");
  else pass(`every one of the ${expected} rows carries exactly one distinct handle, on a line of its own`);
}

/* 8. THE WRITE MUST BE IDEMPOTENT AND MUST LOSE NOTHING. Two sessions share this branch and this
      file; a pass that rewrites CHART.md differently every run would conflict on every push, and a
      pass that drops a row would delete work nobody could prove was ever there. */
{
  const p = chartFile("idem", MIXED);
  run([`--chart=${p}`, "--reap", "--rank", "--write"]);
  const first = readFileSync(p, "utf8");
  run([`--chart=${p}`, "--reap", "--rank", "--write"]);
  const second = readFileSync(p, "utf8");
  if (first !== second) fail("running twice produced two different files — a non-idempotent rewrite conflicts on every push when two sessions share the branch");
  else pass("running twice is a no-op — the write is idempotent");

  const keyOf = (s) => (s.match(/^- \[[ x]\][^\n]*/gm) || [])
    .map((l) => l.replace(/⟨[^⟩]*⟩/g, "").replace(/`T-\d{3}`/g, "").replace(/\s+/g, " ").trim())
    .sort();
  const lost = keyOf(MIXED).filter((t) => !keyOf(first).includes(t));
  if (lost.length) fail(`lost ${lost.length} row(s) in the rewrite: ${JSON.stringify(lost.slice(0, 2))}`);
  else pass("no row was lost in the rewrite");

  /* 8b. AND NOTHING OUTSIDE THE ROWS MAY MOVE EITHER. Counting rows is not enough: the splice bug
        that tripled the real Chart left every ROW intact and duplicated the prose around them, so
        a row-set comparison stayed green through it. The file must not grow by more than the
        handles and flags that were deliberately added — a rewrite that adds hundreds of lines is
        a rewrite that is eating the document. */
  const growth = first.split("\n").length - MIXED.split("\n").length;
  if (growth > 12) fail(`the rewrite added ${growth} lines to a 20-line fixture — it is duplicating the document, not annotating it`);
  else pass(`the rewrite grew the file by ${growth} line(s) — handles and flags only`);
  for (const marker of ["## BLOCKED ON WYATT", "## THE IDEA INBOX", "## STEP 1 CHECKLIST"]) {
    const n = (first.match(new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gm")) || []).length;
    if (n !== 1) { fail(`"${marker}" appears ${n} times after the rewrite — the section splice is duplicating headings`); break; }
  }
  if (["## BLOCKED ON WYATT", "## THE IDEA INBOX", "## STEP 1 CHECKLIST"]
    .every((mk) => (first.match(new RegExp(`^${mk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gm")) || []).length === 1))
    pass("every section heading still appears exactly once");
}

/* 9. WITHOUT --write IT MUST NOT TOUCH THE FILE. The report mode the Glass-update session runs is
      REAP-only and read-only by design: reaping is a judgement about whether something HE is
      waiting on has landed, and judgements belong where a human is looking. */
{
  const p = chartFile("readonly", MIXED);
  const before = readFileSync(p, "utf8");
  run([`--chart=${p}`, "--reap", "--rank", "--sweep"]);
  if (readFileSync(p, "utf8") !== before) fail("changed the Chart without --write — report mode must be readable by a session that is only allowed to look");
  else pass("report mode changes nothing on disk");
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   10. PASS 2 — SETTLE. A HALF-DONE ROW IS NOT ALLOWED TO STAY HALF-DONE.

   WYATT ADDED THIS PASS HIMSELF, after reading the spec's first draft, and it is the half the
   04:19Z build missed entirely — that build was written from a copy of the spec taken before his
   banner landed. His words, verbatim: "Half-Stale items should be prioritized to be either
   validated as finished, worked on until finished, or in the worst case, i should be asked if I am
   satisfied with their state."

   WHY IT IS A REAL DEFECT AND NOT A TIDINESS FEATURE. REAP asks its questions of the WHOLE row. So
   a row bundling three jobs, one of them finished, comes back FLAGGED — and RANK then tells him it
   "looks finished — needs a verdict, not work" while two thirds of it is untouched work. That is an
   instrument reporting a defect the Chart does not have, which is rule 6's own territory. The
   Blade-hour row has been doing exactly this for days: three jobs under one checkbox, one of them
   measurably done, the measurement filed 500 lines away, and the row unmoved.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/* ⚠ THE FIXTURE IS BUILT SO THAT ALL FOUR OUTCOMES ARE PRESENT AT ONCE — bundled-and-half-done,
   bundled-and-wholly-done, bundled-with-nothing-to-carry, and not bundled at all. A pass that
   answers the same way to everything therefore fails on at least one of them no matter which way it
   is stuck, which is guardrail 2 of the spec applied to this pass instead of to REAP. */
const BUNDLED = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **THE BLADE HOUR — three jobs under one checkbox**
      part 1: register the Bell — measured on build \`2000.01.01.1\`, which is not the stamp in
      the tree, so that part's evidence is retired.
      part 2: ring-test the Bell in both directions — nobody has done this and there is no
      pointer of any kind in it.
      part 3: the O2 publish test — nobody has done this either, and it has no pointer either.
- [ ] **AN ORDINARY ROW WITH ONE CLAIM IN IT** — plain work in \`src/ui/flow.js\` that nobody has
      started. Filed 2026-09-02T04:19Z.
- [ ] **EVERY PART OF THIS ROW IS ALREADY FINISHED**
      part 1: the first trial — cites \`.planning/SEA-TRIAL-fixture-never-written.md\`, which is
      not on disk.
      part 2: the second trial — measured on build \`2000.01.01.1\`, which is not the stamp in
      the tree.
- [ ] **BUNDLED ON THE FIRST LINE AND NOWHERE ELSE** · register the thing · ring-test it · publish from O2, measured on build \`2000.01.01.1\` which is not the stamp in the tree.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|
| **What colour should the lantern be?** the taste call on the lantern colour | Recommended: brass | 2026-09-02 |

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;

const settleOf = (json, match) => (json?.settle || []).find((s) => new RegExp(match).test(s.title || ""));

/* 10a. IT MUST SEE THE HALF-DONE ROW, AND NAME WHICH PARTS ARE FINISHED AND WHICH ARE NOT.
        "Half-stale" is DERIVED, never a flag somebody sets: the row carries more than one checkable
        claim and REAP's own questions come back TRUE for some of them and not others. */
{
  const p = chartFile("settle-detect", BUNDLED);
  const r = runJson([`--chart=${p}`, "--settle"]);
  if (!r.json) fail(`--settle --json produced no JSON a caller can read. Got: ${r.out.trim().slice(0, 160)}`);
  else if (!Array.isArray(r.json.settle)) fail("there is no SETTLE pass — a row that is partly done drifts in the middle of the list forever, which is the exact drift his instruction is about");
  else {
    const blade = settleOf(r.json, "THE BLADE HOUR");
    if (!blade) fail("did not see the bundled row as half-done — three jobs under one checkbox, one of them finished, is the worked example in his own spec");
    else {
      if (!(blade.settled?.length === 1 && blade.open?.length === 2))
        fail(`named ${blade.settled?.length ?? "?"} finished part(s) and ${blade.open?.length ?? "?"} open — the fixture has exactly one finished of three`);
      else pass("named exactly which parts of the bundled row are finished and which are not");
      if (!blade.settled?.[0]?.reason) fail("a part was called finished with no derived reason — an unexplained verdict is an opinion");
      else pass("every finished part carries the derived reason that produced it");
    }
    const ordinary = settleOf(r.json, "AN ORDINARY ROW WITH ONE CLAIM");
    if (ordinary) fail("called a row with one claim in it half-done — a pass that fires on everything is as useless as one that fires on nothing");
    else pass("left the row with a single claim alone");
  }
}

/* 10b. THE THREE FATES ARE HIS, IN HIS ORDER: validate finished, work it until finished, or ask
        him — and the third is last because his attention is the scarcest thing this project spends.
        Which fate a row gets is DERIVED: every part finished → VALIDATE; some finished and each
        part has its own text to carry → SPLIT; some finished but there is nothing to carry onto
        the parts → ASK, because a split with nothing in it is a worse answer than a question. */
{
  const p = chartFile("settle-fates", BUNDLED);
  const r = runJson([`--chart=${p}`, "--settle"]);
  const want = [
    ["EVERY PART OF THIS ROW IS ALREADY FINISHED", "VALIDATE", "every part derives finished, so it needs a verdict and not work"],
    ["THE BLADE HOUR", "SPLIT", "some parts are finished and the rest is real work, and each part has its own text"],
    ["BUNDLED ON THE FIRST LINE AND NOWHERE ELSE", "ASK", "there is nothing to carry onto the parts, so it is a question for him"],
  ];
  for (const [title, fate, why] of want) {
    const got = settleOf(r.json, title)?.fate;
    if (got !== fate) fail(`"${title.slice(0, 40)}…" got fate ${JSON.stringify(got)}, wanted ${fate} — ${why}`);
    else pass(`${fate}: ${why}`);
  }
}

/* 10c. ⚠ THE MISREPORT THIS PASS EXISTS TO STOP, AND IT IS ALREADY ON HIS PAGE.
        REAP flags the bundled row (one of its pointers really is dead), and RANK then labels it
        "looks finished — needs a verdict, not work". Two thirds of that row is untouched work.
        A row that is PARTLY finished must never be described to him as finished. */
{
  const p = chartFile("settle-not-finished", BUNDLED);
  const r = runJson([`--chart=${p}`, "--settle", "--rank"]);
  const blade = (r.json?.rank || []).find((x) => /THE BLADE HOUR/.test(x.title || ""));
  if (!blade) fail("the bundled row vanished from the ranking");
  else if (/looks finished/.test(blade.whyNow || ""))
    fail(`told him a half-done row "looks finished": ${JSON.stringify(blade.whyNow)} — two of its three parts are untouched work`);
  else if (!/half[- ]done/i.test(blade.whyNow || ""))
    fail(`the half-done row's why-now says ${JSON.stringify(blade.whyNow)} — it must say plainly that it is half done, or he cannot overrule the position`);
  else pass("a half-done row is described as half done, never as finished");
}

/* 10d. IT MUST ACT, NOT MERELY OBSERVE. SPLIT gives each unfinished part its own checkable row —
        "a bundled row can never be ticked" is the audit's own finding, and splitting is how a
        bundle becomes tickable. ASK puts one question, with the measurement attached, where he
        will see it. AND NOTHING MAY BE LOST: the parent keeps its full text, verbatim. */
{
  const p = chartFile("settle-act", BUNDLED);
  const before = readFileSync(p, "utf8");
  run([`--chart=${p}`, "--settle", "--write"]);
  const after = readFileSync(p, "utf8");

  if ((after.match(/^- \[x\]/gm) || []).length > (before.match(/^- \[x\]/gm) || []).length)
    fail("SETTLE ticked a box — closing is a claim about WORK and belongs to a watch behind close_item.mjs");
  else pass("SETTLE ticked no boxes");

  for (const part of ["ring-test the Bell in both directions", "the O2 publish test"]) {
    if (!new RegExp(`^- \\[ \\] [^\\n]*${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m").test(after))
      fail(`"${part}" did not become a row of its own — it is still buried in a bundle that can never be ticked`);
    else pass(`"${part}" is now its own checkable row`);
  }
  /* ⚠ WRITTEN AS LINE CONTAINMENT, NOT AS ONE CONTIGUOUS BLOCK, AND THE FIRST VERSION WAS THE
     OTHER WAY. It demanded the parent's whole body appear verbatim — and that fails on CORRECT
     behaviour, because the write legitimately inserts the row's ⟨handle⟩ line underneath its first
     line. This gate has now made the over-specified mistake three times (cases 4 and 5 carry the
     other two), so the shape is worth naming: assert the property that matters — NOTHING IS LOST —
     never the exact bytes around it. */
  const parentBody = (before.match(/^- \[ \] \*\*THE BLADE HOUR[\s\S]*?(?=\n- \[)/m) || [""])[0];
  const lost = parentBody.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !after.includes(l));
  if (lost.length)
    fail(`the split lost ${lost.length} line(s) of the parent row's own text — the essays are the graveyard, and a split that summarises loses it. First: ${JSON.stringify(lost[0].slice(0, 70))}`);
  else pass("every line of the parent row's text survived the split");

  if (!/^\|[^\n]*BUNDLED ON THE FIRST LINE/m.test(after))
    fail("the row that could only be resolved by asking him never reached BLOCKED ON WYATT — a question nobody can see is not a question");
  else if (!/^\|[^\n]*BUNDLED ON THE FIRST LINE[^\n]*1 of 3/m.test(after))
    fail("the question carries no measurement — his own instruction is that he is asked with the state attached, never in the abstract");
  else pass("the un-derivable row became one question in BLOCKED ON WYATT, with its measurement attached");
}

/* 10e. THE ENFORCEMENT, and without it this pass is a suggestion: A ROW MAY NOT SURVIVE A FULL
        WRITE PASS STILL HALF-DONE AND UNRESOLVED. The spec, in its own words: "the whole point of
        his instruction is that 'partly done' stops being a place a row can live." A row is resolved
        when its open parts each have a row of their own, or when a question about it is in front of
        him — both DERIVED from the file, never from a flag the tool wrote to itself. */
{
  const p = chartFile("settle-enforce", BUNDLED);
  const before = runJson([`--chart=${p}`, "--settle"]);
  if (!(before.json?.settleUnresolved || []).length)
    fail("nothing was unresolved before the write, so this case cannot fail and is therefore not a check");
  else pass(`${before.json.settleUnresolved.length} row(s) unresolved before the write — the case can fail`);
  run([`--chart=${p}`, "--settle", "--write"]);
  const after = runJson([`--chart=${p}`, "--settle"]);
  const left = after.json?.settleUnresolved;
  if (!Array.isArray(left)) fail("the tool does not report which half-done rows are still unresolved — an enforcement nobody can read is not an enforcement");
  else if (left.length) fail(`${left.length} row(s) survived a full write pass still half-done and unresolved: ${JSON.stringify(left.slice(0, 2))}`);
  else pass("no row survived the write pass still half-done — 'partly done' is not a place a row can live");
}

/* 10f. AND IT MUST STILL BE IDEMPOTENT WITH SETTLE ON. This is the case that would catch the
        obvious way to build this wrong: a split that re-splits every run, adding the same child
        rows again and again. Two sessions share this branch — a rewrite that differs every run
        conflicts on every push. */
{
  const p = chartFile("settle-idem", BUNDLED);
  run([`--chart=${p}`, "--write"]);
  const first = readFileSync(p, "utf8");
  run([`--chart=${p}`, "--write"]);
  const second = readFileSync(p, "utf8");
  if (first !== second) fail("running the full pass twice produced two different files — SETTLE is re-acting on rows it has already resolved");
  else pass("the full pass including SETTLE is idempotent");
  const firstLines = (BUNDLED.match(/^- \[[ x]\][^\n]*/gm) || []);
  const afterLines = (first.match(/^- \[[ x]\][^\n]*/gm) || []);
  const changed = firstLines.filter((l) => !afterLines.includes(l));
  if (changed.length) fail(`SETTLE altered ${changed.length} existing row first-line(s) — the first line is what the Glass renders to him. First: ${JSON.stringify(changed[0].slice(0, 90))}`);
  else pass("every existing row's first line survived SETTLE byte for byte");
}

/* 10h. ⚠ IT MUST SAY WHAT IT LOOKED AT, NOT ONLY WHAT IT FOUND — AND IT MUST SEE THE CHART'S OWN
        BUNDLING SHAPES. This case exists because of a near miss that a green gate could not see.
        The first build of SETTLE passed every case above and then, pointed at the REAL Chart, saw
        ZERO bundled rows — including the Blade hour, which is the audit's own worked example. It
        writes its three jobs as a comma list after a colon ("…: register the Bell, the ring test
        both directions, the O2 publish test — runbook …"), a shape the fixture did not contain.
        A pass that is silent on a healthy Chart and a pass that has gone blind print the same line,
        so the count of what it EXAMINED is the only thing that tells them apart. */
{
  const COMMA = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] The Blade hour (Wyatt + a session, ~30–60 min): register the Bell, the ring test both
      directions, the O2 publish test — runbook \`scripts/wyclau/RAZER-SETUP.md\`
- [ ] **A ROW WHOSE FIRST LINE IS ORDINARY PROSE** — it mentions a colon: and then, some commas,
      but it is one job and must not be split into pieces nobody wrote. Filed 2026-09-02T04:19Z.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;
  const p = chartFile("settle-bundled", COMMA);
  const r = runJson([`--chart=${p}`, "--settle"]);
  const seen = r.json?.settleBundled;
  if (!Array.isArray(seen))
    fail("the tool never says how many rows it examined — a pass that is silent on a healthy Chart and a pass that has gone blind print the same line");
  else if (!seen.some((t) => /Blade hour/.test(t)))
    fail(`did not recognise the Blade hour as a bundled row (examined ${JSON.stringify(seen)}) — it is the audit's own worked example, and its three jobs are a comma list after a colon`);
  else pass("recognised the Chart's comma-list bundling shape, and says how many rows it examined");
  if (Array.isArray(seen) && seen.some((t) => /ORDINARY PROSE/.test(t)))
    fail("split an ordinary prose first line into parts — a false split puts a row on his page that nobody wrote, which is worse than a bundle going unnoticed");
  else pass("left an ordinary prose first line alone");
  const text = run([`--chart=${p}`, "--settle"]).out;
  if (!/looked at \d+ row/.test(text))
    fail("the human-readable report does not say what it looked at either");
  else pass("the report names how many bundled rows it examined");
}

/* 10i. ⚠ A DEAD POINTER IS NOT A FINISHED ROW, AND SAYING SO WAS THE WHOLE FAULT — NOT THE BUNDLE.
        CEO 93 found this by running the tool against the REAL Chart after SETTLE shipped: the
        half-done case had been fixed and the phrase was STILL WRONG on four live rows, including
        the Chartkeeper's own, whose text says in the same breath that half of it is blocked and
        unbuilt. REAP measures a POINTER — "the question you were waiting on has been answered",
        "that pid is dead". That is a real and useful signal and it is NOT a claim about the work.
        A row can have every pointer resolve and still be entirely unstarted.
        So the score stays (+40: a row whose blocker has lifted really is cheap to revisit) and only
        the SENTENCE changes, because the sentence is what a reader steers by. */
{
  const p = chartFile("dead-pointer-phrasing", MIXED);
  const r = runJson([`--chart=${p}`, "--reap", "--rank"]);
  const dead = (r.json?.rank || []).find((x) => /A DEAD POINTER/.test(x.title || ""));
  const gated = (r.json?.rank || []).find((x) => /A GATED ROW/.test(x.title || ""));
  if (!dead) fail("the row with the dead pointer vanished from the ranking");
  else if (/finish/i.test(dead.whyNow || ""))
    fail(`told him an unstarted row is finished on the strength of a dead pointer: ${JSON.stringify(dead.whyNow)} — REAP measures the pointer, never the work`);
  /* ⚠ THE VOCABULARY WIDENED ON 2026-09-02 AND THE ASSERTION DID NOT WEAKEN. `T-090` made this
     sentence PER-KIND — one phrase for five different faults was the same bug one layer up, and on
     the real Chart it produced "something it was waiting on has landed · evidence retired" about
     one row, two clauses that contradict each other. The property under test is unchanged: the
     phrase must say what actually CHANGED, so the +40 is explained. Only the list of ways it may
     say it grew, and it is closed — these are `FAULT_WHY`'s five and nothing else. */
  else if (!/waiting on|landed|resolved|already answered|freed it|points at|older build|replaces this/i.test(dead.whyNow || ""))
    fail(`the dead-pointer row's why-now says ${JSON.stringify(dead.whyNow)} — it must say what actually changed, or the +40 that lifted it is unexplained`);
  else pass("a dead pointer is described as something that has LANDED, never as work that is finished");
  // Red-proofed the other way in the same breath: a row with no dead pointer must not get the
  // phrase either, or the check above would pass on a tool that says it about everything.
  if (gated && /waiting on|landed|resolved/i.test(gated.whyNow || "") && !/blocked/i.test(gated.whyNow || ""))
    fail("said something had landed for a row with no resolved pointer in it");
  else pass("a row with nothing resolved does not get the phrase");
}

/* 10g. AND IT MUST CHANGE NOTHING WITHOUT --write. The Glass-update session runs this tool in
        report mode; a pass that quietly edits his Chart from a read-only session is the same class
        of fault as an instrument that writes into the thing it measures. */
{
  const p = chartFile("settle-readonly", BUNDLED);
  const before = readFileSync(p, "utf8");
  run([`--chart=${p}`, "--settle"]);
  if (readFileSync(p, "utf8") !== before) fail("SETTLE changed the Chart without --write");
  else pass("SETTLE in report mode changes nothing on disk");
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   11. THE TWO SIGNALS THAT DECIDE HIS ORDER MUST BE GROUNDED IN HIS OWN RECORDS.

   CEO 91 measured both of these unsound, and the measurement that earned these cases is worth
   more than the cases. Run against the REAL Chart, "approved and unblocked" was awarded to eight
   rows, and at least two of them from a sentence about something else — the Advisor-gates row,
   because its body says the gates were disarmed *"on his ruling"* (a ruling to DISARM them, not
   approval to repair them), and a Glass-layout row, because Wyatt's own note contains the words
   *"the 'your ruling' section"* while describing a CARD NAME. Three more were matching their OWN
   HEADLINE: `★ NEXT ITEM, AT HIS INSTRUCTION` approved itself by its title.

   AND THE HISTORY IS THE ARGUMENT, NOT THE REGEX. That pattern was WIDENED by the watch that
   wrote it, in the open, after its own row ranked 14 of 32. CEO 91: *"fitting the tool to flatter
   its own item."* A signal whose author can widen it until their own row wins is not a
   measurement — so approval must come from a record the row's author does not write.

   THE RULE THESE CASES ENFORCE: a row is credited with his approval, or with his attention, only
   through a RESOLVED CITATION of one of his own records — an `INBOX-<stamp>` id that really
   exists in `INBOX.md`, or the `Your ruling:` tag, which `rulings_triage_check.mjs` already keeps
   matched to a real settled ruling. Prose counts for nothing.
   ──────────────────────────────────────────────────────────────────────────────────────────── */

/* A FIXTURE INBOX, so these cases judge what the tool DOES rather than what today's real Inbox
   happens to contain. Two entries, one live and one discharged — because "he asked for this" and
   "he asked for this and it is done" must not score the same. */
const FIXTURE_INBOX = `# THE INBOX — fixture

## INBOX-20260101T0101Z — he asked for the lantern to be brass
> "make the lantern brass"
solution: none stated
status: OPEN

## INBOX-20260101T0202Z — a thing he asked for that is already finished
> "fix the anchor"
solution: none stated
status: DONE 2026-01-02 — CEO 1, commit abc1234
`;
const inboxFile = () => {
  const p = join(tmp, "fixture-INBOX.md");
  writeFileSync(p, FIXTURE_INBOX);
  return p;
};

const GROUNDED = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **A ROW THAT APPROVES ITSELF** — at his instruction, his ruling, he asked for this. Every
      approving phrase in the language and not one citation of anything he ever wrote.
- [ ] **A ROW WITH A RESOLVED CITATION** — his words are on file at INBOX-20260101T0101Z and that
      entry is still open.
- [ ] Your ruling: the lantern is brass — tagged the way the Chart's own triage process tags a
      row lifted out of his rulings table.
- [ ] **A ROW CITING A DISCHARGED ASK** — he raised it at INBOX-20260101T0202Z and that entry is
      closed, so the work is not waiting on anybody.
- [ ] **A ROW CITING A STAMP THAT DOES NOT EXIST** — filed at INBOX-19990909T0909Z, his ruling,
      at his instruction.
- [ ] **A PLAIN ROW** with nothing in it either way. Filed 2026-09-02T04:19Z.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## RULED — his answers, waiting to be triaged

| item | HIS RULING | now |
|---|---|---|

## SETTLED RULINGS — triaged, and kept on the record forever

| item | HIS RULING | now |
|---|---|---|
| The lantern is brass | **"brass"** — ruled on the Glass 2026-01-01 | **AWAITING the repaint.** |

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;

/* 11a. SELF-DECLARED APPROVAL MUST COUNT FOR NOTHING — and a real citation must still count, in
        the same pass. A scorer that credits nobody is exactly as useless as one that credits
        everybody, which is why both halves are asserted against one fixture. */
{
  const p = chartFile("grounded", GROUNDED);
  const r = runJson([`--chart=${p}`, `--inbox=${inboxFile()}`, "--rank"]);
  const by = (re) => (r.json?.rank || []).find((x) => re.test(x.title || ""));
  const selfish = by(/APPROVES ITSELF/);
  const cited = by(/RESOLVED CITATION/);
  const tagged = by(/lantern is brass/);
  if (!selfish || !cited || !tagged) {
    fail(`could not rank the grounding fixture — got ${JSON.stringify((r.json?.rank || []).map((x) => x.title))}`);
  } else {
    if (selfish.score >= 100)
      fail(`a row that simply typed "at his instruction" into its own text scored ${selfish.score} (${JSON.stringify(selfish.whyNow)}) — any session can float its own work to the top of his list by writing a sentence`);
    else pass("a row that approves itself in its own prose is credited with nothing");
    if (selfish.score >= cited.score)
      fail(`the self-approving row (${selfish.score}) ranked at or above the row citing his actual words (${cited.score}) — the order is still self-declared`);
    else pass("his own record outranks a row's account of itself");
    if (cited.score < 100)
      fail(`a row citing a live entry of his own Inbox scored only ${cited.score} (${JSON.stringify(cited.whyNow)}) — grounding must not mean crediting nobody`);
    else pass("a resolved citation of his Inbox is credited");
    if (tagged.score < 100)
      fail(`a "Your ruling:" row whose ruling IS in the Chart's rulings table scored only ${tagged.score} (${JSON.stringify(tagged.whyNow)}) — grounding must not mean crediting nobody`);
    else pass('a "Your ruling:" tag that resolves to a real ruling of his is credited');
  }
}

/* 11a-ii. ⚠ AND THE TAG ITSELF MUST RESOLVE — CEO 94 BROKE THE FIRST VERSION OF THIS IN A MINUTE.
        The first grounding credited any row whose title began `Your ruling:` and justified it, here
        and in `chartkeeper.mjs`, by saying `rulings_triage_check.mjs` "keeps the tag matched to a
        real settled ruling". **IT DOES NOT.** That gate walks one direction only — rulings → rows,
        asking whether every owing settled ruling has a task row (`rulings_triage_check.mjs:92-98`).
        It never asks whether a `Your ruling:` row corresponds to any ruling. CEO 94 measured it: a
        row titled "Your ruling: repaint the bilge pump widget", on a Chart whose rulings tables are
        EMPTY, scored 100 and printed "your own ruling, and nothing is blocking it".
        THAT IS RULE 6, ONE COMMIT AFTER BEING CAUGHT FOR IT: a claim about what an instrument does,
        believed from its header instead of measured. The fixture above carries the rulings tables;
        this one strips them, and the same tagged row must now be worth nothing. */
{
  const NO_RULINGS = GROUNDED.replace(/\n## RULED[\s\S]*?(?=\n## THE IDEA INBOX)/, "\n");
  if (/## SETTLED RULINGS/.test(NO_RULINGS))
    fail("the no-rulings fixture still contains a rulings table — this case cannot fail and is therefore not a check");
  const p = chartFile("grounded-untagged", NO_RULINGS);
  const r = runJson([`--chart=${p}`, `--inbox=${inboxFile()}`, "--rank"]);
  const tagged = (r.json?.rank || []).find((x) => /lantern is brass/.test(x.title || ""));
  if (!tagged) fail("the tagged row vanished from the ranking on the no-rulings fixture");
  else if (tagged.score >= 100)
    fail(`a "Your ruling:" row scored ${tagged.score} (${JSON.stringify(tagged.whyNow)}) on a Chart with NO rulings tables at all — the tag is being read as a claim, not resolved as a pointer`);
  else pass("a `Your ruling:` tag with no ruling behind it is credited with nothing");
}

/* 11b. A CITATION THAT DOES NOT RESOLVE IS NOT A CITATION, and a DISCHARGED ask is not an
        outstanding one. Both are REAP's own principle: ask the world about the pointer, never
        read the row's assertion. Without this, grounding is one copy-pasted stamp away from being
        exactly as gameable as the prose it replaced. */
{
  const p = chartFile("grounded-unresolved", GROUNDED);
  const r = runJson([`--chart=${p}`, `--inbox=${inboxFile()}`, "--rank"]);
  const by = (re) => (r.json?.rank || []).find((x) => re.test(x.title || ""));
  const ghost = by(/STAMP THAT DOES NOT EXIST/);
  const done = by(/DISCHARGED ASK/);
  if (!ghost || !done) fail("the unresolved-citation rows vanished from the ranking");
  else {
    if (ghost.score >= 100)
      fail(`a row citing INBOX-19990909T0909Z — a stamp that is in no Inbox — scored ${ghost.score} (${JSON.stringify(ghost.whyNow)})`);
    else pass("a citation that resolves to nothing is credited with nothing");
    if (/nothing is blocking it/i.test(done.whyNow || ""))
      fail(`a row citing an ask he has already had closed was called approved-and-unblocked: ${JSON.stringify(done.whyNow)} — a discharged instruction is not outstanding work`);
    else pass("a discharged ask does not read as an outstanding approval");
    // …but it IS still one of his notes, so the attention half must still see it. Red-proofs the
    // case above: a tool that simply ignored discharged entries would pass it for the wrong reason.
    if (!/one of your notes/i.test(done.whyNow || ""))
      fail(`the discharged-ask row says ${JSON.stringify(done.whyNow)} — he did raise it, and the attention signal must still count a closed note`);
    else pass("a discharged ask still counts as one of his notes");
  }
}

/* 11c. THE COUNT HE READS MUST BE TRUE. "you have raised it N times" was a five-letter token
        overlap over 900 characters of essay, and on the real Chart it printed **"you have raised
        it 10 times"** at the `can_push` row — a tool fault a session found, which he has never
        mentioned. Its ten "matches" were entries about the Advisor being record-only, a destroyed
        note, and the change-gate verdict. Meanwhile the trade-offer circle, with three recorded
        sightings, read "raised it once" — and the single entry it matched was about judging
        screenshots.
        ⚠ AND THE FIRST DIAGNOSIS WAS WRONG, WHICH IS WHY THIS COMMENT SAYS SO: the prediction note
        guessed the counts tracked ROW LENGTH. They do not — the 900-character cap flattens that
        out (a 4,695-char row scored 1, a 487-char row scored 5). What they actually tracked was
        SHARED PROCESS VOCABULARY: rows about the watch/trial machinery matched the many Inbox
        entries about the watch/trial machinery. The signal measured "is this row about the same
        subsystem as most of his recent notes" and reported it as "you raised this N times".
        A number he cannot check is worse than no number, because he steers by it. */
{
  const p = chartFile("grounded-count", GROUNDED);
  const r = runJson([`--chart=${p}`, `--inbox=${inboxFile()}`, "--rank"]);
  const by = (re) => (r.json?.rank || []).find((x) => re.test(x.title || ""));
  const plain = by(/A PLAIN ROW/);
  const cited = by(/RESOLVED CITATION/);
  const num = (s) => { const m = /\b(\d+)\b/.exec(String(s || "")); return m ? Number(m[1]) : 0; };
  if (!plain || !cited) fail("the counting fixture did not rank");
  else {
    if (/of your notes|you asked/i.test(plain.whyNow || ""))
      fail(`told him he had raised a row that names none of his notes: ${JSON.stringify(plain.whyNow)} — silence is the honest answer, not a guessed number`);
    else pass("a row that cites none of his words claims none of his attention");
    if (num(cited.whyNow) > 1)
      fail(`claimed ${JSON.stringify(cited.whyNow)} for a row that cites exactly ONE of his entries — the number must be countable from the record`);
    else pass("the count he reads equals the citations that actually resolve");
  }
}

/* 11d. AND THE ROWS THAT CLAIM APPROVAL WITHOUT CITING ANYTHING MUST BE NAMED, not silently
        demoted. Eight rows on the real Chart claim it today; some of those claims are TRUE and
        merely uncited, and a tool that drops them without a word makes his genuinely-approved
        work sink with no way to notice. REAP's rule, applied to itself: flag, never act silently. */
{
  const p = chartFile("grounded-report", GROUNDED);
  const r = runJson([`--chart=${p}`, `--inbox=${inboxFile()}`, "--rank"]);
  const named = r.json?.unbackedApproval;
  if (!Array.isArray(named))
    fail("the tool never reports which rows claim his approval without citing it — a row demoted in silence is a row nobody can repair");
  else if (!named.some((t) => /APPROVES ITSELF/.test(t)))
    fail(`did not name the self-approving row as an uncited claim (named ${JSON.stringify(named)})`);
  else if (named.some((t) => /RESOLVED CITATION|lantern is brass|A PLAIN ROW/.test(t)))
    fail(`named a properly-cited or entirely silent row as an uncited claim (${JSON.stringify(named)}) — the report must point at the rows that need a citation added, not at every row`);
  else pass("rows claiming his approval with nothing to back it are named, so the citation can be added");
  const text = run([`--chart=${p}`, `--inbox=${inboxFile()}`, "--rank"]).out;
  if (!/claim your approval/i.test(text))
    fail("the human-readable report is silent about uncited approval claims");
  else pass("the printed report names them too");
}

/* 11e. THE SPEC'S ACCEPTANCE TEST — AS A PROPERTY, ON A FIXTURE, NOT A ROW ON THE LIVE CHART.
 *
 * ⚠ REWRITTEN 2026-09-02, AND THE REASON IS THE WHOLE POINT OF THE REWRITE. This case used to
 * assert that the REAL Chart's top row matched /CHARTKEEPER/i — "his four-times-asked request must
 * rank first". That was right the day it was written and it EXPIRED the day the thing was built:
 * RANK now runs in every watch, the Lesson moved below the Chart, the card is renamed, and only
 * SWEEP remains, blocked behind re-sourcing the done count. A player-facing bug then legitimately
 * outranked it — which is exactly what Wyatt asked for that morning ("stop building process, drain
 * player-facing bugs") — and this gate went RED for the tool behaving correctly.
 *
 * A CHECK PINNED TO ONE ROW'S CONTENT FAILS THE DAY THAT ROW IS DELIVERED, and it fails in the
 * worst direction: it trains the next reader to edit the check rather than believe the tool.
 * Same fault as two others fixed hours earlier in this repo — rulings_triage_check anchored to the
 * literal card heading, and case 4's red-proof anchored to a row prefix that a `T-nnn` id broke.
 * Third time in one day that a check located its subject by words somebody was free to change.
 *
 * SO THE PROPERTY IS TESTED INSTEAD, on a fixture where it can never expire: a row he has asked for
 * REPEATEDLY must outrank an equivalent row nobody asked for. That is the thing RANK exists to do,
 * it is what the spec's acceptance test was really about, and it stays true forever. */
{
  const HIS_VS_THEIRS = [
    "## STEP 1 CHECKLIST",
    "",
    "- [ ] A DEFECT A WATCH FOUND ON ITS OWN - filed by the 09:00Z watch from a trial screenshot.",
    "      Nobody asked for it. It is real work and it is not his request.",
    "",
    "- [ ] A THING HE HAS ASKED FOR REPEATEDLY - see INBOX-20260902T04xxZ, and he raised it again.",
    "      His words, twice on the Glass.",
    "",
    "## THE IDEA INBOX",
    "",
    "## BLOCKED ON WYATT",
    "",
  ].join("\n");
  const pProp = chartFile("his-outranks-theirs", HIS_VS_THEIRS);
  const rProp = runJson([`--chart=${pProp}`, "--rank"]);
  const titlesProp = (rProp.json?.rank || []).map((x) => x.title || "");
  const hisAt = titlesProp.findIndex((t) => /ASKED FOR REPEATEDLY/i.test(t));
  const theirsAt = titlesProp.findIndex((t) => /A WATCH FOUND ON ITS OWN/i.test(t));
  if (hisAt === -1 || theirsAt === -1)
    fail("the fixture rows did not both survive ranking — this case proves nothing as written");
  else if (hisAt > theirsAt)
    fail(`a row nobody asked for outranked one he has asked for repeatedly (his at ${hisAt}, theirs at ${theirsAt}) — that inversion is the entire thing RANK exists to prevent`);
  else
    pass("a row he has asked for repeatedly outranks an equivalent row nobody asked for");
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   12. NO KEY THIS TOOL USES IS GUARANTEED UNIQUE, AND `new Map(pairs)` KEEPS THE LAST ONE SILENTLY.

   CEO 94 found the first instance: `INBOX.md` carried two different entries under the id
   `INBOX-20260902T05xxZ` — until the watch that wrote these cases gave the second one its own stamp
   — and `chartkeeper.mjs` built `new Map(entries.map(e => [e.id, e]))`. So whichever of his notes he
   happened to type SECOND decided, for both of them, whether a citation of that stamp counts as an
   outstanding instruction worth +100. *(Past tense on purpose: the first version of this sentence
   was written in the present and was made false seven minutes later by the repair — CEO 95.)*

   ⚠ MEASURED BEFORE IT WAS FIXED, AND THE HONEST SIZE IS SMALL: on 2026-09-02 the two colliding
   entries were BOTH open, and no row on the Chart cited that stamp at all. **Nothing on his page
   was wrong.** These cases exist because the value was UNGROUNDED, not because it was wrong — the
   answer depended on file order, which is the same defect as reading a row's own prose. The gate
   has to construct the divergent case; the real records cannot show it today.

   THE SAME FAULT LIVES ON TWO MORE KEYS, and there the consequences are worse: `reapById` and
   `settleByTitle` are keyed by a row's TITLE, which nothing guarantees is unique — and a title
   collision does not merely mis-score, it makes `score()` hand one row's −1000 or +40 to another,
   and makes the write pass stamp REAP's "⚠ STALE-CANDIDATE" sentence onto a row it never judged.
   ──────────────────────────────────────────────────────────────────────────────────────────── */

/* An Inbox where one id resolves to two entries. `mixed` = they disagree (one open, one
   discharged); `both-open` = they agree. The two are NOT the same case and the tool must answer
   them differently — see 12a-ii. */
const AMB_OPEN = `## INBOX-20260101T0303Z — the first note he wrote under this stamp
> "paint the hull"
solution: none stated
status: OPEN
`;
const AMB_OPEN2 = `## INBOX-20260101T0303Z — another note of his, same stamp, also unfinished
> "swab the deck"
solution: none stated
status: OPEN
`;
const AMB_DONE = `## INBOX-20260101T0303Z — a different note, same stamp, and it is finished
> "coil the ropes"
solution: none stated
status: DONE 2026-01-04 — CEO 2, commit def5678
`;
const AMBIGUOUS_INBOX = (order) => {
  const pair = order === "open-first" ? [AMB_OPEN, AMB_DONE]
    : order === "done-first" ? [AMB_DONE, AMB_OPEN]
      : order === "both-open" ? [AMB_OPEN, AMB_OPEN2]
        : [AMB_OPEN2, AMB_OPEN];
  const p = join(tmp, `ambiguous-INBOX-${order}.md`);
  writeFileSync(p, `# THE INBOX — fixture\n\n${pair[0]}\n${pair[1]}`);
  return p;
};

const AMBIGUOUS_CHART = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **A ROW CITING AN AMBIGUOUS STAMP** — he wrote it at INBOX-20260101T0303Z, and that stamp
      names two different notes of his.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;

/* 12a. THE ANSWER MUST NOT DEPEND ON WHICH NOTE HE HAPPENED TO TYPE SECOND. Same Chart, same two
        entries, opposite file order — the score must be identical. This is the whole defect stated
        as a check: not "the value is wrong" but "the value is ungrounded". */
{
  const p = chartFile("ambiguous", AMBIGUOUS_CHART);
  const scoreWith = (order) => {
    const r = runJson([`--chart=${p}`, `--inbox=${AMBIGUOUS_INBOX(order)}`, "--rank"]);
    return (r.json?.rank || []).find((x) => /AMBIGUOUS STAMP/.test(x.title || "")) || null;
  };
  const a = scoreWith("open-first");
  const b = scoreWith("done-first");
  if (!a || !b) fail("the ambiguous-stamp fixture did not rank at all");
  else if (a.score !== b.score)
    fail(`the same row scored ${a.score} with his two same-stamped notes in one order and ${b.score} in the other (${JSON.stringify(a.whyNow)} vs ${JSON.stringify(b.whyNow)}) — the Map keeps whichever he typed last, so his task order turns on the order of his notes`);
  else pass("two of his notes sharing one stamp give the same answer whichever was written first");
  // …and it must fail toward UNDER-claiming, which is the direction this tool already argues for
  // everywhere else: an ambiguous record cannot buy the approval bonus, because we cannot tell
  // which of the two notes the row meant.
  if (a && b && a.score >= 100)
    fail(`a citation of a stamp whose two notes DISAGREE still bought the +100 approval bonus (score ${a.score}, ${JSON.stringify(a.whyNow)}) — one of them is closed and nobody can say which was meant, so it must not count`);
  else if (a && b) pass("a citation of two notes that disagree is not read as an outstanding instruction");
}

/* 12a-ii. ⚠ AND AMBIGUOUS DOES NOT MEAN WORTHLESS — CEO 95 CAUGHT THIS MISSING, AND IT IS THE CASE
        THAT ACTUALLY HAPPENED. When two notes share a stamp and BOTH are still open, the answer is
        the same whichever one the row meant: he is owed something. Refusing to credit it would
        throw away real signal for no gain, and the first version of the report told him it did
        exactly that — a sentence that was false in the one real collision in his Inbox.
        This case is also what red-proofs 12a: a "fix" that simply refused every ambiguous stamp
        passes 12a and fails here. */
{
  const p = chartFile("ambiguous-both-open", AMBIGUOUS_CHART);
  const scoreWith = (order) => {
    const r = runJson([`--chart=${p}`, `--inbox=${AMBIGUOUS_INBOX(order)}`, "--rank"]);
    return (r.json?.rank || []).find((x) => /AMBIGUOUS STAMP/.test(x.title || "")) || null;
  };
  const a = scoreWith("both-open");
  const b = scoreWith("both-open-reversed");
  if (!a || !b) fail("the both-open ambiguous fixture did not rank at all");
  else {
    if (a.score !== b.score)
      fail(`two OPEN notes under one stamp scored ${a.score} in one file order and ${b.score} in the other — still ungrounded`);
    else pass("two OPEN notes under one stamp give the same answer whichever was written first");
    if (a.score < 100)
      fail(`a row citing a stamp whose notes are BOTH still open scored only ${a.score} (${JSON.stringify(a.whyNow)}) — he is owed something either way, so refusing to credit it discards real signal, and the report claims the tool credits it`);
    else pass("two OPEN notes under one stamp still count as an outstanding instruction");
  }
  // …and the banner must describe THAT behaviour, not the opposite. The first version said a row
  // citing an ambiguous stamp "cannot be read as approval", which was false in this very case.
  const text = run([`--chart=${p}`, `--inbox=${AMBIGUOUS_INBOX("both-open")}`, "--rank"]).out;
  if (/cannot be\s+read as approval/.test(text))
    fail("the report still tells him an ambiguous citation cannot be read as approval, while the code credits it — the sentence he reads must be the one the code obeys");
  else pass("the report describes what the code does with an ambiguous stamp, not the opposite");
}

/* 12b. AND IT MUST SAY SO OUT LOUD. A duplicate id is a fault in HIS record, not in this tool, and
        the only place it can be repaired is `INBOX.md`. A reader that silently copes with it means
        the collision is permanent — REAP's own rule, applied to the tool's own inputs: flag, never
        absorb in silence. */
{
  const p = chartFile("ambiguous-report", AMBIGUOUS_CHART);
  const text = run([`--chart=${p}`, `--inbox=${AMBIGUOUS_INBOX("open-first")}`, "--rank"]).out;
  if (!text.includes("INBOX-20260101T0303Z"))
    fail("the report never names the stamp that two of his notes share — the collision can only be repaired in INBOX.md, and nothing tells anybody it is there");
  else pass("the report names the stamp two of his notes share, so his record can be repaired at the source");
  const j = runJson([`--chart=${p}`, `--inbox=${AMBIGUOUS_INBOX("open-first")}`, "--rank"]).json;
  if (!Array.isArray(j?.ambiguousInboxIds) || !j.ambiguousInboxIds.includes("INBOX-20260101T0303Z"))
    fail(`--json does not carry the ambiguous ids (got ${JSON.stringify(j?.ambiguousInboxIds)}) — the Glass-update session reads JSON, so a fault only the human report mentions is a fault it cannot see`);
  else pass("the machine-readable report carries them too");
}

/* 12c. THE SWEEP — THE SAME FAULT, ON THE TITLE KEYS, WHERE IT IS WORSE. Two open rows with the
        same first line: one whose pointer REAP has judged dead, one with no pointers in it at all.
        Keyed by title, REAP's verdict about the first is handed to the second — a +40 and the
        sentence "something it was waiting on has landed" about a row that was never waiting on
        anything, and, under `--write`, REAP's stale flag stamped into a row it never judged. */
const TWIN_TITLE = "**TWO ROWS THAT SHARE ONE FIRST LINE**";
const TWINS = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] ${TWIN_TITLE}
      ⟨\`T-901\`⟩
      A settled ruling of his names this one, so REAP judges its blocker lifted and unacted on.
      Filed 2026-09-02T04:19Z.
- [ ] ${TWIN_TITLE}
      ⟨\`T-902\`⟩
      This one has no pointer of any kind in it and is simply unstarted work. Filed 2026-09-02T04:19Z.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## SETTLED RULINGS — triaged, and kept on the record forever

| item | HIS RULING | now |
|---|---|---|
| The deploy permission, which \`T-901\` is still waiting on | **"we fixed it"** | CLOSED, already done. |

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;
{
  const p = chartFile("twins", TWINS);
  const r = runJson([`--chart=${p}`, `--inbox=${inboxFile()}`, "--reap", "--rank"]);
  const flagged = (r.json?.reap || []).length;
  if (flagged !== 1)
    fail(`REAP flagged ${flagged} of the two same-titled rows — this case only means something if exactly one of them has a dead pointer`);
  else pass("exactly one of the two same-titled rows has a dead pointer, so the case can fail");
  const innocent = (r.json?.rank || []).find((x) => x.id === "T-902");
  if (!innocent) fail(`the innocent twin vanished from the ranking (ids: ${JSON.stringify((r.json?.rank || []).map((x) => x.id))})`);
  else if (/waiting on has landed/i.test(innocent.whyNow || ""))
    fail(`a row with no pointer in it was told "${innocent.whyNow}" and scored ${innocent.score} — it inherited REAP's verdict about a DIFFERENT row that happens to share its first line, because the verdict is keyed by title`);
  else pass("REAP's verdict about one row does not leak onto another row with the same first line");
}
{
  /* …and the same collision, in the file the Glass reads. A stale flag written under a row nobody
     judged is a sentence on his phone that is simply not true. */
  const p = chartFile("twins-write", TWINS);
  run([`--chart=${p}`, `--log=${join(tmp, "twins-LOG.md")}`, `--inbox=${inboxFile()}`, "--reap", "--write"]);
  const out = readFileSync(p, "utf8");
  const blocks = out.split(/^- \[ \] /m).slice(1);
  const innocentBlock = blocks.find((b) => b.includes("T-902"));
  if (!innocentBlock) fail(`could not find the innocent twin in the written Chart:\n${out}`);
  else if (/STALE-CANDIDATE|⚠ STALE/.test(innocentBlock))
    fail(`the write stamped REAP's stale flag onto the row it never judged:\n${innocentBlock.trim().slice(0, 300)}`);
  else pass("the write does not stamp one row's stale flag onto its same-titled twin");
}

/* 12d. THE SWEEP MATCHED DONE ROWS BY TITLE TOO, AND HAD NO CASE AT ALL — CEO 95's finding. Two
        finished rows sharing a first line, only ONE of them old enough to archive: the young one
        must stay on his Chart and must not be filed into the log. `sweepable.find(title === title)`
        cannot tell them apart, so it archives whichever it meets first. */
const SWEEP_TWINS = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] **SOMETHING STILL OPEN** so the section is not all-done. Filed 2026-09-02T04:19Z.
- [x] **TWO FINISHED ROWS THAT SHARE ONE FIRST LINE**
      ⟨\`T-911\`⟩
      This one was SHIPPED 2001-02-03 and is long past the archive age.
- [x] **TWO FINISHED ROWS THAT SHARE ONE FIRST LINE**
      ⟨\`T-912\`⟩
      This one was SHIPPED ${TODAY} and must stay exactly where it is.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

- **A fated idea** — handled → **SHIPPED** 2026-09-01.
`;
/* ⚠ REWRITTEN 2026-09-02 WHEN SWEEP BECAME HIS VERSION, AND THE REASON IS WORTH THE PARAGRAPH.
       This case used to lean on the age filter to make its point: two same-titled done rows, only
       the 2001 one old enough, so archiving the young one proved the sweep was matching by TITLE.
       **Take the age filter away and that leverage is gone** — under his ruling both twins leave,
       so "the young one stayed" can no longer be the tell.
       The fault it guards has not gone anywhere, so the case is re-pointed rather than deleted:
       two finished rows sharing one first line must arrive in the log as TWO DISTINCT ENTRIES, and
       an OPEN row sharing that same first line must survive untouched. A title-keyed sweep fails
       both halves — it files one entry and it cannot tell the open twin from the finished ones. */
{
  const p = chartFile("sweep-twins", SWEEP_TWINS);
  const logPath = join(tmp, "sweep-twins-LOG.md");
  run([`--chart=${p}`, `--log=${logPath}`, "--sweep", "--write"]);
  const after = readFileSync(p, "utf8");
  const archived = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  for (const h of ["T-911", "T-912"]) {
    if (after.split(/^- \[[xX]\] /m).slice(1).some((b) => b.includes(h)))
      fail(`${h} is still a ticked row on the Chart — every completed row leaves, and a twin is not an exception`);
    if (!archived.includes(h))
      fail(`${h} never reached the log — two rows sharing one first line were keyed by title, so one silently overwrote the other`);
  }
  const entries = (archived.match(/^## T-91[12] /gm) || []).length;
  if (entries !== 2)
    fail(`the log holds ${entries} entries for the two same-titled finished rows — it must hold both, separately, or a title-keyed sweep has eaten one`);
  else pass("two finished rows sharing one first line arrive in the log as two distinct entries");
  if (!/^- \[ \][^\n]*SOMETHING STILL OPEN/m.test(after))
    fail("the OPEN row was swept — matching by anything other than the row's own slot cannot tell an open row from a finished one");
  else pass("the open row sharing the section survives the sweep of both twins");
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   13. "WAITING ON YOUR ANSWER" MUST BE A FACT ABOUT THE ROW, NOT THE FIVE WORDS IT HAPPENS TO SAY.

   Measured on the real Chart 2026-09-02T12:2xZ, and it is the reason `npm test` went red. The
   signal was `/BLOCKED ON WYATT/i.test(row.raw)` — a prose-grep for a SECTION HEADING inside a
   row's own body — held off only by REAP happening to flag the row stale. So:

     · his four-times-asked Chartkeeper row sank to 31 of 39, because its spec text describes the
       SETTLE pass writing "one question into BLOCKED ON WYATT with the measurement attached";
     · the row filed to describe THIS defect sank with it, on the words "adding an unrelated
       BLOCKED ON WYATT row";
     · a one-sentence wording fix sank too, for quoting the heading it is about.

   Three of the four rows the tool was hiding from him were waiting on nothing. And nothing about
   any of them changed — another session added two good, unrelated questions to a table that had
   been empty, and 1024 points moved.

   THE PROPERTY THESE CASES DEFEND: **adding a question that names no row must not move the
   ranking at all.** A signal derived from the ABSENCE of a match is a signal any unrelated edit
   can flip; a signal derived from a question NAMING a row cannot be.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const ATTACHED = (extraQuestion = "") => `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] \`T-101\` **A ROW ONE OF HIS QUESTIONS NAMES** — he really is being asked about this one,
      and the question says so from his side of the link.
- [ ] \`T-102\` **A ROW THAT ONLY DESCRIBES THE SECTION** — its spec says the tool writes one
      question into BLOCKED ON WYATT with the measurement attached. Nothing here waits on him.
- [ ] \`T-103\` **A ROW WHOSE QUESTION HE HAS ALREADY ANSWERED** — his ruling is in SETTLED
      RULINGS and nobody moved this row afterwards.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|
| **What colour should the lantern be?** Holds up \`T-101\`. | Recommended: brass | 2026-09-02 |${extraQuestion}

## SETTLED RULINGS — triaged, and kept on the record forever

| item | HIS RULING | now |
|---|---|---|
| The bilge pump, which holds up \`T-103\` | **"leave it alone"** | CLOSED, nothing to build. |

## THE IDEA INBOX

(empty)
`;

/* 13a. THE ROW A QUESTION NAMES REALLY IS SUNK. Red-proofs 13b: a tool that simply stopped sinking
        anything would pass 13b and fail here. */
{
  const p = chartFile("attached", ATTACHED());
  const r = runJson([`--chart=${p}`, "--rank"]);
  const named = (r.json?.rank || []).find((x) => /A ROW ONE OF HIS QUESTIONS NAMES/.test(x.title || ""));
  if (!named) fail("the row his question names vanished from the ranking");
  else if (named.score > 0 || !/waiting on your answer/i.test(named.whyNow || ""))
    fail(`a row a live question NAMES scored ${named.score} (${JSON.stringify(named.whyNow)}) — a question of his that names a row is the one thing that must sink it`);
  else pass("a row one of his live questions names is sunk, and told him why");
}

/* 13b. THE ROW THAT ONLY MENTIONS THE HEADING IS LEFT ALONE — both ways. It must not be sunk as
        blocked, and it must not be handed the +40 "something it was waiting on has landed" either:
        nothing of his was ever waiting on it, so both verdicts are inventions. */
{
  const p = chartFile("attached-mention", ATTACHED());
  const r = runJson([`--chart=${p}`, "--rank"]);
  const mention = (r.json?.rank || []).find((x) => /ONLY DESCRIBES THE SECTION/.test(x.title || ""));
  if (!mention) fail("the descriptive row vanished from the ranking");
  else {
    if (/waiting on your answer/i.test(mention.whyNow || "") || mention.score < 0)
      fail(`a row that merely SAYS "BLOCKED ON WYATT" while describing the section scored ${mention.score} (${JSON.stringify(mention.whyNow)}) — this is the fault that sank his own top task to 31 of 39`);
    else pass("a row that only describes the section is not read as waiting on him");
    if (/landed|resolved/i.test(mention.whyNow || ""))
      fail(`told him something had landed for a row no question of his has ever named: ${JSON.stringify(mention.whyNow)}`);
    else pass("…and is not told a blocker lifted that never existed");
  }
  const flagged = (runJson([`--chart=${p}`, "--reap"]).json?.reap || []).map((x) => x.title || "").join(" | ");
  if (/ONLY DESCRIBES THE SECTION/.test(flagged))
    fail("REAP flagged the descriptive row as stale — mentioning a heading is not pointing at a question");
  else pass("REAP leaves the descriptive row alone too");
}

/* 13c. HIS ANSWER LANDED AND NOBODY MOVED THE ROW — the signal REAP is genuinely for, now derived
        from a POSITIVE fact (his settled ruling names the row) instead of from an absence. */
{
  const p = chartFile("attached-settled", ATTACHED());
  const r = runJson([`--chart=${p}`, "--reap"]);
  const hit = (r.json?.reap || []).find((x) => /QUESTION HE HAS ALREADY ANSWERED/.test(x.title || ""));
  if (!hit) fail("did not flag the row whose question he has already settled — that is the stale row he reads five of every day");
  else if (!/answer/i.test(hit.reason || ""))
    fail(`flagged it with a reason that does not say his answer landed: ${JSON.stringify(hit.reason)}`);
  else pass("a row his SETTLED ruling names is flagged: his answer landed and nothing moved it");
}

/* 13d. THE ACCEPTANCE PROPERTY, AND THE ONE THE SPEC ASKED FOR BY NAME: adding an unrelated
        question must not move the ranking. The extra question below is deliberately built to share
        four distinctive words with `T-102` — "measurement", "attached", "question", "writes" — so
        an overlap-based signal is guaranteed to flip on it. Under the old code the ranking changed;
        under a signal derived from naming, it cannot. */
{
  const EXTRA = `\n| **Should the measurement be attached to every question the tool writes?** | Recommended: yes | 2026-09-02 |`;
  const before = runJson([`--chart=${chartFile("stable-before", ATTACHED())}`, "--rank"]);
  const after = runJson([`--chart=${chartFile("stable-after", ATTACHED(EXTRA))}`, "--rank"]);
  const shape = (j) => (j?.rank || []).map((x) => `${x.score} ${x.title}`).join("\n");
  if (!before.json || !after.json) fail("ranking one of the two fixtures produced no JSON");
  else if (shape(before.json) !== shape(after.json))
    fail(`adding a question that names no row changed the ranking:\n--- before ---\n${shape(before.json)}\n--- after ---\n${shape(after.json)}`);
  else pass("adding a question that names no row moves nothing — his order is his, not the last editor's");
}

/* 13e. AND THE LINKS THAT ARE MISSING MUST BE NAMED, never silently dropped. This is 11d's rule
        turned on the new signal: a row demoted — or a question ignored — in silence is one nobody
        can repair. The tool must say which rows talk about his table without naming a question,
        and which of his questions name no row at all. */
{
  const EXTRA = `\n| **Should the measurement be attached to every question the tool writes?** | Recommended: yes | 2026-09-02 |`;
  const p = chartFile("attached-report", ATTACHED(EXTRA));
  const r = runJson([`--chart=${p}`, "--rank"]);
  const mentions = r.json?.unattachedMentions;
  const questions = r.json?.unattachedQuestions;
  if (!Array.isArray(mentions) || !mentions.some((t) => /ONLY DESCRIBES THE SECTION/.test(t)))
    fail(`did not name the row that talks about his table without naming a question (got ${JSON.stringify(mentions)})`);
  else if (mentions.some((t) => /QUESTIONS NAMES|ALREADY ANSWERED/.test(t)))
    fail(`named a properly-linked row as unattached (${JSON.stringify(mentions)})`);
  else pass("rows that mention his table without naming a question are named, so the link can be added");
  if (!Array.isArray(questions) || !questions.some((q) => /every question the tool writes/i.test(q)))
    fail(`did not name the question of his that holds up no row (got ${JSON.stringify(questions)})`);
  else if (questions.some((q) => /lantern/i.test(q)))
    fail(`named a question that DOES hold up a row (${JSON.stringify(questions)}) — the report must point only at the broken links`);
  else pass("questions of his that hold up no row are named too");
  const text = run([`--chart=${p}`, "--rank"]).out;
  if (!/name no task|names no question/i.test(text))
    fail("the human-readable report is silent about broken links between his questions and the list");
  else pass("the printed report names them too");
}

/* ⚑ THE WIRING CASE — added 2026-09-02 with the Door line it guards.
 *
 * A TOOL NOBODY INVOKES IS A TOOL THAT NEVER RUNS, and this project has now paid for that twice in
 * one file: `chartkeeper.mjs --rank` was built, gated and green for hours while Wyatt asked FOUR
 * TIMES why his Chart would not re-prioritise itself. Nothing was broken. The Door — the file that
 * tells a watch what to do each run — simply never named it, so it ran only when a human typed it,
 * and his top ask sank to 31 of 39.
 *
 * The old blocker was that the Door was VENDORED and no watch could add the line. His ruling
 * inverted that (the project owns its copy). This case is what stops the line being lost again to
 * a careless edit or a re-vendor, and it is deliberately about the DOOR rather than the tool:
 * the tool passing its own tests proves nothing about whether anything calls it. */
{
  const doorPath = join(ROOT, ".claude", "skills", "door", "SKILL.md");
  const door = existsSync(doorPath) ? readFileSync(doorPath, "utf8") : "";
  const watchSection = door.split(/^## THE WATCH/m)[1]?.split(/^## /m)[0] ?? "";
  if (!watchSection) {
    fail("could not find the Door's THE WATCH section — this case cannot check anything, which is worse than failing");
  } else if (!/chartkeeper\.mjs[^\n]*--rank[^\n]*--write/.test(watchSection)) {
    fail("the Door's watch routine does not run `chartkeeper.mjs … --rank … --write` — RANK exists and nothing calls it, so his Chart will not re-prioritise itself (he asked four times)");
  } else {
    pass("the Door's watch routine runs `chartkeeper.mjs --rank --write`");
  }
  /* ⚑ AND THE STALE HALF OF THAT SAME LINE IS NAMED HERE RATHER THAN LEFT UNGUARDED — CEO 107's
     finding, and it was right: the branch that used to watch this was DELETED when sweep changed
     hands, so a live false instruction in the file that tells every watch what to do survived,
     recorded only in a commit-message body. *"Nobody filed it where a session would look"* is the
     previous verdict's fault, recurring.
     It REPORTS rather than fails for the same reason as the duplicate handles: two attempts to edit
     `.claude/skills/door/SKILL.md` were refused by session permissions, and a gate that fails on
     something no watch can repair blocks the relay. **The refusal is a permission setting, not a
     fact** (CEO 106) — a session that CAN write there should delete the sentence, and then this
     becomes a `fail()`. */
  if (/NOT `--sweep`|NOT --sweep/.test(watchSection)) {
    console.log("  REPORT  the Door's step 6a still says NOT --sweep, for a reason that expired 2026-09-02: sweep is now his design and the done count reads from CHART-LOG.md. The sweep runs from close_item.mjs regardless, so nothing is broken — but the Door is teaching the opposite of what the system does. Editing that file is refused to an unattended watch; a session with permission should delete the sentence and turn this into a fail().");
  }
}

/* ⚑ THE SWEEP'S OWN WIRING CASE, AND ITS INVOKER IS DELIBERATELY NOT THE DOOR.
 *
 * The Door is a step somebody performs at the END of a watch. SWEEP is his ruling that a completed
 * row leaves **immediately** — and "immediately" and "next time a watch reaches step 6a" are not the
 * same promise. The moment a row becomes finished is the moment `close_item.mjs` ticks it, so that
 * is where the sweep is wired: the tick and the departure are one act, and no window exists in
 * which the Chart says a thing is done.
 *
 * `SPEC-CHARTKEEPER.md` names this hook point itself — SWEEP belongs to the Watch because it
 * "already has write authority, a CEO gate, and `close_item.mjs` as a natural hook point."
 *
 * ⚠ AND THE HONEST PART: the Door's step 6a still says `NOT --sweep`, with a reason that expired
 * when sweep became his design. **That line was not corrected because this session was refused
 * write access to `.claude/skills/door/SKILL.md`** — two attempts, both denied, and routing around
 * a refusal with a shell command is not a repair. The sweep runs regardless, from the close gate,
 * which is why the build is green rather than blocked; the Door's stale sentence is filed as its
 * own row. This case guards the invoker that EXISTS. */
{
  const closer = join(ROOT, "scripts", "wyclau", "close_item.mjs");
  const src = existsSync(closer) ? readFileSync(closer, "utf8") : "";
  if (!src) {
    fail("scripts/wyclau/close_item.mjs is missing — this case cannot check anything, which is worse than failing");
  } else if (!/chartkeeper\.mjs[\s\S]{0,400}?--sweep/.test(src)) {
    fail("closing an item does not sweep — a row he has finished stays on his Chart until somebody types the command, and 'MANY completed tasks still stale on it' is the complaint that started this");
  } else if (!/no-sweep/.test(src)) {
    fail("the sweep in close_item.mjs cannot be turned off, so nothing can test the tick on its own");
  } else pass("closing an item sweeps it off the Chart in the same act — 'immediately' means immediately");
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⚑ 14. ONE LABEL MUST NOT DO DUTY FOR THREE UNRELATED FAULTS — `T-090`, his own idea, and the
   thing he could SEE on his page: "N tasks on your list look already finished."

   Measured 2026-09-02T20:0xZ against the real Chart before a line was written: ten rows carried
   that one label and **not one of them was flagged "finished"**. Six said *the evidence went stale
   when the build moved on* (needs RE-MEASURING — he cannot know from a phone whether a trade circle
   still clips a name), three said *his ruling landed and nothing moved the row*, one said *a pid is
   dead*. **A flag that means three things cannot be acted on by anybody**, and every reader of his
   page drew the wrong conclusion from it, including the Advisor to his face.

   The four cases below are the split, and they were RED on the code that shipped this morning.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/* ⚠ THE FIXTURE PUTS THE HANDLE WHERE THE REAL CHART PUTS IT — in the ruling's THIRD cell, the
   commentary a session wrote about other rows, never in the question cell. That is the whole fault:
   `settled.raw.includes(id)` searched the entire table row, so a handle mentioned in passing was
   read as "he answered THIS". On the live Chart one ruling's commentary named three handles and all
   three rows were flagged as answered; one of them (`T-078`) he has never been asked about at all. */
const KINDS = `# THE CHART — fixture

## STEP 1 CHECKLIST — the reboot

- [ ] \`T-201\` **A ROW HIS RULING ACTUALLY ANSWERED** — the question cell of his settled table
      names this row, which is the only link he writes himself.
- [ ] \`T-202\` **A ROW HIS RULING MERELY FREED** — named in the commentary of a ruling that was
      about something else. The work is untouched.
- [ ] \`T-203\` **A ROW MEASURED ON A BUILD NOBODY IS RUNNING** — its evidence cites 2001.01.01.1
      while the tree is somewhere else entirely.
- [ ] \`T-204\` **A ROW WHOSE HANDLE WAS REUSED** — a closed row in the archive carries this same
      handle, so a mention of it names two different things.
- [ ] **A ROW THAT TALKS ABOUT ANOTHER ROW — the half of \`T-201\` nobody built**, warns readers
      ⟨\`T-205\`⟩
      off on account of pid 999999, which is not running.
- [ ] **ONE OF TWO OPEN ROWS SHARING A HANDLE** — nothing forbids this and it happens; the ruling
      ⟨\`T-206\`⟩
      below names the handle, so without a guard BOTH of these inherit the same answer.
- [ ] **THE OTHER OF TWO OPEN ROWS SHARING A HANDLE** — an entirely unrelated job.
      ⟨\`T-206\`⟩

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## SETTLED RULINGS — triaged, and kept on the record forever

| item | HIS RULING | now |
|---|---|---|
| The bilge pump, which holds up \`T-201\` | **"leave it alone"** | CLOSED. Still to do: the pump housing (\`T-202\`), the old bilge item (\`T-204\`) and the twins (\`T-206\`). |

## THE IDEA INBOX

(empty)
`;

/* The archive that makes `T-204` ambiguous: the handle names a row that CLOSED, so the ruling's
   mention of it cannot be pinned to the live row now carrying the same number. */
const KINDS_LOG = `# THE CHART LOG — fixture

## T-204 — 2026-01-01 — an entirely different job that finished long ago (closed 2026-01-01 · CEO 1 · no game diff)

- [x] an entirely different job that finished long ago
      ⟨\`T-204\`⟩
`;

{
  const p = chartFile("kinds", KINDS);
  const logPath = join(tmp, "kinds-LOG.md");
  writeFileSync(logPath, KINDS_LOG);
  const r = runJson([`--chart=${p}`, `--log=${logPath}`, "--reap"]);
  const rows = r.json?.reap || [];
  const find = (re) => rows.find((x) => re.test(x.title || ""));

  /* 14a. THE LINK HE WRITES HIMSELF STILL WORKS. Red-proofs every case below: a tool that simply
          stopped claiming anything would pass 14b/14c/14d and fail here. */
  const answered = find(/HIS RULING ACTUALLY ANSWERED/);
  if (!answered) fail("the row his settled question NAMES is no longer flagged at all — the signal REAP exists for was thrown out with the fault");
  else if (answered.fault !== "answered")
    fail(`the row his ruling answered came back as kind ${JSON.stringify(answered.fault)} — it must be "answered", the one kind whose owner is a close`);
  else pass("a handle in his question cell still reads as: you answered this, and nothing moved the row");

  /* 14b. AND A HANDLE IN THE COMMENTARY IS NOT AN ANSWER. This is the T-078 fault in miniature. */
  const freed = find(/HIS RULING MERELY FREED/);
  if (freed && freed.fault === "answered")
    fail("a row named only in a ruling's COMMENTARY is reported as one he answered — that is the mis-attribution that would put a question he never saw back in front of him");
  else if (!freed) fail("the row his ruling freed vanished from REAP — his ruling really did unblock it and that is the cheapest row on the list to pick up");
  else if (freed.fault !== "unblocked")
    fail(`the freed row came back as kind ${JSON.stringify(freed.fault)} — "your ruling freed this, the work is still to do" is a different fact from "you answered this"`);
  else pass("a handle in a ruling's commentary reads as: your ruling freed this row, and the work is still to do");

  /* 14c. AN AMBIGUOUS HANDLE CLAIMS NOTHING. Handles are reused in practice — `T-078` is closed in
          CHART-LOG.md and live again on the Chart — so a mention of one names two rows and can
          honestly be attached to neither. Failing toward NO CLAIM is the only safe direction. */
  /* ⚠ AND IT ASSERTS ON THE REASON TEXT, NOT ONLY ON THE KIND — because a kind nobody sets yet is
     `undefined`, and a case that reads only the kind PASSES on the broken code it was written to
     catch. It did exactly that on the first run of this file. */
  const reused = find(/HANDLE WAS REUSED/);
  if (reused && (/answered|unblocked/.test(reused.fault || "") || /answer landed|ruling freed|your answer/i.test(reused.reason || "")))
    fail(`a row whose handle is ALSO a closed row in the archive was linked to his ruling anyway (${JSON.stringify(reused.fault || reused.reason)}) — an ambiguous handle must claim nothing`);
  else pass("a reused handle links to no ruling at all — it names two rows, so it may speak for neither");

  /* 14c-bis. ⚑ A ROW IS IDENTIFIED BY ITS OWN HANDLE LINE, NOT BY THE FIRST HANDLE ANYWHERE IN ITS
        PROSE — and until 2026-09-02 it was the latter, which is how the mis-attribution actually
        happened. `ID_RE` took the first `T-nnn` in the whole row, so the live row **"BUILD THE
        KIT-BEHIND DETECTOR — the half of `T-078` he asked for"** answered to `T-078`, a handle
        belonging to a row that closed hours earlier. Every signal keyed on a row's id — his
        questions, his rulings, how often he has raised it — was reading that row as a different
        row. Nothing reported it, because a wrong identity produces confident, well-formed
        nonsense. The fixture row below carries `⟨T-205⟩` and mentions `T-201` in its first line. */
  const talksAbout = find(/TALKS ABOUT ANOTHER ROW/);
  if (!talksAbout) fail("the row with the dead pid vanished — this case cannot check identity if the row is never flagged");
  else if (talksAbout.id !== "T-205")
    fail(`a row whose head line says T-205 was identified as ${JSON.stringify(talksAbout.id)} — it merely MENTIONS that handle in its prose, and every signal keyed on a row's id was reading it as another row`);
  else if (talksAbout.fault === "answered")
    fail("a row that only talks about another row inherited that row's settled ruling");
  else pass("a row is identified by its own handle line, not by a handle it mentions in passing");

  /* 14c-ter. ⚑ AND A HANDLE TWO OPEN ROWS SHARE IS AMBIGUOUS TOO — CEO 119 found this on the LIVE
        Chart, in the handle of the very row this whole change was filed under: `T-090` sits on
        `CHART.md:95` and again on `:320`, two unrelated rows, and the guard shipped an hour earlier
        saw nothing because it only knew about handles closed in the archive. **The tool must say so
        out loud**, not quietly cope: a duplicate can only be repaired in `CHART.md`, and while it
        stands every signal keyed on that handle attaches to both rows. On the live Chart there are
        FIVE of them, not one. */
  const twinA = find(/ONE OF TWO OPEN ROWS SHARING A HANDLE/);
  const twinB = find(/THE OTHER OF TWO OPEN ROWS SHARING A HANDLE/);
  if (twinA || twinB)
    fail(`a row sharing its handle with another open row still inherited a ruling (${JSON.stringify((twinA || twinB).reason)}) — one mention names two jobs, so it may speak for neither`);
  else pass("a handle two open rows share claims nothing for either of them");
  if (!/handle\(s\) are carried by MORE THAN ONE open row/.test(run([`--chart=${p}`, `--log=${logPath}`, "--reap"]).out))
    fail("the duplicate handle is silently worked around — it can only be repaired in CHART.md, and closing by that handle is a coin flip between the two rows");
  else pass("…and the duplicate is named out loud so somebody can repair it");

  /* 14d. AND THE REPORT MUST SAY WHICH IS WHICH, IN A SENTENCE HE COULD READ. The runbook told the
          Glass session to write one line — "N tasks on your list look already finished" — for
          whatever this pass found. That sentence is composed by a human from a lumped list, which
          is exactly how it went wrong. The tool now emits the sentences itself, one per kind. */
  const text = run([`--chart=${p}`, `--log=${logPath}`, "--reap"]).out;
  if (/look already finished/.test(text))
    fail("the reap report still offers the one-label sentence he complained about");
  else if (!/FOR THE NOTE/.test(text))
    fail("the reap report prints no FOR THE NOTE block — the Glass session is still left to compose the sentence itself, which is how one label came to mean three things");
  else if (!/re-measure/i.test(text) || !/freed/i.test(text))
    fail(`the FOR THE NOTE block does not name each kind and its owner: ${JSON.stringify(text.slice(text.indexOf("FOR THE NOTE"), text.indexOf("FOR THE NOTE") + 400))}`);
  else pass("the reap report writes his note itself, one sentence per kind, each naming whose job it is");
}

/* 14e. AND THE RUNBOOK MUST STOP TELLING THE SESSION TO COMPOSE THAT LINE. A tool that emits the
        right sentence while the runbook still asks for the wrong one is a fix nobody applies. */
{
  const runbook = join(ROOT, ".planning", "wyclau", "GLASS-UPDATE-SESSION.md");
  const src = existsSync(runbook) ? readFileSync(runbook, "utf8") : "";
  /* ⚠ IT CHECKS THE ORDER, NOT THE ABSENCE, AND THE FIRST VERSION CHECKED THE ABSENCE — which went
     red on this file's own war story. The old sentence has to survive somewhere: this repo's
     comments are the graveyard (rule 10), and a correction that deletes the wrong wording teaches
     nobody why the right one exists. What must not survive is the wrong sentence as the LIVE
     INSTRUCTION. So: the instruction (`FOR THE NOTE`) comes first, and any mention of the old
     wording sits after it, as history. */
  const note = src.indexOf("FOR THE NOTE");
  const old = src.indexOf("look already finished");
  if (!src) fail(".planning/wyclau/GLASS-UPDATE-SESSION.md is missing — the Glass tick has no runbook");
  else if (note < 0)
    fail("the Glass runbook does not tell the tick to copy the tool's FOR THE NOTE block, so the sentence is still composed by hand");
  else if (old >= 0 && old < note)
    fail("the Glass runbook still instructs the tick to write \"N tasks on your list look already finished\" before it mentions FOR THE NOTE — the one label he complained about, still live in the file that causes it");
  else pass("the Glass runbook hands the sentence to the tool instead of composing it");
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
