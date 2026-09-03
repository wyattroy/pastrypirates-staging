#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
// scripts/wyclau/mark_glass_published.mjs
//
// Run this immediately after the Artifact tool call that publishes the Glass succeeds, passing the
// version that call returned:
//
//     node scripts/wyclau/mark_glass_published.mjs --version=1788301109-8c5c
//
// A plain node script cannot call the Artifact tool itself (only a live session can), so this
// records that a publish REALLY happened.
//
// ⚠ WHY IT DEMANDS A VERSION — earned 2026-09-01, and it is rule 6's failure in its purest form.
// This script used to take NO arguments, verify NOTHING, and write "Glass published"
// unconditionally. So anything that ran it stamped a publish, including a `claude -p` watch, which
// on the Blade has no Artifact tool and therefore cannot publish at all (settled behaviourally
// that night: ToolSearch("select:Artifact") and ToolSearch("+artifact") both returned no matching
// deferred tools, and the print session's own prompt listed subagent tools as "All tools except
// Agent, Artifact, ArtifactComments..."). The stamp could only ever say one thing, which is what
// CLAUDE.md means by "a measurement that cannot fail is not a measurement".
//
// WHAT IT COST, so nobody softens this back: on the night it was found, a session read this file
// twice and reported it to Wyatt as fact — once as evidence of when the Glass had last been
// published, once as the baseline of a polling watch it had armed. Neither reading was safe, and
// neither was flagged as unsafe, because the file looks authoritative.
//
// WHAT THIS DOES AND DOES NOT BUY. It does NOT make forgery impossible; a determined caller can
// invent a string. It converts a SILENT honour system into an EXPLICIT claim that names a
// checkable artifact version — the stamp stops being an assertion and becomes a receipt somebody
// can hold against the live page. That is the whole of the improvement, and overstating it here
// would be the same class of error the file is being fixed for.
//
// DELIBERATELY NOT DONE: no attempt to contact the artifact and confirm the version is real. This
// is a plain node script; it cannot reach the Artifact tool. A check that pretended to verify
// something it cannot reach would be the instrument failure this fix exists to end.
//
// LAST-PUBLISH is local and gitignored, same as HEARTBEAT — per-machine by nature. NOTE (verified
// 2026-09-01): no CODE currently reads it. The publish-lag brake it was written to feed,
// wyclau-stop-keep-working.cjs, was deleted in claude-kit commit 2dd722c (the Watch redesign) and
// exists in neither repo nor in settings.json. It is kept because SESSIONS read it and act on it,
// which is precisely why it must not be able to lie to them.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clockRefusal, unrecognisedNote } from "./lib/artifact_version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WY = join(ROOT, ".planning", "wyclau");
const LAST_PUBLISH = join(WY, "LAST-PUBLISH");

const arg = process.argv.slice(2).find((a) => a.startsWith("--version="));
const version = arg ? arg.slice("--version=".length).trim() : "";

if (!version) {
  console.error(`REFUSING TO STAMP — no publish to record.

This file is a RECEIPT for a publish that happened, not a note that one was intended.
Stamping it without one tells the next reader (a session, or Wyatt) that the Glass is
current when it may not be, and nothing downstream can tell the difference.

Pass the version the Artifact publish call returned:

  node scripts/wyclau/mark_glass_published.mjs --version=<id> --harvested=<the page file your read saved>

If you have no version id, you have not published. Publish first:
  1. READ the live page and harvest any ideas/rulings into .planning/CHART.md
  2. node scripts/wyclau/glass.mjs --note "..."
  3. publish .planning/wyclau/glass.html with the Artifact tool
  4. then run this, with the version that call returned.

If you have no Artifact tool at all -- a 'claude -p' watch on some machines does not --
then you cannot publish and must not stamp. Write what you wanted shown into
.planning/wyclau/GLASS-NOTE.md and commit it; the next session that CAN publish folds it in.`);
  process.exit(1);
}

/* ⚑ AND IT MUST BE AN IDENTITY, NOT A CLOCK — `T-111`. Refusing an EMPTY value is not checking its
   KIND: on 2026-09-02 this file recorded `version=2026-09-02T22:06:23.279Z`, eleven minutes after
   holding a real id, and nothing objected. That also broke a detector that was working — the
   cheapest way to tell HIS save from a session's publish was whether this line named the version the
   notification announced, and two different KINDS of value cannot be compared at all. The rule is
   shared with the harvest stamp; one copy, or they drift. */
const clockProblem = clockRefusal(version, "scripts/wyclau/mark_glass_published.mjs");
if (clockProblem) {
  console.error(clockProblem);
  process.exit(1);
}
const oddVersion = unrecognisedNote(version, "scripts/wyclau/mark_glass_published.mjs");
if (oddVersion) console.error(oddVersion);

/* ⛔ THE PUBLISHER MUST HAVE LOOKED AT HIS PAGE — `T-210`, filed off the live receipts, not reasoned.
 *
 *   LAST-HARVEST  11:22:00.631Z  version 1788433599-0141  stamped by ONE session
 *   LAST-PUBLISH  11:22:29.562Z  version 1788434543-bb7a  by a DIFFERENT one
 *
 * Twenty-nine seconds apart, and the publisher never stamped a harvest of its own. The publish hook
 * allowed it because `LAST-HARVEST`'s MTIME was fresh — **and that file is machine-local, so every
 * session on this machine shares one.** ONE SESSION'S LOOK LICENSED ANOTHER SESSION'S OVERWRITE, and
 * the session doing the overwriting had no idea when the page was last read or what was on it.
 *
 * So `--harvested=` is REQUIRED here, exactly as it is on `mark_glass_harvest.mjs` (`T-140`): name
 * the page file YOU read, and the harvest receipt must name the same one. A session that never read
 * the page has no such file to name.
 *
 * ⛔ AND THE FIRST VERSION OF THIS COMPARED THE BASENAME, WHICH IS NOT AN IDENTITY — CEO 168, and
 * the claim was written into four files before it was checked. It said: the Artifact tool saves each
 * read under the READING SESSION's own directory
 * (`…/projects/<project>/<SESSION-ID>/tool-results/artifact-<id>-<version>.html`), so the session id
 * is already in the path. **The path is real. `basename()` threw it away** — one character before it
 * would have been used — so the check asked *"did anyone on this machine read this page version?"*
 * and never *"did YOU?"*. Measured: session directories routinely hold byte-identical basenames for
 * the same version — one version in three of them, eleven more in two.
 *
 * ⛔ AND THE INCIDENT THIS ROW WAS FILED OFF WOULD HAVE PASSED. CEO 168 read the mtimes: the peer
 * had that page on disk at 11:22:15Z, **fourteen seconds before it stamped**. Naming its own copy
 * would have matched a basename harvested by a different session, and it would have been waved
 * through. **The fix would not have refused the event it is named for.**
 *
 * ✅ SO THE COMPARISON IS THE FULL RESOLVED PATH, and the claim above is now true rather than
 * comforting. A publisher must have read the page ITSELF: another session's copy lives under another
 * session's id and cannot match. Case-insensitive because Windows paths are, and a session that
 * retypes a path in a different case is doing nothing wrong (CEO 168 found that refusal).
 *
 * ⚠ WHAT THIS DOES **NOT** DO, and the first version of this note overstated it in four places
 * (CEO 168). **IT DOES NOT PREVENT THE DELETION.** The destructive act is the Artifact republish,
 * and the only thing in front of that is `.claude/hooks/glass-harvest-first.cjs`, a `PreToolUse`
 * deny keyed on `LAST-HARVEST`'s MTIME — machine-local, shared, and untouched by this. A session
 * that never looked can still publish and still delete his words. **What it can no longer do is
 * file a clean receipt afterwards** — which matters, because this file's own header records that
 * sessions read `LAST-PUBLISH` and act on it, but it is a smaller thing than "his words are safe".
 * **Nor does it close the race:** he can write between a read and a publish, and
 * `mark_glass_harvest.mjs`'s header records a 7-second instance. Closing that needs the hook, and
 * the hook lives under `.claude/`, which needs Wyatt's own hands. */
const harvestedArg = (process.argv.slice(2).find((a) => a.startsWith("--harvested=")) ?? "").slice("--harvested=".length).trim();
if (!harvestedArg) {
  console.error(`REFUSING TO STAMP — this publish did not say WHICH PAGE it read.

Republishing regenerates his page from disk, so it DELETES every idea, comment and ruling nobody
carried off first. A publish stamped by a session that never read the live page is that deletion
with a clean receipt over it.

  --harvested=<the html file the Artifact read saved for THIS session>

Read the page, carry it, then stamp:

  node scripts/wyclau/harvest_glass.mjs --html=<that file>
  node scripts/wyclau/mark_glass_harvest.mjs --version=<id> --rulings=<...> --harvested=<that file>

Nothing was written.`);
  process.exit(1);
}
{
  const mine = resolve(harvestedArg);
  let receipt = "";
  try { receipt = readFileSync(join(WY, "LAST-HARVEST"), "utf8"); } catch { /* none yet */ }
  /* ⚠ TWO BLANKS MUST NOT AGREE — the trap this session fell into five times tonight, where a check
     passes because an empty value matched an empty field: `"".includes("")` is true, and a missing
     receipt reads as `""`.
     ⛔ THE EXPLICIT `!want` GUARD IS GONE, AND ITS HISTORY IS THE POINT. It compared a BASENAME, and
     `basename(resolve("C:\\"))` is `""` — so the guard was load-bearing, while I had labelled it
     "UNREACHABLE, MEASURED" from the wrong input (`resolve("")`, the current directory). CEO 168
     disproved that. Comparing the FULL RESOLVED PATH removes the emptiness entirely: `resolve()` of
     any non-empty argument is never `""`, and the flag is required and trimmed above. **The needle
     also can no longer be empty**, because it is a quoted JSON field name plus a value. Deleting
     the value that could be blank beats guarding it and beats defending a guard nobody can reach.
     Case 7 keeps a drive root in the suite so this stays true rather than becoming true by luck. */
  /* ⛔ ANCHORED, because the loose form let eight characters through — CEO 168 measured
     `--harvested=artifact` (a prefix), `--harvested=harvestedFile` (a JSON KEY in the receipt) and a
     truncated filename ALL accepted. `mark_glass_harvest.mjs` had this right one file away
     (`from=${want}`) and this half was the sloppy one. Now it must match the whole quoted value. */
  /* ⛔ PARSED, NOT STRING-MATCHED. CEO 168 was right that the loose `includes()` let eight
     characters through (`--harvested=artifact`, and even `harvestedFile`, a KEY in the receipt) —
     and the first anchored version traded that for a worse dependency: it matched
     `"harvestedPath": "…"` **with the space that `JSON.stringify(obj, null, 2)` happens to emit**,
     so a receipt written compactly stopped matching and every publish was refused again. A needle
     that depends on someone else's whitespace is not an anchor. Read the field. */
  let recordedPath = null;
  try { recordedPath = JSON.parse(receipt).harvestedPath ?? null; } catch { recordedPath = null; }
  const same = typeof recordedPath === "string" && recordedPath.length > 0
    && resolve(recordedPath).toLowerCase() === mine.toLowerCase();
  if (!same) {
    console.error(`REFUSING TO STAMP — no harvest receipt for ${mine}.

.planning/wyclau/LAST-HARVEST ${receipt ? "names a different page" : "does not exist"}, so THIS
session has not read and carried the page it is about to replace. Another session's harvest is not
yours: the receipt is machine-local and shared, which is exactly how a publisher that never looked
gets waved through.

  node scripts/wyclau/harvest_glass.mjs --html=${harvestedArg || "<the file your read saved>"}

Nothing was written.`);
    process.exit(1);
  }
}

/* RECORD WHAT WAS PUBLISHED, not merely that something was. Without this the receipt says a publish
   happened and nothing can ask "of what?" — so glass_needs_publish.mjs has nothing to compare the
   current state against and every tick must publish.

   ⚠ CORRECTED SAME DAY, CEO 82: this used to say "same quantity glass.mjs uses for last progress …
   so the page and the change-gate can never disagree". FALSE from the moment the note-reset filter
   landed — glass.mjs still computes its last-progress commit unfiltered. The gate and this stamp
   agree with each other (one function, imported below); the PAGE runs slightly ahead of both right
   after a note reset, overstating freshness. Overstating never suppresses a publish, so it is
   tolerated — but it is a real divergence and is stated rather than papered over. A comment that
   makes a behavioural claim rots, and this one rotted the day it was written.

   Derived here rather than passed in: a caller
   that has to type it is a caller that can mistype it. If git will not answer, the stamp says so
   rather than inventing a hash — and glass_needs_publish reads a missing commit as PUBLISH.

   ⚠ IMPORTED FROM glass_needs_publish.mjs, NEVER REPEATED HERE. Rule 23: two things that must
   agree are ONE thing, or they will drift. The first version of the echo-tick fix put a pathspec in
   the gate and left this file recording an UNFILTERED head — so the gate would have compared a
   filtered hash against an unfiltered stamp, they could never match, and the result would have been
   a permanent false PUBLISH. Caught before shipping by asking what makes these two agree; the
   honest answer was "nothing", so now there is only one definition of "the newest work commit". */
let head = "unknown";
try {
  const { newestWorkCommit } = await import("./glass_needs_publish.mjs");
  head = newestWorkCommit(ROOT) || "unknown";
} catch { head = "unknown"; }

const nowIso = new Date().toISOString();
mkdirSync(WY, { recursive: true });
writeFileSync(LAST_PUBLISH, `${nowIso}\tGlass published\tversion=${version}\tcommit=${head}\n`);
console.log(`LAST-PUBLISH stamped ${nowIso} (artifact version ${version}, commit ${head.slice(0, 7)})`);
