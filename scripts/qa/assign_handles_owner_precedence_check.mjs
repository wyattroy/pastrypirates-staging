#!/usr/bin/env node
/* assign_handles_owner_precedence_check.mjs — CEO 182, findings 4 and 5, both demonstrated in
 * an isolated copy (never against the live record — this is the untestability finding 5 opened
 * with, and it is fixed alongside the bugs it let hide).
 *
 * (4) IDENTITY GOES TO THE OWNER, NEVER TO WHICHEVER ROW COMES FIRST. Where a row that merely
 *     MENTIONS a handle sits above the row whose owner line DECLARES it, the mentioner used to
 *     keep the id and the real owner got renamed — the opposite of what `assign_handles.mjs`'s
 *     own header promises.
 * (5) A REFUSAL ON ONE CHART MUST NOT LEAVE THE OTHER ALREADY WRITTEN. The old loop wrote each
 *     chart as it finished; a refusal on the second file left the first one modified on disk
 *     with no backup, while the message it printed said "nothing was written".
 *
 * Both are driven against real fixture files via `--chart=` / `--log=`, never against
 * `.planning/CHART.md` — this gate must be safe to run inside `npm test`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(import.meta.url), "..", "..", "..");
const SCRIPT = join(REPO, "scripts", "wyclau", "assign_handles.mjs");

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const run = (args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
};

const tmp = mkdtempSync(join(tmpdir(), "assign-handles-check-"));
const logFile = join(tmp, "LOG.md");
writeFileSync(logFile, "# fixture log — no allocations here\n");

// ---------------------------------------------------------------------------------------------
// TEST 1 — owner precedence. A mention-only row sits BEFORE the row that actually owns T-500.
// ---------------------------------------------------------------------------------------------
const fixtureA = join(tmp, "fixture-a.md");
// The inline mention must match the real inline-reference regex exactly: ⟨\`T-nnn\`...⟩
const mentionLine = "- [ ] A row that only MENTIONS the shared handle in its own prose, filed first in the\n      document, from an earlier fix ⟨`T-500`⟩ -- not this row's own identity.";
const ownerLine = "- [ ] The row that actually OWNS this handle, filed SECOND in the document.\n      ⟨`T-500`⟩";
writeFileSync(fixtureA, `# Fixture Chart\n\n## STEP 1 CHECKLIST\n\n${mentionLine}\n\n${ownerLine}\n\n## THE IDEA INBOX\n`);

let r = run([`--chart=${fixtureA}`, `--log=${logFile}`, "--write"]);
check("test 1: assign_handles exits 0 on the owner-precedence fixture", r.code === 0, r.out.trim().slice(0, 200));
const after1 = readFileSync(fixtureA, "utf8");
const ownerRowStillT500 = /actually OWNS this handle[\s\S]*?⟨`T-500`⟩/.test(after1);
// The mention row keeps its inline "⟨`T-500`⟩" reference (untouched prose) AND now ALSO has its
// own distinct owner line -- a line that is JUST a tag, on its own, and not "T-500". That is
// what "given a new identity of its own" means; the inline reference is never supposed to move.
const mentionBlock = (after1.split("filed first in the")[1] || "").split("The row that actually OWNS")[0];
const mentionOwnerLines = [...mentionBlock.matchAll(/^\s*⟨`(T-\d{3})`\s*⟩\s*$/gm)].map((m) => m[1]);
const mentionRowRenamed = mentionOwnerLines.length === 1 && mentionOwnerLines[0] !== "T-500" && mentionBlock.includes("T-500");
check("test 1: the OWNER row keeps T-500", ownerRowStillT500, after1.includes("T-500") ? "T-500 present" : "T-500 missing entirely");
check("test 1: the MENTION-ONLY row was given a NEW handle, not T-500 as its identity", mentionRowRenamed, `owner lines found in that row: ${JSON.stringify(mentionOwnerLines)}`);

// ---------------------------------------------------------------------------------------------
// TEST 2 — atomicity. Fixture B is engineered to trigger the structural refusal; fixture C
// (processed alongside it) must NOT be modified when B is refused.
// ---------------------------------------------------------------------------------------------
const fixtureB = join(tmp, "fixture-b.md");
const fixtureC = join(tmp, "fixture-c.md");
// C: one untagged row -- a legitimate, harmless edit that WOULD succeed on its own.
// Carries one real, already-tagged row so the high-water-mark scan has something to find --
// otherwise the script refuses for an unrelated reason ("no allocated handle anywhere") before
// it ever reaches the write/refusal path this test means to exercise.
const cBefore = "# Fixture C\n\n## STEP 1 CHECKLIST\n\n- [ ] An already-tagged row, unrelated, just so a high-water mark exists.\n      ⟨`T-100`⟩\n\n- [ ] A perfectly normal untagged row that would get a fresh handle.\n\n## THE IDEA INBOX\n";
writeFileSync(fixtureC, cBefore);
// B: an untagged row that legitimately needs a fresh handle (so the script WILL try to write
// this file), sitting in a document that ALSO carries an inert "glued" example -- quoted text
// living OUTSIDE both scanned sections (never parsed as a row, never token-matched), the same
// shape as real quoted examples already living in .planning/CHART.md. The script's own
// whole-file post-write invariant scan (not row-scoped) must still catch it and refuse, exactly
// as it would on a genuinely corrupt document -- which is what proves the refusal is real and
// not merely assumed.
const bBefore = "# Fixture B\n\n## STEP 1 CHECKLIST\n\n- [ ] A perfectly normal untagged row that needs a fresh handle assigned.\n\n## SOME UNRELATED SECTION, NOT A ROW RANGE\n\nQuoted verbatim from another document, not a real row: ⟨`T-501`⟩- [ ] example glued text.\n\n## THE IDEA INBOX\n";
writeFileSync(fixtureB, bBefore);

// C FIRST, B SECOND: under the old (non-atomic) write loop, C's write would succeed and land on
// disk before the loop ever reaches B's refusal -- that ordering is exactly what proves
// atomicity, since a fix that validates-then-writes-all must leave C untouched regardless of
// which file the refusal comes from.
r = run([`--chart=${fixtureC},${fixtureB}`, `--log=${logFile}`, "--write"]);
check("test 2: assign_handles REFUSES (exit 1) when one fixture is structurally unsafe", r.code === 1, r.out.trim().slice(0, 300));
const cAfter = readFileSync(fixtureC, "utf8");
check("test 2: the OTHER fixture (C) was left byte-for-byte untouched by the refusal", cAfter === cBefore, cAfter === cBefore ? "" : "fixture C changed despite fixture B's refusal");

rmSync(tmp, { recursive: true, force: true });

if (failures) { console.log(`\n${failures} check(s) FAILED.`); process.exit(1); }
console.log("\nAll checks PASSED.");
