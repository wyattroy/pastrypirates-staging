#!/usr/bin/env node
// 4/scripts/lib_twin_check.js
//
// `scripts/lib/` AND `4/scripts/lib/` HOLD BYTE-IDENTICAL TWINS. WHEN ONE MOVES, SAY WHICH FILE.
//
// ============================================================================
// Why there are two copies at all, and why that is CORRECT rather than sloppy
// ============================================================================
// This looks exactly like duplication somebody forgot to clean up. It is not. The shared tools in
// these directories resolve everything TREE-RELATIVELY:
//
//     scripts/lib/load_engine.js   imports "../../src/engine/index.js"
//
// From `scripts/lib/` that is the ROOT engine. From `4/scripts/lib/` — the same bytes, in a
// different place — it is `4/`'s engine. The copy is not a duplicate of the code; it is what
// AIMS the code. A harness under `4/scripts/` gets the `4/` engine for free, by construction,
// with nothing to configure and nothing to remember.
//
// ============================================================================
// SO DO NOT DEDUPE THEM. This is the tidiness impulse that would reintroduce the bug.
// ============================================================================
// The obvious "improvement" is to delete the `4/` copies and have `4/scripts/` import
// `../../scripts/lib/load_engine.js` instead. THAT WOULD SILENTLY RE-ROOT THE LOADER AT THE ROOT
// TREE. Every `4/` harness would go on running, go on passing, and go on measuring the OLD GAME —
// *a gate scanning the wrong tree is not silent, it is reassuring* (docs/HARD-WON-LESSONS.md §3),
// which is the exact failure the whole of Phase 3 exists to close. Parametrising the loader with a
// tree argument is the same trap wearing a nicer coat: it moves the aim from the filesystem, where
// it cannot be got wrong, into an argument at every call site, where it can.
//
// The reversible answer, and the one taken: LEAVE THE TWINS, MAKE DRIFT LOUD. If somebody fixes a
// bug in one copy and not the other, this gate names the file. That costs one comparison per file
// and gives up nothing.
//
// (Recorded here rather than only in a summary so the next session finds the reasoning at the
// moment it is tempted — the "read a lesson at its TRIGGER" rule, HARD-WON-LESSONS §0.)
//
// ============================================================================
// What is checked
// ============================================================================
// 1. TWIN IDENTITY — every file present in BOTH scripts/lib/ and 4/scripts/lib/ is byte-identical.
//    A difference names the file and both paths.
// 2. NO SILENTLY-LOST TWIN — a file in scripts/lib/ with no counterpart under 4/scripts/lib/ is a
//    failure UNLESS it carries the marker below. Without this, deleting a `4/` copy would make the
//    twin set smaller and the gate greener, which is the wrong direction for a gate to move.
// 3. THE no_undef_check.js PAIR — the same arrangement one directory up: scripts/no_undef_check.js
//    and 4/scripts/no_undef_check.js are byte-identical copies whose ROOT is their own location.
//    Checked here rather than in a second file, because it is the same fact.
//
// ============================================================================
// The marker, for a tool that must NOT be twinned
// ============================================================================
//
//     ROOT-ONLY BY DESIGN
//
// Placed in the file's own header. Exactly one file carries it today: scripts/lib/pick_tree.js,
// the shared tree selector, which computes the repo root from its OWN location — so a copy sitting
// in `4/scripts/lib/` would resolve `--tree=4` to `4/4/` and scan nothing at all, silently, green.
// It is the one tool here that is the OPPOSITE of tree-relative, and that is why it must never be
// copied. Greppable:
//
//     grep -rln "ROOT-ONLY BY DESIGN" scripts/lib/
//
// ============================================================================
// ANTI-VACUITY
// ============================================================================
// Prints the number of twin pairs COMPARED, every run. Zero pairs is a failure, not a pass — an
// empty comparison set looks identical to a clean one, which is the shape of green this project
// has shipped before (HARD-WON-LESSONS §2).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const MARKER = "ROOT-ONLY BY DESIGN";
const failures = [];

const ROOT_LIB = path.join(REPO_ROOT, "scripts", "lib");
const FOUR_LIB = path.join(REPO_ROOT, "4", "scripts", "lib");

const listFiles = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
    : [];

const rootLibFiles = listFiles(ROOT_LIB);
const fourLibFiles = new Set(listFiles(FOUR_LIB));

let compared = 0;
let rootOnly = 0;

for (const name of rootLibFiles) {
  const a = path.join(ROOT_LIB, name);
  const b = path.join(FOUR_LIB, name);
  const hasTwin = fourLibFiles.has(name);
  const declaredRootOnly = fs.readFileSync(a, "utf8").includes(MARKER);

  if (!hasTwin) {
    if (declaredRootOnly) { rootOnly++; continue; }
    failures.push(
      `TWIN-MISSING: scripts/lib/${name} has no counterpart at 4/scripts/lib/${name}. Every tool in scripts/lib/ is tree-relative and its 4/ copy is what aims it at the game under development — a missing copy means 4/ harnesses are reaching for something that is not there, or (worse) were quietly re-pointed at the root tree. Copy it across, or declare it "${MARKER}" in its header if it genuinely must not be twinned.`
    );
    continue;
  }

  compared++;
  if (declaredRootOnly) {
    failures.push(
      `TWIN-MARKER-CONTRADICTED: scripts/lib/${name} declares "${MARKER}" and yet a copy EXISTS at 4/scripts/lib/${name}. One of the two is wrong: either the file is not root-only and the marker should go, or the copy should. A marker contradicted by the filesystem is worse than no marker.`
    );
    continue;
  }
  if (!fs.readFileSync(a).equals(fs.readFileSync(b))) {
    failures.push(
      `TWIN-DRIFT: scripts/lib/${name} and 4/scripts/lib/${name} are NO LONGER byte-identical. One was edited and the other was not, so the two trees are now measured by two different tools. Apply the same change to both — that is the whole cost of keeping the copies, and it is cheaper than the alternative (see this file's header on why deduping them would re-root the loader at the root tree).`
    );
  }
}

// A file that exists ONLY under 4/scripts/lib/ is fine and expected — the browser-driving tools
// (cdp, chrome, player, checks, vision, narration_probe) have no root-side counterpart and never
// will. Reported as a note, never a failure.
const fourOnly = [...fourLibFiles].filter((n) => !rootLibFiles.includes(n));

/* ================= The same fact one directory up ================= */
const NO_UNDEF_PAIR = ["scripts/no_undef_check.js", "4/scripts/no_undef_check.js"];
const [nuRoot, nuFour] = NO_UNDEF_PAIR.map((r) => path.join(REPO_ROOT, r));
if (!fs.existsSync(nuRoot) || !fs.existsSync(nuFour)) {
  failures.push(
    `TWIN-MISSING: ${NO_UNDEF_PAIR.join(" and ")} must both exist. The 4/ copy is the ONLY thing that scans 4/'s src/ for undefined identifiers — HARD-WON-LESSONS §3 names running the root one and reporting "no-undef green" about code it never opened as a specific, real mistake.`
  );
} else {
  compared++;
  if (!fs.readFileSync(nuRoot).equals(fs.readFileSync(nuFour))) {
    failures.push(
      `TWIN-DRIFT: ${NO_UNDEF_PAIR.join(" and ")} are NO LONGER byte-identical. A fix landed in one tree's no-undef gate and not the other's, so one of the two games is being checked by an older rule.`
    );
  }
}

/* ================= Output ================= */
console.log(
  `twin pairs compared: ${compared} — ${rootOnly} declared ${MARKER}, ${fourOnly.length} file(s) exist only under 4/scripts/lib/ (browser-driving tools with no root counterpart: ${fourOnly.join(", ") || "none"}), ${failures.length} problem(s).`
);

if (compared === 0) {
  console.error(`FAIL: ZERO twin pairs compared. An empty comparison set looks exactly like a clean one — this is the anti-vacuity floor, not a real green.`);
  process.exit(1);
}

if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS scripts/lib/ and 4/scripts/lib/ have not drifted`);
process.exit(0);
