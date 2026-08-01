# Determinism Fixture Re-Record — QUEUED FOR NEXT

`docs/DETERMINISM-RERECORD.md` is the closed historical record of the Phase 14 re-record; this is
its companion, holding the engine changes that are **specified but deliberately not yet made**,
waiting for the next time a gated re-record happens anyway.

Written 2026-07-30 at Wyatt's instruction: *"please add the engine changes in for the next time we
do a re-record, to make all engine-based calls consistent and logical."* Nothing in this file has
been applied. `src/engine/index.js` was left byte-identical by the quick task that wrote it
(`.planning/quick/20260730-playtest-notes-fixes`), which is the entire point — this work waits.

Every location below was verified against source at `9dd36c0`.

## 1. The principle, and how close the engine already is

**Engine events carry DATA; the UI renders it.**

Across all 28 `this.ev({...})` sites in `src/engine/index.js`, the field inventory is `t`, `p`,
`got`, `winner`, `a`, `heads`, `b`, `kind`, `gave`, `d`, `windStreak`, `other`, `ing`, `dir` —
plus the shorthand-form fields on the battle event (`rounds`, `spoil`, `spoilIng`, `flips`,
`downwind`, `src/engine/index.js:581`).

Every one of them is data except **`gave`** and **`spoil`**. Two anomalies in the whole contract.
They are the exception, not the norm — which is exactly why they read as badly designed. Wyatt,
on being told the battle spoil's wording came from the engine: *"why does this need to touch the
engine, but all our other narration doesn't? that seems badly designed, or worth rechecking."*

## 2. Violation 1 — `spoil` carries rendered display text

`src/engine/index.js:566-574`. Every branch assigns a display string:

| Line | Value | What it is |
|------|-------|------------|
| `:571` | `"5 coins"` | prose |
| `:574` | `take+" coins (all they had)"` | prose, with a parenthetical |
| `:568` | `take+"c (raider)"` | prose, in a different and inconsistent format |
| `:572`, `:573` | `ilabelImg(i)` | literal HTML `<img>` markup |

**Replace with data:** a numeric `spoilCoins` for the coin cases.

**`spoilIng` already exists** as a proper data field for the crate cases (`:572`, `:573`, emitted at
`:581`), so the crate half needs **no new field at all** — only the removal of `spoil`.

## 3. Violation 2 — `gave` carries rendered display text

`src/engine/index.js:455`, on the buy-kind trade event:

```js
this.ev({t:"trade",a:p.idx,b:q.idx,gave:price+" coins",got:ge,kind:"buy"});
```

**Replace with data:** a numeric price field. Note the swap-kind sibling at `:450` already emits
`gave:gi` — an ingredient key, proper data. Only the buy kind is wrong, and only because a display
string was the shortest path at the time.

## 4. Violation 3, the structural one — the `ilabelImg` import

`src/engine/index.js:8` imports `ilabelImg` from `../shared/index.js`. It goes with them.

The module's own header (`:1-6`) states the contract: *"Holds no DOM, `window`, Firebase,
wall-clock, or unseeded-random access — pure simulation logic only."* A module with that contract
should not be **able** to build HTML. Removing the import is what turns that contract from a
convention someone could quietly break into a structural fact.

`scripts/engine_contract_check.js` should gain an assertion that no HTML-building helper
(`ilabelImg`, `iconImg`, `ilabel`, `ingImg`) is imported into the engine tier. That file already
maintains a shared-export allow-list containing exactly these names (`:212`), so the assertion has
the vocabulary it needs already.

## 5. Ride-along — delete the dead `asym`/raider branch

`src/engine/index.js:567-568`, the `"2c (raider)"` string.

**Verified unreachable.** `asym:false` is hardcoded in `roundCfg` (`:821`) and set nowhere in the
codebase: `grep -rn asym src/ index.html scripts/` returns only the two read sites
(`src/engine/index.js:567`, `src/orchestrator.js:566`), the `roundCfg` default, and unrelated prose
uses of the word "asymmetry".

It is already recorded in `15-CONTEXT.md`'s Deferred Ideas, and it carries a player-facing string
that can never render — exactly the dead-copy class D-33/D-34/D-40 exist to eliminate. A re-record
is the cheap moment to remove it.

**Until it is removed it must not be broken.** The 2026-07-30 interim UI fix (section 6) passes the
raider spoil through untouched specifically because it contains no `"coin"` substring and would
otherwise be misrendered. A config-dead branch is still a branch.

## 6. The UI-side counterpart — do both halves together

`src/ui/util.js`'s `battle` builder currently renders the spoil through a `spoilText` const. When
the engine changes, that const must render from `spoilIng` / `spoilCoins` instead.

**The 2026-07-30 interim display-layer fix becomes redundant at that point and must be REMOVED, not
left beside the new path as a second way of spelling the same thing.** It exists only because the
engine could not be touched without a re-record. Its three cases (crate → `ilabelImg(spoilIng)`,
coin → `fmtItem(spoil)`, everything else → pass through) collapse to two once `spoilCoins` exists,
and the pass-through case disappears entirely once section 5's raider branch is gone.

Also needing updates in the same pass:

- `art-review/narration-core.js:392-398`, `VARIANTS.battle` — its three fabricated events set
  `spoil` (`"5 coins"`, `"2 coins"`, `ilabelImg("cocoa")`) and must move to the new field names.
- `art-review/narration-core.js:266-278`, `assertBattleEventInvariants` — the D-51 paired-field
  invariant is written in terms of `spoil === ilabelImg(spoilIng)`. That invariant is what makes the
  crate case safe today; it must be restated against the new fields rather than deleted, because it
  is the check that catches a card rendering the right line with impossible values.
- `art-review/narration-table-baseline.json` — `table:battle`, `table:battle~cleaned` and
  `table:battle~crate` will need re-pinning again, with the reason stated in `_provenance` as usual.
- `scripts/narration_test.js` — its battle fixtures construct events with `spoil`/`spoilIng` pairs.

## 7. The cost, plainly

Sourced from `docs/DETERMINISM-RERECORD.md`, which paid it once.

Any change to what `src/engine/index.js` emits into the event stream — **including adding or
renaming a field on an existing event** — invalidates all 31 fixtures in
`scripts/fixtures/determinism/` and requires another gated re-record:

1. A full per-seed attributed divergence report (`node scripts/determinism_diff.js --json`), with
   every divergence attributed to a named cause.
2. A blocking human decision on that report.
3. Then a single `--capture` run.

There is no cheap version of this. The standing rule in `.planning/STATE.md` says it plainly: the
31-seed corpus is the multiplayer lockstep oracle, and UI-tier fixes are preferred precisely so this
cost is not incurred. That is why the 2026-07-30 spoil fix shipped in the UI tier and why this file
exists instead of a commit.

**This is one pass that does all of the above together, not four separate engine changes.** The
corpus is re-recorded exactly once, so every queued item must land before that single capture.

## 8. Ride-along — bot intelligence (`.planning/quick/20260730-bot-intelligence/PLAN.md`)

Added 2026-07-30 (G20). That plan's engine-side improvements also need a gated pass, and it already
names **this file** as one of its artifacts — so the two are the same pass, not two.

**One re-record, not three.** The engine-purity work in sections 2–5, the bot-intelligence work, and
STORM-02 (section 9) must all land BEFORE the single `--capture` run described in section 7. Landing
any one of them alone spends the whole cost for a fraction of the benefit.

One item from that plan is already **done and needs no re-record**: it planned to FLAG the
`botTurn`/`takeTurn` rim-escape parity gap as a todo
(`.planning/todos/pending/bot-rim-escape-live-parity.md`, never written). Wyatt ruled on 2026-07-30
that it should be FIXED instead — *"A boxed-in bot SHOULD escape via the rim"* — and G18 fixed it
UI-tier by having `botTurn` call the engine's existing `boxedIn()`/`rimEscape()` methods. The engine
was not touched and the fixtures did not move. **That task is now "verify already fixed", not work.**

## 9. NOT QUEUED HERE — the trade-wind rim sweep (G14). Read this before adding it back.

An earlier framing queued "the intermediate rim-sweep squares in the event stream" in this batch, on
the assumption that a guest could not derive them. **That assumption was wrong, and the item is
deliberately NOT in this file.** G14 shipped square-by-square trade-wind sweeps on the host AND the
guest on 2026-07-30 **without an engine change** (`src/ui/flow.js`'s `rimSweepPath()` /
`animateRimSweepIfAny()`, `src/ui/board.js`'s `paintShipAt()`).

**The distinction that was got wrong, in one sentence — this is the thing worth writing down:**

> A **storm push is SIMULATION** — its intermediate squares depend on collisions, docks, other ships
> and the aground ladder, none of which a guest can replay from a single event, so those squares
> genuinely have to be broadcast. A **rim sweep is pure GEOMETRY** between two known points on a
> STATIC ring that every client already holds (`rimCellInfo`, built once at construction from board
> layout), so it needs nothing broadcast at all.

They look alike — a boat travelling several squares that a guest sees as a jump — and that surface
resemblance is what got them conflated. They are different classes of problem.

**STORM-02 stays parked on its own merits** (see `.planning/STATE.md` §Deferred Items): it really is
the simulation case, it really does require the event stream, and Wyatt accepted it as-is at Phase 14
close. If it is ever taken up, it rides in this same single pass. **Do not re-queue the rim sweep,
and do not treat STORM-02 as solved because G14 shipped.**
