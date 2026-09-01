# Intended behaviour — the things that look wrong and are not

> **Wyatt, 2026-08-30, after being asked to explain the same thing to a third separate session:**
> *"You need to create a durable way to remember the rules and intended behavior of the game. This
> is intended behavior, and I have to explain it to each different session every single time. It
> would be intuitive to you if you read through the documentation instead of asking me, but you're
> clearly not... you need to figure out a system to understand the expected behavior and the
> expected rules of the game so that you stop asking me every single time because it's making me so
> frustrated."*

**THIS FILE EXISTS BECAUSE THE ANSWER WAS ALWAYS IN THE REPO AND NOBODY READ IT.** Every row below
was already recorded somewhere — a design doc, a ruling, a comment, a commit message. What was
missing was one place to look at the moment of doubt. That moment is when you are about to say
*"host and guest disagree"* or *"this looks like a bug"*.

---

## ⚠ READ THIS BEFORE YOU REPORT ANY DISCREPANCY

**Two screens showing different things is not evidence of a defect until you have checked this
file.** Several of the differences you will find between a host and a guest, or between a bot and a
human, are the game working correctly — and one of them has now been misread by three separate
sessions and cost Wyatt three explanations.

**The test that resolves most of them, and it is his:** *would this make two screens showing the
same game, at the same moment, show different things a player is entitled to see?* Information one
player is not entitled to see is not a divergence. Neither is a difference in **rate** — only a
difference in **content or order**.

## THE ONE RULE THAT KEEPS THIS FILE ALIVE

**The moment Wyatt explains that something is deliberate, add it here, that same turn, with his
words and the date.** Not in a commit message, not only in the ledger. A row added a week later is
a row he had to explain twice.

**Every row needs a citation** — file:line, a doc, a commit, or a dated quote. **A row nobody can
trace is worse than no row**, because next week it becomes a confident wrong answer. If you believe
something is deliberate but cannot cite it, it goes in §7 as an open question, not in the body.

---

## 0. THE RECURRING ONES — got wrong more than once, so they lead

### The greyed, red-backed ingredient chips are what a captain STILL NEEDS. They are not the hold.

**What it looks like:** the two human captains' ingredients disagree between screens — the host sees
itself holding five and the guest as "empty hold", the guest sees the mirror image — while both
bots match on both screens. Reads like a sync bug.

**What is actually true:** nothing is out of sync. **Your own row draws your RECIPE**, with a chip
per ingredient it needs, greyed and red-backed for the ones you have not collected yet. **A rival's
row draws only what they actually HOLD**, and reads *"empty hold"* when that is empty. Two humans
with empty holds therefore each see their own recipe chips and each see the other as "empty hold".
The bots matched because those bots genuinely held two ingredients, which is public.

**Why:** a rival's recipe is secret in every mode — that is a game rule, not a multiplayer artifact.

**Citations:** `src/ui/board.js:1671` (`canReveal` — only your own seat, and in pass-and-play only
after you tap *check my recipe*), `src/ui/board.js:1697` (a rival's row is `held.join("")` or
`empty hold`). Wyatt, 2026-08-30: *"the hold is empty when it shows red squared grayed out
ingredients. That doesn't mean that those ingredients are in the hold. That means that they are not
in the hold yet."*

**Standing rule.** Also note his own follow-up, which is a real design observation and is now on the
backlog: *"If this is unclear to you, then it's probably unclear to players as well."*

### Pass-and-play hides your recipe until you ask for it

**What it looks like:** a captain's own recipe area is blank at the start of their turn.

**What is actually true:** in pass-and-play the device changes hands, so your recipe only appears
once you tap *check my recipe* during your own live turn. On separate devices the hardware enforces
the same rule for free, so it reveals immediately.

**Why:** the rule is identical in every mode — *your recipe is yours, a rival's is theirs*. Only the
**enforcement** differs, because the hardware differs. That is what a mode difference is allowed to
be.

**Citation:** `src/ui/board.js:1671`.  **Standing rule.**

### The CAPTAINS panel lists a different captain first on each screen — and that is one rule, not two

**What it looks like:** the host's panel reads HostCap, Dough Hook, Flaky Jack, GuestCap; the
guest's reads GuestCap, HostCap, Dough Hook, Flaky Jack. Two screens, two orders — a textbook
host/guest divergence.

**What is actually true:** **whoever is looking sees their own captain on top**, then sailing order.
Two screens showing different orders is that single rule working correctly on both.

**Wyatt, 2026-08-20, correcting a session that had filed it as a sanctioned host/guest exception:**
***"a rule that takes the viewer as an input is not two rules."*** That sentence resolves a whole
class of report and is worth memorising.

**Citations:** `docs/DISPLAY-RULES.md` §2 "The captains list order"; `src/ui/util.js:79`
(`seatDisplayOrder`) → `:84` (`seatOrderFrom`).

**REPORTED WRONG AT LEAST THREE TIMES** — a sea-trial finding (corrected in
`.planning/CTO-LEDGER.md:92`, *"BY DESIGN … the previous trial finding was a false positive"*), an
earlier framing that filed it as an exception, and it is **already on the current playtest sheet**
saying *"That is YER OWN RULE. Not a defect — do not report it."*  **Standing rule.**

### Board artwork runs past the edge of the screen

**What it looks like:** the board overflows the phone viewport.

**What is actually true:** the page never scrolls sideways — measured `innerWidth 390 /
documentScrollWidth 390` across 22 samples. What extends past the edge is **board artwork**: the
rain layer at 624px, island SVGs at 564px. **The board is a camera view of a larger map, so its
contents are cut off by design.**

**Citations:** `scripts/lib/vision.mjs` ACCEPTED list; `.planning/CTO-LEDGER.md:147` (W4-7 closed NOT
A DEFECT, 2026-08-29); `.planning/BACKLOG.md:149`.  **Standing rule.**

### Two recipe cards look asymmetric — one highlighted, one not

**That is the two-tap SELECTION state.** The chosen card is highlighted and carries its "Bake this!"
pill. Named a **false-positive family in three separate trial triages** —
`.planning/CTO-LEDGER.md:86`, `:103`, `:119`.  **Standing rule.**

### An "empty speech bubble", or a captains row that looks 85% empty

Two different innocent things. The "empty bubble" is the **active-seat ring** misread by an
automated judge (which also hallucinated the wind direction in the same pass). The near-empty
captain row is **day-1 content** — nobody has collected anything yet; the pills fill to the right
edge as ingredients arrive.

**Citations:** `.planning/CTO-LEDGER.md:119`, `:135`, `:140` — settled by opening it and looking,
after two instruments lied.  **Standing rule, a known false-positive family.**

### The wind FORECAST is the pill, not the hidden chip

**What it looks like:** a `.fcChip` element exists in the CSS and is never visible — "a forecast
nobody can see".

**What is actually true:** the **wind pill** (`WIND NOW: S↓ · FORECAST: W←`) *is* the forecast and
it works. The hidden chip is the old SVG needle the pill replaced, retired on purpose.

**Wyatt, 2026-08-27, same day the claim reached him:** *"what do you mean? I see the forecast chip
just fine."* **He was right and the claim was false.**

**Citations:** `src/ui/stage.js:1043` (the pill), `index.html:1905` — the rule ends
`/* the pill is the instrument now */` — and `src/ui/board.js:402`, `// the wind pill supersedes the
chip on the stage`. **Two comments stated the intent and neither was read before the claim was
written.**

### You do not lose a coin to the shot clock — the clock is off

**What it looks like:** `applyShotClockPenalty` takes a coin, so the narration must be wrong.

**What is actually true:** the function is real and unreachable. `startShotClock` returns
immediately when the timer is off, and **the timer is off** — the pill reads *"⏱ off"* in every
phone screenshot.

**Wyatt, 2026-08-28:** *"p1 is stale, you dont lose money from shot clock."*

**Citations:** `src/ui/util.js:2012` and `:1896`; the withdrawn row P-1 in
[`../.planning/BACKLOG.md`](../.planning/BACKLOG.md).

**The lesson recorded beside it is the one this whole file serves:** the reading was correct and the
conclusion was still false, because nobody asked *can a player reach this?* **A correct reading of a
dead branch is still a false statement about the game.**

---

### Docking pauses because it IS a coin flip — a treasure hunt, not a stall

**What it looks like:** a measured 1601ms gap between a dock happening and the rest of the table
being told about it. Reported as the same "one client holds the table" fault as the storm and the
sail.

**What is actually true:** **docking is a treasure hunt, then a purchase** — v2 rule 10. The flip
decides the payday: heads you turn up buried treasure, tails you spend the turn working the dock.
So a docking captain is *answering a prompt*, and the pause is a decision being made, not a frozen
board. **Wyatt, 2026-08-30, correcting a report on his own game:** *"I think this is because that
captain is flipping to see if they will find buried treasure or not. If my thinking is correct,
then this isn't a bug."*

**And the other captains are told.** While any captain answers, every other screen holds a
*"…is deciding…"* line. That line was genuinely broken once — measured live on a guest, **2516
narration lines contained it ZERO times** — because it branched on the local viewer while being
sent from the host. It was fixed by broadcasting the spectator line as the neutral content with the
actor's own prompt as that seat's variant.

**Citations:** `src/engine/index.js:965-978` (the rule, and `treasure`/`dockhand` outcomes);
`src/ui/util.js:1580-1592` (the broken-then-fixed spectator line, with its measurement);
`src/ui/stage.js:1398` — *"Everyone else still reads '…is deciding…'"*.

**⚠ THE PART THAT IS STILL OPEN, and it must not be read as settled:** what other captains see in
the window **after** the flip resolves, while the dock ceremony plays on the docking captain's
screen and before the event reaches the wire. The "…is deciding…" line covers the *decision*. It
has not been measured whether it still covers that *animation*. **Two tabs would answer it in
minutes; reading will not.** Wyatt's ruling stands — parked — and this note exists so the next
session neither re-reports it as a bug nor assumes it is proven fine.

---

## 1. Captains, recipes and holds

| Looks like | Actually | Citation |
|---|---|---|
| A ship with cargo cannot be attacked but an empty one can | The reverse: **an empty hold cannot be attacked at all** — there is nothing to take | `src/engine/index.js:1750` (v2 rule 13e), `src/ui/flow.js:2094` |
| A captain with no coins and no cargo is offered a trade | They are correctly blocked — *"Ye've nothin' to trade — an empty hold and an empty purse."* | `src/ui/flow.js:2172`, `:1839` |

## 2. The board and what is drawn on it

| Looks like | Actually | Citation |
|---|---|---|
| A short move does not animate its route | **Deliberate.** A two-square straight hop has no corner to draw and the plain render says it better | `src/ui/flow.js` (the route walker's `route.length<3` cull) |
| A ship sails diagonally across an island | **This one IS a bug** and is the reason the sailed route is drawn at all. Do not dismiss it | `src/engine/index.js:630-634` quotes the original playtest wording |

## 3. Host vs guest, and the other play modes

**Host/guest decides who COMPUTES the game and who CREATES the room. It must never decide what a
player SEES.** That is rule 23 and it is the single most load-bearing line here.

**But mode differences are legitimate in exactly three places** (his ruling, 2026-08-30, in
[`.claude/memory/DECISIONS.md`](../.claude/memory/DECISIONS.md)):

1. **How an answer is obtained** — the Decider. Pass-and-play's device hand-over gate lives here.
2. **How the script is played** — rate, never content. Solo's fast-forward lives here.
3. **The shell around the stage.**

**Anything else that differs by mode is a fork.** And the invariant that makes a Decider safe: **a
Decider may draw whatever it needs but must EMIT NO EVENT.** A mode-specific thing that emits no
event cannot make two screens disagree.

| Looks like | Actually | Citation |
|---|---|---|
| The guest is behind the host | **Expected, and perfect simultaneity is explicitly NOT the goal.** The network guarantees a lag; chasing literal sameness leads to lockstep and stalls. The invariant is **same sequence, never a different script — possibly a moment apart** | his ARCH ruling, 2026-08-30, `.planning/CTO-LEDGER.md` |
| Solo runs faster than a crew game | Fast-forward is a **playback rate**, a property of the performer, not a solo feature. Every measured site is a hold or a tick — a duration, never content | ledger, 2026-08-30; `src/ui/flow.js:80`, `:1184`, `src/ui/util.js:1049`, `:1117`, `src/ui/stage.js:1388` |

## 4. Bots and humans

**If a human cannot do a thing, a bot must not either — and the reverse.** Bots differ only in *how
they choose*, never in *what they may do*. **Any future "should bots be allowed to…?" is already
answered.** Do not raise it as an open decision.

**But parity is a symmetry requirement, not a ceiling on bots.** When the two differ, which side
moves is a separate design choice, and **levelling the human up is frequently the right answer** —
his example: bots could counter-offer and humans could not, and the fix was to give humans the
counter-offer.

**Citation:** `.claude/CLAUDE.md` §2; full text in `.planning/PROJECT.md` → Constraints. **Standing
invariant since the beginning.**

## 5. Pacing and animation

| Looks like | Actually | Citation |
|---|---|---|
| Holding the sea fades some things and not others | **Deliberate exception, his pick 2026-08-12.** It fades every floating box — prompts of all styles, narration bubbles, the stay-put confirm — but **not** the centre-stage intros or the flip-ceremony veil | `.claude/CLAUDE.md` §2 |
| The narration box reveals its parts in an odd order | It reveals **top to bottom in DOM order**: back button → message → buttons → italic helper. Anything added to the panel follows its visual position | `.claude/CLAUDE.md` §2; `localAsk()` in `src/ui/flow.js` |

## 6. Copy and voice

| Looks like | Actually | Citation |
|---|---|---|
| The credits and About page use "you" while the game uses "ye" | **Correct and deliberate. Never "fix" it.** The divide is diegetic: inside the game world is pirate speak, outside it is Wyatt's own plain first-person voice. The credits thank real people; pirate speak there would put a costume on a genuine thank-you | `.claude/CLAUDE.md` §2, his ruling 2026-08-02 |

*(A retroactive audit once flagged the shipped credits line as drift. **The shipped text was right and
the audit was wrong.** He had already told an earlier session this rule and it was lost — which is
the same failure this whole file exists to stop.)*

---

## 7. OPEN — suspected deliberate, NOT confirmed

**Do not cite anything in this section as settled.** These are candidates awaiting his word. Move a
row up into the body the moment he rules, with the date and his words.

| Observed | Suspicion | Status |
|---|---|---|
| The hint *"Click and hold the sea to reveal the board"* appeared on a guest and not on a host | May be correct (the host had already used the gesture) or may be a divergence | Observed once, 2026-08-30. **Not measured** |
| The greyed chip's **red backing** specifically | The rule is cited; the visual treatment is described nowhere | No ruling found |
| The FORECAST ribbon text clipping mid-word | Triaged as "pre-existing" repeatedly and carried as a known item | **Known is not the same as intended.** No ruling found |
| Duplicate ingredients sorted together in a rival's hold | `src/ui/board.js:1694` says *"easier to spot a tradeable double"* | **Code intent, not his ruling.** Cite it as such |

**And three sounds are silent BY ACCIDENT, not by decision** — `storm`, `testhold` and `rewatch`
have no entry at all (`docs/AUDIO.md:86-92`). Listed here only so nobody files them under
"intended".

---

## THE ACCEPTED LIST — read by the vision judge, not copied by it

**These lines are the single source for what an automated screenshot judge must never call a
fault.** `scripts/lib/vision.mjs` READS them from this file at runtime rather than carrying its own
copy — because a second list of designed behaviours, kept in step by discipline, is exactly the
drift rule 23 exists to prevent, and it had already started.

**Edit them here and nowhere else.** Keep each on one line, inside the fence, beginning with `- `.

```accepted
- a scrollable card or sheet may run past the bottom of the screen; being cut off at the bottom edge is how it tells you to scroll;
- board artwork (the map, islands, ships, logo, decorative art) may be clipped at the edge of the board itself — the board is a camera view of a larger map, so its contents are cut off by design;
- each viewer's own captain is listed FIRST in the captains panel, so two screens legitimately show different row orders;
- a captain's own row shows their RECIPE (greyed chips are ingredients still needed, not cargo); every other row shows only what that captain actually holds, or "empty hold";
- one recipe card highlighted and another not is the two-tap selection state, not a rendering failure;
- a ship drawn at reduced opacity is BAKING and deliberately off the board, not disabled or broken;
- a coin slider drawn greyed and undraggable is a captain with an empty purse — the disabled control IS the answer;
- a narration bubble sits off-centre because it is anchored to a captain's ship with a tail; only a battle result is deliberately centred.
```

---

## Where the rest of it lives

**Point, do not restate.** This file is the index of *things that look wrong and are not*. The
subsystems themselves are documented where they always were:

**This file owns MISREADINGS — "it looks wrong and is not".**
[`DISPLAY-RULES.md`](DISPLAY-RULES.md) **owns the MECHANISM** — how the game decides what to draw,
which channels are converged and which are half-done. When a row here needs the mechanism, it links
there rather than restating it. Two documents describing the same thing would drift; two documents
answering different questions do not.

| Subject | Read |
|---|---|
| Anything that trades | [`TRADE-SYSTEM.md`](TRADE-SYSTEM.md) |
| Anything drawn on the board | [`BOARD-RENDERING.md`](BOARD-RENDERING.md) |
| Sound, music, the mute control | [`AUDIO.md`](AUDIO.md) |
| Bot behaviour and tuning | [`BOT-DESIGN-PRINCIPLES.md`](BOT-DESIGN-PRINCIPLES.md), [`BOT-V3-RACE-PLANNER.md`](BOT-V3-RACE-PLANNER.md) |
| What he has DECIDED, and why | [`../.claude/memory/DECISIONS.md`](../.claude/memory/DECISIONS.md) |
| How to work with him | [`../.claude/CLAUDE.md`](../.claude/CLAUDE.md) |
| What was tried and thrown away | the git log — commit messages here are long so they can be read that way |
