// src/shared/storyboard.js
//
// ============================================================================
// THE STORYBOARD TIER — pure derivations from the event stream to what should be drawn.
// ============================================================================
// Rule 23 (ONE DISPLAY PATH) asks one question at design time: *what makes these two agree?*
// The only durable answer is that there is one of them. This file is where "one of them" lives
// for facts the screen needs: given the event stream and a playhead, what is true right now?
//
// PURE, AND THE PURITY IS GATED RATHER THAN REMEMBERED. This file sits in `src/shared/`, and
// scripts/module_graph_check.js asserts "shared imports nothing from src/ (leaf tier)". So it
// cannot reach the DOM, appState, the network, or anything under src/ui/ without failing the
// build. That is deliberate: a pure derivation with a discipline-only promise of purity is a
// promise that gets broken by the first convenient import.
//
// WHAT IT DOES NOT DO: it never writes anything. The writer for the active seat is
// applyActiveSeat() in src/ui/util.js — one derivation here, one writer there.
//
// FIRST INHABITANT (2026-08-31): the active seat. It was derived in three places; two of them
// now call in here. The third — consumeEvent()'s applyActiveSeat(e.p) — is deliberately NOT
// rerouted, and the reason is in the note on deriveActiveSeat below.

/* WHICH EVENTS ESTABLISH WHOSE TURN IT IS.
   Extracted verbatim from the private backward walk that lived in src/ui/board.js, where the
   list was earned rather than guessed: the walk originally knew only about `turn`, and a bake
   is not a turn — the engine emits {t:"ovens",p} when a captain steps up and {t:"bake",p} for
   each attempt — so during a bake the most recent `turn` was still the PREVIOUS captain's and
   the ring pointed at them. `ovens` and `bake` are in this list because of that. */
export const TURN_ESTABLISHING = Object.freeze(["turn", "ovens", "bake"]);

/* WHERE THE WALK STOPS. A new round is a clean slate: nothing before it establishes whose turn
   it is now. Walking past it would resurrect the previous round's last captain. */
export const TURN_BOUNDARY = Object.freeze(["newround"]);

/* THERE IS NO NARROWER QUESTION ANY MORE — and deleting it is the point.
   TURN_ONLY = ["turn"] lived here so that two callers could ask "who last took the wheel", ignoring
   the bake. Wyatt, 2026-08-31, after being shown that the two answers had split three surfaces
   between them: **"rings follow active player the whole game with no exception including during
   bakeoff. Consistency is a design value."**
   So there is ONE list, and with one list there is nothing to pass — the `establishing` option is
   gone too. That is deliberate and it is the strongest form of rule 23 available here: two things
   that must agree are not kept in step, they are ONE thing, and no future caller can express the
   divergence because the vocabulary for it no longer exists.
   WHAT THIS COST TO LEARN, in one day: the option was introduced to preserve two callers'
   answers byte-for-byte; one caller then forgot to pass it and silently got the wide list; the two
   ring sites disagreed (seat 1 vs seat 3 on [newround, turn p1, sail p1, ovens p3, bake p3]);
   narrowing them reverted T-09 for the captains box; and the fix for all of it was to delete the
   choice. RULE 9's shape exactly — the elegant version deletes code. */

/* HOW FAR BACK. Also carried over from board.js unchanged. A bound, not a tuning constant:
   this walk runs inside render(), and an unbounded backward scan over a long voyage's event
   stream is a render cost that grows with the length of the game. */
export const DEFAULT_LOOKBACK = 80;

/* THE BOUNDS GUARD, shared with applyActiveSeat().
   Two guards, both deliberate, both inherited from util.js's applyActiveSeat:
   - null in, null out. An event carrying no seat (`newround`, `anchorHold`, `windmove`, `storm`,
     `blownOut`) must LEAVE THE INDICATOR ALONE rather than blank it. Measured 2026-08-31: 46 of
     200 samples land on such an event, and the null return is what keeps the ribbon lit.
   - a seat is used as an index into the players array, and the `ev` node is host-authoritative.
     That is the same trust already relied on for board positions, but a bounded index costs
     nothing and a trusted one eventually does (T-02.2-08). */
export function normalizeSeat(seat, seatCount) {
  if (seat == null) return null;
  if (!Number.isInteger(seat)) return null;
  if (!Number.isInteger(seatCount) || seatCount <= 0) return null;
  return seat >= 0 && seat < seatCount ? seat : null;
}

/* THE ONE DERIVATION OF "WHOSE TURN IS IT" FROM THE STREAM.
   A backward walk from the playhead to the most recent event that establishes a turn, stopping
   at a round boundary. Returns a seat index, or null when nothing in range establishes one.

   MEASURED BEFORE IT WAS MOVED (measurer, 2026-08-31, two-browser crew room FQXH, 200 paired
   samples): this walk reproduced the live appState.curSeat 154/154 on the host and 154/154 on
   the guest, returning null on the 46 samples whose event carries no seat. It is not a second
   opinion about the active seat; it is the same answer, computed from the stream.

   WHY consumeEvent() DOES NOT CALL THIS, and do not "converge" it without measuring first.
   src/orchestrator.js:1601 runs applyActiveSeat(e.p) for the event it is consuming, and `p`
   rides turn/sail/dock/pass/attack — a WIDER set than TURN_ESTABLISHING. Routing that call
   through this walk would narrow it, which is a behaviour change to the one consumer both tiers
   run, on a path that was measured correct. Two questions, honestly distinct: consumeEvent asks
   "which seat does THIS event name", this asks "who holds the turn at this playhead". */
export function deriveActiveSeat(events, playhead, opts) {
  if (!Array.isArray(events)) return null;
  const lookback = (opts && Number.isInteger(opts.lookback)) ? opts.lookback : DEFAULT_LOOKBACK;
  /* NO OPTION, SO NO SILENT DEFAULT AND NO DIVERGENCE TO EXPRESS. The `establishing` option was
     removed on 2026-08-31 when the narrower list was deleted (see the note above). It briefly
     THREW when omitted, because an omitted option had silently meant the wider list and that is
     how the ring came to have two answers — but a required argument with exactly one legal value
     is a ceremony, not a guard. Deleting the choice is the guard.
     A caller still passing {establishing:…} is now ignoring nothing and gets the one rule, which
     is correct: there is only one answer to "whose turn is it". */
  const establishing = TURN_ESTABLISHING;
  const start = Number.isInteger(playhead) ? Math.min(playhead, events.length - 1) : -1;
  for (let i = start; i >= 0 && i > start - lookback; i--) {
    const e = events[i];
    if (!e) continue;
    if (establishing.includes(e.t)) return e.p == null ? null : e.p;
    if (TURN_BOUNDARY.includes(e.t)) return null;
  }
  return null;
}

/* ============================================================================
   THE STORYBOARD ITSELF — event in, ordered beats out.
   ============================================================================
   THE PLAN'S STEP 1 (.planning/architecture-one-director.html §07), and its honest size: NO PLAYER
   SEES ANYTHING CHANGE. `sail` is already drawn identically on every client — consumeEvent()
   (src/orchestrator.js:1586) is run by the host's drain AND by watchEvents()'s wire feed, and
   animateSailRoute rides the event being consumed, idempotently. What was missing is not agreement.
   It is that the agreed sequence was written as INSTRUCTIONS and could not be READ.

   WHY THAT MATTERS ENOUGH TO BUILD: a sequence expressed as data can be snapshotted in one process
   with no browser, no network and no Firebase — which is the whole basis of the parity gate the
   plan asks for next. "Do the two clients agree?" stops being a two-browser expedition you hope
   about and becomes a file the build compares. It is also why this must be PURE: two clients run
   the same function on the same event, so their storyboards are identical BY CONSTRUCTION rather
   than by comparison.

   PURITY IS GATED, NOT PROMISED. This file may not import src/state/ or src/ui/ — enforced by
   scripts/module_graph_check.js. So `present()` may read ONLY what it is handed. If a beat ever
   seems to need appState, that is a finding about the beat, not a reason to import: it means the
   beat depends on live render state and does not belong in a storyboard at all.

   A BEAT IS { do, ... } AND NOTHING ELSE DECIDES ORDER. The list's order IS the order. L4 performs
   them in sequence; it never reorders, filters by client type, or inserts its own.

   SCOPE TODAY — strangler fig, deliberately one event kind: `sail` returns a real beat list, every
   other kind returns null, meaning "keep doing what you already do". Converting a second kind is
   what unlocks the golden-file gate; converting all of them is step 6, and only then does the old
   path get deleted. */

/* THE BEAT KINDS THAT EXIST SO FAR. Named as a frozen list so the gate can assert L4 knows how to
   perform every one of them — an unknown beat must be a loud failure, never a silent skip, because
   a skipped beat is precisely a screen quietly not drawing something. */
export const BEAT_KINDS = Object.freeze(["walkRoute"]);

/* present(event, snapshot) -> beats[] | null
   `null` is not "no beats" — it means THIS KIND IS NOT CONVERTED YET, and the caller must fall
   through to the existing path. An empty array would mean "converted, and this event draws
   nothing", which is a different and equally legitimate answer. Keeping them distinct is what
   makes the migration safe to do one kind at a time.

   `snapshot` is unused by the sail beat, which needs only what is already on the event — but it is
   NOT merely reserved, and the note at the return statement below is why: the moment a beat wants
   to validate a seat it needs the seat count, which is engine state and may not be reached for
   from in here. That is the concrete argument for the plan pinning L3's inputs as
   `present(event, engineSnapshot)` AND NOTHING ELSE — the alternative is an import of appState,
   which is the exact back door CEO review 31 named. */
export function present(event, snapshot) {   // eslint-disable-line no-unused-vars
  if (!event || typeof event !== "object") return null;
  if (event.t !== "sail") return null;

  /* THE ROUTE TEST IS THE EVENT'S OWN, NOT A SECOND OPINION. animateSailRoute has always ridden
     "any event carrying a baked route", because Game.bakeDraw only produces draw.route for a move
     it could vouch for — the route must land exactly on the pos baked beside it. A route under 3
     squares is a straight hop with no corner to draw, and the plain render says it better; that
     threshold is the walker's, kept here verbatim rather than re-derived, so converting the kind
     cannot quietly change which sails walk. */
  const route = event.draw && event.draw.route;
  if (!Array.isArray(route) || route.length < 3) return [];

  /* `event.p` VERBATIM, NOT normalizeSeat(event.p) — and the first draft got this wrong in a way
     worth recording. normalizeSeat's signature is (seat, seatCount): called with one argument it
     returns null for EVERY seat, which would have produced a beat with no captain and a boat that
     never moves. It was caught in the first ten seconds of testing the function, which is the only
     reason it is a note instead of a bug.
     The seat count is engine state, so the correct call would need it passed in `snapshot` — which
     is the concrete reason the plan pins present(event, engineSnapshot) rather than present(event).
     I predicted this beat would need nothing but the event; that was wrong, and the finding is
     better than the prediction.
     But it is NOT normalized here anyway, because animateSailRoute passes `ev.p` raw today
     (flow.js:1293) and CONVERTING A KIND MUST NOT CHANGE ITS BEHAVIOUR. Adding validation inside a
     refactor is how a "pure move" quietly becomes a fix nobody reviewed. If seat validation is
     wanted, it is its own change, with its own gate. */
  return [{ do: "walkRoute", seat: event.p, from: route[0], path: route.slice(1) }];
}

/* ============================================================================
   WHO ANSWERS FOR A SEAT — the first Decider predicate, made pure so it can be RUN.
   ============================================================================
   EXTRACTED 2026-08-31, AND THE REASON IS A GATE THAT COULD NOT FAIL. `decisionIsLocal` lives in
   src/ui/util.js, which reaches appState and the DOM, so a headless gate cannot import it. The
   gate written to protect it therefore TYPED THE RULE AS A LITERAL and asserted against its own
   private copy — and CEO review 41 broke it in one line: appending `|| appState.isHost` to the
   real function left the gate green while the single row it exists to protect was broken.

   That is rule 6's "a measurement that cannot fail", committed inside a gate standing in for work
   the session had decided not to do. The fix is not a better regex. It is to make the rule
   RUNNABLE, which means pure, which means here.

   THE TWO QUESTIONS, and they are not the same question:
     does a PERSON answer, or a bot?       p.strategy === "human"
     does THIS DEVICE answer, or another?  this function
   Over every mode they agree on six rows and differ on exactly one — a crew host holding a turn
   for a REMOTE human, where a person answers but not at this device. That row is why both exist;
   merging them breaks the case the Decider abstraction was invented for.

   FACTS IN, ANSWER OUT. It takes what it needs rather than reaching for appState, which is what
   lets the gate run the SAME function the game runs. src/ui/util.js keeps the thin wrapper that
   knows where those facts live.

   AND IT DOES NOT KNOW A MODE'S NAME — `sharedDevice`, not `passAndPlay`. That correction came
   from mode_fork_check, which counted the mode's name appearing once more and failed the build.
   The counter was right for a better reason than it knew: this is L3, and the plan's whole point
   is that modes differ in HOW AN ANSWER IS OBTAINED, never in the rules themselves. "All the
   humans share one device" is a CAPABILITY — true of pass-and-play today, true of any future
   couch or hot-seat mode, and the rule holds for all of them without being told which it is.
   Naming the mode here would have been mode leaking one tier down, on the very day a plan about
   removing that leak was being built. */
export function isDecisionLocal({ sharedDevice, strategy, isMySeat }) {
  return (!!sharedDevice && strategy === "human") || !!isMySeat;
}
