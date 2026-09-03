#!/usr/bin/env node
/* glass_shows_scheduled_ideas_check.mjs — SCHEDULED must never hide one of Wyatt's ideas again.
 *
 * HIS RULING, question UI, 2026-09-02T12:28:02.757Z, answer "yes" (.claude/memory/DECISIONS.md:695),
 * and it is quoted here word for word ON PURPOSE: the fate lexicon is THREE states — OPEN shows,
 * SCHEDULED shows AND SAYS SO, **PARKED shows DIMMED with its reason**, and only genuinely-finished
 * words hide. His Charter had said so in writing the whole time: "Every idea gets a VISIBLE fate
 * (shipped / scheduled / parked-with-reason) within a day."
 *
 * ⚠ THE WORD "DIMMED" IS LOAD-BEARING AND THIS HEADER DROPPED IT ONCE. The first version of this
 * file paraphrased the ruling as "PARKED shows with its reason" — one word lighter — and the gate
 * underneath it then tested exactly the paraphrase, certifying a page that showed neither the
 * reason nor the dimming. CEO 155 found the gap; CEO 157 found the paraphrase STILL HERE after the
 * gap was fixed. **A gate that tests the right thing under a header quoting the weakened version
 * will drift back to the header the next time somebody edits it from the top of the file.**
 *
 * WHAT IT COST BEFORE HE RULED: 13 of his 15 ideas were hidden from his own page, NINE of them by
 * the word SCHEDULED alone — the word a watch writes to PROMISE him something was the word that made
 * the promise invisible. He had asked four times for a thing that was, at that moment, not on the
 * list he steers by.
 *
 * WHY THIS GATE EXISTS AT ALL, MEASURED 2026-09-03: the ruling was built the day he made it and
 * NOTHING GUARDED IT. Running the live rule over the live Chart that morning: 34 ideas — 14 open,
 * 12 SCHEDULED, 1 parked, 7 finished. The old one-list rule would have hidden 20; the live rule
 * hides 7. **Thirteen of his ideas, including two he had marked DO NOW and three LIVE BUG REPORTS,
 * are on his page only because of this ruling** — and one word moved back into one list would have
 * taken all thirteen away with every check still green.
 *
 * IT RUNS THE REAL PAGE, NOT THE RULE. A gate that imports `stateOf` and asserts what it returns is
 * asking the suspect about itself. This copies the real `glass.mjs` into a throwaway tree, points it
 * at a fixture Chart carrying one idea of each fate, renders the page, and reads what is on it —
 * which is the thing he actually looks at. Same standard as
 * `chart_model_agrees_with_glass_check.mjs`, and for the same reason.
 *
 *   node scripts/qa/glass_shows_scheduled_ideas_check.mjs                  # must be GREEN
 *   node scripts/qa/glass_shows_scheduled_ideas_check.mjs --before         # pre-ruling lexicon: RED
 *   node scripts/qa/glass_shows_scheduled_ideas_check.mjs --before-parked  # the two-thirds render: RED
 *
 * TWO red-proofs, because there were two regressions a day apart and they live in different files.
 * Each rewrites a COPY — never the live tree — and each FAILS THE BUILD IF THE PAGE STILL LOOKS
 * RIGHT, because a check that cannot fail is not a measurement (rule 6). Both also refuse to run at
 * all if their patch turns out to be a no-op, so a rename cannot quietly turn a red-proof green.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLASS = join(ROOT, "scripts", "wyclau", "glass.mjs");
const MODEL = join(ROOT, "scripts", "wyclau", "lib", "chart_model.mjs");
const BEFORE = process.argv.includes("--before");
/* TWO red-proofs because there were TWO regressions, a day apart, and they live in different
   files. `--before` is the lexicon one (SCHEDULED back among the finished words, in the model).
   `--before-parked` is the one CEO 155 caught: the page rendering a bare `PARKED · <title>`,
   his ruling's third clause unbuilt, in glass.mjs. A single red-proof would have gone on passing
   through the second regression exactly as this gate's first version did. */
const BEFORE_PARKED = process.argv.includes("--before-parked");

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const pass = (m) => console.log(`  ok    ${m}`);

console.log(BEFORE
  ? "his three fate states — RED-PROOF: rendering with the pre-ruling lexicon (SCHEDULED hides)\n"
  : BEFORE_PARKED
  ? "his three fate states — RED-PROOF: rendering the two-thirds version (PARKED has no reason, no dimming)\n"
  : "his three fate states — OPEN shows, SCHEDULED says so, PARKED dims with its reason (2026-09-02)\n");

for (const [label, p] of [["scripts/wyclau/glass.mjs", GLASS], ["scripts/wyclau/lib/chart_model.mjs", MODEL]]) {
  if (!existsSync(p)) { fail(`${label} is missing — there is no page to read`); }
}
if (failures) { console.log(`\nFAIL (${failures})`); process.exit(1); }

const tmp = mkdtempSync(join(tmpdir(), "glass-sched-"));
process.on("exit", () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} });

mkdirSync(join(tmp, "scripts", "wyclau", "lib"), { recursive: true });
mkdirSync(join(tmp, ".planning", "wyclau", "status"), { recursive: true });
let glassSrc = readFileSync(GLASS, "utf8");
if (BEFORE_PARKED) {
  /* THE TWO-THIRDS VERSION, RECONSTRUCTED: the tag shipped, the reason and the dimming did not.
     Reconstructed by emptying the two fields rather than pasting an old copy of the file, so this
     red-proof keeps working when the rest of glass.mjs changes. */
  const patched = glassSrc
    .replace(/why: b\.state === "parked" \? parkedReason\(b\.all\) : "",/, 'why: "",')
    .replace(/dim: b\.state === "parked",/, "dim: false,");
  if (patched === glassSrc) {
    fail("could not reconstruct the pre-CEO-155 render — the `why`/`dim` fields are not where this red-proof expects them, so this run proved nothing");
    console.log(`\nFAIL (${failures})`);
    process.exit(1);
  }
  glassSrc = patched;
}
writeFileSync(join(tmp, "scripts", "wyclau", "glass.mjs"), glassSrc);

/* The copy is what `--before` edits. glass.mjs derives its own ROOT from its file location, so the
   copy reads this throwaway tree's .planning/ and writes its glass.html — it never sees, and so can
   never reset, the live GLASS-NOTE.md. (A watch's screenshot results were destroyed that way on
   2026-09-02; every fixture runner in this repo copies for that reason.) */
let model = readFileSync(MODEL, "utf8");
if (BEFORE) {
  /* THE RULE AS IT STOOD BEFORE HIS RULING: one list, SCHEDULED and PARKED inside it beside the
     five words that really do mean finished. Reconstructed by moving the words back, not by pasting
     an old copy of the file — so this red-proof keeps working when the rest of the module changes. */
  const patched = model
    .replace(/export const FINISHED_WORDS = \[[^\]]*\]/,
      'export const FINISHED_WORDS = ["SHIPPED", "HARVESTED", "CLOSED", "DONE", "FIXED", "ROOT-CAUSED", "SCHEDULED", "PARKED"]');
  if (patched === model) {
    fail("could not reconstruct the pre-ruling lexicon — FINISHED_WORDS is not where this red-proof expects it, so this run proved nothing");
    console.log(`\nFAIL (${failures})`);
    process.exit(1);
  }
  model = patched;
}
writeFileSync(join(tmp, "scripts", "wyclau", "lib", "chart_model.mjs"), model);

/* One idea of each fate. The heads carry a nonsense token so a match cannot be an accident, and it
   sits in the first two words so `shortTask`'s 16-word truncation cannot hide it. */
const FIXTURE = `# THE CHART — fixture

## THE LAUNCH LINE

| # | Step | State |
|---|---|---|
| 1 | **The reboot** | IN PROGRESS |

## STEP 1 CHECKLIST — the reboot

- [ ] **A row** — so the card is not empty.

## BLOCKED ON WYATT

| Question | Recommendation | since |
|---|---|---|

## THE IDEA INBOX

- **Zulufixture openidea** — he wrote this and nobody has ruled on it yet.
- **Zulufixture scheduledidea** — queued for the next session → **SCHEDULED**, next Glass pass.
- **Zulufixture parkedidea** — not now, he routed it himself. Two more lines of prose so this
  reads like the real thing, because the reason a real parked idea carries is written INSIDE the
  declared verdict on a CONTINUATION line and never on the head:
  → **PARKED, zulureason not before the launch** — and this trailing sentence must not be swept
  up into the reason.
- **Zulufixture shippedidea** — dealt with → **SHIPPED** 2026-08-30.
`;
writeFileSync(join(tmp, ".planning", "CHART.md"), FIXTURE);

let html = null;
try {
  // stderr is discarded on purpose: glass.mjs shells out to git for its "last progress" line and a
  // throwaway directory is not a repo, so it prints harmless `not a git repository` lines. Letting
  // those into npm test's output trains a reader to skim past real errors.
  execFileSync(process.execPath, [join(tmp, "scripts", "wyclau", "glass.mjs")],
    { encoding: "utf8", cwd: tmp, stdio: ["ignore", "pipe", "ignore"] });
  html = readFileSync(join(tmp, ".planning", "wyclau", "glass.html"), "utf8");
} catch (e) {
  fail(`the real glass.mjs would not render against a fixture tree: ${String(e.message).slice(0, 200)}`);
}

if (html === null) {
  console.log(`\nFAIL (${failures})`);
  process.exit(1);
}

/* `<`-escaped output and the JSON state block both appear in the page; normalising once means a
   match is about the words on his card and not about which of the two carried them. */
const page = html.replace(/\\u003c/g, "<").replace(/\\"/g, '"');
const shows = (t) => page.includes(t);

const checks = [
  ["an idea with NO fate is on his list", () => shows("Zulufixture openidea"), true],
  ["a SCHEDULED idea is on his list at all — the nine he lost", () => shows("Zulufixture scheduledidea"), true],
  ["…and it SAYS SO, so he can overrule the schedule", () => /SCHEDULED\s*·\s*Zulufixture scheduledidea/.test(page), true],
  ["a PARKED idea is on his list, with its fate named", () => /PARKED\s*·\s*Zulufixture parkedidea/.test(page), true],
  /* ⚑ THE THIRD CLAUSE, ADDED 2026-09-03 BECAUSE THIS GATE WAS CERTIFYING ITS ABSENCE. His ruling
     was "PARKED shows DIMMED WITH ITS REASON" and the first version of this file tested only the
     tag — with a fixture that put the reason on the HEAD line, where no real parked idea has ever
     written one. So it passed against a page rendering a bare `PARKED · <title>`. CEO 155 found
     it. The fixture now writes the reason where the Chart really writes it (inside the declared
     verdict, on a continuation line), which is what makes these two assertions able to fail. */
  ["…and it carries the REASON it was parked for, from the Chart's own verdict",
    () => /class="rowwhy"[^>]*>zulureason not before the launch</.test(page), true],
  ["…and only the reason — the sentence after the verdict is not swept up",
    () => !/class="rowwhy"[^>]*>[^<]*trailing sentence/.test(page), true],
  ["…and the parked row is DIMMED, so it reads as parked without being hidden",
    () => /<li class="[^"]*\bdim\b[^"]*"[^>]*>(?:(?!<\/li>)[\s\S])*?Zulufixture parkedidea/.test(page), true],
  ["a SCHEDULED row is NOT dimmed — it is live work he is owed",
    () => /<li class="[^"]*\bdim\b[^"]*"[^>]*>(?:(?!<\/li>)[\s\S])*?Zulufixture scheduledidea/.test(page), false],
  ["a genuinely FINISHED idea is the only kind that hides", () => !shows("Zulufixture shippedidea"), true],
];

const RED = BEFORE || BEFORE_PARKED;
let broke = 0;
for (const [label, run, want] of checks) {
  const got = run();
  if (got === want) { if (!RED) pass(label); }
  else { broke++; if (!RED) fail(label); }
}

if (RED) {
  /* The red-proof's own verdict. The pre-ruling lexicon must break at least the two SCHEDULED
     assertions; if it breaks nothing, this gate cannot tell the two worlds apart and is decoration. */
  const world = BEFORE ? "the old one-list lexicon" : "the two-thirds render (tag, no reason, no dimming)";
  if (broke === 0) {
    fail(`${world} rendered a page that passes every assertion — this gate cannot fail, so it is not a measurement`);
    console.log(`\nFAIL (${failures})`);
    process.exit(1);
  }
  console.log(`  RED as expected — ${broke} of ${checks.length} assertions break under ${world}.`);
  console.log("\nPASS (red-proof: the gate can fail)");
  process.exit(0);
}

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
