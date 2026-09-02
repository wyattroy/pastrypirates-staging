# W7 — PROGRESS. Written so a fresh lead with zero context could take over from this file alone.

Branch `claude/cloud-handoff-planning-a9ay1u`. **Never push to `main`** — it is production, served
to real players the moment it moves.

## The item
The guest's boat slid straight across the islands instead of walking the route the engine chose.
W7 put the route on the wire; a tester then measured the fixed build in two real crew rooms and
found it worked on **5 sails in 8** — 3 still slid, 2 of those 3 corner routes.

## The cause, and it is a RACE, not a wrong constant
`animateSailRoute()` took no parameters and read `g.events[g.events.length-1]`, while its callers
each consume a SPECIFIC event:
- guest — `src/orchestrator.js` `watchEvents`: the Firebase callback pushes its event and sets
  `evIdx` before its first `await`, then awaits `consumeEvent(e)`. Firebase does not await that
  callback, so the next event's callback pushes while the first is suspended.
- host — `src/ui/panel.js` `liveRender`: the drain starts every unconsumed event **without
  awaiting**, so a whole burst sees the same `events[n-1]`.
Anything landing behind a sail therefore made `last.t!=="sail"` and the ride was skipped.
Second defect, same root: the re-entry guard compared a module-local index against `n-1`, an array
POSITION, so a second voyage in one page load could refuse a brand-new sail.

## The fix (port-lead's builder, committed)
`src/ui/flow.js` — `animateSailRoute(ev)` now takes the event being drawn, and the guard is a
`WeakSet` of ridden events rather than an index. `appState.evIdx` was no escape: both call sites
set it to `events.length-1`, so it carries the identical race.

## Verification — what is DONE
- `npm test` **exit 0, 54 gates** (baseline before the work was exit 0 / 53 gates / 307 PASS).
- Defect reproduced by RUNNING the pre-fix walker, not by reading it: a sail consumed with a later
  event at `events[n-1]` returned no ride; the second sail of a two-sail burst returned no ride.
- `scripts/qa/w7b_sail_route_frontier_check.mjs` **red-proved DOWNWARD three ways**, each on a
  scratch copy at `/tmp/.../scratchpad/redproof` so the shared working tree was never broken:
  1. derivation reverted to `events[n-1]` → case B red (boat painted at **2 positions in 16ms**
     against **43 over 710ms** for the same sail at the tail); A and C stay green.
  2. `WeakSet` swapped back for the index guard → case C red; A and B green.
  3. `return false;` as the walker's first line — the break that walked past an earlier TEXT draft
     → the gate ABORTS, **exit 2**. It does not silently pass.
- That gate gained a `--tree=` flag so this red-proof is repeatable without breaking the tree.

## Verification — the crew re-measure, DONE
`scripts/qa/w7b_crew_sail_measure.mjs` (new) runs a real host+guest Firebase room, counts the
DISTINCT PAINTED POSITIONS of the sailing ship on BOTH sides per sail — the tester's own
discriminator, deliberately unchanged so the numbers compare — names the slid routes, keeps a
NOT-OBSERVED column, and shoots both screens MID-WALK on a corner route.

Two rooms (MEYZ and one before it), 16 sails measured:
- **Routes that must walk (>=3 squares): 6 of 6 walked on the guest. 0 slid.**
- **Host and guest drawn the same way: 16 of 16 sails agree.**
- The other 10 sails were 2-square straight hops, culled BY DESIGN on both sides
  (`route.length<3` — "no corner to draw, and the plain render says it better").
- Baseline before the fix: 5 walked / 3 slid of 8, two of the three slid being corner routes.

**HONEST SIZE — this is not "8 of 8".** Only 6 of the 16 sails were routes that needed a walk;
the driver's voyages threw mostly straight hops. So the corner-route sample is 6, not 8. Every
corner route measured walked, and none slid, but a larger sample has not been taken.

### The first run of that probe was WRONG, and the correction is the useful part
It reported the guest at 4 walked / 4 slid — WORSE than the pre-fix baseline. Every "slid" sail
was a 2-square straight hop, and **the host painted 1 position on those same sails too**. The probe
was calling a deliberate design decision a failure. The tell was the host failing identically: a
fault on both screens at once is not a host/guest fault, and a check that condemns something known
to work is the suspect. This was named in advance as falsifier 4 in
`.claude-team/W7-PREDICTION-starboard.md`, which is the only reason it took minutes.

## Matched pair, mid-walk (the picture the item needed)
`w7b-crew-shots/w7b-crew-corner-ev49-{host,guest}-2026-08-30T18-35-12-738Z.png`
Both screens: day 4, wind N↑ forecast S↓, Flaky Jack active in the ribbon, and the orange ship
caught BETWEEN grid squares with its active ring on it, in the same board position on both. Same
coins, same holds for both rivals. That is the guest walking a route, not sliding across it.

## FINDINGS — reported, deliberately NOT fixed here
1. **The trade-wind rim sweep has the IDENTICAL fault, untouched.**
   `animateRimSweepIfAny()` (`src/ui/flow.js:1026`) takes no parameters, reads
   `g.events[g.events.length-1]`, and guards with `_lastSweptEvIdx===n-1` — the exact two defects
   W7 just removed from the sail walker, in the same file, called from the same `consumeEvent`
   one line above it. **Measured, not read:** with a spy on `g.onRim`, it considers the ride when
   the tradewind is the last event and does NOT when anything lands behind it. The W7 fix was
   copied FROM this function's shape, so the child was fixed and the parent left alone.
2. **A camera divergence, OBSERVED ONCE AND NOT MEASURED.** In an earlier matched pair
   (`w7b-crew-corner-ev55-*`) the guest walked its route correctly while its camera was framed on
   another part of the board — the moving ship was cropped at the top edge of the guest's screen.
   Not reproduced in the later run. **My on-screen check cannot settle it**: it counts any pixel
   overlap with the viewport, so a partially cropped ship reads as 100% visible. Needs its own
   measurement before anyone calls it real or dead.
3. **Not a claim:** I never measured that a two-sail burst occurs in a real voyage. The node gate
   asserts it as robustness. It must not be reported as a fixed bug.

## Open question — Q-22 in `.planning/CTO-QUESTIONS.md`
Two gates guard one thing and only the weaker runs. `w7_route_derivation_check.mjs` (mine, in the
chain) can only see that the walker RETURNED true — under a stubbed browser every ship painter
early-returns, so it cannot see the boat move. The browser gate that counts painted positions is
NOT in the chain. Recommend swapping; it is a call about putting the first browser gate into
`npm test`, so it is not mine to make alone. **Not blocking.**

## Claim I am NOT making
That a two-sail burst occurs in a real voyage. My node gate asserts it as robustness; I never
measured it happening. It must not be reported as a fixed bug.

## Operational
starboard-lead has **no `Task`/`ListAgents` tool** in this session — it cannot spawn a checker,
tester or sweeper, and `SendMessage` to `port-lead` returns "no agent reachable". Verification is
therefore being run directly by starboard-lead. The **sweeper pass has not happened**: the sibling
worth checking is the trade-wind rim sweep (`animateRimSweepIfAny`), whose `_lastSweptEvIdx` guard
is the same position-based shape the WeakSet just replaced here.

## IN FLIGHT — the sea trial (rule 24), started by starboard-lead
`node scripts/sea_trial.mjs --report=.planning/SEA-TRIAL-w7-starboard.md` — gear **FULL**, 10 legs
(solo/passplay/crew × desktop/phone/tablet, plus the webkit legs), build `2026.08.30.1`. ~85 min.

**It writes its OWN report path on purpose.** `.planning/SEA-TRIAL.md` is the shared artifact and
whichever machine finishes last overwrites it — the exact failure the two-sessions rule records.
Do not point a second trial at the shared path while this one runs.

**Why it is running:** CEO 33 listed three things needed to call W7 finished. Items 1 (the crew
re-measure) and 2 (the browser gate) are now DONE — see above. Item 3 was *"a sea trial at FULL,
or an explicit ruling from Wyatt that he will take the two-browser count instead."* This is item 3.

**If this session ends before it finishes:** the report file is the artifact; read it, and check
its NOT-RUN column before believing any verdict. A leg that could not start is not a leg that
passed. The stale `.planning/SEA-TRIAL.md` on disk describes build `2026.08.30.2`, which no longer
exists and carries its own FAILED banner — do not read it as this build.

## Gate composition still unresolved (Q-22, parked for Wyatt, NOT blocking)
`npm test` is at 54 gates and runs the node derivation gate. The two BROWSER gates that look at the
picture — `w7b_sail_route_frontier_check.mjs` and the crew probe `w7b_crew_sail_measure.mjs` — are
deliberately outside the chain and must be run by hand. `w9_rim_sweep_derivation_check.mjs` exists
and is also outside the chain.
