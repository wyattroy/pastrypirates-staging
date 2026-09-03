#!/usr/bin/env node
/* detached_trial_windowless_check.mjs — the detached sea trial must not open a window on Wyatt's
 * screen, and nothing it starts may either.
 *
 * WHY THIS EXISTS. Wyatt, mid-Blade-hour, 2026-09-01: "this strange window popped up
 * automatically, do you know what it's doing?" — a black `C:\Program Files\nodejs\node.exe`
 * console. That window IS a sea trial. One accidental click on its ✕ kills an 85-minute run
 * silently, and this project has already lost three trials in one day to runs dying under
 * sessions that ended. INBOX-20260901T1440Z.
 *
 * WHAT ACTUALLY CAUSES IT — measured 2026-09-02, and it is NOT what the Inbox entry guessed.
 * The entry said Node "ignores windowsHide for detached:true", so the trial gets its own visible
 * console. Measured with AttachConsole against a real spawn: a `detached: true` child has NO
 * CONSOLE AT ALL (attach fails). The wrapper is innocent. The window belongs one level DOWN:
 *
 *     a process with no console, spawning a console child, makes Windows give that child a
 *     BRAND-NEW console — and a brand-new console is a visible black window.
 *
 * So every child `scripts/sea_trial.mjs` starts is a window, because the trial itself is
 * console-less by design. `windowsHide: true` on those spawns hands the child a console with NO
 * WINDOW (CREATE_NO_WINDOW), and — the part that makes this one rule rather than a patch —
 * everything the child then spawns INHERITS that windowless console. One flag at the boundary
 * covers the whole subtree.
 *
 * WHAT THIS CHECKS, in two halves:
 *   A. COVERAGE (every platform, derived from the file) — every child-process call in
 *      sea_trial.mjs carries the shared option. Derived by scanning the source, so a spawn site
 *      added tomorrow fails this gate rather than quietly opening a window next release.
 *   B. BEHAVIOUR (win32 only) — spawn a console-less parent for real, and prove three things:
 *      a plain child gets a VISIBLE window (if it does not, this instrument is blind and says so
 *      instead of passing); a child spawned with the shared option gets none; and THAT child's own
 *      child, spawned with no options at all, gets none either. The third is not decoration —
 *      five spawn sites in a real voyage (playtest_gate.mjs, lib/cdp.mjs, lib/wk.mjs) carry no
 *      flag and rest entirely on that inheritance, and this check used to ASSERT it in its PASS
 *      line while testing two leaf children and no grandchild (CEO 110).
 *
 * ⚠ HALF B BRIEFLY FLASHES A CONSOLE WINDOW — about half a second, on purpose. That flash is the
 * red proof. A check that cannot fail is the fault this repo has paid for most (`pgrep` printing
 * "no headless chrome" beside 183 of them, 2026-09-02), so the control is not optional.
 *
 * EXIT: 0 pass · 1 fail.
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "..", "..");
const TRIAL = path.join(REPO, "scripts", "sea_trial.mjs");
const SHARED = path.join(REPO, "scripts", "lib", "child_window.mjs");

let failed = false;
const fail = (m) => { failed = true; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  PASS  ${m}`);

console.log("detached_trial_windowless_check — the sea trial must not put a window on his screen");

/* ---- A. coverage, derived from the trial's own source ---------------------- */

const src = fs.existsSync(TRIAL) ? fs.readFileSync(TRIAL, "utf8") : null;
if (src === null) fail(`no sea_trial.mjs at ${TRIAL} — this gate has lost its subject`);

// The shared option must actually hide, or every spread of it is a lie that reads as a fix.
const sharedSrc = fs.existsSync(SHARED) ? fs.readFileSync(SHARED, "utf8") : null;
if (sharedSrc === null) fail(`no shared option module at ${SHARED}`);
else if (!/windowsHide\s*:\s*true/.test(sharedSrc)) fail(`${path.relative(REPO, SHARED)} does not set windowsHide: true`);
else pass("the shared child-window option really sets windowsHide: true");

/* Take the argument list of each child-process call by balanced parens — never a regex, because
   these calls contain nested arrays, objects and template strings. */
const CALLS = /\b(execSync|execFileSync|spawnSync|exec|execFile|spawn)\s*\(/g;
if (src !== null) {
  let m, sites = 0, bare = [];
  while ((m = CALLS.exec(src)) !== null) {
    let depth = 1, i = CALLS.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    const argsText = src.slice(CALLS.lastIndex, i - 1);
    sites++;
    const line = src.slice(0, m.index).split("\n").length;
    // `windowsHide: false` OPENS a window and contains the word, so matching the word alone would
    // score the one file this gate exists to catch as covered. CEO 110 found that; require the
    // shared constant or an explicit true.
    if (!/NO_CONSOLE_WINDOW|windowsHide\s*:\s*true/.test(argsText)) bare.push(`${m[1]}() at sea_trial.mjs:${line}`);
  }
  if (!sites) fail("found NO child-process calls in sea_trial.mjs — the scanner has lost its subject, which reads as a pass and is not one");
  else if (bare.length) fail(`${bare.length} of ${sites} child-process calls in sea_trial.mjs open a window: ${bare.join(", ")}`);
  else pass(`all ${sites} child-process calls in sea_trial.mjs carry the windowless option`);
}

/* ---- B. behaviour, on the machine that actually runs the relay -------------- */

if (process.platform !== "win32") {
  console.log("  SKIP  the behaviour half is Windows-only (a console window is a Windows object);");
  console.log("        the coverage half above ran and is what protects a Mac-authored change.");
} else {
  const dir = path.join(REPO, ".planning", "wyclau", "detached", "_windowcheck");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const pidFile = path.join(dir, "pids.txt");

  // A stand-in for sea_trial.mjs: started detached, so it has no console of its own. It spawns
  // one child each way — the control that MUST show a window, and the fix that must not — and the
  // hidden one spawns a child OF ITS OWN with no options at all.
  // THAT GRANDCHILD IS NOT DECORATION. The whole reason one flag at this boundary is enough is
  // that everything below inherits the windowless console — and five spawn sites in a real voyage
  // (playtest_gate.mjs, lib/cdp.mjs, lib/wk.mjs) carry no flag and depend on exactly that. CEO 110
  // found this check ASSERTING that inheritance in its PASS line while testing two leaf children
  // and no grandchild. A sentence tidier than the record, in the gate written to stop them.
  fs.writeFileSync(path.join(dir, "grandchild.mjs"), `
import { spawn } from "node:child_process";
import fs from "node:fs";
const g = spawn("node", ["-e", "setTimeout(()=>{},9000)"], {});
fs.appendFileSync(${JSON.stringify(pidFile)}, "grand=" + g.pid + "\\n");
setTimeout(() => {}, 9000);
`);
  fs.writeFileSync(path.join(dir, "parent.mjs"), `
import { spawn } from "node:child_process";
import fs from "node:fs";
const bare = spawn("node", ["-e", "setTimeout(()=>{},9000)"], {});
const hidden = spawn("node", [${JSON.stringify(path.join(dir, "grandchild.mjs"))}], { windowsHide: true });
fs.writeFileSync(${JSON.stringify(pidFile)}, "bare=" + bare.pid + "\\nhidden=" + hidden.pid + "\\n");
setTimeout(() => {}, 9000);
`);

  const fd = fs.openSync(path.join(dir, "parent.out"), "a");
  const parent = spawn(process.execPath, [path.join(dir, "parent.mjs")], {
    detached: true, windowsHide: true, stdio: ["ignore", fd, fd],
  });
  parent.unref();

  // Ask Windows directly: does this pid own a console, and does that console have a visible
  // window? AttachConsole is the only honest form of the question — counting conhost.exe children
  // was tried first and could not tell any of four cases apart.
  const probe = (pid, tag) => {
    const ps = `
$sig = @'
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint p);
[DllImport("kernel32.dll", SetLastError=true)] public static extern bool FreeConsole();
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
'@
$k = Add-Type -MemberDefinition $sig -Name K${tag} -Namespace PPWinChk -PassThru
[void]$k::FreeConsole()
$att = $k::AttachConsole(${pid})
$h = 0; $vis = $false
if ($att) { $h = $k::GetConsoleWindow(); if ($h -ne 0) { $vis = $k::IsWindowVisible($h) } }
[void]$k::FreeConsole()
if ($vis) { "VISIBLE" } else { "none" }
`;
    try {
      return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", timeout: 25000 }).trim();
    } catch (e) { return `PROBE-ERROR ${e.message.split("\n")[0]}`; }
  };

  const started = Date.now();
  let pids = {};
  while (Date.now() - started < 12000) {
    try {
      const raw = fs.readFileSync(pidFile, "utf8");
      pids = Object.fromEntries(raw.trim().split("\n").filter(Boolean).map((l) => l.split("=")));
      if (pids.bare && pids.hidden && pids.grand) break;
    } catch { /* not written yet */ }
    execFileSync(process.execPath, ["-e", "setTimeout(()=>{},250)"], { windowsHide: true });
  }

  if (!pids.bare || !pids.hidden || !pids.grand) {
    fail("the console-less parent never reported all three of its processes — the behaviour half did not run, so treat the coverage half above as the only evidence");
  } else {
    const bareV = probe(pids.bare, "B");
    const hiddenV = probe(pids.hidden, "H");
    const grandV = probe(pids.grand, "G");
    // RED PROOF FIRST. If a plainly-spawned child does NOT show a window on this machine, the
    // instrument cannot see windows and its verdict on the fixed case means nothing.
    if (bareV !== "VISIBLE") fail(`the control is blind: a child spawned WITHOUT the option reported "${bareV}", not VISIBLE — this check cannot fail, so do not read its green as evidence`);
    else pass("red proof: a child spawned without the option does open a visible console window");
    if (hiddenV === "VISIBLE") fail("a child spawned WITH windowsHide still opened a visible console window — the fix does not hold on this machine");
    else if (hiddenV.startsWith("PROBE-ERROR")) fail(`could not ask Windows about the hidden child: ${hiddenV}`);
    else pass("a child spawned with the option opens no window");
    if (grandV === "VISIBLE") fail("the GRANDCHILD opened a window — inheritance does NOT hold, so the flag at the boundary is not enough and every spawn site below it needs its own");
    else if (grandV.startsWith("PROBE-ERROR")) fail(`could not ask Windows about the grandchild: ${grandV}`);
    else pass("its own child, spawned with no options at all, inherits that — which is what makes one flag at the boundary enough");
  }

  for (const p of [pids.grand, pids.bare, pids.hidden, parent.pid]) { try { process.kill(Number(p)); } catch { /* already gone */ } }
  fs.closeSync(fd);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? "\nFAILED." : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
