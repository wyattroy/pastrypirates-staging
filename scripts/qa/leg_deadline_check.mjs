#!/usr/bin/env node
/* leg_deadline_check.mjs — a leg that stops answering must still END.
 *
 * WHAT THIS COST, 2026-09-01. A full sea trial reached nine of ten legs and then could not finish:
 * crew-desktop overran its own 35-minute cap by 17 minutes having produced not one screenshot, and
 * the run had to be killed by hand. The cap was written as a loop condition —
 *
 *     while (Date.now() - t0 < MAX_MS) { await ...; }
 *
 * — which is only consulted BETWEEN iterations. One await that never resolves (a dead CDP socket, a
 * browser that stopped answering) means the condition is never re-read and the leg runs forever.
 * THE CAP COULD NOT STOP THE ONLY THING IT EXISTED TO STOP.
 *
 * This is the same shape as the vision-judge hang found hours earlier: a timeout that cannot fire
 * because the thing it guards never gives control back. Both were invisible from outside — a leg
 * stuck in an await and a leg working hard look identical in the process table.
 *
 * A deadline has to be a RACE. This drives the real withDeadline() out of the real gate against a
 * promise that genuinely never settles, and requires it to come back anyway.
 */
"use strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const src = readFileSync(join(ROOT, "scripts", "playtest_gate.mjs"), "utf8");

const failures = [];
const check = (label, cond, detail) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.error(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`); }
};

console.log("leg_deadline_check — a stuck leg must still end\n");

/* Lift the REAL function out of the REAL gate and run it. Not a reimplementation: importing the
   gate would start a trial, so the function is extracted and executed as written. */
const fnSrc = (src.match(/function withDeadline\(promise, ms, onTimeout\)\s*\{[\s\S]*?\n\}/) || [])[0];
if (!fnSrc) {
  check("playtest_gate.mjs defines withDeadline()", false, "not found — the leg cap is a loop condition again, which cannot fire inside a stuck await");
} else {
  const withDeadline = new Function(`${fnSrc}; return withDeadline;`)();

  // THE CASE THAT COST THE RUN: a promise that never settles, ever.
  let marked = false;
  const never = new Promise(() => {});
  const t0 = Date.now();
  const out = await withDeadline(never, 120, () => { marked = true; });
  const took = Date.now() - t0;

  check("a promise that NEVER settles still comes back", out === "deadline", `got ${JSON.stringify(out)}`);
  check("it comes back at the deadline, not later", took < 2000, `took ${took}ms`);
  check("it marks the record, so a hang is reported rather than silently forgiven", marked === true);

  // And the other direction, or the deadline would just be a way to cut every leg short.
  const quick = await withDeadline(Promise.resolve("finished"), 5000, () => {});
  check("red-proof: work that DOES finish is returned untouched", quick === "finished", `got ${JSON.stringify(quick)}`);

  // A timer left running would keep the process alive after the fleet is home.
  check("the timer is cleared either way (no dangling handle to outlive the run)", /\.finally\(\(\) => clearTimeout\(timer\)\)/.test(fnSrc));
}

/* And the wiring: a correct helper nothing calls is the defect one level up — which is exactly
   what the leg cap already was. */
check("the crew drive is actually raced against the deadline",
  /await withDeadline\(\s*\n?\s*Promise\.all\(\[playSeat/.test(src) || /await withDeadline\(/.test(src),
  "playSeat is still awaited bare, so a seat that stops answering hangs the leg forever");

if (failures.length) { console.error(`\nFAIL — ${failures.length} failure(s)`); process.exit(1); }
console.log("\nPASS — a leg that stops answering hits a real deadline and reports it");
process.exit(0);
