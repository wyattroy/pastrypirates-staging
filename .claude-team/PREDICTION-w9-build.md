# W9 BUILD — what I expect, written BEFORE I change a line

Both gates are red on the current build (verified first, output in the session log).

## What I expect to be true

1. **The storm's rim ride.** `src/engine/index.js:469` steps onto the rim and sweeps in one
   breath. Emitting a `windmove` AT `nx` before `tradewind(p,true)` — exactly the shape
   `rimEscape` (`:826`) already uses — will put the entry square in the stream, and gate 1's
   storm leg will go green **on the guest's own route**, which deletes the host's need for the
   reconstructed-entry hatch at `src/ui/flow.js:1326-1328`. Rule 23: I delete the hatch, I do
   not give the guest one.

2. **`animateRimSweepIfAny` must become `animateSailRoute`'s twin** — take the event, remember
   rides by WeakSet identity. I expect the previous event still has to be found (the ride's
   `from` lives in the prior snapshot), and I expect to find it by **identity**
   (`g.events.indexOf(ev)`), not by a handed index, so no caller can mean a different event.

3. **The flee.** The event needs a seat (`p`) as well as a route, and the battleflee emit has to
   move to BEFORE `tradewind(def)` so the rim entry is recorded. I expect `animateSailRoute`'s
   `t!=="sail"` refusal to have to widen to "any event carrying a baked route" — the
   presentation lane is the route, not the event's name.

## What would prove me WRONG

- **If emitting at the rim entry changes what the game DOES** — a rule reading the new event, a
  different `r()` draw, a bot deciding differently — the fix is wrong however green the gate.
  `npm test` (54 gates), the determinism/baseline gates and `mode_fork_check` are the falsifier.
- **If moving the battleflee emit before `tradewind` reorders a stream something replays** — the
  scrubber, `q18_narr_event_order_check.mjs`, or a narration gate — then the emit must move
  differently (a separate entry event) rather than be relocated.
- **If widening `animateSailRoute` past `t==="sail"` makes some OTHER event walk a route it
  should not** — i.e. anything else in the tree bakes a `draw.route` — the widening is wrong and
  the flee must emit its own kind instead.
- **If gate 1's storm leg goes green but leg 2 (the host/guest divergence) stays red**, my read
  of who reaches which animator is wrong.
- **If leg C of the flee gate holds the gate red after the fix**, I say so out loud rather than
  touching the gate — it is evidence about the boards, not a verdict about code.

## Sizing, plainly
A fleeing ship is nearly a full sail — 3.93 squares on average, and 13.3% of them are currently
drawn straight through an island. This is the same picture problem the sail fix solved, at the
one place it never reached, plus a storm ride the guest has never once seen.

---

# THE VERDICT, written after measuring. Which parts were wrong.

**Right (3 of 3 mechanisms).** Emitting `windmove` at the rim entry — `rimEscape`'s shape — turned
both storm legs green on the guest's own route and made the host's hatch deletable. The WeakSet +
identity lookup was the right shape. The walker did have to widen past `t==="sail"`.

**Wrong / unforeseen — four things.**

1. **THE CAMERA, which I did not predict at all.** A tester measured it while I worked: teaching
   the guest to ride was not enough, because the swept ship's destination sat at screen x = −292 on
   the guest, off the left edge of its viewport. Half of this turned out to be already solved by the
   convergence itself — `animateRimSweepRun` calls `sweepCam()` in its own body (`src/ui/flow.js`),
   so the guest pulls wide the moment it reaches the ride. The other half was real: `stormCam` was
   one line inside host-only `runStormLive`. Converged into `stormCamForEvent(ev)`, one function of
   the `storm` event, called by the host with the event it emits and by the consumer with the event
   it consumes. **My prediction had no line about the camera; I would have shipped a ride nobody
   could watch.**

2. **The flee gate's own text-anchoring forced a layout I did not foresee.** Its B0 leg slices the
   block from `reachable(def)` to the END OF THE LINE carrying `t:"battleflee"`, and looks for
   `tradewind(def)` inside that slice. So the emit and the sweep had to sit on ONE line for the gate
   to reach its subject at all. The resulting order is the correct order — record at the
   destination, THEN let the current carry it — but the line break is the gate's constraint, not a
   design choice, and it is worth saying out loud rather than pretending it was intended.

3. **`git stash` could not measure what I wanted, because my tree was auto-committed mid-flight.**
   I tried to run `determinism_baseline.js` against the pre-change tree and got identical hashes —
   the stash was empty because something had already committed my edits as `d62da9f5`. **So I have
   NOT proven that gate was red before my change.** What I have is `package.json`'s own label on it:
   `test:determinism -> ... # BROKEN BY THE CUTOVER — see .planning/BACKLOG.md`, and the fact that
   it is deliberately not among `npm test`'s 54 gates. That is evidence about the gate, not a
   measurement of my change. **Treat it as unmeasured.**

4. **My falsifier "if it changes what the game DOES" was the wrong test for the storm emit.** It
   changes what the engine EMITS, which is the determinism-corpus hazard CLAUDE.md names, and no
   gate in `npm test` can see that. The entry cell going on the wire is the fix the brief asked for
   and I believe it is right — but it is a re-record obligation, not a free change.
