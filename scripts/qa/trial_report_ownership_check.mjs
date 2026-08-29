/* TWO MACHINES, ONE REPORT FILE — the collision that was designed in and not foreseen (2026-08-28).
 *
 * WHAT HAPPENED. A handoff was written telling a session on Wyatt's Mac to check out THIS branch
 * and sail the trial, for a cloud-vs-local timing comparison. An hour later a 24-hour autonomous
 * run was set up on the SAME branch. Nobody asked what happens when both are live — and
 * scripts/sea_trial.mjs writes `.planning/SEA-TRIAL.md` at a HARDCODED path, twice (the IN
 * PROGRESS stamp, then the verdict).
 *
 * WHY IT IS WORSE THAN A MERGE CONFLICT. A conflict is loud. This is silent: whichever machine
 * finishes last overwrites the other's verdict, and the surviving report carries an authoritative
 * build stamp while describing a run that happened somewhere else. Rule 24 exists so that "did you
 * run the sea trial?" is answered by OPENING THE REPORT — a report that can quietly describe the
 * wrong machine breaks the one instrument the process stands on. This repo has already paid for
 * exactly this shape once: a killed run left the previous verdict on disk and the file said PASSED
 * on a build carrying 18 unverified fixes (see sea_trial.mjs's own note above the IN PROGRESS
 * stamp — that fix is why the placeholder exists, and it did not cover the two-machine case).
 *
 * THE TWO THINGS THIS ASSERTS, and both are needed:
 *   1. A run can be told where to write (`--report=`), so a comparison run never has to aim at the
 *      authoritative file to be allowed to run at all.
 *   2. EVERY report names the machine it ran on — derived from the environment, never typed — so
 *      no report can be mistaken for the other one's even if both land in the same file. This is
 *      the half that survives somebody forgetting the flag.
 *
 * Run RED against the hardcoded-path version.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const pass = m => console.log("PASS " + m);
const fail = m => { console.log("FAIL " + m); fails++; };
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/\/\/.*$/, "")).join("\n");

const src = strip(fs.readFileSync(path.join(REPO, "scripts/sea_trial.mjs"), "utf8"));

/* 1. the report path is an ARGUMENT, not a constant */
{
  if (/arg\(\s*["']report["']/.test(src)) pass("sea_trial accepts --report= — a comparison run need not aim at the authoritative file");
  else fail("sea_trial has no --report= argument: every run writes the same hardcoded path, so two machines silently overwrite each other");
  /* The literal name must survive in exactly ONE place — the DEFAULT of --report. The
     authoritative report keeps its filename (rule 24: Wyatt opens one known file), so a check
     that banned the name outright would condemn the correct design. What must never exist is the
     name inside a WRITE call, which is what made the two machines collide. First green run of
     this gate flagged the default and was wrong to; narrowed rather than the code bent to it. */
  const inWrites = [...src.matchAll(/writeFileSync\([^)]*SEA-TRIAL\.md/g)].length;
  if (inWrites === 0) pass("no write site names SEA-TRIAL.md literally — every write goes through the resolved path");
  else fail(`${inWrites} writeFileSync call(s) still name SEA-TRIAL.md literally — the flag exists but that writer ignores it`);
  const defaults = [...src.matchAll(/arg\(\s*["']report["'][^)]*SEA-TRIAL\.md/g)].length;
  if (defaults === 1) pass("the authoritative filename survives exactly once, as the default");
  else fail(`--report's default should name SEA-TRIAL.md exactly once (found ${defaults}) — the authoritative report must keep its known filename`);
}

/* 2. BOTH writes honour it — the IN PROGRESS stamp and the verdict. A run that stamps the
      authoritative file and then writes its verdict elsewhere leaves the WORST artifact of all:
      a permanent "IN PROGRESS" on a file nobody will finish. */
{
  const writes = [...src.matchAll(/writeFileSync\(\s*([^,]+),/g)].map(m => m[1].trim());
  const reportWrites = writes.filter(w => /REPORT|report/i.test(w));
  if (reportWrites.length >= 2) pass(`both report writes go through the resolved path (${reportWrites.length} found)`);
  else fail(`only ${reportWrites.length} report write(s) use the resolved path — the IN PROGRESS stamp and the verdict must both honour --report, or a killed comparison run strands "IN PROGRESS" on the authoritative report`);
}

/* 3. every report names WHERE it ran, derived not typed (rule 9) */
{
  if (/function whereRan|const WHERE\s*=/.test(src)) pass("sea_trial derives the machine it ran on");
  else fail("sea_trial does not derive where it ran — a report cannot be told apart from the other machine's");
  const hdr = src.slice(src.indexOf("const report ="));
  if (/\$\{WHERE\}/.test(hdr)) pass("the verdict header states the machine");
  else fail("the verdict header does not state the machine it ran on");
  const stamp = src.slice(src.indexOf("IN PROGRESS") - 400, src.indexOf("IN PROGRESS") + 400);
  if (/\$\{WHERE\}/.test(stamp)) pass("the IN PROGRESS stamp states the machine too");
  else fail("the IN PROGRESS stamp does not state the machine — a stranded placeholder would not say whose it was");
}

console.log(fails ? `\nFAILED — ${fails} assertion(s)` : "\nPASSED — a trial report can never be mistaken for another machine's");
process.exit(fails ? 1 : 0);
