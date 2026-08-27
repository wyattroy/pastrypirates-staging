/* SEA TRIAL — the one process every change to the game goes through.
 *
 * Named by Wyatt, 2026-08-26. A sea trial is the real naval term for taking a vessel out and
 * testing everything before it is accepted into service. He chose it over "QA" for a reason worth
 * keeping: "did you QA it?" can be answered evasively — the night before, a session had run
 * SOMETHING, so it could say yes while 18 of 22 fixes were unverified. "Did you run the sea trial?"
 * cannot, because a sea trial leaves a REPORT with a build stamp in it, and he can open the report.
 *
 *   node 4/scripts/sea_trial.mjs                 work out the gear from what changed, run that
 *   node 4/scripts/sea_trial.mjs --gear=FULL     force the whole thing
 *   node 4/scripts/sea_trial.mjs --judge=off     skip the vision judge (faster; less honest)
 *
 * WHAT IT IS MADE OF — assembled, not written. Every piece already existed and was being ignored:
 *   4/scripts/playtest_gate.mjs   plays whole voyages: real mouse, coverage-first, dead-button
 *                                 detection, universal structural checks, a vision judge that looks
 *                                 at every distinct screen the way Wyatt does.
 *   4/scripts/lib/player.mjs      the ONE thing that knows how to play the game.
 *   4/scripts/lib/cdp.mjs + wk.mjs   two mounts, one driver: Chrome and WebKit.
 *   npm test                      32 checks that never open a browser.
 *   4/scripts/qa/gear.mjs         how deep this particular change has to go.
 *
 * THE REPORT IS THE POINT. It records the build stamp, the time, what ran, what failed, and — the
 * column that matters — WHAT DID NOT RUN. A leg that could not start is never silently absent.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const say = (...a) => console.log(...a);

/* ---- what build is this? -------------------------------------------------- */
const stampSrc = fs.readFileSync(path.join(REPO, "4/src/ui/stage.js"), "utf8");
const STAMP = (stampSrc.match(/PP4_STAMP\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
const started = new Date();

/* ---- which gear? ---------------------------------------------------------- */
let gear = arg("gear");
let gearWhy = "**FORCED ON THE COMMAND LINE — this overrode the mechanical picker.** Treat this report as weaker evidence than one whose gear was derived.";
if (!gear) {
  const r = spawnSync("node", [path.join(REPO, "4/scripts/qa/gear.mjs")], { encoding: "utf8" });
  gear = ((r.stdout || "").match(/GEAR:\s*(\w+)/) || [])[1] || "FULL";
  gearWhy = ((r.stdout || "").match(/why:\s*(.+)/) || [])[1] || "could not be determined — defaulting to FULL";
}

/* WHICH LEGS EACH GEAR SAILS.
   FULL is the default and it is the whole matrix: three modes, two screen sizes, BOTH ENGINES.
   PLUMBING is the only gear that sails less, and it still sails the other modes once — a change to
   how ONE mode serves the game up must be shown not to have leaked into the game itself. */
const LEGS = {
  COSMETIC: [],
  PLUMBING: ["solo-phone", "passplay-phone", "crew-phone"],
  /* The full matrix. crew-phone is here because it is the square Wyatt actually playtested and the
     one that had no leg at all until 2026-08-26 — most of his 35 findings came from it. */
  FULL: ["solo-desktop", "solo-phone", "passplay-phone", "passplay-desktop",
         "crew-desktop", "crew-phone", "solo-desktop-wk", "solo-phone-wk"],
  NONE: [],
};
const legs = LEGS[gear] || LEGS.FULL;

/* WRITE THE REPORT BEFORE SAILING, NOT AFTER.
   A killed run used to leave the PREVIOUS run's verdict on disk, and rule 24 tells Wyatt to answer
   "did you run it?" by opening that file. On 2026-08-26 it therefore said PASSED, in bold, on a
   build carrying 18 unverified fixes -- because a smoke test had written it and a real run had been
   killed. THE ARTIFACT OUTLIVED THE RUN AND KEPT ITS VERDICT.
   Stamping it IN PROGRESS first means the only way to get a green report is to finish. A crash, a
   kill, a laptop lid closing -- all of them now leave the truth. */
fs.writeFileSync(path.join(REPO, ".planning", "SEA-TRIAL.md"),
`# Sea trial — build \`${STAMP}\`

**IN PROGRESS — no verdict yet.**  ·  started ${started.toISOString()}  ·  gear **${gear}**

If this is still what the file says, the trial did not finish. **A trial that did not finish is not
a trial that passed.** Nothing here has been proven about build \`${STAMP}\`.
`);

say(`\n⚓ SEA TRIAL — build ${STAMP}`);
say(`   gear: ${gear}  (${gearWhy})`);
say(`   legs: ${legs.length ? legs.join(", ") : "none — this gear needs no voyage"}\n`);

/* ---- 1. the checks that never open a browser ------------------------------- */
say("── 1/2  the checks that need no browser (npm test) ──");
let unitOk = false, unitTail = "";
try {
  const out = execSync("npm test", { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  unitOk = true; unitTail = out.trim().split("\n").slice(-3).join("\n");
} catch (e) {
  unitTail = ((e.stdout || "") + (e.stderr || "")).trim().split("\n").slice(-14).join("\n");
}
say(unitOk ? "   PASS — all of them\n" : "   FAIL\n" + unitTail + "\n");

/* ---- 2. the voyages -------------------------------------------------------- */
let gateOk = null, gateOut = "";
const OUT = path.join(REPO, "sea-trial-shots");
if (legs.length) {
  say(`── 2/2  playing ${legs.length} voyage(s) with a real mouse ──`);
  const a = ["4/scripts/playtest_gate.mjs", `--legs=${legs.join(",")}`, `--out=${OUT}`, `--judge=${arg("judge","on")}`, `--parallel=${arg("parallel","2")}`];
  const r = spawnSync("node", a, { cwd: REPO, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  gateOut = ((r.stdout || "") + (r.stderr || ""));
  gateOk = r.status === 0;
  say(gateOut.trim().split("\n").slice(-25).join("\n"));
} else {
  say("── 2/2  no voyage needed for this gear ──");
}

/* ---- the report ------------------------------------------------------------ */
/* "DID IT RUN?" IS ANSWERED BY EVIDENCE PRODUCED, NOT BY MATCHING A PHRASE — and getting that wrong
   is exactly the lie this whole file exists to prevent.
   On 2026-08-26 this report stated `voyages that did NOT run | none` while BOTH Safari legs had
   died instantly on a missing Playwright and produced ZERO screens. It listed them under "voyages
   played with a real mouse". Safari is a stated core requirement of this game, so that was the most
   misleading line in the repo — and the cause was small: the matcher below recognised only the
   exact string "[leg] NOT RUN — ", while the gate had emitted "[leg] ERROR: playwright not found".
   One phrasing understood, another not, and the difference silently became a pass.
   So the primary test is now the one thing no wording can fake: A LEG THAT PRODUCED NO SCREENS DID
   NOT SAIL. report.json is the gate's own record of what it actually captured. The phrase matchers
   are kept as a supplement (they carry a human-readable reason), never as the sole authority. */
const notRunByPhrase = [...gateOut.matchAll(/\[([\w-]+)\] (?:NOT RUN — |ERROR: )([\s\S]*?)(?=\n\[|\n$)/g)]
  .map(m => ({ leg: m[1], why: m[2].trim() }));
let notRun = notRunByPhrase.slice();
try {
  const rj = JSON.parse(fs.readFileSync(path.join(OUT, "report.json"), "utf8"));
  for (const leg of rj) {
    const n = (leg.screens || []).length;
    if (n > 0) continue;                                     // it captured something: it sailed
    if (notRun.some(x => x.leg === leg.name)) continue;      // already named, keep its reason
    notRun.push({ leg: leg.name, why: (leg.verdict || ["produced no screens at all"]).join("\n") });
  }
  // A leg the phrase-matcher flagged but which DID capture screens is a mid-leg error, not a
  // no-show — do not demote a leg that actually sailed.
  const captured = new Set(rj.filter(l => (l.screens || []).length > 0).map(l => l.name));
  notRun = notRun.filter(n => !captured.has(n.leg));
} catch (e) {
  say(`   (could not read report.json to verify what actually sailed: ${e.message})`);
}
const ranLegs = legs.filter(l => !notRun.some(n => n.leg === l));
const mins = Math.round((Date.now() - started) / 60000);
/* A LEG THAT DID NOT RUN IS NOT A PASS, and until the CEO review of 2026-08-26 this file said so
   in its own header and then contradicted itself in code: "PASSED WITH GAPS" exited 0. The verdict
   word is what people quote, so it must never be able to contradict the table underneath it. */
const verdict = !unitOk ? "FAILED"
  : gateOk === false ? "FAILED"
  : notRun.length ? "INCOMPLETE"
  : legs.length ? "PASSED"
  : "NOTHING SAILED";

const report = `# Sea trial — build \`${STAMP}\`

**${verdict}** — ${ranLegs.length} of ${legs.length} voyage(s) sailed${notRun.length ? `, ${notRun.length} NOT RUN` : ""}  ·  ${started.toISOString()}  ·  ${mins} min  ·  gear **${gear}**

> Gear chosen because: ${gearWhy}

## What ran

| | |
|---|---|
| checks with no browser (\`npm test\`) | ${unitOk ? "PASS" : "**FAIL**"} |
| voyages played with a real mouse | ${ranLegs.length ? ranLegs.join(", ") : "none"} |
| **voyages that did NOT run** | ${notRun.length ? "**" + notRun.map(n => n.leg).join(", ") + "**" : "none"} |

${notRun.length ? "## What did NOT run, and why\n\n" + notRun.map(n => `**${n.leg}**\n\n\`\`\`\n${n.why}\n\`\`\`\n`).join("\n") + "\nA leg that did not run is **not** a leg that passed. This section exists so that distinction cannot be lost.\n" : ""}
${unitOk ? "" : "## The browser-free checks failed\n\n```\n" + unitTail + "\n```\n"}
## The voyages, in full

\`\`\`
${gateOut.trim().split("\n").slice(-60).join("\n") || "(none run)"}
\`\`\`

Screenshots and contact sheets: \`sea-trial-shots/\` (not committed — 100MB+ per run).

---
*Written by \`4/scripts/sea_trial.mjs\`. To check whether a sea trial was actually run for what is
live, compare the build stamp above with the one in the game's ☰ menu.*
`;
const dir = path.join(REPO, ".planning");
fs.writeFileSync(path.join(dir, "SEA-TRIAL.md"), report);
say(`\n⚓ ${verdict}  —  report: .planning/SEA-TRIAL.md  (build ${STAMP}, ${mins} min)`);
if (notRun.length) say(`   ${notRun.length} leg(s) did NOT run — read the report, they are not passes.`);
/* INCOMPLETE and NOTHING SAILED both exit non-zero. Only a trial that actually sailed every leg
   it promised, and passed, is allowed to be green. */
process.exit(verdict === "PASSED" ? 0 : 1);
