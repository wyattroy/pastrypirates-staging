#!/usr/bin/env node
// scripts/net_contract_check.js
//
// The standing SPLIT-04/NET-01/NET-02/D-04 gate (Phase 9 Plan 4). D-04 says
// the registry must be the single place watchers are attached and detached
// — "not left to discipline" — because Phase 10 and Phase 11 touch this
// same code again and would otherwise quietly reintroduce a raw listener
// call. A grep run once during execution and pasted into a summary proves
// nothing about the next three phases; this script is what turns that
// requirement into a standing, repeatable gate wired into `npm test`.
//
// Mirrors scripts/engine_contract_check.js's structure — shebang, a header
// explaining what is gated and why, one PASS line per assertion, every
// assertion run before exit so a single run reports every problem, named
// failures with file and line, fixed scope, hardcoded-not-derived rationale
// for the inventory-completeness assertion — with ONE deliberate deviation
// from that precedent, explained next.
//
// ============================================================================
// Why this script never strips comments, anywhere — the one thing NOT copied
// from engine_contract_check.js
// ============================================================================
// engine_contract_check.js strips every line from the first `//` to end of
// line before matching, and its own header explicitly says that is safe only
// because src/engine/ and src/shared/ contain no URL literals, asking that
// the assumption be "reconfirmed if a URL-bearing string is ever added
// here." src/net/index.js now contains the Firebase `databaseURL` — a
// `https://...` string literal — which makes that exact false-negative live
// instead of theoretical: a real violation appearing after a `://`-bearing
// literal earlier on the same physical line would be silently truncated
// away by that stripper before the match pattern ever saw it.
//
// This is that reconfirmation moment, and the answer is: do not comment-strip
// at all, anywhere in this file. Match raw, unstripped lines and accept the
// occasional false positive inside a comment. That trade is deliberate and
// asymmetric: a false positive here costs a reworded comment; a false
// negative would silently reopen the exact bug class NET-01 and NET-02 exist
// to close. This script is biased toward over-flagging on purpose.
//
// ============================================================================
// 2026-08-23 (03-01 Task 2) — REFINED, NOT REVERSED. Read this with the above.
// ============================================================================
// The paragraph above is entirely correct and its conclusion is unchanged for
// the case it argues: a `//`-to-END-OF-LINE strip stays banned in this file,
// forever, for exactly the databaseURL reason it gives.
//
// What re-aiming this gate at `4/` exposed is that the paragraph proves
// something narrower than "never strip". It proves that a strip which can
// TRUNCATE A LINE CONTAINING CODE is unsafe. Dropping a line that is ENTIRELY
// a comment cannot truncate a line containing code — there is no code on it —
// so it does not reopen that hole at all.
//
// And the "occasional false positive" turned out not to be occasional. Against
// 4/ this gate reported two NO-APP-STATE violations at src/net/writers.js:174
// and :193. Both are inside the long host-gone comment block. Neither is code.
// The bias toward over-flagging was written when the cost was "a reworded
// comment" — but that cost is now "rewrite the paragraph explaining WHY the
// host-gone path works", i.e. the gate makes writing the explanation an
// offence. HARD-WON-LESSONS §1b records the same thing happening to
// scripts/seat_arg_check.js, whose first run failed on the comment
// documenting the bug it exists to catch.
//
// So assertions 2 and 3 now match against source with COMMENT CHARACTERS
// BLANKED, via the shared stripCommentSegments() in
// lib/js_region_tokenizer.js — which is classify()-backed, so it knows the
// `//` inside databaseURL is string content and leaves that line whole — the one used by host_guest_parity_check.js and
// wind_dot_contract_check.js, so there is one definition of "a comment".
// Stripped lines become EMPTY rather than disappearing, so reported line
// numbers still point at the right line.
//
// PER-ASSERTION, NOT GLOBAL. Assertions 1, 4 and 5 are untouched and still
// match raw. Any assertion whose SUBJECT is a comment must opt out and say so:
// strip globally and such an assertion counts zero and passes forever
// (engine_contract_check.js's annotation count is exactly that case).
//
// ============================================================================
// Scope
// ============================================================================
// Scans `index.html` and every `.js` file under `src/` (recursively). NEVER
// scans `scripts/`, including this file itself. This script's own source
// necessarily contains the forbidden literals and denylisted names as match
// patterns — scanning `scripts/` would make it permanently red, and the
// tempting "fix" would be to weaken the patterns until they stop catching
// anything real, which is the same trap engine_contract_check.js's header
// warns about for its own purity assertion. Do not widen this scope.
//
// ============================================================================
// The five assertions
// ============================================================================
// 1. Sole listener site (NET-02, D-04) — across index.html and every .js
//    under src/ except src/net/registry.js, zero occurrences of a Firebase
//    listener attach (paired with one of the five RTDB event names, in both
//    quote styles, so an unrelated DOM property beginning with the same
//    letters cannot false-positive) or a detach call. The registry exemption
//    is EXACTLY ONE FILE — widening it to all of src/net/ would make this
//    assertion vacuous, since a raw listener call in a new file a later
//    phase adds is precisely what it exists to catch.
// 2. No UI dependency (SPLIT-04) — across every .js under src/net/, zero
//    occurrences of any name on the hardcoded UI denylist.
// 3. No app-state dependency — across every .js under src/net/, zero
//    word-boundary matches for any name on the hardcoded app-state denylist.
//    `dlog` and `turnOrder` are deliberately excluded from that list because
//    both appear inside legitimate Firebase path strings src/net/ must
//    construct (`rooms/{room}/dlog/{n}`, `rooms/{room}/turnOrder`); `db`,
//    `room`, `seat`, and `myId` are excluded because they are parameter
//    names of the transport functions themselves, not application state
//    src/net/ reads from anywhere else.
// 4. Directional imports (SPLIT-04, D-06) — no .js under src/net/ has an
//    import specifier that resolves into src/ui/ or src/engine/. src/ui/
//    does not exist yet, which makes this trivially true today — that is
//    exactly why it is committed now rather than after Phase 11 creates
//    that directory, which would be adding the check after the only moment
//    it could have caught the first violation.
// 5. Watcher inventory completeness (NET-01, D-01) — src/net/watchers.js
//    exports every one of the eighteen names on a HARDCODED list (sourced
//    from 09-01-PLAN.md's inventory table, never derived from the file
//    under test — deriving it from the file under test would make this
//    assertion tautological: a watcher silently dropped from the file would
//    also drop out of the list checked against it, and the check would
//    still pass, exactly the reasoning engine_contract_check.js gives for
//    hardcoding its own moved-symbol list), and contains exactly eighteen
//    registry.attach() calls.
//
// No flags. Exits 0 on pass and prints one PASS line per assertion; exits 1
// on any failure and prints a named reason (file, line, matched literal or
// specifier) per failure.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pickTree, treeLine, REPO_ROOT } from "./lib/pick_tree.js";
import { stripCommentSegments } from "./lib/js_region_tokenizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const picked = pickTree(process.argv);
const ROOT = picked.root;
const SRC_DIR = path.join(ROOT, "src");
const NET_DIR = path.join(ROOT, "src", "net");
const UI_DIR = path.join(ROOT, "src", "ui");
const ENGINE_DIR = path.join(ROOT, "src", "engine");
const INDEX_HTML = path.join(ROOT, "index.html");
const REGISTRY_FILE = path.join(NET_DIR, "registry.js");

const failures = [];

/* ================= File discovery (never scripts/) ================= */

function jsFilesRecursive(dir) {
  const out = [];
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
const netJsFiles = jsFilesRecursive(NET_DIR);

/* ================= Assertion 1: sole listener site (NET-02, D-04) ================= */
// Paired with the event name, not the bare method name, so an unrelated DOM
// property beginning with the same letters cannot false-positive. No
// comment stripping — see header.
const EVENT_NAMES = ["value", "child_added", "child_changed", "child_removed", "child_moved"];
const ATTACH_LITERALS = EVENT_NAMES.flatMap((ev) => [`.on("${ev}"`, `.on('${ev}'`]);
const DETACH_LITERAL = ".off(";

function checkSoleListenerSite() {
  let ok = true;
  const targets = [INDEX_HTML, ...allSrcJsFiles].filter((f) => f !== REGISTRY_FILE);

  for (const file of targets) {
    const rel = path.relative(REPO_ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const lit of ATTACH_LITERALS) {
        if (line.includes(lit)) {
          ok = false;
          failures.push(`SOLE-LISTENER: ${rel}:${i + 1} contains a Firebase listener attach ("${lit}") outside src/net/registry.js`);
        }
      }
      if (line.includes(DETACH_LITERAL)) {
        ok = false;
        failures.push(`SOLE-LISTENER: ${rel}:${i + 1} contains a Firebase listener detach ("${DETACH_LITERAL}") outside src/net/registry.js`);
      }
    });
  }

  return ok;
}

/* ================= Assertion 2: no UI dependency (SPLIT-04) ================= */
// Hardcoded from 09-01-PLAN.md's artifacts register. Literal substring match.
// STRIPS COMMENTS (03-01 Task 2 — see the header section dated 2026-08-23).
// Tokenizer-backed, so a name in prose inside a `/* ... */` block no longer
// counts, and a name inside a real STRING literal still does. What is gated
// is what the file DOES, which was always the intent.
const UI_DENYLIST = [
  "setFlipCoin", "setClockUI", "setFlipActive", "setNeedsAction", "showNarration",
  "showChatBubble", "appendChatLine", "renderSeatList", "renderBattle",
  "renderBattleFromSnap", "buildPlayerRows", "drawBoard", "spawnPops",
  "syncLogLines", "updateRecipeBanner", "applyEndMeta", "panel", "showRoom",
  "showHome", "showGameView", "escHtml", "emojify", "alert", "netFail",
];

function checkNoUiDependency() {
  let ok = true;
  for (const file of netJsFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const lines = stripCommentSegments(fs.readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const name of UI_DENYLIST) {
        if (line.includes(name)) {
          ok = false;
          failures.push(`NO-UI: ${rel}:${i + 1} references UI name "${name}"`);
        }
      }
    });
  }
  return ok;
}

/* ================= Assertion 3: no app-state dependency ================= */
// Hardcoded from 09-01-PLAN.md's artifacts register. Word-boundary match,
// since these names are short and could otherwise collide with an unrelated
// substring. Two names on the conceptual list are deliberately excluded,
// named here with their reason rather than silently omitted: `dlog` and
// `turnOrder` both appear inside legitimate Firebase path strings src/net/
// must construct ("rooms/"+room+"/dlog/"+n, "rooms/"+room+"/turnOrder");
// `db`, `room`, `seat`, and `myId` are parameter names of the transport
// functions themselves, not application state read from elsewhere.
const APP_STATE_DENYLIST = [
  "game", "mySeat", "isHost", "replaying", "evIdx", "evPushed", "gameStarted",
  "spectatingBattle", "inBattlePrompt", "clockState", "roster",
];
const APP_STATE_PATTERNS = APP_STATE_DENYLIST.map((name) => ({
  name,
  re: new RegExp(`\\b${name}\\b`),
}));

function checkNoAppStateDependency() {
  let ok = true;
  for (const file of netJsFiles) {
    const rel = path.relative(REPO_ROOT, file);
    // STRIPS COMMENTS (03-01 Task 2). This is the assertion that reported
    // src/net/writers.js:174 and :193 — both prose inside the host-gone comment block.
    const lines = stripCommentSegments(fs.readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const { name, re } of APP_STATE_PATTERNS) {
        if (re.test(line)) {
          ok = false;
          failures.push(`NO-APP-STATE: ${rel}:${i + 1} references app-state name "${name}"`);
        }
      }
    });
  }
  return ok;
}

/* ================= Assertion 4: directional imports (SPLIT-04, D-06) ================= */
// No .js under src/net/ may import from src/ui/ or src/engine/. src/ui/
// does not exist yet — trivially true today, committed now anyway, because
// Phase 11 creates that directory and this is the only moment the check can
// catch the first violation rather than the second.
const IMPORT_RE = /(?:from\s+|import\()\s*["']([^"']+)["']/g;

function checkDirectionalImports() {
  let ok = true;
  for (const file of netJsFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      IMPORT_RE.lastIndex = 0;
      let m;
      while ((m = IMPORT_RE.exec(line))) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue; // bare/external specifier — not a local edge
        const resolved = path.normalize(path.join(path.dirname(file), spec));
        if (resolved === UI_DIR || resolved.startsWith(UI_DIR + path.sep)) {
          ok = false;
          failures.push(`DIRECTION: ${rel}:${i + 1} imports "${spec}", which resolves into src/ui/ — src/net/ may never import the UI`);
        }
        if (resolved === ENGINE_DIR || resolved.startsWith(ENGINE_DIR + path.sep)) {
          ok = false;
          failures.push(`DIRECTION: ${rel}:${i + 1} imports "${spec}", which resolves into src/engine/ — src/net/ may never import the engine`);
        }
      }
    });
  }
  return ok;
}

/* ================= Assertion 5: watcher inventory completeness (NET-01, D-01) ================= */
// Hardcoded from 09-01-PLAN.md's inventory table — NOT derived from
// src/net/watchers.js's own export list at check time. Deriving it from the
// file under test would make this assertion tautological: a watcher
// silently dropped from the file would also drop out of the list checked
// against it, and the check would still pass. This is what makes D-01's
// corrected count of eighteen (the roadmap's original figure was stale by
// four) permanent.
// netWatchTimerOff/netWatchClock left with the clock; netWatchPaused with play/pause (A-10) — sixteen now.
const WATCHER_INVENTORY = [
  "netWatchFlip", "netWatchConnected", "netWatchPresence",
  "netWatchChat", "netWatchBattle", "netWatchRecovery",
  "netWatchDraftPrompt", "netWatchEvents", "netWatchPrompt", "netWatchNarr",
  "netWatchSeats", "netWatchStatus", "netWatchTurnOrder", "netWatchRecipes",
  "netWatchResponse", "netWatchDraftResponse",
];
const WATCHERS_FILE = path.join(NET_DIR, "watchers.js");

async function checkWatcherInventory() {
  let ok = true;

  let ns;
  try {
    ns = await import(pathToFileURL(WATCHERS_FILE).href);
  } catch (err) {
    failures.push(`INVENTORY: importing src/net/watchers.js threw — ${err.message}`);
    return false;
  }

  for (const name of WATCHER_INVENTORY) {
    if (!(name in ns)) {
      ok = false;
      failures.push(`INVENTORY: "${name}" is not exported by src/net/watchers.js`);
    }
  }

  const content = fs.readFileSync(WATCHERS_FILE, "utf8");
  const attachCount = (content.match(/registry\.attach\(/g) || []).length;
  if (attachCount !== 16) {
    ok = false;
    failures.push(`INVENTORY: expected exactly 16 registry.attach() calls in src/net/watchers.js, found ${attachCount}`);
  }

  return ok;
}

/* ================= Runner ================= */
async function main() {
  // THE TREE, AND WHAT WAS OPENED, BEFORE ANY VERDICT (HARD-WON-LESSONS §3).
  console.log(treeLine(picked, `${netJsFiles.length} .js file(s) under src/net/, ${allSrcJsFiles.length} under src/`));
  if (netJsFiles.length === 0) {
    console.error(`FAIL: no .js files found under ${NET_DIR} — this gate scanned NOTHING. Every assertion below would pass over an empty set.`);
    process.exit(1);
  }

  const soleListenerOk = checkSoleListenerSite();
  console.log(
    `${soleListenerOk ? "PASS" : "FAIL"} sole listener site (NET-02, D-04) — zero .on()/.off() calls outside src/net/registry.js`
  );

  const noUiOk = checkNoUiDependency();
  console.log(`${noUiOk ? "PASS" : "FAIL"} no UI dependency (SPLIT-04) — zero UI names referenced anywhere under src/net/`);

  const noAppStateOk = checkNoAppStateDependency();
  console.log(`${noAppStateOk ? "PASS" : "FAIL"} no app-state dependency — zero app-state names referenced anywhere under src/net/`);

  const directionOk = checkDirectionalImports();
  console.log(`${directionOk ? "PASS" : "FAIL"} directional imports (SPLIT-04, D-06) — src/net/ never imports src/ui/ or src/engine/`);

  const inventoryOk = await checkWatcherInventory();
  console.log(
    `${inventoryOk ? "PASS" : "FAIL"} watcher inventory completeness (NET-01, D-01) — all sixteen watchers exported, exactly sixteen registry.attach() calls`
  );

  if (failures.length) {
    console.error(`\nFAILURES — tree: ${picked.label}`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
