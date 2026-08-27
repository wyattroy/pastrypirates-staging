# The trade system

**Canonical.** How trading works in Pastry Pirates — the rule, the data shapes, the four invariants
that constrain every change, where each decision lives, and what has already been tried and thrown
away. Written 2026-08-14, after a session that broke two of the invariants below in a single change
and had to be corrected twice by Wyatt.

Sibling to `docs/BOT-DESIGN-PRINCIPLES.md` (what bots are FOR), `docs/HARD-WON-LESSONS.md` (what to
distrust) and `docs/DRIVING-THE-GAME.md` (how to drive it in a browser).

> **READ THIS BEFORE TOUCHING ANYTHING THAT TRADES.** Not because it is long — it is not — but
> because the trade system's expensive mistakes are all *invisible from the code you are editing*.
> Every one of them looked like a local improvement and broke something a previous session had
> fought for, three files away or two milestones ago.

---

## 0. THE FOUR INVARIANTS

Break one of these and the change is wrong however good it looks. Each is a ruling, with the
sentence that earned it.

### I1 — A hail interrupts the WHOLE TABLE, so its COUNT is a player-facing cost

> Wyatt: *"We dont want the table continuously spammed with shitty trade requests, it's exhausting
> for players to swat them away."*

Rule 4 is a broadcast. There is no target player. So one hail is not one opponent being asked — it
is **every** opponent, the human included, being interrupted. **Hails per game is therefore exactly
the number of things a player has to swat away**, and it is a guarded number: `03a683c` held it at
~2.8 a game *deliberately* while fixing something else.

`HARD-WON-LESSONS` §5 states the mechanism in four words — **"the announcement IS the spam"**.
Filtering *responses* after the hail barely moved anything (706 → 543); moving the check *before*
the hail took it to 375.

**Any change to trading reports hails per game beside whatever else it improved.** A change that
improves offers by making *more* of them has failed.

**The invariant is "no unearned noise", not "as few hails as possible".** Wyatt, 2026-08-14: *"We
do want more hails.. especially now that players can counter-offer robustly."* A hail a player can
counter into a deal they wanted is not spam — it is the mechanic working. What the number guards
against is hails that *cannot go anywhere*, which is why the hail test asks whether any answer
exists that the asker would take (§3.2). The working figure is **~2–3 a game**; it was ~2.8 when
last set deliberately.

**Do not be reassured by "identical re-hails stayed flat."** A re-offer at a better price is still
an announcement to swat away. That exact reasoning was used to defend a 3.25 → 4.10 regression in
this very system; see §7.

### I2 — Only what a player can see

`BOT-DESIGN-PRINCIPLES` §5. A bot may read holds, positions, coins, stock, the wind, and the whole
history of what everyone did. **Never a rival's recipe card.**

This one is subtle in trading because the code has *two* pricing functions that look
interchangeable and are not:

| Function | Reads | Legitimate for |
|---|---|---|
| `crateCostTurns(q, ing, asker)` | **`q.recipe`** | `q` deciding about `q`'s OWN cargo |
| `estimateCrateCost(q, ing)` | only public evidence | anyone guessing at `q`'s price |

**A bot pricing its own answer may use the first. A bot deciding what to OFFER must use the
second.** `estimateCrateCost` says so in its own comment: *the guess a human makes across the
table*. A bid built on it can be wrong, and should be — being wrong is what the counter-offer is
for.

The same distinction applies to `needs(q)`: fine when `q` is the one deciding, mind-reading when
anyone else consults it.

### I3 — Bots and humans have exactly the same affordances

> Wyatt, on humans not being able to counter with a crate: *"rather than remove the bot's ability,
> we want to add it to the human ability."*

Parity can be restored by levelling the human **up**, not only by taking capability away from bots.
And it runs both ways: when the human gained crate counters (playtest 21 item 7), bots gained them
in the same change, because a bot that can only answer *"+2 coins"* would then be the one with the
poorer vocabulary.

Before shipping any new trade move, ask: **can the other kind of captain do this too?**

### I4 — Nothing that prices a trade may be a constant

> Wyatt: *"We also dont want constants to drive the hail behavior, because the game is always
> shifting!! The bot should calculate an offer that it would accept, and offer something close to
> that."*

A fixed price, margin, cap or threshold is a price list standing in for a quantity that moves by an
order of magnitude across a voyage. A first crate and a last crate are not the same trade.

Done properly this **deletes** code. The whole "is this worth saying out loud" test is one
comparison with no threshold in it (§3.2).

Corollary, which has now cost this project twice: **replacing a constant with a calculation breaks
every test that reads it** — and can make a gate *vacuous* rather than merely wrong, which still
reads as protection. List what reads a quantity, **gates included**, before changing how it is
produced.

---

## 1. THE RULE (`4/RULES-V2.md` §4)

- You announce **what you want** and **what you offer** to the whole table. No target player.
- Every captain's cargo is public, so any crate may be asked for — crates **nobody holds are greyed
  out** in the picker.
- Every captain holding it responds: **accept**, **deny**, or **counter-offer**.
- You see **all responses together**, then accept one or walk away. **One round only** — no
  re-countering a counter.
- **No harbor-tax bonus.** A trade is just the exchange.

A trade is one captain's turn ACTION. The responders do not spend a turn answering.

---

## 2. THE DATA SHAPES

```js
offer    = { want, giveIng, giveCoins }        // giveIng may be null (coins only)
response = { q, kind, why?, askFor?, askIng? } // kind: "accept" | "deny" | "counter"
```

`why` on a deny is one of `"nohave"`, `"blocking"` (a rival on the brink — refused at any price),
`"toodear"`, `"chose"` (a human said no).

**A counter has TWO shapes and they settle differently.** This is the fork most likely to grow a
family of bugs, so exactly one function resolves it:

```js
{ askFor: n }             // ADDITIVE — n more coins on top of what was offered
{ askIng: i, askFor: n }  // REPLACING — "keep yer coin, I want yer milk". Clears the give side.
```

**`Game.counterTerms(offer, response)` is the only place that knows.** It returns a complete offer
object ready for `settleTrade`, so the label a captain reads and the trade that settles derive from
the same call and cannot drift. `want` never changes — a counter haggles over the price, never over
which crate is being sold.

---

## 3. THE PIPELINE

### 3.1 Who proposes — `botOpenOffer` → `composeOffer`

`botOpenOffer(p)` picks WHAT to ask for: of the crates `p` still needs and somebody holds, the one
**hardest to get any other way** (`acquireTurns`, descending), skipping any crate `p` handed over
within the last 3 rounds — the *seller's remorse* rule, from Wyatt watching a bot sell milk and
immediately try to buy it back.

`composeOffer(p, want)` then builds the offer, in this order, and **the order is load-bearing**:

1. pick `giveIng` — the cheapest spare `p` owns, preferring one the holders are *likely to want*;
2. **bid provisionally** (`openingBid`) — needed to ask who is still worth asking;
3. filter the audience (`worthReAsking`);
4. **re-bid against only that audience.**

Step 4 exists because `openingBid` takes the **minimum** price across the captains it is handed —
one yes is all a hail needs — so handing it every holder lets a never-asked captain set a cheap
price and silently discards everything learned from the captains who already refused.

### 3.2 What to bid — `openingBid`, and the hail test

```
need   = min over live holders of:  estimateCrateCost(q, want) − (what our crate is worth to them)
         ...raised to just above any price this captain already refused
coins  = min(need, what the crate is worth to ME, my purse − powder reserve)
```

- **`estimateCrateCost`, never `crateCostTurns`** — invariant I2.
- **Refusals raise the price.** A captain who turned down 5🌕 has said in public that their price is
  above 5. Without this the bid is re-derived from unchanged evidence every time and the only thing
  that moves it is the bot's own growing purse — it gets richer, bids a little more, clears
  `worthReAsking`, and hails again.
- **The ceiling is `acquireTurns(p, want)`** — what fetching the crate myself would cost, which is
  precisely the price at which I would be indifferent to selling it. That IS *"an offer I would
  accept"* (I4), computed from the live board and never written down as a number.

Which collapses the whole *should I speak at all* test to one comparison:

```js
worthHailing(bid)  ⇔  bid.coins >= bid.need
```

True only when what the table wants sits inside **both** what I would accept **and** what I can pay.
If it does not, the hail buys nothing but a refusal I then have to remember — so stay quiet and go
and fetch the crate.

### 3.3 Who answers — `respondToOffer`

```
cost  = crateCostTurns(q, want, asker)     // what parting with it costs ME (may read q.recipe)
value = offerValueTurns(q, offer)          // what I am being handed, in turns
accept  ⇔  value × dealBias >= cost
```

Then, in order:

1. **Blocking deny** — a rival whose *visible* progress is one crate from a full recipe is refused
   outright, at any price, if they likely need this crate. Public evidence only.
2. **Crate counter** — the asker's hold is public, so pick the crate of theirs worth most to *me*
   and ask for that instead, when it covers the gap. Preferred over coin because a crate a bot needs
   is worth whole turns of sailing while coins are worth a fraction of one.
3. **Coin counter** — the shortfall converted back out of turns.
4. **`toodear`** — deny when even the coin price is beyond the asker's purse.

### 3.4 Settlement — `settleTrade`

Validates **both legs before either mutates**, so a trade is atomic: a crate no longer held, or
coins no longer there, routes to the decline path rather than half-completing. Also stamps
`gaveAway` on both sides (seller's remorse) and calls `noteDemand` — the trade itself is public
evidence, and is how bots learn each other's recipes without ever seeing one.

---

## 4. THE HUMAN FLOW (`src/ui/flow.js`)

**Building an offer** — `humanTrade(p)`, a three-step machine where Back always steps *back*:

```
what do ye WANT (every crate; ones nobody holds greyed with a reason)
  → what will ye GIVE (yer hold, or coins only)
    → how many coins (SLIDER)
```

**Answering one** — Accept / *Ask for summat else* / Deny.

**Choosing among the answers** — the asker sees every response at once. **The ask must state each
captain's TERMS, one line per captain, before anything is tappable.** A counter can *replace* what
ye hand over, so a prompt that names the captain without the price turns a deliberate choice into a
forfeit — which is exactly what shipped on 2026-08-14 and cost Wyatt a crate he never agreed to
give:

> *"the counteroffer isnt displayed at all!!! When i clicked 'dough hook', i suddenly lost my
> wheat! The narration box must say what each player is offering you."*

The cause was one word: the option carried `short: "💰 Crustbeard"`, and the radial bloom renders
the **short** form when one exists. **`short` means SHORTER, NOT SILENT** — a compact form may drop
words, never the price. The circles now carry the crate icon and the coins as well as the name.

**Countering** — `counterOffer(q, p, offer)`. Fast path first — the common counter should never
cost extra taps, and on a touch screen every extra step is paid for twice:

```
what of THEIRS will ye have instead (their hold, tappable — cargo is public)
  → how much coin on top (SLIDER, optional; a crate counter may take none)
```

The coins from the original offer are **cleared**: *"instead"* means instead, and no money rides
along invisibly from an offer that was just rejected.

### The two UI rules this flow must keep

- **THE ARC IS FOR ACTIONS ONLY.** Wyatt: *"Keep the arc logic consistent by having all the buttons
  that are in the ark actions. Move the plus minus coins out of the arc instead and style those
  differently."* A quantity is a slider under the pill; every circle in the ring commits something.
  This is why tapping "Ask it!" sent a trade he did not want — it looked exactly like the ±1 button
  he had just been pressing repeatedly.
- **Top to bottom.** Back → message → **slider** → buttons → helper text, revealed in that order.
  A control that edits the message must not arrive before the message.

- **THE SLIDER'S NUMBER IS A DECISION, so it is written to the decision log.** `ask()` records which
  *button* was pressed; the slider's value lives in a `ref` the button knows nothing about. Both
  quantity controls therefore return through `logQuantity()` (`src/ui/flow.js`), which records the
  number live and replays the recorded one — the same seam `pickCell()` and `bakeoffPrompt()` use.
  Measured before the fix: a captain dragged the slider to 6 and the log gained exactly `[0]`, so a
  refresh replayed the trade at 1 coin and every decision after it landed on the wrong prompt. Wyatt
  saw *"the game was simply reset and stalled and the captains log was empty."* Gated by
  `4/scripts/dlog_quantity_check.js`; the failure and its lessons are in `HARD-WON-LESSONS.md` §5.

**That exception is CLOSED (05-01 Task 3, MP-08, D-55).** This paragraph used to record a named
hole: the slider reached the local prompt path only, a genuinely remote seat fell back to a ± coin
stepper, and it said *"close this if /4 ever ships online multiplayer."* /4 is shipping online
multiplayer. **`coinStepper` no longer exists in the tree.** Every seat — solo, pass-and-play, host,
guest — drags the same bar, built by `sliderWrapHTML` and wired by `wireSlider` (`src/ui/util.js`),
named directly by `localAsk` and by `watchPrompt`'s ask branch and gated as shared by
`scripts/host_guest_parity_check.js` assertion 6.

Wyatt, 2026-08-23: *"guest should OBVIOUSLY get the real coin slider, and you already know why —
guests and hosts are given the same experience."* It was never a decision; rule 23 had already
settled it and the code comment was an admission, not a ruling.

**What the wire carries:** `min`, `max`, `start` and `aria` ride across as they are; `fmt` is a
closure over live game state, so it is pre-rendered on the host into `texts` — one short string per
stop, because the pill re-stating the whole deal as ye drag is the reason the number is never read in
isolation. `ref` does not cross: the guest keeps its own, the chosen number comes home beside the
button index as `{i,n}`, and `ask()` lands it in the host's `ref` **before** `resolveOpt`. So
`coinSlider`'s single `logQuantity()` call records a remote drag exactly as it records a local one.

**One control means one record, which is a criterion-4 win arriving through criterion 2.** Measured
in a real crew room, 2026-08-23, one guest countering with a crate plus 8 coins:

| | ± stepper (before) | slider (after) |
|---|---|---|
| prompt round trips | **11** | **3** |
| decision-log entries | **+12** | **+4** |
| wall clock, responder held at 3s | **61.2s** | **24.9s** |
| longest unbroken *"…is deciding…"* on the asker's screen | **52.6s** | **16.2s** |

For the first time **the log's LENGTH does not depend on how the trade was routed, or on how many
coins were asked for** — it was N+2 entries on the stepper and is 2 either way now.

---

## 5. THE MEMORY — why a bot stops asking

Deliberately **not** a cooldown. Wyatt: *"write logic (not gates) to stop spam."* A timer silences a
bot with a genuinely better offer and then lets the identical hopeless one through the moment it
lapses. The honest question is *has anything changed that could change their answer?*

`worthReAsking(p, q, want, offer)` re-asks only when:

1. the offer is **materially better** (`worth >= memo.worth × 1.2 + 0.15`), or
2. we now hold something they **visibly want**, or
3. their hold changed — they picked up a spare, or lost ground.

Deliberately absent: **elapsed rounds.** A bot with nothing new to say stays quiet all game.

The other brake is in `openingBid`: a refusal *raises the price* for that pair, so a bot goes quiet
because the deal stopped being worth it — not because a counter told it to shut up.

---

## 6. MEASURED BEHAVIOUR

**Recompute rather than trust these** — `node 4/scripts/trade_offer_measure.js 150`. Figures below
are 2026-08-14, 150 seeded voyages, seats `pirate/trader/balanced/rusher` (the archetypes are *not*
equally strong, so two runs are only comparable at identical seating).

| | before item 4 | after item 4 | + counters | **+ reach (current)** |
|---|---|---|---|---|
| **hails per game** | 3.25 | 0.75 | 0.78 | **2.63** |
| trades struck | 28 | 26 | 50 | **179** |
| offers → trade | 5.7% | 23.0% | 42.7% | **45.3%** |
| mean coins offered | 4.35 | 7.81 | 7.64 | 4.48 |
| — early (rounds 1–5) | 4.23 | 7.46 | 7.27 | 3.95 |
| IDENTICAL re-hails | 31 | 4 | 2 | **8 (2.0%)** |
| mean voyage | 15.4 | 15.4 | 15.4 | **15.0** |

**Read the mean-coins column carefully — it is a composition effect, not a return to stinginess,
and the distinction is the whole point of the change.** Disaggregated over 2,936 composed offers:
**96% bid essentially everything the bot has** (mean bid 4.90 against a mean purse of 5.51), and
56% now come from captains holding 5 coins or fewer. The figure that dropped is *who is speaking*,
not *how hard they try*. The behaviour item 4 removed was a hardcoded 2/5-coin cap applied
regardless of purse; this is "everything I have, counter me", and it lands 45.3% of the time
against the 5.7% that started all this.

Bots choose a crate counter over a coin one **70 : 3**. Personality is intact and lives in the
*responder's* `dealBias`: the trader takes 20 of 32 holder-side acceptances, five times anyone else.

**The harness carries controls, and they are not decoration** — dock buys asserted non-zero (a zero
means the harness is broken, not the game), winners counted with `== null` and never `!w` (seat 0 is
a real winner), and every ingredient named in an offer checked against the engine's own list so no
fixture can trade in a currency the game does not have.

---

## 7. WHAT WAS TRIED AND FAILED

**Filtering responses instead of the hail.** Barely moved anything (706 → 543). The announcement is
the spam; move the check before it (→ 375).

**Deriving the bid without re-tightening the hail test** (2026-08-14). Fixed the offers and broke
I1: hails 3.25 → 4.10 a game. The old gate compared the offer's worth against the asking price — bid
*to* the asking price and that comparison can never fail again. It went **vacuous**, and a gate that
cannot fail still reads as protection.

**Defending it with a friendlier metric.** The same change argued that identical re-hails stayed
flat, so the extra hails were "haggling, not spam". Every clause true, conclusion wrong: the project
had already decided which number counts. See `HARD-WON-LESSONS` §2.

**Fixing that with a constant.** A fixed margin by which buying had to beat fetching. Broke I4. The
mechanism that finally worked is *smaller* than both attempts.

**Three shapes of "reach" that missed the target in both directions** (2026-08-14, tuning hails
from 0.78 toward ~2). Counting every crate the bot holds at flat leverage value gave **6.03**
hails/game — it opened conversations on the grounds of owning cargo, which is not a reason.
Weighting by `demandFor` gave **7.33**, *worse*, because that estimate's bare prior is high (a
rival's recipe covers 5 of 7 crates). Restricting to spares gave **0.78** — identical to having no
reach at all, since a bot has usually already offered its only spare. All three were approximating
the honest question, which is **"is there an answer they could give that I would take?"** — the
same test `tryTrade` applies before paying a counter, asked one step earlier. That lands at 2.63
and needs no threshold, because a crate the bot's own recipe wants prices itself out on its own
arithmetic.

**Applying `dealBias` twice** (`232a020`). `composeOffer` gated on `worth × dealBias` while the
planner *also* biased the whole turn value, including the sailing component. Applied twice it
stopped tilting and started overriding, which principle 8 forbids — it promoted a hail worth 2 real
turns above a certain crate worth 3. The bias belongs in **one** place: the responder's own.

**Committing to a trade and never speaking it** (`03a683c`). `chooseAction` checked only that
somebody held the crate, while `botOpenOffer` applies two further tests and fails one most of the
time — **4,884 dead turns** in 300 games. Ask the exact question the action will ask.

---

## 8. WHERE IT LIVES

Engine — `src/engine/index.js`:
`holdersOf` · `offerValueTurns` · `estimateCrateCost` · `crateCostTurns` · `respondToOffer` ·
`collectResponses` · `settleTrade` · `counterTerms` · `offerLabel` · `rememberRefusal` ·
`refusedFlagWanted` · `worthReAsking` · `offerWorthTurns` · `openingBid` · `worthHailing` ·
`composeOffer` · `botOpenOffer` · `tryTrade`
Public inference: `noteDemand` · `demandFor` · `likelyNeeds` · `visibleProgress`
Units: `coinTurns` · `acquireTurns` · `PLAN.coinsPerDockTurn` · `PLAN.leverageTurns`

UI — `src/ui/flow.js`: `humanTrade` · `counterOffer` · `coinSlider` · `crateOpt` · `logQuantity`
UI, shared by both tiers — `src/ui/util.js`: `ask` · `optionButtonsHTML` · `sliderWrapHTML` ·
`sliderText` · `wireSlider` · `sliderWirePayload`
Harnesses — `4/scripts/trade_offer_measure.js` (the guarded number) ·
`4/scripts/dlog_quantity_check.js` (reads flow.js **and** util.js since 05-01) ·
`4/scripts/crew_trade_probe.mjs` (a real crew trade: pacing, prompt round trips, the longest
unbroken *"is deciding"* span, the settlement ledger) ·
`4/scripts/local_trade_probe.mjs` (the same trade in solo and pass-and-play, the two modes a
two-tab test cannot see)

### A deal is settled in THREE places, and they must agree

This is the one structural fact most likely to bite you here. `counterTerms(offer, r)` is the single
place a counter is turned into the deal it *means* — and three separate call sites read it, because
who is asking and who is answering changes which code runs:

| Who hails | Who answers | Where it settles |
|---|---|---|
| bot | bot | `Game.tryTrade` — `src/engine/index.js` |
| **human** | bots | `humanTrade`'s settlement — `flow.js` |
| **bot** | human (and bots) | `botOpenTradeLive`'s settlement — `flow.js` |

Playtest 21 item 7 taught counters to *replace* the give side and updated the first two. The third
was missed, and it was still settling the raw `offer`: a captain who countered asking for a
different crate had their counter accepted on screen and **the original trade executed instead**.
Every other test in that block was wrong the same way — affordability judged on `offer.giveCoins +
askFor` (blind to a crate counter costing no coin), and the sort on `askFor` (not comparable across
the two counter shapes).

All three now price answers in TURNS on their own terms. **Three copies of one decision is the real
defect; until they are one, change all three or none.**

---

## 9. BEFORE YOU CHANGE ANYTHING HERE

1. **Read this file and `git log --grep=trade -i`.** The design lives here; the graveyard and the
   guarded numbers live in commit messages.
2. **Baseline first.** `node 4/scripts/trade_offer_measure.js 150`, saved, before a line changes.
3. **Ask which invariant your change touches.** Most trade changes touch at least one.
4. **List what reads any quantity you are about to change — gates and tests included.**
5. **Re-measure, and put hails per game in the summary, first, in its own row.** A number nobody is
   allowed to explain away is the only kind that protects anything.
