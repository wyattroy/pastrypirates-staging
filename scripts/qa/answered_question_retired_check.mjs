// GATE: A QUESTION WYATT HAS ALREADY ANSWERED MUST NOT STILL BE ASKING HIM.
//
// Wyatt, 2026-09-02 6:57 PM ET, sixth instance in twelve hours:
//   "the page continues to re-show me thw e questions AFTER they're harvested. this is NOT fixed
//    and it is a PRIORITY more than any of the SEO work"
// and, the time he photographed it:
//   "I already answered both of these about 15 minutes ago. Please tell me why the page still shows
//    them, and is still asking me to answer them again"
//
// WHAT HE WAS LOOKING AT. The Glass's "Your Call" card renders `## BLOCKED ON WYATT` from
// .planning/CHART.md verbatim. Harvesting his answer WRITES the ruling into the record and DELETES
// NOTHING — so the row keeps rendering and the page keeps asking. Recording the answer and retiring
// the question are two acts joined by a session remembering to do the second one, which is the
// shape .claude/CLAUDE.md rule 23 forbids by name: two things kept in step by discipline are two
// things that will drift. It drifted six times in twelve hours, and three of those were repaired by
// hand, which is not a fix.
//
// ⚠ AND THE HARVEST OF 2026-09-02T22:5xZ WROTE THE CONDITION DOWN IN ITS OWN COMMIT — "all five
// rules-page questions in the Your Call table above are now answered" — AND LEFT ALL FIVE ASKING,
// because its mandate was harvest-and-publish. It detected the exact fault and had no authority to
// act on it. That is not carelessness; it is the job split in two with only one half owned. A gate
// is the half nobody has to remember.
//
// THE RULE, IN ONE LINE: the set of question ids in `## BLOCKED ON WYATT` and the set of question
// ids that already carry a ruling must not intersect.
//
// WHERE "ALREADY CARRIES A RULING" IS READ FROM — three sources, deliberately, and the union is
// used because each is blind somewhere the others are not:
//   1. `## RULED` in CHART.md and `## SETTLED RULINGS` in CHART-LOG.md, via the `<!--qid:…-->` the
//      retire script stamps onto the row it writes. DURABLE and in git, so this works on any
//      machine and on any clone. Rows retired before this convention carry no qid and are invisible
//      to it — stated rather than papered over.
//   2. `.planning/wyclau/LAST-HARVEST`'s `rulingKeys`. EXACT — it is the receipt of what the harvest
//      actually read off his live page — but gitignored, so it is machine-local by nature and
//      absent on a fresh clone.
//
// ⚠ AND BOTH SOURCES ARE NARROWER THAN THAT PARAGRAPH USED TO CLAIM. CEO 125 found the header
// asserting source 2 "is what makes this gate red TODAY, on the machine where it happened" — and
// `.planning/wyclau/LAST-HARVEST` had been overwritten to `"rulingKeys": []` SEVENTY-ONE SECONDS
// BEFORE this file was written. So on the live tree the answered-set is empty from both sides, and
// cases 1-3 are vacuous on BOTH sides rather than only because his queue is empty. Two structural
// limits, stated here rather than discovered later:
//   · SOURCE 1 ONLY EXISTS WHEN THE BUG DID NOT HAPPEN. A `qid` reaches `## RULED` only because
//     `retire_answered.mjs` put it there — and a hand-harvest, which IS the failure, writes a RULED
//     row with no qid. So the durable source cannot see the fault it guards.
//   · SOURCE 2 IS ONE TICK WIDE. `mark_glass_harvest.mjs` rewrites the receipt whole on every
//     harvest, so the previous tick's keys are gone — one did exactly that tonight, erasing his five
//     — and it only carries keys at all if the harvesting session remembered `--rulings=`.
// WHAT THIS GATE THEREFORE IS: a catch for the fault WITHIN the tick that caused it, plus a
// permanent guard on the JOIN (cases 2, 3, 5, 6, 7) which does not depend on either source. It is
// NOT a standing audit of the whole history, and the header must not read as though it were.
//   3. Nothing else. DECISIONS.md was considered and rejected: it stores his rulings in prose with
//      no question id, so joining to it would be a fuzzy word match, and a fuzzy match that RETIRES
//      one of his questions is strictly worse than the bug — it would hide a question he never saw.
//
// IT ALSO GUARDS THE JOIN ITSELF, because the retirement is only as trustworthy as the id it acts
// on. Two questions whose ids collide means his answer to one retires the other, and the record
// then shows him answering a question he never saw (chart_model.mjs, `questionId`). Cases 1 and 2.
//
// House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { section, tableRows } from "../wyclau/lib/chart_model.mjs";
import { questionId, QID_RE } from "../wyclau/lib/chart_model.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");
const read = (...p) => { try { return readFileSync(join(ROOT, ...p), "utf8"); } catch { return null; } };

let failed = false;
const fail = (m) => { console.error(`FAIL -- ${m}`); failed = true; };
const pass = (m) => console.log(`PASS -- ${m}`);

/* THE QUESTIONS CURRENTLY ASKING HIM. `tableRows` skips the header by POSITION (the `|` line above
   the `|---|` rule) rather than by its words, which is why this does not need to know that the
   column is called "Question". */
function askingRows(chartMd) {
  return tableRows(section(chartMd, "BLOCKED ON WYATT") ?? "")
    .map((r) => ({ ...questionId(r.cells[0]), cell: r.cells[0], raw: r.raw }));
}

/* THE QUESTIONS THAT ALREADY HAVE AN ANSWER. Sources 1 and 2 above; `extraKeys` is how a fixture
   hands in a receipt without touching the real machine's file. */
function answeredIds(chartMd, logMd, extraKeys = []) {
  const ids = new Set(extraKeys.map((k) => String(k).toLowerCase()));
  const scan = (md, heading) => {
    for (const r of tableRows(section(md ?? "", heading) ?? "")) {
      const m = QID_RE.exec(r.raw);
      if (m) ids.add(m[1].toLowerCase());
    }
  };
  scan(chartMd, "RULED");
  scan(logMd, "SETTLED RULINGS");
  return ids;
}

/* The whole rule, in one function, so the real tree and every fixture below are judged identically.
   Returns a list of English sentences — a violation nobody can read is a violation nobody acts on. */
function violations(chartMd, logMd, extraKeys = []) {
  const out = [];
  const rows = askingRows(chartMd);
  const answered = answeredIds(chartMd, logMd, extraKeys);

  for (const r of rows) {
    if (answered.has(r.id))
      out.push(`ANSWERED AND STILL ASKING: "${r.cell.replace(QID_RE, "").replace(/\*\*/g, "").slice(0, 70)}…" (qid ${r.id}) is a live row in ## BLOCKED ON WYATT and already carries a ruling. His page is asking him a question he has answered. Retire it with: node scripts/wyclau/retire_answered.mjs --qid=${r.id} --verdict="…"`);
  }

  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.id))
      out.push(`TWO QUESTIONS, ONE ID (${r.id}): "${seen.get(r.id).slice(0, 45)}…" and "${r.cell.replace(QID_RE, "").slice(0, 45)}…". His answer to one would retire the other and the record would show him answering a question he never saw. Give each an explicit <!--qid:…--> marker.`);
    seen.set(r.id, r.cell);
  }

  for (const r of rows) {
    if (!r.explicit)
      out.push(`NO WRITTEN-DOWN ID: "${r.cell.replace(/\*\*/g, "").slice(0, 60)}…" has no <!--qid:…--> marker, so its identity is the first 40 characters of its own prose — which collides with any sibling question that opens the same way, and is silently orphaned the moment the wording is edited. Add <!--qid:a-short-slug--> to the front of the question cell.`);
  }
  return out;
}

/* `--chart=<path>` points cases 1-3 at a Chart other than the tree's own. It takes no part in npm
   test, which calls this with no arguments; it exists so a session can ask "would this Chart pass?"
   before committing it, and so the red-proof below could be run against the REAL pre-repair file
   (`git show cb7cfc89:.planning/CHART.md`) rather than only against the rows copied into case 4.
   The red-proofs are deliberately NOT switchable: a gate whose ability to fail depends on an
   argument is a gate that stops failing the day somebody forgets it. */
const chartArg = process.argv.slice(2).find((a) => a.startsWith("--chart="));
const chart = chartArg
  ? (() => { try { return readFileSync(chartArg.slice(8), "utf8"); } catch { return null; } })()
  : read(".planning", "CHART.md");
const log = read(".planning", "CHART-LOG.md");
if (chartArg) console.log(`(reading ${chartArg.slice(8)} instead of the tree's Chart — cases 1-3 only)`);
if (chart === null) { fail(".planning/CHART.md could not be read — the Your Call card has no source and this gate has nothing to judge."); process.exit(1); }

/* ⚠ THE REAL PRE-REPAIR ROWS, RECOVERED FROM COMMIT cb7cfc89 AND KEPT HERE VERBATIM.
   These are the five questions he answered between 6:50 and 6:53 PM ET on 2026-09-02 and which were
   still asking him at 6:58 PM — the sixth instance, and the one that produced his priority ruling.
   THEY ARE COPIED IN RATHER THAN READ FROM GIT ON PURPOSE: a gate that depends on a commit object
   stops being able to fail the day this branch is squashed, and a red-proof that can quietly become
   a no-op is the exact failure this suite has been bitten by (a gate aimed at a tree that moved is
   not silent, it is reassuring — docs/HARD-WON-LESSONS.md §3). Provenance is the commit named above;
   `git show cb7cfc89:.planning/CHART.md` still holds the originals today. */
const PROVENANCE = "cb7cfc89";
const REAL_PREREPAIR_QUESTIONS = [
  "**RULES PAGE 1 of 4 — which page becomes THE rules page?** You asked for this split before anything gets built. Holds up ⟨`T-114`⟩ and the rules page itself.",
  "**RULES PAGE 2 of 4 — what does About keep?** Holds up ⟨`T-114`⟩, the three wrong sentences on that page.",
  "**RULES PAGE 3 of 4 — does the in-game modal show the full rules, or a short version that links out?** Holds up ⟨`T-100`⟩, building the page.",
  "**RULES PAGE 4 of 4 — does the rules page speak pirate, or in your own plain voice?** Holds up ⟨`T-100`⟩, building the page.",
  "**And once Credits has its own page — does About keep its credits list?** Holds up ⟨`T-101`⟩, the credits page.",
];
/* The five keys his five answers were actually stored under, read off .planning/wyclau/LAST-HARVEST
   at 2026-09-02T23:0xZ. Not computed here — that would make case 7 a tautology. */
const REAL_HARVESTED_KEYS = [
  "rules-page-1-of-4-which-page-becomes-th",
  "rules-page-2-of-4-what-does-about-keep",
  "rules-page-3-of-4-does-the-in-game-moda",
  "rules-page-4-of-4-does-the-rules-page-s",
  "and-once-credits-has-its-own-page-does",
];
const chartWith = (questions) =>
  `# fixture\n\n## BLOCKED ON WYATT\n\n| Question | Recommendation | since |\n|---|---|---|\n` +
  questions.map((q) => `| ${q} | rec | 2026-09-02 |`).join("\n") +
  `\n\n## RULED\n\n| item | HIS RULING | now |\n|---|---|---|\n`;

// 1/17 -- THE REAL TREE: no question he has answered is still asking him.
{
  const rows = askingRows(chart);
  const answered = answeredIds(chart, log, harvestKeys());
  const bad = rows.filter((r) => answered.has(r.id));
  if (bad.length) bad.forEach((r) => fail(`"${r.cell.replace(QID_RE, "").slice(0, 70)}…" (qid ${r.id}) is still asking him and already has a ruling.`));
  /* ⚠ SAY WHEN THERE WAS NOTHING TO LOOK AT. `## BLOCKED ON WYATT` is legitimately empty for most
     of a day, and a bare "PASS" over zero rows is a measurement that cannot fail wearing the
     clothes of one that passed. The count is printed for exactly that reason. */
  else pass(`no answered question is still asking him — ${rows.length} question(s) live, ${answered.size} answered id(s) on record${rows.length === 0 ? " (nothing waiting, so this case had nothing to catch)" : ""}.`);
}

// 2/17 -- THE REAL TREE: no two live questions share an id.
{
  const rows = askingRows(chart);
  const dupes = rows.filter((r, i) => rows.findIndex((x) => x.id === r.id) !== i);
  if (dupes.length) fail(`${dupes.length} live question(s) share an id with another — his answer to one would retire the other. First: ${dupes[0].id}`);
  else pass(`all ${rows.length} live question id(s) are distinct.`);
}

// 3/17 -- THE REAL TREE: every live question carries a written-down id.
{
  const derived = askingRows(chart).filter((r) => !r.explicit);
  if (derived.length) fail(`${derived.length} live question(s) have no <!--qid:…--> marker, so their identity is their own prose. First: "${derived[0].cell.slice(0, 60)}…"`);
  else pass(`every live question carries an explicit <!--qid:…--> marker.`);
}

// 4/17 -- RED-PROOF, AND IT IS THE REAL EVENT, NOT AN INVENTED ONE: his five rules-page questions,
//        exactly as they sat in BLOCKED ON WYATT at 6:58 PM, against the five keys his five answers
//        were really stored under. This gate must report all five.
{
  const v = violations(chartWith(REAL_PREREPAIR_QUESTIONS), null, REAL_HARVESTED_KEYS);
  const stillAsking = v.filter((m) => m.startsWith("ANSWERED AND STILL ASKING"));
  if (stillAsking.length !== 5)
    fail(`the gate cannot fail on the event it was written for: his five answered rules-page questions were replayed against his five real ruling keys and ${stillAsking.length} of 5 were caught.`);
  else pass("red-proof: all 5 of his 6:50 PM rules-page questions are caught still asking him, against the 5 keys his answers were really stored under.");
}

// 5/17 -- RED-PROOF: two different questions that collide on the derived slug.
{
  const v = violations(chartWith([
    "⟨`T-105`⟩ Should the harvest retire the row immediately, or flag it for a watch?",
    "⟨`T-105`⟩ Should the harvest retire the row only after a CEO has seen it?",
  ]));
  if (!v.some((m) => m.startsWith("TWO QUESTIONS, ONE ID")))
    fail("the gate cannot fail: two genuinely different questions that slug to the same id were planted and nothing objected — his answer to one would silently retire the other.");
  else pass("red-proof: two questions colliding on one id are caught.");
}

// 6/17 -- RED-PROOF: a question with no written-down id.
{
  const v = violations(chartWith(["Should the credits page carry the full list, or a short one?"]));
  if (!v.some((m) => m.startsWith("NO WRITTEN-DOWN ID")))
    fail("the gate cannot fail: a question with no <!--qid:…--> marker was planted and nothing objected.");
  else pass("red-proof: a question with no written-down id is caught.");
}

// 7/17 -- THE FALLBACK STILL REPRODUCES HIS REAL KEYS, CHARACTER FOR CHARACTER.
//        Every ruling he has ever made is stored under the derived slug. If a future tidy-up of that
//        one line changes what it produces, every one of those rulings is orphaned at once and
//        nothing else in the suite would notice. This is the line that would go red.
{
  const got = REAL_PREREPAIR_QUESTIONS.map((q) => questionId(q).id);
  const mismatch = got.map((g, i) => [g, REAL_HARVESTED_KEYS[i]]).filter(([g, w]) => g !== w);
  if (mismatch.length) fail(`the derived-slug fallback no longer reproduces the keys his real rulings are stored under — ${mismatch.length} of 5 differ. First: computed "${mismatch[0][0]}" vs stored "${mismatch[0][1]}". Every ruling keyed by the old rule is now orphaned.`);
  else pass("the derived-slug fallback still reproduces all 5 of his real stored ruling keys, character for character.");
}

// 8/17 -- THE FIXTURE IS REALLY HIS, AND NOT SOMETHING I TYPED. Case 4 computes its ids from the five
//        strings copied into this file, so a single mistyped character would make it a red-proof
//        against my own typo rather than against his question — and it would still pass. This asks
//        git whether those five strings are verbatim in the commit they claim to come from.
//        IT SKIPS RATHER THAN PASSES when the commit is not in this clone, because "I could not
//        look" and "I looked and it was fine" are different sentences and only one of them is true.
{
  let historical = null;
  try {
    historical = execFileSync("git", ["show", `${PROVENANCE}:.planning/CHART.md`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch { /* shallow clone, squashed branch, or no git — say so below */ }
  if (historical === null) console.log(`SKIP -- commit ${PROVENANCE} is not in this clone, so the five copied questions could not be checked against their source. Case 4 still runs; it is testing this file's copies.`);
  else {
    const missing = REAL_PREREPAIR_QUESTIONS.filter((q) => !historical.includes(q));
    if (missing.length) fail(`${missing.length} of the 5 questions copied into this gate are NOT verbatim in ${PROVENANCE} — case 4 is red-proofing a typo, not his question. First: "${missing[0].slice(0, 70)}…"`);
    else pass(`all 5 copied questions are verbatim in ${PROVENANCE}, so case 4 replays the real event.`);
  }
}

/* ═══ THE FIX ITSELF, RUN END TO END ON HIS REAL QUESTION — cases 9-11.
   The three cases above prove the gate can SEE the fault. These prove `retire_answered.mjs` REMOVES
   it, by running the real script against a staged tree holding his real 6:50 PM question.
   ⚠ THIS IS NOT THE ACCEPTANCE TEST HE IS OWED, AND THE DIFFERENCE IS SAID OUT LOUD RATHER THAN
   BLURRED. SPEC-ANSWERED-QUESTIONS-RETIRE.md §4 requires the SYMPTOM: answer a question on the LIVE
   page, let the harvest run, and assert the question is gone FROM HIS PAGE. A Bell-launched watch
   has no Artifact tool and cannot read or publish that page, so that half is NOT RUN. What is proven
   here is the file half: the question leaves the record in the same act that records his answer. */
/* The page file the seeded carry receipt names — any name, so long as the receipt and the flag
   agree, which is exactly what the writer checks. */
const CARRIED_PAGE = "artifact-74034bde-1788386140-0fbe.html";
function stage(chartMd) {
  const dir = mkdtempSync(join(tmpdir(), "retire-answered-"));
  mkdirSync(join(dir, "scripts", "wyclau", "lib"), { recursive: true });
  mkdirSync(join(dir, ".planning", "wyclau"), { recursive: true });
  /* `mark_glass_harvest.mjs` and `lib/retire.mjs` join the staged tree for cases 13-17: the stamp is
     the caller, so the fault cannot be reproduced without it. Each file is copied IF IT EXISTS —
     a case whose subject is missing must FAIL with that sentence, not crash the whole gate here and
     take the eleven cases below it down with an ENOENT nobody can read. */
  for (const f of [["retire_answered.mjs"], ["mark_glass_harvest.mjs"]]) {
    try { writeFileSync(join(dir, "scripts", "wyclau", ...f), readFileSync(join(ROOT, "scripts", "wyclau", ...f))); } catch { /* reported by the case that needs it */ }
  }
  /* ⚑ THE CARRY RECEIPT `mark_glass_harvest.mjs` NOW REQUIRES (`T-140`, CEO 162). That writer
     refuses to stamp unless `--harvested=<page>` names a page whose words were actually carried —
     the join that stops a session reading his page, stamping, and republishing over his words.
     **This gate's subject is RETIREMENT, not the carry**, so it satisfies the precondition and goes
     on testing its own thing. Seeding it here rather than loosening the writer keeps the refusal
     real everywhere it matters. */
  writeFileSync(join(dir, ".planning", "wyclau", "LAST-CARRY"),
    `2026-09-03T11:00:00.000Z	carried=0	from=${CARRIED_PAGE}
`);
  /* ⚠ THE WHOLE lib/ FOLDER, DERIVED RATHER THAN LISTED — earned 2026-09-03 (`T-111`). This used to
     name chart_model.mjs and retire.mjs by hand. `mark_glass_harvest.mjs` then gained one more
     import — lib/artifact_version.mjs — and FIVE cases here failed against a script that was
     working, every one of them reporting ERR_MODULE_NOT_FOUND as if it were the fault under test.
     A hand-kept list of what to stage rots exactly like the thing it guards; the directory is the
     answer, and the next shared module needs nobody to remember this file. */
  try {
    for (const f of readdirSync(join(ROOT, "scripts", "wyclau", "lib"))) {
      writeFileSync(join(dir, "scripts", "wyclau", "lib", f), readFileSync(join(ROOT, "scripts", "wyclau", "lib", f)));
    }
  } catch { /* reported by the case that needs it */ }
  writeFileSync(join(dir, ".planning", "CHART.md"), chartMd);
  return dir;
}
const runRetire = (dir, args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "retire_answered.mjs"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};

// 9/17 -- HIS REAL QUESTION, RETIRED BY THE REAL SCRIPT, IN ONE ACT.
{
  const dir = stage(chartWith([REAL_PREREPAIR_QUESTIONS[0]]));
  const r = runRetire(dir, [`--qid=${REAL_HARVESTED_KEYS[0]}`, `--verdict=**"Do a new /rules.html that explains the rules -- using the latest version of the game."** — ruled on the Glass 2026-09-02 6:50:08 PM ET`]);
  const after = readFileSync(join(dir, ".planning", "CHART.md"), "utf8");
  const stillAsking = askingRows(after).length;
  const ruled = tableRows(section(after, "RULED") ?? "");
  if (r.code !== 0) fail(`retire_answered.mjs refused a legitimate retirement (exit ${r.code}): ${r.out.slice(0, 200)}`);
  else if (stillAsking !== 0) fail(`retire_answered.mjs recorded the answer and LEFT THE QUESTION ASKING — ${stillAsking} row(s) still in BLOCKED ON WYATT. That is the exact bug, now inside the fix.`);
  else if (ruled.length !== 1) fail(`retire_answered.mjs deleted his question and wrote ${ruled.length} ruling rows instead of 1 — his answer would be lost, which is worse than the bug.`);
  else if (!ruled[0].raw.includes(`<!--qid:${REAL_HARVESTED_KEYS[0]}-->`)) fail("the RULED row carries no qid, so the answered-set is invisible to any machine without LAST-HARVEST and this gate goes blind on a fresh clone.");
  else if (!ruled[0].raw.includes("latest version of the game")) fail("his verbatim words did not reach the RULED row.");
  else if (violations(after, null).length) fail(`after retirement the gate still reports: ${violations(after, null)[0].slice(0, 120)}`);
  else pass("his real 6:50 PM question is retired by the real script in one act: gone from Your Call, his words in ## RULED under its qid, gate clean.");
  rmSync(dir, { recursive: true, force: true });
}

// 10/17 -- THE SCRIPT IS WHAT CLOSES IT. Same fixture, script NOT run: the gate must still object.
{
  const before = chartWith([REAL_PREREPAIR_QUESTIONS[0]]);
  if (!violations(before, null, [REAL_HARVESTED_KEYS[0]]).some((m) => m.startsWith("ANSWERED AND STILL ASKING")))
    fail("case 9 proves nothing: the same fixture BEFORE the script ran is not reported as a violation, so the green afterwards was not caused by the fix.");
  else pass("red-proof for case 9: the identical fixture is a violation until the script runs.");
}

// 11/17 -- HIS WORDS SURVIVE A PIPE AND A NEWLINE. Found by CEO 125: the RULED row was a bare
//          template literal, so a "|" in a ruling he typed would split the row into extra cells and
//          corrupt the table, and a newline would drop the rest of his sentence into the document as
//          prose. The one script promising "his words, verbatim" could be broken by his words.
{
  const dir = stage(chartWith([REAL_PREREPAIR_QUESTIONS[0]]));
  const hostile = `**"do it | but keep the modal"**\nsecond line — ruled on the Glass`;
  const r = runRetire(dir, [`--qid=${REAL_HARVESTED_KEYS[0]}`, `--verdict=${hostile}`]);
  const after = readFileSync(join(dir, ".planning", "CHART.md"), "utf8");
  const ruled = tableRows(section(after, "RULED") ?? "");
  if (r.code !== 0) fail(`retire_answered.mjs refused a ruling containing a pipe (exit ${r.code}) — his words must go in, not be rejected.`);
  else if (ruled.length !== 1) fail(`a ruling containing "|" produced ${ruled.length} rows instead of 1 — his answer split the table apart.`);
  else if (ruled[0].cells.length !== 3) fail(`a ruling containing "|" produced ${ruled[0].cells.length} cells instead of 3 — the RULED table is corrupted and his verdict is spread across columns.`);
  else if (!ruled[0].raw.includes("keep the modal") || !ruled[0].raw.includes("second line"))
    fail("part of his verdict did not survive — a newline dropped the rest of his sentence out of the row.");
  else pass("red-proof: a ruling containing a pipe and a newline lands in ONE well-formed row with all of his words intact.");
  rmSync(dir, { recursive: true, force: true });
}

// 12/17 -- IT REFUSES RATHER THAN SHRUGS. A no-op exiting 0 is this whole bug in a different hat:
//          the caller is told the retirement happened and his page goes on asking.
{
  const dir = stage(chartWith([REAL_PREREPAIR_QUESTIONS[0]]));
  const r = runRetire(dir, ["--qid=a-question-nobody-asked", "--verdict=x"]);
  const untouched = readFileSync(join(dir, ".planning", "CHART.md"), "utf8") === chartWith([REAL_PREREPAIR_QUESTIONS[0]]);
  const noVerdict = runRetire(dir, [`--qid=${REAL_HARVESTED_KEYS[0]}`]);
  if (r.code === 0) fail("retire_answered.mjs exited 0 on an id no live question carries — a silent no-op that reports success is the bug being fixed, wearing a different hat.");
  else if (!untouched) fail("retire_answered.mjs edited CHART.md while refusing — a refusal that writes is worse than either outcome.");
  else if (noVerdict.code === 0) fail("retire_answered.mjs retired a question with no verdict — that deletes his question and records no answer, which is his words lost.");
  else pass("red-proof: an unknown id and a missing verdict are both refused, and neither writes to the Chart.");
}

/* ═══ THE HARVEST IS THE CALLER — cases 13-17.
   Cases 9-12 prove `retire_answered.mjs` works. They say nothing about whether anything RUNS it,
   and that is exactly what CEO 125 found still missing:

     "(a) NOTHING CALLS THE SCRIPT. The spec asks for retirement run BY THE HARVEST — not by a
      session following a runbook step — and what shipped is a command a session types."

   Six times in twelve hours a session did every step except the one that deletes the question, and
   the 22:5xZ harvest wrote the condition into its own commit before leaving all five asking. So the
   guard belongs where it cannot be forgotten: `mark_glass_harvest.mjs` is the ONE command a harvest
   cannot skip — the runbook requires it, a hook requires it, and it already receives the exact ids
   he ruled on in `--rulings=`. A caller that already runs and already holds the keys is the caller.

   TWO PROPERTIES, and the second is the one that matters:
     · it can RETIRE (`--retire=<qid>::<verdict>`) in the same act that writes the receipt, and
     · it REFUSES to stamp at all while a ruling it is carrying still has a live question row.
   The refusal is what makes it mechanical rather than another sentence in a runbook. */
const runHarvest = (dir, args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [join(dir, "scripts", "wyclau", "mark_glass_harvest.mjs"), `--harvested=${CARRIED_PAGE}`, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; }
};
const receiptOf = (dir) => { try { return JSON.parse(readFileSync(join(dir, ".planning", "wyclau", "LAST-HARVEST"), "utf8")); } catch { return null; } };
const REAL_VERSION = "1788386140-0fbe";   // the shape the Artifact tool really returns: <epoch>-<hash>
const HIS_VERDICT = `**"Do a new /rules.html that explains the rules -- using the latest version of the game."** — ruled on the Glass 2026-09-02 6:50:08 PM ET`;

// 13/17 -- THE STAMP REFUSES WHILE A QUESTION HE HAS ANSWERED IS STILL ASKING.
//          This is the bug reproduced in one command, with no page and no Artifact tool needed:
//          the harvest is handed the key he ruled under, and today it files the receipt and walks
//          past the live row.
{
  const before = chartWith([REAL_PREREPAIR_QUESTIONS[0]]);
  const dir = stage(before);
  const r = runHarvest(dir, [`--version=${REAL_VERSION}`, `--rulings=${REAL_HARVESTED_KEYS[0]}`]);
  const receipt = receiptOf(dir);
  const untouched = readFileSync(join(dir, ".planning", "CHART.md"), "utf8") === before;
  if (r.code === 0)
    fail(`mark_glass_harvest.mjs stamped a harvest carrying "${REAL_HARVESTED_KEYS[0]}" while that question is STILL a live row in ## BLOCKED ON WYATT. That is the six-times bug: his answer is on record and his page goes on asking. The stamp must refuse.`);
  else if (receipt !== null)
    fail("mark_glass_harvest.mjs refused AND wrote the receipt — a refusal that writes leaves the next reader believing the harvest was recorded.");
  else if (!untouched)
    fail("mark_glass_harvest.mjs refused AND edited CHART.md — a refusal must leave the tree exactly as it found it.");
  else if (!r.out.includes(REAL_HARVESTED_KEYS[0]) || !r.out.includes("--retire="))
    fail(`the refusal does not say WHICH question or HOW to fix it. It must name the qid and print the --retire= form, or the session that hits it is back to remembering. Got: ${r.out.slice(0, 200)}`);
  else pass("the harvest stamp REFUSES while a question he has answered is still asking, names the qid, prints the fix, and writes nothing.");
  rmSync(dir, { recursive: true, force: true });
}

// 14/17 -- ONE ACT: the receipt and the retirement land together, from the harvest itself.
{
  const dir = stage(chartWith([REAL_PREREPAIR_QUESTIONS[0]]));
  const r = runHarvest(dir, [`--version=${REAL_VERSION}`, `--retire=${REAL_HARVESTED_KEYS[0]}::${HIS_VERDICT}`]);
  const after = readFileSync(join(dir, ".planning", "CHART.md"), "utf8");
  const receipt = receiptOf(dir);
  const ruled = tableRows(section(after, "RULED") ?? "");
  if (r.code !== 0) fail(`mark_glass_harvest.mjs refused a legitimate --retire= (exit ${r.code}): ${r.out.slice(0, 250)}`);
  else if (askingRows(after).length !== 0) fail("the harvest stamped the receipt and LEFT THE QUESTION ASKING — the two acts are still two acts.");
  else if (ruled.length !== 1 || !ruled[0].raw.includes(`<!--qid:${REAL_HARVESTED_KEYS[0]}-->`)) fail(`the harvest retired the question but his answer did not land as one ## RULED row carrying its qid (${ruled.length} row(s)).`);
  else if (!ruled[0].raw.includes("latest version of the game")) fail("his verbatim words did not reach the RULED row through the harvest path.");
  else if (receipt === null) fail("the question was retired and NO receipt was written — the harvest is now unrecorded, which is a different fault of the same shape.");
  else if (!(receipt.rulingKeys ?? []).includes(REAL_HARVESTED_KEYS[0])) fail("the receipt does not carry the id it just retired, so `rulingKeys` no longer describes what the harvest read.");
  else if (receipt.artifactVersion !== REAL_VERSION) fail(`the receipt records "${receipt.artifactVersion}" instead of the version it was given.`);
  else pass("one act: the harvest retires his answered question AND writes the receipt naming it, in a single run.");
  rmSync(dir, { recursive: true, force: true });
}

// 15/17 -- ATOMIC. A --retire= that cannot be honoured writes NEITHER half. Half a harvest is worse
//          than none: a Chart edited with no receipt, or a receipt claiming a retirement that did
//          not happen, are both records that lie.
{
  const before = chartWith([REAL_PREREPAIR_QUESTIONS[0]]);
  const dir = stage(before);
  const r = runHarvest(dir, [`--version=${REAL_VERSION}`, `--retire=${REAL_HARVESTED_KEYS[0]}::${HIS_VERDICT}`, "--retire=a-question-nobody-asked::x"]);
  const untouched = readFileSync(join(dir, ".planning", "CHART.md"), "utf8") === before;
  if (r.code === 0) fail("mark_glass_harvest.mjs accepted a --retire= for an id no live question carries — a silent no-op reporting success is this bug wearing a different hat.");
  else if (!untouched) fail("a refused harvest still edited CHART.md — the FIRST retirement was applied and the second was not, so the file holds half an act.");
  else if (receiptOf(dir) !== null) fail("a refused harvest still wrote the receipt.");
  else pass("atomic: one bad --retire= in a batch writes neither the Chart nor the receipt.");
  rmSync(dir, { recursive: true, force: true });
}

// 16/17 -- HIS WORDS SURVIVE THE NEW PATH TOO. Case 11 proved this for retire_answered.mjs; a second
//          caller is a second chance to corrupt `## RULED` with a pipe he typed on his phone, and the
//          only reason it cannot is that both callers go through ONE definition (case 17).
{
  const dir = stage(chartWith([REAL_PREREPAIR_QUESTIONS[0]]));
  const hostile = `**"do it | but keep the modal"**\nsecond line — ruled on the Glass`;
  const r = runHarvest(dir, [`--version=${REAL_VERSION}`, `--retire=${REAL_HARVESTED_KEYS[0]}::${hostile}`]);
  const ruled = tableRows(section(readFileSync(join(dir, ".planning", "CHART.md"), "utf8"), "RULED") ?? "");
  if (r.code !== 0) fail(`the harvest refused a ruling containing a pipe (exit ${r.code}) — his words must go in, not be rejected.`);
  else if (ruled.length !== 1 || ruled[0].cells.length !== 3) fail(`a ruling containing "|" produced ${ruled.length} row(s) / ${ruled[0]?.cells.length} cells through the harvest path — his answer split the table apart.`);
  else if (!ruled[0].raw.includes("keep the modal") || !ruled[0].raw.includes("second line")) fail("part of his verdict did not survive the harvest path.");
  else pass("a ruling containing a pipe and a newline survives the harvest path in one well-formed row.");
  rmSync(dir, { recursive: true, force: true });
}

// 18/19 -- THE GUARD CANNOT BE SKIPPED BY OMITTING THE FLAG. CEO 127's first finding, and it was
//          right: a refusal keyed on an OPTIONAL argument fires only when the session remembered the
//          argument, which is the same "a session remembered" the whole item exists to delete.
//          So `--rulings=` is mandatory, and a page that carried nothing says so out loud.
{
  const before = chartWith([REAL_PREREPAIR_QUESTIONS[0]]);
  const dir = stage(before);
  const silent = runHarvest(dir, [`--version=${REAL_VERSION}`]);          // the path that actually failed
  const receiptAfterSilent = receiptOf(dir);
  if (silent.code === 0)
    fail("mark_glass_harvest.mjs stamped a harvest that never said what rulings it carried. The refusal in case 13 keys on --rulings=, so omitting it walks straight past the guard — a session forgetting one flag is exactly the failure being fixed.");
  else if (receiptAfterSilent !== null)
    fail("the stamp refused a harvest with no --rulings= and wrote the receipt anyway.");
  else if (!silent.out.includes("--rulings=none"))
    fail(`the refusal does not name the escape for a page that carried nothing, so an honest empty harvest has no way through. Got: ${silent.out.slice(0, 200)}`);
  else pass("a harvest that does not say what rulings it carried is REFUSED — the guard cannot be skipped by omitting the flag.");
  rmSync(dir, { recursive: true, force: true });
}

// 19/19 -- AND THE ESCAPE REALLY WORKS, otherwise case 18 just breaks every quiet tick. Most ticks
//          carry nothing; `--rulings=none` must stamp cleanly and record an empty set.
{
  const dir = stage(chartWith([]));
  const r = runHarvest(dir, [`--version=${REAL_VERSION}`, "--rulings=none"]);
  const receipt = receiptOf(dir);
  if (r.code !== 0) fail(`a quiet tick declaring --rulings=none was refused (exit ${r.code}): ${r.out.slice(0, 200)}`);
  else if (receipt === null) fail("--rulings=none was accepted and wrote no receipt.");
  else if ((receipt.rulingKeys ?? []).length !== 0) fail(`--rulings=none recorded ${receipt.rulingKeys.length} ruling key(s) — "none" was read as an id.`);
  else pass("a quiet tick declares --rulings=none, stamps cleanly, and records an empty ruling set.");
  rmSync(dir, { recursive: true, force: true });
}

// 17/19 -- ONE DEFINITION OF THE RETIREMENT, NOT TWO. Rule 23: two things that must agree are one
//          thing or they will drift. The moment the stamp became a second caller, the RULED-row
//          construction and the deletion had to move to one module both import — otherwise the pipe
//          escaping, the qid stamp and the single-write atomicity exist twice and one copy rots.
{
  const lib = read("scripts", "wyclau", "lib", "retire.mjs");
  const retirer = read("scripts", "wyclau", "retire_answered.mjs") ?? "";
  const stamp = read("scripts", "wyclau", "mark_glass_harvest.mjs") ?? "";
  const buildsRow = (src) => /<!--qid:\$\{/.test(src);   // the RULED row assembled in place
  if (lib === null) fail("there is no scripts/wyclau/lib/retire.mjs — the retirement has no single definition, so the harvest and retire_answered.mjs each carry their own copy of it.");
  else if (!/from "\.\/lib\/retire\.mjs"/.test(retirer) || !/from "\.\/lib\/retire\.mjs"/.test(stamp))
    fail("retire_answered.mjs and mark_glass_harvest.mjs do not BOTH import ./lib/retire.mjs — a module only converges the two callers that use it.");
  else if (buildsRow(retirer) || buildsRow(stamp))
    fail("a caller still assembles the ## RULED row itself, so the escaping and the qid stamp live in two places and one of them will rot.");
  else pass("one definition: both callers import lib/retire.mjs and neither builds a ## RULED row of its own.");
}

/* The machine-local receipt, read defensively: gitignored, absent on a fresh clone, and written by a
   different process. A gate that throws on a missing optional input is a gate that fails for a
   reason that has nothing to do with its subject. */
function harvestKeys() {
  const raw = read(".planning", "wyclau", "LAST-HARVEST");
  if (raw === null) return [];
  try {
    const keys = JSON.parse(raw).rulingKeys;
    return Array.isArray(keys) ? keys : [];
  } catch { return []; }
}

process.exit(failed ? 1 : 0);
