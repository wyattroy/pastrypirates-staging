#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
/* start_trial_detached.mjs — a sea trial that belongs to the MACHINE, not to any session.
 *
 * WHY. Three trials died in one day (2026-09-01) because they ran as background children of a
 * Claude session turn, and a background job dies with its session. Wyatt's ruling that day:
 * "the watchdog cannot run a sea trial — only you can" — and the redesign's answer (learning 2
 * of the Bosun's own brief: "a long job needs an owner that outlives it") is that no session
 * runs one AT ALL. This wrapper detaches the trial from everything: the watch that starts it
 * ends its turn immediately, and later watches read the report the trial writes.
 *
 * WHAT IT DOES:
 *   1. Spawns `node scripts/sea_trial.mjs --report=<owned path> [your extra args]` fully
 *      detached (its own process group; stdio to a log file; parent exits freely).
 *   2. Writes the LONG-RUN marker the Glass displays — label, startedAt, pid, report path.
 *      The trial itself owns progress updates; this marker is the birth certificate, and
 *      `progressAt` here means "nothing measured yet", never "progressing" (the F8 lesson:
 *      a freshness clock must not wear a progress clock's name).
 *   3. Prints the report path and pid, and how a later watch checks on it.
 *
 * The report path is OWNED (per-run, stamped), never .planning/SEA-TRIAL.md — two machines once
 * overwrote each other's verdicts at that hardcoded path (CLAUDE.md section 3).
 *
 * USAGE: node scripts/wyclau/start_trial_detached.mjs [--label="10 legs, full gear"] [sea_trial args…]
 */
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const trial = path.join(repo, "scripts", "sea_trial.mjs");
if (!fs.existsSync(trial)) { console.error(`no sea_trial.mjs at ${trial}`); process.exit(2); }

const rawArgs = process.argv.slice(2);
const labelArg = rawArgs.find((a) => a.startsWith("--label="));
const label = labelArg ? labelArg.slice(8) : "sea trial (detached)";
const passthrough = rawArgs.filter((a) => !a.startsWith("--label="));

const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
const runId = `${stamp}-${os.hostname().split(".")[0]}`;
const reportPath = path.join(repo, ".planning", `SEA-TRIAL-${runId}.md`);
const outDir = path.join(repo, ".planning", "wyclau", "detached");
fs.mkdirSync(outDir, { recursive: true });
const logPath = path.join(outDir, `trial-${runId}.out`);
const logFd = fs.openSync(logPath, "a");

// A trial already running on this machine is a reason to stop and look, not to stack a second —
// same hazard as two engines on one branch. The marker's pid is checked against the live table.
const markerPath = path.join(repo, ".planning", "wyclau", "LONG-RUN");
try {
  const prev = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  if (prev && prev.pid) {
    try {
      process.kill(prev.pid, 0); // signal 0: existence check only
      console.error(`REFUSED: a detached long run is already alive (pid ${prev.pid}, "${prev.label}", report ${prev.reportPath}).`);
      console.error("Read its report instead. If it is genuinely dead but the pid was recycled, delete the LONG-RUN marker and re-run.");
      process.exit(1);
    } catch { /* pid gone — the marker is stale, proceed over it */ }
  }
} catch { /* no marker or unreadable — proceed */ }

const child = spawn(process.execPath, [trial, `--report=${reportPath}`, ...passthrough], {
  cwd: repo,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", logFd, logFd],
});
child.unref();

// Field names match longrun_status.mjs's schema (what/progress/updatedAt/staleAfterMinutes) —
// the trial's own markProgress() overwrites this marker seconds later, and two formats for one
// file is the drift CLAUDE.md rule 23 exists for. pid/runId/reportPath are additive extras.
fs.writeFileSync(markerPath, JSON.stringify({
  what: label, progress: "starting", updatedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  runId, pid: child.pid,
  reportPath: path.relative(repo, reportPath),
  logPath: path.relative(repo, logPath),
}, null, 2) + "\n");

console.log(`DETACHED: "${label}" — pid ${child.pid}, run ${runId}`);
console.log(`  report: ${path.relative(repo, reportPath)}`);
console.log(`  log:    ${path.relative(repo, logPath)}`);
console.log("This process now exits; the trial does not. A later watch checks on it by reading the");
console.log("report, and confirms liveness with the pid in .planning/wyclau/LONG-RUN. END your turn.");
