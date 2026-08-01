# Driving Pastry Pirates from a browser session

How to make the game actually *play* under automation — for verifying a change end-to-end rather
than asserting about source. Written after three separate attempts stalled on the same two things.

`docs/VERIFICATION-CHECKLIST.md` says **what** to verify (it is Phase 12's scenario list and its
results). This says **how** to drive it. Read both before a browser pass.

---

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

Hosting instead: `document.getElementById('choiceHost').click()` creates a real Firebase room on the
first click. **Delete the room afterwards** — `appState.db.ref('rooms/'+room).remove()` — or use the
back link on the room screen, which calls `abandonRoom()` and tears it down properly.

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

### 4c. Sailing — derive the grid cell from the rect

Highlighted squares are `.sailCell` rects. Their geometry comes from `sailHighlightRect()`
(`src/ui/flow.js`), which insets by `SAIL_HL_SCALE`, so invert that to get board coordinates:

```js
const side  = parseFloat(rect.getAttribute('width'));
const px    = (side / 0.9) + 4;          // 0.9 === SAIL_HL_SCALE
const inset = (px - side) / 2;
const gx = Math.round((parseFloat(rect.getAttribute('x')) - inset) / px);
const gy = Math.round((parseFloat(rect.getAttribute('y')) - inset) / px);
```

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
| `timerOff` / `shotClockPaused` | both sides | the host's clock changes must propagate to the guest |
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

## 9. Never verify against production

`playpastrypirates.com` serves whatever last merged to `main`. It can never prove anything about
work in progress. All browser verification targets the local server.
