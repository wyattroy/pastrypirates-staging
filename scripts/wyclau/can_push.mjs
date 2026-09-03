#!/usr/bin/env node
// VENDORED FROM claude-kit (plugins/wyclau) — edit THERE, not here. Re-vendor: `bash install.sh vendor <repo> wyclau` from claude-kit. Drift is caught by scripts/qa/vendor_check.mjs.
/* can_push.mjs — CAN THIS TREE PUBLISH ITS WORK? Asked BEFORE a watch does any.
 *
 * WHAT THIS IS FOR, and it cost half a Blade hour to learn. On 2026-09-01 watch 1 on the Razer
 * did everything right: it oriented, started the release trial detached, wrote its ledger entry
 * and COMMITTED it (`ee60c30f`). Nothing reached the branch, and from every other machine the
 * watch was indistinguishable from one that never woke. The cause was not the watch: the
 * checkout was in DETACHED HEAD — left there by a stuck rebase — so `git pull --rebase` failed
 * and the commit landed on no branch, unpushable.
 *
 * THE RULE THIS ENFORCES: **a watch that cannot push must not work.** Work it cannot publish is
 * work nobody can see, review, or build on — and worse, it edits a shared tree (a sailing sea
 * trial reads those same files) while leaving no record that it did. Ending immediately, loudly,
 * is strictly better than doing good work into a void.
 *
 * IT ONLY EVER READS. No fetch, no network, no writes — it must be safe to run at the top of
 * every watch, on every machine, including one mid-trial.
 *
 * EXIT CODES ARE THE INTERFACE:
 *   0 = this tree can publish: on a branch, with an upstream, no rebase or merge in progress
 *   1 = it cannot, and stdout says WHICH of those in plain English, with the repair
 *   2 = not a git repo / git unavailable (a different problem, said differently)
 *
 * --dir=<path> points it at another tree so a gate can drive it against fixtures (red-proof).
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const dirArg = process.argv.slice(2).find((a) => a.startsWith("--dir="));
const repo = dirArg ? path.resolve(dirArg.slice(6)) : process.cwd();

const git = (...args) => {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch { return null; }
};

const top = git("rev-parse", "--show-toplevel");
if (top === null) {
  console.log(`NOT A GIT REPO (or git is unavailable) at ${repo} — this is not the same as "cannot push", so it exits 2.`);
  process.exit(2);
}

/* A rebase or merge left half-finished is the ORIGIN of the detached state we actually hit, so it
 * is named first and separately: "you are not on a branch" is the symptom, "a rebase is in
 * progress" is the cause, and the repairs are different. */
const gitDir = git("rev-parse", "--git-dir");
const inDir = (name) => {
  try { return fs.existsSync(path.resolve(repo, gitDir, name)); } catch { return false; }
};
if (inDir("rebase-merge") || inDir("rebase-apply")) {
  console.log("A REBASE IS IN PROGRESS — that is why HEAD is detached, and nothing committed now can");
  console.log("reach a branch. A human decides this one: finish it (git rebase --continue) or abandon");
  console.log("it (git rebase --abort). DO NOT work in this tree until it is resolved.");
  process.exit(1);
}
if (inDir("MERGE_HEAD")) {
  console.log("A MERGE IS IN PROGRESS — resolve or abort it before any work; a watch must not commit");
  console.log("into a half-finished merge.");
  process.exit(1);
}

const branch = git("symbolic-ref", "--quiet", "--short", "HEAD");
if (!branch) {
  const head = git("rev-parse", "--short", "HEAD") || "unknown";
  console.log(`DETACHED HEAD (at ${head}) — this tree is on NO BRANCH, so every commit made here is`);
  console.log("unpushable and invisible to every other machine. Exactly this stranded a watch's work on");
  console.log("2026-09-01 (commit ee60c30f, never seen off that laptop).");
  console.log("REPAIR, in this order: `git branch <rescue-name>` FIRST — it moves no files, disturbs no");
  console.log("running job, and makes whatever is here unlosable — then check out the real branch and");
  console.log("bring the rescue across.");
  process.exit(1);
}

const upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
if (!upstream) {
  console.log(`ON BRANCH "${branch}" BUT IT HAS NO UPSTREAM — a push would need a target named by hand,`);
  console.log("and an unattended watch has nobody to name it. Set one: `git push -u origin " + branch + "`.");
  process.exit(1);
}

/* ⚑ REWRITTEN 2026-09-03. THIS LINE USED TO READ `can publish: on "<branch>", tracking ...` AND
 * THAT SENTENCE COST THREE WATCHES IN A ROW ON ONE BRANCH.
 *
 * It is a claim about a CAPABILITY, made by a script that had only ever checked repo STATE. All
 * four things it looks at were genuinely healthy each time, so it returned 0 honestly — and each
 * watch read "can publish", worked a full turn, and could not push a line of it.
 *
 * THE FENCE IS ONE LEVEL ABOVE THE REPO, AND NO SCRIPT HERE CAN REACH IT. The refusal comes from
 * the SESSION's own command allowlist, which sees Bash tool calls and nothing else. Measured on
 * 2026-09-03 in a single session, both directions:
 *
 *     git push --dry-run origin HEAD        as a Bash call   ->  "This command requires approval"
 *     git push --dry-run origin <branch>    as a Bash call   ->  refused, identically
 *     both of those forms from a NODE CHILD PROCESS          ->  exit 0, "Everything up-to-date"
 *
 * SO THE FIX THE CHART ASKED FOR WOULD HAVE MADE THIS WORSE, and that is why it was not built.
 * T-011 proposed that this script run `git push --dry-run` itself. This IS a node script: it would
 * push fine and print a confident green about a capability the watch does not have. The same false
 * green as before, by a longer route, and harder to distrust because it looks like a real push.
 * Asked from inside a script, the question is asked from the wrong side of the fence.
 *
 * ⚠ AND THE PARAGRAPH ABOVE DREW THE WRONG LINE, WHICH TURNED THIS SCRIPT INTO A PERMANENT FALSE
 * STOP. It concluded the fence is "Bash tool call versus node child process". **It is not. It is
 * the FLAG POSITION**, and the two measurements above cannot tell those apart because BOTH of them
 * are `--dry-run` forms.
 *
 * `.claude/settings.json:22` reads `Bash(git push origin claude/*)`, and that is a PREFIX match.
 * `git push --dry-run origin …` does not begin with `git push origin`, so it can never match it —
 * no matter what the session is permitted to do. Re-measured 2026-09-03, same branch, minutes apart:
 *
 *     git push --dry-run origin <branch>    as a Bash call   ->  "This command requires approval"
 *     git push origin <branch>              as a Bash call   ->  exit 0, "Everything up-to-date"
 *
 * **So this script used to print the ONE form the allowlist can never match, and then tell the watch
 * that a refusal means end your turn.** On this machine that fires 100% of the time, on a completely
 * healthy tree, at the Door — the same false-instrument disease this file was written to cure,
 * inverted: not a green that hides a fault, a STOP that invents one. Found by watch `pastrypirates-a3`
 * about ten minutes before it would have ended its own turn on it, and confirmed here independently
 * (`settings.json:22` read directly, plus two real pushes from this session that were never prompted).
 *
 * **THE PRESCRIBED COMMAND IS NOW THE ONE THE WATCH WILL ACTUALLY TYPE.** `git push origin <branch>`
 * is a genuine no-op on a synced tree ("Everything up-to-date") and it exercises the exact string
 * the allowlist matches. *A dry run of a command nobody will ever type is not a test of that command.*
 * (The row's other proposed fix — "push with the explicit branch name" — was dismissed on the same
 * bad measurement, and it turns out to have been right.)
 *
 * WHAT IS LEFT IS HONESTY. Say what was actually verified, name what cannot be seen from here, and
 * hand the watch the one command that asks from the right side. It stays exit 0 — a healthy repo
 * must not be stopped by a question this script is not the right instrument for. Held in place by
 * scripts/qa/can_push_check.mjs, three cases, red first. */
console.log(`repo state is healthy: on "${branch}", tracking ${upstream}, no rebase or merge in progress.`);
console.log("");
console.log("NOT ANSWERED HERE — whether THIS SESSION is allowed to run `git push` at all. That fence");
console.log("sits above the repo, in the session's own command allowlist, and it is invisible to every");
console.log("script this repo can run: a push from inside here goes through as a node child process");
console.log("and would report a capability the watch itself may not have.");
console.log("");
console.log("RUN THIS YOURSELF, AS A SHELL COMMAND, BEFORE YOU WORK. On a synced tree it is a real");
console.log("no-op (\"Everything up-to-date\"), and it exercises the EXACT form you will push with:");
console.log("");
console.log(`    git push origin ${branch}`);
console.log("");
console.log("Use that form, not `--dry-run`. The allowlist matches on a PREFIX, so `git push --dry-run");
console.log("origin …` never matches and is refused on a perfectly healthy tree — a dry run of a command");
console.log("you will never type is not a test of that command.");
console.log("");
console.log("If THAT is refused, stop there: end the turn and say so in the ledger. Three watches have");
console.log("each spent a full turn discovering this at the end instead of at the start.");
process.exit(0);
