# PREDICTION — Step 1, ONE DIRECTOR beachhead (written BEFORE any measurement)

Written 2026-08-31 by the builder, before opening `util.js`, `board.js` or the gate.

## What I am about to do
1. New pure file (L3): derives the active seat from `events` + index. No DOM, no appState writes,
   no `src/ui/` imports.
2. `applyActiveSeat` (`src/ui/util.js:1840`) and `board.js`'s private backward walk (:1738-1744)
   both call it. One derivation, not three.
3. The 16 direct `setActor()` calls (orchestrator 533,723,770,822; flow 273,630,740,1511,1873,
   1973,2022,2123,2527,2574,2811,2964) route through `applyActiveSeat`; `setActor` leaves the
   exports.
4. `scripts/qa/whose_turn_one_fact_check.mjs` lands RED, ends GREEN, keeps exit 2 INCONCLUSIVE.

## What I expect
- **P1** The new file has ZERO runtime effect. `npm test` count unchanged except +1 gate (54→55) or
  the gate is already counted; every existing gate still passes.
- **P2** `board.js:1738`'s walk and the event-stream derivation are NOT textually identical —
  board's walks `turn|ovens|bake`, the measurer's walked everything carrying `p`. Reconciling them
  is the real risk in this step. I expect board.js's narrower filter is the one that must be
  preserved for board.js's own caller, so the pure function will need a **kind filter parameter**,
  not a single hardcoded set.
- **P3** Routing the 16 `setActor()` calls is NOT behaviour-neutral: `applyActiveSeat` also writes
  `S.activeSeat`, which `setActor` alone does not. So after step 3 the ribbon/board will be
  *fresher* at 16 moments. That is the point of the step, and it is the one place a visible change
  could appear.
- **P4** `mode_fork_check` and `host_guest_parity_check` stay green — the parity file already names
  `setActor` as "superseded by applyActiveSeat", so removing it from exports moves the code toward
  what that gate already describes.

## What would prove me WRONG
- **P1 wrong** if any existing gate changes verdict. Then the "pure" file is not pure, or I moved
  behaviour I claimed not to.
- **P2 wrong** if board.js's walk turns out to accept the same kinds as the measurer's — then no
  parameter is needed and I over-engineered.
- **P3 wrong** if `applyActiveSeat` turns out to be a strict superset with no ordering hazard AND
  no call site depended on `S.activeSeat` staying stale. If some call site DID depend on staleness
  (e.g. sets the actor to a player who is not the active seat, deliberately — a narrator, a
  spectator label), routing it through `applyActiveSeat` is a REGRESSION and I must leave that site
  alone and say so.
- **P4 wrong** if the parity gate reads `setActor(` textually and fails when the token disappears.
  Then the gate needs updating in the same commit, and I must say the gate moved.
- **Whole step wrong** if `applyActiveSeat` cannot be expressed over the event stream because some
  caller passes a seat that is NOT derivable from events (a lobby seat, a pre-game seat). Then the
  pure function is a *second* source, not the single one, and step 2 is unbuildable as stated.

## What this is NOT
Structural tidying and a foundation. **No player will see a fix here.** The divergence this was
meant to cure was measured and does not exist (200 samples, 0 divergences).
