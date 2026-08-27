#!/usr/bin/env node
// scripts/state_contract_check.js
//
// The standing GLOBAL-01/GLOBAL-03 gate (Phase 10 Plan 01, built here; wired into `npm test` in
// 10-06 once all 46 names are migrated). Mirrors scripts/engine_contract_check.js and
// scripts/net_contract_check.js's structure exactly: shebang, a header explaining what is gated
// and why, one PASS/FAIL line per assertion, every assertion run before exit so a single run
// reports every problem, named failures with file:line, fixed scope excluding scripts/ itself.
//
// Deliberately NO comment stripping, anywhere in this file — the same reconfirmation
// net_contract_check.js's own header performs for its own scope. index.html's classic-script
// region contains `SVGNS="http://www.w3.org/2000/svg"` (a `://`-bearing string literal); stripping
// from the first `//` to end-of-line before matching would truncate that line before any real
// match on it could be seen. This script uses the shared tokenizer's string/comment-aware
// classification instead of a naive stripper wherever code-vs-string/comment distinction matters
// (assertions 1/2/5), and matches raw lines everywhere else (assertions 3/4) — never a `//`-to-EOL
// strip.
//
// ============================================================================
// The five assertions (RESEARCH.md's Wave 0 Gaps recommendation)
// ============================================================================
// 1. No leftover top-level declaration — none of the 46 app-state names has a remaining
//    `let`/`const`/`var` declarator anywhere in index.html's classic-script region (mirrors
//    engine_contract_check.js's own "moved-symbol shadows the bridge" check, generalized via
//    scripts/migrate_app_state.js's declarator-list-aware scan rather than a start-of-line-anchored
//    regex, since these declarations are multi-declarator comma lists).
// 2. No leftover bare usage — zero remaining `\bNAME\b` occurrences of any of the 46 names inside
//    the region that are NOT `appState.`-prefixed, aren't property access on some OTHER object
//    (`sess.room`), and aren't an object-literal property KEY (`{room:room||null}`'s first
//    `room`) — reuses scripts/migrate_app_state.js's checkNameBareUsages directly (the SAME
//    tokenizer-scoped classifier the migration tool itself uses to decide what to rewrite), so a
//    name the migration tool has fully processed is guaranteed to report zero here.
// 3. Debug-hook naming convention — every `window.__pp_*` assignment in src/main.js (including the
//    indirect `window[MODULE_OK_FLAG]` form) matches a hardcoded allowlist of the four expected
//    names (GLOBAL-03), AND all four of those names are actually present — an absent hook is as
//    much a violation as an ad-hoc extra one.
// 4. src/state/index.js purity — no document/window/firebase/localStorage/Date.now/Math.random/
//    globalThis/new Function reference inside the module itself (same purity bar
//    engine_contract_check.js already enforces for src/engine/ and src/shared/).
// 5. `appState` binding never reassigned — no `\bappState\s*=` (excluding `appState.foo=`
//    property writes and `appState==`/`appState===` comparisons) anywhere outside
//    src/state/index.js's own declaration. Named `appState`, not the RESEARCH/CONTEXT-
//    illustrative `state` — `state` already collides with unrelated local parameter/variable
//    names inside the classic script (`broadcastFlip(state)`, `setFlipCoin(state)`, …); see
//    src/state/index.js's header and 10-01-SUMMARY.md's Deviations section for the full account.
//
// Wired into `npm test` as of 10-06, immediately after `scripts/net_contract_check.js` in the
// `&&` chain, now that all 46 names are migrated (10-02 through 10-05) and all five assertions
// are expected to pass. During 10-02 through 10-05 this script was run standalone, and
// assertions 1/2 were expected-red by design as each batch migrated — that period is over; a red
// result here now is a real regression, not a phase-in-progress artifact.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { locateClassicScriptRegion, classify, maskNonCode } from "./lib/js_region_tokenizer.js";
import { APP_STATE_NAMES, checkNameBareUsages, hasTopLevelDeclaration } from "./migrate_app_state.js";
import { pickTree, treeLine, REPO_ROOT } from "./lib/pick_tree.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const picked = pickTree(process.argv);
const ROOT = picked.root;
const INDEX_HTML = path.join(ROOT, "index.html");
const SRC_DIR = path.join(ROOT, "src");
const MAIN_JS = path.join(ROOT, "src", "main.js");
const STATE_INDEX_JS = path.join(ROOT, "src", "state", "index.js");

/* ============================================================================
   WHICH IMPORTS FOLLOW THE TREE, AND WHICH MUST NOT — the distinction that decides
   whether this gate measures 4/ with 4/'s constants or with the root's.
   ============================================================================
   FOLLOWS THE TREE (a TREE ARTIFACT — the scanned game's own code):
     index.html, src/, src/main.js, src/state/index.js, and src/module-contract.js's
     MODULE_OK_FLAG. `src/module-contract.js` EXISTS and is the one that matters when scanning
     4/. The two copies happen to agree today ("__pp_module_ok", byte-identical files) — which is
     exactly why getting this backwards would be invisible. A statically-imported `../src/
     module-contract.js` would pin the ROOT's flag value forever, and the day 4/ changed its own,
     this gate would check 4/'s main.js against the old game's constant and pass.

   DOES NOT FOLLOW THE TREE (a TOOL — tree-agnostic vocabulary and classifiers):
     ./migrate_app_state.js's APP_STATE_NAMES / checkNameBareUsages / hasTopLevelDeclaration, and
     ./lib/js_region_tokenizer.js's classify / maskNonCode / locateClassicScriptRegion. These are
     the migration's own definition of "what an app-state name is" and a character classifier;
     neither describes a tree. There is deliberately no scripts/migrate_app_state.js, and adding
     one would fork the vocabulary. (The tokenizer's own exported ROOT/INDEX_HTML constants ARE
     tree artifacts, so they are no longer imported here — this file computes both from the
     selector instead. That import was the crash that made this gate un-runnable against 4/.)
   ============================================================================ */
const MODULE_CONTRACT_JS = path.join(ROOT, "src", "module-contract.js");
let MODULE_OK_FLAG = null;
if (fs.existsSync(MODULE_CONTRACT_JS)) {
  ({ MODULE_OK_FLAG } = await import(pathToFileURL(MODULE_CONTRACT_JS).href));
}

const failures = [];

function jsFilesRecursive(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesRecursive(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/* ================= Assertion 1: no leftover top-level declaration (GLOBAL-01) ================= */
function checkNoLeftoverDeclarations() {
  let ok = true;
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  for (const name of APP_STATE_NAMES) {
    if (hasTopLevelDeclaration(html, name)) {
      ok = false;
      failures.push(`DECL: "${name}" still has a top-level let/const/var declarator in index.html — shadows the state bridge`);
    }
  }
  return ok;
}

/* ================= Assertion 2: no leftover bare usage (GLOBAL-01, Pitfall 2) ================= */
function checkNoLeftoverBareUsage() {
  let ok = true;
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  for (const name of APP_STATE_NAMES) {
    const findings = checkNameBareUsages(html, name);
    if (findings.length) {
      ok = false;
      for (const f of findings) {
        failures.push(`BARE-USAGE: "${name}" at index.html:${f.line} — ...${f.context.replace(/\n/g, "\\n")}...`);
      }
    }
  }
  return ok;
}

/* ================= Assertion 3: debug-hook naming convention (GLOBAL-03) ================= */
// Hardcoded, not derived from src/main.js's own assignments at check time — deriving it from the
// file under test would make this assertion tautological, the same reasoning
// engine_contract_check.js/net_contract_check.js give for their own hardcoded inventories.
const ALLOWED_DEBUG_HOOKS = new Set(["__pp_module_ok", "__pp_boot_count", "__pp_net_debug", "__pp_app_state_debug"]);

function checkDebugHookNames() {
  let ok = true;
  const content = fs.readFileSync(MAIN_JS, "utf8");
  const lines = content.split("\n");
  const found = new Set();

  // Direct `window.__pp_xxx = ...` assignments.
  const directRe = /window\.(__pp_[A-Za-z0-9_]+)\s*=/g;
  lines.forEach((line, i) => {
    let m;
    directRe.lastIndex = 0;
    while ((m = directRe.exec(line))) {
      found.add(m[1]);
      if (!ALLOWED_DEBUG_HOOKS.has(m[1])) {
        ok = false;
        failures.push(`DEBUG-HOOK: src/main.js:${i + 1} assigns "window.${m[1]}", not on the allowlist {${[...ALLOWED_DEBUG_HOOKS].join(", ")}}`);
      }
    }
  });

  // Indirect `window[SOME_IMPORTED_FLAG] = ...` form — src/main.js uses this exactly once, for
  // MODULE_OK_FLAG imported from src/module-contract.js. Resolve it to its string value rather
  // than matching the identifier name, since the identifier itself (`MODULE_OK_FLAG`) is not a
  // `window.__pp_*` name — its VALUE is.
  const indirectRe = /window\[([A-Za-z0-9_$]+)\]\s*=/g;
  let m2;
  indirectRe.lastIndex = 0;
  while ((m2 = indirectRe.exec(content))) {
    const varName = m2[1];
    let resolved = null;
    if (varName === "MODULE_OK_FLAG") resolved = MODULE_OK_FLAG;
    if (varName === "MODULE_OK_FLAG" && MODULE_OK_FLAG == null) {
      ok = false;
      failures.push(`DEBUG-HOOK: src/main.js assigns window[MODULE_OK_FLAG], but ${path.relative(REPO_ROOT, MODULE_CONTRACT_JS)} does not exist in the scanned tree — this check cannot resolve the flag's VALUE and must not pass pretending it did.`);
      continue;
    }
    if (resolved === null) {
      ok = false;
      failures.push(`DEBUG-HOOK: src/main.js uses an indirect "window[${varName}] = ..." assignment this check doesn't know how to resolve — extend checkDebugHookNames()`);
      continue;
    }
    found.add(resolved);
    if (!ALLOWED_DEBUG_HOOKS.has(resolved)) {
      ok = false;
      failures.push(`DEBUG-HOOK: src/main.js's "window[${varName}]" resolves to "${resolved}", not on the allowlist {${[...ALLOWED_DEBUG_HOOKS].join(", ")}}`);
    }
  }

  // Presence, not just allowlist membership — a hook silently never assigned (e.g. a future
  // refactor accidentally deletes the __pp_app_state_debug block) is as much a GLOBAL-03
  // violation as an ad-hoc extra one; only checking additions would let that regression through
  // green.
  for (const name of ALLOWED_DEBUG_HOOKS) {
    if (!found.has(name)) {
      ok = false;
      failures.push(`DEBUG-HOOK: expected hook "window.${name}" is not assigned anywhere in src/main.js`);
    }
  }

  return ok;
}

/* ================= Assertion 4: src/state/index.js purity ================= */
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

function stripLineComment(line) {
  // Deliberately used ONLY here, scoped to src/state/index.js (which is known, by direct read, to
  // contain no `://`-bearing string literal) — never applied to index.html or src/main.js, which
  // do carry `://` content. Mirrors engine_contract_check.js's own stripping precedent, narrowly.
  const idx = line.indexOf("//");
  return idx === -1 ? line : line.slice(0, idx);
}

function checkStatePurity() {
  let ok = true;
  const lines = fs.readFileSync(STATE_INDEX_JS, "utf8").split("\n");
  lines.forEach((raw, i) => {
    const stripped = stripLineComment(raw);
    for (const { name, re } of PURITY_PATTERNS) {
      const m = stripped.match(re);
      if (m) {
        ok = false;
        failures.push(`PURITY: src/state/index.js:${i + 1} matched "${name}" (found "${m[0]}")`);
      }
    }
  });
  return ok;
}

/* ================= Assertion 5: `appState` binding never reassigned (D-03/NO-ACCESSORS' cousin) ================= */
// Scoped to index.html's classic-script region (tokenizer-masked, code-only) plus every .js file
// under src/ EXCEPT src/state/index.js itself (whose own `export const appState = {...}` IS the
// one-time declaration this assertion must not flag) and never scripts/ (this file's own source
// necessarily contains the pattern as a regex literal). Checks `appState`, not the
// RESEARCH/CONTEXT-illustrative `state` — see src/state/index.js's header for why the exported
// binding is named `appState` in this codebase.
function checkStateBindingNeverReassigned() {
  let ok = true;
  // `appState =` or `appState=`, but not `appState==`/`appState===`
  const reassignRe = /\bappState\s*=(?!=)/g;
  const BINDING_NAME = "appState";

  function scanMasked(rel, masked, toAbsLine) {
    let m;
    reassignRe.lastIndex = 0;
    while ((m = reassignRe.exec(masked))) {
      const idx = m.index;
      // exclude `appState.foo=` property writes — the char right after `appState` (before any
      // `=`) must not be `.`; since our regex already requires `=` directly (mod whitespace)
      // after `appState`, a `.` there would have prevented this match from firing at this
      // position in the first place UNLESS the match is actually anchored differently —
      // double-check explicitly.
      const afterName = masked.slice(idx + BINDING_NAME.length, idx + BINDING_NAME.length + 1);
      if (afterName === ".") continue; // defensive; `\s*=` wouldn't match a leading `.` anyway
      ok = false;
      failures.push(`STATE-REASSIGN: ${rel}:${toAbsLine(idx)} — the \`appState\` binding itself appears reassigned, not just its properties`);
    }
  }

  const html = fs.readFileSync(INDEX_HTML, "utf8");
  const region = locateClassicScriptRegion(html);
  const masked = maskNonCode(region.source, classify(region.source));
  scanMasked("index.html", masked, (idx) => html.slice(0, region.start + idx).split("\n").length);

  for (const file of jsFilesRecursive(SRC_DIR)) {
    if (path.resolve(file) === path.resolve(STATE_INDEX_JS)) continue;
    const rel = path.relative(REPO_ROOT, file);
    const content = fs.readFileSync(file, "utf8");
    const masked2 = maskNonCode(content, classify(content));
    scanMasked(rel, masked2, (idx) => content.slice(0, idx).split("\n").length);
  }

  return ok;
}

/* ================= Runner ================= */
function main() {
  // THE TREE, AND WHAT WAS ACTUALLY OPENED, BEFORE ANY VERDICT (HARD-WON-LESSONS §3).
  const srcFiles = fs.existsSync(SRC_DIR) ? jsFilesRecursive(SRC_DIR) : [];
  const regionChars = fs.existsSync(INDEX_HTML)
    ? locateClassicScriptRegion(fs.readFileSync(INDEX_HTML, "utf8")).source.length
    : -1;
  console.log(treeLine(picked, `${srcFiles.length} .js file(s) under src/, ${APP_STATE_NAMES.length} app-state name(s), index.html classic-script region ${regionChars < 0 ? "MISSING" : regionChars + " chars"}`));
  if (srcFiles.length === 0) {
    console.error(`FAIL: no .js files found under ${SRC_DIR} — this gate scanned NOTHING.`);
    process.exit(1);
  }
  if (!fs.existsSync(MAIN_JS) || !fs.existsSync(STATE_INDEX_JS)) {
    console.error(`FAIL: ${path.relative(REPO_ROOT, MAIN_JS)} or ${path.relative(REPO_ROOT, STATE_INDEX_JS)} is missing — assertions 3 and 4 have no subject and must not pass over an absent one.`);
    process.exit(1);
  }

  const declOk = checkNoLeftoverDeclarations();
  console.log(`${declOk ? "PASS" : "FAIL"} no leftover top-level declaration — none of the 46 app-state names re-declared in index.html`);

  const bareOk = checkNoLeftoverBareUsage();
  console.log(`${bareOk ? "PASS" : "FAIL"} no leftover bare usage — zero un-migrated identifier-position occurrences of any of the 46 app-state names`);

  const hookOk = checkDebugHookNames();
  console.log(`${hookOk ? "PASS" : "FAIL"} debug-hook naming convention (GLOBAL-03) — every window.__pp_* name in src/main.js is on the 4-name allowlist`);

  const purityOk = checkStatePurity();
  console.log(`${purityOk ? "PASS" : "FAIL"} src/state/index.js purity — zero document/window/firebase/localStorage/Date.now/Math.random/globalThis/new Function references`);

  const reassignOk = checkStateBindingNeverReassigned();
  console.log(`${reassignOk ? "PASS" : "FAIL"} appState binding never reassigned — only appState.NAME property writes occur outside src/state/index.js's own declaration`);

  if (failures.length) {
    console.error(`\nFAILURES — tree: ${picked.label}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
