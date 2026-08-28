#!/usr/bin/env node
// scripts/ui_contract_check.js
//
// The future standing SPLIT-03/05/06 bridge-removal gate (Phase 11 Plan 1, RESEARCH.md Q4).
// Mirrors scripts/net_contract_check.js / scripts/state_contract_check.js / scripts/
// module_graph_check.js's structure: shebang, a header naming what is gated and why, one
// PASS/FAIL line per assertion, every assertion run before exit so a single run reports every
// problem, named failures with file:line, self-exclusion of scripts/. Deliberately NO comment
// stripping anywhere a raw substring/line match is used (the same `://` false-negative
// reconfirmation net_contract_check.js's header performs — index.html and src/net/ both carry
// `https://...` string literals).
//
// ============================================================================
// Wired into `npm test` as of 11-07
// ============================================================================
// Assertions 2 and 3 below assert the PP bridge is GONE and the classic <script> region is
// EMPTY — both were false by construction until every one of the ~183 classic functions was
// extracted and the bridge deleted, which did not happen until Wave 7 (11-07-PLAN.md). Wiring
// this into `npm test` any earlier would have made every intervening plan's test run
// permanently red for a reason that had nothing to do with that plan's own changes — exactly the
// "weaken the check until it stops catching anything real" trap net_contract_check.js's own
// header warns against. This script was red-proof drilled first (each of the 4 assertions
// demonstrably fails against a SYNTHETIC violation, run with `--drill`, before the real tree was
// ever checked) and is now wired into `npm test`, immediately after `module_graph_check.js`, now
// that the bridge is actually gone and all 4 assertions are expected to PASS.
//
// Note: `checkClassicRegionEmpty` (assertion 3) relies on
// scripts/lib/js_region_tokenizer.js's `locateClassicScriptRegion` treating "no bare <script>
// tag found at all" as the empty-region terminal state (11-07 also deletes the tag pair itself,
// per D-08) rather than throwing — see that function's own header for the full account.
//
// ============================================================================
// The four assertions (RESEARCH.md Q4)
// ============================================================================
// 1. No src/ui/**/*.js import resolves into src/net/ (D-07, the directional constraint) — raw
//    substring match on `from "..."` / `from '...'` specifiers, no comment-stripping.
// 2. The bridge is gone — no line anywhere under src/ carries the `PP-BRIDGE` tag, and no line
//    anywhere under src/ contains an `Object.assign(globalThis` spread-onto-global-object call.
// 3. No leftover bridge-symbol bare reads — the classic <script> region of index.html (located
//    via the SAME shared tokenizer scripts/lib/js_region_tokenizer.js uses everywhere else in
//    this codebase) contains no non-whitespace code.
// 4. Retained-globals allowlist — the only new non-debug `window.X = ` assignment anywhere under
//    src/ is `window.revealMyRecipe`. The four debug hooks (`__pp_module_ok`/`MODULE_OK_FLAG`,
//    `__pp_boot_count`, `__pp_net_debug`, `__pp_app_state_debug`) are exempt by name — they are
//    documented, permanent observation surfaces, not part of the deleted bridge.
// 5. The D-29 pirate register (added 2026-07-29) — no player-facing string under src/ or in
//    index.html reads the pre-conversion 2nd-person pronouns, plus the `layout` intactness probe
//    that conversion's own hazard demands. See the block below for why this is a STANDING gate.
//
// ============================================================================
// Assertion 5 — why the D-29 register is gated rather than swept (2026-07-29)
// ============================================================================
// D-29 was originally a one-time manual sweep with nothing enforcing it afterwards. Half of it
// silently did not happen: 15 strings under src/ and 17 lines in index.html kept the old register
// for a full phase, and no gate noticed. 15-VERIFICATION.md's Gap 2 is that miss. A one-time sweep
// is not a contract; this assertion makes it one.
//
// The conversion itself is NOT shipped as runtime code. art-review/narration-audit.html's own
// PIRATE_RE/PIRATE_MAP/pirateVoice() applied the substitution LIVE at render, so it is the
// specification — but exporting a pirateVoice() from src/ that nothing calls would ship dead code,
// which D-33/D-34/D-40 spent three decisions stamping out. The source literals are plain, and this
// assertion is what proves they stay converted.
//
// The `layout` probe rides along in the same assertion because it is the hazard that makes this
// conversion dangerous: a bare substring replace of the 3-letter pronoun turns `layout` into
// `layet`, and `layoutWide`, `youIdx`, `stillDockedYou`, `bonusYou` and `outcomeYou` are all in
// the tree. Word-boundary matching rejects every one, and this probe proves it stayed that way.
//
// Every check function below takes an explicit root path (defaulting to the real repo ROOT) so
// `--drill` can re-run the exact same logic against synthetic fixture trees under a temp
// directory, never against the real src/ or index.html.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { locateClassicScriptRegion, classify } from "./lib/js_region_tokenizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { pickTree, treeLine } from "./lib/pick_tree.js";

const REAL_ROOT = path.join(__dirname, "..");

const DEBUG_HOOK_NAMES = ["__pp_module_ok", "__pp_boot_count", "__pp_net_debug", "__pp_app_state_debug"];
const RETAINED_GLOBAL_ALLOWLIST = ["revealMyRecipe", ...DEBUG_HOOK_NAMES];

/* ================= File discovery (never scripts/) ================= */

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

/* ================= Assertion 1: no src/ui/ -> src/net/ import (D-07) ================= */
const IMPORT_RE = /(?:from\s+|import\()\s*["']([^"']+)["']/g;

function checkNoUiToNetImport(root) {
  const failures = [];
  const uiDir = path.join(root, "src", "ui");
  const netDir = path.join(root, "src", "net");
  for (const file of jsFilesRecursive(uiDir)) {
    const rel = path.relative(root, file);
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      IMPORT_RE.lastIndex = 0;
      let m;
      while ((m = IMPORT_RE.exec(line))) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue;
        const resolved = path.normalize(path.join(path.dirname(file), spec));
        if (resolved === netDir || resolved.startsWith(netDir + path.sep) || resolved.startsWith(netDir)) {
          failures.push(`UI-NO-NET: ${rel}:${i + 1} imports "${spec}", which resolves into src/net/ — ui may never import net (D-07)`);
        }
      }
    });
  }
  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 2: the bridge is gone ================= */
function checkBridgeGone(root) {
  const failures = [];
  const srcDir = path.join(root, "src");
  for (const file of jsFilesRecursive(srcDir)) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("PP-BRIDGE")) {
        failures.push(`BRIDGE: ${rel}:${i + 1} still carries the "PP-BRIDGE" tag`);
      }
      if (line.includes("Object.assign(globalThis")) {
        failures.push(`BRIDGE: ${rel}:${i + 1} still spreads onto globalThis ("Object.assign(globalThis")`);
      }
    });
  }
  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 3: classic <script> region is empty ================= */
function checkClassicRegionEmpty(root) {
  const failures = [];
  const indexHtml = path.join(root, "index.html");
  if (!fs.existsSync(indexHtml)) {
    failures.push(`REGION: ${path.relative(root, indexHtml)} does not exist`);
    return { ok: false, failures };
  }
  const html = fs.readFileSync(indexHtml, "utf8");
  let region;
  try {
    region = locateClassicScriptRegion(html);
  } catch (err) {
    failures.push(`REGION: could not locate classic <script> region — ${err.message}`);
    return { ok: false, failures };
  }
  if (region.source.trim().length > 0) {
    const nonBlankLines = region.source.split("\n").filter((l) => l.trim().length > 0).length;
    failures.push(`REGION: classic <script> region is not empty — ${nonBlankLines} non-blank line(s) remain`);
  }
  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 4: retained-globals allowlist ================= */
const WINDOW_ASSIGN_RE = /\bwindow\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;

function checkRetainedGlobalsAllowlist(root) {
  const failures = [];
  const srcDir = path.join(root, "src");
  for (const file of jsFilesRecursive(srcDir)) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      WINDOW_ASSIGN_RE.lastIndex = 0;
      let m;
      while ((m = WINDOW_ASSIGN_RE.exec(line))) {
        const name = m[1];
        // window[MODULE_OK_FLAG] = true is an indirect assignment (bracket notation via an
        // imported constant), not matched by this regex at all — this only ever sees explicit
        // dot-notation `window.NAME =` assignments, which is exactly what the "new global"
        // surface this assertion polices looks like.
        if (!RETAINED_GLOBAL_ALLOWLIST.includes(name)) {
          failures.push(`RETAINED-GLOBAL: ${rel}:${i + 1} assigns "window.${name}" — not on the retained-globals allowlist (${RETAINED_GLOBAL_ALLOWLIST.join(", ")})`);
        }
      }
    });
  }
  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 5: the D-29 pirate register (standing) ================= */
// IMPORTED, not re-declared. This assertion and the audit page's own pirateVoice() were expressing
// the SAME word list two different ways — a substitution map here, a detector there — which is one
// spec in two places, and this file's own header had to point at the page to say where the spec
// lived. Both now come from art-review/narration-core.js, the single declaration site: PIRATE_RE /
// PIRATE_MAP do the substitution, PRONOUN_RE is the detector. Case-insensitive, because
// pirateVoice() is case-preserving, so `You` and `Your` are equally in scope.
//
// The core is REVIEW TOOLING and importing it here is safe in the one direction that matters: a
// gate may read the review tool's spec, but nothing under src/ or in index.html may import the core
// (narration_audit_check.js asserts that in both directions), so no player-facing code depends on it.
const { PRONOUN_RE } = await import("../art-review/narration-core.js");

// ---------------------------------------------------------------------------
// EXCLUSIONS — explicit and individually justified. NEVER widen this list to make a run go green;
// that is the "weaken the check until it stops catching anything real" trap this file's own header
// warns about. Every entry is anchored on CONTENT, never on a line number, so a line shift makes
// the gate go loud rather than silently letting a new site through (the drift mechanism that broke
// scripts/extract_narration_lines.js's AD_HOC_META twice).
// ---------------------------------------------------------------------------
const REGISTER_SKIP_FILES = [
  // comments only, and the file must keep an EMPTY diff — it is the determinism fixture corpus's
  // single source of truth (docs/DETERMINISM-RERECORD.md). Touching it invalidates all 31 seeds.
  path.join("src", "engine", "index.js"),
  // cookbook prose — recipe descriptions and cooking-method text ("melt-in-your-mouth shortbread",
  // "run your thumb around the inside rim"). A diegetic object with its own register: the recipe
  // card the captain is HOLDING, not the game's narrator speaking.
  // >>> RULED 2026-07-30 (G16, Wyatt). He has now decided: recipe prose is OUT-OF-CHARACTER CHROME
  // and stays plain English — the same rule REGISTER_CHROME_EXCEPTIONS below encodes. This was a
  // pending copy judgment; it is now a decision, so the note records the ruling rather than the
  // deferral. The file-level skip stays exactly as it was; only its justification changed.
  path.join("src", "ui", "recipe.js"),
];

// Whole-line content anchors: the line is excluded wherever it appears in the tree.
const REGISTER_LINE_ANCHORS = [
  // src/orchestrator.js — a block-comment CONTINUATION line, so it does not start with a comment
  // marker and the leading-comment filter cannot see it. D-29 excludes comments.
  "ONLINE_SETUP.md",
  // src/ui/flow.js — a TRAILING comment on a line of real code, likewise invisible to the
  // leading-comment filter. Also a comment.
  "entering the trade winds",
  // G16 (2026-07-30): the credits paragraph ("overly enthusiastic noodle") USED TO LIVE HERE, where
  // it excused that line ANYWHERE in the tree alongside two unrelated comment anchors. It has moved
  // into REGISTER_CHROME_EXCEPTIONS below as kind:"notice", scoped to index.html and freshness-
  // checked — a strictly TIGHTER gate, and it files his personal thank-yous under a named rule
  // instead of a bag of leftovers. Do not move it back.
];

// src/ui/util.js's `sidebet` builder uses `you` as a LOCAL VARIABLE NAME (D-08's viewer flag), not
// as copy. These are the only four places it appears as an identifier; each is a read, none is
// player-facing text. Scoped to that one file so the fragments can never excuse a real string
// somewhere else, and anchored on the exact code shape so a reformat goes loud.
// FIX-21 (2026-08-01) reformatted the `?(you?...` / `:(you?...` ternaries onto their own lines (to
// give each new nobrk-wrapped signed-coin parenthetical its own line) — the `you` read now sits on
// a line with no trailing backtick, so the anchors below were re-shaped to match, per this file's
// own rule: a reformat must re-anchor, not silently pass on a stale fragment.
const REGISTER_IDENT_FILE = path.join("src", "ui", "util.js");
const REGISTER_IDENT_FRAGMENTS = ["const you=isLocalTo(", "?(you", ":(you", "txt:you"];

// ---------------------------------------------------------------------------
// OUT-OF-CHARACTER CHROME (F1 2026-07-29 + G16 2026-07-30, both Wyatt-approved;
// .planning/phases/15-narration-audit-fixes/15-PLAYTEST-NOTES.md).
//
// THE GENERAL RULE, which is what his rulings actually say:
//
//   **D-29's pirate register applies to text the GAME SPEAKS.** Text that is not the game speaking
//   — a label identifying which row is yours, a legal/privacy notice, the credits, the recipe card
//   the captain is holding — is OUT-OF-CHARACTER CHROME and stays plain English.
//
// "You" does two different jobs in this game, and D-29's one-time sweep could not tell them apart:
//   ADDRESS      — speaking TO the player inside a sentence: "ye pay 1🌕 and sail", "yer turn!".
//                  ye/yer is CORRECT here. ~50 sites. None of them are excused by this list.
//   CHROME       — the game is not speaking at all. Two sub-kinds are on file:
//     kind:"label"  — pointing AT a seat/row/field to say "this one is the reader". No verb, not a
//                     sentence. `name — ye` is not pirate, it is a grammar error: `ye` stands in
//                     for a person, so `Wyatt — ye` reads "Wyatt — thou" rather than "Wyatt —
//                     that's the one that's you". F1, three sites.
//     kind:"notice" — the page addressing the reader as a HUMAN rather than a captain: the
//                     playtesting/privacy notice, the credits. G16. Wyatt on the privacy line:
//                     *"the whole thing is written in normal english not pirate, so the 'ye' feels
//                     weird and out of place."*
//   (The recipe card is the same rule at file scope — see REGISTER_SKIP_FILES above.)
//
// Every entry is listed individually, SCOPED TO ITS FILE so a fragment can never excuse a spoken
// string somewhere else, and ANCHORED ON CONTENT so a line shift goes loud.
// checkChromeExceptionsFresh() below FAILS on an anchor that no longer matches anything: an
// exclusion that excuses nothing is cover, not an exclusion. NEVER add an entry to make a run go
// green — if a new line trips this gate, decide whether the game is speaking, and say so here.
// ---------------------------------------------------------------------------
const REGISTER_CHROME_EXCEPTIONS = [
  {
    kind: "label",
    rel: path.join("src", "ui", "lobby.js"),
    anchor: `if(s.id)label=me?"you":"";`,
    why: "renderSeatList's seat suffix — the LABEL that marks which seat is the reader's. UI-06 specifies this exact rendering (`{name} — you`). F1.",
  },
  {
    kind: "label",
    rel: path.join("src", "ui", "util.js"),
    anchor: `— that's you!`,
    why: "buildPlayerRows' player-row tooltip — a LABEL identifying the reader's own row, not a sentence the game speaks. F1.",
  },
  {
    kind: "label",
    rel: "index.html",
    anchor: `placeholder="Player 1 (you)"`,
    why: "the pass-and-play name field's placeholder — a LABEL identifying which input belongs to the reader. F1.",
  },
  {
    kind: "notice",
    rel: "index.html",
    anchor: `nothing beyond the name you confirm after picking how to play is collected`,
    why: "the playtesting/privacy NOTICE. Wyatt, 2026-07-30: \"the whole thing is written in normal english not pirate, so the 'ye' feels weird and out of place.\" The surrounding paragraph is plain English throughout — one pirate pronoun inside it is a register mismatch, not pirate voice. G16. Reworded in Phase 22 (22-01, Task 2): the captain-name field it pointed at moved off the welcome screen into the #nameModal that opens after a mode card is picked (D-01), so \"the name you type above\" no longer describes where the name is entered.",
  },
  {
    kind: "notice",
    rel: "index.html",
    anchor: `overly enthusiastic noodle`,
    why: "the credits / acknowledgements paragraph — Wyatt's own authorial prose about real people (Luca, Amelia, Nick Lesko, Luis Zanforlin, his parents, Xavaar, Juju), not the game addressing a player. Converting it would put pirate voice in his personal thank-yous. He ruled LEAVE it. MOVED HERE from REGISTER_LINE_ANCHORS by G16: it is now scoped to this one file and freshness-checked, a strictly tighter exclusion than the tree-wide anchor it replaces.",
  },
];

// An exclusion that no longer matches anything is permanent cover for whatever drifts into its
// place, so a stale anchor is a FAILURE rather than a no-op. Entries whose file is absent are
// skipped: a synthetic --drill fixture tree contains only the fragments a given case needs, so
// freshness is meaningless there (same convention as LAYOUT_WIDE_EXPECTED above).
function checkChromeExceptionsFresh(root) {
  const failures = [];
  for (const e of REGISTER_CHROME_EXCEPTIONS) {
    const full = path.join(root, e.rel);
    if (!fs.existsSync(full)) continue;
    if (!fs.readFileSync(full, "utf8").includes(e.anchor)) {
      failures.push(`D-29-CHROME-STALE: the ${e.kind}-kind chrome exception for ${e.rel} anchored on ${JSON.stringify(e.anchor)} matches nothing in that file — either the site moved (re-anchor it) or the site is gone (DELETE the entry). Reason on file: ${e.why}`);
    }
  }
  return failures;
}

// A leading-comment line, in either JS (`//`) or CSS/JSDoc (`/*`, `*`) form. Kept as a cheap
// second filter, but it is NO LONGER what separates prose from speech — see maskToSpeech below.
const isLeadingComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

/* ONLY WHAT A PLAYER CAN ACTUALLY READ, AND THIS USED TO BE A LINE-WISE GUESS.
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   MEASURED 2026-08-26 against the promoted tree: this scan reported 67 player-facing strings in
   the pre-conversion register. SIXTY-SEVEN. Classified with this repo's own tokenizer, 59 were
   COMMENT ONLY, 1 was code only, and of the 7 touching a string, every single one was a false
   positive — six were `hd.you` / `sh.you`, a BOOLEAN PROPERTY, in template literals whose actual
   words already read "yer" and "ye've"; the seventh was inside an HTML comment. The true count of
   player-facing strings in the wrong register was ZERO.

   WHY IT WAS WRONG. `isLeadingComment` only skips a line that STARTS with `//`, `/*` or `*`. This
   codebase indents block-comment continuation lines with plain spaces, so every line after the
   first of a long WHY-comment read as code. Those comments are the graveyard (CLAUDE.md rule 10)
   and many of them QUOTE WYATT DIRECTLY.

   WHAT THAT NEARLY COST. The handoff called this "THE HIGHEST-VALUE SMALL JOB — the pirate voice,
   in the live game" and sized it at ~22 strings. Acting on the list would have rewritten 59 code
   comments — including his own words — into pirate speak: destroying the graveyard, corrupting the
   record, and changing nothing a player can see. A gate that is confidently wrong is worse than no
   gate, because it generates work.

   So the pronoun detector now runs over SPEECH ONLY, region-classified, never line-guessed:
     - .js  -> string literals only. Interpolation expressions inside a template are CODE to the
               tokenizer, so `${hd.you ? "yer" : "their"}` contributes only its quoted words.
     - .html-> the markup text, with HTML comments and CSS block comments blanked. HTML text IS
               speech, so it is kept rather than discarded.
   Masking preserves length and newlines so every reported line number stays true. */
function maskToSpeech(rel, src) {
  const blank = (str, a, b) => str.slice(0, a) + str.slice(a, b).replace(/[^\n]/g, " ") + str.slice(b);
  if (rel.endsWith(".html")) {
    let out = src;
    for (const re of [/<!--[\s\S]*?-->/g, /\/\*[\s\S]*?\*\//g]) {
      out = out.replace(re, (m) => m.replace(/[^\n]/g, " "));
    }
    return out;
  }
  let out = src;
  for (const seg of classify(src)) {
    if (seg.type !== "string") out = blank(out, seg.start, seg.end);
  }
  return out;
}

function scanRegisterFile(rel, content) {
  const failures = [];
  maskToSpeech(rel, content).split("\n").forEach((line, i) => {
    if (!PRONOUN_RE.test(line)) return;
    if (isLeadingComment(line)) return;
    const raw = content.split("\n")[i];
    if (REGISTER_LINE_ANCHORS.some((a) => raw.includes(a))) return;
    if (rel === REGISTER_IDENT_FILE && REGISTER_IDENT_FRAGMENTS.some((f) => raw.includes(f))) return;
    // out-of-character chrome (F1 labels, G16 notices) — scoped per file, so a chrome fragment can
    // never excuse a spoken string in a different file, and never excuses any OTHER line in its own
    // file either
    if (REGISTER_CHROME_EXCEPTIONS.some((e) => e.rel === rel && raw.includes(e.anchor))) return;
    failures.push(`D-29-REGISTER: ${rel}:${i + 1} — a player-facing string still reads the pre-conversion 2nd-person register; convert it to ye/yer (art-review/narration-audit.html's PIRATE_MAP is the spec)`);
  });
  return failures;
}

// The `layout` landmine probe. Two parts, deliberately different in kind:
//   - the corruption marker (`layet`) is checked wherever it can appear — a bare substring replace
//     of the pronoun is the only thing that produces it, so any hit is proof of exactly that bug.
//   - the `layoutWide` counts are pinned per file. If a future change legitimately adds or removes
//     a usage, UPDATE THE EXPECTED COUNT — do not delete the probe.
const LAYOUT_WIDE_EXPECTED = [
  // 4 -> 5 (P6, Wyatt 2026-08-01): #btnMute moved out of #controlsRow to a direct #layout child
  // so the page grid can place it — below the captains box when stacked, and back inline beside the
  // clock in the wide layout. That wide-layout override is the 5th usage. Deliberate, not drift.
  //
  // 5 -> 4 (MUTE-01, Wyatt 2026-08-02: "the mute button is still misaligned"): that 5th usage is
  // GONE. Keying the button's placement on the sidebar-layout class was the bug — the class answers
  // "does the sidebar fit a row of ingredient chips", not "does the controls row fit one button",
  // and at 1000x700 the two disagree. #btnMute is back inside #controlsRow, where its cqw-based
  // styling always assumed it lived, and flex-wrap answers the fit question directly. What remains
  // is the three genuine wide-layout rules plus one mention in a comment.
  { rel: "index.html", count: 4 },
  { rel: path.join("src", "ui", "board.js"), count: 1 },
];

function checkPirateRegister(root) {
  const failures = [];
  const skip = new Set(REGISTER_SKIP_FILES);
  const targets = [];

  for (const file of jsFilesRecursive(path.join(root, "src"))) {
    const rel = path.relative(root, file);
    if (skip.has(rel)) continue;
    targets.push([rel, file]);
  }
  const indexHtml = path.join(root, "index.html");
  if (fs.existsSync(indexHtml)) targets.push(["index.html", indexHtml]);

  for (const [rel, full] of targets) {
    const content = fs.readFileSync(full, "utf8");
    failures.push(...scanRegisterFile(rel, content));
    // corruption marker — checked on the SAME set of files, comments included (a `layet` in a
    // comment is still evidence the bare replace ran)
    content.split("\n").forEach((line, i) => {
      if (line.includes("layet")) {
        failures.push(`LAYOUT-CORRUPTION: ${rel}:${i + 1} contains "layet" — a bare substring replace of the 2nd-person pronoun corrupted the word "layout"`);
      }
    });
  }

  // the chrome exceptions must still match something (F1 labels, G16 notices) — see
  // checkChromeExceptionsFresh
  failures.push(...checkChromeExceptionsFresh(root));

  for (const { rel, count } of LAYOUT_WIDE_EXPECTED) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue; // absent in a synthetic drill fixture; nothing to pin
    const actual = (fs.readFileSync(full, "utf8").match(/layoutWide/g) || []).length;
    if (actual !== count) {
      failures.push(`LAYOUT-WIDE-COUNT: ${rel} has ${actual} "layoutWide" occurrence(s), expected ${count} — if this change was intentional, update LAYOUT_WIDE_EXPECTED in scripts/ui_contract_check.js; if it was not, the word-boundary rule was violated`);
    }
  }

  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 6: CO-REACHABILITY — a reason must be reachable in the state it explains
 *
 * "Is this string right?" has four independent answers, and this repo only ever asked two:
 *   1 PROVENANCE            does the shipped text match what Wyatt approved?     (the copy gate)
 *   2 STRUCTURAL REACH      can this string ever render at all?                  (the audit page's badges)
 *   3 CO-REACHABILITY       does it render in the STATE IT DESCRIBES?            <-- this assertion
 *   4 DELIVERY              does it reach the INTENDED VIEWER?                   (assertion 7)
 *
 * Dimension 3 is why a string can be provably present, provably reachable and byte-identical to its
 * approval — and still never do its job. The live instance (F11, 2026-07-29 two-tab playtest):
 * humanAct() assigned its helper text across an if/else-if chain whose two conditions were
 * INDEPENDENT (is an enemy adjacent? / is anyone holding cargo?). Wyatt's approved reason for the
 * greyed Trade button sat in the `else` arm, so it was unreachable whenever an attack target happened
 * to be adjacent — the greyed Trade button rendered with ATTACK's helper text beneath it while Attack
 * was enabled.
 *
 * Two halves, both static — no DOM needed, which is this repo's convention for a *_check.js gate:
 *   6a  INDEPENDENT-CONDITION SUPPRESSION. For each explanation variable (assigned a string, then
 *       passed as ask()'s 4th argument), examine the if/else-if chain that assigns it and flag the
 *       chain when its arms test DISJOINT sets of identifiers, so two can hold at once while only the
 *       first assigns. A chain testing the SAME variable against different values is a genuine ladder
 *       and is NOT flagged — that is the negative control.
 *   6b  DISABLED WITHOUT A REACHABLE REASON. Every option carrying `disabled:<expr>` must have some
 *       reason string reachable in the state where `<expr>` is true.
 * ==========================================================================*/

// ask()'s 4th argument is the helper text under the buttons. A call may span lines, so the scan is
// over the whole file text rather than line by line.
const ASK_CALL_RE = /\bask\s*\(([^;]*?)\)\s*;/gs;

/** Identifiers a condition expression tests, ignoring property names, literals and keywords. */
function conditionIdents(expr) {
  const KEYWORDS = new Set(["true", "false", "null", "undefined", "length", "filter", "some", "every", "map", "includes", "Boolean", "String", "Number", "Math", "typeof", "await", "return"]);
  const out = new Set();
  // drop property accesses (`.length`, `.ing`) so `a.length` and `b.length` do not look related
  for (const m of String(expr).replace(/\.[A-Za-z_$][A-Za-z0-9_$]*/g, "").matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    if (!KEYWORDS.has(m[0])) out.add(m[0]);
  }
  return out;
}

/** The `sub`-style explanation variables a file passes to ask() as its 4th argument. */
function explanationVars(content) {
  const names = new Set();
  for (const m of content.matchAll(ASK_CALL_RE)) {
    // split the argument list at top level (depth 0) so a nested call's commas do not confuse it
    const args = [];
    let depth = 0, cur = "", inStr = null;
    for (const ch of m[1]) {
      if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; cur += ch; continue; }
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) depth--;
      if (ch === "," && depth === 0) { args.push(cur); cur = ""; continue; }
      cur += ch;
    }
    args.push(cur);
    const fourth = (args[3] || "").trim();
    const bare = fourth.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/);
    if (bare) names.add(bare[1]);
  }
  return [...names];
}

function checkCoReachableExplanations(root) {
  const failures = [];
  const files = jsFilesRecursive(path.join(root, "src"));
  let chainsChecked = 0, disabledChecked = 0, varsFound = 0;

  for (const full of files) {
    const rel = path.relative(root, full);
    const content = fs.readFileSync(full, "utf8");
    const lines = content.split("\n");

    /* ---- 6a: an if/else-if chain assigning an explanation variable ---- */
    for (const name of explanationVars(content)) {
      varsFound++;
      // collect the arms assigning this variable, and whether each is an `else if`
      const arms = [];
      const armRe = new RegExp(`^\\s*(\\}?\\s*else\\s+)?if\\s*\\((.+?)\\)\\s*${name}\\s*=(?!=)`);
      lines.forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return;
        const m = armRe.exec(line);
        if (m) arms.push({ line: i + 1, isElse: !!m[1], cond: m[2] });
      });
      // a chain is an `if` followed by one or more `else if`s
      const chain = arms.filter((a) => a.isElse);
      if (!chain.length) continue;
      chainsChecked++;
      const first = arms.find((a) => !a.isElse);
      if (!first) continue;
      for (const arm of chain) {
        const a = conditionIdents(first.cond), b = conditionIdents(arm.cond);
        const shared = [...a].filter((x) => b.has(x));
        if (shared.length === 0) {
          failures.push(
            `${rel}:${arm.line} — the explanation variable \`${name}\` is assigned across an if/else-if chain whose conditions are INDEPENDENT ` +
            `(\`${first.cond.trim()}\` at :${first.line} tests {${[...a].join(", ")}}, \`${arm.cond.trim()}\` tests {${[...b].join(", ")}} — no shared identifier). ` +
            `Both can hold at once, so the later arm's reason is unreachable whenever the earlier one fires. ` +
            `FIX: give independent conditions independent \`if\`s, compose both reasons where both apply, and let a GREYED control's reason outrank an ENABLED control's informational tip.`
          );
        }
      }
    }

    /* ---- 6b: every `disabled:` option must have a reachable reason ----
     * A reason counts as reachable when the SAME guard flag the `disabled:` flag tests also decides
     * an explanation string somewhere in the file. Two shapes both count, because both ship today:
     *   an `if` arm      —  if(targets.length&&!canAfford)sub=`Yer too poor...`
     *   a ternary        —  const offerSub=canOfferCoins?null:`Ye don't have any coin...`
     * The flag name is matched WITHOUT a leading \b, because the character before `!` is usually
     * `&` or `(` and \b never matches between two non-word characters — a subtlety that made this
     * check report every greyed button as unexplained on its first run. */
    const explVars = new Set(explanationVars(content));
    const nonComment = lines.filter((l) => !/^\s*\/\//.test(l));
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      for (const m of line.matchAll(/disabled\s*:\s*!([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
        disabledChecked++;
        const flagName = m[1];                    // e.g. "canAfford"
        const guard = `!${flagName}`;
        const flagRe = new RegExp(`\\b${flagName}\\b`);
        const assignsExplanation = (l) => {
          // an assignment to a variable this file passes to ask() as helper text …
          for (const v of explVars) if (new RegExp(`\\b${v}\\s*=(?!=)`).test(l)) return true;
          // … or a `<name>Sub`/`sub` declaration whose other ternary branch is null, which is the
          // established shape for "there is nothing to explain in this state" …
          if (/\b(?:sub|[A-Za-z_$][A-Za-z0-9_$]*Sub)\s*=(?!=)/.test(l)) return true;
          // … or the reason passed INLINE as ask()'s 4th argument: `canCounter?null:` + a string.
          // That ships today (the hail prompt) and is a perfectly good reason — it is simply never
          // stored in a variable, so an assignment-only test would report it missing.
          return new RegExp(`\\b${flagName}\\b\\s*\\?[^?]*:[^?]*[\`"']`).test(l) || new RegExp(`!\\s*${flagName}\\b\\s*\\?[^?]*[\`"']`).test(l);
        };
        const hasReason = nonComment.some((l) => flagRe.test(l) && assignsExplanation(l) && /[`"']/.test(l));
        if (!hasReason) {
          // the label of the option that actually carries this `disabled:` flag — the NEAREST
          // preceding `label:` on the line, not the first one, since a line can hold several options
          const before = line.slice(0, m.index);
          const labels = [...before.matchAll(/label\s*:\s*(`[^`]*`|"[^"]*"|'[^']*')/g)];
          const label = labels.length ? labels[labels.length - 1][1] : "(label not parsed)";
          failures.push(
            `${rel}:${i + 1} — option ${label} is greyed out by \`${guard}\` but no reason string anywhere in this file is decided by \`${flagName}\`, ` +
            `so a player sees a dead button with no explanation. FIX: assign the helper text under \`if(...${guard}...)\` — in its own \`if\`, never an \`else if\`, so an independent condition cannot suppress it.`
          );
        }
      }
    });
  }
  return { ok: failures.length === 0, failures, stats: { varsFound, chainsChecked, disabledChecked } };
}

/* ================= Assertion 7: DELIVERY — a broadcast reaches everyone, so its content must not
 *                                branch on the local viewer
 *
 * Dimension 4 of the four (see assertion 6's header). The rule, stated generally because that is
 * what makes this a gate rather than three patches: A SINGLE BROADCAST REACHES EVERY CLIENT, so
 * content that branches on the LOCAL viewer is always a defect. One message cannot express a
 * per-viewer difference, however correctly it was authored.
 *
 * The live instance (F7, 2026-07-29 playtest): ask() sent
 * `onBroadcast(seat===appState.mySeat?msg:spectatorLine)`. ask() runs on the HOST, so `mySeat` is
 * the host's seat, and whichever branch the host took went to the whole table. Measured on a guest:
 * the host's raw prompts arrived verbatim, and of 2516 recorded narration lines ZERO contained "is
 * deciding" — the spectator line never reached any client. Two sibling sites had the same shape.
 *
 * The correct shape already ships: broadcast neutral content plus per-seat `variants`, and let each
 * client select. netNarrate forwards variants to pickNarrVariant on the host and through netSetNarr
 * to watchNarr on every guest.
 *
 * DELIVERY IS THE SHARED ROOT OF FOUR RECORDED DECISIONS. D-35 (sail wording), D-55 (highlight DOM
 * contract), D-57 (guest fade) and now F7 are all one host path and one guest path for a single
 * concept, drifting independently. D-56 concluded "host/guest drift is ONE path, not a pattern" —
 * that answered a narrower question (does guest-side code author its own text?) and was right about
 * it. This catches a different failure: not who writes the string, but WHO RECEIVES IT.
 *
 * TWO PRECISION REQUIREMENTS, both load-bearing:
 *  - EXAMINE THE CONTENT ARGUMENT ONLY. netNarrate's own definition references the local seat inside
 *    pickNarrVariant(...) — that is the SELECTION, which is the correct mechanism. Flagging it would
 *    make the gate unsatisfiable, and an unsatisfiable gate gets loosened. The mechanism's definition
 *    sites are exempt BY NAME, with the reason written next to the exemption.
 *  - FAIL WITH THE FIX IN THE MESSAGE, naming the neutral-plus-variants shape, so the next person
 *    hits a signpost rather than a puzzle.
 * ==========================================================================*/
const BROADCAST_SINKS = ["onBroadcast", "netNarrate", "netSetNarr", "netBroadcast"];
// A reference to the LOCAL viewer's seat. `mySeat` is the ambient one; the three helpers each
// resolve "is this seat the local one?" and are equally wrong in a broadcast's content.
const LOCAL_VIEWER_RE = /\bmySeat\b|\bseatLocal\s*\(|\bdecisionIsLocal\s*\(|\bisLocalTo\s*\(/;
// The MECHANISM's own definitions. These reference the local seat precisely in order to SELECT a
// variant from a payload that is already neutral — the correct thing, and the thing this rule exists
// to route everything through. Exempt by function NAME rather than by line, so the exemption cannot
// silently migrate onto a different site when the file moves.
const DELIVERY_MECHANISM_DEFINITIONS = [
  "netNarrate",   // selects the local seat's variant for the host's own panel, then broadcasts neutral
  "netBroadcast", // broadcasts only; its signature carries variants through untouched
  "watchNarr",    // the guest side of the same selection
  "pickNarrVariant",
];

/** Split a call's argument list at top level, so a nested call's commas do not confuse it. */
function topLevelArgs(inner) {
  const args = [];
  let depth = 0, cur = "", inStr = null;
  for (const ch of inner) {
    if (inStr) { cur += ch; if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; cur += ch; continue; }
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { args.push(cur); cur = ""; continue; }
    cur += ch;
  }
  args.push(cur);
  return args;
}

/** Extract a call's argument text starting at the open paren index, balanced. */
function callArgs(text, openIdx) {
  let depth = 0, inStr = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return text.slice(openIdx + 1, i); }
  }
  return null;
}

function checkBroadcastDelivery(root) {
  const failures = [];
  const files = jsFilesRecursive(path.join(root, "src"));
  let callsChecked = 0, exempted = 0;

  for (const full of files) {
    const rel = path.relative(root, full);
    const content = fs.readFileSync(full, "utf8");
    // the byte offset each line starts at, so a match can be reported as file:line
    const lineStarts = [0];
    for (let i = 0; i < content.length; i++) if (content[i] === "\n") lineStarts.push(i + 1);
    const lineOf = (idx) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };

    // the byte ranges belonging to a mechanism definition, so its own selection call is exempt
    const exemptRanges = [];
    for (const name of DELIVERY_MECHANISM_DEFINITIONS) {
      const re = new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\(`, "g");
      let dm;
      while ((dm = re.exec(content))) {
        // to the end of that line for a one-liner, or the end of the statement — a generous window,
        // deliberately: the point is to exempt the MECHANISM, not to police its internals
        const nl = content.indexOf("\n", dm.index);
        exemptRanges.push([dm.index, nl < 0 ? content.length : nl]);
      }
    }
    const isExempt = (idx) => exemptRanges.some(([a, b]) => idx >= a && idx <= b);

    for (const sink of BROADCAST_SINKS) {
      const re = new RegExp(`\\b${sink}\\s*\\(`, "g");
      let m;
      while ((m = re.exec(content))) {
        const openIdx = m.index + m[0].length - 1;
        // skip the sink's own definition and the mechanism sites
        if (isExempt(m.index)) { exempted++; continue; }
        const lineIdx = lineOf(m.index);
        const lineText = content.split("\n")[lineIdx - 1] || "";
        if (/^\s*\/\//.test(lineText)) continue;
        const inner = callArgs(content, openIdx);
        if (inner == null) continue;
        const args = topLevelArgs(inner);
        callsChecked++;
        // THE CONTENT ARGUMENT ONLY. For netSetNarr the content is the 3rd argument (db, room, html);
        // for every other sink it is the 1st. The variants argument is deliberately NOT examined —
        // a per-seat variant list is the mechanism, and flagging it would make the rule unsatisfiable.
        const contentArg = sink === "netSetNarr" ? (args[2] || "") : (args[0] || "");
        if (LOCAL_VIEWER_RE.test(contentArg)) {
          failures.push(
            `${rel}:${lineIdx} — ${sink}()'s CONTENT argument branches on the local viewer: \`${contentArg.trim().slice(0, 110)}\`. ` +
            `A single broadcast reaches EVERY client, so one message cannot express a per-viewer difference — whichever branch the host takes is what the whole table receives. ` +
            `FIX: broadcast the neutral (spectator) content and pass the per-seat difference as variants — ${sink}(spectatorLine, [{ seat, html: actorLine }]) — and let each client select via pickNarrVariant/watchNarr.`
          );
        }
      }
    }
  }
  return { ok: failures.length === 0, failures, stats: { callsChecked, exempted } };
}

/* ================= Runner (real tree) ================= */
/* ================= Assertion 8: the storm rain draws no unseeded and no GAME randomness ================= */
// G19 (Wyatt-approved 2026-07-30). buildStormLayers() used to jitter four rain layers with unseeded
// Math.random() and cache them per browser, so two players in the same room saw permanently
// different weather (measured: 0.818s/200.5px vs 0.534s/264.7px). It now derives every layer from
// mulberry32(game.seed) — a PRIVATE stream seeded from a number every client already shares.
//
// TWO WAYS THIS CAN REGRESS, and both are failures here:
//   Math.random( — back to per-client weather, the bug itself.
//   .r()         — FAR worse: appState.game.r() is the seeded GAME stream, and drawing four extra
//                  numbers from it would advance that stream, desyncing every client in the room
//                  AND every one of the 31 determinism fixtures. This is the one to catch.
//
// SCOPED BY CONTENT ANCHOR to those two functions, never file-wide or tree-wide. Math.random() is
// legitimate elsewhere under src/ui/ (session id, room code, pop jitter), so a broad ban would be
// wrong and would be widened away the first time it fired — which is how a gate stops catching
// anything real. Anchored, it can stay strict forever.
// UI-07: once the End of Voyage summary is up, the narration/action box must be collapsed rather
// than left as a large empty panel between the board and the awards.
//
// Static, and honest about why: reaching a real end-of-voyage needs a full game, and the one route
// a headless harness has to it — driving the UI — is exactly the route that made this expensive to
// confirm by hand. So this pins the CONTRACT at its single chokepoint: showStats() is the only
// function that reveals #statsWrap, so it is the only place the collapse can correctly live.
//
// Anchored, and it REFUSES rather than skips when it cannot find its subject — checkStormRainSeeded
// above is the pattern WR-06 named as the right one, and this copies it deliberately. A check that
// cannot locate what it is checking must go loud, never quietly pass (15-LEARNINGS #2).
export function checkEovPanelCollapsed(root) {
  const failures = [];
  const rel = path.join("src", "ui", "board.js");
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return { ok: true, failures, stats: { scanned: 0 } };
  const src = fs.readFileSync(full, "utf8");

  const i = src.indexOf("export function showStats");
  if (i < 0) {
    failures.push(`EOV-PANEL-ANCHOR: could not locate showStats() in ${rel} — re-anchor this assertion; do NOT delete it. It protects UI-07: the narration box must not be left on screen, empty, underneath the End of Voyage summary.`);
    return { ok: false, failures, stats: { scanned: 1 } };
  }
  const end = src.indexOf("\nexport ", i + 10);
  const region = src.slice(i, end < 0 ? src.length : end);
  // strip comments — this region explains the rule in prose and would otherwise satisfy its own gate
  const live = region.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  // presence first: prove the region is real code before asserting anything about its contents
  if (!/statsWrap/.test(live)) {
    failures.push(`EOV-PANEL-REGION: showStats() in ${rel} no longer references statsWrap — the region located is not the one this assertion describes; re-anchor it.`);
    return { ok: false, failures, stats: { scanned: 1 } };
  }
  if (!/actionPanel/.test(live)) {
    failures.push(`EOV-PANEL: showStats() in ${rel} does not touch #actionPanel — UI-07 requires the narration box be collapsed once the summary appears, and showStats is the only function that reveals #statsWrap.`);
  } else if (!/display\s*=\s*["']none["']/.test(live)) {
    failures.push(`EOV-PANEL: showStats() in ${rel} references #actionPanel but never sets display:none on it — UI-07 needs it hidden, not merely emptied (an emptied panel still occupies its border and padding).`);
  }
  return { ok: failures.length === 0, failures, stats: { scanned: 1 } };
}

// boot() must call fbInit() BEFORE the solo-resume early return, so appState.db is never null while
// showHome() has already put Host and Join on screen enabled. When it was the other way round,
// clicking Host reached createRoom() with a null handle and fired the CAPACITY line — the same
// sentence a genuine capacity failure uses — so a local setup condition and a real server problem
// were indistinguishable.
//
// Ordering, not presence, is the whole assertion: both calls existed before the fix; they were
// simply in the wrong order. So this compares indices rather than testing for a substring.
//
// It also pins the constraint the fix had to preserve: the `!fbOk` branch must NOT return before
// the solo check, because an offline refresh mid-solo-game still has to resume.
export function checkFbInitBeforeSoloResume(root) {
  const failures = [];
  const rel = path.join("src", "orchestrator.js");
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return { ok: true, failures, stats: { scanned: 0 } };
  const src = fs.readFileSync(full, "utf8");
  const live = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  // Scope to boot()'s own body FIRST. A naive indexOf("fbInit()") over the whole file matches the
  // `export function fbInit(){` DEFINITION (~line 705), which sits before resumeSoloGame's call
  // regardless of the bug — so the ordering check passed against the real pre-fix file on its first
  // red-proof. That is precisely the "luck dressed as proof" failure 15-LEARNINGS #2 records; the
  // gate was corrected rather than the red-proof being accepted.
  const bootAt = live.indexOf("export function boot(");
  if (bootAt < 0) {
    failures.push(`BOOT-FBINIT-ANCHOR: could not locate boot() in ${rel} — re-anchor this assertion; do NOT delete it.`);
    return { ok: false, failures, stats: { scanned: 1 } };
  }
  const bootEnd = live.indexOf("\nexport ", bootAt + 10);
  const body = live.slice(bootAt, bootEnd < 0 ? live.length : bootEnd);

  const fb = body.indexOf("fbInit()");
  const resume = body.indexOf("resumeSoloGame(solo)");
  // presence before absence: if either anchor is gone the ordering claim is meaningless, so refuse
  if (fb < 0 || resume < 0) {
    failures.push(`BOOT-FBINIT-ANCHOR: could not locate ${fb < 0 ? "the fbInit() CALL" : "resumeSoloGame(solo)"} inside boot() in ${rel} — re-anchor this assertion; do NOT delete it. It protects against Host being clickable with no database handle, which makes the game blame the server for a local condition.`);
    return { ok: false, failures, stats: { scanned: 1 } };
  }
  if (fb > resume) {
    failures.push(`BOOT-FBINIT-ORDER: ${rel} calls fbInit() AFTER the solo-resume early return. A player resuming an interrupted solo game is then left with appState.db === null while the welcome screen shows Host and Join enabled; clicking Host fires the capacity alert, which is untrue and blocks the renderer.`);
  }
  // the offline-solo-resume property: the !fbOk branch must not return before the solo check
  const gate = body.indexOf("$(\"fbnote\").style.display");
  if (gate > -1 && gate < resume) {
    const between = body.slice(gate, resume);
    if (/\breturn\b/.test(between)) {
      failures.push(`BOOT-FBINIT-OFFLINE: ${rel} returns from the !fbOk branch before reaching the solo resume — an offline refresh mid-solo-game would stop resuming. Mark the UI, then fall through; return after the solo check.`);
    }
  }
  return { ok: failures.length === 0, failures, stats: { scanned: 1 } };
}

// "We never connected" and "the server is busy" are different failures and must stay different
// sentences. Both entry points to multiplayer — createRoom and joinRoom — must check for a null
// database handle BEFORE attempting the call, because a missing handle is a precondition, not an
// exception, and routing it into the catch is how both ended up sharing the capacity line.
export function checkNoConnectionDistinctFromCapacity(root) {
  const failures = [];
  const rel = path.join("src", "orchestrator.js");
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return { ok: true, failures, stats: { scanned: 0 } };
  const src = fs.readFileSync(full, "utf8");
  const live = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  // presence first: the shared constant must exist at all, or the two guards below mean nothing
  if (!/const\s+NO_CONNECTION_MSG\s*=/.test(live)) {
    failures.push(`MPERR-NOCONN: NO_CONNECTION_MSG is not defined in ${rel} — the "we never connected" case has no sentence of its own and would fall back to the capacity line, which blames the server for a local condition.`);
    return { ok: false, failures, stats: { scanned: 1 } };
  }
  // ...and it must be ONE constant, not a phrase copied to each site
  const defs = (live.match(/const\s+NO_CONNECTION_MSG\s*=/g) || []).length;
  if (defs !== 1) failures.push(`MPERR-NOCONN: ${defs} definitions of NO_CONNECTION_MSG in ${rel}, expected exactly 1 — one cause, one sentence (the same rule D-60 applies to the capacity line).`);

  for (const fn of ["createRoom", "joinRoom"]) {
    const at = live.indexOf(`export async function ${fn}(`);
    if (at < 0) { failures.push(`MPERR-NOCONN-ANCHOR: ${fn}() not found in ${rel} — re-anchor this assertion rather than deleting it.`); continue; }
    const end = live.indexOf("\nexport ", at + 10);
    const body = live.slice(at, end < 0 ? live.length : end);
    if (!/if\(!appState\.db\)\{alert\(NO_CONNECTION_MSG\);return;\}/.test(body)) {
      failures.push(`MPERR-NOCONN: ${fn}() does not guard on a null appState.db before using it. Without that guard the call throws and the catch tells the player the server is at capacity — which is untrue when the real cause is being offline, an ad-blocker, or a script that failed to load.`);
    }
  }
  return { ok: failures.length === 0, failures, stats: { scanned: 1 } };
}

export function checkStormRainSeeded(root) {
  const failures = [];
  const rel = path.join("src", "ui", "board.js");
  const full = path.join(root, rel);
  // a synthetic --drill tree contains only the fixtures a given case needs; an absent file there is
  // meaningless, the same convention LAYOUT_WIDE_EXPECTED and the chrome list already use
  if (!fs.existsSync(full)) return { ok: true, failures, stats: { scanned: 0 } };
  const src = fs.readFileSync(full, "utf8");

  const i = src.indexOf("export function stormLayerSpecs");
  const j = src.indexOf("export function buildStormLayers");
  if (i < 0 || j < 0) {
    // NOT a silent skip: if the anchors are gone the region cannot be located, and a check that
    // cannot find its subject must go loud rather than pass.
    failures.push(`RAIN-SEED-ANCHOR: could not locate stormLayerSpecs()/buildStormLayers() in ${rel} — re-anchor this assertion; do NOT delete it. The rule it protects (no unseeded and no game-rng randomness in the rain) is what keeps every client in a room seeing the same weather and all 31 determinism fixtures intact.`);
    return { ok: false, failures, stats: { scanned: 1 } };
  }
  const lo = Math.min(i, j), hi = Math.max(i, j);
  const after = src.indexOf("\nexport ", hi + 10);
  const region = src.slice(lo, after < 0 ? src.length : after);
  // comments in this region deliberately NAME both banned calls to explain the rule, so strip
  // full-line comments before testing — otherwise the documentation trips its own gate
  const live = region.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

  if (/Math\.random\(/.test(live)) {
    failures.push(`RAIN-UNSEEDED: the storm-rain region of ${rel} calls Math.random() — every browser would get permanently different weather again, which is exactly what G19 fixed. Seed it from appState.game.seed via mulberry32.`);
  }
  if (/\.r\(\)/.test(live)) {
    failures.push(`RAIN-GAME-RNG: the storm-rain region of ${rel} draws from the GAME rng (.r()) — this advances the seeded game stream, desyncing every client in the room AND all 31 determinism fixtures. Use a PRIVATE mulberry32(seed) instead; it consumes nothing.`);
  }
  if (!/mulberry32\(/.test(live)) {
    failures.push(`RAIN-NO-RNG: the storm-rain region of ${rel} no longer calls mulberry32() — if the seeding was removed, the rain is either constant or unseeded; neither is what Wyatt approved.`);
  }
  return { ok: failures.length === 0, failures, stats: { scanned: 1 } };
}

// FIX-21 (18-03): a trailing signed-coin parenthetical — "(+1🌕)", "(−5🌕)" — must never orphan
// across a line wrap. .nobrk (index.html's `white-space:nowrap` class) already existed and already
// worked at 2 of 6 sites when this gate was written; it was never applied everywhere because each
// narration site hand-builds its own string, and the same defect class has now recurred THREE
// times (RESEARCH pitfall 3, .planning/todos/pending/copy-shipped-vs-approved-gate.md). This gate
// is the permanent fix for the recurrence, not just the fifth-and-sixth sites: it is ANCHORED to
// the specific narration sites (never a file-wide sweep — button labels in src/ui/flow.js and
// prose in code comments legitimately contain a coin-close-paren shape with no narration nearby),
// and it REFUSES rather than skips when an anchor cannot be found, per checkStormRainSeeded's own
// pattern and the copy-gate todo's non-negotiable rule.
//
// Each entry below names ONE narration-building region by a literal, content-based anchor (never a
// line number), the exact coin parenthetical(s) that region must produce wrapped, and the expected
// count. A region is bounded from its anchor to the next `\n  },\n` (the 2-space-indented closing
// brace every EVENT_NARRATION/showTurnOrderIntro-style entry in this codebase ends with) so the
// check reads real source text, never a rendered/evaluated string.
const COIN_PARENTHETICAL_SITES = [
  {
    name: "aground (util.js) — half-coins-lost repairs clause",
    rel: path.join("src", "ui", "util.js"),
    anchor: "const lossTag=lost!=null?",
    wraps: ['<span class="nobrk">(−${lost}🌕)</span>'],
  },
  {
    name: "sidebet won, backed with coin — you/other",
    rel: path.join("src", "ui", "util.js"),
    anchor: "double yer bet ",
    wraps: ['double yer bet <span class="nobrk">(+${e.delta}🌕)</span>'],
  },
  {
    name: "sidebet won, backed with coin — third person",
    rel: path.join("src", "ui", "util.js"),
    anchor: "double their bet ",
    wraps: ['double their bet <span class="nobrk">(+${e.delta}🌕)</span>'],
  },
  {
    name: "sidebet won, free call (no coin backed) — you",
    rel: path.join("src", "ui", "util.js"),
    anchor: "— ye called it! <span",
    wraps: ['— ye called it! <span class="nobrk">(+${e.delta}🌕)</span>'],
  },
  {
    name: "sidebet won, free call (no coin backed) — third person",
    rel: path.join("src", "ui", "util.js"),
    anchor: "🔭 ${pn(e.p)} called it! <span",
    wraps: ['🔭 ${pn(e.p)} called it! <span class="nobrk">(+${e.delta}🌕)</span>'],
  },
  {
    name: "sidebet lost, backed with coin — you",
    rel: path.join("src", "ui", "util.js"),
    anchor: "💰 ${pn(e.p)}, ye backed the wrong ship <span",
    wraps: ['💰 ${pn(e.p)}, ye backed the wrong ship <span class="nobrk">(−${e.amt}🌕)</span>'],
  },
  {
    name: "sidebet lost, backed with coin — third person",
    rel: path.join("src", "ui", "util.js"),
    anchor: "💰 ${pn(e.p)} backed the wrong ship <span",
    wraps: ['💰 ${pn(e.p)} backed the wrong ship <span class="nobrk">(−${e.amt}🌕)</span>'],
  },
  {
    name: "battleflee — flee cost, all three viewer branches",
    rel: path.join("src", "ui", "util.js"),
    anchor: "battleflee:(e,at,cellPx,viewerSeat)=>{",
    wraps: [
      '${pn(e.d)} slips away! <span class="nobrk">(−1🌕)</span>',
      'ye slip away! <span class="nobrk">(−1🌕)</span>',
    ],
    // both the aAddr and the else branch produce the IDENTICAL third-person "slips away!" clause
    // (one addressed to the attacker, one neutral) — count, don't just test presence, so a
    // regression that drops ONE of the two identical-text branches cannot hide behind the other.
    counts: { '${pn(e.d)} slips away! <span class="nobrk">(−1🌕)</span>': 2 },
  },
  {
    name: "fish — catch amount, both the neutral and the addressed const",
    rel: path.join("src", "ui", "util.js"),
    anchor: "fish:(e,at,cellPx,viewerSeat)=>{",
    wraps: [],
    counts: {
      'sugarfish! <span class="nobrk">(+2🌕)</span>': 2,
      'candycrab <span class="nobrk">(+1🌕)</span>': 2,
    },
  },
  {
    name: "turn-order draw — waiting captains' consolation coin",
    rel: path.join("src", "ui", "flow.js"),
    anchor: "const rest=order.slice(1).map(",
    // P7 (Wyatt, 2026-08-01, second pass): the span used to cover the parenthetical ALONE, which
    // kept "(+2🌕)" intact but let it detach from the captain it belongs to across a line break —
    // "…Davy Scones" / "(+2🌕), Dough Hook…". The expectation is now the STRONGER form: the name
    // and its amount inside one span, as a single readable unit. Tightened deliberately, not
    // relaxed — this still fails if the wrapper disappears entirely.
    wraps: ['<span class="nobrk">${pn(i)} (+${k+1}🌕)</span>'],
  },
];

export function checkCoinParentheticalNobrk(root) {
  const failures = [];
  const bySrc = {};
  let scanned = 0;
  for (const site of COIN_PARENTHETICAL_SITES) {
    const full = path.join(root, site.rel);
    if (!fs.existsSync(full)) continue; // synthetic --drill fixture trees carry only what a case needs
    if (!bySrc[site.rel]) bySrc[site.rel] = fs.readFileSync(full, "utf8");
    const src = bySrc[site.rel];

    const at = src.indexOf(site.anchor);
    if (at < 0) {
      // NOT a silent skip: an anchor this gate cannot locate must go loud, never quietly pass —
      // the exact failure mode narration_audit_check.js's own assertion 8 already has (D-21).
      failures.push(`COIN-NOBRK-ANCHOR: could not locate "${site.anchor}" (${site.name}) in ${site.rel} — re-anchor this assertion; do NOT delete it. It protects FIX-21: a trailing signed-coin parenthetical must never be free to orphan across a line wrap.`);
      continue;
    }
    scanned++;
    const end = src.indexOf("\n  },\n", at);
    const region = src.slice(at, end < 0 ? Math.min(src.length, at + 800) : end);

    for (const w of site.wraps || []) {
      if (!region.includes(w)) {
        failures.push(`COIN-NOBRK: ${site.rel} — ${site.name} no longer wraps its coin parenthetical in a nobrk span (expected to find ${JSON.stringify(w)} near "${site.anchor}"). A trailing "(+N🌕)"/"(−N🌕)" outside a nobrk span can orphan across a line wrap.`);
      }
    }
    for (const [w, expected] of Object.entries(site.counts || {})) {
      const got = region.split(w).length - 1;
      if (got !== expected) {
        failures.push(`COIN-NOBRK-COUNT: ${site.rel} — ${site.name} expected ${expected} occurrence(s) of ${JSON.stringify(w)} near "${site.anchor}", found ${got}. Every viewer branch that produces this text must wrap it, not just one of them.`);
      }
    }
  }
  return { ok: failures.length === 0, failures, stats: { scanned } };
}

/* ---- HTML comments balanced — the fault that RENDERED A COMMENT AS PAGE TEXT (2026-08-28) ----
   The A-10 shot-clock removal deleted the line carrying a comment's `<!--` opener and left nine
   lines of its tail rendering inside #controlsRow, with a stray `-->` at the end. 33 gates and a
   passing DOM probe missed it; a screenshot caught it (rule 19). This scan is the cheapest fence:
   walk every `<!--`/`-->` in index.html and fail on nesting, a stray close, or an unclosed open —
   any of which means comment prose is (or is about to be) on a player's screen. */
function checkHtmlCommentsBalanced(root) {
  const failures = [];
  const file = path.join(root, "index.html");
  if (!fs.existsSync(file)) return { ok: false, failures: ["index.html missing"], stats: {} };
  const s = fs.readFileSync(file, "utf8");
  let depth = 0, line = 1, openLine = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n") line++;
    if (s.startsWith("<!--", i)) {
      depth++;
      if (depth === 1) openLine = line;
      else failures.push(`HTML-COMMENT-NESTED: index.html line ${line} opens a comment inside the one opened at line ${openLine} — HTML comments do not nest; the inner text will render.`);
      i += 3;
    } else if (s.startsWith("-->", i)) {
      depth--;
      if (depth < 0) { failures.push(`HTML-COMMENT-STRAY-CLOSE: index.html line ${line} closes a comment nothing opened — the prose above it is rendering as page text (this exact fault shipped from the working tree on 2026-08-28).`); depth = 0; }
      i += 2;
    }
  }
  if (depth > 0) failures.push(`HTML-COMMENT-UNCLOSED: the comment opened at index.html line ${openLine} never closes — everything after it is swallowed to the end of the file.`);
  /* The same removal's OTHER casualty, same day: a deleted CSS rule whose line ended `} }` took a
     media query's closing brace with it, leaving `@media (prefers-reduced-motion: reduce) {` open
     — every rule below it then applied only under reduced motion and the whole game laid out as a
     300px stack. So each <style> block's braces must balance too (comments stripped first). */
  for (const m of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, "");
    let d = 0, minD = 0;
    for (const ch of css) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < minD) minD = d; } }
    if (d > 0) failures.push(`CSS-BRACE-UNCLOSED: a <style> block in index.html ends ${d} level(s) deep — an unclosed {, probably an @media whose closing brace was deleted with a rule inside it; every rule after it is being swallowed (this shipped from the working tree on 2026-08-28).`);
    if (d < 0 || minD < 0) failures.push(`CSS-BRACE-STRAY: a <style> block in index.html closes more braces than it opens — a rule's opener was deleted without its closer.`);
  }
  return { ok: failures.length === 0, failures, stats: {} };
}

function runAll(root, { quiet = false } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const results = [];

  const a1 = checkNoUiToNetImport(root);
  log(`${a1.ok ? "PASS" : "FAIL"} no src/ui/**/*.js import resolves into src/net/ (D-07)`);
  results.push({ name: "no-ui-to-net-import", ...a1 });

  const a2 = checkBridgeGone(root);
  log(`${a2.ok ? "PASS" : "FAIL"} the PP bridge is gone (no PP-BRIDGE tag, no Object.assign(globalThis) under src/)`);
  results.push({ name: "bridge-gone", ...a2 });

  const a3 = checkClassicRegionEmpty(root);
  log(`${a3.ok ? "PASS" : "FAIL"} the classic <script> region in index.html is empty`);
  results.push({ name: "classic-region-empty", ...a3 });

  const a4 = checkRetainedGlobalsAllowlist(root);
  log(`${a4.ok ? "PASS" : "FAIL"} retained-globals allowlist — only window.revealMyRecipe (+ the 4 debug hooks) permitted under src/`);
  results.push({ name: "retained-globals-allowlist", ...a4 });

  const a5 = checkPirateRegister(root);
  log(`${a5.ok ? "PASS" : "FAIL"} the D-29 pirate register holds across src/ and index.html (+ the layout intactness probe)`);
  results.push({ name: "pirate-register", ...a5 });

  const a6 = checkCoReachableExplanations(root);
  log(`${a6.ok ? "PASS" : "FAIL"} co-reachability — a greyed control's reason is reachable in the state it explains (D-41/F11) [${a6.stats.varsFound} explanation var(s), ${a6.stats.chainsChecked} chain(s), ${a6.stats.disabledChecked} disabled option(s)]`);
  results.push({ name: "co-reachable-explanations", ...a6 });

  const a7 = checkBroadcastDelivery(root);
  log(`${a7.ok ? "PASS" : "FAIL"} delivery — no broadcast's content branches on the local viewer (D-10/F7) [${a7.stats.callsChecked} broadcast call(s) checked, ${a7.stats.exempted} mechanism site(s) exempt]`);
  results.push({ name: "broadcast-delivery", ...a7 });

  const a8 = checkStormRainSeeded(root);
  log(`${a8.ok ? "PASS" : "FAIL"} the storm rain is seeded from the game — no unseeded Math.random(), no GAME .r() (G19)`);
  results.push({ name: "storm-rain-seeded", ...a8 });

  const a9 = checkEovPanelCollapsed(root);
  log(`${a9.ok ? "PASS" : "FAIL"} the narration box is collapsed once the End of Voyage summary appears (UI-07)`);
  results.push({ name: "eov-panel-collapsed", ...a9 });

  const a11 = checkNoConnectionDistinctFromCapacity(root);
  log(`${a11.ok ? "PASS" : "FAIL"} "we never connected" is a different sentence from "the server is busy"`);
  results.push({ name: "noconnection-distinct", ...a11 });

  const a10 = checkFbInitBeforeSoloResume(root);
  log(`${a10.ok ? "PASS" : "FAIL"} boot() initialises Firebase BEFORE the solo-resume early return`);
  results.push({ name: "fbinit-before-solo-resume", ...a10 });

  const a12 = checkCoinParentheticalNobrk(root);
  log(`${a12.ok ? "PASS" : "FAIL"} coin-parenthetical-nobrk — every trailing signed-coin parenthetical is wrapped in a nobrk span (FIX-21) [${a12.stats.scanned} of ${COIN_PARENTHETICAL_SITES.length} site(s) scanned]`);
  results.push({ name: "coin-parenthetical-nobrk", ...a12 });

  const a13 = checkHtmlCommentsBalanced(root);
  log(`${a13.ok ? "PASS" : "FAIL"} html-comments-balanced — every <!-- in index.html has its --> (an unbalanced pair renders comment prose on screen)`);
  results.push({ name: "html-comments-balanced", ...a13 });

  return results;
}

/* ================= --drill: prove each assertion CAN fail, against synthetic fixtures ================= */
// Builds a disposable fixture tree under os.tmpdir(), one synthetic violation at a time, runs the
// SAME check function against it, and asserts the result is FAIL. Never touches the real src/ or
// index.html. Exits 1 if any assertion fails to demonstrate a FAIL against its own synthetic
// violation (that would mean the check itself is broken, not that the real tree is clean).
function drill() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ui-contract-drill-"));
  let allDrillsOk = true;

  function fixture(relPath, content) {
    const full = path.join(tmpRoot, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  function resetFixture() {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
  }

  console.log(`Red-proof drill — synthetic fixtures under ${tmpRoot}\n`);

  // --- Drill 1: ui imports net ---
  resetFixture();
  fixture("src/ui/bad.js", `import { netSetFlip } from "../net/index.js";\nexport function bad(){ return netSetFlip; }\n`);
  fixture("src/net/index.js", `export function netSetFlip(){}\n`);
  {
    const r = checkNoUiToNetImport(tmpRoot);
    const drillOk = !r.ok;
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 1/4 (ui-imports-net) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // --- Drill 2: bridge still present ---
  resetFixture();
  fixture("src/main.js", `window.PP = {}; // PP-BRIDGE\nObject.assign(globalThis, {});\n`);
  {
    const r = checkBridgeGone(tmpRoot);
    const drillOk = !r.ok;
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 2/4 (bridge-still-present) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // --- Drill 3: classic script region non-empty ---
  resetFixture();
  fixture("index.html", `<html><body>\n<script>\nfunction stillHere(){return 1;}\n</script>\n</body></html>\n`);
  {
    const r = checkClassicRegionEmpty(tmpRoot);
    const drillOk = !r.ok;
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 3/4 (classic-region-non-empty) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // --- Drill 4: unauthorized retained global ---
  resetFixture();
  fixture("src/main.js", `window.someRandomGlobal = 42;\n`);
  {
    const r = checkRetainedGlobalsAllowlist(tmpRoot);
    const drillOk = !r.ok;
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 4/4 (unauthorized-retained-global) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // --- Drill 5: the D-29 register. Three distinct failure modes, so three synthetic violations,
  //     plus one NEGATIVE fixture proving the exclusions do not simply swallow everything (an
  //     assertion that can only ever pass is not a gate either).
  {
    // 5a: an unconverted player-facing string under src/
    resetFixture();
    fixture("src/ui/prompt.js", "export const msg = `Cast your line — flip!`;\n");
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = !r.ok;
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5a/5 (unconverted-register-in-src) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }

    // 5b: an unconverted player-facing line in index.html
    resetFixture();
    fixture("index.html", `<html><body>\n<label>Your captain name</label>\n</body></html>\n`);
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = !r.ok;
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5b/5 (unconverted-register-in-index-html) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }

    // 5c: the layout landmine detonated — a bare substring replace produced "layet"
    resetFixture();
    fixture("src/ui/board.js", "const layetWide = 1; // was layoutWide before a bare replace\n");
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = !r.ok && r.failures.some((f) => f.startsWith("LAYOUT-CORRUPTION"));
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5c/5 (layout-corruption) — expected FAIL naming LAYOUT-CORRUPTION, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }

    // 5d: the layoutWide count drifted (index.html present, but with 3 occurrences instead of 4)
    resetFixture();
    fixture("index.html", `<html><body>\n<!-- layoutWide layoutWide layoutWide -->\n</body></html>\n`);
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = !r.ok && r.failures.some((f) => f.startsWith("LAYOUT-WIDE-COUNT"));
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5d/5 (layoutWide-count-drift) — expected FAIL naming LAYOUT-WIDE-COUNT, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }

    // 5e: NEGATIVE control — a converted string, a leading comment carrying the old register, an
    //     anchored comment, the sidebet identifier and the three LABEL-class sites (F1) must ALL
    //     pass. This proves 5a-5d fail for the right reason rather than the check being
    //     unconditionally red, and doubles as the label exception's positive control: a fixture
    //     carrying the real anchors passes, including checkChromeExceptionsFresh.
    resetFixture();
    fixture("src/ui/prompt.js", "export const msg = `Cast yer line — flip!`;\n// this comment mentions your pantry and is excluded because D-29 excludes comments\n");
    fixture("src/ui/flow.js", "if (onRim(c)) continue; // entering the trade winds ends your move\n");
    // the sidebet builder's real code shape, fragment-for-fragment — an unfaithful fixture here
    // would let a broken exclusion pass this control unnoticed. The tooltip LABEL line is the third
    // label-kind anchor, and it must be present or checkChromeExceptionsFresh reports it stale.
    fixture("src/ui/util.js", [
      "    const you=isLocalTo(e.p,viewerSeat);",
      "    if(e.won)return {cls:\"trade\",txt:e.amt",
      "      ?(you",
      "        ?`ye called it! (+${e.delta})`",
      "        :`called it! (+${e.delta})`)",
      "      :(you",
      "        ?`ye called it!`",
      "        :`called it!`)};",
      "    return {cls:\"trade\",txt:you",
      "      ?`ye backed the wrong ship`:`backed the wrong ship`};",
      "    const who=s.id ? (i===appState.mySeat?`${escHtml(s.name)} — that's you!`:escHtml(s.name))",
      "",
    ].join("\n"));
    fixture("src/ui/recipe.js", "export const d = 'melt-in-your-mouth shortbread';\n");
    fixture("src/ui/lobby.js", `    if(s.id)label=me?"you":"";\n    else label="🤖 bot";\n`);
    // G16: the fixture now also carries the two kind:"notice" anchors — the privacy line and the
    // credits paragraph. Both are real player-visible index.html text using the plain pronoun, so
    // they are the notice kind's positive control AND satisfy checkChromeExceptionsFresh.
    fixture("index.html", `<html><body>\n<!-- layoutWide layoutWide layoutWide layoutWide -->\n<input id="ppName0" placeholder="Player 1 (you)">\n<div>Anonymized move data is recorded to help improve the game — nothing beyond the name you confirm after picking how to play is collected.</div>\n<div>and to Juju, our overly enthusiastic noodle, for keeping your feet warm through every late night</div>\n</body></html>\n`);
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = r.ok;
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5e/8 (negative control — exclusions hold, incl. all three F1 LABEL anchors and both G16 NOTICE anchors) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }

    // 5f: the CHROME exception must NOT have widened into its file. A genuinely SPOKEN string in
    //     src/ui/lobby.js using the plain pronoun still has to fail — this is the control that
    //     proves the exception excuses three anchored lines and not a whole file.
    resetFixture();
    fixture("src/ui/lobby.js", `    if(s.id)label=me?"you":"";\n    $("waitMsg").textContent="Waiting for your mateys to join the voyage…";\n`);
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = !r.ok && r.failures.some((f) => f.startsWith("D-29-REGISTER") && f.includes("lobby.js"));
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5f/8 (CHROME exception has not widened — a SPOKEN string in the same file still fails) — expected FAIL naming D-29-REGISTER, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }

    // 5g: a STALE chrome anchor fails. The file is present but the anchored site is gone — e.g. a
    //     later pass "fixed" the label back to ye and left the exception sitting there as cover.
    resetFixture();
    fixture("src/ui/lobby.js", `    if(s.id)label=me?"matey":"";\n`);
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = !r.ok && r.failures.some((f) => f.startsWith("D-29-CHROME-STALE") && f.includes("lobby.js"));
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5g/8 (STALE CHROME anchor — an exclusion that excuses nothing is cover, not an exclusion) — expected FAIL naming D-29-CHROME-STALE, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }

    // 5h: the CHROME exception is scoped PER FILE — the lobby's anchor must not excuse the same text
    //     appearing in a different file, which is how a per-file list differs from a global one.
    resetFixture();
    fixture("src/ui/panel.js", `    const label=me?"you":"";\n`);
    {
      const r = checkPirateRegister(tmpRoot);
      const drillOk = !r.ok && r.failures.some((f) => f.startsWith("D-29-REGISTER") && f.includes("panel.js"));
      console.log(`${drillOk ? "PASS" : "FAIL"} drill 5h/8 (CHROME exception is scoped per file — the lobby anchor does not excuse panel.js) — expected FAIL naming D-29-REGISTER, got ${r.ok ? "PASS" : "FAIL"}`);
      for (const f of r.failures) console.log(`    ${f}`);
      if (!drillOk) allDrillsOk = false;
    }
  }

  /* ---- Assertion 6: CO-REACHABILITY, red-proofed against the REAL broken code ----
   * The fixture is `git show ab98e04:src/ui/flow.js` — the genuine tree where the greyed Trade
   * reason sat in an `else` arm — not a synthetic approximation. A gate written loosely enough to
   * pass that tree therefore fails its own drill, which is the whole point of using real code here.
   */
  {
    resetFixture();
    const realBroken = execFileSync("git", ["show", "ab98e04:src/ui/flow.js"], { cwd: REAL_ROOT, maxBuffer: 1e8 }).toString();
    fixture("src/ui/flow.js", realBroken);
    const r = checkCoReachableExplanations(tmpRoot);
    const namesSuppression = r.failures.some((f) => /explanation variable `sub`.*INDEPENDENT/s.test(f));
    const ok = !r.ok && namesSuppression;
    console.log(`${ok ? "PASS" : "FAIL"} drill 6a (co-reachability, against the REAL ab98e04 code) — expected FAIL naming the suppressed reason, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!ok) allDrillsOk = false;
  }
  {
    // 6b: a greyed option with NO reason anywhere is a dead button with no explanation
    resetFixture();
    fixture("src/ui/flow.js", [
      "export async function f(p){",
      "  const canAfford=p.coins>=2;",
      "  const opts=[{label:\"Attack\",value:\"attack\",disabled:!canAfford}];",
      "  let sub=null;",
      "  const v=await ask(`pick`,opts,null,sub);",
      "  return v;",
      "}",
    ].join("\n"));
    const r = checkCoReachableExplanations(tmpRoot);
    const ok = !r.ok && r.failures.some((f) => /no reason string anywhere in this file is decided by `canAfford`/.test(f));
    console.log(`${ok ? "PASS" : "FAIL"} drill 6b (a greyed option with no reason) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!ok) allDrillsOk = false;
  }
  {
    // NEGATIVE CONTROL 1 — an EXCLUSIVE LADDER. A chain whose arms test the SAME variable against
    // different values is genuinely exclusive and must NOT be flagged. Without this control the
    // check would flag every switch-like chain in the codebase and would then get loosened.
    resetFixture();
    fixture("src/ui/flow.js", [
      "export async function f(p){",
      "  const reason=p.reason;",
      "  let sub=null;",
      "  if(reason===\"justDocked\")sub=`ye just docked`;",
      "  else if(reason===\"home\")sub=`ye be home`;",
      "  else if(reason===\"dock\")sub=`already parked`;",
      "  const v=await ask(`pick`,[],null,sub);",
      "  return v;",
      "}",
    ].join("\n"));
    const r = checkCoReachableExplanations(tmpRoot);
    console.log(`${r.ok ? "PASS" : "FAIL"} drill 6c (negative control — an exclusive value ladder on ONE variable is not flagged) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!r.ok) allDrillsOk = false;
  }
  {
    // NEGATIVE CONTROL 2 — the FIXED tree must pass. This is what proves the fix and the gate agree,
    // rather than the gate being satisfiable only by deleting the helper text altogether.
    resetFixture();
    fixture("src/ui/flow.js", fs.readFileSync(path.join(REAL_ROOT, "src/ui/flow.js"), "utf8"));
    const r = checkCoReachableExplanations(tmpRoot);
    console.log(`${r.ok ? "PASS" : "FAIL"} drill 6d (negative control — the FIXED src/ui/flow.js passes) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!r.ok) allDrillsOk = false;
  }

  /* ---- Assertion 7: DELIVERY, red-proofed against the REAL broken code at ab98e04 ----
   * All three converted sites must be NAMED. A gate that caught only the one the finding mentioned
   * would have left the other two shipping the same defect.
   */
  {
    resetFixture();
    for (const rel of ["src/ui/util.js", "src/ui/flow.js", "src/orchestrator.js"]) {
      fixture(rel, execFileSync("git", ["show", `ab98e04:${rel}`], { cwd: REAL_ROOT, maxBuffer: 1e8 }).toString());
    }
    const r = checkBroadcastDelivery(tmpRoot);
    const named = ["util.js", "flow.js", "orchestrator.js"].filter((f) => r.failures.some((x) => x.includes(f)));
    const hasFix = r.failures.some((f) => /\[\{ seat, html: actorLine \}\]/.test(f));
    const ok = !r.ok && named.length === 3 && hasFix;
    console.log(`${ok ? "PASS" : "FAIL"} drill 7a (delivery, against the REAL ab98e04 code) — expected FAIL naming all 3 sites with the fix in the message, got ${r.ok ? "PASS" : "FAIL"} naming [${named.join(", ")}]${hasFix ? " with the fix" : " WITHOUT the fix in the message"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!ok) allDrillsOk = false;
  }
  {
    // NEGATIVE CONTROL 1 — the MECHANISM's own definition references the local seat in order to
    // SELECT a variant. That is the correct thing and must NOT be flagged; flagging it would make the
    // rule unsatisfiable, and an unsatisfiable rule gets loosened rather than obeyed.
    resetFixture();
    fixture("src/orchestrator.js", [
      "export function netNarrate(html,variants){showNarration(pickNarrVariant({html,variants},appState.mySeat));if(appState.isHost)netSetNarr(appState.db,appState.room,html,cb,variants);}",
      "export function netBroadcast(html,variants){if(appState.isHost)netSetNarr(appState.db,appState.room,html,cb,variants);}",
    ].join("\n"));
    const r = checkBroadcastDelivery(tmpRoot);
    console.log(`${r.ok ? "PASS" : "FAIL"} drill 7b (negative control — the mechanism's own selection site is not flagged) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!r.ok) allDrillsOk = false;
  }
  {
    // NEGATIVE CONTROL 2 — a correctly converted CALL, neutral content plus per-seat variants. If
    // this were flagged, the gate would be demanding something no correct code could satisfy.
    resetFixture();
    fixture("src/ui/util.js", "export function ask(msg){const seat=appState.curSeat;netHandlers().onBroadcast(`${pn(seat)} is deciding…`,[{seat,html:msg}]);}");
    const r = checkBroadcastDelivery(tmpRoot);
    console.log(`${r.ok ? "PASS" : "FAIL"} drill 7c (negative control — a correctly converted call passes) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!r.ok) allDrillsOk = false;
  }
  {
    // NEGATIVE CONTROL 3 — the FIXED tree must pass, which is what proves the fix and the gate agree.
    resetFixture();
    for (const rel of ["src/ui/util.js", "src/ui/flow.js", "src/orchestrator.js"]) {
      fixture(rel, fs.readFileSync(path.join(REAL_ROOT, rel), "utf8"));
    }
    const r = checkBroadcastDelivery(tmpRoot);
    console.log(`${r.ok ? "PASS" : "FAIL"} drill 7d (negative control — the FIXED tree passes) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!r.ok) allDrillsOk = false;
  }

  /* ---- assertion 8 (G19): the storm rain draws no unseeded and no GAME randomness ---- */
  const RAIN_GOOD = [
    'export function stormLayerSpecs(seed){',
    '  const rnd=mulberry32(seed);',
    '  return [{dur:0.676*rnd(),scale:0.969*rnd()}];',
    '}',
    'export function buildStormLayers(ov,seed){',
    '  for(const s of stormLayerSpecs(seed))ov.appendChild(mk(s));',
    '}',
    'export function somethingElse(){ return Math.random(); }',
    '',
  ].join("\n");

  // 8a: back to per-client weather — the bug G19 fixed
  {
    resetFixture();
    fixture("src/ui/board.js", RAIN_GOOD.replace("const rnd=mulberry32(seed);", "const rnd=Math.random;"));
    const r = checkStormRainSeeded(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("RAIN-NO-RNG") || f.startsWith("RAIN-UNSEEDED"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 8a (rain re-seeded from unseeded Math.random) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // 8b: THE ONE THAT MATTERS — drawing from the GAME rng. This would desync every client in the
  //     room and all 31 determinism fixtures, and it looks superficially like a correct "seeded" fix.
  {
    resetFixture();
    fixture("src/ui/board.js", RAIN_GOOD.replace("0.676*rnd()", "0.676*appState.game.r()"));
    const r = checkStormRainSeeded(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("RAIN-GAME-RNG"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 8b (rain drawn from the GAME rng — desyncs clients AND fixtures) — expected FAIL naming RAIN-GAME-RNG, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // 8c: the region cannot be located — an anchored check whose subject vanished must go LOUD, not
  //     pass because it found nothing. This is the vacuous-check trap, drilled.
  {
    resetFixture();
    fixture("src/ui/board.js", "export function drawBoard(){}\n");
    const r = checkStormRainSeeded(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("RAIN-SEED-ANCHOR"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 8c (anti-vacuity — a lost anchor FAILS rather than silently passing) — expected FAIL naming RAIN-SEED-ANCHOR, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // 8d: NEGATIVE CONTROL — a correctly seeded region passes, AND a legitimate Math.random() OUTSIDE
  //     the two anchored functions is not flagged. That scoping is why this can stay strict.
  {
    resetFixture();
    fixture("src/ui/board.js", RAIN_GOOD);
    const r = checkStormRainSeeded(tmpRoot);
    const drillOk = r.ok;
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 8d (negative control — seeded rain passes, and Math.random() elsewhere in the file is untouched) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  /* ---- assertion 12 (FIX-21): every trailing signed-coin parenthetical is nobrk-wrapped ---- */

  // 9a: an unwrapped coin parenthetical at an anchor that IS found must FAIL naming COIN-NOBRK.
  {
    resetFixture();
    fixture("src/ui/util.js", [
      '  aground:(e,at,cellPx=0,viewerSeat)=>{',
      '    const lossTag=lost!=null?` (−${lost}🌕)`:"";', // unwrapped — the pre-fix shape
      '    return {txt:`...${lossTag}`};',
      '  },',
    ].join("\n"));
    const r = checkCoinParentheticalNobrk(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("COIN-NOBRK:") && f.includes("aground"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 9a (an unwrapped coin parenthetical FAILS naming COIN-NOBRK) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // 9b: renaming the anchor itself must REFUSE (FAIL naming COIN-NOBRK-ANCHOR), never silently pass
  //     — the exact anti-vacuity property checkStormRainSeeded's own drill 8c proves, applied here.
  {
    resetFixture();
    fixture("src/ui/util.js", [
      '  aground:(e,at,cellPx=0,viewerSeat)=>{',
      '    const lossTagRENAMED=lost!=null?` <span class="nobrk">(−${lost}🌕)</span>`:"";',
      '    return {txt:`...`};',
      '  },',
    ].join("\n"));
    const r = checkCoinParentheticalNobrk(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("COIN-NOBRK-ANCHOR") && f.includes("aground"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 9b (anti-vacuity — a renamed/lost anchor FAILS naming COIN-NOBRK-ANCHOR rather than silently passing) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // 9c: NEGATIVE CONTROL — the real, fixed src/ui/util.js and src/ui/flow.js pass in full: every one
  //     of the 10 anchored sites is found AND wrapped. This is the drill that proves the fix and the
  //     gate agree, mirroring drill 7d's own "copy the FIXED tree in" technique.
  {
    resetFixture();
    for (const rel of ["src/ui/util.js", "src/ui/flow.js"]) {
      fixture(rel, fs.readFileSync(path.join(REAL_ROOT, rel), "utf8"));
    }
    const r = checkCoinParentheticalNobrk(tmpRoot);
    const drillOk = r.ok && r.stats.scanned === COIN_PARENTHETICAL_SITES.length;
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 9c (negative control — the FIXED tree passes, all ${COIN_PARENTHETICAL_SITES.length} sites found and wrapped) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
  }

  // --- Drill 10: an unbalanced HTML comment — the 2026-08-28 fault, all three shapes ---
  {
    resetFixture();
    fixture("index.html", `<html><body>\n  orphaned tail of a deleted comment opener\n  still prose -->\n<div id="x"></div>\n</body></html>\n`);
    const r = checkHtmlCommentsBalanced(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("HTML-COMMENT-STRAY-CLOSE"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 10a (stray --> with no opener) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    if (!drillOk) allDrillsOk = false;
  }
  {
    resetFixture();
    fixture("index.html", `<html><body>\n<!-- opened and never closed\n<div id="x"></div>\n</body></html>\n`);
    const r = checkHtmlCommentsBalanced(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("HTML-COMMENT-UNCLOSED"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 10b (unclosed <!--) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    if (!drillOk) allDrillsOk = false;
  }
  {
    resetFixture();
    fixture("index.html", `<html><head><style>\n.a { color: red; }\n@media (prefers-reduced-motion: reduce) {\n/* rule deleted, closing brace went with it */\n.b { color: blue; }\n</style></head><body></body></html>\n`);
    const r = checkHtmlCommentsBalanced(tmpRoot);
    const drillOk = !r.ok && r.failures.some((f) => f.startsWith("CSS-BRACE-UNCLOSED"));
    console.log(`${drillOk ? "PASS" : "FAIL"} drill 10c (an @media left open inside <style>) — expected FAIL, got ${r.ok ? "PASS" : "FAIL"}`);
    if (!drillOk) allDrillsOk = false;
  }
  {
    resetFixture();
    fixture("index.html", fs.readFileSync(path.join(REAL_ROOT, "index.html"), "utf8"));
    const r = checkHtmlCommentsBalanced(tmpRoot);
    console.log(`${r.ok ? "PASS" : "FAIL"} drill 10d (negative control — the real index.html balances, comments and braces both) — expected PASS, got ${r.ok ? "PASS" : "FAIL"}`);
    for (const f of r.failures) console.log(`    ${f}`);
    if (!r.ok) allDrillsOk = false;
  }

  fs.rmSync(tmpRoot, { recursive: true, force: true });

  console.log(`\n${allDrillsOk ? "ALL 10 ASSERTIONS RED-PROOF DRILLED OK" : "DRILL FAILURE — an assertion did not fail against its own synthetic violation"}`);
  process.exit(allDrillsOk ? 0 : 1);
}

/* ================= Entry ================= */
if (process.argv.includes("--drill")) {
  drill();
} else {
  /* WHICH TREE — added at the 2026-08-26 cutover, through the shared picker rather than a local
     flag (rule 23: one spelling of "which tree", scripts/lib/pick_tree.js).
     This gate has only ever run BARE, which meant the root tree, which meant the v1 game. The
     cutover made root the promoted game, and it fails 24 of these assertions — 2 retained globals
     and ~22 player-facing strings still in the pre-conversion you/your register. Those are REAL
     findings, recorded in .planning/BACKLOG.md; they are not silently adopted by moving a flag.
     Pointing this at `classic` preserves EXACTLY the coverage that existed the day before the
     cutover — no more, and importantly no less. Promoting it to guard the live game means fixing
     the game, which is a separate and deliberate act. */
  const picked = pickTree(process.argv);
  console.log(treeLine(picked));
  const results = runAll(picked.root);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("\nFAILURES:");
    for (const r of failed) for (const f of r.failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}
