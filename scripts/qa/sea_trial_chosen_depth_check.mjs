#!/usr/bin/env node
/* CAN A PERSON CHOOSE THE TRIAL'S DEPTH — AND CAN THE REPORT STILL BE BELIEVED AFTERWARDS?
 *
 * Wyatt, ruling on `qid:t206-ga-turn-on` (INBOX-20260902T214507Z):
 *
 *   "we need a way to bypass sea trial for this -- it clearly doesn't need a full one given that
 *    you're just adding a tag to index; so we need a way to tell sea trial that and manually choose
 *    the depth of the trial"
 *
 * HALF OF THAT WAS ALREADY BUILT AND NOBODY HAD SAID SO. `sea_trial.mjs` has taken `--gear=` since
 * it was written, and `gear.mjs` has been printing `node scripts/sea_trial.mjs --gear=PLUMBING` in
 * its own sweep line the whole time. What was missing is the half that makes a shallow trial safe
 * to read: the flag was UNVALIDATED and UNRECORDED.
 *
 * THE TWO FAULTS THIS GATE EXISTS TO KEEP DEAD, both measured on this file 2026-09-03:
 *
 *   1. AN UNKNOWN GEAR SAILED THE FULL FLEET UNDER THE TYPO'S NAME. `LEGS[gear] || LEGS.FULL` has
 *      no membership test, so `--gear=cosmetic` — the exact lower-case spelling the Chart row uses
 *      in its own warning — was not the COSMETIC key. The FLEET direction was safe (more testing).
 *      The REPORT was not: its header interpolates the raw string, so it would have said
 *      `gear **cosmetic**` over a ten-leg voyage. A report that misstates its own depth is the one
 *      artifact rule 24 tells Wyatt to open and believe.
 *
 *   2. A FORCED GEAR ERASED THE PICKER'S OPINION. The mechanical picker was spawned only inside
 *      `if (!gear)`, so the moment anybody chose a depth, the report lost the one number it would
 *      be judged against — what the depth SHOULD have been. "22 fixes shipped, 4 verified, depth
 *      picked by mood" (2026-08-25/26) is the failure the gear rule was written against, and a
 *      forced trial that cannot print the picker's verdict is indistinguishable from it afterwards.
 *
 * WHY IT IS SAFE TO RUN THIS INSIDE `npm test`: every case below spawns `--explain`, which decides
 * the depth, prints it, and exits — before the report is archived, before `npm test`, before a
 * browser. Case 1 is a STATIC read that proves that ordering, and if it fails the spawns are
 * skipped rather than attempted. A check that cannot reach its subject returns the STRICT answer
 * (gear.mjs's own rule, and this file is downstream of it): every spawn case is then FAIL, never
 * "inconclusive, carry on".
 *
 *   node scripts/qa/sea_trial_chosen_depth_check.mjs
 *   node scripts/qa/sea_trial_chosen_depth_check.mjs --red=<case>   red-proof one clause
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TRIAL = path.join(REPO, "scripts", "sea_trial.mjs");
const red = (process.argv.find(a => a.startsWith("--red=")) || "").split("=")[1] || "";

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

/* ---- the source, once ------------------------------------------------------ */
const src = fs.readFileSync(TRIAL, "utf8");

/* CASE 1 — STATIC, AND IT GUARDS EVERY SPAWN BELOW.
   `--explain` must be answered BEFORE archivePrevious() runs. If it ever moves below that call,
   spawning it would rename the authoritative report out from under Wyatt on every npm test — so
   this clause is not a nicety, it is what makes the rest of the file safe to execute. */
/* ANCHOR ON THE GUARD EXPRESSION, NOT ON THE WORD. `--explain` also appears in prose in the
   comment above the guard, and comments sit wherever somebody put them — anchoring on the word
   would let the executable branch move below archivePrevious() while a comment kept this clause
   green. The thing that must be early is the `if`, so that is what is located. */
const iExplain = src.indexOf('process.argv.includes("--explain")');
const iArchive = src.indexOf("archivePrevious(REPORT)");
const explainFirst = red === "order" ? false
  : iExplain >= 0 && iArchive >= 0 && iExplain < iArchive;
check("1. `--explain` is answered before the previous report is archived",
      explainFirst,
      iExplain < 0 ? "sea_trial.mjs does not read an `explain` argument at all"
    : iArchive < 0 ? "could not find archivePrevious(REPORT) to compare against"
    : `explain at ${iExplain}, archivePrevious at ${iArchive}`);

/* ---- the spawns ------------------------------------------------------------- */
/* Bounded on purpose. On a tree where `--explain` is not honoured, sea_trial would start a real
   run; the timeout ends it and the case fails, which is the correct verdict and not a hang. */
function explain(args) {
  const r = spawnSync(process.execPath, [TRIAL, "--explain", ...args],
    { cwd: REPO, encoding: "utf8", timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  return { out: ((r.stdout || "") + (r.stderr || "")), status: r.status, timedOut: !!r.error };
}

if (!explainFirst) {
  for (const n of ["2. a chosen depth is honoured", "3. the gear name is normalised",
                   "4. an unknown gear is REFUSED", "5. the picker's own verdict is printed",
                   "6. an unrecorded lowering is called out", "7. a typed reason is carried"])
    check(n, false, "not attempted — case 1 failed, so spawning would not be safe");
} else {
  /* CASE 2 — his ask, at its plainest: a depth somebody chooses is the depth that sails. */
  const full = explain(["--gear=FULL"]);
  check("2. a chosen depth is honoured",
        red === "honour" ? false
          : full.status === 0 && /CHOSEN GEAR:\s*FULL/.test(full.out) && /LEGS:\s*10\b/.test(full.out),
        `exit ${full.status} · ${(full.out.match(/CHOSEN GEAR:.*/) || ["no CHOSEN GEAR line"])[0]}`);

  /* CASE 3 — the spelling in the Chart row's own warning must not be a different gear. */
  const lower = explain(["--gear=cosmetic"]);
  check("3. the gear name is normalised (`cosmetic` is COSMETIC, not a silent FULL)",
        red === "case" ? false
          : lower.status === 0 && /CHOSEN GEAR:\s*COSMETIC/.test(lower.out) && /LEGS:\s*0\b/.test(lower.out),
        `exit ${lower.status} · ${(lower.out.match(/CHOSEN GEAR:.*/) || ["no CHOSEN GEAR line"])[0]}`);

  /* CASE 4 — REFUSE, do not quietly upgrade. Sailing FULL under a typo's name is the fault. */
  const bogus = explain(["--gear=SHALLOW"]);
  const namesLegal = ["NONE", "COSMETIC", "PLUMBING", "FULL"].every(g => bogus.out.includes(g));
  check("4. an unknown gear is REFUSED and the legal ones are named",
        red === "unknown" ? false
          : bogus.status !== 0 && namesLegal && !/CHOSEN GEAR:/.test(bogus.out),
        `exit ${bogus.status} · names all four legal gears: ${namesLegal} · claims a chosen gear anyway: ${/CHOSEN GEAR:/.test(bogus.out)}`);

  /* CASE 5 — the number the forced trial will be judged against must survive into the record. */
  const forced = explain(["--gear=COSMETIC"]);
  check("5. a forced gear still prints what the mechanical picker said",
        red === "picker" ? false : /PICKER SAID:\s*(NONE|COSMETIC|PLUMBING|FULL)\b/.test(forced.out),
        (forced.out.match(/PICKER SAID:.*/) || ["no PICKER SAID line"])[0]);

  /* CASE 6 — lowering the depth with nothing on the record is allowed, and is never SILENT.
     He is not blocked: this prints, it does not refuse. Whether it should refuse is his call and
     is sitting in CHART.md's BLOCKED ON WYATT as `qid:t220-reason-required`.

     ⚠ IT ASSERTS THE BRANCH THE PICKER ACTUALLY PUT IT IN, and that is not pedantry. The first
     draft of this clause hard-coded "COSMETIC is shallower than whatever the picker says", which is
     only true while this branch sits 465 commits ahead of main and the picker returns FULL. On a
     freshly merged checkout the picker returns NONE, COSMETIC stops being a LOWERING, and the
     clause would have gone red on a file with nothing wrong with it. A gate that fails when the
     WORLD changes rather than when the CODE does is the "instrument reporting a property of
     itself" fault this project has now found three times in one day. So: read what the picker
     said, and assert the branch that answers it — the clause can still fail either way. */
  const said = (forced.out.match(/PICKER SAID:\s*(\w+)/) || [])[1] || "";
  const order = ["NONE", "COSMETIC", "PLUMBING", "FULL"];
  const isLowering = order.indexOf("COSMETIC") < order.indexOf(said);
  const wanted = isLowering ? /NO REASON ON RECORD/ : /none is owed/;
  check(`6. an unrecorded ${isLowering ? "LOWERING is called out" : "choice that is not a lowering says so"} (picker said ${said || "?"})`,
        red === "unrecorded" ? false : said !== "" && wanted.test(forced.out),
        said === "" ? "the picker's verdict never reached the output, so this could not be judged"
                    : `expected ${wanted} · ${(forced.out.match(/^\s{3}\S.*(?:REASON|owed).*$/m) || ["no depth note printed at all"])[0].trim()}`);

  /* CASE 7 — and when a reason IS typed, it reaches the report verbatim. */
  const REASON = "just a script tag in index.html";
  const withReason = explain([`--gear=COSMETIC`, `--reason=${REASON}`]);
  check("7. a typed reason is carried through verbatim",
        red === "reason" ? false
          : withReason.status === 0 && withReason.out.includes(REASON) && !/NO REASON ON RECORD/.test(withReason.out),
        withReason.out.includes(REASON) ? "carried" : "the reason did not survive");
}

/* CASE 8 — STATIC. The console is not the artifact Wyatt opens; the REPORT is (rule 24). All three
   facts must be interpolated into the report template, or a shallow trial reads like a full one on
   the only surface he ever sees. Static because the alternative is a 75-minute run per npm test. */
const reportBlock = src.slice(src.indexOf("const report = `#"));
const inReport = red === "report" ? []
  : ["${gear}", "${pickerGear}", "${reasonLine}"].filter(t => reportBlock.includes(t));
check("8. the REPORT itself carries the chosen gear, the picker's gear and the reason",
      inReport.length === 3,
      `found ${inReport.length} of 3 in the report template: ${inReport.join(", ") || "none"}`);

/* CASE 9 — A LEG THIS GEAR NEVER PROMISED MUST NOT BE COUNTED AS A LEG THAT FAILED TO RUN.
   The fault this guards was found by RUNNING his own bypass rather than reasoning about it, and it
   is the one that made a chosen depth unusable: `--gear=COSMETIC` on a tree carrying an ordinary
   FULL run's `sea-trial-shots/report.json` came back **INCOMPLETE — 10 leg(s) did NOT run**, having
   correctly sailed the zero voyages that gear asks for. PLUMBING inherited seven the same way.

   DRIVEN, NOT READ: the real reconciliation loop is lifted out of sea_trial.mjs as text and RUN
   against fixtures — the technique notrun_provenance_check.mjs:69-84 already uses on the predicate
   eleven lines below this same loop. So this clause fails if the BEHAVIOUR changes, not merely if
   somebody moves a line.
   ⚠ THE FIRST DRAFT OF THIS CLAUSE WAS STATIC AND GAVE A FALSE REASON FOR IT — that a behavioural
   version would cost a full `npm test` inside `npm test`. CEO 180 pointed at the file eleven lines
   away that already does it for nothing. The loud disclosure was honest; the justification under it
   was not, and a wrong reason for a weak check is worse than the weak check, because it stops the
   next reader looking. */
const loopSrc = (src.match(/for \(const leg of rj\) \{[\s\S]*?\n  \}\n/) || [])[0];
if (!loopSrc) {
  check("9. the NOT-RUN column only ever reports on legs this gear actually promised",
        false, "could not find the reconciliation loop in sea_trial.mjs to drive");
} else {
  /* The fixture is the real situation: sea-trial-shots/report.json holds a ten-leg FULL run, and
     this run is a COSMETIC one that promised none of them. NOTHING may land in notRun. */
  const rj = ["solo-desktop", "solo-phone", "solo-tablet", "passplay-phone", "passplay-desktop",
              "crew-desktop", "crew-phone", "solo-desktop-wk", "solo-phone-wk", "solo-tablet-wk"]
             .map(name => ({ name, screens: [], verdict: ["produced no screens at all"], __runId: "AN-OLDER-RUN" }));
  const drive = (legs) => {
    const notRun = [];
    const sailedHere = (leg, runId) => !!(leg && (leg.screens || []).length > 0 && leg.__runId && runId && leg.__runId === runId);
    new Function("rj", "legs", "notRun", "sailedHere", "thisRunId", red === "phantom" ? "return;" : loopSrc)
      (rj, legs, notRun, sailedHere, "THIS-RUN");
    return notRun.map(n => n.leg);
  };
  const cosmetic = drive([]);                                    // his bypass: promised nothing
  const plumbing = drive(["solo-phone", "passplay-phone", "crew-phone"]);
  const full = drive(rj.map(l => l.name));                       // promised all ten, captured none
  check("9. the NOT-RUN column only ever reports on legs this gear actually promised",
        red === "phantom" ? false
          : cosmetic.length === 0 && plumbing.length === 3 && full.length === 10,
        `COSMETIC promised 0 → ${cosmetic.length} phantom failure(s) · PLUMBING promised 3 → ${plumbing.length} · FULL promised 10 → ${full.length} (must be 0 / 3 / 10; the column stays pessimistic about legs that WERE promised)`);
}

/* ---- verdict ---------------------------------------------------------------- */
console.log("\n  SEA TRIAL — A DEPTH SOMEBODY CHOOSES, AND A REPORT THAT SAYS SO\n");
/* CLIP THE DETAIL. gear.mjs's `why` names every file ahead of origin/main — 250 of them on this
   branch — and an unclipped clause buried the whole npm test run in filenames. */
const clip = s => { const t = String(s).replace(/\s+/g, " ").trim(); return t.length > 150 ? t.slice(0, 150) + " …" : t; };
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}\n        ${clip(r.detail)}`);
const bad = results.filter(r => !r.ok);
console.log(`\n  ${results.length - bad.length}/${results.length} clause(s) hold.\n`);
if (bad.length) {
  console.log("  A trial run at a depth a person chose must still be readable as such afterwards.");
  console.log("  See scripts/sea_trial.mjs's gear block and .planning/CHART.md row T-220.\n");
}
process.exit(bad.length ? 1 : 0);
