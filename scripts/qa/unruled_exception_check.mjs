#!/usr/bin/env node
/* unruled_exception_check.mjs — AN EXCEPTION NOBODY RULED ON MUST NOT REACH THE GAME.
 *
 *   node scripts/qa/unruled_exception_check.mjs
 *
 * WHY THIS EXISTS. src/ui/board.js's header carries two SCOPED EXCEPTION blocks to the
 * "moved BYTE-IDENTICAL, do not refactor" protection around the v1.0 Safari storm-crash fix. Both
 * say "Wyatt-approved <date>". On 2026-08-31 a third was added that says AWAITING WYATT'S RULING
 * instead, because the checker's verdict was that the block must EXIST or the next reader reverts
 * the change in good faith — but that whether Wyatt must approve it "is HIS call, not mine and not
 * the builder's".
 *
 * CEO Review 38 then named the real hole: "Nothing mechanical stops that file merging to main
 * unruled — only somebody remembering." It grepped scripts/ and .claude/hooks/ for the marker and
 * got ZERO HITS. This is that mechanism.
 *
 * WHAT IT DOES, AND WHY IT IS BRANCH-AWARE RATHER THAN ABSOLUTE.
 * An unruled exception is CORRECT on a working branch — that is where a ruling gets asked for, and
 * a gate that failed there would make every unrelated piece of work red until Wyatt happened to be
 * at his keyboard. So:
 *
 *   on any branch  ->  PASS, but print the file, the line and the text, every single run, so the
 *                      question cannot quietly become part of the furniture
 *   on main        ->  FAIL. Every push to main is served to real players immediately
 *                      (CLAUDE.md §6), which is precisely the moment "somebody remembering" stops
 *                      being good enough.
 *
 * THE LIMIT, STATED SO NOBODY OVERCLAIMS IT: this fires when `npm test` is run on main. It cannot
 * see a merge that is pushed without running the suite. It is a fence, not a wall — but the fence
 * is what did not exist at all, and a fence is what the release process (test -> trial -> staging
 * -> merge) is built to walk into.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failures = 0;
const fail = (w) => { failures++; console.log(`  FAIL  ${w}`); };
const pass = (w) => console.log(`  PASS  ${w}`);

console.log("unruled_exception_check — an exception nobody ruled on must not reach the game\n");

/* THE MARKER IS DERIVED FROM THE PRECEDENT, NOT INVENTED. board.js's two approved blocks say
   "Wyatt-approved"; the unruled one says "AWAITING WYATT'S RULING". Both spellings are searched so
   that a block which is neither — a third phrasing somebody reaches for — is not silently legal. */
const AWAITING = /AWAITING\s+WYATT'?S?\s+RULING/i;
const APPROVED = /Wyatt-approved/i;

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : (/\.(js|mjs|css|html)$/.test(e.name) ? [path.join(d, e.name)] : []));

const unruled = [];
for (const f of walk(path.join(REPO, "src"))) {
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (AWAITING.test(line)) unruled.push({ where: `${path.relative(REPO, f)}:${i + 1}`, line: line.trim() });
  });
}

/* INSTRUMENT REACHED ITS SUBJECT? If board.js has lost its approved precedents too, this gate is
   reading the wrong tree and its silence would mean nothing. Prove the shape exists first. */
{
  const board = path.join(REPO, "src", "ui", "board.js");
  const approvals = fs.existsSync(board) ? (fs.readFileSync(board, "utf8").match(new RegExp(APPROVED.source, "gi")) || []).length : 0;
  if (approvals > 0) pass(`instrument reached its subject — ${approvals} "Wyatt-approved" precedent(s) found in src/ui/board.js`);
  else fail("src/ui/board.js has no \"Wyatt-approved\" block at all — this gate is reading the wrong tree, so its verdict below means nothing");
}

/* ONE DECISION FUNCTION, called by the live path AND by the red-proof below. The branch is an
   ARGUMENT, not a global read, for exactly one reason: a red-proof that tests a second copy of the
   rule proves nothing about the rule that runs, and the only way to exercise the main-branch verdict
   without checking out main is to be able to hand it the branch name. It is not a backdoor — nothing
   passes an override in; the live call reads git. */
const verdict = (found, branch) =>
  !found.length ? { ok: true,  why: "no unruled scoped exception anywhere in src/" }
  : branch === "main" ? { ok: false, why: `${found.length} scoped exception(s) reached MAIN without a ruling — every push to main is served to real players immediately` }
  : { ok: true, why: `no unruled exception on main (this is branch "${branch}")`, warn: found };

let branch = "";
try { branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO, encoding: "utf8" }).trim(); }
catch { branch = "(no git)"; }

const v = verdict(unruled, branch);
if (v.ok) pass(v.why); else fail(v.why);
if (!v.ok) {
  for (const u of unruled) console.log(`          ${u.where}  ${u.line}`);
  console.log("\n        Either Wyatt rules on it (replace the marker with \"Wyatt-approved <date>\"),");
  console.log("        or the change comes back off main. It must not sit here unruled.");
} else if (v.warn) {
  console.log(`\n  ⚠ ${v.warn.length} exception(s) still AWAITING WYATT'S RULING — legal here, a FAIL the moment this is main:`);
  for (const u of v.warn) console.log(`      ${u.where}`);
  console.log(`      ${v.warn[0].line}\n`);
}

/* RED-PROOF. Both directions, and the branch half as well as the text half — a gate that can only
   ever pass is not a gate (CLAUDE.md rule 6). */
{
  const hitsMarker  = AWAITING.test("// SCOPED EXCEPTION — ⚠ AWAITING WYATT'S RULING: both exceptions");
  const hitsNoApost = AWAITING.test("// awaiting wyatts ruling");
  const sparesOk    = !AWAITING.test("// SCOPED EXCEPTION (Wyatt-approved 2026-08-14). The camera may…");
  const textHalf = hitsMarker && hitsNoApost && sparesOk;
  if (textHalf) pass("red-proof: catches the marker with and without its apostrophe, spares an approved block");
  else fail(`red-proof FAILED (marker:${hitsMarker} noApostrophe:${hitsNoApost} sparesApproved:${sparesOk})`);

  /* THE BRANCH HALF — the one that actually matters, and the one a passing run on a feature branch
     can never demonstrate on its own. Run the REAL verdict() four ways. */
  const some = [{ where: "src/ui/board.js:15", line: "// ⚠ AWAITING WYATT'S RULING" }];
  const goesRedOnMain   = verdict(some, "main").ok === false;
  const quietOnBranch   = verdict(some, "claude/whatever").ok === true && !!verdict(some, "claude/whatever").warn;
  const cleanMainPasses = verdict([], "main").ok === true;
  const cleanIsSilent   = !verdict([], "claude/whatever").warn;
  if (goesRedOnMain && quietOnBranch && cleanMainPasses && cleanIsSilent)
    pass("red-proof: the same verdict() that ran above goes RED on main, warns on a branch, and passes clean either way");
  else fail(`red-proof FAILED for the branch half (redOnMain:${goesRedOnMain} warnsOnBranch:${quietOnBranch} cleanMain:${cleanMainPasses} cleanSilent:${cleanIsSilent})`);
}

console.log(`\n${failures ? "FAIL" : "PASS"} — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
