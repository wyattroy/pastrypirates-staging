# PREDICTION — step 5, the Decider, before any code

2026-08-31.

## What I found by measuring first, and it re-sizes the step DOWN

The plan says *"Mode becomes a table of Deciders, not a set of ifs scattered through the code"* and
*"you delete the concept of mode from every layer except the one line that chooses a Decider."*
That describes a large refactor. **The actual scatter is small, and I want the real numbers on the
record before I build anything:**

| what the plan implies | what is there |
|---|---|
| mode `if`s scattered through the code | **13** `appState.passAndPlay` references in all of `src/` |
| the human/bot fork | **exactly three sites**, all the identical line: `src/orchestrator.js:973, 998, 1033` — `await (p.strategy==="human" ? humanTurn(p) : botTurn(p))` |
| the hand-over gate | **already the Decider shape**, `src/ui/lobby.js:352` `passGate(seatIdx)`, awaited at `flow.js:730, 2478, 2856` |

So step 5's first increment is **not a rewrite. It is converging three copies of one line.**

## What I will build, smallest honest version

`takeTurn(p)` — one place that selects how a seat's turn is obtained — replacing the three copies.
Behaviour identical. That is the seam the four Deciders plug into later.

## What I predict, and what would prove me wrong

1. **The three sites are not actually identical in context.** They sit in different loops (`:973`
   the main seat loop, `:998` a nested one, `:1033` elsewhere) and one may need something the
   others do not — a different await shape, a guard above it. **If they differ in any way that
   matters, converging them is a behaviour change wearing a refactor's clothes, and I stop and say
   so.** This is the falsifier I most expect to bite.
2. **`p.strategy === "human"` may not be the whole test.** A remote human in a crew game is also
   `"human"` but is not answered at this device. If the guest tier never reaches these lines, the
   test is complete; if it does, there is a fourth case hiding inside `humanTurn`.
3. **I predict no player sees anything change.** Any screenshot difference means I broke something.

## The rule I must not violate while doing it

The plan is explicit and it is the load-bearing constraint: **"a Decider may draw whatever it needs
— but it must emit no event. What leaves it, upward, is only the answer."** `src/ui/audio.js:320`
already observes this about the pass-and-play path in those words: *"no new event at all"*. If my
seam ever emits an event, it is a fork wearing a feature's clothes.

## And the thing I will NOT do tonight without asking

Move `passGate` inside the Decider. It is correct per the plan — the hand-over is a precondition on
obtaining an answer, not a look — but it changes when the blur and the ceremony fire relative to the
turn starting, and **that is timing a player sees.** It goes on the morning checklist with a
recommendation, not into a commit made while he is asleep.
