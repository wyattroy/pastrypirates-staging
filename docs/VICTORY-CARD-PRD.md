# The Victory Card — product requirements

**Draft 1 · 2026-09-16 · planned on `sep14-victory-card`, BEING BUILT on `sep16-victory-card`.** Written after four rounds on the Victory Card sheet
(https://claude.ai/code/artifact/a7e8dae4-42d9-4f01-891a-ef2c782f091f). **The sheet is the source of truth for every
tuned number.** Where this document and Wyatt's latest *Copy my notes* disagree, his notes win. His rulings, verbatim, are
in `.claude/memory/DECISIONS.md` (2026-09-14 and 2026-09-16 entries).

## 1. What this is

The end of a voyage today is a still card: a gold banner, one award per captain, a table of numbers and a Play again
button. Everything on it is true and nothing on it happens. Wyatt's brief: *"someone feels SO excited to win that they
HAVE to play again immediately."*

The Victory Card **replaces today's end-of-voyage card entirely**. It is not an option or a toggle. His ruling, 2026-09-14:
*"the victory card ideas will replace the end of voyage card -- not a toggle page."* It plays as one sequence, first on
the board and then on a card, and ends with the next voyage already leaving the dock.

## 2. What a player experiences

It plays in this order. Timings are the sheet's current settings; with every beat on, a winning player's sequence lasts
about 34 seconds, but **Play again is tappable from the moment the card arrives (about 6 seconds in)**, so nobody is held.

| # | Beat | Where | What happens |
|---|---|---|---|
| 1 | The crown comes down | Board | The board dims, the camera leans in on the winner, a crown thuds onto their boat, the name slams in letter by letter, confetti fires from both corners and falls with gravity. |
| 2 | The podium at Tortuga | Board | The winner rises up the screen; a cake podium rises beneath, the other captains sail onto it in closeness order. |
| 7 | So close | Card | Only for a captain who did not win, on their own screen: what they held is ticked, what they lacked pulses in a dashed gold ring. |
| 3 | The winning bake | Card | The card slides up. The winner's pastry rises, its five ingredients fly in one by one, the Best Baker seal stamps. |
| 4 | Polly's awards show | Card | Polly announces each award over a drumroll, last place first. Each flips in big, then shrinks into a tall column; the winner's comes last and biggest. |
| 6 | The treasure tally | Card | This captain's voyage score pays row by row, numbers rolling like slot reels, lines sliding up as the card fills. "New best voyage!" when it is. |
| 8 | Set sail again | Dock | The Play again button is a dock with every captain's boat. Tap it: yer sail rises. |

The numbers are the sheet's idea numbers, kept so notes on both line up. Idea 5 (the voyage replay) is out; idea 9 (the
slipway) waits for accounts — see §9.

**Every card page swipes the same way.** When the card moves from one beat to the next, the old page swipes off to the
left. Once the whole card has played, the player can swipe right to go back (or tap the small "‹ Awards" button) and left
to come forward again. His words: *"the player can swipe it back later by swiping the Yer Voyage Score card off to the
right."*

## 3. The voyage score

A score for **one captain on one voyage**. It rewards choices, not luck. Round 4 rebalanced it at his request (*"I
actually don't trust my numbers -- can you rebalance them? Players who WIN should get at least double the points as
players who don't win -- winning is really hard."*) — **his verdict on these numbers is still open.**

| Row | What it rewards | Points (sheet's current settings) |
|---|---|---|
| Recipe crates in the hold | Picking a route and buying before prices climb | 20 each |
| Ovens lit at Tortuga | Getting home with the whole recipe | 50 |
| Bake-off crates named right | Watching the shuffle | 15 each |
| Perfect bake-off | Solving it on the first try; two tries earns half | 300 |
| Won the voyage | The win (see the rule below) | worked out: 445 today |
| Days ahead of the navigator | Beating the bots' day-one route for this recipe | 10 a day, up to 5 days |
| Doubloons in the hold | Spending wisely | 3 each, up to 10 |
| Traded like a Good Friendly Pirate | Each trade struck | 10 each, up to 3 |

**The rule that makes winning worth it.** Winning has no number of its own. It pays whatever it takes for **the slowest
possible winner** (every crate, ovens lit, all five named, but no perfect bake-off, no days ahead, no doubloons, no
trades) to score **double the most any non-winner can ever reach**. That is why doubloons, trades and days ahead count
only up to a limit — without one, a hoarder could out-score a win. Change any other number and the win re-works itself,
so the rule always holds.

With today's settings: the most a non-winner can score is **335**; the slowest winner scores **670**; the example winner
(solved first try, 3 days ahead, 5 doubloons, 1 trade) scores **1025**.

**The perfect bake-off is a winner's prize.** At a shared bakery a captain who is not crowned can also name all five
crates; they score every named crate, never the perfect bonus — which is why the most a non-winner can reach counts five
named crates (found while building it, 2026-09-16; the sheet's first arithmetic counted four).

**Left out on purpose:** dock flips, battle flips and storms (luck); musing (*"remove the musing points entirely"*).

**The navigator.** "Days ahead" compares the day a captain lit their ovens with the bots' own estimate of how long their
recipe's route should take, worked out the moment they picked it. The bots already compute this; the game has to save
it at the pick.

**"New best voyage!"** compares against this browser's best until there are accounts (§9).

## 4. The podium ranking

The winner stands on top. Everyone else is ranked in **closeness order** (his ruling, 2026-09-14):

1. Baked first — a captain at the ovens ranks above one still sailing.
2. Then most bake-off crates named right.
3. Then most recipe ingredients held.
4. Then nearest to Tortuga, in squares.
5. Then most doubloons.

Under each boat a short line says how close they came — *"at the ovens · 3 of 5 named"*, *"4 of 5 crates · 4 sq out"*.
**It never shows which ingredients anyone holds.** (*"NO NEVER SHOW OTHERS YOUR RECIPE!!!"*, 2026-09-10.)

## 5. Each beat, as tuned

**1 · The crown.** Board dims to 45% · camera leans in to 205% · crown falls for 750 ms at 140% size · 9 px shake on the
thud · letters 60 ms apart with 165% overshoot · 55 confetti pieces · 900 ms hold. The confetti is fired up and inward,
slowed by the air and pulled down by gravity until it drifts at paper's falling speed — a real arc, not a keyframed path.
Each letter is a note higher than the last.

**2 · The podium.** Winner moves up 50 px · podium rises over 600 ms · top tier 65 px · boats sail on 520 ms apart ·
how-close line on.

**3 · The winning bake.** Blue-grey oven steam first (it must show on the white card) · pastry rises over 600 ms at 100% ·
ingredients 140 ms apart, each a note higher · seal at 100% · "3 of 21 recipes baked" under the title (winner only;
needs past voyages remembered) · 1400 ms hold.

**4 · Polly's awards.** All four captains' awards, one each, as today's card deals them (the game's own trophy names and
art) · 650 ms drumroll · 440 ms flip · 1400 ms on each while big · 500 ms to shrink into its column · each award 2
semitones higher · winner's award 115% · all four columns stay 1500 ms · 380 ms swipe · Polly bobs while she talks. The
small awards are **tall columns** from under Polly to the bottom of the card, showing the trophy's name, the captain and
the stat, readable at phone size.

**6 · The treasure tally.** Rows 740 ms apart · each number rolls for 550 ms · 4 rows in view, then every line **slides
up** to make room · 9 px shake at the total, growing with the score · "New best voyage!" stamp on · 1200 ms hold. When
the tally is done, the rows scroll back with a finger.

**7 · So close.** Plays straight after the podium, before the winning bake · the headline says exactly how close (*"Ye
were ONE ingredient from the ovens!"*, *"Ye were TWO crates from the win!"*) · what they lacked sits in a dashed gold
ring, pulsing every 900 ms · shows how close in words and their place (*"2nd of 4 captains"*) · says what they needed
next (*"The spice island was 4 squares away"*) · 1800 ms hold.

**8 · Set sail again.** The button reads *"Anchors up, play again!"* and, once tapped, *"Setting sail…"* · the dock
arrives with the card and can be tapped any time · a sail rises over 450 ms · bots raise theirs at once · in a crew,
once every human's sail is up, a 5-second countdown starts and the host can go early.

## 6. Solo, crew and pass-and-play

**The sequence is the same on every screen.** One engine decides the facts; every screen draws them the same way. The
only thing that differs by screen is *whose* card it is:

- **So close** plays only on the screen of a captain who did not win, and shows only their own recipe.
- **The voyage score** on each screen is that screen's own captain.
- **Everything else** — crown, podium, winning bake, awards — is identical for everyone.

**Crew rematch** (his ruling): each human taps to raise their sail; when every human's sail is up, a 5-second countdown
starts; the host can go early; bots raise theirs at once.

**Pass-and-play** is one shared screen, so "their own screen" does not exist — see the open question in §11.

## 7. How it fits the game — for whoever builds it

These are the project's standing rules applied to this feature, not new design.

- **Facts live in the engine and arrive as events.** The score, the closeness ranking and the navigator's estimate must
  be worked out by the engine and sent with the end of the voyage, so a guest can never see different numbers from the
  host. What already exists: the `end` event (and `collab` when several captains finish), each captain's `coins`, `ing`,
  `pos` and `baking`, the bake-off's attempt count, `trade` events, `ovensDay`, and the bots' route estimate
  (`turnsToWin3` in `src/engine/index.js`). What is new: saving that estimate when a recipe is picked, counting each
  captain's trades, and one end-of-voyage event carrying every captain's score rows and closeness.
- **Every reaction goes through the one door.** The crown, podium and card are drawn by the one event consumer
  (`consumeEvent`), never from a turn loop or a host branch. A visual feature is not done until a host window and a guest
  window — one at iPhone 13 mini size — have been compared.
- **Board overlays.** Anything drawn over the board in HTML (the crown, the podium, name, confetti) joins
  `CAM_HTML_LAYERS` or it detaches when the camera leans in. Anything that animates continuously is HTML, not SVG.
- **What it replaces.** `showStats()` in `src/ui/board.js` (today's card) and the `.pp4Again` Play again footer in
  `src/ui/stage.js`. The awards keep today's logic (`computeAwards` / `assignBadges` in `src/ui/util.js`, the Black Spot
  always included); only how they are shown changes.
- **Remembering past voyages** ("New best voyage!", "3 of 21 recipes baked") uses this browser's storage until accounts
  exist, guarded so a private tab never breaks the card.
- **Reduced motion.** A device that asks for less motion gets the card without the shake, the camera lean-in or the
  flying confetti; the information is identical.
- **Every word** goes in `src/shared/words.js`, like the rest of the game's lines.

## 8. What goes away

Today's card: the gold "wins!" banner, the grid of award cards with its separate scroll area, and the stats table (Days,
Battles, Trades, Bakeries, each captain's HEADS %). The banner and awards are replaced by beats 1 and 4. **The stats table
has no home in the new card** — see §11.

## 9. Out of scope, and parked

- **The voyage replay** (idea 5) — out; backlog. His note if it returns: follow only the active player.
- **A new ship on the slipway** (idea 9) — waits for user accounts, so a player never loses a half-built boat
  (`.planning/BACKLOG.md`, "WAITING ON USER ACCOUNTS").
- **Leaderboards, the Daily Voyage, ranks, share grids, "Find me a crew"** — the future-plans work. The voyage score is
  per captain per voyage; it is not yet a player rating.
- **Original art for every trophy** — its own backlog item; the card uses today's badge art until then.

## 10. Done means

- A whole voyage played to the end in **solo, crew and pass-and-play**, on the final build.
- In a crew, a **host window and a guest window** compared at **iPhone 13 mini size and a laptop window**: the same crown,
  podium, bake and awards; each screen its own score and (if it lost) its own So close.
- Posed ends for a **win, a 2nd place at the ovens and a 3rd place one ingredient short**, screenshotted.
- The score on the card matches a hand calculation from the voyage's events, for every captain.
- Across a large run of bot voyages (on Wy-Blade, never the MacBook), **no winner ever scores less than double any
  non-winner**, and no card ever shows another captain's ingredients.
- Play again works from the moment the card arrives; the crew countdown starts only when every human's sail is up.
- Wyatt plays it on staging and gives his verdict.

## 11. Open questions for Wyatt

1. **The rebalanced score** — do the round-4 numbers feel right? (Answer on the sheet.)
2. **The stats table** (Days, Battles, Trades, Bakeries, HEADS %) — drop it, or give it a page on the card after the
   score? *Recommendation: drop it; the score and awards say the same things with more meaning.*
3. **Pass-and-play privacy** — on one shared screen, So close would show a losing captain's recipe to everyone.
   *Recommendation: in pass-and-play, So close shows how close in words and place, but not the ingredient row.*
4. **"New best voyage!" in a crew** — each player's own best on their own device. *Recommendation: yes, per device until
   accounts.*
5. **Nobody finished** (the 150-day cap; never seen in 120 test voyages) — *Recommendation: no crown; the podium ranks
   everyone by closeness; the card skips the winning bake.*
6. **Who builds it** — this session, another, or Wy-Blade.
