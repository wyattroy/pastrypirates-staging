# W9 publish lag — builder findings (live, updated as I go)

## 1. RED, measured by me (not inherited)
Room HRAN, real two-browser crew room, current tree, `w9_publish_lag.mjs` on the HOST TAB ONLY
(no network in the number):

```
event #14 = tradewind (the rim sweep)  emitted at 1090ms, published at 2744.6ms
   #12 storm          publish lag 0ms
   #13 windmove       publish lag 1655ms      <- the sweep's partner, same synchronous emit
   #15 windmove       publish lag 0ms
   #16 anchorHold     publish lag 0ms
   #17 blownOut       publish lag 0ms
   #18 stormSummary   publish lag 0ms
SWEEP PUBLISH LAG = 1655ms   (budget 250ms)   RED
```
Five siblings at 0ms is the in-run control: the instrument can print a small number.

## 2. The fix, and the order I chose
**Publish first, ride unchanged.** New `publishNow()` in `src/ui/flow.js` (the publish half of
`liveRender` on its own, host-guarded, through the same `netHandlers().onEvents()` seam — ui-tier
may not import `src/net/`). Called at both sites before the awaited ride:
- `src/ui/flow.js` runStormLive, the `outcome==="swept"` branch
- `src/orchestrator.js` the battle flee

**I did NOT move `liveRender()` above the ride.** Code fact, not a guess: liveRender's drain is
fire-and-forget (`_nh.onConsumeEvent(e).catch(...)`, deliberately un-awaited so liveRender stays
synchronous for its 57 call sites), `consumeEvent` itself rides the sweep, and `_rodeSweep` is
idempotent — so draining first makes the call site's own `await` return `false` immediately and the
host stops WAITING for the ride, while a guest (whose `watchEvents` awaits `consumeEvent` serially)
still waits. That swaps a publish-order defect for a host/guest PACING divergence. Publish-first
changes exactly one thing — when the wire is told — and nothing about what is drawn or who waits.
**The host still rides exactly once, inline, as today; the later liveRender drain's ride no-ops via
_rodeSweep, as today.**

## 3. Sweep — other places the whole table waits on one client's animation
Same grep shape (`await …` immediately followed by the only publisher, `liveRender()`).
**UNMEASURED. Reported, not fixed** — the brief's count of two was for animation RIDES; broadened
to "anything awaited before the only publisher", there are at least four:

| site | what is awaited first | why it is the same family |
|---|---|---|
| `src/ui/flow.js` trade settle (`await narrateLastEvent(); liveRender();`) | the narration bubble's reveal + hold | `settleTrade` has already emitted; the table is not told until this tier finishes reading the line. **Note the house order elsewhere in `runStormLive` is the reverse — `liveRender(); await narrateLastEvent();`** |
| `src/orchestrator.js` bake resolve (`if(perform)await benchReveal(p,out.res); liveRender();`) | the oven bench reveal | `bakeResolve` has already emitted; the reveal is a long animation |

Recommend measuring these two with the same instrument before touching them (rule 6). I have not,
and I am not claiming they are defects.

## 4. Not in scope, stated so it is not lost
`docs/INTENDED-BEHAVIOUR.md` §3: a guest being a moment behind the host is EXPECTED and perfect
simultaneity is explicitly not the goal. This fix does not chase simultaneity — the measured 47ms
of real network stays. It removes an artificial hold that grew with the host's own animation.

## 5. GREEN, and the trap that nearly made it a lie
`scripts/qa/w9_publish_lag_check.mjs`, fresh room ZNTN, fixed tree — **exit 0**:
```
event #11 = tradewind (the rim sweep)  emitted at 1089.1ms, published at 1089.1ms
   six sibling events of the same storm, all 0ms
SWEEP PUBLISH LAG = 0ms   (budget 250ms)   GREEN
```
**The first "green" run was RED at 1668ms and it was the INSTRUMENT, not the fix.** The page was
serving `flow.js` from the browser's own HTTP cache — the chromes had been started before the edit,
so the run measured the OLD code while the server was serving the new one. Caught by asking the
page directly (`typeof window.__flow.publishNow` -> `undefined`, and the page's own fetch of
`/src/ui/flow.js` did not contain the function while `curl` of the same URL did). Fixed by
restarting the two browsers on fresh profiles. **Anyone re-running this must reload the browser
after editing src/, not just the page.**

## 6. THE CAMERA — verified, not assumed
Both tabs sampled on one shared clock (`Date.now()`), 0 missed-ship frames on either tier, so the
instrument provably reached its subject. Ride start is the wide shot: `animateRimSweepRun`'s first
act is `sweepCam()` -> `camFull`.
```
HOST  emitted        1198ms
HOST  published      1198ms   (+0ms after emit — was +1663ms)
GUEST received       1264ms   (+66ms after publish = the real network)
HOST  ride starts    1266ms   <- the wide shot
GUEST ride starts    1377ms   <- host->guest ride + camera gap = 111ms
```
**The camera gap closed with the publish order: 111ms, against ~1708ms before (host 2767ms, guest
4475ms). It was one defect, not two — confirmed by measurement rather than inherited.**

## 7. FINAL GREEN — on the code that actually ships
`npm test` first failed on `mode_fork_check.js`: my `if(!appState.isHost)` in `publishNow()` added a
who-is-playing conditional to `src/ui/flow.js`, **a file that draws**. The gate was right. The guard
moved to `pushEvents` in `src/orchestrator.js` — on the publisher itself, where rule 23 sanctions
"who computes", and where it now protects every caller instead of only this one. A guest in a live
room has both `db` and `room`, so the two existing lines there were not a substitute.

That edit landed AFTER the first green, so the first green stopped proving anything and was re-run.
Fresh browsers, fresh room RGPD, final tree:
```
event #23 = tradewind (the rim sweep)  emitted at 340.4ms, published at 340.4ms
   six sibling events of the same storm, all 0ms
SWEEP PUBLISH LAG = 0ms   (budget 250ms)   GREEN   exit 0
```
The attempt before it printed **NOT RUN** (the ship was `blownOut`, not swept) and exited 2 — the
NOT-RUN path is live and still refuses to call an unrun leg a pass.

`npm test` exits 0 at 54 gates.

## 8. Two weaknesses I fixed in the instrument itself
Both were found by the gate failing honestly rather than by reasoning:
- the pose hardcoded `players[0]` and never checked the RIM square for a ship, so `landHeld` (an
  `anchorHold`, no sweep) came back three runs running. It now tries every seat and requires all
  three squares clear.
- it skipped captains who are `done` or `baking` — off the board, unpushable.
- the fixed 25s sleep became an adaptive window (`W9_WINDOW_MS`, default 60s) that watches until the
  sweep is emitted AND published, so a slow board costs time rather than a verdict.
