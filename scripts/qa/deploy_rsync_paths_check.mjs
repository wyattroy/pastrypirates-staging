#!/usr/bin/env node
// Does the rsync THIS MACHINE will actually run accept the paths deploy-staging.sh will actually
// hand it?
//
// WHY THIS GATE EXISTS. On 2026-09-02 `deploy-staging.sh` could not run on the Blade at all. It
// died at its rsync line with "The source and destination cannot both be remote." Every account of
// why staging was stuck -- four CEO verdicts running -- had named the permission layer instead.
// The permission layer was real, and removing it revealed this underneath.
//
// TWO LAYERS, BOTH MEASURED:
//   1. Git Bash rewrites any argument beginning with `/` into a Windows path BEFORE the exe sees
//      it, so `/c/Users/...` arrives as `C:\Users\...`. rsync reads `C:` as a HOSTNAME. With both
//      arguments converted it calls both remote; with one, it says out loud:
//      "ssh: Could not resolve hostname c:". `MSYS_NO_PATHCONV=1` is what stops the rewrite.
//   2. The rsync on PATH here is a CYGWIN build (chocolatey, 3.4.1). It wants `/cygdrive/c/...`
//      and does not resolve Git Bash's `/c/...`. Its own error message proves it -- it resolves a
//      relative path against `/cygdrive/c/`.
//
// SO THE GATE RUNS THE REAL BINARY, not a description of it. A check that greps deploy-staging.sh
// for the string "cygdrive" would pass on a machine where rsync is a completely different build --
// that is the "gate aimed at the wrong tree" fault this repo has paid for more than once. The only
// honest question is: does rsync, here, now, accept these two paths?
//
// SECOND SIGHTING OF THIS SHAPE. `openWebKit()` handed a raw Windows path to `import()`, which read
// `c:` as a protocol and reported "playwright not found" while playwright was installed
// (2026-09-01). A Windows path read as a protocol, twice. If you find a third, sweep them together.

import { execFileSync } from "node:child_process";

// Node on Windows sends execSync through cmd.exe, which knows nothing about bash -- the first
// version of this check reported five failures that were entirely its own ("The system cannot find
// the path specified"). A check that condemns working code is the fault this repo names most often.
// execFileSync("bash", ...) is measured to work here; sh() is the only way this file shells out.
const sh = (script, ...args) =>
  execFileSync("bash", ["-c", script, "_", ...args], { encoding: "utf8", cwd: process.cwd() });
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };

console.log("deploy_rsync_paths_check — can the local rsync take the deploy's own paths?");

// Not every machine deploys through a Windows shell. On a Mac or in the cloud container there is
// no path rewriting and no Cygwin rsync, so there is nothing here to check -- SKIP LOUDLY rather
// than pass silently, because a gate that quietly returns 0 everywhere is not a gate.
let isWindowsShell = false;
try { isWindowsShell = /MINGW|MSYS|CYGWIN/i.test(sh("uname -s")); } catch { }

// ---------------------------------------------------------------------------------------------
// WYATT'S OWN QUESTION, 2026-09-02, ASKED BEFORE THE FIX WAS WRITTEN: "will your fix only affect
// deploying from the windows computer, and still allow the mac and/or cloud containers to deploy
// correctly?"
//
// THIS CASE IS THE ANSWER, AND IT RUNS ON EVERY MACHINE INCLUDING THIS ONE. It forces the
// non-Windows branch (PP_WIN_SHELL=0) and asserts rsync_path returns its argument BYTE-IDENTICAL.
// So the cross-platform claim is measured here rather than promised by a comment -- which matters,
// because nobody can run a Mac from the Blade to check, and "a comment is never evidence of
// runtime behaviour" is a rule this project earned the hard way.
// ---------------------------------------------------------------------------------------------
{
  const ROOT0 = process.cwd();
  const helper0 = join(ROOT0, "scripts", "deploy-staging.sh");
  const samples = [
    "/Users/wyattroy/Documents/Projects/pastrypirates",   // the Mac
    "/home/user/repo",                                     // a cloud container
    "/tmp/tmp.abc123",                                     // mktemp -d, anywhere
    "/c/Users/wyatt/Projects/pastrypirates",               // the Windows form, UNCHANGED off Windows
  ];
  let identical = 0;
  for (const s of samples) {
    let got = null;
    try {
      got = sh(`export PP_DEPLOY_DRYRUN=1; source "${helper0}" >/dev/null 2>&1; PP_WIN_SHELL=0 rsync_path "$1"`, s);
    } catch { got = null; }
    if (got === s) identical++;
    else fail(`non-Windows branch altered a path: ${s} -> ${JSON.stringify(got)} (it must be identity)`);
  }
  if (identical === samples.length) {
    pass(`non-Windows branch is the identity function on all ${samples.length} sample paths — the Mac and the cloud container are untouched by this fix.`);
  }
}

if (!isWindowsShell) {
  console.log("  SKIP  not a Windows shell — no path rewriting and no Cygwin rsync to trip over.");
  console.log(failures ? `\n${failures} failure(s).` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

let rsyncFound = true;
try { execFileSync("rsync", ["--version"], { stdio: "ignore" }); } catch { rsyncFound = false; }
if (!rsyncFound) {
  console.log("  SKIP  no rsync on PATH — deploy-staging.sh cannot run here at all, which is a");
  console.log("        different problem and one the script reports for itself.");
  process.exit(0);
}

// Reproduce EXACTLY what the script does to build its paths, by calling the script's own helper
// rather than re-implementing it. Re-implementing would test a description of the code.
const ROOT = process.cwd();
const helper = join(ROOT, "scripts", "deploy-staging.sh");
if (!existsSync(helper)) { fail("scripts/deploy-staging.sh is missing"); process.exit(1); }

let SRC;
try {
  // `rsync_path` is the function deploy-staging.sh defines for this. Sourcing the script with
  // PP_DEPLOY_DRYRUN set stops at the definitions and runs nothing.
  SRC = sh(`export PP_DEPLOY_DRYRUN=1; source "${helper}" >/dev/null 2>&1; rsync_path "$(pwd)"`).trim();
} catch {
  fail("could not call deploy-staging.sh's own rsync_path helper — has it been renamed or removed?");
  console.log(`\n${failures} failure(s).`);
  process.exit(1);
}

if (!SRC) { fail("rsync_path returned nothing"); console.log(`\n${failures} failure(s).`); process.exit(1); }
pass(`rsync_path resolves the repo to: ${SRC}`);

// THE REAL QUESTION. Two derived paths, the actual binary, a throwaway destination.
const scratch = mkdtempSync(join(tmpdir(), "pp-rsync-"));
writeFileSync(join(scratch, "probe.txt"), "probe\n");
let DST;
try {
  DST = sh(`export PP_DEPLOY_DRYRUN=1; source "${helper}" >/dev/null 2>&1; rsync_path "$1"`,
           scratch.replace(/\\/g, "/")).trim();
} catch { DST = ""; }

if (!DST) { fail("rsync_path could not resolve a temp directory"); }
else {
  pass(`rsync_path resolves a temp dir to: ${DST}`);
  try {
    // MSYS_NO_PATHCONV=1 is half the fix and must be exercised here too, or the check passes on a
    // machine where the deploy would still die.
    const out = sh(`MSYS_NO_PATHCONV=1 rsync -a --dry-run "${SRC}/package.json" "${DST}/" 2>&1`);
    if (/cannot both be remote|Could not resolve hostname/i.test(out)) {
      fail(`rsync still reads a path as a remote host:\n        ${out.trim().split("\n")[0]}`);
    } else {
      pass("rsync accepts both derived paths as LOCAL — the deploy's rsync line can run here.");
    }
  } catch (e) {
    const msg = String(e.stdout || e.stderr || e.message).trim().split("\n")[0];
    fail(`rsync rejected the derived paths: ${msg}`);
  }
}
rmSync(scratch, { recursive: true, force: true });

console.log(failures ? `\n${failures} failure(s).` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
