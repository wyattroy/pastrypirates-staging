#!/usr/bin/env node
/* receipt_version_is_identity_check.mjs — THE GLASS RECEIPTS MUST RECORD WHAT WAS READ, NOT WHEN.
 *
 * WHY THIS EXISTS (`T-111`, 2026-09-02, measured 5:56 and 6:06 PM ET). Both Glass receipts carry a
 * field called `artifactVersion`, and on 2026-09-02 both of them filled it with a CLOCK:
 *
 *     .planning/wyclau/LAST-HARVEST   "artifactVersion": "2026-09-02T21:55:24.391Z"
 *     .planning/wyclau/LAST-PUBLISH   version=2026-09-02T22:06:23.279Z
 *
 * LAST-PUBLISH had held the correct `1788386140-0fbe` form eleven minutes earlier. The wrong kind of
 * value spread from one receipt to the other in ten minutes with nothing to stop it, because
 * `mark_glass_harvest.mjs` and `mark_glass_published.mjs` both tested only `if (!version)` — any
 * non-empty string was a version.
 *
 * WHY THE RECEIPTS EXIST AT ALL, so the stakes are not lost. Wyatt writes his ideas ON the published
 * page; they live in its state block and nowhere else, and a republish regenerates the page from
 * disk. The one honest answer to "is a republish safe?" is to compare the version you READ against
 * the version that is LIVE. His sentence, 2026-09-02: "the harvest stamp records when a session
 * looked. It is not evidence the page hasn't changed since. Your page carries its own version
 * number — that's the fact that can answer 'is a republish safe?', and a clock never can."
 *
 * A CLOCK IN THAT FIELD IS WORSE THAN AN EMPTY ONE. `generatedAt` moves when a SESSION regenerates
 * the page and never when HE saves into it — two real versions of his page, `1788385436-4b8b` and
 * `1788385523-b046`, carry the identical `generatedAt` while the second contains an idea the first
 * does not. So a comparison against a timestamp says "unchanged" at the exact moment he has written
 * something. It also broke a detector that was working: the cheapest way to tell HIS save from a
 * session's publish was whether LAST-PUBLISH named the version the notification announced, and once
 * the two sides held different KINDS of value that comparison became impossible.
 *
 * WHY THE EXISTING GATE COULD NOT SEE IT, and this is the reusable half:
 * glass_harvest_hook_check.mjs case 10/9 asserts, with a source regex, that the writer stores
 * something under the name `artifactVersion`. The runbook reads the same name. NOTHING CHECKED THE
 * KIND OF VALUE. A gate on a field's NAME is not a gate on its CONTENTS — and the right name is
 * precisely what kept everyone confident. `mark_glass_published.mjs` refusing an EMPTY value is the
 * same gap one level down: refusing absence is not checking kind.
 *
 * ⚠ WHAT THIS GATE DELIBERATELY DOES NOT DO, and case 5 is what holds the line. It does NOT demand
 * that the value match the platform's current `<epoch>-<hash>` shape. If the platform ever changes
 * that format, a strict allow-list here would make the harvest stamp start failing — and the harvest
 * hook then denies every Glass publish, wedging the one surface Wyatt steers from. The hook's own
 * standing rule is "it must never wedge anything." So the writers refuse what is PROVABLY the wrong
 * kind (a value that parses as a date) and merely say so, loudly, about a value they do not
 * recognise. Case 5 fails if that ever hardens into a refusal.
 *
 * ⚠ WHY CASE 7b IS NOT REDUNDANT WITH CASES 1-3, AND IT IS THE WHOLE REASON THIS GATE READS THE LIVE
 * FILES (CEO 130). Guarding the two writers does NOT seal the receipts. `.claude/hooks/
 * glass-harvest-first.cjs` denies a Glass publish until the stamp looks fresh, and its own deny text
 * still instructs a blocked session to redirect a bare `date -u` timestamp into
 * `.planning/wyclau/LAST-HARVEST` — a clock written straight past both writers, satisfying the
 * hook's own mtime check, by a session doing exactly what the system told it. Cases 1-6 cannot see
 * that path because it does not use the writers. **Case 7b can, because it reads the file rather
 * than the route that made it.** It is a DETECTOR, not a preventer: it fires on the next `npm test`,
 * after the bad receipt already exists. The preventer is an edit under `.claude/`, refused to an
 * unattended watch by the harness itself (four watches have measured it), written out verbatim as
 * edit 2c in `.planning/wyclau/CLAUDE-DIR-REPAIRS-PENDING.md`, waiting on Wyatt's own hands.
 *
 * DELIBERATELY NOT DONE, the same line both writers already draw: no attempt to contact the artifact
 * and confirm the version is real. A node script cannot reach the Artifact tool, and a check that
 * pretended to verify something it cannot reach is the instrument failure this whole area is about.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { basename, join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
/* The gate reads the SAME definition the writers do — asking a second copy whether a value is a
   clock would be two rules pretending to be one, which is the fault this gate exists to stop. */
import { looksLikeClock } from "../wyclau/lib/artifact_version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WY = join(ROOT, "scripts", "wyclau");

let failures = 0;
const fail = (msg) => { console.log(`  FAIL  ${msg}`); failures++; };
const pass = (msg) => console.log(`  ok    ${msg}`);

/* THE TWO VALUES BELOW ARE NOT FIXTURES. They are the exact strings that were sitting in his two
   receipts on 2026-09-02, quoted in the `T-111` Chart row. Red-proofing on the real event rather
   than on something invented is the difference between a gate that would have fired and a gate that
   describes a story. */
const REAL_CLOCK_IN_HARVEST = "2026-09-02T21:55:24.391Z";
const REAL_CLOCK_IN_PUBLISH = "2026-09-02T22:06:23.279Z";
const REAL_VERSION_ID = "1788386140-0fbe";   // what LAST-PUBLISH held eleven minutes earlier

/* Run a writer against a THROWAWAY tree so the real receipts are never touched. Each script derives
   its target from its own location, so the copies must sit at the same depth. The sandbox is a real
   git repo with the real sibling modules present — a sandbox where an import silently fails is a
   gate that is green on a broken path (the trap CEO 82 found in glass_publish_stamp_check.mjs). */
/* ⚑ `carry` SEEDS THE CARRY RECEIPT `mark_glass_harvest.mjs` NOW REQUIRES (`T-140`, CEO 162).
   That writer refuses to stamp unless `--harvested=<page file>` names a page whose words were
   actually carried, which is the join that stops a session reading the page, stamping, and
   republishing over his words. **This gate is about the VERSION FIELD'S KIND, not about the carry**,
   so it satisfies the precondition and goes on testing its own subject. Seeding it here rather than
   loosening the writer keeps the refusal real everywhere else. */
function sandbox(scriptName, args, { chart = null, carry = null, harvest = null } = {}) {
  const box = mkdtempSync(join(tmpdir(), "receipt-kind-"));
  mkdirSync(join(box, "scripts", "wyclau", "lib"), { recursive: true });
  mkdirSync(join(box, ".planning", "wyclau"), { recursive: true });
  // Every module either writer can reach, so nothing resolves to a missing file.
  for (const f of ["mark_glass_harvest.mjs", "mark_glass_published.mjs", "glass_needs_publish.mjs"]) {
    writeFileSync(join(box, "scripts", "wyclau", f), readFileSync(join(WY, f)));
  }
  for (const f of ["retire.mjs", "chart_model.mjs", "artifact_version.mjs"]) {
    const src = join(WY, "lib", f);
    if (existsSync(src)) writeFileSync(join(box, "scripts", "wyclau", "lib", f), readFileSync(src));
  }
  if (chart !== null) writeFileSync(join(box, ".planning", "CHART.md"), chart);
  if (carry !== null) writeFileSync(join(box, ".planning", "wyclau", "LAST-CARRY"), carry);

  const git = (...a) => execFileSync("git", ["-C", box, ...a], { stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("init", "-q");
    git("config", "user.email", "gate@example.invalid");
    git("config", "user.name", "gate");
    git("add", "-A");
    git("commit", "-q", "-m", "sandbox");
  } catch { /* the assertions below will show it as a real failure rather than hide it */ }

  const receipts = {
    harvest: join(box, ".planning", "wyclau", "LAST-HARVEST"),
    publish: join(box, ".planning", "wyclau", "LAST-PUBLISH"),
  };
  writeFileSync(receipts.harvest, "SENTINEL-UNTOUCHED\n");
  writeFileSync(receipts.publish, "SENTINEL-UNTOUCHED\n");
  /* ⚠ AFTER the sentinels, deliberately — they are written last and would overwrite a seed
     placed earlier, which is how this looked like a real refusal when the seed was in place (`T-210`).
     Only the PUBLISH cases pass `harvest`, so the harvest-refusal cases below still see the sentinel
     and their "a refusal that writes is not a refusal" assertion keeps working. */
  if (harvest !== null) writeFileSync(receipts.harvest, harvest);

  /* ⚠ spawnSync, NOT execFileSync, AND THIS GATE ALREADY PAID FOR IT ONCE. execFileSync RETURNS
     stdout and hands stderr back only inside the thrown error — so on a SUCCESSFUL run its stderr is
     unreadable. Case 5 asserts that an unrecognised version is accepted *and warned about*, and a
     warning belongs on stderr; with execFileSync that case failed against a writer that was printing
     the warning correctly. Rule 6: when a check condemns something known to work, suspect the check
     first. Both streams are read here, on every path, pass or fail. */
  const r = spawnSync(process.execPath, [join(box, "scripts", "wyclau", scriptName), ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const code = r.status ?? 1;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const after = {
    harvest: existsSync(receipts.harvest) ? readFileSync(receipts.harvest, "utf8") : "",
    publish: existsSync(receipts.publish) ? readFileSync(receipts.publish, "utf8") : "",
  };
  rmSync(box, { recursive: true, force: true });
  return { code, out, after };
}

/* A Chart the harvest can read. `--rulings=none` means nothing is being retired, so the section only
   has to exist and be empty of live questions. */
const EMPTY_CHART = "# THE CHART\n\n## BLOCKED ON WYATT\n\n| question | why it is his |\n|---|---|\n\n## RULED\n\n| question | his verdict |\n|---|---|\n";

/* ⚑ ABSOLUTE, because the publish stamp now compares the RESOLVED PATH — CEO 168 showed a
   basename is not an identity: two sessions hold byte-identical names for the same page
   version, so the guard could not tell "did YOU read it?" from "did anyone?". */
const CARRIED_PAGE = resolve("/sessions/gate/tool-results/artifact-74034bde-1788386140-0fbe.html");
const harvest = (v, extra = []) => sandbox("mark_glass_harvest.mjs",
  [`--version=${v}`, "--rulings=none", `--harvested=${CARRIED_PAGE}`, ...extra],
  { chart: EMPTY_CHART, carry: `2026-09-03T11:00:00.000Z	carried=0	from=${basename(CARRIED_PAGE)}
` });
/* ⚑ `--harvested=` IS MANDATORY ON THE PUBLISH STAMP TOO NOW (`T-210`): it refuses unless THIS
   session named the page it read and LAST-HARVEST names the same one, so one session's look can no
   longer license another's overwrite. **This gate's subject is the VERSION FIELD'S KIND**, so it
   satisfies the precondition and goes on testing its own thing — seeding the receipt rather than
   loosening the refusal, which is what keeps the refusal real everywhere it matters. */
const publish = (v) => sandbox("mark_glass_published.mjs",
  [`--version=${v}`, `--harvested=${CARRIED_PAGE}`],
  { harvest: JSON.stringify({ artifactVersion: v, harvestedPath: CARRIED_PAGE }) });

console.log("the Glass receipts must record an IDENTITY, not a clock\n");

// 1. THE REAL CLOCK THAT LANDED IN LAST-HARVEST -> MUST BE REFUSED.
{
  const r = harvest(REAL_CLOCK_IN_HARVEST);
  if (r.code === 0) fail(`the harvest stamp ACCEPTED "${REAL_CLOCK_IN_HARVEST}" — the exact value that was in his receipt on 2026-09-02. A clock cannot answer "has he written something since?"`);
  else pass("the harvest stamp refuses the real clock value from 2026-09-02");
  if (r.after.harvest !== "SENTINEL-UNTOUCHED\n") fail("the harvest stamp WROTE a receipt while refusing — a refusal that writes is not a refusal");
  else pass("refusing leaves LAST-HARVEST untouched");
}

// 2. THE REAL CLOCK THAT LANDED IN LAST-PUBLISH -> MUST BE REFUSED.
{
  const r = publish(REAL_CLOCK_IN_PUBLISH);
  if (r.code === 0) fail(`the publish stamp ACCEPTED "${REAL_CLOCK_IN_PUBLISH}" — the exact value that was in his receipt on 2026-09-02`);
  else pass("the publish stamp refuses the real clock value from 2026-09-02");
  if (r.after.publish !== "SENTINEL-UNTOUCHED\n") fail("the publish stamp WROTE a receipt while refusing");
  else pass("refusing leaves LAST-PUBLISH untouched");
}

// 3. A BARE DATE IS A CLOCK TOO. The obvious way round a check that only looks for a "T".
{
  const bad = "2026-09-02";
  const h = harvest(bad), p = publish(bad);
  if (h.code === 0) fail(`the harvest stamp accepted the bare date "${bad}"`);
  else pass("the harvest stamp refuses a bare date");
  if (p.code === 0) fail(`the publish stamp accepted the bare date "${bad}"`);
  else pass("the publish stamp refuses a bare date");
}

// 4. THE REAL VERSION ID MUST STILL GO THROUGH — and be recorded. A guard that refuses the correct
//    value would wedge the Glass, which is a worse fault than the one being fixed.
{
  const h = harvest(REAL_VERSION_ID);
  if (h.code !== 0) fail(`the harvest stamp REFUSED the real version id "${REAL_VERSION_ID}" (exit ${h.code}): ${h.out.trim().split("\n")[0] ?? ""}`);
  else pass("the harvest stamp accepts a real artifact version id");
  if (!h.after.harvest.includes(REAL_VERSION_ID)) fail("the harvest stamp did not record the version it was given");
  else pass("the harvest receipt records the version id");

  const p = publish(REAL_VERSION_ID);
  if (p.code !== 0) fail(`the publish stamp REFUSED the real version id "${REAL_VERSION_ID}" (exit ${p.code}): ${p.out.trim().split("\n")[0] ?? ""}`);
  else pass("the publish stamp accepts a real artifact version id");
  if (!p.after.publish.includes(REAL_VERSION_ID)) fail("the publish stamp did not record the version it was given");
  else pass("the publish receipt records the version id");
}

// 5. AN UNRECOGNISED VALUE THAT IS NOT A CLOCK MUST BE ACCEPTED, AND SAID OUT LOUD.
//    This is the case that stops this gate hardening into a strict allow-list. If the platform ever
//    changes its id format, refusing here would stop the harvest stamp, and the harvest hook would
//    then deny every Glass publish — wedging the one surface Wyatt steers from, to prevent a fault
//    that has never happened. Warn, do not refuse.
{
  const odd = "v3-alpha-9";
  const h = harvest(odd), p = publish(odd);
  if (h.code !== 0) fail(`the harvest stamp REFUSED "${odd}", which is not a clock — an unrecognised id must warn, never block, or a format change wedges the Glass`);
  else pass("the harvest stamp accepts an unrecognised non-clock value");
  if (!/unrecognis|unrecogniz|does not look like/i.test(h.out)) fail("the harvest stamp accepted an unrecognised value SILENTLY — a warning nobody prints is a warning nobody gets");
  else pass("the harvest stamp says out loud that it did not recognise the value");
  if (p.code !== 0) fail(`the publish stamp REFUSED "${odd}", which is not a clock`);
  else pass("the publish stamp accepts an unrecognised non-clock value");
  if (!/unrecognis|unrecogniz|does not look like/i.test(p.out)) fail("the publish stamp accepted an unrecognised value SILENTLY");
  else pass("the publish stamp says out loud that it did not recognise the value");
}

// 6. ONE DEFINITION (rule 23). Two writers enforcing the same rule from two copies is two rules that
//    will drift — and the drift would be invisible, because each copy would keep its own gate green.
{
  const lib = join(WY, "lib", "artifact_version.mjs");
  if (!existsSync(lib)) fail("scripts/wyclau/lib/artifact_version.mjs does not exist — the rule is written twice or not at all");
  else {
    pass("there is one definition of what a version is: scripts/wyclau/lib/artifact_version.mjs");
    for (const f of ["mark_glass_harvest.mjs", "mark_glass_published.mjs"]) {
      const src = readFileSync(join(WY, f), "utf8");
      if (!/from\s+["']\.\/lib\/artifact_version\.mjs["']/.test(src))
        fail(`${f} does not import the shared definition — it is carrying its own copy of the rule`);
      else pass(`${f} reads the shared definition`);
    }
  }
}

// 7. THE LIVE RECEIPTS ON THIS MACHINE. The half that would actually have caught the real event:
//    the writers can only guard values written from now on, and these two files are what every
//    reader believes. Absent files are not a failure — they are gitignored and machine-local.
{
  const readers = {
    ".planning/wyclau/LAST-HARVEST": (t) => { try { return String(JSON.parse(t).artifactVersion ?? "").trim(); } catch { return ""; } },
    ".planning/wyclau/LAST-PUBLISH": (t) => ((t.match(/version=([^\s]+)/) || [])[1] ?? "").trim(),
  };
  /* One verdict function, used both on the live files and on the two receipts as they REALLY looked
     on 2026-09-02 — so the reader is proven able to condemn, not merely observed agreeing. */
  const verdictFor = (rel, text) => {
    const v = readers[rel](text);
    if (!v) return { kind: "empty", v };
    return { kind: looksLikeClock(v) ? "clock" : "identity", v };
  };

  /* 7a — RED-PROOF THE READER ON THE REAL WRECKAGE. These two blobs are the receipts as they stood
     when `T-111` was filed. If this reader cannot condemn them, case 7b below is decoration: it
     would agree with whatever is on disk and could never fail. */
  const wreckage = [
    [".planning/wyclau/LAST-HARVEST", `{\n  "artifactVersion": "${REAL_CLOCK_IN_HARVEST}",\n  "harvestedAt": "${REAL_CLOCK_IN_HARVEST}",\n  "ideaIds": [],\n  "rulingKeys": []\n}\n`],
    [".planning/wyclau/LAST-PUBLISH", `2026-09-02T22:06:23.279Z\tGlass published\tversion=${REAL_CLOCK_IN_PUBLISH}\tcommit=${"0".repeat(40)}\n`],
  ];
  for (const [rel, text] of wreckage) {
    const { kind } = verdictFor(rel, text);
    if (kind !== "clock") fail(`the reader for ${rel} did NOT condemn the real 2026-09-02 receipt (called it "${kind}") — so case 7b can never fail and is not protecting anything`);
    else pass(`the reader condemns ${rel} exactly as it stood on 2026-09-02`);
  }
  const goodPublish = `2026-09-02T22:06:23.279Z\tGlass published\tversion=${REAL_VERSION_ID}\tcommit=${"0".repeat(40)}\n`;
  if (verdictFor(".planning/wyclau/LAST-PUBLISH", goodPublish).kind !== "identity")
    fail("the reader condemned a GOOD publish receipt whose leading field is a timestamp — it is reading the wrong part of the line");
  else pass("the reader ignores the receipt's own written-at time and judges only the version field");

  /* 7b — THE LIVE FILES ON THIS MACHINE. The writers can only guard values written from now on;
     these two files are what every reader believes today. Absent is not a failure — they are
     gitignored and machine-local by design. */
  let looked = 0;
  for (const rel of Object.keys(readers)) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) { console.log(`  --    ${rel} is not on this machine (gitignored, machine-local) — nothing to read`); continue; }
    looked++;
    const { kind, v } = verdictFor(rel, readFileSync(p, "utf8"));
    if (kind === "empty") fail(`${rel} exists but records no version at all`);
    else if (kind === "clock") fail(`${rel} currently records "${v}", which is a clock. Every reader comparing it against the live page is asking a question it cannot answer.`);
    else pass(`${rel} records an identity ("${v}"), not a clock`);
  }
  if (looked === 0) console.log("  --    neither receipt is present on this machine; cases 1-6 still hold the writers");
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
