#!/usr/bin/env node
// scripts/qa/quiet_gate_report.mjs
//
// THE OTHER HALF OF "gate retirement policy wired" — see docs/GATE-RETIREMENT.md for the policy
// this report serves, and scripts/qa/gate_ceiling_check.mjs for the ceiling half.
//
// ============================================================================
// This is a REPORT, not a gate. It is NOT in `npm test`, on purpose.
// ============================================================================
// Retiring a regression gate is the mirror image of the trap HARD-WON-LESSONS §12i describes: that
// entry is about an instrument that silently asserts on a copy of itself and so drifts to green
// with no failing behaviour behind it. Auto-retiring a gate whose subject "looks quiet" is the same
// failure aimed the other way — a mechanical script would be silently REMOVING real protection with
// no human ever looking at what it covers. So this prints CANDIDATES for a person (or a CEO review)
// to read and decide on. It never deletes, never edits scripts.test, never touches package.json.
//
// ============================================================================
// What "quiet" means here, mechanically (never hand-typed — CLAUDE.md convention 2)
// ============================================================================
// A gate is a PER-BUG candidate if its filename matches the project's own established naming
// convention for a numbered playtest/finding item: w<digits>_ or q<digits>_ under scripts/qa/
// (w21_weather_line_check.mjs, q18_narr_event_order_check.mjs, ...). Structural/contract gates
// (host_guest_parity_check.js, engine_contract_check.js, ...) do not match this pattern and are
// never listed — they guard a standing invariant, not one closed bug, and this report has no
// opinion about them.
//
// For each per-bug candidate, "quiet" is measured as: days since the gate's OWN file last changed
// in git. A gate nobody has had to touch since it shipped has not needed adjusting for a code
// change nearby — that is evidence worth a human's five minutes, not proof of anything by itself.
// This script says so in its own output; it is a prompt to go read the commit and the code, not a
// verdict.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");
const QA_DIR = path.join(__dirname);

const PER_BUG_NAME = /^[wq]\d+_.*\.mjs$/;
const QUIET_DAYS_THRESHOLD = 14;

function gitLastCommitDate(relPath) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", relPath],
      { cwd: REPO_ROOT, encoding: "utf8" }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

// A "gate" is a script actually wired into the suite — scripts.test is the only source of truth
// for that (CLAUDE.md convention 2). scripts/qa/ also holds one-off measurement probes that share
// the w##_/q##_ naming (e.g. w14_swept_geometry.mjs, a POSE-THE-BOARD geometry probe, never a
// gate) — including those here would report retirement candidates for scripts nothing depends on,
// which is not this report's job and would mislead whoever reads it.
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
const chainStr = (pkg.scripts && pkg.scripts.test) || "";
const wiredScripts = new Set(
  [...chainStr.matchAll(/node\s+(\S+)/g)].map((m) => m[1].split(path.sep).join("/"))
);

const files = fs
  .readdirSync(QA_DIR)
  .filter((f) => PER_BUG_NAME.test(f))
  .filter((f) => wiredScripts.has(`scripts/qa/${f}`));

const skipped = fs.readdirSync(QA_DIR).filter((f) => PER_BUG_NAME.test(f) && !wiredScripts.has(`scripts/qa/${f}`));

if (files.length === 0) {
  console.log("No per-bug gates found wired into npm test (naming convention w<digits>_ / q<digits>_ under scripts/qa/). Nothing to report.");
  process.exit(0);
}

const rows = [];
for (const f of files) {
  const rel = path.join("scripts", "qa", f).split(path.sep).join("/");
  const lastCommit = gitLastCommitDate(rel);
  const days = lastCommit ? Math.floor((Date.now() - new Date(lastCommit).getTime()) / 86400000) : null;
  rows.push({ file: f, rel, lastCommit, days });
}

rows.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));

console.log(`${rows.length} per-bug gate(s) found wired into npm test under scripts/qa/ (w<digits>_ / q<digits>_ naming).`);
if (skipped.length) {
  console.log(`(${skipped.length} file(s) share the naming but are NOT in scripts.test — one-off probes, not gates; not reported: ${skipped.join(", ")})`);
}
console.log(`Quiet threshold for this report: ${QUIET_DAYS_THRESHOLD}+ days since the gate file itself last changed.`);
console.log(`This is a REPORT ONLY — it never retires anything. Read docs/GATE-RETIREMENT.md before archiving.\n`);

let quietCount = 0;
for (const r of rows) {
  const tag = r.days === null ? "UNTRACKED" : r.days >= QUIET_DAYS_THRESHOLD ? "QUIET — candidate" : "recent";
  if (tag.startsWith("QUIET")) quietCount++;
  const daysStr = r.days === null ? "no git history found" : `${r.days}d since last touched`;
  console.log(`  [${tag}]  ${r.rel}  (${daysStr})`);
}

console.log(`\n${quietCount} of ${rows.length} are quiet-candidates. Next step for each: open the gate, open the code`);
console.log(`it guards, confirm the specific defect can no longer occur (deleted code path, superseded by a broader`);
console.log(`structural gate) — never on this report's say-so alone — then \`git mv\` it into scripts/qa/gate_archive/`);
console.log(`and drop it from package.json's scripts.test + gates.total in the same commit.`);

process.exit(0);
