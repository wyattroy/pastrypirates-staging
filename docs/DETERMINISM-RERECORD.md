# Determinism Fixture Re-Record — Phase 14

> **This file is a closed historical record of the Phase 14 re-record.** Engine changes SPECIFIED
> but not yet made, queued for whenever the next gated re-record happens, live in its companion:
> [`DETERMINISM-RERECORD-NEXT.md`](DETERMINISM-RERECORD-NEXT.md). Read that one before starting a
> re-record — the corpus is captured exactly once, so everything queued must land first.

D-16's surviving requirement: document what changed and why alongside the new fixtures. This file
is that record. It is started here, in 14-01, while the tracer's evidence is fresh, and completed
in 14-04 immediately before the single `--capture` run that rewrites the corpus.

## 1. Why the corpus is being re-recorded

Three decisions perturb the 30-seed golden fixture corpus (`scripts/fixtures/determinism/`). All
three land BEFORE the single `--capture` run in 14-04. The corpus is re-recorded exactly once.

- **D-15** — the all-bot simulator's `takeTurn` currently applies only the storm's first gust (2
  squares); the live game applies both gusts (up to 4 squares). Aligning the simulator to the real
  game means rolling `windNow2` in `play()` and applying a second `windPush`, which consumes one
  additional `this.r()` call per stormy round — every seed with at least one storm produces a
  different RNG sequence from that round forward. (Landed in 14-03.)
- **D-18** — `leeward()` only checked `isIsland()`, so Tortuga (home) cast no wind shadow, unlike
  every other island. Fixed in 14-01 (this plan): the upwind square is now also tested against
  `isHome()`. This changes `sailBudget()` (9 → 7) for any ship immediately downwind of home, which
  changes bot pathfinding (`stepToward`'s Dijkstra), which cascades into `dock`/`trade`/`fish`/
  `battle` events — not just storm events. This is the single largest fixture-perturbing change in
  the phase.
- **D-21** — the `moored` event gains a `reason` field (`"justDocked"|"dock"|"home"`) so the
  narration can distinguish three previously-conflated causes. Adding a field to the event changes
  `JSON.stringify(e)` the moment any `moored` event fires, so every seed with at least one `moored`
  event gets a new hash. (Landed in 14-03.)

## 2. What the old oracle proved, and what is lost

The current baseline (captured once, Phase 7) proves byte-for-byte "nothing about engine behavior
changed" for any commit since capture, over 30 seeds covering every required mechanic. After
`--capture` runs in 14-04, that specific guarantee — "identical to the Phase 7 baseline" — no
longer exists; the new corpus becomes the guarantee going forward, for changes after 14-04.

**Recovery path if this needs to be undone:** revert the D-15/D-18/D-21 engine changes AND restore
`scripts/fixtures/determinism/manifest.json` + all `seed-*.jsonl` files from git history (the
commit immediately before 14-04's `--capture`). Both halves are required — reverting the code alone
leaves fixtures that no longer match, and restoring old fixtures alone re-introduces stale-baseline
false failures against the still-changed code.

## 3. Tracer findings (D-18 alone)

Measured this session by `node scripts/determinism_diff.js --json`, run immediately after landing
the D-18 `leeward()` fix and before any other engine change in this phase:

- **Divergent seeds: 19 of 30.** 11 seeds are byte-identical to the Phase 7 baseline (12348, 12350,
  12355, 12356, 12358, 12359, 12360, 12362, 12367, 12369, 12371) — every seed where no player ever
  sat leeward of home in a way that changed a routing decision.
- **Structural divergences: 19 of 30** — identical to the divergent-seed count; every divergence
  found this run is structural (no seed's only differing key was in an ignored-additive set, since
  `--ignore-keys=wind2` reports the same 19 — `wind2` never diverges yet in this plan's scope,
  because D-15 has not landed).
- **Divergent-line histogram by event type** (`summary.byEventType`, line counts, not seed counts):
  `turn` 1004, `state`-bearing `tokens` deltas aside, `wind` 2004 (key-delta, see below) —
  concretely by event `t`: `turn` 1004, `sail` 706, `fish` 609, `dock` 315, `newround` 234,
  `battle` 52, `windmove` 63, `finish` 23, `end` 21, `__final__` 21, `battleflee` 13, `blownOut` 22,
  `moored` 29, `trade` 32, `tradewind` 27, `dodge` 10, `blocked` 8, `bakeoff` 3, `anchor` 1,
  `aground` 1, `shipwrecked` 1.
- **Divergent-line histogram by differing key** (`summary.byKey`): `state` 3181, `tokens` 2547,
  `t` 2419, `wind` 2004, `p` 2143, `round` 1621, `storm` 1174, `heads` 1160, `got` 550, `ing` 488,
  `dir` 357, `windStreak` 349, `winner` 149, `flips` 115, `rounds` 115, `downwind` 114, `d` 113,
  `spoil` 92, `spoilIng` 92, `b` 65, `gave` 61, `kind` 61, `players` 28, `a` 176, `other` 17.
  `state`/`tokens`/`round`/`wind`/`storm` dominate because every event carries a full per-player
  state snapshot (`Game.ev()`) — once one player's `pos` diverges from a routing change, every
  subsequent event's `state` field diverges too, for the rest of that seed's playthrough. This is
  expected cascade, not 19 independent bugs.
- **No divergence in `battle`/`trade`/`dock`/`fish` event TYPES beyond what routing change would
  produce** — the presence of these types in the histogram is expected (D-18 changes where/when
  bots dock, trade, and fight by changing their pathfinding cost), not a sign of an unrelated
  regression. No new event type appears in one run and not the other, and no seed shows a
  divergence isolated to an event type storm-routing cannot plausibly touch (e.g., a divergence
  confined only to `bakeoff`/`finish` with nothing upstream would be a red flag; none was observed).

## 3b. 14-03 findings (D-15 + D-21 landed, on top of D-18)

Measured this session by `node scripts/determinism_diff.js --json`, run immediately after landing
both of this plan's engine changes (D-15's two-gust simulator alignment, D-21's `moored` `reason`
field) on top of 14-01's D-18 `leeward()` fix. All three fixture-perturbing decisions for this
phase are now in the tree, before the single `--capture` in 14-04.

- **Divergent seeds: 30 of 30** (up from 19/30 after D-18 alone) — every seed now diverges.
  Expected: D-15's `windNow2` roll consumes one additional RNG draw on every stormy round, in
  every seed that ever rolls a storm across a 150-round-cap playthrough, which is effectively all
  of them.
- **Structural divergences: 30 of 30.** `preStormStructuralFailures: 27` — 27 of the 30 seeds now
  diverge before their first storm round, same D-18 wind-shadow/routing mechanism 14-01 already
  documented in Section 4 below (unchanged by this plan; D-15/D-21 only ever fire on/after a storm
  round, so they cannot be the cause of a *pre-storm* divergence — they can only widen the
  divergence further from that seed's first storm round onward).
- **`wind2` is now genuinely attributed as additive**, not absent: `summary.byKey.wind2: 7816`
  lines — every event in every seed gains a `wind2` field (`null` on calm rounds, a direction
  letter on stormy ones), confirmed via `determinism_diff.js --ignore-keys=wind2`, which still
  reports all 30 divergent seeds with the SAME per-seed divergence count as the un-ignored run —
  i.e. `wind2`'s presence never changes the divergent/non-divergent verdict for any seed, exactly
  as expected for a purely additive serialization delta layered on top of D-18's real behavioral
  cascade.
- **`reason` (D-21) is attributed and small**: `summary.byKey.reason: 157` lines, `byEventType.moored:
  159` — every `moored` event across the 30-seed corpus now carries a `reason` in
  `{justDocked, dock, home}`; 157 of 159 moored events show a `reason` key-delta against the old
  (reason-less) fixture line (2 already happened to diverge on other keys in the same line and so
  don't separately register `reason` as "new" in that line's diff — still correctly tagged, just
  not double-counted).
- **No divergence confined to an event type storm/wind-routing cannot plausibly touch.** The full
  `byEventType` histogram (`newround`, `turn`, `sail`, `fish`, `battle`, `dock`, `anchor`,
  `blocked`, `windmove`, `dodge`, `blownOut`, `moored`, `battleflee`, `trade`, `finish`,
  `tradewind`, `end`, `__final__`, `anchorHold`, `bakeoff`, `aground`) is the same cascade shape
  14-01 already found for D-18 alone (state/tokens/round/wind/storm dominate because one player's
  `pos` diverging cascades through every subsequent event's full-state snapshot) — no new event
  TYPE appears that wasn't already explainable, and no seed's divergence is isolated to
  `battle`/`trade`/`dock`/`fish` alone with nothing storm/routing-related upstream.
- **D-26's replacement criterion (attribution, not narrowness) is satisfied for both of this
  plan's changes**: `wind2`'s additive nature is directly provable via `--ignore-keys=wind2`
  (same divergent-seed count with or without it — an additive field, not a behavioral one), and
  `reason`'s scope is directly bounded to `moored` events only (`byEventType.moored` count and
  `byKey.reason` count are of the same order, ~157-159, versus thousands of `state`/`tokens`/`wind`
  deltas from the D-18 cascade) — neither change introduces an unexplained divergence outside its
  own known mechanism.

## 4. The D-26 criterion, honestly stated

D-26's literal criterion: no seed diverges before its first storm round (`preStormStructuralDivergence`
must be `false` for every seed). **Implemented exactly as worded, run for real, and it FAILS for
16 of the 19 divergent seeds:** 12345, 12346, 12347, 12349, 12352, 12354, 12361, 12363, 12364,
12365, 12366, 12368, 12370, 12372, 12373, 12374 all show `preStormStructuralDivergence: true`.
Only 3 divergent seeds (12351, 12353, 12357) diverge exclusively from their first storm round
onward.

**The measured mechanism, exactly as anticipated in planning:** every player spawns on a Tortuga
berth (`src/engine/index.js:206-209`, one of the four squares immediately N/S/E/W of home), so from
round 1 at least one player sits directly downwind of home whenever the wind blows from that
direction. `leeward()` — and therefore `sailBudget()` — is a **wind** effect that applies every
round, not a **storm** effect; D-18 makes it apply correctly for the first time, and it bites on
calm rounds exactly as much as stormy ones. Concretely, seed 12345's first structural divergence is
at line 7, a `sail` event in round 1 with `storm:false` — a bot's position differs by one square
(`[9,5]` vs `[9,6]`) purely from the corrected sail budget, 17 lines before that seed's first storm
event at line 24. Three seeds (12354, 12366, 12373) never roll a storm at all in this 30-round
playthrough (`firstStormEventIndex: -1`) yet still diverge — confirming the effect is wind-driven,
not storm-gated.

**This is a finding to report, not a reason to weaken the assertion.** D-26 itself anticipated
exactly this outcome and named the replacement evidence: per-key attribution that separates an
additive serialization delta from a real behavioral change. That attribution is what Section 3
above provides — every divergent line's cause traces to the same one-line `leeward()` change via
the `state`/`pos` cascade, and `--ignore-keys` is available so 14-04's checkpoint can attribute
each divergence to a named decision (D-18 here; D-15/D-21 when they land). **This finding is marked
here as awaiting Wyatt's confirmation at 14-04's checkpoint — it is not presented as settled.**

## 5. Final complete attributed divergence report — 14-04 Task 1

Measured this session, with all three fixture-perturbing changes (D-15, D-18, D-21) in the tree,
by running all four required diff passes over the full 30-seed corpus. No fixture byte was
written in this task.

### 5.1 The four passes, real numbers

1. **`node scripts/determinism_diff.js`** — full human-readable report, 30 seeds, 62,205 lines of
   output (every divergent line in every seed, to the end — never stopping at the first).
2. **`node scripts/determinism_diff.js --json`** — machine report. Top-line summary:
   `divergentSeeds: 30/30`, `structuralDivergentSeeds: 30/30`, `preStormStructuralFailures: 27`
   (this raw number is dominated by D-15's `wind2` field making every seed's line 0 "structural"
   under a no-ignore run — see pass 3 for the isolated, meaningful figure).
3. **`node scripts/determinism_diff.js --ignore-keys=wind2`** — isolates D-15's additive
   serialization delta. `divergentSeeds: 30/30` (unchanged from pass 2 — proves `wind2`'s presence
   never flips any seed's divergent/non-divergent verdict, i.e. it is purely additive, not
   behavioral). With `wind2` no longer forcing every line 0 "structural", `preStormStructuralFailures`
   drops to **16** — the real, attributable figure.
4. **`node scripts/determinism_diff.js --ignore-keys=wind2,reason`** — additionally isolates
   D-21's `reason` field. `divergentSeeds: 30/30` (unchanged again) and `preStormStructuralFailures`
   stays at **16** (`reason` never appears before a seed's first storm round, since `moored` events
   cannot fire before any movement, so it cannot move this figure — confirmed structurally).

### 5.2 Full byEventType / byKey histograms (identical across all four passes — see 5.3 for why)

`byEventType` (divergent line counts, 30-seed corpus, all three changes landed):
`newround:612, turn:2511, sail:1856, fish:1486, battle:127, dock:793, anchor:9, blocked:57,
windmove:204, dodge:36, blownOut:106, moored:159, battleflee:36, trade:74, finish:41,
tradewind:84, end:39, __final__:38, anchorHold:5, bakeoff:4, aground:6`.

`byKey` (divergent line counts per differing JSON key):
`wind2:7816, state:7049, tokens:6365, t:5851, p:5421, wind:5098, round:3960, storm:2901,
heads:2701, got:1197, ing:1081, windStreak:826, dir:836, winner:321, rounds:252, flips:251,
downwind:251, d:250, spoil:202, spoilIng:202, reason:157, b:133, gave:126, kind:126, players:58,
a:383, other:74`.

**Note on why the histograms don't change across ignore-keys passes:** `byEventType`/`byKey` count
every line that has *any* differing key at all, and every key that differs on that line — the
`--ignore-keys` flag only changes whether a line counts as `structural` (used for
`preStormStructuralDivergence`), not whether it's counted in these two histograms. This is
correct tool behavior (confirmed by reading `scripts/determinism_diff.js:90-121`): the histograms
answer "what changed," the structural flag answers "does this specific divergence count toward
the pre-storm assertion."

### 5.3 Attribution — every key, named

- **`wind2` (7,816 lines, spans every event type present in the histogram)** — **D-15.** This is
  the new `windNow2` field `ev()` now writes onto every event (`null` on calm rounds, a direction
  letter on stormy ones). Proven purely additive by pass 3: ignoring it changes zero seeds'
  divergent/non-divergent verdict. This key alone explains why every seed's line 0 differs.
- **`reason` (157 lines, all 157 on `moored`-typed lines — verified programmatically: 0 non-moored
  lines carry `reason`)** — **D-21.** The new `moored` cause tag (`justDocked`/`dock`/`home`).
  `byEventType.moored` is 159 (2 more than 157) because 2 moored lines already diverged on other
  keys from the same routing cascade and so don't separately register `reason` as "new" in that
  line's diff — consistent with 14-03's finding, still correctly tagged, not double-counted.
- **Everything else — `state`, `tokens`, `t`, `p`, `wind`, `round`, `storm`, `heads`, `got`, `ing`,
  `windStreak`, `dir`, `winner`, `rounds`, `flips`, `downwind`, `d`, `spoil`, `spoilIng`, `b`,
  `gave`, `kind`, `players`, `a`, `other`** — **D-18's routing cascade, compounded by D-15's second
  gust.** Every event carries the full per-player `state` snapshot (`Game.ev()`), so the instant one
  player's `pos` diverges from a routing decision (D-18's `sailBudget` 9→7 near home changing
  `stepToward`'s Dijkstra result) or a movement decision (D-15's up-to-4-square push consuming an
  extra `this.r()` draw and shifting the RNG stream), every subsequent event's `state`/`tokens`/
  `wind`/`storm`/`round` fields diverge for the rest of that seed. This is one cascade, not dozens
  of independent causes.

### 5.4 Attribution by event type — every entry in `byEventType`, named

- **`newround`, `turn`** — per-round bookkeeping; diverge because the round-by-round state differs
  (D-18 routing + D-15's extra RNG draw per stormy round).
- **`sail`** — bot sail destinations differ because `sailBudget()` changed near home (D-18) and
  because the push itself now travels up to 4 squares instead of 2 (D-15).
- **`fish`, `dock`, `trade`, `battle`, `battleflee`, `tradewind`** — consequence events. A bot that
  routes to a different square fishes/docks/trades/battles differently there. This is the
  legitimate cascade D-26 named as the reason D-16's narrow "storm-only" criterion had to be
  replaced, not a sign of an unrelated regression.
- **`windmove`, `dodge`, `blownOut`, `anchor`, `anchorHold`, `aground`, `blocked`** — storm-push
  outcome events, directly caused by D-15's second gust (more squares travelled, more outcomes to
  land on) and by D-18 changing which squares are leeward/reachable.
- **`moored`** — D-21's `reason` field (157/159 lines) plus the same D-18/D-15 state cascade on the
  remaining lines.
- **`finish`, `bakeoff`, `end`, `__final__`** — endgame summary events. Checked directly: the 38
  divergent `__final__` lines differ only on `players`, `round`, `t`, `winner`, `heads`, `p`,
  `state`, `storm`, `tokens`, `wind`, `got`, `ing` — every one of these is a state-cascade field
  with a routing explanation (different final positions/coin counts/round-of-completion/winner
  fall out of the whole-game cascade). No `__final__` line diverges on a field with no upstream
  routing explanation.
- **No event type in this histogram is new or unaccounted for.** Every type listed
  (`newround, turn, sail, fish, battle, dock, anchor, blocked, windmove, dodge, blownOut, moored,
  battleflee, trade, finish, tradewind, end, __final__, anchorHold, bakeoff, aground`) is part of
  the engine's existing, pre-phase event vocabulary (cross-checked against
  `REQUIRED_EVENT_TYPES` in `scripts/determinism_baseline.js:41-49` and the engine's known `ev()`
  call sites) — this phase changed *which* squares/outcomes fire these events, not *what* event
  types exist.
- **Spot-checked the `other` key** (74 lines, appears/disappears on `blocked`/`fish` lines) — this
  is an existing field (the other player's seat index on a `blocked` event), not a new or mystery
  field; it appears/disappears at a given line index because a different event type now occupies
  that JSONL line position after the routing cascade shifted the sequence of actions. Not an
  anomaly.

### 5.5 Per-seed `preStormStructuralDivergence` — measured explanation

Isolating D-18/D-15's real behavioral divergence from D-15/D-21's additive fields
(`--ignore-keys=wind2,reason`), **16 of the 30 seeds diverge structurally before their first storm
round**: 12345, 12346, 12347, 12349, 12352, 12354, 12361, 12363, 12364, 12365, 12366, 12368,
12370, 12372, 12373, 12374.

**This is the identical 16-seed set 14-01 already found and documented in Section 4 for D-18
alone** (measured there against only 19 divergent seeds, before D-15/D-21 landed). Landing D-15 and
D-21 on top of D-18 did not change which seeds diverge before their first storm round, or how many
— strong corroborating evidence that the pre-storm mechanism is exactly what Section 4 already
named (every player spawns on a Tortuga berth; `leeward()` is a wind effect that fires every round,
not a storm-gated one) and that D-15/D-21 contribute nothing to this specific figure, exactly as
expected since `windNow2` and `moored`'s `reason` can only ever appear on/after a round with
movement that already happened — they cannot cause a divergence to appear *earlier* than it already
did under D-18 alone.

Three seeds never roll a storm at all across this 30-round-cap playthrough
(`firstStormEventIndex: -1`) yet still diverge: 12354, 12366, 12373 — the same three 14-01
identified, confirming again that this mechanism is wind-driven, not storm-gated, and unaffected by
D-15/D-21.

**`preStormStructuralDivergence: true` for 16/30 seeds is the honest, expected result of D-26's
literal criterion, not a new finding requiring separate action** — D-26 explicitly anticipated this
outcome (Section 4) and named the replacement evidence (this section's per-key attribution) as the
thing actually relied upon. Nothing here is being weakened; it is being reported as designed.

### 5.6 Unattributed divergences

**unattributed divergences: none.** Every divergent event type in `summary.byEventType` and every
divergent JSON key in `summary.byKey` is attributed above to exactly one of D-15, D-18, or D-21 (or,
for the great majority of lines, to the D-18/D-15 cascade acting jointly through the shared `state`
snapshot). No seed shows a divergence confined to `battle`/`trade`/`dock`/`fish` with nothing
storm/routing-related upstream; no `__final__` line diverges on a field without a routing
explanation; no event type outside the engine's existing vocabulary appears; the `other` key's
appearance/disappearance is a known field at a shifted line position, not a new field.

### 5.7 What Task 2 must present, restated for the checkpoint

- Three named causes (D-15, D-18, D-21) and what each changes (Section 1).
- Divergent-seed count (30/30), the event-type histogram, and the key histogram (5.2 above).
- The attribution mapping every event type/key to a cause (5.3, 5.4), with the explicit
  `unattributed divergences: none` line (5.6).
- The honest D-26 finding: the literal pre-storm assertion fails for 16/30 seeds, for a fully
  measured and named mechanism (5.5), and D-26's own replacement evidence (per-key attribution) is
  what is actually relied upon — Wyatt must confirm that substitution explicitly.
- The unresolved VERIFY-02 probe row, stated as unresolved (per the plan's `<flagged_assumptions>`).

## 6. Verdict

**DECIDED: capture-now — Wyatt, 2026-07-26.**

Presented with Section 5's full attributed divergence report (30/30 divergent seeds, the
`byEventType`/`byKey` histograms, the three-cause attribution mapping every entry to D-15, D-18,
or D-21, and the explicit `unattributed divergences: none` finding), Wyatt selected **capture-now**
and explicitly confirmed the D-26 criterion substitution: the original "nothing differs before the
first storm" assertion is superseded by the per-key attribution evidence (Section 5.3-5.6), on the
stated grounds that the Tortuga wind-shadow fix (D-18) was never storm-gated — `leeward()` is a
wind effect applying every round, and every player spawns on a Tortuga berth (Section 4/5.5) — so
the original assertion was unachievable by construction, not by defect. Wyatt was shown, and
approved on the basis of: the three-cause attribution table (5.3-5.4), the zero-unattributed
finding (5.6), and the explicit warning that the old (Phase 7) oracle is destroyed by capture and
cannot be regenerated without reverting D-15/D-18/D-21 and restoring fixtures from git history
(Section 2).

### 6a. Capture attempted — BLOCKED by the corpus's own coverage assertion (not run a second time)

`node scripts/determinism_baseline.js --capture` was run once. It replayed and wrote all 30
`seed-*.jsonl` files, then its own coverage assertion (`:127-131`) failed BEFORE writing
`manifest.json`:

```
FAIL capture: corpus does not cover required event type(s): shipwrecked
```

No manifest was written. The 30 rewritten seed files were reverted with `git checkout --` back to
the last committed (old Phase 7) baseline, so the repo is clean and the old oracle is intact —
`--verify` still reports 30/30 FAIL against it exactly as before this attempt, confirming nothing
was silently buried. **`--capture` has not run a second time and will not, pending Wyatt's decision
below** — the plan's own prohibition is "do not weaken `REQUIRED_EVENT_TYPES` to make a capture
pass; a genuinely absent mechanic is a finding," and Wyatt's resume instruction was explicit: if
anything other than green comes back, stop and report rather than patch around it.

**Investigation, so the finding is a measured one rather than a guess:**

- `shipwrecked` fires in exactly one narrow compound branch of `windPush` (`src/engine/index.js:296`):
  a ship pushed onto land, with no valid `moored` reason, on the FIRST land-hit of that turn's
  combined gust (not gated behind two-gust `dodgedOnce` sharing — it can fire on gust 1 same as
  before D-15), where the player has zero coins, zero ingredients in hold, AND loses a coin flip.
  It is a rare, multi-condition tail event, not a mechanic D-15/D-18/D-21 removed or gated.
- In the OLD (Phase 7) 30-seed corpus, exactly **one** seed produced it: `seed-12361.jsonl`
  (`coverage.shipwrecked: 1` in the committed manifest).
- Seed 12361 is one of the 16 seeds Section 5.5 already documented as diverging structurally
  BEFORE its first storm round (the D-18 Tortuga wind-shadow / berth-spawn mechanism). Its entire
  RNG-consuming trajectory shifts from round 1 onward, and D-15 layers a further per-stormy-round
  RNG draw shift on top. By the time that seed reaches the point in its (now different) playthrough
  where a player would be pushed onto land, the compound condition (0 coins + 0 ingredients + tails)
  no longer coincides for any player in any of the 30 fixed seeds.
- This is the same cascade mechanism already attributed in Sections 5.3-5.5 (D-18's routing shift
  compounded by D-15's RNG-stream shift) acting on a probabilistic tail event rather than a
  deterministic routing outcome — not a new or unrelated regression, but it is a genuine coverage
  gap in this specific fixed 30-seed corpus, not a hallucinated one.

**What this blocks:** Task 3's acceptance criteria requires the coverage assertion to pass without
editing `REQUIRED_EVENT_TYPES`, over these same 30 seeds. As measured, it currently does not.
Options for Wyatt to choose from (none applied without his answer):
1. Add a supplementary seed to the corpus specifically chosen to still exercise the compound
   0-coin/0-ingredient/tails-on-land branch under the new RNG stream (architectural: grows the
   corpus from 30 to 31 seeds).
2. Authorize an explicitly-documented exception: capture with `shipwrecked` coverage at 0,
   recorded here as a known, attributed gap, revisited later if/when a seed naturally produces it.
3. Investigate further / hold at red pending a different fix.

**Recovery path if capture is later re-attempted and needs undoing:** revert D-15/D-18/D-21 in
`src/engine/index.js` AND restore `scripts/fixtures/determinism/manifest.json` plus all
`seed-*.jsonl` files from the git commit immediately before that capture. Both halves are required
(Section 2).

### 6b. Resolution — add-a-seed, Wyatt, 2026-07-26

**DECIDED: add-a-seed.** Presented with the three options in 6a, Wyatt chose option 1 (add a
supplementary seed) over option 2 (accept the coverage gap) specifically because the guard that
caught this — the `capture()` coverage assertion at `scripts/determinism_baseline.js:127-131` — is
worth keeping: a shipwreck is a real, reachable game outcome and should stay covered by lockstep
verification, not quietly waived. He was told and accepted that VERIFY-02's wording changes from
"(30/30)" to "(31/31)" — same substance (the coverage gate is green against the full corpus),
updated wording to match the corpus's new size.

**Corpus shape chosen:** extend the definition from "30 contiguous seeds" to "the same 30
contiguous seeds (`SEED_BASE=12345`, `SEED_COUNT=30`, unchanged, seedIndex 0..29, personality
rotation unchanged) PLUS one explicit extra seed (`EXTRA_SEEDS` in
`scripts/determinism_baseline.js`), appended — never inserted — so the original 30 keep their
existing seedIndex and stay directly comparable to every prior measurement in this document. The
extra seed's seedIndex is 30, continuing the same
`BOT_STRATS[(seedIndex + seat) % BOT_STRATS.length]` rotation rule. `capture()` and `verify()` both
iterate base-range-then-extras in this fixed order (implemented this session).

**Seed search — first-match, bounded, reproducible.** A throwaway script
(`/private/tmp/.../find_shipwreck.mjs`, not committed) replayed candidate seeds starting at 12375
against the CURRENT (post-14-01/14-03) engine, each evaluated at the fixed seedIndex 30 (the
seedIndex the chosen seed will actually occupy once added — not the seedIndex the search loop
happened to reach), and reported which produced at least one `shipwrecked` event.

- Search range: seeds 12375 upward.
- Candidates scanned: **5** (12375, 12376, 12377, 12378, 12379).
- First qualifying seed: **12379** — the first candidate in the scanned range to produce a
  `shipwrecked` event at seedIndex 30, chosen as first-match rather than picked for any other
  property, so the choice is non-arbitrary and reproducible from this record alone.

**Capture, run once against the extended 31-seed corpus:**

```
node scripts/determinism_baseline.js --capture
```

`capture()`'s own coverage assertion (`:127-131`) passed without `REQUIRED_EVENT_TYPES` being
edited — `shipwrecked` remains in the required list, satisfied by seed 12379's single occurrence
(`manifest.coverage.shipwrecked: 1`).

**Verification, against the new 31-seed manifest:**

- `node scripts/determinism_baseline.js --verify` — **31/31 PASS** (all 31 `PASS` lines present;
  `SOURCE: unchanged`).
- `node scripts/determinism_diff.js --assert-clean` — `PASS --assert-clean: 0 seeds diverged from
  the committed corpus.`
- `npm test` — all nine gates green (determinism, engine contract, dlog replay, net registry, net
  contract, state contract, module graph, ui contract, no-undef), exit code 0.
- `node scripts/hail_ranking_test.js` — PASSED, 0 failing checks.
- `node scripts/storm_moored_reason_test.js` — PASSED, 0 failing checks.

**New manifest identity, named per D-16's surviving requirement:**

- `capturedAt`: `2026-07-26T22:17:01.251Z`
- `engineSourceHash`: `a9b4dde97e20625198ddeb0fae834627f886cb76aed312caf1d715e79fe48006`
- `seedCount` (base range): `30`
- `extraSeeds`: `[12379]`
- `perSeed.length` (total corpus): `31`
- `coverage.shipwrecked`: `1`

**Recovery path if this add-a-seed extension needs undoing:** revert the `EXTRA_SEEDS`/
`allSeedsWithIndex()` change in `scripts/determinism_baseline.js` back to the plain 30-seed loop,
AND restore `scripts/fixtures/determinism/manifest.json` plus all `seed-*.jsonl` files from the git
commit immediately before this capture (which also reverts D-15/D-18/D-21 per Section 2/6a if the
underlying engine changes are being undone too — the two recoveries are independent: this one only
undoes the corpus-size extension, Section 2's undoes the engine behavior it re-recorded against).

Both of Wyatt's decisions in this document are now closed: Section 6 (capture-now, with the D-26
criterion substitution confirmed) and this section (add-a-seed, resolving the coverage gap that
`capture-now` then surfaced). The determinism gate is green again on the new 31-seed baseline.
