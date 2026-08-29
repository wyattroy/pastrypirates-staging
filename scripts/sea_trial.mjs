/* SEA TRIAL — the one process every change to the game goes through.
 *
 * Named by Wyatt, 2026-08-26. A sea trial is the real naval term for taking a vessel out and
 * testing everything before it is accepted into service. He chose it over "QA" for a reason worth
 * keeping: "did you QA it?" can be answered evasively — the night before, a session had run
 * SOMETHING, so it could say yes while 18 of 22 fixes were unverified. "Did you run the sea trial?"
 * cannot, because a sea trial leaves a REPORT with a build stamp in it, and he can open the report.
 *
 *   node scripts/sea_trial.mjs                 work out the gear from what changed, run that
 *   node scripts/sea_trial.mjs --gear=FULL     force the whole thing
 *   node scripts/sea_trial.mjs --judge=off     skip the vision judge (faster; less honest)
 *
 * WHAT IT IS MADE OF — assembled, not written. Every piece already existed and was being ignored:
 *   scripts/playtest_gate.mjs   plays whole voyages: real mouse, coverage-first, dead-button
 *                                 detection, universal structural checks, a vision judge that looks
 *                                 at every distinct screen the way Wyatt does.
 *   scripts/lib/player.mjs      the ONE thing that knows how to play the game.
 *   scripts/lib/cdp.mjs + wk.mjs   two mounts, one driver: Chrome and WebKit.
 *   npm test                      32 checks that never open a browser.
 *   scripts/qa/gear.mjs         how deep this particular change has to go.
 *
 * THE REPORT IS THE POINT. It records the build stamp, the time, what ran, what failed, and — the
 * column that matters — WHAT DID NOT RUN. A leg that could not start is never silently absent.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };

/* WHERE THIS RAN, AND WHERE THE REPORT GOES — two machines, one repo (2026-08-28).
   A handoff sent a session on Wyatt's Mac to sail this same branch for a cloud-vs-local
   comparison, while a 24-hour run sailed it in a cloud container. Both wrote
   `.planning/SEA-TRIAL.md` at a hardcoded path, so the second to finish would silently overwrite
   the first — leaving one authoritative-looking report describing the OTHER machine's run. Rule
   24 stands on being able to open this file and believe it, so:
     --report=<path>   a comparison run names its own file and never touches the authoritative one
     WHERE             derived, never typed: every report says which machine sailed it, so even a
                       forgotten flag cannot produce a report that is mistaken for the other's.
   `whereRan()` reads the environment the same way the runbooks do (docs/QA-PROCESS.md §5b): the
   cloud container is the one with the pre-provisioned browser wrapper and no macOS. */
function whereRan() {
  if (process.platform === "darwin") return `local Mac (${os.hostname()})`;
  if (process.env.CLAUDE_PROJECT_DIR || fs.existsSync("/opt/pw-browsers")) return "cloud container";
  return `${process.platform} (${os.hostname()})`;
}
const WHERE = whereRan();
const REPORT = path.resolve(REPO, arg("report", path.join(".planning", "SEA-TRIAL.md")));
const say = (...a) => console.log(...a);

/* ---- what build is this? -------------------------------------------------- */
const stampSrc = fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8");   // NOT src — the cutover moved the game to the root
const STAMP = (stampSrc.match(/PP4_STAMP\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
const started = new Date();

/* ---- which gear? ---------------------------------------------------------- */
let gear = arg("gear");
let gearWhy = "**FORCED ON THE COMMAND LINE — this overrode the mechanical picker.** Treat this report as weaker evidence than one whose gear was derived.";
if (!gear) {
  const r = spawnSync("node", [path.join(REPO, "scripts/qa/gear.mjs")], { encoding: "utf8" });
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
  /* THE THREE SIZES (Wyatt, 2026-08-28): desktop, phone, and tablet portrait — both engines play
     solo at all three; Chrome carries the multiplayer modes. gear.mjs's sweep line said "all three
     sizes" while only two existed; his order made the text true instead of the text being fixed. */
  FULL: ["solo-desktop", "solo-phone", "solo-tablet", "passplay-phone", "passplay-desktop",
         "crew-desktop", "crew-phone", "solo-desktop-wk", "solo-phone-wk", "solo-tablet-wk"],
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
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT,
`# Sea trial — build \`${STAMP}\`

**IN PROGRESS — no verdict yet.**  ·  started ${started.toISOString()}  ·  gear **${gear}**  ·  sailed on **${WHERE}**

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
  const a = ["scripts/playtest_gate.mjs", `--legs=${legs.join(",")}`, `--out=${OUT}`, `--judge=${arg("judge","on")}`, `--parallel=${arg("parallel","2")}`];
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
let rescueRow = "";                 // filled below; empty when nothing was rescued
try {
  const rj = JSON.parse(fs.readFileSync(path.join(OUT, "report.json"), "utf8"));
  /* THE RESCUE COUNT BELONGS AT THE TOP — CEO Review 12, 2026-08-28: "the sea trial report you
     actually open shows all ten legs in one tidy list with the restart count buried seventy lines
     down." Rule 24's whole point is that "did it run?" is answered by OPENING THIS FILE, so a leg
     that only finished because the browser was restarted eleven times must not sit in the summary
     table looking identical to seven clean ones. Derived from report.json, never from prose. */
  const rescued = rj.filter(l => l.recoveries > 0)
                    .map(l => `${l.name} ×${l.recoveries}${l.days ? ` over ${l.days} days` : ""}`);
  if (rescued.length) rescueRow =
    `\n| **voyages that only finished after a BROWSER RESTART** | **${rescued.join(", ")}** — the known WebKit crash in this container; each was resumed from the game's own save. A rescued leg is not a clean one. |`;
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
/* PRINT FROM THE FINAL SUMMARY, NOT THE LAST 60 LINES — and this cost two whole legs.
   The 2026.08.29.1 report printed 8 verdicts for 10 legs: `slice(-60)` cut the summary in half and
   `solo-desktop: FAIL` and `solo-phone: FAIL` fell off the top, while the header table above went
   on saying "voyages that did NOT run: none". A leg with no printed verdict, counted as
   accounted-for, is the NOT-RUN column failing in a new costume — the exact thing the 2026-08-26
   note twenty lines up was written to stop, one layer down.
   DERIVED, NOT A BIGGER NUMBER: find the LAST place the first leg reports, and print from there, so
   the block is however long the fleet needs. Widening 60 to 200 would only move the cliff. */
const gateLines = gateOut.trim().split("\n");
const firstLegMark = ranLegs.length ? gateLines.map((l, i) => [l, i])
  .filter(([l]) => l.includes(`== ${ranLegs[0]}:`)).map(([, i]) => i).pop() : -1;
/* THE FALLBACK IS THE WHOLE OUTPUT, NOT A TAIL. If no leg marker is found something has changed
   about the gate's format, and that is precisely when truncating is most likely to hide the thing
   you need to read. Too much output is a nuisance; a silently dropped verdict is a lie. */
const voyagesBlock = (firstLegMark >= 0 ? gateLines.slice(firstLegMark) : gateLines).join("\n") || "(none run)";
/* …AND SAY SO LOUDLY IF ONE IS STILL MISSING. A report that can drop a leg silently is worth less
   than one that admits it, so this checks its own output rather than trusting the slice above. */
const voyagesMissing = ranLegs.filter(l => !voyagesBlock.includes(`== ${l}:`));
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

**${verdict}** — ${ranLegs.length} of ${legs.length} voyage(s) sailed${notRun.length ? `, ${notRun.length} NOT RUN` : ""}  ·  ${started.toISOString()}  ·  ${mins} min  ·  gear **${gear}**  ·  sailed on **${WHERE}**

> Gear chosen because: ${gearWhy}

## What ran

| | |
|---|---|
| checks with no browser (\`npm test\`) | ${unitOk ? "PASS" : "**FAIL**"} |
| voyages played with a real mouse | ${ranLegs.length ? ranLegs.join(", ") : "none"} |
| **voyages that did NOT run** | ${notRun.length ? "**" + notRun.map(n => n.leg).join(", ") + "**" : "none"} |${rescueRow}

${notRun.length ? "## What did NOT run, and why\n\n" + notRun.map(n => `**${n.leg}**\n\n\`\`\`\n${n.why}\n\`\`\`\n`).join("\n") + "\nA leg that did not run is **not** a leg that passed. This section exists so that distinction cannot be lost.\n" : ""}
${unitOk ? "" : "## The browser-free checks failed\n\n```\n" + unitTail + "\n```\n"}
## The voyages, in full
${voyagesMissing.length ? `\n> ⚠ **${voyagesMissing.length} leg(s) sailed but have NO verdict printed below: ${voyagesMissing.join(", ")}.**\n> Their result exists in \`sea-trial-shots/log.txt\` and did not reach this file. Do not read their\n> absence as a pass — go and read the log.\n` : ""}
\`\`\`
${voyagesBlock}
\`\`\`

Screenshots and contact sheets: \`sea-trial-shots/\` (not committed — 100MB+ per run).

---
*Written by \`scripts/sea_trial.mjs\`. To check whether a sea trial was actually run for what is
live, compare the build stamp above with the one in the game's ☰ menu.*
`;
fs.writeFileSync(REPORT, report);
say(`\n⚓ ${verdict}  —  report: ${path.relative(REPO, REPORT)}  (build ${STAMP}, ${mins} min, ${WHERE})`);
if (notRun.length) say(`   ${notRun.length} leg(s) did NOT run — read the report, they are not passes.`);
/* INCOMPLETE and NOTHING SAILED both exit non-zero. Only a trial that actually sailed every leg
   it promised, and passed, is allowed to be green. */
process.exit(verdict === "PASSED" ? 0 : 1);
