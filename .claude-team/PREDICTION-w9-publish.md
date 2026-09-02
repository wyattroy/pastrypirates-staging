# PREDICTION — W9 publish lag (written BEFORE I ran anything)

Builder, 2026-08-30. Branch `claude/cloud-handoff-planning-a9ay1u`.

## What I expect

1. **`scripts`/scratchpad `w9_publish_lag.mjs` will print RED on the current tree**, with a sweep
   publish lag well over the 250ms budget (the measurer saw 1328ms) and the same storm's other
   events at 0ms. If the sibling events are NOT 0ms, the instrument is measuring something other
   than the ride and I must stop and re-red-proof it.
2. **The cause is ordering, not speed.** `src/ui/flow.js:1370` awaits the ride, and only
   `flow.js:1371`'s `liveRender()` publishes (`src/ui/panel.js:159` -> `netHandlers().onEvents()`
   -> `src/orchestrator.js:1450 pushEvents`). Nothing else in the tree pushes.
3. **The camera gap closes for free.** The wide shot is the sweep's own `sweepCam`/`camFull`
   fired from inside `animateRimSweepRun` (`src/ui/stage.js:3685`), not `stormCamForEvent`. If the
   events reach the guest at emit time, the guest's ride — and therefore its wide shot — starts
   ~50ms after the host's instead of ~1.7s after.

## The fix I intend, and why NOT the other order

The brief offers moving `liveRender()` ahead of the ride. **I expect that to be WRONG here**, and
this is the part most likely to be proved false:

- `liveRender()` drains `consumeEvent` **fire-and-forget** (`panel.js`: `.catch(...)`, not awaited).
- `consumeEvent` (`orchestrator.js:1591`) itself awaits `animateRimSweepIfAny`, so the drain starts
  the ride; the `_rodeSweep` WeakSet (`flow.js:1062`) then makes the inline `await` return `false`
  **immediately**.
- So the host would no longer WAIT for the ride. `runStormLive` would carry on to the next ship in
  `stormOrder`, whose `renderLiveShips()` + 420ms steps repaint every ship from live state — and
  the swept ship's `p.pos` is already the whirlpool. **Predicted symptom: on the host the swept
  ship snaps to the whirlpool mid-ride, while the guest (whose `watchEvents` awaits `consumeEvent`
  serially) still rides it.** That is a NEW host/guest divergence — rule 23 — created by the fix.

**So I will PUBLISH FIRST and leave the ride exactly where it is.** One new ui-tier helper in
`flow.js` calling the existing `netHandlers().onEvents()` seam, used at both sites. Nothing about
what is drawn, or about the host's pacing, changes. The host still rides exactly ONCE, inline, and
the later `liveRender()` drain's ride still no-ops via `_rodeSweep` — identical to today.

## What would prove me WRONG

- **On the fix:** if the check goes GREEN with liveRender-first AND a host-side screenshot/frame
  sample shows the swept ship still riding the rim on the host (no snap), then the drain-first
  order is fine and my pacing worry was theatre. I must say so.
- **On the cause:** if publishing first leaves the lag above budget, the publisher is not the only
  gate and my read of `pushEvents` as the single wire path is wrong.
- **On the camera:** if the guest's wide shot is still ~1.3s late after the lag goes to ~0, then
  the late camera is a SECOND defect and the brief's claim (and mine) is wrong.
- **On scope:** if `git grep` finds more than the two named sites in the `await animation ->
  liveRender()` shape, the size I was handed is wrong and I report the larger number rather than
  quietly fixing it.

## What I am NOT claiming

I have not measured the host-snap regression. It is a PREDICTION from reading `panel.js`'s
fire-and-forget drain — untested at the time of writing.
