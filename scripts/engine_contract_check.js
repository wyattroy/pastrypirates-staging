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
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
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

// Strip a `//` line comment before matching (D-08's known false positive — RESEARCH.md Q5: prose
// mentioning `document.body` immediately above the real impurity it describes relocating, e.g.
// "Rewriting document.body here..."). This codebase uses only `//` line comments and single-line
// `/* ... */` banners in the moved region — no multi-line block comments — so stripping from the
// first `//` to end-of-line is sufficient. (No file under src/engine or src/shared contains a
// `://` inside a string literal today, which would otherwise be a false-negative risk for this
// same stripping approach — reconfirm that if a URL-bearing string is ever added here.)
function stripLineComment(line) {
  const idx = line.indexOf("//");
  return idx === -1 ? line : line.slice(0, idx);
}

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
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((raw, i) => {
      const stripped = stripLineComment(raw);
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

  let totalCount = 0;
  for (const file of allFiles) {
    const content = fs.readFileSync(file, "utf8");
    totalCount += content.split(ANNOTATION_TOKEN).length - 1;
  }
  if (totalCount !== 7) {
    failures.push(
      `ANNOTATIONS: expected exactly 7 occurrences of "${ANNOTATION_TOKEN}" across src/engine + src/shared, found ${totalCount}`
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
  let sharedNs, engineNs;
  try {
    sharedNs = await import(path.join(SHARED_DIR, "index.js"));
    engineNs = await import(path.join(ENGINE_DIR, "index.js"));
  } catch (err) {
    failures.push(`EXPORTS: importing src/shared/index.js or src/engine/index.js threw — ${err.message}`);
    return false;
  }

  for (const name of MOVED_SYMBOLS) {
    const inShared = name in sharedNs;
    const inEngine = name in engineNs;
    if (!inShared && !inEngine) {
      ok = false;
      failures.push(`EXPORTS: "${name}" is not exported by src/shared/index.js or src/engine/index.js`);
    } else if (inShared && inEngine) {
      ok = false;
      failures.push(`EXPORTS: "${name}" is exported by BOTH barrels — must be exactly one`);
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
  const purityOk = checkPurity();
  console.log(
    `${purityOk ? "PASS" : "FAIL"} purity (ENGINE-01) — zero document/window/firebase/localStorage/Date.now/Math.random/globalThis/new Function references`
  );

  const annotationsOk = checkAnnotations();
  console.log(
    `${annotationsOk ? "PASS" : "FAIL"} annotations (ENGINE-04) — exactly 7 ORDER IS LOAD-BEARING annotations, one per order-reaching construct`
  );

  const dagOk = checkDagDirection();
  console.log(`${dagOk ? "PASS" : "FAIL"} DAG direction (SPLIT-01/02) — src/shared/ never imports from src/engine/`);

  const exportsOk = await checkMovedSymbolCompleteness();
  console.log(
    `${exportsOk ? "PASS" : "FAIL"} moved-symbol completeness — every moved name exported by exactly one barrel, none re-declared in index.html`
  );

  if (failures.length) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
