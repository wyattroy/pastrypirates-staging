#!/usr/bin/env node
/* THE SEA TRIAL MUST NOT SAY "PASS" ABOUT A LEG THAT NEVER SAILED.
 *
 *   node scripts/qa/trial_honesty_check.mjs
 *
 * WHAT THIS COST, 2026-08-27. The trial for build 2026.08.27.3 printed, in ONE report:
 *     | voyages that did NOT run | solo-desktop-wk, solo-phone-wk |
 *   and, forty lines later:
 *     == solo-desktop-wk: PASS (voyage incomplete)
 *     == solo-phone-wk:   PASS (voyage incomplete)
 *   A leg that could not start has no findings, and the summary printed PASS for anything with no
 *   findings. **That is the precise lie the sea trial was named to prevent, printed by the sea
 *   trial.** A skimmer reads PASS.
 *
 * AND THE REASON IT DID NOT RUN WAS ALSO FALSE. playtest_gate.mjs kept its OWN copy of "where is
 * playwright?", looking only in $PW_DIR or /tmp/pw, while scripts/lib/wk.mjs had been taught ~/.pw
 * on the same day. WebKit was installed and launching; the gate could not see it, and printed
 * install advice pointing at /tmp — which docs/DRIVING-THE-GAME.md §8c explicitly warns against,
 * because /tmp is cleared on reboot and that is how the Safari legs died the LAST time.
 * Two answers to one question, kept in step by memory (rule 23). They drifted in a day.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const gate = fs.readFileSync(path.join(ROOT, "scripts/playtest_gate.mjs"), "utf8");

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };

/* ---- 1. a leg that did not run is reported as NOT RUN, never PASS ---- */
console.log("\nA leg that never sailed cannot be reported as a pass");
const { legVerdictLine } = await import(path.join(ROOT, "scripts/lib/leg_verdict.mjs"));
const CASES = [
  ["never ran",        { name: "solo-phone-wk", notRun: "WebKit unavailable", verdict: [], finished: false }, /NOT RUN/,        /PASS/],
  ["ran, no findings", { name: "solo-phone",    verdict: [],                  finished: true  },              /PASS/,           null],
  ["ran, findings",    { name: "crew-phone",    verdict: ["dead control"],    finished: true  },              /FAIL/,           /PASS/],
  ["ran, cut short",   { name: "crew-desktop",  verdict: [],                  finished: false },              /voyage incomplete/, null],
];
for (const [what, r, must, mustNot] of CASES) {
  const line = legVerdictLine(r);
  let good = must.test(line);
  if (good && mustNot && mustNot.test(line)) good = false;
  good ? ok(`${what.padEnd(18)} -> ${line.trim()}`)
       : bad(`${what.padEnd(18)} -> ${line.trim()}   (must match ${must}${mustNot ? `, must NOT match ${mustNot}` : ""})`);
}

/* ---- 2. ONE answer to "where is playwright?" ---- */
console.log("\nOne definition of where playwright lives");
// CODE, not prose. The comment explaining WHY /tmp/pw was wrong must survive — that is the
// graveyard (rule 10), and the first version of this check failed the fix for containing its own
// explanation of the bug it fixed.
const gateCode = gate.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
/\/tmp\/pw/.test(gateCode)
  ? bad('playtest_gate.mjs still hardcodes /tmp/pw IN CODE — docs/DRIVING-THE-GAME.md §8c: /tmp is cleared on reboot, and that is how the Safari legs died once already')
  : ok("playtest_gate.mjs no longer hardcodes a playwright directory in code");
/from "\.\/lib\/wk\.mjs"|from "\.\/lib\/wk\.js"/.test(gate) || /playwrightDir|resolvePlaywright/.test(gate)
  ? ok("it asks scripts/lib/wk.mjs instead of keeping its own copy")
  : bad("it does not defer to wk.mjs — two answers to one question will drift again");

/* ---- 3. and the shared resolver agrees with reality right now ---- */
console.log("\nThe shared resolver can actually find what is installed");
const { playwrightDir } = await import(path.join(ROOT, "scripts/lib/wk.mjs"));
const found = await playwrightDir();
found ? ok(`resolved playwright at ${found}`)
      : bad("no playwright found — if it IS installed, this resolver is the thing that is wrong");

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — the trial can no longer call a missing leg a pass\n");
process.exit(fails ? 1 : 0);
