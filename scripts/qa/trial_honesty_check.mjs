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
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const gate = fs.readFileSync(path.join(ROOT, "scripts/playtest_gate.mjs"), "utf8");

let fails = 0;
const ok  = (m) => console.log("  PASS  " + m);
const bad = (m) => { fails++; console.log("  FAIL  " + m); };

/* ---- 1. a leg that did not run is reported as NOT RUN, never PASS ---- */
console.log("\nA leg that never sailed cannot be reported as a pass");
const { legVerdictLine } = await import(pathToFileURL(path.join(ROOT, "scripts/lib/leg_verdict.mjs")).href);
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
const { playwrightDir } = await import(pathToFileURL(path.join(ROOT, "scripts/lib/wk.mjs")).href);
const found = await playwrightDir();
found ? ok(`resolved playwright at ${found}`)
      : bad("no playwright found — if it IS installed, this resolver is the thing that is wrong");

/* ⚠ AND THE LAUNCHER MUST USE THAT SAME ANSWER. This section certified playwrightDir() while
   openWebKit() — the function that actually launches Safari — kept its OWN candidate list and
   imported each entry as a RAW PATH. On Windows that is fatal and silent: import("C:\...") is
   parsed as the protocol "c:" and rejected, so every candidate threw and the error read "playwright
   not found" while playwright was installed and importable. Three Safari legs reported NOT RUN on
   the Razer for days because of it, and THIS CHECK STAYED GREEN THROUGHOUT — it was asking the
   working resolver about a launcher that never called it. Exactly the drift the section above
   warns about, one function further down. */
const wkSrc = fs.readFileSync(path.join(ROOT, "scripts/lib/wk.mjs"), "utf8");
/await playwrightDir\(\)/.test(wkSrc)
  ? ok("openWebKit asks the shared resolver rather than keeping a second candidate list")
  : bad("openWebKit resolves playwright by itself again — two answers to one question, and the launcher's copy is the one that decides whether Safari sails");
const rawPathImports = [...wkSrc.matchAll(/await import\(([^;]*?)\)\s*[;,)]/g)]
  .map((m) => m[1])
  .filter((a) => /path\.join|homedir\(\)/.test(a) && !/pathToFileURL/.test(a));
rawPathImports.length === 0
  ? ok("no INLINE raw filesystem path is handed to import() (a path laundered through a variable would slip past this one — the check above is the real guard)")
  : bad(`wk.mjs hands a raw filesystem path to import(): ${rawPathImports[0].slice(0, 70)} — on Windows that is read as the protocol "c:" and throws, which is exactly how Safari coverage vanished. Wrap it in pathToFileURL().`);

/* ---- 4. AND EVERY LEG THAT SAILED MUST HAVE ITS VERDICT PRINTED ----
   The 2026.08.29.1 report showed EIGHT verdicts for TEN legs. `solo-desktop: FAIL` and
   `solo-phone: FAIL` were both in the run's own final summary and neither reached the file, because
   the writer printed `gateOut.split("\n").slice(-60)` and the summary is longer than sixty lines.
   Meanwhile the header table went on saying "voyages that did NOT run: none". A leg with no printed
   verdict, counted as accounted-for, is section 1's lie wearing different clothes: a skimmer reads
   the table, sees nothing missing, and never learns two voyages failed.
   Checked in CODE, so it holds for a fleet of any size — a bigger literal would only move the cliff. */
console.log("\nEvery leg that sailed has its verdict printed");
const trialCode = fs.readFileSync(path.join(ROOT, "scripts/sea_trial.mjs"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
/slice\(-\d+\)[\s\S]{0,40}\|\|\s*"\(none run\)"/.test(trialCode)
  ? bad("sea_trial.mjs still prints the voyages block as a fixed tail (slice(-N)) — that is what dropped two of ten legs; print from the final summary instead, so the block is as long as the fleet needs")
  : ok("the voyages block is not a fixed tail of the output");
/const voyagesMissing\s*=\s*ranLegs\.filter/.test(trialCode) && /voyagesMissing\.length/.test(trialCode)
  ? ok("the report checks its OWN output for a missing leg and says so in the file, rather than trusting the slice")
  : bad("the report does not verify that every leg it says sailed actually has a verdict in it — a silent drop is exactly how this was missed");

/* ── AND EVERY SCREEN IT PHOTOGRAPHS IS A SCREEN IT CHECKED ────────────────────────────────────
   2026-08-31. The End of Voyage branch was an early `return` written as a TEARDOWN — grab a final
   photo and stop — so it stepped over the whole capture block above it and pushed
   `{ shot, sig: "end of voyage", fails: [] }`. That literal is indistinguishable in every report
   from "checked, and clean", on the last screen of every leg of every trial. It produced a PASS,
   which is why nothing noticed: this file's own first lesson, in a new place.

   It also skipped `waitSettled`, and that half is worse than it looks. The vision judge DOES read
   that screenshot (playtest_gate maps over rec.screens), so the eyes were handed the one frame
   guaranteed to be mid-flight — w34_eov_park_glide measured that card travelling 688px on desktop
   and 762px on tablet in 250ms.

   WHAT THIS CAN AND CANNOT SEE — stated honestly, because the first version's own comment
   overclaimed and CEO Review 39 broke it in one try. It is a TEXT PATTERN over `rec.screens.push`
   sites in ONE file, not a data-flow analysis. Its bypasses were real:
       const noFindings = Array(0);
       const shotRec = { shot: f2, sig: "end of voyage", fails: noFindings };
       rec.screens.push(shotRec);            // sailed straight through
   — a push whose argument is a variable was invisible to the regex, and `Array(0)` dodged the
   literal-`[]` backstop.
   SO IT NOW FAILS CLOSED. A push it cannot READ is a FAILURE, not a silent pass: the argument must
   be an object literal it can inspect, and the findings must be a literal it can judge. That turns
   the bypass into the loudest thing in the run, which is the only honest behaviour for a check
   whose whole subject is "something entered the record unexamined". Its remaining blind spot is
   named and not papered over: a push added from a DIFFERENT file is out of view, because this gate
   reads playtest_gate.mjs alone. */
console.log("\nEvery screen the gate photographs is a screen it checked");
{
  const gateCode = gate.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  /* "EXACTLY ONE PUSH" WAS THE FIRST DRAFT AND IT WAS TOO STRICT — the gate said so on its first
     run, which is the point of writing it before believing it. The crash handler pushes a screen
     too, and legitimately does NOT settle it: the page has just thrown, so waitSettled and MEASURE
     may not answer at all. What makes that one honest is that it records a REAL finding
     (`fails: [{ ok: false, rule: "run", … }]`), so it can never read as "checked, and clean".
     THE FAULT IS NOT A SECOND PUSH. It is a push that enters the record with NOTHING against it
     while standing outside the function that checks. That is the thing to count. */
  /* EVERY push site, readable or not — count them first, then read the ones you can. The gap
     between the two counts IS the finding. */
  const allPushes = (gateCode.match(/rec\.screens\.push\s*\(/g) || []).length;
  const pushArgs = [...gateCode.matchAll(/rec\.screens\.push\s*\(\s*\{([\s\S]{0,300}?)\}\s*\)/g)].map(m => m[1]);
  const settlerBody = (gateCode.match(/async function settleAndCheck\(([\s\S]*?)\n\}/) || [, ""])[1];
  const unreadable = allPushes - pushArgs.length;
  const unchecked = pushArgs.filter(a => {
    if (settlerBody.includes(a)) return false;                    // the one that settles and checks
    /* A REAL FINDING IS A LITERAL THIS CAN JUDGE. `fails: someVariable` is not readable, so it is
       not trusted — CEO 39's `Array(0)` bypass lived exactly here. */
    return !/fails:\s*\[\s*\{/.test(a);
  });
  unreadable === 0
    ? ok(`all ${allPushes} screen record(s) are written as object literals this gate can read`)
    : bad(`${unreadable} of ${allPushes} screen record(s) are built somewhere this gate cannot read (a variable, a spread, a helper) — a record it cannot inspect is a record it cannot vouch for, so this fails rather than passing quietly`);
  const inSettler = /async function settleAndCheck\([\s\S]*?rec\.screens\.push\s*\(/.test(gateCode);
  const settles   = /async function settleAndCheck\([\s\S]*?waitSettled\s*\(/.test(gateCode);
  const eovRoutes = /st\.over[\s\S]{0,400}?settleAndCheck\s*\(/.test(gateCode);
  unchecked.length === 0
    ? ok(`all ${pushArgs.length} screen record(s) either go through settleAndCheck or carry a real finding — none enters with nothing against it`)
    : bad(`${unchecked.length} screen(s) enter the record outside settleAndCheck with no finding against them — that reads as "checked, and clean" in every report (rule 23)`);
  inSettler ? ok("that path is inside settleAndCheck") : bad("the screen record is written outside settleAndCheck — the check and the record have come apart");
  settles   ? ok("settleAndCheck waits for the screen to stop moving before reading it") : bad("settleAndCheck no longer calls waitSettled — every screen would be judged mid-animation");
  eovRoutes ? ok("the End of Voyage branch routes through it, like every other screen") : bad("the End of Voyage branch no longer goes through settleAndCheck — that is exactly the fault this case was written for");
  /\bfails:\s*\[\]/.test(gateCode)
    ? bad("a screen is still recorded with a hardcoded empty `fails: []` — that reads as \"checked, and clean\" in every report and can never fail")
    : ok("no screen is recorded with a hardcoded empty findings list");
}

/* RED-PROOF. Each pattern must be able to say NO — proven against the code as it stood this
   morning, quoted verbatim from the commit that fixed it. */
{
  const before = `const f2 = OUT + "/" + tag + "-eov.png"; await c.shot(f2); rec.screens.push({ shot: f2, sig: "end of voyage", fails: [] });\n` +
                 `if (f) { rec.screens.push({ shot: fSettled, motionShot: f, fails }); }`;
  const crash  = `rec.screens.push({ shot: f, sig: "ERROR", fails: [{ ok: false, rule: "run", what: rec.error }] });`;
  /* CEO REVIEW 39'S BYPASS, verbatim. It must now be the loudest thing in the run. */
  const bypass = `const noFindings = Array(0);\nconst shotRec = { shot: f2, sig: "end of voyage", fails: noFindings };\nrec.screens.push(shotRec);`;
  const bypassCaught = ((bypass.match(/rec\.screens\.push\s*\(/g) || []).length
                      - [...bypass.matchAll(/rec\.screens\.push\s*\(\s*\{([\s\S]{0,300}?)\}\s*\)/g)].length) === 1;
  const pick = src => [...src.matchAll(/rec\.screens\.push\s*\(\s*\{([\s\S]{0,300}?)\}\s*\)/g)].map(m => m[1]);
  /* goes RED on the pre-fix EOV push (nothing against it, no settler to be inside of) … */
  const redsOnBefore  = pick(before).filter(a => !/fails:\s*\[\s*\{/.test(a)).length >= 1;
  /* … and STAYS QUIET on the crash handler, which is outside the settler on purpose and honest. */
  const sparesCrash   = pick(crash).filter(a => !/fails:\s*\[\s*\{/.test(a)).length === 0;
  const noSettler = !/async function settleAndCheck\(/.test(before);
  const catchesLiteral = /\bfails:\s*\[\]/.test(before);
  redsOnBefore && sparesCrash && noSettler && catchesLiteral && bypassCaught
    ? ok("red-proof: goes red on the pre-fix End of Voyage push, on a missing settler, and on CEO 39's variable-push bypass; stays quiet on the crash handler, which is outside it on purpose")
    : bad(`red-proof FAILED (redOnBefore:${redsOnBefore} sparesCrash:${sparesCrash} noSettler:${noSettler} literal:${catchesLiteral} bypass:${bypassCaught}) — these cases may be unable to fail`);
}

console.log(fails ? `\nFAIL — ${fails}\n` : "\nPASS — the trial can no longer call a missing leg a pass, lose one out of the bottom of its own report, or photograph a screen it never checked\n");
process.exit(fails ? 1 : 0);
