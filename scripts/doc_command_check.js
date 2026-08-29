#!/usr/bin/env node
// scripts/doc_command_check.js
//
// EVERY COMMAND AND FILE PATH THE DOCS TELL A SESSION TO RUN MUST ACTUALLY EXIST.
//
// Wyatt, 2026-08-26: "If I ask you to run 'sea trial' in a year, how will your documentation know
// what file to open, and which process to run?"
//
// The answer today is that .claude/CLAUDE.md carries the two commands inline and is loaded into
// every session automatically. The answer in a year is "only if something checks" — and until this
// file, nothing did. gate_citation_check.js checks citations inside src/**; the DOCS were
// unguarded, which is precisely where the instructions live.
//
// THIS HAS ALREADY COST SOMETHING. The sea trial printed a sweep command, `qa/matrix.mjs`, that had
// been deleted that same morning and was still referenced in FIVE places — found by a CEO review,
// not by a gate. And the v2.0 cutover will move every `scripts/...` path to `scripts/...`, so on
// that day both CLAUDE.md and QA-PROCESS.md will confidently name files that do not exist.
//
// It also catches a second, sneakier drift: CLAUDE.md's §4 "read this first" table has a MACHINE
// COPY in .claude/hooks/read-the-doc-first.cjs, whose own comment says "Add a row here in the same
// commit that adds a doc to CLAUDE.md §4." On 2026-08-26 a commit whose entire purpose was making
// learnings permanent added the prose row and skipped the enforced one. Nothing noticed. Now
// something does.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const fail = (what) => { failures++; console.log(`  FAIL  ${what}`); };
const pass = (what) => console.log(`  PASS  ${what}`);
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

// The documents that TELL A SESSION WHAT TO DO. If a path here is wrong, a session follows it.
/* EVERY doc, not a hand-kept list of five. The list version scanned CLAUDE.md, QA-PROCESS,
   HARD-WON-LESSONS, DRIVING-THE-GAME and GIT-AND-DEPLOY — so docs/AUDIO.md, which CLAUDE.md §4
   itself tells you to read before touching sound, was never checked, and its link to the audio
   module sat dead for a day after the cutover with this gate reporting all green. A hand-kept
   list of what to guard is the same shape as the bug it is guarding against: it rots silently,
   and nothing says so. Derived from the directory instead. */
const DOCS = [".claude/CLAUDE.md", ".claude/CEO-BRIEF.md",
              ...fs.readdirSync(path.join(REPO, "docs")).filter(f => f.endsWith(".md")).map(f => "docs/" + f)];

console.log("doc_command_check — every command and link the docs name must exist\n");

/* ---- 1. `node <path>` commands ------------------------------------------------------------- */
let cmds = 0, badCmds = [], homeRooted = [];
for (const doc of DOCS) {
  if (!exists(doc)) { fail(`${doc} — the doc itself is missing`); continue; }
  const text = fs.readFileSync(path.join(REPO, doc), "utf8");
  /* `~` IS IN THE CLASS ON PURPOSE — see the home-rooted assertion below. It used to be absent,
     which meant `node ~/foo.cjs` did not match this pattern AT ALL, so the `startsWith("~")` skip
     on the next line was dead code that could never fire. Two layers of the same hole, and a wrong
     command sat in CLAUDE.md rule 21 behind them. */
  for (const m of text.matchAll(/\bnode\s+([~A-Za-z0-9_./-]+\.(?:mjs|js|cjs))/g)) {
    const rel = m[1];
    if (rel.includes("node_modules")) continue;
    if (rel.startsWith("~")) { homeRooted.push(`${doc} -> node ${rel}`); continue; }
    cmds++;
    if (!exists(rel)) badCmds.push(`${doc} -> node ${rel}`);
  }
}
for (const b of badCmds) fail(`a doc tells a session to run a file that does not exist: ${b}`);
if (!badCmds.length) pass(`all ${cmds} \`node …\` commands in the docs point at real files`);

/* A DOCUMENTED COMMAND MUST RUN FROM A FRESH CHECKOUT — Wyatt, 2026-08-28, by falling into it.
   Rule 21 said `node ~/.claude/gsd-core/bin/gsd-tools.cjs validate health`. That path exists on
   Wyatt's Mac and not in a cloud container, so a cloud session ran it, got "No such file", and
   reported to him that the health check "cannot run in a cloud session" — which was false. The
   same tool is in the repo at .claude/gsd-core/bin/. A home-rooted path in a doc is a command that
   works for exactly one machine and silently misleads every other one, so it fails here rather
   than being skipped as "outside the repo on purpose", which is what the old skip called it. */
for (const h of homeRooted)
  fail(`a doc gives a home-rooted command that only runs on one machine: ${h} — use the path inside the repo so it works in every checkout`);
if (!homeRooted.length) pass("every documented `node …` command is repo-relative — it runs the same in a cloud container as on the laptop");

/* ---- 2. relative markdown links between repo files --------------------------------------- */
let links = 0, badLinks = [];
for (const doc of DOCS) {
  if (!exists(doc)) continue;
  const dir = path.dirname(path.join(REPO, doc));
  const text = fs.readFileSync(path.join(REPO, doc), "utf8");
  /* .md AND SOURCE FILES. This used to match `.md` only, and that hole let a real one through:
     docs/AUDIO.md linked `[src/ui/audio.js](../src/ui/audio.js)` for a whole day after the
     cutover deleted `4/`, and this gate reported "all 21 relative doc links resolve" the entire
     time. A doc that hands you a dead path to the SOURCE is exactly as broken as one that hands
     you a dead path to another doc — and the source links are the ones a session actually opens. */
  for (const m of text.matchAll(/\]\((\.{1,2}\/[^)#\s]+\.(?:md|js|mjs|cjs|html|json|py|sh))(?:#[^)]*)?\)/g)) {
    links++;
    if (!fs.existsSync(path.resolve(dir, m[1]))) badLinks.push(`${doc} -> ${m[1]}`);
  }
}
for (const b of badLinks) fail(`a doc links to a file that does not exist: ${b}`);
if (!badLinks.length) pass(`all ${links} relative doc links resolve`);

/* ---- 3. CLAUDE.md §4's table and the HOOK's copy of it must agree ------------------------- */
/* The hook is what actually stops a session; the table is what a human reads. When they disagree,
   the human-facing one wins the argument and the machine silently protects nothing. */
const hookPath = ".claude/hooks/read-the-doc-first.cjs";
if (!exists(hookPath)) {
  fail(`${hookPath} is missing — CLAUDE.md §4 has no machine enforcement at all`);
} else {
  const hook = fs.readFileSync(path.join(REPO, hookPath), "utf8");
  const claude = fs.readFileSync(path.join(REPO, ".claude/CLAUDE.md"), "utf8");
  // every docs/*.md named in the §4 table rows (lines that link a doc AND describe a trigger)
  const tableDocs = new Set();
  for (const m of claude.matchAll(/\|[^|\n]*\[`(docs\/[A-Za-z0-9._-]+\.md)`\]/g)) tableDocs.add(m[1]);
  const missing = [...tableDocs].filter(d => !hook.includes(d));
  if (missing.length) {
    fail(`in CLAUDE.md §4's table but NOT in the hook that enforces it: ${missing.join(", ")}`
       + `\n        -> add them to SUBSYSTEMS in ${hookPath}, as that file's own comment instructs`);
  } else {
    pass(`all ${tableDocs.size} doc(s) in CLAUDE.md §4 are also in the hook's SUBSYSTEMS table`);
  }
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
