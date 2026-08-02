#!/usr/bin/env node
// scripts/extract_narration_lines.js
//
// NARR-01 (D-01/D-02/D-03/D-05): the machine-generated inventory the narration audit page
// (art-review/narration-audit.html) consumes for its ad-hoc (non-table) cards. Walks BOTH
// narration sources so "did we miss a line?" is mechanically answerable instead of trusted:
//   - TABLE source: imports the real EVENT_NARRATION from src/ui/util.js (so the key list can
//     never drift from what ships) and records each key's declaration line + a moment-group label.
//   - AD-HOC source: reads src/ui/flow.js, src/orchestrator.js and src/ui/util.js as text and
//     locates every flash(/onFlash( call site (skipping comment-only lines), extracting the raw
//     first-argument source text and the raw 4th-argument (variants array) source text, tagging
//     each call TABLE-DRIVEN (its message comes from describeFor(...)/a table lookup, e.g. `L.txt`
//     or `describe(...).txt` — not new copy) or genuinely AD-HOC.
//
// Determinism is a requirement: table entries in EVENT_NARRATION's own declaration order, ad-hoc
// entries sorted by file path then ascending line number, and the written JSON has a fixed key
// order per object (built the same way every run) — so two runs produce byte-identical output.
//
// Self-check: an independent, simpler pass counts flash(/onFlash( occurrences (also skipping
// comment-only lines) per file and must agree with the structured extraction's own count, or the
// script fails loudly with a named diff and writes nothing. This is the actual mechanism that
// makes "did we miss a line?" answerable — a silent extraction bug would otherwise just produce a
// short inventory that looks complete.
//
// Convention (matches determinism_baseline.js/hail_ranking_test.js/bot_storm_narration_test.js/
// narration_test.js): no assertion library, plain console.log, process.exit(failures?1:0).
//
// ============================================================================
// Wired into `npm test` as of 2026-07-29 (15-VERIFICATION.md Gap 3)
// ============================================================================
// This was previously withheld from `npm test` because plan 15-06 would legitimately shrink the
// line count once Wyatt's cuts were applied — a permanent floor gate would have gone red for the
// right reason at the wrong time. Those cuts are now applied, and the withholding turned out to be
// the whole problem: 15-06's own final commit shifted src/ui/util.js by 4 lines, AD_HOC_META went
// stale, this self-check went red, and NOTHING NOTICED because `npm test` did not run it. That is
// Gap 3. It now runs last in the chain, so the D-21/D-31/D-32/D-33 coverage guard is CI-enforced.
//
// RESOLVED (2026-07-29, NARR-01) — the fragility recorded below is FIXED. AD_HOC_META is no longer
// keyed by line number; every copy site now declares its own permanent `// @copy <id>` marker in
// source and this script binds and validates them (see the "@copy markers" section further down).
// The account below is kept because the *why* is the load-bearing part; the mechanism it describes
// is history, not current behaviour.
//
// THE LINE-NUMBER FRAGILITY IS RESOLVED (15-07). The account of WHY is the load-bearing part, so it
// is kept rather than deleted.
//
// What it was: AD_HOC_META used to be keyed by hardcoded line number, so any edit that inserted a
// line above a flash() site drifted it. That broke twice. The second time it was worse than "the
// audit page decayed" — 80 of the page's 91 hardcoded locations had gone stale, the very first
// lookup in render order threw, the exception escaped the whole render, and the page showed its
// loading placeholder and nothing else. 130 of Wyatt's 209 review marks pointed at cards that no
// longer existed under those names. The tool was not fragile; it was dead, and nothing said so
// because nothing checked it outside a browser.
//
// The follow-up filed here proposed keying by exact ANCHOR TEXT. That is now done, ONE STEP BETTER:
// an anchor made of prose breaks on the one operation this tool exists to perform — rewriting copy.
// So identity is an EXPLICIT ID DECLARED IN THE SOURCE instead.
//
// What is true now:
//   - every player-facing copy site carries a `// @copy <id>` marker comment, and this script binds
//     each marker to the next qualifying extracted site in the same enclosing function;
//   - every ad-hoc, prompt and misc inventory entry carries that `id`, and the curated metadata is
//     keyed by it. `file`, `line` and `fn` are still emitted, but for REPORTING only — nothing keys
//     off them, ever again (that rule is what this note used to be about);
//   - a button is keyed by its option's own `value:`-derived `slot`, never by its label, because the
//     label is exactly what a wording pass rewrites;
//   - art-review/narration-retired-ids.json lists ids that must never be issued again, so a future
//     site cannot claim a deleted site's id and inherit its review mark.
//
// Three gates keep the scheme honest, and all three run in `npm test`:
//   1. THIS SCRIPT fails by name on a live site with no marker, two markers binding to the same
//      site, a marker binding to nothing, a duplicate id, an illegal id, a duplicate button slot,
//      a metadata entry whose id has no live site, or an attempt to re-issue a retired id.
//   2. scripts/narration_audit_check.js checks the audit page itself — every lookup resolves, every
//      live site is placed exactly once, no card id contains a line number, every card renders real
//      text from live source, and all 209 of Wyatt's dispositions are still accounted for.
//   3. scripts/ui_contract_check.js gates the src/ contracts the copy depends on.
//
// An id can now only break if somebody deletes a marker, and (1) fails loudly when they do.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EVENT_NARRATION } from "../src/ui/util.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FILE_PATHS = {
  util: "src/ui/util.js",
  flow: "src/ui/flow.js",
  orch: "src/orchestrator.js",
  // D-32: the remaining player-facing surfaces Wyatt's independent sweep found absent (the timer
  // toggle's tooltip and the pass-and-play hand-off screen) live in files never previously read by
  // this script — added here so the D-32 "misc" extraction below can sweep them.
  panel: "src/ui/panel.js",
  lobby: "src/ui/lobby.js",
  // 15-07 Task 7: src/ui/board.js had NEVER been read by this script, so five player-facing
  // surfaces had never been in the audit at ALL — not drifted, absent. The end-of-voyage banner and
  // stats table, the pass-and-play "Check my recipe" button, the "empty hold" placeholder and the
  // surplus-cargo tooltip. See SCOPE_EXCLUSIONS below for the file this is deliberately NOT.
  board: "src/ui/board.js",
};

/* ================= the scope rule, in BOTH directions (15-07 Task 7) =================
 *
 * FILE_PATHS above says what IS swept. This says what is not, and why — because "the audit page's
 * scope kept being defined by MECHANISM, never by AUDIENCE" (D-32) has now been discovered FIVE
 * times, each time by Wyatt noticing something missing. Silence is what made that repeatable: a
 * `src/ui/*.js` file simply not appearing in FILE_PATHS looked identical to a file with no copy in
 * it. Every UI module must now be one or the other, ON PURPOSE, and the assertion below fails if a
 * new one appears as neither.
 */
const SCOPE_EXCLUSIONS = {
  "src/ui/index.js": "a re-export barrel — no strings of its own at all.",
  "src/ui/handlers.js": "wires DOM events to the flow functions; every string it shows is built in flow.js/util.js and swept there.",
  "src/ui/recipe.js":
    "RECIPE CONTENT, not narration. It holds the 20 real pastry recipes — titles, descriptions, "
    + "ingredient quantities and baking steps (\"Preheat oven to 165°C (325°F)…\"). Player-facing, but it is "
    + "cookbook prose, not the pirate voice: D-29's register conversion (you->ye) would be WRONG applied to "
    + "a baking instruction, the sign rule has no meaning in a quantity, and a wording pass over the game's "
    + "narration must not put 400 lines of culinary copy in front of the reviewer. Excluded deliberately, "
    + "and stated here rather than absent — reviewing recipe text is a separate job with different rules.",
  "src/ui/audio.js":
    "SOUND, not text. Phase 21's audio module: an AudioContext graph, a decoded-buffer pool and the "
    + "event->sfx-stem mapping table. Its only string literals are sfx filenames (\"battle-swords\", "
    + "\"storm\") and the localStorage key \"pp_muted\" — none of which a player ever reads. The mute "
    + "button's actual player-facing copy (its tooltips) lives in src/ui/panel.js and index.html and is "
    + "swept there, and is recorded in the copy-shipped-vs-approved gate. Excluded deliberately: a "
    + "wording pass over this file would only offer the reviewer a list of mp3 stems.",
};
// (the assertion that enforces this runs below, once fail() has its counter — checkScopeCoverage())
function checkScopeCoverage() {
  const swept = new Set(Object.values(FILE_PATHS));
  for (const f of readdirSync(join(ROOT, "src/ui")).filter((n) => n.endsWith(".js")).sort()) {
    const rel = `src/ui/${f}`;
    if (swept.has(rel) || SCOPE_EXCLUSIONS[rel]) continue;
    fail(`${rel} is neither swept for player-facing copy (add it to FILE_PATHS) nor listed in SCOPE_EXCLUSIONS with a reason. A UI module that is silently neither is exactly how five surfaces went missing.`);
  }
  for (const rel of Object.keys(SCOPE_EXCLUSIONS)) {
    if (swept.has(rel)) fail(`${rel} is in BOTH FILE_PATHS and SCOPE_EXCLUSIONS — decide which.`);
    if (!existsSync(join(ROOT, rel))) fail(`SCOPE_EXCLUSIONS names ${rel}, which no longer exists — a stale exclusion reads as a reasoned decision about a file nobody has looked at.`);
  }
}
const src = {};
for (const [k, rel] of Object.entries(FILE_PATHS)) src[k] = readFileSync(join(ROOT, rel), "utf8");

let failures = 0;
function fail(msg) { failures++; console.error("FAIL: " + msg); }

/* ================= table source (EVENT_NARRATION) ================= */

// D-01's eight named groups, plus one extra (Claude's Discretion, flagged in 15-PATTERNS.md) for
// lines that belong to none of them — sailing/movement, exactly as the pattern map anticipated.
const TABLE_GROUPS = {
  newround: "Round Header",
  windmove: "Storm",
  blownOut: "Storm",
  sail: "Sailing & Movement",
  dodge: "Storm",
  anchor: "Storm",
  moored: "Storm",
  blocked: "Sailing & Movement",
  anchorHold: "Storm",
  tradewind: "Storm",
  parley: "Trade & Parley",
  aground: "Storm",
  shipwrecked: "Storm",
  dock: "Docking",
  trade: "Trade & Parley",
  sidebet: "Battle",
  battle: "Battle",
  battleflee: "Battle",
  fish: "Fishing",
  finish: "End of Voyage",
  shotclock: "Shot Clock",
  shotclockskip: "Shot Clock",
  bakeoff: "End of Voyage",
  end: "End of Voyage",
  turn: "Sailing & Movement",
};

function findKeyLine(fileSrc, key) {
  const re = new RegExp(`^  ${key}:`, "m");
  const m = re.exec(fileSrc);
  if (!m) return null;
  return fileSrc.slice(0, m.index).split("\n").length;
}

const tableKeys = Object.keys(EVENT_NARRATION); // declaration order, straight from the real table
const table = tableKeys.map((key) => {
  const line = findKeyLine(src.util, key);
  if (line == null) fail(`table key "${key}" has no matching "  ${key}:" declaration line in ${FILE_PATHS.util}`);
  if (!(key in TABLE_GROUPS)) fail(`table key "${key}" has no TABLE_GROUPS entry — extraction script's own map is stale`);
  return { key, file: FILE_PATHS.util, line: line || 0, group: TABLE_GROUPS[key] || "Sailing & Movement" };
});

/* ================= ad-hoc source (flash()/onFlash() call sites) ================= */

// last function-declaration line at or before a given line, so a call site's enclosing function
// can be reported without a heavier real parser
function functionBoundaries(fileSrc) {
  const lines = fileSrc.split("\n");
  const marks = [];
  const re = /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/;
  lines.forEach((line, i) => {
    const m = re.exec(line);
    if (m) marks.push({ line: i + 1, name: m[3] });
  });
  return marks;
}
function enclosingFunction(marks, line) {
  let name = "(module scope)";
  for (const m of marks) {
    if (m.line <= line) name = m.name;
    else break;
  }
  return name;
}

// Stack-based, string/template-literal-aware call-argument parser. Given `text` and the index of
// a call's opening "(", walks forward tracking a context stack (paren/bracket/brace/template/
// templateExpr) so nested template literals with ${...} interpolation — including a template
// literal NESTED INSIDE another template literal's own ${...} expression, e.g. the turn banner's
// storm clause at flow.js:613 (`` `...${cond?`...${pn(p.idx)}...`:""}...` ``) — are walked
// correctly instead of a naive single inTemplate boolean mis-pairing the inner backticks as the
// outer template's own close (which silently truncates the argument and misreads a comma INSIDE
// the nested template's literal text, e.g. "First, it pushes", as a top-level arg separator).
// Returns both the top-level-comma-split argument list and the index just past the matching ")".
function parseCallArgs(text, openParenIdx) {
  const stack = ["paren"]; // the call's own already-consumed "("
  let i = openParenIdx + 1;
  let inString = null; // "'" or '"' — simple strings never nest
  const args = [];
  let cur = "";
  for (; i < text.length && stack.length > 0; i++) {
    const c = text[i], prev = text[i - 1];
    if (inString) {
      cur += c;
      if (c === inString && prev !== "\\") inString = null;
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === "template") {
      cur += c;
      if (c === "`" && prev !== "\\") { stack.pop(); continue; }
      if (c === "{" && prev === "$") { stack.push("templateExpr"); continue; }
      continue;
    }
    // top is one of paren/bracket/brace/templateExpr — all ordinary "code" contexts
    if (c === "'" || c === '"') { inString = c; cur += c; continue; }
    if (c === "`") { stack.push("template"); cur += c; continue; }
    if (c === "(") { stack.push("paren"); cur += c; continue; }
    if (c === "[") { stack.push("bracket"); cur += c; continue; }
    if (c === "{") { stack.push("brace"); cur += c; continue; }
    if (c === ")") {
      if (top === "paren") {
        stack.pop();
        if (stack.length === 0) break; // matched the CALL's own opening paren — done
      }
      cur += c;
      continue;
    }
    if (c === "]") { if (top === "bracket") stack.pop(); cur += c; continue; }
    if (c === "}") {
      if (top === "brace" || top === "templateExpr") stack.pop(); // templateExpr pop returns to "template"
      cur += c;
      continue;
    }
    if (c === "," && stack.length === 1) { args.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() !== "") args.push(cur.trim());
  return { args, endIdx: i };
}
function isCommentLine(fileSrc, lineNo) {
  const lineText = fileSrc.split("\n")[lineNo - 1] || "";
  return /^\s*\/\//.test(lineText);
}
// a call whose message argument is literally the table's own rendered text (via describeFor's
// `L.txt`, or a direct `describe(...).txt`) carries no new copy of its own — labelled
// table-driven per this plan's own instruction, not counted as an ad-hoc line to review.
function isTableDrivenArg(raw) {
  return raw === "L.txt" || /^describe\([\s\S]*\)\.txt$/.test(raw);
}

/* ================= @copy markers: stable card ids, declared in source =================
 * NARR-01: the durable fix for the drift recorded in this file's header. Every player-facing copy
 * site carries a `// @copy <id>` comment naming its own permanent id, and this section binds each
 * marker to its site and validates the result.
 *
 * WHY a source-declared id, rather than the two obvious alternatives:
 *   - a HASH of the string literal survives a source move but changes every time the wording is
 *     rewritten — and rewriting wording is the audit tool's PRIMARY operation. It would destroy
 *     review state on exactly the action the tool exists to support.
 *   - "enclosing function + ordinal within it" survives a rewrite but silently renumbers every
 *     later site in a function the moment a new flash() is inserted mid-function. Same silent
 *     drift, new costume.
 * An explicit id survives both events, and it is also the exact address the copy applier needs:
 * with a marker naming the site, the writer's target is one unambiguous literal, so "multi-match
 * anchor" stops being a refusal case to heuristically detect and becomes structurally impossible.
 *
 * ID RULES, all enforced below:
 *   - character set [a-z0-9.-] only, starting with a letter or digit, globally unique;
 *   - no "(" — the independent call counters in this file skip whole comment lines, and an id
 *     carrying a call-shaped fragment could perturb a raw count;
 *   - no pre-conversion second-person pronoun token (you/your/yours/yourself) —
 *     ui_contract_check.js's D-29 register assertion deliberately does not strip comments, so a
 *     trailing marker carrying one would trip it;
 *   - named for the MOMENT and ROLE, never the wording, so a rewrite never invalidates an id.
 *
 * SYNTAX: `// @copy <id>` on the line immediately above the site, or as a trailing comment on the
 * site's own line where a preceding line would break the surrounding density.
 */
const COPY_ID_RE = /^[a-z0-9][a-z0-9.-]*$/;
const OWN_LINE_MARKER_RE = /^\s*\/\/\s*@copy\s+(\S+)\s*$/;
const TRAILING_MARKER_RE = /\/\/\s*@copy\s+(\S+)\s*$/;
const RETIRED_IDS_REL = "art-review/narration-retired-ids.json";

function findCopyMarkers(fileSrc, filePath) {
  const out = [];
  fileSrc.split("\n").forEach((line, i) => {
    const own = OWN_LINE_MARKER_RE.exec(line);
    if (own) { out.push({ line: i + 1, id: own[1] }); return; }
    if (/^\s*\/\//.test(line)) return; // some other comment line
    const trail = TRAILING_MARKER_RE.exec(line);
    if (trail) out.push({ line: i + 1, id: trail[1] });
  });
  for (const m of out) {
    const where = `${filePath}:${m.line}`;
    if (!COPY_ID_RE.test(m.id)) fail(`@copy id "${m.id}" at ${where} breaks the character rules — lower-case letters, digits, dots and hyphens only, starting with a letter or digit`);
    if (m.id.includes("(")) fail(`@copy id "${m.id}" at ${where} contains "(" — that could perturb this file's own independent call counts`);
    if (/\b(you|your|yours|yourself)\b/.test(m.id)) fail(`@copy id "${m.id}" at ${where} carries a pre-conversion second-person pronoun token — ui_contract_check.js's register assertion does not strip comments and would trip on it`);
  }
  return out;
}

// Binds each marker to the NEXT extracted copy site at or after its own line, within the same
// enclosing function, and fails by name on every way that can go wrong.
function bindCopyMarkers(fileSrc, filePath, siteLines) {
  const marks = functionBoundaries(fileSrc);
  const markers = findCopyMarkers(fileSrc, filePath).sort((a, b) => a.line - b.line);
  const sites = [...new Set(siteLines)].sort((a, b) => a - b);
  const bound = new Map();  // site line -> id
  const usedBy = new Map(); // site line -> the marker line that claimed it
  for (const m of markers) {
    const target = sites.find((l) => l >= m.line);
    if (target === undefined) {
      fail(`@copy marker "${m.id}" at ${filePath}:${m.line} binds to NOTHING — there is no extracted copy site at or after it; the site it named has been deleted, so retire the id in ${RETIRED_IDS_REL} and remove the marker`);
      continue;
    }
    if (usedBy.has(target)) {
      fail(`two @copy markers bind to the SAME site ${filePath}:${target} — "${bound.get(target)}" at :${usedBy.get(target)} and "${m.id}" at :${m.line}`);
      continue;
    }
    const mFn = enclosingFunction(marks, m.line), tFn = enclosingFunction(marks, target);
    if (mFn !== tFn) {
      fail(`@copy marker "${m.id}" at ${filePath}:${m.line} (in ${mFn}()) would bind ACROSS a function boundary to ${filePath}:${target} (in ${tFn}()) — the site it was written for has moved or been deleted`);
      continue;
    }
    bound.set(target, m.id);
    usedBy.set(target, m.line);
  }
  for (const l of sites) {
    if (!bound.has(l)) fail(`live copy site ${filePath}:${l} (in ${enclosingFunction(marks, l)}()) has NO "// @copy <id>" marker — every player-facing copy site must declare its own permanent id, or the audit tool cannot carry a review mark across a source move`);
  }
  return bound;
}

function loadRetiredIds() {
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, RETIRED_IDS_REL), "utf8"));
    return new Set(Array.isArray(raw) ? raw : (raw.ids || []));
  } catch (e) {
    fail(`${RETIRED_IDS_REL} is missing or unreadable (${e.message}) — that ledger is what stops a future site claiming a deleted site's id and inheriting its review mark`);
    return new Set();
  }
}

function findCallSites(fileSrc, filePath) {
  const marks = functionBoundaries(fileSrc);
  const sites = [];
  const callRe = /\b(flash|onFlash)\s*\(/g;
  let m;
  while ((m = callRe.exec(fileSrc))) {
    const idx = m.index;
    const lineNo = fileSrc.slice(0, idx).split("\n").length;
    if (isCommentLine(fileSrc, lineNo)) continue;
    const openParenIdx = idx + m[0].length - 1;
    const { args } = parseCallArgs(fileSrc, openParenIdx);
    const rawNeutral = args[0] || "";
    const rawVariants = args.length >= 4 ? args[3] : null;
    sites.push({
      file: filePath,
      line: lineNo,
      fn: enclosingFunction(marks, lineNo),
      rawNeutral,
      rawVariants,
      tableDriven: isTableDrivenArg(rawNeutral),
    });
  }
  return sites;
}

// Curated per-call-site metadata: moment group, a short human label, and a default keep/cut/
// merge/rewrite recommendation the audit page shows (and Wyatt can override). Biased toward
// "keep"/"rewrite" over "cut" per D-06 — see this plan's own header paragraph in the page.
// NARR-01 (Wyatt-approved 2026-07-29): keyed by the site's own `// @copy <id>` MARKER, never by
// "file:line" again. Each label below was moved with ITS OWN SITE — never by proximity — because
// applyMeta() fails only on a MISSING key, so a stale key silently attaches the wrong label to a
// shifted site while an orphan sits unnoticed. That trap is now closed from both ends: an unmarked
// site fails binding, and an AD_HOC_META entry with no live site fails as an orphan (below).
//
// D-25/D-36: the three trade-wind rim-sweep ad-hoc call sites (windLeg/humanAct/humanTurn) that
// used to live here are GONE, not merely tagged — 15-06 replaced each with
// `await narrateLastEvent()`, so they render straight through EVENT_NARRATION.tradewind and are no
// longer separate flash() sites for this extractor to find at all. The merge is complete.
const AD_HOC_META = {
  "adhoc.flip.announce": { fn: "humanFlip", group: "Docking", tag: "keep", label: "Coin-flip announcement (generic — used at docking/anchor moments)" },
  "adhoc.storm.brokeanchor": { fn: "windLeg", group: "Storm", tag: "keep", label: "Broke — can't afford to anchor (D-11/NARR-02)" },
  "adhoc.storm.botsquare": { fn: "botWindLeg", group: "Storm", tag: "keep", label: "Bot per-square storm outcome — table pass-through, not new copy" },
  "adhoc.storm.botlegsummary": { fn: "botWindLeg", group: "Storm", tag: "keep", label: "Bot storm-leg summary — table pass-through, not new copy" },
  "adhoc.storm.secondleg": { fn: "humanWind", group: "Storm", tag: "keep", label: "Second storm leg direction — shared secondLegLine() helper (D-18/D-23/D-37), also used by botTurn" },
  "adhoc.trade.nocargo": { fn: "humanTrade", group: "Trade & Parley", tag: "keep", label: "No cargo to trade for (guarded safety net — Trade button is disabled first, D-41)" },
  "adhoc.trade.refusalbot": { fn: "humanTrade", group: "Trade & Parley", tag: "keep", label: "Trade refusal, bot logic branch (D-08/D-18 — merged wording with the plain-decline branch below)" },
  "adhoc.trade.refusalhuman": { fn: "humanTrade", group: "Trade & Parley", tag: "keep", label: "Trade refusal, human-declines branch (D-08/D-18 — merged wording, same template as the bot branch above)" },
  "adhoc.act.bakerystart": { fn: "humanAct", group: "Sailing & Movement", tag: "keep", label: "Start the bakery" },
  "adhoc.act.nopowder": { fn: "humanAct", group: "Battle", tag: "keep", label: "Can't afford powder, action guard (guarded safety net)" },
  "adhoc.turn.banner": { fn: "humanTurn", group: "Round Header", tag: "rewrite", label: "Per-turn banner + storm intro (NARR-03)" },
  "adhoc.turn.leeward": { fn: "humanTurn", group: "Sailing & Movement", tag: "keep", label: "Leeward warning" },
  "adhoc.turn.brokesail": { fn: "humanTurn", group: "Sailing & Movement", tag: "keep", label: "Broke — can't afford to sail, human (D-11/NARR-02) — shared brokeSailLine() helper, also used by botTurn" },
  "adhoc.turn.botsecondleg": { fn: "botTurn", group: "Storm", tag: "keep", label: "Second storm leg direction, bot — shared secondLegLine() helper" },
  "adhoc.turn.botbrokesail": { fn: "botTurn", group: "Sailing & Movement", tag: "keep", label: "Broke — can't afford to sail, bot — shared brokeSailLine() helper" },
  "adhoc.sidebet.backed": { fn: "collectSideBets", group: "Battle", tag: "keep", label: "Side bet — backed with coin (D-08)" },
  "adhoc.sidebet.freecall": { fn: "collectSideBets", group: "Battle", tag: "keep", label: "Side bet — free call (D-08)" },
  "adhoc.sidebet.settle": { fn: "settleSideBets", group: "Battle", tag: "keep", label: "Side-bet settlement (aggregate line covering every bettor — no per-viewer variant)" },
  "adhoc.battle.opening": { fn: "asyncBattle", group: "Battle", tag: "keep", label: "Battle opening announcement (D-08)" },
  "adhoc.round.header": { fn: "runLiveNet", group: "Round Header", tag: "keep", label: "Round-header flash — table pass-through, not new copy" },
  "adhoc.round.finalheader": { fn: "runLiveNet", group: "Round Header", tag: "keep", label: "Final-round header flash — table pass-through, not new copy" },
  "adhoc.voyageend.nobodyfinished": { fn: "liveResolveEndNet", group: "End of Voyage", tag: "keep", label: "Nobody finished the voyage — no changes this phase (Phase 16's UI-07 owns box visibility)" },
  "adhoc.voyageend.drumroll": { fn: "liveResolveEndNet", group: "End of Voyage", tag: "rewrite", label: "Drumroll — the last blue-box line before the gold banner reveals the winner (Wyatt, 2026-07-31)" },
  "adhoc.turn.botbanner": { fn: "narrateCurrent", group: "Sailing & Movement", tag: "keep", label: "Bot turn-start banner (D-07)" },
  "adhoc.turn.boteventpassthrough": { fn: "narrateCurrent", group: "Sailing & Movement", tag: "keep", label: "Bot event narration — table pass-through, not new copy" },
};

function applyMeta(sites) {
  return sites.map((s) => {
    const meta = AD_HOC_META[s.id];
    if (!meta) {
      fail(`no AD_HOC_META entry for @copy id "${s.id}" (${s.file}:${s.line}, enclosing fn "${s.fn}") — extraction found a flash()/onFlash() call site this script's own metadata table doesn't know about yet; add it keyed by that id`);
    } else if (meta.fn !== s.fn) {
      // the curated entry claims a different enclosing function than the marker actually sits in —
      // the exact "wrong label attached to a shifted site" failure this re-key exists to prevent
      fail(`AD_HOC_META["${s.id}"] records fn "${meta.fn}" but the marker binds inside "${s.fn}()" at ${s.file}:${s.line} — the label and the site have parted company`);
    }
    return {
      id: s.id,
      file: s.file,
      line: s.line,
      fn: s.fn,
      tableDriven: s.tableDriven,
      group: (meta && meta.group) || "Sailing & Movement",
      label: (meta && meta.label) || "(unlabeled — see AD_HOC_META)",
      defaultTag: (meta && meta.tag) || "keep",
      // D-36: mergeInto is the CANONICAL target id this card resolves to by default (never a
      // symmetric list); siblingMerges is display-only — who else folds into that SAME target.
      mergeInto: (meta && meta.mergeInto) || null,
      siblingMerges: (meta && meta.siblingMerges) || null,
      rawNeutral: s.rawNeutral,
      rawVariants: s.rawVariants,
    };
  });
}

const flowSites = findCallSites(src.flow, FILE_PATHS.flow);
const orchSites = findCallSites(src.orch, FILE_PATHS.orch);
const utilSites = findCallSites(src.util, FILE_PATHS.util);

// `adhocRaw` carries no curated metadata yet — applyMeta() now keys off the site's @copy id, and ids
// are not bound until every category has been extracted (the binder needs the complete per-file site
// list). `adhoc` is built from this, after binding, further down.
const adhocRaw = [...flowSites, ...orchSites, ...utilSites]
  .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));

// D-36: a STATIC, curation-time guard — if AD_HOC_META's own `mergeInto` values ever formed a
// cycle (a future curation mistake, the exact defect Wyatt hit live), fail loudly here rather than
// shipping a broken metadata table for the page to render. Independent of the page's OWN live
// cycle check (which covers Wyatt's actual dispositions, not just this static table).
(function checkAdHocMergeTargetsAcyclic() {
  const byKey = Object.fromEntries(Object.entries(AD_HOC_META).map(([k, v]) => [k, v.mergeInto || null]));
  const visiting = new Set(), visited = new Set();
  function dfs(key, path) {
    if (visited.has(key)) return;
    if (visiting.has(key)) { fail(`AD_HOC_META mergeInto cycle detected: ${[...path, key].join(" -> ")}`); return; }
    if (!(key in byKey) || byKey[key] == null) return; // terminal (table target, or no target)
    visiting.add(key);
    dfs(byKey[key], [...path, key]);
    visiting.delete(key);
    visited.add(key);
  }
  Object.keys(byKey).forEach((key) => dfs(key, []));
})();

/* ================= D-30/D-31: ask()/panel() prompt + button extraction =================
 * A third narration-adjacent surface, never in scope for D-03 — action prompts and their button
 * labels, the text players read most (every turn, every decision). Same discipline as the
 * flash()/onFlash() extraction above: mechanical, not hand-transcribed, cross-checked against an
 * independent count.
 *
 * `panel("")` (and equivalent empty-string clears) carry no copy of their own — dropped, not
 * counted as a prompt, but still counted in the raw independent-count cross-check so a real
 * prompt can never hide behind an under-counted total.
 *
 * D-31: the FIRST version of this only read an INLINE array literal passed directly as ask()'s
 * 2nd argument. Every prompt with CONDITIONAL options — humanAct's own action menu chief among
 * them — builds that array into a local variable first (`opts`, `ingOpts`, `coinOpts`) and the
 * old extraction recorded `rawOpts:"opts"`, `labels:[]`: a bare identifier contains no `label:`
 * substring for the old regex to find, so 15 of 28 prompts silently rendered zero buttons.
 * resolveLocalOptsRaw() below follows that identifier through the ENCLOSING FUNCTION's own body:
 * its own `const X=…` initializer, plus every `X.push(…)`/`X.unshift(…)` contribution up to the
 * ask() call itself — concatenated into one blob and run through the SAME label-extraction regex
 * used for inline arrays, so a bare-identifier opts variable is no longer invisible to it.
 *
 * Every option a `.push()`/`.unshift()` call ADDS conditionally (guarded by an `if(cond)`
 * immediately before it, brace-less — the only shape actually used in this codebase) carries that
 * condition alongside its label, since D-21 treats a conditionally-present option as a real branch
 * (`windLeg`'s own `Pay 1🌕 to anchor` button, present only when `coins>=1`) — the audit page must
 * show the option is ABSENT under the opposite condition, not just show it unconditionally.
 *
 * A label that is itself a bare identifier (`label:flipLabel`) is followed ONE level further: if
 * that identifier's own `const flipLabel=cond?"A":cond2?"B":"C"` declaration is a ternary cascade,
 * splitTernaryLeaves() below splits it into one branch per leaf, each carrying its own condition —
 * this is the exact shape `windLeg`'s 3-way flip button needed (D-31's own worked example).
 *
 * Genuinely dynamic option GENERATORS (`uniq.map(i=>({label:ilabelImg(i),…}))` — the array itself,
 * not one option within it, is produced from live game state) are recorded as `dynamicBase`, never
 * silently dropped — the audit page renders a described placeholder naming the generator rather
 * than showing nothing (D-31's explicit "silence is what caused this").
 */
function isEmptyStringLiteral(raw) {
  const t = (raw || "").trim();
  return t === '""' || t === "''" || t === "``";
}
const LABEL_KEY_RE = /label\s*:\s*/g;
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;

// Scans forward from `startIdx` (right after "label:") and captures exactly one value expression
// — up to the first TOP-LEVEL ',' or the enclosing object literal's own closing '}' — using a
// context stack (value/paren/bracket/brace/template/templateExpr), the SAME nested-template-aware
// technique parseCallArgs already uses. A naive backtick-terminated regex here would (and, before
// this fix, did) truncate a value like the action menu's own Attack button —
// `` `⚔️ Attack${cond?` (-${n}🌕)`:""}` `` — at the FIRST backtick it meets, which is the OPENING
// backtick of the ternary's own NESTED template, not the label's closing one.
function captureValueExpr(text, startIdx) {
  const stack = ["value"];
  let i = startIdx, inString = null;
  for (; i < text.length; i++) {
    const c = text[i], prev = text[i - 1];
    if (inString) { if (c === inString && prev !== "\\") inString = null; continue; }
    const top = stack[stack.length - 1];
    if (top === "template") {
      if (c === "`" && prev !== "\\") { stack.pop(); continue; }
      if (c === "{" && prev === "$") { stack.push("templateExpr"); continue; }
      continue;
    }
    if (c === "'" || c === '"') { inString = c; continue; }
    if (c === "`") { stack.push("template"); continue; }
    if (c === "(") { stack.push("paren"); continue; }
    if (c === "[") { stack.push("bracket"); continue; }
    if (c === "{") { stack.push("brace"); continue; }
    if (c === ")") { if (top === "paren") stack.pop(); continue; }
    if (c === "]") { if (top === "bracket") stack.pop(); continue; }
    if (c === "}") {
      if (top === "templateExpr" || top === "brace") { stack.pop(); continue; }
      if (top === "value") break; // the enclosing {label:...} object's own closing brace
      continue;
    }
    if (c === "," && top === "value") break;
  }
  return { raw: text.slice(startIdx, i).trim(), endIdx: i };
}

// Splits a top-level ternary cascade (`cond?a:cond2?b:c`) into leaves, each `{condition, raw}` —
// condition is the guarding expression's raw source, or null for the final unconditional leaf.
// Respects string/template/bracket nesting via the same character-class approach parseCallArgs
// uses, so a `?`/`:` inside a nested template literal (e.g. `` `Sweeten…${ilabelImg(x)}` ``) is
// never mistaken for the ternary's own operators.
function splitTernaryLeaves(expr) {
  const trimmed = expr.trim();
  let depth = 0, inString = null, inTemplate = false, templateDepth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i], prev = trimmed[i - 1];
    if (inString) { if (c === inString && prev !== "\\") inString = null; continue; }
    if (inTemplate) {
      if (c === "`" && prev !== "\\" && templateDepth === 0) inTemplate = false;
      else if (c === "{" && prev === "$") templateDepth++;
      else if (c === "}" && templateDepth > 0) templateDepth--;
      continue;
    }
    if (c === "'" || c === '"') { inString = c; continue; }
    if (c === "`") { inTemplate = true; continue; }
    if (c === "(" || c === "[" || c === "{") { depth++; continue; }
    if (c === ")" || c === "]" || c === "}") { depth--; continue; }
    if (depth === 0 && c === "?") {
      const cond = trimmed.slice(0, i).trim();
      // find the MATCHING top-level ':' for this '?' (there may be nested ternaries in either branch)
      let j = i + 1, qDepth = 0, bDepth = 0, jInString = null, jInTemplate = false;
      for (; j < trimmed.length; j++) {
        const cc = trimmed[j], pp = trimmed[j - 1];
        if (jInString) { if (cc === jInString && pp !== "\\") jInString = null; continue; }
        if (jInTemplate) { if (cc === "`" && pp !== "\\") jInTemplate = false; continue; }
        if (cc === "'" || cc === '"') { jInString = cc; continue; }
        if (cc === "`") { jInTemplate = true; continue; }
        if (cc === "(" || cc === "[" || cc === "{") { bDepth++; continue; }
        if (cc === ")" || cc === "]" || cc === "}") { bDepth--; continue; }
        if (bDepth === 0 && cc === "?") { qDepth++; continue; }
        if (bDepth === 0 && cc === ":") { if (qDepth === 0) break; qDepth--; continue; }
      }
      const trueBranch = trimmed.slice(i + 1, j).trim();
      const falseBranch = trimmed.slice(j + 1).trim();
      const rest = splitTernaryLeaves(falseBranch); // recurse — falseBranch may itself be a ternary
      return [{ condition: cond, raw: trueBranch }, ...rest];
    }
  }
  return [{ condition: null, raw: trimmed }];
}

// Scans `body` starting at `startIdx` (right after a `const NAME=` or similar) and returns the
// raw text up to (not including) the first TOP-LEVEL ';' — same balanced string/template/bracket
// tracking as parseCallArgs, different stop condition (semicolon, not a matching close-paren).
function captureExprUntilSemicolon(body, startIdx) {
  let depth = 0, inString = null, inTemplate = false;
  let i = startIdx;
  for (; i < body.length; i++) {
    const c = body[i], prev = body[i - 1];
    if (inString) { if (c === inString && prev !== "\\") inString = null; continue; }
    if (inTemplate) { if (c === "`" && prev !== "\\") inTemplate = false; continue; }
    if (c === "'" || c === '"') { inString = c; continue; }
    if (c === "`") { inTemplate = true; continue; }
    if (c === "(" || c === "[" || c === "{") { depth++; continue; }
    if (c === ")" || c === "]" || c === "}") { depth--; continue; }
    if (depth === 0 && c === ";") break;
  }
  return body.slice(startIdx, i).trim();
}

function findEnclosingFunctionBody(fileSrc, marks, callLine) {
  let startLine = null, endLine = fileSrc.split("\n").length;
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].line <= callLine) {
      startLine = marks[i].line;
      if (marks[i + 1]) endLine = marks[i + 1].line - 1;
    } else break;
  }
  if (startLine == null) return "";
  return fileSrc.split("\n").slice(startLine - 1, endLine).join("\n");
}

// Follows a bare-identifier `rawOpts` (e.g. "opts") through its enclosing function's own body:
// the variable's OWN initializer (its raw text — an array literal's contents run through the
// SAME label regex as an inline array; a non-array-literal initializer, e.g. `[...x].map(…)`, is
// recorded as `dynamicBase` for a described placeholder) plus every subsequent `.push()`/
// `.unshift()` contribution, each carrying its own guarding `if(cond)` when present (brace-less
// single-statement guards only — the only shape this codebase actually uses).
function resolveLocalOptsRaw(fileSrc, marks, callLine, varName) {
  const body = findEnclosingFunctionBody(fileSrc, marks, callLine);
  const declRe = new RegExp(`\\b(?:const|let)\\s+${varName}\\s*=`);
  const declMatch = declRe.exec(body);
  let initRaw = null;
  if (declMatch) initRaw = captureExprUntilSemicolon(body, declMatch.index + declMatch[0].length);
  const isArrayLiteral = initRaw != null && initRaw.trim().startsWith("[") && !/\]\s*\.\s*\w/.test(initRaw); // `[...].map(...)` still starts with '[' but is a chain, not a plain literal
  const pushes = [];
  const pushRe = new RegExp(`\\b${varName}\\.(push|unshift)\\s*\\(`, "g");
  let m;
  while ((m = pushRe.exec(body))) {
    const openParenIdx = m.index + m[0].length - 1;
    const { args } = parseCallArgs(body, openParenIdx);
    const argRaw = args[0] || "";
    // guard detection: an `if(cond)` immediately preceding this exact call (same line or the
    // line(s) directly above, no other statement in between, no braces)
    const guardRe = new RegExp(`if\\s*\\(((?:[^()]|\\([^()]*\\))*)\\)\\s*${varName}\\.(?:push|unshift)\\s*\\(\\s*$`);
    const before = body.slice(0, openParenIdx + 1 - (argRaw.length ? 0 : 0)).slice(0, m.index + m[0].length);
    const guardMatch = guardRe.exec(before);
    pushes.push({ argRaw, condition: guardMatch ? guardMatch[1].trim() : null });
  }
  return { initRaw, isArrayLiteral, pushes };
}

// D-34: `back:true`/`flip:true` on an option are STRUCTURAL MARKERS — localAsk() (src/ui/flow.js:
// 81-90) excludes any option carrying either flag from the rendered button row entirely and
// substitutes its own hardcoded control (a circular "‹" for `back`, the flippable coin for
// `flip`); the option's own `label` text is never shown to a player. Every occurrence checked
// empirically sits on the SAME source line as its own `label:` property (never split across
// lines, never sharing a line with an unflagged sibling option) — so a same-line text scan is a
// safe, simple way to detect it without a second balanced-brace parser.
function labelLineHasFlag(raw, matchIdx, flagName) {
  const lineStart = raw.lastIndexOf("\n", matchIdx) + 1;
  let lineEnd = raw.indexOf("\n", matchIdx);
  if (lineEnd === -1) lineEnd = raw.length;
  const line = raw.slice(lineStart, lineEnd);
  return new RegExp(`\\b${flagName}\\s*:\\s*true\\b`).test(line);
}
// NARR-01: an option's own `value:` expression, captured so a button's card id can be derived from
// something OTHER than its label — the label is precisely what Wyatt edits, so keying a button id to
// it would destroy the button's review mark on every wording pass. Scanned from the label's own
// match index FORWARD within the same line (never from the line start), because two options
// routinely share one line — e.g. `{label:"Buy…",value:true},{label:"Take 3🌕",value:false}` — and a
// line-start scan would hand both labels the first option's value.
function labelLineValue(raw, matchIdx) {
  const lineStart = raw.lastIndexOf("\n", matchIdx) + 1;
  let lineEnd = raw.indexOf("\n", matchIdx);
  if (lineEnd === -1) lineEnd = raw.length;
  const line = raw.slice(lineStart, lineEnd);
  const re = /\bvalue\s*:\s*/g;
  re.lastIndex = matchIdx - lineStart;
  const m = re.exec(line);
  if (!m) return null;
  return captureValueExpr(line, m.index + m[0].length).raw;
}
// Extracts every static `label:` value from a raw source blob, resolving one level of
// bare-identifier indirection (`label:flipLabel` -> flipLabel's own ternary, split into branches)
// against the SAME enclosing-function body a locally-built opts array was resolved from (pass
// `null` for inline-array sites, which have no need for this).
function extractLabelValues(raw, body) {
  const out = [];
  let dynamicCount = 0;
  LABEL_KEY_RE.lastIndex = 0;
  let m;
  while ((m = LABEL_KEY_RE.exec(raw))) {
    const { raw: valueRaw, endIdx } = captureValueExpr(raw, m.index + m[0].length);
    LABEL_KEY_RE.lastIndex = endIdx; // resume scanning right after this value's true end (not its trimmed length)
    const backMarker = labelLineHasFlag(raw, m.index, "back");
    const flipMarker = labelLineHasFlag(raw, m.index, "flip");
    const value = labelLineValue(raw, m.index);
    if (/^[`"']/.test(valueRaw)) { out.push({ raw: valueRaw, condition: null, backMarker, flipMarker, value }); continue; }
    if (IDENTIFIER_RE.test(valueRaw)) {
      // bare-identifier label (`label:flipLabel`) — try to resolve it against the enclosing
      // function body: its own `const NAME=...` declaration, split into ternary leaves if it is one
      if (!body) { dynamicCount++; continue; }
      const declRe = new RegExp(`\\b(?:const|let)\\s+${valueRaw}\\s*=`);
      const declMatch = declRe.exec(body);
      if (!declMatch) { dynamicCount++; continue; }
      const exprRaw = captureExprUntilSemicolon(body, declMatch.index + declMatch[0].length);
      if (!/\?/.test(exprRaw)) {
        if (/^[`"']/.test(exprRaw.trim())) out.push({ raw: exprRaw.trim(), condition: null, backMarker, flipMarker, value });
        else dynamicCount++;
        continue;
      }
      splitTernaryLeaves(exprRaw).forEach((leaf) => {
        if (/^[`"']/.test(leaf.raw)) out.push({ raw: leaf.raw, condition: leaf.condition, backMarker, flipMarker, value });
        else dynamicCount++;
      });
      continue;
    }
    dynamicCount++; // a full expression (e.g. `pn(o.idx)`, `ilabelImg(i)`) — live data, not fixed copy
  }
  return { labels: out, dynamicLabelCount: dynamicCount };
}

function findPromptSites(fileSrc, filePath) {
  const marks = functionBoundaries(fileSrc);
  const sites = [];
  let rawCount = 0;
  const callRe = /\b(ask|panel)\s*\(/g;
  let m;
  while ((m = callRe.exec(fileSrc))) {
    const idx = m.index;
    const kind = m[1];
    const lineNo = fileSrc.slice(0, idx).split("\n").length;
    if (isCommentLine(fileSrc, lineNo)) continue;
    rawCount++;
    const openParenIdx = idx + m[0].length - 1;
    const { args } = parseCallArgs(fileSrc, openParenIdx);
    const rawMsg = args[0] || "";
    if (kind === "panel" && isEmptyStringLiteral(rawMsg)) continue; // clear — no copy of its own
    const rawOpts = kind === "ask" ? (args[1] || null) : null;
    // D-33: ask()'s own 4th argument — `sub`, helper text rendered under the buttons (humanAct's
    // powder-cost/too-poor nudge is the one live user of this). Never previously captured.
    const rawSub = (kind === "ask" && args.length >= 4) ? (args[3] || null) : null;

    let labels = [], dynamicLabelCount = 0, dynamicBase = null;
    if (rawOpts) {
      const trimmedOpts = rawOpts.trim();
      if (IDENTIFIER_RE.test(trimmedOpts)) {
        // D-31: locally-built options variable — resolve it
        const { initRaw, isArrayLiteral, pushes } = resolveLocalOptsRaw(fileSrc, marks, lineNo, trimmedOpts);
        const body = findEnclosingFunctionBody(fileSrc, marks, lineNo);
        if (initRaw && !isArrayLiteral) dynamicBase = initRaw; // e.g. `[...new Set(p.ing)].map(i=>({label:ilabelImg(i),...}))`
        const initResolved = initRaw && isArrayLiteral ? extractLabelValues(initRaw, body) : { labels: [], dynamicLabelCount: 0 };
        labels = labels.concat(initResolved.labels);
        dynamicLabelCount += initResolved.dynamicLabelCount;
        pushes.forEach(({ argRaw, condition }) => {
          const r = extractLabelValues(argRaw, body);
          r.labels.forEach((l) => labels.push({ raw: l.raw, condition: l.condition || condition, backMarker: l.backMarker, flipMarker: l.flipMarker, value: l.value }));
          dynamicLabelCount += r.dynamicLabelCount;
        });
      } else {
        // inline expression (array literal, ternary, or `.map(...).concat([...])` compound) —
        // resolve against the enclosing function body too, so a bare-identifier LABEL inside an
        // otherwise-inline array (rare, none currently observed) would still resolve
        const body = findEnclosingFunctionBody(fileSrc, marks, lineNo);
        const r = extractLabelValues(rawOpts, body);
        labels = r.labels;
        dynamicLabelCount = r.dynamicLabelCount;
        // D-31: a fully dynamic inline generator (e.g. `uniq.map(i=>({label:ilabelImg(i),...}))`)
        // yields zero static labels — describe the generator rather than rendering nothing
        if (labels.length === 0 && dynamicLabelCount > 0) dynamicBase = rawOpts;
      }
    }
    sites.push({
      file: filePath,
      line: lineNo,
      fn: enclosingFunction(marks, lineNo),
      kind,
      rawMsg,
      rawOpts,
      labels,
      dynamicLabelCount,
      dynamicBase,
      rawSub,
      isLiteral: /^[`"']/.test(rawMsg.trim()), // false = a pre-computed variable (e.g. `promptMsg`), not an inline literal
    });
  }
  return { sites, rawCount };
}
const flowPromptResult = findPromptSites(src.flow, FILE_PATHS.flow);
const orchPromptResult = findPromptSites(src.orch, FILE_PATHS.orch);
const prompts = [...flowPromptResult.sites, ...orchPromptResult.sites]
  .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));

/* ================= D-32: the remaining player-facing surfaces ("misc") =================
 * D-32's own root-cause finding: this script's scope kept being defined by MECHANISM — first the
 * EVENT_NARRATION table, then flash()/onFlash(), then ask()/panel() (D-30/D-31) — never by
 * AUDIENCE ("every string a player can read"). Each of those was real and load-bearing, but
 * narration/prompts are not the only way text reaches a player. This section extracts the
 * remaining known surfaces Wyatt's own independent sweep found absent: the pre-game intro/barrier
 * banners, the end-of-voyage award names+bylines, the live battle/bakeoff round-result lines,
 * multiplayer room-join/service errors, the recipe-draft/waiting broadcasts, the timer-toggle
 * tooltip, and the pass-and-play hand-off screen.
 *
 * Same discipline as every extraction above: mechanical, cross-checked against an independent
 * count wherever the construct is call-/assignment-shaped and countable (introBarrier, mpError,
 * battleLine, timer, lobby all get one). The two exceptions:
 *   - awards (BADGE_POOL/FALLBACK_BADGE) is a plain data table with no call site at all —
 *     cross-checked by counting its own distinguishing "byline:" key instead.
 *   - draftWait is a genuinely heterogeneous handful of call shapes (netBroadcast/showNarration/
 *     onBroadcast) — curated by exact anchor text, same convention AD_HOC_META already uses for
 *     the flash()/onFlash() sites above, but each anchor's PRESENCE at its expected file is
 *     verified below, so a future edit that moves or rewords one of these lines without updating
 *     this table fails loudly instead of silently going stale.
 * ==========================================================================*/

// True when `idx` is the START of a genuine CALL (`name(`), not `function name(` — the
// netIntroBarrier sweep would otherwise also match its own declaration.
function isDeclarationSite(fileSrc, idx) {
  const before = fileSrc.slice(Math.max(0, idx - 40), idx);
  return /\bfunction\s*$/.test(before);
}
function findNamedCallSites(fileSrc, filePath, names) {
  const marks = functionBoundaries(fileSrc);
  const sites = [];
  const re = new RegExp(`\\b(${names.join("|")})\\s*\\(`, "g");
  let m;
  while ((m = re.exec(fileSrc))) {
    const idx = m.index;
    if (isDeclarationSite(fileSrc, idx)) continue;
    const lineNo = fileSrc.slice(0, idx).split("\n").length;
    if (isCommentLine(fileSrc, lineNo)) continue;
    const openParenIdx = idx + m[0].length - 1;
    const { args } = parseCallArgs(fileSrc, openParenIdx);
    sites.push({ file: filePath, line: lineNo, fn: enclosingFunction(marks, lineNo), name: m[1], args });
  }
  return sites;
}
function independentCallCount(fileSrc, name) {
  const kept = fileSrc.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
  // exclude the declaration line itself the same way findNamedCallSites does, so the two counts
  // stay comparable for a name (like netIntroBarrier) that is both declared and called in-file
  const withoutDecl = kept.replace(new RegExp(`function\\s+${name}\\s*\\(`), "§§§");
  const m = withoutDecl.match(new RegExp(`\\b${name}\\s*\\(`, "g"));
  return m ? m.length : 0;
}
// Resolves a bare identifier argument (e.g. netIntroBarrier(msg,...)'s own "msg") to that
// variable's own `const NAME=...`/`let NAME=...` initializer, WITHIN the call's enclosing function
// — same one-level-of-indirection technique resolveLocalOptsRaw (D-31, above) already uses for
// locally-built options arrays.
function resolveVarInFunction(fileSrc, marks, callLine, varName) {
  const body = findEnclosingFunctionBody(fileSrc, marks, callLine);
  const declRe = new RegExp(`\\b(?:const|let)\\s+${varName}\\s*=`);
  const m = declRe.exec(body);
  if (!m) return null;
  return captureExprUntilSemicolon(body, m.index + m[0].length);
}
function resolvedArgRaw(fileSrc, marks, callLine, rawArg) {
  const trimmed = (rawArg || "").trim();
  if (IDENTIFIER_RE.test(trimmed)) {
    const resolved = resolveVarInFunction(fileSrc, marks, callLine, trimmed);
    return resolved != null ? resolved : rawArg;
  }
  return rawArg;
}
// Generic "capture the RHS of an assignment whose LHS matches `lhsRe`" sweep — same
// balanced-string/template-aware capture as everything else in this file (captureExprUntilSemicolon),
// just anchored on an arbitrary left-hand side instead of a call's opening paren. Used for the
// battle/bakeoff `rmsg=` result lines and the timer/lobby `X.innerHTML=`/`X.title=` assignments.
function findAssignmentByLHS(fileSrc, filePath, lhsRe) {
  const marks = functionBoundaries(fileSrc);
  const sites = [];
  const re = new RegExp(`${lhsRe}\\s*=(?!=)`, "g");
  let m;
  while ((m = re.exec(fileSrc))) {
    const idx = m.index;
    const lineNo = fileSrc.slice(0, idx).split("\n").length;
    if (isCommentLine(fileSrc, lineNo)) continue;
    const startIdx = idx + m[0].length;
    const raw = captureExprUntilSemicolon(fileSrc, startIdx).trim();
    sites.push({ file: filePath, line: lineNo, fn: enclosingFunction(marks, lineNo), rawMsg: raw });
  }
  return sites;
}
function independentAssignCount(fileSrc, varName) {
  const kept = fileSrc.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
  const m = kept.match(new RegExp(`\\b${varName}\\s*=(?!=)`, "g"));
  return m ? m.length : 0;
}

/* ---- introBarrier: netIntroBarrier(msg,btnLabel) call sites — D-32's own count of "6" is
 * exactly 3 banner messages + 3 button labels. ---- */
const introBarrierSites = findNamedCallSites(src.flow, FILE_PATHS.flow, ["netIntroBarrier"])
  .concat(findNamedCallSites(src.orch, FILE_PATHS.orch, ["netIntroBarrier"]));
{
  const indep = independentCallCount(src.flow, "netIntroBarrier") + independentCallCount(src.orch, "netIntroBarrier");
  if (indep !== introBarrierSites.length) fail(`introBarrier: structured extraction found ${introBarrierSites.length} netIntroBarrier() call(s) but the independent count found ${indep}`);
}
if (introBarrierSites.length !== 3) fail(`introBarrier: expected exactly 3 netIntroBarrier() call sites (showAhoyIntro, showTurnOrderIntro, the final-round re-roll), found ${introBarrierSites.length}`);
const introBarrier = introBarrierSites.map((s) => {
  const fileSrc = s.file === FILE_PATHS.flow ? src.flow : src.orch;
  const marks = functionBoundaries(fileSrc);
  return {
    file: s.file, line: s.line, fn: s.fn,
    rawMsg: resolvedArgRaw(fileSrc, marks, s.line, s.args[0] || ""),
    rawButton: s.args[1] || "",
  };
});

/* ---- paramPrompt (D-33): every CALLER of humanFlip(p,label,allowBack) and
 * fishCast(p,label,allowBack) — the extractor reads what is lexically at the ask() call site
 * INSIDE those two functions (src/ui/flow.js:103/:125), which is the fallback expression
 * `label||"..."`. That fallback is only reachable when a caller omits label — this sweep is what
 * proves whether that ever actually happens, instead of assuming it. Excludes each function's own
 * declaration line (`export async function humanFlip(...)`/`fishCast(...)`), same
 * isDeclarationSite() guard findNamedCallSites already applies to netIntroBarrier. ---- */
const paramPromptSites = findNamedCallSites(src.flow, FILE_PATHS.flow, ["humanFlip", "fishCast"]);
{
  const indep = independentCallCount(src.flow, "humanFlip") + independentCallCount(src.flow, "fishCast");
  if (indep !== paramPromptSites.length) fail(`paramPrompt: structured extraction found ${paramPromptSites.length} humanFlip()/fishCast() call(s) but the independent count found ${indep}`);
}
if (paramPromptSites.length !== 4) fail(`paramPrompt: expected exactly 4 humanFlip()/fishCast() call sites (2 each), found ${paramPromptSites.length}`);
const paramPrompt = paramPromptSites.map((s) => ({
  file: s.file, line: s.line, fn: s.fn, callee: s.name,
  rawLabel: s.args[1] || "", // "" (not present) is meaningfully different from a literal — see hasLabel below
  hasLabel: s.args.length >= 2 && (s.args[1] || "").trim() !== "",
  rawAllowBack: s.args[2] || null,
}));

/* ---- mpError: alert(...) call sites — multiplayer room-join/service errors, orchestrator.js only. ---- */
const mpErrorSites = findNamedCallSites(src.orch, FILE_PATHS.orch, ["alert"]);
{
  const indep = independentCallCount(src.orch, "alert");
  if (indep !== mpErrorSites.length) fail(`mpError: structured extraction found ${mpErrorSites.length} alert() call(s) but the independent count found ${indep}`);
}
// 8 -> 10 (2026-07-31): createRoom and joinRoom each gained a null-db guard whose alert says
// "we never connected", which is a different failure from the capacity line they used to share.
// 10 -> 11 (2026-08-01, NAME-02): the room screen's "Change yer name" makes renameMySeat() a new
// player-triggered write, which can fail on its own — independently of joining — so it carries its
// own line rather than borrowing one that talks about rooms and capacity.
if (mpErrorSites.length !== 11) fail(`mpError: expected exactly 11 alert() call sites in ${FILE_PATHS.orch}, found ${mpErrorSites.length}`);
const mpError = mpErrorSites.map((s) => ({ file: s.file, line: s.line, fn: s.fn, rawMsg: s.args[0] || "" }));

/* ---- battleLine: the live-round-result `rmsg=` assignments in asyncBattle() (orchestrator.js)
 * and asyncBakeoff() (flow.js) — the "battle blow-by-blow" text rendered straight into the
 * scoreboard footer via renderBattle()/onRenderBattle(), never through flash()/EVENT_NARRATION, so
 * no extraction pass above could ever have found it. ---- */
const battleLineOrchRaw = findAssignmentByLHS(src.orch, FILE_PATHS.orch, "\\brmsg");
const battleLineFlowRaw = findAssignmentByLHS(src.flow, FILE_PATHS.flow, "\\brmsg");
{
  const indepOrch = independentAssignCount(src.orch, "rmsg");
  if (indepOrch !== battleLineOrchRaw.length) fail(`battleLine: structured extraction found ${battleLineOrchRaw.length} "rmsg=" assignment(s) in ${FILE_PATHS.orch} but the independent count found ${indepOrch}`);
  const indepFlow = independentAssignCount(src.flow, "rmsg");
  if (indepFlow !== battleLineFlowRaw.length) fail(`battleLine: structured extraction found ${battleLineFlowRaw.length} "rmsg=" assignment(s) in ${FILE_PATHS.flow} but the independent count found ${indepFlow}`);
}
const battleLine = battleLineOrchRaw.concat(battleLineFlowRaw).filter((s) => /^[`"']/.test(s.rawMsg));
// D-52 (Wyatt-approved 2026-07-29): both battle-round-result blocks merged their name-slot-only
// duplicate branches into one shared template — asyncBattle 6->4, asyncBakeoff 4->3.
if (battleLine.length !== 7) fail(`battleLine: expected exactly 7 literal "rmsg=" result lines (4 in asyncBattle, 3 in asyncBakeoff, post-D-52 merge), found ${battleLine.length}`);

/* ---- draftWait: recipe-draft + "waiting"/"choosing" broadcasts — see this section's header
 * comment for why this one is anchor-verified rather than count-cross-checked. ---- */
const DRAFT_WAIT_SITES = [
  { file: FILE_PATHS.orch, anchor: "choosing their recipe" },
  { file: FILE_PATHS.orch, anchor: "Recipe chosen! Waiting for the rest of the crew" },
  { file: FILE_PATHS.flow, anchor: "Waiting for yer mateys" },
  { file: FILE_PATHS.flow, anchor: "is choosing where to sail" },
];
const draftWait = DRAFT_WAIT_SITES.map((site) => {
  const fileSrc = site.file === FILE_PATHS.flow ? src.flow : src.orch;
  const idx = fileSrc.indexOf(site.anchor);
  if (idx === -1) {
    fail(`draftWait anchor "${site.anchor}" not found in ${site.file} — the wording/line moved; update DRAFT_WAIT_SITES`);
    return null;
  }
  const marks = functionBoundaries(fileSrc);
  const lineNo = fileSrc.slice(0, idx).split("\n").length;
  return { file: site.file, line: lineNo, fn: enclosingFunction(marks, lineNo), anchor: site.anchor };
}).filter(Boolean);

/* ---- timer: the shot-clock timer-off/on toggle's own tooltip (a two-branch ternary). ---- */
const timerSites = findAssignmentByLHS(src.panel, FILE_PATHS.panel, "toggleEl\\.title");
if (timerSites.length !== 1) fail(`timer: expected exactly 1 "toggleEl.title=" assignment in ${FILE_PATHS.panel}, found ${timerSites.length}`);

/* ---- lobby: the pass-and-play hand-off screen (message + button) and the online lobby's own
 * "waiting for the crew" seat-list caption. ---- */
const lobbySites = findAssignmentByLHS(src.lobby, FILE_PATHS.lobby, '\\$\\("passOverlayMsg"\\)\\.innerHTML')
  .concat(findAssignmentByLHS(src.lobby, FILE_PATHS.lobby, "btn\\.innerHTML"))
  .concat(findAssignmentByLHS(src.lobby, FILE_PATHS.lobby, '\\$\\("waitMsg"\\)\\.innerHTML'))
  .sort((a, b) => a.line - b.line);
if (lobbySites.length !== 3) fail(`lobby: expected exactly 3 innerHTML assignment sites in ${FILE_PATHS.lobby} (pass-overlay message, pass-overlay button, lobby wait caption), found ${lobbySites.length}`);

/* ---- awards: BADGE_POOL + FALLBACK_BADGE (end-of-voyage honours) — a plain data table, no call
 * site to sweep. Cross-checked against the file's own "byline:" occurrence count (unique to this
 * table — nothing else in util.js uses that key). ---- */
function extractBadgePool(fileSrc) {
  const startMarker = "const BADGE_POOL=[";
  const startIdx = fileSrc.indexOf(startMarker);
  if (startIdx === -1) { fail(`BADGE_POOL declaration not found in ${FILE_PATHS.util}`); return []; }
  const arrStart = startIdx + startMarker.length - 1; // include the leading "["
  const arrText = captureExprUntilSemicolon(fileSrc, arrStart);
  const entries = [];
  const objRe = /\{[^{}]*\}/g;
  let m;
  while ((m = objRe.exec(arrText))) {
    const chunk = m[0];
    const key = /key\s*:\s*"([^"]*)"/.exec(chunk);
    const img = /img\s*:\s*"([^"]*)"/.exec(chunk);
    const name = /name\s*:\s*"([^"]*)"/.exec(chunk);
    const byline = /byline\s*:\s*"([^"]*)"/.exec(chunk);
    if (!key || !name || !byline) { fail(`BADGE_POOL entry missing key/name/byline: ${chunk.slice(0, 60)}...`); continue; }
    const lineNo = fileSrc.slice(0, arrStart + m.index).split("\n").length;
    entries.push({ key: key[1], img: img ? img[1] : null, name: name[1], byline: byline[1], line: lineNo });
  }
  return entries;
}
function extractFallbackBadge(fileSrc) {
  const startMarker = "const FALLBACK_BADGE=";
  const startIdx = fileSrc.indexOf(startMarker);
  if (startIdx === -1) { fail(`FALLBACK_BADGE declaration not found in ${FILE_PATHS.util}`); return null; }
  const objText = captureExprUntilSemicolon(fileSrc, startIdx + startMarker.length);
  const img = /img\s*:\s*"([^"]*)"/.exec(objText);
  const name = /name\s*:\s*"([^"]*)"/.exec(objText);
  const byline = /byline\s*:\s*"([^"]*)"/.exec(objText);
  if (!name || !byline) { fail(`FALLBACK_BADGE missing name/byline`); return null; }
  const lineNo = fileSrc.slice(0, startIdx).split("\n").length;
  return { key: "fallback", img: img ? img[1] : null, name: name[1], byline: byline[1], line: lineNo };
}
const badgePool = extractBadgePool(src.util);
const fallbackBadge = extractFallbackBadge(src.util);
const awards = fallbackBadge ? badgePool.concat([fallbackBadge]) : badgePool;
{
  const indep = (src.util.match(/byline\s*:/g) || []).length;
  if (indep !== awards.length) fail(`awards: structured extraction found ${awards.length} badge(s) but the independent "byline:" count found ${indep} in ${FILE_PATHS.util}`);
}
if (awards.length !== 11) fail(`awards: expected exactly 11 (10 BADGE_POOL entries + FALLBACK_BADGE), found ${awards.length}`);

/* ---- board (15-07 Task 7): src/ui/board.js's own player-facing copy, never previously extracted by
 * ANY pass of this script — the file was not in FILE_PATHS at all. Five sites, each a string a player
 * reads and nobody had ever reviewed:
 *
 *   const banner      showStats()  the very last line of a voyage ("{captain} wins!" / "Nobody finished!")
 *   const statsTable  showStats()  the end-of-voyage table's headings and phrasings
 *   const extras      drawPanels() the surplus-cargo chip tooltip
 *   newChipsHtml x3   drawPanels() the composed prow cargo row, the "Check my recipe" button, "empty hold"
 *
 * All three `newChipsHtml=` assignments are collected, not just the two that read as obvious copy: a
 * collector that quietly skipped the composed row would leave a fourth branch free to appear later
 * with nothing noticing. Each carries its own `// @copy` marker, so the marker sweep below holds them
 * to the same rule as every other site. ---- */
const boardSites = findAssignmentByLHS(src.board, FILE_PATHS.board, "\\bconst banner")
  .concat(findAssignmentByLHS(src.board, FILE_PATHS.board, "\\bconst victoryLine"))
  .concat(findAssignmentByLHS(src.board, FILE_PATHS.board, "\\bconst statsTable"))
  .concat(findAssignmentByLHS(src.board, FILE_PATHS.board, "\\bconst extras"))
  .concat(findAssignmentByLHS(src.board, FILE_PATHS.board, "\\bnewChipsHtml"))
  .sort((a, b) => a.line - b.line);
// Independent cross-check, same convention as battleLine's: count the raw occurrences a second way.
{
  const want = { "const banner=": 1, "const victoryLine=": 1, "const statsTable=": 1, "const extras=": 1, "newChipsHtml=": 3 };
  for (const [needle, n] of Object.entries(want)) {
    const found = src.board.split(needle).length - 1;
    if (found !== n) fail(`board: expected ${n} "${needle}" site(s) in ${FILE_PATHS.board}, found ${found} — a copy site was added or removed; extend boardSites and this count together`);
  }
}
// 6 -> 7 (2026-07-31): the Best Baker sentence moved into this file from src/orchestrator.js.
if (boardSites.length !== 7) fail(`board: expected exactly 7 copy sites in ${FILE_PATHS.board}, found ${boardSites.length}`);
checkScopeCoverage();

// Deterministic ordering: category (alphabetical), then file, then line — same convention the
// table/adhoc/prompts arrays already use.
const misc = []
  .concat(introBarrier.map((s) => Object.assign({ category: "introBarrier" }, s)))
  .concat(paramPrompt.map((s) => Object.assign({ category: "paramPrompt" }, s)))
  .concat(mpError.map((s) => Object.assign({ category: "mpError" }, s)))
  .concat(battleLine.map((s) => Object.assign({ category: "battleLine" }, s)))
  .concat(draftWait.map((s) => Object.assign({ category: "draftWait" }, s)))
  .concat(timerSites.map((s) => Object.assign({ category: "timer" }, s)))
  .concat(lobbySites.map((s) => Object.assign({ category: "lobby" }, s)))
  .concat(boardSites.map((s) => Object.assign({ category: "board" }, s)))
  .sort((a, b) => (a.category === b.category ? (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)) : a.category.localeCompare(b.category)));

/* ================= D-43: roundCfg()'s own hardcoded boolean flags =================
 * A narration branch gated on a config flag that roundCfg() (src/engine/index.js) ALWAYS
 * hardcodes the opposite way can never fire in the shipped game — e.g. the audit page's
 * `table:trade~noBonus` card (cfg.tradeBonus===false) and `table:fish~empty`
 * (cfg.sardine===false), since roundCfg() always returns tradeBonus:true and sardine:true.
 * "Keep the code, badge the card" — this does NOT prune the audit page's own D-21 branch
 * enumeration (rendering every config-gated variant was correct for completeness); it only marks
 * which of those variants the shipped configuration can never actually produce, the same
 * "effectively dead" family D-33/D-34/D-40 already established.
 *
 * Derived by PARSING roundCfg()'s own returned object literal — never a hand-written list — so a
 * flag that later becomes genuinely configurable (a strategies-dependent expression, not a plain
 * `key:true`/`key:false` literal) stops being flagged automatically the moment the source changes,
 * with nobody having to remember to update anything here.
 */
const ENGINE_PATH = "src/engine/index.js";
const engineSrc = readFileSync(join(ROOT, ENGINE_PATH), "utf8");
function extractRoundCfgFlags(fileSrc) {
  const fnMarker = "function roundCfg(";
  const fnIdx = fileSrc.indexOf(fnMarker);
  if (fnIdx === -1) { fail(`roundCfg() not found in ${ENGINE_PATH} — D-43's flag source has moved or been renamed`); return {}; }
  const returnMarker = "return {";
  const retIdx = fileSrc.indexOf(returnMarker, fnIdx);
  if (retIdx === -1) { fail(`roundCfg()'s own "return {...}" not found in ${ENGINE_PATH}`); return {}; }
  const objStart = retIdx + "return ".length; // start at the object literal's own leading "{"
  const objText = captureExprUntilSemicolon(fileSrc, objStart);
  const flags = {};
  // ONLY a pure boolean literal `key:true`/`key:false` counts as "hardcoded" — a computed
  // expression (e.g. `crates` from the np===2 ternary above it, or `strategies` itself) is
  // deliberately excluded: that is already a flag that reads as configurable, not a literal.
  const re = /\b([A-Za-z_$][\w$]*)\s*:\s*(true|false)\b/g;
  let m;
  while ((m = re.exec(objText))) flags[m[1]] = m[2] === "true";
  return flags;
}
const roundCfgFlags = extractRoundCfgFlags(engineSrc);
if (Object.keys(roundCfgFlags).length < 5) fail(`roundCfg() flag parsing found only ${Object.keys(roundCfgFlags).length} boolean literal(s) in ${ENGINE_PATH} — the parser likely broke against a source change`);

/* ================= bind the @copy ids, then apply metadata by id =================
 * Runs here, after every category has been extracted, because the binder needs each file's COMPLETE
 * site list: a marker binds to the next extracted site at or after its own line regardless of which
 * category that site belongs to, so binding one category at a time could hand an ad-hoc marker to a
 * prompt site sitting between them.
 */
const SITE_FILE_SRC = {
  [FILE_PATHS.util]: src.util,
  [FILE_PATHS.flow]: src.flow,
  [FILE_PATHS.orch]: src.orch,
  [FILE_PATHS.panel]: src.panel,
  [FILE_PATHS.lobby]: src.lobby,
  [FILE_PATHS.board]: src.board,
};
// Derived from FILE_PATHS, not hand-maintained alongside it: a file added to FILE_PATHS whose text was
// forgotten here fails with "this script does not read as text", which is a confusing way to be told
// you edited one list and not the other.
for (const [k, rel] of Object.entries(FILE_PATHS)) {
  if (!(rel in SITE_FILE_SRC)) SITE_FILE_SRC[rel] = src[k];
}
const RETIRED_IDS = loadRetiredIds();

{
  const emitted = [...adhocRaw, ...prompts, ...misc];
  // one site, one entry — two entries sharing a file:line would both claim the same marker and read
  // as a duplicate id, so the ambiguity is named here rather than surfacing as a confusing dup
  const seenSite = new Map();
  for (const e of emitted) {
    const k = `${e.file}:${e.line}`;
    if (seenSite.has(k)) fail(`two extracted copy sites share ${k} — one marker cannot address both; split the line so each site can declare its own id`);
    else seenSite.set(k, e);
  }
  const byFile = {};
  for (const e of emitted) (byFile[e.file] = byFile[e.file] || []).push(e);
  const idOwner = new Map();
  for (const [filePath, entries] of Object.entries(byFile)) {
    const fileSrc = SITE_FILE_SRC[filePath];
    if (!fileSrc) { fail(`extracted a copy site in ${filePath}, which this script does not read as text — add it to FILE_PATHS so its @copy markers can be bound`); continue; }
    const bound = bindCopyMarkers(fileSrc, filePath, entries.map((e) => e.line));
    for (const e of entries) {
      const id = bound.get(e.line);
      if (!id) continue; // already failed by name inside bindCopyMarkers
      e.id = id;
      if (idOwner.has(id)) fail(`duplicate @copy id "${id}" — declared at both ${idOwner.get(id)} and ${filePath}:${e.line}; ids must be globally unique`);
      else idOwner.set(id, `${filePath}:${e.line}`);
      if (RETIRED_IDS.has(id)) fail(`@copy id "${id}" at ${filePath}:${e.line} is on the retired-id ledger (${RETIRED_IDS_REL}) — re-issuing it would hand this new site a deleted card's review mark, which is worse than no mark at all`);
    }
  }
}

// metadata by id, and the reciprocal orphan check the old file:line keying could not express
const adhoc = applyMeta(adhocRaw);
for (const key of Object.keys(AD_HOC_META)) {
  if (!adhoc.some((e) => e.id === key)) fail(`AD_HOC_META entry "${key}" has no live copy site declaring that @copy id — the metadata table is stale; either the marker was deleted or the id was renamed`);
}

/* ---- button slots: a button's card id keyed to its option's VALUE, not its label ----
 * The label is exactly what a wording pass rewrites, so a label-derived id would lose every button's
 * review mark on every pass. The option's `value:` expression is the stable half of the same object.
 * Where a value is a static literal AND unique within its own prompt, it becomes the slot; otherwise
 * the ordinal is used and the fallback is COUNTED and PRINTED, so the weaker case stays visible
 * instead of quietly becoming the norm.
 */
function valueSlot(raw) {
  const t = (raw || "").trim();
  if (!t) return null;
  const q = /^["'`]([\s\S]*)["'`]$/.exec(t);
  let v;
  if (q) v = q[1];
  else if (/^-?\d+$/.test(t) || t === "true" || t === "false") v = t;
  else return null; // an identifier or expression (`n`, `i`, `o`, `null`) — live data, not a stable slot
  v = v.toLowerCase().replace(/^-/, "neg").replace(/[^a-z0-9]+/g, "");
  return v || null;
}
// The ordinal fallback is PREFIXED (`opt0`, `opt1`) rather than a bare index, because a bare index
// can collide with a value-derived slot: botTurn's counter-offer prompt has options valued `n` and
// `0`, so the second became slot "0" from its value while the first fell back to ordinal 0 — two
// different buttons, one card id. Caught while authoring the alias map, which is the one place a
// duplicate button id shows up as two review marks landing on the same card.
let buttonSlotFallbacks = 0;
for (const p of prompts) {
  const slots = (p.labels || []).map((l) => valueSlot(l.value));
  const counts = {};
  slots.forEach((s) => { if (s) counts[s] = (counts[s] || 0) + 1; });
  (p.labels || []).forEach((l, i) => {
    const s = slots[i];
    if (s && counts[s] === 1) l.slot = s;
    else { l.slot = `opt${i}`; buttonSlotFallbacks++; }
  });
  // Uniqueness is the whole contract — a duplicate slot means two buttons share one card id, and
  // whichever renders second silently inherits the other's review mark.
  const seen = new Set();
  for (const l of p.labels || []) {
    if (seen.has(l.slot)) {
      fail(`prompt ${p.id} (${p.file}:${p.line}) has two options with slot "${l.slot}" — a duplicate button card id would give two buttons one review mark`);
    }
    seen.add(l.slot);
  }
}

/* ================= self cross-check (independent second pass) ================= */

function independentCount(fileSrc) {
  const kept = fileSrc
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  const m = kept.match(/\b(flash|onFlash)\s*\(/g);
  return m ? m.length : 0;
}
function crossCheck(name, fileSrc, structuredCount) {
  const simple = independentCount(fileSrc);
  if (simple !== structuredCount) {
    fail(`${name}: structured extraction found ${structuredCount} flash()/onFlash() call site(s) but the independent count found ${simple} — named diff, extraction is unreliable`);
  }
  return simple;
}
crossCheck(FILE_PATHS.flow, src.flow, flowSites.length);
crossCheck(FILE_PATHS.orch, src.orch, orchSites.length);
crossCheck(FILE_PATHS.util, src.util, utilSites.length);

function independentPromptCount(fileSrc) {
  const kept = fileSrc.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
  const m = kept.match(/\b(ask|panel)\s*\(/g);
  return m ? m.length : 0;
}
function crossCheckPrompts(name, fileSrc, rawCount) {
  const simple = independentPromptCount(fileSrc);
  if (simple !== rawCount) {
    fail(`${name}: structured extraction found ${rawCount} ask()/panel() call site(s) but the independent count found ${simple} — named diff, extraction is unreliable`);
  }
}
crossCheckPrompts(FILE_PATHS.flow, src.flow, flowPromptResult.rawCount);
crossCheckPrompts(FILE_PATHS.orch, src.orch, orchPromptResult.rawCount);

if (Object.keys(EVENT_NARRATION).length !== table.length) {
  fail(`EVENT_NARRATION has ${Object.keys(EVENT_NARRATION).length} keys but the table array built ${table.length} entries`);
}

/* ================= summary + write ================= */

const tableCount = table.length;
const adhocCount = adhoc.length;
const total = tableCount + adhocCount;
const promptCount = prompts.length;
const buttonCount = prompts.reduce((n, p) => n + p.labels.length, 0);

console.log(`table entries:  ${tableCount}`);
console.log(`ad-hoc entries: ${adhocCount} (${adhoc.filter((a) => a.tableDriven).length} table-driven pass-through, ${adhoc.filter((a) => !a.tableDriven).length} genuine ad-hoc)`);
console.log(`total:          ${total}`);
console.log(`prompt sites:   ${promptCount} (${prompts.filter((p) => p.kind === "ask").length} ask, ${prompts.filter((p) => p.kind === "panel").length} panel)`);
console.log(`button labels:  ${buttonCount} static (+ ${prompts.reduce((n, p) => n + p.dynamicLabelCount, 0)} dynamic, not extracted as copy)`);
console.log(`button slots:   ${buttonCount - buttonSlotFallbacks} keyed to the option's own value, ${buttonSlotFallbacks} fell back to the ordinal`);
console.log(`@copy ids:      ${[...adhoc, ...prompts, ...misc].filter((e) => e.id).length} bound across ${Object.keys(SITE_FILE_SRC).length} source file(s); ${RETIRED_IDS.size} id(s) on the retired ledger`);
console.log(`D-32 misc:      ${misc.length} (introBarrier ${introBarrier.length}, paramPrompt ${paramPrompt.length}, mpError ${mpError.length}, battleLine ${battleLine.length}, draftWait ${draftWait.length}, timer ${timerSites.length}, lobby ${lobbySites.length}, board ${boardSites.length})`);
console.log(`D-32 awards:    ${awards.length} (${badgePool.length} BADGE_POOL + ${fallbackBadge ? 1 : 0} FALLBACK_BADGE)`);
console.log(`D-43 roundCfg:  ${Object.keys(roundCfgFlags).length} hardcoded boolean flag(s) parsed from roundCfg()`);

// the corrected pre-change surface count from 15-RESEARCH.md — plans 15-03/15-04 can only raise
// this (new brokeSailLine/brokeAnchorLine/stormIntroClause call sites), never lower it
if (total < 49) fail(`total ${total} is below the corrected pre-change floor of 49`);

if (failures) {
  console.error(`\n${failures} check(s) FAILED — art-review/narration-inventory.json NOT written.`);
  process.exit(1);
}

const inventory = { table, adhoc, prompts, misc, awards, roundCfgFlags };
writeFileSync(
  join(ROOT, "art-review/narration-inventory.json"),
  JSON.stringify(inventory, null, 2) + "\n",
);
console.log("wrote art-review/narration-inventory.json");
process.exit(0);
