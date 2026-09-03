#!/usr/bin/env node
/* harvest_carries_his_words_check.mjs — `T-140`.
 *
 * THE SUBJECT: four kinds of Wyatt's own writing live only in the Glass's state block — ideas,
 * comments, rulings, and the `now:true` DO NOW pin. A republish regenerates the page empty, so
 * anything not carried into the record first is deleted. `glass-harvest-first.cjs` proves a session
 * READ the page; this gate proves the CARRY works.
 *
 * ⚠ WHAT THIS GATE CANNOT DO, stated so nobody re-derives it or believes more than it says:
 * **it cannot prove a session ran the harvest.** No gate can — though a REFUSAL can, and case 8
 * now holds the one `mark_glass_harvest.mjs` gained (CEO 162: the row talked itself out of that,
 * using "no gate can" to close a question a refusal answers one file away).
 *
 * ⛔ AND ONE SENTENCE THIS HEADER USED TO CARRY WAS TRUE AS WRITTEN AND MUCH NARROWER THAN IT READ:
 * *"a failed write is REPORTED rather than confirmed."* **True only of a write that fails to
 * ARRIVE.** CEO 162 changed one line so the INBOX write emitted only the new blocks, ran it against
 * a copy of his real inbox, and measured **64 of his headings reduced to 3 — sixty-one of his
 * entries deleted** — while the tool printed `verified in the file`, exited 0, and told the session
 * to republish. **The read-back verifies ARRIVAL, never PRESERVATION**, because it asks "is this new
 * id in the file?", which is true in an otherwise-empty file. Case 1 now asserts what was already
 * there is still there. The human-shaped step that remains is reading the page.
 *
 * ⚑ EVERY CASE WRITES TO SCRATCH FILES via `--inbox=`/`--decisions=`. It must never touch the real
 * INBOX: on a branch three sessions share, a check that writes his instruction queue is a check
 * that can eat an instruction (`T-112`).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/* `--tool=` exists SO THIS GATE CAN BE RED-PROOFED WITHOUT MUTATING THE SHARED TREE. To show a case
 * can fail you must break the thing it watches; doing that in place, on a branch three sessions
 * share, is the destroy-then-repair `T-112` ruled against. Point it at a broken COPY instead.
 * ⚠ Tonight's refinement, and it is the whole discipline: *"I mutated it and it went red" is only
 * evidence if you check WHICH assertion went red.* A copy that fails to parse turns every case red
 * at once and proves nothing about any of them. */
const TOOL = (process.argv.find((a) => a.startsWith("--tool=")) ?? "").slice(7)
  || join(ROOT, "scripts", "wyclau", "harvest_glass.mjs");
const fails = [];
const dir = mkdtempSync(join(tmpdir(), "harvest-check-"));

/* His words, in the four shapes the page really stores. The oddities are deliberate:
 *  · an idea with a newline in it — he writes in paragraphs and a naive `> ` quote loses lines;
 *  · a comment on `T-999`, a handle that owns no row, which is the drop-it-silently hazard;
 *  · a ruling with a note, because a note with no button press is still a ruling (glass.mjs). */
const state = {
  v: 2,
  ideas: [
    { id: "i1", text: "the sail squares are too small on my phone\nand I keep missing them", at: "2026-09-03T11:00:00.000Z" },
    { id: "i2", text: "make the end of voyage awards visible without scrolling", at: "2026-09-03T11:05:00.000Z", now: true },
  ],
  comments: { "T-999": [{ text: "this one is not what I meant", at: "2026-09-03T11:10:00.000Z" }] },
  rulings: { q7: { choice: "yes", note: "but do the phone one first", q: "Should the awards move above the fold?", at: "2026-09-03T11:15:00.000Z" } },
};
const page = (s) => `<!doctype html><title>The Glass</title>`
  + `<script type="application/json" id="glassState">${JSON.stringify(s)}</script>`;

const htmlPath = join(dir, "glass.html");
writeFileSync(htmlPath, page(state));

const run = (extra = []) => {
  try {
    return { out: execFileSync(process.execPath, [TOOL, `--html=${htmlPath}`, ...extra], { cwd: ROOT, encoding: "utf8" }), code: 0 };
  } catch (e) { return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 }; }
};
/* ⛔ THE SEEDED INBOX MUST CONTAIN A REAL `## INBOX-…` ENTRY, AND THE FIRST VERSION DID NOT.
 * CEO 162 found that single omission hiding an entire class of silent loss. His real INBOX holds
 * 64 such headings; the fixture held none — so a de-dupe bug that eats his words in production had
 * nothing to collide with here and passed. **A gate whose destination is not shaped like the real
 * destination is testing a file nobody has.**
 * `OLD_ENTRY` and `OLD_RULING` are what every case now proves SURVIVED. */
const OLD_ENTRY = "## INBOX-20260901T1309Z — guest camera stuck FULLY zoomed out";
const OLD_RULING = "## AN OLDER RULING — 2026-09-01";
const fresh = (n) => {
  const ib = join(dir, `inbox${n}.md`), de = join(dir, `dec${n}.md`);
  writeFileSync(ib, `# THE INBOX — Wyatt's words, verbatim\n\n${OLD_ENTRY}\n> his words\nstatus: OPEN\n`);
  writeFileSync(de, `# Wyatt's standing decisions\n\n${OLD_RULING}\n\nbody\n`);
  return { ib, de, args: [`--inbox=${ib}`, `--decisions=${de}`] };
};

try {
  // 1 — his four things all arrive.
  {
    const f = fresh(1);
    const r = run(f.args);
    const inbox = readFileSync(f.ib, "utf8"), dec = readFileSync(f.de, "utf8");
    if (r.code !== 0) fails.push(`1: harvest exited ${r.code}\n${r.out}`);
    if (!inbox.includes("sail squares are too small")) fails.push("1: his first idea did not reach the INBOX");
    if (!inbox.includes("and I keep missing them")) fails.push("1: the SECOND LINE of his idea was lost — he writes in paragraphs");
    if (!inbox.includes("end of voyage awards")) fails.push("1: his pinned idea did not reach the INBOX");
    if (!inbox.includes("this one is not what I meant")) fails.push("1: his COMMENT did not reach the INBOX");
    if (!dec.includes("Should the awards move above the fold")) fails.push("1: his ruling did not reach DECISIONS.md");
    if (!dec.includes("but do the phone one first")) fails.push("1: his ruling's NOTE was lost — a note with no button press is still a ruling");
    /* ⛔ AND WHAT WAS ALREADY THERE MUST STILL BE THERE. **THIS IS THE ASSERTION THE GATE SHIPPED
     * WITHOUT, AND ITS ABSENCE WAS THE WORST HOLE IN IT.** CEO 162 changed one line so the INBOX
     * write emitted only the new blocks, ran it against a copy of his REAL inbox, and measured:
     * 2080 lines → 18, **64 of his headings → 3, sixty-one of his entries deleted** — while the
     * tool printed "3 of 3 new (verified in the file)", exited 0, and told the session to
     * republish. **This gate PASSED.**
     * The read-back could not see it by construction: it asks *"is this new id in the file?"*,
     * which is true in an otherwise-empty file. **IT VERIFIES ARRIVAL, NEVER PRESERVATION** — and
     * a harvest that eats his queue is far worse than the hand step it replaces. */
    if (!inbox.includes(OLD_ENTRY)) fails.push("1: AN ENTRY THAT WAS ALREADY IN THE INBOX IS GONE — the harvest overwrote his queue instead of appending to it");
    if (!dec.includes(OLD_RULING)) fails.push("1: A RULING THAT WAS ALREADY ON RECORD IS GONE — the harvest overwrote DECISIONS.md");
    /* Two of his items must never share a heading. **UNTIDY, NOT LOSSY — and the distinction is the
     * point.** CEO 162 found that a broken `stamp()` could give every entry the same id; measured
     * against a copy of his real 2080-line INBOX, both ideas still landed and all 64 existing
     * entries survived. The LOSSY version of that path was the EMPTY id, which the tool now refuses
     * outright. This case holds the remaining untidiness so the two cannot be confused again:
     * `close_item.mjs` looks an entry up by exact heading, and two entries under one heading make
     * that lookup ambiguous. */
    const heads = (inbox.match(/^## INBOX-\S+/gm) || []);
    if (heads.length !== new Set(heads).size) fails.push("1: two of his items share one INBOX heading — close_item.mjs looks entries up by heading, and cannot tell them apart");
  }

  // 2 — the DO NOW press survives the crossing. A pin that only exists on the page is an
  //     ordering signal a watch cannot obey, which is the whole point of `T-104`.
  {
    const f = fresh(2);
    run(f.args);
    const inbox = readFileSync(f.ib, "utf8");
    const entry = inbox.split("## ").find((b) => b.includes("end of voyage awards")) ?? "";
    /* ⚠ CHECK THE TITLE AND THE STATUS SEPARATELY — a red proof caught this case passing on a
     * HALF-BROKEN pin. The first version asked `/DO NOW|PINNED/` of the whole entry, so deleting
     * the title marker still matched the word "PINNED" further down in `status:`. A watch scanning
     * headings would have seen an ordinary idea. **An OR across two surfaces tests neither.** */
    if (!/DO NOW/.test(entry.split("\n")[0])) fails.push("2: the pin is not in the entry's TITLE — a watch scanning headings sees an ordinary idea");
    if (!/PINNED/.test(entry)) fails.push("2: the pin is not in the entry's status line — the close gate reads status, not titles");
    const other = inbox.split("## ").find((b) => b.includes("sail squares")) ?? "";
    if (/DO NOW|PINNED/.test(other)) fails.push("2: an UNPINNED idea was marked as pinned — the pin means nothing if everything has it");
  }

  // 3 — RUN IT TWICE. It will be: a session unsure whether it harvested runs it again, and that
  //     is the correct instinct. Duplicating his words is worse than the hand step it replaces.
  {
    const f = fresh(3);
    run(f.args);
    const once = readFileSync(f.ib, "utf8"), onceDec = readFileSync(f.de, "utf8");
    const r2 = run(f.args);
    const twice = readFileSync(f.ib, "utf8"), twiceDec = readFileSync(f.de, "utf8");
    if (twice !== once) fails.push("3: a SECOND harvest changed the INBOX — his words are being duplicated");
    if (twiceDec !== onceDec) fails.push("3: a SECOND harvest changed DECISIONS.md — his rulings are being duplicated");
    if (r2.code !== 0) fails.push(`3: the second run exited ${r2.code}; a no-op harvest is a success`);
    if (!/skipped/i.test(r2.out)) fails.push("3: the second run did not SAY it skipped anything — silence looks like a fresh harvest");
  }

  // 4 — a handle that owns no row. He commented; the row closed and swept. It is still his writing.
  {
    const f = fresh(4);
    run(f.args);
    const inbox = readFileSync(f.ib, "utf8");
    if (!inbox.includes("T-999")) fails.push("4: a comment on a swept handle was dropped — silently losing his words is this row's own fault");
  }

  // 5 — THE FAULT THIS ROW IS ABOUT: the machine says done and the words are gone. A tool that
  //     counts from the array it looped over cannot see a write that did not land. Point it at a
  //     read-only destination and it must FAIL LOUDLY, not report a successful harvest.
  {
    const f = fresh(5);
    const r = run([`--inbox=${join(dir, "no-such-dir", "inbox.md")}`, `--decisions=${f.de}`]);
    if (r.code === 0) fails.push("5: harvest reported SUCCESS with an unwritable INBOX — that is the exact fault T-076 was");
    if (/^ideas \+ comments -> INBOX\.md: +[1-9]/m.test(r.out)) fails.push("5: it printed a positive INBOX count for a write that could not land");
  }

  // 5b — THE READ-BACK ITSELF, which case 5 does NOT reach and a red proof proved it does not.
  //      Case 5 makes the destination UNREADABLE, so the tool exits at the guard long before it
  //      counts anything — it tests the guard. Replacing the file-count with the loop-count
  //      survived that case untouched. **The safety net had no test.**
  //      This case makes the write LAND SOMEWHERE ELSE instead: pass one path as both
  //      destinations, and the DECISIONS write — which rebuilds from the snapshot taken before the
  //      INBOX write — silently erases the INBOX entries. A count taken from the loop reports a
  //      happy harvest over words that are no longer there. That is exactly `T-076`'s fault.
  {
    const both = join(dir, "both.md");
    writeFileSync(both, "# Wyatt's standing decisions\n");
    const r = run([`--inbox=${both}`, `--decisions=${both}`]);
    const after = readFileSync(both, "utf8");
    const inboxLanded = /## INBOX-/.test(after);
    if (!inboxLanded && r.code === 0) fails.push("5b: it reported SUCCESS while his ideas were overwritten — the counts are not being read back off disk");
    if (!inboxLanded && /^ideas \+ comments -> INBOX\.md: +[1-9]/m.test(r.out)) fails.push("5b: it printed a positive idea count for words that are not in the file");
  }

  // 6 — an empty page is a clean page. It must not be reported as a failure, or every watch
  //     learns to step over this tool's exit code.
  {
    const f = fresh(6);
    const empty = join(dir, "empty.html");
    writeFileSync(empty, page({ v: 2, ideas: [], rulings: {}, comments: {} }));
    let code = 0, out = "";
    try { out = execFileSync(process.execPath, [TOOL, `--html=${empty}`, ...f.args], { cwd: ROOT, encoding: "utf8" }); }
    catch (e) { code = e.status ?? 1; out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
    if (code !== 0) fails.push(`6: an empty Glass exited ${code} — a clean page is not a failure`);
    if (!/nothing/i.test(out)) fails.push("6: an empty harvest did not say so plainly");
  }

  // 7 — the tool must be reachable from the Door, or it is a capability nothing invokes. That is
  //     the fault that left the Chartkeeper's ranker unrun while his top ask sank to 31 of 39.
  {
    const door = readFileSync(join(ROOT, ".claude", "skills", "door", "SKILL.md"), "utf8");
    if (!door.includes("harvest_glass.mjs")) fails.push("7: the Door never names harvest_glass.mjs — a capability nothing invokes never runs");
  }

  /* 8 — THE CARRY MUST BE WIRED INTO THE RECEIPT CHAIN, NOT SIT BESIDE IT.
   *
   * CEO 162's structural finding, and it is the one the row's own text talked itself out of. The
   * row said *"no gate can prove a session typed it"* — true of a GATE, and used to close a
   * question **a REFUSAL answers**, one file away, for the sibling flag. Reading the page and
   * CARRYING his words off it are two acts; only the second saves anything; and a session could do
   * the first, stamp `LAST-HARVEST`, and publish — which then deletes everything nobody moved.
   *
   * `mark_glass_harvest.mjs` now requires `--harvested=<the page file>` and refuses unless the
   * carry left its own receipt for THAT file — the same move CEO 127 made with `--rulings=`.
   * ⚠ This case asserts the REFUSALS exist. It cannot make a session run the command at all;
   * `glass-harvest-first.cjs` still does not name it (that repair is under `.claude/` and needs
   * Wyatt's hands — `CLAUDE-DIR-REPAIRS-PENDING.md`). **Say what it covers, not what it feels like.** */
  {
    const stamp = readFileSync(join(ROOT, "scripts", "wyclau", "mark_glass_harvest.mjs"), "utf8");
    if (!stamp.includes("--harvested=")) fails.push("8: the harvest stamp no longer requires --harvested= — a session can stamp a page whose words were never carried, then republish over them");
    if (!stamp.includes("LAST-CARRY")) fails.push("8: the harvest stamp no longer checks the carry receipt — --harvested= would be a word anyone can type");
    const tool = readFileSync(TOOL, "utf8");
    if (!tool.includes("LAST-CARRY")) fails.push("8: harvest_glass.mjs no longer writes a carry receipt — the stamp's check has nothing to read and would refuse every real harvest");
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (fails.length) {
  console.log(`FAIL — harvest_carries_his_words_check (${fails.length}):`);
  for (const f of fails) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("PASS — harvest_carries_his_words_check: ideas, comments, rulings and the DO NOW pin all cross; twice is a no-op; a failed write is reported, not confirmed.");
