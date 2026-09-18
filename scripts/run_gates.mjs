#!/usr/bin/env node
/* scripts/run_gates.mjs — WHAT `npm test` IS NOW.
 *
 * ============================================================================
 * Why `npm test` is one command instead of 171
 * ============================================================================
 * `npm test` used to be the whole chain, inline in `package.json`'s `scripts.test`:
 * `node gate1 && node gate2 && … && node gate171`. npm hands that string to
 * `cmd.exe /d /s /c "…"`, and cmd.exe refuses a command line past 8191 characters.
 *
 * MEASURED, twice, by binary search on Wy-Blade (architecture item 24, and again for item 63):
 * the longest `scripts.test` that runs is **8154 characters**. At 8155 the run dies with
 * "The command line is too long." — npm exit 1, no gate started, and nothing in that message
 * tells you it was a length problem with the suite rather than a broken gate.
 * The chain stood at **8150**. Four characters. A 172nd gate under ANY name killed the suite.
 *
 * So the list moved to `scripts/gates.manifest.json` and `scripts.test` became `node scripts/run_gates.mjs`.
 * The manifest has no ceiling; this file walks it.
 *
 * ============================================================================
 * What it must keep true, and how (each of these is here because it already cost something)
 * ============================================================================
 *  1. ORDER. Gates run in manifest order, entry 1 first. `scripts/qa/stray_probe_check.mjs` is
 *     entry 1 and must stay there — on 2026-09-03 it ran 117th, a false failure ~90th switched it
 *     off, and it stayed off for a day. `stray_probe_reaper_check.mjs` case 4 fails the build if it
 *     ever moves.
 *  2. STOP AT THE FIRST RED. `&&` did this for free; a loop has to be written to do it, so it is
 *     asserted rather than assumed — `gate_count_check.js` drives this runner against a fixture
 *     manifest shaped pass → verbose-pass → FAIL → never-run and checks the last one never ran.
 *  3. NAME THE FAILING GATE, and exit with its own exit code. Never summarise, never run on.
 *  4. NO SHELL. Each entry is spawned as `node <script> [flags]` with an argv array — nothing to
 *     quote, no platform to get the quoting wrong on (QA-PROCESS §2b: a literal space in a
 *     `--format=` string, a `^` in a revision, are how this suite has been bitten before).
 *
 * ============================================================================
 * TIMEOUTS: there are none, DELIBERATELY — and a hang is no longer silent
 * ============================================================================
 * The `&&` chain had no per-gate timeout either, so this is not a regression; it is a choice, and
 * the reason is worth writing down so nobody "fixes" it by typing a number. A wall-clock kill would
 * be a hardcoded constant standing in for a quantity nobody has measured (CLAUDE.md: nothing is a
 * constant), and this suite already has TWO gates that go red only UNDER LOAD
 * (`checks_pointer_events_redproof.mjs`, `detached_trial_windowless_check.mjs` — see the run rules).
 * A timeout would turn those into manufactured reds on a busy laptop, which is strictly worse than
 * the fault it would guard against.
 *
 * What DOES change: every gate announces itself on its own line BEFORE it runs
 * (`[ 57/171] node scripts/qa/…`), so a run that stops dead names the gate it is stuck in. Under
 * the old chain a hang printed nothing at all and you had to guess from the last gate that spoke.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { readGates, splitEntry, REPO_ROOT, MANIFEST_PATH } from "./lib/gate_chain.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf("=");
  return eq < 0 ? true : hit.slice(eq + 1);
};

const manifestFlag = flag("manifest");
const manifestPath = typeof manifestFlag === "string" && manifestFlag
  ? path.resolve(REPO_ROOT, manifestFlag)
  : MANIFEST_PATH;

let gates;
try {
  gates = readGates({ manifestPath });
} catch (e) {
  console.error(`\nFAIL: ${e.message}`);
  process.exit(1);
}

if (flag("list")) {
  for (const g of gates) console.log(g);
  process.exit(0);
}

if (gates.length === 0) {
  /* An empty manifest is not a green suite. gate_count_check.js says the same thing about the
     count; it is repeated here because THIS is the file that would otherwise print "0/0 green". */
  console.error(`\nFAIL: the gate manifest (${path.relative(REPO_ROOT, manifestPath).split(path.sep).join("/")}) lists NO gates. A suite that checks nothing is not a green suite (docs/HARD-WON-LESSONS.md §3).`);
  process.exit(1);
}

const width = String(gates.length).length;
const t0 = Date.now();

for (let i = 0; i < gates.length; i++) {
  const entry = gates[i];
  const { script, args } = splitEntry(entry);
  /* The name goes out BEFORE the gate runs — that line is what identifies a gate that hangs. */
  console.log(`\n[${String(i + 1).padStart(width)}/${gates.length}] ${entry}`);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    windowsHide: true,
  });

  if (r.error) {
    console.error(`\n${"─".repeat(78)}`);
    console.error(`FAILING GATE: ${entry}`);
    console.error(`  gate ${i + 1} of ${gates.length} — could not even be started: ${r.error.message}`);
    console.error(`  ${gates.length - i - 1} gate(s) after it did NOT run.`);
    process.exit(1);
  }
  if (r.signal) {
    console.error(`\n${"─".repeat(78)}`);
    console.error(`FAILING GATE: ${entry}`);
    console.error(`  gate ${i + 1} of ${gates.length} — killed by signal ${r.signal}.`);
    console.error(`  ${gates.length - i - 1} gate(s) after it did NOT run.`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\n${"─".repeat(78)}`);
    console.error(`FAILING GATE: ${entry}`);
    console.error(`  gate ${i + 1} of ${gates.length}, exit code ${r.status}.`);
    console.error(`  ${gates.length - i - 1} gate(s) after it did NOT run — \`npm test\` stops at the first red.`);
    console.error(`  Re-run just this one:  ${entry}`);
    /* Its own exit code, not a flattened 1: a gate that exits 2 to mean "I could not judge this"
       must not arrive as "I judged this and it failed". */
    process.exit(r.status);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${"─".repeat(78)}`);
console.log(`PASS — all ${gates.length} gate(s) green in ${secs} s (scripts/gates.manifest.json, in order).`);
process.exit(0);
