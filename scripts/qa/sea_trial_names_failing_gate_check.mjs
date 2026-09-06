#!/usr/bin/env node
// scripts/qa/sea_trial_names_failing_gate_check.mjs
//
// A FAILED SEA TRIAL REPORT MUST NAME THE GATE THAT ACTUALLY FAILED.
//
// CEO Review 185 (2026-09-03) caught scripts/sea_trial.mjs's npm-test failure section printing the
// last N lines of the WHOLE run's combined stdout+stderr — which, on the real 140+-gate chain,
// showed fixture chatter from two PASSING gates while the real failure (chart_sweep_conserves_check)
// was never named. "Anyone opening that report concludes the Chartkeeper is broken." Rule 24 stands
// on Wyatt opening a sea-trial report and believing it; a report that misnames its own failure gives
// "did you run the sea trial?" back its evasiveness.
//
// This gate proves two things against a synthetic 4-step chain built from throwaway fixtures under
// scripts/qa/_fixtures/npm_test_culprit/ (pass1 -> pass2_verbose (20 lines of chatter) ->
// fail_short (exits 1, one short stderr line) -> never_run):
//
//   1. THE OLD ALGORITHM IS UNSOUND (red-proof, by construction, not by re-running real npm) —
//      slicing the last 14 lines of a naive stdout-then-stderr concatenation can lose the failing
//      gate's own identifying text entirely once enough trailing noise (npm's own error banner, or
//      a later-but-still-earlier passing gate's chatter) follows it.
//   2. scripts/lib/npm_test_culprit.mjs's findCulprit() gets it right on the SAME chain, every
//      time, because it identifies the culprit by re-running each entry and checking its OWN exit
//      code — never by reading tea leaves out of a combined text blob.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCulprit, renderCulprit, parseChain } from "../lib/npm_test_culprit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..", "..");
const FIX = path.join(__dirname, "_fixtures", "npm_test_culprit");

let failed = false;
const fail = (m) => { console.log(`  FAIL  ${m}`); failed = true; };
const pass = (m) => console.log(`  ok    ${m}`);

const chain = [
  `node ${path.join(FIX, "pass1.mjs")}`,
  `node ${path.join(FIX, "pass2_verbose.mjs")}`,
  `node ${path.join(FIX, "fail_short.mjs")}`,
  `node ${path.join(FIX, "never_run.mjs")}`,
].join(" && ");

console.log("does the failing-gate report name the gate that actually failed?\n");

/* 1/4 -- parseChain splits on ` && ` and preserves every entry, in order. */
{
  const entries = parseChain(chain);
  if (entries.length === 4 && entries[2].includes("fail_short.mjs")) {
    pass("parseChain: 4 entries, index 2 is fail_short.mjs");
  } else {
    fail(`parseChain: expected 4 entries with fail_short.mjs at index 2, got ${JSON.stringify(entries)}`);
  }
}

/* 2/4 -- THE RED-PROOF: the OLD tail-slice algorithm, applied to a combined buffer shaped like the
   real incident (a verbose passing gate, then a short-failing gate, then a long trailing npm error
   banner), loses the failing gate's own identifying text. This proves the OLD approach was unsound
   -- it is not re-running the real bug, it is showing the formula that produced it fails on a
   faithful reconstruction of the failure shape CEO 185 actually found. */
{
  const stdout = "PASS1\n" + Array.from({ length: 20 }, (_, i) => `chatter line ${i + 1} from pass2_verbose`).join("\n") + "\n";
  const fakeNpmBanner = Array.from({ length: 15 }, (_, i) => `npm ERR! banner line ${i + 1}`).join("\n");
  const stderr = "boom\n" + fakeNpmBanner; // "boom" is fail_short.mjs's ONLY identifying output
  const oldTail = (stdout + stderr).trim().split("\n").slice(-14).join("\n");
  if (!oldTail.includes("boom")) {
    pass('RED-PROOF: the old tail(-14) formula loses "boom" (fail_short\'s own output) behind a trailing npm error banner -- exactly the shape of the real incident');
  } else {
    fail('RED-PROOF: expected the old tail(-14) formula to lose "boom" in this adversarial construction, but it did not -- the incident this gate guards against may no longer reproduce this way; do not delete the gate, investigate why');
  }
}

/* 3/4 -- findCulprit identifies the REAL culprit by re-running each entry and checking exit codes,
   never touching a combined-text tail. Must name fail_short.mjs, and must NOT have run never_run.mjs
   (its marker would show up nowhere in the result if the loop stopped early, which it must). */
{
  const result = findCulprit(chain, { cwd: REPO });
  if (result.failed !== true) {
    fail(`findCulprit: expected failed:true, got ${JSON.stringify(result)}`);
  } else if (!result.entry.includes("fail_short.mjs")) {
    fail(`findCulprit: named the wrong entry: ${result.entry}`);
  } else if (!result.stderr.includes("boom")) {
    fail(`findCulprit: culprit's own stderr should contain "boom", got: ${JSON.stringify(result.stderr)}`);
  } else if (result.stdout.includes("SHOULD_NOT_RUN_MARKER") || result.stderr.includes("SHOULD_NOT_RUN_MARKER")) {
    fail("findCulprit: never_run.mjs's marker appeared in the culprit result -- the chain kept running past the failure");
  } else {
    pass("findCulprit: correctly names fail_short.mjs, captures its own \"boom\", never reaches never_run.mjs");
  }
}

/* 4/4 -- renderCulprit's markdown names the failing command explicitly and carries none of
   pass2_verbose's chatter -- the exact defect CEO 185 found in a real report. */
{
  const result = findCulprit(chain, { cwd: REPO });
  const md = renderCulprit(result);
  if (md.includes("FAILING GATE:") && md.includes("fail_short.mjs") && !md.includes("chatter line")) {
    pass("renderCulprit: report block names the failing gate by path, carries no PASSING-gate chatter");
  } else {
    fail(`renderCulprit: expected a block naming fail_short.mjs with no pass2_verbose chatter, got:\n${md}`);
  }
}

console.log(failed ? "\nFAIL" : "\nPASS all sea_trial_names_failing_gate checks");
process.exit(failed ? 1 : 0);
