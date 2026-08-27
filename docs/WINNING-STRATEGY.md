# How to win Pastry Pirates, as quickly as possible

A game-theoretic account of optimal play, written 2026-08-09 at Wyatt's request. Companion to
`docs/BOT-DESIGN-PRINCIPLES.md`, which says how a bot should *decide*; this says what the right
decision actually **is**.

---

## The game, stripped to its skeleton

| | |
|---|---|
| **Objective** | Be the first captain to reach Tortuga holding all five recipe ingredients and bake them. |
| **Board** | 15×15 round sea, 7 islands, Tortuga at the centre. |
| **Movement** | 4 squares a turn — **2 if any part of the leg bites into the wind**. |
| **Wind** | Known this round, and the next round is committed a full round early and is never wrong. |
| **Crates** | 3 per island. Price = `6 − crates left`, so **3🌕, then 4🌕, then 5🌕**. |
| **Docking** | One turn. Flip: heads +5🌕, tails +2🌕 (mean **3.5**). Then you may buy. |
| **Fighting** | 2🌕 of powder. Winner takes **one crate** from the loser. |
| **Recipes** | 5 of the 7 ingredients. Every ingredient appears in 15 of the 21 recipes. |
| **Bake-off** | ~2 turns at the ovens. Tortuga is sanctuary once your ovens are lit. |

### The turn budget — where a voyage actually goes

```
  5 dock turns          (one per crate bought)
+ 12-15 sailing turns   (6 legs: start -> 5 islands -> Tortuga)
+ 2 baking turns
+ 0-3 pure earning turns   <- the entirely avoidable part
= 19-25 turns
```

**Sailing is ~65% of the game.** Nothing else you can do comes close. A strategy that optimises
fighting, or trading, or income, while leaving the route unexamined, is optimising the wrong 35%.

### The money, exactly

Five crates bought **first at each island** cost `3+3+3+3+3 = 15🌕`. Bought **last** they cost
`5×5 = 25🌕`. You start with 3🌕 and each of your five dock turns pays 3.5🌕 on average, so you have
**20.5🌕 without spending a single turn purely to earn.**

> **Buying early is worth roughly three turns.** Not because 15 < 25, but because the 10🌕 difference
> is three extra dock turns you must spend earning it. Price is a clock, not a cost.

---

## The three things that decide the race

### 1. Tour length (dominant)

The five islands plus Tortuga form a 6-node tour. Choosing a good order versus a bad one swings
**4–6 turns** — more than every fight, trade and coin decision in a typical game combined. With only
5 ingredients there are at most `5! = 120` orders: **solve it exactly, every turn.** There is never a
reason to approximate a problem this small.

### 2. Wind (worth up to a turn per leg)

Upwind halves your speed, so a 6-square leg is 2 turns downwind and 3 upwind. You can see one round
ahead and rule 6d promises the forecast is never wrong, which makes this a real two-step lookahead
rather than a gamble:

- Cost **leg one under the wind now**, everything after under the committed forecast.
- Where two tour orders are close, **take the downwind leg now and leave the upwind leg for later** —
  later the wind may have turned, and an upwind leg deferred is often an upwind leg avoided.
- A dogleg can beat a straight line: moving *perpendicular* to the wind at full speed and then along
  it can cost fewer turns than crawling directly into it.

### 3. Contention (worth up to 3 turns, and occasionally the game)

Cargo is public. You can see exactly which ingredients your rivals lack, and any rival lacking an
ingredient needs it with probability **15/21 ≈ 71%**. So:

- **Break tour ties toward the island most rivals still need.** You get the 3🌕 price instead of the
  5🌕 one, and you are not the captain who arrives to find the shelf empty.
- An island whose last crate is about to go is worth reordering the whole tour for. An empty shelf
  does not cost you 5🌕; it costs you a *deal or a fight*, which is several turns and a coin flip.

---

## The four things that are traps

### Fighting is negative-sum, and mostly benefits the two captains not involved

A fight costs the attacker a turn and 2🌕, and costs the loser a crate. Turns are destroyed; only one
crate moves. In a four-hand race, **the two captains standing off to one side gain most of the value
of any fight they did not pay for.**

Measured over 60,000 battles on this engine:

| firing | you take a crate | they flee | **they take one of yours** |
|---|---|---|---|
| **with the wind** | 49.6% | 25.4% | 25.0% |
| **upwind or crosswind** | 24.9% | 0% | **75.1%** |

> **Never attack upwind while holding cargo.** It is a three-in-four chance of handing a rival one of
> your own crates, for 2🌕 and a turn. There is no version of this that is good.

Attack only when **all** of these hold:

1. You can reach the square `target − wind` **this turn** — the one cell that gives you the gauge.
2. The prize is on your own list, or the target is genuinely about to win.
3. What you would lose is small: early, when your hold is thin, a fight is nearly free; late, with
   four crates aboard, a 25% chance of losing one is a disaster.

### Denial is a public good — never pay full price for it

Slowing the leader helps **everyone** behind them, and only the raider pays. At a four-hand table you
bank about a third of what you bought. And it only counts at all if it changes *who arrives first*:
pushing a leader from 12 turns out to 14.5 is worth nothing to a captain 23 turns out, who should be
racing, not policing.

**The one raid that is always worth it** is the endgame intercept: a rival with four visible crates
running for Tortuga is about three turns from winning, and Tortuga is sanctuary. The run home is the
only window there will ever be, and at that moment the denial is not a public good — it is the whole
game.

### Trading is nearly dead, and buying leverage is a trap

Any two recipes share at least 3 of 5 ingredients, so "do they need it?" is almost always yes and
carries no information. An offer only lands when you hold a **spare** — something outside your own
recipe that the holder visibly lacks.

But buying a spare costs a **whole dock turn**, and the leverage it buys is worth about a turn. That
is break-even before the risk that nobody bites. **Do not shop for leverage.** Take a spare only when
it falls into your lap.

### Income is not a goal

You need ~19🌕 and your five dock turns generate ~20.5🌕. Spending a turn purely to earn is
**strictly a lost turn** unless you would otherwise arrive at your next island unable to buy. The
test is exact and worth running every turn:

```
will (purse + expected flip) cover the price when I arrive?   -> sail on
otherwise                                                     -> earn exactly as many turns as needed, no more
```

---

## The strategy, in pseudocode

```
BEST_TURN(me):
    # ---- 1. What is my fastest remaining voyage, from here? ----------------
    #        An exact tour over the <=5 ingredients still needed, in WHOLE turns.
    turnsToWin(me, from, purse):
        best = INFINITY
        for each ordering of the ingredients I still need:      # <= 120
            t = 0 ; at = from ; coins = purse
            for each ingredient in the ordering:
                wind  = (t == 0) ? windNow : forecastWind       # never wrong, one round out
                if island still has stock:
                    t     += legTurns(at, dock[ing], wind)      # real water path, ceil(dist / speed)
                    t     += ceil(max(0, price(ing) - coins) / 3.5)   # earn ONLY what is short
                    t     += 1                                  # the flip that buys it
                    coins  = coins + earned - price(ing)
                    at     = dock[ing]
                else:
                    t += cheapest of { deal for it , take it by force }
            t += legTurns(at, TORTUGA, forecastWind)
            t += BAKE_TURNS                                     # ~2
            best = min(best, t)
        return best                                             # a whole number of turns

    legTurns(a, b, wind):
        d       = waterDistance(a, b)                           # BFS: sails AROUND land, never through
        upwind  = any component of (b - a) points into `wind`
        return ceil(d / (upwind ? 2 : 4))

    # ---- 2. Score every complete turn I could take ------------------------
    #        A turn is ONE plan: (square I end on, what I do there).
    base = turnsToWin(me, myPosition, myPurse)
    candidates = []

    for each square S I can legally finish this turn on:        # includes staying put
        # (a) just sail there
        candidates += { move: S, act: SAIL,
                        value: base - turnsToWin(me, S, myPurse) }

        # (b) work the berth at S, if there is one
        if S is a dock and free:
            earned = 3.5
            buying = (I need this crate) and (myPurse + earned >= price)
            candidates += { move: S, act: DOCK,
                            value: base - turnsToWin(me + crate?, S, myPurse + earned - price?) }

        # (c) fight anyone adjacent to S
        for each rival R adjacent to S, with cargo, not in sanctuary:
            downwind = (R.position - S) == windVector      # the ONE square that gives the gauge
            pWin  = downwind ? 0.50 : 0.25
            pLose = downwind ? 0.25 : 0.75                 # they take one of MINE
            gain  = turnsToWin(me, S, purse-2) - turnsToWin(me + theirCrate, S, purse-2)
            loss  = turnsToWin(me - myWorstCrate, S, purse-2) - turnsToWin(me, S, purse-2)
            deny  = DENIAL(R, base)
            candidates += { move: S, act: ATTACK(R),
                            value: (base - turnsToWin(me, S, purse-2))       # the move itself: certain
                                   + pWin  * (gain + deny)                   # the gamble: not certain
                                   - pLose * loss
                                   - rematchPenalty(R) }

    # (d) hail the table — reaches everyone, so it rides on the best square
    if I can compose an offer somebody could say yes to:
        S = the best-positioned square above
        candidates += { move: S, act: TRADE,
                        value: base - turnsToWin(me + wanted, S, purse - offered) }

    # ---- 3. Take the best. Break ties on ground made. --------------------
    #        Whole turns tie a lot: a dozen squares inside one turn's sailing
    #        leave the voyage exactly as long. Among equals, stand furthest along.
    return argmax(candidates, by value, tie-break by -waterDistance(S, nextDestination))


DENIAL(R, myTurns):
    theirs = 5*CRATE_TURNS - (distinct crates they visibly hold)*CRATE_TURNS
             + legTurns(R.position, TORTUGA, wind)              # public estimate ONLY
    if theirs >= myTurns:  return 0        # they were never beating me; robbing them wins nothing
    closes = min(CRATE_TURNS, myTurns - theirs)                 # only what closes MY deficit
    return closes / (number of captains still in play - 1)      # public good: I bank a fraction
```

### What the pseudocode encodes, in one line each

| line | the strategic claim |
|---|---|
| exact tour over `5!` orders | tour length is ~65% of the game; never approximate it |
| `wind = t==0 ? now : forecast` | the forecast is free information and it is never wrong |
| `ceil(dist / (upwind ? 2 : 4))` | upwind is a real, quantified tax — route around it |
| `earn only what is short` | income is never a goal, only an unblocking |
| `price = 6 - stock` inside the tour | buying early is worth ~3 turns; price is a clock |
| move outside the probability | sailing there is certain; only the crate is a gamble |
| `pLose = 0.75` upwind | never attack upwind holding cargo |
| `deny / (players - 1)` | denial is a public good; you bank a fraction of what you pay for |
| tie-break on ground made | whole turns tie; among equals, be furthest along |

---

## The whole thing in six sentences

1. **Solve your tour exactly, every turn** — five islands and home, at most 120 orders, and it is
   two-thirds of the game.
2. **Cost every leg under the wind that will actually blow**, using the forecast you are given free,
   and defer upwind legs when the tour is otherwise a tie.
3. **Go first to the island the most rivals still need** — you buy at 3🌕 instead of 5🌕, which is
   three turns, and you are not the one who finds the shelf bare.
4. **Never spend a turn to earn** unless you would otherwise arrive unable to buy.
5. **Fight only from the windward square, only for a crate on your list, and only while your hold is
   thin** — upwind you lose one of yours three times in four.
6. **Cross the map for exactly one thing**: the captain with four crates running for Tortuga, because
   the run home is the only window and sanctuary closes it forever.
