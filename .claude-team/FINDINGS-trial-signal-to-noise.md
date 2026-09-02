# WHY THE SEA TRIAL SAYS "FAILED" EVERY TIME AND WYATT STILL FINDS THE BUGS BY PLAYING

2026-08-31. Every number below is counted from the previous FULL trial's own artifacts —
`.planning/sea-trials/SEA-TRIAL-002-2026.08.30.1.md` and `sea-trial-shots/report.json`, 10 legs,
328 screens, 104 minutes. Nothing new was run to produce this.

## The failure lines that trial printed, counted

| times | line | what it actually is |
|---|---|---|
| 10 | *vision judge errored on N screen(s) — those screens are NOT cleared* | **instrument** — the vision call returned an EMPTY reply |
| 10 | *N screen(s) never stopped moving before being checked* | **instrument** — one component, and a deadline 400ms too short |
| 9 | *vision judge FAILED N of N screen(s) it looked at* | **instrument** — these were "cannot read the file", not verdicts about the game |
| 2 | *N console error(s): Failed to load resource: Unacceptable TLS certificate* | **environment** — the container's proxy, not the game |
| 2 | **N structural check failure(s): `no-cover-ask`** | **THE GAME. A real defect.** |
| 3 | *offered but never exercised: walk away / deny / vanilla beans* | **coverage** — the driver never reached those options |

**Roughly 29 of ~36 failure lines are the instrument talking about itself.** Two are the game.

## THE TWO THAT ARE THE GAME, and they are worth reading

```
control covering the question it answers: "sailCell" over "test2: tap to sail"
control covering the question it answers: "sailCell" over "Davy Scones: tap to sail — blu"
```

**A sail square is drawn on top of the words telling you to tap a sail square.** In 2 of 10 legs.
That is a real, player-visible layout defect, found by the structural checks, sitting underneath
twenty-nine lines of instrument noise.

## What this explains

Wyatt, 2026-08-20: *"There are so many bugs that I can see at a glance in moments that you would
also be able to see in moments if you simply QA'd the game in a browser yourself."*

**The trial is not failing to look. It is failing to be READ**, because its output is dominated by
its own problems. A report whose FAILED verdict is 85% instrument noise trains its reader to skim —
and skimming is how one line about a control covering its own instruction goes unnoticed for a day.

`HARD-WON-LESSONS` §10 says a gate that flakes gets disabled, *"and a disabled gate is worse than
no gate, because it was believed for a while."* **This is the same failure one step earlier: a gate
nobody reads carefully has already been disabled, it just does not know it.**

## And the structural half is in good health — which is the part nobody has said

**2 structural failures in 328 screens.** Not two per leg — two in the entire run. The checks that
can see geometry are finding almost nothing wrong, which is genuinely good news and has never been
stated because it was never separated from the noise.

**THE HONEST CAVEAT, and it is a big one: the judge saw NOTHING that run** — 0 of 328 screens
produced a real verdict. So *visual* defects that geometry cannot see are **unmeasured, not
absent.** The clean structural result says the boxes are in the right places. It says nothing about
what those boxes look like.

## What follows, in order of value

1. **Fix the judge** (`FINDINGS-judge-empty-reply.md`) — it is the difference between measuring half
   the screen and all of it.
2. **Settle the radial cap question** (`FINDINGS-settle-cap.md`) — it is 10 of the ~36 lines.
3. **Then the report separates GAME from INSTRUMENT at the top**, so the two lines that matter are
   not the last thing a reader reaches.
4. **And fix `no-cover-ask`** — a sail square over its own instruction is exactly the class of thing
   he finds in minutes and is right to be annoyed about.
