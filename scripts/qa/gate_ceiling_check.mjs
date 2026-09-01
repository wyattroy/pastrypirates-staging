#!/usr/bin/env node
// scripts/qa/gate_ceiling_check.mjs
//
// THE SUITE CEILING — half of "gate retirement policy wired" (wyclau charter kill-list, risk 3:
// "wyclau can die by growing, like its predecessors").
//
// ============================================================================
// What this is, and what it deliberately is NOT
// ============================================================================
// This does not decide which gates to retire — that stays a human call, on purpose (see
// docs/GATE-RETIREMENT.md and HARD-WON-LESSONS §12i: an instrument that silently removes real
// protection is the same failure, in the opposite direction, as one that silently asserts on a
// copy of itself). What THIS check does is much narrower and fully mechanical: it refuses to let
// the suite grow past a declared ceiling without someone consciously raising the ceiling in the
// same edit — exactly the discipline gate_count_check.js already applies to the total itself.
//
// So growth is still allowed. It just can no longer happen silently. Hitting the ceiling is the
// prompt to go read docs/GATE-RETIREMENT.md's quiet-gate report and retire something, OR to decide
// the growth is worth it and raise the ceiling with a reason in the commit message.
//
// ============================================================================
// It reads the real declaration, not a copy (the §12i lesson, applied)
// ============================================================================
// package.json's own "gates" object is the single source for both numbers. This script does not
// hardcode either one — it would be exactly the dead-gate shape §12i describes if it did.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");
const PKG_PATH = path.join(REPO_ROOT, "package.json");

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const gates = pkg.gates;

const failures = [];

if (!gates || typeof gates !== "object") {
  failures.push(`GATE-CEILING: package.json has no top-level "gates" object at all — gate_count_check.js should already be catching this.`);
} else if (typeof gates.ceiling !== "number") {
  failures.push(`GATE-CEILING: package.json's "gates" object has no numeric "ceiling". Declare one — start at the current total (${gates.total}) so the NEXT new gate is the first conscious decision.`);
} else if (typeof gates.total !== "number") {
  failures.push(`GATE-CEILING: package.json's "gates.total" is not a number; gate_count_check.js should already be catching this.`);
} else if (gates.total > gates.ceiling) {
  failures.push(
    `GATE-CEILING-EXCEEDED: the suite has grown to ${gates.total} gates, past the declared ceiling of ${gates.ceiling}. ` +
    `This is not a bug in the new gate — it is the ceiling doing its job. Two honest ways through, in the same commit: ` +
    `(1) retire a quiet per-bug gate first (run \`node scripts/qa/quiet_gate_report.mjs\` for candidates, read docs/GATE-RETIREMENT.md, ` +
    `then \`git mv\` it into scripts/qa/gate_archive/ and drop it from scripts.test), or ` +
    `(2) raise "gates.ceiling" in package.json and say why growth was worth it in the commit message. ` +
    `Either way, do it deliberately — that is the entire point of this check.`
  );
}

if (failures.length) {
  console.error(`FAIL — suite ceiling`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS suite ceiling: ${gates.total}/${gates.ceiling} gates`);
process.exit(0);
