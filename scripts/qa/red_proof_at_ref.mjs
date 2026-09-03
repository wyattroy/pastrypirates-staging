#!/usr/bin/env node
/* red_proof_at_ref.mjs — run TODAY'S gate against YESTERDAY'S code, without touching the tree.
 *
 * Step 1 of the four steps is "show it broken", and every item here needs it. The obvious way —
 * overwrite the files with an old ref, run the gate, put them back — is what `_t103_redproof.mjs`
 * did, and it is wrong on a branch three sessions share.
 *
 * ⛔ WHY THE OLD MECHANISM HAD TO GO (`T-123`, filed by CEO 132, which DECLINED TO RUN IT and
 * established its finding by reading instead):
 *   · it wrote `glass.mjs` and `chartkeeper.mjs` in the SHARED checkout and restored them in a
 *     `finally`. **Two commits landed from other sessions inside its review window.** Any
 *     `git commit -a` from another watch in that gap commits reverted code, under someone else's
 *     subject, and nothing downstream can tell.
 *   · it restored only those TWO files, so a case reading anything else — the runbook, a hook, a
 *     doc — **could not go red under it**, and one was reported as having done so.
 *   · a `finally` is a destroy-then-repair, which this project ruled against on `T-112`: *"a
 *     destroy-then-repair is still a window, and this project has already lost a note inside one."*
 *
 * ✅ WHAT THIS DOES INSTEAD: `git worktree add --detach` materialises the WHOLE tree at the ref in a
 * temp directory. Nothing in the shared checkout is written — the window does not get shorter, it
 * stops existing — and the two-file limit goes with it, because every file is at the ref.
 *
 * ⚑ AND THE PART THAT IS EASY TO GET WRONG, WHICH A WORKTREE ALONE GETS BACKWARDS:
 *   **A RED PROOF IS TODAY'S CHECK AGAINST YESTERDAY'S CODE.** A bare worktree gives you
 *   yesterday's check too, which proves nothing at all — it would faithfully report that the old
 *   gate passed on the old code. So the CURRENT gate file is copied INTO the worktree before it
 *   runs. New check, old subject.
 *
 * ⚠ AND WHY THE COPY READS THE OLD TREE RATHER THAN THE LIVE ONE — **corrected by CEO 160, because
 * the reason written here was wrong and someone would have copied it onto a gate where it is false.**
 * It said *"it imports only node builtins, so the copy carries no dependency on the new tree."*
 * `do_now_check.mjs` has plenty of dependencies on the tree — `KEEPER`, `GLASS`, and a runbook it
 * reads at two places. **What actually saves it is that it resolves them from `import.meta.url`,
 * which TRAVELS WITH THE COPIED FILE**, so inside the worktree they resolve to the worktree.
 *   · A gate that resolves paths that way: isolated, and this tool works on it.
 *   · A gate that `import`s a sibling (`scripts/lib/…`): that sibling comes from the worktree's OLD
 *     copy, not today's. Usually harmless, occasionally the thing under test — say so in your report.
 *   · A gate that hardcodes an absolute path, or climbs to a fixed root: **NOT isolated.** It reads
 *     the live tree and reports confidently about the wrong subject.
 * **Check which kind yours is before believing a red.** Right conclusion, wrong mechanism is still
 * a wrong instrument the next time it is applied.
 *
 * ⚠ ONE HONEST CAVEAT, because "touches nothing shared" would be overclaiming: `git worktree add`
 * writes metadata under `.git/worktrees/` in the shared repo. That is not tracked content and no
 * other session reads it, but it is not nothing, and it is removed again on the way out.
 *
 * USAGE:
 *   node scripts/qa/red_proof_at_ref.mjs --ref=<sha or sha^> [--gate=scripts/qa/<file>.mjs]
 *
 * ⚠ THE REF MATTERS, and CEO 131 caught why on the tool this replaces: defaulting to HEAD is
 * correct exactly ONCE — before the work is committed. Run it after the commit and it checks the
 * change against itself, reports the gate PASSING, and looks like a red proof that failed. So there
 * is no default here: `--ref` is REQUIRED.
 *
 * EXIT: 0 the gate FAILED at that ref — the red proof worked, the check can see its subject.
 *       1 the gate PASSED at that ref — the check cannot fail on code without the fix in it.
 *       2 usage, or the worktree could not be made.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? "").split("=").slice(1).join("=");

const REF = arg("ref");
const GATE = arg("gate") || "scripts/qa/do_now_check.mjs";
if (!REF) {
  console.log("usage: --ref=<sha|sha^> is REQUIRED (there is deliberately no default — see the header)");
  process.exit(2);
}
if (!existsSync(join(ROOT, GATE))) { console.log(`no such gate: ${GATE}`); process.exit(2); }

/* ⛔ THE EXIT CODE IS SET, NOT TAKEN, AND THE FIRST VERSION LEFT A WORKTREE BEHIND BECAUSE OF IT.
 * `process.exit()` inside the `try` terminates the process IMMEDIATELY — **a `finally` does not
 * run after it.** So the cleanup was written, correct, and unreachable, and the first real run left
 * `redproof-yt5iOV` registered in the shared repo: a tool built to stop touching shared state,
 * leaving state behind on its first outing. Set the code, let `finally` run, exit at the end. */
const wt = mkdtempSync(join(tmpdir(), "redproof-"));
let made = false, code = 2;
try {
  execFileSync("git", ["worktree", "add", "--detach", wt, REF],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  made = true;
  console.log(`tree at ${REF} in a scratch worktree; the shared checkout was not written.\n`);

  // Today's gate, yesterday's code.
  copyFileSync(join(ROOT, GATE), join(wt, GATE));

  let out = "", failed = false;
  try {
    out = execFileSync(process.execPath, [join(wt, GATE)], { cwd: wt, encoding: "utf8" });
  } catch (e) {
    failed = true;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  console.log(out.trimEnd());
  console.log("");

  /* ⛔ THERE ARE THREE OUTCOMES, NOT TWO, AND THE FIRST VERSION OF THIS TOOL COLLAPSED THEM INTO
   * TWO — the exact fault it exists to prevent, inside the tool that exists to prevent it.
   * CEO 160 measured it: `--ref=6f5edcee^` predates `chartkeeper.mjs`, so the gate died on
   * MODULE_NOT_FOUND without running a single case, and this printed
   *     "RED PROOF HELD — the check can see its subject."   exit 0
   * **A gate that could not START was certified as a gate that PROVED ITS SUBJECT.** That is rule
   * 24's NOT-RUN column erased — *"a leg that could not start is not a leg that passed"* — and the
   * crash text scrolling past above the verdict is no defence, because THE VERDICT LINE IS WHAT
   * GETS PASTED INTO A LEDGER.
   *
   * ⚑ AND THE MECHANISM IS NOT THE ONE EITHER OF US FIRST NAMED — worth writing down, because the
   * obvious fix does not work. CEO 160 read this as *"the gate crashed and zero cases ran"*, and
   * the first fix here asked whether the gate had printed a verdict at all. **Both are wrong.**
   * Measured: at that ref the gate runs fine and prints twenty-odd honest `FAIL` lines. The
   * `MODULE_NOT_FOUND` is inside a SUBPROCESS IT DRIVES — `chartkeeper.mjs`, which did not exist
   * yet — so its harness could not operate and every case failed for a reason that has nothing to
   * do with the subject.
   *
   * **THAT is the NOT-RUN column, and it is far better hidden than a crash: the gate is fluent,
   * confident, and failing about the wrong thing.** A missing DEPENDENCY and a missing FEATURE are
   * indistinguishable by exit code, by verdict, and by failure count — the only tell is the
   * loader's own error text carried inside the failure lines. So look for that. */
  const cannotRun = /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Cannot find module|node:internal\/modules|ENOENT: no such file/i.test(out);
  const spoke = /^\s*(PASS|FAIL)\b/mi.test(out) || /\b\d+ failure\(s\)/i.test(out);
  if (failed && spoke && !cannotRun) {
    console.log(`RED PROOF HELD — ${GATE} FAILS against ${REF}. The check can see its subject.`);
    code = 0;
  } else if (failed) {
    console.log(`!! COULD NOT RUN — ${GATE} failed at ${REF}, but not about its subject.`);
    console.log(cannotRun
      ? "!! Its output carries a module-resolution or missing-file error, so something it NEEDS was\n"
        + "!! absent at that ref. Every case then fails for a reason that has nothing to do with the fix."
      : "!! It exited non-zero without printing PASS or FAIL, so it CRASHED rather than judged.");
    console.log("!! THIS IS NOT A RED PROOF. A check that could not operate has told you nothing about");
    console.log("!! whether it can see its subject — and it is MORE misleading than a crash, because it");
    console.log("!! is fluent and confident while failing about the wrong thing.");
    console.log("!! Pick a ref where the gate's DEPENDENCIES exist and only its SUBJECT does not.");
    code = 3;
  } else {
    console.log(`!! ${GATE} PASSED against ${REF}.`);
    console.log("!! A check that passes on code WITHOUT the fix in it is not measuring the fix.");
    console.log("!! Read its cases again before believing any green it gives you.");
    code = 1;
  }
} catch (e) {
  console.log(`could not make a worktree at ${REF}: ${String(e.message).slice(0, 200)}`);
  code = 2;
} finally {
  if (made) { try { execFileSync("git", ["worktree", "remove", "--force", wt], { cwd: ROOT, stdio: "ignore" }); } catch { /* best effort */ } }
  try { rmSync(wt, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.exit(code);
