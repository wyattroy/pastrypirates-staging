#!/usr/bin/env node
/* kill_stray_probes.mjs — ACTUALLY KILL abandoned debug browsers, instead of printing a command
 * somebody has to notice and run.
 *
 * HIS QUESTION, 2026-09-03: *"did you fix this problem so that there are never any abandoned
 * browsers hitting my laptop anymore?"* — asked after being told the detector had been made
 * reachable again. **The honest answer was no**, and this file is the difference:
 *
 *   - `stray_probe_check.mjs` DETECTS and prints a command. It never killed anything.
 *   - It sits 117th of 127 in an `&&` chain, so **116 gates can silence it by failing first.**
 *     One of those was fixed today; the shape was not.
 *   - And it only looks when somebody runs `npm test`. A session that leaves browsers and never
 *     runs the suite is never noticed at all.
 *
 * WHAT IT COST: 183 chrome.exe processes carrying --remote-debugging-port, oldest more than a day
 * old, 15,097 MB, on the laptop he was asleep next to — while that session's own rule-17 check
 * reported no stray probes, because it was written with `pgrep`, which does not exist in Git Bash.
 *
 * ⛔ IT KILLS ORPHANS ONLY, AND THAT RESTRAINT IS THE DESIGN. A debug browser whose launcher is
 * still alive is a probe somebody is USING — a posed board mid-photograph (rules 19 and 26), a sea
 * trial at sea. Killing one of those would break live work to tidy up, which is a worse fault than
 * the mess. A browser whose parent has exited cannot be in use by anyone: nothing is holding it.
 *
 * `--dry-run` reports what it WOULD kill and touches nothing.
 * EXIT: always 0 unless it could not look. Tidying up must never fail a build or block a turn —
 * this runs from a Stop hook, and a hook that can fail is a hook somebody disables.
 */
import { execFileSync } from "node:child_process";
import { askTheOS, parseProbes, killPid, isWin } from "../lib/stray_probes.mjs";

const DRY = process.argv.includes("--dry-run");
const QUIET = process.argv.includes("--quiet");
const say = (m) => { if (!QUIET) console.log(m); };
/* ⭐ --quiet MEANS "SAY NOTHING WHEN THERE IS NOTHING TO SAY", NEVER "SAY NOTHING". The Stop hook
   runs this on every turn with --quiet, so a silent sweep is what a clean machine looks like — but
   a sweep that actually KILLED something is the one event I need to see, because it means a probe
   of mine leaked and I should fix the probe rather than lean on the sweep. Wyatt, 2026-09-10, with
   twenty-two of them cooking his laptop: "COME ON MAN!!!! you were supposed to learn this the last
   time!" A cleanup I never hear about is a lesson I never learn. */
const shout = (m) => console.log(m);

let text;
try { text = askTheOS(); }
catch (e) {
  /* A FAILED LOOK IS NOT AN EMPTY RESULT. Saying "all clear" here is the exact substitution that
     let 183 browsers accumulate unseen. */
  console.log(`stray probes: COULD NOT LOOK (${String(e.message || e).split("\n")[0]}) — reporting nothing rather than "all clear".`);
  process.exit(0);
}

const probes = parseProbes(text);
const orphans = probes.filter((p) => p.orphan);
const inUse = probes.length - orphans.length;

if (!probes.length) { say("stray probes: none — no debug-port browsers are running at all."); process.exit(0); }
if (!orphans.length) {
  say(`stray probes: ${inUse} debug-port browser(s) up, every one with a live launcher — in use, not abandoned. Nothing killed.`);
  process.exit(0);
}

if (DRY) {
  console.log(`stray probes: WOULD kill ${orphans.length} orphan(s) — ${orphans.map((o) => o.pid).join(", ")}` +
    (inUse ? `; leaving ${inUse} in use.` : "."));
  process.exit(0);
}

const killed = [];
const survived = [];
for (const o of orphans) (killPid(o.pid) ? killed : survived).push(o.pid);

/* COUNTED FROM THE OS AFTER THE FACT, never from the intention — the same rule the harvest counter
   earned. `taskkill /T` takes a whole tree, so re-asking is also how the child processes each
   orphan owns get counted honestly rather than assumed. */
let after = [];
/* ⚠ A BEAT BEFORE ASKING. SIGKILL is delivered immediately but the process is not off the table
   the same instant, so `process.kill(pid, 0)` inside killPid can still find it and report a
   failure to kill something that is already dying. Measured 2026-09-10 on a deliberately orphaned
   browser: the sweep printed "killed 0" and "1 would not die", and two seconds later the machine
   had zero browsers on it. */
try { execFileSync("/bin/sh", ["-c", "sleep 1"], { stdio: "ignore" }); } catch {}
try { after = parseProbes(askTheOS()).filter((p) => p.orphan); } catch { /* reported below */ }

/* ⭐ THE HEADLINE IS COUNTED FROM THE OS, NOT FROM WHAT killPid BELIEVED. The two disagree in the
   ordinary case above, and when they disagree the OS is right — this whole file exists because a
   number that was ASSERTED rather than measured let twenty-two browsers sit on Wyatt's laptop
   while the tooling said all was well. `survived` is kept, but only to name processes the OS
   still sees; a pid that killPid doubted and the OS cannot find was killed. */
const stillHere = new Set(after.map((p) => String(p.pid)));
const verifiedKilled = orphans.length - after.length;
(verifiedKilled ? shout : say)(`stray probes: ⚠ killed ${verifiedKilled} abandoned debug browser(s) — A PROBE OF MINE LEAKED` +
  (inUse ? `, left ${inUse} that a live launcher is still using` : "") + ".");
const reallySurvived = survived.filter((pid) => stillHere.has(String(pid)));
if (reallySurvived.length) shout(`  ${reallySurvived.length} would not die (${reallySurvived.join(", ")}) — likely another user's.`);
if (after.length) shout(`  ${after.length} orphan(s) still present after the sweep: ${after.map((p) => p.pid).join(", ")}`);
if (!after.length && verifiedKilled) shout(`  the machine is clear of abandoned probes.${isWin ? "" : ""}`);
process.exit(0);
