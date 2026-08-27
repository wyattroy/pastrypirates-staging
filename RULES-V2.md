# Pastry Pirates v2.1 — ruleset spec

Solo/pass-and-play only. No Firebase. v1 (repo root) is untouched.
Every line below is Wyatt's answer to a clarifying question, 2026-08-04.

## Build decisions

- Lives in `v2/` on branch `claude/pastry-pirates-v2-rules-33gp60`. `origin/main` never touched.
- Art and sound come from `../assets/` and `../sfx/` — no duplication. v2 must never carry
  `CNAME`, `robots.txt` or `sitemap.xml` (they claim the live domain — see root CLAUDE.md).
- Firebase script tags and the Host/Join lobby buttons are removed; `src/net/` stays on disk, unused.
- Pass-and-play kept (local, no network).
- Carries the how-to-play modal, rewritten for v2. No `about.html`, no `lab.html`.
- Built outside GSD by explicit instruction; notes live here, `.planning/` untouched.

## 1. Sailing

- Move up to **4 squares**, any mix of orthogonal directions.
- If the route includes **even one upwind square** (the direct opposite of the wind), the whole
  move is capped at **2 squares**.
- Crosswind does **not** count as upwind.
- Plain distance — every square costs one step. May sail past ships, may not end on one.
- **The lee is gone.** `leeward()` / `SAIL_BUDGET_LEEWARD` deleted; an island upwind does nothing.
- Trade-wind rim currents unchanged (sail into the rim → swept to that arc's clockwise end).

## 2. Sailing is free

- No coin cost to sail. Ever.
- **Fleeing is free.** No storm dodge exists any more (see 8).
- Coins buy exactly three things: **powder**, **crates**, and whatever you can negotiate in a trade.
- Starting coins stay **3**. Powder stays **2🌕**.

## 3. Fishing removed — and Pass, the turn-ender that replaced it

- Act menu is **Dock / Attack / Trade / Start yer bakery**, plus **Pass**, which is never disabled:
  a turn must always be endable, and fishing used to absorb that case by accident.
- Pass narrates a **sea creature**. Fifty of them, all Wyatt's, hand-written in full on 2026-08-06
  and corrected only for grammar and punctuation.
- **Each entry stores both persons.** One sighting is narrated two ways — *"ye lean over the rail…"*
  to the captain, *"Crustbeard leans over the rail…"* to everyone else — and `{}` marks where the
  name goes, because it is not always first: *"Off the bow, ye see…"* becomes *"Off the bow,
  Crustbeard sees…"*. The earlier shared-opener table is gone; Wyatt's rewrite fuses opener and
  sighting, so there was no shared opener left to share. Writing both forms out also conjugates the
  second verb of a compound sentence correctly (*"leans over the rail, and **spots** six
  clownfish"*), which no leading-clause rule would have caught.
- **Nothing is inferred at runtime** — no article guessed, no verb agreement derived, no person
  conjugated. Every string is read out exactly as written.
- **Order is load-bearing** (Wyatt, 2026-08-06): *"each animal followed by a substantially different
  animal, in a different view/part of the oceanscape."* No two neighbours share a creature family or
  a zone of the sea. The list is walked as a **ring**, so the 50→1 join is a real adjacency and
  satisfies the rule too — moving or adding an entry means re-checking both.
- **The lineup persists across games** (`pp_seaIdx`): your device remembers where you had got to,
  and the next voyage starts at the next creature, so you work through all fifty over many games.
  Read once per game and carried in the solo save, so a resumed voyage replays the same sightings
  it showed live. Bots walk their own derived offsets and never touch your cursor.

- Coins enter play only via dock flips (3 or 1, D-30 2026-08-21 — was 5 or 2) and correct battle
  calls (+2). Intentionally tight.
- Fish art and the `fishing` sfx stay on disk in the shared assets; v2 just stops referencing them.

## 4. Table-wide open trade

- You announce **what you want** and **what you offer** to the whole table. No target player.
- Every captain's cargo is public, so any crate may be asked for — crates **nobody holds are
  greyed out** in the picker.
- Every captain holding it responds: **accept**, **deny**, or **counter-offer**.
- You see **all responses together**, then accept one or walk away. **One round only** — no
  re-countering a counter.
- **No harbor-tax bonus.** A trade is just the exchange.

## 5. Battle calls

- Any non-combatant, anywhere on the board, may call the winner. **Free**, no stake.
- Correct call: **+2🌕 from the bank.** Wrong call: nothing. Bots call too.
- A **null** battle (nobody wins) pays no caller.

## 6. Wind compass

- Wind spins once per **round** and holds for the whole table.
- Compass shows **both**: this round's live wind, and next round's forecast.
- The forecast reveals **that a storm is coming, but never which way it will blow**
  (Wyatt, 2026-08-06 — the storms "lost some of their force and fun and playfulness and
  unpredictability"; a shove you can see coming a full round out is a logistics problem, not
  weather). Because a storm blows along its own round's wind, the storm's direction and next
  round's wind are **the same fact** — so hiding one hides the other, and a storm round is simply a
  round whose weather nobody can plan. No rule was added: a tabletop deck prints the storm card
  face-down. Everything reads through `Game.forecastWind()`, which returns null while a storm is
  pending, so the direction cannot leak into the chip, the round header, the event log **or the
  bots' planner** — an opponent with private weather reads as a cheat faster than an unfair rule does.
- **How the chip says the direction is hidden on purpose:** the certainty stays where it already
  lived — red box, storm cloud, breathing — and the doubt goes into the direction slot as **an arrow
  that never settles**, turning once every 4 seconds. A bare `??` was considered and rejected by
  Wyatt for the right reason: it reads as doubt about whether a storm is coming at all, when the
  storm is the one certain part. A whirlpool was considered and rejected because 🌀 already means
  the trade-wind rim current in this game, and a glyph should not mean two things. An arrow that
  won't stop turning says *the direction* rather than *the forecast*, and needs no legend.
- The forecast is **never wrong** — once shown it is committed.
- **How it is drawn (2026-08-05, settled after two failed attempts):** the dial is left alone — one
  ornate needle, always THIS round's wind. The forecast lives in a filled chip ABOVE the compass
  reading `FORECAST: E →`, and **the whole chip goes red and breathes when a storm is coming**,
  with the game's own storm-cloud icon appearing before the direction. It sits over the corner's
  decorative art, blocking neither the playing grid nor the dial.
  Two earlier attempts put the forecast ON the dial and both failed for the same reason: anything
  drawn over the needle competes with it. A ghost needle was mistaken for the live wind; a red
  chevron was legible but shouted louder than the thing it annotated. A chip below annotates
  without competing.
- **Wind particles are ON in v2** (`WIND_PROTOTYPE_ENABLED_DEFAULT`), at **20% of the prototype's
  speed** (`WIND_SPEED_SCALE`) — it was tuned as a motion demo, which is too busy under a board
  people are reading. They drift with the live wind —
  the clearest read of which way it blows. The prototype's tuning HUD stays opt-in behind
  `?windhud=1`, because it is a fixed panel that lands on the Captains panel on a phone.
- **Particles are half the prototype's size** (`WIND_DOT_PX`, 7px → 3.5px) and **never share the
  board with the rain** (Wyatt, 2026-08-05): the field fades out over 400ms as a storm arrives —
  gone before the rain's own 0.8s fade-in finishes — and fades back in over 900ms behind an 800ms
  delay, so the rain has fully cleared first. Two weather animations at once read as noise; one at
  a time reads as weather. The dots' rAF loop is stopped for the duration of the storm and
  restarted just before they become visible again, so an invisible field costs nothing during the
  most expensive moment the board has.

## 7. Storms

- **20% per round** (up from 12.5%), keeping the max-2-in-a-row cap.
- One direction, **3 squares**, **everyone at once**, at the **start of the round**, before anyone acts.
- Resolved **downwind-first**, so the lead ship clears the square before the ship behind arrives.
- Storm push into the rim still triggers the trade-wind sweep.
- No more NE/SW second gust.
- **The storm is announced once, not twice** (Wyatt, 2026-08-06). The round header carries it —
  *"Round 9: A ⛈️ storm be ragin'! It'll blow every ship 3 squares north."* — and the `storm` event's
  own line (*"THE STORM BREAKS!…"*) said the same thing again a beat later, so the player read the
  storm twice before a single ship moved. That narration is now silent; the event still fires and
  still drives the push. The per-ship lines during the push (the anchor hold, the rim sweep) stay —
  those report what happened to a particular captain, which the header cannot.

## 8. Storms and land — SIMPLIFIED, 2026-08-05

Rule 8 originally read: blown into land costs your whole turn, docks save you, an occupied dock
holds you fast, and you can still be blown off a dock. Playtesting produced two bugs in the same
family within one session — Tortuga's berths not counting as docks, then a berth not protecting the
ship moored to it — because "dock" meant three different things depending on the direction of
approach. Asked what would simplify the storm most, Wyatt chose to **drop the lost turn entirely**.

The whole rule is now one sentence:

> **Land and other ships stop ye short.**

- Nobody ever loses a turn to weather.
- **Docks need no storm rule at all.** They are water the storm can push you onto or off.
- The rim still sweeps you: blown into the trade winds, you are carried across the sea.

What this gives up is nothing the game relied on. Measured over 150 games, a storm still moves each
ship **3.05 squares** on average — most of a full turn's sailing — and still flings a ship into the
rim roughly **0.85 times per storm**. Removing the lost turn changed the median game length by
**zero rounds**. The punishment carried all the edge cases; the drama was always in the displacement.

Deleted with it: the `aground`, `stormlost`, `berthHold` and `blownDock` narration, the
`stormAground` forfeit branch in both the human and bot turn paths, and one engine outcome.

**The anchor line stays** (Wyatt, 2026-08-05). The moment it describes still happens — the storm
drives ye at the rocks and the ship fetches up short of them — so `anchorHold` narrates it, and
fills what was otherwise silence. It now reports seamanship rather than a penalty dodged.

**Using land as a backstop is deliberate and good.** With land directly downwind the storm cannot
move you at all, so a captain reading the forecast can choose to be immovable. Measured: 34.8% of
your reachable squares are storm-proof, you are already on one 32.7% of the time, and only 0.7% of
the time is none reachable. It is emergent from the one sentence — no rule was added for it — and it
is not dominant, because the shove HELPS 25% of the time and only hurts 36%, netting −0.33 squares.
Sheltering blindly forfeits free progress, so it is a read rather than a routine. If playtesting
ever shows everyone parking against land, the lever is storm distance or frequency, never a new rule.

## 9. Battles — one round

- **2🌕 powder** up front, as in v1.
- **Heads vs tails** → the heads ship wins.
- **Both heads, one ship downwind** → the downwind ship wins.
- **Both heads, crosswind** → the attacker may pay **2🌕 to re-fire alone** against the defender's
  standing heads. **Repeatable** as often as they can pay. Decline → **null**, battle ends,
  nobody gains anything.
- **Both tails** → the defender may **flee for free**, moving under the normal v2 sail rules
  (4 squares, 2 if upwind). If they stand their ground, the attacker may pay **2🌕 to re-fire**,
  same as above; decline → null.
- **Prize: one crate, winner's choice. No coin alternative. No place-swap** (a swap would hand the
  loser the advantageous square).
- **You cannot attack a ship with no crates** — the option greys out.

## 10. Docking

- Flip: **heads = 3🌕** treasure found; **tails = 1🌕** working as a dockhand. (D-30, 2026-08-21:
  was 5/2, then 6/2 before that — see `src/engine/index.js` `dockHeads`/`dockTails` for the
  shipping numbers; this doc is descriptive, not authoritative — the cfg field is.)
- **No free crate on heads.** Crates come only from buying, battle, or trade.
- After **either** outcome you may buy a crate, **on the same turn**, with the coins just earned.
- An empty island still pays 3/1 — there is simply nothing to buy.
- You may stay in the berth and re-flip each turn (v1's current `unlimitedDock` behaviour).

## 11. Crate prices

- **Price = 6 − (crates remaining on that island).** So 3 crates → 3🌕, 2 left → 4🌕, 1 left → 5🌕.
- Per island, shared table-wide. Self-correcting if a crate ever returns to supply.
- Can't afford it → the buy button greys out and says the price has risen.
- Crates per island: **3 at 3–4 players, 1 at 2 players** (so a 2p crate always costs 5🌕).

## 12. No bakeoff

- First captain home fires the ovens; everyone else gets **one final turn** (kept).
- Finishers **collaborate on a bakery** — a narrative scene, not a mechanic.
- **Best Baker** goes to the finisher with the most **crates** (all of them, recipe or not),
  then most **coins**, then **whoever got home first**.

## 13. Raiding docks

- **Every dock is raidable**, not just Tortuga. Being in a berth protects nobody.
- **Even a captain who has already finished** can be raided and stripped of a winning crate.
- Prize: **one crate, winner picks** — identical to rule 9.
- Identical battle rules to rule 9 in every respect.
- A defender with no crates can't be attacked (greyed out).
- **Losing a recipe crate un-bakes ye** (Wyatt, 2026-08-06, from a playtest: *"I attacked Davy Scones
  when he got to Tortuga... and I stole one of the ingredients he needed. This should have been an
  effective strategy... but instead, he still won."*). Rule 13b made a finished captain a legal
  target precisely so that raid is worth making, but nothing revoked the finish: `done` stayed true,
  the seat stayed in `finishOrder`, and the end of voyage crowned a baker with no recipe to bake.
  Now `Game.unfinish()` clears both, the captain **re-enters the rotation and can go and replace what
  was taken**, and the voyage does not end while nobody is home. Taking a SURPLUS crate — one outside
  their recipe — leaves the bake standing, as it should. `resolveEnd` additionally filters
  `finishOrder` to captains who still hold a full recipe: redundant today, but the cost of being
  wrong is exactly the bug above.
- **A finished captain's ship does not fade** (Wyatt, 2026-08-06: *"they don't need to fade out
  visually when they dock at Tortuga — they are still active players"*). It used to drop to 45%
  opacity, which read as "out of the game". They never were: they are a legal target sitting on the
  most valuable cargo at the table, and now that a raid actually un-bakes them, a ghosted ship says
  "nothing to do here" about the one ship worth attacking. The tell that somebody is home is that
  they are parked on Tortuga, plus the 🏁 line that announced it.

## Bot AI — rewritten as planners, not gates

- **Sees only what a player sees**: board, wind forecast, island stock and price, every ship's
  visible cargo and coins. **Never rivals' secret recipes** — it infers what they need from what
  they buy and what they ask for in trades.
- **Plans its full remaining ingredient route** — sequenced by wind, distance, island stock and
  current price — and **re-plans every turn** as the forecast and stock change.
- When a needed ingredient is **out of stock everywhere**, it evaluates all three of: opening a
  table-wide trade, planning a battle to take it (intercepting the holder over several turns), and
  hoarding leverage other captains will want — and picks whichever is most likely to work.
- **Trade pricing is opportunity cost**: what an offer is worth versus how many turns it would take
  to replace that crate itself, **plus a denial premium** when it can tell the asker is close to
  finishing.
- The five archetypes (pirate, trader, balanced, rusher, monopolist) survive as **biases on the one
  planner** — different taste, same brain.
