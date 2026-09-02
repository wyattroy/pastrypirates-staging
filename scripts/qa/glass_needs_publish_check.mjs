#!/usr/bin/env node
/* glass_needs_publish_check.mjs — the Glass must publish on a CHANGE, not on a CLOCK.
 *
 * WHY (Wyatt, 2026-09-01): "i think it violates past learnings in multiple ways regarding timers",
 * and a CEO audit upheld him. bell.ps1:9-13 records that the previous watchdog's judgement stack
 * "guessed wrong in both directions … and is DELETED, not tuned", replaced by one question the OS
 * answers truthfully. THE TICK IS NOT THE FAULT — the Bell has one and it survived that redesign.
 * Acting unconditionally is the fault.
 *
 * MEASURED, not asserted, the night this was written. Three autonomous ticks published the Glass at
 * 22:32:20Z, 22:48:00Z and 23:03:01Z. The newest commit across all refs was 22:46:11Z at the second
 * AND the third. GLASS-NOTE.md had not moved since 21:50Z. So the 23:03 publish carried nothing new
 * — and overnight, when nothing lands, essentially all 96 daily ticks are that.
 *
 * IT IS NOT MERELY WASTE. glass.mjs records that a republish without a harvest first DELETES what
 * Wyatt typed on the page, and glass.mjs's ONE PUBLISHER block records what two publishers cost
 * (a conflict guard firing three times in five minutes). A clock multiplies the unattended chances
 * to hit both.
 *
 * WHAT THE CHECKED SCRIPT MUST AND MUST NOT DO. It answers only what it can see truthfully — the
 * newest landed commit, and whether a note is queued. IT CANNOT SEE IDEAS WYATT TYPED ON THE LIVE
 * PAGE; only a session with the Artifact tool can read those. So it must never be used to skip the
 * harvest, and it must say so itself. A check that quietly caused his words to go unharvested would
 * be far worse than the waste it exists to remove.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "wyclau", "glass_needs_publish.mjs");

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log("the Glass publishes on a change, not on a clock\n");

if (!existsSync(SCRIPT)) {
  fail(`scripts/wyclau/glass_needs_publish.mjs does not exist — the tick has nothing to ask, so it publishes every time`);
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}

const run = (env) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { ...process.env, ...env } }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

const src = readFileSync(SCRIPT, "utf8");

// 1. IT MUST ANSWER IN TWO WORDS A TICK CAN BRANCH ON, and nothing else.
{
  const r = run({});
  const verdict = (r.out.match(/\b(PUBLISH|NOTHING-MOVED)\b/) || [])[1];
  if (!verdict) fail(`printed neither PUBLISH nor NOTHING-MOVED — a tick cannot branch on it. Got: ${r.out.trim().slice(0, 120)}`);
  else pass(`answers with a single verdict a tick can branch on (${verdict})`);
}

// 2. THE VERDICT MUST BE DERIVED, never a constant. Rule 9: nothing is a constant.
{
  if (!/execFileSync|spawnSync/.test(src) || !/rev-parse|log/.test(src))
    fail("does not derive the answer from git — a verdict not computed from real inputs is a constant in disguise");
  else pass("derives its answer from the newest landed commit, not from a stored guess");
  if (!/GLASS-NOTE/.test(src))
    fail("ignores GLASS-NOTE.md — a queued note for Wyatt is a reason to publish and would be missed");
  else pass("treats a queued GLASS-NOTE.md as a reason to publish");
}

// 3. EVERY DOUBT RESOLVES TO PUBLISH. Same discipline as longRunStatus resolving to STALLED: a
//    broken input must never be able to SUPPRESS a publish, because the failure mode of a missed
//    publish is Wyatt reading a frozen page, which is the whole bug this project started from.
{
  if (!/PUBLISH/.test(src) || !/catch/.test(src))
    fail("has no failure path — an unreadable input must resolve to PUBLISH, never to silence");
  else pass("has a failure path that can resolve to PUBLISH");
  const nothingMovedCount = (src.match(/NOTHING-MOVED/g) || []).length;
  const publishCount = (src.match(/\bPUBLISH\b/g) || []).length;
  if (nothingMovedCount >= publishCount)
    fail(`says NOTHING-MOVED at least as often as PUBLISH (${nothingMovedCount} vs ${publishCount}) — suspicious for a check whose every doubt must resolve to PUBLISH`);
  else pass("resolves more paths to PUBLISH than to NOTHING-MOVED, as a safe default should");
}

/* 3b. THE LOOP MUST NOT PUBLISH ON ITS OWN HOUSEKEEPING — the echo tick.
      MEASURED 2026-09-02, reported by the running publisher rather than theorised: every real note
      cost TWO publishes. `fb6deef4` was a watch adding a note AND a ledger entry (real work), so
      that tick published and stamped at fb6deef4 — and THEN committed the note reset as
      `7b191d1e`, whose entire diff is GLASS-NOTE.md, 19 deletions, nothing else. The next tick saw
      7b191d1e ≠ fb6deef4, called it work landed, and republished a page carrying nothing new.
      One wasted publish per note, predictably, forever.
      THE FIX IS NOT TO REORDER THE STAMP. Stamping after the commit would record a hash newer than
      what was actually published, so work landing in that window would be swallowed — a false
      NOTHING-MOVED, which is the dangerous direction. Instead the commit comparison IGNORES commits
      whose entire diff is GLASS-NOTE.md, because that file already has its OWN dedicated check
      above: a note being ADDED is caught by "is a note queued", and a note being REMOVED is
      housekeeping by construction. One signal, one owner — counting the note twice is what created
      the echo. */
{
  if (!/exclude\)?\.planning\/wyclau\/GLASS-NOTE\.md|exclude.*GLASS-NOTE/.test(src))
    fail("counts its own GLASS-NOTE.md reset as work landed — every real note costs a second, empty publish on the next tick (measured: fb6deef4 -> 7b191d1e)");
  else pass("ignores commits whose only change is GLASS-NOTE.md — the note has its own check, and counting it twice is the echo tick");
}

// 4. IT MUST SAY, ITSELF, THAT IT CANNOT SEE THE PAGE. The one way this tool could do real harm is
//    by being trusted to decide whether the harvest is needed. It cannot: only a session with the
//    Artifact tool can read what Wyatt typed.
{
  if (!/harvest/i.test(src))
    fail("never mentions the harvest — nothing stops a future reader using this to skip reading the live page, which is how his words get deleted");
  else pass("names the harvest, so it cannot be mistaken for permission to skip it");
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
