#!/usr/bin/env node
/* glass_gate_log.mjs — run the Glass tick's change-gate, ALWAYS, and write down what it said.
 *
 * ⚠ NOT VENDORED. Every other file in scripts/wyclau/ carries a VENDORED-FROM header and is listed
 * in .claude/wyclau/MANIFEST.sha256; this one is not, and is edited here. It exists BESIDE the
 * vendored gate rather than inside it because `glass_needs_publish.mjs` is kit-owned and this
 * machine cannot reach the kit. If wyclau is ever re-vendored, this is a candidate to fold in.
 *
 *   node scripts/wyclau/glass_gate_log.mjs [--harvested] [--gate=<path>] [--log=<path>]
 *     exit 0  -> PUBLISH        carry on through the full publish loop
 *     exit 10 -> NOTHING-MOVED  end the tick here, silently
 *
 * ============================================================================
 * WHY THIS EXISTS — INBOX-20260902T0120Z
 * ============================================================================
 * On the 01:02Z Glass tick the harvest had already found a real ruling and a real idea, so the
 * tick published without running the change-gate at all. The runbook told it to: step 3 said
 * "if step 2 found ideas or rulings, you are publishing regardless of what this says."
 *
 * THE PUBLISH WAS RIGHT. His words landing on the Chart IS a change. What was wrong is that the
 * CHECK went unrun and therefore unrecorded, and the publisher named the distinction itself:
 *
 *   "'the answer was moot' and 'the gate ran and I have a verdict on record' are different
 *    things, and only the second is auditable."
 *
 * FROM OUTSIDE, A SKIPPED GATE AND AN UNWIRED GATE LOOK IDENTICAL. `npm test` is green either
 * way and everybody believes the guard is live — the same shape as the publish stamp that a
 * non-publishing watch could still write, fixed hours earlier the same night. A gate that is
 * present but not consulted is worse than no gate, because it buys confidence it has not earned.
 *
 * SO THE OVERRIDE MOVES OFF THE CHECK AND ONTO THE ACTION. `--harvested` says "this tick is
 * publishing whatever you say" — and the gate still runs, and its real verdict is still what gets
 * written down. One subprocess per tick buys an auditable record instead of a session's memory.
 *
 * ============================================================================
 * EVERY DOUBT RESOLVES TO PUBLISH — inherited deliberately, not re-decided
 * ============================================================================
 * The gate's own header: "a broken input must never be able to SUPPRESS a publish, because the
 * failure mode of a missed publish is Wyatt reading a frozen page, which is the bug this whole
 * subsystem exists to prevent." A wrapper that resolved a crashing gate to silence would defeat
 * that from the outside. So anything this cannot read as one of the two verdicts is logged
 * UNREADABLE and exits 0.
 *
 * A FAILED LOG WRITE MUST NOT SUPPRESS A PUBLISH EITHER. It is said loudly on stdout and the exit
 * code stands. Losing the audit line is bad; losing the publish is the bug.
 *
 * ============================================================================
 * WHY THE LOG IS MACHINE-LOCAL AND GITIGNORED, which was NOT the first instinct
 * ============================================================================
 * A tracked log would be readable from any machine, and that is what this watch set out to build.
 * It is wrong, and the reason is measurable rather than stylistic: `newestWorkCommit()` in
 * glass_needs_publish.mjs skips a commit only when its ENTIRE diff is GLASS-NOTE.md. Commit a log
 * line beside the note reset and that commit touches two files, so the next tick reads it as work
 * landing and republishes a page carrying nothing new — the ECHO TICK measured and removed on
 * 2026-09-02, one wasted publish per real note, forever. Extending that filter means editing a
 * vendored file this machine cannot reach.
 *
 * So this joins the wyclau block in .gitignore, whose own comment already states the rule: these
 * files are "per-machine by nature: each one's answer is only true about itself." The Glass has
 * ONE publisher at a time, so the machine that ticks is the machine that holds the answer.
 *
 * ⚠ WHAT IS THEREFORE STILL MISSING, named rather than left for someone to discover: a session on
 * ANOTHER machine cannot read this log. publish_status.mjs is the mechanism that would carry it
 * (it summarises exactly these local instruments into the tracked status/<host>.md) and it is
 * vendored too. Filed as a kit patch. Until then the cross-machine claim is NOT made.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const GATE = arg("gate", join(ROOT, "scripts", "wyclau", "glass_needs_publish.mjs"));
const LOG = arg("log", join(ROOT, ".planning", "wyclau", "GATE-LOG"));
const harvested = argv.includes("--harvested");

let out = "";
let gateExit = 0;
try {
  out = execFileSync(process.execPath, [GATE], { encoding: "utf8" });
} catch (e) {
  out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  gateExit = e.status ?? 1;
}
if (out.trim()) process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);

/* THE VERDICT IS THE EXIT CODE AND THE WORD AGREEING. Reading only the word would let a gate that
 * printed PUBLISH and then died be recorded as a clean PUBLISH; reading only the code would record
 * a verdict this file invented. When they disagree, this does not know what happened — and not
 * knowing is exactly what UNREADABLE is for. */
let verdict = "UNREADABLE";
let exitCode = 0;
if (gateExit === 0 && /\bPUBLISH\b/.test(out)) { verdict = "PUBLISH"; exitCode = 0; }
else if (gateExit === 10 && /\bNOTHING-MOVED\b/.test(out)) { verdict = "NOTHING-MOVED"; exitCode = 10; }

// The harvest overrides the ACTION only. The verdict above is already fixed and is what gets logged.
if (harvested) exitCode = 0;

const why = (out.split("\n").map((l) => l.trim()).find(Boolean) ?? "(the gate said nothing at all)")
  .replace(/^(PUBLISH|NOTHING-MOVED)\s*[—-]\s*/, "")
  .slice(0, 300);

const line = [
  new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  os.hostname(),
  verdict,
  `exit=${exitCode}`,
  harvested ? "override=harvest (his words were on the page, so this tick publishes regardless)" : "override=none",
  why,
].join("\t");

try {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, `${line}\n`);
} catch (e) {
  // Loud, and NOT fatal. See the header: losing the audit line is bad, losing the publish is the bug.
  console.log(`⚠ COULD NOT WRITE ${LOG} (${e.message}) — this tick is UNAUDITED. The verdict was: ${line}`);
}

process.exit(exitCode);
