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

console.log(`can publish: on "${branch}", tracking ${upstream}, no rebase or merge in progress`);
process.exit(0);
