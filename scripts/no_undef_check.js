#!/usr/bin/env node
// scripts/no_undef_check.js
//
// The true, module-internal D-04 gate (11-07, added as a direct response to a Chrome-confirmed
// gap: the bridge deletion left several cross-module bare-identifier CALLS that the deleted
// bridge used to silently satisfy — `ui_contract_check.js`'s four assertions, `npm test`'s other
// contract checks, and `determinism_baseline.js --verify` all stayed green because none of them
// do undeclared-identifier analysis INSIDE a module or execute the runtime paths a real browser
// click-through does. This script closes that gap mechanically: it never runs the game, but it
// proves — for every `.js` file under `src/`, independent of any browser session — that every
// function-call-position identifier resolves to something the file itself imports, declares, or
// that is a recognized browser/language global. This is necessarily a heuristic, regex-based
// analysis (this codebase has no build step and no AST-parser dependency; see docs/MODULES.md's
// zero-dependency stance), scoped deliberately to CALL expressions — `NAME(` — because that is
// the exact failure class a bridge-satisfied bare read degrades to once the bridge is gone: a
// runtime `ReferenceError` the moment that call executes. It is not a full scope-correct
// type-checker; it does not (for example) distinguish a param shadowing an outer name in a
// nested closure from the same name declared elsewhere in the file — this tool's binding
// collection is FILE-WIDE and flat, not block-scoped, which means it can only ever be
// FALSE-NEGATIVE-safe in the shadowing direction (a real bug could theoretically hide behind an
// unrelated same-named binding elsewhere in the file) and OVER-PERMISSIVE, never
// under-permissive, in a way that would falsely flag legitimate code. Given this codebase's
// actual size (~4,000 lines across src/ui/, ~1,100 in src/orchestrator.js) that tradeoff is the
// right one for a merge gate: false negatives here still leave the Chrome click-through as the
// backstop (per 11-CONTEXT.md's own "never --verify alone" framing for this exact risk class);
// false positives would be a worse gate than none at all, since a red build for phantom reasons
// trains contributors to stop trusting it.
//
// ============================================================================
// What this scans and how
// ============================================================================
// Every `src/**/*.js` file, each analyzed independently (this tool never resolves cross-file
// imports back to their SOURCE file's own exports — it trusts that `import { X } from "..."`
// means X is a legitimate binding in THIS file, the same trust every other contract check in this
// codebase places in the module system; a wrong or misspelled import specifier is a distinct
// failure class `module_graph_check.js`/Node's own module resolution already catches at runtime
// import time, not what this tool exists to find).
//
// Per file:
//   1. Mask out every string/comment/regex-literal body using the SAME classify()/maskNonCode()
//      tokenizer scripts/lib/js_region_tokenizer.js already provides for the classic-script
//      region — reused here on a normal .js file's full text, which the tokenizer's own
//      character-by-character algorithm handles identically (it has never been HTML-specific).
//   2. Collect a FILE-WIDE, flat set of "locally bound names": every `import` specifier's LOCAL
//      name (default/named/namespace, alias-aware), every `function`/`class` declaration name,
//      every identifier bound by a `const`/`let`/`var` declarator's LHS binding pattern
//      (including arbitrarily nested object/array destructuring, renames, defaults, and rest
//      elements — the DEFAULT VALUE expression on the right of a destructured `=` is deliberately
//      NOT treated as a binding; it is left as ordinary code for the call-site scan below to
//      check like anything else), every parameter of every function/arrow/method signature found
//      in the file (same nested-destructuring-aware extraction), and every `catch(param)` /
//      `for (const|let NAME of|in ...)` binding.
//   3. Scan the masked text for every `IDENTIFIER(` call-position match not immediately preceded
//      by a `.` (a property/method call, e.g. `foo.bar(...)`, is never a bare-global read) and not
//      a JS reserved word used in call-like syntax (`if(...)`, `function(...)`, `typeof(...)`,
//      `super(...)`, etc.). Any such identifier that is NEITHER in this file's locally-bound-name
//      set NOR on the fixed browser/language ALLOWLIST below is a failure: an undeclared
//      identifier called as a function, in this exact file, at this exact line.
//
// No flags. Exits 0 and prints one PASS/FAIL summary line (plus a total scanned-file count) on
// success; exits 1 and prints every `file:line: NAME(...)` failure, one per line, on any finding.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, maskNonCode } from "./lib/js_region_tokenizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");

/* ================= File discovery ================= */
function jsFilesRecursive(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFilesRecursive(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/* ================= Reserved words / call-like keywords ================= */
// Anything that can syntactically precede `(` without being a real function-identifier call.
const RESERVED = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
  "function", "return", "typeof", "new", "in", "of", "instanceof", "class",
  "extends", "super", "this", "void", "delete", "yield", "await", "async",
  "static", "get", "set", "try", "catch", "finally", "throw", "with",
  "let", "const", "var", "import", "export", "default", "from", "as",
  "null", "true", "false", "undefined", "arguments", "debugger",
]);

/* ================= Fixed browser/language global allowlist ================= */
// Deliberately hardcoded (mirrors every other contract check's hardcoded-inventory precedent in
// this codebase, e.g. engine_contract_check.js's MOVED_SYMBOLS, state_contract_check.js's
// ALLOWED_DEBUG_HOOKS) rather than derived — deriving "what's a real global" from the environment
// would make this assertion tautological.
const GLOBAL_ALLOWLIST = new Set([
  // browser
  "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage",
  "console", "alert", "confirm", "prompt", "fetch", "XMLHttpRequest", "requestAnimationFrame",
  "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "setTimeout",
  "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "performance", "crypto",
  "URL", "URLSearchParams", "Blob", "FormData", "Headers", "Request", "Response",
  "AbortController", "MutationObserver", "ResizeObserver", "IntersectionObserver",
  "CustomEvent", "Event", "MouseEvent", "KeyboardEvent", "TouchEvent", "PointerEvent",
  "Image", "Audio", "Worker", "SharedWorker", "structuredClone", "matchMedia",
  "getComputedStyle", "self", "top", "parent", "globalThis", "postMessage",
  // firebase compat SDK (classic <script> globals, per docs/MODULES.md's load-order contract)
  "firebase",
  // language / standard built-ins
  "Object", "Array", "Function", "Boolean", "Number", "String", "Symbol", "BigInt",
  "Math", "JSON", "Date", "RegExp", "Map", "Set", "WeakMap", "WeakSet", "WeakRef",
  "FinalizationRegistry", "Promise", "Proxy", "Reflect",
  // typed arrays / binary data (19-05 — src/ui/board.js's preallocated windHist histogram is the
  // first caller under src/; this whole family was simply missing before, not scoped to wind-dot)
  "ArrayBuffer", "SharedArrayBuffer", "DataView",
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
  "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
  "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError",
  "isNaN", "isFinite", "parseInt", "parseFloat", "encodeURIComponent", "decodeURIComponent",
  "encodeURI", "decodeURI", "eval", "NaN", "Infinity",
  // Node (only src/lib-style tooling and any file that also loads under Node need this; several
  // src/**/*.js files import cleanly under plain Node per src/main.js's own `typeof window` guard)
  "process", "module", "exports", "require", "__dirname", "__filename", "Buffer",
]);

/* ================= Balanced-bracket helpers ================= */
// Finds the index just after the matching close bracket for an open bracket at `openIdx` in
// `s` (which must be `s[openIdx]` one of '(', '[', '{'). Operates on already-masked (string/
// comment-free) text, so bracket characters inside a string can never confuse it.
function matchingCloseIndex(s, openIdx) {
  const open = s[openIdx];
  const close = open === "(" ? ")" : open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1; // unbalanced (shouldn't happen in valid JS)
}

// Splits `s` on top-level commas (depth 0 w.r.t. (), [], {}), returning trimmed segments.
function splitTopLevelCommas(s) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// Strips a top-level `= <default expr>` suffix from a single binding-pattern segment (parameter
// or destructuring element), returning just the pattern part. The default expression itself is
// ordinary code and is left in place in the full masked source for the call-site scan to check
// independently — it is NOT a binding, so its identifiers must not be added to declaredNames.
function stripDefault(segment) {
  let depth = 0;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "=" && depth === 0 && segment[i + 1] !== "=" && segment[i - 1] !== "=" && segment[i - 1] !== "!" && segment[i - 1] !== "<" && segment[i - 1] !== ">") {
      return segment.slice(0, i).trim();
    }
  }
  return segment.trim();
}

/* ================= Binding-pattern identifier extraction (recursive) ================= */
// Extracts every identifier BOUND by a destructuring/parameter pattern (object `{...}`, array
// `[...]`, plain identifier, or `...rest`), adding each to `out`. Handles arbitrary nesting.
function extractPatternBindings(patternRaw, out) {
  let pattern = stripDefault(patternRaw).trim();
  if (!pattern) return;
  if (pattern.startsWith("...")) {
    extractPatternBindings(pattern.slice(3), out);
    return;
  }
  if (pattern.startsWith("{")) {
    const close = matchingCloseIndex(pattern, 0);
    const inner = close === -1 ? pattern.slice(1) : pattern.slice(1, close);
    for (const prop of splitTopLevelCommas(inner)) {
      let p = prop.trim();
      if (!p) continue;
      if (p.startsWith("...")) {
        extractPatternBindings(p, out);
        continue;
      }
      // `key: valuePattern` (rename) vs plain `key` (shorthand, possibly with a default)
      const colonIdx = findTopLevelColon(p);
      if (colonIdx !== -1) {
        extractPatternBindings(p.slice(colonIdx + 1), out);
      } else {
        extractPatternBindings(p, out);
      }
    }
    return;
  }
  if (pattern.startsWith("[")) {
    const close = matchingCloseIndex(pattern, 0);
    const inner = close === -1 ? pattern.slice(1) : pattern.slice(1, close);
    for (const el of splitTopLevelCommas(inner)) {
      if (!el) continue; // elision (hole)
      extractPatternBindings(el, out);
    }
    return;
  }
  // plain identifier
  const m = pattern.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
  if (m) out.add(m[0]);
}

function findTopLevelColon(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

/* ================= Declared-name collection ================= */
function collectDeclaredNames(masked) {
  const names = new Set();

  // --- imports ---
  // import Def, { a, b as c }, * as ns from "spec";  (any subset/order of the three clauses)
  // Deliberately does NOT require matching quote characters around the module specifier: the
  // masked text has already blanked every string-literal body (INCLUDING its delimiting quotes)
  // to spaces via maskNonCode(), so a regex anchored on a literal `"`/`'` after `from` would never
  // match against masked text. The module specifier itself is irrelevant here — only the clause
  // BEFORE `from` (the local binding names) matters.
  const importRe = /\bimport\s+([^;]+?)\s+from\b/g;
  let m;
  while ((m = importRe.exec(masked))) {
    const clause = m[1];
    // namespace: * as ns
    const nsM = clause.match(/\*\s*as\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (nsM) names.add(nsM[1]);
    // named block: { a, b as c, ... }
    const namedM = clause.match(/\{([^}]*)\}/);
    if (namedM) {
      for (const spec of namedM[1].split(",")) {
        const s = spec.trim();
        if (!s) continue;
        const asM = s.match(/\bas\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*$/);
        if (asM) names.add(asM[1]);
        else {
          const plain = s.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
          if (plain) names.add(plain[1]);
        }
      }
    }
    // default import: leading identifier before `{` or `,` or end, not `*`
    const beforeBrace = clause.split(/[{,]/)[0].trim();
    if (beforeBrace && !beforeBrace.startsWith("*") && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(beforeBrace)) {
      names.add(beforeBrace);
    }
  }
  // side-effect-only `import "spec";` has no clause — nothing to bind, handled by regex not matching.

  // --- function declarations (incl. async/generator) ---
  const funcDeclRe = /\bfunction\s*\*?\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  while ((m = funcDeclRe.exec(masked))) names.add(m[1]);

  // --- class declarations ---
  const classDeclRe = /\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((m = classDeclRe.exec(masked))) names.add(m[1]);

  // --- catch(param) ---
  const catchRe = /\bcatch\s*\(\s*([^)]*)\)/g;
  while ((m = catchRe.exec(masked))) extractPatternBindings(m[1], names);

  // --- for (const|let|var NAME of|in ...) / for (const|let [a,b] of ...) / for(let i=0;...) ---
  const forRe = /\bfor\s*\(\s*(?:const|let|var)\s+([^=;]+?)\s*(?:=|of|in|;)/g;
  while ((m = forRe.exec(masked))) extractPatternBindings(m[1], names);

  // --- const/let/var declarator lists (top-level statement scan, comma-aware across multiple
  //     declarators, each of which may itself have a destructuring pattern with internal commas) ---
  const declKeywordRe = /\b(?:const|let|var)\s+/g;
  while ((m = declKeywordRe.exec(masked))) {
    // Walk forward from just after the keyword, splitting declarators on top-level commas,
    // stopping at the statement-ending top-level `;` (or matching brace/paren depth going
    // negative, e.g. the `for(let i=0;...)` case already handled above, or EOF).
    let i = declKeywordRe.lastIndex;
    let depth = 0;
    let start = i;
    const declarators = [];
    for (; i < masked.length; i++) {
      const c = masked[i];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break; // e.g. inside a for(...) head already handled separately
        depth--;
      } else if (c === ";" && depth === 0) {
        declarators.push(masked.slice(start, i));
        start = i + 1;
        break;
      } else if (c === "," && depth === 0) {
        declarators.push(masked.slice(start, i));
        start = i + 1;
      } else if (c === "\n" && depth === 0) {
        // Allow ASI-style statements without a trailing `;` — stop at newline only if what
        // follows isn't a continuation (a `.`/`,`/operator on the next non-space char). This
        // codebase is semicolon-disciplined (CLAUDE.md: "Semicolons mandatory"), so a bare
        // newline at depth 0 reliably ends the statement.
        declarators.push(masked.slice(start, i));
        start = i + 1;
        break;
      }
    }
    if (start <= i && declarators.length === 0) declarators.push(masked.slice(start, i));
    for (const d of declarators) {
      const eqIdx = findTopLevelEquals(d);
      const pattern = eqIdx === -1 ? d : d.slice(0, eqIdx);
      extractPatternBindings(pattern, names);
    }
  }

  // --- function/arrow/method parameter lists ---
  // 1. `function NAME(...)` / `function(...)` / `function*(...)`
  const funcParamsRe = /\bfunction\s*\*?\s*[A-Za-z_$]*\s*\(/g;
  while ((m = funcParamsRe.exec(masked))) {
    const openIdx = funcParamsRe.lastIndex - 1;
    const closeIdx = matchingCloseIndex(masked, openIdx);
    if (closeIdx === -1) continue;
    const paramsText = masked.slice(openIdx + 1, closeIdx);
    for (const p of splitTopLevelCommas(paramsText)) extractPatternBindings(p, names);
  }
  // 2. arrow functions with a parenthesized param list: `(...)  =>`
  const arrowParenRe = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*=>/g;
  while ((m = arrowParenRe.exec(masked))) {
    for (const p of splitTopLevelCommas(m[1])) extractPatternBindings(p, names);
  }
  // 3. arrow functions with a single bare identifier param (no parens): `x => ...`
  const arrowBareRe = /(?:^|[^A-Za-z0-9_$.])([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g;
  while ((m = arrowBareRe.exec(masked))) {
    if (!RESERVED.has(m[1])) names.add(m[1]);
  }
  // 4. object-literal method shorthand: `NAME(params){` immediately inside an object literal.
  //    Narrowly matched — only fires when the identifier is NOT one of the call-like keywords
  //    and the very next non-space character after the parameter list's closing `)` is `{`
  //    (a real call followed by a block, e.g. `if(x){`, is excluded via the RESERVED check;
  //    a real call `foo(a,b){` is exceedingly rare outside method-shorthand context in practice
  //    for this codebase's style, and any params captured here only ADD extra safe bindings).
  const methodShorthandRe = /(?:^|[,{;\n]\s*)(?:async\s+)?(?:\*\s*)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^()]*)\)\s*\{/g;
  while ((m = methodShorthandRe.exec(masked))) {
    if (RESERVED.has(m[1])) continue;
    // The method/property NAME itself is a DEFINITION here, not a call — add it to the declared
    // set so the call-site scan's later (identical-looking) match on the same text doesn't flag
    // it. This is what makes `constructor(...)`, `r(){...}`, `ev(o){...}`, and friends (class
    // methods) resolve correctly instead of looking like undeclared bare calls.
    names.add(m[1]);
    for (const p of splitTopLevelCommas(m[2])) extractPatternBindings(p, names);
  }

  return names;
}

function findTopLevelEquals(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "=" && depth === 0) {
      const prev = s[i - 1], next = s[i + 1];
      if (next === "=" || prev === "=" || prev === "!" || prev === "<" || prev === ">") continue; // ==, ===, !=, <=, >=
      return i;
    }
  }
  return -1;
}

/* ================= Call-site scan ================= */
const CALL_RE = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;

function findLine(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function checkFile(file, masked, rawLines) {
  const failures = [];
  const declared = collectDeclaredNames(masked);
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(masked))) {
    const name = m[1];
    const idx = m.index;
    if (RESERVED.has(name)) continue;
    if (declared.has(name)) continue;
    if (GLOBAL_ALLOWLIST.has(name)) continue;
    // exclude property/method calls: `.name(` — look at the nearest non-space char before idx
    let p = idx - 1;
    while (p >= 0 && /\s/.test(masked[p])) p--;
    if (p >= 0 && masked[p] === ".") continue;
    // exclude `function NAME(` declarations themselves appearing as a "call" to the regex (the
    // declared-name pass already added NAME, so this is already excluded by declared.has(name)
    // above in the normal case — this guard only matters if the name collides with a global).
    const lineNo = findLine(masked, idx);
    const lineText = (rawLines[lineNo - 1] || "").trim();
    failures.push({ file, line: lineNo, name, lineText });
  }
  return failures;
}

/* ================= Runner ================= */
function main() {
  const files = jsFilesRecursive(SRC_DIR);
  const allFailures = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const raw = fs.readFileSync(file, "utf8");
    const masked = maskNonCode(raw, classify(raw));
    const rawLines = raw.split("\n");
    const failures = checkFile(rel, masked, rawLines);
    allFailures.push(...failures);
  }

  console.log(`Scanned ${files.length} file(s) under src/**/*.js`);
  if (allFailures.length) {
    console.log(`FAIL no-undef (module-internal D-04) — ${allFailures.length} undeclared call-position identifier(s)`);
    for (const f of allFailures) {
      console.error(`  - ${f.file}:${f.line}: "${f.name}(" — ${f.lineText}`);
    }
    process.exit(1);
  }
  console.log("PASS no-undef (module-internal D-04) — every call-position identifier under src/ resolves to an import, a local declaration, or a recognized global");
  process.exit(0);
}

main();
