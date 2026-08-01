#!/usr/bin/env node
// scripts/migrate_app_state.js
//
// Phase 10 (App State & De-globalization), Plan 01, Task 1. This file starts as the committed
// ground truth for the migration: the authoritative 46-name app-state inventory plus the
// re-confirmed write-site line numbers for every name RESEARCH.md flagged "verify at migration
// time". Task 2 (the tracer) extends this same file with the actual `--migrate`/`--extract-strings`/
// `--check-names` tool logic, built on scripts/lib/js_region_tokenizer.js. This task deliberately
// stops short of that — RESEARCH's D-04/Pitfall-2 warning is that a missed write site silently
// desyncs state, so the ground truth has to be nailed down and committed BEFORE any rewrite tool
// is allowed to run against it, exactly the "hardcoded, not derived" precedent
// scripts/engine_contract_check.js and scripts/net_contract_check.js already established for their
// own completeness assertions (deriving a checklist from the code under test makes the checklist
// tautological — a name silently dropped from the source would also drop out of the list checked
// against it).
//
// ============================================================================
// The 46-name app-state inventory (GLOBAL-01, D-04)
// ============================================================================
// Exactly rows 1-46 of 10-RESEARCH.md's "complete de-duplicated app-state inventory (Q1a)" table.
// The 7 UI-render-handle names from that same table (cell, shipEls, activeRing, spinNeedle,
// stormText, stormDial, windLabels) are DELIBERATELY EXCLUDED — RESEARCH's Q4 classification found
// zero non-UI readers for any of them, so CONTEXT.md's discretion note defers them to Phase 11's
// UI extraction. They must never appear in this array.
const APP_STATE_NAMES = [
  "game", "evIdx", "timer", "logLines",
  "db", "myId", "room", "mySeat", "isHost", "roster",
  "turnOrder",
  "numSeats", "evPushed", "promptCounter", "gameStarted", "appliedMeta",
  "passAndPlay", "activeTurnSeat", "recipeRevealed",
  "live", "liveDone", "liveGen",
  "curSeat", "inBattlePrompt", "spectatingBattle",
  "shotClockSeat", "shotClockDeadline", "shotClockTimer", "shotClockForce",
  "shotClockStash", "shotClockPaused", "shotClockPauseElapsed",
  "timerOff", "shotClockFired", "turnExpired", "clockState",
  "activePickCleanup",
  "replaying", "dlog", "dlogIdx", "dlogN",
  "resumeEvLen", "resumeReadFailed",
  "soloMeta", "syncBoardRAF", "lastChatSendAt",
];

// ============================================================================
// Confirmed write-site ground truth (re-grepped 2026-07-24 against the live index.html,
// `grep -nE "\bNAME\s*=[^=]" index.html` excluding `==`, restricted to the classic-script region
// index.html:859-4667). RESEARCH.md's own Assumptions Log (A1) explicitly required this
// re-confirmation before the plan's task list could be finalized against it — line numbers drift,
// per its own caveat, so this is a fresh grep pass, not a copy of the research table.
//
// Every one of the 46 names below, not just the ~20 RESEARCH flagged "verify at migration time" —
// re-confirming all 46 closes D-04's "every read AND write site... before migration" mandate
// completely rather than partially. The declaration line itself is included in a name's list where
// the declaration's own initializer happens to match the `NAME=value` write pattern (e.g.
// `let game=null,` matches `\bgame\s*=` at its own declaration) — harmless, and expected: the
// declaration site is also where `appState.NAME`'s default must be seeded from.
// ============================================================================
const CONFIRMED_WRITE_SITES = {
  game: [864, 4277, 4435],
  evIdx: [864, 2382, 4144, 4283, 4436],
  timer: [864], // see "timer classification" below — declaration only, no other write site exists
  logLines: [864, 1651, 4283, 4440],
  db: [3896, 3940],
  myId: [3896, 4623],
  room: [3896, 3983, 4255, 4266, 4342, 4346, 4651],
  mySeat: [3896, 3983, 4255, 4266, 4279, 4318, 4330, 4342, 4651],
  isHost: [3896, 3983, 4255, 4266, 4342, 4346, 4651],
  roster: [3896, 3986, 4267, 4278, 4385, 4392, 4532],
  turnOrder: [3790, 3899, 4439, 4462],
  numSeats: [3900, 3983, 4255, 4266, 4338, 4531],
  evPushed: [3900, 4016, 4030, 4050, 4436],
  promptCounter: [3900, 4087, 4108], // postfix `promptCounter++` at 4087/4108 — grep pattern below
  gameStarted: [3900, 4433],
  appliedMeta: [3900, 4217, 4436],
  passAndPlay: [3903, 3984, 4266],
  activeTurnSeat: [3561, 3568, 3574, 3581, 3594, 3598, 3603, 3903],
  recipeRevealed: [3561, 3568, 3573, 3593, 3601, 3903, 4309],
  live: [2015, 4436],
  liveDone: [2015, 3849, 4223, 4436],
  liveGen: [2015], // single occurrence total (RESEARCH-confirmed) — declaration only, never reassigned
  curSeat: [2016, 2081],
  inBattlePrompt: [2017, 4161, 4174, 4202],
  spectatingBattle: [2018, 3070, 3071],
  shotClockSeat: [2027, 2122, 2137, 2149, 2249],
  shotClockDeadline: [2027, 2123, 2150, 2170],
  shotClockTimer: [2027, 2129, 2138, 2158, 2171, 2177, 2247],
  shotClockForce: [2027, 2137, 2255, 2689, 2692],
  shotClockStash: [2031, 2136],
  shotClockPaused: [2032, 2126, 2137, 2151, 2168, 2174],
  shotClockPauseElapsed: [2032, 2176],
  timerOff: [2036, 2208],
  shotClockFired: [2037, 2124],
  turnExpired: [2037, 2125, 2250, 3558],
  clockState: [2037, 2278],
  activePickCleanup: [2041, 2257, 2880, 2881],
  replaying: [2046, 3990, 4015, 4524, 4550],
  dlog: [2047, 3989, 4258, 4269, 4438, 4544],
  dlogIdx: [2048, 3989, 4438, 4545], // plus postfix `dlogIdx++` inline reads at 2654/2866/3090/3742-equivalent sites (RESEARCH) — these are reassignments too; caught by --check-names, not itemized here since postfix `++` is not `NAME=` textually
  dlogN: [2049, 3989, 4438, 4545],
  resumeEvLen: [2050, 4547],
  resumeReadFailed: [2051, 4542, 4543, 4546],
  soloMeta: [3976, 3981, 3987, 4258, 4269],
  syncBoardRAF: [4590, 4591],
  lastChatSendAt: [2527, 2534],
};

// ============================================================================
// `timer` classification (Open Question 2)
// ============================================================================
// Resolved by grep: `grep -nE "timer\s*=\s*setInterval|timer\s*=\s*setTimeout|clearInterval\(timer\)|clearTimeout\(timer\)" index.html`
// returns ZERO matches for the bare `timer` binding anywhere in the file. The only interval/timeout
// handles that exist in this codebase are `shotClockTimer` (a distinct, separately-declared name,
// already its own row in this inventory) and a per-chat-bubble `b._timer` object property (not the
// bare identifier `timer` at all — it belongs to a locally-scoped bubble object, never touches the
// module-level binding).
//
// A full-file scan for the bare word `timer` (case-sensitive, word-bounded) inside the classic
// script region turns up 22 occurrences total, matching RESEARCH's count exactly — but 21 of the
// 22 are prose inside `//` comments ("the timer off/on toggle...", "timer switched off...") or UI
// copy inside string literals (`labelEl.textContent="timer off"`). Only ONE is a genuine code
// occurrence: the declaration itself at line 864 (`let game=null,evIdx=0,timer=null,logLines=[];`).
//
// CLASSIFICATION: `timer` is NOT an active setInterval/setTimeout handle. It is declared and never
// read or reassigned anywhere else in the current codebase — effectively dead state carried over
// from an earlier design. Its migration to `appState.timer` is a pure, risk-free rename (one
// declaration site, seeded `null`, no clearInterval/clearTimeout correctness concern applies to it
// at all — that concern belongs entirely to `shotClockTimer`, whose 7 write sites above already
// include its own `clearInterval(shotClockTimer)` call sites at 2138/2177/2247).
const TIMER_IS_ACTIVE_INTERVAL_HANDLE = false;

// ============================================================================
// Plan 01, Task 2 (the tracer): the actual migration tool, built on
// scripts/lib/js_region_tokenizer.js. Three modes, all scoped to the classic-script region only
// (index.html:859-4667):
//
//   --migrate NAME[,NAME...]   rewrite every identifier-position occurrence of each name to
//                              `appState.NAME`, skip property-key/property-access positions,
//                              expand object-literal shorthand, and remove the name from its
//                              top-level declarator list (or the whole `let/const/var` statement
//                              if it was the only declarator).
//   --extract-strings <arg>    print the tokenizer's ordered string+comment dump, for byte-safety
//                              diffing. <arg> is either a plain file path (e.g. `index.html`) or a
//                              git rev-spec understood by `git show` (e.g. `HEAD:index.html`).
//   --check-names NAME[,...]   report any remaining bare (non-`appState.`-prefixed) identifier-
//                              position occurrence of each name; exit 1 if any remain.
//
// "Identifier-position" deliberately excludes two syntactic positions that are lexically
// identical to a genuine variable reference but are NOT one: property access (`sess.room` — a
// DIFFERENT object's property, not the app-state global) and object-literal property KEYS
// (`{room:room||null}` — the first `room` is a label, the second is the real reference). Missing
// this distinction was confirmed against the live file during this task: `saveSession()`
// (index.html:3951) is genuine object-literal shorthand (`{room,mySeat,isHost}` — must become
// `{room:appState.room,mySeat,isHost}`, since `{appState.room,...}` is not valid JS), and
// `writeGameLog()`/`btnSendFeedback`'s onclick (index.html:3882/4517) both write
// `room:room||null` — a key that must stay literal `room` next to a value that must become
// `appState.room||null`. Getting this wrong would either desync state (Rule 2 in reverse —
// silently leaving a value unmigrated) or throw a SyntaxError at parse time (the shorthand case)
// — the second failure mode is loud, but the first is exactly Pitfall 2's silent-desync hazard,
// so both are handled explicitly rather than left to luck.
//
// ============================================================================
// Why the exported/bridged identifier is `appState`, not `state` (a mid-task correction)
// ============================================================================
// RESEARCH.md's own Pattern 1 code example, and CONTEXT.md's D-05, use the bare name `state`
// throughout. Running the tracer's own `--check-names room` against a REAL `state`-based
// migration surfaced a genuine collision this plan's earlier research pass never grepped for:
// `state` is ALREADY a local parameter/variable name in this exact classic script, unrelated to
// app state — `function broadcastFlip(state)` and `function setFlipCoin(state)` (the coin-flip
// outcome), `function coinHTML(state, ...)`, `function setRecoveryState(state)` (a recovery
// status string), and a local `const state=isHost?(...):clockState;` inside `setClockUI()` (a
// derived shot-clock display value). This tokenizer has no scope analysis — it cannot tell "this
// `room` occurrence is inside a function whose parameter shadows the bridge name" from any other
// occurrence — so publishing the app-state container AS `state` would make every rewritten
// `state.room` inside `broadcastFlip()` silently read `.room` off the LOCAL flip-outcome
// parameter instead of the real app-state object: no syntax error, no thrown exception, just a
// wrong room code sent to `netSetFlip()` at runtime. That is exactly the class of bug GLOBAL-01
// exists to prevent, and it is a Rule 1 auto-fix (broken behavior), not an architectural change —
// the shared-object-by-reference mechanism, the file at src/state/index.js, and every other
// design decision from RESEARCH/CONTEXT are unchanged; only the literal JS identifier published
// on the bridge does. `appState` was grepped and confirmed to have ZERO existing occurrences
// anywhere in index.html or src/**/*.js before being chosen (CONTEXT.md's own "Claude's
// Discretion" note explicitly leaves "the app-state module's exact name" open). See
// src/state/index.js's header and 10-01-SUMMARY.md's Deviations section for the full account.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ROOT,
  INDEX_HTML,
  locateClassicScriptRegion,
  classify,
  maskNonCode,
  extractStringsAndComments,
} from "./lib/js_region_tokenizer.js";

const APP_STATE_PREFIX = "appState.";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Depth-at-each-position array: depthAt[i] is the bracket nesting depth ((/{/[) BEFORE
 * character i, over the masked (string/comment-safe) source. Used both to find top-level
 * `let/const/var` declaration statements (depth 0) and to classify a `{` as an object-literal
 * open vs. a block open. */
function computeDepthAt(masked) {
  const depthAt = new Int32Array(masked.length + 1);
  let d = 0;
  for (let i = 0; i < masked.length; i++) {
    depthAt[i] = d;
    const c = masked[i];
    if (c === "(" || c === "{" || c === "[") d++;
    else if (c === ")" || c === "}" || c === "]") d--;
  }
  depthAt[masked.length] = d;
  return depthAt;
}

/** Finds every top-level (bracket-depth 0) `let`/`const`/`var` declaration statement in the
 * masked region source. Every one of the 46 app-state names is declared at this outermost script
 * level (never inside a function/block) — confirmed by direct read against index.html for all 46
 * declaration sites — which is what makes "depth === 0" a reliable, simple signal instead of
 * needing full scope tracking. */
function findTopLevelDeclarationStatements(masked) {
  const depthAt = computeDepthAt(masked);
  const spans = [];
  const kwRe = /\b(?:let|const|var)\b/g;
  let m;
  while ((m = kwRe.exec(masked))) {
    const kwStart = m.index;
    if (depthAt[kwStart] !== 0) continue;
    // exclude `for(let ...)` — the one construct where `let` can appear at depth 0 immediately
    // inside an opening paren rather than starting a bare top-level statement.
    let p = kwStart - 1;
    while (p >= 0 && /\s/.test(masked[p])) p--;
    if (p >= 0 && masked[p] === "(") continue;
    const keywordEnd = kwRe.lastIndex;
    let i = keywordEnd;
    let localDepth = 0;
    while (i < masked.length) {
      const c = masked[i];
      if (c === "(" || c === "{" || c === "[") localDepth++;
      else if (c === ")" || c === "}" || c === "]") localDepth--;
      else if (c === ";" && localDepth === 0) break;
      i++;
    }
    if (i >= masked.length) continue; // unterminated — shouldn't happen, skip defensively
    spans.push({ start: kwStart, end: i + 1, keywordEnd });
  }
  return spans;
}

/** Splits a declarator list (the text strictly between a decl statement's keyword and its
 * trailing `;`) into individual declarators, respecting nested brackets so an initializer like
 * `shotClockFired={}` doesn't get split on a comma that doesn't exist there, and generalizes
 * correctly to any future initializer that DOES contain a comma inside brackets. */
function splitDeclarators(masked, listStart, listEnd) {
  const parts = [];
  let depth = 0;
  let partStart = listStart;
  for (let i = listStart; i < listEnd; i++) {
    const c = masked[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push({ start: partStart, end: i });
      partStart = i + 1;
    }
  }
  parts.push({ start: partStart, end: listEnd });
  return parts;
}

/** Locates the declarator for `name` across every top-level declaration statement in the region.
 * Returns null if `name` has no top-level declaration (shouldn't happen for any of the 46 names,
 * but the migrate tool degrades to a plain rename rather than throwing if it ever does). */
function findDeclarator(masked, name) {
  const spans = findTopLevelDeclarationStatements(masked);
  for (const span of spans) {
    const listStart = span.keywordEnd;
    const listEnd = span.end - 1; // position of the trailing `;`
    const parts = splitDeclarators(masked, listStart, listEnd);
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      const partText = masked.slice(part.start, part.end);
      const leading = partText.length - partText.trimStart().length;
      const declMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*=/.exec(partText.trimStart());
      if (declMatch && declMatch[1] === name) {
        const declNameStart = part.start + leading;
        return { stmtStart: span.start, stmtEnd: span.end, parts, partIndex: idx, part, declNameStart };
      }
    }
  }
  return null;
}

/** Builds the removal edit for a found declarator: removes just that one declarator (and its
 * adjacent comma) if others remain in the list, or the entire statement if it was the sole
 * declarator. */
function declaratorRemovalEdit(decl) {
  const { parts, partIndex, part, stmtStart, stmtEnd } = decl;
  if (parts.length === 1) {
    return { start: stmtStart, end: stmtEnd, replacement: "" };
  }
  if (partIndex === parts.length - 1) {
    // last declarator — remove from the preceding comma through this part's end
    return { start: parts[partIndex - 1].end, end: part.end, replacement: "" };
  }
  // not last — remove this part's text AND the comma that follows it
  return { start: part.start, end: parts[partIndex + 1].start, replacement: "" };
}

/** Classifies a `{` at `braceIdx` (offset into `masked`) as an object-literal open or a block
 * open, by inspecting the nearest preceding non-whitespace token. Object-literal signals:
 * `(`, `,`, `=`, `:`, `[`, `?`, `=>`'s `>`, or the keyword `return` ending right there. Anything
 * else (`)`, `;`, `}`, an identifier/keyword like `else`/`try`/`finally`/`do`, or start-of-file)
 * defaults to "block" — the safer default, since wrongly treating an actual object literal as a
 * block only risks leaving a shorthand/key position unhandled (caught immediately by a syntax
 * error on migration, not a silent bug), whereas the reverse could silently mis-rewrite a block
 * statement's contents. */
function isObjectLiteralBrace(masked, braceIdx) {
  let p = braceIdx - 1;
  while (p >= 0 && /\s/.test(masked[p])) p--;
  if (p < 0) return false;
  const ch = masked[p];
  if (ch === "(" || ch === "," || ch === "=" || ch === ":" || ch === "[" || ch === "?") return true;
  if (ch === ">" && masked[p - 1] === "=") return true; // arrow function `=>`
  const lookback = masked.slice(Math.max(0, p - 6), p + 1);
  if (/\breturn$/.test(lookback)) return true;
  return false;
}

/** For every position in `masked`, precomputes the nearest enclosing bracket's character and,
 * if it's `{`, whether that brace was classified as an object literal. Returns a lookup function
 * `enclosingAt(idx) -> {type: '(' | '{' | '[' | null, isObjectLiteral: boolean}`. */
function buildBracketContext(masked) {
  const stack = [];
  const enclosingType = new Array(masked.length);
  const enclosingIsObj = new Array(masked.length);
  for (let i = 0; i < masked.length; i++) {
    const top = stack.length ? stack[stack.length - 1] : null;
    enclosingType[i] = top ? top.ch : null;
    enclosingIsObj[i] = top ? !!top.isObjectLiteral : false;
    const c = masked[i];
    if (c === "(" || c === "[") {
      stack.push({ ch: c });
    } else if (c === "{") {
      stack.push({ ch: c, isObjectLiteral: isObjectLiteralBrace(masked, i) });
    } else if (c === ")" || c === "]" || c === "}") {
      stack.pop();
    }
  }
  return {
    enclosingAt(idx) {
      return { type: enclosingType[idx] ?? null, isObjectLiteral: enclosingIsObj[idx] ?? false };
    },
  };
}

/** Migrates every identifier-position occurrence of `name` inside the classic-script region of
 * `html` (the full index.html source) to `appState.name`, returning the full new html string. */
function migrateNameInHtml(html, name) {
  const region = locateClassicScriptRegion(html);
  const src = region.source;
  const segments = classify(src);
  const masked = maskNonCode(src, segments);

  const decl = findDeclarator(masked, name);
  const edits = [];
  if (decl) edits.push(declaratorRemovalEdit(decl));

  const bracketCtx = buildBracketContext(masked);
  const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  let m;
  while ((m = nameRe.exec(masked))) {
    const idx = m.index;
    const end = idx + name.length;

    if (decl && idx >= decl.part.start && idx < decl.part.end) continue; // handled by declarator removal

    // already-migrated (idempotency: `appState.NAME` re-run should be a no-op for this occurrence)
    if (masked.slice(Math.max(0, idx - APP_STATE_PREFIX.length), idx) === APP_STATE_PREFIX) continue;

    // property access on some OTHER object (e.g. `sess.room`) — never touch
    let p = idx - 1;
    while (p >= 0 && /\s/.test(masked[p])) p--;
    if (p >= 0 && masked[p] === ".") continue;
    const prevCh = p >= 0 ? masked[p] : "";

    let n2 = end;
    while (n2 < masked.length && /\s/.test(masked[n2])) n2++;
    const nextCh = n2 < masked.length ? masked[n2] : "";

    const enclosing = bracketCtx.enclosingAt(idx);
    const inObjectLiteralHeadPosition =
      enclosing.type === "{" && enclosing.isObjectLiteral && (prevCh === "{" || prevCh === ",");

    if (inObjectLiteralHeadPosition && nextCh === ":") {
      continue; // object-literal property KEY — leave the label untouched
    }
    if (inObjectLiteralHeadPosition && (nextCh === "," || nextCh === "}")) {
      edits.push({ start: idx, end, replacement: `${name}:${APP_STATE_PREFIX}${name}` }); // shorthand expansion
      continue;
    }
    edits.push({ start: idx, end, replacement: `${APP_STATE_PREFIX}${name}` });
  }

  edits.sort((a, b) => a.start - b.start);
  let newSrc = src;
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    newSrc = newSrc.slice(0, e.start) + e.replacement + newSrc.slice(e.end);
  }

  return html.slice(0, region.start) + newSrc + html.slice(region.end);
}

/** Reports every remaining bare (non-`appState.`-prefixed, non-property-access, non-property-key)
 * identifier-position occurrence of `name` in the region. Mirrors migrateNameInHtml's own
 * exclusion rules exactly, so a name that migrateNameInHtml has fully processed always reports
 * zero here — anything else would make this check permanently, uninformatively red. */
function checkNameBareUsages(html, name) {
  const region = locateClassicScriptRegion(html);
  const src = region.source;
  const segments = classify(src);
  const masked = maskNonCode(src, segments);
  const bracketCtx = buildBracketContext(masked);
  const nameRe = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
  const findings = [];
  let m;
  while ((m = nameRe.exec(masked))) {
    const idx = m.index;
    const end = idx + name.length;

    if (masked.slice(Math.max(0, idx - APP_STATE_PREFIX.length), idx) === APP_STATE_PREFIX) continue; // already migrated

    let p = idx - 1;
    while (p >= 0 && /\s/.test(masked[p])) p--;
    if (p >= 0 && masked[p] === ".") continue; // property access on some other object
    const prevCh = p >= 0 ? masked[p] : "";

    let n2 = end;
    while (n2 < masked.length && /\s/.test(masked[n2])) n2++;
    const nextCh = n2 < masked.length ? masked[n2] : "";

    const enclosing = bracketCtx.enclosingAt(idx);
    const inObjectLiteralHeadPosition =
      enclosing.type === "{" && enclosing.isObjectLiteral && (prevCh === "{" || prevCh === ",");
    if (inObjectLiteralHeadPosition && nextCh === ":") continue; // property key — not an app-state ref

    // absolute offset into the full html, for a human-readable line number
    const absOffset = region.start + idx;
    const lineNo = html.slice(0, absOffset).split("\n").length;
    findings.push({ line: lineNo, context: src.slice(Math.max(0, idx - 30), idx + name.length + 30) });
  }
  return findings;
}

/** Reused by scripts/state_contract_check.js's assertion 1 ("no leftover top-level declaration")
 * — reports whether `name` still has a live top-level `let`/`const`/`var` declarator anywhere in
 * the region, using the exact same declarator-list-aware scan `migrateNameInHtml` uses to REMOVE
 * one, rather than a simple `^(let|const|var)\s+NAME\b` line-anchored regex. That simpler form
 * (used by scripts/engine_contract_check.js, where every checked symbol is a standalone
 * single-declarator statement) would silently under-detect here: these app-state declarations are
 * multi-declarator comma lists (`let db=null, myId=null, mySeat=null, …;`), so a name that isn't
 * textually first in its list — `mySeat`, `isHost`, `roster`, … — would never match a
 * start-of-line anchor even while still genuinely, bare-ly declared. */
function hasTopLevelDeclaration(html, name) {
  const region = locateClassicScriptRegion(html);
  const masked = maskNonCode(region.source, classify(region.source));
  return findDeclarator(masked, name) !== null;
}

function readIndexHtml() {
  return fs.readFileSync(INDEX_HTML, "utf8");
}

function readSourceArg(arg) {
  const asPath = path.isAbsolute(arg) ? arg : path.join(ROOT, arg);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
    return fs.readFileSync(asPath, "utf8");
  }
  // treat as a git rev-spec (e.g. `HEAD:index.html`)
  return execFileSync("git", ["show", arg], { cwd: ROOT, encoding: "utf8" });
}

function cmdMigrate(namesArg) {
  const names = namesArg.split(",").map((s) => s.trim()).filter(Boolean);
  let html = readIndexHtml();
  for (const name of names) {
    if (!APP_STATE_NAMES.includes(name)) {
      console.error(`--migrate: "${name}" is not in APP_STATE_NAMES — refusing to migrate an unconfirmed name`);
      process.exit(1);
    }
    html = migrateNameInHtml(html, name);
  }
  fs.writeFileSync(INDEX_HTML, html);
  console.log(`Migrated: ${names.join(", ")}`);
}

function cmdExtractStrings(arg) {
  const html = readSourceArg(arg);
  const region = locateClassicScriptRegion(html);
  process.stdout.write(extractStringsAndComments(region.source));
}

function cmdCheckNames(namesArg) {
  const names = namesArg.split(",").map((s) => s.trim()).filter(Boolean);
  const html = readIndexHtml();
  let anyFound = false;
  for (const name of names) {
    const findings = checkNameBareUsages(html, name);
    if (findings.length) {
      anyFound = true;
      console.error(`FAIL "${name}": ${findings.length} remaining bare occurrence(s)`);
      for (const f of findings) console.error(`  line ${f.line}: ...${f.context.replace(/\n/g, "\\n")}...`);
    } else {
      console.log(`PASS "${name}": zero remaining bare occurrences`);
    }
  }
  process.exit(anyFound ? 1 : 0);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--migrate" && args[1]) {
    cmdMigrate(args[1]);
  } else if (args[0] === "--extract-strings" && args[1]) {
    cmdExtractStrings(args[1]);
  } else if (args[0] === "--check-names" && args[1]) {
    cmdCheckNames(args[1]);
  } else {
    console.error(
      "Usage: node scripts/migrate_app_state.js --migrate NAME[,NAME...] | --extract-strings <file-or-gitref> | --check-names NAME[,NAME...]"
    );
    process.exit(1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main();

export {
  APP_STATE_NAMES,
  CONFIRMED_WRITE_SITES,
  TIMER_IS_ACTIVE_INTERVAL_HANDLE,
  migrateNameInHtml,
  checkNameBareUsages,
  hasTopLevelDeclaration,
};
