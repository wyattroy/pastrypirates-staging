# FINDINGS — Step 1, ONE DIRECTOR beachhead. Builder, 2026-08-31.

## SIZE, FIRST AND PLAINLY
**Nothing here is a fix a player will see.** This is structural tidying and an architectural
foundation. The host/guest divergence step 1 was scoped against **was measured this morning and
does not exist** — 200 paired samples in a real two-browser crew room, 0 divergences in `curSeat`,
0 in the ribbon glow. Anyone reporting this as a user-facing win is misreporting it.

What it buys: the fact "whose turn is it" went from **17 writers and 5 private derivations** to
**1 writer and 1 walk**, and the purity of the new tier is enforced by a gate rather than promised.

## WHAT SHIPPED
- **`src/shared/storyboard.js`** — new. Pure: `deriveActiveSeat(events, playhead, opts)`,
  `normalizeSeat(seat, seatCount)`, and the named constants `TURN_ESTABLISHING`, `TURN_BOUNDARY`,
  `TURN_ONLY`, `DEFAULT_LOOKBACK`.
  **Sited in `src/shared/` on purpose:** `scripts/module_graph_check.js` already asserts
  *"shared imports nothing from src/ (leaf tier)"*, so it cannot reach the DOM, `appState`, the
  network or `src/ui/` without failing the build. Purity gated, not remembered.
- **`src/ui/board.js`** — `render()`'s private walk and `activeTurnSeat()` both call it.
- **`src/ui/util.js`** — `applyActiveSeat`'s guards are now `normalizeSeat`; `currentTurnSeat()`
  calls the shared walk; **`setActor` is no longer exported.**
- **16 direct `setActor()` calls** → `applyActiveSeat` (orchestrator 533,723,770,822;
  flow 273,630,740,1511,1873,1973,2022,2123,2527,2574,2811,2964).
- **`scripts/qa/whose_turn_one_fact_check.mjs`** in the repo and in `npm test`. Gates 54 → 55.

## THE FOUR STEPS
| step | evidence |
|---|---|
| RED first | `.claude-team/RED-step1.txt` — 16 direct calls, exit 1 |
| change | commit 5e9ee2b1 + the sweep commit |
| GREEN, same gate | `.claude-team/GREEN-step1.txt` — 0 direct calls, exit 0 |
| gate can still fail | reintroduced one direct call in a throwaway tree copy → exit 1 |
| sweep | found **two more** walks, below |
`npm test` **exit 0 at 55 gates**, twice (before and after the sweep). Logs in scratchpad:
`npmtest-step1.log`, `npmtest-step1b.log`.

## THE SWEEP FOUND A FOURTH AND FIFTH DERIVATION
`src/ui/util.js:currentTurnSeat()` and `src/ui/board.js:activeTurnSeat()` — both private backward
walks for the same fact. Both now call the shared walk, passing `TURN_ONLY`, **which keeps their
answer the same answer for every consumer (see the correction below) what it was**: neither has ever known about `ovens`/`bake`, unlike `render()`'s.

**And it exposed two comments that had rotted into lies** (rule 6):
- `util.js` said `currentTurnSeat()` *"mirrors render()'s derivation"*. It does not, and has not
  since `ovens`/`bake` were added to render()'s copy alone.
- `board.js:1443` said render() *"KEEPS its own copy"* of an *"identical inline"* scan. The two
  copies were not identical.
Both corrected in place rather than deleted, with what actually differs.

## FOR WYATT / THE CHECKER — TWO THINGS I DID NOT DECIDE
1. **Should the ripple ring follow the captain at the ovens during a bake?** Today it does not —
   it keeps ringing the previous captain for the whole length of a bake. Widening `activeTurnSeat`
   from `TURN_ONLY` to `TURN_ESTABLISHING` would change that. It may well be right, and board.js's
   own note calls the split *"rule 23's shape exactly"*, **but it changes what a player sees and
   nobody has measured it.** I left it visible at one call site instead of guessing it overnight.
2. **`consumeEvent`'s `applyActiveSeat(e.p)` (orchestrator.js:1601) was deliberately NOT rerouted.**
   `p` rides `turn/sail/dock/pass/attack` — wider than the walk's list. Routing it through the walk
   would NARROW it, on the one event consumer both tiers run, on a path measured correct 161/161.

## ⚠ RISK I AM FLAGGING RATHER THAN JUDGING
**My board.js edit is inside `render()`, whose body `board.js`'s header protects as
"moved BYTE-IDENTICAL to the classic source — do not refactor".** That rule guards the v1.0 BUG-01
Safari storm crash. Two things weigh against the risk and neither is mine to weigh alone:
BUG-01 was a live CSS gradient + mask composited every frame and an animated narration height,
not a seat walk; and render()'s body **already** carries a later deliberate change at exactly this
walk (the `ovens`/`bake` widening, documented in the block above it). **The checker should decide
whether this needs a Safari pass.** It is a loop replaced by a call with identical semantics.

## WHERE I WAS WRONG (against `.claude-team/PREDICTION-step1.md`)
- **P1 — RIGHT but incomplete.** No existing gate changed verdict. I did NOT predict that landing
  the gate would change the declared gate count (54 → 55) or that I would have to edit the gate's
  own anchors.
- **P2 — RIGHT.** `board.js`'s walk is narrower than the event-stream one, and a kind-set parameter
  was needed. It turned out to be needed for **three** callers with two different sets, not two.
- **P3 — RIGHT on mechanism, and no site had to be left alone.** All 16 sites pass a live player
  index, so `applyActiveSeat`'s bounds guard passes at every one. The behavioural delta is real:
  those 16 moments now also move `S.activeSeat`, which `stage.js:1206` draws first. That is the
  intended effect and it is the one place a visible change could appear.
- **P4 — WRONG in a way I did not foresee.** The parity gate was fine, but the **new gate's own
  anchors broke** the moment I added a comment inside `applyActiveSeat` — its 400-char regex window
  no longer reached `setActor(`. It exited **2, INCONCLUSIVE**, exactly as designed: it refused to
  answer about code it no longer recognised. I widened the anchors to 1200 chars and taught the
  exclusions the new spelling; I did **not** turn exit 2 into a pass. Then its two exclusion rules
  fired stale as well (they matched `export function setActor` and `setActor(seat)`), so it briefly
  read RED at 2 on its own definition. Both fixed and re-red-proofed.
- **"Whole step wrong" case — did NOT fire.** Every caller of `applyActiveSeat` passes a derivable
  seat; no lobby/pre-game seat had to be special-cased.

## HOUSEKEEPING
Started no browser, no server, no long-running process. Nothing to kill.
`git diff --name-only` stayed inside `src/shared/storyboard.js`, `src/ui/board.js`,
`src/ui/util.js`, `src/ui/flow.js`, `src/orchestrator.js`, `scripts/qa/whose_turn_one_fact_check.mjs`,
`package.json`, `.claude-team/`. Never touched `main`, `CNAME`, `robots.txt`, `sitemap.xml`.


---

## ⚠ CORRECTION, added 2026-08-31 after the checker's differential

**"byte-for-byte" was overclaimed and is corrected above.** A 20,000-stream differential against the
old walks found **zero mismatches for every consumer** — the answer is unchanged. But **the TYPE of
"no seat" moved**: where an establishing event carries `p === undefined`, the old walks returned
`undefined` and the shared walk returns `null` (`src/shared/storyboard.js:88`).

**No consumer can tell** — `board.js:1741` and `:1449` use `!= null`, `:1571/1586/1602/1614` compare
`activeTurnSeat()===seat` against an integer, and `currentTurnSeat()` has no caller at all. So the
claim "no behaviour changed" holds. **The claim "byte-for-byte" did not, and rule 6 is about exactly
that kind of unearned precision.**

*(Second difference, in the safe direction: the old render() walk indexed `events[i].t` unguarded and
would throw on an out-of-range playhead. The shared walk clamps.)*
