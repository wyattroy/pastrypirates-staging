// src/state/index.js
//
// Phase 10 (App State & De-globalization), Plan 01, Task 2. The single mutable app-state
// container (GLOBAL-01, D-05). ONE plain object, exported ONCE, and NEVER REASSIGNED — only its
// properties mutate. This is the entire mechanism: the temporary Phase 8 global-object bridge
// (deleted in Phase 11, 11-07) published a value-copy snapshot — correct for read-only constants
// but insufficient for state that gets reassigned after init (`room=code`, `game=new Game(...)`,
// …) — a snapshot cannot observe a later reassignment because nothing holds a live reference back
// to the classic script's own binding. Publishing this object itself (by reference, once, through
// that same historical bridge mechanism) sidesteps the copy step entirely: every property WRITE
// the classic script performed (`appState.room=code`) mutated the one object every holder — this
// module, the (now-deleted) bridge, any future debug hook or Phase 11 consumer — shared a
// reference to. See
// 10-RESEARCH.md's "Why a snapshot bridge cannot work" for the underlying language facts
// (top-level `let`/`const` in a classic script never becomes a `window`/`globalThis` property;
// ES-module live bindings are only live module-to-module, never classic-script-to-module).
//
// NAMED `appState`, NOT `state` (a mid-task correction from RESEARCH/CONTEXT's illustrative
// `state` naming — CONTEXT.md's own "Claude's Discretion" section explicitly leaves "the
// app-state module's exact name" open). `state` turns out to already be a local
// parameter/variable name in this exact classic script — `function broadcastFlip(state)`,
// `function setFlipCoin(state)` (the coin-flip outcome), `function coinHTML(state, ...)`,
// `function setRecoveryState(state)` (a recovery status string), and a local
// `const state=isHost?(...):clockState;` inside `setClockUI()` — all unrelated to app state. The
// migration tool has no scope analysis, so publishing the bridge AS `state` would make every
// rewritten `state.room` inside e.g. `broadcastFlip()` silently read `.room` off the LOCAL
// flip-outcome parameter instead of this object: no syntax error, just a wrong room code at
// runtime. `appState` was grepped and confirmed to have ZERO existing occurrences anywhere in
// index.html or src/**/*.js before being chosen. See scripts/migrate_app_state.js's header for  [ROOT-TREE-CITATION: migrate_app_state.js reads the root tree on purpose — true as written]
// the full account and 10-01-SUMMARY.md's Deviations section.
//
// REASSIGNING THE `appState` BINDING ITSELF (`appState = {...}` anywhere, including in this
// file) REINTRODUCES THE SNAPSHOT BUG ONE LEVEL DEEPER. Every other holder's reference would keep
// pointing at the OLD object, silently desyncing from whatever replaced it here. Only ever mutate
// `appState`'s own properties (`appState.room = code`), never the binding.
//
// No getter/setter/Proxy on `appState` — plain data properties only (D-06/NO-ACCESSORS). An
// accessor with any side effect, or a getter that allocates, could change the timing of a
// determinism-critical read/write; a plain object's property access is synchronous and
// order-preserving by the JS spec with zero indirection, which is exactly what the replay/
// determinism guarantee (D-06) requires.
//
// Purity bar matches src/engine/ and src/shared/ (mechanically enforced by
// scripts/state_contract_check.js's assertion 4): no document/window/firebase/localStorage/
// Date.now/Math.random/globalThis/new Function reference inside this module itself. "Purity"
// here means "this module doesn't reach out to the DOM/network on its own" — not "the state is
// immutable"; the state is emphatically mutable, by every consumer, through property writes.
//
// Every default below is seeded from the classic script's OWN declaration-site initializer
// (index.html:864, :2015-2051, :3896-3903, :3976, :4590 as of this task — re-confirmed against
// the live file, not copied from RESEARCH.md's illustrative table). The 46 names are exactly
// APP_STATE_NAMES in scripts/migrate_app_state.js — the 7 UI-render-handle names (cell, shipEls,  [ROOT-TREE-CITATION: migrate_app_state.js reads the root tree on purpose — true as written]
// activeRing, spinNeedle, stormText, stormDial, windLabels) are deliberately absent; they have
// zero non-UI readers (RESEARCH Q4) and belong to Phase 11's UI extraction.
export const appState = {
  // index.html:864
  game: null,
  evIdx: 0,
  timer: null, // confirmed NOT an active setInterval/setTimeout handle — declaration-only, dead
  // state in the current codebase (see scripts/migrate_app_state.js's TIMER_IS_ACTIVE_INTERVAL_HANDLE)  [ROOT-TREE-CITATION: migrate_app_state.js reads the root tree on purpose — true as written]
  logLines: [],

  // index.html:3896-3903 — networking plumbing + lobby/session bookkeeping
  db: null,
  myId: null,
  room: null,
  mySeat: null,
  isHost: false,
  roster: null,
  turnOrder: null,
  numSeats: 4,
  evPushed: 0,
  promptCounter: 0,
  gameStarted: false,
  appliedMeta: false,
  passAndPlay: false,
  activeTurnSeat: null,
  recipeRevealed: false,

  // index.html:2015-2051 — live (human) mode: networked-turn bookkeeping, shot clock, replay
  live: false,
  liveDone: false,
  liveGen: 0,
  curSeat: 0,
  inBattlePrompt: false,
  spectatingBattle: false,
  shotClockSeat: null,
  shotClockDeadline: 0,
  shotClockTimer: null,
  shotClockForce: null,
  shotClockStash: null,
  shotClockPaused: false,
  // /4: true only while the CURRENT pause was created by the hide-tab auto-pause (src/main.js) —
  // the visibility handler auto-resumes exactly that pause on return and never a player's own ⏸
  autoPausedByHide: false,
  // /4 fast-forward: true while a one-shot ⏩ skip runs (armed by the ribbon chip, stage.js;
  // ended by ANY prompt involving the player — flow.js ffEndNow). ffFromEv marks the event index
  // when the skip armed, so the recap covers exactly what played unwitnessed. Pure UI pacing —
  // the engine never reads either field.
  ff: false,
  ffFromEv: null,
  shotClockPauseElapsed: 0,
  timerOff: false,
  shotClockFired: {},
  turnExpired: false,
  clockState: null,
  // 18-05 (D-02): a one-shot continuation ask() (src/ui/util.js) publishes so the reveal-
  // completion gate (panel(), src/ui/panel.js) can defer starting the shot clock until the
  // button row is actually clickable, instead of at prompt-render — follows the
  // activePickCleanup precedent below (a function stored on appState, read-and-nulled by
  // whichever call takes ownership of it). In declaration order: the seat whose button row is
  // currently gated (drives the frozen pending display on host AND guest alike, cleared once
  // that reveal resolves); the continuation itself (the arming function plus the resolver that
  // unblocks ask()'s force-resolver wrap, read-and-nulled at most once per decision); whether
  // this seat's decision renders on the host's own browser directly (tells the reveal gate
  // whether to defer onto its own reveal, or — for a seat rendering elsewhere — to schedule an
  // estimate instead); and the deciding actor's own prompt HTML (never this browser's shorter
  // spectator line), read to size that estimate.
  clockPendingSeat: null,
  clockPendingArm: null,
  clockPendingLocal: false,
  clockPendingText: "",
  activePickCleanup: null,
  // 02.15-02 Task 3: the "one current prompt" of Wyatt's shape for this whole plan — the spec
  // renderPickPrompt() is CURRENTLY drawing. Set inside the renderer, cleared inside its teardown,
  // on every tier alike. null while a captain is visibly being asked is the signature of an
  // orphaned prompt (see docs/DRIVING-THE-GAME.md §6's state-inspection technique).
  currentPrompt: null,
  replaying: false,
  dlog: [],
  dlogIdx: 0,
  dlogN: 0,
  resumeEvLen: 0,
  resumeReadFailed: false,

  // index.html:3976 — solo/pass-and-play persistence
  soloMeta: null,

  // index.html:4590 — board-resize RAF handle
  syncBoardRAF: null,

  // index.html:2527 — chat spam-guard timestamp
  lastChatSendAt: 0,
};
