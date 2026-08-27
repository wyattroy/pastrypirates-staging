# The v3 bot: a race planner

Design note for the `/3` build's bot brain — the deliverable §7.1 of the FABLEBOT brief asked for.
Written 2026-08-09. Companion to `docs/BOT-DESIGN-PRINCIPLES.md` (how a bot should decide) and
`docs/WINNING-STRATEGY.md` (what the right decision is); this note says what the new architecture
**models that the incumbent does not**, and what that was measured to be worth.

The incumbent stays shipped at `/v2bakeoff` and stays byte-identical inside `3/src/engine/index.js`
as `planTurnClassic` — it is the control arm of every number below.

---

## The architecture in one paragraph

The incumbent is a one-ply exact planner that minimises **my expected turns to win** on a frozen
board, with denial bolted on as priced constants. The v3 brain changes the objective itself: it
maximises **the probability of winning a modelled four-way race**,

```
P(win) = Π over rivals q of  σ( (ETA_q − myFinish + RACE_BIAS) / RACE_SPREAD )
```

where `myFinish` is my own contested tour from the candidate square, `ETA_q` is a real voyage
built for each rival from public evidence only, and σ is a logistic curve whose two constants are
**fitted, not tuned** — maximum likelihood on 27,867 observed did-p-beat-q outcomes from a seeded
300-game corpus (`scripts/measure_race_spread.mjs`; RACE_BIAS +2.75, RACE_SPREAD 6.75). Every
candidate turn — each reachable square crossed with sail / dock / fight / hail — is scored by the
P(win) of the state it leaves, stochastic actions branching on their real outcomes and averaging
the *score*, never the state.

## What it models that the incumbent does not

1. **Contention.** Each rival's predicted voyage (greedy cheapest completion of what their public
   hold says they still lack) yields a depletion schedule: which shelf empties, at what turn. My
   own tour prices every leg by the stock that will be *left on arrival* — so "go first where the
   crates will be gone" falls out of the arithmetic instead of a tie-break, and buying a crate a
   contender was counting on moves *their* ETA inside the same evaluation.
2. **Denial without a constant.** Robbing a rival is worth exactly how far it moves their ETA past
   mine on the curve — everything in a close race, nothing when I'm out of it. `denialTurns`,
   `threatHorizon`, `huntWeight` and the /(players−1) public-good discount all dissolve; the
   −21.2 rescaling failure mode (docs/BOT-DESIGN-PRINCIPLES.md) cannot recur because there is no
   horizon left to mis-scale.
3. **Risk posture, emergent.** A fight's three outcomes (measured over 60,000 battles: downwind
   49.6/25.4/25.0, upwind 24.9/0/75.1) are each scored as a full race state and then averaged.
   Because the curve is concave near a winning position and convex near a losing one, a
   comfortable leader finds the same gamble *lowers* expected P(win) that a trailing captain finds
   *raises* it — leader-plays-safe / trailer-gambles with no variance policy written anywhere.
   Personality survives as principle 8 wants it: `fightBias` scales how deeply the loss branch is
   *felt* below the stand-pat score, never the prize or the odds.
4. **True sailing costs.** Legs are costed by wind-aware whole-turn distance fields built from the
   real one-turn reachability rule (4 squares, 2 once any step bites into the wind, rim never a
   staging post), flooded in reverse from each destination — a legal path x→y under wind W is a
   legal path y→x with the upwind trigger mirrored, which is what makes one flood per destination
   serve every source. This replaces `ceil(BFS-distance / speed)`, which priced a full-speed
   dogleg around the wind and a half-speed crawl straight into it identically. It also lets every
   reachable square be scored in full (the incumbent shortlists 6 plain-sailing squares), which
   alone was worth +3.5 ladder points, because a dogleg the shortlist never offers can never win.
5. **The flip that is actually flipped.** The dock evaluation branches on heads and tails and asks
   exactly what `doDock` will ask of each purse (buy on `needsIt || leverage` after the flip pays),
   instead of evaluating a mean payout no single turn ever delivers — principle 3, kept under
   uncertainty.

## What was tried and rejected by the gate

Per the brief's §5 discipline — every layer ran `scripts/bot_ladder3.js` (red-proofed both ways:
identical brains +0.0 on every row; a lobotomised brain −66.0 WORSE) before it stayed:

| change | mean edge (2v2+3v1, 400 games, ×7919 seeds) | verdict |
|---|---|---|
| race planner, shortlist candidates | **+6.7** | kept as base |
| + score every reachable square | **+10.2** | kept |
| RACE_SPREAD 4.0 instead of the measured 6.75 | +9.0 | reverted — the measurement stands |
| + endgame intercept, any rival ahead of me | +8.8 | rejected — stalks shoppers via a home path they are not on |
| + endgame intercept, true runners only (≥4 distinct crates) | +9.9 | rejected — still below the brain without it, twice is a verdict |

The endgame intercept is the one idea from `docs/WINNING-STRATEGY.md` this brain deliberately does
NOT carry: two implementations both cost points against this opposition, and §5 of the brief is
explicit about what that means. The deleted layer lives in this branch's history if a future table
(human runners, different archetypes) makes it worth re-measuring.

## Cost per game

Measured on this container: incumbent ~110 ms/game headless; v3 ~420 ms/game with every square
scored (fields are cached per (destination, wind) for the life of a game). Per live bot turn that
is ~5 ms — an order of magnitude under the 50 ms visibility line, and the 400-game ladder stays
practical (~7 minutes for five arms).

## The verdict

Both runs on the shipped configuration, 400 games per row, control-normalised:

```
seed family ×7919 (every layer was accepted or rejected on these):
  1 new vs 3 old (seat 0)   won 37.3%  vs control 21.8%   edge +15.4
  1 new vs 3 old (seat 1)   won 30.0%  vs control 23.8%   edge  +6.2
  2 new vs 2 old            won 64.7%  vs control 50.9%   edge +13.8
  3 new vs 1 old            won 81.3%  vs control 74.7%   edge  +6.6
  mean edge, 2v2 and 3v1: +10.2  — BETTER

seed family ×104729 (held out — development never saw these):
  1 new vs 3 old (seat 0)   won 37.8%  vs control 31.3%   edge  +6.4
  1 new vs 3 old (seat 1)   won 26.5%  vs control 21.1%   edge  +5.4
  2 new vs 2 old            won 69.5%  vs control 61.2%   edge  +8.3
  3 new vs 1 old            won 87.5%  vs control 82.2%   edge  +5.3
  mean edge, 2v2 and 3v1: +6.8  — BETTER
```

Positive on all eight rows across both families. For scale: the incumbent's own shipping margin
over ITS predecessor was +6.7 on the dev family. v3 tables also finish faster — mean voyage
18.2 → 16.5–17.3 rounds — which is the overarching principle showing up in the aggregate: the
goal of every game is to win as quickly as possible.

## The becalming bug (found by Wyatt in live play, 2026-08-10)

Late-game bots sat motionless in open water and passed — sometimes for rounds on end. Measured:
211 motionless open-water passes in 300 games, 120 of them with every needed shelf empty. Two
mechanisms, both in the tour's flat spots:

1. **A fight priced as a fee, not a voyage.** When a needed crate existed only in rivals' holds,
   the tour charged the turns of taking it but never moved the ship — so closing on the holder
   bought nothing while drifting from Tortuga lengthened the sail home, and the arithmetic
   concluded that parking near home and "waiting for the crate to arrive" was optimal (seed
   87109: four consecutive rounds at anchor). It also budgeted a cheap "deal for it" even when
   `composeOffer` would not actually speak one. Fixed: a bare-shelf leg is now the real journey —
   sail to the cheapest holder's intercept (wind-true), ~2 fights at the measured 50%, powder
   spent, and the leg ENDS there so the rest of the voyage is costed from the deck of the fight.
   A deal may undercut it only while an offer is actually composable.
2. **Anchoring on ties.** Whole-turn tours tie across flat spots by construction, and both the
   hail's parking square and the final selection could resolve a tie to "stay put" — a refused
   hail from a stationary ship is a whole turn shown to the table as nothing. Fixed by Wyatt's
   ruling, encoded as the tie-breaker of last resort: **never anchor.** When the winning plan is
   plain sailing to the square already underfoot, the indifference resolves to the best candidate
   that moves. Exceptions are honest ones: acting on this square, arriving at the bakery, or
   being physically boxed in.

After the fix: **5 motionless passes in 300 games (0.03% of turns), every one `reach 0, boxed
in` — ships with no legal square to move to — and zero in the fight-is-the-only-way scenario.**

Ladder after the change, 400 games per row, mean edge (2v2+3v1): **+10.3** on the dev family
(×7919), **+2.6** on the held-out family (×104729), **+9.4** on a third fresh family (×224737)
run because that middle number sagged — three families, twelve rows, every row positive. The
+2.6 reads as the low draw of the noise, not a cost of the fix.

## The trade winds (added 2026-08-13, on /4)

Wyatt, pushing back on a conclusion this project had reached twice and got wrong both times:

> *"The rim often seems to help me, when i use it intelligently as part of my route planning — i
> regularly use it to plan my route along the board and opportunistically sail against the wind.
> Am i doing something wrong, or are your bots not optimizing their routes effectively?"*

He was right and the bots were not. §4 above says the fields treat the rim as "never a staging
post", which is the rule — but the brain had no way to express **the rim as a DESTINATION**, so a
ride was not merely under-valued, it was unrepresentable. Bots only ever touched the current by
`rimEscape()`, the boxed-in last resort.

The fix is one sentence of movement model: **touching the current is a legal one-turn move whose
ARRIVAL is that quadrant's head.** Three places had to learn it and nothing else changed:

- `windReach3` now mirrors `sailStates` exactly — the rim is a square you may FINISH on, never one
  you may sail through.
- `turnsFieldTo3` records a distance only for squares a ship can BE on (open water, plus the four
  heads), and flows one further turn out from a head to every square that can touch that quadrant's
  channel. That is the ride, priced as the one turn it is.
- `planTurnV3` offers each reachable head as an ordinary candidate, remembering the entry square as
  `plan.via`; `sailPlan(p,plan)` became the single movement entry point both turn paths call.

No new constant, no rule, nothing rescaled — the existing P(win) objective weighs a ride against
every other route by the same arithmetic, which is the whole reason it could be added this cheaply.

**Proved before the ladder was believed.** `turnsFieldTo3` was rebuilt FORWARDS, per source, with
its own hand-written one-turn reach — nothing shared with the engine's reverse flood but the board
and the rules — and compared on every water square: **8,316 square/wind/destination comparisons, 0
disagreements.** Red-proofed by disabling the sweep in the forward copy only: **1,222
disagreements, every one the engine a turn faster.** So the check can fail, and the ride genuinely
shortens ~15% of routes by a full turn.

**Ladder** (`scripts/bot_ladder4.js`, 400 games per row, same seeds either side of the edit — the
control arm is `planTurnClassic`, which touches none of the v3-only machinery and so cannot move):

| family | before | after |
|---|---|---|
| ×7919 (dev) | +9.8 | **+12.4** |
| ×104729 (held out) | +8.8 | **+11.3** |

Both controls came back byte-identical (98/87/110/105 and 124/79/96/101), which is what makes the
delta attributable. Seven of the eight rows improved; the eighth (1-vs-3 seat 0 on ×104729) landed
on the same win count, and its mean voyage still moved 17.1 → 16.9 rounds — the games differed, the
scoreboard happened to tie. Voyages shortened on every other row too (16.4 → 15.8, 16.6 → 16.0,
16.5 → 15.3): the overarching principle again, showing up as the game ending sooner.

## Determinism and information

The whole evaluation path reads state and returns: no `this.r()` draws, no events, mutate-and-
restore hypotheses only (`turnsToWin3If` / `rivalEta3If` follow `turnsToWinIf`'s contract). A bot
reads its own recipe and nobody else's — rival ETAs are built from position, purse, distinct
crates carried, live stock and prices, all public at the table. Both turn paths run this brain
through the single entry point `planTurn(p)`, which `Game.takeTurn` (headless) and
`src/ui/flow.js botTurn` (animated) already share — the two-paths trap from the brief's §2 cannot
split them.
