#!/usr/bin/env node
/* CEO BRIEF ASSEMBLER — makes rule 25 runnable instead of remembered.
 *
 * Wyatt, 2026-08-26: "is CEO in your documentation anywhere? I need to be able to ask you to run
 * CEO too."
 *
 * It WAS documented — rule 25 in the table, a section in CLAUDE.md §1, a template in
 * .claude/CEO-BRIEF.md. What it was not, was RUNNABLE. The sea trial is one command; the CEO review
 * was "spawn an agent and hand-assemble three things", so every session assembled it differently.
 *
 * THE HOLE THIS ALSO CLOSES, and it is the one that mattered: rule 25 says hand the new CEO "the
 * PREVIOUS CEO's verdict", so it can say whether the same fault is recurring. Verdicts lived only in
 * the running session's context. The moment a session ended, the one mechanism designed to catch a
 * RECURRING fault silently stopped working. They now live in .planning/CEO-REVIEWS.md and this
 * script pulls the newest one in automatically.
 *
 *   node scripts/qa/ceo_brief.mjs --ask="<his request, VERBATIM>" [--since=HEAD~3]
 *
 * Prints a complete brief. Paste it into a FRESH agent — never continue an old one; a CEO that
 * inherits your reasoning inherits your blind spot.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const sh = (c) => { try { return execSync(c, { cwd: REPO, encoding: "utf8" }).trim(); } catch { return ""; } };

const ask = arg("ask", "");
const since = arg("since", "origin/main");

/* THE PREVIOUS VERDICT — the whole reason this script exists. Newest entry from the append-only
   record, cut at the next heading. If the file is missing, SAY SO LOUDLY rather than quietly
   handing the CEO a brief with the recurrence check silently removed. */
const recPath = path.join(REPO, ".planning/CEO-REVIEWS.md");
let prev = "**NO PREVIOUS VERDICT ON RECORD — .planning/CEO-REVIEWS.md is missing.** Say so in your\n"
         + "review: the recurrence check cannot run, and that is itself a finding about the process.";
if (fs.existsSync(recPath)) {
  const t = fs.readFileSync(recPath, "utf8");
  const i = t.indexOf("\n## ");
  if (i >= 0) { const j = t.indexOf("\n## ", i + 4); prev = t.slice(i + 1, j < 0 ? undefined : j).trim(); }
}

const stamp = (fs.readFileSync(path.join(REPO, "src/ui/stage.js"), "utf8").match(/PP4_STAMP\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
const trial = fs.existsSync(path.join(REPO, ".planning/SEA-TRIAL.md"))
  ? fs.readFileSync(path.join(REPO, ".planning/SEA-TRIAL.md"), "utf8").split("\n").slice(0, 4).join("\n")
  : "no .planning/SEA-TRIAL.md on disk";

console.log(`You are the CEO. Repo: ${REPO}. READ-ONLY — do not edit, create or commit. Absolute
paths. Do not start a browser or a server. Bound your effort.

**WYATT ASKED, VERBATIM:**
${ask ? `"${ask}"` : `*** NOT SUPPLIED — rerun with --ask="his exact words". A summary is where the
drift already happened; do not let the reviewer grade a paraphrase. ***`}

**WHAT CHANGED (${since}..HEAD), build \`${stamp}\`:**
\`\`\`
${sh(`git diff --stat ${since}..HEAD`) || "(no diff — is this the right --since? after a push, try --since=HEAD~1)"}
\`\`\`
Commits:
\`\`\`
${sh(`git log --oneline ${since}..HEAD`) || "(none)"}
\`\`\`
Uncommitted:
\`\`\`
${sh("git status --porcelain") || "(clean)"}
\`\`\`

**THE SEA TRIAL AS IT STANDS:**
\`\`\`
${trial}
\`\`\`

**WHAT WAS DONE, AS CLAIMED:** *(fill this in — files, measurements, and what was NOT done)*

**THE PREVIOUS CEO'S VERDICT:**
${prev}

**ANSWER, in this order:**
1. For EACH thing he asked for: DONE / PARTIAL / NOT DONE, with the evidence you checked.
2. What was delivered that he did NOT ask for, and whether it displaced something he did.
3. Any claim unsupported by what is in the repo? Cite file:line.
4. Is the fault from the last verdict fixed, or has it recurred in new clothing?
5. DID THE CTO SPEND ITS OWN HEAD ON READING IT COULD HAVE DELEGATED? Wyatt, 2026-08-28: a session
   that fills its context with bulk file contents "gets stupid and stale", and by the time it does,
   it is too late to notice. So check the account of the work for BULK READING DONE IN THE MAIN
   THREAD — whole files read to find one rule, long trial reports or git archaeology read line by
   line, tool output dumped rather than filtered — where a subagent could have read it and handed
   back findings. NAME the specific reads, or say plainly that you found none.
   THE EXCEPTIONS ARE NOT FAILURES AND MUST NOT BE REPORTED AS ONE: Wyatt's own words and
   screenshots (rule 22), the rendered game (rule 19), and a file being actively edited all belong
   in the main thread by design. Delegating THOSE is the worse fault, and if you see it, say so.
6. One sentence Wyatt should read first.

**RULES:** Plain English — he is a founder and designer, not an engineer; define any professional
term once in the same sentence. **You may say NO.** A criticism with no file:line citation is an
opinion. Assume the author is flattering himself. Its verdict reaches him in ITS words, especially
when bad.

---
AFTERWARDS: append the verdict to .planning/CEO-REVIEWS.md, newest at the top. A verdict nobody
recorded is a recurrence check nobody can run.`);
