# W7 remainder — the prediction, written BEFORE the measurement (rule 6's working form)

port-lead, 2026-08-30, before running anything.

**What I expect, and why.** `animateSailRoute()` (src/ui/flow.js:1194) takes its subject from
`g.events[g.events.length-1]`. The guest's only route into it is `consumeEvent` (src/orchestrator.js:1572-1573),
and `watchEvents` pushes each arriving event onto that same array *before* awaiting the consumer. So
whenever a second event lands during the `await animateRimSweepIfAny()` that sits one line above,
the tail is no longer the sail being consumed and the `last.t!=="sail"` guard returns false.

- **P1.** Posed: a rideable sail at index n-2 with any later event at n-1 → `animateSailRoute()`
  returns **false** on the shipped code. *What would prove me wrong:* it returns true. Then the
  tail-derivation is not the cause of the 3-in-8, and the real cause is somewhere else — the route
  field being dropped on the wire, or the camera refusing, or the ride being interrupted mid-walk.
- **P2.** Control: the same sail at the tail → returns **true**. If this is also false the
  instrument never reached its subject and neither result means anything.
- **P3.** After a second voyage begins in the same page load, a sail landing at the event index the
  previous voyage's last ride used → returns **false**, because `_lastRoutedEvIdx` (flow.js:1193) is
  module-local and beginGame (orchestrator.js:2329) resets the other frontiers and not this one.
  *What would prove me wrong:* it returns true, meaning something already resets it.

**What happened immediately before the bug (rule: widen the time horizon).** The engine emits a
sail and then calls `this.tradewind(p)` in the same breath (src/engine/index.js:2776), which can push
a second event before any drain runs. On the host the UI turn loop emits and rides with nothing in
between (flow.js:2285/2386/2587), so the host's tail IS its sail — which is exactly why the host
walked all 8 sails and the guest walked 5.

**The fix I expect to write, and the risk in it.** Stop deriving the subject from the tail; derive
it from the event being consumed, on both tiers off one code path. The risk is riding a sail one
beat early if the scan runs ahead of the consumer — so whatever I do must not let the walker pick an
event the consumer has not reached.
