/* THE TRIAL MUST NAME ITSELF IN ITS OWN REPORT.
 *
 * Wyatt, 2026-08-30: "Call it sea trial v2 so we can increment it."
 *
 * WHY A SECOND NUMBER EXISTS AT ALL. The build stamp says which GAME was tested. The trial version
 * says which INSTRUMENT tested it, and they move independently — the same build can be sailed by a
 * weaker trial and a stronger one, and before this the two reports looked identical. That matters
 * most for SILENCE: a v1 report that says nothing about unjudged screens is not evidence they were
 * looked at, because v1 only ever judged the first thirty per leg. Without a version on the page,
 * a future session comparing two reports cannot tell "clean" from "not looked at".
 *
 * SO THE ASSERTION IS ABOUT THE ARTIFACT, NOT THE SOURCE: every header the trial can write must
 * carry the version — the IN-PROGRESS marker as well as the final verdict. The in-progress one
 * matters more, not less: it is what survives a killed run, and a killed run is exactly when
 * somebody needs to know which instrument was mid-sail.
 *
 * Run against a file path so it can be RED-PROOFED on a deliberately broken copy:
 *   node scripts/qa/trial_version_check.mjs [path-to-sea_trial.mjs]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = process.argv[2] || path.join(REPO, "scripts/sea_trial.mjs");
const src = fs.readFileSync(FILE, "utf8");

let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : `\n       ${detail}`}`);
  if (!ok) fails++;
};

const declared = (src.match(/const TRIAL_VERSION\s*=\s*"(v\d+)"/) || [])[1];
check("the trial declares a version, shaped vN", !!declared, `found: ${declared || "no TRIAL_VERSION = \"vN\" declaration"}`);

/* Count the report headers the file can emit, and require the version on every one. Two today:
   the IN-PROGRESS marker written before sailing, and the final verdict. If a third is ever added,
   this fails until it carries the version too — which is the point. */
const headers = [...src.matchAll(/`# Sea trial([^\n`]*)— build/g)].map(m => m[1]);
check("the trial writes at least the two headers it is supposed to (in-progress + verdict)",
  headers.length >= 2, `found ${headers.length}`);
const bare = headers.filter(h => !h.includes("TRIAL_VERSION"));
check("EVERY report header carries the version — the in-progress marker included",
  bare.length === 0,
  bare.length ? `${bare.length} header(s) say only "# Sea trial — build ..." with no version` : "");

/* A version bump with no note is a number nobody can interpret later. The comment block must
   describe the version that is actually set, so `v3` cannot be typed without saying what changed. */
check(`the comment block explains what ${declared || "the current version"} is`,
  !!declared && new RegExp(`^\\s*\\*\\s*${declared}\\b`, "m").test(src),
  `no line in the header comment starts with " * ${declared}"`);

console.log(fails ? `\nFAIL — ${fails} failure(s)` : `\nPASS — sea trial ${declared}, named in every report it writes`);
process.exit(fails ? 1 : 0);
