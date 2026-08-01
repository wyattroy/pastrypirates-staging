#!/usr/bin/env node
// scripts/wind_dot_contract_check.js
//
// The Wave 0 mechanical guard for Phase 19 (safari-check / WIND-00), 19-02-PLAN.md Task 1.
// Mirrors scripts/ui_contract_check.js / scripts/module_graph_check.js's structure: shebang, a
// header naming what is gated and why, one PASS/FAIL line per assertion, every assertion run
// before exit so a single run reports every problem, named failures with file:line,
// self-exclusion of scripts/ (only src/ and index.html are scanned).
//
// WRITTEN BEFORE THE CODE IT GUARDS EXISTS. As of this commit `src/ui/board.js` contains no
// `windDot` symbol at all — the wind-dot prototype (windDotSpecs/windDotFrame, the
// WIND_PROTOTYPE_ENABLED_DEFAULT switch) is built by a LATER plan in this phase. Every assertion
// below is therefore deliberately absence-tolerant: it reports an honest, explicit PASS when the
// region does not exist yet, rather than silently reporting nothing (a check that can only ever
// pass proves nothing — 15-LEARNINGS #2). The moment the region lands, assertion 1 below stops
// tolerating absence and assertions 2/3/5/6 start being genuinely enforced.
//
// ============================================================================
// What is gated and why (BUG-01, D-01, D-12, D-14)
// ============================================================================
// BUG-01 is the milestone's own post-mortem (index.html:97-116, src/ui/board.js:9-30): a LIVE CSS
// gradient plus a mask, composited every frame, crashed Safari to ~2fps. The fix was compositor-
// only motion (transform/opacity, pre-baked tiles) and nothing else has been allowed to touch a
// gradient/mask/blur/filter/box-shadow/backdrop since. This project has no browser test framework
// (19-VALIDATION.md), so there is nothing else standing between a future edit and reintroducing
// exactly that mistake inside the new wind-dot code — assertion 2 is that guard.
//
// D-01 (19-CONTEXT.md) commits the wind-dot prototype to REAL, individually-moving dots — not the
// storm rain's pre-baked tiling-sheet technique, which the rain already proved Safari-safe and
// would teach nothing new if reused here. This guard therefore does not, and must never, accept a
// tiling-sheet implementation as satisfying assertion 2 — the prohibition is that a pass earned
// that way looks like a verdict while testing nothing.
//
// D-12 (19-CONTEXT.md) is this phase's determinism rule: decoration never draws from the shared
// GAME rng (`appState.game.r()`, or the classic-script alias `.r()`), only a PRIVATE
// `mulberry32(seed)` seeded from the game's own seed — exactly the pattern G19 established for the
// storm rain (src/ui/board.js:299-302, `stormLayerSpecs()`). Drawing from `.r()` would advance the
// shared seeded stream and desync every client in a multiplayer room AND all 31 determinism
// fixtures — assertion 3 is the mechanical half of that defence.
//
// D-14 (19-CONTEXT.md) reserves this whole workstream to `src/ui/board.js` and new sprite assets
// ONLY, specifically because Phase 18 (prompts-polish) is concurrently editing `index.html` —
// assertion 4 is what turns that paper rule into something `npm test` enforces.
//
// ============================================================================
// Region markers and extraction order
// ============================================================================
// The two markers below are ASCII-only, byte-exact block comments. They are located on the RAW
// file text FIRST (they are themselves comments, so they must be found before any comment
// handling runs), the text STRICTLY BETWEEN them is taken, and only THEN is `//` / `/* */`
// stripped from that slice before any substring scan.
//
// WHY THIS FILE STRIPS COMMENTS WHEN ui_contract_check.js DELIBERATELY DOES NOT: that file's own
// header explains its choice — index.html's classic-script region carries a `://`-bearing string
// literal (`SVGNS="http://www.w3.org/2000/svg"`) that a naive strip would truncate mid-line. That
// hazard does not apply to the small, purpose-built wind-dot region this file scans, and a
// DIFFERENT hazard applies instead: the region's own explanatory comments will legitimately name
// the exact banned words this guard is checking for (as this very header does, several times,
// naming `mask`/`blur(`/`gradient` in prose) — an unstripped scan would flag the documentation
// that exists to prevent the mistake, not the mistake itself. Stripping is therefore required
// here for the guard to be usable at all. The stripper is mechanical (char-by-char, no string-
// literal awareness) — a `//` or `/*` inside a JS string literal inside the region would also be
// blanked. That is an accepted, narrow limitation of this file's scope (a small hand-written
// decoration region), not of the technique in general.
//
// Failures are always reported against a line number computed on the ORIGINAL file text, never
// the stripped slice — the stripper preserves every character's absolute offset (comment bytes are
// replaced with spaces, newlines are kept as newlines), so offset-to-line mapping stays exact.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = path.join(__dirname, "..");

const BOARD_REL = path.join("src", "ui", "board.js");

const BEGIN_MARKER = "/* ===== WIND DOT PROTOTYPE (Phase 19 / WIND-00) BEGIN ===== */";
const END_MARKER = "/* ===== WIND DOT PROTOTYPE (Phase 19 / WIND-00) END ===== */";

// A trigger, deliberately loose: ANY occurrence of this substring anywhere in board.js is treated
// as "the prototype has started landing" and switches assertions 1/2/3/5/6 from tolerant to
// enforcing. Loose on purpose — a partially-written region (markers present, exports missing; or
// exports present, markers missing) must NOT be mistaken for "not started yet" and silently pass.
const TRIGGER = "windDot";

let importNonce = 0;

/* ================= Small shared helpers ================= */

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

function countOccurrences(text, needle) {
  let count = 0, idx = 0;
  for (;;) {
    idx = text.indexOf(needle, idx);
    if (idx === -1) return count;
    count++;
    idx += needle.length;
  }
}

function lineAt(text, absOffset) {
  let line = 1;
  for (let i = 0; i < absOffset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

// Blanks `//` line comments and `/* */` block comments while preserving every OTHER character's
// exact position (newlines kept as newlines, comment bytes replaced with spaces) — so an offset
// found in the stripped output maps 1:1 onto the same offset in the original slice.
function stripCommentsPreserveLayout(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      for (let k = i; k < end; k++) out += text[k] === "\n" ? "\n" : " ";
      i = end;
    } else if (text[i] === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      const end = nl === -1 ? n : nl;
      for (let k = i; k < end; k++) out += " ";
      i = end;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ================= Assertion 1: region integrity (the anti-silent-pass assertion) ================= */

function checkRegionIntegrity(root) {
  const full = path.join(root, BOARD_REL);
  if (!fs.existsSync(full)) {
    return { ok: false, failures: [`WINDDOT-1: ${BOARD_REL} does not exist`], present: false, canExtract: false, exportsOk: false, text: "" };
  }
  const text = fs.readFileSync(full, "utf8");
  const present = text.includes(TRIGGER);
  if (!present) {
    return { ok: true, failures: [], present: false, canExtract: false, exportsOk: false, text, note: "(region not present yet)" };
  }

  const failures = [];
  const beginCount = countOccurrences(text, BEGIN_MARKER);
  const endCount = countOccurrences(text, END_MARKER);
  if (beginCount !== 1) failures.push(`WINDDOT-REGION: expected exactly 1 BEGIN marker in ${BOARD_REL}, found ${beginCount}`);
  if (endCount !== 1) failures.push(`WINDDOT-REGION: expected exactly 1 END marker in ${BOARD_REL}, found ${endCount}`);

  let beginIdx = -1, endIdx = -1, markersOrdered = false;
  if (beginCount === 1 && endCount === 1) {
    beginIdx = text.indexOf(BEGIN_MARKER);
    endIdx = text.indexOf(END_MARKER);
    markersOrdered = beginIdx < endIdx;
    if (!markersOrdered) {
      failures.push(`WINDDOT-REGION: BEGIN marker must appear before END marker in ${BOARD_REL} (found BEGIN at byte ${beginIdx}, END at byte ${endIdx})`);
    }
  }

  const hasSpecsExport = /\bexport\s+(?:function|const)\s+windDotSpecs\b/.test(text);
  const hasFrameExport = /\bexport\s+(?:function|const)\s+windDotFrame\b/.test(text);
  if (!hasSpecsExport) failures.push(`WINDDOT-EXPORT: ${BOARD_REL} does not export windDotSpecs — required once any windDot symbol exists`);
  if (!hasFrameExport) failures.push(`WINDDOT-EXPORT: ${BOARD_REL} does not export windDotFrame — required once any windDot symbol exists`);

  const canExtract = beginCount === 1 && endCount === 1 && markersOrdered;
  const exportsOk = hasSpecsExport && hasFrameExport;
  return { ok: failures.length === 0, failures, present: true, canExtract, exportsOk, text, beginIdx, endIdx };
}

function buildRegionInfo(root) {
  const a1 = checkRegionIntegrity(root);
  return {
    a1,
    present: a1.present,
    canExtract: !!a1.canExtract,
    exportsOk: !!a1.exportsOk,
    text: a1.text,
    beginIdx: a1.beginIdx,
    endIdx: a1.endIdx,
  };
}

// { raw, stripped, offsetInFile } for the slice strictly between the two markers, or null when the
// markers cannot be located unambiguously (assertion 1 already reports that failure on its own).
function extractedRegion(info) {
  if (!info.canExtract) return null;
  const start = info.beginIdx + BEGIN_MARKER.length;
  const raw = info.text.slice(start, info.endIdx);
  return { raw, stripped: stripCommentsPreserveLayout(raw), offsetInFile: start };
}

/* ================= Assertion 2: compositor-only contract (BUG-01) ================= */

const FORBIDDEN_COMPOSITOR = ["mask", "blur(", "gradient", "filter:", "box-shadow", "backdrop"];

function checkCompositorOnly(root, info) {
  if (!info.present) return { ok: true, failures: [], note: "(region not present yet)" };
  const region = extractedRegion(info);
  if (!region) return { ok: true, failures: [], note: "(region markers invalid — see assertion 1)" };

  const failures = [];
  for (const term of FORBIDDEN_COMPOSITOR) {
    let idx = 0;
    for (;;) {
      const found = region.stripped.indexOf(term, idx);
      if (found === -1) break;
      const abs = region.offsetInFile + found;
      const line = lineAt(info.text, abs);
      const lineText = (info.text.split("\n")[line - 1] || "").trim();
      failures.push(`WINDDOT-COMPOSITOR: ${BOARD_REL}:${line} contains forbidden substring "${term}" inside the wind-dot region (BUG-01) — ${lineText}`);
      idx = found + term.length;
    }
  }
  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 3: determinism contract (D-12) ================= */

function checkDeterminism(root, info) {
  if (!info.present) return { ok: true, failures: [], note: "(region not present yet)" };
  const region = extractedRegion(info);
  if (!region) return { ok: true, failures: [], note: "(region markers invalid — see assertion 1)" };

  const failures = [];
  const gameRngIdx = region.stripped.indexOf(".r()");
  if (gameRngIdx !== -1) {
    const line = lineAt(info.text, region.offsetInFile + gameRngIdx);
    failures.push(`WINDDOT-DETERMINISM: ${BOARD_REL}:${line} calls the seeded GAME rng (.r()) inside the wind-dot region — D-12 (see ${BOARD_REL}:299-302); this advances the shared stream and desyncs every client AND all 31 determinism fixtures. Use a private mulberry32(seed) instead.`);
  }
  const mathRandomMatch = region.stripped.match(/Math\.random/);
  if (mathRandomMatch) {
    const line = lineAt(info.text, region.offsetInFile + mathRandomMatch.index);
    failures.push(`WINDDOT-DETERMINISM: ${BOARD_REL}:${line} calls Math.random() inside the wind-dot region — D-12 (see ${BOARD_REL}:299-302); every browser would get different dots. Use a private mulberry32(seed) instead.`);
  }
  if (!region.stripped.includes("mulberry32(")) {
    failures.push(`WINDDOT-DETERMINISM: the wind-dot region of ${BOARD_REL} never calls mulberry32( — D-12 (see ${BOARD_REL}:299-302) requires a private seeded RNG.`);
  }
  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 4: workstream file ownership (D-14) ================= */

const OWNERSHIP_TOKENS_INDEX_HTML = ["windDot", "windHud", "wdot"];

function checkFileOwnership(root) {
  const failures = [];
  const srcDir = path.join(root, "src");
  for (const file of jsFilesRecursive(srcDir)) {
    const rel = path.relative(root, file);
    if (rel === BOARD_REL) continue; // the one file this workstream owns
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes(TRIGGER)) continue;
    text.split("\n").forEach((line, i) => {
      if (line.includes(TRIGGER)) {
        failures.push(`WINDDOT-OWNERSHIP: ${rel}:${i + 1} contains "${TRIGGER}" — D-14 reserves wind-dot symbols to ${BOARD_REL} only (new sprite assets are the only other permitted addition)`);
      }
    });
  }

  const indexHtml = path.join(root, "index.html");
  if (fs.existsSync(indexHtml)) {
    const lines = fs.readFileSync(indexHtml, "utf8").split("\n");
    for (const token of OWNERSHIP_TOKENS_INDEX_HTML) {
      lines.forEach((line, i) => {
        if (line.includes(token)) {
          failures.push(`WINDDOT-OWNERSHIP: index.html:${i + 1} contains "${token}" — D-14 keeps this workstream's edits inside ${BOARD_REL}; Phase 18 is concurrently editing index.html and must never see a wind-dot symbol land there`);
        }
      });
    }
  }
  return { ok: failures.length === 0, failures };
}

/* ================= Assertion 5: off by default (D-08 / D-10) ================= */

const ENABLED_DEFAULT_RE = /WIND_PROTOTYPE_ENABLED_DEFAULT\s*=\s*false/;

function checkOffByDefault(root, info) {
  if (!info.present) return { ok: true, failures: [], note: "(region not present yet)" };
  if (ENABLED_DEFAULT_RE.test(info.text)) return { ok: true, failures: [] };
  return {
    ok: false,
    failures: [`WINDDOT-OFF-BY-DEFAULT: ${BOARD_REL} does not set WIND_PROTOTYPE_ENABLED_DEFAULT = false — D-08/D-10 require the prototype ship OFF by default so a normal build shows a player nothing until Wyatt turns it on for the Safari verdict.`],
  };
}

/* ================= Assertion 6: pure-half math contract ================= */

async function checkPureMath(root, info) {
  if (!info.present || !info.exportsOk) return { ok: true, failures: [], note: "(exports not present yet)" };

  const full = path.join(root, BOARD_REL);
  const url = `${pathToFileURL(full).href}?windDotDrill=${Date.now()}_${importNonce++}`;
  let mod;
  try {
    mod = await import(url);
  } catch (err) {
    return { ok: false, failures: [`WINDDOT-MATH: import("${BOARD_REL}") threw: ${err && err.message ? err.message : err}`] };
  }

  const failures = [];
  const { windDotSpecs, windDotFrame } = mod;
  if (typeof windDotSpecs !== "function") failures.push(`WINDDOT-MATH: ${BOARD_REL} does not export windDotSpecs as a function`);
  if (typeof windDotFrame !== "function") failures.push(`WINDDOT-MATH: ${BOARD_REL} does not export windDotFrame as a function`);
  if (failures.length) return { ok: false, failures };

  const run = (fn, label) => {
    try {
      return { value: fn(), threw: null };
    } catch (err) {
      failures.push(`WINDDOT-MATH: ${label} threw: ${err && err.message ? err.message : err}`);
      return { value: undefined, threw: err };
    }
  };

  const a = run(() => windDotSpecs(12345, 10), "windDotSpecs(12345,10)").value;
  const b = run(() => windDotSpecs(12345, 10), "windDotSpecs(12345,10) (2nd call)").value;
  if (a !== undefined && b !== undefined && !deepEqual(a, b)) {
    failures.push(`WINDDOT-MATH: windDotSpecs(12345,10) is not reproducible — two calls with the SAME seed produced different output.`);
  }

  const c = run(() => windDotSpecs(999, 10), "windDotSpecs(999,10)").value;
  if (a !== undefined && c !== undefined && deepEqual(a, c)) {
    failures.push(`WINDDOT-MATH: windDotSpecs(12345,10) equals windDotSpecs(999,10) — the seed does not affect the output.`);
  }

  const negOne = run(() => windDotSpecs(1, -1), "windDotSpecs(1,-1)").value;
  if (negOne !== undefined && negOne.length !== 0) failures.push(`WINDDOT-MATH: windDotSpecs(1,-1).length is ${negOne.length}, expected 0.`);

  const zero = run(() => windDotSpecs(1, 0), "windDotSpecs(1,0)").value;
  if (zero !== undefined && zero.length !== 0) failures.push(`WINDDOT-MATH: windDotSpecs(1,0).length is ${zero.length}, expected 0.`);

  const hundred = run(() => windDotSpecs(1, 100), "windDotSpecs(1,100)").value;
  if (hundred !== undefined && hundred.length !== 100) failures.push(`WINDDOT-MATH: windDotSpecs(1,100).length is ${hundred.length}, expected 100.`);

  const hundredOne = run(() => windDotSpecs(1, 101), "windDotSpecs(1,101)").value;
  if (hundredOne !== undefined && hundredOne.length !== 100) failures.push(`WINDDOT-MATH: windDotSpecs(1,101).length is ${hundredOne.length}, expected 100 (count must clamp at 100).`);

  const nullSeed = run(() => windDotSpecs(null, 10), "windDotSpecs(null,10)").value;
  if (nullSeed !== undefined && nullSeed.length !== 10) failures.push(`WINDDOT-MATH: windDotSpecs(null,10).length is ${nullSeed.length}, expected 10 (the seedless demo-board fallback must still produce dots).`);

  // 200 samples across at least two full cycles of a generous window — the exact cycle length is
  // an implementation detail of the not-yet-written windDotFrame, so this samples widely rather
  // than assuming a specific period.
  const sampleSource = a !== undefined && a.length ? a : nullSeed;
  if (sampleSource !== undefined && sampleSource.length) {
    const spec = sampleSource[0];
    const WINDOW_MS = 20000, SAMPLES = 200;
    let frameFailures = 0;
    let firstBad = null;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i * (WINDOW_MS / SAMPLES);
      let frame;
      try {
        frame = windDotFrame(spec, t, 600, 600);
      } catch (err) {
        frameFailures++;
        if (!firstBad) firstBad = `windDotFrame(spec,${t},600,600) threw: ${err && err.message ? err.message : err}`;
        continue;
      }
      const opacityOk = typeof frame?.opacity === "number" && frame.opacity >= 0 && frame.opacity <= 1;
      const xyOk = Number.isFinite(frame?.x) && Number.isFinite(frame?.y);
      if (!opacityOk || !xyOk) {
        frameFailures++;
        if (!firstBad) firstBad = `windDotFrame(spec,${t},600,600) returned ${JSON.stringify(frame)} — opacity must be within [0,1], x and y must both be finite.`;
      }
    }
    if (frameFailures > 0) {
      failures.push(`WINDDOT-MATH: windDotFrame failed ${frameFailures}/${SAMPLES} samples across a ${WINDOW_MS}ms window. First failure: ${firstBad}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

/* ================= Runner (real tree) ================= */

async function runAll(root, { quiet = false } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(...args);
  const results = [];

  const info = buildRegionInfo(root);
  const a1 = info.a1;
  log(`${a1.ok ? "PASS" : "FAIL"} region integrity — WIND DOT PROTOTYPE markers + windDotSpecs/windDotFrame exports${a1.present ? "" : " (region not present yet)"}`);
  results.push({ name: "region-integrity", ...a1 });

  const a2 = checkCompositorOnly(root, info);
  log(`${a2.ok ? "PASS" : "FAIL"} compositor-only contract (BUG-01) — no mask/blur(/gradient/filter:/box-shadow/backdrop in the wind-dot region${a2.note ? " " + a2.note : ""}`);
  results.push({ name: "compositor-only", ...a2 });

  const a3 = checkDeterminism(root, info);
  log(`${a3.ok ? "PASS" : "FAIL"} determinism contract (D-12) — no .r(), no Math.random, mulberry32( present${a3.note ? " " + a3.note : ""}`);
  results.push({ name: "determinism", ...a3 });

  const a4 = checkFileOwnership(root);
  log(`${a4.ok ? "PASS" : "FAIL"} workstream file ownership (D-14) — no windDot/windHud/wdot symbol outside ${BOARD_REL}`);
  results.push({ name: "file-ownership", ...a4 });

  const a5 = checkOffByDefault(root, info);
  log(`${a5.ok ? "PASS" : "FAIL"} off by default (D-08/D-10) — WIND_PROTOTYPE_ENABLED_DEFAULT = false${a5.note ? " " + a5.note : ""}`);
  results.push({ name: "off-by-default", ...a5 });

  const a6 = await checkPureMath(root, info);
  log(`${a6.ok ? "PASS" : "FAIL"} pure-half math contract — windDotSpecs/windDotFrame are reproducible, seed-sensitive, and bounded${a6.note ? " " + a6.note : ""}`);
  results.push({ name: "pure-math", ...a6 });

  return results;
}

/* ================= --drill: prove each assertion CAN fail, against synthetic fixtures ================= */

const SHARED_FIXTURE = `export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
`;

const COMPLIANT_SPECS = `export function windDotSpecs(seed, count) {
  if (!(count > 0)) return [];
  const n = Math.min(count, 100);
  const rnd = mulberry32(seed == null ? 1337 : seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ startT: rnd(), wobbleAmp: rnd(), speed: rnd(), lane: rnd() });
  return out;
}`;

const COMPLIANT_FRAME = `export function windDotFrame(spec, t, w, h) {
  const cycle = 4000;
  const phase = ((t + spec.startT * cycle) % cycle) / cycle;
  const opacity = Math.max(0, Math.min(1, Math.sin(phase * Math.PI * 2) * 0.5 + 0.5));
  return { opacity, x: spec.lane * w, y: phase * h };
}`;

function compliantBoardJs({ enabledDefault = "false", regionExtra = "", omitEnabledLine = false } = {}) {
  const enabledLine = omitEnabledLine ? "" : `export const WIND_PROTOTYPE_ENABLED_DEFAULT = ${enabledDefault};\n`;
  return `import { mulberry32 } from "../shared/index.js";

${enabledLine}${BEGIN_MARKER}
// The wind-dot prototype. Deterministic, seeded via mulberry32 (D-12) — never appState.game.r().
${COMPLIANT_SPECS}

${COMPLIANT_FRAME}
${regionExtra}
${END_MARKER}
`;
}

function drill() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wind-dot-contract-drill-"));
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
  function report(label, expectFail, ok, failures) {
    const drillOk = expectFail ? !ok : ok;
    console.log(`${drillOk ? "PASS" : "FAIL"} ${label} — expected ${expectFail ? "FAIL" : "PASS"}, got ${ok ? "PASS" : "FAIL"}`);
    for (const f of failures || []) console.log(`    ${f}`);
    if (!drillOk) allDrillsOk = false;
    return drillOk;
  }

  console.log(`Red-proof drill — synthetic fixtures under ${tmpRoot}\n`);

  /* ---- Assertion 1: region integrity ---- */

  // 1a: missing END marker
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs().replace(END_MARKER, "// END marker deleted by drill 1a"));
  {
    const r = checkRegionIntegrity(tmpRoot);
    report("drill 1a (region-integrity, missing END marker)", true, r.ok, r.failures);
  }

  // 1b: exports missing (windDotFrame not exported)
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs().replace("export function windDotFrame", "function windDotFrame"));
  {
    const r = checkRegionIntegrity(tmpRoot);
    report("drill 1b (region-integrity, windDotFrame not exported)", true, r.ok, r.failures);
  }

  // 1c: negative control — region absent entirely, PASSes with the explicit note
  resetFixture();
  fixture(BOARD_REL, "export function drawBoard(){}\n");
  {
    const r = checkRegionIntegrity(tmpRoot);
    const ok = report("drill 1c (region-integrity, negative control — absent)", false, r.ok, r.failures);
    if (ok && (r.present !== false || r.note !== "(region not present yet)")) {
      console.log(`    FAIL — expected present:false and the "(region not present yet)" note, got present:${r.present} note:${r.note}`);
      allDrillsOk = false;
    }
  }

  // 1d: negative control — a fully compliant region PASSes
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs());
  {
    const r = checkRegionIntegrity(tmpRoot);
    report("drill 1d (region-integrity, negative control — compliant)", false, r.ok, r.failures);
  }

  /* ---- Assertion 2: compositor-only contract, plus the comment-stripping-both-ways case ---- */

  // 2a: forbidden substring in region CODE must fail
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs({ regionExtra: "const bad = 'blur(4px)';" }));
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkCompositorOnly(tmpRoot, info);
    report("drill 2a (compositor-only, forbidden substring in CODE)", true, r.ok, r.failures);
  }

  // 2b: the SAME forbidden substring inside a region COMMENT must NOT fail (comment-stripping,
  //     half 1 of "works both ways")
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs({ regionExtra: "// never reach for blur( or a mask here again — BUG-01" }));
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkCompositorOnly(tmpRoot, info);
    report("drill 2b (compositor-only, forbidden substring in a COMMENT — comment-stripping half 1/2)", false, r.ok, r.failures);
  }
  // (drill 2a above is comment-stripping half 2/2: the same substring in real code still fails.)

  // 2c: negative control — a compliant region with no forbidden substrings
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs());
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkCompositorOnly(tmpRoot, info);
    report("drill 2c (compositor-only, negative control — compliant)", false, r.ok, r.failures);
  }

  /* ---- Assertion 3: determinism contract (D-12) ---- */

  // 3a: .r() inside the region
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs({ regionExtra: "const x = appState.game.r();" }));
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkDeterminism(tmpRoot, info);
    report("drill 3a (determinism, .r() in region)", true, r.ok, r.failures);
  }

  // 3b: Math.random() inside the region
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs({ regionExtra: "const x = Math.random();" }));
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkDeterminism(tmpRoot, info);
    report("drill 3b (determinism, Math.random() in region)", true, r.ok, r.failures);
  }

  // 3c: mulberry32( never called inside the region
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, `import { mulberry32 } from "../shared/index.js";

${BEGIN_MARKER}
export function windDotSpecs(seed,count){ return []; }
${COMPLIANT_FRAME}
${END_MARKER}
`);
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkDeterminism(tmpRoot, info);
    report("drill 3c (determinism, mulberry32( never called)", true, r.ok, r.failures);
  }

  // 3d: negative control — compliant region passes
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs());
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkDeterminism(tmpRoot, info);
    report("drill 3d (determinism, negative control — compliant)", false, r.ok, r.failures);
  }

  /* ---- Assertion 4: workstream file ownership (D-14) ---- */

  // 4a: a sibling src/ file leaks a windDot symbol
  resetFixture();
  fixture(BOARD_REL, "export function drawBoard(){}\n");
  fixture(path.join("src", "ui", "other.js"), "export const windDotLeak = 1;\n");
  {
    const r = checkFileOwnership(tmpRoot);
    report("drill 4a (file-ownership, sibling src/ file leaks windDot)", true, r.ok, r.failures);
  }

  // 4b: index.html leaks windHud
  resetFixture();
  fixture(BOARD_REL, "export function drawBoard(){}\n");
  fixture("index.html", `<html><body>\n<div id="windHud"></div>\n</body></html>\n`);
  {
    const r = checkFileOwnership(tmpRoot);
    report("drill 4b (file-ownership, index.html leaks windHud)", true, r.ok, r.failures);
  }

  // 4c: negative control — no leaks anywhere
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs());
  fixture("index.html", `<html><body>\nno wind-dot tokens here\n</body></html>\n`);
  {
    const r = checkFileOwnership(tmpRoot);
    report("drill 4c (file-ownership, negative control — no leaks)", false, r.ok, r.failures);
  }

  /* ---- Assertion 5: off by default (D-08/D-10) ---- */

  // 5a: WIND_PROTOTYPE_ENABLED_DEFAULT missing entirely
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs({ omitEnabledLine: true }));
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkOffByDefault(tmpRoot, info);
    report("drill 5a (off-by-default, constant missing)", true, r.ok, r.failures);
  }

  // 5b: WIND_PROTOTYPE_ENABLED_DEFAULT = true (shipped on)
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs({ enabledDefault: "true" }));
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkOffByDefault(tmpRoot, info);
    report("drill 5b (off-by-default, shipped ON)", true, r.ok, r.failures);
  }

  // 5c: negative control — compliant (off) passes
  resetFixture();
  fixture("src/shared/index.js", SHARED_FIXTURE);
  fixture(BOARD_REL, compliantBoardJs());
  {
    const info = buildRegionInfo(tmpRoot);
    const r = checkOffByDefault(tmpRoot, info);
    report("drill 5c (off-by-default, negative control — compliant)", false, r.ok, r.failures);
  }

  /* ---- Assertion 6: pure-half math contract — drilled as async cases below ---- */

  async function drillPureMath() {
    // 6a: reproducibility broken (a module-scope call counter folded into the seed, which trips
    //     NEITHER assertion 3's .r() check NOR its Math.random() check — proving assertion 6
    //     catches something assertion 3 cannot). A counter is used rather than Date.now() because
    //     two calls made back-to-back can land in the same millisecond, which would make the
    //     drill flaky rather than reliably red.
    resetFixture();
    fixture("src/shared/index.js", SHARED_FIXTURE);
    fixture(BOARD_REL, `import { mulberry32 } from "../shared/index.js";

export const WIND_PROTOTYPE_ENABLED_DEFAULT = false;
let __drillCallCount = 0;
${BEGIN_MARKER}
export function windDotSpecs(seed, count) {
  if (!(count > 0)) return [];
  const n = Math.min(count, 100);
  __drillCallCount++;
  const rnd = mulberry32((seed == null ? 1337 : seed) + __drillCallCount);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ startT: rnd(), wobbleAmp: rnd(), speed: rnd(), lane: rnd() });
  return out;
}
${COMPLIANT_FRAME}
${END_MARKER}
`);
    {
      const info = buildRegionInfo(tmpRoot);
      const r = await checkPureMath(tmpRoot, info);
      report("drill 6a (pure-math, not reproducible — a call counter folded into the seed, invisible to assertion 3)", true, r.ok, r.failures);
    }

    // 6b: seed does not affect output
    resetFixture();
    fixture("src/shared/index.js", SHARED_FIXTURE);
    fixture(BOARD_REL, `import { mulberry32 } from "../shared/index.js";

export const WIND_PROTOTYPE_ENABLED_DEFAULT = false;
${BEGIN_MARKER}
export function windDotSpecs(seed, count) {
  if (!(count > 0)) return [];
  const n = Math.min(count, 100);
  const rnd = mulberry32(42);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ startT: rnd(), wobbleAmp: rnd(), speed: rnd(), lane: rnd() });
  return out;
}
${COMPLIANT_FRAME}
${END_MARKER}
`);
    {
      const info = buildRegionInfo(tmpRoot);
      const r = await checkPureMath(tmpRoot, info);
      report("drill 6b (pure-math, seed ignored)", true, r.ok, r.failures);
    }

    // 6c: count is not clamped at 100
    resetFixture();
    fixture("src/shared/index.js", SHARED_FIXTURE);
    fixture(BOARD_REL, `import { mulberry32 } from "../shared/index.js";

export const WIND_PROTOTYPE_ENABLED_DEFAULT = false;
${BEGIN_MARKER}
export function windDotSpecs(seed, count) {
  if (!(count > 0)) return [];
  const rnd = mulberry32(seed == null ? 1337 : seed);
  const out = [];
  for (let i = 0; i < count; i++) out.push({ startT: rnd(), wobbleAmp: rnd(), speed: rnd(), lane: rnd() });
  return out;
}
${COMPLIANT_FRAME}
${END_MARKER}
`);
    {
      const info = buildRegionInfo(tmpRoot);
      const r = await checkPureMath(tmpRoot, info);
      report("drill 6c (pure-math, count not clamped at 100)", true, r.ok, r.failures);
    }

    // 6d: seedless call throws instead of falling back
    resetFixture();
    fixture("src/shared/index.js", SHARED_FIXTURE);
    fixture(BOARD_REL, `import { mulberry32 } from "../shared/index.js";

export const WIND_PROTOTYPE_ENABLED_DEFAULT = false;
${BEGIN_MARKER}
export function windDotSpecs(seed, count) {
  if (!(count > 0)) return [];
  if (seed == null) throw new Error("no seed given");
  const n = Math.min(count, 100);
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ startT: rnd(), wobbleAmp: rnd(), speed: rnd(), lane: rnd() });
  return out;
}
${COMPLIANT_FRAME}
${END_MARKER}
`);
    {
      const info = buildRegionInfo(tmpRoot);
      const r = await checkPureMath(tmpRoot, info);
      report("drill 6d (pure-math, seedless call throws)", true, r.ok, r.failures);
    }

    // 6e: windDotFrame returns an out-of-range opacity
    resetFixture();
    fixture("src/shared/index.js", SHARED_FIXTURE);
    fixture(BOARD_REL, `import { mulberry32 } from "../shared/index.js";

export const WIND_PROTOTYPE_ENABLED_DEFAULT = false;
${BEGIN_MARKER}
${COMPLIANT_SPECS}
export function windDotFrame(spec, t, w, h) {
  return { opacity: 2, x: spec.lane * w, y: t };
}
${END_MARKER}
`);
    {
      const info = buildRegionInfo(tmpRoot);
      const r = await checkPureMath(tmpRoot, info);
      report("drill 6e (pure-math, opacity out of [0,1])", true, r.ok, r.failures);
    }

    // 6f: negative control — a fully compliant implementation passes
    resetFixture();
    fixture("src/shared/index.js", SHARED_FIXTURE);
    fixture(BOARD_REL, compliantBoardJs());
    {
      const info = buildRegionInfo(tmpRoot);
      const r = await checkPureMath(tmpRoot, info);
      report("drill 6f (pure-math, negative control — compliant)", false, r.ok, r.failures);
    }
  }

  return drillPureMath().then(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    console.log(`\n${allDrillsOk ? "ALL 6 ASSERTIONS RED-PROOF DRILLED OK" : "DRILL FAILURE — an assertion did not fail against its own synthetic violation"}`);
    process.exit(allDrillsOk ? 0 : 1);
  });
}

/* ================= Entry ================= */

if (process.argv.includes("--drill")) {
  drill();
} else {
  const results = await runAll(REAL_ROOT);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error("\nFAILURES:");
    for (const r of failed) for (const f of r.failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}
