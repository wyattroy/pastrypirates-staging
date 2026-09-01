#!/usr/bin/env node
/* judge_shut_defers_check.mjs — a check that warns and is then ignored is not a gate.
 *
 * WHAT THIS COST, MEASURED 2026-09-01. A full sea trial ran for 111 minutes and produced nothing
 * for 80 of them. Every one of the seven Chromium legs finished its voyage by 01:42:45Z and then
 * sat inside the vision judge. The trial had ALREADY MEASURED that the judge was broken: its own
 * step 1b printed "can the judge open a screenshot? FAIL -- the eyes are SHUT", in that run and in
 * the one before it, and then handed `--judge=on` to the fleet anyway.
 *
 * ⚠ CORRECTING MY OWN FILING, IN THE OPEN. When this defect was first written up I said the judge
 * "hangs, and there is no timeout behind it". THAT WAS WRONG, and reading the code rather than
 * theorising is what found it: judgeScreen has a 120s timeout and judgeBatch a 300s one
 * (scripts/lib/vision.mjs). The real fault is subtler and worse. A TIMEOUT DOES NOT RESOLVE TO
 * FATAL -- judgeScreen resolves {verdict:"ERROR"} and judgeBatch {unparseable:...}, and only a
 * FATAL trips judgeAll's `fatal` flag. So the designed rescue ("THE JUDGE IS DEAD, NOT THE SCREENS.
 * Defer rather than forfeit") never fires against a judge that is broken rather than absent, and
 * every screen of every leg burns its full timeout instead. Not an infinite hang -- an 80-minute
 * one, which looks identical from outside.
 *
 * THE FIX THIS GUARDS: when 1b says the eyes are shut, the trial DEFERS the screens (queue mode)
 * instead of sailing into a judge it has just proven cannot see. The screens are still captured and
 * still judgeable later by a session; nothing is forfeited. The decision lives in one small pure
 * function so it can be checked here by BEHAVIOUR rather than by grepping a script for a string.
 */
"use strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(`${label}${detail ? `: ${detail}` : ""}`); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("judge_shut_defers_check — the trial must act on its own eye test, not just print it\n");

let judgeModeFor = null;
try { ({ judgeModeFor } = await import("../lib/judge_mode.mjs")); } catch { judgeModeFor = null; }

if (typeof judgeModeFor !== "function") {
  check("scripts/lib/judge_mode.mjs exports judgeModeFor(requested, eyesOk)", false,
    "the module does not exist yet — the trial has nowhere to make this decision except inline, where it cannot be checked");
} else {
  // THE CASE THAT COST THE 80 MINUTES.
  check('eyes SHUT + judge requested "on" -> "queue" (defer, never forfeit)',
    judgeModeFor("on", false) === "queue", `got ${JSON.stringify(judgeModeFor("on", false))}`);

  // The eyes work: nothing changes, judging happens as asked.
  check('eyes OPEN + "on" -> "on" (unchanged)',
    judgeModeFor("on", true) === "on", `got ${JSON.stringify(judgeModeFor("on", true))}`);

  // UNKNOWN IS NOT SHUT. 1b exits 2 when it could not be asked at all; downgrading then would
  // silently stop judging on every machine where the check itself is broken.
  check('eyes UNKNOWN (1b could not be asked) + "on" -> "on"',
    judgeModeFor("on", null) === "on", `got ${JSON.stringify(judgeModeFor("on", null))}`);

  // An explicit human choice outranks the eye test in both directions.
  check('an explicit --judge=off stays off even when the eyes are fine',
    judgeModeFor("off", true) === "off", `got ${JSON.stringify(judgeModeFor("off", true))}`);
  check('an explicit --judge=queue stays queue',
    judgeModeFor("queue", false) === "queue", `got ${JSON.stringify(judgeModeFor("queue", false))}`);
}

/* AND THE WIRING, because a correct function nothing calls is the same defect one level up — which
   is exactly what step 1b itself was: a correct measurement nobody acted on. */
const trial = readFileSync(join(ROOT, "scripts", "sea_trial.mjs"), "utf8");
check("sea_trial.mjs imports judgeModeFor", /judgeModeFor/.test(trial),
  "the trial never asks the question, so the eye test is still decorative");
check("sea_trial.mjs passes the DECIDED mode to the fleet, not the raw request",
  /--judge=\$\{judgeMode\}|`--judge=\$\{judgeMode\}`/.test(trial),
  'the fleet is still handed the raw --judge argument, so a shut-eyed judge is still sailed into');

/* ── AND THE JUDGE THAT DIES MID-RUN, which the deferral above cannot catch: the eye test passed
      thirty seconds ago and the judge broke afterwards. A BROKEN judge is not an ABSENT one, and
      only an absent one used to stop judgeAll — a timeout resolves to {unparseable}, never FATAL,
      so every remaining group paid the batch timeout (300s) AND five single-screen timeouts (120s
      each) in the safety net. Driven here through a seam with a deterministically broken judge,
      because the real one shells out to `claude -p` and a gate must not depend on that. */
{
  const { judgeAll } = await import("../lib/vision.mjs");
  const items = Array.from({ length: 30 }, (_, i) => ({ path: `/s${i}.png`, context: "c", shot: `/s${i}.png` }));
  let batchCalls = 0;
  const broken = await judgeAll(items, {
    concurrency: 1, batch: 5,
    _batchFn: async () => { batchCalls++; return { unparseable: "batch call timed out" }; },
    _oneByOneFn: async (its) => { const a = new Array(its.length); a.fatal = null; return a; },
  });
  check("a judge that answers NOTHING is declared dead instead of timing out on every screen",
    !!broken.fatal, "fatal was never set — the whole fleet would pay a timeout per screen");
  check("it gives up after ONE group, not after all six",
    batchCalls === 1, `it called the judge ${batchCalls} time(s) before giving up`);

  // The other direction, or the breaker would just be a way to stop judging: a judge that WORKS
  // must run every group to the end.
  let goodBatches = 0;
  const working = await judgeAll(items, {
    concurrency: 1, batch: 5,
    _batchFn: async (its) => {
      goodBatches++;
      return { results: new Map(its.map((it) => [it.path, { verdict: "PASS", issues: [], confidence: 1 }])) };
    },
  });
  check("red-proof: a judge that CAN see is never declared dead, and every group is judged",
    !working.fatal && goodBatches === 6, `fatal=${!!working.fatal}, groups judged=${goodBatches} of 6`);
}

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nPASS — a proven-blind judge defers the screens, and one that dies mid-run is caught after a single group");
process.exit(0);
