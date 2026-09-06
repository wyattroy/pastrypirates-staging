#!/usr/bin/env node
// scripts/qa/sea_trial_report_tree_hash_check.mjs
//
// T-009 (.planning/CHART.md): CEO 212 verified the leg-resume cache half of this fix (a stale
// PP4_STAMP can no longer make a trial silently RESUME a leg it never re-sailed) and flagged the
// other half as still open — sea_trial.mjs's OWN printed and written report (the console banner
// and .planning/SEA-TRIAL.md) still names the build purely from the hand-typed PP4_STAMP. A
// game-code commit can land after the stamp was last bumped and the report Wyatt actually reads
// would not show it. This gate is the RED PROOF that sea_trial.mjs prints the tree hash
// alongside the stamp, so a mismatch is visible on the page itself rather than requiring a watch
// to notice by hand.
//
// STRUCTURAL, not behavioural — running the real sea_trial.mjs takes ~90 minutes and would
// collide with a live detached trial's own leg cache. Reading the source is the honest
// instrument here, the same choice leg_cache_tree_hash_check.mjs's own check #4 made for
// playtest_gate.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");

const failures = [];
const check = (label, cond) => { if (!cond) failures.push(label); console.log(`  ${cond ? "OK" : "FAIL"}  ${label}`); };

console.log("sea_trial.mjs prints the game tree's own identity alongside the hand-typed stamp:");
{
  const src = fs.readFileSync(path.join(REPO, "scripts", "sea_trial.mjs"), "utf8");
  check("imports gameTreeHash from the lib", /import\s*\{\s*gameTreeHash\s*\}\s*from\s*"\.\/lib\/game_tree_hash\.mjs"/.test(src));
  check("computes a tree-hash constant once, near where STAMP is read", /const\s+\w*[Tt][Rr][Ee][Ee]\w*\s*=\s*gameTreeHash\(REPO\)/.test(src));
  // Per-LINE, not per-template-literal — the file's own report text carries escaped backticks
  // (inline code samples inside the markdown it writes), which makes "content between two real
  // backticks" an unreliable unit to scan. Every source line that names the build from ${STAMP}
  // must also carry the tree-hash token on that same line — the console banner (open + close)
  // and the written .md report (in-progress placeholder + final).
  const buildLines = src.split("\n").filter(l => /\$\{STAMP\}/.test(l) && /build/i.test(l));
  check(`at least 3 build-identity lines exist to check (found ${buildLines.length})`, buildLines.length >= 3);
  const allCarryHash = buildLines.length > 0 && buildLines.every(l => /tree|hash/i.test(l));
  check("every build-identity line also names the tree hash, not just STAMP", allCarryHash);
}

console.log(failures.length ? `\nFAIL — ${failures.length} case(s):` : "\nPASS — the report shows the tree's own identity, not just the hand-typed stamp.");
for (const f of failures) console.error(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
