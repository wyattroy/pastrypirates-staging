# PREDICTION — moving the hand-over ahead of the turn

2026-08-31. Wyatt: *"Move it, I trust the plan."*

## What I found before changing anything, and it is better than the plan's argument

**The two pass-and-play paths already disagree with each other**, which makes this a consistency
fix (rule 8) rather than only an architectural one:

| site | order today |
|---|---|
| `src/ui/flow.js:2856` — the secret draft | `passGate(seat)` → `applyActiveSeat(seat)` → ask — **gate first. Correct.** |
| `src/ui/flow.js:730` — a bake turn | `passGate(p.idx)` first — **correct** |
| `src/ui/flow.js:2478` — `humanTurn` | `applyActiveSeat` → `passGate` → `applyActiveSeat` — **seat switches BEFORE the gate** |

So one of three does it backwards. The plan says the hand-over is a precondition on obtaining a
decision, not part of the turn; two call sites already agree with the plan and nobody noticed the
third didn't.

## What a player should see differently

**Today:** the board switches to the incoming captain — ring, captains-box highlight, row order —
**and then** the hand-over card appears. For that instant the outgoing captain, still holding the
device, is looking at the next captain's board.

**After:** the hand-over card comes up first. The board changes after the tap, in front of the
person it belongs to.

## What would prove me wrong

1. **If the first `applyActiveSeat` is load-bearing for the gate itself** — if `passGate` reads the
   active seat rather than its argument. It takes `seatIdx` explicitly, so I expect not; if it does,
   removing the call breaks the hand-over and I stop.
2. **If something between the two `applyActiveSeat` calls needs the seat already set.** Only
   `passGate` sits between them, so I expect nothing does.
3. **If the double call was deliberate for a reason not in the comment.** The comment says only
   "exactly as setActor was called before it" — a note about preserving an old shape during a
   refactor, not a behaviour anybody asked for. Git log at that line is the check.

## Size

Pass-and-play only. One line moves. **Nothing in solo or crew changes at all** — `passGate` returns
immediately outside pass-and-play, so the two `applyActiveSeat` calls collapse to one no-op pair in
every other mode.
