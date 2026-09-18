#!/usr/bin/env node
// scripts/gate_count_check.js
//
// THE FIRST THING `npm test` SAYS, AND THE ONLY REASON TO BELIEVE IT.
//
// ============================================================================
// Why this exists
// ============================================================================
// Before Phase 3, `npm test` was 21 green gates and **not one of them read `4/`** — the game
// Wyatt actually plays. Every one scanned the repo root's `src/`, which has had no code commit
// since 2026-08-02. *A gate aimed at the wrong tree is not silent, it is reassuring*
// (docs/HARD-WON-LESSONS.md §3). A suite in that state is worse than no suite, because it
// answers a question nobody asked in a voice that sounds like the answer to the one they did.
//
// So the suite now OPENS by stating what it is about to cover: how many gates are in the chain.
//
// ============================================================================
// AND THE NUMBER MUST BE FALSIFIABLE — this is the whole design
// ============================================================================
// CLAUDE.md §5 convention 2: *never hand-type a number that can be counted.* A line reading
// `echo "21 gates"` is exactly the unfalsifiable claim that rule exists to kill — it stays
// cheerful forever while gates are added, removed or re-aimed underneath it.
//
// So this file does not print a number. It **counts the entries in the gate manifest**, and exits
// non-zero if that count disagrees with `package.json`'s top-level `"gates".total` — NAMING BOTH
// FIGURES, declared and counted, so the failure tells you which way it drifted.
//
// The declared number is therefore not documentation. It is an assertion, and the manifest is the
// witness.
//
// ============================================================================
// THE LIST MOVED OUT OF package.json — architecture item 63, 2026-09-18
// ============================================================================
// Until this item the witness WAS `package.json`'s `scripts.test` string: 171 `node …` invocations
// joined by `&&`, parsed here and in five other files. npm hands that string to
// `cmd.exe /d /s /c "…"`, which refuses a command line past 8191 characters.
//
// MEASURED, twice, by independent binary search on Wy-Blade (item 24, and again for item 63): the
// longest `scripts.test` that runs is **8154 characters**; at 8155 the run dies with "The command
// line is too long." before a single gate starts. The chain stood at **8150**. Four characters.
// A 172nd gate under ANY name took the whole suite down, and nothing in that error says so.
//
// The list is now `scripts/gates.manifest.json`, walked by `scripts/run_gates.mjs`, and read by
// every consumer through the one reader `scripts/lib/gate_chain.mjs`. `scripts.test` is 26
// characters: `node scripts/run_gates.mjs`.
//
// ⛔ WHICH OPENS A NEW WAY TO LIE, and clause 3 below is the whole reason this file changed rather
// than merely being repointed: a gate written straight into `scripts.test` beside the runner would
// RUN, and be counted by nothing. So `scripts.test` must be the runner and only the runner.
//
// ============================================================================
// It counts itself, deliberately
// ============================================================================
// This file is an entry in the manifest, so it is one of the gates it counts. That is deterministic
// and stable; it is stated here so nobody "fixes" an off-by-one that isn't one. Self-exclusion
// would be the fragile choice, because it would need a rule about which entry to skip, and rules
// like that rot.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readGates, chainString, splitEntry, RUNNER_ENTRY, MANIFEST_PATH } from "./lib/gate_chain.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const PKG_PATH = path.join(REPO_ROOT, "package.json");
const MANIFEST_REL = path.relative(REPO_ROOT, MANIFEST_PATH).split(path.sep).join("/");

const failures = [];

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));

/* ============================ THE RULES, as functions ============================
   Every rule below is a pure function of what it judges, so the red-proof at the bottom can feed
   it a deliberately broken world and watch it go red. A rule inlined into the happy path can only
   ever be seen passing. */

/** RULE 1 — the declared total must equal the counted one, in BOTH directions. */
function totalRule(declared, counted) {
  if (!declared || typeof declared !== "object") {
    return `GATE-COUNT: package.json has no top-level "gates" object. Counted ${counted} gate(s) in ${MANIFEST_REL}. Declare it: "gates": { "total": ${counted} }`;
  }
  if (declared.total !== counted) {
    return `GATE-COUNT-TOTAL: package.json declares "gates.total": ${JSON.stringify(declared.total)}, but ${MANIFEST_REL} actually lists ${counted} gate(s). Declared ${JSON.stringify(declared.total)}, counted ${counted}. Fix whichever is wrong — if you just added or removed a gate, update the declaration in the SAME edit.`;
  }
  return null;
}

/** RULE 2 — THE ANTI-VACUITY FLOOR.
 *  Its ORIGINAL form asked "does even one gate read 4/?", to make it impossible to ship a fully
 *  green suite about a game nobody was developing (HARD-WON-LESSONS §3). With one game and one
 *  script tree that question cannot be asked any more — but the FEAR behind it is permanent, so the
 *  floor survives in the only form still meaningful: a list with no gates in it is not a pass. */
function floorRule(counted) {
  if (counted === 0) {
    return `GATE-COUNT-ZERO: ${MANIFEST_REL} lists NO gates at all. A suite that checks nothing is not a green suite (docs/HARD-WON-LESSONS.md §3).`;
  }
  return null;
}

/** RULE 3 — `scripts.test` IS THE RUNNER AND NOTHING ELSE.
 *  There is exactly one list of gates. A second one appended here would run, uncounted and
 *  unretireable, and would also start walking back toward cmd.exe's 8154-character cliff. */
function chainIsOnlyTheRunnerRule(testScript) {
  if (typeof testScript !== "string" || testScript.trim() === "") {
    return `GATE-CHAIN-EMPTY: package.json has no scripts.test. \`npm test\` is the command a human types; it must stay, and it must be \`${RUNNER_ENTRY}\`.`;
  }
  if (testScript.trim() !== RUNNER_ENTRY) {
    return `GATE-CHAIN-NOT-THE-RUNNER: package.json's scripts.test is ${JSON.stringify(testScript)}, but the ONLY thing it may contain is ${JSON.stringify(RUNNER_ENTRY)}. The list of gates lives in ${MANIFEST_REL}. Anything added here runs OUTSIDE the manifest — uncounted by this gate, invisible to quiet_gate_report, and back on the road to cmd.exe's 8154-character limit that put the list in a manifest in the first place.`;
  }
  return null;
}

/* ============================ THE MEASUREMENT ============================ */

let gates;
try {
  gates = readGates();
} catch (e) {
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
}

const countedTotal = gates.length;

for (const r of [
  totalRule(pkg.gates, countedTotal),
  floorRule(countedTotal),
  chainIsOnlyTheRunnerRule(pkg.scripts && pkg.scripts.test),
]) if (r) failures.push(r);

/* ============================ THE RED-PROOF ============================
   A CASE THAT CANNOT FAIL IS NOT A CASE. Every rule above is fed the mutant that should turn it
   red, and — the half that is usually skipped — the restored world that must stay green, so "it
   went red when I broke it" cannot also be true of a check that was broken all along
   (QA-PROCESS §2a). Pure string work; it costs milliseconds.

   The fourth block is BEHAVIOURAL, because the three rules above say nothing about whether the
   runner actually walks the list. It drives scripts/run_gates.mjs against a throwaway manifest
   shaped pass → verbose-pass → FAIL(2) → never-run and checks it stops, names, and reports the
   gate's OWN exit code. */

const redproof = [];
const rp = (name, went, mutantDesc) => {
  if (went) redproof.push({ ok: true, name });
  else redproof.push({ ok: false, name, why: `the mutant did NOT turn it red — ${mutantDesc}` });
};

/* 1 — the count, drifting UP (a gate added to the manifest and not declared). */
rp("count drifts up", !!totalRule({ total: countedTotal }, countedTotal + 1), "a manifest one entry LONGER than gates.total was accepted");
/* 2 — the count, drifting DOWN (a gate removed and not declared). Both directions, because a
       one-sided count is how a silently shrinking suite stays green. */
rp("count drifts down", !!totalRule({ total: countedTotal }, countedTotal - 1), "a manifest one entry SHORTER than gates.total was accepted");
/* 3 — no gates object at all. */
rp("no gates object", !!totalRule(undefined, countedTotal), "a package.json with no gates object was accepted");
/* 4 — CONTROL: the real pair must be green, or cases 1-3 prove nothing. */
rp("control: the real declared total is green", totalRule(pkg.gates, countedTotal) === null, "the real, unmutated total was reported as a failure");
/* 5 — an empty list. */
rp("empty manifest", !!floorRule(0), "a manifest listing zero gates was accepted as a green suite");
rp("control: a non-empty list is green", floorRule(countedTotal) === null, "the real, non-empty manifest was reported as empty");
/* 6 — a second list appended to scripts.test. THE mutant this clause was written for. */
rp("a gate appended to scripts.test", !!chainIsOnlyTheRunnerRule(`${RUNNER_ENTRY} && node scripts/qa/uncounted_check.mjs`), "a gate running outside the manifest was accepted");
/* 7 — the OLD inline chain put back wholesale (a revert, or a merge that resurrects it). */
rp("the old inline && chain restored", !!chainIsOnlyTheRunnerRule(chainString(gates)), "the 8150-character inline chain was accepted");
/* 8 — the runner pointed at some other manifest. */
rp("the runner aimed at another manifest", !!chainIsOnlyTheRunnerRule(`${RUNNER_ENTRY} --manifest=scripts/other.json`), "a second manifest was accepted");
rp("control: the real scripts.test is green", chainIsOnlyTheRunnerRule(pkg.scripts && pkg.scripts.test) === null, "the real scripts.test was reported as wrong");
/* 9 — the reader refuses what the runner could not run faithfully. Each of these would otherwise
       become a gate that silently does something other than what the manifest says. */
const refuses = (entry) => { try { splitEntry(entry, "redproof"); return false; } catch { return true; } };
rp("an entry carrying a shell operator", refuses("node a.mjs && node b.mjs"), "an entry with `&&` inside it was accepted as one gate");
rp("an entry that is not a node invocation", refuses("bash scripts/deploy-staging.sh"), "a non-node entry was accepted");
rp("an entry with no script", refuses("node"), "a bare `node` was accepted");
rp("control: a real entry parses", !refuses(gates[0]), `the real first entry ${JSON.stringify(gates[0])} was refused`);

/* 10 — BEHAVIOURAL: does the runner stop at the first red, name it, and pass its exit code up? */
{
  const FIX = "scripts/qa/_fixtures/npm_test_culprit";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pp4-run-gates-"));
  const write = (name, list) => {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, JSON.stringify({ gates: list }, null, 2));
    return p;
  };
  const run = (manifest) => {
    const r = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "run_gates.mjs"), `--manifest=${manifest}`], {
      cwd: REPO_ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    });
    return { status: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
  };

  const redManifest = write("red.json", [
    `node ${FIX}/pass1.mjs`,
    `node ${FIX}/pass2_verbose.mjs`,
    `node ${FIX}/exit_code_2.mjs`,
    `node ${FIX}/never_run.mjs`,
  ]);
  const greenManifest = write("green.json", [`node ${FIX}/pass1.mjs`, `node ${FIX}/pass2_verbose.mjs`]);

  const red = run(redManifest);
  const green = run(greenManifest);

  rp("the runner exits non-zero on a red gate", red.status !== 0, "a manifest containing a failing gate exited 0");
  rp("the runner NAMES the failing gate", /FAILING GATE:/.test(red.out) && red.out.includes("exit_code_2.mjs"), `the failure output never named exit_code_2.mjs:\n${red.out.slice(-400)}`);
  rp("the runner STOPS — the gate after the red one never ran", !red.out.includes("SHOULD_NOT_RUN_MARKER"), "never_run.mjs's marker appeared, so the runner kept going past the failure and summarised");
  rp("the runner passes the gate's OWN exit code up (2, not a flattened 1)", red.status === 2, `expected exit 2, got ${red.status} — a runner that flattens every failure to 1 would turn "I could not judge this" into "I judged it and it failed"`);
  rp("control: a manifest of passing gates is green", green.status === 0 && /PASS — all 2 gate\(s\) green/.test(green.out), `expected exit 0 and a PASS line, got ${green.status}:\n${green.out.slice(-400)}`);
  rp("control: the passing run really ran its gates", green.out.includes("PASS1") && green.out.includes("chatter line 20"), "the green run never showed either fixture's own output, so it may have run nothing at all");

  fs.rmSync(tmp, { recursive: true, force: true });
}

const redproofFailures = redproof.filter((r) => !r.ok);

/* ================= Output ================= */
console.log(`gates in \`npm test\`: ${countedTotal} — listed in ${MANIFEST_REL}, in order, run by scripts/run_gates.mjs.`);
console.log(`  red-proof: ${redproof.length - redproofFailures.length}/${redproof.length} case(s) behaved (each rule fed its mutant AND its control).`);

if (failures.length || redproofFailures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  for (const r of redproofFailures) console.error(`  - RED-PROOF "${r.name}": ${r.why}`);
  process.exit(1);
}

console.log(`PASS gate count matches the manifest (declared total ${countedTotal}); scripts.test is the runner and nothing else`);
process.exit(0);
