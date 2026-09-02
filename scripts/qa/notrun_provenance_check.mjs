#!/usr/bin/env node
/* notrun_provenance_check.mjs — a leg may only be called "sailed" by evidence from THIS run.
 *
 * ⚠ THE REPORT LIED, AND THE NOT-RUN COLUMN IS THE ONE THING IT MUST NEVER GET WRONG.
 * Found by CEO Review 64, 2026-09-01, and confirmed by reading the artefact:
 * `.planning/SEA-TRIAL-465-check-3.md:18` says `voyages that did NOT run | none` while its own log
 * carries NINE `playwright not found` errors — all three Safari legs died without starting and the
 * report told Wyatt every leg sailed. `scripts/sea_trial.mjs`'s own comment calls this "the most
 * misleading line in the repo", and rule 24 stands on being able to open that file and believe it.
 *
 * THE MECHANISM, which is subtle and is why it survived: sea_trial reads `report.json` and treats
 * any leg with screens as having sailed. But `playtest_gate` RESUMES a leg whenever a record exists
 * for the same BUILD STAMP, and a resumed record carries the SCREENS OF THE RUN THAT MADE IT. So a
 * leg that failed to start THIS time, but sailed an hour ago, is vouched for by its own ghost.
 * Assembling a fleet out of several runs (which is what happened last night) makes that the normal
 * case rather than the exotic one.
 *
 * THE RULE THIS ENFORCES: evidence must carry its provenance. A leg record stamped with a
 * different run id than the report it is being read into cannot testify that the leg sailed now.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THIS GATE WAS GREEN FOR THE WHOLE LIFE OF THE BUG IT WAS WRITTEN TO CATCH. REBUILT 2026-09-01.
 *
 * The version that shipped with the fix above asked two questions of the SOURCE TEXT of the file
 * it guards — `/__runId/.test(gate)` — and never opened a `report.json` or ran the gate's own
 * record-writing code. Somebody had written the word `__runId` in `playtest_gate.mjs`, so it
 * passed. What was actually true (CEO Review 74, measured with `grep -c "__runId"
 * sea-trial-shots/report.json` → **0**) is that the run id was written into the PER-LEG file only:
 *
 *     results[i] = await runLeg(name, i);                          // no run id on this object
 *     fs.writeFileSync(legFile(name), JSON.stringify({ ...results[i], __runId: RUN_ID }));
 *     ...
 *     fs.writeFileSync(".../report.json", JSON.stringify(results)) // built from the UNSTAMPED one
 *
 * Two objects for one fact, kept in step by nobody — CLAUDE.md rule 23's exact shape. So
 * `sailedHere()` was false for EVERY leg of EVERY run on EVERY machine, and `sea_trial.mjs:265`
 * filed each leg under NOT RUN using its own verdict text as the reason it did not run. The
 * release trial `.planning/SEA-TRIAL-2026-09-01T1644Z-Wy-Blade.md` reads "FAILED — 0 of 10
 * voyage(s) sailed, 10 NOT RUN" above twelve `END OF VOYAGE` lines in its own log.
 *
 * A GATE THAT GREPS THE SOURCE OF THE THING IT GUARDS IS CHECKING THAT SOMEBODY WROTE THE WORD.
 * So this rebuild refuses to ask the source anything it can ask the behaviour instead:
 *   · it EXECUTES the gate's real stamping code and feeds the result to the trial's real
 *     `sailedHere` — the two ends of the seam that broke, driven against each other;
 *   · it asserts the per-leg file and the report entry are ONE object, so they cannot drift again;
 *   · and when a real `sea-trial-shots/report.json` is on disk it OPENS IT — the one check that
 *     would have failed loudly on this machine today.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
"use strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("notrun_provenance_check — only this run's evidence may say a leg sailed\n");

const trial = readFileSync(join(ROOT, "scripts", "sea_trial.mjs"), "utf8");
const gate = readFileSync(join(ROOT, "scripts", "playtest_gate.mjs"), "utf8");

/* ─── 1. THE TRIAL'S HALF: the rule exists as a readable predicate, and behaves. ───────────────
   Driven, not read: the real `sailedHere` out of sea_trial.mjs, applied to fixtures. */
const ruleSrc = (trial.match(/const sailedHere = [\s\S]*?;\n/) || [])[0];
let sailedHere = null;
if (!ruleSrc) {
  check("the provenance rule exists as a readable predicate", false, "could not find `sailedHere` in sea_trial.mjs");
} else {
  sailedHere = new Function("leg", "runId", `${ruleSrc} return sailedHere(leg, runId);`);
  check("a leg with screens from THIS run counts as sailed",
    sailedHere({ name: "a", screens: [1, 2], __runId: "R1" }, "R1") === true);
  check("a leg with screens from ANOTHER run does NOT count as sailed",
    sailedHere({ name: "a", screens: [1, 2], __runId: "R0" }, "R1") === false,
    "an inherited record still vouches for a leg that never started — this is the exact bug");
  check("a leg with no run id at all does NOT count as sailed (unknown is not sailed)",
    sailedHere({ name: "a", screens: [1, 2] }, "R1") === false);
  check("a leg with no screens never counts as sailed",
    sailedHere({ name: "a", screens: [], __runId: "R1" }, "R1") === false);
}

/* ─── 2. THE GATE'S HALF, EXECUTED. ───────────────────────────────────────────────────────────
   The record that goes into report.json is produced by one named stamper in playtest_gate.mjs.
   Pull that arrow function out of the real file and RUN it — a fresh leg result in, a record out —
   then hand the record straight to the trial's own `sailedHere`. If those two ends disagree, the
   report cannot clear a leg, which is precisely what happened. This is the check the old version
   was missing: it crosses the file boundary with values instead of with a grep. */
const stampSrc = (gate.match(/const stampRun = \([\s\S]*?\);\n/) || [])[0];
if (!stampSrc) {
  check("playtest_gate stamps a finished leg through one named function (`stampRun`)", false,
    "no `stampRun` in playtest_gate.mjs — the run id is being attached inline, which is how the per-leg file and report.json came to disagree");
} else {
  let record = null, err = null;
  try {
    const stampRun = new Function("STAMP", "RUN_ID", `${stampSrc} return stampRun;`)("B1", "R1");
    record = stampRun({ name: "solo-desktop", screens: [1, 2, 3], verdict: [] });
  } catch (e) { err = e.message; }
  check("the real stamper runs and returns a record", !!record, err || "stampRun threw");
  if (record) {
    check("the stamped record carries THIS run's id",
      record.__runId === "R1", `got ${JSON.stringify(record.__runId)}`);
    check("the stamped record still carries the build stamp readDone() resumes on",
      record.__stamp === "B1", `got ${JSON.stringify(record.__stamp)}`);
    check("the stamped record keeps everything the leg produced",
      record.name === "solo-desktop" && (record.screens || []).length === 3);
    if (sailedHere) check("END TO END: a freshly stamped record CLEARS the trial's NOT-RUN column",
      sailedHere(record, "R1") === true,
      "the gate's stamp and the trial's rule do not meet — every leg of every run is filed as NOT RUN");
    if (sailedHere) check("END TO END: the same record does NOT clear a LATER run",
      sailedHere(record, "R2") === false);
  }
}

/* ─── 3. ONE OBJECT, WRITTEN TWICE — the structural guarantee that stops the drift returning. ──
   The per-leg file and the report entry must be the SAME object. The bug was two objects built
   separately from one fact; the only durable answer is that there is one of them (rule 23). */
check("the freshly sailed leg is stamped as it is stored, not re-built for the file",
  /results\[i\]\s*=\s*stampRun\(/.test(gate),
  "results[i] is stored unstamped, so report.json inherits an unstamped record");
check("the per-leg file writes results[i] ITSELF, never a second spread of it",
  /writeFileSync\(legFile\(name\),\s*JSON\.stringify\(results\[i\]\)/.test(gate),
  "the file is built from a separate spread — that is the exact shape that let the two disagree");
check("report.json is still written from the same results array",
  /report\.json"\),\s*JSON\.stringify\(results,/.test(gate));

/* AND THE RESUME PATH, which is the whole reason the provenance rule exists (CEO Review 75,
   finding 4). A resumed leg must be stored EXACTLY as it came off disk, carrying the run id of
   whichever run actually sailed it — so `sailedHere` correctly refuses to let it testify for
   today. The plausible "fix" that would quietly restore the original bug is to stamp the resumed
   record with THIS run's id on the way in; that would make every ghost vouch for itself again. */
check("a RESUMED leg is stored as it came off disk, never re-stamped with this run's id",
  /results\[i\] = already;/.test(gate) && !/results\[i\] = stampRun\(already\)/.test(gate),
  "a resumed record is being given this run's id, so a leg that never started today would vouch for itself — the original bug, inverted");

/* ─── 4. THE REAL ARTEFACT, WHEN THERE IS ONE. ────────────────────────────────────────────────
   Every check above could in principle be satisfied by code that never runs. This one opens the
   file the trial actually reads. It SKIPS LOUDLY on a machine that has never sailed (a fresh
   clone, CI) rather than passing quietly — an absent artefact is not evidence of a good one.

   ⚠ AND IT ONLY JUDGES AN ARTEFACT ITS OWN WRITER COULD HAVE PRODUCED. A report.json older than
   `playtest_gate.mjs` was written by superseded code and says nothing about the code standing
   here now — the ten unstamped legs sitting on this machine on 2026-09-01 are exactly that. The
   alternative was to fail until somebody sails an 88-minute trial, which would put the GAME's own
   release gate behind a stale QA artefact: the fault CEO Review 52 caught when the Glass's
   publish lag was wired into `npm test` and a stale dashboard could block a real fix reaching
   players. Derived from the two files' own timestamps, never a hand-kept "known stale" list. */
const reportPath = join(ROOT, "sea-trial-shots", "report.json");
const gatePath = join(ROOT, "scripts", "playtest_gate.mjs");
const staleArtefact = existsSync(reportPath) &&
  statSync(reportPath).mtimeMs < statSync(gatePath).mtimeMs;
if (!existsSync(reportPath)) {
  console.log(`  SKIP  no sea-trial-shots/report.json on this machine — nothing sailed here yet, so there is no artefact to open`);
} else if (staleArtefact) {
  console.log(`  SKIP  sea-trial-shots/report.json predates the playtest_gate.mjs that would write it — superseded code produced it, so it is not evidence about this one. The next trial's report IS judged here.`);
} else {
  let rj = null;
  try { rj = JSON.parse(readFileSync(reportPath, "utf8")); } catch (e) {
    check("the real report.json parses", false, e.message);
  }
  if (Array.isArray(rj)) {
    const withScreens = rj.filter(l => l && (l.screens || []).length > 0);
    if (!withScreens.length) {
      console.log(`  SKIP  the real report.json has no leg with screens — nothing to check provenance on`);
    } else {
      const unstamped = withScreens.filter(l => !l.__runId).map(l => l.name);
      check(`the real report.json carries a run id on all ${withScreens.length} leg(s) that captured screens`,
        unstamped.length === 0,
        `${unstamped.length} without one (${unstamped.slice(0, 4).join(", ")}${unstamped.length > 4 ? ", …" : ""}) — every one of those is filed under NOT RUN whatever it actually did`);
    }
  }
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} failure(s). A report that cannot tell fresh evidence from inherited evidence can call a dead leg a passed one — or, as of 2026-09-01, call ten sailed legs NOT RUN.`);
  process.exit(1);
}
console.log("\nPASS — only this run's own screens can clear a leg from the NOT-RUN column, and the report really carries them");
process.exit(0);
