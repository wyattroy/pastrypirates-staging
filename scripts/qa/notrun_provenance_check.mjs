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
 * Drives the REAL derivation out of sea_trial.mjs against fixtures — never a paraphrase of it.
 */
"use strict";
import { readFileSync } from "node:fs";
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

/* 1. Every leg record must carry the id of the run that produced it. Without that the reader has
      no way to tell a fresh result from an inherited one -- which is the whole bug. */
check("playtest_gate stamps each leg record with the run that produced it",
  /__runId/.test(gate),
  "leg records carry only a build stamp, so a resumed record is indistinguishable from a fresh one");

check("report.json carries the run id too, so a reader has something to compare against",
  /__runId/.test(gate) && /runId/.test(gate),
  "nothing in the report identifies the run");

/* 2. And sea_trial must actually USE it -- a stamped record nobody checks is the same defect one
      level along, which is exactly what happened with the eye test earlier the same night. */
check("sea_trial refuses to let a FOREIGN run's screens vouch for a leg",
  /__runId/.test(trial),
  "sea_trial still treats any screens as proof the leg sailed, whatever run they came from");

/* 3. The behaviour itself, driven rather than read. The rule is small enough to state exactly:
      screens from another run must not clear a leg. */
const ruleSrc = (trial.match(/const sailedHere = [\s\S]*?;\n/) || [])[0];
if (!ruleSrc) {
  check("the provenance rule exists as a readable predicate", false, "could not find `sailedHere` in sea_trial.mjs");
} else {
  const sailedHere = new Function("leg", "runId", `${ruleSrc} return sailedHere(leg, runId);`);
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

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} failure(s). A report that cannot tell fresh evidence from inherited evidence can call a dead leg a passed one.`);
  process.exit(1);
}
console.log("\nPASS — only this run's own screens can clear a leg from the NOT-RUN column");
process.exit(0);
