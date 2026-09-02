# CHECK — Step 1 (checker, fresh context, 2026-08-31). IN PROGRESS.

## Diff actually read (not the builder's account)
`git diff e2d52878~1 HEAD -- src/ scripts/ package.json`
Touched: src/shared/storyboard.js (new, 93 lines), src/ui/board.js, src/ui/util.js,
src/ui/flow.js, src/orchestrator.js, scripts/qa/whose_turn_one_fact_check.mjs (new), package.json.
Builder's file list matches the diff. No stray tree touched.

## board.js header — read it myself (src/ui/board.js:8-13)
"CRITICAL: this file carries the v1.0 BUG-01 storm-crash fix (pre-baked PNG rain tile,
snap-not-animate narration height) — drawBoard()/buildStormLayers()/render()'s bodies below are
moved BYTE-IDENTICAL to the classic source. Do not refactor..."
The header ALSO establishes the form every prior deliberate change to those bodies took:
a "SCOPED EXCEPTION TO THE ABOVE" block IN THE HEADER, naming who approved it and
"WHY THAT IS SAFE, stated in terms of what BUG-01 actually fixed" (board.js:15-27 for G19,
:31-52 for WIND-00). Two precedents, both in the header, both with a named approval.

## Q1 — IS THE MODULE ACTUALLY PURE? **YES, AND THE GATE GENUINELY COVERS IT.**
`scripts/module_graph_check.js:198` — `checkTierShape("shared", [], "shared imports nothing from src/")`.
Red-proofed in a throwaway copy (scratchpad/chk, `git archive HEAD`):
- prepend `import { pn } from "../ui/util.js";` to storyboard.js -> exit **1**, and it NAMES the file:
  `SHAPE (shared imports nothing from src/): src/shared/storyboard.js:1 imports "../ui/util.js"` (+ a CYCLE failure too)
- prepend `import { appState } from "../state/index.js";` -> exit **1**, same shape failure naming `state`.
Baseline in the same copy: exit 0, `PASS shared imports nothing from src/ (leaf tier)`.
**LIMIT, stated honestly:** this is an IMPORT-GRAPH gate. It would NOT catch a bare `document.` /
`globalThis.` / `window.` reach inside storyboard.js, because that needs no import.
Checked by hand: `grep -nE "\b(document|window|globalThis|appState|localStorage|fetch)\b" src/shared/storyboard.js`
returns only two COMMENT lines (12, 71). No bare global reach today. Purity is gated for imports,
eyeballed for globals.

## Q2 — CAN THE NEW GATE FAIL? **YES, THREE WAYS, ALL EXERCISED.**
`node scripts/qa/whose_turn_one_fact_check.mjs` on the real tree: 6/6 anchors `yes`, 0 direct calls, **exit 0**.
In the copy:
- reintroduce `setActor(p.idx)` at flow.js humanAct -> `DIRECT setActor() CALLS: 1` ... **exit 1**
- re-`export` setActor in util.js -> **exit 2, "INCONCLUSIVE — the code this gate describes has moved"**
- rename `applyActiveSeat` -> **exit 2, INCONCLUSIVE**
The exit-2 path is LIVE and was not turned into a pass. The builder's account of P4 holds.
**LIMIT:** the gate is textual on `setActor(`. A bypass writing `appState.curSeat=` directly would
not be caught. Checked: `grep -rn "curSeat\s*=" src/` returns exactly ONE writer,
`src/ui/util.js:1828: function setActor(s){appState.curSeat=s;}` (+1 comment). And `__pp4.actor(`
has exactly one caller, `src/ui/util.js:1855`. So the one-writer claim is true today by measurement,
not only by the gate.

## Q4 — GATE COUNT: **DERIVED, not hand-checked.**
`scripts/gate_count_check.js` parses `package.json`'s own `scripts.test` string, splits on `&&`,
counts `node` invocations, and FAILS if that count != the declared `gates.total`. The typed 55 is
an assertion the parser falsifies, not documentation. Red by construction if the chain and the
number disagree. `npm test` line 1: `gates in npm test: 55`.

## Q5 — `npm test` **EXIT 0**, 55 gates, 0 failures. Run by me, log at
scratchpad/npmtest-checker.log.

## Q3 — IS THE ANSWER UNCHANGED? **YES for every consumer. "byte-for-byte" is very slightly overclaimed.**
Differential harness (scratchpad/equiv.mjs): the three OLD walks copied verbatim out of
`git show e2d52878~1` vs `deriveActiveSeat`, over **20,000 randomized event streams**
(1-120 events, 12 event kinds incl. turn/ovens/bake/newround, seats 0-3, and deliberately
10% `p:undefined` / 6% `p:null`), playhead uniform in range:

    trials=20000 oldThrew=0
    mismatch render()=0  activeTurnSeat()=0  currentTurnSeat()=0
    STRICT (===) differences: render=1387 activeTurnSeat=816
    sabotaged-walk mismatches=163   <- harness red-proof: comparing old vs lookback:5 DOES go red

**Read that carefully — there IS one real difference.** Under `==null` collapsing, zero mismatches.
Under strict `===`, 1387/816 differ, and every one of them is the same conversion: where an
establishing event carried `p === undefined`, the old walks returned `undefined`; the new returns
`null` (`storyboard.js:88  return e.p == null ? null : e.p;`).
**No consumer can tell**, verified at each site:
- `board.js:1741` render(): `if(active!=null&&st[active].done)` then `if(active!=null)` — `!=null`.
- `board.js:1449`: `const a=activeTurnSeat(); if(a!=null&&live[a]...)` — `!=null`.
- `board.js:1571,1586,1602,1614`: `activeTurnSeat()===seat` — seat is an integer, so both
  `undefined===n` and `null===n` are false.
- `util.js:currentTurnSeat()` — grep shows **no caller** (the file says so too).
Second difference, in the safe direction: the old render() walk did `events[i].t` unguarded and
would THROW on an out-of-range playhead or a hole; the new clamps (`Math.min(playhead,
events.length-1)`) and skips holes. Strictly more defensive; cannot introduce a crash.
Verdict on the claim: the ANSWER is unchanged. The TYPE of "no seat" changed from `undefined` to
`null` at 7% of samples, and nothing reads it. Say "same answer", not "byte-for-byte".

## THE QUESTION THE BUILDER HANDED ME — board.js's BYTE-IDENTICAL protection
**My judgement: the protection does NOT cover this edit IN SUBSTANCE, and it DOES cover it IN RECORD.
Two different answers, and both matter.**

**Substance — the edit is not in BUG-01's risk class.** The header states what BUG-01 was, twice, in
its own words (board.js:23-27, :43-49): "a LIVE CSS GRADIENT plus a MASK being composited every
frame, and... the narration box's height animating on every typewriter tick." The edit replaces a
backward `for` loop over a JS array with a function call returning the same value. No gradient,
no mask, no layer, no animation, no per-frame work, no DOM. I did not take that on reasoning alone —
see the Safari pass below.

**Record — IT IS NOT RECORDED, AND THAT IS A REAL GAP.** The header's own precedent is unambiguous:
every prior deliberate change to these bodies got a **"SCOPED EXCEPTION TO THE ABOVE"** block IN THE
HEADER — `board.js:15` (G19, "Wyatt-approved 2026-07-30") and `board.js:32` (WIND-00, "Wyatt-approved
2026-07-31") — each naming the approval and each closing with "WHY THAT IS SAFE, stated in terms of
what BUG-01 actually fixed". Both say, in the same words, "recorded here so the next reader is not
entitled to revert it." **This change has no such block.** The header still reads "Do not refactor,
'clean up', re-animate, or reorder anything inside them." The builder's comment at board.js:1741 is
inside the function, not in the header a reader checks first. **A reader of the header alone is
entitled to revert this, and would be right to.**

**And the builder's second argument is weaker than it looks.** It says render()'s body "already
carries a later deliberate change at exactly this walk (the ovens/bake widening)". True about the
code — and `sed -n '1,80p' src/ui/board.js | grep -i ovens` returns NOTHING. That widening is
**not in the header**, i.e. a previous session made the same unrecorded deviation. Citing an
undocumented prior violation as licence for another is not a precedent, it is a second one.

## SAFARI PASS — I RAN IT. WebKit 26.5, two viewports, storms FORCED.
Harness: scratchpad/wk-check-step1.mjs (desktop 1280x800, 170s) and wk-check-step1b.mjs (phone
390x664, 150s). Solo voyage, `appState.game.cfg.storm=1` re-forced every 1.5s, page-error /
console-error / crash listeners live throughout.

| | desktop 1280x800 | phone 390x664 |
|---|---|---|
| module loads+runs in WebKit | yes — all 6 exports, smoke `[2,null,3,null,null]` correct | yes, identical |
| max `.rlayer` mounted | **4** (the full storm stack — the run reached its subject) | **4** |
| shared walk vs live `appState.curSeat` | **110/110 agree** | **97/97 agree** |
| pageerror / console.error | **0** | **0** |
| page crash / browser disconnect | **0** | **0** |
| outcome | SURVIVED | SURVIVED |

Screenshot `scratchpad/wk-step1-1280.png`, read pixel by pixel: rain streaks over the whole board,
wind chevrons, two whirlpools, and — the part that matters here — **the active ripple ring is drawn
around the pink ship, and "Checker" is the pink-glowed row in the CAPTAINS panel.** That ring is
exactly what `activeTurnSeat()` drives, so the changed walk is visibly producing the right seat
on WebKit mid-storm. Board, ribbon and prompt all render correctly.

**LIMIT, stated so nobody overclaims it:** neither run got past Day 1 — 18 and 15 events, one
`storm` event each; the naive driver stalls on the trade "What do ye WANT from the table?" bloom
(visible in the screenshot). So this exercised the storm LAYERS compositing for ~5 minutes total
with the new code in render(), but it did NOT exercise a long multi-round voyage, nor a live
`ovens`/`bake` sequence, nor a `newround` boundary. Those are covered by the 20,000-stream
differential above, not by the browser.

**Housekeeping:** both harnesses kill their own `http.server` by PID in `finally` and close the
browser. `ps` for webkit/http.server/playwright after both runs: **empty**. Nothing left running.

## VERDICT: **CONFIRMED-WITH-GAPS**
Everything the builder claimed that I could test, held. Two things I would not ship as-is, both
about the RECORD rather than the code, plus three overclaims to correct.

**WOULD NOT SHIP WITHOUT:**
1. **A SCOPED EXCEPTION block in board.js's header**, in the form the file's own two precedents
   set (board.js:15, :32) — and both of those carry "Wyatt-approved <date>". Whether he must
   approve this one is HIS call, not mine and not the builder's; but the block must exist or the
   next reader reverts it in good faith. Cite the Safari pass above as the "why that is safe".
2. **Correct "byte-for-byte" in FINDINGS-step1.md.** The answer is unchanged; the TYPE of "no seat"
   moved from `undefined` to `null` in ~7% of streams (storyboard.js:88). No consumer can tell —
   verified at all six call sites — but the phrase as written is not true and rule 6 is about
   exactly this kind of unearned precision.

**OPINIONS (flagged as such, not blockers):**
- The new gate is textual on `setActor(`; a bypass writing `appState.curSeat=` directly is invisible
  to it. Today `grep -rn "curSeat\s*=" src/` finds exactly one writer, so the claim is true by
  measurement as well as by gate — but the gate is narrower than its own headline.
- `establishing.includes(e.t)` allocates nothing but does an array scan per event where the old code
  did three `===`. Up to 80 iterations inside render(). Almost certainly irrelevant; unmeasured.

**SIZE, and it is the honest one: no player sees anything.** The divergence this was scoped against
was measured dead this morning. This is one derivation instead of five and one writer instead of
seventeen, with the purity of the new tier proved (not promised) by a gate I broke and watched go
red. That is a foundation, not a fix. Anyone reporting it as a user-facing win is misreporting it.

**AND ONE THING THAT SHOULD REACH WYATT, not be decided by us:** the builder parked a real design
question — *should the ripple ring follow the captain to the ovens during a bake?* Today it keeps
ringing the previous captain for the whole bake. That is now visible at one line
(`board.js:1503`, `{establishing:TURN_ONLY}`) instead of hidden in three copies, which is the first
time anyone could have asked it. It changes what a player sees. It is his call.
