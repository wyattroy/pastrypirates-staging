#!/usr/bin/env node
// scripts/gate_citation_check.js
//
// NO COMMENT IN `4/` MAY CLAIM A CHECK GATES IT WHEN THAT CHECK NEVER OPENS `4/`.
//
// ============================================================================
// Why this exists — the count is the argument
// ============================================================================
// ROADMAP names TWO dangling gate citations in `4/`. Counted on 2026-08-23: there are about SIXTY.
// (And both of ROADMAP's line numbers had drifted since intake and now point at unrelated code,
// which is its own small lesson about citing a line rather than a fact.)
//
// Nearly every one of them names a gate under the repo ROOT's `scripts/`, and until the night this
// file was written EVERY root gate read the ROOT tree — the v1 game, no code commit since
// 2026-08-02, nobody developing it. So a comment in the game we actually ship, saying "this is
// gated by scripts/ui_contract_check.js", was describing a check that had never once opened the
// file the comment sits in. *A gate aimed at the wrong tree is not silent, it is reassuring*
// (docs/HARD-WON-LESSONS.md §3) — sixty times over, in prose, where the next session reads it and
// believes it.
//
// ============================================================================
// This is D-37 work: a UNIVERSAL RULE, not sixty one-off corrections
// ============================================================================
// A hand sweep relapses on the next comment somebody writes. A gate does not. So the gate is built
// FIRST, it produces the list, and then the list gets fixed.
//
// ============================================================================
// What counts as a citation — DERIVED, never a hardcoded list (CLAUDE.md rule 9)
// ============================================================================
// A mention in `src/**` or `index.html` is a CITATION when either:
//   (a) it carries an explicit `scripts/` or `scripts/` path prefix — unambiguous, and
//       DELIBERATELY independent of whether the file exists, because "cites a check that does not
//       exist" is one of the three things this gate is here to catch; or
//   (b) it is a bare filename that exists under `scripts/` or `scripts/`.
//
// The universe for (b) is read off the filesystem every run, so a gate added tomorrow is citable
// tomorrow and this file needs no edit. A hardcoded list of gate names would go stale in exactly
// the direction that hides work (CLAUDE.md rule 9).
//
// Three spellings are all recognised, because all three are in use:
//     scripts/module_graph_check.js     explicit root
//     scripts/seat_arg_check.js       explicit 4/
//     module_graph_check.js             bare — resolved to the 4/ copy if one exists, else root
//
// THE ONE THING THIS CANNOT SEE, stated rather than left to be discovered: a BARE filename naming
// a gate that does not exist. `bakeoff_tune.js` written with no path is indistinguishable from
// ordinary prose about a file, and treating every unknown `*.js` word as a dangling citation would
// flag every mention of flow.js and board.js in the tree. Write the path prefix and this gate can
// see it. Everything with a prefix IS checked for existence.
//
// ============================================================================
// When a citation is SATISFIED
// ============================================================================
// The named file must EXIST, and it must COVER `4/` — meaning either:
//   (a) it lives under `scripts/`, so it is 4/-only by construction, or
//   (b) it is invoked in `package.json`'s own `scripts.test` chain carrying `--tree=4`.
//
// (b) IS READ OUT OF THE TEST CHAIN ON EVERY RUN, NEVER FROM A LIST TYPED HERE. That is the whole
// point: the day a gate leaves the chain, or loses its `--tree=4`, every comment in `4/` claiming
// that gate protects it becomes false — and this gate must notice THAT DAY. A list typed in this
// file would not. Same reasoning as scripts/gate_count_check.js, which asserts the chain's shape
// rather than describing it.
//
// ============================================================================
// THE HONEST EXCEPTION, and why it has to be possible
// ============================================================================
// src/ui/util.js:1381 already says, correctly, that a root gate's pins read the ROOT tree's
// src/ui/util.js and not that file. THAT COMMENT IS TRUE. Telling anyone to "fix" it would make
// the record worse, and a gate that forces a true sentence to be deleted is a gate that degrades
// the thing it protects.
//
// So a citation may be DECLARED. There are exactly TWO canonical marker tokens, and they say two
// genuinely different things — which is why there are two and not one. Collapsing them would make
// `grep` return a number that means nothing, and the second number is the one worth watching:
//
// A MARKER DECLARES ONLY THE SCRIPT IT NAMES, and it must name one. `[UNGATED-IN-4: foo.js ...]`
// declares the `foo.js` citation on that line and NOTHING ELSE on it. This is not fussiness — the
// first cut of this sweep scoped markers to the whole LINE, and six lines in 4/ read
// "scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically":
// one of those two now reads 4/ and the other does not, so a line-scoped marker silently declared
// a TRUE citation as a known gap. A marker that can quietly cover the citation next to it is the
// fuzzy-scope failure this file's own rule warns about, committed by the file itself.
//
//     ROOT-TREE-CITATION   The sentence is TRUE AS WRITTEN and is ABOUT THE ROOT TREE ON PURPOSE.
//                          Nothing is wrong here and nothing is owed. Example: src/ui/util.js
//                          saying narration_test.js's G28 pins read the ROOT tree's util.js, not
//                          this one — which is a fact, checked by path, and correcting it would
//                          make the record worse.
//
//     UNGATED-IN-4         The named script is REAL but does NOT read `4/`. The comment therefore
//                          describes NO PROTECTION OF THIS FILE, the sentence has been corrected
//                          to say so, and the gap is known. THIS IS AN ADMISSION, NOT AN EXCUSE.
//                          Its count is a debt: it should fall as gates are ported, and any rise
//                          is somebody writing a new false claim.
//
// ONE SPELLING EACH. Defined here, greppable, and a marker must sit ON THE SAME LINE as the
// citation it declares — not "somewhere nearby", because a marker whose scope is fuzzy silently
// declares the next citation too. An exception you can count is a completely different animal
// from an exception you cannot see:
//
//     grep -rn "ROOT-TREE-CITATION\|UNGATED-IN-4" src index.html
//
// Text INSIDE a marker bracket is not itself scanned for citations — the marker names a script by
// design, and counting that mention would inflate every number this gate prints.
//
// NEVER DELETE A CITATION TO SILENCE THIS GATE. A comment that named a real protection and now
// names none is information — it is the whole finding. Declare it; do not erase it.
//
// ============================================================================
// ANTI-VACUITY
// ============================================================================
// This gate PRINTS THE NUMBER OF CITATIONS IT SCANNED, every run, always. A citation gate that
// finds nothing to check looks identical to one that passes — the same reason
// scripts/seat_arg_check.js prints the 161 call sites it read (HARD-WON-LESSONS §1b). It also
// FAILS outright if it finds zero citations or an empty script universe, because both mean the
// scanner is broken rather than the tree being clean.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const FOUR = REPO_ROOT;

const MARKER_ROOT = "ROOT-TREE-CITATION";   // true as written, about the root tree on purpose
const MARKER_UNGATED = "UNGATED-IN-4";      // real script, does not read 4/, known gap — a DEBT
// `[<TOKEN>: ...text naming the script... ]` — the bracket bounds the marker's SCOPE.
const MARKER_RE = /\[(ROOT-TREE-CITATION|UNGATED-IN-4):([^\]]*)\]/g;

const failures = [];

/* ================= The script universe, read off disk ================= */

function filesRecursive(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesRecursive(full, exts));
    else if (e.isFile() && exts.some((x) => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

const SCRIPT_EXTS = [".js", ".mjs", ".cjs"];
const universe = new Map(); // basename -> Set of repo-relative paths
for (const dir of [path.join(REPO_ROOT, "scripts"), path.join(FOUR, "scripts")]) {
  for (const f of filesRecursive(dir, SCRIPT_EXTS)) {
    const rel = path.relative(REPO_ROOT, f);
    const base = path.basename(f);
    if (!universe.has(base)) universe.set(base, new Set());
    universe.get(base).add(rel);
  }
}

/* ================= Which gates cover 4/, read out of the test chain ================= */

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
const chain = (pkg.scripts && pkg.scripts.test) || "";
const coversFour = new Set(); // repo-relative script paths that read 4/ inside `npm test`
for (const entry of chain.split("&&").map((x) => x.trim())) {
  const m = entry.match(/^node\s+(\S+)/);
  if (!m) continue;
  const script = m[1];
  if (script.startsWith("scripts/") || /--tree=4(\s|$)/.test(entry)) coversFour.add(script);
}

/* ================= Resolving a cited name to a real file ================= */
// A file under scripts/ covers 4/ by construction, whether or not it is in the chain — it can
// only read 4/. A file under scripts/ covers 4/ only when the chain says so.
function resolveCitation(explicitPrefix, base) {
  const candidates = universe.get(base);
  if (!candidates) return null;
  const four = `scripts/${base}`;
  const rootDirect = `scripts/${base}`;
  if (explicitPrefix === "scripts/") return candidates.has(four) ? four : null;
  if (explicitPrefix === "scripts/") {
    if (candidates.has(rootDirect)) return rootDirect;
    // a nested one, e.g. scripts/lib/load_engine.js
    const nested = [...candidates].find((c) => c.startsWith("scripts/"));
    return nested || null;
  }
  // BARE NAME. Prefer the 4/ copy — a bare filename written inside a 4/ source file most
  // naturally means the 4/ one, and where both exist they are byte-identical twins anyway
  // (scripts/lib_twin_check.js is what keeps that true).
  if (candidates.has(four)) return four;
  return [...candidates].find((c) => c.startsWith("scripts/")) || [...candidates][0];
}

function citationCoversFour(rel) {
  if (rel.startsWith("scripts/")) return true;
  return coversFour.has(rel);
}

/* ================= The scan ================= */
// Matches an optional `scripts/` or `scripts/` (with optional subdirectory) followed by a
// filename. Everything whose basename is not in the universe is discarded, which is what keeps
// `flow.js`, `board.js` and every other ordinary source mention out of the results.
const CITATION_RE =
  /(?:(4\/)?scripts\/((?:[A-Za-z0-9_.-]+\/)*))?([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|mjs|cjs))/g;

const scanTargets = [
  ...filesRecursive(path.join(FOUR, "src"), [".js"]),
  ...(fs.existsSync(path.join(FOUR, "index.html")) ? [path.join(FOUR, "index.html")] : []),
];

let scanned = 0;
let satisfied = 0;
let markedRoot = 0;
let markedUngated = 0;

for (const file of scanTargets) {
  const rel = path.relative(REPO_ROOT, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // Marker brackets first: their character ranges are excluded from the scan, and the script
    // names inside them are what the markers declare.
    const markerSpans = [];
    const declaredRoot = new Set();
    const declaredUngated = new Set();
    MARKER_RE.lastIndex = 0;
    let mk;
    while ((mk = MARKER_RE.exec(line))) {
      markerSpans.push([mk.index, mk.index + mk[0].length]);
      const target = mk[1] === MARKER_ROOT ? declaredRoot : declaredUngated;
      for (const nm of mk[2].matchAll(/[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|mjs|cjs)/g)) target.add(nm[0]);
    }
    const insideMarker = (idx) => markerSpans.some(([a, b]) => idx >= a && idx < b);

    CITATION_RE.lastIndex = 0;
    let m;
    while ((m = CITATION_RE.exec(line))) {
      if (insideMarker(m.index)) continue;
      const base = m[3];
      const explicitPrefix = m[0].startsWith("scripts/")
        ? "scripts/"
        : m[0].startsWith("scripts/")
          ? "scripts/"
          : null;
      // A prefixed mention is a citation whether or not the file is there — that is how a citation
      // of a DELETED gate gets caught. A bare mention has to earn it by naming something real.
      if (!explicitPrefix && !universe.has(base)) continue;
      scanned++;

      // A marker declares this citation only if it NAMES it.
      if (declaredRoot.has(base)) { markedRoot++; continue; }
      if (declaredUngated.has(base)) { markedUngated++; continue; }

      const resolved = resolveCitation(explicitPrefix, base);
      if (!resolved) {
        failures.push(
          `CITATION-MISSING: ${rel}:${i + 1} cites "${m[0]}", which does not exist. Name the check that actually gates this, or say plainly that nothing does and mark the line ${MARKER_UNGATED} — do NOT delete the sentence, because a comment that named a real protection and now names none is information.`
        );
        continue;
      }
      if (!citationCoversFour(resolved)) {
        failures.push(
          `CITATION-BLIND: ${rel}:${i + 1} cites "${m[0]}" (-> ${resolved}), which does NOT read 4/. It is not under scripts/ and it is not invoked in package.json's test chain with --tree=4, so it has never opened the file this comment sits in. Three honest ways out: give that gate --tree=4 in the chain; or correct the sentence to name what actually gates this and mark it ${MARKER_UNGATED}; or — if the citation really is about the root tree on purpose and is true as written — mark it ${MARKER_ROOT}. Do NOT delete the citation.`
        );
        continue;
      }
      satisfied++;
    }
  });
}

/* ================= Output ================= */

console.log(
  `citations scanned: ${scanned} across ${scanTargets.length} file(s) in src + index.html — ${satisfied} satisfied by a gate that reads 4/, ${markedRoot} declared ${MARKER_ROOT} (true as written), ${markedUngated} declared ${MARKER_UNGATED} (KNOWN GAP — this number is a debt and should fall), ${failures.length} unsatisfied. Script universe: ${universe.size} distinct filename(s) under scripts/ and scripts/; ${coversFour.size} chain entr(y/ies) read 4/.`
);

if (universe.size === 0) {
  console.error(`FAIL: the script universe is EMPTY — nothing under scripts/ or scripts/ was found, so every citation below would have been silently discarded as "not a gate name". The scanner is broken, not the tree.`);
  process.exit(1);
}
if (scanned === 0) {
  console.error(`FAIL: ZERO citations found across ${scanTargets.length} scanned file(s). There were about sixty on 2026-08-23. A citation gate that finds nothing to check looks exactly like one that passes — this is the anti-vacuity floor, not a real green.`);
  process.exit(1);
}

if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`PASS every gate citation in 4/ names a check that reads 4/, or is declared ${MARKER_ROOT} / ${MARKER_UNGATED}`);
process.exit(0);
