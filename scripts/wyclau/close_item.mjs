#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
/* close_item.mjs — the ONLY way a watch closes an item. Refuses without the evidence.
 *
 * WHY THIS IS A SCRIPT AND NOT A RULE. "CEO after every item" was ruled twice and lost twice
 * (2026-08-28 twice, gone again by 2026-09-01 — Wyatt: "the CEO is never being called"). CEO
 * Review 65 named the gap in the redesign itself: "the design says CEO-per-item 'becomes a
 * gate' but never says what enforces the gate." This file is the enforcement. A watch that
 * ticks the Chart or the INBOX by hand instead of through here has broken the Door's contract,
 * and the tick, the fate and the ledger entry it writes together are how the three records
 * cannot disagree.
 *
 * WHAT IT ENFORCES (mechanical) AND WHAT IT DELEGATES (judgement):
 *   1. A CEO verdict EXISTS in .planning/CEO-REVIEWS.md and is TRACEABLE to this item — the
 *      review text must name the item id or the closing commit. The gate checks presence and
 *      traceability; whether the verdict is honest is the CEO's job, not greppable.
 *   2. The item ends in a GAME-CODE DIFF or a stated ONE-LINE REASON (Wyatt's ruling: "every
 *      run ends in a diff or a reason" — the reason is reviewed by the CEO like any work).
 *      Game code is index.html + src/ — the release process's own definition of the game
 *      (docs/GIT-AND-DEPLOY.md section 5: "there is exactly one copy of the game in this
 *      repo: index.html + src/").
 *   3. SOLUTION-FIRST: if the INBOX item records a solution in Wyatt's words, closing requires
 *      naming the commit that implemented it (--solution-commit). The gate verifies the commit
 *      exists and records it; the CEO brief must verify it actually implements his words.
 *
 * USAGE (from a watch, at close):
 *   node scripts/wyclau/close_item.mjs --item="INBOX-20260901T1200Z" --ceo=66 \
 *     --commit=<sha> [--solution-commit=<sha>] [--summary="one line"]
 *   node scripts/wyclau/close_item.mjs --item="<substring of one Chart '- [ ]' row>" --ceo=66 \
 *     --reason="measured, no change needed: <why>"
 *
 * EXIT: 0 closed (Chart/INBOX ticked, ledger appended — commit and push after).
 *       1 refused (the missing evidence is named on stdout).  2 usage.
 * --repo=<dir> points at another tree so a gate can drive this against fixtures (red-proof).
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = args.repo ? path.resolve(String(args.repo)) : path.resolve(here, "..", "..");
/* ⛔ `--chart=<path>` — WHICH CHART THIS ROW LIVES ON. Added 2026-09-02 because the split made the
 * default a lie for three quarters of the work.
 *
 * WHAT HAPPENED. He said: *"take every Glass-focused task on the Chart... YOU will work on the
 * chart -- the Watch will work on the game."* 44 rows moved to `.planning/GLASS-CHART.md`. **This
 * file read `.planning/CHART.md` by path with no way to point it elsewhere, so from that moment NOT
 * ONE of those 44 rows could be closed at all** — and the Door says closing happens only here.
 *
 * **His standing mandate the same night was "completed, verified by CEO, and shipped."** So the
 * split he ordered and the standard he set were, for about an hour, mutually blocking: the work
 * could be done and could never be marked done. Found by CEO 134 and reproduced before this fix —
 * `--item="unattachedMentions"` against a real Glass row returned
 * *"no open Chart row contains…"*.
 *
 * The default is unchanged, so every existing invocation behaves exactly as before. */
const CHART = args.chart
  ? path.resolve(String(args.chart))
  : path.join(repo, ".planning", "CHART.md");
const INBOX = path.join(repo, ".planning", "wyclau", "INBOX.md");
const REVIEWS = path.join(repo, ".planning", "CEO-REVIEWS.md");
const LEDGER = path.join(repo, ".planning", "CTO-LEDGER.md");

const refuse = (why, fix) => { console.log(`REFUSED: ${why}\n  -> ${fix}`); process.exit(1); };
const usage = (why) => { console.log(`usage error: ${why} (see header of this file)`); process.exit(2); };
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const nowIso = new Date().toISOString().replace(/\.\d+Z$/, "Z");

const item = args.item && String(args.item);
if (!item) usage("--item is required");
const ceoN = args.ceo && String(args.ceo).match(/^\d+$/) && Number(args.ceo);
if (!ceoN) usage("--ceo=<review number> is required");
if (!args.commit && !args.reason) usage("one of --commit=<sha> or --reason=\"…\" is required");
if (args.commit && args.reason) usage("--commit and --reason are mutually exclusive — a diff needs no excuse");

/* 0. Locate the item — exactly one, in the INBOX or the Chart. */
const isInbox = /^INBOX-/.test(item);
let inboxBlock = null, chartRow = null, solutionLine = null;
if (isInbox) {
  const src = read(INBOX);
  if (src === null) refuse(`no INBOX at ${INBOX}`, "the item id names an inbox entry but the inbox file is missing");
  // Sections found by SPLITTING, never by a lazy regex reaching for end-of-file — JS has no \Z
  // anchor, and the first draft's `(?=^## |\Z)` silently truncated every section at its first
  // literal "Z". Found by close_item_check's red side on the day this was written.
  const secs = src.split(/^(?=## )/m);
  inboxBlock = secs.find((s) => new RegExp(`^## ${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s));
  if (!inboxBlock) refuse(`no INBOX entry titled "## ${item}"`, "check the id against .planning/wyclau/INBOX.md");
  if (/^status:\s*DONE/m.test(inboxBlock)) refuse(`${item} is already DONE`, "nothing to close");
  const sol = inboxBlock.match(/^solution:\s*(.+)$/m);
  if (sol && !/^none stated\b/i.test(sol[1].trim())) solutionLine = sol[1].trim();
} else {
  const src = read(CHART);
  if (src === null) refuse(`no Chart at ${CHART}`, "run from the repo root or pass --repo");
  /* ⛔ MATCH THE WHOLE ROW, NOT ITS FIRST LINE. Fixed 2026-09-02, and the bug was self-inflicted
   * in a precise way: this gate refuses an item whose verdict does not "name the item id", and a
   * row's id — its ⟨`T-nnn`⟩ handle — is written on the row's SECOND line. The matcher below used
   * to be `src.split("\n").filter(l => l.startsWith("- [ ]") && …)`, i.e. title-line only.
   *
   * **So the one identifier the gate asks for was the one identifier it could never match.**
   * `--item="T-112"` returned "no open Chart row contains" while `T-112` sat on the next line of
   * the row it was describing. Every close had to be driven by a fragment of prose from the title
   * instead — which then had to appear verbatim in the CEO verdict, so the traceability check was
   * effectively demanding that a reviewer quote a row's headline rather than cite its id.
   *
   * A row runs from one `- [ ]` to the next; the whole block is searched, and `chartRow` stays the
   * TITLE LINE so the tick and pointer at the write step land exactly where they always did. */
  const lines = src.split("\n");
  const heads = [];
  lines.forEach((l, i) => { if (l.startsWith("- [ ]")) heads.push(i); });
  const needle = item.toLowerCase();
  /* ⛔⛔ A ROW ENDS AT THE NEXT ROW **OR THE NEXT `## ` HEADING**, AND THE MISSING HALF OF THAT
   * SENTENCE CORRUPTED HIS RECORD THREE TIMES IN ONE NIGHT.
   *
   * This read `: lines.length` — so THE LAST OPEN ROW'S BLOCK RAN TO END OF FILE and swallowed
   * `## BLOCKED ON WYATT`, `## RULED` and the whole `## THE IDEA INBOX`. Any `--item=` string
   * appearing anywhere below the last checkbox matched that row and nothing else.
   *
   * WHAT IT DID, found by watch c1 causing it a FOURTH time on purpose and reverting by hand:
   *   CHART-LOG.md :1274 — archived under CEO 142, reason about `sitemap.xml`   ← T-098's close
   *                :2228 — archived under CEO 150, reason "recommend, don't build" ← T-102's close
   *                :2295 — archived under CEO 152, reason about the rulings box  ← c1's close
   * **Three different items closed; the same innocent row ticked all three times, each stamped with
   * the real item's verdict.** And the row it ate was `T-137` — a ruling of Wyatt's, GATED on his
   * own look at the live page.
   *
   * ⚠ I READ THAT EVIDENCE BACKWARDS AND BLAMED THE SWEEP, TWICE, IN TWO COMMITS. The archive
   * entries had *"no close pointer"* — I took that as proof they never went through `close_item`.
   * They had pointers; **the pointers belonged to somebody else's item.** A stamp describing work
   * nobody did to that row reads exactly like a missing stamp. *"No evidence of X" and "evidence of
   * something else" are not the same finding.*
   *
   * AND WHY THIS FAULT PICKS ON HIM SPECIFICALLY: the LAST open row in a Chart is structurally the
   * most likely to be a long-waiting GATED row, because those are the ones nothing ever moves. **So
   * it preferentially eats the things waiting on Wyatt** — the one category a session can never
   * finish, and therefore the one that drifts to the bottom and stays there. */
  const blockOf = (h, n) => {
    const hard = n + 1 < heads.length ? heads[n + 1] : lines.length;
    let end = h + 1;
    while (end < hard && !/^## /.test(lines[end])) end++;
    return lines.slice(h, end);
  };
  /* ⛔ A HANDLE THIS ROW *IS*, BEFORE A HANDLE THIS ROW *MENTIONS*. Added 2026-09-03, immediately
   * after the block-matching fix above created this exact problem and then refused a close because
   * of it: `--item="T-076"` matched TWO rows — the row whose handle is `T-076`, and a different row
   * whose body says "see `T-076`". Both are real matches for a substring search, and only one is
   * the item.
   *
   * So: look first for rows carrying the id on their HANDLE LINE — `⟨`T-nnn`⟩`, the line the
   * Chartkeeper writes and nothing else uses. If exactly one row owns it, that is the item, however
   * many others talk about it. Only when no row OWNS the string does this fall back to searching
   * the whole block, which is what makes a prose fragment like "DESTROYS WHATEVER IS WAITING" work.
   *
   * **The general shape, and it is worth carrying: cross-references make text matching ambiguous
   * exactly as a record gets better cross-referenced.** The more the Chart points at itself — which
   * is the thing that makes it useful — the more a substring match degrades. An identity line is the
   * fix, because it is the one place a row asserts what it IS rather than what it is about. */
  const ownedBy = heads.filter((h, n) =>
    blockOf(h, n).some((l) => /^\s*⟨[^⟩]*⟩\s*$/.test(l) && l.toLowerCase().includes(needle)));
  /* ⛔ A HANDLE THAT NO ROW OWNS IS "THERE IS NO SUCH ROW" -- NOT AN INVITATION TO GUESS.
   * The prose fallback below is what lets --item="DESTROYS WHATEVER IS WAITING" work, and it stays.
   * But when the caller names a HANDLE (T-nnn) and no row carries it on its handle line, falling
   * through to a whole-block substring search is how watch c1's --item="T-087" -- an IDEA INBOX
   * bullet with no Chart row at all -- was handed to an unrelated row and closed against it.
   * **"There is no such row" was the honest answer and the tool already had it.** */
  const looksLikeHandle = /^t-\d{3}$/.test(needle.trim());
  if (looksLikeHandle && ownedBy.length === 0) {
    refuse(`no open Chart row OWNS the handle "${item}"`,
      "a row owns a handle on its ⟨T-nnn⟩ line. If the item has no Chart row (an INBOX idea, say) it cannot be closed here -- and being MENTIONED in another row is not ownership.");
  }
  const hits = ownedBy.length === 1 ? ownedBy
    : heads.filter((h, n) => blockOf(h, n).join("\n").toLowerCase().includes(needle));
  if (hits.length === 0) refuse(`no open Chart row ("- [ ]") contains "${item}"`, `check the wording against ${CHART}`);
  if (hits.length > 1) refuse(`"${item}" matches ${hits.length} open Chart rows`, "use a longer, unique substring");
  chartRow = lines[hits[0]];
}

/* 1. The CEO verdict exists and is traceable to THIS item. */
const reviews = read(REVIEWS);
if (reviews === null) refuse(`no ${REVIEWS}`, "the CEO record is missing entirely");
// Split-based for the same \Z reason as the INBOX lookup above.
const revSec = reviews.split(/^(?=## CEO Review )/m)
  .find((s) => new RegExp(`^## CEO Review ${ceoN}\\b`).test(s));
if (!revSec) refuse(`CEO Review ${ceoN} is not in CEO-REVIEWS.md`, "run the CEO (fresh context), append its verdict, then close");
const rev = [revSec];
const short = args.commit ? String(args.commit).slice(0, 7) : null;
const traceable =
  (isInbox && rev[0].includes(item)) ||
  (short && rev[0].includes(short)) ||
  (!isInbox && rev[0].toLowerCase().includes(item.toLowerCase().slice(0, 40)));
if (!traceable) {
  refuse(`CEO Review ${ceoN} never mentions this item (${isInbox ? item : `"${item}"`}${short ? ` or commit ${short}` : ""})`,
    "the verdict must name the item id or the closing commit so the record is traceable — re-run the CEO with the item named");
}

/* 2. A game-code diff, or a stated reason. */
let closeEvidence;
if (args.commit) {
  let files;
  try {
    files = execFileSync("git", ["show", "--name-only", "--format=", String(args.commit)],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").filter(Boolean);
  } catch {
    refuse(`commit ${args.commit} does not exist in this repo`, "pass the sha of the commit that changed the game");
  }
  const game = files.filter((f) => f === "index.html" || f.startsWith("src/"));
  if (game.length === 0) {
    refuse(`commit ${short} touches no game code (index.html or src/) — files: ${files.slice(0, 5).join(", ")}${files.length > 5 ? "…" : ""}`,
      `if this item legitimately changed no game code, close with --reason="…" instead — the reason leads the report and the CEO reviews it`);
  }
  closeEvidence = `commit ${short} (${game.length} game file${game.length === 1 ? "" : "s"})`;
} else {
  const reason = String(args.reason).trim();
  if (reason.length < 10) refuse("the --reason is too short to review", "one honest line: why did this item change no game code?");
  if (reason.length > 300) refuse("the --reason is a paragraph", "one line — the detail belongs in the ledger entry, not the excuse");
  closeEvidence = `no game diff — ${reason}`;
}

/* 3. Solution-first: his stated solution requires the commit that implemented it. */
let solutionEvidence = "no stated solution";
if (solutionLine) {
  if (!args["solution-commit"]) {
    refuse(`Wyatt stated a solution for ${item} ("${solutionLine.slice(0, 60)}…") and no --solution-commit names the commit that implemented it`,
      "his stated solution is tried FIRST (ruling 2026-09-01); pass --solution-commit=<sha>, and the CEO verdict must confirm it implements his words");
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", `${String(args["solution-commit"])}^{commit}`],
      { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    refuse(`--solution-commit ${args["solution-commit"]} does not exist`, "pass the real sha");
  }
  solutionEvidence = `his solution first: commit ${String(args["solution-commit"]).slice(0, 7)}`;
}

/* All evidence present — write the tick, the fate, and the ledger entry TOGETHER. */
const stampShort = nowIso.slice(0, 10);
const pointer = `(closed ${stampShort} · CEO ${ceoN} · ${closeEvidence}${solutionLine ? ` · ${solutionEvidence}` : ""})`;
/* ⛔ EVERY `replace` BELOW PASSES A FUNCTION, AND THAT IS NOT A STYLE CHOICE — IT IS THE WHOLE FIX
 * FOR `T-097`. A replacement STRING is not inert: JavaScript reads `$&`, `` $` ``, `$'` and `$1` in
 * it as commands. Every replacement here is built out of the INBOX or the Chart — **the two files
 * that hold Wyatt's words verbatim** — so a dollar sequence anywhere in his text was executed
 * against his own file at the moment the item closed.
 *
 * IT HAPPENED. 2026-09-02T18:3xZ: an entry quoted this gate's own regex, so it contained a dollar
 * followed by a backtick — *"insert everything before the match"* — and the gate spliced the file's
 * first 34 lines into the middle of the entry, **exited 0, and printed `CLOSED`**. Repaired by hand
 * the same minute, and only survivable because a `` $` `` duplicates rather than deletes.
 *
 * RE-PROVED BEFORE FIXING, not taken from the row: the same shapes with a `$5` and a `` $` `` in
 * his text give 134 characters through a string replacement and 107 through a function — 27
 * characters of the file's header spliced into his sentence.
 *
 * A `$5 bug bounty`, a price, a shell snippet, `$foo` in a bug report: any of them, in any item of
 * his, at the moment it is closed. **A function replacement cannot be interpreted, ever.** */
if (isInbox) {
  const src = read(INBOX);
  const done = `status: DONE ${stampShort} — CEO ${ceoN}, ${closeEvidence}${solutionLine ? `; ${solutionEvidence}` : ""}`;
  /* ⚠ AND THE STATUS BLOCK CAN RUN ACROSS SEVERAL LINES — the second fault on this row, and the
   * naive repair for it is worse than the bug. `/^status:.*$/m` replaces only the first line and
   * leaves the remainder stranded under a line reading DONE: WRONG, but visible and additive.
   * Adding the `s` flag — which is what the row proposed — makes `.*` run to the END OF THE ENTRY
   * and DELETE his prose. So the match is BOUNDED instead: the status line plus any following
   * lines, stopping at the first blank line or heading. One real entry has already had a
   * four-line `status:` repaired by hand, so this shape is not hypothetical. */
  const updated = src.replace(inboxBlock, () =>
    inboxBlock.replace(/^status:[^\n]*(?:\n(?!\s*$|#)[^\n]*)*/m, () => done));
  if (updated === src) refuse(`could not update the status line of ${item}`, "the entry has no 'status:' line — fix the entry format first");
  fs.writeFileSync(INBOX, updated);
} else {
  const src = read(CHART);
  const ticked = chartRow.replace("- [ ]", () => "- [x]") + ` ${pointer}`;
  fs.writeFileSync(CHART, src.replace(chartRow, () => ticked));
}
fs.appendFileSync(LEDGER,
  `\n- ${nowIso} · close_item: ${isInbox ? item : `"${item.slice(0, 60)}"`} · CEO ${ceoN} · ${closeEvidence} · ${solutionEvidence}${args.summary ? ` · ${String(args.summary)}` : ""}\n`);

/* ⚑ AND THE ROW LEAVES THE CHART IN THE SAME BREATH — his ruling, 2026-09-02: *"SWEEP takes EVERY
   completed row, immediately."* IMMEDIATELY is the word this block exists to honour. Sweeping in a
   later step means a finished row sits on his page until somebody happens to run the tool; sweeping
   HERE means the tick and the departure are one act, and there is no window in which the Chart says
   a thing is done.

   THIS IS THE HOOK POINT THE SPEC NAMES, not a convenience: `SPEC-CHARTKEEPER.md`'s "where it runs"
   table puts SWEEP in the Watch because *"it already has write authority, a CEO gate, and
   `close_item.mjs` as a natural hook point."*

   ⚠ IT NEVER FAILS THE CLOSE. The tick, the fate and the ledger line are already on disk by the
   time this runs, and they are the record. If the sweep cannot run, the close still happened and
   the row is merely still visible — so this reports LOUDLY and exits 0, rather than turning a
   filing problem into a lost close. `--no-sweep` is for tests that want the tick alone. */
if (!args["no-sweep"]) {
  try {
    const out = execFileSync(process.execPath,
      /* ⚠ --chart AND --log, NEVER --repo. The Chartkeeper has no `--repo` flag: it roots itself
         from its own file location, so a run passed `--repo=/tmp/fixture` would have ignored the
         flag in silence and swept the REAL Chart. Pass the two paths this file already resolved. */
      [path.join(here, "chartkeeper.mjs"), `--chart=${CHART}`,
       `--log=${path.join(repo, ".planning", "CHART-LOG.md")}`, "--sweep", "--write"],
      { encoding: "utf8", cwd: repo });
    const line = out.split("\n").find((l) => l.startsWith("SWEEP")) ?? "";
    console.log(line ? `  ${line.trim()}` : "  swept (the Chartkeeper printed no SWEEP line — worth a look)");
    console.log("  ⚠ COMMIT .planning/CHART-LOG.md TOO — a sweep whose archive is not committed is a deletion.");
  } catch (e) {
    console.log(`  ⚠ THE TICK IS WRITTEN AND THE SWEEP DID NOT RUN: ${String(e.message).split("\n")[0]}`);
    console.log("  -> the row is closed and still on his Chart; run `node scripts/wyclau/chartkeeper.mjs --sweep --write` by hand.");
  }
}

/* AND PUT THE HANDS DOWN. His ask, 2026-09-02: the page must say what is being worked on RIGHT NOW,
   and "between watches there is no claim: render 'nothing in hand', NEVER the last thing finished."
   The claim is machine-written (`claim_item.mjs`); this is the other end of it, here rather than in
   the Door for the same reason the sweep is here — a step a human has to remember is a step that
   gets skipped, and the failure is silent and reads as work in progress.
   Like the sweep, it NEVER fails the close: the tick and the ledger line are already on disk. */
try {
  execFileSync(process.execPath, [path.join(here, "claim_item.mjs"), `--dir=${repo}`, "--release"], { stdio: "pipe" });
  console.log("  hands down — nothing in hand on this machine (publish_status.mjs carries that to his page)");
} catch (e) {
  console.log(`  ⚠ THE CLOSE IS WRITTEN AND THE CLAIM WAS NOT RELEASED: ${String(e.message).split("\n")[0]}`);
  console.log("  -> his page will keep showing this item as in hand; run `node scripts/wyclau/claim_item.mjs --release`.");
}

console.log(`CLOSED ${isInbox ? item : `"${item.slice(0, 60)}"`} — CEO ${ceoN}, ${closeEvidence}, ${solutionEvidence}.`);
console.log("Now: commit (pull --rebase first), push, republish the Glass, END the turn.");
