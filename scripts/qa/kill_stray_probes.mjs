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
import { askTheOS, parseProbes, killPid, isWin } from "../lib/stray_probes.mjs";

const DRY = process.argv.includes("--dry-run");
const QUIET = process.argv.includes("--quiet");
const say = (m) => { if (!QUIET) console.log(m); };

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
try { after = parseProbes(askTheOS()).filter((p) => p.orphan); } catch { /* reported below */ }

console.log(`stray probes: killed ${killed.length} abandoned debug browser(s)` +
  (inUse ? `, left ${inUse} that a live launcher is still using` : "") + ".");
if (survived.length) console.log(`  ${survived.length} would not die (${survived.join(", ")}) — likely another user's, or already gone.`);
if (after.length) console.log(`  ${after.length} orphan(s) still present after the sweep: ${after.map((p) => p.pid).join(", ")}`);
if (!after.length && killed.length) console.log(`  the machine is clear of abandoned probes.${isWin ? "" : ""}`);
process.exit(0);
