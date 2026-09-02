#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
// scripts/wyclau/glass_needs_publish.mjs
//
//     node scripts/wyclau/glass_needs_publish.mjs
//       exit 0  -> PUBLISH        something moved; go through the full publish loop
//       exit 10 -> NOTHING-MOVED  no input changed since the last publish; end the tick silently
//
// ⚠ THE TICK IS NOT THE FAULT. ACTING UNCONDITIONALLY IS.
//
// Wyatt, 2026-09-01: "i think it violates past learnings in multiple ways regarding timers", and a
// CEO audit upheld him. bell.ps1 records that the previous watchdog's judgement stack -- heartbeat
// freshness, activity recency, the commit clock -- "guessed wrong in both directions ... and is
// DELETED, not tuned", replaced by one question the OS answers truthfully. The Bell kept its 10
// minute tick through that redesign and was right to. What it does NOT do is act every time it
// fires: it asks the process table a truthful question first and usually does nothing.
//
// This is that shape for the Glass. TICK OFTEN, ACT RARELY.
//
// MEASURED, NOT ASSERTED, the night this was written. Three autonomous ticks published at 22:32:20Z,
// 22:48:00Z and 23:03:01Z. The newest commit across all refs was 22:46:11Z at the second AND the
// third; GLASS-NOTE.md had not moved since 21:50Z. The third publish carried nothing new. Overnight,
// when nothing lands, essentially all 96 daily ticks are that one.
//
// AND IT IS NOT MERELY WASTE. glass.mjs records that a republish without harvesting first DELETES
// what Wyatt typed on the page, and that two publishers on one cadence made the platform's own
// conflict guard fire three times in five minutes. A clock multiplies the unattended chances to hit
// both faults; a change-gate removes almost all of them.
//
// ⚠⚠ THIS SCRIPT CANNOT SEE THE LIVE PAGE, AND MUST NEVER BE USED TO SKIP THE HARVEST.
// Ideas and rulings Wyatt types live ONLY in the published artifact until a session copies them into
// the record, and only a session holding the Artifact tool can read them. This script sees git and
// the local note file. So the runbook order is: READ THE LIVE PAGE AND HARVEST FIRST, ALWAYS, then
// ask this. If the page held ideas, that is itself a reason to publish and this script's answer is
// irrelevant. A check that quietly caused his words to go unharvested would be far worse than the
// waste it exists to remove.
//
// EVERY DOUBT RESOLVES TO PUBLISH -- the same discipline longRunStatus() uses in reverse. A missing
// stamp, an unparseable one, a git that will not answer, an unreadable note file: all PUBLISH. A
// broken input must never be able to SUPPRESS a publish, because the failure mode of a missed
// publish is Wyatt reading a frozen page, which is the bug this whole subsystem exists to prevent.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WY = join(ROOT, ".planning", "wyclau");

const say = (verdict, why) => {
  console.log(`${verdict} — ${why}`);
  process.exit(verdict === "PUBLISH" ? 0 : 10);
};

// The newest commit reachable in this clone across ALL refs, MINUS the loop's own note resets.
//
// ⚠ CORRECTED SAME DAY, CEO 82: an earlier version of this comment said "the same quantity glass.mjs
// uses for last progress, so the page and this gate can never disagree". THAT BECAME FALSE IN THE
// COMMIT THAT ADDED THE FILTER, and was shipped stale on day zero — the exact rot CLAUDE.md's
// "a comment is not a measurement" warns about, written fresh. glass.mjs computes `lastCommitIso`
// with a plain `log -1 --format=%cI --all`, no pathspec, so it still counts note-only commits.
// MEASURED CONSEQUENCE, and it is small: right after a note reset the page can read "last progress
// 0 min ago" while this gate correctly says nothing moved, so the Glass slightly OVERSTATES
// freshness. Overstating freshness is the safe direction here (it never suppresses a publish), so
// the divergence is tolerated deliberately — but it is a divergence, and the next reader is told so
// rather than reassured.
//
// ⚠ EXCEPT COMMITS WHOSE ENTIRE DIFF IS GLASS-NOTE.md — THE ECHO TICK, measured 2026-09-02 and
// reported by the running publisher rather than theorised. Every real note was costing TWO
// publishes: `fb6deef4` was a watch adding a note AND a ledger entry, so that tick published and
// stamped at fb6deef4, then committed the note reset as `7b191d1e` — entire diff GLASS-NOTE.md, 19
// deletions. The next tick saw 7b191d1e != fb6deef4, called it work landed, and republished a page
// carrying nothing new. One wasted publish per note, forever, predictably.
//
// WHY NOT SIMPLY STAMP AFTER THE COMMIT, which is the obvious fix and is WRONG: the stamp would
// then record a hash NEWER than what was actually published, so anything landing between the
// publish and the commit would be swallowed — a false NOTHING-MOVED, and a missed publish is the
// dangerous direction. This instead removes the double-count: GLASS-NOTE.md already has its own
// dedicated check below, so a note ADDED is caught by "is a note queued" and a note REMOVED is
// housekeeping by construction. One signal, one owner. Counting it twice is what created the echo.
// ⚠ EXPORTED, AND mark_glass_published.mjs IMPORTS IT RATHER THAN REPEATING THE COMMAND. Rule 23:
// two things that must agree are ONE thing, or they will drift. The first version of this fix put
// the pathspec here and left the stamper recording an UNFILTERED head — so the gate compared a
// filtered hash against an unfiltered stamp, they could never match, and the result would have been
// a permanent false PUBLISH: the exact defect this file exists to remove, reintroduced by having
// two definitions of "the newest work commit". Caught before shipping by asking what makes these
// two agree, and the honest answer was "nothing".
// ⚠⚠ ONLY A NOTE *RESET* IS SKIPPED — NEVER A NOTE BEING WRITTEN. CEO 82 found the hole in the
// first version, which excluded GLASS-NOTE.md commits wholesale, and it loses Wyatt's words:
//   1. a watch commits a note ALONE (note-only ADD) -> excluded by a wholesale pathspec
//   2. a session folds it in and commits the RESET (note-only) -> also excluded
//   3. that session cannot publish -- a `claude -p` watch with no Artifact tool, the case
//      mark_glass_published.mjs documents as real and expected
// head unchanged, noteQueued false because the file was cleared, stamp still matches: the gate says
// NOTHING-MOVED and HIS NOTE REACHES HIM NEVER. That is a false SUPPRESSION, the direction this
// file's own header calls the bug the whole subsystem exists to prevent.
// So the test is DIRECTIONAL: a note-only commit that ADDED lines is real signal and counts; one
// that only removed them is the loop clearing up after itself and is skipped. "By construction" was
// unearned in the first draft and is deleted rather than softened.
export function newestWorkCommit(root) {
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  const NOTE = ".planning/wyclau/GLASS-NOTE.md";
  const heads = git(["log", "-40", "--format=%H", "--all"]).trim().split("\n").filter(Boolean);
  for (const h of heads) {
    const files = git(["show", "--name-only", "--format=", h]).trim().split("\n").filter(Boolean);
    if (files.length !== 1 || files[0] !== NOTE) return h;      // touches anything else: real work
    const [, add = "0", del = "0"] = git(["show", "--numstat", "--format=", h]).trim().match(/^(\d+)\s+(\d+)/) ?? [];
    if (Number(add) > Number(del)) return h;                     // a note was WRITTEN: real signal
    // otherwise: the loop clearing the note it just published. Keep walking back.
  }
  // Fell off the end of the window without finding one. Do NOT suppress on a guess — hand back the
  // newest commit there is, which reads as "something moved" and resolves this doubt to PUBLISH.
  return heads[0] ?? "";
}

// Running as a script? Only then does this file decide anything. Imported, it is just the function
// above — otherwise importing it would exit the importer's process.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (!invokedDirectly) { /* imported for newestWorkCommit only */ }
else {

let head = null;
try {
  head = newestWorkCommit(ROOT);
} catch {
  say("PUBLISH", "git would not answer what the newest commit is, so this cannot tell — publishing rather than guessing");
}
if (!head) say("PUBLISH", "git named no commit at all, so this cannot tell — publishing rather than guessing");

// A note queued for Wyatt is a reason to publish on its own: it exists precisely because the session
// that wrote it could not publish, and it reaches him no other way.
let noteQueued = false;
try {
  const body = readFileSync(join(WY, "GLASS-NOTE.md"), "utf8");
  const after = body.split(/^---$/m).slice(1).join("---").trim();
  noteQueued = after.length > 0;
} catch {
  say("PUBLISH", "GLASS-NOTE.md could not be read, so a note may be waiting for him — publishing rather than guessing");
}
if (noteQueued) say("PUBLISH", "a note is queued in GLASS-NOTE.md and reaches him no other way");

// What the last publish actually recorded. mark_glass_published.mjs writes `commit=<sha>` beside the
// version; a stamp without one predates this mechanism and cannot be compared against.
let stamped = null;
try {
  const line = readFileSync(join(WY, "LAST-PUBLISH"), "utf8");
  stamped = (line.match(/commit=([0-9a-f]{7,40})/) || [])[1] ?? null;
} catch {
  say("PUBLISH", "no LAST-PUBLISH stamp on this machine — nothing has been published from here yet");
}
if (!stamped) say("PUBLISH", "the last stamp records no commit, so there is nothing to compare against");

if (!head.startsWith(stamped) && !stamped.startsWith(head)) {
  say("PUBLISH", `work landed since the last publish (${stamped.slice(0, 7)} -> ${head.slice(0, 7)})`);
}

say("NOTHING-MOVED", `no commit has landed since ${stamped.slice(0, 7)} and no note is queued — the page already says this`);

}
