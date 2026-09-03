#!/usr/bin/env node
/* add_lesson.mjs — the formal way a day's lesson is written. There was not one.
 *
 * HIS WORDS, 2026-09-03, with a screenshot of the card: *"the Lesson is two days old; it is
 * formatted wrong, and whatever process is supposed to give me new ones does not exist in a formal
 * way yet. build that, get CEO approval."*
 *
 * ⛔ HE IS RIGHT, AND THE PAGE HAD BEEN SAYING SO HONESTLY THE WHOLE TIME. The Glass card reads
 * *"No lesson yet today — the day's close owes one"*, and `LESSONS.md` held exactly ONE entry,
 * dated 2026-09-01. The apprenticeship is a co-equal goal of the charter and his own amendment of
 * 2026-08-31 made it DAILY ("I learn fast"). What existed was a sentence in a runbook — "one daily
 * lesson if none has been given today" — and a sentence is what fails. **This is the third thing
 * this week that was a rule with no mechanism** (the ranker nothing ran; the harvest nothing
 * called), and both of those were caught the same way: he asked again.
 *
 * WHAT THIS IS AND IS NOT. It is the WRITER: it validates the shape, refuses the ways the entry can
 * be wrong, and puts it where the Glass reads. **It is not a lesson generator.** A lesson is a
 * thing somebody learned; manufacturing one to make his card look fresh would be worse than the
 * honest empty state the card already shows.
 *
 * USAGE:
 *   node scripts/wyclau/add_lesson.mjs --title="Why relief beats resuscitation" --body="..."
 *   node scripts/wyclau/add_lesson.mjs --title="..." --body-file=<path>   [--date=YYYY-MM-DD]
 *
 * EXIT: 0 written · 1 refused (and nothing was written) · 2 usage
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LESSONS = join(ROOT, ".planning", "wyclau", "LESSONS.md");
const NL = String.fromCharCode(10);

const argv = process.argv.slice(2);
const arg = (n) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : ""; };

const title = arg("title").trim();
const date = (arg("date") || new Date().toISOString().slice(0, 10)).trim();
let body = arg("body");
if (!body && arg("body-file")) {
  try { body = readFileSync(resolve(arg("body-file")), "utf8"); }
  catch (e) { console.error(`cannot read --body-file: ${String(e.code ?? e.message)}`); process.exit(2); }
}
body = String(body ?? "").trim();

if (!title || !body) {
  console.error(`usage: --title="<the lesson's name>" --body="<the lesson>" [--date=YYYY-MM-DD]
       or: --title="..." --body-file=<path>

A LESSON IS SOMETHING SOMEBODY LEARNED. This writes one down; it does not invent one. A day with
no lesson shows honestly on his Glass as "the day's close owes one", and that is better than a
filled card nobody learned anything from.`);
  process.exit(2);
}

/* ⚠ THE SHAPE THE GLASS PARSES, and it is not negotiable from here: `glass.mjs` matches
   /^## (\d{4}-\d{2}-\d{2}) [—-]+ (.+)$/m. An entry written any other way is silently invisible on
   his page — no error, no warning, just a card that says the newest lesson is older than it is.
   That is the failure this whole item is about, so it is checked here rather than discovered
   there. */
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`REFUSING — --date must be YYYY-MM-DD, got "${date}".`);
  process.exit(1);
}
/* ⛔ A FUTURE DATE PINS HIS CARD FOREVER. `glass.mjs` sorts entries descending and shows the
   newest, so one typo'd year ("2099") becomes "the newest lesson" permanently — and his card then
   reads *"No lesson yet today… The newest, from 2099-12-31"* every day after, with no error
   anywhere. The shape check above cannot see this: 2099-12-31 is a perfectly well-formed date.
   Caught by CEO 174. */
if (date > new Date().toISOString().slice(0, 10)) {
  console.error(`REFUSING — ${date} is in the future.

The Glass shows the NEWEST lesson, so a future date pins his card to this entry forever and every
real lesson after it becomes invisible. Nothing was written.`);
  process.exit(1);
}
if (/[\r\n]/.test(title)) {
  console.error("REFUSING — the title is one line; the Glass reads it off the heading.");
  process.exit(1);
}
/* ⛔ A HEADING INSIDE THE TITLE OR BODY CREATES A PHANTOM LESSON. `glass.mjs:931` splits the file
   on /^(?=## )/m, so a line looking like an entry heading anywhere in the text becomes its own
   lesson: it TRUNCATES the real one's body on his card, appears in the Captain's log as a concept
   he owns, and poisons the duplicate guard below — after a body injected "## 2026-09-09 — squatter",
   the genuine write for that date was REFUSED.

   THIS IS NOT AN ADVERSARIAL CASE. `LESSONS.md`'s own header documents the format, so a lesson
   ABOUT THE LESSON PROCESS that quotes it does exactly this. Caught by CEO 174. */
const HEADING = /^## \d{4}-\d{2}-\d{2} /m;
if (HEADING.test(title) || HEADING.test(body)) {
  console.error(`REFUSING — the text contains a line shaped like a lesson heading ("## YYYY-MM-DD — …").

The Glass splits the file on those, so this would create a PHANTOM lesson: it truncates the real
one on his card and then blocks the next genuine write for that date. Indent the quoted line, or
write the date without the leading "## ". Nothing was written.`);
  process.exit(1);
}

let file = "";
try { file = readFileSync(LESSONS, "utf8"); }
catch (e) { console.error(`cannot read ${LESSONS}: ${String(e.code ?? e.message)}`); process.exit(1); }

/* AT MOST ONE ENTRY PER DAY — the file's own header says so. Two entries for one date would make
   "today's lesson" ambiguous, and the page shows only the newest. */
if (new RegExp(`^## ${date} `, "m").test(file)) {
  console.error(`REFUSING — there is already a lesson dated ${date}.

The file's rule is at most one a day. Edit that entry if it needs changing, or pass a different
--date. Nothing was written.`);
  process.exit(1);
}

/* ⛔ DO NOT HARD-WRAP HIS LESSON. The body goes in as written, one paragraph per blank line, and
   the Glass unwraps and re-flows it to HIS screen (`glass.mjs`'s lessonHtml). Wrapping it here at
   somebody's terminal width is precisely the fault he screenshotted: his page broke mid-sentence
   because the file was wrapped at ~95 columns for an editor. A newline written here is a newline
   he sees. */
const entry = `## ${date} — ${title}${NL}${NL}${body}${NL}`;

/* NEWEST FIRST, under the header block — so a person opening the file reads the newest lesson
   without scrolling, and so does the next session. The Glass sorts by date regardless, so this is
   for the humans. */
const firstEntry = file.search(/^## \d{4}-\d{2}-\d{2} /m);
const out = firstEntry === -1
  ? `${file.replace(/\s*$/, "")}${NL}${NL}${entry}`
  : `${file.slice(0, firstEntry)}${entry}${NL}${file.slice(firstEntry)}`;
writeFileSync(LESSONS, out);

/* COUNTED FROM THE FILE, never from the intention — the session-wide rule earned tonight. */
const after = readFileSync(LESSONS, "utf8");
if (!new RegExp(`^## ${date} `, "m").test(after)) {
  console.error("!! THE ENTRY DID NOT LAND. Nothing was recorded; do not tell him a lesson exists.");
  process.exit(1);
}
console.log(`lesson recorded: ${date} — ${title}`);
console.log(`  ${LESSONS.replace(ROOT, ".")} now holds ${(after.match(/^## \d{4}-\d{2}-\d{2} /gm) || []).length} lesson(s).`);
console.log("  It reaches him only once the Glass is REGENERATED AND REPUBLISHED — a lesson in a file");
console.log("  is not a lesson on his page, which is the same distinction that cost him a day on the");
console.log("  retired-question fault. Commit it, then republish.");
