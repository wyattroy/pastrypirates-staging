#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
// THE GLASS (wyclau charter, part 4) — the one status page, derived, never hand-typed.
//
// Usage:  node scripts/wyclau/glass.mjs --note "what is happening right now"
//         node scripts/wyclau/glass.mjs --note "..." --demo   (adds 2 EXAMPLE asks to the
//         rendered page ONLY, for a design screenshot — never saved, never part of the real
//         republish workflow; see "DEMO MODE" below)
//
// One command does both halves of the liveness contract:
//   1. stamps the heartbeat (.planning/wyclau/HEARTBEAT — untracked; the watchdog reads it)
//   2. regenerates .planning/wyclau/glass.html from the ground truth
// The session then republishes glass.html to its artifact URL. Everything on the page is
// DERIVED (git, the Chart, the heartbeat, the restart log); nothing here is typed by hand,
// because every hand-typed status number in this project's record went stale.
//
// Honesty rule: a source that cannot be read renders as "unreadable: <why>" — never as empty
// success. (A status page that fails open is a gate aimed at the wrong tree.)
//
// V2 — THE PAGE IS TWO-WAY (Wyatt's ruling, 2026-08-31: "it becomes our interface").
// The page carries a JSON state block and, when Wyatt writes an idea on it, rebuilds its own
// full document with the idea appended and SAVES ITSELF as the new artifact version (the
// "artifact" runtime capability). Sessions watching the artifact are woken by that save.
//
// V2.1 — THE HELM IS FOLDED IN (his instruction, 2026-08-31: "incorporate those changes into
// glass v2"). He can RULE on each blocked question from this page — tap an option, add a note —
// exactly as the separate Helm page allowed. Two pages was one interface too many, and it cost
// something real: he ruled on five questions at 17:02-17:10Z on the Helm and NO SESSION READ
// THEM, so the Glass went on printing "Blocked on Wyatt (6)" while five were already answered.
// Rulings are read by sessions the same way ideas are (the harvest step reads BOTH), which is
// the whole reason they had to live on one page.
//
// V2.2 — THE DASHBOARD REDESIGN (Wyatt's seven priorities, given 2026-08-31 to a cloud session
// and then redirected here: "wait -- i just realized you're in a cloud container. stop this
// work" — visual work needs the rendered picture, and this machine can screenshot and iterate
// locally). What changed, and which of his seven items each change answers:
//   1. Dropped the subtitle line ("Pastry Pirates -- the engine's one honest window. Branch...").
//   2. The boxed ALIVE/STALE verdict is gone. One small line under the title: an emoji plus the
//      age, at a glance. The note text (what is happening right now) sits beside it, muted.
//   3. "Write to Claude" is renamed "Ideas" and moved below "Your call".
//   4. "Shipped today" drops the commit hash and reformats each line to ~5-7 words via
//      shortSubject() below -- THE GENERATOR HALF of his ask. THE OTHER HALF IS A CONVENTION,
//      NOT CODE: a generator cannot summarise a bad subject line into a good one, so this only
//      works if commit subjects keep being written as a short "what" a stripped prefix and an
//      em-dash "why" can split cleanly -- which is already this repo's own commit-message habit.
//   5. "Your call" is its own card, above "Shipped today". DEMO MODE (see above) renders two
//      example asks so the empty state's real format can still be judged from a screenshot.
//   6. "On the Chart" and "The reboot checklist" merge into one "Tasks" list -- open checklist
//      items plus any Chart-inbox items, one source instead of two counts.
//   7. Every section is a bordered card on a background gradient and font matching the game's
//      own palette (index.html's --sea/--teal/--mint/--orange/--ink, Avenir Next), not a generic
//      status-page look.
//
// ⚠ THE HARVEST RULE, AND WHY IT IS LOAD-BEARING: anything Wyatt writes or taps on the page —
// an IDEA or a RULING — lives ONLY in the page's state until a session moves it into
// .planning/CHART.md (ideas → "THE IDEA INBOX"; rulings → "RULED" + .claude/memory/DECISIONS.md).
// This script regenerates the page with an EMPTY ideas list and NO rulings — it cannot read the
// live artifact. So: REPUBLISHING WITHOUT HARVESTING FIRST DELETES BOTH. Before any republish:
// read the artifact (Artifact tool, action "read"), copy every glassState.ideas entry AND every
// glassState.rulings entry into the record, commit, THEN regenerate and republish. Enforced by
// .claude/hooks/glass-harvest-first.cjs; the Door states the step; this is for the code reader.
//
// Publishing note: the page needs the "artifact" capability to save itself. The declaration is
// stored with the artifact and carries forward automatically on every later publish that omits
// `capabilities` — it only needs passing once (capabilities: {artifact: {}}), or again if the
// page reports it cannot save.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
/* THE ONE READING OF WHAT IS OPEN. See the convergence note further down: this file used to carry
   its own copy of the fate rule and the two drifted by eleven rows within hours. One function now. */
import { chunk, stateOf, parkedReason, titleOf, questionId, stripQid, idOfRow, ambiguousHandles, questionOptions } from "./lib/chart_model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WY = join(ROOT, ".planning", "wyclau");
const HEARTBEAT = join(WY, "HEARTBEAT");
const LAST_ACTIVITY = join(WY, "LAST-ACTIVITY");
const RESTARTS = join(WY, "restarts.log");
/* THE PAGE WYATT ACTUALLY READS. Recorded here because it was recorded nowhere, and a session
   cannot republish what it cannot find. If this ever moves, change it here and nowhere else. */
const GLASS_URL = "https://claude.ai/code/artifact/74034bde-ad7e-4861-913e-d5d190801af2";
/* The Helm — RETIRED 2026-08-31, folded into this page at Wyatt's instruction ("one place to go
   to see and decide everything"). Kept only so the retirement notice can be republished to it,
   and so the next reader knows where the five rulings of 17:02-17:10Z came from. Do not build a
   second decision surface again: he ruled there, nobody harvested it for over an hour, and the
   Glass went on printing "Blocked on Wyatt (6)" while five of the six were already answered. */
const HELM_URL = "https://claude.ai/code/artifact/e33ae884-12f2-4dd3-a2c2-9b69f12bc0c1";
const OUT_DEFAULT = join(WY, "glass.html");
/* ONE PUBLISHER (Wyatt's ruling, 2026-08-31, on session sprawl: one WORKER, everything else
   scaffolding). TRACKED, not gitignored: any session, on any machine, writes here by committing,
   rather than publishing the Glass itself. Measured cost of NOT having this, same day: the
   Razer engine and a second session both published the artifact within five minutes, and the
   platform's own conflict guard fired three times before it cleared -- nothing was lost, but it
   is "two things kept in step by nothing" at the publish layer, and it does not scale past two.
   This file is the fix's other half: read on every generation, folded into the note if it holds
   real content, then reset to the template -- so the next run does not re-show a stale message,
   and the reset rides along with whatever commit already follows a generation. */
const GLASS_NOTE = join(ROOT, ".planning", "wyclau", "GLASS-NOTE.md");
const GLASS_NOTE_TEMPLATE = `<!-- GLASS-NOTE.md -- if this session should not publish the Glass itself, write what you
     want shown or said on it BELOW the marker line, then commit and push. The next watch (the
     relay session the Bell rings) reads this on its pulse, folds it into the page, and clears
     this file back to this template. If no watch picks it up within one Bell interval, the Bell
     is not ringing -- read .planning/wyclau/status/ for that machine's own account. -->
---
`;

const argv = process.argv.slice(2);
const note = (() => {
  const i = argv.indexOf("--note");
  return i > -1 && argv[i + 1] ? argv[i + 1] : "(no note given)";
})();
/* DEMO MODE — screenshot-only, never part of a real publish. Wyatt's item 5 asked to "show him a
   few test calls" so the Your-call format can be judged even while the real list is empty (the
   common case: he answers fast). This flag injects two EXAMPLE asks into the RENDERED page only;
   the state block's `ideas`/`rulings` stay real and empty either way, so a --demo render can
   never be mistaken for a page that has actually been published with fake blockers. */
const DEMO = argv.includes("--demo");
/* ⚑ REHEARSAL MODE — `--chart=<path> --out=<path>`. A gate that wants to know what this page does
   with a given Chart had, until 2026-09-02, exactly one way to find out: render the REAL page. That
   stamps the heartbeat (so the freshness clocks report a run nobody made) and CONSUMES
   `GLASS-NOTE.md` — and this project has already lost a watch's note to precisely that, the night
   the Advisor ran `--note` only to look at the page and destroyed the finished screenshot results
   sitting in it (INBOX-20260902T0350Z).
   So: naming a Chart makes the run a rehearsal. It writes ONE file, the one you named, and touches
   nothing else in `.planning/`. **The page itself is built by the same code either way** — there is
   no second rendering path here and there must never be one (rule 23). */
const readOpt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const CHART_OVERRIDE = readOpt("chart");
const REHEARSAL = CHART_OVERRIDE !== null;
const OUT = readOpt("out") ?? OUT_DEFAULT;

/* Markdown markers the Chart uses that this page renders literally if they survive. Kept as
   ONE function because they were being stripped ad hoc in three places and ~~ was missed in
   all of them -- it reached the published page as raw tildes across a struck-through row. */
/* ⚠ AND SINGLE `*` AND BACKTICKS WERE STILL GETTING THROUGH, 2026-09-02. Photographed on his own
   page: `…his words: *"claude my` and `the half of \`T-078\` he asked for`. The pair-only rule
   caught bold and strikethrough and let every italic and every inline code span past it.
   `~` ALONE IS DELIBERATELY LEFT: `~~` is strikethrough and goes, a lone `~` is "about", and this
   Chart says "~90 minutes" in a dozen places — stripping it would promote an estimate to a fact. */
const unmark = (s) => String(s).replace(/\*\*|~~/g, "").replace(/[*`]/g, "");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tryReadTimestamp = (p) => {
  let raw;
  try { raw = readFileSync(p, "utf8"); } catch { return null; }
  const iso = raw.split("\t")[0]?.trim();
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/* LAST PROGRESS VS PAGE PUBLISHED — Wyatt, 2026-08-31: the Glass was showing the page's own AGE
   as if it were the WORKER's age. At 19:55Z it read "🔴 54 min ago" while a commit had landed 12
   minutes earlier — a false alarm on a healthy engine, because the old code drove the dot from
   `state.generatedAt` (when this HTML was written), not from any evidence that work happened.
   ⚠ WHAT THIS CAN AND CANNOT FIX, so nobody re-derives false confidence from it: this page is
   STATIC once published — its numbers tick forward from references frozen at generation time, and
   no reference computed here can retroactively reflect work that happens AFTER this run. So this
   fix cannot make an unpublished-for-hours page stop looking stale; only actually republishing can
   (see mark_glass_published.mjs).
   ⚠ CORRECTED 2026-09-01: this used to name a publish-lag brake in
   .claude/hooks/wyclau-stop-keep-working.cjs as the mechanical half of "make publishing part of
   pulsing". THAT HOOK NO LONGER EXISTS — deleted in claude-kit 2dd722c (the Watch redesign),
   present in neither the kit's hooks nor the game repo's, nor in settings.json. Verified by
   looking, not remembered. So there is NO mechanical brake on an unpublished pulse: the only
   thing that keeps this page moving is a session that CAN publish actually doing it. Do not read
   this paragraph as reassurance — it used to be, and that is exactly why it was wrong.
   ⚠ CORRECTED, CEO Review 52: an earlier version of this comment claimed an administrative re-run
   "now correctly shows an OLDER last progress than page published" as a settled behaviour. Measured
   instead of assumed: `.claude/hooks/wyclau-pulse.cjs` stamps LAST-ACTIVITY on EVERY tool call by
   ANY session, rate-limited to once a minute — so on any page a LIVE session generates, the two
   numbers are typically within about a minute of each other, and the distinction is real but small
   in the common case. It matters for the case this was actually built for: a page regenerated after
   real work had already gone quiet for a while (lastActivityAt genuinely old), not as a general
   "narration vs evidence" gap during active work. What THIS fix does: "last progress" is read from
   REAL evidence — the newer of HEARTBEAT and LAST-ACTIVITY, read BEFORE this run overwrites
   HEARTBEAT, so the act of running glass.mjs itself is never, by construction, mistaken for
   progress on its own. */
const tryGit = (args) => {
  try { return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).trim(); }
  catch (e) { return null; }
};
/* ⚠ REWRITTEN 2026-09-01, AND THE OLD VERSION IS THE POINT. "Last progress" used to be
   max(previous HEARTBEAT, LAST-ACTIVITY). Both inputs were LOCAL and one of them died the same
   day: the pulse hook that wrote LAST-ACTIVITY was deleted with the Watch redesign, and HEARTBEAT
   is written by THIS SCRIPT — so the only surviving input was "when did glass.mjs last run here",
   and the number reduced to a clock measuring itself, blind to every other machine.
   WHAT WYATT SAW: a red dot reading "last progress 213 min ago" while a watch on the Blade had
   pushed 65 minutes earlier and this Mac had landed ten commits since. The work was real; the
   instrument could not see any of it. That is the post-mortem's SHAPE A exactly — an instrument
   measuring something other than what it names — and I introduced it today by deleting the hook
   without noticing what depended on it.
   THE FIX IS TO MEASURE LANDED WORK: the newest commit reachable in this clone, across ALL refs,
   so a watch's push on another machine moves it the moment this one fetches. A commit is work that
   landed, by definition; it cannot be produced by regenerating this page, which is what makes it
   immune to the self-reference the old pair had. If git cannot answer, this falls back to the old
   local reading rather than inventing a time. */
const lastCommitIso = tryGit(["log", "-1", "--format=%cI", "--all"]);
const lastCommitMs = lastCommitIso ? Date.parse(lastCommitIso) : NaN;
const prevHeartbeatAt = tryReadTimestamp(HEARTBEAT);
const lastActivityAt = tryReadTimestamp(LAST_ACTIVITY);
const lastProgressMs = Number.isFinite(lastCommitMs)
  ? lastCommitMs
  : (Math.max(prevHeartbeatAt ?? 0, lastActivityAt ?? 0) || null);

const nowIso = new Date().toISOString();
const lastProgressIso = lastProgressMs ? new Date(lastProgressMs).toISOString() : nowIso;
mkdirSync(WY, { recursive: true });
if (!REHEARSAL) writeFileSync(HEARTBEAT, `${nowIso}\t${note}\n`);
const tryRead = (p) => { try { return readFileSync(p, "utf8"); } catch (e) { return null; } };

// --- pick up whatever another session left in GLASS-NOTE.md, then reset it. Absent, unreadable,
// or holding only the template's own marker line all mean "nothing pending" -- never an error;
// a session that has never written here is the common case, not a fault.
/* ⛔ CONSUMING HIS NOTE IS NOW OPT-IN — `--consume-note`. HIS INSTRUCTION, 2026-09-02 10:45 PM ET:
 *    "okay make sure nothing can destroy my writing -- that is an important task."
 *
 * WHAT THIS FILE USED TO DO: read GLASS-NOTE.md and OVERWRITE IT WITH THE TEMPLATE, on every run,
 * unconditionally. Generating the page and destroying a queued note were one act, so ANY run
 * consumed it — a gate, a probe, a session regenerating the page to look at it.
 *
 * MEASURED THE NIGHT THIS CHANGED, not inferred: a sentinel line was appended to the real
 * GLASS-NOTE.md, `npm test` was run, and the sentinel was GONE. Bisecting the suite named five
 * gates that do it — glass_longrun_status, glass_optimistic_save, glass_roundtrip,
 * glass_script_tag_purity, glass_self_publish. They are not careless: `glass.mjs` resolves its own
 * paths from ITS OWN location regardless of cwd, so a gate CANNOT sandbox it by changing directory,
 * and `glass_script_tag_purity_check.mjs:35-36` says exactly that in its own header. And the
 * Advisor destroyed a note the same way at 8:18 PM by running `--note "probe"` merely to read a
 * number — walking into a hazard already filed at `INBOX-20260902T0350Z`.
 *
 * SO THE FIX IS NOT "MAKE FIVE GATES BEHAVE". It is that the destructive half must be ASKED FOR.
 * Now: the note is folded into the page on every run, and the file is cleared ONLY with
 * `--consume-note`, which the tick's publish step passes and nothing else does.
 *
 * ⚠ THE TRADE, STATED SO NOBODY IS SURPRISED BY IT: if the tick ever forgets the flag, his note is
 * relayed TWICE instead of lost once. That is the right way round — a repeated note is an
 * annoyance he can see and say so about; a destroyed note is words of his that nobody ever reads.
 * FAIL TOWARD KEEPING HIS WRITING.
 */
const CONSUME_NOTE = process.argv.includes("--consume-note");
let relayedNote = null;
{
  const raw = REHEARSAL ? null : tryRead(GLASS_NOTE);
  const body = raw === null ? "" : raw.split(/^---\s*$/m)[1] ?? "";
  const trimmed = body.trim();
  if (trimmed) {
    relayedNote = trimmed;
    if (CONSUME_NOTE) writeFileSync(GLASS_NOTE, GLASS_NOTE_TEMPLATE);
  }
}


/* THE GENERATOR HALF OF ITEM 4. Strips a conventional-commit-style prefix ("word:" or
   "word(scope):") and this repo's own em-dash/double-hyphen "why" clause. It cannot invent a good
   subject from a bad one — the durable half is the commit-message convention itself, unchanged
   by this file.

   ⚠ A RELAY CAUGHT THE FIRST VERSION, 2026-08-31: it hard-chopped at 8 words with a trailing "…",
   which was tested against Wyatt's own two named-bad examples (both happen to carry a "--" clause
   and split cleanly) and never checked against the list it actually renders. Measured against the
   real 12 lines on the page that day: 6 of 12 ended mid-sentence. FIX: prefer the first natural
   CLAUSE boundary (a comma, semicolon or colon) over a hard word count -- most subjects in this
   repo's own style already have one, because they are written as a claim followed by a reason.
   Only a subject with NO such boundary within a reasonable length falls back to a word chop, and
   only THAT path keeps the "…" -- a clause-bounded result is a complete thought and gets none. */
function shortSubject(s) {
  let t = String(s).replace(/^[a-z][a-z0-9_.-]*(\([^)]*\))?:\s*/i, "").trim();
  t = t.split(/\s+(?:—|--)\s+/)[0].trim();
  const clause = t.match(/^[^,;:]+/);
  if (clause && clause[0].trim().length >= 12 && clause[0].trim().length < t.length) {
    return clause[0].trim();
  }
  const words = t.split(/\s+/).filter(Boolean);
  return words.length > 9 ? words.slice(0, 9).join(" ") + "…" : t;
}
/* THE PULSELINE NOTE IS A HEADLINE, NOT A PARAGRAPH. Wyatt, 2026-09-01: "I like the headline on
   'progress' under the status emoji, but make it a headline, a sentence or two, not a paragraph."
   Sessions (including this one) have been passing whole run-summaries as --note text; this caps
   what's DISPLAYED (the full note still prints to the console for the session's own record) to
   the first sentence or two, so the page stays scannable regardless of how long a future --note
   is. */
/* HIS EDIT 2's renderer: one pill per commit, closed by default, opening to the reasoning.
   Written as a FUNCTION rather than inline in the page template because the nested escaping this
   needs (a template inside a template inside a generated string) is exactly where the Glass's own
   self-publish bug lived -- one collapsed backslash and the page stops being a page. Plain string
   concatenation here, no cleverness.
   The BODY is the point: this repo writes its reasoning into commit bodies, so opening a pill is
   how Wyatt gets from "what shipped" to "why". Blank-line-separated paragraphs are kept as
   paragraphs; single newlines are joined, because a body wrapped at 72 columns is not a list. */
/* TRAILERS ARE NOT REASONING. A commit body here ends with Co-Authored-By / Claude-Session lines
   and sometimes a generated-with note; opening a pill to read a session URL is worse than opening
   it to read nothing, because it buries the paragraph that IS the answer. Dropped by SHAPE -- a
   "Some-Header: value" line, or a link to a session -- never by a hand-typed list of exact
   strings, which would rot the moment a trailer is renamed. */
function stripTrailers(body) {
  const lines = String(body || "").split("\n");
  /* Only from the END, which is where git puts trailers. A line that looks like one in the
     middle of a paragraph is somebody's sentence -- three were being eaten ("end-to-end:",
     "bulk-copied:", "Check-in:") before this was positional. */
  const isTrailer = (l) =>
    l.trim() === "" ||
    /^[A-Za-z][A-Za-z0-9-]*:\s*\S/.test(l) ||
    /^\s*\S*\s*Generated with/.test(l) ||
    /^\s*https?:\/\//.test(l);
  let end = lines.length;
  while (end > 0 && isTrailer(lines[end - 1])) end--;
  return lines.slice(0, end).join("\n");
}
function pillHtml(c) {
  const paras = stripTrailers(c.body).split(/\n\s*\n/).map((b) => b.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const why = paras.length
    ? paras.map((b) => '<p class="pillWhy">' + esc(unmark(b)) + "</p>").join("")
    : '<p class="muted">No further detail in this commit.</p>';
  return '<details class="pill"><summary>' + esc(unmark(shortSubject(c.s))) + "</summary>"
    + '<div class="pillBody"><p class="pillSubject">' + esc(unmark(c.s)) + "</p>"
    + why
    + '<p class="pillMeta">' + esc(c.h) + " · " + esc(c.when) + "</p></div></details>";
}

/* ⚠ A SENTENCE ENDS WITH PUNCTUATION FOLLOWED BY A SPACE. A VERSION NUMBER NEVER IS.
   Wyatt's screenshot, 2026-09-02T16:1xZ: his note on the page read *"evidence from before today's
   2026."* and stopped mid-sentence. The old split was `/[^.!?]+[.!?]*​/g` — punctuation ALONE — so
   the first dot of the build stamp `2026.09.01.8` ended the sentence and everything he actually
   wanted to say was thrown away. Same for a file name, a decimal, an ellipsis.
   Requiring the whitespace costs nothing and is what a full stop actually is. */
function shortNote(s) {
  const t = String(s).trim();
  const sentences = t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  let out = (sentences[0] ?? t).trim();
  if (out.length < 60 && sentences[1]) out = (out + " " + sentences[1]).trim();
  return out.length > 200 ? out.slice(0, 200).trim() + "…" : out;
}
/* ⚑ HIS ASK 5, 2026-09-02: "the Glass is SHOUTING at me." The Glass is innocent — `shortTask` takes
   each Chart row's first line verbatim, and watches write row titles in ALL CAPS for emphasis inside
   CHART.md. He offered two fixes and the recommendation was (a), de-shout at render time, because it
   cannot regress; (b) a convention that rows are written in sentence case is prose, and prose rules
   fail here.
   THE RULE HAS TO TELL AN ACRONYM FROM SHOUTING, AND THE DISTINGUISHING FACT IS NOT THE WORD — IT IS
   THE PHRASE. `CEO`, `RED`, `QA`, `GSD` are names and arrive ALONE. Shouting arrives in a row. So:
   downcase a run of TWO OR MORE consecutive all-caps words, and leave a lone one exactly as written.
   Derived from that one observation, not from a list of blessed acronyms — a list like that rots the
   first time somebody writes a new one.
   A token carrying a DIGIT or a DOT is an identifier (`T-088`, `CHART.md`, `2026`), never shouting,
   so it is neither downcased nor counted.
   A ONE-LETTER WORD IS A JOINER, not a break: measured on his real Chart, "FROM A HAND-TYPED NUMBER"
   survived a first version of this because the `A` in the middle ended the run. It now carries the
   run through, and is itself downcased — except `I`, which is a word in English that is always
   capital. That is a fact about the language, not a list of exceptions.

   ⚠ THE COST, STATED BECAUSE IT IS VISIBLE ON HIS PAGE AND HE SHOULD NOT DISCOVER IT: a PROPER NOUN
   caught inside a shouting run comes back lowercase — `WYATT'S OWN TEXT` renders as "wyatt's own
   text". Render-time de-shouting cannot know a name from a noun, and no derivation available here
   can. This is exactly the trade his own row named: (a) de-shout at render time, immediate and
   cannot regress, versus (b) a convention that rows are written in sentence case, durable but prose.
   (a) is shipped; (b) is the follow-up, and it is the only thing that gets his name's capital back. */
function deShout(s) {
  const parts = String(s).split(/(\s+)/);
  /* THE DOT TEST IS ABOUT THE WORD, NOT ITS PUNCTUATION. Measured: `NUMBER.` at the end of a
     sentence was read as an identifier because of its own full stop, so "FROM A HAND-TYPED NUMBER."
     came through shouted while the same phrase mid-sentence did not. Trim the edges first; a dot
     INSIDE a word (`CHART.md`) still protects it. */
  const core = (w) => w.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "");
  const shouty = (w) => { const c = core(w); return /[A-Z]{2,}/.test(c) && c === c.toUpperCase() && !/[0-9.]/.test(c); };
  /* ⚠ A JOINER IS A ONE-LETTER WORD, NEVER PUNCTUATION. The first version let any punctuation-only
     token carry a run through, and on his real Chart that reached ACROSS a clause boundary and ate
     the acronym on the far side: "STILL WORD-SEARCHES FOR THE HEADING — CEO 104's" came back as
     "…the heading — ceo 104's". A dash is where a sentence turns; it ends the shouting. */
  const joiner = (w) => /^\s+$/.test(w) || /^[A-Za-z]$/.test(core(w));
  let i = 0;
  while (i < parts.length) {
    if (!shouty(parts[i])) { i++; continue; }
    let j = i;
    while (j < parts.length && (shouty(parts[j]) || joiner(parts[j]))) j++;
    while (j > i && !shouty(parts[j - 1])) j--;          // a run ends on its last shouted word
    const shouted = parts.slice(i, j).filter(shouty).length;
    if (shouted >= 2) {
      for (let k = i; k < j; k++) {
        if (shouty(parts[k])) parts[k] = parts[k].toLowerCase();
        else if (!/^\s+$/.test(parts[k]) && !/\bI\b/.test(parts[k])) parts[k] = parts[k].toLowerCase();
      }
    }
    i = j;
  }
  const out = parts.join("");
  return out.replace(/^(\W*)([a-z])/, (_, lead, c) => lead + c.toUpperCase());
}
/* Checklist/task lines carry real operational detail (not a commit subject), so this keeps more
   of them — it only drops markdown bold and a trailing *(parenthetical aside)*, then caps long
   ones so the Tasks card stays scannable rather than a wall of text. */
function shortTask(s) {
  /* THE ASIDE IS STRIPPED BEFORE `unmark`, NOT AFTER — its own asterisks are how it is recognised,
     and `unmark` now takes single asterisks, so the old order would have quietly retired this. */
  let t = deShout(unmark(String(s).replace(/\s*\*\([^)]*\)\*\s*$/, "")).trim());
  const words = t.split(/\s+/).filter(Boolean);
  return words.length > 16 ? words.slice(0, 16).join(" ") + "…" : t;
}

// --- shipped today: commits since local midnight, this branch ---
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
/* HIS EDIT 2, 2026-08-31: "Make Shipped Today expandable, with each thing shipped in its own pill,
   clickable to see more information about that commit." So the log has to carry more than a
   subject now -- the body is where this repo's commits keep their reasoning, and that is the thing
   worth opening a pill for. A record separator (\x1e) ends each entry because bodies contain
   newlines and a line-based split would tear them apart. */
const logRaw = tryGit(["log", `--since=${midnight.toISOString()}`, "--pretty=%h\t%cr\t%s\t%b%x1e"]);
const commits = logRaw === null
  ? null
  : logRaw === "" ? [] : logRaw.split("\u001e").map((r) => r.trim()).filter(Boolean).map((rec) => {
      const [h, when, subject, ...body] = rec.split("\t");
      return { h, when: when || "", s: subject || "", body: body.join("\t").trim() };
    });
const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "unreadable: git failed";

// --- the Chart: checklist tallies + task text + blocked-on-Wyatt + inbox items ---
const chart = tryRead(CHART_OVERRIDE ?? join(ROOT, ".planning", "CHART.md"));
let checklist = null, blocked = null, inboxItems = null, tasks = null;
/* HIS ASK 3's DANGEROUS HALF. "If there are no calls for me to make, don't show the Your Call box"
   is one conditional — but `blocked.length === 0` is reachable for TWO completely different reasons,
   and they must not look the same to him:
     (a) genuinely nothing waiting;
     (b) a question written into `## BLOCKED ON WYATT` as PROSE rather than a table row — the
         renderer takes only lines beginning with `|` and skips paragraphs in silence, so the card
         truthfully reports (0) while a real question waits. That is T-077, still open, and he
         caught it in a screenshot on 2026-09-02.
   Hiding (a) is what he asked for. Hiding (b) would bury a real question completely, which is
   strictly worse than the miscount it replaced. So this flag exists, it fails toward SHOWING, and
   the card says out loud that it could not read something. */
let blockedUnreadable = false;
if (chart !== null) {
  const blockSec = chart.split(/^## BLOCKED ON WYATT$/m)[1]?.split(/^## /m)[0] ?? "";
  /* THE READER STAYS BROAD AND DUMB, AND THAT IS THE POINT — it flags ANYTHING it cannot parse, and
     the first draft of the fix tried to make it cleverer instead. That draft warned only on prose
     containing a "?", and it was measured against the real section: THREE of the five prose blocks
     quote his own already-answered questions, marks and all, so the red warning would still have
     been on his page after the work was reported done (CEO 112).
     ONE EXCEPTION, AND ONLY ONE: an HTML comment. A note addressed to WRITERS is not content he is
     missing — the section's own "table rows or nothing" warning was itself the first thing this
     detector flagged, in red, above his real decisions. The rule is enforced on the writer's side by
     `scripts/qa/glass_calm_check.mjs`, so with that gate green there is never anything here to
     find; this line only stops the fence from tripping the alarm it exists to prevent. */
  blockedUnreadable = blockSec.replace(/<!--[\s\S]*?-->/g, "").split("\n")
    .map((l) => l.trim())
    .some((l) => l !== "" && !l.startsWith("|"));
  blocked = blockSec.split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*Question|^\|-+/.test(l) && !/^\|\s*---/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean))
    .filter((c) => c.length >= 2)
    /* THE ID A RULING IS STORED UNDER — one definition, in `lib/chart_model.mjs`, imported by the
       three things that need it: this page (which stamps it), `retire_answered.mjs` (which acts on
       it) and `answered_question_retired_check.mjs` (which gates it).
       ⚠ IT USED TO BE DERIVED HERE, IN ONE LINE, FROM THE QUESTION'S OWN FIRST 40 CHARACTERS — and
       the comment above it called that "stable", which was true of a re-render and false of the two
       things that actually happen: two sibling questions opening the same way collide onto ONE id
       (so his answer to one retires the other), and editing a question's wording orphans the ruling
       he already made. The derived rule is KEPT as the fallback so no existing ruling is orphaned by
       this change landing; new rows carry `<!--qid:…-->` and the gate is what requires it. */
    .map(([q, rec, since]) => ({
      id: questionId(q).id,
      q: unmark(stripQid(q)), rec: unmark(rec ?? ""), since: since ?? "",
      /* HIS NUMBERED OPTIONS — see `questionOptions` in lib/chart_model.mjs for why the buttons
         could not name what he was approving until a question declared them. */
      opts: questionOptions(unmark(rec ?? "")),
    }));
  const inboxSec = chart.split(/^## THE IDEA INBOX$/m)[1]?.split(/^## /m)[0] ?? "";
  /* WHOLE BLOCKS, not first lines. An idea's fate ("SHIPPED", "PARKED", "SCHEDULED") is written
     in the lines UNDERNEATH its bullet, so anything deciding whether an idea is still open has to
     read the continuation too. Reading only line one made the Tasks card count answered ideas as
     work left to do. `head` is what gets shown; `all` is what gets judged. */
  const inboxBlocks = /\(empty/.test(inboxSec) ? [] : inboxSec
    .split(/^(?=[-*] )/m)
    .map((b) => b.trim())
    .filter((b) => /^[-*] /.test(b))
    .map((b) => ({ head: b.split("\n")[0].replace(/^[-*] /, ""), all: b }));
  inboxItems = inboxBlocks.map((b) => b.head);
  /* ⚑ THE ## RULED PARSE IS DELETED WITH ITS CARD (T-087, 2026-09-03) — nothing else read it.
     It said: "HIS RULINGS, DERIVED — the Helm's record migrated into this page. Sourced from the
     Chart's RULED table (never hand-typed here), so a ruling shows on the Glass the moment it is
     harvested, and cannot drift from the record the engine works to."
     Kept as a note rather than left computing an unread value, because a parse with no consumer
     is the thing that looks like coverage and is not: it would go on reading his rulings
     correctly, forever, onto no page. His rulings still cannot drift — they reach him as Tasks
     rows now, which is the surface he steers by. */
  // ITEM 6 — ONE MERGED TASK LIST, not two counts kept in step by nothing. Open items from the
  // reboot checklist (the only checklist section today) plus any Chart-inbox items, in that
  // order — the checklist is the standing plan, the inbox is what just arrived.
  const stepSec = chart.split(/^## STEP 1 CHECKLIST[^\n]*$/m)[1]?.split(/^## /m)[0] ?? "";
  /* ⚑ CONVERGED 2026-09-02, and the divergence had already reached his screen. This read
   * `/^- \[ \] .*$/gm` — the row's first PHYSICAL LINE — while `lib/chart_model.mjs` carried a
   * `titleOf()` whose own comment said it was "the one-line title a human (and the Glass) sees".
   * Two definitions of one thing, one of them claiming to be the other's. Rule 23's question —
   * *what makes these two agree?* — had the answer "nothing", and the cost was visible in row 1 of
   * his real page: `…his words: *"claude my`, cut where CHART.md happens to wrap. There is now one
   * reader, and `chunk()` is the same row-boundary rule the Chartkeeper ranks and sweeps by, so a
   * row cannot mean one thing to the page and another to the tool that orders it. */
  /* ⚑ HIS INTERRUPT, MADE VISIBLE. `T-104`, his words: a DO NOW button "that tells RANK to put this
     task at the top". RANK moving the row is only half of that — his own design says the other half
     out loud: "IT MUST BE VISIBLE ON THE PAGE — he must see what he pinned and whether it has been
     taken. An interrupt he cannot see is indistinguishable from one that was ignored", which is
     exactly what happened to him all day on 2026-09-02.
     The marker is added AFTER `shortTask`, deliberately: `deShout` downcases a run of two capitalised
     words, so "DO NOW" written before it comes out as "Do now" — his own emphasis, quietly removed
     by a rule written for somebody else's shouting. */
  /* ⚑ EACH TASK NOW CARRIES ITS HANDLE, AND THAT IS WHAT MAKES THE DRAG POSSIBLE AT ALL.
     His words, 2026-09-02 3:09 PM ET: "DO NOW: build a way for me to drag to reprioritize the
     chart, in The Glass." A drop has to be able to SAY which row moved, and until now every task
     on this card was a plain string — so there was nothing for a drag to name. The handle rides as
     a data attribute, exactly as the in-hand item's does: machines keep it, he never reads it. */
  const checklistRows = chunk(stepSec, "checklist")
    .filter((c) => c.type === "row" && /^- \[ \] /.test(c.lines[0]))
    .map((c) => ({
      text: c.lines.some((l) => /^\s*⟨[^⟩]*(?:^|·)\s*now\s*:\s*yes\b[^⟩]*⟩\s*$/i.test(l))
        ? `⚡ DO NOW — ${shortTask(titleOf(c.lines))}`
        : shortTask(titleOf(c.lines)),
      handle: idOfRow(c.lines),
      /* ⚑ THE ROW'S OWN BODY — his ask, 2026-09-02: "expandable rows" for fuller context.
       *
       * Until now the page showed ONE truncated line per row and the reasoning lived only in the
       * repo. That is the gap he was describing: he steers by this list, and a list that cannot
       * say WHY a row exists makes him open a file to find out — which on a phone he cannot do.
       *
       * The handle line is dropped (it is already rendered as the drag identity) and the rest is
       * kept verbatim, because the body IS the graveyard — what was tried, what was measured, what
       * a number cost somebody (rule 10). Summarising it here would burn exactly what it is for.
       *
       * CAPPED, and the cap is honest rather than silent: a few of these rows run past a hundred
       * lines, and the whole page is embedded in one artifact. It is truncated at 2000 characters
       * with a line saying so and naming the file, so he is never shown a fragment that reads
       * complete. */
      detail: (() => {
        /* ⚑ THE FULL HEADLINE LEADS THE BODY, and leaving it out was a real hole — CEO 143.
         * The visible line is `shortTask`-truncated at 16 words with an ellipsis, and the body used
         * to be `lines.slice(1)`. So the TAIL OF THE TITLE existed nowhere on the page: his own
         * pinned row ends "…FIVE HOURS OLD WHEN FILED, ASKED FOUR TIMES, NEVER A" and grepping the
         * rendered HTML for that phrase returned nothing. **The one piece of context already cut
         * off on screen was the one the expansion could not give back** — which is the ask, not a
         * nicety. Expanding now opens with the whole headline, then the body. */
        /* ⚠ UNMARKED AND DE-SHOUTED, LIKE THE TITLE BESIDE IT — AND THE FIRST VERSION WAS NEITHER.
         * Carrying the body onto the page raw put literal asterisks, backticks and FULL SENTENCES IN
         * CAPITALS in front of him, and glass_his_five_asks_check failed on all three: "the Tasks
         * card still shouts FIX THE GLASS at him -- his ask 5" and "raw markdown reaches his page --
         * emphasis and code ticks are for the file, not for him."
         *
         * HE ASKED, IN HIS OWN FIVE ASKS, NOT TO BE SHOUTED AT. The visible title has run through
         * deShout(unmark(...)) for weeks; the body I added went round it, so opening a row undid a
         * thing he had asked for. The gate caught it, which is the gate doing its job.
         *
         * THIS IS NOT SUMMARISING AND RULE 10 IS INTACT: every word survives. What is stripped is the
         * MARKUP -- asterisks and backticks are instructions to a file reader, not text -- and
         * shouting is flattened to sentence case. The graveyard stays in the file, in full; what
         * reaches his screen is the same words, legible. */
        const body = [titleOf(c.lines), ...c.lines.slice(1)]
          .filter((l) => !/^\s*⟨[^⟩]*⟩\s*$/.test(l))
          .map((l) => deShout(unmark(l)))
          .join("\n").replace(/\s+$/, "");
        return body.length > 2000
          ? `${body.slice(0, 2000)}\n\n… truncated here — the rest of this row is in .planning/GLASS-CHART.md`
          : body;
      })(),
    }));
  /* ⚠ A HANDLE CARRIED BY TWO OPEN ROWS CANNOT BE DRAGGED, AND THIS IS NOT A DETAIL — IT IS WHAT
     MADE THE FIRST VERSION OF THE DRAG INERT ON HIS REAL CHART. CEO 131 measured it: the page saved
     all 57 rows, three of those handles are carried twice (`T-088`, `T-008`, `T-079` — his own open
     row `T-107` names them), and `chartkeeper --order=` refuses the whole sequence rather than move
     one of two rows nobody can tell apart. So EVERY drag he made died at the command while the page
     told him it was saved.
     The refusal is right and stays. What was wrong was offering him a gesture on a row that cannot
     be named. Such a row is still shown — he steers by this list — and it simply does not move,
     which is the same honest treatment an inbox idea gets. Derived from the rows themselves, never
     from a list somebody typed, so it corrects itself the moment `T-107` is repaired. */
  /* ⚑ THE AMBIGUITY RULE IS NOW IMPORTED, NOT RE-DERIVED HERE — `T-122`, filed by CEO 132.
     This counted duplicates its own way while `chartkeeper --order=` counted them a second way
     (an eleven-line window around a checkbox). **A handle those two disagreed about is this page
     offering him a drag the command then refuses whole — and telling him it saved**, which is
     `T-103`'s original fault returning inside the fix written to close it.
     Rule 23: *what makes these two agree?* Until this line the honest answer was "nothing"; now
     there is one definition, in `lib/chart_model.mjs`, beside `idOfRow`.
     MEASURED BEFORE CONVERGING (`PREDICTION-20260903T1100Z-T122`): the two rules produced the
     IDENTICAL set on both live charts — 22 handles and 26, zero seen by one and not the other — so
     nothing about his page changes today. That is also why this needs a red proof against a chart
     where they DO disagree, rather than "it still passes". */
  const ambiguous = ambiguousHandles(chart);
  const openChecklist = checklistRows.map((r) => ({
    text: r.text,
    handle: r.handle && !ambiguous.has(r.handle) ? r.handle : null,
    detail: r.detail,
  }));
  /* AN IDEA WITH A FATE IS NOT AN OPEN TASK. The inbox exists so every idea gets a fate --
     SHIPPED / SCHEDULED (where) / PARKED (why) -- and once it has one it is resolved, not
     pending. Feeding the whole inbox in made the Tasks card count answered ideas as work left to
     do (seen 2026-09-01: "12 open" included three ideas already shipped and one already parked,
     each rendered as a truncated paragraph of prose). The count is what Wyatt steers by, so an
     inflated one is worse than a missing one.
     Detected by the fate words the Chart itself promises to write, not by a hand-kept list of
     which ideas are done -- a list like that would rot the first time somebody harvested one. */
  /* THE FATE IS DECLARED, NOT MENTIONED. CEO Review 63 caught this being right by luck: the
     first rule searched the whole idea for eight words, and hid an entry whose own verdict reads
     "STILL OPEN, NOT SHIPPED-AND-CLOSED" -- because the word SHIPPED appears inside the phrase
     DENYING it. The answer happened to be correct that day and the reasoning was not, which is
     the kind of check that fails the moment somebody writes a different sentence.
     The Chart declares a fate in one shape, its own convention: an arrow, then the fate in bold
     ("→ **SHIPPED**", "→ **PARKED, low priority**"). Match THAT, so a fate has to be announced
     rather than merely mentioned. */
  /* A FATE IS DECLARED, AND A DENIAL OUTRANKS IT. Two mistakes were made getting here, both
     worth keeping because they are opposite:
       - the first rule searched the whole idea for eight words, and hid an entry whose verdict
         reads "STILL OPEN, NOT SHIPPED-AND-CLOSED" -- the word SHIPPED inside the phrase denying
         it (CEO Review 63: right answer, wrong reasoning);
       - the second demanded the fate be the FIRST word after the arrow, and then showed a fully
         answered idea as open because its verdict opens "THREE SHIPPED AS CODE...".
     So: the fate must be DECLARED (the Chart's own shape -- an arrow, then a bold verdict) and
     the verdict must not explicitly say otherwise. A sentence that says it is still open is the
     most reliable signal on the page, and it beats any word-matching.
     Wyatt steers by the open count; over-hiding costs him more than over-showing. */
  /* ⚑ THREE STATES, NOT TWO — WYATT'S RULING, question UI, 2026-09-02.
   *
   * WHAT WAS WRONG: one list of eight words decided "is this dealt with?", and SCHEDULED sat in it
   * beside SHIPPED and CLOSED. But five of those mean FINISHED, and SCHEDULED means COMMITTED AND
   * NOT DONE — which is the definition of an open task. So the word he uses to promise himself
   * something was the word that hid it.
   *
   * MEASURED ON HIS OWN CHART before it was put to him: 15 ideas, 2 shown, 13 HIDDEN — NINE of them
   * by SCHEDULED alone. He had asked four times for a thing that was, at that moment, invisible on
   * his own page for exactly this reason.
   *
   * AND IT CONTRADICTED THE APPROVED CHARTER IN WRITING. CHARTER.md: "Every idea gets a VISIBLE
   * fate (shipped / scheduled / parked-with-reason) within a day." Scheduled and parked are NAMED
   * as visible fates. This was a defect against a written spec, not a taste call.
   *
   * THREE BUCKETS, and no word may appear in two — DERIVED from these lists, never hand-kept: */
  /* ⚑ CONVERGED 2026-09-02 — THIS FILE NO LONGER OWNS A COPY OF THE FATE RULE.
   *
   * It used to define DECLARED / the three word lists / stateOf right here, and
   * `lib/chart_model.mjs` defined its own. **They diverged within hours of the three-state change
   * landing: the model saw 3 open ideas while this page rendered 14** — a gap of eleven, ten of
   * which were Wyatt's own words, so the Chartkeeper's RANK was ordering a list that did not
   * contain his requests at all.
   *
   * That is rule 23 exactly: *what makes these two agree?* — and until this import existed, the
   * honest answer was "nothing". The gate written to watch for it
   * (`chart_model_agrees_with_glass_check.mjs`) compares COUNTS on a fixture and did not catch a
   * real-Chart divergence, which is worth knowing about that gate.
   *
   * The old blocker was that this file was VENDORED and could not import from the repo's own lib.
   * Wyatt inverted that (the project copy is the truth), so the convergence patch 5 describes is
   * simply done here. */
  /* Only FINISHED hides. Committed and parked are shown, tagged, because he steers by this list
   * and a fate he cannot see is a fate he cannot overrule. */
  /* ⚑ AND THE THIRD CLAUSE, BUILT 2026-09-03 AFTER CEO 155 FOUND IT MISSING. His ruling was
   * "PARKED shows DIMMED WITH ITS REASON", and for a day a parked idea rendered as a bare
   * `PARKED · <title>`: the tag without the why, at full weight beside live work. The reason is
   * derived from the verdict the Chart already declares (`parkedReason`), never hand-typed here. */
  const shownInbox = inboxBlocks
    .map((b) => ({ ...b, state: stateOf(b.all) }))
    .filter((b) => b.state !== "finished")
    .map((b) => ({
      text: b.state === "committed" ? `SCHEDULED · ${b.head}`
          : b.state === "parked"    ? `PARKED · ${b.head}`
          : b.head,
      why: b.state === "parked" ? parkedReason(b.all) : "",
      dim: b.state === "parked",
      /* ⚑ AN INBOX IDEA CARRIES ITS OWN HANDLE NOW, so it can be moved like anything else. The
         owner line is the handle ALONE on a line; an inline mention earlier in the block is a
         reference to some other task and must not be mistaken for this row's identity. */
      handle: (b.all.match(/^\s*⟨`(T-\d{3})`[^⟩]*⟩\s*$/m) || [])[1] ?? null,
    }));
  /* An idea in the inbox has no Chart row yet, so it has no handle and nothing could carry an
     `order:` for it. It is still shown — he steers by this list — but it is not draggable, and the
     page says so rather than letting him move something that would silently snap back. */
  /* `why` and `dim` ride on the task, NOT on `detail` — `detail` renders inside the collapsed
     "more" panel, and a reason he has to tap to see is a reason he cannot see. His word was
     "shows". */
  tasks = [...openChecklist, ...shownInbox.map((t) => ({ text: shortTask(t.text), handle: t.handle, detail: "", why: t.why, dim: t.dim }))];
  // ⚠ A RELAY CAUGHT THE FIRST VERSION, 2026-08-31: the heading's done/open counts were scanning
  // the WHOLE Chart file for any "- [x]"/"- [ ]" while the list underneath came from ONE section
  // plus the inbox -- they happened to agree that day only because every checkbox in the file
  // lived in that one section. Scoped to the same source as the list, so the two cannot drift.
  //
  // ⚑ AND THE "done" HALF MOVED HOUSE ON 2026-09-02, BECAUSE THE FACT DID. It used to count the
  // ticked rows in STEP 1 CHECKLIST. His ruling the same day is that a completed row LEAVES
  // CHART.md the moment it is finished -- so that count was about to become permanently 0, on the
  // very card he reads to see "that the work is being done, right at the top, at a glance" (his
  // words, 2026-08-31). **This dependency is the entire reason the sweep sat blocked for eight
  // hours**, and it is worth naming as a shape: when a record moves, the thing that COUNTS it does
  // not fail -- it quietly starts answering zero.
  //
  // He was offered "done this week" and "remove it entirely" and chose TODAY (question UI,
  // 2026-09-02). A number that only ever grows -- 27, 28, 29 -- cannot tell him whether today went
  // anywhere; a daily one can. Derived from CHART-LOG.md's own entry stamps, never hand-typed.
  //
  // A MISSING LOG IS 0, NOT AN ERROR, and that is deliberate rather than a fail-open: a repo that
  // has never swept anything genuinely has no finished work on record today. The card's OTHER half
  // (the open list) is what goes "unreadable" when CHART.md cannot be read, and it still does.
  const chartLog = tryRead(join(ROOT, ".planning", "CHART-LOG.md")) ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const doneToday = (chartLog.match(/^## T-\d{3} — (\d{4}-\d{2}-\d{2}) /gm) || [])
    .filter((h) => h.includes(today)).length;
  checklist = { done: doneToday, open: tasks.length };
}

/* --- WHAT IS BEING WORKED ON RIGHT NOW — his ask 1, 2026-09-02T16:1xZ: "what is being worked on
   RIGHT NOW? that needs to be visible just underneath the emoji status."

   ⚠ THE FIRST BUILD OF THIS PARSED THE LEDGER'S PROSE, AND THAT WAS MEASURED WRONG THE SAME HOUR.
   `.planning/CTO-LEDGER.md` holds **40** `WATCH` headings and **exactly 4** carry a parseable
   "— claims `X`" shape — all four from the last two hours. The rest are free prose ("— situation and
   claim", "— DID NOT CLOSE ITS ITEM, DELIBERATELY", one with no date at all), and nothing prescribes
   a format: the Door says only *"Claim it in the ledger."* **A regex over that would have shown him
   nothing this morning**, and would go silent again the first time a watch worded its heading
   differently. Spec, CEO-approved with changes: `.planning/SPEC-WHAT-IS-IN-HAND.md`.

   SO THE CLAIM IS WRITTEN THE WAY THE CLOSE ALREADY IS — machine-written, by
   `scripts/wyclau/claim_item.mjs`, into a `## In hand` block of `.planning/wyclau/status/<machine>.md`,
   which is TRACKED and which this file already reads for the long-run block twenty lines below. Same
   shape, same discipline: every doubt resolves to NOT LIVE.

   FOUR STATES, and the fourth is the one he is actually complaining about:
     in hand · nothing in hand · CLAIMED BUT COLD · unreadable
   **COLD exists because a watch can claim and end without closing — twice on 2026-09-02, both
   deliberate.** An open claim outliving its watch is normal here, and it must never read as "being
   worked on right now". It is derived from a `staleAfterMinutes` the block declares itself, so there
   is no new constant on this page.

   ⚠ THIS COMMENT USED TO END: "AND THE TIME IS ABSOLUTE, NEVER 'N MINUTES AGO'. A relative age
   computed at publish and then frozen on a static page is precisely the fault of his ask 2."
   **THE REASON IS FALSE AND HALF THE TRAP IS REAL, AND BOTH HALVES MATTER.** A relative age is
   frozen only if it is computed HERE, in Node. `tick()` runs every 30 seconds in his browser and
   already renders live relative clocks, so a relative age computed THERE is not frozen at all.
   Wyatt then ruled on the absolute version directly (2026-09-02T17:xxZ): "i don't know or care
   about the 'T-088 · claimed 2026-09-02T16:49Z' -- i want to know the content of it." An ISO
   timestamp is the one format on this page he would have to do arithmetic on.

   SO THE CLOCK — AND THE COLD VERDICT WITH IT — BELONGS TO THE BROWSER. What is built here is a
   time-free first paint for a reader with JavaScript off; `claimedAt` and `staleAfterMinutes` ride
   in `glassState` and `tick()` writes the living line. COLD had to move with the clock: it was
   decided here, so a page left open on his phone went on claiming work was in hand forever.

   AND THE HANDLE IS A DATA ATTRIBUTE, NOT A SENTENCE. `T-095` is filing; machines need it and he
   does not. It is NOT looked up in the Chart to get a title — CEO 112 rejected that, because
   `⟨T-088⟩` sits on two different rows and a lookup would have told him confidently that we were
   resizing artwork while we fixed his page. The words come from the claim marker, which has
   demanded them since the day it was written. */
const inHand = (() => {
  let dir;
  try { dir = readdirSync(join(WY, "status")); }
  catch { return { state: "unreadable", why: ".planning/wyclau/status/ could not be read" }; }
  let best = null, sawBlock = false, malformed = false;
  for (const f of dir) {
    if (!f.endsWith(".md")) continue;
    const body = tryRead(join(WY, "status", f));
    if (body === null) { malformed = true; continue; }
    const block = body.split(/^## In hand[^\n]*$/m)[1];
    if (block === undefined) continue;            // an older status file, written before this existed
    sawBlock = true;
    if (/^\s*None recorded\./m.test(block.split(/^## /m)[0])) continue;
    const json = (block.match(/```\s*([\s\S]*?)```/) || [])[1];
    let m; try { m = JSON.parse(json); } catch { malformed = true; continue; }
    if (!m || !m.item || !m.claimedAt || !(m.staleAfterMinutes > 0)) { malformed = true; continue; }
    if (!best || Date.parse(m.claimedAt) > Date.parse(best.claimedAt)) best = m;
  }
  if (malformed && !best) return { state: "unreadable", why: "an In hand block exists but could not be parsed" };
  /* A status file that PREDATES this block is not evidence that nothing is in hand — it is evidence
     that nobody has said. Those two must not render alike, which is this file's standing rule and
     matters most here: "nothing in hand" is a claim about the whole relay. */
  if (!best) return sawBlock ? { state: "none" } : { state: "unreadable", why: "no machine has published an In hand block yet" };
  const ageMin = (Date.now() - Date.parse(best.claimedAt)) / 60000;
  const cold = !(ageMin >= 0 && ageMin <= best.staleAfterMinutes);
  /* THE WORDS, AND ONLY THE WORDS. Three sources in falling order of trust, and the last one is the
     one that matters: a marker written before `handle` existed must never render BLANK.
       1. split field — `item` is already just the words;
       2. legacy marker shaped "T-nnn — words" — strip the handle off the front and keep the handle;
       3. anything else — print it whole. */
  const legacy = /^\s*(T-\d+)\s*[—–-]\s*(.+)$/.exec(best.item);
  const words = best.handle ? best.item : (legacy ? legacy[2] : best.item);
  const handle = best.handle ?? (legacy ? legacy[1] : null);
  return { state: cold ? "cold" : "held", item: best.item, words, handle,
    at: best.claimedAt, stale: best.staleAfterMinutes, watch: best.watch ?? "" };
})();
/* The handle rides as a data attribute so machines keep it and he never reads it. */
const inHandItemHtml = (inHand.state === "held" || inHand.state === "cold")
  ? `<span class="inHandItem"${inHand.handle ? ` data-handle="${esc(inHand.handle)}"` : ""}>${esc(inHand.words)}</span>`
  : "";
const inHandHtml = inHand.state === "unreadable"
  ? `<span class="bad">unreadable: ${esc(inHand.why)} — this page cannot tell you what is in hand</span>`
  : inHand.state === "none"
    /* ⚠ "NOTHING RECORDED", NOT "NOTHING IN HAND" — CEO 112 caught the difference and it matters.
       Only the claim RECORD can be read from here. A watch that works without running
       `claim_item.mjs` is invisible to this page, so "Nothing in hand" would assert something the
       page cannot know — the same class of false statement he complained about, inverted. This says
       exactly what is true: no watch has recorded one. `publish_status.mjs` warns any watch that is
       about to leave the page in this state. */
    ? `<b>Nothing recorded in hand</b> <span class="muted">— no watch has claimed since the last close.</span>`
    /* NO TIME IN THE FIRST PAINT — `tick()` owns it (see the block comment above). With JavaScript
       off he loses the age, which is a smaller loss than a frozen number presented as current; the
       state word is still true as of publish, and it is all Node can honestly say. */
    : inHand.state === "cold"
      ? `<b>⚠ Claimed, and cold:</b> ${inHandItemHtml}<span class="muted" id="inHandAge"> — and no watch has moved since</span>`
      : `<b>In hand:</b> ${inHandItemHtml}<span class="muted" id="inHandAge"></span>`;

// --- restarts (the watchdog appends here) ---
// ⚠ THE HONESTY GAP A RELAY CAUGHT, 2026-08-31: restarts.log is machine-local and gitignored
// (.gitignore:82), so a page generated anywhere but the Razer has NO file to read, and the old
// code rendered that identically to "a log exists and is genuinely empty" -- both said "None
// recorded", which is exactly the fail-open this file's own header rule forbids ("a source that
// cannot be read renders as unreadable, never as empty success"). The restart log IS the 24-hour
// exit test's evidence; a page that understates it understates the proof. So: distinguish FILE
// ABSENT from FILE PRESENT AND EMPTY, and name the machine either way, so "no restarts" always
// answers "on which machine, and did it even have a log to check".
const MACHINE = hostname();
const restartsRaw = tryRead(RESTARTS);
const restarts = restartsRaw === null ? [] : restartsRaw.trim().split("\n").filter(Boolean).slice(-5);
const restartsEmptyMsg = restartsRaw === null
  ? `No restarts.log on this machine (<b>${esc(MACHINE)}</b>) — it is local and gitignored, so this page cannot see another machine's log. This is NOT evidence of zero restarts.`
  : `None recorded on <b>${esc(MACHINE)}</b> — the Bell has not needed to ring a watch here.`;

/* HIS ASK 4, and the SECOND time he has asked (INBOX-20260902T13xxZ, then again 2026-09-02T16:1xZ):
   "the Chart is still not using numbers -- it's using bullet points. it needs numbers."
   Only the Tasks card takes `ordered` — the Bell's log is a list of events, not a queue. The point
   of the numbers is that RANK now orders the Tasks list, and without them the ordering he asked for
   four times is invisible on the page. */
const rows = (list, empty, ordered = false) => list === null
  ? `<p class="bad">unreadable: source file could not be parsed</p>`
  : list.length === 0 ? `<p class="muted">${empty}</p>`
  : ordered
    ? `<ol>${list.map((x) => `<li>${x}</li>`).join("")}</ol>`
    : `<ul>${list.map((x) => `<li>${x}</li>`).join("")}</ul>`;

// --- v2 state: what the page needs to rebuild itself. A fresh generation always starts with an
// EMPTY ideas list — page-born ideas must already have been harvested to the Chart (see header).
// `rulings` is keyed by the question id above: {id: {choice, note, at}}. Same harvest contract
// as ideas — the generator always starts empty, so a republish without harvesting loses them.
/* IS SOMETHING SLOW ACTUALLY HAPPENING? Wyatt, 2026-09-01: "I can see the bosun working right now,
   but the status shows red. You have to fix the way you report status so that it's only red if the
   bosun is truly not working or running any subprocesses."
   The first answer to that was a promise to republish more often, and CEO Review 56 was right to
   call it "a habit, not a mechanism". THIS is the mechanism: a long job (a sea trial) writes
   .planning/wyclau/LONG-RUN as it progresses, including how long its own quiet stretches may
   legitimately last -- a number only the job can know, never one this page invents. Carried onto
   the page so the dot can say "working, 7 of 10 legs" instead of counting minutes since a publish
   and calling that death.
   longRunStatus() resolves every doubt to STALLED (missing, malformed, future-dated, or past its
   own staleness), so a broken marker can never hold the light green -- that would be the timer
   heartbeat of 2026-08-31 rebuilt on the page instead of in a Monitor. */
/* Hoisted out of the try below on 2026-09-03, because there are TWO sources of `longRun` and the
   first fix only covered one. See the block at "if (!longRun)" — a fallback that scans EVERY
   machine's status file. With the override applied to the direct read alone, a fixture that made
   the direct read null let the fallback reach straight past it to the live trial, and the gate
   failed exactly as before. **Two things producing one value, and an override that reached one of
   them, is rule 23 in miniature.** */
const lrRootArg = argv.find((a) => a.startsWith("--longrun-root="));
const LR_ROOT = lrRootArg ? resolve(lrRootArg.slice(15)) : ROOT;
const LR_WY = join(LR_ROOT, ".planning", "wyclau");
let longRun = null;
try {
  /* ⛔ `--longrun-root=<dir>` — SO A GATE NEED NOT BORROW THE LIVE MARKER. Added 2026-09-03 (`T-131`).
   *
   * `glass_longrun_status_check` used to plant its four fixtures in the REAL
   * `.planning/wyclau/LONG-RUN` and put the previous contents back afterwards. A detached sea trial
   * writes that same file as it sails, so with a trial at sea the gate read the TRIAL's JSON where
   * it expected its own fixture — three cases failed, and that is what a red `npm test` was tonight.
   * Worse in principle: the restore writes back a snapshot taken BEFORE the trial's updates, so the
   * suite could freeze a live trial's progress.
   *
   * MEASURED, and the first measurement was the WRONG QUANTITY. A checksum before and after came
   * back identical — the restore works fine when nothing else is writing — which says nothing about
   * the hazard. The right quantity is whether it WRITES AT ALL, because any write is a window:
   * mtime moved 1788413868 → 1788413882 on an untouched marker. **A net-zero change is not the same
   * as never touching it.**
   *
   * THIS IS `--consume-note`'S SHAPE AGAIN, and deliberately so: the generator resolves its own
   * paths from ITS OWN file location, so a gate CANNOT sandbox it by changing directory. The
   * override has to exist here or the destructive coupling cannot be broken at all. And it is a
   * ROOT, not a file path, because `longRunStatus(dir)` derives the marker from a repo root — one
   * definition of where that file lives, not two (rule 23). */
  const lr = await import("./longrun_status.mjs");
  const st = lr.longRunStatus(LR_ROOT);
  if (st.code === lr.PROGRESSING) {
    const m = JSON.parse(readFileSync(join(LR_ROOT, ".planning", "wyclau", "LONG-RUN"), "utf8"));
    longRun = {
      what: m.what ?? "a long run",
      progress: m.progress ?? "",
      updatedAt: m.updatedAt,
      staleAfterMinutes: m.staleAfterMinutes,
    };
  }
} catch { longRun = null; }
/* ...AND A LONG RUN ON ANOTHER MACHINE IS STILL A LONG RUN. The marker above is machine-local, so
   a page generated on the Mac could not see the sea trial sailing on the Blade — it would show no
   job and let the dot go red while a real trial was running, which is precisely the false red
   Wyatt reported on 2026-08-31 and had already been fixed once, locally. The cross-machine half
   only became possible today, when publish_status.mjs started committing each machine's marker
   into .planning/wyclau/status/<hostname>.md.
   SAME DISCIPLINE AS THE LOCAL READ: every doubt resolves to NOT LIVE. A file that will not parse,
   a marker with no updatedAt, no staleness rule of its own, a future date, or one past its own
   rule is ignored rather than trusted — a broken status file must never be able to hold the light
   green, which would be the timer heartbeat of 2026-08-31 rebuilt one directory over. */
if (!longRun) {
  try {
    const statusDir = join(LR_WY, "status");   // honours --longrun-root, same as the direct read
    for (const f of readdirSync(statusDir)) {
      if (!f.endsWith(".md")) continue;
      const body = readFileSync(join(statusDir, f), "utf8");
      const block = body.split("## Long run in flight")[1];
      if (!block) continue;
      const json = (block.match(/```\s*([\s\S]*?)```/) || [])[1];
      if (!json) continue;
      let m; try { m = JSON.parse(json); } catch { continue; }
      if (!m || !m.updatedAt || !(m.staleAfterMinutes > 0)) continue;
      const ageMin = (Date.now() - Date.parse(m.updatedAt)) / 60000;
      if (!(ageMin >= 0 && ageMin <= m.staleAfterMinutes)) continue;   // stale or future-dated
      longRun = {
        what: `${m.what ?? "a long run"} on ${f.replace(/\.md$/, "")}`,
        progress: m.progress ?? "",
        updatedAt: m.updatedAt,
        staleAfterMinutes: m.staleAfterMinutes,
      };
      break;
    }
  } catch { /* no status dir yet, or unreadable -- no long run, never an error */ }
}

/* --- the lesson and the Captain's log (the apprenticeship — charter's co-equal goal) --------
   HIS RULING (2026-09-01, the relay redesign, question round 3): the daily lesson lands ON THE
   GLASS. Source of truth is .planning/wyclau/LESSONS.md — tracked, appended by the advisor or a
   watch, at most one entry per day ("## YYYY-MM-DD — Title" then the body). This page only
   RENDERS it: a lesson typed straight into the page would be the hand-typed-number failure in a
   gown. Honesty rule: a day with no entry says so and shows the newest anyway — a quiet day is
   information, not a blank. */
let lessons = null; // null renders as unreadable, never as empty success (this file's own rule)
try {
  lessons = readFileSync(join(ROOT, ".planning", "wyclau", "LESSONS.md"), "utf8")
    .split(/^(?=## )/m).filter((sec) => sec.startsWith("## ")).map((sec) => {
      const m = sec.match(/^## (\d{4}-\d{2}-\d{2}) [—-]+ (.+)$/m);
      if (!m) return null;
      return { date: m[1], title: m[2].trim(), body: sec.split("\n").slice(1).join("\n").trim() };
    }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
} catch { lessons = null; }
const TODAY = nowIso.slice(0, 10);
const newestLesson = lessons && lessons.length ? lessons[0] : null;

/* ⛔ THE FAULT HE SCREENSHOTTED, 2026-09-03: *"the Lesson is two days old; it is formatted wrong."*
   The body used to render under `white-space:pre-line`, which PRESERVES THE SOURCE FILE'S NEWLINES
   — and `LESSONS.md` is hard-wrapped at ~95 columns for a text editor. So his page broke
   mid-sentence, at the width of somebody's terminal rather than the width of his screen:
   *"...because from the outside a / hard-working session and a dead one look identical."* And
   `esc()` escaped the markdown, so *crash-only design* reached him as literal asterisks.

   ⚑ ESCAPED FIRST, THEN MARKED UP — never the other way round. He writes these lessons, and one
   quoting a tag must arrive as TEXT, not as markup. Reversing these two lines is a live XSS-shaped
   bug on a page only he reads, so `lesson_process_check` case 4 fails the build on the order.

   ⚑ LINES THAT WANT THEIR OWN LINE KEEP THEIR BREAK. Today's lesson is one continuous paragraph,
   but a future one may hold a list or a command — so list markers, quotes and indented lines each
   stay on a line of their own. Flattening everything would trade his fault for a worse one.

   ⚠ AN INDENTED LINE KEEPS ITS BREAK, NOT ITS INDENTATION — it is not a code block, and this
   comment used to claim otherwise. CEO 174 measured it: a four-space-indented command came out
   flush left with no `<code>` around it, while the comment said "indented lines survive". **A
   behavioural claim in a comment, written the same hour, already wrong** — the thing rule 6's
   second half forbids. If a lesson ever needs a real code block, that is a change to make here
   deliberately, not something to assume is already true. */
function lessonHtml(body) {
  return String(body ?? "").split(/\n\s*\n/).map((para) => {
    const lines = para.split("\n");
    /* A line that carries its own structure keeps its break; everything else is editor wrapping
       and gets re-flowed to HIS screen width. */
    const structural = (l) => /^\s*(?:[-*+•⚑⛔⚠]|\d+[.)]|>)\s/.test(l) || /^\s{2,}\S/.test(l);
    const out = [];
    /* ⛔ INDEX THE LOOP, DO NOT SEARCH FOR THE LINE. This read `lines.indexOf(line)` — a VALUE
       lookup — so a paragraph containing the same line twice asked about the FIRST copy's
       predecessor both times. Measured by CEO 174: ["- a bullet","foo","bar","foo"] stranded the
       second "foo" on its own line instead of joining "bar". */
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (structural(line) || out.length === 0) out.push(line.trim());
      else if (structural(lines[i - 1] ?? "")) out.push(line.trim());
      else out[out.length - 1] += ` ${line.trim()}`;
    }
    const joined = out.join("\n").replace(/[ \t]+/g, " ").trim();
    const marked = esc(joined)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    return `<p style="margin:.45rem 0;font-size:.95rem;line-height:1.5">${marked}</p>`;
  }).join("");
}

/* The Captain's log's other half ("Captain", his ruling 2026-09-01 -- "chairman" struck; in-game
   lowercase captains are the players, capital-C Captain on system surfaces is Wyatt): his newest rulings ON RECORD — the top DECISIONS.md headings,
   pointed at rather than restated (a pointer cannot go stale; a copy always can). */
let rulingHeads = null;
try {
  rulingHeads = readFileSync(join(ROOT, ".claude", "memory", "DECISIONS.md"), "utf8")
    .split("\n").filter((l) => /^## /.test(l)).map((l) => unmark(l.slice(3)).trim()).slice(0, 6);
} catch { rulingHeads = null; }

/* `inHand` rides in the state so the BROWSER can age the claim and decide COLD — his 2026-09-02
   correction; see the long comment above the derivation. Null unless something is genuinely held,
   so the client has nothing to say when the record has nothing to say. */
const state = { v: 2, generatedAt: nowIso, lastProgressAt: lastProgressIso, longRun,
  inHand: (inHand.state === "held" || inHand.state === "cold")
    ? { item: inHand.words, handle: inHand.handle ?? null, claimedAt: inHand.at, staleAfterMinutes: inHand.stale }
    : null,
  /* `order` is HIS drag, and it starts NULL on every generation for exactly the same reason
     `ideas` starts empty and `rulings` starts `{}`: this script cannot read the artifact, so a
     republish without a harvest would carry a stale order forward as though he had just made it.
     The harvest contract covers all three — read the live page, take `ideas`, `rulings` AND
     `order`, act on them, then regenerate.
     ⚑ AND NOW `comments` TOO — `{handle: [{text, at}]}`, his per-item comment box (`T-076`).
     It starts EMPTY for the same reason and it is covered by the SAME contract: a republish that
     has not harvested his comments deletes them, exactly as it would his ideas. **There are now
     FOUR things on this page that are his and are lost by an unharvested republish, not three.**
     Keyed by handle so a comment survives the row moving, being re-ranked, or being re-worded —
     the handle is the one identity on a row that is promised never to be reused. */
  ideas: [], rulings: {}, order: null, comments: {} };

// DEMO MODE renders two example asks INTO THE PAGE ONLY (blocked/asks markup below); it never
// touches `state`, so glassState.ideas/rulings on a --demo render are identical to a real one.
/* The demo cards show BOTH shapes on purpose: one with his numbered options and one without, so a
   --demo render proves the fallback still draws rather than only the new path. */
const demoAsks = !DEMO ? [] : [
  { id: "demo-1", q: "Should the wind gauge show forecast, or just the current push?",
    rec: "1. Current push only (recommended) · 2. Show both · 3. Let me toggle it" },
  { id: "demo-2", q: "Ship a small music bed under the lobby screen?", rec: "Not yet — the mute control redesign should land first." },
].map((a) => ({ ...a, opts: questionOptions(a.rec) }));
/* HIS RULING, harvested off the Glass 2026-09-03T15:56:28Z, and it is his THIRD message about
   these buttons: "this is a perfect example of why approve and deny make no sense here -- what
   would approve even mean in response to your above question? REPLACE APPROVE AND DENY WITH
   1 2 3 OTHER, to bring Glass into parity with Claude question UI, and leave the box as a space
   to write other content in."

   SO THE THREE FIXED WORDS ARE GONE. A question that declares its own options gets those; a
   question that declares none gets these three, NUMBERED, so every card he sees is answered the
   same way -- 1, 2, 3, or write in the box.

   THE STORED KEYS ARE STILL yes/no/talk. data-choice is what glassState.rulings holds and what
   paintAsk compares to decide which button shows pressed; renaming them would un-press every
   ruling already on his live page. The LABELS are his; the keys are machinery.

   AND THIS WAS GATED THE WRONG WAY ROUND FOR TWELVE MINUTES. numbered_options_check case 4
   asserted that a prose question KEEPS the word Approve -- so the build would have failed if
   anyone removed the word he had already asked to remove, eight minutes before that gate was
   written. Caught by CEO 174. The assertion is now inverted. */
const DEFAULT_OPTS = [
  { n: "1", label: "Yes — go ahead", recommended: false, key: "yes" },
  { n: "2", label: "No — do not", recommended: false, key: "no" },
  { n: "3", label: "Let us talk about it first", recommended: false, key: "talk" },
];
const askList = [...(blocked ?? []), ...demoAsks];

/* THE PAGE, WITH TWO TOKENS. __GLASS_STATE__ is replaced by the state JSON; __GLASS_TPL__ by a
   JS string literal holding the FULL-DOCUMENT template (tokens intact) so the page can rebuild
   and save itself. Substitution order and document order are load-bearing: the state block sits
   BEFORE the client script, and .replace() takes the first occurrence, so the copies of the
   tokens embedded inside the TPL string are never touched by mistake. The client script uses no
   backticks and no ${} so this outer template literal stays honest. */
const PAGE = `<meta charset="utf-8">
<title>The Glass</title>
<style id="glass-style">
  /* index.html's own :root (~line 45), copied EXACTLY, not approximated: --sea/--sea2/--ink/
     --parch/--paleblue/--teal/--mint/--orange/--lemon/--pink are all the game's own hex values.
     ⚠ CORRECTED, a relay caught the first version overclaiming this: --bg/--bg2/--bg3, the three
     tokens the eye actually sees most (the page background), are NOT from the game -- they are
     invented to sit near the game's palette rather than copied from it. The game's own ground is
     a pale blue sea gradient (index.html:57, var(--sea) to var(--sea2)); this page's is sage to
     parchment. A deliberate choice for readability at status-page scale, not a measurement. */
  :root{--sea:#d3f0f4;--sea2:#bfe8ee;--ink:#1f4249;--parch:#ffffff;--paleblue:#dff3fb;
    --teal:#29a3b2;--mint:#45dfa6;--orange:#fdb63d;--lemon:#fef48b;--pink:#fdaecb;
    --bg:#dcece9;--bg2:#e6efe1;--bg3:#f5f0dd;--surface:var(--parch);--muted:#5c7a80;
    --line:var(--sea2);--accent:var(--teal);--ok:var(--teal);--stale:#c65a3d;
    --warn-bg:#fff6c2;--signal:var(--orange);}
  @media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
    --ink:#e4f3f6;--parch:#152225;--paleblue:#1c2f33;--muted:#8fb3ba;
    --bg:#0f1a1c;--bg2:#122420;--bg3:#1c1f14;--surface:var(--parch);--line:#234146;
    --accent:#54c2cf;--ok:#54c2cf;--stale:#ff9068;--warn-bg:#3a2f12;--signal:var(--orange);}}
  :root[data-theme="dark"]{
    --ink:#e4f3f6;--parch:#152225;--paleblue:#1c2f33;--muted:#8fb3ba;
    --bg:#0f1a1c;--bg2:#122420;--bg3:#1c1f14;--surface:var(--parch);--line:#234146;
    --accent:#54c2cf;--ok:#54c2cf;--stale:#ff9068;--warn-bg:#3a2f12;--signal:var(--orange);}
  body{background:var(--bg);
    background-image:linear-gradient(160deg,var(--bg) 0%,var(--bg2) 45%,var(--bg3) 100%);
    background-attachment:fixed;color:var(--ink);
    font:1rem/1.55 'Avenir Next',Avenir,'Segoe UI','Trebuchet MS',sans-serif;
    margin:0;padding:1rem 1rem 4rem;}
  /* MOBILE WIDTH — Wyatt, 2026-09-01: "not all its divs are constrained... the 'your ruling'
     section forces the whole page to be too wide." Root cause: table{width:100%} is a MINIMUM
     under the default table-layout:auto, not a cap — a long unbroken token in a <td> (a file
     path, a command) makes the browser size the table (and so the whole .sheet, and so the
     whole page) to fit that token, wider than the viewport. table-layout:fixed makes width:100%
     an actual ceiling; overflow-wrap:anywhere on .sheet is the belt-and-suspenders for any other
     card that gets a long unbroken string in the future, so this class of bug can't recur
     one card at a time. */
  .sheet{max-width:40rem;margin:0 auto;overflow-wrap:anywhere;}
  h1{font-size:1.6rem;margin:.8rem 0 .15rem;color:var(--ink);}
  h2{font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);
    margin:0 0 .7rem;font-family:ui-monospace,monospace;font-weight:700;}
  /* ITEM 2 — one line, no box: an emoji and the age, at a glance. The note (what is happening)
     rides beside it, muted, so context is still there without competing for attention. */
  .pulseline{display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;margin:0 0 .25rem;
    font-size:.95rem;}
  .pulseline .age{font-weight:700;color:var(--ink);}
  .pulseline .pulsenote{color:var(--muted);}
  /* HIS ASK 1 — "what is being worked on RIGHT NOW? that needs to be visible just underneath the
     emoji status." Directly under the pulse line, above the page's own age, because what is in hand
     outranks how old the photograph is. */
  .inhandline{margin:0 0 1.3rem;font-size:.95rem;}
  /* EACH CLOCK COLOURS ITSELF. This used to hang off the CONTAINER (.pulseline.stale .age), which
     was correct while there was one clock and is a lie with two: a page published moments ago
     beside progress from an hour ago is exactly the state he reported, and one shared class cannot
     show it. Same 45-minute rule for both, declared once in the client. */
  .pulseline .age.stale{color:var(--stale);}
  .relayNote{font-size:.88rem;color:var(--muted);margin:-.7rem 0 1.3rem;font-style:italic;}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:12px;
    padding:1rem 1.15rem;margin-bottom:1.1rem;box-shadow:0 1px 2px rgba(31,66,73,.05);}
  .card.accentCard{border-color:var(--signal);border-width:1.5px;}
  ul{margin:.3rem 0;padding-left:1.2rem;} li{margin-bottom:.35rem;font-size:.95rem;}
  /* ⚠ touch-action:none IS LOAD-BEARING, NOT A POLISH. Without it the browser claims a vertical
     drag as a page scroll and never delivers pointermove, so the whole reorder is dead on a
     phone — the one device he reads this page on — while working perfectly with a mouse. */
  /* user-select:none IS ALSO NOT POLISH — the first posed desktop drag left the three rows it
     passed over painted in browser-blue selection highlight, because a mouse drag across text is a
     text selection unless something says otherwise. It reads as the page breaking. Caught in the
     screenshot, not in the source; a gate could not have seen it. */
  li.drag{user-select:none;-webkit-user-select:none;
    padding:.15rem .35rem;margin-left:-.35rem;border-radius:5px;
    /* Room at the right for the move-to-top button, which is absolutely positioned so a long row
       title wraps UNDER it instead of shoving it off the line. */
    position:relative;padding-right:3.6rem;}
  /* HIS "MOVE TO TOP" BUTTON (his DO NOW, 2026-09-03: the drag "doesn't work on mobile").
     SIZED AS A THUMB TARGET, NOT AS A LINK. min-height 32px with real padding: this exists BECAUSE
     the fine-grained gesture failed him on a phone, so shipping a 12px hit area would reproduce the
     fault in a different shape. touch-action manipulation keeps the tap immediate and stops the
     row's own touch-action none drag from claiming the press.
     NO BACKTICKS IN THIS COMMENT -- it sits inside the page template literal and one backtick ends
     the string and stops the whole generator parsing. The file says so twice; I did it anyway. */
  .totop{position:absolute;right:.25rem;top:.1rem;
    min-height:32px;min-width:44px;padding:.2rem .45rem;
    font:inherit;font-size:.78em;line-height:1;
    color:var(--muted);background:var(--surface);
    border:1px solid var(--line);border-radius:6px;
    cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}
  .totop:hover{color:var(--accent);border-color:var(--accent);}
  .totop:active{background:var(--paleblue);}
  .totop:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
  /* HIS EXPANDABLE ROWS AND PER-ITEM COMMENT BOX (T-076).
     ⚠ user-select is put BACK to auto inside .rowx. li.drag above turns selection OFF for the
     whole row — correct for a drag handle, and it would have made his own comment text impossible
     to select or correct inside the box he is typing in. The comment on that rule says the symptom
     "reads as the page breaking", and it would have done so again one element deeper.
     touch-action:auto for the same reason: the row disables it so a drag does not scroll the
     page, but a textarea the finger cannot scroll or place a caret in is not a comment box. */
  .rowx{user-select:auto;-webkit-user-select:auto;touch-action:auto;cursor:auto;}
  .rowmore{background:none;border:0;padding:.1rem .3rem;margin:.1rem 0 0 -.3rem;
    font:inherit;font-size:.8em;color:var(--accent);cursor:pointer;text-decoration:underline;}
  .rowmore[aria-expanded="true"]::after{content:" ▴";} .rowmore[aria-expanded="false"]::after{content:" ▾";}
  /* MAX-HEIGHT IS NOT DECORATION: an expanded row can be 2000 characters, and without a cap one
     open row pushes the other twenty-eight off the screen -- seen in the screenshot, not the DOM. */
  .rowdetail{white-space:pre-wrap;font-size:.85em;color:var(--muted);margin:.25rem 0 .4rem;
    padding:.4rem .6rem;border-left:3px solid var(--line);background:var(--paleblue);
    border-radius:0 5px 5px 0;overflow:auto;max-height:22rem;}
  .rowpanel{margin:.1rem 0 .3rem;}
  /* HIS RULING, 2026-09-02: "PARKED shows DIMMED with its reason." Dimmed, not hidden — the whole
     point of the three states is that he can still SEE a parked idea and overrule the parking.
     .72 rather than .5: measured against this page's own --muted text, half opacity on a phone in
     daylight is a row you stop reading, which is the hiding this ruling exists to end. */
  li.dim{opacity:.72;}
  .rowwhy{display:block;font-size:.85em;color:var(--muted);margin:.1rem 0 0;}
  .rowcmt{display:flex;gap:.35rem;align-items:flex-start;margin:.25rem 0 .1rem;}
  .rowcmt textarea{flex:1 1 auto;min-width:0;font:inherit;font-size:.85em;line-height:1.4;
    padding:.3rem .45rem;border:1px solid var(--line);border-radius:5px;resize:vertical;
    background:var(--surface);color:var(--ink);}
  .rowcmt button{font:inherit;font-size:.8em;padding:.3rem .6rem;border:1px solid var(--accent);
    background:var(--accent);color:var(--parch);border-radius:5px;cursor:pointer;}
  .rowsaid{font-size:.8em;color:var(--ok);align-self:center;}
  .rowmine{font-size:.85em;margin:.15rem 0 .3rem;padding:.3rem .5rem;border-radius:5px;
    background:var(--warn-bg);color:var(--ink);}
  .muted{color:var(--muted);} .bad{color:var(--stale);}
  code{font-family:ui-monospace,monospace;font-size:.85em;background:var(--paleblue);
    padding:.05em .3em;border-radius:4px;}
  table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:.9rem;}
  td{padding:.45rem .5rem;border-bottom:1px solid var(--line);vertical-align:top;
    word-break:break-word;overflow-wrap:anywhere;}
  .meta{font-family:ui-monospace,monospace;font-size:.72rem;color:var(--muted);margin-top:1.5rem;}
  .count{font-weight:700;color:var(--signal);}
  /* ⚑ THE .twoCol GRID IS GONE WITH THE CARD IT PAIRED (T-087, 2026-09-03). It carried HIS EDIT 3,
     2026-09-01: "Shipped Today is in the left column, and Your Rulings is on the right column. On
     mobile, one column with Shipped Today is on top." That instruction described a PAIR; he has
     since asked for the right-hand card to be removed, and a two-column grid holding one child is
     a card boxed into half a wide screen with dead space beside it. The phone case was already
     one column, so nothing changes there. The .sheet width below is unrelated and stays. */
  @media (min-width: 64rem){
    .sheet{max-width:62rem;}
  }
  /* HIS EDIT 2: each shipped thing is its own pill, closed, opening to the commit's reasoning. */
  .pills{display:flex;flex-direction:column;gap:.4rem;margin:.3rem 0 0;}
  .pill{background:var(--paleblue);border:1px solid var(--line);border-radius:999px;
    padding:.35rem .8rem;font-size:.92rem;}
  .pill[open]{border-radius:12px;}
  .pill summary{cursor:pointer;list-style:none;}
  .pill summary::-webkit-details-marker{display:none;}
  .pill summary::before{content:"▸ ";color:var(--accent);font-size:.85em;}
  .pill[open] summary::before{content:"▾ ";}
  .pill summary:focus-visible{outline:2px solid var(--signal);outline-offset:2px;border-radius:6px;}
  .pillBody{margin:.5rem 0 .2rem;padding-top:.5rem;border-top:1px solid var(--line);}
  .pillSubject{font-weight:600;margin:0 0 .4rem;}
  .pillWhy{margin:0 0 .5rem;font-size:.9rem;color:var(--ink);}
  .pillMeta{margin:.2rem 0 0;font-family:ui-monospace,monospace;font-size:.72rem;color:var(--muted);}
  /* ITEM 4 — shipped-today as a scannable strip, no hashes: a small dot, the short subject. */
  .shipList{list-style:none;margin:.2rem 0;padding:0;}
  .shipList li{position:relative;padding-left:1.1rem;margin-bottom:.5rem;font-size:.93rem;}
  .shipList li::before{content:"";position:absolute;left:0;top:.45em;width:.5rem;height:.5rem;
    border-radius:50%;background:var(--mint);}
  #ideaText{width:100%;box-sizing:border-box;background:var(--paleblue);color:var(--ink);
    border:1px solid var(--line);border-radius:8px;padding:.7rem;font:inherit;resize:vertical;}
  #ideaSend{margin-top:.5rem;background:var(--teal);color:var(--parch);border:none;
    border-radius:8px;padding:.6rem 1.1rem;font:inherit;font-weight:600;cursor:pointer;}
  #ideaSend:disabled{opacity:.5;cursor:default;}
  /* His DO NOW button. Beside the ordinary send, and deliberately NOT the louder of the two:
     the common case is an idea that can wait, and a page whose shout button is the prettiest
     one teaches him to shout. --signal is the same colour the page already uses for "this is
     your decision". */
  #ideaDoNow{margin-top:.5rem;margin-left:.5rem;background:var(--surface);color:var(--signal);
    border:1.5px solid var(--signal);border-radius:8px;padding:.55rem 1rem;font:inherit;
    font-weight:700;letter-spacing:.04em;cursor:pointer;}
  #ideaDoNow:disabled{opacity:.5;cursor:default;}
  #ideaDoNow:focus-visible{outline:2px solid var(--signal);outline-offset:2px;}
  .pinTag{display:inline-block;font-weight:700;color:var(--signal);letter-spacing:.04em;
    font-size:.78rem;margin-right:.35rem;}
  #ideaText:focus-visible,#ideaSend:focus-visible{outline:2px solid var(--signal);outline-offset:2px;}
  .ask{background:var(--paleblue);border:1px solid var(--line);border-radius:10px;
    padding:.9rem 1rem;margin-bottom:.9rem;}
  .ask.ruled{border-color:var(--signal);}
  .ask .q{font-weight:700;margin:0 0 .3rem;}
  .ask .rec{color:var(--muted);font-size:.92rem;margin:0 0 .7rem;}
  .ask .rec b{color:var(--ink);}
  .ruleRow{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;}
  .rb{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;
    padding:.5rem .9rem;font:inherit;cursor:pointer;}
  .rb[aria-pressed="true"]{background:var(--teal);color:var(--parch);border-color:var(--teal);font-weight:600;}
  /* HIS NUMBERED OPTIONS. Full-width and stacked, because the labels are sentences rather than
     single words and a row of them would wrap into an unreadable hedge on a phone. The NUMBER is
     the thing he reads first -- he asked to "reply with 1, 2, 3, 4" -- so it is bold and leads. */
  .rb.num{display:flex;align-items:baseline;gap:.5rem;width:100%;text-align:left;line-height:1.4;}
  .rb.num b{color:var(--accent);font-size:1.05em;min-width:1ch;}
  .rb.num[aria-pressed="true"] b{color:var(--parch);}
  .ruleRow:has(.rb.num){flex-direction:column;align-items:stretch;}
  .recTag{margin-left:auto;padding:.1rem .45rem;border-radius:999px;background:var(--lemon);
    color:#5a4a00;font-size:.72em;font-weight:600;white-space:nowrap;}
  .rb.num[aria-pressed="true"] .recTag{background:var(--parch);color:var(--ink);}
  .rnote{width:100%;box-sizing:border-box;background:var(--surface);color:var(--ink);border:1px solid var(--line);
    border-radius:8px;padding:.5rem;font:inherit;font-size:.93rem;resize:vertical;}
  .rstate{margin:.4rem 0 0;font-size:.88rem;}
  .rb:focus-visible,.rnote:focus-visible{outline:2px solid var(--signal);outline-offset:2px;}
  .demoTag{display:inline-block;font-family:ui-monospace,monospace;font-size:.68rem;
    letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border:1px dashed var(--line);
    border-radius:6px;padding:.1rem .4rem;margin-left:.4rem;}
</style>
<script type="application/json" id="glassState">__GLASS_STATE__</script>
<div class="sheet">
  <h1>The Glass</h1>
  <!-- HIS ITEM 2, 2026-09-02T17:xxZ, and the wording is his own, adopted verbatim: "'page published
       3 min ago — it cannot see anything newer than that' should be up next to '🟢 last progress 6
       min ago' as ONE STATUS BAR WITH FEWER WORDS: '🟢 Progress: 6 min ago. 🟢 Updated: 4 min ago.'"
       BOTH CLOCKS STAY — that was his own 2026-08-31 ask and they are load-bearing: Progress answers
       "is work landing", Updated answers "how old is this page", and the fact that they can disagree
       IS the signal. The apology that used to hang off the second one is gone; the Updated clock
       says the same thing in two words. TWO DOTS, colouring independently, because a fresh page
       reporting stale progress is exactly the state he reported. -->
  <div class="pulseline" id="pulse">
    <span id="pulseEmoji">🟢</span><span class="age" id="age">Progress: —</span>
    <span id="updatedEmoji">🟢</span><span class="age" id="updated">Updated: —</span>
    <span class="pulsenote" id="noteText">${esc(shortNote(note))}</span>
  </div>
  <p class="inhandline" id="inHand">${inHandHtml}</p>
  ${relayedNote ? `<p class="relayNote">From another session, folded in on this pulse: ${esc(relayedNote)}</p>` : ""}

  ${askList.length === 0 && !blockedUnreadable ? "" : `<section class="card accentCard">
    <h2>Your call (${askList.length}${DEMO ? " + 2 demo" : ""})</h2>
    ${askList.length === 0
      ? `<p class="bad">This page could not read part of BLOCKED ON WYATT — there is content in that section that is not a table row, so a question may be waiting there that this card cannot show. Open .planning/CHART.md.</p>`
      : `${blockedUnreadable ? `<p class="bad">…and there is more in that section this page could not read — content that is not a table row. Open .planning/CHART.md.</p>` : ""}<div id="asks">${askList.map((b) => `<div class="ask" data-id="${esc(b.id)}">
      <p class="q">${esc(b.q)}${b.id.startsWith("demo-") ? `<span class="demoTag">example — not real</span>` : ""}</p>
      ${b.opts.length ? "" : `<p class="rec"><b>My recommendation:</b> ${esc(b.rec)}</p>`}
      <!-- HIS WORDS, DO NOW pin, 2026-09-03 10:22 AM ET: "Change the buttons that say Do It and
           Don't to Approve and Deny". Two labels, and only two — "Let's talk" is not in his
           sentence and is left exactly as it was.
           NOTE FOR WHOEVER EDITS THIS COMMENT NEXT: it lives inside a JS template literal, so a
           backtick here ends the string and the whole generator stops parsing. That is not a
           guess — the first version of this comment did exactly that. No backticks below.
           THE data-choice VALUES DO NOT MOVE WITH THE LABELS. They are the KEY stored in
           glassState.rulings, and the redraw below compares a saved ruling against them to decide
           which button shows as pressed. Renaming a value would un-press every answer already
           saved on his live page. Gated: glass_ruling_button_words_check.mjs case 4. -->
      <div class="ruleRow">${(b.opts.length ? b.opts : DEFAULT_OPTS).map((o) => `<button type="button" class="rb num" data-choice="${esc(o.key ?? `opt${o.n}`)}" data-label="${esc(o.label)}"><b>${esc(o.n)}</b> ${esc(o.label)}${o.recommended ? `<span class="recTag">recommended</span>` : ""}</button>`).join("")}
      </div>
      <textarea class="rnote" rows="2" placeholder="Other — write your own answer here. Your words outrank the buttons."></textarea>
      <p class="muted rstate"></p>
    </div>`).join("")}</div>`}
  </section>`}

  <section class="card">
    <h2>Ideas</h2>
    <p class="muted" id="ideaCapNote">Checking whether this view can save…</p>
    <div id="ideaForm" hidden>
      <textarea id="ideaText" rows="3" placeholder="An idea, feedback, a bug you noticed — any words. It lands on the Chart and gets a fate."></textarea>
      <!-- HIS OWN WORDS, 2026-09-02 3:09 PM ET: "in the Glass, Add a 'DO now' button next to 'Send
           to the Chart' button that tells RANK to put this task at the top". NEXT TO, not instead
           of: the ordinary send is still the common case and stays first. -->
      <button id="ideaSend" type="button">Send to the Chart</button>
      <button id="ideaDoNow" type="button" title="Send it and put it at the top of the list">DO NOW</button>
      <p class="muted" id="ideaStatus"></p>
    </div>
    <div id="ideaList"></div>
  </section>

  <!-- HIS EDIT 1: Tasks moved ABOVE Shipped Today. What is still to do outranks what is done.
       AND ABOVE THE LESSON, 2026-09-02 — he asked for that FIVE times and it did not move:
       00:59:32Z "Move The Lesson section below it" · 03:45:45Z "Move The Lesson to below Tasks"
       · and three more since. The reason it never moved is worth keeping, because it is the whole
       failure of that night in one line: this file is VENDORED, so the edit was legal only from
       claude-kit, and every session that could see the ask could not make it. His ruling inverted
       that (the project copy is the truth); this is the first edit made under it.
       WHERE HE IS GOING OUTRANKS WHAT HE LEARNED YESTERDAY. -->
  <section class="card">
    <!-- "done TODAY", not "done". The number resets at midnight by design (his pick over "this
         week"), and an unlabelled count that silently drops to 0 overnight reads as work having
         been LOST — which would be worse than the ever-growing number it replaced. -->
    <h2>The Chart (Tasks To Do) — ${checklist === null ? "?" : checklist.done} done today · ${checklist === null ? "?" : checklist.open} open</h2>
    <!-- HIS WORDS, 2026-09-02 3:09 PM ET: "DO NOW: build a way for me to drag to reprioritize the
         chart, in The Glass." The drag lives here rather than in a separate editor because this is
         the list he already reads; a second screen showing the same rows in a different order is
         two things kept in step by nobody (rule 23).
         A row he can drag carries its handle. An inbox idea has no Chart row yet, so it has no
         handle, and it is rendered plainly and left alone. -->
    ${tasks === null ? `<p class="bad">unreadable: CHART.md missing or unparseable</p>`
      : tasks.length === 0 ? `<p class="muted">Nothing open — full detail in .planning/CHART.md.</p>`
      : `<p class="muted" id="orderNote">Tap ▲ top on any task to move it up. Where you put it is where a watch starts.</p>
      <ol id="taskList">${tasks.map((t) => {
          /* HIS TWO REMAINING GLASS-PAGE ASKS (T-076, pinned "PRIORITIZE this at the top"):
             EXPANDABLE ROWS and A COMMENT BOX UNDER EACH ITEM. Both are built here, on the row he
             already reads, for the same reason the drag was (rule 23): a second screen showing the
             same rows is two things kept in step by nobody.

             ⚠ EVERYTHING INTERACTIVE SITS INSIDE .rowx, AND THAT IS LOAD-BEARING, NOT TIDINESS.
             The drag binds pointerdown on li.drag and captures the pointer, so without this
             wrapper a tap on the comment box would start dragging the row instead of placing the
             caret — his own drag feature would eat his own comment box. The handler skips any event
             that starts inside .rowx. */
          /* ⚠ ONE TOGGLE, AND THE COMMENT BOX LIVES INSIDE IT — CHANGED AFTER LOOKING AT THE PICTURE.
             The first build put an always-open comment box under every row. Every assertion passed
             (29 rows, 26 boxes, nothing thrown) and the SCREENSHOT killed it: twenty-six permanently
             open text fields turn the one list he steers by into a wall of form. The page at rest
             must be the short scannable list; the box appears when he opens a row to read it, which
             is also when he has something to say about it. Rule 19 — the checks were honest and were
             measuring something other than the thing that was wrong. */
          const panel = (t.detail ? `<div class="rowdetail">${esc(t.detail)}</div>` : ``)
            + (t.handle
                ? `<div class="rowcmt"><textarea rows="1" placeholder="Comment on this item…"></textarea>`
                  + `<button type="button" class="rowsend">Save</button>`
                  + `<span class="rowsaid" hidden></span></div>`
                : ``);
          const extras = panel
            ? `<div class="rowx"><button type="button" class="rowmore" aria-expanded="false">more</button>`
              + `<div class="rowpanel" hidden>${panel}</div></div>`
            : ``;
          /* PARKED, and only PARKED, is dimmed and carries its reason on the visible line — his
             three-state ruling. An OPEN or SCHEDULED row is live work and must not be greyed. */
          const why = t.why ? `<span class="rowwhy">${esc(t.why)}</span>` : ``;
          const dim = t.dim ? " dim" : "";
          /* ⚑ HIS DO NOW PIN, 2026-09-03T18:28:56Z, and it is HIS design, not a guess at one:
             *"Def to move doesn't work on mobile. New idea: add a 'move to top' button to the right
             of each item in the list. I click it once, it puts it at the top of the list."*

             ⛔ THE DRAG WAS BUILT ON POINTER EVENTS SPECIFICALLY SO IT WOULD WORK ON HIS PHONE, and
             the comment where it lives says so at length — *"dragstart/drop do not fire on iOS
             Safari at all… pointerdown/pointermove is ONE code path for mouse and touch."* **He is
             telling us it still does not work.** So this is not a second way of doing the same
             thing to be kept in step (rule 23); it is the gesture that WORKS on the device he
             actually reads this on, and the drag stays because it is fine on the laptop. Both
             commit through the same `saveOrder()` — one order, one save path, two ways to reach it.

             A BUTTON, NOT A DRAG TARGET: one tap, no gesture to learn, nothing to hold, and it
             cannot be swallowed by the page scrolling under a finger — which is the most likely
             reason the drag fails for him. `type="button"` so it never submits anything. */
          /* ⛔ NO `data-handle` ON THE BUTTON — IT READS ITS ROW'S. Putting one here gave every task
             row TWO elements carrying a handle, and `chartkeeper_check` counts them to answer "how
             many rows can he drag?": it reported 8 draggable rows where there are 4, and the
             ambiguity guard fired on a clean Chart. **The gate was right and my markup was wrong**,
             so the markup moved. Loosening a counter to fit a new element is how a gate stops being
             able to see the thing it counts. */
          const toTop = t.handle
            ? `<button type="button" class="totop" title="Move this to the top of the list" aria-label="Move to top">▲ top</button>`
            : ``;
          return t.handle
            ? `<li class="drag${dim}" data-handle="${esc(t.handle)}"><span class="rowtitle">${esc(t.text)}</span>${why}${extras}${toTop}</li>`
            : `<li class="${dim.trim()}"><span class="rowtitle">${esc(t.text)}</span>${why}${extras}</li>`;
        }).join("")}</ol>`}
      <!-- ⚠ THE NOTE SITS ABOVE THE LIST, NOT UNDER IT — CEO 131's finding 4. Underneath, the
           confirmation of a drag near the top of a 57-row list was fifty rows below his finger, on
           a phone showing eight of them. A confirmation he cannot see is the fault this whole
           item exists to remove, one level up. -->
  </section>

  <section class="card">
    <h2>${newestLesson && newestLesson.date === TODAY ? "Today's lesson" : "The lesson"}</h2>
    ${lessons === null ? `<p class="bad">unreadable: .planning/wyclau/LESSONS.md missing or unparseable</p>`
      : !newestLesson ? `<p class="muted">No lessons recorded yet — the day's close owes the first one.</p>`
      : `${newestLesson.date === TODAY ? "" : `<p class="muted">No lesson yet today — the day's close owes one. The newest, from ${esc(newestLesson.date)}:</p>`}
      <p style="font-weight:600;margin:.2rem 0 .35rem">${esc(newestLesson.title)}</p>
      <div class="lessonBody">${lessonHtml(newestLesson.body)}</div>`}
  </section>

  <!-- ⚑ "YOUR RULINGS, IN HAND" IS GONE — Wyatt, on this page, 2026-09-02T13:18:28.755Z: "Remove
       the 'Your rulings in hand' box from the Glass" (T-087). It showed him his own answers back;
       what he steers by is the work they turn into, and that is the Tasks card.

       HIS EDIT 3 WENT WITH IT, and that is why the grid is gone rather than left holding one
       child: "Shipped Today is in the left column, and Your Rulings is on the right column. On
       mobile, one column with Shipped Today is on top." A .twoCol holding a single card is two
       equal columns with one of them empty at 64rem and wider — a DESKTOP breakpoint, not a phone
       one; the first draft of this note said "phone breakpoint" and CEO 151 was right that it was
       backwards, since the phone case is the grid simply not applying — so deleting the card
       without unwrapping the grid would have left Shipped today boxed into the left half of a
       wide screen with dead space beside it. The phone case was already one column and is
       unaffected.

       WHAT THIS COST, WRITTEN DOWN BECAUSE THE NEXT READER WILL ASK WHERE HIS RULINGS WENT: this
       card was the only surface rendering the Chart's RULED waiting room. Four of his rulings
       were sitting in it the day it was removed. That section is now session-facing only, so a
       ruling has to be triaged in the same act that harvests it — task row if it owes work,
       straight to SETTLED if it does not. scripts/qa/rulings_triage_check.mjs case 5 fails the
       build on any ruling parked there without a task row, which is the protection this card used
       to give, moved onto the record. -->
  <section class="card">
    <h2>Shipped today (${commits === null ? "?" : commits.length} commits)</h2>
    ${commits === null ? `<p class="bad">unreadable: git log failed</p>`
      : commits.length === 0 ? `<p class="muted">Nothing yet today.</p>`
      : `<div class="pills">${commits.slice(0, 12).map(pillHtml).join("")}</div>${commits.length > 12 ? `<p class="muted">…and ${commits.length - 12} more</p>` : ""}`}
  </section>

  <section class="card">
    <h2>The Captain's log</h2>
    ${lessons === null ? `<p class="bad">unreadable: .planning/wyclau/LESSONS.md</p>`
      : lessons.length === 0 ? `<p class="muted">No concepts on record yet.</p>`
      : `<p class="muted" style="margin:.1rem 0 .4rem">Concepts you own — one per lesson, newest first (${lessons.length}):</p>
      <ul>${lessons.slice(0, 10).map((l) => `<li><b>${esc(l.title)}</b> <span class="muted">· ${esc(l.date)}</span></li>`).join("")}</ul>`}
    ${rulingHeads === null ? `<p class="bad">unreadable: .claude/memory/DECISIONS.md</p>`
      : `<p class="muted" style="margin:.6rem 0 .4rem">Your newest rulings on record — full text in DECISIONS.md:</p>
      <ul>${rulingHeads.map((h) => `<li style="font-size:.9rem">${esc(h)}</li>`).join("")}</ul>`}
  </section>

  <section class="card">
    <h2>The Bell's log (last 5, on ${esc(MACHINE)})</h2>
    ${rows(restarts.map(esc), restartsEmptyMsg)}
  </section>

  <p class="meta">Generated ${esc(nowIso)} on <b>${esc(MACHINE)}</b> by scripts/wyclau/glass.mjs — every number above is derived, none hand-typed. The relay regenerates this page at every watch boundary; stale much beyond one watch means the Bell is not ringing — read .planning/wyclau/status/ for the machine's own account.</p>
</div>
<script>
  (function(){
    "use strict";
    var state;
    try { state = JSON.parse(document.getElementById("glassState").textContent); }
    catch (e) { state = { v: 2, generatedAt: "${nowIso}", lastProgressAt: "${nowIso}", ideas: [] }; }

    // --- freshness. TWO clocks, on purpose (Wyatt, 2026-08-31): tProgress answers "is work
    // landing", tPublished answers "how old is THIS page" — they can legitimately disagree, and
    // showing both is the fix. Neither can see work that happens after this page was generated;
    // only republishing closes that gap, which is a discipline this page cannot enforce on itself.
    // SINCE 2026-09-01 tProgress is the newest COMMIT in the clone (see the generator), not a
    // local heartbeat: a watch pushing from another machine now moves it, and regenerating this
    // page no longer can.
    var tProgress = new Date(state.lastProgressAt || state.generatedAt);
    var tPublished = new Date(state.generatedAt);
    /* HIS ASK 2, 2026-09-02: he read "last progress 25 min ago" while work was four minutes old.
       ⚠ THE ROW THAT FILED THIS ASKED FOR A FIX THAT WAS ALREADY BUILT — "make the page compute its
       own age in the browser". It already did, and had for a day: tick() runs every 30s and both
       clocks are live. So implementing the row as written would have changed nothing and been
       reported as a fix. Measured before touching it, which is the only reason it was caught.
       THE REAL DEFECT IS THAT BOTH LIVE NUMBERS ARE BOUNDED BY A FROZEN ONE. lastProgressAt is
       whatever was true when this page was PUBLISHED; a static page cannot learn about work that
       lands afterwards. His 25 minutes was arithmetically honest and factually stale, and nothing on
       the page said so.
       ⚠ AND THE SENTENCE THAT USED TO BE THE ANSWER HERE IS GONE, ON HIS OWN INSTRUCTION
       (2026-09-02T17:xxZ). It read "— it cannot see anything newer than that", hanging off a second
       line under the bar; he replaced both lines with ONE bar in his own words: "🟢 Progress: 6 min
       ago. 🟢 Updated: 4 min ago." The honesty it carried did not go with it — the Updated clock IS
       the statement that this page is a photograph, and it is now the second dot's whole job.
       THE CURE IS STILL NEITHER OF THOSE: it is republishing when work lands, the Door's step 6b. */
    /* ONE STALENESS RULE, DECLARED ONCE, USED BY BOTH DOTS. It is the same 45 minutes the single
       dot already used — no new constant was invented for the second one. Two copies of a threshold
       are two things kept in step by nothing, which is the fault this page keeps having. */
    var STALE_MIN = 45;
    function fmtAge(ms){
      var m = Math.floor(ms/60000);
      return m < 1 ? "moments ago" : m + " min ago";
    }
    /* HIS IN-HAND LINE, WRITTEN HERE AND NOT IN NODE — so the age is live and, more importantly, so
       the COLD verdict is live: a page left open on his phone must stop claiming work is in hand
       once the claim goes stale, rather than holding a judgement made at publish time.
       Built with textContent rather than innerHTML: the item words are a machine-written record, but
       they are still text this page did not author, and this is the one place a claim string reaches
       the DOM. */
    function paintInHand(){
      var ih = document.getElementById("inHand"), m = state.inHand;
      if (!ih || !m || !m.claimedAt || !(m.staleAfterMinutes > 0)) return;
      var ms = Date.now() - new Date(m.claimedAt).getTime();
      var cold = !(ms >= 0 && ms/60000 <= m.staleAfterMinutes);
      var lead = document.createElement("b");
      lead.textContent = cold ? "⚠ Claimed, and cold:" : "In hand:";
      var words = document.createElement("span");
      words.className = "inHandItem";
      if (m.handle) words.setAttribute("data-handle", m.handle);
      words.textContent = m.item;
      var age = document.createElement("span");
      age.className = "muted"; age.id = "inHandAge";
      age.textContent = " · started " + fmtAge(ms) + (cold ? ", and no watch has moved since" : "");
      ih.innerHTML = "";
      ih.appendChild(lead); ih.appendChild(document.createTextNode(" "));
      ih.appendChild(words); ih.appendChild(age);
    }
    function tick(){
      var age = document.getElementById("age"), emoji = document.getElementById("pulseEmoji"),
          upd = document.getElementById("updated"), updEmoji = document.getElementById("updatedEmoji");
      var progressMs = Date.now() - tProgress.getTime();
      var publishedMs = Date.now() - tPublished.getTime();
      paintInHand();
      /* THE UPDATED CLOCK IS WRITTEN FIRST AND UNCONDITIONALLY, so no branch below can forget it.
         It is also the thing that replaced the apology he objected to: "it cannot see anything newer
         than that" is what a page's own age already means, in two words instead of eight. */
      if (upd) upd.textContent = "Updated: " + fmtAge(publishedMs);
      var pageStale = Math.floor(publishedMs/60000) > STALE_MIN;
      if (updEmoji) updEmoji.textContent = pageStale ? "🔴" : "🟢";
      if (upd) upd.className = pageStale ? "age stale" : "age";
      // A LONG JOB IS WORK, NOT SILENCE. If a slow job was progressing when this page was
      // generated, say so instead of counting minutes since the last pulse and calling it death --
      // that was the false red Wyatt reported. The job's OWN staleness rule decides how long it may
      // stay quiet, and once it is past that the page falls back to the ordinary clock, so a
      // finished or crashed job cannot hold the light green from a frozen snapshot.
      var lr = state.longRun, lrLive = false;
      if (lr && lr.updatedAt && lr.staleAfterMinutes > 0) {
        var lrAgeMin = (Date.now() - new Date(lr.updatedAt).getTime()) / 60000;
        lrLive = lrAgeMin >= 0 && lrAgeMin <= lr.staleAfterMinutes;
      }
      if (lrLive) {
        age.textContent = "Progress: " + lr.what + (lr.progress ? " -- " + lr.progress : "") + ", still running";
        emoji.textContent = "⚙️";
        age.className = "age";
        return;
      }
      /* ⚠ THE "(as of this page)" CLAUSE THAT USED TO BE APPENDED HERE IS GONE, AND ITS JOB MOVED
         RATHER THAN BEING DROPPED. CEO 112 required that the number he objected to say whose clock
         it is on; his own item-2 wording puts the answer immediately beside it — "🟢 Progress: 6 min
         ago. 🟢 Updated: 4 min ago." — and asked explicitly for FEWER words. The Updated clock is now
         the bound on this number, one dot away, in his phrasing instead of ours. Still not a cure:
         the cure is republishing when work lands, the Door's step 6b. */
      age.textContent = "Progress: " + fmtAge(progressMs);
      var stale = Math.floor(progressMs/60000) > STALE_MIN;
      emoji.textContent = stale ? "🔴" : "🟢";
      age.className = stale ? "age stale" : "age";
    }
    tick(); setInterval(tick, 30000);

    // --- the two-way half: the page rebuilds and saves itself with a new idea appended.
    var TPL = __GLASS_TPL__;
    function jsEsc(s){ return JSON.stringify(s).replace(/</g, "\\\\u003c"); }
    // Function-form replacements, both here and in the generator: a plain string replacement
    // interprets "$&"-style sequences inside the inserted value, and idea text is user text.
    function buildDoc(st){
      var d = TPL;
      d = d.replace("__GLASS_TPL__", function(){ return jsEsc(TPL); });
      // The state block is a JSON script element, so it takes raw JSON text with "<" made safe —
      // < is a legal escape inside JSON strings, and "<" can only occur inside strings.
      // ⚠ NEVER write an open angle bracket immediately followed by the word script and a close
      // angle bracket, anywhere in PAGE's text, comments included. Measured 2026-08-31: a comment
      // naming that tag the bracketed way, sitting unescaped inside the real script element's own
      // text, was REMOVED as a precaution -- CEO Review 54 later disproved it was the actual cause
      // (a real headless-Chrome render of the pre-fix page came up clean; the mechanism that
      // corrupted Wyatt's live page, 2026-08-31, is still not root-caused). Say "script element" or
      // "script tag" in prose regardless; never spell the bracketed form out, even to explain this.
      d = d.replace("__GLASS_STATE__", function(){ return JSON.stringify(st).replace(/</g, "\\\\u003c"); });
      return d;
    }

    // NO RELOAD, AT ALL -- the third attempt at "the page corrupts after submitting an idea", and
    // the first that does not call location.reload() in any form. Attempt 1 (a reload 1400ms after
    // a successful publish, full page left on screen meanwhile) and attempt 2 (blank the body
    // BEFORE publishing, reload once the publish settled either way) both still left him reporting
    // the SAME corruption, 2026-09-01: "page is still broken after submitting an idea, same error
    // as before." Two different reload timings producing the identical symptom is evidence the
    // reload itself is implicated, not when it fires -- the exact host-side mechanism is still
    // unmeasured (see the buildDoc() comment below on what CEO Review 54 already ruled out), but
    // this version removes reload from the sequence entirely rather than continuing to time it.
    // A send or a ruling now updates "state" in memory, repaints synchronously (renderIdeas /
    // paintAsk below), and calls cap.publish() in the background -- the tab never tears itself
    // down, so whatever triggers the corruption never gets the chance to fire. It also answers
    // what he actually asked for in the first place, 2026-08-31: "I need to be able to send
    // another idea immediately afterwards, without waiting."

    function renderIdeas(){
      var box = document.getElementById("ideaList");
      while (box.firstChild) box.removeChild(box.firstChild);
      if (!state.ideas.length) return;
      var h = document.createElement("p"); h.className = "muted";
      h.textContent = "Written here, waiting for a session to harvest to the Chart:";
      box.appendChild(h);
      var ul = document.createElement("ul");
      state.ideas.forEach(function(i){
        var li = document.createElement("li");
        // A pinned idea has to LOOK pinned the moment he taps, before any session has seen it.
        // Until the harvest runs, this tag is the only evidence he has that his interrupt landed.
        if (i.now) {
          var tag = document.createElement("span");
          tag.className = "pinTag";
          tag.textContent = "DO NOW";
          li.appendChild(tag);
        }
        li.appendChild(document.createTextNode(i.text + "  (" + i.at.slice(0, 16).replace("T", " ") + "Z)"));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    renderIdeas();

    /* ONE SLOT, NOT A QUEUE — his design, enforced here as well as in chartkeeper.mjs, because the
       page can hold pinned ideas that no session has harvested yet. If he pins a second thing, the
       first stops being the interrupt at the moment he says so, not at the moment somebody reads
       it. "An interrupt with a queue is just another backlog, which is the fault this whole design
       removes." */
    function releasePins(){
      state.ideas.forEach(function(i){ if (i.now) delete i.now; });
    }

    // Draft guard: a save that conflicts reloads the page and drops the edit; the draft brings
    // his words back instead of eating them. Every touch is try/caught — storage can throw.
    var DRAFT = "glassIdeaDraft";
    function getDraft(){ try { return localStorage.getItem(DRAFT) || ""; } catch (e) { return ""; } }
    function setDraft(v){ try { v ? localStorage.setItem(DRAFT, v) : localStorage.removeItem(DRAFT); } catch (e) {} }

    var capNote = document.getElementById("ideaCapNote");
    var form = document.getElementById("ideaForm");
    var text = document.getElementById("ideaText");
    var send = document.getElementById("ideaSend");
    var doNow = document.getElementById("ideaDoNow");
    var status = document.getElementById("ideaStatus");

    // Compare the TRIMMED draft — ideas are trimmed before saving, and comparing untrimmed
    // refilled the box with an already-saved idea (CEO Review 47, correction 2).
    var saved = state.ideas.some(function(i){ return i.text === getDraft().trim(); });
    if (saved) setDraft("");
    text.value = getDraft();
    text.addEventListener("input", function(){ setDraft(text.value); });

    // --- the Helm, folded in: rule on each open question right here.
    // ⚠ SELECT BY ID, ALWAYS. The artifact host injects its OWN reset stylesheet and wrapper
    // before this document's content, so a tag-or-position selector (document.querySelector
    // ("style"), firstElementChild, "the second script") can silently resolve to the HOST's
    // asset instead of ours. Everything this page owns carries an id: #glass-style, #glassState,
    // #asks, #ideaForm. Ledger lesson, 2026-08-31 — earned on the Helm before this page existed.
    if (!state.rulings) state.rulings = {};
    var asksBox = document.getElementById("asks");
    var asks = asksBox ? Array.prototype.slice.call(asksBox.getElementsByClassName("ask")) : [];
    function paintAsk(el){
      var id = el.getAttribute("data-id");
      var r = state.rulings[id];
      var note = el.querySelector(".rnote"), st = el.querySelector(".rstate");
      Array.prototype.forEach.call(el.querySelectorAll(".rb"), function(b){
        b.setAttribute("aria-pressed", String(!!r && r.choice === b.getAttribute("data-choice")));
      });
      if (r) {
        el.className = "ask ruled";
        if (r.note && note.value !== r.note) note.value = r.note;
        st.textContent = "Ruled " + r.at.slice(0, 16).replace("T", " ") + "Z — waiting for a session to pick it up.";
      } else { st.textContent = ""; }
    }
    asks.forEach(paintAsk);

    function saveRuling(el, choice){
      if (!cap) return;
      if (el.getAttribute("data-id").indexOf("demo-") === 0) return; // demo cards never save
      var id = el.getAttribute("data-id");
      if (!state.rulings) state.rulings = {};
      /* STORE THE WORDS, NOT THE NUMERAL. T-121 harvested ruling reads "Wyatt ruled yes" and its
         own entry admits "the alternative he did not pick: not recorded" -- storing "2" alone would
         be strictly worse, because a number is meaningless in DECISIONS.md once the question card
         is gone. The label he pressed AND every option he was shown go with it.
         NO BACKTICKS IN THIS COMMENT: it sits inside the client-script template literal, and one
         backtick ends the string and stops the whole generator parsing. The file says so a hundred
         lines up; I did it anyway on the first try. */
      var lbl = null, allOpts = [];
      Array.prototype.forEach.call(el.querySelectorAll(".rb"), function(b){
        var d = b.getAttribute("data-label");
        if (d) allOpts.push(b.getAttribute("data-choice") + ": " + d);
        if (b.getAttribute("data-choice") === choice && d) lbl = d;
      });
      /* NEVER LOSE A LABEL HE ALREADY HAS. A declared option is keyed off its own WORDS, so
         REWORDING a question changes its key -- and then no button on the page matches the choice
         saved under the old one, lbl comes back null, and his readable answer is replaced by a hash
         in DECISIONS.md. That is the live route back to "Wyatt ruled opt-15wnciu" (CEO 178), and it
         fires on the most ordinary edit there is: tightening the wording of a question.
         The blur handler re-saves with the EXISTING choice whenever he adds a note, so this runs on
         his own note-typing, not only on a press. Keep what was stored before. */
      var prev = state.rulings[id];
      if (!lbl && prev && prev.chose && prev.choice === choice) lbl = prev.chose;
      if (!allOpts.length && prev && prev.options && prev.options.length) allOpts = prev.options;
      state.rulings[id] = {
        choice: choice,
        chose: lbl,
        options: allOpts,
        note: el.querySelector(".rnote").value.trim(),
        q: el.querySelector(".q").textContent,
        at: new Date().toISOString(),
      };
      paintAsk(el); // optimistic — the tab never reloads, so this IS the confirmation he sees
      cap.publish(buildDoc(state)).then(null, function(){
        el.querySelector(".rstate").textContent = "Didn't save — tap again to retry.";
      });
    }
    asks.forEach(function(el){
      Array.prototype.forEach.call(el.querySelectorAll(".rb"), function(b){
        b.addEventListener("click", function(){ saveRuling(el, b.getAttribute("data-choice")); });
      });
      // A note with no button press is still a ruling — his words outrank the buttons.
      el.querySelector(".rnote").addEventListener("blur", function(){
        var v = el.querySelector(".rnote").value.trim();
        var r = state.rulings[el.getAttribute("data-id")];
        if (v && (!r || r.note !== v)) saveRuling(el, (r && r.choice) || "note");
      });
    });

    var cap = null;
    var useFn = (window.claude && window.claude.use) ? window.claude.use.bind(window.claude) : null;
    // Wyatt, 2026-09-01: "not showing a text box, just 'Checking whether this view can save…'" --
    // the artifact host's own capability grant did not resolve at all, not even to null, so the
    // page waited forever with nothing he could do about it. Everything below the .then() is
    // unchanged; this only adds a ceiling on how long "Checking…" is allowed to sit there before
    // offering him a way out, since a page that can only be rescued by leaving and coming back is
    // not rescuable by someone who does not know that.
    var capStuckTimer = setTimeout(function(){
      if (cap !== null) return; // resolved (to a real capability) in the meantime
      capNote.innerHTML = "";
      capNote.appendChild(document.createTextNode("This view is taking too long to check whether it can save. "));
      var a = document.createElement("a");
      a.href = "#"; a.textContent = "Reload";
      a.addEventListener("click", function(ev){ ev.preventDefault(); location.reload(); });
      capNote.appendChild(a);
    }, 6000);
    (useFn ? useFn("artifact") : Promise.resolve(null)).then(function(a){
      clearTimeout(capStuckTimer);
      cap = a;
      if (cap) { capNote.hidden = true; form.hidden = false; }
      else {
        capNote.textContent = "This view can’t save to the page (preview, or the grant is missing) — but any idea still reaches Claude if you say it in any session.";
        asks.forEach(function(el){ el.querySelector(".rstate").textContent = "This view can’t save rulings — open the artifact itself."; });
      }
    });

    /* ONE SEND PATH, TWO BUTTONS — rule 23, applied to a nine-line function. The DO NOW button is
       the ordinary send with one field set, so there is no second way for an idea to reach the page
       and no chance of the two drifting. Everything the send already got right (optimistic paint,
       no reload, his words handed back on failure) applies to a pinned idea unchanged. */
    function sendIdea(pin){
      var v = text.value.trim();
      if (!v || !cap) return;
      var released = [];
      if (pin) {
        state.ideas.forEach(function(i){ if (i.now) released.push(i); });
        releasePins();
      }
      var idea = { id: "i" + Date.now(), text: v, at: new Date().toISOString() };
      if (pin) idea.now = true;
      // Optimistic, in place, no reload: the box clears and the idea appears in the list right
      // now, which IS the confirmation he asked for ("I need to know that my first idea was
      // sent") -- and because nothing reloads, he can type and send the next one immediately,
      // which was the other half of that same ask.
      state.ideas.push(idea);
      text.value = "";
      setDraft("");
      renderIdeas();
      status.textContent = "Saving…";
      cap.publish(buildDoc(state)).then(function(){
        status.textContent = pin
          ? "Saved, and it goes to the TOP of the list. Only one thing can be there, so anything you marked before is back in the ordinary order."
          : "Saved — on the Chart as soon as a session reads it. Send another any time.";
      }, function(){
        // Roll back and hand his words back so nothing is lost — matches the old draft-recovery
        // contract's intent without needing a reload to re-derive it. A failed pin must also put
        // back the pin it displaced: releasing one interrupt to save another, and then not saving
        // the other, would leave him with none.
        var idx = state.ideas.indexOf(idea);
        if (idx > -1) state.ideas.splice(idx, 1);
        released.forEach(function(i){ i.now = true; });
        renderIdeas();
        text.value = v;
        setDraft(v);
        status.textContent = "Didn't save — your words are back in the box, try again.";
      });
    }
    send.addEventListener("click", function(){ sendIdea(false); });
    doNow.addEventListener("click", function(){ sendIdea(true); });

    /* ⚑ DRAG TO REPRIORITISE — his words, 2026-09-02 3:09 PM ET: "DO NOW: build a way for me to
       drag to reprioritize the chart, in The Glass."

       ⚠ POINTER EVENTS, NOT HTML5 DRAG-AND-DROP, AND THAT IS THE WHOLE REASON THIS IS NOT FOUR
       LINES. The dragstart/drop events do not fire on iOS Safari at all, so a page built on them
       works perfectly on the laptop this was written on and is INERT on the phone he reads it on —
       the exact shape of fault this project keeps paying for (a gate aimed at the wrong tree; a
       rule that was decorative on Windows). pointerdown/pointermove is ONE code path for mouse and
       touch, which is also rule 23's answer: one gesture, not two kept in step.

       WHAT IS SAVED IS THE SEQUENCE OF HANDLES, never the row text. Row text is de-shouted and
       truncated for him and changes whenever somebody edits the Chart; the handle is the thing the
       Chartkeeper can act on. A watch applies it with ONE command, named in the runbook:
         node scripts/wyclau/chartkeeper.mjs --order=<the handles, in order>
       Until that runs, his order is recorded and visible and the list has NOT moved — the same
       honest joint as the pin, and the page says so rather than implying otherwise. */
    var taskList = document.getElementById("taskList");
    var orderNote = document.getElementById("orderNote");

    /* ─── HIS EXPANDABLE ROWS AND PER-ITEM COMMENTS (T-076, the row he pinned) ───────────────
       Wired OUTSIDE the taskList && orderNote block below on purpose: orderNote only exists
       when there are draggable rows, and these two must still work on a list of un-draggable ones
       (an inbox idea, or a row whose handle two rows share). Tying them to the drag's guard would
       have made them vanish exactly on the rows that are hardest to understand from one line. */
    if (taskList) {
      Array.prototype.forEach.call(taskList.querySelectorAll(".rowmore"), function(btn){
        btn.addEventListener("click", function(){
          var d = btn.parentNode.querySelector(".rowpanel");
          if (!d) return;
          var open = btn.getAttribute("aria-expanded") === "true";
          btn.setAttribute("aria-expanded", open ? "false" : "true");
          btn.textContent = open ? "more" : "less";
          d.hidden = open;   // hidden, never style.display — the host's reset defines it
        });
      });

      // What he has already written, drawn from state so it survives a repaint.
      function paintComments(li){
        var h = li.getAttribute("data-handle");
        var box = li.querySelector(".rowx");
        if (!h || !box) return;
        Array.prototype.forEach.call(box.querySelectorAll(".rowmine"), function(n){ n.remove(); });
        var mine = (state.comments && state.comments[h]) || [];
        var cmt = box.querySelector(".rowcmt");
        if (!cmt) return;
        mine.forEach(function(c){
          var p = document.createElement("div");
          p.className = "rowmine";
          p.textContent = c.text + "  (" + String(c.at).slice(0, 16).replace("T", " ") + "Z)";
          /* ⛔ cmt.parentNode, NOT box. THIS LINE ATE HIS WORDS ON THE LIVE PAGE.
             It read box.insertBefore(p, cmt) -- and .rowcmt is a GRANDCHILD of .rowx (rowx > rowpanel
             > rowcmt), so the reference node was not a child of box and the DOM threw
             NotFoundError. The throw landed between "clear the textarea" and "publish", so pressing
             Save wiped what he typed, showed him nothing, and saved nothing. The carefully written
             put-his-words-back handler below was UNREACHABLE: the failure was on the SUCCESS path.
             Found by CEO 143, which injected a fake artifact capability and drove the real click. */
          cmt.parentNode.insertBefore(p, cmt);
        });
      }

      Array.prototype.forEach.call(taskList.querySelectorAll("li[data-handle]"), function(li){
        paintComments(li);
        var send = li.querySelector(".rowsend");
        var ta = li.querySelector(".rowcmt textarea");
        var said = li.querySelector(".rowsaid");
        if (!send || !ta) return;
        send.addEventListener("click", function(){
          var v = ta.value.trim();
          if (!v) return;
          if (!cap) { if (said) { said.hidden = false; said.textContent = "Can't save from this view."; } return; }
          var h = li.getAttribute("data-handle");
          if (!state.comments) state.comments = {};
          if (!state.comments[h]) state.comments[h] = [];
          state.comments[h].push({ text: v, at: new Date().toISOString() });
          /* Optimistic, exactly as a ruling is: the tab NEVER reloads (see the long note above on
             three attempts at that), so this repaint IS the confirmation he sees. */
          ta.value = "";
          paintComments(li);
          if (said) { said.hidden = false; said.textContent = "Saved."; }
          cap.publish(buildDoc(state)).then(null, function(){
            /* His words go BACK IN THE BOX on failure — the same treatment the idea box gives them.
               Dropping them silently is the one outcome that must never happen here. */
            ta.value = v;
            var arr = state.comments[h] || [];
            for (var i = arr.length - 1; i >= 0; i--) { if (arr[i].text === v) { arr.splice(i, 1); break; } }
            paintComments(li);
            if (said) { said.hidden = false; said.textContent = "Didn't save — your words are back in the box."; }
          });
        });
      });
    }

    if (taskList && orderNote) {
      var draggables = function(){
        return Array.prototype.slice.call(taskList.querySelectorAll("li.drag"));
      };
      var sequence = function(){
        return draggables().map(function(li){ return li.getAttribute("data-handle"); });
      };
      /* The saved order is compared against what the page was BORN with, so "you have moved this"
         is a fact about his drag and not about the Chart's file order. Captured BEFORE the saved
         order is re-applied below, or dragging back to the generated order could never clear it. */
      var born = sequence().join(",");
      var held = null, startY = 0, moved = false;

      /* ⚑ AN ORDER HE ALREADY MADE IS PUT BACK ON THE LIST, ON EVERY LOAD, BEFORE HE TOUCHES
         ANYTHING — CEO 131's finding 3, and it was the worst of the three because it made the page
         LIE to him. What gets published is this template rebuilt from the state (buildDoc), so the
         rows he had just moved on screen were never serialised: reload the artifact and the list
         snapped back to the Chart's file order while the line under it still said "Your order is
         saved". His order was genuinely in the page's data the whole time; nothing put it back on
         the rows. Now it does, so what he reads always matches what he saved. */
      function applySaved(){
        var want = state.order && state.order.handles;
        if (!want || !want.length) return;
        var by = {};
        draggables().forEach(function(li){ by[li.getAttribute("data-handle")] = li; });
        var first = draggables()[0];
        if (!first) return;
        /* A marker, not the first row itself, as the insertion point: the first row is usually IN
           the saved order too, and inserting a node before itself is a no-op that silently reverses
           everything after it. */
        var mark = document.createElement("li");
        mark.style.display = "none";
        taskList.insertBefore(mark, first);
        want.forEach(function(h){
          var li = by[h];
          if (li) taskList.insertBefore(li, mark);
        });
        taskList.removeChild(mark);
        /* Rows the saved order does not name (added to the Chart since he dragged) keep their
           generated position at the end of the run, rather than being dropped or guessed at. */
      }
      applySaved();

      /* ⚑ HIS "MOVE TO TOP" BUTTON — his own design, pinned DO NOW 2026-09-03T18:28:56Z, because
         the drag "doesn't work on mobile". Deliberately routed through saveOrder() below rather
         than given its own save: the order is ONE fact, and a second writer for it is the drift
         rule 23 is about. All this does is move the row and call the existing commit.

         ⚠ IT MOVES ABOVE THE FIRST DRAGGABLE ROW, NOT TO THE TOP OF THE <ol>. The list also holds
         rows with no handle (an inbox idea, or a row whose handle two rows share) which are not
         part of the saved sequence — inserting before those would put his pick above rows the
         order cannot describe, and the position would not survive the next generation. */
      function moveToTop(handle){
        var rows = draggables();
        var li = null;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].getAttribute("data-handle") === handle) { li = rows[i]; break; }
        }
        if (!li) return;
        var first = rows[0];
        if (first === li) {                       // already top — say so instead of a silent no-op
          orderNote.textContent = "That one is already at the top.";
          return;
        }
        taskList.insertBefore(li, first);
        /* Take him to it. On a phone the row he tapped is under his finger halfway down a long
           list, and the confirmation line lives at the TOP (CEO 131's finding 4) — so without this
           he taps and sees nothing move. */
        if (li.scrollIntoView) { try { li.scrollIntoView({ block: "center" }); } catch (e) { li.scrollIntoView(); } }
        saveOrder();
      }
      Array.prototype.forEach.call(taskList.querySelectorAll("button.totop"), function(btn){
        btn.addEventListener("click", function(ev){
          /* The row is a drag target and it expands on click; neither must fire from this button. */
          ev.preventDefault();
          ev.stopPropagation();
          /* The handle comes from the ROW, not from the button -- see the markup's own note: a
             second data-handle in the DOM made chartkeeper_check count 8 draggable rows where
             there are 4. One element owns the handle. */
          var row = btn.parentNode;
          moveToTop(row && row.getAttribute ? row.getAttribute("data-handle") : null);
        });
        /* Still stopped: the ROW expands on click, and a tap on the arrow must not open it. */
        btn.addEventListener("pointerdown", function(ev){ ev.stopPropagation(); });
      });

      function saveOrder(){
        var seq = sequence();
        if (seq.join(",") === born) { state.order = null; }
        else { state.order = { handles: seq, at: new Date().toISOString() }; }
        if (!cap) { orderNote.textContent = "This view can’t save an order — open the artifact itself."; return; }
        orderNote.textContent = "Saving your order…";
        cap.publish(buildDoc(state)).then(function(){
          orderNote.textContent = state.order
            ? "Your order is saved. A watch works the list from the top, in the order you left it."
            : "Back to the order this page arrived in.";
        }, function(){
          orderNote.textContent = "Didn’t save — drag it again to retry.";
        });
      }

      /* ⚑ THE DRAG IS GONE — his instruction, 2026-09-03: *"you can remove the dragging feature
         from the Chart -- it was really buggy and didn't work as intended. we'll just use the
         arrows."*

         It was built on pointer events precisely SO it would work on his phone, and the long note
         where it lived said so. It still did not work for him. Roughly 90 lines of pointerdown /
         pointermove / drop, a grab cursor, a held-row state and a capture dance are all deleted
         here rather than kept 'in case' — a gesture nobody can use is not a fallback, it is a
         second way to produce the same fact, kept in step by discipline (rule 23). One gesture.

         WHAT DID NOT CHANGE, AND IS WHY THE ARROWS WORK: a saved order still NAMES the rows, and
         saveOrder() below is still the single place an order is committed. The arrows call it. */

      // If a previous order is still on the page, say so — an instruction he cannot see landed is
      // indistinguishable from one that was ignored, which is his own lesson from the pin.
      if (state.order && state.order.handles && state.order.handles.length) {
        orderNote.textContent = "Your order is saved. A watch works the list from the top, in the order you left it.";
      }
    }
  })();
</script>
`;

/* The full-document shape, for the page's own saves — the artifact capability requires a complete
   document, doctype first. The tool-published fragment and this wrapper share PAGE by
   construction, so the two shapes cannot drift. */
const FULLDOC = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
${PAGE}
</body></html>`;

const jsEsc = (s) => JSON.stringify(s).replace(/</g, "\\u003c");
const stateJson = JSON.stringify(state).replace(/</g, "\\u003c");
// Order is load-bearing (see the PAGE comment): TPL first, then the first state token.
// Function-form replacements so "$&"-style sequences in the values are inserted literally.
const html = PAGE
  .replace("__GLASS_TPL__", () => jsEsc(FULLDOC))
  .replace("__GLASS_STATE__", () => stateJson);

writeFileSync(OUT, html);
/* ⚠ THIS LINE USED TO SAY "heartbeat stamped" UNCONDITIONALLY, AND THE FIRST REHEARSAL RUN PRINTED
   IT WHILE STAMPING NOTHING. Caught within a minute of `--chart=` existing, and it is the same
   shape as the publish stamp that "could only ever say one thing" — a sentence that reports an act
   rather than observing one. It now says which of the two things actually happened. */
console.log(REHEARSAL
  ? `GLASS ok — REHEARSAL from ${CHART_OVERRIDE}: page written to ${OUT}, and nothing else touched (no heartbeat, GLASS-NOTE.md left alone). Do not publish this render.`
  : `GLASS ok — heartbeat stamped ${nowIso}; page written to ${OUT}${DEMO ? "  [DEMO MODE — do not publish this render]" : ""}`);
console.log(`note: ${note}`);
if (relayedNote) {
  console.log(CONSUME_NOTE
    ? `relayed note picked up from GLASS-NOTE.md and folded in; the file has been reset — commit that reset with your next commit.`
    : `relayed note picked up from GLASS-NOTE.md and folded in. THE FILE WAS NOT CLEARED — pass --consume-note to clear it, which only the tick's publish step should do. His writing survives a run that merely renders the page.`);
}

console.log(`
REPUBLISH THE GLASS -- writing the file is only half of it:`);
console.log(`  ${GLASS_URL}`);
console.log(`  ⚠ HARVEST FIRST: read the live artifact and move any glassState.ideas,`);
console.log(`  glassState.rulings AND glassState.comments into .planning/CHART.md before`);
console.log(`  republishing — a republish without the harvest DELETES ALL THREE (this page`);
console.log(`  always regenerates empty). comments are {"T-nnn":[{text,at}]} — his words about a`);
console.log(`  SPECIFIC row, so file each onto that row, not into the idea inbox.`);
console.log(`  Publish ${OUT} to that URL (Artifact tool, pass it as \`url\`). Do it at every item`);
console.log(`  boundary and before you go quiet, or he is reading a page that has stopped moving.`);
console.log(`  (v2: the page saves itself via the "artifact" capability — pass`);
console.log(`  capabilities {artifact:{}} on a fresh publish, or if the page says it can't save.)`);
console.log(`  ⚠ THEN RUN, with the version the publish call returned:`);
console.log(`      node scripts/wyclau/mark_glass_published.mjs --version=<id> --harvested=<the page file your read saved>`);
console.log(`  A BARE CALL IS REFUSED (2026-09-01). It used to stamp "Glass published"`);
console.log(`  unconditionally, so anything that ran it — including a watch with no Artifact`);
console.log(`  tool, which cannot publish at all — forged a publish. A stamp that could only`);
console.log(`  ever say one thing is rule 6's "measurement that cannot fail".`);
console.log(`  ⚠ AND KNOW WHAT IT NO LONGER BUYS: the keep-working Stop hook that read this gap`);
console.log(`  was DELETED in claude-kit 2dd722c (the Watch redesign). NOTHING IN CODE READS`);
console.log(`  LAST-PUBLISH now. Sessions do, and act on it — so it must not lie to them — but`);
console.log(`  do not skip publishing believing a hook will catch you. Nothing will.`);
