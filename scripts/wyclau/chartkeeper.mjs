#!/usr/bin/env node
/* chartkeeper.mjs — THE CHART RE-PRIORITISES ITSELF. Four passes, and it never closes anything.
 *
 * WYATT ASKED FOR THIS FOUR TIMES AND THE FIRST THREE ARE STILL ON THE CHART MARKED "SCHEDULED".
 * 2026-09-02T00:59:32Z, 03:45:45Z, 03:46:13Z, 03:49:02Z, then in full:
 *   "audit the chart ('tasks') which has MANY completed tasks still stale on it, and design ... a
 *    system that will dynamically reprioritize it, update it, and move things around it that is
 *    built into this process somehow -- either with the Glass Update Session, or in the watch."
 * The fix for the Chart's inability to re-prioritise was itself filed on the Chart and never rose.
 * That is the acceptance test, and it is why the ranking's loudest signal is HOW OFTEN HE HAS
 * RAISED IT.
 *
 * Spec: `.planning/SPEC-CHARTKEEPER.md` (written by the Advisor, verified by CEO 89).
 *
 * THE FOUR PASSES
 *   REAP   finds rows whose POINTER is dead — a question that has been answered, a report that was
 *          never written, a pid that is not running, a build stamp older than the tree. It FLAGS.
 *          IT NEVER TICKS A BOX. Ticking is a claim about WORK; the reaper only ever measures the
 *          pointer. `mark_glass_published.mjs` is the cautionary tale two files away: a stamp that
 *          could only say one thing recorded a publish that had not happened.
 *   SETTLE forces a row that is PARTLY done to one of three fates — validate it finished, split it
 *          so the unfinished parts can be worked, or ask him. His pass, added after he read the
 *          spec's first draft; REAP catches wholly-dead rows and RANK orders wholly-live ones, and
 *          before this a half-done row drifted between them AND was described to him as finished.
 *   RANK   orders the open list from signals derived entirely from the repo, and gives every row a
 *          `why-now:` phrase — because an order he cannot read is an order he cannot overrule.
 *   SWEEP  moves done rows older than seven days into `.planning/CHART-LOG.md`, leaving a one-line
 *          stub.
 *          ⚠ THIS IS THE DESIGN HE OVERRULED — see the 🛑 banner in `.planning/SPEC-CHARTKEEPER.md`.
 *          His ruling: EVERY completed row leaves, immediately, with NO stub. It is still the
 *          seven-day version here because the change cannot land alone: `glass.mjs` derives his
 *          "done" count by counting `- [x]` rows in the Chart, so sweeping them all takes his page
 *          to "0 done".
 *          ⚠ THAT CITATION USED TO READ `glass.mjs:392` AND WENT STALE THE SAME DAY IT WAS WRITTEN —
 *          the three-fate-states change moved the done-count derivation and 392 is now
 *          `COMMITTED_WORDS`. Caught by CEO 105. **A line number in a comment is a claim that rots
 *          the moment anyone edits above it**, which is why the reference is now to the FILE and the
 *          BEHAVIOUR ("counts `- [x]` rows") — both of which survive an edit. Grep for the behaviour,
 *          not the line.
 *          ⚠ AND THE OTHER HALF OF THE OLD SENTENCE IS ALSO DEAD, so it is corrected rather than
 *          left: it said `glass.mjs` is VENDORED and therefore out of an unattended watch's reach.
 *          Wyatt inverted `vendor_check` on 2026-09-02 — the project copy is now the truth — so
 *          **glass.mjs is editable here and this is no longer blocked.** What remains is only the
 *          ORDER: re-source the done count from `CHART-LOG.md` first, then sweep. Filed in
 *          `.planning/wyclau/PENDING-KIT-PATCHES.md` as patch 6.
 *
 * WHERE IT RUNS (the spec's split, and the split is the point): SETTLE, RANK and SWEEP in the
 * WATCH, which has write authority and a CEO gate — arithmetic can act unattended. REAP in report
 * mode in the Glass-update session, which is the only session that reads his live page — judgement
 * belongs where a human is looking.
 *
 * USAGE
 *   node scripts/wyclau/chartkeeper.mjs                             # report on all four, touch nothing
 *   node scripts/wyclau/chartkeeper.mjs --reap --json               # the Glass-update session's pass
 *   node scripts/wyclau/chartkeeper.mjs --settle --rank --sweep --write   # the Watch's pass
 *   --chart=<path> --log=<path> --inbox=<path> --now=<iso>          # for gates and fixtures
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ID_RE, bodyOf, chunk, dropSection, idOfRow, openHandleCarriers, overlap, parseChart,
  replaceSection, rowIsOpenAt, rowKey, section, tableRows, titleOf, tokens,
} from "./lib/chart_model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const abs = (p) => (isAbsolute(p) ? p : resolve(ROOT, p));

const CHART = abs(opt("chart", join(ROOT, ".planning", "CHART.md")));
const LOG = abs(opt("log", join(ROOT, ".planning", "CHART-LOG.md")));
const INBOX = abs(opt("inbox", join(ROOT, ".planning", "wyclau", "INBOX.md")));
/* The archive, read fresh every time rather than cached: the write pass appends to it mid-run, and
   a stale copy would be a record of the file as it was before this very sweep. */
const archiveText = () => (existsSync(LOG) ? readFileSync(LOG, "utf8") : "");
const NOW = new Date(opt("now", new Date().toISOString()));
const JSON_OUT = flag("json");
const WRITE = flag("write");
// No pass named means all three, in report mode — the safe default for a session that just looks.
const anyPass = flag("reap") || flag("settle") || flag("rank") || flag("sweep");
const DO = {
  reap: !anyPass || flag("reap"),
  settle: !anyPass || flag("settle"),
  rank: !anyPass || flag("rank"),
  sweep: !anyPass || flag("sweep"),
};

if (!existsSync(CHART)) {
  console.error(`chartkeeper: no Chart at ${CHART}`);
  process.exit(2);
}
const original = readFileSync(CHART, "utf8");

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   HIS INTERRUPT — "DO NOW". ONE SLOT, AND THE WRITE IS WHAT ENFORCES IT.

   Wyatt, Glass, 2026-09-02 3:09 PM ET: "Do Now: in the Glass, Add a \"DO now\" button next to
   \"Send to the Chart\" button that tells RANK to put this task at the top". And his design, the
   same day: "i need a way to say DO THIS NOW such that RANK puts it at the top".

   ⚠ THE DESIGN CONSTRAINT IS HIS AND IT IS THE WHOLE REASON THIS IS A COMMAND AND NOT A FIELD
   ANYONE MAY TYPE: "ONE SLOT, NOT A QUEUE. Ticking it on a second item must displace the first,
   deliberately. An interrupt with a queue is just another backlog, which is the fault this whole
   design removes." A rule saying "clear the old one first" is a rule somebody skips at 3am. So
   the pin and the release happen in ONE act — read, modify, write — and the only way to reach two
   pins is to hand-edit the file, which the refusal below fails the build on.

   WHY IT IS A HEAD FIELD AND NOT A NEW FILE: the Chart is the record, `⟨…⟩` head lines already
   carry `needs:` and `size:`, and `glass.mjs` renders the row he must be able to SEE it on. A
   marker kept anywhere else is a second thing to keep in step with the first (rule 23).
   ───────────────────────────────────────────────────────────────────────────────────────────── */
const HEAD_ANY = /^(\s*)⟨([^⟩]*)⟩(\s*)$/;
const headIsPinned = (inner) => /(?:^|·)\s*now\s*:\s*yes\b/i.test(inner);
const headUnpin = (inner) => inner
  .replace(/\s*·\s*now\s*:\s*yes\b/gi, "")
  .replace(/^\s*now\s*:\s*yes\s*·?\s*/i, "")
  .trim();
const headPin = (inner) => `${headUnpin(inner)} · now: yes`;
const headHandle = (inner) => (/T-\d{3}/.exec(inner) || [])[0] ?? null;
/* A pin belongs on an OPEN row. Scanning back to the nearest checkbox is how this file already
   decides what a head line belongs to, and it means a pin can never be parked on finished work. */
/* ⛔ THE ELEVEN-LINE WINDOW IS ACTUALLY GONE NOW, AND THE FIRST FIX ONLY CLAIMED IT WAS.
   `T-122` routed `--order=` through the shared rule and left THIS on its own window, so
   `--do-now` and the pinned count went on using it while two files said it had been removed.
   CEO 165 measured the consequence on a marker 14 lines below its checkbox: `--order=T-608`
   exit 0, `--do-now=T-608` exit 2 "no OPEN row carries the handle". **Two subcommands
   disagreeing about the same row, and the losing one is his DO NOW pin.**
   Now a thin alias over the shared walk, kept only so the three call sites below read the same. */
const headIsOpen = (lines, i) => rowIsOpenAt(lines, i);

{
  const wanted = opt("do-now", null);
  const clearing = flag("do-now-clear");
  if (wanted !== null || clearing) {
    const lines = original.split("\n");
    const want = wanted === null ? null : String(wanted).replace(/[`\s]/g, "");
    let target = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = HEAD_ANY.exec(lines[i]);
      if (m && want && headHandle(m[2]) === want && headIsOpen(lines, i)) target = i;
    }
    if (want && target === -1) {
      console.error(`chartkeeper --do-now: no OPEN row on ${CHART} carries the handle ${want}. Nothing was marked.`);
      console.error("  Refusing rather than silently doing nothing: an interrupt he cannot see is");
      console.error("  indistinguishable from one that was ignored, and that is the fault this exists to remove.");
      process.exit(2);
    }
    let released = 0;
    const out = lines.map((l, i) => {
      const m = HEAD_ANY.exec(l);
      if (!m) return l;
      if (i === target) return `${m[1]}⟨${headPin(m[2])}⟩${m[3]}`;
      if (headIsPinned(m[2])) { released++; return `${m[1]}⟨${headUnpin(m[2])}⟩${m[3]}`; }
      return l;
    });
    writeFileSync(CHART, out.join("\n"));
    if (target > -1) {
      console.log(`DO NOW  ${want} is now the top of the list — RANK puts it first until it is taken or released.`);
      if (released) console.log(`        released ${released} earlier pin: one slot, not a queue, so an interrupt stays an interrupt.`);
      console.log("        A watch takes it, then runs:  node scripts/wyclau/chartkeeper.mjs --do-now-clear");
    } else {
      console.log(released ? `DO NOW  released — the slot is empty again.` : `DO NOW  nothing was pinned; the slot was already empty.`);
    }
    process.exit(0);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   HIS ORDER — "DRAG TO REPRIORITIZE". THE WHOLE LIST, NOT ONE SLOT.

   Wyatt, Glass, 2026-09-02 3:09 PM ET: "DO NOW: build a way for me to drag to reprioritize the
   chart, in The Glass."

   ⚠ THIS IS NOT A SECOND DO NOW AND MUST NEVER BE COLLAPSED INTO ONE. The pin above is his
   INTERRUPT — one slot, deliberately, because "an interrupt with a queue is just another backlog".
   A drag is the opposite act: he is telling this tool the SEQUENCE he wants the list worked in.
   One is "this, now"; the other is "and then these, in this order". Trying to serve both from one
   boolean is how the pin would quietly become the backlog his own constraint forbids.

   WHY IT IS THE SAME HEAD LINE AND NOT A NEW FILE — the identical reasoning as the pin: the Chart
   is the record, `⟨…⟩` already carries `needs:`, `size:` and `now:`, and `glass.mjs` renders the
   row so he can SEE where it landed. A separate order file is a second thing kept in step with the
   first by nobody (rule 23).

   ONE ACT, for the same reason the pin is: `--order=` clears every existing `order:` field and
   writes 1..N onto the rows named, in that sequence, in a single read-modify-write. There is no
   "add to the order" and no "clear the old one first" — a rule like that is a rule somebody skips.
   ───────────────────────────────────────────────────────────────────────────────────────────── */
const headOrder = (inner) => {
  const m = /(?:^|·)\s*order\s*:\s*(\d{1,3})\b/i.exec(inner);
  return m ? Number(m[1]) : null;
};
const headUnorder = (inner) => inner
  .replace(/\s*·\s*order\s*:\s*\d{1,3}\b/gi, "")
  .replace(/^\s*order\s*:\s*\d{1,3}\s*·?\s*/i, "")
  .trim();
const headSetOrder = (inner, n) => `${headUnorder(inner)} · order: ${n}`;

{
  const wanted = opt("order", null);
  const clearing = flag("order-clear");
  if (wanted !== null || clearing) {
    const lines = original.split("\n");
    const want = wanted === null ? [] : String(wanted)
      .split(",").map((h) => h.replace(/[`\s]/g, "")).filter(Boolean);
    /* A HANDLE HE DRAGGED THAT LANDS NOWHERE IS REFUSED, AND NOTHING IS WRITTEN. Same refusal as
       the pin's, for the same reason in his own words' consequence: an instruction he cannot see
       land is indistinguishable from one that was ignored. Partial application would be worse than
       either — he would get an order that is his in places and ours in the rest, with nothing
       saying which. */
    /* ⚑ ONE DEFINITION OF "WHO OPENLY CARRIES THIS HANDLE", SHARED WITH THE PAGE — `T-122`.
       This loop used to be its own: `headIsOpen`'s eleven-line window, counted here, while
       `glass.mjs:572` counted duplicates its own way to decide what he may drag. **A handle those
       two disagreed about is the page offering a gesture this command then refuses whole, and
       telling him it saved.** Rule 23's question — what makes these two agree? — answered
       "nothing" until this import.
       MEASURED BEFORE CONVERGING rather than assumed compatible: both rules produced the identical
       set on both live charts (22 and 26, zero seen by one and not the other), so this is one rule
       that had been written twice, not two rules being flattened into one. */
    const carriersAt = openHandleCarriers(original);
    const slotOf = new Map([...carriersAt].map(([h, at]) => [h, at[0]]));
    const carriers = new Map([...carriersAt].map(([h, at]) => [h, at.length]));
    const missing = want.filter((h) => !slotOf.has(h));
    const dupes = want.filter((h, i) => want.indexOf(h) !== i);
    /* ⚠ AND THE ONE THIS CHART CAN ACTUALLY PRODUCE TODAY: a handle carried by TWO open rows.
       `--rank` already warns about it (three pairs on the live Chart as this was written), and the
       warning is right that nothing may be claimed from such a mention. A drag is worse than a
       mention — silently ordering the wrong row is exactly the mis-attribution that fault causes,
       and he would never know which of the two he had moved. */
    const ambiguous = [...new Set(want.filter((h) => (carriers.get(h) ?? 0) > 1))];
    if (missing.length || dupes.length || ambiguous.length) {
      if (missing.length) console.error(`chartkeeper --order: no OPEN row on ${CHART} carries ${missing.join(", ")}.`);
      if (dupes.length) console.error(`chartkeeper --order: ${dupes.join(", ")} appears more than once — an order is a sequence, not a bag.`);
      if (ambiguous.length) console.error(`chartkeeper --order: ${ambiguous.join(", ")} is carried by MORE THAN ONE open row — ordering one of two rows nobody can tell apart would move the wrong task and say nothing. Give one of each pair a new handle first.`);
      console.error("  NOTHING was written. A partly-applied order is his in places and ours in the rest,");
      console.error("  with nothing on the page saying which — worse than refusing outright.");
      process.exit(2);
    }
    const at = new Map(want.map((h, i) => [slotOf.get(h), i + 1]));
    let released = 0;
    const out = lines.map((l, i) => {
      const m = HEAD_ANY.exec(l);
      if (!m) return l;
      if (at.has(i)) return `${m[1]}⟨${headSetOrder(m[2], at.get(i))}⟩${m[3]}`;
      if (headOrder(m[2]) !== null) { released++; return `${m[1]}⟨${headUnorder(m[2])}⟩${m[3]}`; }
      return l;
    });
    writeFileSync(CHART, out.join("\n"));
    if (want.length) {
      console.log(`ORDER   ${want.length} row(s) carry your order — RANK works them in that sequence: ${want.join(" → ")}`);
      if (released) console.log(`        cleared ${released} row(s) from the previous order: one order, replaced whole, never merged.`);
      console.log("        Anything you did not move keeps its derived rank, underneath yours.");
    } else {
      console.log(released ? `ORDER   cleared — ${released} row(s) released, the list is derived again.` : `ORDER   nothing was ordered; there was nothing to clear.`);
    }
    process.exit(0);
  }
}

/* TWO PINS CANNOT BE PRODUCED BY THE COMMAND ABOVE, SO TWO PINS MEAN A HAND EDIT — and a hand edit
   is what this record keeps losing to. Fail the build, name both, and do not guess which he meant. */
{
  const lines = original.split("\n");
  const pinned = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEAD_ANY.exec(lines[i]);
    if (m && headIsPinned(m[2]) && headIsOpen(lines, i)) pinned.push(headHandle(m[2]) ?? `line ${i + 1}`);
  }
  if (pinned.length > 1) {
    console.error(`chartkeeper: ${pinned.length} rows carry DO NOW — ${pinned.join(", ")}.`);
    console.error("  His interrupt is ONE SLOT by design; two of them is just another backlog, and nothing");
    console.error("  here may guess which one he meant. Re-pin the one that is still urgent:");
    console.error(`    node scripts/wyclau/chartkeeper.mjs --do-now=${pinned[0]}`);
    process.exit(3);
  }
}

/* ⚠ THE KEEPER'S OWN OUTPUT IS STRIPPED BEFORE IT READS ANYTHING. Found by the gate, not by
   reasoning, and it is the sharpest thing in this file: the first version appended a flag reading
   "measured on build 2000.01.01.1; the tree is 2026.09.01.8" — and on the NEXT run the probe found
   the tree's own stamp in the row it had just annotated, concluded the evidence was current, and
   silently withdrew the flag. A row would flap between flagged and clear forever, and CHART.md
   would change on every single watch, conflicting on every push.
   THE GENERAL FORM, which is worth more than the bug: an instrument that writes into the thing it
   measures is measuring itself one run later. So the flags are treated as pure OUTPUT — removed
   from the input, re-derived from scratch every run, and re-attached on the write. A flag that
   stops being true therefore disappears on its own, with nobody having to remember to delete it. */
const STALE_MARK = "⚠ STALE-CANDIDATE —";
const SETTLE_MARK = "⚑ SETTLE —";
const isFlagLine = (l) => l.includes(STALE_MARK) || l.includes(SETTLE_MARK);
const input = original.split("\n").filter((l) => !isFlagLine(l)).join("\n");
let text = input;

/* ── THE TREE'S OWN FACTS. Everything REAP and RANK judge against is read here, once, from the
   repo — never from a stored list. Rule 9: a hand-kept list of what to guard rots exactly like the
   thing it guards. ── */
const treeStamp = (() => {
  try {
    return (/PP4_STAMP\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "src", "ui", "stage.js"), "utf8")) || [])[1] ?? null;
  } catch { return null; }
})();
/* HIS OWN RECORDS — the Inbox, entry by entry, with each entry's id and whether it is still live.
 *
 * ⚠ THIS USED TO BE A BAG OF WORDS AND THE BAG WAS LYING TO HIM. Until 2026-09-02 this read one
 * token-set per entry and RANK counted how many of them overlapped a row by four distinctive words
 * or more, then printed the count at him as "you have raised it N times". Measured on the real
 * Chart, it told him he had raised the `can_push` row — a tool fault a session found, which he has
 * never once mentioned — **ten times**; its ten "matches" were entries about the Advisor being
 * record-only, a destroyed note, and the change-gate verdict. In the same pass the trade-offer
 * circle, which has three recorded sightings, read "raised it once", and the one entry it matched
 * was about judging screenshots.
 *
 * THE DIAGNOSIS THAT LOOKED OBVIOUS WAS WRONG, and it is recorded because it is the useful half:
 * it was NOT tracking row length — the 900-character cap flattens that out, and a 4,695-character
 * row scored 1 while a 487-character one scored 5. It was tracking SHARED PROCESS VOCABULARY. Rows
 * about the watch/trial machinery matched the many Inbox entries about the watch/trial machinery.
 * The signal measured "is this row about the same subsystem as most of his recent notes" and
 * reported it as "you raised this N times". **A number he cannot check is worse than no number**,
 * because the order on his page is the thing he steers by.
 *
 * So the link between a row and his words is now a CITATION that has to RESOLVE, in either
 * direction: the row names an `INBOX-<stamp>` that really exists, or an entry names the row's
 * `T-nnn` handle. It under-counts — a row nobody has cited claims nothing — and that is the safe
 * direction, because the failure of the old signal was over-claiming. */
const inboxEntries = (() => {
  try {
    const raw = readFileSync(INBOX, "utf8");
    return raw.split(/^## (?=INBOX-)/m).slice(1).map((b) => {
      const id = (/^INBOX-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*/.exec(b) || [])[0];
      const status = (/^status:\s*(.*)$/m.exec(b) || [])[1] ?? "";
      // Live = he is still owed something. A DONE or PARKED entry is a real citation (he did raise
      // it) but it is not an outstanding instruction, so it never buys the approval bonus.
      return { id, body: b, live: !/^\s*\**\s*(DONE|PARKED)\b/i.test(status) };
    }).filter((e) => e.id);
  } catch { return []; }
})();
/* ⚠ ONE ID CAN NAME TWO OF HIS NOTES, AND `new Map(pairs)` HIDES THAT. This was
 * `new Map(entries.map(e => [e.id, e]))`, which keeps the LAST pair for a repeated key and says
 * nothing — so whichever note he happened to type SECOND decided, for both of them, whether a
 * citation of that stamp counts as an outstanding instruction worth +100. CEO 94 found the real
 * instance: `INBOX.md` carried two different entries under `INBOX-20260902T05xxZ` until the watch
 * that wrote this gave the second one its own stamp (`-a`). **Past tense on purpose** — the first
 * version of this sentence was written in the present, and this watch's own next commit made it
 * false in two files (CEO 95).
 *
 * SIZED HONESTLY, BECAUSE THE MEASUREMENT CAME FIRST: on 2026-09-02 both colliding entries were
 * open and no row cited that stamp, so **nothing on his page was wrong**. The defect is that the
 * answer was UNGROUNDED — it turned on file order, which is the same fault as reading a row's own
 * prose about itself. It is fixed here rather than left because the day a row cites that stamp,
 * nothing would say so.
 *
 * TWO RULES, and both are this file's existing ones applied to its own inputs:
 *   UNDER-CLAIM WHEN AMBIGUOUS — an id naming two notes only counts as live when EVERY note under
 *   it is live. We cannot tell which one the row meant, and over-claiming is the failure the whole
 *   grounding pass was written to end.
 *   FLAG, NEVER ABSORB — the duplicate is a fault in HIS record and can only be repaired in
 *   `INBOX.md`, so the report names it. A reader that silently copes makes the collision permanent. */
const inboxById = (() => {
  const m = new Map();
  for (const e of inboxEntries) {
    const prev = m.get(e.id);
    if (prev) prev.push(e);
    else m.set(e.id, [e]);
  }
  return m;
})();
const ambiguousInboxIds = [...inboxById].filter(([, es]) => es.length > 1).map(([id]) => id);
/** True only when every entry sharing this id is still live. See the two rules above.
 *  The length guard is DEFENCE IN DEPTH, and saying so is the point: `[].every()` is TRUE, so an
 *  unknown id would come back live from this function alone. What actually stops a citation of a
 *  stamp in no Inbox (gate case 11b) is the caller's own `inboxById.has(id)` filter in `linksOf`,
 *  which means this guard is unreachable today. **The first version of this comment credited the
 *  guard with holding case 11b up. It does not** — CEO 95 traced the caller and found the claim
 *  asserted rather than followed, which is CEO 94's finding in new clothing. The guard stays,
 *  because a second caller would arrive without that filter and nothing would say so. */
const idIsLive = (id) => {
  const es = inboxById.get(id) ?? [];
  return es.length > 0 && es.every((e) => e.live);
};

/* HIS RULINGS, from the Chart's own two tables. The `item` cell of every row of `## RULED` and
 * `## SETTLED RULINGS` — the record a harvest writes when he taps a ruling on the Glass.
 *
 * ⚠ THIS EXISTS BECAUSE THE FIRST VERSION ASSERTED A GATE DOES SOMETHING IT DOES NOT. That version
 * credited any row whose title begins `Your ruling:` and said, in this file and in
 * `chartkeeper_check.mjs`, that `scripts/qa/rulings_triage_check.mjs` "keeps the tag matched to a
 * real settled ruling" and so "makes the tag a pointer rather than an assertion". **It does not.**
 * That gate walks one direction only — rulings → rows, asking whether every owing settled ruling
 * has a task row (`rulings_triage_check.mjs:92-98`). It never asks whether a `Your ruling:` row
 * corresponds to any ruling. CEO 94 measured it: a row titled *"Your ruling: repaint the bilge
 * pump widget"*, on a Chart with EMPTY rulings tables, scored 100.
 * **That is rule 6 exactly — a claim about what an instrument does, believed from its header
 * rather than measured** — and it was written one commit after being caught for putting an
 * unmeasured behavioural claim in a comment. So the tag now has to RESOLVE, here, against the
 * table it names. */
const rulingItems = (src) => ["RULED", "SETTLED RULINGS"].flatMap((h) => (section(src, h) ?? "")
  .split("\n")
  .filter((l) => l.startsWith("|") && !/^\|\s*item\b/i.test(l) && !/^\|\s*:?-+/.test(l))
  .map((l) => (l.split("|")[1] ?? "").trim())
  .filter(Boolean));

/* A row's LINKS to his records, and the only thing that may ever be read as his approval.
 *   cited      — `INBOX-<stamp>` ids in the row that resolve to a real entry
 *   live       — of those, the ones he is still owed
 *   backRef    — entries that name this row's `T-nnn` handle: the same link, from his side
 *   taggedClaim— the row wears the Chart's own `Your ruling:` prefix. A CLAIM, not yet a pointer;
 *                `score()` only credits it once it resolves against `rulingItems` above.
 * Deliberately NOT here: anything else the row says about itself. */
const linksOf = (row) => {
  const cited = [...new Set(row.raw.match(/\bINBOX-[0-9A-Za-z]+(?:-[0-9A-Za-z]+)*/g) || [])]
    .filter((id) => inboxById.has(id));
  const backRef = row.id ? inboxEntries.filter((e) => e.body.includes(row.id)).map((e) => e.id) : [];
  return {
    cited,
    live: cited.filter((id) => idIsLive(id)),
    raised: new Set([...cited, ...backRef]),
    taggedClaim: /^Your ruling:/i.test(row.title),
  };
};
/* The tag resolves when some ruling of his shares two distinctive words with the row's title. Two
   is deliberately low: `rulings_triage_check.mjs` uses the mirror of this test in the other
   direction with three words, and over-crediting here costs a wrong order while under-crediting
   hides work he has already approved. Both errors are visible in the report. */
const tagResolves = (row, ruleTokens) => ruleTokens.some((t) => overlap(t, tokens(row.title)) >= 2);

/* WHAT A ROW SAYS ABOUT ITSELF. Kept for one purpose only — REPORTING. Eight rows on the real
   Chart CLAIM his approval in their own prose; four of them cite nothing that resolves and are the
   ones named. Some of those claims are TRUE and merely uncited. Dropping them in silence would
   make his genuinely-approved work sink with nothing to show why, so the tool names them instead.
   REAP's own rule turned on itself: flag, never act silently.
   *(The first version of this comment said "eight rows … do exactly that", conflating the eight
   who claim with the four who cite nothing. The tool's own report says four. Corrected in the
   open, because a behavioural claim in a comment is the mistake this file keeps making.)* */
const CLAIMS_APPROVAL = /\bruled YES\b|\bhe ruled\b|\bhis ruling\b|\byour ruling\b|\bat his instruction\b|\bhis instruction\b|\bhe asked for this\b/i;

const pidAlive = (pid) => {
  // process.kill(pid, 0) is the portable liveness probe; EPERM means the process exists and is
  // simply not ours. `tasklist` is refused by this machine's sandbox, so this is the only route.
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 1 — REAP. Ask the WORLD a question about the row's pointer; never read a stored flag.
   Each probe returns `{ fault, text }` or null. A row with no pointers in it can never be flagged,
   which is how the Chartkeeper is able to say "the Chart is fine" (guardrail 4).

   ⚠ EVERY PROBE NAMES ITS OWN FAULT, AND UNTIL 2026-09-02 NONE OF THEM DID — they returned bare
   sentences that were joined with "; " and filed under one word, "stale". Wyatt read the
   consequence on his own page and asked about it: *"do you want to put those in the Your Call
   section so I can approve/deny them being closed?"* Measured against the real Chart the same
   hour: **ten rows carried that one label and not one of them was flagged "finished"** — six had
   evidence that went stale when the build moved on (they need RE-MEASURING, which is a watch's job
   and mostly a screenshot), three were rows his ruling had freed, one cited a dead pid. **He
   cannot act on a flag that means three things, and neither can we**: the Advisor repeated the
   lumped sentence back to him as fact and it was wrong for six of the ten.
   The kinds exist inside this loop; the fault was that they died on the way out. `T-090`.

   ⚠ A PROBE'S SUBJECT IS NO LONGER ALWAYS A WHOLE ROW, AND THAT IS THE ENABLING CHANGE FOR SETTLE.
   The spec's detection rule for a half-done row is *"REAP's derived questions come back TRUE for
   some and not others"* — so the same probes have to be askable of ONE PART of a row. A subject is
   therefore `{ raw, context, title }`:
     raw      the text whose POINTERS are being judged — a whole row, or one part of it
     context  the text used for WORD MATCHING only, which for a part is the part PLUS the row's
              first line. Without that a three-word part has too few distinctive words to match a
              question against, and every part would come back looking abandoned. The two are
              deliberately separate: widening `raw` instead would let a pointer in the row's
              preamble be credited to every part under it.
   Rule 23: one set of probes, two kinds of subject — never a second copy for parts.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const PROBES = [
  /* HIS ANSWER LANDED AND NOBODY MOVED THE ROW.
   *
   * ⚠ THIS PROBE USED TO BE DERIVED FROM AN ABSENCE, AND THAT IS WHAT PUT `npm test` RED ON
   * 2026-09-02. It read `/BLOCKED ON WYATT/i.test(sub.raw)` — a prose-grep for a SECTION HEADING
   * inside a row's own body — and then declared the row stale if no question in the table shared
   * three five-letter words with it. Over a 900-character row, three shared words is noise, so the
   * verdict turned on what somebody else had most recently typed into HIS table. Measured: another
   * session added two good, unrelated questions, and his own four-times-asked Chartkeeper row went
   * from ranking FIRST at 156 to 31st at −984 with not a character of it changed. Two rows that
   * merely QUOTE the heading — one of them the row filed to describe this very defect — went with
   * it. `score()`'s −1000 hung on the same test; both are now derived from the same positive fact.
   *
   * THE FACT: a row of one of his tables NAMES this row's `T-nnn` handle. Live table ⇒ he is being
   * asked and `score()` sinks it. SETTLED table ⇒ his answer is in and the row never moved ⇒ this
   * flag. Neither ⇒ nothing is claimed, and `unattachedMentions` names the row so the link can be
   * written down. The link lives on HIS side, in the question, which is what makes it unfakeable by
   * a row's own prose — the same reason `linksOf`'s `backRef` reads his Inbox and not the row.
   *
   * WHOLE ROWS ONLY. An attachment is a property of a ROW, so a part of a bundle must not inherit
   * it — otherwise every part of a settled row derives "finished" at once and SETTLE proposes a
   * close for work nobody did. */
  function hisAnswerLanded(sub, ctx) {
    if (!sub.whole || !sub.id) return null;
    if (ctx.blockedNaming(sub.id).length) return null;
    const settled = ctx.settledNaming(sub.id);
    if (!settled.length) return null;
    return { fault: "answered", text: `your answer landed — ${settled[0].cells[1] ?? settled[0].cells[0]} — and nothing moved this row` };
  },
  /* ⚑ HIS RULING FREED THIS ROW — WHICH IS A DIFFERENT FACT FROM "HE ANSWERED IT", AND CONFLATING
   * THE TWO IS `T-090`.
   *
   * The probe above only counts a link Wyatt's own question cell carries. That is the right rule for
   * "he answered this" and it is deliberately strict, because getting it wrong puts a settled
   * question back in front of him — the fault he was furious about on 2026-09-02.
   *
   * But a ruling's THIRD cell — the commentary a session writes when it applies his answer — often
   * names the rows the answer unblocked, and that is real, useful information: a row whose blocker
   * has just lifted is the cheapest thing on the list to pick up. Throwing it away to fix the
   * mis-attribution would have sunk `T-085` (a two-minute edit he is waiting on) from rank 7 to
   * nowhere. So it is kept, and told apart: **answered ⇒ close it; freed ⇒ do the work.**
   *
   * ⚠ AND AN AMBIGUOUS HANDLE CLAIMS NOTHING. Handles are reused in practice — `T-078` is a closed
   * row in `CHART-LOG.md` and a live row on the Chart at the same time — so a ruling's mention of
   * one names two different jobs. On 2026-09-02 that mis-flagged the `<img>` recurrence row with a
   * ruling about whether a watch may read the claude-kit folder, and under the Your Call proposal
   * that row would have been put to Wyatt as a question he has never been asked. Failing toward NO
   * CLAIM is the only safe direction: `ctx.handleIsAmbiguous`. */
  function hisRulingFreedThis(sub, ctx) {
    if (!sub.whole || !sub.id) return null;
    if (ctx.blockedNaming(sub.id).length) return null;
    if (ctx.settledNaming(sub.id).length) return null;   // already the stronger claim above
    if (ctx.handleIsAmbiguous(sub.id)) return null;
    const freeing = ctx.settledFreeing(sub.id);
    if (!freeing.length) return null;
    return { fault: "unblocked", text: `your ruling — ${freeing[0].cells[1] ?? freeing[0].cells[0]} — freed this row, and the work is still to do` };
  },
  function reportNeverWritten(sub) {
    const cited = sub.raw.match(/[.\w/-]*SEA-TRIAL[\w.-]*\.md/g) || [];
    const missing = cited.map((c) => c.replace(/^`|`$/g, "")).filter((c) => !existsSync(abs(c.startsWith(".planning") ? c : join(".planning", c))));
    return missing.length ? { fault: "dead-pointer", text: `cites a trial report that is not on disk: ${missing[0]}` } : null;
  },
  function pidLongDead(sub) {
    const m = /\bpid\s+(\d{2,7})\b/i.exec(sub.raw);
    if (!m) return null;
    return pidAlive(Number(m[1])) ? null : { fault: "dead-pointer", text: `warns readers off on account of pid ${m[1]}, which is not running` };
  },
  function evidenceRetired(sub) {
    if (!treeStamp) return null;
    const stamps = [...new Set(sub.raw.match(/\b20\d\d\.\d\d\.\d\d\.\d+\b/g) || [])];
    if (!stamps.length) return null;
    const older = stamps.filter((s) => s < treeStamp);
    if (!older.length || stamps.includes(treeStamp)) return null;
    return { fault: "stale-evidence", text: `measured on build ${older[0]}; the tree is ${treeStamp}, so its evidence no longer describes this game` };
  },
  function supersededByAnotherRow(sub, ctx) {
    const mine = tokens(sub.title);
    for (const other of ctx.openItems) {
      if (other.title === sub.title) continue;
      const m = /supersedes ([^.*)\n]{6,80})/i.exec(other.raw);
      if (!m) continue;
      if (overlap(tokens(m[1]), mine) >= 2) return { fault: "superseded", text: `superseded — the row "${other.title.slice(0, 60)}" says in its own text that it supersedes this` };
    }
    return null;
  },
];

/* THE FIVE FAULTS, EACH WITH THE OWNER IT ROUTES TO, WRITTEN ONCE AND READ BY EVERYTHING — the
   report, the flag stamped into his Chart, the ranking sentence, and the line his page shows him.
   Rule 23: the label he reads and the label the tool sorts by are ONE label, or they will drift and
   his page will mean something the tool does not.

   `owner` is what a watch does about it. `note` is the sentence for HIS page, in the second person,
   and it is deliberately not the same words as `owner` — he is being told what is happening, not
   given a work order. */
const FAULTS = {
  answered:         { owner: "close it (he already answered)", note: (n) => `${n} ${n === 1 ? "task has" : "tasks have"} your answer on the record and never moved — a watch closes ${n === 1 ? "it" : "them"}.` },
  unblocked:        { owner: "do the work (his ruling freed it)", note: (n) => `${n} ${n === 1 ? "task was" : "tasks were"} freed by your rulings and the work is still to do — a watch picks ${n === 1 ? "it" : "them"} up.` },
  "stale-evidence": { owner: "re-measure it on this build", note: (n) => `${n} ${n === 1 ? "task was" : "tasks were"} measured on an older build, so nobody knows yet whether ${n === 1 ? "it is" : "they are"} still broken — a watch re-measures ${n === 1 ? "it" : "them"}; not yours to answer.` },
  "dead-pointer":   { owner: "correct the text (it points at something gone)", note: (n) => `${n} ${n === 1 ? "task points" : "tasks point"} at a file or a process that is gone — a watch corrects the wording.` },
  superseded:       { owner: "close it (another row replaced it)", note: (n) => `${n} ${n === 1 ? "task has" : "tasks have"} been replaced by another row — a watch closes ${n === 1 ? "it" : "them"}.` },
};
const FAULT_ORDER = ["answered", "unblocked", "superseded", "dead-pointer", "stale-evidence"];
/* The same five faults as the phrase RANK puts beside a row on his page. Kept beside `FAULTS` so
   nobody can add a sixth fault and leave the ranking still saying "something it was waiting on has
   landed" about it. */
const FAULT_WHY = {
  answered: "you already answered this and nothing moved",
  unblocked: "your ruling freed it and the work is still to do",
  superseded: "another row says it replaces this",
  "dead-pointer": "what it points at is gone",
  "stale-evidence": "its evidence was measured on an older build",
};

const HEAD = /⟨([^⟩]*)⟩/;
const HEAD_LINE = /^\s*⟨[^⟩]*⟩\s*$/;
/* ⚠ THIS READ `row.lines[0]` UNTIL 2026-09-02, AND ON THIS CHART THAT LINE NEVER HOLDS A HEAD.
   The head goes on its OWN line underneath — CEO 91's ruling, because the first line is the one
   Wyatt reads on his phone and nothing machine-readable may live in it. So `headField` was looking
   at the one line the head is guaranteed not to be on, and **both signals that use it — `needs:`
   (sink a row that is waiting on him) and `size:` (small first, so the queue drains) — have never
   once fired.** Not wrong answers: no answers, silently, on every row of every run.
   Nothing caught it because a dead signal produces a plausible ranking; it surfaced only when his
   DO NOW pin became the first head field anything actually wrote. Now it reads the head wherever
   the head is, which is the same line `idOfRow` takes the handle from. */
const headField = (row, name) => {
  for (const line of row.lines) {
    const m = HEAD.exec(line);
    if (!m) continue;
    const f = new RegExp(`(?:^|·)\\s*${name}\\s*:\\s*([^·⟩]+)`).exec(m[1]);
    if (f) return f[1].trim();
  }
  return null;
};

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 2 — SETTLE. A HALF-DONE ROW IS NOT ALLOWED TO STAY HALF-DONE.

   WYATT ADDED THIS PASS HIMSELF after reading the spec's first draft, and his sentence is the
   whole specification: *"Half-Stale items should be prioritized to be either validated as
   finished, worked on until finished, or in the worst case, i should be asked if I am satisfied
   with their state."*

   THE HOLE IT PLUGS. REAP catches rows that are wholly dead. RANK orders rows that are wholly
   live. A row that is PARTLY satisfied falls between them and drifts in the middle of the list
   forever — and worse than drifting, it gets MISDESCRIBED: one dead pointer anywhere in a bundle
   makes REAP flag the whole row, and RANK then tells Wyatt it "looks finished — needs a verdict,
   not work" while two thirds of it is untouched work. That is an instrument reporting a defect
   the Chart does not have, which is rule 6's own territory.

   ⚠ THIS PARAGRAPH SAID "and it is live on his page today" AND THAT WAS FALSE — corrected here
   rather than edited away, because it is exactly the mistake this file's own comments warn about.
   `whyNow` is printed to the console and nowhere else; it is never written into `CHART.md` and the
   Glass never renders it. What reaches Wyatt's page is the SCORE's effect on ORDER. The sentence
   is read by every session that runs this tool, which is worth fixing and is not the same claim.
   A comment that describes runtime behaviour rots; this one was wrong the day it was written.

   THE WORKED EXAMPLE IS THE BLADE HOUR: three jobs under one checkbox, one of them measurably
   done for days, the measurement filed 500 lines away, the row unmoved. **A bundled row can never
   be ticked** — that is the audit's own finding, and splitting is how a bundle becomes tickable.
   ──────────────────────────────────────────────────────────────────────────────────────────── */

/* A PART MARKER, and the reason it is a small list rather than a clever regex: these are the four
   shapes this Chart actually uses to enumerate ("(a)", "1.", "PART 1", "part 2:"). A looser rule
   starts finding parts inside ordinary prose, and a false split puts a row on his page that
   nobody wrote. When in doubt this pass finds NOTHING, which costs a drifting row; the other
   direction costs him a list he cannot trust. */
const PART_MARKER = /^\s*(?:\([a-z]\)|(?:PART|Part|part)\s+\d+|\d+\.)\s*[:.—-]?\s+/;

/** A row's checkable claims, derived from the row's own text and never from a flag.
 *  Two derivations, in this order, first one that yields at least two parts:
 *    1. BODY PART BLOCKS — a marked line plus its continuation. Each part has TEXT OF ITS OWN,
 *       so a split can carry the measurement onto the part it belongs to (`carriable`).
 *    2. FIRST-LINE `·` SEGMENTS — the Chart's own inline bundling shape. There is nothing to
 *       carry, which is exactly why a row like this ends up as a QUESTION for him instead of a
 *       split: a split with nothing in it is a worse answer than asking.
 */
function claimsOf(row) {
  const lines = row.lines;
  const blocks = [];
  for (let i = 1; i < lines.length; i++) {
    if (HEAD_LINE.test(lines[i]) || isFlagLine(lines[i])) continue;
    if (PART_MARKER.test(lines[i])) blocks.push([lines[i]]);
    else if (blocks.length) blocks[blocks.length - 1].push(lines[i]);
  }
  const clean = (s) => s.replace(/\*\*|~~|`/g, "").replace(/\s+/g, " ").trim();
  if (blocks.length >= 2) {
    return blocks.map((b) => ({
      // The part's own title is everything before its first em-dash — the Chart writes
      // "part 2: ring-test the Bell — nobody has done this", and the half before the dash is the
      // job while the half after it is the commentary.
      title: clean(b[0].replace(PART_MARKER, "")).split(/\s+—\s+|\s+--\s+/)[0].trim(),
      text: b.join("\n"),
      carriable: true,
    }));
  }
  const segs = lines[0].split(" · ");
  if (segs.length >= 3) {
    // segs[0] is the row's own headline, not a part of it.
    return segs.slice(1).map((s) => ({ title: clean(s), text: s, carriable: false }));
  }
  /* 3. FIRST-LINE COMMA LIST AFTER A COLON. Added after pointing this pass at the real Chart and
        watching it see NOTHING — including the Blade hour, which is the audit's own worked example
        of a bundled row. It writes its parts as "…: register the Bell, the ring test both
        directions, the O2 publish test — runbook …", which neither derivation above can see.
        THREE guards keep this off ordinary prose, and they are why it demands three parts rather
        than two: the list must follow a colon, must stop at the first em-dash (everything after it
        is commentary, not a job), and every part must be at least two words. A false split puts a
        row on his page that nobody wrote, which is far worse than a bundle that goes unnoticed. */
  /* ⚠ AND IT READS ACROSS THE LINE WRAP, which the first version did not. The Chart hard-wraps at
     about 100 characters, so the Blade hour's own list is cut in half — "…register the Bell, the
     ring test both" on line one and "directions, the O2 publish test" on line two. Reading only
     `lines[0]` found two parts where there are three, fell under the three-part guard, and saw
     nothing. A row's opening sentence is a sentence, not a line. */
  const flat = lines
    .filter((l) => !HEAD_LINE.test(l) && !isFlagLine(l))
    .join(" ").replace(/\s+/g, " ")
    .replace(/^- \[[ xX]\] /, "").replace(/^[-*] /, "");
  const opening = flat.split(/\s+—\s+|\s+--\s+/)[0].slice(0, 400);
  if (opening.includes(":")) {
    const parts = opening.slice(opening.indexOf(":") + 1).split(/,\s+/).map(clean)
      .filter((s) => { const w = s.split(/\s+/).length; return w >= 2 && w <= 12; });
    if (parts.length >= 3) return parts.map((s) => ({ title: s, text: s, carriable: false }));
  }
  return [];
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   ONE DERIVATION, RUN AS MANY TIMES AS THE FILE CHANGES. SETTLE is the first pass that ADDS rows,
   so everything downstream of it — the ids, the ranking, the slot arithmetic in the rewrite —
   would otherwise be reasoning about a file that no longer exists. Rather than patch the new rows
   into three separate structures and hope they stay in step (rule 23's exact failure), the whole
   derivation is a function and it is simply run again on the new text.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
function derive(src) {
  const parsed = parseChart(src);
  /* ⚑ THE OTHER CHARTS' BLOCKED ON WYATT — see `blockedNaming` below for why (`T-209`).
     DERIVED from the directory this run's chart sits in, never a second literal path: every
     `*CHART.md` beside it, excluding the one already parsed. Missing siblings, an unreadable file
     or a temp-dir fixture with one chart all mean "no others", which is the common case and not a
     fault — a hardcoded sibling that must exist would crash every gate that builds a fixture. */
  /* ⛔ THE ARCHIVE EXCLUSION IS AN EXCLUSION NOW, AND IT USED TO BE AN INCLUSION THAT `CHART-LOG.md`
     HAPPENED NOT TO MATCH — CEO 166. `/CHART\.md$/` admits ANY file ending that way, so
     `OLD-CHART.md` or `2026-09-CHART.md` would be read as live questions and every answered
     question in an archived chart would block live work forever, silently. The `$` anchor is also
     load-bearing: without it `CHART.md.bak` / `.orig` / `.rej` — the exact leftovers a branch two
     sessions rebase on produces — become question sources. Deny the archive by NAME, then require
     the exact ending. */
  const siblingCharts = (() => {
    try {
      const dir = dirname(CHART), me = CHART.split(/[\/]/).pop();
      return readdirSync(dir)
        .filter((f) => /CHART\.md$/.test(f) && !/(?:^|[-_])(?:LOG|OLD|ARCHIVE|BAK)[-_]?[^/]*CHART\.md$/i.test(f) && f !== me)
        .map((f) => { try { return parseChart(readFileSync(join(dir, f), "utf8")); } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  })();
  const siblingBlocked = siblingCharts.flatMap((c) => c.blocked ?? []);
  /* ⛔ AND THE REPORTING HALF HAD TO MOVE WITH THE SCORING HALF — CEO 166, and this is `T-132`'s
     LIVE INSTANCE surviving inside `T-209`'s own fix. The first version widened `blockedNaming`
     (the score) and left this reading `openItems`, which is only the chart being ranked. So on the
     live `CHART.md` the tool printed *"1 of your open questions name no task"* — about `T-121`'s
     question, **which names its task perfectly** — in the same function, on the same row, after the
     fix. Widening one half of a join and not the other is how the fault survives its own repair. */
  const siblingOpenIds = new Set(siblingCharts.flatMap((c) =>
    (c.tasks ?? []).map((t) => t.id).filter(Boolean)));
  /* ⚑ HIS SETTLED RULINGS MOVED HOUSE, AND TWO RANKING SIGNALS HAD TO MOVE WITH THEM.
     Caught by the ID-STABILITY case, of all things, which is the useful part: after SWEEP started
     taking `## SETTLED RULINGS` out of CHART.md, the same fixture ranked two different ways on two
     consecutive runs. Nothing about ids was wrong — a row whose priority came from *"his answer is
     in and this never moved"* silently lost that +100 the moment the table left the file, because
     `settledNaming` and `rulingItems` both read the Chart and only the Chart.
     **That is the whole failure mode of moving a record: the record survives and everything that
     READS it quietly starts answering "no".** So the rulings are read from wherever they now live —
     the Chart for the ones still being triaged, the log for the ones already swept — and a row's
     score cannot change just because its evidence was archived. */
  const settledInLog = tableRows(section(archiveText(), "SETTLED RULINGS") ?? "");
  if (settledInLog.length) parsed.settled = [...parsed.settled, ...settledInLog];
  const openItems = parsed.tasks;
  /* THE ONE LINK, DERIVED ONCE AND READ BY BOTH CONSUMERS (rule 23). REAP asks it to find rows his
     answer has already freed; `score()` asks it to find rows he is still being asked about. When
     they were two derivations the two disagreed by construction — one fired exactly when the other
     did not, both off the same prose-grep. */
  const naming = (rows, id) => (id ? rows.filter((r) => r.raw.includes(id)) : []);
  /* ⚑ THE LINK HE WRITES AND THE LINK WE WRITE ARE NOT THE SAME LINK, AND UNTIL 2026-09-02 THIS
     COULD NOT TELL THEM APART. `settledNaming` searched the WHOLE table row, so a handle appearing
     anywhere — including the third cell, which is commentary a session wrote about OTHER rows —
     read as "he answered this". On the live Chart one ruling's commentary named three handles and
     all three rows came back flagged as answered; he had been asked about none of them.
     The comment on `hisAnswerLanded` already stated the right design in words — *"the link lives on
     HIS side, in the question"* — and the code did not do it. Now it does: cell 0 only. */
  const inQuestionCell = (rows, id) => (id ? rows.filter((r) => (r.cells[0] ?? "").includes(id)) : []);
  const inCommentary = (rows, id) => (id ? rows.filter((r) => r.cells.slice(1).join(" ").includes(id)) : []);
  /* A HANDLE THAT NAMES TWO JOBS NAMES NEITHER. Two ways that happens, and the first version of
     this guard only covered one of them:
       • the handle also heads a CLOSED row in the archive (`## T-078 — 2026-09-02 — …`), or
       • TWO OPEN ROWS ON THE CHART CARRY IT.
     ⚠ THE SECOND WAS FOUND BY CEO 119, ON THE LIVE CHART, IN THE HANDLE OF THE VERY ROW THIS CHANGE
     WAS FILED UNDER: `T-090` is on `CHART.md:95` and again on `:320`, two unrelated rows. The guard
     shipped an hour earlier could not see it, and the tool printed no warning — *"the same fault the
     commit says it rooted out, in a form the fix does not cover."* Both sets are DERIVED from the
     two files, never from a list somebody keeps. */
  const closedHandles = new Set([...archiveText().matchAll(/^##\s+(T-\d+)\s+—/gm)].map((m) => m[1]));
  const seen = new Map();
  for (const r of openItems) if (r.id) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  const duplicateHandles = new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  const ctx = {
    parsed, openItems,
    /* ⛔ HIS QUESTIONS ARE A PROPERTY OF THE PROJECT, NOT OF THE CHART BEING RANKED — `T-209`.
     *
     * This read `parsed.blocked` alone, which is the BLOCKED ON WYATT table of the ONE file this
     * run was pointed at. **His questions all live in `.planning/CHART.md`** — that is the section
     * the Glass renders as *Your Call* — so a `GLASS-CHART.md` row parked with a question in
     * `CHART.md` was not blocked by it. Measured the hour this was filed: `T-121` was parked, its
     * question written naming ⟨`T-121`⟩ correctly, and `--chart=GLASS-CHART.md --rank` reported
     * **0 rows moved**, leaving the parked row at rank 1. Repaired by hand with `· needs: wyatt`,
     * which does not generalise.
     *
     * ⚠ AND THE STAKES AS FIRST WRITTEN WERE FALSE, IN FOUR FILES — CEO 166 checked the Door and I
     * had not. It said *"the row the Door sends the next session to take"*. **The Door's rank step
     * takes no `--chart=`, so it ranks `CHART.md`**; the only thing it points at `GLASS-CHART.md` is
     * `tick_rows.mjs`, which REPORTS and never orders. Nothing in this repo ranks the Glass chart
     * automatically. **The defect is real and the fix is right — the Advisor ranks that list by
     * hand, every time, and gets the parked row at the top. The consequence was overstated.**
     *
     * ⚑ AND THE CHART SET IS DERIVED, NOT A SECOND LITERAL PATH, because this file's own header
     * records FIVE tools that broke when his one instruction split the list in two — and I filed
     * `T-209` calling this the sixth. **Writing `CHART.md` into a second place here would be the
     * same mistake with one more entry.** The set is every `*CHART.md` beside the chart this run
     * was given, so a third list tomorrow is covered by nobody doing anything, and a fixture in a
     * temp dir with one file finds exactly itself. */
    blockedNaming: (id) => naming([...parsed.blocked, ...siblingBlocked], id),
    settledNaming: (id) => inQuestionCell(parsed.settled, id),
    settledFreeing: (id) => inCommentary(parsed.settled, id),
    handleIsAmbiguous: (id) => {
      const h = id ? id.replace(/`/g, "") : "";
      return !!h && (closedHandles.has(h) || duplicateHandles.has(h));
    },
  };
  const reasonsFor = (sub) => PROBES.map((p) => p(sub, ctx)).filter(Boolean);

  /* THE PROBES ALWAYS RUN; ONLY THE REPORTING IS OPTIONAL. Caught on the first live run: RANK gives
     a stale-looking row +40 ("looks finished"), so with `--rank` alone that signal silently
     vanished and the same Chart ranked two different ways depending on which flags you happened to
     type. A score that changes with the caller's flags is not a score. */
  const reap = [];
  for (const row of openItems) {
    const reasons = reasonsFor({ raw: row.raw, context: row.raw, title: row.title, id: row.id, whole: true });
    /* `fault` IS THE FIRST PROBE'S, IN `PROBES` ORDER, AND EVERY FAULT FOUND IS ALSO CARRIED. A row
       can genuinely be two things at once — the re-sail row cites a dead pid AND was measured on an
       old build — and the one thing that must not happen is the two being flattened back into one
       word. `faults` is what the report groups by when a row belongs in more than one pile. */
    if (reasons.length) reap.push({
      id: row.id, key: row.key, kind: row.kind, title: row.title,
      fault: reasons[0].fault,
      faults: [...new Set(reasons.map((r) => r.fault))],
      reason: reasons.map((r) => r.text).join("; "),
      /* WHY EACH FAULT, SEPARATELY. Without this the grouped report printed the whole joined string
         under BOTH of a two-fault row's headings — so the DEAD-POINTER pile showed a sentence about
         a build stamp, which is the lumping this change exists to remove, reappearing one level
         down. Caught by reading the tool's own output on the real Chart, not by a gate. */
      reasonByFault: Object.fromEntries([...new Set(reasons.map((r) => r.fault))]
        .map((f) => [f, reasons.filter((r) => r.fault === f).map((r) => r.text).join("; ")])),
    });
  }
  /* KEYED BY `row.key`, NEVER BY TITLE — the same fault as the Inbox collision above, and worse
     where it lands. Nothing forbids two rows from sharing a first line, and a title-keyed lookup
     hands one row's verdict to the other: `score()` reads this map to decide a −1000 blocked
     penalty and a +40 "something it was waiting on has landed", and the write pass reads it to
     stamp "⚠ STALE-CANDIDATE" into the file HE reads. Measured 2026-09-02 with two same-titled
     rows: the innocent one scored 40, was told something it had never waited on had landed, and
     had the other's stale flag written underneath it. `row.key` is unique by construction
     (`chart_model.mjs`). */
  const reapByKey = new Map(reap.map((r) => [r.key, r.reason]));
  const reapFaultByKey = new Map(reap.map((r) => [r.key, r.fault]));

  // ── SETTLE ──
  /* ⚠ IT COUNTS WHAT IT LOOKED AT, NOT ONLY WHAT IT FOUND, and that is not decoration.
     "An instrument that reports a result without saying what it touched" is named in this repo as
     its oldest recurring fault, and this pass is unusually exposed to it: SETTLE is SILENT on a
     healthy Chart by design, so a SETTLE that has gone blind and a Chart with nothing half done
     print exactly the same line. `bundled` is the difference between them — how many rows this
     pass could even have an opinion about. It was worth building: pointed at the real Chart the
     first time, this pass saw ZERO bundled rows, including the Blade hour, and that gap in the
     claim derivation would have shipped invisibly behind a green gate. */
  const settle = [];
  const bundledTitles = [];
  for (const row of openItems) {
    const claims = claimsOf(row);
    if (claims.length < 2) continue;
    bundledTitles.push(row.title);
    const judged = claims.map((c) => ({
      title: c.title,
      reason: reasonsFor({ raw: c.text, context: `${row.lines[0]}\n${c.text}`, title: row.title, id: row.id, whole: false })[0]?.text ?? null,
    }));
    const settled = judged.filter((c) => c.reason);
    const open = judged.filter((c) => !c.reason);
    // No part derives finished ⇒ this is an ordinary bundled row with work left in all of it, and
    // RANK handles it perfectly well. "Half-done" means SOME of it is done.
    if (!settled.length) continue;

    /* THE THREE FATES, TRIED IN HIS ORDER. The third is last because his attention is the scarcest
       thing this project spends — a question is the price of not being able to derive an answer. */
    const fate = open.length === 0 ? "VALIDATE" : claims[0].carriable ? "SPLIT" : "ASK";

    /* RESOLVED IS DERIVED FROM THE FILE, NEVER FROM A FLAG THIS TOOL WROTE TO ITSELF — which is the
       same rule that keeps REAP's own flags pure output. A SPLIT is resolved when each unfinished
       part is a row in its own right; an ASK is resolved when a question naming the row is in front
       of him; a VALIDATE needs nothing, because proposing is all this tool may do (closing is a
       claim about WORK and belongs to a watch behind close_item.mjs). */
    const resolved = fate === "VALIDATE"
      ? true
      : fate === "SPLIT"
        ? open.every((c) => openItems.some((o) => o.title !== row.title && o.title.toLowerCase().includes(c.title.toLowerCase())))
        : parsed.blockedQuestions.some((q) => q.includes(row.title.slice(0, 40)));

    settle.push({
      id: row.id, key: row.key, kind: row.kind, title: row.title, fate, resolved,
      claims: judged, settled, open,
      why: fate === "VALIDATE"
        ? `every one of its ${judged.length} parts derives finished`
        : `half done — ${settled.length} of ${judged.length} parts derive finished, the rest is real work`,
    });
  }
  const settleByKey = new Map(settle.map((s) => [s.key, s]));
  const settleUnresolved = settle.filter((s) => !s.resolved).map((s) => s.title);

  // ── RANK ──
  // His rulings are re-read from THIS text, not from the file on disk: SETTLE can have added rows
  // and moved the sections before RANK ever runs, and a table read once would be a table read from
  // a file that no longer exists.
  // …and the same for the tag-resolution source: `Your ruling:` must still resolve against a
  // ruling that has been swept, or every one of his answered rulings loses its row's +100 the day
  // the row it settled is archived.
  const ruleTokens = rulingItems(`${src}\n${archiveText()}`).map((s) => tokens(s));
  const ranked = openItems
    .map((row) => ({ row, ...score(row, { reapByKey, reapFaultByKey, settleByKey, ruleTokens, blockedNaming: ctx.blockedNaming }) }))
    .sort((a, b) => (b.s - a.s) || a.row.title.localeCompare(b.row.title))
    .map((x, i) => ({ rank: i + 1, id: x.row.id, kind: x.row.kind, title: x.row.title, score: x.s, whyNow: x.whyNow, row: x.row }));

  /* AND THE ROWS THAT CLAIM HIS APPROVAL WITHOUT CITING IT ARE NAMED, never silently demoted.
     Some of these claims are TRUE and merely uncited — the row is real, his ruling is real, and
     nobody wrote the pointer down. A grounding that drops them without a word would sink his own
     approved work with nothing on the page to explain why, which is the same fault in a new
     costume. So the tool points at exactly the rows that need a citation added. */
  const unbackedApproval = openItems
    .filter((row) => {
      const l = linksOf(row);
      return CLAIMS_APPROVAL.test(row.raw) && !(l.taggedClaim && tagResolves(row, ruleTokens)) && !l.live.length;
    })
    .map((row) => row.title);

  /* THE LINKS THAT ARE MISSING ARE NAMED, NEVER DROPPED IN SILENCE — 11d's rule, applied to the
     new signal. A row that talks about his table and names no question of his is not lying and is
     not necessarily unblocked; it is simply UNREADABLE by a machine, and the honest response is to
     say which rows need the handle written into the question. Same for a question of his that
     holds up nothing: from his page it looks answered-and-ignored either way, and only the report
     can tell him which. Without this, a Chart nobody had migrated would rank as though he had
     never been asked anything at all, and the tool would say nothing about it. */
  const unattachedMentions = openItems
    .filter((row) => /BLOCKED ON WYATT/i.test(row.raw)
      && !ctx.blockedNaming(row.id).length && !ctx.settledNaming(row.id).length)
    .map((row) => row.title);
  /* A question names a task if ANY open row in ANY chart carries that handle — see the note beside
     `siblingOpenIds`. Scoped to this chart alone, every cross-list question he writes is reported
     to the next session as naming nothing. */
  const unattachedQuestions = parsed.blocked
    .filter((q) => !openItems.some((row) => row.id && q.raw.includes(row.id))
                && ![...siblingOpenIds].some((id) => q.raw.includes(id)))
    .map((q) => q.cells[0]);

  return { parsed, openItems, duplicateHandles: [...duplicateHandles], reap, reapByKey, reapFaultByKey, settle, settleByKey, settleUnresolved, bundledTitles, ranked, unbackedApproval, unattachedMentions, unattachedQuestions };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 3 — RANK. Every signal is derived from the repo, and every signal contributes a phrase to
   `why-now:`. The tie-break is the TITLE, never the file position: a ranking that reads position
   is a ranking that only looks like it works (the gate proves this by ranking the same rows from
   two different file orders and demanding the same answer).
   ──────────────────────────────────────────────────────────────────────────────────────────── */
function score(row, { reapByKey, reapFaultByKey, settleByKey, ruleTokens, blockedNaming }) {
  const why = [];
  let s = 0;
  /* HIS INTERRUPT OUTRANKS EVERY OTHER SIGNAL, BECAUSE IT IS NOT ONE. Everything else in this
     function is DERIVED — a guess about what he would want, built out of the repo. `now: yes` is
     him saying it. So it does not compete with the derived signals; it stands above all of them,
     and the margin is deliberately far wider than any combination of them can reach.
     ⚠ IT DOES NOT CANCEL "BLOCKED". A pinned row that is also GATED still says so in its why-now
     phrase, because he is allowed to pin something that turns out to be blocked and must be told —
     silently un-blocking a row on his say-so would be this tool deciding it knew better. */
  if ((headField(row, "now") || "").toLowerCase() === "yes") {
    s += 10000;
    why.push("YOU SAID DO NOW");
  }
  /* HIS DRAGGED ORDER OUTRANKS EVERY DERIVED SIGNAL AND SITS UNDER HIS PIN. Same reasoning as the
     pin's, one step down: everything else in this function is a GUESS about what he would want,
     and this is him saying it. It sits BELOW `now: yes` because a pin is a later, sharper act than
     an ordering — he can always drag again, and the interrupt he typed most recently should not be
     buried by a list he arranged this morning.
     ⚠ THAT MARGIN IS A JUDGEMENT, NOT A MEASUREMENT, AND IT IS HIS TO OVERRULE. It was written
     down as such in PREDICTION-20260903T0110Z-T103.md before the code existed. If he is ever seen
     re-dragging to undo a pin, the two are the wrong way round.
     THE STEP IS 1 PER POSITION AND THE BASE IS FAR ABOVE THE DERIVED RANGE (which tops out in the
     low hundreds), so his order can never be perturbed by a signal — but a row he dragged that is
     also BLOCKED still says so in its why-now phrase, exactly as a pinned one does. */
  const dragged = Number(headField(row, "order"));
  if (Number.isInteger(dragged) && dragged > 0) {
    s += 5000 - dragged;
    why.push(`you dragged this to ${dragged}`);
  }
  const gated = /\bGATED:/.test(row.raw);
  const needsWyatt = (headField(row, "needs") || "").toLowerCase() === "wyatt";
  /* WAITING ON HIM IS A FACT ABOUT THIS ROW, NOT ABOUT THE WORDS IT USES. This read
     `/BLOCKED ON WYATT/i.test(row.raw) && !reapByKey.has(row.key)` until 2026-09-02 — a heading
     grepped out of the row's own body, cancelled by a REAP flag derived from the same grep. The
     full account is on `hisAnswerLanded` above; the short version is that his own top task sank
     1024 points because somebody else filed two unrelated questions. A question of his that NAMES
     this row is the only thing that may hide it from him. */
  const livePointer = blockedNaming(row.id).length > 0;

  // BLOCKED SINKS TO THE BOTTOM, ALWAYS. The spec: "this alone fixes most of the present list."
  if (gated || needsWyatt || livePointer) {
    s -= 1000;
    why.push(gated ? "blocked (GATED)" : livePointer ? "waiting on your answer" : "needs you");
  }

  /* APPROVED AND UNBLOCKED FLOATS TO THE VERY TOP — a decision he has already made, sitting
     undone, is the most expensive row on the list. This is the one that would have surfaced the
     staging permission line four hours before anybody noticed it.

     ⚠ AND IT USED TO BE SELF-DECLARED, WHICH MADE IT NOT A MEASUREMENT AT ALL. Until 2026-09-02
     this regex-matched approving phrases inside THE ROW'S OWN PROSE, so a row was approved because
     it said so about itself. On the real Chart that awarded +100 to eight rows, and at least two
     of them from a sentence about something else entirely: the Advisor-gates row, because its body
     says the gates were disarmed *"on his ruling"* — a ruling to DISARM them, not approval to
     repair them — and a Glass-layout row, because Wyatt's own note contains the words *"the 'your
     ruling' section"* while describing a CARD NAME. Three more matched their own headline;
     `★ NEXT ITEM, AT HIS INSTRUCTION` approved itself by its title.

     THE HISTORY IS THE ARGUMENT FOR THE FIX, not the regex. That pattern was WIDENED by the watch
     that wrote it, in the open, after its own row ranked 14 of 32 — CEO 91's verdict was *"fitting
     the tool to flatter its own item."* **A signal whose author can widen it until their own row
     wins is not a measurement.** So approval now has to come from a record the row's author does
     not write: a resolved `INBOX-<stamp>` citation that is still live, or the `Your ruling:` tag,
     which `scripts/qa/rulings_triage_check.mjs` keeps matched to a real settled ruling.

     THE ACCEPTANCE TEST STILL HOLDS AND IT HOLDS HONESTLY: the Chartkeeper row qualifies because
     it cites `INBOX-20260902T04xxZ`, a live entry of his own Inbox — not because it calls itself
     the next item. */
  const links = linksOf(row);
  const tagged = links.taggedClaim && tagResolves(row, ruleTokens);
  if (!gated && !livePointer && (tagged || links.live.length)) {
    s += 100;
    why.push(tagged ? "your own ruling, and nothing is blocking it" : "you asked for this yourself, and nothing is blocking it");
  }

  /* HALF-DONE OUTRANKS EVERYTHING EXCEPT A DECISION HE HAS ALREADY MADE — his word is
     "prioritized", and this is where that word becomes arithmetic.

     ⚠ AND IT MUST BE ASKED BEFORE "LOOKS FINISHED", NOT AFTER. One dead pointer anywhere inside a
     bundle makes REAP flag the WHOLE row, so before this pass existed the Blade hour was ranked
     with the phrase "looks finished — needs a verdict, not work" while two of its three jobs had
     never been started. Describing a half-done row to him as finished is worse than leaving it
     unranked: he steers by these phrases. So a row SETTLE has judged is described by SETTLE, and
     the whole-row verdict is not allowed to speak over it. */
  const st = settleByKey.get(row.key);
  if (st) { s += st.fate === "VALIDATE" ? 60 : 50; why.push(st.why); }
  /* SOMETHING IT WAS WAITING ON HAS LANDED — and this sentence used to read "looks finished —
     needs a verdict, not work", which was a lie about four live rows at once.

     ⚠ CEO 93 CAUGHT THIS BY RUNNING THE TOOL AGAINST THE REAL CHART AFTER SETTLE SHIPPED, and the
     correction is worth more than the pass that prompted it. SETTLE fixed the BUNDLED case and I
     reported the misreport as fixed — but the fault was never really about bundles. REAP measures
     a POINTER: a question that has been answered, a pid that is dead, a report now on disk. That
     is a genuine, useful signal, and it says NOTHING WHATEVER about whether the work is done. A
     row can have every pointer in it resolve and still be entirely unstarted — the Chartkeeper's
     own row was being labelled "looks finished" while its own text said half of it was blocked
     and unbuilt.
     THE SCORE IS UNCHANGED AND CORRECT (+40: a row whose blocker has lifted really is the cheapest
     thing on the list to pick up). Only the sentence changes, because the sentence is the whole
     of what he steers by — "an order he cannot read is an order he cannot overrule", and an order
     he reads WRONGLY is worse than either. */
  /* ⚠ AND THE SENTENCE IS NOW PER-KIND, BECAUSE ONE SENTENCE FOR FIVE FAULTS WAS THE SAME BUG ONE
     LAYER UP. `T-090`, 2026-09-02. Measured on the real Chart: the trade-offer-circle row was told
     "something it was waiting on has landed · a player can see it · evidence retired" — the first
     and the last of those contradict each other, in the phrase he steers by. Nothing was waiting on
     it; its evidence had simply gone stale. **The score is deliberately unchanged** (+40 either
     way): re-ranking his list was not what he asked for, and a watch that quietly re-orders his
     Chart while fixing a label is doing two things at once. What is filed for the next watch is the
     honest question underneath — whether a row whose EVIDENCE went stale should be getting +40 at
     all, when the same pass already docks it −20 for exactly that. */
  else if (reapByKey.has(row.key)) {
    s += 40;
    why.push(FAULT_WHY[reapFaultByKey.get(row.key)] ?? "something it was waiting on has landed");
  }

  // PLAYER-FACING OUTRANKS INSTRUMENT-FACING. This is the rulebook's own THE POINT, made
  // mechanical: "is the game better than it was this morning, in a way a player would notice?"
  if (/`?(?:src\/[\w/.-]+|index\.html)`?/.test(row.raw)) { s += 30; why.push("a player can see it"); }

  // EVIDENCE RETIRED — the measurement no longer describes the tree, so the row is arguing about a
  // build nobody is running.
  if (treeStamp) {
    const stamps = row.raw.match(/\b20\d\d\.\d\d\.\d\d\.\d+\b/g) || [];
    if (stamps.length && !stamps.includes(treeStamp) && stamps.every((x) => x < treeStamp)) {
      s -= 20; why.push("evidence retired");
    }
  }

  /* HOW OFTEN HE HAS RAISED IT — counted from RESOLVED LINKS, never from word overlap. The full
     account of what the overlap was actually measuring is in `inboxEntries` above; the short
     version is that it told him he had raised a row he has never mentioned ten times, and told him
     the trade-offer circle — three recorded sightings — had been raised once.
     It now counts distinct entries of his Inbox that this row NAMES, plus entries that name this
     row's handle. It under-counts a row nobody has cited, and that is the direction to fail in:
     the old signal's whole failure was over-claiming, and a number he cannot check is worse than
     no number at all. */
  const raised = links.raised.size;
  if (raised) { s += 8 * raised; why.push(raised === 1 ? "you asked for it in one of your notes" : `you asked for it in ${raised} of your notes`); }

  // SIZE — a tie-break only, small first, so the queue drains.
  const size = (headField(row, "size") || "").toUpperCase();
  if (size === "S") { s += 3; why.push("small"); }
  if (size === "L") { s -= 3; }

  if (!why.length) why.push("no signal either way");
  /* ⚑ HIS OWN SAY-SO REPLACES THE NUMBER; IT DOES NOT COMPETE WITH IT. Both his signals were
     ADDED to the derived score at first, and the drag case caught why that is wrong within one
     run: he dragged four rows into a sequence and RANK gave him a different one, because a row
     carrying +30 for touching `src/` out-scored the row he had put one place above it. **A margin
     that a derived signal can close is not an ordering — it is a suggestion.**
     So a row he has spoken about keeps its why-now phrases (he is still told it is blocked, or
     small, or player-facing) and loses its derived NUMBER entirely. The pin sits above the drag
     because it is the later, sharper act — see the note on `order` above; that margin is his to
     overrule and `do_now_check.mjs` case 13 is where it is written down. */
  if ((headField(row, "now") || "").toLowerCase() === "yes") return { s: 9000000, whyNow: why.join(" · ") };
  if (Number.isInteger(dragged) && dragged > 0) return { s: 1000000 - dragged, whyNow: why.join(" · ") };
  return { s, whyNow: why.join(" · ") };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   SETTLE'S ONE ACTION, AND IT RUNS BEFORE EVERYTHING ELSE READS THE FILE.

   ⚠ IT ADDS ROWS AND IT NEVER REWRITES ONE. The parent keeps its full text, verbatim — the essays
   are the graveyard (rule 10) that stops the next session re-running a settled argument, and a
   split that summarised would burn it. So a split is purely additive: each unfinished part becomes
   a new row of its own, immediately under the parent, pointing back at it.

   AND IT NEVER TOUCHES A FIRST LINE. CEO 91's regression is one file away in the comments: the
   first line is what the Glass renders to Wyatt, so nothing this tool writes may land on one.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
function applySettle(src, d) {
  let out = src;
  const stamp = NOW.toISOString().slice(0, 10);

  for (const [kind, heading] of [["checklist", "STEP 1 CHECKLIST"], ["inbox", "THE IDEA INBOX"]]) {
    const p = parseChart(out);
    const chunks = kind === "checklist" ? p.stepChunks : p.inboxChunks;
    if (!chunks.length) continue;
    let changed = false;
    const rebuilt = [];
    /* KEYED BY POSITION, NOT BY TITLE. This matched `x.title === titleOf(c.lines)`, and CEO 95
       caught it surviving the pass that fixed the same fault three lines away: two rows sharing a
       first line would have had ONE row's split-out parts spliced in under BOTH of them, in the
       file he reads. `chunks` is freshly parsed at the top of this loop, so a chunk's index is
       exactly the index its row was parsed at. */
    const splitByKey = new Map(d.settle.filter((x) => x.fate === "SPLIT" && !x.resolved).map((x) => [x.key, x]));
    for (let ci = 0; ci < chunks.length; ci++) {
      const c = chunks[ci];
      rebuilt.push(c);
      if (c.type !== "row") continue;
      const s = splitByKey.get(rowKey(kind, ci));
      if (!s) continue;
      const marker = kind === "checklist" ? "- [ ] " : "- ";
      for (const cl of s.open) {
        // No handle is minted here. A split row is born without one and `applyHandles` — the ONE
        // place that mints, below — gives it one before anything ranks it, exactly as it does for
        // a row Wyatt typed by hand. Two minting sites was the first repair tried, and rule 23 says
        // the durable answer is that there is one of them.
        rebuilt.push({ type: "row", lines: [
          `${marker}${cl.title}`,
          `      ↳ split out by the Chartkeeper from "${s.title.slice(0, 58)}", which keeps the full account of every part.`,
        ] });
        changed = true;
        wrote.split++;
      }
    }
    if (changed) out = replaceSection(out, heading, rebuilt.map((c) => c.lines.join("\n")).join("\n"));
  }

  /* FATE 3 — ASK HIM, and always WITH THE MEASUREMENT ATTACHED. His instruction is that he is asked
     whether he is satisfied with the row's state; a question that does not say what the state IS
     makes him go and look, which is the cost this whole system exists to remove. */
  const asks = d.settle.filter((x) => x.fate === "ASK" && !x.resolved);
  if (asks.length) {
    const body = section(out, "BLOCKED ON WYATT");
    if (body !== null) {
      const rows = asks.map((s) =>
        `| **${s.title.slice(0, 70)}** — ${s.settled.length} of ${s.claims.length} parts already derive finished (${s.settled[0].reason}); the rest is untouched work. Are you satisfied with it as it stands? | Recommended: split it, so each part can be ticked on its own | ${stamp} |`);
      out = replaceSection(out, "BLOCKED ON WYATT", `${body.replace(/\s+$/, "")}\n${rows.join("\n")}\n\n`);
      wrote.asked += rows.length;
    }
  }
  return out;
}

let wrote = { ids: 0, flags: 0, reordered: 0, archived: 0, split: 0, asked: 0 };

/* ⚑ ONE ID ALLOCATOR, AND IT IS HOISTED ABOVE THE RANK — there must never be two.
 *
 * It used to live inside the WRITE pass, below, which is also where handles were ASSIGNED. That
 * placement is what made this tool rewrite the Chart differently on the second run of an unchanged
 * file — see `applyHandles` for the measurement.
 *
 * Never reused: the next id is one past the highest that has ever appeared in either file, so a row
 * archived last week can never have its handle handed to a new row. Read before anything mints,
 * which is safe precisely because the rows SETTLE is about to create have no handles yet. */
const seenIds = [
  ...(text.match(/`T-(\d{3})`/g) || []),
  ...(existsSync(LOG) ? (readFileSync(LOG, "utf8").match(/`T-(\d{3})`/g) || []) : []),
].map((m) => Number(m.slice(3, 6)));
let nextIdNum = (seenIds.length ? Math.max(...seenIds) : 0) + 1;

/* ⛔ 800–899 IS THE FIXTURE RANGE AND MUST NEVER BE MINTED FOR A REAL ROW. Four gates build
 * throwaway charts with `T-800`…`T-804` (`chartkeeper_check`, `do_now_check`,
 * `do_now_reaches_the_watch_check`, `glass_done_today_check`), and since 2026-09-03
 * `chart_sweep_conserves_check` EXCLUDES the whole range — so a real row minted in it would be
 * permanently invisible to the one check that notices a row disappearing.
 *
 * ⚠ THIS IS NOT HYPOTHETICAL AND CEO 160 CAUGHT IT ONE MOVE AHEAD OF THE MISTAKE. The ceiling
 * above is `max(seen)`, taken from whatever chart this is pointed at. Against `CHART.md` that is
 * 206 today — safe. **Against `.planning/GLASS-CHART.md` it is 802**, because a row there QUOTES a
 * gate's fixture output, so the very next handle would be `T-803`. And pointing the chartkeeper at
 * the Glass chart is the obvious next fix — this file's own header records that FIVE tools tonight
 * had a chart path written into them and every one went quietly wrong. Skip the range instead of
 * relying on nobody taking that step. */
if (nextIdNum >= 800 && nextIdNum <= 899) nextIdNum = 900;
const mintId = () => {
  if (nextIdNum >= 800 && nextIdNum <= 899) nextIdNum = 900;
  return `T-${String(nextIdNum++).padStart(3, "0")}`;
};

/* ⚑ EVERY OPEN ROW GETS ITS HANDLE BEFORE ANYTHING RANKS IT. THE ONE MINTING SITE.
 *
 * **A ROW'S SCORE DEPENDS ON ITS HANDLE, SO A ROW RANKED WITHOUT ONE IS RANKED WRONG.** `score()`
 * adds +8 for each of Wyatt's Inbox entries that names the row (`links.raised`), and one of the two
 * ways an entry can name a row is BY ITS HANDLE. Handles used to be assigned inside the write pass,
 * *after* `ranked` was computed — so on the run that first gave a row its handle, that row was
 * scored anonymous, and on every run afterwards it scored properly. The file therefore changed on
 * the second run of a Chart nobody had edited, and settled on the third.
 *
 * MEASURED on the gate's own fixture, before the fix: `THE BLADE HOUR` scored **30** on run 1 and
 * **38** on run 2 — the missing 8 being an Inbox entry that names it — so it was written 4th, then
 * 2nd, then 2nd forever. The two rows SETTLE splits out showed the same thing one step earlier,
 * being born with no handle at all.
 *
 * **WHY THIS MATTERS BEYOND A GREEN GATE:** two sessions share this branch, and a tool that
 * rewrites his Chart differently every run conflicts on every push. Worse, the Door tells every
 * watch to run this and then TAKE ROW ONE — so an unstable order is an unstable answer to "what
 * should I work on next?".
 *
 * It runs after SETTLE so it covers the rows SETTLE just created as well as the ones Wyatt typed
 * by hand — one rule, both cases. Done rows are left to the write pass: nothing ranks them, so
 * their handles cannot perturb an order. */
function applyHandles(src) {
  let out = src;
  for (const [kind, heading] of [["checklist", "STEP 1 CHECKLIST"], ["inbox", "THE IDEA INBOX"]]) {
    const p = parseChart(out);
    const chunks = kind === "checklist" ? p.stepChunks : p.inboxChunks;
    if (!chunks.length) continue;
    let changed = false;
    const rebuilt = chunks.map((c) => {
      if (c.type !== "row") return c;
      if (kind === "checklist" && /^- \[[xX]\]/.test(c.lines[0])) return c;
      if (idOf(c.lines)) return c;
      changed = true;
      wrote.ids++;
      return { ...c, lines: withId(c.lines.slice(), mintId()) };
    });
    if (changed) out = replaceSection(out, heading, rebuilt.map((c) => c.lines.join("\n")).join("\n"));
  }
  return out;
}

let d = derive(text);
if (WRITE && DO.settle) {
  const applied = applySettle(text, d);
  // Re-derive from scratch rather than patching what is already in memory. The new rows need ids,
  // ranks and slots exactly like every other row, and there is only one piece of code that knows
  // how to give them those.
  if (applied !== text) { text = applied; d = derive(text); }
}
if (WRITE) {
  const handed = applyHandles(text);
  // Same reason as SETTLE's re-derive above: `ranked` was computed from rows some of which had no
  // identity, and identity is one of the things it scores.
  if (handed !== text) { text = handed; d = derive(text); }
}
const { parsed, openItems, duplicateHandles, reap, reapByKey, reapFaultByKey, settle, settleByKey, settleUnresolved, bundledTitles, ranked, unbackedApproval, unattachedMentions, unattachedQuestions } = d;

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 4 — SWEEP. EVERY completed row leaves, the moment it is finished. No age, no stub.

   HIS RULING, 2026-09-02, `SPEC-CHARTKEEPER.md`'s 🛑 banner, overruling the draft he was shown:
   *"SWEEP takes EVERY completed row, immediately, and leaves NO stub. Not 'older than 7 days'."*
   And the sentence the spec says outranks the rest of that document: *"The chart should therefore
   only show WHERE WE ARE GOING — accurately, constantly updating."*

   ⚠ WHAT THIS PARAGRAPH USED TO SAY, AND WHY DELETING IT IS NOT LOSING AN ARGUMENT. It read: *"A
   done row leaves only when its age can be ESTABLISHED. If no date can be read out of the row, it
   stays — an archiver that guesses at ages will eventually archive something that was finished
   this morning, and that is a worse failure than a long Chart."* That reasoning was sound about
   the SEVEN-DAY design and evaporates without it: with no age test there is nothing to guess at,
   so an undated row has no reason to stay. **It had teeth, though — `x.when &&` was a SECOND,
   invisible reason a finished row could sit on his list forever, independent of the threshold.**
   Delete only the threshold and undated rows would still have quietly survived a sweep that
   claims to take everything. Gate case 5 carries an undated fixture row for exactly that.

   WHAT A ROW'S DATE IS STILL FOR: the archive entry's stamp, and through it the Glass's "done
   today" count. A row that carries no date is archived with none — never with today's, which
   would be an invented fact about when work finished (rule 6).
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const lastDateIn = (s) => {
  const all = s.match(/\b20\d\d-\d\d-\d\d\b/g) || [];
  if (!all.length) return null;
  return all.map((d) => new Date(`${d}T00:00:00Z`)).sort((a, b) => b - a)[0];
};
const sweepable = DO.sweep
  ? parsed.doneRows.map((r) => ({ row: r, when: lastDateIn(r.raw) }))
  : [];

/* ────────────────────────────────────────────────────────────────────────────────────────────
   THE WRITE. Everything above is a reading; only this section changes the file, only under
   --write, and it is IDEMPOTENT by construction — ids are allocated once, stale flags are removed
   before being re-added, and rows are placed into the SAME open-row slots the file already has.
   Idempotence is not tidiness here: two sessions share this branch, and a rewrite that differs
   every run conflicts on every push.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
function stripStale(lines) {
  return lines.filter((l) => !isFlagLine(l));
}

/* ⚠ THE HANDLE GOES ON ITS OWN LINE, NOT INTO THE ROW'S FIRST LINE. Caught by CEO 91 by looking at
   the rendered page, which is the only place it was visible: the first version inserted the id
   straight after the checkbox, and `glass.mjs:122`'s `unmark` strips `**` and `~~` but NOT
   backticks — so every task on Wyatt's phone came out reading "`T-001` ★ NEXT ITEM, AT HIS
   INSTRUCTION…", literal backticks and all, with the handle eating one of the sixteen words the
   card shows him.
   **A handle is for machines and the first line is for him.** So the row's first line is now never
   touched by this tool at all, and the head lives on an indented line underneath, where the Glass
   never looks. Rule 19: the change was green in every gate and wrong on the one surface that
   matters, because no gate had looked at the picture. There is one now — the gate asserts the
   first line survives the write byte for byte.
   Ids already written inline by the previous version are MIGRATED, not reallocated: the number is
   lifted off line one and re-emitted below, so nothing that already points at `T-007` breaks. */
// (HEAD_LINE is declared once, up beside the passes that read it.)
// ONE DEFINITION OF A ROW'S IDENTITY, shared with the parse (rule 23). This used to be a second
// copy of the same first-handle-anywhere rule, so the write pass and the parse could disagree about
// which row it was looking at — and on the live Chart they did.
/* A `function` and not a `const` ON PURPOSE, since 2026-09-03. `applyHandles` runs near the top of
 * the file (it must, so every row has its identity before anything ranks it) and it needs `withId`,
 * which needs this. A `const` here sits in the temporal dead zone until execution reaches this
 * line, well BELOW that call, so `withId` would throw the moment `applyHandles` used it. A hoisted
 * declaration is reachable from both. Do not convert it back to an arrow. */
function idOf(lines) { return idOfRow(lines); }

function withId(lines, id) {
  const existing = idOf(lines);
  const out = lines.slice();
  // Migrate an inline handle off the first line, keeping its number.
  out[0] = out[0].replace(/(^- \[[ xX]\] |^[-*] )`T-\d{3}`\s*/, "$1");
  if (out.some((l) => HEAD_LINE.test(l))) return out;
  out.splice(1, 0, `      ⟨\`${existing ?? id}\`⟩`);
  return out;
}
/* ⚠ THE FLAG NAMES THE FAULT AND ITS OWNER, because "STALE-CANDIDATE" on its own is the one-label
   problem written into the file HE reads. `T-090`. The marker itself is unchanged — `stripStale`
   and `isFlagLine` both key on it, and every flag on the Chart today carries it — so an older flag
   is still stripped and re-derived exactly as before. Only what follows the marker changed. */
function withStale(lines, reason, fault) {
  const out = lines.slice();
  const owner = FAULTS[fault]?.owner;
  out.push(`      ${STALE_MARK} ${fault ?? "stale"}${owner ? ` (${owner})` : ""} — ${reason}`);
  return out;
}
/* SETTLE'S VERDICT REPLACES REAP'S ON A ROW IT HAS JUDGED, in the file exactly as it does in the
   ranking. Otherwise a half-done row carries "⚠ STALE-CANDIDATE" — a sentence that says the whole
   row looks finished — sitting directly above the parts of it nobody has started. */
function withSettle(lines, s) {
  const out = lines.slice();
  const tail = s.fate === "VALIDATE"
    ? `Close it through close_item.mjs with a CEO verdict — this tool never ticks. (${s.settled[0].reason})`
    : s.fate === "SPLIT"
      ? `Each unfinished part is now a row of its own, just below.`
      : `Asked in BLOCKED ON WYATT — it cannot be decided from the repo.`;
  out.push(`      ${SETTLE_MARK} ${s.why}. ${tail}`);
  return out;
}

if (WRITE) {
  // 1. ALLOCATE IDS — through the ONE allocator, `mintId`, defined above the rank.
  //    This used to be a second copy of the same counter, declared here, and assigning handles at
  //    THIS point is what made the tool non-idempotent: `ranked` had already been computed from
  //    rows that had no handle yet, and a row's handle is one of the things its score reads.
  //    Open rows now arrive here already handled (`applyHandles`); this still covers DONE rows,
  //    which nothing ranks. Rule 23 — the durable answer is that there is one allocator.
  const nextId = mintId;

  const rebuild = (chunks, marker, sectionRows) => {
    // Slots: which chunk positions currently hold an OPEN row. Ranked rows are placed back into
    // those same slots, so headings, prose and done rows never move — the file's structure is
    // untouched and only the ORDER of the open list changes.
    const out = chunks.map((c) => ({ ...c, lines: c.lines.slice() }));
    const slots = [];
    for (let i = 0; i < out.length; i++) {
      if (out[i].type !== "row") continue;
      const done = marker === "checklist" ? /^- \[[xX]\]/.test(out[i].lines[0]) : null;
      if (done === false) slots.push(i);
    }
    /* WHICH ROW'S TEXT ENDS UP IN EACH SLOT — tracked, never re-derived from the text afterwards.
       This used to look the row's verdict up by `titleOf(lines)` after placement, and two rows
       sharing a first line therefore got each other's flags written into HIS file. A chunk starts
       out holding the row parsed at that same index; a reorder moves a known row into a known slot.
       Both are facts we have; the title was a guess dressed as an identity. */
    const keyAt = new Map(slots.map((i) => [i, rowKey(marker, i)]));
    const order = ranked.filter((r) => r.kind === marker);
    if (slots.length === order.length) {
      for (let k = 0; k < slots.length; k++) {
        const before = out[slots[k]].lines.join("\n");
        out[slots[k]] = { type: "row", lines: order[k].row.lines.slice() };
        keyAt.set(slots[k], order[k].row.key);
        if (out[slots[k]].lines.join("\n") !== before) wrote.reordered++;
      }
    }
    // 2. Ids and stale flags, applied AFTER placement so they follow the row, not the slot.
    for (const i of slots) {
      let lines = stripStale(out[i].lines);
      const had = idOf(lines);
      lines = withId(lines, had ?? nextId());
      if (!had) wrote.ids++;
      const st = settleByKey.get(keyAt.get(i));
      const reason = reapByKey.get(keyAt.get(i));
      if (st) { lines = withSettle(lines, st); wrote.flags++; }
      else if (reason) { lines = withStale(lines, reason, reapFaultByKey.get(keyAt.get(i))); wrote.flags++; }
      out[i].lines = lines;
    }
    // Done rows get ids too — an archive stub needs a handle to point at.
    for (let i = 0; i < out.length; i++) {
      if (out[i].type !== "row" || slots.includes(i)) continue;
      const had = idOf(out[i].lines);
      out[i].lines = withId(out[i].lines, had ?? nextId());
      if (!had) wrote.ids++;
    }
    return out;
  };

  let stepOut = rebuild(parsed.stepChunks, "checklist");
  const inboxOut = rebuild(parsed.inboxChunks, "inbox");

  // 3. SWEEP. The row's full text goes to the archive and NOTHING is left behind — his ruling.
  //    The stub the first version left ("↳ `T-nnn` … → CHART-LOG") was the draft he read and
  //    overruled: a pointer to the past is still the past sitting in a document about the future.
  //    A reader following an old reference lands nowhere on the Chart and everywhere in the log,
  //    which is what the handle is FOR — `T-nnn` is grep-able across both files and never reused.
  /* `|| existsSync(LOG)` IS NOT REDUNDANT: with nothing to sweep, this block is still the only
     thing that can refresh a stale preamble, and a Chart with no finished rows on it is exactly the
     state a healthy relay sits in most of the time. Guarding on `sweepable.length` alone means the
     archive's own description of itself can only ever be corrected on a day something closes. The
     block is byte-idempotent when there is nothing to move, so it costs no git churn. */
  if (DO.sweep && (sweepable.length || existsSync(LOG))) {
    const stamps = [];
    // Same rule as the flags above: a DONE row is identified by the slot it was parsed from, never
    // by its title. Done rows are never moved by the reorder, so a chunk index still names one.
    const sweepByKey = new Map(sweepable.map((x) => [x.row.key, x]));
    stepOut = stepOut.flatMap((c, i) => {
      if (c.type !== "row") return [c];
      const hit = sweepByKey.get(rowKey("checklist", i));
      if (!hit) return [c];
      const id = idOf(c.lines) ?? "T-???";
      // NO DATE IS PRINTED AS NO DATE. Falling back to today would file a row under the day it was
      // ARCHIVED as if that were the day it was FINISHED — and the Glass's "done today" count reads
      // exactly this stamp, so the invented fact would land on his page as a number (rule 6).
      const when = hit.when ? hit.when.toISOString().slice(0, 10) : "date not recorded";
      stamps.push({ id, when, title: titleOf(c.lines), text: c.lines.join("\n") });
      wrote.archived++;
      return [];
    });
    /* HIS SECOND RULING IN THE SAME ROUND, made against a recommendation to KEEP: the SETTLED
       RULINGS table goes too. It is twelve rows of decisions already made, and the strict reading
       of his own sentence wins — nothing backward-looking survives in CHART.md. It moves whole,
       under its own heading, so `rulings_triage_check.mjs` can go on asking the same question of
       it at its new address. */
    let ruledOut = "";
    if (parsed.settled.length) {
      const sec = section(text, "SETTLED RULINGS");
      if (sec !== null && sec.trim()) {
        ruledOut = `\n## SETTLED RULINGS — swept off the Chart ${NOW.toISOString().slice(0, 10)}, kept on the record forever\n${sec.replace(/\s+$/, "")}\n`;
        text = dropSection(text, "SETTLED RULINGS");
        wrote.archived += parsed.settled.length;
      }
    }
    /* ⚑ THE PREAMBLE IS REWRITTEN EVERY RUN, NOT WRITTEN ONCE — and this is the sharpest lesson of
       the whole pass, because the first version got it wrong in the change whose entire purpose is
       killing stale records.
       It read `existsSync(LOG) ? readFileSync(LOG) : <the new header>`, so the header was frozen at
       whatever the FIRST sweep on that machine wrote. The archive therefore opened, in front of 36
       archived rows, with *"Rows the Chartkeeper swept off CHART.md after seven days done"* — the
       design Wyatt had already overruled — and *"Empty as of 2026-09-02, and correctly so"*. **A
       document describing itself, wrong, at the top, in the file he would open to check nothing was
       lost.** CEO 107 found it.
       Derive it instead: keep everything from the first `## ` entry onward and re-emit the preamble
       from the code, which is the only copy that can be corrected. A header that is written once is
       a comment that can rot (rule 6), and this one did, in about four minutes. */
    const HEADER = `# THE CHART LOG — closed rows, kept forever

*Rows the Chartkeeper swept off [\`CHART.md\`](CHART.md) the moment they were finished — his
ruling, 2026-09-02: every completed row leaves immediately and leaves no stub, because the Chart
"should only show WHERE WE ARE GOING". Nothing is lost here: the full text of every row is below,
under the handle it was closed with, and \`scripts/qa/chart_sweep_conserves_check.mjs\` fails the
build if any allocated handle ends up owned by neither file. Swept by
\`scripts/wyclau/chartkeeper.mjs --sweep --write\`, never by hand.*

*This preamble is re-emitted from the tool on every sweep, so it cannot describe a design that has
been superseded. It did exactly that for four minutes on 2026-09-02 and the fix is above the line
that writes it.*
`;
    const existing = existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
    const firstEntry = existing.search(/^## /m);
    const body = firstEntry === -1 ? "" : `\n${existing.slice(firstEntry).replace(/^\n+/, "")}`;
    const added = stamps.map((s) => `\n## ${s.id} — ${s.when} — ${s.title}\n\n${s.text}\n`).join("");
    writeFileSync(LOG, HEADER + body + added + ruledOut);
  }

  const join_ = (chunks) => chunks.map((c) => c.lines.join("\n")).join("\n");
  text = replaceSection(text, "STEP 1 CHECKLIST", join_(stepOut));
  text = replaceSection(text, "THE IDEA INBOX", join_(inboxOut));
  if (text !== original) writeFileSync(CHART, text);
}

/* ── THE REPORT ── */
if (JSON_OUT) {
  console.log(JSON.stringify({
    chart: CHART, treeStamp, now: NOW.toISOString(), wrote: WRITE ? wrote : null,
    ambiguousInboxIds,
    reap,
    settle: DO.settle ? settle : [],
    settleUnresolved: DO.settle ? settleUnresolved : [],
    settleBundled: DO.settle ? bundledTitles : [],
    rank: ranked.map(({ row, ...r }) => r),
    unbackedApproval,
    unattachedMentions,
    unattachedQuestions,
    sweep: sweepable.map((x) => ({ title: titleOf(x.row.lines), when: x.when ? x.when.toISOString().slice(0, 10) : null })),
  }, null, 2));
} else {
  console.log(`THE CHARTKEEPER — ${CHART}`);
  console.log(`tree stamp ${treeStamp ?? "(unreadable)"} · ${parsed.openRows.length} open rows + ${parsed.openIdeas.length} unfated ideas = ${openItems.length} tasks on his phone\n`);
  /* NAMED, NOT ABSORBED. A stamp naming two of his notes can only be repaired in INBOX.md, and a
     reader that silently copes with it makes the collision permanent.
     ⚠ AND THIS BANNER SAID SOMETHING THE CODE DOES NOT DO. Its first version told him a row citing
     an ambiguous stamp "cannot be read as approval" — false in exactly the case that had actually
     occurred in his Inbox, where BOTH notes were open and the citation therefore WAS credited.
     CEO 95 found it one commit after CEO 94 caught the same watch for the same thing. The code was
     the half that was right: when both notes are open the answer is the same whichever the row
     meant, so refusing would throw away real signal. The words are now the code's. */
  if (ambiguousInboxIds.length) {
    console.log(`⚠ ${ambiguousInboxIds.length} stamp(s) in your Inbox name MORE THAN ONE note. A row citing one of these`);
    console.log("  counts as approved only while EVERY note under it is still open — the moment one is closed the");
    console.log("  citation stops counting, because nobody can tell which note it meant. Give one of each pair a");
    console.log("  distinct stamp in .planning/wyclau/INBOX.md:");
    for (const id of ambiguousInboxIds) {
      const es = inboxById.get(id);
      console.log(`       • ${id}  (${es.length} entries, ${es.filter((e) => e.live).length} still open)`);
    }
    console.log("");
  }
  /* ⚑ GROUPED BY FAULT, AND THE SENTENCE FOR HIS PAGE IS WRITTEN HERE RATHER THAN BY WHOEVER READS
     THIS. `T-090`. The old report printed one flat list under the words "stale candidate(s)", and
     `GLASS-UPDATE-SESSION.md` then told the Glass tick to turn that into one line for him: *"N tasks
     on your list look already finished."* **Neither the word "stale" nor the word "finished" was
     true of six of the ten rows it was describing.** A human composing a summary from a lumped list
     is the step that went wrong, so the step is gone: the tool prints the sentences, the tick copies
     them. One label, one meaning, one owner. */
  /* ⚠ A DUPLICATE HANDLE IS NAMED OUT LOUD, NOT SILENTLY WORKED AROUND — the same rule as the
     ambiguous Inbox stamp above, and for the same reason: it can only be repaired in CHART.md, and a
     reader that quietly copes with it makes the collision permanent. Every signal keyed on a
     handle — one of his questions holding a row up, a ruling freeing it, how often he has raised
     it — attaches to BOTH rows while it stands. (It does not misdirect `close_item.mjs`, which
     matches on a substring of the row's text and never on a handle — checked, not assumed.) */
  if (duplicateHandles.length) {
    console.log(`⚠ ${duplicateHandles.length} handle(s) are carried by MORE THAN ONE open row: ${duplicateHandles.join(", ")}.`);
    console.log("  Nothing may be claimed from a mention of one — a ruling naming it names two different jobs, so");
    console.log("  every signal keyed on it attaches to both. Give one of each pair a new handle in");
    console.log("  .planning/CHART.md.\n");
  }
  if (DO.reap) {
    if (reap.length === 0) console.log("REAP   the Chart is fine — every pointer on it still resolves.\n");
    else {
      const byFault = new Map();
      for (const r of reap) for (const f of (r.faults ?? [r.fault])) {
        if (!byFault.has(f)) byFault.set(f, []);
        byFault.get(f).push(r);
      }
      const kinds = FAULT_ORDER.filter((f) => byFault.has(f));
      console.log(`REAP   ${reap.length} row(s) whose POINTER has moved, in ${kinds.length} kind(s). FLAGGED, NOT CLOSED — a watch closes through close_item.mjs.`);
      console.log("       (this pass measures a POINTER, never whether the work is done — a row can have every");
      console.log("        pointer in it resolve and still be entirely unstarted.)\n");
      for (const f of kinds) {
        console.log(`       ${f.toUpperCase()} — ${FAULTS[f].owner}`);
        for (const r of byFault.get(f)) console.log(`         • ${r.title.slice(0, 76)}\n           ${r.reasonByFault?.[f] ?? r.reason}`);
        console.log("");
      }
      /* FOR THE NOTE — his page's own words, ready to paste. It exists because the line he read was
         composed by hand from the list above, and got it wrong for six rows out of ten. */
      console.log("       FOR THE NOTE (copy these lines onto his page — do not summarise them into one):");
      for (const f of kinds) console.log(`         ${FAULTS[f].note(byFault.get(f).length)}`);
      console.log("");
    }
  }
  if (DO.settle) {
    console.log(settle.length === 0
      ? `SETTLE looked at ${bundledTitles.length} row(s) that bundle more than one job, and none of them is half done.\n`
      : `SETTLE ${settle.length} half-done row(s), out of ${bundledTitles.length} that bundle more than one job. A row is not allowed to stay half done (his instruction).`);
    for (const s of settle) {
      console.log(`       • [${s.fate}] ${s.title.slice(0, 66)}\n         ${s.why}${s.resolved ? "" : "  ← NOT YET RESOLVED"}`);
      for (const c of s.settled) console.log(`           ✓ ${c.title.slice(0, 60)} — ${c.reason.slice(0, 90)}`);
      for (const c of s.open) console.log(`           · ${c.title.slice(0, 60)} — no evidence it is finished`);
    }
    /* THE ENFORCEMENT, SAID OUT LOUD. The spec: "a row may not survive a full pass still
       half-stale. If one does, that is a defect in SETTLE, and the gate should say so by name."
       In report mode this is simply the list of what a write pass would act on. */
    if (settleUnresolved.length && WRITE) {
      console.log(`\n       ⚠ ${settleUnresolved.length} row(s) are STILL half done after this write — that is a defect in SETTLE, not in the Chart:`);
      for (const t of settleUnresolved) console.log(`         • ${t.slice(0, 78)}`);
    }
    if (settle.length) console.log("");
  }
  if (DO.rank) {
    console.log("RANK   the open list, next-to-be-completed first:");
    for (const r of ranked) console.log(`  ${String(r.rank).padStart(2)}. [${String(r.score).padStart(5)}] ${r.title.slice(0, 66)}\n         why now: ${r.whyNow}`);
    if (unbackedApproval.length) {
      console.log(`\n       ⚠ ${unbackedApproval.length} row(s) claim your approval in their own words and cite nothing, so they are NOT credited.`);
      console.log("         If the record exists, add the `INBOX-<stamp>` it came from, or the `Your ruling:` tag:");
      for (const t of unbackedApproval) console.log(`         • ${t.slice(0, 78)}`);
    }
    /* THE BROKEN LINKS BETWEEN HIS TABLE AND HIS LIST. Only a question that NAMES a row may hide
       that row from him, so a Chart nobody has migrated ranks as though he had never been asked
       anything — which is the right way to fail (a row that turns out to need him costs a watch
       minutes; a row wrongly hidden costs him his own order). But it must never happen QUIETLY. */
    if (unattachedMentions.length) {
      console.log(`\n       ⚠ ${unattachedMentions.length} row(s) talk about your BLOCKED ON WYATT table and name no question, so nothing there holds them back.`);
      console.log("         If one of them really is waiting on you, put its `T-nnn` into the question:");
      for (const t of unattachedMentions) console.log(`         • ${t.slice(0, 78)}`);
    }
    if (unattachedQuestions.length) {
      console.log(`\n       ⚠ ${unattachedQuestions.length} of your open question(s) name no task, so nobody can tell what they are holding up:`);
      for (const q of unattachedQuestions) console.log(`         • ${q.replace(/\*/g, "").slice(0, 78)}`);
    }
    console.log("");
  }
  if (DO.sweep) {
    /* SAY WHAT WAS EXAMINED, NOT ONLY WHAT WAS FOUND — the same correction SETTLE needed. A pass
       that is silent on a Chart with nothing finished and a pass that has gone blind print the
       identical line, and one of those is a broken tool. */
    console.log(sweepable.length === 0
      ? `SWEEP  ${parsed.doneRows.length} finished row(s) on the Chart, nothing to archive.\n`
      : `SWEEP  ${sweepable.length} finished row(s) leaving the Chart for ${LOG}`);
    for (const x of sweepable) console.log(`       • ${x.when ? x.when.toISOString().slice(0, 10) : "(no date)"}  ${titleOf(x.row.lines).slice(0, 70)}`);
  }
  console.log(WRITE
    ? `\nWROTE  ${wrote.ids} id(s) allocated · ${wrote.flags} flag(s) · ${wrote.reordered} row(s) moved · ${wrote.split} part(s) split out · ${wrote.asked} question(s) put to him · ${wrote.archived} archived`
    : "\n(report only — nothing on disk changed. Add --write to act.)");
}
