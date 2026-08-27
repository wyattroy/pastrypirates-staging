#!/usr/bin/env node
// scripts/gate_count_check.js
//
// THE FIRST THING `npm test` SAYS, AND THE ONLY REASON TO BELIEVE IT.
//
// ============================================================================
// Why this exists
// ============================================================================
// Before Phase 3, `npm test` was 21 green gates and **not one of them read `4/`** — the game
// Wyatt actually plays. Every one scanned the repo root's `src/`, which has had no code commit
// since 2026-08-02. *A gate aimed at the wrong tree is not silent, it is reassuring*
// (docs/HARD-WON-LESSONS.md §3). A suite in that state is worse than no suite, because it
// answers a question nobody asked in a voice that sounds like the answer to the one they did.
//
// So the suite now OPENS by stating what it is about to cover: how many gates are in the chain,
// and how many of them read `4/`.
//
// ============================================================================
// AND THE NUMBER MUST BE FALSIFIABLE — this is the whole design
// ============================================================================
// CLAUDE.md §5 convention 2: *never hand-type a number that can be counted.* A line reading
// `echo "21 gates, 7 read 4/"` is exactly the unfalsifiable claim that rule exists to kill — it
// stays cheerful forever while gates are added, removed or re-aimed underneath it.
//
// So this file does not print a number. It **parses `package.json`'s own `scripts.test` string**,
// splits the `&&` chain, counts the `node` invocations, counts the subset that reads `4/`, and
// exits non-zero if either count disagrees with the two numbers declared in `package.json`'s
// top-level `"gates"` object — NAMING BOTH FIGURES, declared and counted, so the failure tells
// you which way it drifted.
//
// The declared numbers are therefore not documentation. They are an assertion, and the chain is
// the witness.
//
// ============================================================================
// What counts as "reads 4/"
// ============================================================================
// A chain entry reads `4/` if EITHER:
//   - the script it runs lives under `4/scripts/` (a 4/-side gate, 4/-only by construction), OR
//   - the invocation carries the tree flag `--tree=4` (a root-side gate re-aimed by the shared
//     selector, scripts/lib/pick_tree.js).
// `--tree=root` explicitly does NOT count, and neither does a bare run. That is the point: the
// root game still has a suite, and its gates are still in the chain.
//
// ============================================================================
// It counts itself, deliberately
// ============================================================================
// This file is a `node` invocation in the chain, so it is one of the gates it counts — and it is
// a root-side gate that does not read `4/`, so it lands in `total` and not in `readingFour`.
// That is deterministic and stable; it is stated here so nobody "fixes" an off-by-one that isn't
// one. Self-exclusion would be the fragile choice, because it would need a rule about which
// entry to skip, and rules like that rot.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const PKG_PATH = path.join(REPO_ROOT, "package.json");

const failures = [];

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const chainStr = pkg.scripts && pkg.scripts.test;

if (typeof chainStr !== "string" || chainStr.trim() === "") {
  console.error(`FAIL: package.json has no scripts.test to count. There is no chain, so there is nothing this gate can honestly say about coverage.`);
  process.exit(1);
}

// Split on `&&` only. `;` and `||` are not used in this chain and would change failure semantics
// if they were — a `;` chain keeps going after a red gate, which is not a suite.
const entries = chainStr.split("&&").map((s) => s.trim()).filter(Boolean);

const NODE_INVOCATION = /^node\s+(\S+)/;

const gates = [];
const nonNode = [];
for (const entry of entries) {
  const m = entry.match(NODE_INVOCATION);
  if (!m) { nonNode.push(entry); continue; }
  const script = m[1];
  const readsFour = script.startsWith("4/scripts/") || /--tree=4(\s|$)/.test(entry);
  gates.push({ entry, script, readsFour });
}

const countedTotal = gates.length;
const countedFour = gates.filter((g) => g.readsFour).length;

/* ================= The declared numbers ================= */
const declared = pkg.gates;
if (!declared || typeof declared !== "object") {
  failures.push(`GATE-COUNT: package.json has no top-level "gates" object. Counted ${countedTotal} gate(s) in the test chain, ${countedFour} of which read 4/. Declare them: "gates": { "total": ${countedTotal}, "readingFour": ${countedFour} }`);
} else {
  if (declared.total !== countedTotal) {
    failures.push(`GATE-COUNT-TOTAL: package.json declares "gates.total": ${JSON.stringify(declared.total)}, but the scripts.test chain actually contains ${countedTotal} node invocation(s). Declared ${JSON.stringify(declared.total)}, counted ${countedTotal}. Fix whichever is wrong — if you just added or removed a gate, update the declaration in the SAME edit.`);
  }
  if (declared.readingFour !== countedFour) {
    failures.push(`GATE-COUNT-4: package.json declares "gates.readingFour": ${JSON.stringify(declared.readingFour)}, but ${countedFour} chain entr(y/ies) actually read 4/ (either under 4/scripts/ or carrying --tree=4). Declared ${JSON.stringify(declared.readingFour)}, counted ${countedFour}.`);
  }
}

/* ================= THE ANTI-VACUITY FLOOR ================= */
// The whole point of Phase 3. If the chain ever goes back to reading only the old game, this gate
// says so out loud instead of counting zero and agreeing with a declaration of zero.
if (countedFour === 0) {
  failures.push(`GATE-COUNT-4-ZERO: NOT ONE gate in the test chain reads 4/. That is the state this gate was written to make impossible to ship quietly (docs/HARD-WON-LESSONS.md §3) — a fully green suite about a game nobody is developing.`);
}

/* ================= Output ================= */
console.log(`gates in \`npm test\`: ${countedTotal} — ${countedFour} of them read 4/ (the game under development), ${countedTotal - countedFour} read the root tree.`);
for (const g of gates.filter((x) => x.readsFour)) {
  console.log(`  reads 4/: ${g.entry}`);
}
if (nonNode.length) {
  console.log(`  (${nonNode.length} non-node chain entr(y/ies) not counted as gates: ${nonNode.join(" | ")})`);
}

if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS gate count matches the chain (declared total ${countedTotal}, reading 4/ ${countedFour})`);
process.exit(0);
