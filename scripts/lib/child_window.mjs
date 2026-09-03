/* child_window.mjs — the one option that keeps a detached long run off Wyatt's screen.
 *
 * WYATT SAW THIS AND ASKED WHAT IT WAS: a black `C:\Program Files\nodejs\node.exe` console
 * appearing on the Blade, mid-hour, unannounced. That window IS a sea trial, and its ✕ kills an
 * 85-minute run with no warning. INBOX-20260901T1440Z.
 *
 * THE MECHANISM, MEASURED 2026-09-02 rather than reasoned about — and it is one level below where
 * the Inbox entry guessed it was:
 *
 *   1. `start_trial_detached.mjs` spawns the trial with `detached: true`. On Windows that is
 *      DETACHED_PROCESS, and a detached child has NO CONSOLE AT ALL. (Verified with
 *      AttachConsole: it fails for the trial's pid and succeeds for a non-detached one.) So the
 *      wrapper is innocent — its `windowsHide: true` is a no-op there, but it has nothing to do.
 *   2. A process with no console that spawns a console application makes Windows give that child
 *      a BRAND-NEW console. A brand-new console is a visible black window. Every child the trial
 *      starts is therefore a window.
 *   3. `windowsHide: true` on those spawns is CREATE_NO_WINDOW: the child gets a console with no
 *      window at all — and everything IT spawns inherits that windowless console.
 *
 * WHICH IS WHY THIS IS ONE RULE AND NOT FOUR PATCHES. The flag only has to be right at the
 * boundary — the first spawn out of the console-less process. The browsers and helpers further
 * down inherit it and need to know nothing. Measured: a great-grandchild spawned with no options
 * at all reports no window.
 *
 * USE IT AT EVERY CHILD-PROCESS CALL IN A SCRIPT THAT A DETACHED RUNNER CAN START:
 *   import { NO_CONSOLE_WINDOW } from "../lib/child_window.mjs";
 *   spawnSync("node", args, { ...NO_CONSOLE_WINDOW, cwd: REPO, encoding: "utf8" });
 *
 * `scripts/qa/detached_trial_windowless_check.mjs` fails the build when a call in
 * `scripts/sea_trial.mjs` is missing it, and proves the behaviour both ways on Windows.
 *
 * On macOS and Linux the flag is ignored by Node, so this is safe to spread everywhere.
 */
"use strict";

export const NO_CONSOLE_WINDOW = Object.freeze({ windowsHide: true });
