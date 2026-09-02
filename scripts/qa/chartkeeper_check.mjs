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

const run = (args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [KEEPER, ...args], { encoding: "utf8", cwd: ROOT }) };
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
      lantern colour. Nothing about this row is finished.
- [ ] **A DEAD POINTER — See BLOCKED ON WYATT** for the deploy permission. He answered this
      hours ago and nothing moved it.
- [ ] **A ROW CITING A TRIAL REPORT THAT DOES NOT EXIST** — see
      \`.planning/SEA-TRIAL-fixture-never-written.md\`, verdict pending.
- [ ] **A ROW WHOSE EVIDENCE IS RETIRED** — measured on build \`2000.01.01.1\`, which is not the
      stamp in the tree.
- [ ] **A GATED ROW** that must sink — GATED: waiting for the quiet moment.
- [x] **A DONE ROW FROM LONG AGO** — SHIPPED 2001-02-03.
- [x] **A DONE ROW FROM TODAY** — SHIPPED ${TODAY}.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|
| **What colour should the lantern be?** the taste call on the lantern colour | Recommended: brass | 2026-09-02 |

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
  const gatedRow = "- [ ] **A GATED ROW** that must sink — GATED: waiting for the quiet moment.\n";
  const shuffled = MIXED
    .replace(gatedRow, "")
    .replace("## STEP 1 CHECKLIST — the reboot\n\n", `## STEP 1 CHECKLIST — the reboot\n\n${gatedRow}`);
  if (shuffled === MIXED) fail("the shuffled fixture is identical to the original — this case cannot fail and is therefore not a check");
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

/* 5. SWEEP MUST GIVE DONE ROWS AN EXIT, AND MUST NOT ARCHIVE THIS WEEK'S. "27 done" is not a fact
      about this week; it is a number that grows forever and therefore says nothing.

      ⚠ THE SECOND OVER-SPECIFIED ASSERTION, AND THE SAME CORRECTION. It first demanded the swept
      row's TITLE be absent from the Chart — but the spec asks for a one-line stub carrying exactly
      that title, so a reader following an old reference lands somewhere instead of nowhere. What
      must actually be true: the checkbox goes (so the `done` count starts meaning "done this
      week"), the essay goes, the archive has all of it, and a non-checkbox stub stays. */
{
  const p = chartFile("sweep", MIXED);
  const log = join(tmp, "CHART-LOG.md");
  const doneBefore = (readFileSync(p, "utf8").match(/^- \[x\]/gm) || []).length;
  run([`--chart=${p}`, `--log=${log}`, "--sweep", "--write"]);
  const after = readFileSync(p, "utf8");
  const doneAfter = (after.match(/^- \[x\]/gm) || []).length;
  if (doneAfter !== doneBefore - 1)
    fail(`the done-checkbox count went ${doneBefore} → ${doneAfter}; exactly one row was old enough to archive. Done rows never leaving is why most of the Chart is history`);
  else pass("the archived row's checkbox left the Chart — 'done' can start meaning 'done this week'");
  if (/^- \[x\][^\n]*A DONE ROW FROM LONG AGO/m.test(after))
    fail("the row from 2001 is still an open checkbox row on the Chart");
  else if (!/↳[^\n]*A DONE ROW FROM LONG AGO/.test(after))
    fail("no stub left behind — an old reference to that row now lands nowhere");
  else pass("a one-line stub stays behind, pointing at the archive");
  if (!existsSync(log)) fail("wrote no archive file — a sweep that deletes instead of archiving loses the record");
  else {
    const archived = readFileSync(log, "utf8");
    if (!/A DONE ROW FROM LONG AGO/.test(archived)) fail("the archived row is not in the archive — the sweep dropped it on the floor");
    else pass("the archived row's full text is in the archive");
  }
  if (!/^- \[x\][^\n]*A DONE ROW FROM TODAY/m.test(after))
    fail("archived a row finished today — the 7-day window is the whole point");
  else pass("left this week's done row in place");
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
  const ids = once.match(/\bT-\d{3}\b/g) || [];
  if (ids.length === 0) fail("allocated no T-nnn ids — every reference to a row stays a line number, and line numbers go stale in the commit that writes them");
  else pass(`allocated ${ids.length} stable row ids`);
  if (new Set(ids).size !== ids.length) fail(`allocated a duplicate id (${ids.length} ids, ${new Set(ids).size} distinct) — two rows sharing a handle is worse than neither having one`);
  else pass("every allocated id is distinct");
  run([`--chart=${p}`, "--write"]);
  const ids2 = (readFileSync(p, "utf8").match(/\bT-\d{3}\b/g) || []);
  if (ids2.join(",") !== ids.join(",")) fail(`a second run changed the ids (${ids.length} → ${ids2.length}) — ids must be allocated once and never reused`);
  else pass("a second run allocates nothing new — ids are stable across runs");
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

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
