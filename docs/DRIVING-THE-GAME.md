# Driving Pastry Pirates from a browser session

How to make the game actually *play* under automation — for verifying a change end-to-end rather
than asserting about source. Written after three separate attempts stalled on the same two things.

`docs/VERIFICATION-CHECKLIST.md` says **what** to verify (it is Phase 12's scenario list and its
results). This says **how** to drive it. Read both before a browser pass.

---

> **BEFORE YOU WRITE A PROBE, READ [`QA-PROCESS.md` → THE WHOLE LOOP](QA-PROCESS.md).** This file
> tells you how to drive the game; that one tells you how not to fool yourself with what you
> measure. On 2026-08-26 three probes written against this manual could not have failed — one began
> sampling after the animation it was timing had finished, one used an emoji with no artwork so it
> never became the image it was testing, and one resolved "the card" to the full-screen container.
> **Red-proof every probe: feed it the broken case and watch it go red.**

## 1. Serve it, and use a port you have never loaded

```bash
python3 -m http.server 8421     # any port NOT used earlier in this session
```

**Chrome caches ES modules per URL.** Reusing a port that has already served an older build will
hand you the old `src/**/*.js` even after a hard reload, and you will "verify" code that is not on
disk. This has produced phantom bugs at least three times in this project — including once where a
fix appeared not to work and the fix was fine.

Kill the old servers when you move on, so a stale port cannot be reached by accident.

## 2. Clear saved state before starting

```js
localStorage.clear();   // then reload
```

`boot()` resumes an interrupted solo game from `pp_solo` and, historically, took an early return
before Firebase init. Leftover `pp_solo`/`pp_sess` from a previous run will silently put you in a
resumed game instead of the welcome screen.

Two tabs on the same origin share `localStorage`, so a second tab inherits the first tab's `pp_id`.
For a two-seat multiplayer test use a separate Chrome profile or an incognito window.

## 3. Start a solo game

As of Phase 22 (FIX-01), the captain name is confirmed in a modal that opens AFTER you click a mode
card, not before — click the card first, then set the modal's input. Dismissing that modal (✕,
Escape, or a click outside the card) confirms the name shown rather than cancelling.

```js
document.getElementById('choiceSolo').click();
document.getElementById('nameModalInput').value = 'Wyatt';
document.getElementById('btnNameConfirm').click();
```

**Two traps in those three lines, both of which cost a run on 2026-08-14:**

**`btnNameConfirm` is in the DOM from boot.** Waiting on `!!document.getElementById('btnNameConfirm')`
returns immediately, so the confirm fires before the modal has opened, does nothing, and the probe
sits on the welcome screen for the rest of its timeout with no error. Wait for it to be **visible**:

```js
(() => { const b = document.getElementById('btnNameConfirm'); return !!(b && b.offsetParent); })()
```

**The welcome screen runs its own all-bot attract board on `appState.game`.** So "a game exists" is
not the signal that your solo game has started — inject into it and you have posed the demo. Wait
for a game with a HUMAN seat in it:

```js
appState.game.players.some(p => p.strategy === 'human')
```

Hosting instead: `document.getElementById('choiceHost').click()` creates a real Firebase room on the
first click. **Delete the room afterwards** — `appState.db.ref('rooms/'+room).remove()` — or use the
back link on the room screen, which calls `abandonRoom()` and tears it down properly.

## 3b. STARTING A CREW GAME — "Start the voyage!" is not the button that starts the voyage

Added 2026-08-20 after it cost a run of the two-window rig, silently. `#btnStart` opens a
**confirmation** — *"Set sail? / Everyone's aboard? / Wait, not yet"* — and the button that actually
begins the game is **`#btnConfirmStart`**. It is **not** an `#actionPanel .apBtn`, so a probe that
clicks Start and then waits for a panel button sits on the lobby screen until it times out, with no
error and nothing in the console. The failure looks exactly like a hung game.

```js
document.getElementById('btnStart').click();
await sleep(900);
await waitFor(`(()=>{const b=document.getElementById('btnConfirmStart');
                     return !!(b&&b.getBoundingClientRect().width>10)})()`);
document.getElementById('btnConfirmStart').click();
```

Same family as 4a below: **the control you need is not the element whose label matches the verb.**

### 3c. A recipe card takes TWO taps

The first tap highlights that recipe's docks on the board (*"Tap a recipe to highlight its docks"*);
the second, on the **"Bake this!"** overlay the first tap reveals, commits it. A driver that clicks
each card once leaves the picker standing and the whole intro stalls behind it — **and the half-tapped
card renders with dock highlights the other client does not have, which reads exactly like a
host/guest divergence and is not one.** One was nearly filed as a defect on 2026-08-20.

## 4. The turn loop — and the two things that stall every naive driver

### 4a. THE FLIP COIN IS ITS OWN BUTTON

This is the one that matters. There is **no separate FLIP button**: the flippenator coin
`#flipCoinWrap` *is* the control. When a flip is required it gains the class `active` and an
`onclick` handler (`setFlipActive`, `src/ui/board.js`).

It is **not** an `.apBtn`, so a driver that only clicks `#actionPanel .apBtn` will sit forever on
"Cast yer line – flip!" or a dock flip. Every stalled run in this project traced to this.

```js
const coin = document.getElementById('flipCoinWrap');
if (coin && coin.classList.contains('active') && coin.onclick) { coin.onclick(); }
```

### 4b. NEVER CLICK "← back"

The side-bet prompt's Back returns to re-pick the winner, so a driver that clicks the first button
loops there forever. Filter it out:

```js
[...document.querySelectorAll('#actionPanel .apBtn')].filter(b => !/back|←|‹/i.test(b.textContent))
```

### 4c. Sailing — read the grid cell straight off the element

**STALE UNTIL 2026-08-21, corrected here after D-31's verification pass found real drivers reading
it.** `.sailCell` used to be an SVG `<rect>`, positioned/sized in board units, so a driver had to
invert `sailHighlightRect()`'s own `SAIL_HL_SCALE` inset arithmetic to recover which square it was.
It is an **HTML `<div>` now** (`sailHighlightRect()`, `src/ui/flow.js`) — sized in `cqw` against
`#boardwrap`'s own container query, same geometry, same inset, no scale factor to keep in sync on
resize — and it carries its grid coordinates directly, so there is nothing left to invert:

```js
const gx = +cell.dataset.gx, gy = +cell.dataset.gy;   // cell = a `.sailCell` element
```

`mouse_qa.mjs`'s own `cellOf()` reads `data-gx`/`data-gy` this way — copy it rather than
re-deriving the old rect arithmetic. **`mp_rig.mjs`'s `DRIVER_SRC` does NOT** — its `cellOf()` still
does the old SVG-rect inversion (`r.getAttribute('width'|'x'|'y')`), which returns `null`/`NaN`
against an HTML `<div>` with no such attributes. Found during D-31's verification (2026-08-21),
out of D-31's scope to fix (test infrastructure, not game code) — logged as a deferred item.

### 4d. Battle prompts use `.btlBtn`, not `.apBtn`.

## 5. Reaching an end of voyage

**Random clicking will not finish a game.** One measured run reached 1 of 5 ingredients in 256
moves. Sail with intent instead — toward the island holding something you still need, then home:

```js
const need = game.needs(game.players[0]);
const target = need.length ? game.islandOf[need[0]] : game.home;
// then pick the .sailCell with the smallest Manhattan distance to `target`
```

Prefer `Dock` and `Fish` over passing when answering the action menu. Expect **several minutes** —
bot turns and narration holds dominate the wall clock, so poll rather than blocking.

**Do not shortcut by mutating live game state mid-turn.** Setting `game.winner` / `players[].ing`
while the loop is running wedges it — tried, and it cost a run. If you must shortcut, call the real
render functions directly (below) instead of editing state the loop is mid-way through reading.

## 5b. The autoplay driver — the loop that actually plays

One `setInterval` that answers whatever the game is currently asking. **Priority order matters** —
the flip coin must be checked before the action buttons, or the loop sits on a dock/fish flip
forever (see 4a).

```js
const st = (await import('/src/state/index.js')).appState;   // LIVE appState
window.__g = { n:0, acts:[], err:null, timer:null };
const G = window.__g;

// invert sailHighlightRect() to get board coords from a highlight rect
const cellOf = r => { const s=parseFloat(r.getAttribute('width')), px=(s/0.9)+4, i=(px-s)/2;
  return [Math.round((parseFloat(r.getAttribute('x'))-i)/px),
          Math.round((parseFloat(r.getAttribute('y'))-i)/px)]; };

// sail toward the island holding what MY seat still needs; once the recipe is done, toward home
const target = () => { const g=st.game, me=g.players[st.mySeat], n=g.needs(me);
  return n.length ? (g.islandOf[n[0]] || g.home) : g.home; };

G.timer = setInterval(() => {
  try {
    G.n++;
    // 1. the flippenator coin IS a button when armed — CHECK THIS FIRST
    const coin = document.getElementById('flipCoinWrap');
    if (coin && coin.classList.contains('active') && coin.onclick) { coin.onclick(); return; }

    // 2. a sail prompt: pick the highlighted square closest to the target
    const cells = [...document.querySelectorAll('.sailCell')];
    if (cells.length) { const T = target(); let b = cells[0], bd = 1e9;
      for (const c of cells) { const [x,y] = cellOf(c);
        const d = Math.abs(x-T[0]) + Math.abs(y-T[1]); if (d < bd) { bd = d; b = c; } }
      b.dispatchEvent(new MouseEvent('click', {bubbles:true})); return; }

    // 3. any other prompt. NEVER "back" (the side-bet Back loops forever).
    const btns = [...document.querySelectorAll('#actionPanel .apBtn')]
      .filter(b => !/back|←|‹/i.test(b.textContent));
    if (!btns.length) return;
    // paying to anchor every storm bankrupts the captain, and being broke blocks sailing entirely
    const noAnchor = btns.filter(b => !/anchor/i.test(b.textContent));
    const pool = noAnchor.length ? noAnchor : btns;
    // docking is the only action that advances a recipe, so prefer it
    const pick = pool.find(b => /dock/i.test(b.textContent))
              || pool.find(b => /fish/i.test(b.textContent))
              || pool[0];
    G.acts.push(pick.textContent.trim().slice(0,16));
    if (G.acts.length > 25) G.acts.shift();
    pick.click();
  } catch (e) { G.err = String(e.message).slice(0,80); }
}, 600);
```

Stop it with `clearInterval(window.__g.timer)`. Watch it with `window.__g` — `n` (ticks), `acts`
(recent actions), `err`. **A rising `n` with a flat event count means it is waiting, not stuck** —
usually a bot turn with narration holds.

To stop automatically at the end of a voyage, add this as the first line of the interval:

```js
const sw = document.getElementById('statsWrap');
if (sw && getComputedStyle(sw).display !== 'none') { /* snapshot here */ clearInterval(G.timer); return; }
```

Snapshot **inside** that branch, not afterwards — the End of Voyage state is what you came for and a
later read can miss it.

## 5c. Driving a GUEST seat while a human hosts

> ### ⚠ `#btnStart` DOES NOT START THE GAME. IT OPENS A CONFIRM MODAL.
>
> **Four crew attempts died here on 2026-08-28/29, three of them producing no output at all.**
>
> Pressing `Start the voyage!` opens `#startConfirmModal` — *"⛵ Set sail? Is everyone at the table?
> Once the voyage starts, no one else can join — empty seats sail with bots."* The voyage begins only
> when **`#btnConfirmStart`** ("Everyone's aboard?") is pressed. A driver that clicks Start and then
> waits sits in the lobby for as long as you let it, with the board blurred behind a modal.
>
> **AND THE OBVIOUS PROBE CANNOT SEE IT.** The modal's buttons live in a `.modalCard`, not in
> `#actionPanel` or `#pp4Prompt`, so a probe reading the prompt panel reports an empty screen and
> says nothing about why — "no buttons, no day, no stage" for twenty-six samples running. A
> screenshot is what finally showed it. **If a crew rig reports an empty screen, take the picture
> before theorising.**
>
> **Use the helper, do not re-roll it:** `startVoyage(C)` in `scripts/mp_rig.mjs` clicks both buttons
> and returns only once a seat is genuinely on the stage — so a caller cannot mistake *clicked* for
> *started*, which is the distinction all four attempts turned on.
>
> ```js
> const code = await makeHost(H, url, "HostCap");
> await makeGuest(G, url, code, "GuestCap");
> await startVoyage(H);          // clicks Start AND the confirm, waits for the stage
> await driver(H, ""); await driver(G, "");
> ```


This is the setup for verifying multiplayer without a second person. The human hosts in one browser;
this drives the other seat.

**Use a different BROWSER, not a second tab.** Tabs share `localStorage` and therefore one `pp_id`,
so the guest would rejoin as the host. Different browsers have separate storage. If you must use the
same browser, set a distinct id before the page boots:

```js
localStorage.clear();
localStorage.setItem('pp_id', 'claude-guest-' + Math.floor(Math.random()*1e6));
location.reload();
```

Then join (the name modal opens on the `choiceJoin` click, same as solo — see §3):

```js
document.getElementById('choiceJoin').click();
document.getElementById('nameModalInput').value = 'Claude';
document.getElementById('btnNameConfirm').click();
await new Promise(r => setTimeout(r, 600));
document.getElementById('joinCode').value = 'ABCD';       // the host's code
document.getElementById('joinName').value = 'Claude';
document.getElementById('btnJoin').click();
```

Confirm with `__pp_app_state_debug()`: `room` set, `isHost:false`, and `mySeat` is YOUR seat — the
driver above reads `st.mySeat`, so it targets the right captain's needs rather than seat 0's.

**Guest prompts arrive through `watchPrompt` but render into the same `#actionPanel`**, so the same
driver works unchanged on either side.

**What to assert for lockstep** (this is the real value of driving the guest — drift shows up as a
mismatch instead of a feeling):

**FIRST, the trap that makes this whole check meaningless if you get it wrong.** A guest does NOT
simulate the game — it renders the `state` snapshot carried on each broadcast event. So
`appState.game.players[].pos`, `.ing` and `game.round` on a guest are a **render shell** and go
stale almost immediately. Measured mid-game on a real guest:

| | `game.players[]` (STALE) | `events[last].state` (what is actually rendered) |
|---|---|---|
| positions | `7,6 · 7,8 · 8,7 · 6,7` | `4,10 · 11,5 · 5,11 · 11,9` |
| ingredients | `0,0,0,0` | `3,2,3,4` |

Comparing `game.players` across host and guest will therefore report drift that does not exist — or,
worse, let you believe you checked something you did not. **On a guest, read the event state:**

```js
const evs = appState.game.events;
const snap = [...evs].reverse().find(e => e.state);   // most recent event carrying a snapshot
snap.state.map(s => s.pos.join(','));                  // the positions actually on screen
```

| Field | Where it is trustworthy | Meaning |
|---|---|---|
| `turnOrder` | both sides | must be identical on both clients |
| `game.events.length` | both sides | the broadcast frontier — should track the host's |
| `shotClockPaused` | both sides | a pause toggled anywhere must propagate to every client *(`timerOff` left with the shot clock, 2026-08-28)* |
| `turnExpired` | both sides | must NOT be stuck true after a pause/resume cycle (that was BUG-02) |
| `events[last].state[].pos` | both sides | the rendered board — **use this, not `game.players`** |
| `game.players[].pos` / `.ing` / `round` | **HOST ONLY** | stale on a guest; never compare these across clients |

## 5d. Hitting a sub-second window — arm a watcher, do not click

Every browser-tool round-trip costs 1–2 seconds. The shot clock is 30 seconds, with the penalty at
20 and expiry at 30. Any check that has to land inside a *specific* second — pausing at the top of a
turn, or catching a state within a tick of a transition — **cannot be hand-driven.** One session lost
**two turns to expiry** trying, and one of those two was lost *inside a read*: the state was read
first to decide what to click, and by the time the read returned the window was gone. Reading first
and acting second is the specific mistake. There is no amount of care that makes it work.

Install a watcher that arms itself and fires the whole sequence in-page, at page speed. You are then
reading a recording instead of racing a clock. Attach **live Firebase listeners** rather than polling,
so the shared-state transitions are captured event-driven with no polling lag on top of the network.

```js
const S = () => window.__pp_app_state_debug();
const T0 = Date.now(); const trace = [];
const log = (k, x) => trace.push(Object.assign({ms: Date.now()-T0, kind:k}, x));

// live listeners beat polling — no lag on the shared-state transitions
const pRef = S().db.ref('rooms/'+S().room+'/paused');
const pCb = s => log('fb.paused', {v: s.val()});
pRef.on('value', pCb);

let fired = false;
const armIv = setInterval(() => {
  if (fired) return;
  const cs = S().clockState;
  if (cs && cs.seat === S().mySeat && !cs.paused && (cs.deadline - Date.now()) > 24000) {
    fired = true; clearInterval(armIv); run();      // a FRESH clock on my seat
  }
}, 100);

window.__ppWatch = { trace, stop: () => { pRef.off('value', pCb); clearInterval(armIv); } };
```

Five things that cost real time to learn:

1. **Detach the listeners when you are done** — `ref.off('value', cb)`, which is why the skeleton
   exposes a `stop()`. Nothing will catch you if you skip it: `scripts/net_contract_check.js`
   inventory-gates the watchers *declared* in `src/net/watchers.js` against the `registry.attach()`
   calls in source, so a listener you attached from the console is invisible to that gate. The reason
   to detach is tidiness — a leaked listener keeps firing into a page that otherwise accounts for
   every watcher it owns. Do not assume a test is watching your back here, because it is not.
2. **Hold a visible state longer than you think.** A 1.5s pause hold was too fast for the human on
   the other browser to register at all; 8s was unambiguous. While paused the clock is frozen, so a
   long hold costs nothing.
3. **If your seat is on the clock during the run, have the watcher resolve the turn afterwards** —
   click "Stay put" or equivalent. Otherwise you hand the turn straight back to expiry the moment the
   check ends, and the run that proved your point also loses a turn.
4. **Gate any general autoplay driver on a busy flag** while the check runs, or the two collide. The
   §5b driver will happily click through the very prompt the check is sitting on.
5. **Beware a shared toggle with two drivers.** `#scPause` is a blind toggle over one shared flag.
   With a human and a script both clicking it, a click can land on an already-paused game and resume
   it — which reads as *"the pause did not work"* when the pause worked fine. Agree in advance that
   exactly one side drives it.

This technique is what closed Phase 13's checks 2 and 3. The measured traces are in
`.planning/phases/13-multiplayer-turn-clock/13-VERIFICATION.md`, with the durable copy at
`.planning/milestones/v1.2-phases/13-multiplayer-turn-clock/13-VERIFICATION.md` — that archive copy
is the one that survives a `/gsd-cleanup`. Read the numbers there; they are not restated here.

## 5e. INJECT THE STATE YOU WANT TO TEST — do not play your way to it

**This is the first thing to reach for when a feature only appears in a rare or late game state.**
Wyatt, 2026-08-02, after watching a session burn five minutes waiting for a voyage to end and then
report a FAIL: *"we already have a process for triggering storms and end-of-game full recipes using
code injections."* Sessions have used the recipe fill routinely; it had simply never been written
down here, which is the only reason it got re-derived the hard way.

A full solo voyage takes **many minutes** — four captains, narration holds, and per-square animation
on every move. Almost nothing worth testing needs the whole voyage; it needs the *state*. Reach into
the live engine and put the game there.

The live `appState` (and through it the live `Game`) is reachable from any page context:

```js
const st = (await import('/src/state/index.js')).appState;
```

### End of Voyage — fill the recipe

`checkFinish(p)` (`src/engine/index.js`) is `!this.needs(p).length && man(p.pos, this.home) <= 1`,
and `needs(p)` is `p.recipe.filter(i => !p.ing.includes(i))`. So handing a seat its own recipe ends
its hunt immediately:

```js
const st = (await import('/src/state/index.js')).appState;
const me = st.game.players[st.mySeat];
me.ing = [...me.recipe];          // needs(me) is now empty
```

Then let the §5b driver run. Its `target()` already returns `g.home` the moment `needs` is empty, so
it beelines for Tortuga, and `checkFinish` fires after your next turn. Rounds still take real time —
budget minutes, not seconds.

**Do NOT also set `p.pos`.** Tried and rejected: the sail prompt's highlighted cells come from the
engine's own position, so a hand-set `pos` and the cells the driver clicks disagree, and the ship
sails back out of the finish zone. Fill the recipe and let it steer.

### Storms — raise the probability on the LIVE cfg

`rollStorm(g)` is `g.r() < g.cfg.storm`, so:

```js
(await import('/src/state/index.js')).appState.game.cfg.storm = 1;   // set back to 0.125 after
```

**Prefer this to the old method.** Earlier sessions forced storms by editing `roundCfg` in
`src/engine/index.js` and reverting — scaffolding so dangerous to ship that Phase 14 carries a
dedicated verification row proving it did not (`14-VERIFICATION.md` row 8: *"The forced-storm test
scaffolding (`cfg.storm=1`) does not ship"*). A live mutation cannot ship, needs no revert, and
leaves `git status` clean.

Two things that will make it look broken when it is not: the storm rolls **at a round boundary**, so
nothing happens until the next round starts (minutes); and `rollStorm` refuses a third consecutive
storm (`stormStreak >= 2`), so you get storms, not every round.

### RED-PROOF THE INJECTION — get to a known-negative state first

The first storm check written for this section **passed without proving anything**: it set
`cfg.storm = 1`, saw `stormNow === true`, and reported success — but `stormNow` was *already* true
before the injection. It could not have failed. Force the negative first (`cfg.storm = 0`, wait for
`stormNow === false`), *then* inject. Same flaw the original Check B had (§5d) and the same fix.

### Where injection is and is not safe

| | |
|---|---|
| **Solo / decorative** | Safe. Nothing else is watching the state. |
| **Multiplayer** | **No.** The host is the sole authority (D-06); mutating a guest desyncs it, and mutating the host desyncs the broadcast against the `dlog`. |
| **Replay / determinism** | **No.** Injection changes state without consuming the RNG the fixtures recorded. Never inject while capturing a determinism baseline. |
| **Shipping** | Never. That is the point of doing it live rather than in source. |

### Generalise it

The pattern is: find the predicate the feature keys on, then set its inputs directly. `needs()` and
`man(pos, home)` gate the End of Voyage; `cfg.storm` gates the weather; `p.coins` gates every
can-I-afford-it branch; `p.done` and `finishOrder` gate the final round. Anything reachable from
`st.game` can be posed. **Ask "what state does this feature read?" before "how do I play until it
happens?"** — and when a check fails, first establish whether the state you meant to create actually
exists, rather than concluding the feature is broken.

## 6. Inspecting state

`window.__pp_app_state_debug()` returns a **shallow copy** of `appState` (`src/main.js`). Also
available: `__pp_module_ok`, `__pp_boot_count`, `__pp_net_debug`.

The live modules are importable in the page, which is the cleanest way to exercise one function:

```js
const board = await import('/src/ui/board.js');
const state = await import('/src/state/index.js');   // state.appState is the LIVE object
board.showStats();                                    // render the End of Voyage panel on demand
```

## 7. Watching an animation

`drawBoard()` wipes the board SVG on every render, so a `.pop` element created for inspection is
usually destroyed before you can sample it — which reads as "the animation never ran".

Read the composed keyframes off the running animation instead of sampling frames:

```js
const a = el.getAnimations()[0];
a.effect.getKeyframes();        // offsets, transforms, per-keyframe easing
a.effect.getTiming().duration;
```

That proves the curve. It does **not** prove how it feels — that stays a human check.

## 8. Blocking dialogs look like a hung tab

`alert()` blocks the renderer, and the browser tooling reports that as *"the renderer may be frozen
or unresponsive"*. Before diagnosing a freeze, stub it and re-run:

```js
window.__alerts = []; window.alert = m => window.__alerts.push(String(m));
```

An `alert()` on a failure path cost real time here once, presenting as a frozen tab when it was a
failed Firebase call.

## 8a. THE ANSWER TO §8b: drive headless Chrome yourself over CDP

**When you need real animation timing, do not use the MCP browser at all.** §8b below explains why it
cannot give you one — hidden tabs kill `requestAnimationFrame`, clamp timers, and never settle
layout. Launching Chrome headless yourself fixes all three, needs no `npm install`, and **never takes
over Wyatt's screen** (his standing rule: never drive visible Chrome, it steals his focus).

This found the narration-box bug that four rounds of code-reading missed. It is the single highest-
leverage tool in this document.

### Launch it

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --remote-debugging-port=9333 \
  --user-data-dir=/tmp/chrome-probe --no-first-run about:blank &
curl -s http://127.0.0.1:9333/json/version    # confirm it is up
```

> **`--user-data-dir` GOES IN `/tmp`, AND NEVER INSIDE THE REPO.** A Chrome profile is ~10 MB and
> ~700 files of browser bookkeeping, and it carries `Cookies`, `Login Data` and `History` alongside
> the parts you want. On **2026-08-26** a playtest pointed it at
> `.planning/phases/02.2-…/playtest-…/prof-*` and the whole run was committed: **15 profiles, 10,713
> files, 142 MB**, in commit `5d82213`. At 3:50am GitHub emailed Wyatt *"Possible valid secrets
> detected"* — its scanner had found, in `Default/shared_proto_db/000003.log`, the Google API key
> **baked into every copy of Chrome** (sent as `X-Goog-Api-Key` to
> `optimizationguide-pa.googleapis.com`). It is Google's key, not ours, so nothing needed rotating —
> but the repo is public, the profiles' `Cookies` and `Login Data` were empty only because they were
> newly made, and it cost 142 MB and an alert. `.gitignore` now carries `prof-*/` and
> `chrome-probe*/`. **Keep profiles in `/tmp` and they cannot be added by accident.**

Headless **does** run rAF and CSS animations properly. Confirm the environment before trusting a
reading — a wrong answer here invalidates everything downstream:

```js
matchMedia('(prefers-reduced-motion: reduce)').matches   // must be false, or you are measuring
                                                         // the reduced-motion code path
```

### MEASURING COST IS NOT MEASURING LAYOUT — two traps that both report ZERO

The launch line above is right for **sequencing and layout** work (what ran, in what order, did the
box move). It is **wrong for measuring how expensive something is**, and both failures below produce
a confident, plausible, wrong number rather than an error. Each cost a wrong conclusion on
2026-08-01/02.

**1. Drop `--disable-gpu` when measuring cost.** With it, the welcome screen measured **1.6% CPU**
and the real culprit was invisible. With the GPU on, the same state measured **7.6%** and the cause
was obvious. Launch a separate probe for cost work:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9336 \
  --user-data-dir=/tmp/chrome-cost --no-first-run about:blank &
```

**2. YOU MUST DRIVE FRAMES.** An idle headless page stops producing them, so every CSS animation
costs exactly nothing and `LayoutCount` never moves. Measured minutes apart on the same build:

| same page, same 5s window | CPU | layouts |
|---|---|---|
| no rAF loop running | 0.2% | **2 (0/s)** |
| rAF loop running | **11.1%** | **300 (60/s)** |

The first reading is not a small error — it is the entire cost missing. Inject a ticker for the whole
window and cancel it afterwards:

```js
window.__f=0;(function t(){window.__f++;window.__raf=requestAnimationFrame(t);})();
// ...measure...
(()=>{const v=window.__f;cancelAnimationFrame(window.__raf);return v;})()   // also gives you fps
```

**Always report the fps you actually achieved beside any cost number.** If it is not ~60 the page was
not rendering, and the number underneath it means nothing. A cost measurement with no frame count
beside it is not evidence.

**Attribute by ablation, never by reading code.** Remove one suspect, re-measure, compare. Three
times now the thing everyone was sure of was not the cause: the `drawBoard()` teardown was not the
in-play cost (the ripple was); `transform-box: fill-box` was not why the ripple forced layout (Chrome
simply never composites SVG transform animations, and `will-change` cannot promote an SVG child); and
the welcome screen's cost was neither the blur nor the board rebuild but **four leftover victory
pastries** left dancing behind it.

**Compare like with like.** "Idle at a human prompt" and "mid-turn with bots moving" are different
measurements; the same build reads 2 layouts/sec as the first and 10–20 as the second. State which
one a number is, and never compare across them.

### Talk to it — Node has everything you need

Node 22+ has a global `WebSocket`, so a CDP client is ~15 lines and no dependency:

```js
const tgt = await (await fetch("http://127.0.0.1:9333/json/new?about:blank",{method:"PUT"})).json();
const ws  = new WebSocket(tgt.webSocketDebuggerUrl);
let id=0; const pend=new Map();
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m); pend.delete(m.id);} };
const send = (method,params={}) => new Promise(res => { const i=++id; pend.set(i,res); ws.send(JSON.stringify({id:i,method,params})); });
const evalJS = async expr => (await send("Runtime.evaluate",{expression:expr,returnByValue:true}))
                              .result?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride",{width:390,height:900,deviceScaleFactor:2,mobile:true});
```

`setDeviceMetricsOverride` is the phone-width tool that `resize_window` could never be (§8b.2) — it
actually moves `innerWidth`, so narrow-screen bugs reproduce.

### Sample every animation frame

Inject a rAF loop that pushes into an array, then read it back at the end. This gives you numbers,
not impressions:

```js
window.__log=[]; window.__t0=performance.now();
(function tick(){
  const g=document.getElementById('apGrid'), inner=document.getElementById('apGridInner');
  const live=inner.querySelector('.apMsg:not(.fadeOut)'), ghost=inner.querySelector('.apMsg.fadeOut');
  window.__log.push({
    t:+(performance.now()-window.__t0).toFixed(1),
    rows:getComputedStyle(g).gridTemplateRows,       // the pinned/max-content row
    h:live?live.offsetHeight:-1,                     // the MESSAGE height — see the trap below
    ghost:ghost?+getComputedStyle(ghost).opacity:null
  });
  requestAnimationFrame(tick);
})();
```

**Trap, and it cost a wrong conclusion here:** do **not** measure `#apGridInner.offsetHeight` as
"content height". It is stretched to the grid row, so it tracks the height *animation* rather than
the text. Measure `.apMsg` itself.

### Find WHO changed something, not just that it changed

When a value moves and nothing explains it, log the writers. Patching
`CSSStyleDeclaration.prototype` from the page did **not** work here; adding a temporary logger inside
the source did, immediately:

```js
const HLOG=(w,v)=>{try{(window.__h=window.__h||[]).push({t:performance.now(),w,v:String(v)});}catch(e){}};
```

Drop one call at each site that writes the value, run, and read the order back. That is what revealed
`panel("")` firing between every message — which meant the fade was never running on 8 of 9 swaps.

**Remove it afterwards.** `npm test`'s retained-globals check will fail on `window.__h`, which is the
guard working exactly as intended.

### Assert, do not eyeball

The point of numbers is machine-checkable claims. These three settled the narration box:

| Claim | Check |
|---|---|
| the box never moves during a fade | group samples where `ghost !== null`; `rows` must be constant in each |
| text never reflows while on screen | group by message; `.apMsg` height must be constant in each |
| nothing is ever clipped | for every frame, natural height must be `<=` the pinned row |

Going from *"still glitchy"* to *"0 of 8 fades moved, 0 of 10 messages reflowed, 0 of 1476 frames
clipped"* is the difference between guessing and knowing.

**Chrome is not Safari.** This proves sequencing and layout, not compositing — and Safari is where
this project's rendering bugs have historically lived. A green harness still earns a human Safari
pass, it does not replace one.

## 8b. A HIDDEN tab is the other fake freeze — and it silently corrupts layout readings

Check this **first**, before trusting any timing or layout number:

```js
({ hidden: document.hidden, focus: document.hasFocus(), outer: window.outerWidth })
```

`hidden: true` / `outerWidth: 0` means the tab is backgrounded (the MCP browser session commonly
opens tabs this way). Chrome then throttles it, and three separate things break — each of which
reads as a bug in the game rather than an artifact of the harness:

1. **`requestAnimationFrame` never fires.** So `await new Promise(r => requestAnimationFrame(r))`
   never resolves and the tool call dies with *"the renderer may be frozen or unresponsive"* after
   its timeout. The renderer is fine. This is the §8 symptom with a completely different cause, and
   it cost most of a session before it was spotted.
2. **`setInterval`/`setTimeout` are clamped to ~1/sec.** A 100ms sampling loop silently becomes a
   1000ms one. A typewriter reveal that really takes ~500ms measures as ~1000ms, and a sampler that
   should catch 25 frames catches one. Do not quote any duration measured in a hidden tab.
3. **rAF-driven layout never settles.** `resizePanel()` pins the panel height through a rAF/reflow
   sequence, so in a hidden tab `#apGrid`'s `grid-template-rows` sits at `0px` forever and every
   `.apBtn` measures as overflowing its container by its full height. That looks exactly like the
   FIX-10 clipping bug. It is not. Take a screenshot — the act of screenshotting activates the tab,
   the panel expands, and the "bug" evaporates.

**MutationObserver still fires** in a hidden tab and is not timer-throttled, so it is the right
instrument for proving *ordering* (did X happen before Y) when the tab cannot be foregrounded.
Callbacks coalesce, so you get an event per batch rather than per character — enough for ordering,
never enough for a per-frame record.

**What a hidden tab cannot do at all:** anything keyed to real viewport width. `resize_window`
returns success but does not move `window.innerWidth` when `outerWidth` is 0, so the
`@media (max-width: 480px)` breakpoints and any 320/375/390 sweep are **not testable** from a hidden
tab. That work needs a real visible window — or Wyatt's own browser. Say so rather than reporting a
width-dependent check as passed.

## 8c. SAFARI/WEBKIT — it finds Playwright on its own now

**Do not put it in `/tmp`.** `/tmp` is cleared on reboot, and that is exactly what silently
disabled every Safari leg: on 2026-08-27 a full sea trial reported **2 legs NOT RUN** with
*"playwright not found"*, while the WebKit **browsers** sat perfectly intact in
`~/Library/Caches/ms-playwright/`. Only the little npm package directory had evaporated, and
nothing said so until a trial refused to sail.

`scripts/lib/wk.mjs` now searches, in order:

1. **`$PW_DIR`** — an explicit override still wins, for a one-off or a CI image
2. **`~/.pw`** — the durable home. 18 MB, survives reboots, created 2026-08-27
3. **bare `playwright`** — a global or workspace install, if one exists

So the normal case needs no environment variable at all. If it is ever missing again:

```bash
mkdir -p ~/.pw && cd ~/.pw && npm i playwright && npx playwright install webkit
```

*(`npm init -y` fails in `~/.pw` — npm rejects a package name beginning with a dot. It is not
needed; `npm i` works regardless, and a hand-written `package.json` is already there.)*

**Verified 2026-08-27 with `PW_DIR` explicitly unset:** `solo-phone-wk` launched and played to
DAY 2 with no environment variable in sight.

---

## 9. Never verify against production

`playpastrypirates.com` serves whatever last merged to `main`. It can never prove anything about
work in progress. All browser verification targets the local server.
