# PREDICTION — W9, the ordinary sail (written BEFORE any measurement)

Builder, 2026-08-30, branch `claude/cloud-handoff-planning-a9ay1u`.

## What I expect

1. **RED on the current build.** An ordinary sail records `evSail`, then awaits
   `animateSailRoute(evSail)`, and only the `liveRender()` after it publishes. So the sail's
   publish lag should measure roughly the *whole glide* — hundreds of ms up to seconds on a long
   route — against the 250ms budget. Same for the `tradewind` that follows it on the same lines.
2. **GREEN after the fix**, at ~1–2 frames. `publishNow()` is synchronous: `netHandlers().onEvents()`
   → `pushEvents()` → a fire-and-forget `netPushEvent` per event. Nothing is awaited between the
   `ev()` that records the sail and that call.
3. **The host still rides exactly once.** Read, not assumed: `src/ui/panel.js:154-162` — the local
   drain (`onConsumeEvent`) and the broadcast (`onEvents`) are two separate blocks, and
   `publishNow()` (`src/ui/flow.js:1090`) calls **only** `onEvents`. So no ride is claimed by the
   publish, no WeakSet is touched, and `await animateSailRoute(...)` still runs and is still awaited.
4. **`mode_fork_check` passes.** No `isHost` enters `flow.js`; the host guard is already on
   `pushEvents` (`src/orchestrator.js:1465`).

## What would prove me WRONG

- **Sail lag ≤ 250ms on the CURRENT build.** Then the glide is not actually held before the wire and
  this is not the storm's fault wearing a different hat — report that and ship nothing.
- **The host's sail ride is skipped after the fix** (route appears instantly, or a ride count of 0).
  That would mean `publishNow()` does reach the ride and my reading of panel.js is wrong — revert,
  because that is the host/guest pacing split rule 23 forbids.
- **The ride happens twice.** Same verdict: revert.
- **The gate cannot reach a live crew room here.** Then the sail leg prints NOT RUN with its reason
  and exit 2. **A NOT RUN is not a pass and I will not report it as one.**

## What the instrument cannot see (stated in advance)

- It measures the **host tab only**. It cannot see a slow guest, and deliberately so — there is no
  network in the number.
- It measures **publish lag**, not what is drawn. It cannot tell me the ride still looks right; only
  a screenshot can.
- The `sail` leg poses one sail. It cannot tell me the rate at which long routes occur in real play.
