# THE BELL (wyclau charter, part 3 -- rebuilt 2026-09-01 as part of the Watch redesign).
# VENDORED FROM claude-kit (plugins/wyclau) -- edit THERE, not here. Re-vendor from a claude-kit
# checkout on THIS machine: bash install.sh vendor <repo> wyclau. Drift: scripts/qa/vendor_check.mjs.
#
# ONE JOB: if no watch is on deck, ring the next one. Nothing else.
#
# The Bell replaces the watchdog, and the difference is the whole redesign (Wyatt's rulings,
# 2026-09-01, DECISIONS.md "THE RELAY REDESIGN"): the engine is a relay of fresh one-item watches
# that END on purpose, so a launch is the ROUTINE, not a rescue. The watchdog's judgement stack --
# heartbeat freshness, LAST-ACTIVITY recency, the commit clock, the LONG-RUN marker -- guessed
# wrong in both directions (4 engines launched onto working sessions in one day; hours of hold-off
# on a dead tree) and is DELETED, not tuned. The only question left is one the OS answers
# truthfully: is a door-launched claude.exe alive right now?
#
# WHAT SURVIVES FROM THE WATCHDOG, because each line was paid for:
#   - the process-table query and its command-line filter (the one genuinely Windows-only fact)
#   - unknown-process-table resolves to "assume running, hold off" (stacking is the worse error)
#   - the pre-quoted prompt (Start-Process does not quote ArgumentList elements)
#   - ASCII ONLY in this file (PowerShell 5.1 reads BOM-less UTF-8 as cp1252)
#   - LAST-LAUNCH grace window (covers the gap between Start-Process and the process table)
#   - a launch failure is logged as a failure, never as a success (CEO Review 44 finding 3)
#
# Register (run once, in an elevated PowerShell, path adjusted to this machine's checkout).
# The old "wyclau-watchdog" task must be deleted or disabled first -- Wyatt disabled it 2026-09-01:
#   $repo = "C:\path\to\pastrypirates"
#   schtasks /Create /TN "wyclau-bell" /SC MINUTE /MO 10 /TR `
#     "powershell -NoProfile -ExecutionPolicy Bypass -File $repo\scripts\wyclau\bell.ps1 -Repo $repo"

param(
  [Parameter(Mandatory=$true)][string]$Repo,
  # Covers the gap between Start-Process handing a launch to the OS and the new claude.exe
  # appearing in the process table with its command line readable. Minutes, and deliberately
  # short: a watch that ends after three minutes of work should be relieved within one tick,
  # not parked behind a 25-minute grace built for an engine that pulsed every 20.
  [int]$LaunchGraceMinutes = 5,
  # Log what would be launched instead of launching it, so a gate can exercise THIS script
  # rather than a paraphrase of it. Everything else runs identically.
  [switch]$DryRun
)

$log        = Join-Path $Repo ".planning\wyclau\restarts.log"
$lastLaunch = Join-Path $Repo ".planning\wyclau\LAST-LAUNCH"
$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# IS A WATCH ON DECK? ASK THE OS, NOT A FILE. The process table cannot go stale by construction.
# The filter matches ANY door-launched engine -- a new watch, or a leftover old-style engine --
# because stacking onto either is the two-sessions hazard CLAUDE.md section 3 exists for.
# Wyatt's own claude desktop app is also claude.exe; only an engine carries -p with the door.
$watchProcs = $null
try {
  $watchProcs = @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'" -ErrorAction Stop |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*-p*/door*' })
} catch {
  # Cannot see the process table. UNKNOWN MUST NOT MEAN ABSENT: of the two possible errors,
  # missing one ring is recovered at the next tick, while stacking a second watch onto a live
  # one is not. Logged, so a quiet Bell is never silently blind.
  Add-Content $log "$now`tcannot read the process table -- assuming a watch IS on deck, not ringing"
  exit 0
}
if ($watchProcs.Count -gt 0) {
  # The normal case, most ticks of most days. Deliberately unlogged: a line every ten minutes
  # forever is noise that buries the lines that matter (rings and failures).
  exit 0
}

# A launch was just handed to the OS and may not be visible yet. One short window, then ring anyway.
if (Test-Path $lastLaunch) {
  $since = (Get-Date) - (Get-Item $lastLaunch).LastWriteTime
  if ($since.TotalMinutes -lt $LaunchGraceMinutes) {
    $m = [math]::Round($since.TotalMinutes)
    Add-Content $log "$now`tno watch visible, but one was rung $m min ago (grace $LaunchGraceMinutes) -- not ringing a second"
    exit 0
  }
}

# RING THE NEXT WATCH, through the Door. The watch re-orients itself from the record; no state is
# assumed. (claude must be on PATH for the scheduled task's user -- verified at the Blade hour.)
# The prompt is PRE-QUOTED because Start-Process does not quote ArgumentList elements: an unquoted
# prompt reaches the child split into words and claude dies on usage in a hidden window with no
# trace (observed on the Razer 2026-08-31). Keep it free of double quotes -- the pre-quoting
# cannot survive one. The working directory is pinned rather than inherited: nothing here may
# depend on the caller's state.
Set-Location $Repo
$doorPrompt = "/door - the Bell rings you as a WATCH. Sync, orient, then work exactly ONE item through the full Proof - Wyatt's inbox first, then the top unblocked Chart item - close it through the gate, republish the Glass, and END YOUR TURN. Ending is correct: the Bell rings the next watch. Never take a second item."
if ($DryRun) {
  Add-Content $log "$now`tDRYRUN would ring a watch"
} else {
  try {
    Start-Process -FilePath "claude" -WorkingDirectory $Repo -ArgumentList @(
      "-p", "`"$doorPrompt`""
    ) -WindowStyle Hidden
    Add-Content $log "$now`tring: no watch on deck -- rang the next one"
  } catch {
    # A "ring" line with no launch behind it is a log that lies. Say what failed, in the same
    # file the next reader will open.
    Add-Content $log "$now`tring FAILED: $($_.Exception.Message)"
  }
}

# Read by the grace window above. UNCONDITIONAL, both halves deliberate: under -DryRun because
# the grace guard is a thing the gate exercises, and after a FAILED launch because retrying a
# failing launch every tick is a hot loop -- one window later is the right degradation.
Set-Content -Path $lastLaunch -Value $now -Encoding ascii
