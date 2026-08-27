#!/usr/bin/env node
// scripts/engine_contract_check.js
//
// The standing ENGINE-01/ENGINE-04 gate (Phase 8 Plan 4). RESEARCH.md flagged three checks as
// Wave 0 gaps with no committed tooling behind them: the engine purity grep (ENGINE-01), the
// `ORDER IS LOAD-BEARING` annotation count (ENGINE-04), and the shared-to-engine DAG direction
// (SPLIT-01/02). A grep run once during execution and pasted into a SUMMARY proves nothing about
// Phase 9, 10, or 11 — this script is what turns those from one-time manual checks into a
// standing, repeatable gate wired into `npm test`. A fourth assertion, moved-symbol export
// completeness, closes a failure class the 30-seed determinism corpus structurally cannot reach:
// `rollStorm`, `PERP`, and `windStepCost` are consumed only by the classic live turn loop
// (runLiveNet/botTurn/windLeg in the surviving index.html), never by Game.play()'s headless
// replay. A symbol that moved out of index.html but was never exported by a barrel produces a
// ReferenceError only on that corpus-blind path — this assertion is what catches it before a
// human hits it in a live game. Do not "simplify" this assertion away.
//
// Scope is fixed to src/engine/*.js and src/shared/*.js ONLY — never scripts/ (including this
// file itself). This script's own source necessarily contains the forbidden purity patterns
// (`document.`, `window.`, etc.) as regex literals; scanning `scripts/` would make the purity
// assertion permanently red, or force the patterns to be weakened until they stop catching
// anything real (T-08-15). Do not widen this scope.
//
// Runs all four assertions before exiting, so one run reports every problem, not just the first.
// No flags. Exits 0 on pass and prints one PASS line per assertion; exits 1 on any failure and
// prints a named reason (file, line, matched pattern/symbol) per failure.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pickTree, treeLine, REPO_ROOT } from "./lib/pick_tree.js";
import { stripCommentSegments } from "./lib/js_region_tokenizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// THE TREE THIS GATE SCANS (03-01 Task 2 / TEST-04). Bare run unchanged; `--tree=4` scans the game
// under development. docs/HARD-WON-LESSONS.md §3.
const picked = pickTree(process.argv);
const ROOT = picked.root;
const SHARED_DIR = path.join(ROOT, "src", "shared");
const ENGINE_DIR = path.join(ROOT, "src", "engine");
const INDEX_HTML = path.join(ROOT, "index.html");

const failures = [];

function jsFilesIn(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .map((e) => path.join(dir, e.name));
}

const sharedFiles = jsFilesIn(SHARED_DIR);
const engineFiles = jsFilesIn(ENGINE_DIR);
const allFiles = [...sharedFiles, ...engineFiles];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Comments are stripped before the purity match (D-08's known false positive — RESEARCH.md Q5:
// prose mentioning `document.body` immediately above the real impurity it describes relocating,
// e.g. "Rewriting document.body here...").
//
// CONVERGED 03-01 Task 2. This was a private trailing-`//`-to-end-of-line strip, whose header
// carried two caveats that are both now retired rather than re-checked: it assumed no multi-line
// `/* ... */` blocks in the moved region (4/src/engine/index.js has several), and it asked that
// the "no `://` inside a string literal here" assumption be reconfirmed whenever a URL-bearing
// string appeared. Reconfirmed 2026-08-23 — still zero `://` in either tree's shared/engine — and
// then made moot: the shared stripCommentSegments() is classify()-backed, so a `//` inside a
// string is string content and a `/* */` block is fully blanked. One definition of "a comment"
// across four gates (rule 23), and the strongest of them.
//
// APPLIED TO THE WHOLE FILE, NOT LINE BY LINE — and that distinction is the reason this convergence
// was worth doing rather than cosmetic. A per-line strip cannot know a line is the CONTINUATION of
// a `/* ... */` block: such a line begins with ordinary prose and matches no comment pattern at
// all. That is exactly the miss that left two false NO-APP-STATE findings standing against
// 4/src/net/writers.js. Whole-file, offsets preserved, so line numbers below stay exact.

/* ============================= Assertion 1: purity (ENGINE-01, D-08) ============================= */
const PURITY_PATTERNS = [
  { name: "document.<prop>", re: /document\.[A-Za-z]+/ },
  { name: "window.<prop>", re: /window\.[A-Za-z]+/ },
  { name: "firebase", re: /\bfirebase\b/ },
  { name: "localStorage", re: /localStorage/ },
  { name: "Date.now", re: /Date\.now/ },
  { name: "Math.random", re: /Math\.random/ },
  { name: "globalThis", re: /\bglobalThis\b/ },
  { name: "new Function", re: /new Function/ },
];

function checkPurity() {
  let ok = true;
  for (const file of allFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const lines = stripCommentSegments(fs.readFileSync(file, "utf8")).split("\n");
    lines.forEach((stripped, i) => {
      for (const { name, re } of PURITY_PATTERNS) {
        const m = stripped.match(re);
        if (m) {
          ok = false;
          failures.push(`PURITY: ${rel}:${i + 1} matched "${name}" (found "${m[0]}")`);
        }
      }
    });
  }
  return ok;
}

/* ============================================================================================
   THE PER-TREE INVENTORIES (03-01 Task 2 / TEST-04)
   ============================================================================================
   Two assertions in this file are INVENTORIES — a pinned count and a pinned name list. Until
   2026-08-23 both described the ROOT tree's shape and only the root tree was ever scanned, so the
   question never came up. Re-aimed at `4/` they were its only two failures, and NEITHER was a
   violation in 4/: one is a count that is legitimately higher, and the other is seven v1 constants
   that 4/ deliberately deleted.

   PINNED, NOT DERIVED — and this is deliberate, not laziness (CLAUDE.md rule 9 says derive; this
   is the documented exception, and the file already states it for MOVED_SYMBOLS). Deriving an
   inventory from the file under test makes the assertion tautological: a name silently dropped
   from a barrel would silently drop out of the list being checked against that barrel, and the
   check would pass. The pin IS the assertion. What must not be pinned is the pin's SCOPE, so the
   inventory is keyed by tree and an unknown tree is a named failure rather than a silent fallback
   onto the root's numbers — measuring one tree with another tree's constants is precisely what
   this whole phase exists to stop.
   ============================================================================================ */
const TREE_INVENTORY = {
  /* THE KEYS SWAPPED AT THE 2026-08-26 CUTOVER, and the numbers did not move — the TREES did.
     `root` used to mean the v1 game and `4` the game under development. 4/ was promoted to the repo
     root, so what these two entries describe is unchanged; only their names are. Getting this wrong
     is not a quiet failure: engine_contract_check went red on 7-vs-9 annotations and five "missing"
     exports the instant the trees moved, which is the gate doing exactly its job. */
  classic: {
    annotationCount: 7,
    /* Every pinned moved symbol is exported by the classic barrels. Nothing is absent by design. */
    absentByDesign: {},
  },
  root: {
    // NINE, not seven. MEASURED 2026-08-23: src/shared/index.js has 7 and src/engine/index.js
    // has 2. The two promoted-tree-only sites are real order-reaching constructs the classic tree does not
    // have:
    //   src/shared/index.js:244  SEA_CREATURES — Wyatt, 2026-08-06: "we want each animal to be
    //     followed by a substantially different animal". Each captain walks the list as a RING, so
    //     the 50->1 join is a real adjacency too.
    //   src/engine/index.js:1229 the bot's trade offer is COMPOSED FIRST and only then tested
    //     against the memory. Testing before composing lets the real hail through anyway — and the
    //     hail is the spam (docs/HARD-WON-LESSONS.md §5, commit 03a683c).
    // Both are COUNTED but not ANCHORED below, and that gap is stated rather than hidden: the
    // engine one sits above a `/* ... */` block, which breaks the contiguous `//` walk the anchor
    // check uses. Anchoring it would mean changing how a construct is recognised as annotated,
    // which is a bigger change than a count and does not belong in a gate port.
    annotationCount: 9,
    /* SEVEN v1 CONSTANTS THE PROMOTED GAME DELETED ON PURPOSE — verified absent from src/ entirely, not moved.
       src/shared/index.js:218 says so in its own words: "The lee is gone: an island upwind of
       you does nothing at all now. v1's SAIL_BUDGET(_LEEWARD) and windStepCost are deleted rather
       than left unused — a constant nothing reads is exactly the dead code the house rules exist
       to prevent." AW/TW/DW are v1's bot weight tables and FISH_BASE its fishing constant; the v3
       race planner replaced all four. Reason is recorded per name so this list cannot become a
       shrug. */
    absentByDesign: {
      SAIL_BUDGET: "the lee mechanic is gone in the promoted game — deleted, not moved (src/shared/index.js:218)",
      SAIL_BUDGET_LEEWARD: "the lee mechanic is gone in the promoted game — deleted, not moved (src/shared/index.js:218)",
      windStepCost: "the lee mechanic is gone in the promoted game — deleted, not moved (src/shared/index.js:218)",
      AW: "v1 bot weight table, superseded by the v3 race planner",
      TW: "v1 bot weight table, superseded by the v3 race planner",
      DW: "v1 bot weight table, superseded by the v3 race planner",
      FISH_BASE: "v1 fishing constant, superseded by the v3 race planner",
    },
  },
};

const INVENTORY = TREE_INVENTORY[picked.name] || null;

/* ================= Assertion 2: ORDER IS LOAD-BEARING annotations (ENGINE-04, D-09/D-10) ================= */
const ANNOTATION_TOKEN = "ORDER IS LOAD-BEARING";
const ANNOTATED_CONSTRUCTS = [
  { name: "DIRS", file: path.join(SHARED_DIR, "index.js"), anchor: /^const DIRS=/ },
  { name: "DIRNAME", file: path.join(SHARED_DIR, "index.js"), anchor: /^const DIRNAME=/ },
  { name: "PERP", file: path.join(SHARED_DIR, "index.js"), anchor: /^const PERP=/ },
  { name: "STORM_DIAG", file: path.join(SHARED_DIR, "index.js"), anchor: /^const STORM_DIAG=/ },
  { name: "OPPOSITE", file: path.join(SHARED_DIR, "index.js"), anchor: /^const OPPOSITE=/ },
  { name: "TET", file: path.join(SHARED_DIR, "index.js"), anchor: /^const TET=/ },
  {
    name: "[3,2,1] island-spacing literal",
    file: path.join(ENGINE_DIR, "index.js"),
    anchor: /for\(const spacing of \[3,2,1\]\)\{/,
  },
];

function checkAnnotations() {
  let ok = true;

  /* ==========================================================================================
     THIS ASSERTION OPTS OUT OF COMMENT STRIPPING, EXPLICITLY, AND MUST ALWAYS DO SO.
     ==========================================================================================
     Its SUBJECT IS A COMMENT. "ORDER IS LOAD-BEARING" exists nowhere else — it is an annotation,
     by definition written in prose above a construct whose iteration order feeds the seeded RNG.
     Three other assertions in this file and three other gates gained comment stripping on
     2026-08-23 (03-01 Task 2). If that had been applied GLOBALLY here, this count would read ZERO,
     compare zero against a pinned zero once somebody "fixed" the pin, and pass forever — a check
     that cannot fail while still reading as protection (docs/HARD-WON-LESSONS.md §2 and §3, and
     the same disease as 4/scripts/seat_arg_check.js's comment stripper blanking what it inspects).
     STRIP PER-ASSERTION, NEVER GLOBALLY. If you are adding stripping to this file, this function
     is the one that must not get it.
     ========================================================================================== */
  if (!INVENTORY) {
    failures.push(
      `ANNOTATIONS: no pinned inventory for the scanned tree (${picked.name}). This assertion is a PINNED COUNT and there is no honest number to compare against for a tree nobody has counted — add one to TREE_INVENTORY rather than letting this fall back on another tree's figure.`
    );
    return false;
  }

  let totalCount = 0;
  for (const file of allFiles) {
    const content = fs.readFileSync(file, "utf8"); // RAW — see the opt-out note above
    totalCount += content.split(ANNOTATION_TOKEN).length - 1;
  }
  if (totalCount !== INVENTORY.annotationCount) {
    failures.push(
      `ANNOTATIONS: expected exactly ${INVENTORY.annotationCount} occurrences of "${ANNOTATION_TOKEN}" across src/engine + src/shared in the ${picked.name} tree, found ${totalCount}. Declared ${INVENTORY.annotationCount}, counted ${totalCount}. If an order-reaching construct was genuinely added or removed, update TREE_INVENTORY["${picked.name}"].annotationCount in the same edit — and say in the comment there WHICH construct it is.`
    );
    ok = false;
  }

  for (const { name, file, anchor } of ANNOTATED_CONSTRUCTS) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const idx = lines.findIndex((l) => anchor.test(l));
    if (idx === -1) {
      failures.push(`ANNOTATIONS: could not locate the declaration anchor for ${name} in ${rel}`);
      ok = false;
      continue;
    }
    // Walk upward through the contiguous block of `//`-comment lines directly above the anchor
    // (no blank/non-comment line breaking the run) and look for the token anywhere in that block.
    // A single-line annotation is the common case, but the engine tier's [3,2,1] annotation is a
    // 3-line comment with the token on its first line, not literally the line immediately above
    // the anchor — the block walk handles both without weakening what counts as "annotated".
    let blockHasToken = false;
    for (let i = idx - 1; i >= 0 && /^\s*\/\//.test(lines[i]); i--) {
      if (lines[i].includes(ANNOTATION_TOKEN)) {
        blockHasToken = true;
        break;
      }
    }
    if (!blockHasToken) {
      failures.push(
        `ANNOTATIONS: ${name} (${rel}:${idx + 1}) has no "${ANNOTATION_TOKEN}" annotation in the comment block directly above it`
      );
      ok = false;
    }
  }

  return ok;
}

/* ================= Assertion 3: shared -> engine DAG direction (SPLIT-01/02) ================= */
function checkDagDirection() {
  let ok = true;
  const importRe = /from\s+["']([^"']+)["']/g;

  for (const file of sharedFiles) {
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, "utf8");
    let m;
    importRe.lastIndex = 0;
    while ((m = importRe.exec(content))) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue; // bare/external specifier — not a local edge
      const resolved = path.normalize(path.join(path.dirname(file), spec));
      if (resolved === ENGINE_DIR || resolved.startsWith(ENGINE_DIR + path.sep)) {
        ok = false;
        failures.push(`DAG: ${rel} imports "${spec}", which resolves into src/engine/ — shared must never import engine`);
      }
    }
  }

  return ok;
}

/* ================= Assertion 4: moved-symbol export completeness ================= */
// Hardcoded, not derived from the barrels' own `export { ... }` lists at check time — deriving it
// from the barrels themselves would make this assertion tautological (a name silently dropped
// from a barrel's export list would just silently drop out of the list being checked against it,
// and the check would still pass). Sourced from 08-02-SUMMARY.md's 120-name shared-tier export
// list and 08-03-SUMMARY.md's 8-name engine-tier export list — the authoritative record of every
// name that left index.html during this phase, not from memory.
const SHARED_MOVED_SYMBOLS = [
  "mulberry32", "ING_ALL", "ING_EMOJI", "ASSET_BASE", "ALARM_IMG", "ANCHOR_IMG", "BATTLE_IMG",
  "BLOCKED_SLASH_IMG", "BOARD_IMG", "BOAT_IMG", "CAKE_SLICE_IMG", "CANCEL_X_IMG", "CANDY_CRAB_IMG",
  "CHECKMARK_IMG", "CLOCK_IMG", "CLOSE_X_IMG", "COINS_FLYING_IMG", "COIN_IMG", "COIN_SPIN_IMG",
  "COMPASS_DIAL_IMG", "COMPASS_NEEDLE_IMG", "CRATE_OVERBOARD_IMG", "CROISSANT_IMG", "CROWN_IMG",
  "CUPCAKE_IMG", "CURRENT_SWIRL_ICON_IMG", "DAGGER_IMG", "DEVICE_IMG", "DICE_IMG", "DOCK_IMG",
  "DODGE_SWOOSH_IMG", "DONUT_IMG", "DOOR_IMG", "EMOJI_IMG", "ENVELOPE_IMG", "EYES_IMG",
  "FINISH_FLAG_IMG", "FISHING_ROD_IMG", "FISH_IMG", "FLAME_IMG", "FLEE_BOOT_IMG", "FLIP_HEADS_IMG",
  "FLIP_SOCKET_IMG", "FLIP_TAILS_IMG", "GEAR_IMG", "GLOBE_IMG", "HANDSHAKE_IMG", "HORN_IMG",
  "HOURGLASS_IMG", "IMPACT_BURST_IMG", "ING_HOLE_IMG", "ING_IMG", "ISLAND_SHAPE_IMG",
  "ISLAND_SILHOUETTE_IMG", "KEY_IMG", "MAGNIFYING_GLASS_IMG", "MAP_IMG", "PARROT_IMG", "PAUSE_IMG",
  "PAUSE_SYMBOL_IMG", "PIRATE_CHEF_IMG", "PIRATE_FLAG_IMG", "PLAY_ARROW_IMG", "PLAY_IMG",
  "POCKET_COMPASS_IMG", "PRINTER_IMG", "REFUSED_IMG", "REPAIR_TOOLS_IMG", "REPLAY_IMG",
  "RIBBON_IMG", "ROBOT_IMG", "SAILBOAT_IMG", "SALUTE_CAPTAIN_IMG", "SCROLL_IMG", "SHIELD_IMG",
  "SKULL_IMG", "SNAIL_IMG", "SPARKLES_IMG", "SPEECH_BUBBLE_IMG", "SPOILS_POUCH_IMG", "SPYGLASS_IMG",
  "STOOL_IMG", "STOPWATCH_IMG", "STORM_CLOUD_IMG", "STORYBOOK_IMG", "SUGARFISH_IMG", "TARGET_IMG",
  "TRADE_SWIRL_IMG", "WARNING_IMG", "WAVE_IMG", "WIND_ARROW_IMG", "WIND_GUST_IMG", "EMOJIFY_RE",
  "emojify", "TET", "ING_NAME", "ING_PLAIN", "DOCK_PLACE", "DOCK_FLAVOR", "dockPlace",
  "dockFlavor",
  // F5 (2026-07-29): the declared {prefix,name} split's renderer — the ONE place that decides
  // where a dock-flavour icon goes. Added to this pin deliberately; that is what the pin is for.
  "dockFlavorIcon", "iname", "ilabel", "ingImg", "ilabelImg", "iconImg", "DIRS", "DIRNAME", "PERP",
  "STORM_DIAG", "OPPOSITE", "SAIL_BUDGET", "SAIL_BUDGET_LEEWARD", "windStepCost", "NAMES",
  "DEFAULT_NAMES", "unusedDefaultName", "COLORS", "HEXCOL", "man",
];
const ENGINE_MOVED_SYMBOLS = ["rollStorm", "PERSONALITY", "AW", "TW", "DW", "FISH_BASE", "Game", "roundCfg"];
const MOVED_SYMBOLS = [...SHARED_MOVED_SYMBOLS, ...ENGINE_MOVED_SYMBOLS];

async function checkMovedSymbolCompleteness() {
  let ok = true;

  // A purity violation added at module top level (rather than inside a function body) throws on
  // import in this DOM-free Node context before this assertion can even run — that is itself a
  // form of impurity, so surface it as a named failure of this assertion rather than letting an
  // uncaught exception abort the whole run before the other three PASS/FAIL lines print.
  if (!INVENTORY) {
    failures.push(
      `EXPORTS: no pinned inventory for the scanned tree (${picked.name}) — see TREE_INVENTORY. This assertion will not measure a tree against another tree's expected shape.`
    );
    return false;
  }

  let sharedNs, engineNs;
  try {
    sharedNs = await import(pathToFileURL(path.join(SHARED_DIR, "index.js")).href);
    engineNs = await import(pathToFileURL(path.join(ENGINE_DIR, "index.js")).href);
  } catch (err) {
    failures.push(`EXPORTS: importing src/shared/index.js or src/engine/index.js threw — ${err.message}`);
    return false;
  }

  /* THE PIN IS THE SAME 129 NAMES IN BOTH TREES. What differs is which of them the scanned tree is
     allowed to be MISSING, and that exclusion is itself checked in BOTH directions below — because
     an exclusion list nobody re-checks is a permanent blind spot wearing a comment. A name on
     absentByDesign that turns out to be PRESENT is a failure too: it means the tree changed under
     the exclusion and nothing would otherwise have said so. That is what stops this list from
     quietly becoming the place awkward names go to be forgotten. */
  const absent = INVENTORY.absentByDesign;
  for (const name of MOVED_SYMBOLS) {
    const inShared = name in sharedNs;
    const inEngine = name in engineNs;
    const exemptReason = Object.prototype.hasOwnProperty.call(absent, name) ? absent[name] : null;

    if (inShared && inEngine) {
      ok = false;
      failures.push(`EXPORTS: "${name}" is exported by BOTH barrels — must be exactly one`);
      continue;
    }
    if (!inShared && !inEngine) {
      if (exemptReason) continue; // absent by design, and the reason is pinned beside the name
      ok = false;
      failures.push(`EXPORTS: "${name}" is not exported by src/shared/index.js or src/engine/index.js in the ${picked.name} tree`);
      continue;
    }
    // PRESENT. If it is on the deliberately-absent list, the list has rotted.
    if (exemptReason) {
      ok = false;
      failures.push(`EXPORTS-EXEMPTION-STALE: "${name}" is listed in TREE_INVENTORY["${picked.name}"].absentByDesign ("${exemptReason}") but it IS exported by a barrel in that tree. Remove the exemption — an exclusion nobody re-checks is a blind spot, not a decision.`);
    }
  }

  // A leftover top-level declaration in index.html would shadow the bridge with a stale copy
  // that looks correct until the two diverge — check every moved name against the classic
  // script's remaining top-level const/let/var/function/class declarations.
  const htmlLines = fs.readFileSync(INDEX_HTML, "utf8").split("\n");
  for (const name of MOVED_SYMBOLS) {
    const re = new RegExp(`^(const|let|var|function|class)\\s+${escapeRegExp(name)}\\b`);
    htmlLines.forEach((line, i) => {
      if (re.test(line)) {
        ok = false;
        failures.push(`EXPORTS: "${name}" still has a top-level declaration in index.html:${i + 1} — shadows the bridge`);
      }
    });
  }

  return ok;
}

/* ================= Runner ================= */
async function main() {
  // THE TREE, AND WHAT WAS OPENED, BEFORE ANY VERDICT (HARD-WON-LESSONS §3).
  console.log(treeLine(picked, `${sharedFiles.length} .js under src/shared, ${engineFiles.length} under src/engine, ${MOVED_SYMBOLS.length} pinned moved symbol(s)`));
  if (allFiles.length === 0) {
    console.error(`FAIL: no .js files found under ${SHARED_DIR} or ${ENGINE_DIR} — this gate scanned NOTHING.`);
    process.exit(1);
  }

  const purityOk = checkPurity();
  console.log(
    `${purityOk ? "PASS" : "FAIL"} purity (ENGINE-01) — zero document/window/firebase/localStorage/Date.now/Math.random/globalThis/new Function references`
  );

  const annotationsOk = checkAnnotations();
  console.log(
    `${annotationsOk ? "PASS" : "FAIL"} annotations (ENGINE-04) — exactly ${INVENTORY ? INVENTORY.annotationCount : "?"} ORDER IS LOAD-BEARING annotations (pinned for the ${picked.name} tree), ${ANNOTATED_CONSTRUCTS.length} of them anchored to a named construct`
  );

  const dagOk = checkDagDirection();
  console.log(`${dagOk ? "PASS" : "FAIL"} DAG direction (SPLIT-01/02) — src/shared/ never imports from src/engine/`);

  const exportsOk = await checkMovedSymbolCompleteness();
  console.log(
    `${exportsOk ? "PASS" : "FAIL"} moved-symbol completeness — ${MOVED_SYMBOLS.length - (INVENTORY ? Object.keys(INVENTORY.absentByDesign).length : 0)} name(s) exported by exactly one barrel, none re-declared in index.html${INVENTORY && Object.keys(INVENTORY.absentByDesign).length ? `, ${Object.keys(INVENTORY.absentByDesign).length} absent by design (${Object.keys(INVENTORY.absentByDesign).join(", ")}) and re-checked as still absent` : ""}`
  );

  if (failures.length) {
    console.error(`\nFAILURES — tree: ${picked.label}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
