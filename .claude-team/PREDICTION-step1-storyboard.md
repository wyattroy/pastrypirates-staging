# PREDICTION — step 1, before any code

2026-08-31. Written first so it cannot be retrofitted.

## THE FINDING THAT RE-SIZES THE STEP, and I want it on the record before I build anything

**`sail` is already converged, so step 1 is NOT a fix. It is scaffolding.**

`src/orchestrator.js:1586` `consumeEvent(e)` is run by **every client** — the host drains into it,
and `watchEvents()` (`:1611`) feeds the guest's wire into the same function. Its body is already an
ordered list of beats:

```
guest state mirror → applyActiveSeat → syncLogLines → scrub → stormCamForEvent
→ animateRimSweepIfAny → animateSailRoute → render → spawnPops → playForEvent → applyEndMeta
```

`animateSailRoute` is beat 7, it rides the event being consumed, and it is idempotent through a
`WeakSet`, so the host's own call sites (`flow.js:2381,2489`) are no-ops after it. **The plan's
step 2 — "put the route on the event, delete the host-only animation call sites, the guest's boat
starts sailing the actual water" — has therefore already shipped.** The route is on the event as
`ev.draw.route`, and `flow.js:1277`'s comment records that it deliberately rides *any* event
carrying a baked route rather than `t==="sail"`.

**So what is left for step 1 is real but different from the billing:** that beat list is written as
INSTRUCTIONS, not as DATA. Nothing can read it, snapshot it, or compare it. Step 4's golden-file
parity gate has nothing to snapshot until it exists. **Step 1's value is making an already-correct
sequence inspectable — and I will say that to Wyatt in those words rather than as "first visible
win", because no player will see anything.**

## What I will build, smallest honest version

`present(event, snapshot) → beats[]` in `src/shared/storyboard.js` (L3, purity already gated).
`consumeEvent` consults it **for `sail` only**; every other kind keeps today's path. Strangler fig.

## What I predict, and what would prove me wrong

1. **The beat list is not uniform, and a naive extraction will break something.** Some beats are
   awaited and some are not; `stormCamForEvent` and `applyEndMeta` are self-guarded; the guest
   state mirror is `isHost`-branched. **If I find the sail beats are cleanly separable with no
   ordering coupling, I was too pessimistic and should say so.**
2. **`present()` cannot see `appState`** — CEO 31's condition, and the whole reason L3 is gated
   pure. So every input a beat needs must be passed in explicitly. **I predict the sail beat needs
   only `ev.p` and `ev.draw.route`, both already on the event.** If it turns out to need live
   render state, that is a finding that changes the plan's shape and goes to Wyatt, not into a
   convenient import.
3. **I predict this changes nothing a player can see.** If any screenshot differs, I have broken
   something, not improved it.

## The falsifier that matters most

**If `present()` for `sail` ends up being a one-entry list wrapping one existing call, the
abstraction is not earning its place yet and I should say so rather than dress it up.** The
justification would then rest entirely on step 4 being built immediately after — which is exactly
why the plan says to stand that gate up "as soon as two event kinds are converted, early enough
that it guards the rest of the migration rather than certifying it afterwards."

---

## PLAYED VERIFICATION — a real solo voyage, 14 days, 688s

Three things confirmed on a real game, not by reading:

1. **The step-1 conversion broke nothing.** `STRUCT FAIL` count: **0**. The voyage played through to a
   real End of Voyage.
2. **CEO 39's required de-duplication works.** The log reads
   `end of voyage: already captured and checked as an ordinary screen — not recorded twice`, and
   there is **no `-eov.png` in the shot directory at all** — the ending was captured once, by the
   ordinary loop, settled and structurally checked like every other screen. That is exactly the
   change CEO 39 required and it is now observed rather than argued.
3. **The leg's FAIL is the pre-existing coverage rule**, not this change: *"3 screen(s) never
   stopped moving before being checked"*. The same shape appears 90 times in earlier logs at counts
   of 1–22; the previous run was 4, this one 3.

## WHAT IS **NOT** PROVEN, and I am naming it rather than letting the green run imply it

**I did not directly observe a boat walking a route in this run.** Nothing in the leg's output
distinguishes a walked route from a glide, so a completed voyage with no structural failures does
not by itself prove the new path was exercised — that is the "instrument never reached its subject"
trap, and it would look exactly like this if `present()` silently returned null for every sail.

**What IS proven, link by link, and it is a chain of gates rather than one observation:**

| link | gated by |
|---|---|
| the engine bakes `draw.route` onto the event | `w7_sail_route_on_wire_check` (runs `bakeDraw`) |
| `consumeEvent` reaches `animateSailRoute` on every client | same gate |
| `animateSailRoute` asks `present()` | same gate's "reaches the reader" case |
| `present()` returns the same beats the old policy would have | `storyboard_sail_equivalence_check`, 11 route shapes |
| `present()` still returns beats for real recorded sails | `storyboard_golden_check`, 137 walking of 169 |
| `playStoryboard` reaches `animateSailRouteRun` | the performer's only `walkRoute` case |

Every link is asserted; the end-to-end picture is not. **A chain of proven links is strong and is
not the same claim as "I watched it happen", and the difference is exactly what HARD-WON-LESSONS
§12h was written about this morning.** Worth closing with a posed board later; not worth claiming
closed now.
