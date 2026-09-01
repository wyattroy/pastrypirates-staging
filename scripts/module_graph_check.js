#!/usr/bin/env node
// scripts/module_graph_check.js
//
// The standing SPLIT-06 gate (Phase 11 Plan 1). ROADMAP's Phase 11 criterion 4 asks for the
// module dependency graph to be "proven acyclic" by a cycle-detection scan — D-09 chose a small
// custom scan over adding `madge` as a devDependency, to honor the milestone's zero-dependency
// stance (no bundler, no npm deps have been added in any prior phase). Mirrors
// scripts/net_contract_check.js / scripts/state_contract_check.js's structure: shebang, a header
// naming what is gated and why, one PASS/FAIL line per assertion, every assertion run before exit
// so a single run reports every problem, named failures with file:line, self-exclusion of
// scripts/ (this file's own relative imports of node:fs/path/url are not `src/` imports, so this
// exclusion is about scope discipline, not about this file surviving its own scan).
//
// ============================================================================
// What this scans and how
// ============================================================================
// Every `import ... from "./..."` / `"../..."` specifier across every `.js` file under `src/`
// (recursively). Bare/external specifiers (not starting with `.`) are skipped — they are not a
// local dependency edge this graph cares about. Import statements are matched against the whole
// file content (not line-by-line), because several existing files (src/net/index.js) wrap a
// single import statement's name list across multiple physical lines; matching per-line would
// silently miss those specifiers. Line numbers reported in failures are computed by counting
// newlines before the match offset.
//
// ============================================================================
// Two kinds of assertions
// ============================================================================
// 1. Cycle detection (SPLIT-06 / criterion 4): a directed graph over FILES (not tiers), a
//    standard white/gray/black DFS with a recursion stack, reporting the exact cycle path the
//    moment a back-edge (an edge into a "gray" node) is found.
// 2. Expected acyclic SHAPE (D-06/D-07, the directional contract): tiers are inferred from each
//    file's position directly under `src/` — the top-level subdirectory name is the tier
//    (`shared`, `engine`, `net`, `state`, `ui`); files directly in `src/` itself (`main.js`,
//    `module-contract.js`) are the `main` tier, the composition root. Each tier's allowed outgoing
//    tiers are hardcoded below, INCLUDING the single most safety-critical rule this whole phase
//    exists to protect: ui may import shared/engine/state, but ui must NEVER import net (D-07).
//    That rule gets its own dedicated, explicitly-labeled assertion rather than being folded into
//    a generic "ui shape" check, so a violation is unmistakable in the output rather than buried
//    inside a longer combined PASS/FAIL line.
//
// `src/ui/` may not exist yet, or may be small (this very plan is what creates it) — every
// assertion below tolerates an empty/missing tier directory by construction (an empty file list
// trivially satisfies "zero forbidden edges").
//
// Exits 0 on pass and prints one PASS line per assertion; exits 1 on any failure and prints a
// named reason (file, line, specifier) per failure.
//
// ============================================================================
// THE TREE THIS GATE SCANS — read before trusting a green run (Phase 3 / TEST-04, THE TRACER)
// ============================================================================
// Until 2026-08-23 this file scanned ONLY the repo root's src/ — the v1 game, which has had no
// code commit since 2026-08-02 and which nobody is developing. `4/` is the game being built.
// *A gate aimed at the wrong tree is not silent, it is reassuring* (docs/HARD-WON-LESSONS.md §3),
// and this one had been reassuring for a month.
//
//   node scripts/module_graph_check.js            the root tree — UNCHANGED, still in npm test
//   node scripts/module_graph_check.js --tree=4   4/, the game actually being developed
//
// Both aims run in `npm test`. The selector is scripts/lib/pick_tree.js — one spelling of "which
// tree", shared, never copied. The first line of output always names the tree AND the number of
// files it read: a count is falsifiable, a bare "OK" is not.

import fs from "node:fs";
import path from "node:path";
import { pickTree, treeLine, REPO_ROOT } from "./lib/pick_tree.js";

const picked = pickTree(process.argv);
const ROOT = picked.root;
const SRC_DIR = path.join(ROOT, "src");

const failures = [];

/* ================= File discovery ================= */

function jsFilesRecursive(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...jsFilesRecursive(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const allSrcJsFiles = jsFilesRecursive(SRC_DIR);

/* ================= Tier inference ================= */
// A file's tier is the top-level subdirectory name directly under src/, or "main" for files
// living directly in src/ itself (the composition root: src/main.js, src/module-contract.js).
function tierOf(file) {
  const rel = path.relative(SRC_DIR, file);
  const first = rel.split(path.sep)[0];
  return first.endsWith(".js") ? "main" : first;
}

/* ================= Import extraction ================= */
// Matches against the WHOLE file content, not line-by-line — src/net/index.js wraps a single
// import statement's name list across multiple physical lines, and a per-line regex would
// silently miss those specifiers.
/* THE THIRD SPELLING, added 2026-08-31 after red-proofing found it. `import "./x.js";` — a bare
   side-effect import with no binding — was INVISIBLE here, so it bypassed every tier rule silently:
   src/shared/ could import src/ui/, src/engine/ could import src/ui/, and this gate stayed green.
   Found by planting each of the four-layer plan's three layering violations and watching NONE of
   them fail; the plant used the bare spelling, and the gate could not see it. Nothing in src/ uses
   that spelling today, which is exactly why it was worth closing now rather than after something
   did. `import\s+["']` cannot swallow `import {a} from "b"` — the brace blocks it. */
const IMPORT_RE = /(?:from\s+|import\(|import\s+)\s*["']([^"']+)["']/g;

function importsOf(file) {
  const content = fs.readFileSync(file, "utf8");
  const specs = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content))) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue; // bare/external specifier — not a local edge
    const line = content.slice(0, m.index).split("\n").length;
    let resolved = path.normalize(path.join(path.dirname(file), spec));
    if (!resolved.endsWith(".js")) resolved += ".js";
    specs.push({ spec, resolved, line });
  }
  return specs;
}

/* ================= Build the file-level graph ================= */
const graph = new Map(); // file -> [{spec, resolved, line}]
for (const file of allSrcJsFiles) {
  graph.set(file, importsOf(file));
}

/* ================= Assertion 1: cycle detection (SPLIT-06, criterion 4) ================= */
function checkNoCycles() {
  let ok = true;
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(allSrcJsFiles.map((f) => [f, WHITE]));
  const stack = [];

  function dfs(node) {
    color.set(node, GRAY);
    stack.push(node);
    for (const { resolved } of graph.get(node) || []) {
      if (!graph.has(resolved)) continue; // import resolves outside src/ (or missing file) — not our concern here
      const c = color.get(resolved);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(resolved);
        const cyclePath = [...stack.slice(cycleStart), resolved].map((f) => path.relative(REPO_ROOT, f));
        failures.push(`CYCLE: ${cyclePath.join(" -> ")}`);
        ok = false;
      } else if (c === WHITE) {
        dfs(resolved);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const file of allSrcJsFiles) {
    if (color.get(file) === WHITE) dfs(file);
  }
  return ok;
}

/* ================= Shape assertions (D-06/D-07) ================= */
// For a given tier, assert every relative import edge from a file in that tier resolves into a
// file whose tier is in `allowedTargetTiers` (a file may always import a sibling in its own
// tier). Missing/empty tier directories trivially pass (no files to violate anything).
function checkTierShape(tierName, allowedTargetTiers, label) {
  let ok = true;
  const filesInTier = allSrcJsFiles.filter((f) => tierOf(f) === tierName);
  for (const file of filesInTier) {
    const rel = path.relative(REPO_ROOT, file);
    for (const { spec, resolved, line } of graph.get(file) || []) {
      if (!resolved.startsWith(SRC_DIR + path.sep) && resolved !== SRC_DIR) continue; // outside src/, ignore
      const targetTier = tierOf(resolved);
      if (targetTier === tierName) continue; // same-tier sibling import always allowed
      if (!allowedTargetTiers.includes(targetTier)) {
        ok = false;
        failures.push(
          `SHAPE (${label}): ${rel}:${line} imports "${spec}", which resolves into the "${targetTier}" tier — not allowed for "${tierName}"`
        );
      }
    }
  }
  return ok;
}

/* ================= Runner ================= */
function main() {
  // THE TREE, AND THE COUNT, BEFORE ANY VERDICT. A green run over an empty tree is the shape of
  // check this project has shipped before (HARD-WON-LESSONS §3) — printing the file count makes
  // that impossible to miss, and makes "0 files" read as the alarm it is rather than as a pass.
  console.log(`${treeLine(picked, `${allSrcJsFiles.length} .js file(s) under src/`)}`);
  if (allSrcJsFiles.length === 0) {
    console.error(`FAIL: no .js files found under ${SRC_DIR} — this gate scanned NOTHING. A green verdict here would be meaningless.`);
    process.exit(1);
  }

  const cyclesOk = checkNoCycles();
  console.log(`${cyclesOk ? "PASS" : "FAIL"} no import cycle detected among src/**/*.js`);

  const sharedOk = checkTierShape("shared", [], "shared imports nothing from src/");
  console.log(`${sharedOk ? "PASS" : "FAIL"} shared imports nothing from src/ (leaf tier)`);

  const engineOk = checkTierShape("engine", ["shared"], "engine -> shared only");
  console.log(`${engineOk ? "PASS" : "FAIL"} engine -> shared (no engine -> net/ui/main/state)`);

  const netOk = checkTierShape("net", ["shared"], "net -> shared only");
  console.log(`${netOk ? "PASS" : "FAIL"} net -> shared (no net -> engine/ui/main/state)`);

  const uiShapeOk = checkTierShape("ui", ["shared", "engine", "state"], "ui -> shared/engine/state only");
  console.log(`${uiShapeOk ? "PASS" : "FAIL"} ui -> shared/engine/state (no ui -> main)`);

  // Dedicated, explicitly-labeled assertion for the single most safety-critical rule (D-07):
  // ui must NEVER import net, called out on its own line rather than folded into the shape check
  // above so a violation is unmistakable in the output.
  const uiFiles = allSrcJsFiles.filter((f) => tierOf(f) === "ui");
  let uiNoNetOk = true;
  for (const file of uiFiles) {
    const rel = path.relative(REPO_ROOT, file);
    for (const { spec, resolved, line } of graph.get(file) || []) {
      if (tierOf(resolved) === "net") {
        uiNoNetOk = false;
        failures.push(`DIRECTION: ${rel}:${line} imports "${spec}", which resolves into src/net/ — ui may never import net (D-07)`);
      }
    }
  }
  console.log(`${uiNoNetOk ? "PASS" : "FAIL"} ui does NOT import net (D-07)`);

  const mainOk = checkTierShape("main", ["shared", "engine", "net", "state", "ui"], "main -> engine/ui/net (composition root)");
  console.log(`${mainOk ? "PASS" : "FAIL"} main -> engine/ui/net (composition root, unrestricted downward imports)`);

  if (failures.length) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
