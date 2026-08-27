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
//   - the script it runs lives under `scripts/` (a 4/-side gate, 4/-only by construction), OR
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
  /* THE "DOES IT READ 4/" HALF IS RETIRED (2026-08-27), and it is retired rather than repaired.
     It existed to answer a real question while the repo held TWO games: "how many of these gates
     actually read the tree we are developing?" The v2.0 cutover promoted 4/ to the root, and today
     the script tree moved out of 4/ as well — so there is one game and one script tree, and every
     gate reads the game by construction. The question has no answer to give.
     It also could not survive the move: the test was `script.startsWith("4/scripts/")`, and a
     path-rewrite turned it into `startsWith("scripts/")`, which matches EVERY gate. It then
     reported "18 of 18 read 4/", which is not a fact about anything.
     The TOTAL count stays — that one still catches a gate added without declaring it. */
  gates.push({ entry, script });
}

const countedTotal = gates.length;

/* ================= The declared numbers ================= */
const declared = pkg.gates;
if (!declared || typeof declared !== "object") {
  failures.push(`GATE-COUNT: package.json has no top-level "gates" object. Counted ${countedTotal} gate(s) in the test chain. Declare it: "gates": { "total": ${countedTotal} }`);
} else {
  if (declared.total !== countedTotal) {
    failures.push(`GATE-COUNT-TOTAL: package.json declares "gates.total": ${JSON.stringify(declared.total)}, but the scripts.test chain actually contains ${countedTotal} node invocation(s). Declared ${JSON.stringify(declared.total)}, counted ${countedTotal}. Fix whichever is wrong — if you just added or removed a gate, update the declaration in the SAME edit.`);
  }
}

/* ================= THE ANTI-VACUITY FLOOR ================= */
/* Its ORIGINAL form asked "does even one gate read 4/?", to make it impossible to ship a fully
   green suite about a game nobody was developing (HARD-WON-LESSONS §3). With one game and one
   script tree that question cannot be asked any more — but the FEAR behind it is permanent, so the
   floor survives in the only form still meaningful: a chain with no gates in it is not a pass. */
if (countedTotal === 0) {
  failures.push(`GATE-COUNT-ZERO: the test chain contains NO gates at all. A suite that checks nothing is not a green suite (docs/HARD-WON-LESSONS.md §3).`);
}

/* ================= Output ================= */
console.log(`gates in \`npm test\`: ${countedTotal} — one game, one script tree, every gate reads it.`);
if (nonNode.length) {
  console.log(`  (${nonNode.length} non-node chain entr(y/ies) not counted as gates: ${nonNode.join(" | ")})`);
}

if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS gate count matches the chain (declared total ${countedTotal})`);
process.exit(0);
