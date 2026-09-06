#!/usr/bin/env node
/* bell_check.mjs — the Bell must stay a process check, and the dead judgement must stay dead.
 *
 * The watchdog's judgement stack (heartbeat freshness, LAST-ACTIVITY recency, the commit clock,
 * the LONG-RUN launch judgement) guessed wrong in both directions — four engines launched onto
 * working sessions in one day, and hours of hold-off on a dead tree — and the Watch redesign
 * (Wyatt's rulings, 2026-09-01) DELETED it rather than tuning it. The Bell's only question is
 * one the OS answers truthfully: is a door-launched claude.exe alive right now?
 *
 * No check on a Mac or in CI can execute PowerShell (the lesson that moved should_launch to node
 * in the first place), so this gate is STRUCTURAL: it reads bell.ps1 and asserts the shape that
 * matters — the process query is present, the deleted signals are ABSENT (a resurrection would
 * re-import the failure), the hard-won Windows lessons survive (pre-quoting, ASCII-only, the
 * grace window, honest failure logging). The BEHAVIOURAL proof is the Blade-hour stall test,
 * exactly as the charter's instrument-quarantine principle requires — this gate keeps the file
 * honest between Blade hours, it does not replace them.
 *
 * Every assertion is red-proofed in place against a doctored copy: an assertion that cannot
 * fail on a bad file proves nothing.
 */
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BELL = path.join(ROOT, "scripts", "wyclau", "bell.ps1");

let failed = false;
const check = (label, cond, detail) => {
  if (cond) console.log(`PASS -- ${label}`);
  else { console.error(`FAIL -- ${label}${detail ? `: ${detail}` : ""}`); failed = true; }
};

if (!fs.existsSync(BELL)) {
  console.error(`FAIL -- scripts/wyclau/bell.ps1 does not exist`);
  process.exit(1);
}
const raw = fs.readFileSync(BELL, "utf8");
/* Assertions run on CODE, not prose: bell.ps1's comments are the graveyard (rule 10 — they name
 * the deleted signals precisely so nobody rebuilds them), and a grep that fails the file for
 * DOCUMENTING a dead signal would force the comments to be deleted — the opposite of the point.
 * The ASCII assertion still reads the raw file: cp1252 bites comments too. */
const src = raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

/* The assertions, written once so the red-proof below can run the SAME list on a bad fixture. */
const assertions = [
  ["asks the OS for the process table (Win32_Process, claude.exe)",
    (s) => /Get-CimInstance Win32_Process/.test(s) && /Name='claude\.exe'/.test(s)],
  ["matches any door-launched engine by command line",
    (s) => s.includes("'*-p*/door*'")],
  ["an unreadable process table holds off, never rings",
    (s) => /assuming a watch IS on deck/.test(s)],
  ["a watch on deck exits without ringing",
    (s) => /\$watchProcs\.Count -gt 0/.test(s)],
  ["the launch grace window survives (Start-Process visibility gap)",
    (s) => /LaunchGraceMinutes/.test(s) && /LAST-LAUNCH/.test(s)],
  ["the prompt is pre-quoted for Start-Process",
    (s) => s.includes('"`"$doorPrompt`""')],
  ["a failed ring is logged as a failure, never as a ring",
    (s) => /ring FAILED/.test(s)],
  ["the watch prompt demands ONE item and an ended turn",
    (s) => /ONE item/.test(s) && /END YOUR TURN/.test(s)],
  ["DryRun exists so a gate can exercise the real file",
    (s) => /\[switch\]\$DryRun/.test(s)],
  /* ⚑ HIS RULING, 2026-09-02T12:39:56.363Z — "May an unattended watch READ the claude-kit folder?"
   * "yes". The fence was this launch line carrying no --add-dir, and nobody ever chose it: it fell
   * out of the argument list. Five patches sat in PENDING-KIT-PATCHES.md behind it, and a watch
   * closing the ruling that depended on it still wrote "cannot be built here" half an hour after he
   * said yes, because the ruling had not been harvested anywhere a session looks (CEO 106).
   * GATED because today's other lesson is the same shape one floor up: a capability nothing
   * invokes is a capability that never runs, and `chartkeeper --rank` proved it by sitting green
   * and uncalled while he asked four times. An argument nothing checks un-wires the same way. */
  ["the watch is launched able to READ claude-kit (his ruling 2026-09-02T12:39:56Z)",
    (s) => /--add-dir/.test(s) && /\$kitArgs/.test(s)],
  /* ...and FAIL-SAFE, which is the half that protects every machine without a kit — a cloud
   * container, or a fresh clone. --add-dir at a path that does not exist turns "no kit here"
   * (true, and fine) into a launch failure, and a Bell that cannot launch stops the relay dead.
   * The flag must be guarded by a real existence test, not added unconditionally. */
  ["...and only when the kit is really there — no --add-dir at a path that does not exist",
    (s) => /Test-Path[^\n]*\$kitDir/.test(s)],
  /* ⚑ HIS INSTRUCTION, 2026-09-03 (INBOX-20260903T2340Z): "we're running out of usage... we also
   * need to start having the Watch use a different model setting -- what is it currently using?"
   * IT WAS OPUS, AND NOBODY CHOSE THAT. With no --model here, every watch inherited the CLI default
   * from Wyatt's own global settings.json — the file that also governs HIS interactive sessions —
   * so an unattended relay ran the most expensive model every fifteen minutes, around the clock.
   * EXACTLY the same shape as the --add-dir fence three assertions up, and it is the third time on
   * this project: a capability, or a cost, falling out of an argument list nobody read. The fix is
   * one flag; the reason it needs a GATE is that the flag was never there and nothing ever said so. */
  ["the launch names the model it rings a watch on (his ask, 2026-09-03)",
    (s) => /\$claudeArgs\s*=\s*@\([^)]*--model/.test(s)],
  /* ...AND IT IS THE MODEL HE RULED, not merely SOME model. CEO 192 found the first version of this
   * gate holding only the shape: it put the Watch back on claude-opus-5 and the gate printed PASS,
   * so the one thing he actually decided was the one thing nothing was holding. That is CEO 191's
   * fault in new clothes -- an instrument announcing more than it looked at.
   * His words, 2026-09-03 (.claude/memory/DECISIONS.md): "Change the watch to use sonnet 5."
   * DELIBERATELY HARDCODED. If he changes his mind, this line changes WITH bell.ps1 and a new
   * ruling goes in DECISIONS.md -- which is the point. A ruling that can be reversed by editing one
   * string and telling nobody is not a ruling, it is a default wearing a ruling's clothes. */
  ["...and it is claude-sonnet-5, the model he RULED (2026-09-03)",
    (s) => /\$watchModel\s*=\s*["']claude-sonnet-5["']/.test(s)],
  /* ...and the array that carries it must be the array that LAUNCHES. The dry run used to log a
   * DESCRIPTION of the launch while Start-Process built its own list inline, so the two could drift
   * and a gate reading either proved nothing about the other. Rule 23 in a shell script: two things
   * that must agree are ONE thing, or they will drift. */
  ["...in ONE argument array, and that array is what Start-Process is handed",
    (s) => /\$claudeArgs\s*=\s*@\(/.test(s) && /-ArgumentList\s+\$claudeArgs/.test(s)],
  ["...and the dry run prints that same array, not a description of it",
    (s) => /DRYRUN[^\n]*\$claudeArgs/.test(s)],
  ["ASCII only (PowerShell 5.1 reads BOM-less UTF-8 as cp1252)",
    (s) => [...(s === src ? raw : s)].every((ch) => ch.charCodeAt(0) < 128)],
  /* The graveyard fence: the deleted judgement must not creep back in. Each of these names a
   * signal that produced a confident wrong answer and was deleted, not tuned. */
  ["no HEARTBEAT reading (narration recency is not liveness)",
    (s) => !/HEARTBEAT/i.test(s)],
  ["no LAST-ACTIVITY reading (a tool call is not progress)",
    (s) => !/LAST-ACTIVITY/.test(s)],
  ["no commit clock (a quiet hour of honest work is not a death)",
    (s) => !/git log|commit clock|lastCommit/i.test(s)],
  ["no should_launch / longrun launch judgement",
    (s) => !/should_launch|longrun/i.test(s)],
  ["no PP_BOSUN stamp (nothing left for it to scope)",
    (s) => !/PP_BOSUN/.test(s)],
];

console.log("bell_check — the Bell is a process check, and the dead judgement stays dead\n");
for (const [label, test] of assertions) check(label, test(src), "bell.ps1 fails this shape");

/* RED-PROOF: a doctored bell that resurrects the judgement and drops the guards must fail
 * MANY of the same assertions — if it doesn't, the assertions are decoration. */
const doctored = [
  "# a bad bell — non-ASCII dash — and every deleted signal back",
  "$hb = Get-Item HEARTBEAT; $la = Get-Item LAST-ACTIVITY",
  "node should_launch.mjs; git log -1; $env:PP_BOSUN = '1'",
  "Start-Process claude -ArgumentList @('-p', $doorPrompt)",
].join("\n");
const doctoredFails = assertions.filter(([, test]) => !test(doctored)).length;
check(`red-proof: a resurrected-judgement bell fails ${doctoredFails} assertions (needs >= 10)`,
  doctoredFails >= 10, `only ${doctoredFails} fired`);

/* DOES IT STILL PARSE? Opportunistic, and it SKIPS LOUDLY where PowerShell is absent.
 *
 * Everything above is structural for the reason the header gives — no Mac and no container can run
 * PowerShell. But the Blade CAN, and the Blade is the only machine that rings the Bell, so refusing
 * the check everywhere costs coverage on the one machine where it matters.
 *
 * WHY IT IS WORTH THE EXTRA: the Bell is launched by a scheduled task into a hidden window. A
 * syntax error in it does not announce itself — it produces a relay that stops ringing, which from
 * outside is indistinguishable from a quiet night. That is this file's own founding lesson
 * (2026-09-01: a launch that died with its output going nowhere), and every edit to bell.ps1 since
 * has been made by a session whose permission fence would not let it run PowerShell to check its
 * own work. This is that check, moved somewhere it will actually run.
 *
 * IT NEVER SAYS PASS ON A BLIND LOOK. No PowerShell means NOT CHECKED, in those words. */
let pwsh = null;
for (const c of ["powershell", "pwsh"]) {
  try { execFileSync(c, ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" }); pwsh = c; break; }
  catch { /* not on this machine — the Mac and every container land here */ }
}
if (!pwsh) {
  console.log("NOT CHECKED -- bell.ps1 parses: no PowerShell here. Runs on the Blade, which is the\n" +
              "               only machine that rings the Bell.");
} else {
  try {
    const parsed = execFileSync(pwsh, ["-NoProfile", "-Command",
      '$t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile(' +
      `'${BELL.replace(/'/g, "''")}', [ref]$t, [ref]$e) | Out-Null; ` +
      'if ($e.Count -gt 0) { $e | ForEach-Object { $_.Message } } else { "PARSE OK" }'],
      { encoding: "utf8", timeout: 60000 }).trim();
    check("bell.ps1 parses (a Bell that cannot parse stops the relay, silently)",
      /PARSE OK/.test(parsed), parsed.split("\n")[0]);
  } catch (e) {
    console.log("NOT CHECKED -- bell.ps1 parses: the parser could not be run here (" +
                String(e.message).split("\n")[0] + ")");
  }
}

console.log("");
if (failed) { console.error("FAIL bell_check — the Bell has drifted from the shape the redesign ruled."); process.exit(1); }
console.log("PASS bell_check — all assertions green, red-proof fires.");
process.exit(0);
