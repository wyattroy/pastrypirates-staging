# Bot design principles

> # The goal of every game is to win as quickly as possible.
>
> — Wyatt, 2026-08-09

That is the overarching principle, and it is not specific to Pastry Pirates. It is what a game *is*.
Every rule below is a consequence of it; nothing below may contradict it.

It is written down because it was missed. Not disputed — **missed**, which is worse. A whole day of
bot work optimised the machinery of decision-making (are the options compared fairly? are the odds
honest? is the turn decided before the ship moves?) without once asking what the machinery was *for*.
The result was a bot that made beautifully-reasoned decisions in service of nothing, improved every
statistic anyone thought to measure, and lost.

**The failure mode has a name and it is worth recognising early: optimising the process instead of
the goal.** The tell is a scoreboard full of improved intermediate metrics and no improvement in
wins. If you cannot say which number a change is supposed to move *at the scoreboard*, the change is
not ready.

**Canonical.** `v2bakeoff/src/engine/index.js` points here rather than restating it — a copy always
rots, a pointer cannot.

Written 2026-08-09 at Wyatt's request. Every principle below was earned by something that actually
broke, and each carries the measurement that earned it, so a later reader can tell a principle from
a taste. Numbers are per 300 seeded bake-off games unless stated.

---

## 0. THE OBJECTIVE — the overarching principle, made computable

> **A bot acts to minimise the expected number of turns until *it* wins.**

This is just "win as quickly as possible" written so a machine can evaluate it. Wyatt, 2026-08-09:

> *"the bots should be acting according to valuing, completing the game in as few turns as possible.
> When they evaluate all of the ways that they could spend their turn right now, they should act
> towards the path that will end the game the most quickly with the highest probability, with them
> as the winner."*

This is the whole design. There is one number —

```
E[turns until I bake a full recipe at Tortuga]
```

— and every action a bot can take is worth exactly **how much it lowers that number**, plus **how
much it raises the same number for whoever would otherwise get there first**.

```
value(action) = (myTurnsToWin before − after)
              + (leaderTurnsToWin after − before)   … counted only while the leader beats me
              − 1                                    … the turn itself, paid by every option alike
```

### Why this had to be written down

The first version of these principles said *"one currency: turns saved"* and never said **saved
toward what**. That single omission is the root cause of every failure logged below. Without an
objective, "turns saved" degenerates into a price list of constants:

| what the bot was told | what it should have asked |
|---|---|
| a crate is worth `crateTurns` = 2.5 | how much shorter is my route with it? *(its last crate is worth a voyage; its first is worth little)* |
| a dock flip is worth `coinTurns(3.5)` = 0.875, forever | do I still need money for anything on my route? |
| denying a rival is worth `denialTurns` = 5 | does it change **who arrives first**? |
| positioning is worth `ceil(distance/4)` | how many turns did I actually take off my route? |

Every one of those is a constant standing in for a quantity that varies by an order of magnitude
across a voyage. A bot optimising the price list looks busy and plays badly — which is precisely
what was measured (see *The whole-turn planner*, below).

### It is already computable

`buildRoute(p)` returns `{route, total}` — the cheapest remaining path through every ingredient a
captain still needs, in turns, re-planned every turn against the live board. `total`, plus the sail
home and the expected bake attempts, **is** `myTurnsToWin`. The engine has computed the objective
all along and never used it as the objective.

The same function, run over a rival's *visible* hold, gives `leaderTurnsToWin` — no recipe card
required, because what is left to buy is bounded by what they visibly lack.

---

## The principles that follow from it

### 1. A turn is one decision, made whole, before anything moves

Movement and action are not two choices — they are one plan, *(where I end up, what I do there)*,
scored as a unit against the objective.

> Wyatt: *"You need to run all of the calculations that decide the most valuable action for a turn
> RIGHT AT THE BEGINNING OF THE TURN — not after moving. Thats what a human does."*

Every bug found on 2026-08-09 violated this: `chooseTarget` picks a square blind to what the square
is *for*, and `chooseAction` then picks an action unable to change the square.

### 2. No priority orders, ever

An ordering is a decision made in advance, blind to the board. "Dock before fight" is exactly why a
bot that had deliberately sailed into a strike position docked instead. Rank nothing; evaluate
everything against principle 0.

### 3. Ask the exact question the action will ask

Never commit under one test and perform under another. Three costumes, one disease:

- a trade committed to and never spoken — **4,884 dead turns** in 300 games
- a strike square sailed to and then declined
- a dock preempting the fight the bot had crossed the map for

### 4. Probabilities, not proxies — and never charge the same risk twice

Where odds are knowable, use them and **delete** the constant that stood in for them. Measured over
60,000 battles: firing with the wind takes the crate **49.6%** of the time, upwind or crosswind
**24.9%**, for the same 2🌕. Carrying `fightLossRisk` *alongside* the real odds collapsed fights from
2.35 a game to 0.60.

### 5. Only what a player can see

Holds, positions, coins, stock, the wind, and the whole history of what everyone did. Never a recipe
card. Full-voyage memory is fair; mind-reading is not.

Worth knowing before leaning on inference: **every ingredient appears in 15 of the 21 recipes (71%),
and any two recipes share 3.5 of 5 — never fewer than 3.** So "do they need it?" is almost always
"yes" and carries little information. The discriminating question is *scarcity*: what can they not
easily get elsewhere.

### 6. Plan the whole voyage every turn; commit only to this turn

Re-plan from scratch so nothing chases a goal that has moved. A multi-turn approach may aim only at
something that does not drift — where a captain is **going** — never at something that does, like
their square plus the wind, which oscillates forever.

> Wyatt: *"We dont want bots to get into an infinite loop trying to get upwind of a player, as their
> position changes. They should navigate upwind within the same turn they try to attack."*

### 7. A turn with nothing worth doing is a bug, not an outcome

Measured: **1,906 turns — 8.4% of all bot turns — spent motionless in open water.** That is an absent
plan, not caution.

### 8. Personality tilts values; it never overrides them

A pirate discounts the cost of a fight. It never takes a fight that lengthens its own voyage.

### 9. Prove it against the previous bot, not against a proxy

`scripts/bot_ladder.js` runs both brains at one table on the same seeds and asks only who wins.

**Read it as a detector, not a designer.** It can tell you a change is worse; it cannot tell you why,
and it will not hand you the objective. That is what principle 0 is for.

### 10. A bot prices by asking what IT would accept — never by a constant

> Wyatt, 2026-08-14: *"We also dont want constants to drive the hail behavior, because the game is
> always shifting!! The bot should calculate an offer that it would accept, and offer something
> close to that."*

This is principle 0 pointed at negotiation, and it is the general form of *"nothing should be
hardcoded"*. Any fixed price, margin or threshold in a trade is a **price list standing in for a
quantity that moves by an order of magnitude across a voyage** — a bot's first crate and its last
crate are not the same trade, and no constant can be right for both.

The bot always has the honest number to hand, because it is the same one it uses to plan:
`acquireTurns(want)` — what fetching this crate myself would cost — **is** the price at which it
would be indifferent to selling it. So "what would I accept?" needs no new machinery, and the
answer is recomputed from the live board every turn.

Done properly it *deletes* code rather than adding it. The whole "is this worth saying out loud"
test in `composeOffer` is now one comparison with no threshold in it:

```js
bid.coins >= bid.need      // bid.coins is already min(their price, my price, my purse)
```

True only when what the table wants sits inside both what I would accept and what I can pay.
If it does not, the hail buys nothing but a refusal I will have to remember — so stay quiet and go
and fetch the crate.

**Corollary, and it is where two attempts went wrong: symmetry is not mind-reading.** Modelling a
rival by asking what *you* would accept is fair and uses only your own recipe. Calling
`respondToOffer`/`crateCostTurns`/`needs(q)` on the rival is not — every one reads `q.recipe`
(principle 5). `estimateCrateCost()` exists for exactly this and says so: the guess a human makes
across the table. A bid built on it can be **wrong**, and should be. Being wrong is what the
counter-offer is for.

### THE HAIL-VOLUME INVARIANT — a hail interrupts EVERYONE, so its count is a player-facing cost

> The full trade system — the rule, the data shapes, all four of its invariants, where each decision
> lives and what has already been tried and failed — is **`docs/TRADE-SYSTEM.md`**. Read it before
> touching anything that trades. What follows is the bots-side half.

> Wyatt: *"We dont want the table continuously spammed with shitty trade requests, it's exhausting
> for players to swat them away."*

**Rule 4: a trade is announced to the whole Sugar Seas, not put to one captain.** So a hail is not
one opponent being asked — it is every opponent, the human included, being interrupted. **Hail
count is exactly the number of things a player has to swat away**, and it is a guarded number:
`03a683c` held it at **~2.8 a game deliberately** while fixing something else.

Any trade change must report hails per game beside whatever it improved. A change that makes offers
better by making **more** of them has failed, however good the offers are.

Current, after 2026-08-14: **0.75 hails a game, 23.0% of them struck** (was 3.25 at 5.7%).

---

## What was tried and failed, with numbers

Kept because each failure is cheaper to read than to repeat.

### The whole-turn planner (satisfied principles 1–3, still lost)

Every reachable square crossed with every action available from it, scored on one scale — but that
scale was the price list, not the objective. Behaviour improved on every proxy:

| | before | planner |
|---|---|---|
| trades struck | 26 | **140** |
| fired with the wind | 25.5% | **88.6%** |
| blank turns | 8.8% | **6.8%** |
| mean voyage | 18.0 days | 25.5 days |

The ladder then showed it winning **below** the incumbent's share in three of four configurations.
A worse player that looked like a better one. **Bots that do more per turn are not bots that win** —
and the reason is that nothing it did was measured against turns-to-victory.

### Two tuning traps found inside it, both worth keeping

- **Progress must be fractional.** `sailTurns` is `ceil(distance / 4)`, so sailing three squares
  closer scores **zero** while any local action scores 2–5. Priced that way a bot never makes way:
  mean voyage **56.6 days**, 12 games at the round cap.
- **Income must decay.** A flat `coinTurns(3.5)` never stops being attractive, so rich bots grind
  berths — **54.9% of all turns** docking, voyage 38.5 days. Under principle 0 this needs no special
  rule: money that buys nothing on the remaining route shortens no voyage and is therefore worth
  nothing.

### De-hardcoding a constant WITHOUT rescaling what reads it (-21.2 on the ladder)

Wyatt, rightly: *"nothing should be hardcoded."* `threatTurns(q)` was `cratesShort x 2.5 + distance
home` — a constant standing in for "how long to land one more crate", which on this board varies
about sixfold. It was replaced with a real optimistic voyage for the rival: nearest islands supplying
anything they do not hold, real water legs, real wind, home, bake. Strictly more truthful, built only
from public information, and the estimates went from a flat 10-12 turns to a realistic 15-18.

**It cost 21 points on the ladder**, because of what read it:

```
threatUrgency(q) = (threatHorizon - threatTurns(q)) / threatHorizon      // threatHorizon = 8
```

`threatHorizon: 8` was calibrated when `threatTurns` ranged over roughly 5-15. Against a number that
now ranges over 10-25, **urgency is zero for every captain, all game** — so denial raids and leader-
hunting switched off entirely, silently, without a line of that code changing.

**The rule: a constant is never alone.** Replacing one with a computed quantity changes its RANGE,
and every threshold, horizon and divisor calibrated against the old range is now wrong. Before
swapping a constant for a calculation, list what reads it and what scale those readers assume — then
rescale them in the same change, or the improvement lands as a regression somewhere you were not
looking.

Same run, same patch, also changed: the tour now models rivals emptying the shelves before you
arrive (price is `6 - stock`, so a crate taken before you get there costs a coin and the last one
costs the island). That part is sound and worth rebuilding on top of a rescaled horizon; it is not
what the ladder was punishing. Saved as a patch rather than kept, because a change that is 60% right
and untested at the seams is not a starting point, it is a trap.

### An urgency-scaled hunt leash (inert, deleted)

Ablated over 300 games: **46 → 46** wins, **1.68 → 1.69** fights a game. Aiming at a strike square
already collapses the measured sail distance, so the leash was never the binding constraint. A
constant that does nothing reads as if it does something.

### Raising the bid without re-tightening the hail test (2026-08-14, two goes to get right)

Wyatt: *"The bots offer trades that are far too low to be enticing, early on… in fact i think the
logic is already in there."* He was right about where it lived — `respondToOffer` had priced crates
properly all along, while `composeOffer` bid a hardcoded 2 coins with a crate, 5 alone.

Deriving the bid fixed the offers and **broke the thing nobody was watching**:

| | baseline | derive the bid | + Wyatt's rule |
|---|---|---|---|
| **hails per game** | 3.25 | **4.10** | **0.75** |
| trades struck | 28 | 41 | 26 |
| offers → trade | 5.7% | 6.3% | **23.0%** |
| mean coins offered | 4.35 | 6.28 | **7.81** |
| — early (rounds 1–5) | 4.23 | 4.88 | **7.46** |
| mean voyage | 15.4 | 15.4 | 15.4 |

**Why the middle column is a regression even though every column I was looking at improved.** The
old gate compared the offer's worth against the asking price. Bid *to* the asking price and that
comparison can never fail again — it went vacuous, exactly the −21.2 shape above: a threshold left
calibrated to a quantity that changed underneath it. **When you replace a constant with a
calculation, every test that reads it is now wrong, including the ones that merely stop being
able to fire.** A gate that cannot fail is worse than a deleted one, because it still reads as
protection.

**And the first repair was itself a constant** — a fixed margin by which buying had to beat
fetching. That is the failure at the top of this file wearing a third costume. Principle 10 is what
finally worked, and it is *smaller* than either attempt.

Two things checked afterwards rather than assumed, both of which could have made this a hidden
regression:

- **Personality survived.** Dropping the asker-side `dealBias` might have flattened the archetypes.
  It did not: over 200 voyages the trader takes **20 of 32** holder-side acceptances, five times
  anyone else; the rusher hails most, the pirate least. The tilt lives in the *responder's* bias —
  the single application `232a020` established when it caught that bias being applied twice and
  "overriding rather than tilting" (principle 8). Adding an asker-side margin back would have
  rebuilt that bug.
- **The scoreboard did not move** — 15.4 rounds throughout. Trades bought with turns are not a win.

---

## Two measurement traps that cost this session more than the code did

**A falsy zero.** `Game.play()` returns a **seat index**, so `if (!winner)` counts every seat-0 win
as an unfinished voyage. That invented a crisis — *"46 of 300 games never finish"* — which survived
three measurement runs and drove two rewrites of the fight pricing aimed at a regression that never
existed. Compare `w == null`. The contradiction was on screen the whole time: 46 games supposedly at
a 150-round cap, printed beside a mean of 17.5 rounds.

**A yardstick that was itself an assumption.** The ladder first judged each seat against a flat 25%.
The archetypes are not equally strong — one brain across the table wins **44/50/61/45** by seat — so
with `new === old` it reported *"+2.5 points, BETTER"*. Every arm is now compared against a control
run of the same seats on the incumbent brain. Red-proofed both ways: identical brains give **+0.0**
on every row; a deliberately brain-dead variant gives **−7.7** and the WORSE verdict.

Full accounts of both live in `docs/HARD-WON-LESSONS.md`.
