# Display rules — how this game decides what to draw

**PAR-16, Wyatt 2026-08-20: *"Yes — write them down as we convert."*** Not written up front and not
left to the end — **written in the same commit as the conversion that made it true**, so nothing in
here ever describes something that is not true yet. Started deliberately FIRST in Phase 02.15,
carrying what `02.15-01` already made true, rather than waiting for the whole prompt channel to
converge (research's Open Question 3).

**Write nothing aspirational.** If a channel is half-done, this document says half, and says which
half. A document that describes the architecture we intend, rather than the one that exists, rots
into a lie with nobody editing it — the project's own no-future-tense rule.

Sibling to `docs/BOARD-RENDERING.md` (the layer stack and camera), `docs/HARD-WON-LESSONS.md` (what
to distrust), and `docs/DRIVING-THE-GAME.md` (driving it under automation).

---

## 1. THE PRINCIPLE — stated once, at the top

**Host/guest decides WHO COMPUTES the game and WHO CREATES THE ROOM. It never decides WHAT IS
DRAWN.** (CLAUDE.md rule 23.)

The host runs the engine and is the authority Firebase trusts; the host also creates or joins the
room. That is the entire legitimate residue of "host vs guest" in this codebase. Everything a player
*sees* — the board, a prompt, the ribbon, narration, the captains list — is decided by ONE set of
rules that every tier reads, regardless of who is hosting.

**The design-time question for anything new drawn on screen:**

> *What makes the host's screen and a guest's screen agree?*

If the honest answer is *"nothing — we keep them in step"*, that is the defect, before a line of
code is written. Two things kept in sync by discipline are two things that will drift; the only
durable answer is that there is only one of them, reached by name from both tiers.

---

## 2. THE CONVERGED CHANNELS — one row each, only for what is TRUE TODAY

### Narration — `flash()`

**Entry point:** `flash()`, `src/ui/flow.js`. Both tiers reach it: the host's game loop calls it
directly as narration happens; a guest reaches it through `watchNarr`, one of the nine Firebase
listeners in `src/orchestrator.js`. Promoted to shared in **02.15-01 Stage 1**, in the same commit
that made it true.

**The mirror-when-remote guard**, `netNarrate` / `netBroadcast` (`src/orchestrator.js:308-311`):

```js
export function netNarrate(html,variants,opts){
  if(appState.replaying)return;
  showNarration(pickNarrVariant({html,variants},appState.mySeat),opts);
  if(appState.isHost&&appState.db&&appState.room)
    netSetNarr(appState.db,appState.room,html,netFail("narration"),variants,opts&&opts.wait);
}
```

**Local render always. A Firebase write happens ONLY under `isHost && db && room`.** This is the
guard every future mirror-write must copy verbatim — it is what keeps a solo game (`db===null`)
alive, because the write branch is unreachable there.

**How long it stays — the wait-line rule (item 19, D-10).** A narration line carrying `opts.wait`
registers **no deadline**. It is not faded out on a timer; it is **replaced** by whichever event
ends the wait, on both tiers, because `opts.wait` crosses the wire and both sides evaluate the same
hold curve against the same field. Verified both-sides in 02.15-01: the wait line was still on
screen after nine seconds — past where the ordinary 2550–6750ms hold curve would have retired it —
on both host and guest, then replaced together.

### The active seat — `applyActiveSeat()`

**Entry point:** `applyActiveSeat(seat)`, `src/ui/util.js`. The ONE function that sets both
`appState.curSeat` (drives the ribbon) and `S.activeSeat` (drives the camera), so the two can never
be aimed differently:

```js
export function applyActiveSeat(seat){
  if(seat==null)return;
  const ps=appState.game&&appState.game.players;
  if(!ps||!(seat>=0&&seat<ps.length))return;
  setActor(seat);
  if(window.__pp4)window.__pp4.actor(seat);
}
```

Called by the host's turn loop (`humanTurn`/`botTurn`) and by `watchEvents`, reading the `p` field
every meaningful event already carries (`turn`/`sail`/`dock`/`pass`/`attack`). **No engine change**
— `ev()` records no actor field, this reads an existing one. Two guards, both deliberate: an event
carrying no seat (`newround`, `end`) leaves the indicator alone rather than blanking it, and the seat
is bounded to the known range before use as an index (T-02.2-08) — the `ev` node is
host-authoritative, the same trust already relied on for board positions, but a bounded index costs
nothing and a trusted one eventually does.

**`setActor(seat)`** is a one-line assignment to `appState.curSeat`, not a renderer — it is
`SUPERSEDED` in the parity gate, reached through `applyActiveSeat` on both tiers. Promoted to shared
in **02.15-01 Stage 2**.

### The sail prompt — `renderPickPrompt()` (02.15-02 Task 3, THE TRACER — first prompt-channel fork converged)

**Entry point:** `renderPickPrompt(spec, answer)`, `src/ui/flow.js`. Both tiers name it directly:
the host's local response mechanism (`localPickCell`, wraps it in a Promise, resolves from the
answer callback) and a guest's `watchPrompt` listener (`src/orchestrator.js`, writes the answer to
Firebase from the answer callback via `sendResponse`). Promoted to shared in **02.15-02 Task 3**, in
the same commit that made it true.

**What is drawn:** the highlighted sail squares (`sailHighlightRect`, one per legal cell) and the
sail card (`sailPanelHTML`) — both already shared builders since the narrow half (`b76983d`); what
was NOT shared until this task was who calls them and when. `renderPickPrompt` owns drawing AND
teardown; it knows nothing about Firebase, promises or seats, and imports nothing from `src/net/`.

**How long it stays:** until the captain taps a square or "Stay put" (`answer` fires immediately
after teardown). *(While the shot clock lived — it left 2026-08-28, temporarily, at Wyatt's word —
its expiry could also force the teardown via `appState.activePickCleanup`, a LOCAL-caller concern
registered only by `localPickCell`. The registration left with the clock; the renderer still
returns its teardown for the clock's return.)*

**Where the promise is created, resolved, rejected:** created in `localPickCell` (local) or by
`remotePrompt` (remote, `src/orchestrator.js`); resolved on a square click or on `#apStay` (and,
while the clock lived, from its 30s force-resolver). **No reject path** — a dropped prompt does not
throw, it simply never settles, exactly as before this task. `renderPickPrompt` does not add a
second way to reach that state.

**The wire is unchanged** — exactly `kind`, `cells`, `msg`, `hint`; `id` and `seat` are still stamped
by `remotePrompt`, never added to the literal built in `pickCell()`.

**`appState.currentPrompt`** holds the spec `renderPickPrompt` is currently drawing — Wyatt's "one
current prompt", in one place, on every tier. Set inside the renderer, cleared inside its teardown.

### The captains list order — `seatOrderFrom(head)` via `seatDisplayOrder()`

**Entry point:** `seatDisplayOrder()` → `seatOrderFrom(appState.mySeat)`, `src/ui/util.js`.

```js
export function seatOrderFrom(head){
  const n=appState.game.players.length;
  if(!appState.turnOrder||appState.turnOrder.length!==n){
    const raw=appState.game.players.map((_,i)=>i);
    const r=raw.indexOf(head);
    return r<0?raw:raw.slice(r).concat(raw.slice(0,r));
  }
  const at=appState.turnOrder.indexOf(head);
  ...
}
```

**One rule that takes the VIEWER as an input is not two rules.** Whoever is looking sees their own
captain on top — `seatDisplayOrder()` always passes `appState.mySeat` as `head`, on every tier,
through the same rotation function. **This is explicitly NOT a sanctioned host/guest exception.**
Wyatt, 2026-08-20, correcting an earlier framing that filed it as one: *"a rule that takes the viewer
as an input is not two rules."* Recording that correction here is the whole point of this row — the
framing it corrects is what this document exists to prevent from recurring.

Fixed in **02.15-01 Stage 3**: the pre-fix bug was in the fallback branch (used before `turnOrder` is
known, briefly at the very start of a game), which returned raw seat index and dropped `head` on the
floor — so nobody saw their own captain on top for the opening of every game, in every mode. That was
never a host/guest divergence (the host fell back identically, because `runLiveNet` does not shuffle
turn order until after `showAhoyIntro` returns, so the value truly does not exist yet on either
tier) — it was one rule, broken for everyone, fixed once.

### The bake-off bench — `playBakeoffLive()`, reached through `applyBenchSnap()` (04-01 Task 3, MP-05)

**Entry point:** `playBakeoffLive(spec, io)`, `src/ui/bakeoff.js`. **Three callers name it, and
all three are drawing the same bench face down:**

| Caller | Tier | Who that is |
|---|---|---|
| `bakeoffPrompt`'s `decisionIsLocal` branch (`src/ui/flow.js`) | host loop | the captain baking on THIS device — solo, pass-and-play, or the host's own bake |
| `watchPrompt`'s `kind==="bake"` branch (`src/orchestrator.js`) | listener | a captain baking in ANOTHER browser, with their own hands on their own crates |
| `benchWatch`, reached from `watchBattle` **and** from `benchPublish` through `applyBenchSnap` | both | **every other captain, watching** |

**What makes them agree: one spec, and no second animation.** `playBakeoffLive` is fully
data-driven — `spec.before`, `spec.swaps`, `spec.locked`, `spec.attempts` and `spec.order` determine
every frame of the cover sweep, every swap arc and every reveal. A watcher is handed **the same
spec** and runs **the same choreography** from it, so the shuffle they see is the same arcs, the
same 1000ms swaps and the same 700ms settles, drawn by that code. **Nothing is streamed frame by
frame** — that would give jump-cuts and a second timing model to keep in step.

**Only the RESPONSE MECHANISM differs, and it is the second argument.** `io` is either
`{onArm,onRewatch,onBench}` (a baker) or `{watch}` (a watcher: crate clicks unwired, no re-watch
button, no promise to resolve). There is one swap loop and one badge painter (`paintBadges`) in the
file; a second of either is the defect this row exists to prevent.

**What crosses the wire is DISCRETE MOMENTS, not animation** — the player decisions a watcher
cannot derive: Ready pressed, each pick landing **and un-landing**, a paid replay restarting the
shuffle (carried as an `epoch` bump, which is what restarts the watcher's own session), and the
verdict.

**WHO PUBLISHES IS THE ACTOR, NOT THE HOST.** The baker is the only party who knows when Ready was
pressed or which crate was just tapped, and **the baker may be a guest** — so the rule is *the
captain whose decision it is publishes the bench; every other client renders it.* One rule taking
the ACTOR as its input, the same shape as the captains-list row above ("a rule that takes the
viewer as an input is not two rules"), and the same shape as `watchChat`. **The VERDICT is the one
moment the host publishes**, because the host is the only thing that scores.

**The channel is `rooms/<CODE>/battle`, reusing `watchBattle` — no tenth listener.** A bench
snapshot is discriminated by carrying `bake`, handled before `renderBattleFromSnap` is reached, and
it also carries a `title`, which makes the long-dormant `!v.title` guard fire for the first time so
the battle sting cannot sound over a bake. **`watchBattle` is now attached by EVERY client with a
room** (`beginGame`), because a host that only ever wrote to that node could never watch a rival's
bake. Its BATTLE branch stays guest-only behind an explicit `if(appState.isHost)return;` — see §4
fork 3, which is still unconverged.

**How long it stays:** the host clears the node after the reveal, exactly as `asyncBattle` does at
the end of a fight. Without that, nothing downstream can take the panel back and a watcher session
could never end. The card itself leaves through its one exit, `retireBakeCard` (item 6 / D-16), on
every tier.

**The answer is not on the wire.** The engine's post-shuffle bench — the solution — never leaves the
host during the attempt: `before` + `locked` already determine every solved step, because a locked
crate never moves. `slots` appears only on the REVEAL snapshot, when the crates are being lifted off
and it is public anyway.

### The coin slider — `sliderWrapHTML` + `wireSlider` (05-01 Task 3, MP-08, D-55)

**Entry points:** `sliderWrapHTML(spec)` and `wireSlider(root,spec)`, `src/ui/util.js`. **Both
tiers name both functions directly:** the host's `localAsk` (`src/ui/flow.js`) and a guest's
`watchPrompt` ask branch (`src/orchestrator.js`). No tier-only wrapper — a wrapper satisfies the
eye and stops the parity gate seeing the convergence. Promoted to shared in **05-01 Task 3**, in the
same commit that made it true, with both rows watched RED against build `2026-08-23b` first
(`PARITY-ORCH-ABSENT`, `listeners=0 host-loop=0` on each).

**What it replaced:** a remote seat used to get `coinStepper`, a ± pair costing a whole prompt round
trip per coin. `coinStepper` is deleted. Wyatt, 2026-08-23: *"guest should OBVIOUSLY get the real
coin slider, and you already know why — guests and hosts are given the same experience."*

**The class names are the reason there is one builder, not two kept in step.** `stage.js` identifies
this control by class in two places — `menuButtons` exempts `input:not(.apSlider)` so a slider does
not knock its own prompt out of radial mode, and the placement memo key reads `.apSliderWrap`
without which the bar renders at 0,0. A second copy differing by one class name would give a guest a
flat card where the host gets the bloom. **Measured before the change** (`shots/t2`): the guest's ±
circles rendered *inside the radial arc*, which is exactly what playtest 21 took out of the host's
arc — *"THE ARC IS FOR ACTIONS ONLY."* Same gesture, two behaviours, on the one axis rule 23 forbids.

**What crosses the wire:** `slider:{min,max,start,aria,texts}` on `ask()`'s existing remote payload —
**additive and omitted entirely when absent**, the same shape `netSetNarr`'s `variants`/`wait` params
use, so no new node and no new listener. `texts` is `max-min+1` pre-rendered strings, one per stop,
because `fmt` is a closure over live game state and a guest handed a bare number would have a
different control again.

**Where the answer lands:** the guest keeps its own `ref` and sends `{i,n}` — `sendResponse` puts
`choice` on the wire unchanged, so an object needs no channel change (04-01 established this for the
bake's `{g:[…],w:n}`). `ask()` unpacks it **before `resolveOpt`** and writes `n` into the host's own
`ref`, so `coinSlider`'s single `logQuantity()` call records a remote drag identically to a local
one. **A bare number must still work** and does: while the clock lived its force-resolver answered
a plain `0`, and any future forced answer will again.

**How long it stays:** it is part of the prompt and leaves with it. **It is `display:none` for
roughly the first 750ms** of that prompt's life while the layer reveals — measured 3 of 32 samples
at 250ms — so anything screenshotting a prompt must wait for the paint, not for the DOM. Two runs
photographed inside that window and read exactly like a game-stopping layout fault.

### The prompt CARD markup — `optionButtonsHTML` and `sailPanelHTML` + `sailHighlightRect`

Already one builder each, gated by the parity gate's assertions 1 and 2 — this is markup parity, not
orchestration parity (see §4 below for the distinction that matters for the prompt channel).

- **`optionButtonsHTML(items)`**, `src/ui/util.js` — the button row for every `ask()`-shaped
  prompt. Unified in 02.1-03; both the host's `localAsk` and `watchPrompt`'s ask branch build their
  row through it.
- **`sailPanelHTML(msg,hint)`** and **`sailHighlightRect(c,cellPx,svg)`**, `src/ui/flow.js` — the
  sail-window card and the highlighted-square rect. Both tiers already build their squares and card
  through these two functions, since the narrow half of this phase (`b76983d`).

---

## 3. THE STANDING RULES — two live today; the third returns with the shot clock

### Rule A — MIRROR WHEN REMOTE. The host's own screen never round-trips through Firebase.

`runLiveNet()` drives **solo and pass-and-play as well as a networked host**
(`src/orchestrator.js:1839` forks on `if(appState.isHost)`, which is true in solo too). Every raw
Firebase writer in `src/net/writers.js` — `netSetPrompt` included — is a bare `db.ref(...)` with
**no null guard**.

**The guard, copied verbatim from `netNarrate`:**

```js
if(appState.isHost && appState.db && appState.room) /* write to Firebase */
```

**Local render always. A Firebase write happens only under this guard.**

**ONE NAMED REFINEMENT, 04-01 Task 3, and it is narrow.** `benchPublish` (`src/orchestrator.js`)
writes under **`db && room && !replaying`** — the same guard *minus `isHost`*. That is deliberate:
the safety property this rule exists for is that **a solo game never writes**, and `room` alone is
what is null in solo (this section's own measured correction says so, and `db` is a real handle in
every mode). The `isHost` half encodes *who computes*, which is precisely the thing rule 23 forbids
from deciding what is drawn — and a bench is published by whoever is BAKING, who may be a guest.
**Any future writer that is not about an actor's own decision still uses the full guard.**

**MEASURED CORRECTION (02.15-02 Task 3), because an earlier framing here was wrong and it is worth
recording why.** `index.html` loads the real Firebase SDK (multiplayer was restored in Phase 2),
so `fbInit()` runs unconditionally at `boot()` and **`appState.db` is a real, truthy Firebase handle
in EVERY mode, including solo** — not null. What is reliably null in solo is `appState.room`: no
`createRoom()`/`joinRoom()` call ever runs there. Since the guard is an AND of `db`, `isHost` and
`room`, `room` alone is sufficient to keep it false in solo — **the safety property holds**, but
"solo has `db===null`" is not the reason; "solo has `room===null`" is. Measured directly: a driven
headless solo voyage read `{dbTruthy:true, room:null, isHost:true}` and reached multiple sail
prompts with zero console errors. **A two-tab test cannot see a missing guard by construction — it
always has a room. Only a full solo voyage (`room===null`) can catch this class of fault**, and any
future static check for this must assert against `room`, not `db`.

### Rule B — `decisionIsLocal(seat)`, NEVER `isHost` and NEVER `seatLocal`.

```js
export function decisionIsLocal(s){
  return (appState.passAndPlay && appState.game.players[s].strategy==="human") || seatLocal(s);
}
```

`decisionIsLocal` is true for **any** human seat at a pass-and-play table — several seats can be
local on one device. `seatLocal(s)` (`s===appState.mySeat`) is true only for THIS browser's own
seat, and using it to fork a dispatch breaks the pass-the-device gate the moment a table has more
than one local human. `pickCell` and `ask` are both already correct. **Two channels are NOT yet on
this rule — `recipeDraftNet` and `netIntroBarrier` fork on `seatLocal`, and it "works" only because
`netIntroBarrier` has its own separate `appState.passAndPlay` branch a few lines earlier
(`src/ui/flow.js:2249-2261`) that intercepts a shared-device table before the fork is ever
reached.** See §4 — do not extend a converged dispatch to those two without disarming that landmine
first.

### Rule C — RETIRED WITH THE SHOT CLOCK, 2026-08-28. It returns when the clock does.

Rule C was *"`withShotClock()` needs a plain Promise, nothing else"* — every askable decision had
to resolve a plain Promise so the 30s force-resolver could race it. **It was the single reason four
prompt forks stayed open across three phases**: a prompt cannot loop back like an event when
something is racing it. Wyatt removed the obstacle instead of building around it (2026-08-28: *"i'd
prefer to do it even if it breaks shot clock, and to temporarily remove the shot clock from the
game"*). The full rule text and `withShotClock`'s body live in this file's git history and in
`src/ui/util.js`'s history — **when the clock returns it races the CONVERGED dispatch's one
resolver, which is the easier problem this removal was chosen to create.** The plain-Promise
discipline is still the house style for every decision; nothing new should resolve through an
emitter or callback registry.

---

## 4. THE SIX PROMPT FORKS, NAMED — converged or not

**Fork 1 (`pickCell()`) converged 02.15-02 Task 3.** See §2's "The sail prompt" row above.
**Fork 6 (`bakeoffPrompt()`) converged 04-01 Task 3.** See §2's bake-off row. The other four are
below, still open — **including fork 2, whose COIN SLIDER converged in 05-01 Task 3 while the fork
itself did not.** That row says which half, deliberately: a partial convergence recorded as a whole
one is the aspirational writing this document's own header forbids.

**"The prompt channel" is not one thing. It is these SIX fork sites** — five when this table was
written; the bake-off is the sixth and was missing because it had no remote branch to fork on, confirmed by reading the
tree at build `2026-08-20k`. This table is this document's honesty — it is what stops a reader who
sees the narration and active-seat channels converged from concluding the prompt channel is too.

| # | Fork | File:line | Rendering shared? | State |
|---|---|---|---|---|
| 1 | `pickCell()` | `src/ui/flow.js:605` | **Yes** — `sailPanelHTML` + `sailHighlightRect`, both gated | **CONVERGED 02.15-02 Task 3 (THE TRACER).** One renderer, `renderPickPrompt`, named directly by `localPickCell` (local response mechanism) and `watchPrompt`'s pick branch. `localPickCell` is `superseded` in the parity gate. |
| 2 | `ask()` | `src/ui/util.js` | **Yes** — `optionButtonsHTML` and, since 05-01, `sliderWrapHTML` + `wireSlider`; all three gated | **STILL NOT CONVERGED — one SUB-CASE is, and this row says which half.** The COIN SLIDER converged in **05-01 Task 3** (MP-08, D-55): one builder and one wiring, named directly by `localAsk` and by `watchPrompt`'s ask branch, both rows in the parity gate, `coinStepper` deleted. **The FORK ITSELF is untouched** — `localAsk` and `watchPrompt`'s ask branch are still two orchestrations, `localAsk` is still a DECLARED GAP in `ORCHESTRATION_DECL`, and the flip-ceremony `window.__pp4.flipMsg` landmine 02.15-02 parked over is exactly where it was. Nothing here converges the dispatch; 05-01 scoped itself to the slider for that reason. |
| 3 | `battleAsk()` | `src/orchestrator.js:443` | **Yes, more than expected** — `renderBattleFromSnap` delegates to `renderBattle`, so both tiers already end in one card builder | **NOT YET CONVERGED** — only the CONTROL WIRING (arming the coin, wiring `.btlBtn`) differs, not the card. Target of 02.15-02 Task 5, expected NOT to be reached under D-04. |
| 4 | `recipeDraftNet()` | `src/orchestrator.js:855` | Yes — `optionButtonsHTML` via `watchDraftPrompt` | **LEFT — not a task in 02.15-02.** Forks on `seatLocal(s)`, not `decisionIsLocal(s)`. See Rule B above — the landmine is real and disarming it is its own piece of work. |
| 5 | `netIntroBarrier()` | `src/ui/flow.js:2265` | Same `draftPrompts` node, same builder | **LEFT — not a task in 02.15-02.** Same `seatLocal` fork; additionally has its own `appState.passAndPlay` interception (`src/ui/flow.js:2249-2261`) that a careless dispatch extension would break. |
| 6 | `bakeoffPrompt()` | `src/ui/flow.js` | **Yes** — one shell, one bench, one badge painter, all in `src/ui/bakeoff.js` | **CONVERGED 04-01 TASK 3.** Not in the original table at all, because until 04-01 Task 2 **it had no remote branch**: measured 2026-08-23, a guest's bake was played on the HOST's screen while the guest's showed nothing. One choreography, `playBakeoffLive`, named by `bakeoffPrompt`'s `decisionIsLocal` branch, by `watchPrompt`'s `kind==="bake"` branch, and reached by every watching captain through `applyBenchSnap`. See §2's bake-off row. |

**Nobody may read "the prompt channel is done" off a partial convergence of this table.** Each fork
either converges — one renderer, named by both the host's loop and by a Firebase listener, with the
promise's creation/resolution/rejection all named — or stays listed here with its seam and its
landmine, updated in the same commit that changed its state.

---

*Updated in the same commit as each conversion. See `02.15-02-SUMMARY.md` for what changed in that
plan and `02.15-02-PLAN.md`'s `<the_five_forks>` for the full research behind this table.*
