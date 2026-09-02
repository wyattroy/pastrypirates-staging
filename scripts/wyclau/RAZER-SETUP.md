# The Blade hour — installing the Bell

*Rewritten 2026-09-01 for the Watch redesign (DECISIONS.md "THE RELAY REDESIGN"): the watchdog and
its judgement are gone; the Bell rings a fresh one-item watch whenever none is on deck. Steps 2–3
survive unchanged from the first Razer hour — they were paid for. Until the ring test below has
passed, the relay's dependability is a design, not a fact — no session may claim otherwise.*

**Before anything: the old `wyclau-watchdog` scheduled task must be OFF** (Wyatt disabled it
2026-09-01; `schtasks /Delete /TN "wyclau-watchdog" /F` removes it for good).

**What you need:** the Razer, ~30–60 minutes, Claude Code installed and logged in there.

## The steps (a session walks you through these; steps 2, 3 and 8 are YOURS alone)

1. **Clone/update the repo** on the Razer; note its path (call it `$repo`).
2. **Trust the workspace** — open `claude` interactively in `$repo` once, accept the
   folder-trust prompt, exit. Until that prompt is accepted, every project permission in
   `.claude/settings.json` is silently dropped — headless runs don't ask, they just stall.
   (Found the hard way, 2026-08-31: `hasTrustDialogAccepted: false` dropped all 88 entries and
   nothing said so.)
3. **Grant the engine its hands** — replace the `"permissions"` object in
   `.claude/settings.json` with the block below, then commit and push it. **This step is yours
   by design, not by accident: the harness refuses to let a session write its own permission
   grants, with or without your approval on record.** (That refusal was verified twice — in a
   cloud session. Confirm it once on the Razer itself, by asking the engine session to add an
   allow entry and watching it be refused, before you trust the stall test: if a local session
   CAN edit this file, unscoped `Write` plus `git push origin claude/*` would let it widen its
   own grants. A claim is only good where it was measured.)

   **Be honest about what this block is.** An engine that can `Write` any file and then run
   `node scripts/<anything>` can run whatever it writes — dropping the old `python3 -c` /
   `node -e` entries is hygiene, not a fence. The engine must edit game code to do its job, so
   that trade is inherent. What is ACTUALLY fenced: production (`git push origin main` is not
   granted), publishing to staging where you play, and your secrets (the deny block):

   ```json
   "permissions": {
     "allow": [
       "Bash(node --check *)",
       "Bash(git rev-list *)",
       "Bash(git fetch *)",
       "Bash(curl -s -o /dev/null *)",
       "mcp__github__actions_list",
       "mcp__github__actions_get",
       "Bash(node scripts/*)",
       "Bash(node .claude/gsd-core/bin/gsd-tools.cjs *)",
       "Bash(npm test*)",
       "Bash(git status*)",
       "Bash(git diff *)",
       "Bash(git log *)",
       "Bash(git show *)",
       "Bash(git pull *)",
       "Bash(git add *)",
       "Bash(git commit *)",
       "Bash(git push origin claude/*)",
       "Bash(git rev-parse *)",
       "Bash(pkill -f remote-debugging-port*)",
       "Bash(pkill -f http.server*)",
       "Bash(curl -s https://playpastrypirates.com/*)",
       "Bash(curl -s https://staging.playpastrypirates.com/*)",
       "Edit",
       "Write"
     ],
     "deny": [
       "Read(.env)",
       "Read(.env.*)",
       "Read(.secrets)"
     ]
   },
   ```

   What is deliberately NOT here: `git push origin main` (production stays human),
   `./scripts/deploy-staging.sh` (publishing where you play stays human), `git checkout`
   (the engine stays on its branch), and any bare interpreter (`node -e`, `python3`).
4. **Prove a watch can pulse headless:**

   ```powershell
   claude -p "Run exactly this command and show its output: node scripts/wyclau/glass.mjs --note 'headless permission probe'"
   ```

   then confirm `.planning\wyclau\HEARTBEAT` was just written. This step used to be
   `claude -p "say ok"` — a check that uses no tools, so it passed on a machine where the
   engine could not stamp its own heartbeat. **A check that cannot fail on the thing it
   certifies certifies nothing.**
5. **Test the O2 question while you are here** — can a Blade session publish the Glass at all?
   In an interactive `claude` session on the Blade, ask it to republish the Glass and to state
   plainly whether the Artifact tool exists in its tool list. Whatever the answer, it goes in the
   ledger verbatim — this has been "unexplained" since 2026-09-01 and the Glass architecture
   hedges on it (a watch that cannot publish commits `glass.html` and flags it).
6. **Register the Bell** (elevated PowerShell — the exact command is at the top of
   `scripts/wyclau/bell.ps1`, with `$repo` substituted). Every 10 minutes it asks one question:
   is a door-launched claude.exe alive? No ⇒ it rings a fresh watch and logs the ring to
   `restarts.log`. There is nothing else to configure — the Bell has no thresholds.
> **⚠ VERIFY THE REGISTRATION BEFORE TRUSTING IT — it can fail silently, and it did.** 2026-09-01:
> the task was created in a fresh elevated window where `$repo` had never been set. PowerShell
> expanded it to nothing, so the task's action became `-File \scripts\wyclau\bell.ps1 -Repo` — no
> repo, no script. `schtasks /Query` reported **Ready**, the task fired every ten minutes for an
> hour, and every run died before reaching bell.ps1 (`Last Result: -196608`), so the log stayed
> empty and looked exactly like a Bell that had never ticked. **Always print the action back and
> read it**, then force one run rather than waiting for the schedule:
>
> ```
> schtasks /Query /TN "wyclau-bell" /V /FO LIST | findstr /C:"Task To Run"
> schtasks /Run /TN "wyclau-bell"
> ```
>
> Two more fields in that same output are worth acting on: `Logon Mode: Interactive only` (a console
> flashes on every tick, and nothing runs when logged out — fix in Properties → General) and
> `Power Management: Stop On Battery Mode, No Start On Batteries` (on a laptop the Bell dies when
> the charger comes out — Properties → Conditions).

7. **THE RING TEST — the step that makes it real.** Ring a watch by hand first
   (`claude -p` with the exact prompt from bell.ps1) and watch it work ONE item and end. Then
   kill a running watch mid-item on purpose. Within ~10–15 minutes (one tick plus the grace
   window) the Bell must ring a fresh watch, the ring must appear in `restarts.log`, and the
   fresh watch must pick up from the record — including the killed item's claim in the ledger.
   A Bell that has never been proven to ring after a deliberate kill is an instrument that has
   never been proven able to fail. Also confirm the OPPOSITE direction: while a watch is
   visibly working, two Bell ticks pass without a second watch appearing (the process check
   holding, where the old commit clock summoned doubles).
8. **Arm your phone:** run `/remote-control` in your own session (only you can), and confirm
   the Glass link opens on your phone: every watch republishes it as it works.

## After the hour

The 48-hour shakedown begins (DECISIONS.md ruling 14, superseding the old 24-hour exit test):
zero phantom sessions, zero eaten conversations, the Glass never older than one watch and never
wrong on spot-check, every closed item carrying a CEO verdict, every inbox item acknowledged
within one Bell interval. The shakedown's cargo is the release — trial, staging, Wyatt plays,
merge. Then, and only then, the rulebook cutover.

## Honest limits

- The Bell rings watches; it cannot revive the *machine* (sleep, updates, power). Task Scheduler
  should be set to run whether or not you are logged in; disable sleep-on-idle for mains power.
- `claude` must be on PATH for the scheduled task's user — step 4 exercises this, and the hour
  isn't done until the ring test passes with the task, not just the terminal.
- The Bell cannot see a DETACHED sea trial (that is a node process, not a door-launched claude),
  and it does not need to: watches read the trial's report and LONG-RUN marker; the Bell keeps
  ringing watches regardless, and a watch that finds a trial in flight simply works something
  else or ends.
