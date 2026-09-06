#!/usr/bin/env node
// THE CLOSE GATE MUST BE ABLE TO SEE EVERY CEO VERDICT THAT EXISTS.
//
// Found 2026-09-04 by the T-251 watch while closing its own item: `close_item.mjs` refused with
//
//     CEO Review 192 is not in CEO-REVIEWS.md
//
// -- a sentence TRUE about its own search and FALSE about the file. Review 192 was sitting in it,
// headed `## CEO 192 —` instead of `## CEO Review 192 —`, and the reader splits on the long form
// only. The watch normalised 191 and 192 by hand and moved on. IT DID NOT SWEEP: six verdicts were
// invisible, not two -- CEO 82, 83, 135, 182, 189 and 190, the oldest from 2026-09-01.
//
// ONE OF THEM IS WHY AN ITEM WOULD NOT CLOSE. CEO 182 is a `T-216` verdict, and `T-216` is the row
// the Chart records as "worked, NOT closed". A gate that cannot find a verdict refuses in words
// that blame the record, so three days of this looked like missing CEO reviews rather than a
// blind reader.
//
// THIS IS THE PROJECT'S NAMED RECURRING FAULT, and it is the fourth instance in a week: an
// instrument reporting NOT FOUND has told you something about ITSELF, not about the world. The
// fleet's browser launcher, the deploy stamp, `pkill`'s all-clear, the Bell's missing --model.
// Every one was fixed by making something READ THE REAL THING instead of trusting a shape.
//
// SO THIS GATE READS close_item.mjs's OWN REGEX OUT OF ITS SOURCE and applies it to the real
// CEO-REVIEWS.md. It does NOT keep a copy of the pattern. A copy would be a second thing kept in
// step with the first by discipline (CLAUDE.md rule 23) -- and this whole bug is what that costs.
// Loosen the reader and this gate follows automatically; tighten it and this gate catches it.
//
// RED-PROOFED: on the tree as found, it fails naming all six. Restore the long-form-only regex in
// close_item.mjs and it fails again. Both were run before this file was kept.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLOSER = join(REPO, "scripts", "wyclau", "close_item.mjs");
const REVIEWS = join(REPO, ".planning", "CEO-REVIEWS.md");

const fail = [];
const note = [];

for (const [label, p] of [["close_item.mjs", CLOSER], ["CEO-REVIEWS.md", REVIEWS]]) {
  if (!existsSync(p)) {
    console.error(`FAIL  ${label} does not exist -- this gate is pointed at nothing, which reads\n` +
                  `      exactly like a clean machine. Repoint it or delete it; never leave it green.`);
    process.exit(1);
  }
}

const closerSrc = readFileSync(CLOSER, "utf8");
const reviewsSrc = readFileSync(REVIEWS, "utf8");

// ---- lift the reader's OWN pattern out of its source ------------------------------------------
// The gate is only honest if it exercises the regex that actually runs. If the shape of that line
// changes so much that this cannot find it, SAY SO and fail -- do not fall back to a hardcoded
// pattern, because that is the moment the gate quietly starts testing a copy.
const splitLit = closerSrc.match(/reviews\.split\(\/([^/]+)\/m\)/);
const findLit = closerSrc.match(/new RegExp\(`([^`]*\$\{ceoN\}[^`]*)`\)/);
if (!splitLit || !findLit) {
  fail.push(
    "could not find close_item.mjs's CEO-verdict lookup to test it.\n" +
    "      This gate lifts the reader's real regex from its source rather than keeping a copy.\n" +
    "      If that lookup was rewritten, update the two matchers here in the same commit -- and do\n" +
    "      NOT give this gate its own hardcoded pattern, or it starts testing itself.");
} else {
  // WHAT WE LIFTED IS JAVASCRIPT SOURCE TEXT, NOT A PATTERN YET. In the file the matcher reads
  // `^## CEO Review ${ceoN}\\b` -- two literal backslash characters, because the author was writing
  // a template string. Hand that straight to RegExp and `\\b` means "a backslash, then b", which
  // matches nothing, so EVERY verdict reads as invisible and the gate condemns a reader that works.
  // The first run of this file did exactly that: 182 of 182, including verdicts that close fine.
  // CLAUDE.md rule 6 -- when a check condemns something known to work, suspect the check first.
  const unescape = (s) => s.replace(/\\\\/g, "\\");
  const splitter = new RegExp(unescape(splitLit[1]), "m");
  const sections = reviewsSrc.split(splitter);

  // ---- every REAL verdict heading in the file, ignoring anything inside a fenced block ---------
  // A heading quoted inside ``` is documentation about a heading, not a verdict.
  let fenced = false;
  const found = [];
  for (const line of reviewsSrc.split("\n")) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = line.match(/^## CEO (?:Review )?(\d+)\b/);
    if (m) found.push({ n: Number(m[1]), line: line.slice(0, 90) });
  }

  if (!found.length) {
    fail.push("no `## CEO <n>` headings found in CEO-REVIEWS.md at all -- the file's shape changed\n" +
              "      and this gate can no longer see its subject.");
  }

  const blind = [];
  for (const { n, line } of found) {
    const re = new RegExp(unescape(findLit[1]).replace("${ceoN}", String(n)));
    if (!sections.some((s) => re.test(s))) blind.push({ n, line });
  }

  if (blind.length) {
    fail.push(
      `close_item.mjs CANNOT SEE ${blind.length} of ${found.length} CEO verdict(s) that are in the file:\n` +
      blind.map(({ n, line }) => `        CEO ${n}  ->  ${line}`).join("\n") + "\n" +
      "      Closing any item that names one of these refuses with \"CEO Review <n> is not in\n" +
      "      CEO-REVIEWS.md\" -- a sentence true about the search and FALSE about the file.\n" +
      "      Fix the READER (accept both heading forms), not the headings: rewriting today's\n" +
      "      headings repairs today's file and leaves the next short one invisible.");
  } else {
    note.push(`the close gate can find all ${found.length} verdict(s) in CEO-REVIEWS.md`);
  }
}

// ---- and the refusal must not assert something it did not check -------------------------------
// The message is half the bug. "is not in CEO-REVIEWS.md" is a claim about the world made on the
// strength of one regex; three days of blindness read as three days of missing reviews because of
// that wording. An honest refusal names what it searched for.
const refusal = closerSrc.match(/refuse\(`CEO Review \$\{ceoN\} is not in CEO-REVIEWS\.md`/);
if (refusal) {
  fail.push(
    "close_item.mjs still refuses with `CEO Review <n> is not in CEO-REVIEWS.md`.\n" +
    "      That asserts a fact about the FILE on the strength of a SEARCH. Say what was actually\n" +
    "      looked for and what was found instead -- an instrument reporting NOT FOUND has told you\n" +
    "      something about itself, not about the world (CLAUDE.md rule 6).");
}

for (const n of note) console.log("      " + n);
if (fail.length) {
  for (const f of fail) console.error("FAIL  " + f);
  process.exit(1);
}
console.log("PASS  close_gate_sees_every_ceo: every CEO verdict in the record is visible to the gate that reads it.");
