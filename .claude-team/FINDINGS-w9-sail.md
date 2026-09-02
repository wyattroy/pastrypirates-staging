# W9 — the ordinary sail. Builder findings (written as I went).

Baseline for all before/after: **commit `9a52beee`** (NOT `git stash` — the coordinator committed
my in-flight edits, so a stash comes back empty).

## The count was wrong twice, and here is why

The brief named **6** sites. My source sweep found **7** in `src/ui/flow.js` and **1** more in
`src/orchestrator.js`. The seventh is the bot's boxed-in rim escape,
`src/ui/flow.js:2690` (pre-change numbering) — `g.rimEscape(p)` emits, then
`await animateRimSweepIfAny(...)` and `await botBeat()` ride, and only the `liveRender()` at 2693
publishes. Identical fault, identical fix.

**The reason a grep keeps undercounting: the ride and the publish are ONE PHYSICAL LINE** —
`await animateSailRoute(evSail);liveRender();`. A search that reads the *following* line matches
nothing. The new `--leg=shape` reads the line itself, left of the publish, which is why it sees them.

## What I changed (all in files I own)

`src/ui/flow.js` — `publishNow()` inserted before the ride at seven sites, in three turn paths:
`humanAct` (sail + trade-wind sweep), `humanTurn` (sail + sweep), `botTurn` (sail + sweep + the
boxed-in rim escape). Three `W9:` comment blocks explain why. **No `isHost` entered this file** —
the host guard is already on `pushEvents` (`src/orchestrator.js:1465`).

`scripts/qa/w9_publish_lag_check.mjs` — three legs now: `shape` (source, no browser),
`storm` (the original measured leg), `sail` (measured, drives the real `botTurn`), and `--leg=all`.
USAGE now carries the **restart-the-browser-after-editing-src** warning, which is the trap that
almost made the last builder's green a lie.

## Evidence

| | before `9a52beee` | after |
|---|---|---|
| `--leg=shape` | **RED, 7 sites** | **GREEN** |

Both runs printed the same 1-site watch list (below), so the instrument is visibly able to print
both verdicts on the same subject.

## OPEN, unmeasured, deliberately NOT fixed

- `src/orchestrator.js:1080` — the bake resolve. `g.bakeResolve(p,dec.g)` emits, `await
  benchReveal(p,out.res)` rides, `liveRender()` publishes. **Same shape by reading.** Not measured,
  so not touched. The gate PRINTS it on every run and does not let it decide the verdict.
- The **trade settle** the brief asked about is **NOT the same shape**. Every site I found
  (`src/orchestrator.js:811`, `:844`, `:1350`) reads `ev(...); liveRender(); await
  narrateLastEvent();` — the publish already comes BEFORE the narration. Nothing to fix there.

## What the instruments cannot see

- `--leg=shape` is **source text, not a measurement.** It proves the publish now precedes the ride;
  it cannot say what any of it costs in milliseconds.
- `--leg=sail` drives `botTurn`. It **never reaches the two human sail sites** — those sit behind a
  prompt it does not answer. Only `shape` covers them.
- Both measured legs read the **host tab only**, by design: no network in the number.
- Neither leg looks at a **rendered picture**. Nothing here proves the glide still looks right.
