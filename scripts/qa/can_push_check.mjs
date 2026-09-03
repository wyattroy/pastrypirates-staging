#!/usr/bin/env node
/* can_push_check.mjs — the publish check must actually catch the tree that stranded a watch.
 *
 * WHY IT EXISTS. 2026-09-01, the Blade hour: watch 1 oriented, started the release trial detached,
 * wrote its ledger entry and committed it — and the commit landed on NO BRANCH, because the
 * checkout was in detached HEAD after a stuck rebase. Nothing reached the remote, and from every
 * other machine a watch that did everything right looked exactly like one that never woke.
 * `scripts/wyclau/can_push.mjs` is the guard (a watch that cannot push must not work); this drives
 * it as a real subprocess against real git trees, because a guard nobody proved can fail is
 * decoration.
 *
 * Four fixture trees, each built here, each the shape of a real failure:
 *   healthy (branch + upstream)  ·  detached HEAD  ·  branch with no upstream  ·  rebase in progress
 * Plus the both-directions rule: the healthy tree must PASS, or a check that fails everything is
 * as useless as one that passes everything.
 *
 * House convention: no test runner, one PASS/FAIL line per case, every case runs before exit.
 */
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "wyclau", "can_push.mjs");

let failed = false;
const check = (label, cond, detail) => {
  if (cond) console.log(`PASS -- ${label}`);
  else { console.error(`FAIL -- ${label}${detail ? `: ${detail}` : ""}`); failed = true; }
};
const dirs = [];
const mk = (name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `can-push-${name}-`)); dirs.push(d); return d; };
const git = (d, ...a) => execFileSync("git", ["-C", d, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const run = (d) => {
  const r = spawnSync(process.execPath, [SCRIPT, `--dir=${d}`], { encoding: "utf8" });
  return { code: r.status, out: ((r.stdout || "") + (r.stderr || "")).trim() };
};

/* A bare "remote" plus a clone of it is the only honest way to have a real upstream. */
function healthyPair(name) {
  const bare = mk(`${name}-remote`);
  git(bare, "init", "-q", "--bare");
  const work = mk(name);
  git(work, "init", "-q");
  git(work, "config", "user.email", "gate@example.com");
  git(work, "config", "user.name", "can-push gate");
  fs.writeFileSync(path.join(work, "a.txt"), "one\n");
  git(work, "add", "."); git(work, "commit", "-q", "-m", "one");
  git(work, "remote", "add", "origin", bare);
  git(work, "push", "-q", "-u", "origin", "HEAD:refs/heads/main");
  // `git push -u HEAD:refs/heads/main` sets upstream on the local branch name it pushed from
  try { git(work, "branch", "--set-upstream-to=origin/main"); } catch { /* already set */ }
  return work;
}

/* The fixture's own base branch is whatever `git init` named it — `main` on a machine that sets
 * init.defaultBranch, `master` on one that does not. DERIVE it; never type it. (Rule 9 applies to
 * gates too, and this one cost a red release gate: fixture 4 below said `git rebase main`, which on
 * this Blade resolved to nothing at all, so no rebase ever started and the case measured a tree
 * that was merely upstream-less. See the note on that fixture.) */
const baseBranch = (d) => git(d, "branch", "--show-current").trim();

console.log("can_push_check — a watch that cannot publish must be told so, before it works\n");

/* 1. HEALTHY — must pass, or the guard would stop every watch everywhere. */
{
  const d = healthyPair("healthy");
  const r = run(d);
  check("a branch with an upstream passes (exit 0)", r.code === 0, `exit ${r.code}: ${r.out.slice(0, 160)}`);
  check("it names the branch and the upstream it checked", /tracking/.test(r.out) && /main/.test(r.out), r.out.slice(0, 160));

  /* ⚑ THE HEALTHY PATH IS THE ONE THAT COST THREE WATCHES, AND UNTIL 2026-09-03 NOTHING CHECKED
   * WHAT IT SAYS. It printed `can publish: ...` — a flat claim about a capability it had never
   * tested — and three watches in a row on this branch read it, worked a full turn, and could not
   * push a line of it.
   *
   * THE FENCE IS ABOVE THE REPO. The refusal lives in the SESSION's command allowlist, which sees
   * Bash tool calls and nothing else. Measured in one session on 2026-09-03, both directions:
   *     `git push --dry-run origin HEAD`   as a Bash call  -> "This command requires approval"
   *     `git push --dry-run origin <branch>` as a Bash call -> refused, identically
   *     both of the same forms from a NODE CHILD PROCESS   -> exit 0, "Everything up-to-date"
   *
   * SO THE OBVIOUS FIX IS A TRAP, and these cases exist to stop it being built. The Chart row
   * (T-011) proposed that can_push.mjs run `git push --dry-run` itself. It is a node script, so it
   * would push FINE and print a confident green about a capability the watch does not have — the
   * same false green as before, by a longer route, and harder to distrust because it looks like a
   * real push. `can_push.mjs` cannot answer this question by construction: asked from inside a
   * script, it is asked from the wrong side of the fence.
   *
   * WHAT IS LEFT, THEREFORE, IS HONESTY: name the limit, and hand the watch the one command that
   * asks from the right side. That is what these three cases hold in place. */
  check("it does NOT make a bare 'can publish' claim it has not tested",
    !/can publish/i.test(r.out),
    `still claims publish capability: ${r.out.slice(0, 200)}`);
  check("it names the one thing it cannot see — this session's own right to run git push",
    /NOT ANSWERED HERE/.test(r.out) && /allowlist/i.test(r.out),
    r.out.slice(0, 300));
  /* ⚠ THIS CASE USED TO ASSERT `git push --dry-run origin`, AND SO IT HELD THE BUG IN PLACE.
   * `.claude/settings.json:22` is `Bash(git push origin claude/*)` — a PREFIX match — so the
   * dry-run form can never match it and is refused on a perfectly healthy tree. Paired with
   * can_push.mjs's "if it is REFUSED, end the turn", that made the Door a permanent false STOP on
   * this machine. A gate asserting the broken form is the strongest possible way to keep it broken.
   * Both halves are checked now: the right form present, and the wrong one gone. */
  check("it hands the watch the command that asks from the right side of the fence",
    /git push origin \S/.test(r.out),
    r.out.slice(0, 300));
  check("it does NOT prescribe the --dry-run form, which the allowlist's prefix can never match",
    !/RUN THIS[\s\S]{0,400}?git push --dry-run origin/.test(r.out),
    `prescribes a form that is refused on a healthy tree: ${r.out.slice(0, 300)}`);
}

/* 2. DETACHED HEAD — the exact tree that stranded watch 1. */
{
  const d = healthyPair("detached");
  fs.writeFileSync(path.join(d, "b.txt"), "two\n");
  git(d, "add", "."); git(d, "commit", "-q", "-m", "two");
  git(d, "checkout", "-q", "--detach", "HEAD");
  const r = run(d);
  check("detached HEAD is REFUSED (exit 1)", r.code === 1, `exit ${r.code}`);
  check("it says the words that identify the fault, not a code", /DETACHED HEAD/.test(r.out), r.out.slice(0, 160));
  check("it gives the rescue-branch-FIRST repair, in order", /git branch/.test(r.out) && /unlosable/.test(r.out), r.out.slice(0, 200));
}

/* 3. A BRANCH WITH NO UPSTREAM — pushes need a target an unattended watch cannot invent. */
{
  const d = mk("no-upstream");
  git(d, "init", "-q");
  git(d, "config", "user.email", "gate@example.com");
  git(d, "config", "user.name", "can-push gate");
  fs.writeFileSync(path.join(d, "a.txt"), "one\n");
  git(d, "add", "."); git(d, "commit", "-q", "-m", "one");
  const r = run(d);
  check("a branch with no upstream is REFUSED (exit 1)", r.code === 1, `exit ${r.code}`);
  check("it names the missing upstream rather than blaming the branch", /NO UPSTREAM/.test(r.out), r.out.slice(0, 160));
}

/* 4. REBASE IN PROGRESS — the CAUSE behind the detached state, and a different repair, so it must
 *    be reported differently. Built by forcing a real conflict mid-rebase.
 *
 *    ⚠ THE FIXTURE MUST PROVE IT BUILT ITSELF, and this case is why. Until 2026-09-01 it rebased
 *    onto the literal name `main` and swallowed the error. On a machine whose init.defaultBranch is
 *    `master` — this Blade, and git's own default — no ref named `main` exists, so the rebase died
 *    with `fatal: invalid upstream 'main'`, NO rebase was ever in progress, and the case measured an
 *    ordinary upstream-less branch instead. `can_push.mjs` answered that tree correctly and was
 *    marked FAIL for it, turning the whole release gate red on one machine and green on another.
 *    An instrument that reports a failure has told you something about ITSELF first. */
{
  const d = healthyPair("rebasing");
  const base = baseBranch(d);
  fs.writeFileSync(path.join(d, "a.txt"), "main-side\n");
  git(d, "add", "."); git(d, "commit", "-q", "-m", "main side");
  git(d, "checkout", "-q", "-b", "side", "HEAD~1");
  fs.writeFileSync(path.join(d, "a.txt"), "side-side\n");
  git(d, "add", "."); git(d, "commit", "-q", "-m", "side side");
  try { git(d, "rebase", base); } catch { /* the conflict is the point */ }
  const gitDir = git(d, "rev-parse", "--git-dir").trim();
  const midRebase = ["rebase-merge", "rebase-apply"].some((n) => fs.existsSync(path.resolve(d, gitDir, n)));
  check("the fixture really is mid-rebase before the guard is asked (else this case measures nothing)",
    midRebase, `no rebase-merge/rebase-apply in ${gitDir} after rebasing onto "${base}"`);
  const r = run(d);
  check("a rebase in progress is REFUSED (exit 1)", r.code === 1, `exit ${r.code}`);
  check("it is reported as a REBASE, not merely as detachment — different cause, different repair",
    /REBASE IS IN PROGRESS/.test(r.out), r.out.slice(0, 160));
  check("it leaves the decision to a human (continue or abort), never guessing",
    /--continue/.test(r.out) && /--abort/.test(r.out), r.out.slice(0, 200));
}

/* 5. NOT A REPO — a different problem, and it must not masquerade as "cannot push". */
{
  const d = mk("not-a-repo");
  const r = run(d);
  check("a non-repo exits 2, distinct from a push failure's 1", r.code === 2, `exit ${r.code}: ${r.out.slice(0, 120)}`);
}

for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }

console.log("");
if (failed) { console.error("FAIL can_push_check — the publish guard does not catch the trees that strand work."); process.exit(1); }
console.log("PASS can_push_check — healthy passes; detached, upstream-less and mid-rebase trees are all refused, each in its own words.");
process.exit(0);
