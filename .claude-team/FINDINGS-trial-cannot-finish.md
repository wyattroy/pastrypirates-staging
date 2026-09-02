# A 104-MINUTE SEA TRIAL CANNOT COMPLETE IN THIS CONTAINER

2026-08-31, observed directly rather than inferred.

## What happened

A FULL trial was launched at **05:33** on build `2026.08.31.1`. At **06:22** the process was gone,
`.planning/SEA-TRIAL.md` read *"IN PROGRESS — no verdict yet"*, and nothing was running. The last
leg line was written at **05:50**; 134 screenshots had been produced.

**The cause is not ambiguous:**

```
$ uptime
 06:22:14 up 1 min
```

**The container had been up 1.6 minutes. It was recycled at ~06:20**, and took the trial with it.
Not memory (14.5 GB free), not disk (11 GB free), no OOM in `dmesg`. The machine went away.

## Why this matters more than one lost run

**Rule 24 says every change to the game goes through a sea trial, and FULL gear takes ~104 minutes.
This container does not stay up that long.** So on this machine, at that gear, *the trial cannot
finish* — and every attempt leaves a report saying IN PROGRESS, which is at least honest but is not
a verdict anybody can act on.

**It also explains the older incident Wyatt asked about** — *"why the session stalled and everything
died silently."* Nothing stalled. The machine was replaced underneath it.

## What was wrong with my first response to it

I relaunched the same 104-minute run with `setsid`, reasoning that fuller detachment from the
shell would help. **It would not have.** `setsid` protects a process from its parent shell exiting;
it does nothing about the host being recycled. Doing the same thing with a nicer flag is not a
lesson learned.

## What actually follows

1. **The trial must be RESUMABLE**, so a recycle costs one leg rather than the whole run. Each leg
   already writes its own screenshots and log lines; what is missing is a record of which legs have
   a complete result, and a skip on restart. Then any number of recycles still converges.
2. **Or the fleet must be split** — run FULL as several smaller invocations, each inside one
   window. Cruder, and it fragments the report, which is the thing rule 24 tells Wyatt to open.
3. **Either way, the report must never say PASSED for a run that was interrupted.** It currently
   says IN PROGRESS, which is correct behaviour and should be preserved through whatever change
   lands — that line is the only reason this was noticed rather than mistaken for a pass.

**The laptop does not have this constraint.** A FULL trial there has completed before — the
archived 104-minute report from 2026-08-30 is proof. This is a cloud-container limit, and worth
saying plainly so nobody concludes the trial itself is broken.


---

## CORRECTION, same hour: I then reported the RELAUNCH dead when it was sailing fine

Minutes after writing the above I checked the relaunched trial and reported *"trial not running —
the relaunch also died with the recycle."* **It was running.** `pgrep -af` found both processes
alive and a leg mid-voyage.

**The cause was my instrument, not the world — again.** I captured a PID with
`pgrep -f "scripts/sea_trial.mjs" | head -1` three seconds after launch, wrote it to a file, and
then checked *that number* rather than the process. The number was a transient match. Every later
check asked "is PID 1890 alive?" and got a truthful no about a PID that was never the trial.

**The rule this keeps proving:** an instrument that reports absence has told you something about
ITSELF until you check it reached its subject. A stored PID is a snapshot; `pgrep -af` by name is
the question you actually mean. **On the same night I wrote that lesson twice into the docs, I made
it a third time — which is the honest measure of how easy it is.**

**And the finding above still stands, because it rests on different evidence:** the FIRST trial's
death is established by `uptime` reading "up 1 min" at 06:22, not by a PID lookup. The container
really was recycled. What was wrong was only the claim about the relaunch.