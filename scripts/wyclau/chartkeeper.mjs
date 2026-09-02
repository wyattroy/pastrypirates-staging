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
 *          seven-day version here because the change cannot land alone: `glass.mjs:392` derives his
 *          "done" count by counting `- [x]` rows in the Chart, so sweeping them all takes his page
 *          to "0 done" — and `glass.mjs` is VENDORED from claude-kit, which is outside an unattended
 *          watch's reach. Filed in `.planning/wyclau/PENDING-KIT-PATCHES.md`.
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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ID_RE, bodyOf, chunk, overlap, parseChart, replaceSection, rowKey, section, titleOf, tokens,
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
   Each probe returns a reason string or null. A row with no pointers in it can never be flagged,
   which is how the Chartkeeper is able to say "the Chart is fine" (guardrail 4).

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
  function deadPointerToWyatt(sub, ctx) {
    if (!/BLOCKED ON WYATT/i.test(sub.raw)) return null;
    const mine = tokens(sub.context ?? sub.raw);
    if (ctx.blockedTokens.some((q) => overlap(q, mine) >= 3)) return null;
    return ctx.parsed.blockedQuestions.length === 0
      ? "points at BLOCKED ON WYATT, which is empty — the question it is waiting on has been answered"
      : "points at BLOCKED ON WYATT, but no question there matches it any more — it was answered and nothing moved the row";
  },
  function reportNeverWritten(sub) {
    const cited = sub.raw.match(/[.\w/-]*SEA-TRIAL[\w.-]*\.md/g) || [];
    const missing = cited.map((c) => c.replace(/^`|`$/g, "")).filter((c) => !existsSync(abs(c.startsWith(".planning") ? c : join(".planning", c))));
    return missing.length ? `cites a trial report that is not on disk: ${missing[0]}` : null;
  },
  function pidLongDead(sub) {
    const m = /\bpid\s+(\d{2,7})\b/i.exec(sub.raw);
    if (!m) return null;
    return pidAlive(Number(m[1])) ? null : `warns readers off on account of pid ${m[1]}, which is not running`;
  },
  function evidenceRetired(sub) {
    if (!treeStamp) return null;
    const stamps = [...new Set(sub.raw.match(/\b20\d\d\.\d\d\.\d\d\.\d+\b/g) || [])];
    if (!stamps.length) return null;
    const older = stamps.filter((s) => s < treeStamp);
    if (!older.length || stamps.includes(treeStamp)) return null;
    return `measured on build ${older[0]}; the tree is ${treeStamp}, so its evidence no longer describes this game`;
  },
  function supersededByAnotherRow(sub, ctx) {
    const mine = tokens(sub.title);
    for (const other of ctx.openItems) {
      if (other.title === sub.title) continue;
      const m = /supersedes ([^.*)\n]{6,80})/i.exec(other.raw);
      if (!m) continue;
      if (overlap(tokens(m[1]), mine) >= 2) return `superseded — the row "${other.title.slice(0, 60)}" says in its own text that it supersedes this`;
    }
    return null;
  },
];

const HEAD = /⟨([^⟩]*)⟩/;
const HEAD_LINE = /^\s*⟨[^⟩]*⟩\s*$/;
const headField = (row, name) => {
  const m = HEAD.exec(row.lines[0]);
  if (!m) return null;
  const f = new RegExp(`${name}\\s*:\\s*([^·⟩]+)`).exec(m[1]);
  return f ? f[1].trim() : null;
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
  const openItems = parsed.tasks;
  const ctx = { parsed, openItems, blockedTokens: parsed.blockedQuestions.map((q) => tokens(q)) };
  const reasonsFor = (sub) => PROBES.map((p) => p(sub, ctx)).filter(Boolean);

  /* THE PROBES ALWAYS RUN; ONLY THE REPORTING IS OPTIONAL. Caught on the first live run: RANK gives
     a stale-looking row +40 ("looks finished"), so with `--rank` alone that signal silently
     vanished and the same Chart ranked two different ways depending on which flags you happened to
     type. A score that changes with the caller's flags is not a score. */
  const reap = [];
  for (const row of openItems) {
    const reasons = reasonsFor({ raw: row.raw, context: row.raw, title: row.title });
    if (reasons.length) reap.push({ id: row.id, key: row.key, kind: row.kind, title: row.title, reason: reasons.join("; ") });
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
      reason: reasonsFor({ raw: c.text, context: `${row.lines[0]}\n${c.text}`, title: row.title })[0] ?? null,
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
  const ruleTokens = rulingItems(src).map((s) => tokens(s));
  const ranked = openItems
    .map((row) => ({ row, ...score(row, { reapByKey, settleByKey, ruleTokens }) }))
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

  return { parsed, openItems, reap, reapByKey, settle, settleByKey, settleUnresolved, bundledTitles, ranked, unbackedApproval };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 3 — RANK. Every signal is derived from the repo, and every signal contributes a phrase to
   `why-now:`. The tie-break is the TITLE, never the file position: a ranking that reads position
   is a ranking that only looks like it works (the gate proves this by ranking the same rows from
   two different file orders and demanding the same answer).
   ──────────────────────────────────────────────────────────────────────────────────────────── */
function score(row, { reapByKey, settleByKey, ruleTokens }) {
  const why = [];
  let s = 0;
  const gated = /\bGATED:/.test(row.raw);
  const needsWyatt = (headField(row, "needs") || "").toLowerCase() === "wyatt";
  const livePointer = /BLOCKED ON WYATT/i.test(row.raw) && !reapByKey.has(row.key);

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
  else if (reapByKey.has(row.key)) { s += 40; why.push("something it was waiting on has landed"); }

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

let d = derive(text);
if (WRITE && DO.settle) {
  const applied = applySettle(text, d);
  // Re-derive from scratch rather than patching what is already in memory. The new rows need ids,
  // ranks and slots exactly like every other row, and there is only one piece of code that knows
  // how to give them those.
  if (applied !== text) { text = applied; d = derive(text); }
}
const { parsed, openItems, reap, reapByKey, settle, settleByKey, settleUnresolved, bundledTitles, ranked, unbackedApproval } = d;

/* ────────────────────────────────────────────────────────────────────────────────────────────
   PASS 4 — SWEEP. A done row leaves only when its age can be ESTABLISHED. If no date can be read
   out of the row, it stays — an archiver that guesses at ages will eventually archive something
   that was finished this morning, and that is a worse failure than a long Chart.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const lastDateIn = (s) => {
  const all = s.match(/\b20\d\d-\d\d-\d\d\b/g) || [];
  if (!all.length) return null;
  return all.map((d) => new Date(`${d}T00:00:00Z`)).sort((a, b) => b - a)[0];
};
const sweepable = DO.sweep
  ? parsed.doneRows.map((r) => ({ row: r, when: lastDateIn(r.raw) }))
      .filter((x) => x.when && NOW - x.when > SEVEN_DAYS)
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
const idOf = (lines) => (ID_RE.exec(lines.join("\n")) || [])[1] ?? null;

function withId(lines, id) {
  const existing = idOf(lines);
  const out = lines.slice();
  // Migrate an inline handle off the first line, keeping its number.
  out[0] = out[0].replace(/(^- \[[ xX]\] |^[-*] )`T-\d{3}`\s*/, "$1");
  if (out.some((l) => HEAD_LINE.test(l))) return out;
  out.splice(1, 0, `      ⟨\`${existing ?? id}\`⟩`);
  return out;
}
function withStale(lines, reason) {
  const out = lines.slice();
  out.push(`      ${STALE_MARK} ${reason}`);
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
  // 1. ALLOCATE IDS. Never reused: the next id is one past the highest that has ever appeared in
  //    either file, so a row archived last week can never have its handle handed to a new row.
  const seen = [
    ...(text.match(/`T-(\d{3})`/g) || []),
    ...(existsSync(LOG) ? (readFileSync(LOG, "utf8").match(/`T-(\d{3})`/g) || []) : []),
  ].map((m) => Number(m.slice(3, 6)));
  let next = (seen.length ? Math.max(...seen) : 0) + 1;
  const nextId = () => `T-${String(next++).padStart(3, "0")}`;

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
      else if (reason) { lines = withStale(lines, reason); wrote.flags++; }
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

  // 3. SWEEP. The row's full text goes to the archive; a one-line stub stays behind so a reader
  //    following an old reference lands somewhere rather than nowhere. The stub is NOT a checkbox,
  //    which is what makes the `done` count start meaning "done this week".
  if (DO.sweep && sweepable.length) {
    const stamps = [];
    // Same rule as the flags above: a DONE row is identified by the slot it was parsed from, never
    // by its title. Done rows are never moved by the reorder, so a chunk index still names one.
    const sweepByKey = new Map(sweepable.map((x) => [x.row.key, x]));
    stepOut = stepOut.map((c, i) => {
      if (c.type !== "row") return c;
      const hit = sweepByKey.get(rowKey("checklist", i));
      if (!hit) return c;
      const id = idOf(c.lines) ?? "T-???";
      const when = hit.when.toISOString().slice(0, 10);
      const ceo = (/CEO\s*(?:Review\s*)?(\d{1,3})/i.exec(c.lines.join(" ")) || [])[1];
      stamps.push({ id, when, title: titleOf(c.lines), text: c.lines.join("\n") });
      wrote.archived++;
      return {
        type: "prose",
        lines: [`  ↳ \`${id}\` ${when}${ceo ? ` · CEO ${ceo}` : ""} · ${titleOf(c.lines).slice(0, 90)} → [CHART-LOG](CHART-LOG.md)`],
      };
    });
    const header = existsSync(LOG) ? readFileSync(LOG, "utf8") : `# THE CHART LOG — closed rows, kept forever

*Rows the Chartkeeper swept off [\`CHART.md\`](CHART.md) after seven days done. Nothing is lost
here: the full text of every row is below, under the handle the Chart still points at. Swept by
\`scripts/wyclau/chartkeeper.mjs --sweep --write\`, never by hand.*
`;
    const added = stamps.map((s) => `\n## ${s.id} — ${s.when} — ${s.title}\n\n${s.text}\n`).join("");
    writeFileSync(LOG, header + added);
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
    sweep: sweepable.map((x) => ({ title: titleOf(x.row.lines), when: x.when.toISOString().slice(0, 10) })),
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
  if (DO.reap) {
    console.log(reap.length === 0
      ? "REAP   the Chart is fine — every pointer on it still resolves.\n"
      : `REAP   ${reap.length} stale candidate(s). FLAGGED, NOT CLOSED — a watch closes through close_item.mjs.`);
    for (const r of reap) console.log(`       • ${r.title.slice(0, 78)}\n         ${r.reason}`);
    if (reap.length) console.log("");
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
    console.log("");
  }
  if (DO.sweep) {
    console.log(sweepable.length === 0
      ? "SWEEP  nothing done for longer than seven days.\n"
      : `SWEEP  ${sweepable.length} done row(s) ready to archive into ${LOG}`);
    for (const x of sweepable) console.log(`       • ${x.when}  ${titleOf(x.row.lines).slice(0, 70)}`);
  }
  console.log(WRITE
    ? `\nWROTE  ${wrote.ids} id(s) allocated · ${wrote.flags} flag(s) · ${wrote.reordered} row(s) moved · ${wrote.split} part(s) split out · ${wrote.asked} question(s) put to him · ${wrote.archived} archived`
    : "\n(report only — nothing on disk changed. Add --write to act.)");
}
