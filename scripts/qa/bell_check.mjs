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

console.log("");
if (failed) { console.error("FAIL bell_check — the Bell has drifted from the shape the redesign ruled."); process.exit(1); }
console.log("PASS bell_check — all assertions green, red-proof fires.");
process.exit(0);
