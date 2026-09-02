# PREDICTION — the ripple ring is drawn from two places that disagree during a bake

Written 2026-08-31 BEFORE any change or measurement.

## Wyatt's ruling, which decides the answer

**"no ripple ring in the ovens."** The active-turn ring stays with whoever last took the wheel. It
does not move to the captain who has stepped up to bake.

## What I claim, with citations

Two sites draw that ring, and they pass DIFFERENT event lists to the same walk:

| site | list passed | so during a bake the ring… |
|---|---|---|
| `src/ui/board.js:1532` `activeTurnSeat()` → used by the live-ships path at `:1479` | `TURN_ONLY` = `["turn"]` | **stays** with the last captain to take the wheel — obeys the ruling |
| `src/ui/board.js:1776` — `render()`'s own | the DEFAULT, `TURN_ESTABLISHING` = `["turn","ovens","bake"]` | **moves** to the captain at the ovens — breaks the ruling |

`src/shared/storyboard.js:25-29` records why `ovens`/`bake` were ever added: *"a bake is not a turn
— the engine emits {t:'ovens',p} when a captain steps up… so during a bake the most recent `turn`
was still the PREVIOUS captain's and the ring pointed at them."* Somebody read that as a bug and
widened one of the two sites. Wyatt has now ruled it is not a bug.

## What happens BEFORE the bug (rule: widen the time horizon)

Nothing races here. This is not a timing fault — it is two constants. The ring's behaviour during a
bake depends on **which drawing path last ran**, which is decided by whether the ship list came from
the live/net renderer or from `render()`. That is the same shape as the host/guest divergence: one
thing a player looks at, two answers, kept in step by nobody.

## What would prove me WRONG

1. **If the two sites cannot both draw the ring in one session** — e.g. `:1776` only ever runs
   before a game starts, or the live path always runs last and overwrites it. Then there is one
   effective answer and this is dead code, not a divergence.
2. **If a bake never coexists with the ring being visible at all** — if the ring is hidden while the
   bake-off card is up, neither site's answer is seen and the whole question is moot on screen.
3. If `TURN_ESTABLISHING`'s `ovens`/`bake` entries are load-bearing for some OTHER consumer of
   `:1776`'s `active` value, so narrowing it changes something besides the ring.

**If any of those hold I say so and do not "fix" it.** Falsifier 2 is the one I most expect to bite,
and it is exactly the shape that caught me out three times on the last item: TRUE OF THE CODE, and
I have not yet looked at what the game PRODUCES.

## So the gate comes first, and it must go RED before anything changes

A check that asserts both ring sites derive the seat from the same event list. On the tree as it
stands it must FAIL, naming the two lists. If it passes now, my reading of the code is wrong.

---

## THE RESULT — 2026-08-31

**Falsifier 1 (can both sites draw the ring in one session?) — DID NOT HOLD.** `:1479` is inside
`renderLiveShips()` (exported, called from `src/ui/flow.js:1388` for storm-square ship moves);
`:1776` is inside `render()` (exported). Both are live. The divergence is real.

**Falsifier 3 (is the wider list load-bearing elsewhere?) — DID NOT HOLD.** After the fix,
`grep` finds **no consumer in `src/` naming `TURN_ESTABLISHING` at all.** Nothing else read it.

**THE RULE DIVERGENCE IS MEASURED, not reasoned about.** On the stream
`[newround, turn p1, sail p1, ovens p3, bake p3]`:

```
renderLiveShips() (TURN_ONLY)              -> seat 1
render()          (no option -> default)   -> seat 3
```

The ring sat on a **different boat** depending on which path last drew it.

**FALSIFIER 2 IS STILL OPEN, AND I AM SAYING SO RATHER THAN QUIETLY DROPPING IT.** I have NOT
proven what a player sees during a bake — whether the ring is visible at that moment at all. My
pose attempt **never started a game** (the name modal did not submit), and it reported
`NEVER REACHED A BAKE — instrument did not reach its subject` rather than measuring the title
screen and calling it a bake. That guard is there because the last item was caught doing exactly
that.

**Why the fix is still right with F2 open:** it implements Wyatt's ruling, and it removes a state
where one visual had two answers — which cannot be correct under any ruling. What F2 would change
is only **how big I am allowed to say the player-visible impact is**, and the honest answer today
is *unproven on screen*. That is precisely the distinction HARD-WON-LESSONS §12h was written for
this morning: "this is broken" and "every player sees this" are different claims needing different
evidence.

## AND THE TRAP WAS CLOSED AT SOURCE, not just at the two call sites

`render()` did not pass the wrong list — **it passed no list**, and an omitted option was silently
the wider one. `deriveActiveSeat` now THROWS if you do not say which question you are asking.
A default nobody deliberately chose is a trap with no user; every caller in `src/` already states
its list, so nothing legitimate loses anything.
