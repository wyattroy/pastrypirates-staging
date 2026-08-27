#!/usr/bin/env node
// scripts/tree_health_check.js
//
// EVERY GATE IN THE TEST CHAIN MUST EXIST, AND EVERYTHING IT IMPORTS MUST EXIST.
//
// ============================================================================
//  Why this gate exists: one cutover broke SIX instruments and none of them said so
// ============================================================================
// The v2.0 cutover promoted `4/` to the repo root on 2026-08-26. Over the next day and a half these
// were found broken, one at a time, each by accident:
//
//   the browser fleet    navigated to /4/ and loaded a DIRECTORY LISTING — HTTP 200, no game
//   35 lines of docs     told sessions to edit files that no longer existed
//   the gear picker      filtered on `4/`, so EVERY game change reported "GEAR: NONE"
//   sea_trial.mjs        read its build stamp from 4/src/ui/stage.js — crashed before sailing
//   the gear HOOK        matched `4/src/`, so it never fired on a single game edit
//   4/scripts/lib/       aimed at 4/'s engine, which had been deleted
//
// NONE of them failed loudly. A directory listing answers 200. A missing file makes a picker say
// "nothing changed". A hook that matches nothing exits silently and looks like consent.
//
// THE COMMON SHAPE: a path is a CLAIM about the world, written once, and nothing re-checks it.
// This gate re-checks the claims that can silently disable the suite itself.
//
// ============================================================================
//  Why STATIC imports only
// ============================================================================
// A first pass at this scanned every `from "..."`, `import(...)` and `require(...)` it could see,
// and reported 12 broken imports among gates that were all passing. Every one was a FALSE POSITIVE:
// these gates read the game's source AS TEXT and search it for strings like "../shared/index.js",
// so the search TERM looked like an import. A check that cries wolf on a green suite trains its
// reader to ignore it — the exact failure HARD-WON-LESSONS warns about. So: statement-position
// static imports and top-level requires only, which cannot appear inside a quoted search string.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./lib/js_region_tokenizer.js";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);

console.log("tree_health_check — the suite's own paths must point at things that exist\n");

const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
const chain = String(pkg.scripts?.test || "").split("&&").map(s => s.trim()).filter(Boolean);

/* 1. every gate the chain names is really there. A chain entry pointing at a deleted file fails the
      whole run loudly — but a chain that was EDITED to drop a gate fails nothing at all, which is
      why gate_count_check counts them too. This catches the other half: named but absent. */
{
  const missing = [];
  for (const entry of chain) {
    const m = entry.match(/^node\s+(\S+)/);
    if (!m) continue;
    if (!fs.existsSync(path.join(REPO, m[1]))) missing.push(m[1]);
  }
  if (missing.length) fail(`the test chain names ${missing.length} gate(s) that do not exist: ${missing.join(", ")}`);
  else pass(`all ${chain.filter(e => /^node\s/.test(e)).length} gate(s) named in the chain exist`);
}

/* 2. and everything those gates STATICALLY import resolves. This is what would have caught
      net_connected_twin_test.js importing "../../src/net/watchers.js" after the script tree moved:
      the walk still parsed, still looked reasonable, and pointed one level ABOVE the repo. */
{
  const bad = [];
  for (const entry of chain) {
    const m = entry.match(/^node\s+(\S+)/);
    if (!m) continue;
    const gate = path.join(REPO, m[1]);
    if (!fs.existsSync(gate)) continue;
    fs.readFileSync(gate, "utf8").split("\n").forEach((line, i) => {
      // statement position only — never a quoted needle inside a search
      const im = line.match(/^\s*import\s[^"']*["'](\.[^"']+)["']/)
              || line.match(/^\s*(?:const|let|var)\s+[^=]+=\s*require\(\s*["'](\.[^"']+)["']\s*\)/);
      if (!im) return;
      const target = path.resolve(path.dirname(gate), im[1]);
      if (!target.startsWith(REPO + path.sep)) bad.push(`${m[1]}:${i + 1} -> ${im[1]} ESCAPES THE REPO`);
      else if (!fs.existsSync(target)) bad.push(`${m[1]}:${i + 1} -> ${im[1]} MISSING`);
    });
  }
  if (bad.length) fail(`${bad.length} broken import(s) in gates that the chain runs: ${bad.slice(0, 4).join(" | ")}`);
  else pass("every static import in every gate resolves inside the repo");
}

/* 3. no top-level directory is named by a path that does not exist. The generalisation of "4/ is
      gone": ANY tree can be promoted, renamed or deleted, and this asks the question without
      naming a specific one. Segment form only (path.join(REPO, "x", ...)) because that is the
      spelling a text search cannot see — it is how game_url_check's own SCRIPTS constant survived
      three sweeps pointing at path.join(REPO, "4", "scripts"). */
{
  const bad = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : (/\.(mjs|cjs|js)$/.test(e.name) ? [path.join(d, e.name)] : []));

  /* MASK COMMENTS, NOT STRINGS — and the difference is the whole case.
     A first fix masked every non-code region via classify(), which was right for the pirate-register
     gate but WRONG here: the path segments this case must read ARE string literals
     (path.join(REPO, "4", "scripts")), so masking strings blanked the evidence and the case silently
     stopped working. The red-proof is the only reason that was noticed — it went from catching the
     planted fault to reporting 0. A check that quietly stops checking is the exact fault this whole
     gate exists to prevent, committed inside the gate itself.
     So: comments are masked (that clears prose describing the incident, including this file's own),
     and ONE file is allowlisted because its job is to hold example strings OF the defect. */
  const PROSE_OK = new Set(["scripts/game_url_check.js"]);
  const commentsOnly = src => {
    let out = src;
    for (const seg of classify(src)) {
      if (seg.type !== "comment") continue;
      out = out.slice(0, seg.start) + out.slice(seg.start, seg.end).replace(/[^\n]/g, " ") + out.slice(seg.end);
    }
    return out;
  };

  /* A DIRECTORY THAT DOES NOT EXIST YET IS NOT A BROKEN PATH. sea-trial-shots/ and friends are
     CREATED BY THE RUN. .gitignore is already the one place that says what is transient output, so
     this follows it rather than keeping a second list that would rot the same way. */
  const transient = new Set(
    fs.readFileSync(path.join(REPO, ".gitignore"), "utf8").split("\n")
      .map(l => l.trim()).filter(l => l && !l.startsWith("#") && !l.startsWith("!"))
      .map(l => l.replace(/\/$/, "")));

  for (const f of walk(path.join(REPO, "scripts"))) {
    if (PROSE_OK.has(path.relative(REPO, f))) continue;
    commentsOnly(fs.readFileSync(f, "utf8")).split("\n").forEach((line, i) => {
      const m = line.match(/(?:path\.)?(?:join|resolve)\(\s*(?:REPO|ROOT)\s*,\s*["']([^"'/.][^"']*)["']/);
      if (!m) return;
      const seg = m[1];
      if (transient.has(seg)) return;
      if (fs.existsSync(path.join(REPO, seg))) return;
      bad.push(`${path.relative(REPO, f)}:${i + 1} builds a path into "${seg}/", which does not exist`);
    });
  }
  if (bad.length) fail(`${bad.length} path(s) built from a top-level directory that is gone: ${bad.slice(0, 3).join(" | ")}`);
  else pass("no script builds a path into a top-level directory that does not exist");
}

/* 4. RED-PROOF. A check never seen to fail is not a check (CLAUDE.md rule 6). Both directions,
      because case 2's whole design point is that it must stay QUIET on a quoted search needle. */
{
  const realImport   = '  import { netWatchConnected } from "../../src/net/watchers.js";';
  const searchNeedle = '  const needle = "../shared/index.js";   // searched for as TEXT in the game source';
  const re = /^\s*import\s[^"']*["'](\.[^"']+)["']/;
  const catches = re.test(realImport);
  const spares  = !re.test(searchNeedle);
  if (catches && spares) pass("red-proof: catches a real static import, ignores a quoted search needle");
  else fail(`red-proof FAILED (catches:${catches} sparesNeedle:${spares})`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
