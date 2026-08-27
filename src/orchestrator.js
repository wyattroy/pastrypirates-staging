// src/orchestrator.js
//
// Phase 11 (SPLIT-03/05/06), wave 11-06. The orchestration layer — the 44 net-caller functions
// 11-analysis.json's `orchestration` tier identified (each calls a src/net/-backed function
// directly), plus the small handful of net-adjacent helpers (netFail, the chat/shot-clock sync
// cluster) that sit alongside them and were left classified only as "orchestration" by omission
// from the analysis's own function-name lists. This is the LAST tier of the classic <script>
// region: after this file absorbs everything below, index.html's classic script holds zero
// top-level `function` declarations (only bridge assembly + markup remain, per this phase's own
// goal state — the bridge itself is deleted in 11-07).
//
// Tier placement (scripts/module_graph_check.js): this file lives directly under `src/`, so it is
// inferred as tier "main" — the SAME composition-root tier src/main.js occupies. That is
// deliberate, not incidental: orchestration legitimately needs to import BOTH src/net/ (to drive
// sync) and src/ui/ (to render results), which is exactly the "main" tier's unrestricted-downward
// shape (D-06's flagged assumption explicitly allows "one src/orchestrator.js or several
// src/flow/*.js modules imported by main" — this wave chose the single-file form). src/ui/ itself
// is NEVER allowed to import this file (or src/net/ directly, D-07) — the module_graph_check.js
// tier shape for "ui" only permits shared/engine/state, and orchestrator's own tier is "main", not
// one of those three, so a ui->orchestrator import would fail the SAME shape assertion a
// ui->net import would. That asymmetry is why the many still-existing bare-identifier calls FROM
// src/ui/flow.js and src/ui/util.js INTO the functions below (broadcastFlip, netNarrate,
// netBroadcast, renderBattle, battleAsk, asyncBattle, remotePrompt, remoteDraftPrompt,
// logDecision, beginGame, broadcastClock, expireShotClock, and others — RESEARCH.md's own
// 11-04/11-05 SUMMARYs record these as deliberately left bare, "orchestration... homed in 11-06")
// are NOT converted to `import`s here — they stay bare, resolved through src/main.js's PP bridge
// exactly like every other still-bridged cross-reference this whole phase, now extended with this
// file's own exports (see src/main.js's own header for the mechanism, added in 11-06 task 3).
//
// Moved VERBATIM from the classic <script> region (byte-identical function bodies; only the
// bare-identifier reads that resolved via the PP bridge become real `import`s here) — this
// wave's two tasks split the 44+ functions into two commits:
//   Task 1: shot-clock/flip/chat sync, battle sync (incl. battleAsk/asyncBattle), presence,
//           meta/gamelog writers, applyEndMeta.
//   Task 2: room-lifecycle (createRoom/joinRoom/watchRoom/startGame/beginGame/wireLobby/boot),
//           prompt/response/draft plumbing, recovery, events/narr watchers, turn-flow orchestration.
//
// Deviation (positionChatBubble/removeChatBubble/clearChatBubbles NOT moved here): these three
// classic-script functions have ZERO net calls (11-analysis.json would classify them "ui (DOM)",
// not "orchestration") — they are pure chat-bubble DOM helpers that already live beside
// `chatBubbles` (the object they mutate) in src/ui/board.js (11-03). Moving them into THIS file
// would force src/ui/panel.js (which already imports render/boardCell/boardShipEls/chatBubbles
// FROM board.js) to import them from orchestrator.js instead — a ui->main edge the module graph's
// "ui -> shared/engine/state" shape assertion forbids, and board.js's own render() (already in
// board.js) calls positionChatBubble as a same-module sibling today, which a move here would
// break outright (board.js cannot import this "main"-tier file either). Moved into src/ui/board.js
// instead, alongside chatBubbles, as part of this wave's own Task 1 (see that file's own header
// note) — genuinely the correct home per D-06's file-split discretion, not a UI/orchestration
// misclassification on 11-analysis.json's part (the analyzer only scores net-calling functions
// into the orchestration tier; these three were always going to need a human placement call).
//
// Deviation (netFail NOT itemized in 11-RESEARCH.md/11-analysis.json's own function lists, moved
// here anyway): every one of the ~25 functions below that performs a Firebase write wraps its
// error callback in `netFail(label)` — omitting it from this file would leave every one of those
// call sites throwing ReferenceError the instant a write actually failed. Moved verbatim,
// unchanged, ahead of its first caller in this file (mirrors the classic script's own ordering:
// netFail was declared once, "networking plumbing" section, and used throughout).
//
// D-13 (watchRoom idempotency, Task 2): watchRoom() is invoked more than once per guest-join
// lifecycle (joinRoom() calls it, and a resumed/reconnected session's boot() path can call it
// again) — each call previously re-issued netWatchSeats()/netWatchStatus() unconditionally,
// tripping src/net/registry.js's "duplicate attach refused" ERROR-level log on the second call for
// the exact same room (its dedup key is scope|ref.toString()|event|label, and a repeat watchRoom()
// call for the SAME room produces an identical key both times). Fixed with a module-scope guard
// (`_watchRoomAttachedFor`) that skips re-attaching the two room-scoped watchers once they are
// already live for the current room — the read + lobby-view refresh above the guard still runs
// every time (harmless, and needed so a genuine re-entry still sees the current room state).

import { appState } from "./state/index.js";
import { pingVisit, pingStart, pingFin, usageGid } from "./ui/usage.js";
import { Game, roundCfg, rollStorm } from "./engine/index.js";
import { applyResult } from "./engine/bakeoff.js";
import {
  PERP, DIRS, HEXCOL, CROWN_IMG, CLOSE_X_IMG, FLAME_IMG, unusedDefaultName, seatHeldName, applyNameClaim, iconImg, man,
  ilabelImg, ovensNowEnabled, bake2Enabled, endCardEnabled,
} from "./shared/index.js";
import { initAudio, playForEvent, playWinScreen, playBattleEngage, isMuted, setMuted } from "./ui/audio.js";
import {
  netSetFlip, netWatchFlip, netSetClock, netSetTimerOff, netWatchTimerOff, netWatchClock,
  netSetPaused, netWatchPaused, netDeleteRoom,
  netSetNarr, netPushChat, netWatchChat,
  netSetBattle, netWatchBattle, netRemoveBattle,
  netWatchConnected, netWatchPresence, netMarkPresence, netInit,
  netSetMeta, netWriteGameLog,
  netReadMeta, netUpdateRoom, netSetRecipes,
  netSetRecovery, netRemoveRecovery, netWatchRecovery,
  netPushEvent,
  netSetPrompt, netRemovePrompt, netWatchResponse, netDetach, netSetResponse,
  netSetDraftPrompt, netWatchDraftResponse, netRemoveDraftPrompt, netWatchDraftPrompt, netSetDraftResponse,
  netWatchEvents, netWatchPrompt, netWatchNarr,
  netSetDlog,
  netCreateRoom, netClaimSeat, netReadRoom, netWatchSeats, netWatchStatus,
  netSetTurnOrder, netWatchTurnOrder, netWatchRecipes,
  netLeaveRoom, netSetFeedback, netReadDlog, netReadEv,
  netMarkHostGoneOnDisconnect, netClearHostGone,
  netForfeitOnDisconnect, netClearForfeitOnDisconnect,
} from "./net/index.js";
import {
  showNarration, panel, setNeedsAction, flash, fadeOutPanel, narrateLastEvent, liveRender, setClockUI,
  bakeoffPrompt, bakeoffReveal, playBakeoffLive,
  appendChatLine, showChatBubble,
  setFlipActive, setFlipCoin, flipSpinLeftMs, FLIP_LAND_HOLD_MS, boardCell, boardShipEls, drawBoard, render, resetBoardLog,
  seedIdleGameState, syncBoardSizing, watchMutePlacement, victoryConfetti, clearChatBubbles,
  showSeatCoins, // MP-06: the ONE purse renderer, shared with render() (04-01 Task 2)
  battleSnapshot, renderBattleFromSnap, battleFooter, coinHTML, pipsHTML,
  collectSideBets, settleSideBets, netIntroBarrier, showAhoyIntro, showTurnOrderIntro,
  reachable, pickCell, localAsk, humanTurn, botTurn, runStormLive, renderPickPrompt, wireRestoreFail,
  startPassAndPlay,
  endReplay, animateRimSweepIfAny,
  showHome, showRoom, showGameView, renderSeatList, wireWelcome, buildPlayerRows, hideBootLoader,
  wireRecipeModal, recipeInfo, winRecipeSpan, recipeCardHTML, passGate,
  getMyId, preloadAssets, resumeSoloGame, genCode, saveSession, clearSession, seatStrat,
  requireName, getLastName, saveLastName, // FIX-01: the one read chokepoint (createRoom) and the raw persisted read (Feedback); saveLastName for item 31's modal-free join
  MAX_NAME_LEN, // the live RTDB rule's own cap on seats/$seat/name — over it, the join dies server-side
  pendingAutoName, // NAME-01: was the resolved name CHOSEN by the player, or merely offered to them?
  openNameModal, // NAME-02: the room screen's "Change yer name" reuses the one naming modal
  setNameWarning, nameTakenMsg, // item 16/D-19: the inline "that name's taken" line and its words
  SESSION_SCHEMA_V, SOLO_SCHEMA_V,
  encodeDec, decodeDec, saveSoloState, clearSoloState, fixEv, syncLogLines, spawnPops, apBtnStyle,
  optionButtonsHTML, backButtonHTML, // 02.1-03: the ONE button-row builder, shared with localAsk
  sliderWrapHTML, wireSlider,        // 05-01 Task 3 (MP-08): the ONE coin slider, shared with localAsk
  rawName, pn, pname, updateRecipeBanner, toggleShotClockPause, applyPauseState, describe, seatLocal,
  decisionIsLocal, resolveOpt, setActor, applyActiveSeat, armClock, withShotClock, stepDelay, ask, pickNarrVariant,
  stopShotClock, waitWhilePaused, sleepMs, applyTimerOff, BOARD_LAST_LOOK_MS,
  mountKofi, openKofi, // KOFI-01: the embedded Ko-Fi panel and its modal opener
  coinShortfall, // G6: the shared coin re-validation, reached through the barrel (module_graph_check tiering)
  isDisabledBtn, showWhy, // playtest 21 item 5: a greyed circle is tappable and says why
  voyageAground, // the visible stall guard — a throw in the turn chain must never be silent again
} from "./ui/index.js";

// `$`/`sleep` are classic-script-local (index.html:863/:921) — see src/ui/board.js's/panel.js's
// own headers for the full precedent this mirrors. Reproduced verbatim as private module-locals;
// used well beyond this cluster (still-classic call sites this wave's own functions used to sit
// beside), so neither can simply "move" without breaking every other consumer.
const $=id=>document.getElementById(id);
// ⏩ fast-forward: same collapse as flow.js's sleep — beats that reach here without a player
// prompt (storm holds, bot-only pacing) race by; anything that asks ends the skip first.
// sleepMs, not a bare setTimeout: a dropped beat must cost a late line, never the voyage (util.js)
const sleep=ms=>appState.replaying?Promise.resolve():waitWhilePaused().then(()=>sleepMs(appState.ff?Math.min(ms||0,40):ms));

const MAX_CHAT_LEN=140;
// Firebase Spark's free tier caps at 100 simultaneous connections (see ONLINE_SETUP.md) — once
// we're seeing a meaningful fraction of that, warn on the home screen and point at solo play,
// which never touches Firebase at all. This is a soft warning, not a hard block: the real ceiling
// is enforced by Firebase itself, not by this count (which is necessarily a little stale/approximate).
const PRESENCE_WARN_THRESHOLD=80;

// visible fallback for a mid-game write that silently fails (e.g. connection refused because
// Spark's 100-connection cap is full) — without this a dropped write just looks like the game
// freezing with no explanation. Cleared automatically below once .info/connected goes true again.
function netFail(label){return e=>{console.error(label+" sync failed",e);const note=$("syncnote");if(note)note.style.display="";};}

// setFlipCoin/setFlipActive moved verbatim to src/ui/board.js (11-03).
// host: play the spin/land locally AND broadcast it so every connected browser's flippenator
// animates in sync, whether or not that browser is the one actually flipping
export function broadcastFlip(state){
  setFlipCoin(state);
  if(appState.isHost&&appState.db&&appState.room)netSetFlip(appState.db,appState.room,state,netFail("flip"));
}
export function watchFlip(){
  netWatchFlip(appState.db,appState.room,s=>{const v=s.val();if(v)setFlipCoin(v.state);});
}

export function broadcastClock(){
  setClockUI();
  if(!appState.db||!appState.room)return;
  // CLOCK-02 FIX (mp-pause-clock-desync): the payload now also carries the whole-table pause
  // state, so a guest flips frozen<->running AND reads its frozen remaining from the SAME
  // authoritative clock write that carries the deadline — never a round-trip apart from the
  // /paused flag. That round-trip gap WAS the desync: guests rendered the stale pre-pause
  // deadline and a host-only pauseElapsed they never received. `paused` rides every write (so a
  // running broadcast clears it); `pauseElapsed` (the host's frozen elapsed, D-07) is only
  // meaningful while paused, so it is included only then. Host stays the sole deadline writer.
  const payload=appState.shotClockSeat==null?null:{
    seat:appState.shotClockSeat,
    deadline:appState.shotClockDeadline,
    paused:!!appState.shotClockPaused,
  };
  if(payload&&appState.shotClockPaused)payload.pauseElapsed=appState.shotClockPauseElapsed;
  netSetClock(appState.db,appState.room,payload,netFail("clock"));
}
// #7 / FIX-02/N-03 (phase 21): any player may switch the turn timer off/on, in EVERY mode — the
// early return that used to make this a silent no-op with no Firebase connection (the D-20 "dead
// control" bug) is gone. Persisted locally FIRST, before either branch, so solo and pass-and-play
// (which never used to reach this line at all) actually remember the preference too (D-19). Then,
// exactly like togglePause() immediately below: multiplayer (db && room) writes Firebase so the
// whole table stays in sync via watchTimer(); solo/pass-and-play calls applyTimerOff() directly —
// the SAME body watchTimer() calls, carrying the BUG-02 re-arm fix verbatim (D-17/D-18), so neither
// direction can drift between the networked and local path.
export function toggleTimer(){
  const next=!appState.timerOff;
  try{localStorage.setItem("pp4_timerOff",next?"1":"0");}catch(e){}
  if(appState.db&&appState.room){
    netSetTimerOff(appState.db,appState.room,next,netFail("timerOff"));
  }else{
    applyTimerOff(next);
  }
}
// CLOCK-02: any player (host or guest) may trigger a true play/pause of the WHOLE game —
// countdown AND bot captains — not just the ⏱ timer-off toggle above (D-05: the two coexist).
// Multiplayer: write the flag; every client's watchPause() mirrors it, and only the host's
// branch mutates shotClockDeadline/shotClockPauseElapsed (D-06/D-07 — see applyPauseState).
// Solo/pass-and-play (no db/room): fall back to the local toggleShotClockPause() unchanged.
export function togglePause(){
  if(appState.db&&appState.room){
    netSetPaused(appState.db,appState.room,!appState.shotClockPaused,netFail("pause"));
  }else{
    toggleShotClockPause();
  }
}
// AUDIO-02 (phase 21): the mute button beside the clock. Pure client-side state — isMuted()/
// setMuted() (src/ui/audio.js) are the whole store, backed by their own localStorage key; no
// Firebase write, no net* writer, no appState field, so muting never reaches another player's
// browser (D-13, T-21-12). setClockUI() is called directly (main tier may call it, unlike ui-tier
// code) so the icon/tooltip refresh immediately rather than waiting for the next 500ms tick.
export function toggleMute(){
  setMuted(!isMuted());
  setClockUI();
}
// Structurally identical to watchTimer() below: every client (host and guest) attaches this so
// the shared paused flag is tracked table-wide. Only the host branch runs applyPauseState (the
// deadline/pauseElapsed math) — a guest just mirrors the boolean for rendering (D-06).
export function watchPause(){
  netWatchPaused(appState.db,appState.room,s=>{
    const v=!!s.val();
    if(appState.isHost){
      applyPauseState(v);
      // CLOCK-02 FIX (mp-pause-clock-desync): applyPauseState() recomputes the host-authoritative
      // deadline (resume) / stashes pauseElapsed (pause) but is PURELY LOCAL. Without this
      // re-broadcast the guests keep rendering the stale pre-pause deadline — freezing at a
      // different number and racing to 0 on resume. broadcastClock() is the single deadline writer
      // (host authority preserved) and now also carries the pause state for the guest render.
      broadcastClock();
    }else appState.shotClockPaused=v;
    setClockUI();
  });
}
// notes/edits BUG-02 / D-18 (phase 21): the state-mutation body (including the re-arm fix) now
// lives in src/ui/util.js's applyTimerOff(), shared verbatim with toggleTimer()'s new local
// branch below — this callback is reduced to just the Firebase wiring.
export function watchTimer(){
  netWatchTimerOff(appState.db,appState.room,s=>applyTimerOff(!!s.val()));
}
// notes/edits #1 audit: this was a bare netNarrate() with no hold/fade at all — the shot-clock
// penalty text could get clobbered the instant the next event fires, with no guaranteed read
// time whatsoever. async + flash() now gives it the same length-aware timing as every other
// narration. Called from a setInterval tick (shotClockTick) that doesn't await it — fine, since
// this is a one-shot side effect with nothing downstream depending on its completion order.
export async function expireShotClock(){
  // notes/edits #9: shotClockTick() is a setInterval that keeps ticking every 500ms while this
  // async function is mid-flight (its awaits below routinely run well past 500ms) — without
  // clearing the interval and blocking re-entry synchronously, right here, before any await, the
  // still-running tick fires this function again on top of itself and strips a second resource
  // for the same expiry ("snoozing pirates lose their treasure" firing more than once).
  if(appState.shotClockTimer){clearInterval(appState.shotClockTimer);appState.shotClockTimer=null;}
  const p=appState.game.players[appState.shotClockSeat];
  appState.shotClockSeat=null;
  appState.turnExpired=true;
  // BUG-02: a null resolver here is a real, distinguishable state, not an ordinary no-op — it
  // means the decision in flight was created before a timer-off and its resolver was never
  // handed back (see stopShotClock/rearmShotClock). Degrade loudly rather than silently letting
  // the countdown expire while nothing actually resolves the promise.
  if(appState.shotClockForce){appState.shotClockForce();appState.shotClockForce=null;}
  else if(appState.shotClockStash)console.warn("shot clock expired with a stashed resolver for seat",appState.shotClockStash.seat,"— auto-skip degraded");
  if(appState.activePickCleanup){appState.activePickCleanup();appState.activePickCleanup=null;}
  if(p){
    // NARR-01 audit finding: this used to hand-write text byte-identical to
    // EVENT_NARRATION.shotclockskip (src/ui/util.js) — narrate through the table instead, exactly
    // as every other event in the codebase is narrated, so the duplicate can never drift again.
    //
    // WYATT, 2026-07-30: **running out the 30s clock now costs the TURN AND NOTHING ELSE.**
    // *"when the shot clock runs out, you just lose your turn, but you don't lose a crate. Let's
    // get rid of that crate losing business altogether."* Asked whether the coin fallback went too,
    // he chose both 30s penalties. DO NOT RESTORE EITHER. What used to be here:
    //
    //   - holding crates -> a RANDOM crate spliced out and returned to tokens[]
    //   - holding none   -> up to 5🌕 taken
    //
    // The 20-second penalty (applyShotClockPenalty in src/ui/util.js — 1🌕 to each other captain) is
    // a DIFFERENT mechanic at a different threshold and deliberately still runs. He was asked
    // about it specifically and kept it.
    //
    // This also removes CR-02's root cause rather than guarding its symptom. The confiscation ran
    // AFTER shotClockForce() had already resolved the pending `ask()` promise, and `ask()` forces
    // default index 0 — Accept — so a partner who timed out auto-accepted a trade for a crate the
    // clock had just taken, and the trade then spliced on indexOf === -1. With no confiscation
    // there is no vanishing crate. The moveCrate() invariant and the turnExpired guard in
    // humanTrade stay regardless: a timed-out partner must not auto-accept in the first place.
    //
    // Determinism: the crate branch consumed one appState.game.r() call (the random crate index).
    // Removing it changes RNG draw counts in LIVE games only — the 31 fixtures are all-bot engine
    // replays where no shot clock ever fires, and src/engine/index.js is untouched. Verified green.
    appState.game.ev({t:"shotclockskip",p:p.idx});
    await narrateLastEvent();
    liveRender();
    if(!seatLocal(p.idx)&&appState.db&&appState.room)netRemovePrompt(appState.db,appState.room,netFail("prompt clear"));
  }
  stopShotClock();
}
export function watchClock(){
  netWatchClock(appState.db,appState.room,s=>{appState.clockState=s.val();setClockUI();});
}

// ---- narration: shown to everyone in the yellow action panel (no separate banner) ----
// D-10: `variants` is additive — the host's OWN screen now selects from the exact same payload
// every other client selects from (pickNarrVariant), rather than always rendering the
// viewer-neutral `html` verbatim. That's what lets a host who is themselves the subject of the
// line read the addressed ("you...") form, while the broadcast `html` field stays neutral for
// every other seat and for old clients that never read `variants` at all.
// `opts.wait` is item 19's flag and it must CROSS THE WIRE, or the guest's copy of a wait line
// expires on the hold curve while the host's sits there — a new divergence in the act of closing
// four. It is a UI-node field only; nothing in the event stream changes, so determinism is untouched.
// `variants` now rides along to showNarration as well as being picked from (02.2-07): the renderer
// asks the payload one question the picked STRING cannot answer — is this wait line about a
// question arriving at this browser. Handing the render seam what a guest's watchNarr already
// hands it is the convergence PAR-14 names; the picked line it draws is unchanged.
export function netNarrate(html,variants,opts){if(appState.replaying)return;showNarration(pickNarrVariant({html,variants},appState.mySeat),opts,variants);if(appState.isHost&&appState.db&&appState.room)netSetNarr(appState.db,appState.room,html,netFail("narration"),variants,opts&&opts.wait);}
// broadcast narration to spectators WITHOUT touching this screen's panel — used during
// battles so the local scoreboard (coins) stays put while others still get the play-by-play
export function netBroadcast(html,variants,opts){if(appState.replaying)return;if(appState.isHost&&appState.db&&appState.room)netSetNarr(appState.db,appState.room,html,netFail("narration"),variants,opts&&opts.wait);}

// ---- chat: free-text messages between human players. Unlike narr/ev (host-authoritative),
// every client sends and listens directly — there's no single "who computes this" owner. Nothing
// is persisted: messages are pushed to a per-room list that's wiped by startGame()'s reset (like
// narr/ev/dlog) and never written to gamelogs.
export function sendChat(raw){
  if(!appState.db||!appState.room)return;
  const text=(raw||"").trim().slice(0,MAX_CHAT_LEN);
  if(!text)return;
  const now=Date.now();
  if(now-appState.lastChatSendAt<1000)return; // basic client-side spam guard (RTDB rules can't rate-limit without auth)
  appState.lastChatSendAt=now;
  netPushChat(appState.db,appState.room,{seat:appState.mySeat,text,t:now},e=>console.error("chat write failed",e));
}
// appendChatLine moved verbatim to src/ui/panel.js (11-04).
export function watchChat(){
  netWatchChat(appState.db,appState.room,snap=>{
    const v=snap.val();if(!v)return;
    appendChatLine(v.seat,v.text);
    showChatBubble(v.seat,v.text);
  });
}

// The battle scoreboard: names, a static result circle per fighter, and pips. The coin never
// spins here — every flip in the game (battles included) physically happens on the shared
// flippenator; this just displays whatever it last landed on for each fighter.
export function renderBattle(o){
  if(appState.replaying)return;          // silent during reload-replay, like liveRender
  const nm=i=>pname(i),col=i=>HEXCOL[i];
  const A=o.att,D=o.def,title=o.title||"⚔️ Broadside Battle";
  // playtest 20: WHO WINS A TIE, said before a coin is ever tapped. Rule 9 hands a two-heads tie
  // to the downwind ship and the card used to show only names, roles and coins — so a quarter of
  // all fights turned on something the card never mentioned. Wyatt's pick, 2026-08-13.
  // Derived here rather than passed in: nobody moves during a battle (rule 9d) and nobody moves
  // after one (BATL-03), so the geometry cannot go stale between render and result. `o.dw` still
  // wins when present, so a broadcast snapshot keeps rendering from its own recorded value.
  const dw=o.dw!==undefined?o.dw:(appState.game&&appState.game.downwindSide?appState.game.downwindSide(A,D):null);
  /* ONE PILL, CENTRED UNDER BOTH CAPTAINS — playtest 23 item 2 (Wyatt: "the battle UI has too much
     text and much of it is unnecessary… remove both wind hint pills from underneath the captain's
     name; instead put one wind hint pill underneath, centered across both captains").
     The pair it replaces stated ONE fact twice, from two sides, and neither half named the captain
     it favoured — the reader had to work out that ⬇ DOWNWIND under a column meant that column. A
     single pill says the whole thing once and points at whoever holds the edge.
     @copy misc.battlecard.windtag — APPROVED as written, Wyatt 2026-08-15 (the downwind line was
     his own wording; the crosswind line is unchanged from the 2026-08-14 approval). */
  const windTag=dw==null
    ? `<div class="windTag cross">CROSSWIND · ties collide</div>`
    : `<div class="windTag dw">⬇ ${nm(dw==="a"?A.idx:D.idx).toUpperCase()} FIRES DOWNWIND — WINS TIES</div>`;
  // `Round N · first to K` is gone with it, and it was never load-bearing: asyncBattleRun fixes
  // need=1 and the a/d counters only ever read 0 or 1 (see the note above asyncBattle), so the
  // line counted a race that stopped existing when the battle became a single broadside.
  // @copy prompt.battle.scoreboard
  panel(`<div class="btl">
    <div class="btl-hd"><span>${title}</span></div>
    <div class="btl-body">
      <div class="btl-col${o.live==="a"?" live":""}">
        <div class="who" style="color:${col(A.idx)}">${nm(A.idx)}</div>
        <div class="role">${o.roleA||"Attacker"}</div>
        ${coinHTML(o.atState,o.atBs,o.winCoin==="a")}
      </div>
      <div class="btl-mid">VS</div>
      <div class="btl-col${o.live==="d"?" live":""}">
        <div class="who" style="color:${col(D.idx)}">${nm(D.idx)}</div>
        <div class="role">${o.roleD||"Defender"}</div>
        ${coinHTML(o.dfState,o.dfBs,o.winCoin==="d")}
      </div>
    </div>
    <div class="btl-wind">${windTag}</div>
    ${battleFooter(o)}
  </div>`,!!o.prompt);
  // broadcast the read-only scoreboard (never buttons) so every connected client — not just
  // whoever's deciding — sees the same battle unfold in real time
  if(appState.isHost&&appState.db&&appState.room&&!appState.replaying)netSetBattle(appState.db,appState.room,battleSnapshot(o),netFail("battle"));
}
// battleSnapshot/renderBattleFromSnap moved verbatim to src/ui/flow.js (11-05).

/* ================= THE SHARED BENCH (04-01 Task 3, MP-05) =================

   WYATT, 2026-08-18: *"how hard would it be to let other players watch the bakeoff, instead of
   just see a standard 'waiting for {Player} to decide' note? that seems like a better design."*
   He reversed his own earlier "private until the reveal" the same day, so the bench is FACE DOWN
   for everyone, the baker included — the watcher sees the same puzzle and can be wrong too.

   WHAT MAKES THE BAKER'S SCREEN AND A WATCHER'S SCREEN AGREE (rule 23, asked before a line):
   they are the same function reading the same object. playBakeoffLive is fully data-driven — the
   spec determines every frame of the cover sweep, every swap arc and every reveal — so a watcher
   is handed THE SAME SPEC and runs THE SAME CHOREOGRAPHY from it. Nothing is streamed frame by
   frame. What crosses the wire is only what a watcher cannot derive: the DISCRETE MOMENTS that are
   player decisions rather than animation — Ready pressed, each pick landing and un-landing, a paid
   replay restarting the shuffle, and the verdict.

   WHO PUBLISHES, AND WHY IT IS NOT "THE HOST". The baker is the only party who knows when Ready
   was pressed or which crate was just tapped, and the baker may be a guest. So the rule is:
   THE CAPTAIN WHOSE DECISION IT IS PUBLISHES THE BENCH; EVERY OTHER CLIENT RENDERS IT — one rule
   taking the ACTOR as its input, exactly the shape DISPLAY-RULES §2 sanctions for the captains
   list ("a rule that takes the viewer as an input is not two rules"). It is watchChat's shape:
   every client both sends and listens. The VERDICT is the one moment the host publishes, because
   the host is the only thing that scores.

   THE GUARD IS `db && room && !replaying`, NOT `isHost && db && room` (DISPLAY-RULES Rule A), and
   the deviation is deliberate and narrow. The safety property Rule A exists for is that a SOLO
   game never writes — and `room` alone is what is null in solo (Rule A's own measured correction
   says so). The `isHost` half of it encodes "who computes", which is precisely the thing that must
   not decide what is drawn. Local render always; the write only when there is a room.

   NO TENTH LISTENER. This rides `rooms/<CODE>/battle` and `watchBattle`, which already exist and
   already carry a live many-writes-per-event stage. */
const BENCH_TITLE="\uD83E\uDDC1 The Bake-Off";   // a `title` keeps the battle sting silent — see watchBattle

// The watcher session currently on this screen, or null. Module-local, like _hostGoneArmedFor.
let _bench=null;

/* Publish one moment of a bench. `spec` is the SAME object the choreography is running from, so a
   watcher cannot be handed a bench that disagrees with the one being played. */
export function benchPublish(spec,seat,patch){
  const snap=Object.assign({seat,order:spec.order,before:spec.before,swaps:spec.swaps||[],
    locked:spec.locked||[],attempts:spec.attempts||0,epoch:0},patch||{});
  applyBenchSnap(snap);                                   // LOCAL RENDER ALWAYS
  if(appState.db&&appState.room&&!appState.replaying)
    netSetBattle(appState.db,appState.room,{title:BENCH_TITLE,bake:snap},netFail("bake bench"));
}

/* Start a watcher session: the identical choreography, with the response mechanism replaced by the
   moments arriving off the wire. Returns nothing — a watcher has no promise for the engine. */
function benchWatch(snap){
  let resolveStarted,resolveDone,pickCb=null,picks=snap.picks||[];
  const ctl={
    // @copy misc.bakeoff.watching
    hint:`${pname(snap.seat)} is at the ovens — watch the crates.`,
    started:new Promise(r=>{resolveStarted=r;}),
    done:new Promise(r=>{resolveDone=r;}),
    onPicks:(cb)=>{pickCb=cb;},
    picksNow:()=>picks,
  };
  const sess={seat:snap.seat,epoch:snap.epoch||0,
    start:()=>resolveStarted(),
    finish:()=>resolveDone(),
    // Set SYNCHRONOUSLY, before finish() resolves `done`, or the watcher wakes a microtask later
    // and retires the very card bakeoffReveal is about to animate on.
    markRevealed:()=>{ctl.revealed=true;},
    /* SUPERSEDED, NOT ENDED — and this one was measured, not foreseen. A paid replay bumps the
       epoch, so the old watcher session is finished and a new one starts SYNCHRONOUSLY on the next
       line. The old session's own `await watch.done` then wakes A MICROTASK LATER, by which point
       the new bench is already on the glass — and its tidy-up call to retireBakeCard() found that
       bench, cleared it, and left the watching captain staring at nothing for the rest of the bake.
       Teardown after setup. The flag says "somebody else owns the panel now; do not tidy it". */
    markSuperseded:()=>{ctl.superseded=true;},
    setPicks:(p)=>{picks=p||[];if(pickCb)pickCb(picks);}};
  _bench=sess;
  playBakeoffLive({order:snap.order,before:snap.before,swaps:snap.swaps||[],
                   locked:snap.locked||[],attempts:snap.attempts||0},{watch:ctl})
    .catch(e=>{console.error("bench watch",e);})
    .then(()=>{if(_bench===sess)_bench=null;});
  // A watcher that arrives after the shuffle has begun does not sit on a Ready that will never be
  // pressed — it starts where the bench already is.
  if(snap.phase!=="open")sess.start();
  return sess;
}

/* Apply one bench moment to THIS screen. The single entry both tiers reach: the publisher calls it
   directly (mirror-when-remote), a listening client calls it from watchBattle. */
export function applyBenchSnap(snap){
  if(!snap){ if(_bench){_bench.finish();_bench=null;} return null; }
  if(snap.phase==="reveal"){
    /* EVERY CAPTAIN RENDERS THE VERDICT, on whatever bench they are holding — the baker's own, a
       watcher's, the host's. The session ends first so the watcher's `done` releases and stops
       waiting for a moment that has already arrived. */
    if(_bench){_bench.markRevealed();_bench.finish();_bench=null;}
    return bakeoffReveal({order:snap.order,slots:snap.slots||snap.before},
                         {correct:snap.correct||[],perfect:!!snap.perfect});
  }
  // MY OWN HANDS ARE ON THIS BENCH. The publisher reads its own write back (it calls this directly,
  // and the host also listens now), and a second choreography over the top of a live one is the
  // two-directors fault in miniature.
  if(decisionIsLocal(snap.seat))return null;
  if(_bench&&_bench.seat===snap.seat&&_bench.epoch===(snap.epoch||0)){
    if(snap.phase!=="open")_bench.start();
    if(snap.phase==="pick")_bench.setPicks(snap.picks||[]);
    return null;
  }
  // A different captain, or a paid replay (a new epoch): the session restarts and watches it again.
  if(_bench){_bench.markSuperseded();_bench.finish();_bench=null;}
  benchWatch(snap);
  return null;
}

/* Apply one battle moment to THIS screen. THE SINGLE ENTRY BOTH TIERS REACH — the host calls it
   directly (mirror-when-remote), every other client calls it from watchBattle. Deliberately the
   same shape as applyBenchSnap above, including `null` meaning RETIRE.

   T-04 (Wyatt, 2026-08-26, and he called it "a serious, bad bug"): "after observing other players
   battle, their battle card stays on screen for the guest indefinitely. it stays up until the
   guest's turn, when it disappears."

   WHY IT HAPPENED, MEASURED (4/scripts/qa/battle_watch_probe, one real fight, two browsers):

     card appears        host  7358ms   guest  7350ms
     battle node cleared    —           guest hears it at 14404ms
     card actually leaves host 14402ms  guest 27752ms  <- when its own turn prompt arrived

   13.4 seconds of a dead card. NOTHING TOLD THE WATCHER'S SCREEN THE FIGHT WAS OVER: the listener's
   else-branch set `spectatingBattle=false` and drew nothing, while the host retired its own card
   from a completely different place (its game loop). The flag was healthy the whole time — it
   cleared within 2ms of the host. The DRAWING is what was missing.

   That is rule 23 exactly: two things kept in step by discipline, and they drifted. The fix is not
   a guest-side `panel("")` — that would be a second retirement path and the same fault one layer
   down. There is now one function, and both tiers are made to go through it.

   `panel("")` is guarded on our own content so this can never blank a panel that has already moved
   on to something else — the bake-off bench takes the same precaution. */
export function applyBattleSnap(snap){
  if(!snap){
    if(document.querySelector("#actionPanel .btl"))panel("");
    appState.spectatingBattle=false;
    return;
  }
  // Reading spectatingBattle BEFORE assigning it true IS the edge trigger (260801-7f4): this runs
  // on every write to the battle node, many times per fight, so read-then-assign is what keeps the
  // clash to once per battle instead of once per scoreboard update.
  if(!appState.spectatingBattle&&!snap.title)playBattleEngage();
  appState.spectatingBattle=true;
  if(!appState.inBattlePrompt)renderBattleFromSnap(snap);
}

export function watchBattle(){
  netWatchBattle(appState.db,appState.room,s=>{
    const v=s.val();
    /* THE BAKE COMES FIRST AND RETURNS. A bench snapshot carries `bake` and has no attIdx/defIdx,
       so renderBattleFromSnap would bail on it anyway — but reaching that line at all would set
       spectatingBattle and silence narration for the rest of the voyage. */
    if(v&&v.bake){applyBenchSnap(v.bake);return;}
    if(!v)applyBenchSnap(null);                 // the node cleared: any watcher session ends
    /* THE BATTLE PATH STAYS GUEST-ONLY, AND THAT IS A DECLARED GAP, NOT AN OVERSIGHT.
       watchBattle is now attached by EVERY client (see beginGame) because a bench is published by
       whoever is BAKING, and the baker may be a guest — so the host has to listen. The battle
       scoreboard is the opposite: the host DRAWS ITS OWN from the game loop and must never read
       itself back through Firebase (DISPLAY-RULES Rule A). battleAsk is prompt fork 3 in
       DISPLAY-RULES §4 and is still unconverged; converging it is that fork's own piece of work,
       not a side effect of the bake-off. */
    if(appState.isHost)return;
    if(v){
      // 260801-7f4 (guest tier): reading spectatingBattle BEFORE assigning it true IS the edge
      // trigger — this callback fires on every write to the battle node (many times per fight,
      // once per renderBattle()), so without the read-then-assign order the clash would re-fire
      // on every scoreboard update instead of once per battle.
      //
      // `!v.title` — REWRITTEN 04-01 Task 3 TO SAY WHAT IT NOW DOES rather than what it was left
      // waiting for. It used to be described as "the bakeoff exclusion... the bakeoff stays exactly
      // as silent as it is today", parked on a snapshot producer that turned out not to exist in
      // this tree at all: asyncBakeoff is ROOT-ONLY (v2 rule 12 deleted it from 4/), so nothing
      // here ever produced a `title` and the guard had never once fired. It fires now. A BENCH
      // SNAPSHOT CARRIES A TITLE, so the battle sting cannot play over a bake — and the bake branch
      // above returns before this line anyway, which makes this the belt rather than the braces.
      // Keep both: a future bench field that forgot `bake` would still not sound a clash.
      //
      // Known, accepted variance on the battle path itself: this lands on the
      // first battle-node write (the scoreboard appearing), which trails the host's own clash on
      // the announcement by a few seconds when a human spectator is put through side-bet prompts —
      // still before the first flip, still fixing the "end of fight" complaint on this tier too.
      applyBattleSnap(v);
    }
    // T-04: the battle node cleared, so the fight is over. This used to set the flag and draw
    // NOTHING, leaving the card on screen until some later prompt happened to replace it.
    else applyBattleSnap(null);
  });
}
// battleFooter moved verbatim to src/ui/flow.js (11-05).
// A battle decision that keeps the coins on screen: the scoreboard (o) renders with the
// prompt buttons tucked beneath it, so nothing about the layout jumps when it's your turn.
export function battleAsk(p,o,msg,opts,colors){
  // same record/replay contract as ask(): log the chosen index, replay it through fresh opts
  if(appState.replaying){
    if(appState.dlogIdx<appState.dlog.length){appState.dlogN++;return Promise.resolve(resolveOpt(opts,appState.dlog[appState.dlogIdx++],opts.length-1).opt.value);}
    endReplay();
  }
  setActor(p.idx);
  const seat=p.idx;
  const isFlip=opts.length===1&&!!opts[0].flip;
  // every battle decision — flip or yes/no — re-arms the clock to whoever's actually
  // being asked, same as ask(); a forced timeout just resolves to the flip itself
  armClock(seat);
  // spectators (and, crucially, the OTHER combatant) get a battle-aware nudge that names who's
  // attacking whom instead of a bare "…is deciding" — so when a bot attacks a human on the bot's
  // turn, the table can see it's the human's defend flip and nudge them (see #11).
  const spectMsg=(o&&o.att&&o.def)
    ?(seat===o.def.idx?`⚔️ ${pn(o.att.idx)} attacks ${pn(o.def.idx)}! Waiting for ${pname(o.def.idx)} to defend…`
      :`⚔️ ${pn(o.att.idx)} attacks ${pn(o.def.idx)} — waiting for ${pname(seat)}…`)
    :`${pn(seat)} is deciding…`;
  // D-10 DELIVERY (F7): the spectator line is the neutral broadcast, the asked seat's own prompt is
  // that seat's variant, and each client selects for itself through the mechanism that already ships.
  //
  // THIS IS A NEW FINDING, NOT A REVERSAL. D-35's sweep listed this site as "the correct
  // actor/spectator split (D-10), not a transport fork", and it was right about the question it
  // asked: does guest-side code AUTHOR its own text? It does not. This gate asks a different
  // question — does the broadcast REACH the right viewer? — which that sweep never examined. One
  // message cannot express a per-viewer difference, however correctly it was authored.
  netBroadcast(spectMsg,[{seat,html:msg}]);
  let idxP;
  if(decisionIsLocal(seat)){
    idxP=new Promise(res=>{
      if(isFlip){
        // the scoreboard just shows state — the flippenator is the actual control
        renderBattle(o);
        setNeedsAction(true);
        setFlipActive(()=>{setFlipActive(null);setNeedsAction(false);res(0);});
      }else{
        renderBattle(Object.assign({},o,{prompt:{msg,opts,colors}}));
        $("actionPanel").querySelectorAll(".btlBtn").forEach(b=>{
          b.onclick=()=>res(+b.dataset.i);
        });
      }
    });
  }else{
    renderBattle(Object.assign({},o,{waiting:pn(seat)}));
    idxP=remotePrompt(seat,{kind:"ask",msg,labels:opts.map(x=>x.label),
      colors:colors?colors.map(c=>c||""):null,classes:opts.map(()=>""),
      flip:isFlip,battle:battleSnapshot(o)});
  }
  const wrapped=withShotClock(seat,idxP,opts.length-1);
  return wrapped.then(i=>{const r=resolveOpt(opts,i,opts.length-1);logDecision(r.i);return r.opt.value;});
}
// collectSideBets/settleSideBets moved verbatim to src/ui/flow.js (11-05).
/* ================= v2 rule 9 (and rule 13): the one-round battle =================
   The whole fight is ONE exchange. Both cannons speak once, and the wind decides the tie:

     heads vs tails            → the heads ship wins outright
     both heads, one downwind  → the downwind ship wins, the wind carries the shot home
     both heads, crosswind     → the cannonballs collide. The ATTACKER may pay 2🌕 to load a fresh
                                 broadside and fire ALONE — heads and it lands, tails and they may
                                 pay again, as often as they can afford it. Decline → NULL.
     both tails                → both shots went wild. The defender may slip away FREE (rule 2's
                                 "fleeing is free"), sailing under the ordinary v2 rules. Stand
                                 their ground and the attacker gets the same paid re-fire.

   A NULL battle ends with nobody gaining anything — no crate, no coins, no caller paid, and the
   powder already spent stays spent. That is the real risk in attacking.

   Prize: ONE CRATE, winner's choice. No coin alternative and no place-swap — a swap would hand
   the loser the advantageous square (Wyatt, 2026-08-04). A ship with an empty hold cannot be
   attacked at all, so there is always a crate to take.

   `need` is gone along with the scoreboard race: the battle-UI's a/d counters now only ever read
   0 or 1, and exist so the shared renderBattle() scoreboard keeps working unchanged. */
/* THE CAMERA IS ARMED AND DISARMED AROUND THE WHOLE FIGHT, not around the battle card, because a
   battle asks its questions before the card exists — collectSideBets runs first, and playtest 22
   found the crow's-nest call being made with the camera parked on the caller's own boat (Wyatt:
   "the director should focus battles on the players fighting, not the player calling the battle").
   A wrapper rather than a line at each exit: asyncBattle returns from a flee, a NULL, a decline and
   two ordinary endings, and a hold that outlives one of them would freeze the director for the rest
   of the voyage. `finally` is the only spelling that cannot be got wrong later. */
export async function asyncBattle(att,def){
  try{ return await asyncBattleRun(att,def); }
  finally{ if(window.__pp4&&window.__pp4.battleEnd)window.__pp4.battleEnd(); }
}
async function asyncBattleRun(att,def){
  const c=appState.game.cfg;
  // G6 (COIN-AUDIT site 13), kept: guard BEFORE the opening broadcast, so a battle refused for
  // want of powder never announces itself and no snapshot can be in flight. v2 adds rule 13e's
  // empty-hold check to the same gate — canAttack() owns both, so the UI's greying and the engine
  // can never disagree about what is a legal target.
  if(!appState.game.canAttack(att,def))return null;
  // frame both combatants BEFORE the opening line, so it is spoken over the fight it announces
  if(window.__pp4&&window.__pp4.battle)window.__pp4.battle(att.idx,def.idx);
  playBattleEngage();
  const need=1;
  // D-08/D-25: the opening names both combatants, each reading it addressed to themselves.
  const battleOpenVariants=[{seat:att.idx,html:`⚔️ ${pn(att.idx)} — ye attack ${pn(def.idx)}! One broadside each…`},{seat:def.idx,html:`⚔️ ${pn(att.idx)} attacks ye! One broadside each…`}];
  // @copy adhoc.battle.opening
  await flash(`⚔️ ${pn(att.idx)} attacks ${pn(def.idx)}! One broadside each…`,Math.max(900,stepDelay()),undefined,battleOpenVariants);
  if(c.powder)att.coins-=c.powder;
  appState.game.battles++;
  const bets=await collectSideBets(att,def);
  let a=0,d=0;
  // purely geometric, and it never changes mid-battle because v2 has no swap
  const downwind=appState.game.downwindSide(att,def);
  let fled=false,nulled=false;
  const rounds=[];
  const hA=att.strategy==="human",hD=def.strategy==="human";
  let round=0;
  const nm=pn;
  const bd=(typeof stepDelay==="function")?stepDelay():500;
  /* D-49: the battle's own `spin` const is GONE. It was clamp(260,650, stepDelay()*0.7), and with
     stepDelay() a flat 3000 that resolved to 650 — nearly twice the dock flip's 340, so two flips
     in one voyage took visibly different times by design. Both sites below now wait out the
     remainder of the ONE clock stamped where the spin is painted (board.js's flipSpinLeftMs), so
     "every flip takes the same 1.5s" is true across the two code paths and not just within one.
     Still through this file's own `sleep`, which is what keeps ⏩, pause and replay unchanged. */
  const beat=Math.max(300,Math.min(900,bd*0.9));  // suspense pause before the defender answers
  const hold=Math.max(500,Math.min(1500,bd*1.1)); // pause to read the round result
  const base=o=>Object.assign({att,def,a,d,round,need},o);
  const hFlip=async(side,p,label,extra)=>{
    extra=extra||{};
    const key=side==="a"?"atState":"dfState";
    await battleAsk(p,base(Object.assign({live:side,[key]:"wait"},extra)),
      label,[{label:"🌕 FLIP!",value:1,flip:true}]);
    broadcastFlip("spin");
    // playtest 11: the battle card's own coin spins through the beat — before this, only the
    // (hidden-under-the-stage) flippenator got the spin state and the card coin jumped
    // wait -> face with no motion at all
    renderBattle(base(Object.assign({live:side,[key]:"spin"},extra)));
    await sleep(flipSpinLeftMs());
    const h=appState.game.flip(p);
    broadcastFlip(h?"H":"T");
    netBroadcast(`${pn(p.idx)} flips ${h?"⚪ HEADS!":"⚫ TAILS"}`);
    renderBattle(base(Object.assign({live:side,[key]:h?"H":"T"},extra)));
    // playtest 13 (Wyatt: "hold the finished coin heads/tails for longer — .8 seconds maybe").
    // T-34: the number is FLIP_LAND_HOLD_MS now, shared with the other flips (board.js).
    await sleep(FLIP_LAND_HOLD_MS);
    broadcastFlip("wait");
    return h;
  };
  const bFlip=async(side,p,extra)=>{
    extra=extra||{};
    const key=side==="a"?"atState":"dfState";
    renderBattle(base(Object.assign({live:side,[key]:"wait"},extra)));
    broadcastFlip("spin");
    renderBattle(base(Object.assign({live:side,[key]:"spin"},extra)));   // playtest 11: see hFlip
    await sleep(flipSpinLeftMs());
    const h=appState.game.flip(p);
    broadcastFlip(h?"H":"T");
    renderBattle(base(Object.assign({live:side,[key]:h?"H":"T"},extra)));   // land ON the face
    await sleep(FLIP_LAND_HOLD_MS);   // playtest 13 / T-34: the landed face holds, same as every other flip
    broadcastFlip("wait");
    return h;
  };
  // ---- THE round ----
  round=1;
  renderBattle(base({atState:"wait",dfState:"wait",live:"a",result:`${nm(att.idx)} loads the cannon…`}));
  await sleep(beat*0.5);
  const ah=hA?await hFlip("a",att,`⚔️ ${nm(att.idx)} (attacker) — fire!`,{dfState:"wait"}):await bFlip("a",att,{dfState:"wait"});
  renderBattle(base({atState:ah?"H":"T",dfState:"wait",live:"a"}));
  await sleep(beat*0.6);
  renderBattle(base({atState:ah?"H":"T",dfState:"wait",live:"d",
    result:`${nm(att.idx)} shows ${ah?"HEADS":"TAILS"} — ${nm(def.idx)} must answer…`}));
  await sleep(beat);
  const dh=hD?await hFlip("d",def,`⚔️ ${nm(att.idx)} attacks ye — defend! FLIP`,{atState:ah?"H":"T"}):await bFlip("d",def,{atState:ah?"H":"T"});
  // ---- resolve ----
  let scorer=null,rmsg,winner=null;
  if(ah&&dh){
    if(downwind){
      scorer=downwind;
      if(downwind==="a"){a++;winner=att;}else{d++;winner=def;}
      const dwName=downwind==="a"?nm(att.idx):nm(def.idx);
      // @copy misc.battleline.bothheadsdownwind
      rmsg=`<span class="score">Both fire ⚪️ HEADS — but ${dwName}'s firing downwind and the shot hits!</span>`;
    // @copy misc.battleline.bothheadscrosswind
    }else rmsg=`<span class="cancel">Both fire ⚪️ HEADS — but in the crosswind, the cannonballs collide.</span>`;
  }else if(ah||dh){
    scorer=ah?"a":"d";
    if(ah){a++;winner=att;}else{d++;winner=def;}
    const hitName=ah?nm(att.idx):nm(def.idx);
    // @copy misc.battleline.hitlands
    rmsg=`<span class="score">${hitName} lands a hit!</span>`;
  }
  // @copy misc.battleline.bothmiss
  else rmsg=`<span class="cancel">Both miss — ⚫️ TAILS all round.</span>`;
  rounds.push([ah?1:0,dh?1:0,0,scorer]);
  renderBattle(base({atState:ah?"H":"T",dfState:dh?"H":"T",live:null,winCoin:scorer,result:rmsg}));
  await sleep(hold);

  if(!winner){
    // ---- both tails: the defender's FREE escape (rules 9a + 2c) ----
    if(!ah&&!dh){
      const cells=reachable(def);
      if(cells.length){
        let flee;
        // @copy prompt.battle.flee
        if(hD){setActor(def.idx);flee=await ask(`${nm(def.idx)}: both shots missed wildly! Slip away?`,
          [{label:"🏃 Flee!",value:true},{label:"⚔️ Stand yer ground",value:false}]);}
        // a bot slips away when the wind is against it (it loses the next both-heads) or when it is
        // carrying a crate it cannot afford to lose — the same test the headless battle() applies
        // same test as the headless battle() — a RECIPE crate held with no spare. needs() excludes
        // what you already hold, so testing against it can never match (it never fled in 3000 sims).
        else flee=(downwind==="a")||def.ing.some(i=>def.recipe&&def.recipe.includes(i)&&appState.game.cnt(def.ing,i)<=1);
        if(flee){
          const dest=hD?await pickCell(def,cells):cells.reduce((best,cc)=>man(cc,att.pos)>man(best,att.pos)?cc:best,cells[0]);
          if(dest){def.pos=dest;appState.game.tradewind(def);await animateRimSweepIfAny();}
          fled=true;
          appState.game.recordSkirmish(att,def,null);
          appState.game.ev({t:"battleflee",a:att.idx,d:def.idx,rounds,downwind});
          liveRender();
        }
      }
    }
    // ---- the attacker's paid re-fire (rule 9b, extended to both-tails by rule 9a) ----
    if(!fled){
      const refire=c.refire||0;
      while(!winner){
        let again=false;
        if(refire&&att.coins>=refire){
          if(hA){
            setActor(att.idx);
            // @copy prompt.battle.refire
            again=await ask(`${nm(att.idx)}: load another broadside <span class="nobrk">(−${refire}🌕)</span>? ⚪ HEADS and the shot lands.`,
              // ITEM 1 (Wyatt, 2026-08-20): brackets off the money buttons. Found by the rule-8 consistency
              // sweep, NOT by his report — the other three live in ui/flow.js and this one is easy to miss.
              [{label:`🔥 Fire again <span class="nobrk">−${refire}🌕</span>`,value:true},{label:"🏳️ Break off",value:false}]);
            if(appState.turnExpired)again=false;
          }else again=appState.game.wantsRefire(att,def,downwind,rounds.length);
        }
        // D-40 safety net: re-read the purse after the await rather than trusting the gate above
        if(!again||att.coins<refire){nulled=true;break;}
        att.coins-=refire;
        appState.game.ev({t:"refire",a:att.idx,d:def.idx,cost:refire});
        liveRender();
        round++;
        const rh=hA?await hFlip("a",att,"🔥 Fire again!",{dfState:dh?"H":"T"}):await bFlip("a",att,{dfState:dh?"H":"T"});
        rounds.push([rh?1:0,null,0,rh?"a":null]);
        if(rh){a++;winner=att;
          // @copy misc.battleline.refirehits
          renderBattle(base({atState:"H",dfState:dh?"H":"T",live:null,winCoin:"a",result:`<span class="score">The second broadside tells — ${nm(att.idx)} lands it!</span>`}));
        }else{
          // @copy misc.battleline.refiremisses
          renderBattle(base({atState:"T",dfState:dh?"H":"T",live:null,result:`<span class="cancel">The shot goes wide.</span>`}));
        }
        await sleep(hold);
      }
    }
  }
  // THE SAME RETIREMENT EVERY OTHER CAPTAIN GETS (T-04). This was a bare panel(""), which is what
  // made the host's teardown and a watcher's two separate pieces of code — the condition rule 23
  // exists to forbid. Both now leave by this door.
  applyBattleSnap(null);
  // battle's over — clear the broadcast scoreboard so every client's watchNarr can take the panel
  // back for the result narration (and so spectatingBattle resets). (#9)
  if(appState.isHost&&appState.db&&appState.room&&!appState.replaying)netRemoveBattle(appState.db,appState.room,netFail("battle clear"));
  if(fled)return;
  if(nulled){
    // rule 9: NULL — the battle ends with no player gaining anything, and no caller is paid.
    appState.game.recordSkirmish(att,def,null);
    appState.game.ev({t:"battlenull",a:att.idx,d:def.idx,rounds,downwind});
    liveRender();
    await narrateLastEvent();
    await settleSideBets(bets,null);
    return null;
  }
  const win=winner,lose=win===att?def:att;
  if(win===att)appState.game.attWins++;
  // v2 rule 9d: the prize is a crate, full stop. The loser no longer chooses to pay in coin, so
  // the whole "pay with 5🌕 or a crate" prompt is gone — the only choice left is the WINNER's,
  // picking which crate to take.
  let pick;
  const uniq=[...new Set(lose.ing)];
  if(win.strategy==="human"&&uniq.length>1){setActor(win.idx);
    // @copy prompt.battle.winnerplunder
    pick=await ask(`${pn(win.idx)}, choose yer plunder!`,uniq.map(i=>({label:ilabelImg(i),value:i})));}
  else{const w2=lose.ing.filter(i=>appState.game.needs(win).includes(i));pick=w2[0]||lose.ing[0];}
  let spoil=null,spoilIng=null;
  if(pick!=null&&lose.ing.includes(pick)){
    lose.ing.splice(lose.ing.indexOf(pick),1);win.ing.push(pick);
    spoil=ilabelImg(pick);spoilIng=pick;
    // the whole table watched the winner choose — public evidence of what they are after
    appState.game.noteDemand(win,pick,1);
  }
  // BATL-03, hardened by rule 9d: nobody moves after a battle.
  appState.game.recordSkirmish(att,def,lose,spoilIng);
  // playtest 20: `downwind` rides the event so the narration can say WHY a two-heads tie went the
  // way it did. The engine's own emit has always carried it (src/engine/index.js); this live path
  // dropped it, which is why the durable line could only ever say "wins 1-0" — see the battle
  // narration builder in src/ui/util.js. Display-only, and /4 is outside the determinism corpus
  // (scripts/lib/load_engine.js loads the ROOT src/engine), so no fixture is touched.  [ROOT-TREE-CITATION: load_engine.js reads the root tree on purpose — true as written]
  appState.game.ev({t:"battle",a:att.idx,d:def.idx,rounds,winner:win.idx,spoil,spoilIng,spoilChosen:false,downwind});
  liveRender();
  // narrate the outcome now — settlement pushes further events right after this, and callers only
  // narrate the *last* event once asyncBattle returns
  await narrateLastEvent();
  await settleSideBets(bets,win===att?"a":"d");
  return win;
}

// v2 rule 12: asyncBakeoff is gone — see the note in src/ui/flow.js. Best Baker is decided by
// Game.bakeRank (crates, then coins, then who got home first), not by a final flip.

export function writeMeta(){
  if(!appState.db||!appState.room||appState.replaying)return Promise.resolve();
  return netSetMeta(appState.db,appState.room,{
    round:appState.game.round,battles:appState.game.battles,trades:appState.game.trades,attWins:appState.game.attWins,
    finishOrder:appState.game.finishOrder,winner:appState.game.winner,
    flips:appState.game.players.map(p=>p.flips),heads:appState.game.players.map(p=>p.heads)},netFail("game meta"));
}
// Every finished game (solo or multiplayer) writes its full move-by-move transcript to a
// permanent, room-independent path — rooms/{room}/ev is cleared on the next game in that room,
// so this is the only durable copy for later analysis. Only the host writes it (this function
// only ever runs from the host's own turn loop), so there's no risk of duplicate writes.
export function writeGameLog(){
  if(!appState.replaying)pingFin(); // fires in every build, even where the SDK log below cannot
  if(!appState.db||appState.replaying)return Promise.resolve();
  const ts=Date.now();
  return netWriteGameLog(appState.db,ts,{
    // gamelogs/ is shared by every build on this domain; the tag is what keeps /3's voyages
    // separable from /v2bakeoff's when reading the data back.
    build:"v4",
    pid:appState.myId||null,gid:usageGid(),
    ts,room:appState.room||null,winner:appState.game.winner,round:appState.game.round,
    battles:appState.game.battles,trades:appState.game.trades,strategies:appState.game.cfg.strategies,
    // names/bots are recorded per seat so solo & local games (no rooms/{code}/seats node) are still
    // attributable — events reference players by seat index, so this is the key to reading them back.
    // Consistent with the lobby's data-collection notice ("nothing beyond the name you type").
    names:appState.game.players.map((_,i)=>rawName(i)),
    bots:appState.game.players.map(p=>p.strategy!=="human"),
    events:JSON.parse(JSON.stringify(appState.game.events))
  },netFail("game log"));
}

/* ================= networking plumbing ================= */
/* Firebase config and cfgReady() moved to src/net/index.js (Phase 9, SPLIT-04) — values copied
   byte-for-byte, see ONLINE_SETUP.md for how to point this at your own Firebase project. */
export function watchPresence(){
  // best-effort: an older Firebase project whose rules predate this feature (no "presence" node
  // yet — see ONLINE_SETUP.md) will permission-deny these; fail silently rather than spam the
  // console or block anything, since this is a nice-to-have busy indicator, not core gameplay.
  netWatchConnected(appState.db,snap=>{
    if(snap.val()===true){
      netMarkPresence(appState.db,appState.myId);
      const note=$("syncnote");if(note)note.style.display="none";
    }
  },()=>{});
  netWatchPresence(appState.db,snap=>{
    const busy=snap.numChildren()>=PRESENCE_WARN_THRESHOLD;
    const note=$("busynote");if(note)note.style.display=busy?"":"none";
  },()=>{});
}
export function fbInit(){
  appState.db=netInit();
  if(!appState.db)return false;
  watchPresence();
  return true;
}

export async function applyEndMeta(){
  if(appState.isHost||appState.appliedMeta)return;
  appState.appliedMeta=true;
  const m=(await netReadMeta(appState.db,appState.room)).val();
  if(!m)return;
  appState.game.round=m.round;appState.game.battles=m.battles;appState.game.trades=m.trades;appState.game.attWins=m.attWins;
  appState.game.finishOrder=m.finishOrder||[];appState.game.winner=m.winner;
  (m.flips||[]).forEach((f,i)=>{if(appState.game.players[i]){appState.game.players[i].flips=f;appState.game.players[i].heads=(m.heads||[])[i]||0;}});
  appState.liveDone=true;playWinScreen();render(); // D-05: the guest's win-screen cue, tied to the screen appearing — end/finish stay silent as events per D-06
}

/* ================= host game loop (networked) ================= */
// Every human seat drafts at the same time instead of taking turns. Bots resolve instantly.
// Decisions are still logged in a fixed (seat-index) order regardless of who actually
// finishes first, so a host-reload replay can deterministically reconstruct the same picks.
export async function recipeDraftNet(){
  const picks=[];
  const humans=appState.game.players.filter(p=>p.recipeChoices&&p.strategy==="human");
  const bots=appState.game.players.filter(p=>p.recipeChoices&&p.strategy!=="human");
  for(const p of bots)picks[p.idx]=appState.game.r()<.5?0:1;
  const pending=[];
  for(const p of humans){
    if(appState.replaying){
      if(appState.dlogIdx<appState.dlog.length){appState.dlogN++;picks[p.idx]=appState.dlog[appState.dlogIdx++];continue;}
      endReplay();
    }
    pending.push(p);
  }
  if(pending.length){
    // G4 (Wyatt-approved 2026-07-30): one short line. The trailing clause explaining how to win
    // duplicated the Ahoy intro that closed moments earlier (and, after G5, immediately before) —
    // the prompt's job is to ask, not to re-teach. The two recipe cards below it carry the detail.
    // Not an extracted @copy site: the message reaches localAsk/remoteDraftPrompt via a variable,
    // so it drifts no baseline. D-29 (`yer`, not `your`) satisfied.
    const msgFor=p=>`${pn(p.idx)}, choose yer recipe:`;
    const optsFor=p=>[{label:recipeCardHTML(p.recipeChoices[0]),value:0,cls:"recipeCard"},
                       {label:recipeCardHTML(p.recipeChoices[1]),value:1,cls:"recipeCard"}];
    if(appState.passAndPlay){
      // one device, secret options: draft in turn, each gated by the pass-the-device screen
      // so nobody's two recipe choices are ever on screen for the seat that comes next
      for(const p of pending){
        await passGate(p.idx);
        setActor(p.idx);
        const i=await localAsk(msgFor(p),optsFor(p));
        picks[p.idx]=i;logDecision(i);
      }
    }else{
      /* 17b — ONE MOMENT, ONE SENTENCE, FROM ONE PLACE, ON BOTH SIDES (D-07).
         This was netBroadcast, which is "broadcast to spectators WITHOUT touching this screen's
         panel" — so every guest read "⚓ Everyone's choosing their recipe…" and the host read
         NOTHING for this beat, and was left holding netIntroBarrier's older "⚓ Waiting for yer
         mateys…" from the moment before. That is exactly the pair in his screenshot 17b: not two
         wordings for one moment, but the host stranded a moment behind because it was the one
         screen the line was never delivered to. netNarrate draws locally AND mirrors, so the host
         now reads the same sentence at the same beat, and stageFlash's S.hurry() retires the stale
         wait line as it lands. `wait` because this line's whole subject is that nothing is
         happening yet — item 19. */
      /* MY OWN REGRESSION, SAME DAY, AND THE VARIANTS ARE THE FIX. Wyatt, 2026-08-20, with a
         screenshot of a SOLO game: "wy is choosing a recipe…" floating over wy's own screen while
         wy's recipe card was open in front of him. Told about himself, in the third person, in a
         game with no one else in it.

         The netBroadcast -> netNarrate change above is right and stays: the host WAS the one screen
         never told. But netBroadcast never touched the sending screen, so the actor was silenced by
         accident — and netNarrate draws locally, which removed that accident and exposed that this
         call passes NO variants. The variants list is what silences a line for the captain it is
         about; every sibling line already has one (flow.js:543's sail line, util.js:1573's "is
         deciding"). This one was simply never given one, because until today it never needed one.

         Every PENDING captain is an actor here, not just the first — in the multi-player wording
         they are all choosing at once — so the whole pending set is silenced, not `pending[0]`. */
      // @copy misc.draftwait.recipechoosing
      netNarrate(pending.length>1?"⚓ Everyone's choosing their recipe…":`${pn(pending[0].idx)} is choosing a recipe…`,
        pending.map(q=>({seat:q.idx,html:""})),{wait:true});
      const results={};
      /* THE SAME LINE FOR EVERY CAPTAIN, WRITTEN ONCE. Wyatt, 2026-08-20: "when both host and guest
         are on recipe choice, the waiting card only appears to host. this is a parity problem."

         It was, and it was one missing ARGUMENT. remoteDraftPrompt(seat,msg,opts,waitMsg) carries
         the wait line to a remote captain in the payload, and watchDraftPrompt shows it the moment
         they answer — that channel has always worked; the intro barrier (ui/flow.js) passes one and
         a guest sees it there. This call simply never passed one, so the host got the line from its
         own localAsk branch and the guest got silence.

         Hoisted to a const so the two branches cannot drift again: whatever a local captain is told
         is by construction what a remote captain is told. MEASURED before and after in a real
         two-window game — host saw both wait lines, guest saw only the intro one. */
      // @copy misc.draftwait.recipechosen
      // a wait line: it holds until the crew actually finishes, not for 2.5 seconds (item 19)
      const draftWait=pending.length>1?"⚓ Recipe chosen! Waiting for the rest of the crew…":null;
      const jobs=pending.map(p=>{
        setActor(p.idx);
        if(seatLocal(p.idx))return localAsk(msgFor(p),optsFor(p)).then(i=>{
          results[p.idx]=i;
          if(draftWait)showNarration(draftWait,{wait:true});
        });
        return remoteDraftPrompt(p.idx,msgFor(p),optsFor(p),draftWait).then(i=>{results[p.idx]=i;});
      });
      await Promise.all(jobs);
      for(const p of pending){picks[p.idx]=results[p.idx];logDecision(results[p.idx]);}
    }
  }
  appState.game.players.forEach(p=>{if(p.recipeChoices)p.recipe=p.recipeChoices[picks[p.idx]];});
  if(appState.db&&appState.room&&!appState.replaying)await netSetRecipes(appState.db,appState.room,picks,netFail("recipe picks"));
  if(!appState.replaying)updateRecipeBanner();
  liveRender();
}
/* TODAY'S DAY, MOVED VERBATIM. Extracted rather than rewritten so "flag off = the game
   Wyatt has been playing" is a property of the code's shape, not a claim about a conditional.
   The only edit is the ending: what was `ended=…;break;` inside the while-loop is now a return. */
async function runLiveDayClassic(order){
    for(const i of order){
      const p=appState.game.players[i];
      if(p.done)continue;
      await (p.strategy==="human"?humanTurn(p):botTurn(p));
      if(appState.game.checkFinish(p)){
        liveRender();
        if(appState.game.finishOrder.length===1){
          // FINAL ROUND (#19): the first ship reached Tortuga and fired up the bakery. Alert the
          // whole crew with a blocking barrier, spin the wind ANEW for the last lap, then give
          // every other captain exactly ONE more turn — continuing the SAME rotation from the seat
          // right after the finisher (not restarting `order` from the top, which scrambled the
          // apparent turn order). netIntroBarrier self-skips during host-refresh replay, and the
          // wind re-spin's game.r() calls run identically live and on replay, so state stays
          // deterministic.
          // NARR-01/D-25 (Wyatt-approved 2026-07-29): applied verbatim.
          // @copy misc.introbarrier.finalround
          await netIntroBarrier(`🏁 ${pn(i)} returned to Tortuga and fired up the bakery! Every captain gets ONE final turn to race home! ⛵`,"🦜 Final round — set sail!");
          appState.game.round++;
          appState.game.advanceWind(); // rule 6: the last lap sails under the wind already forecast
          appState.game.ev({t:"newround",dir:appState.game.windNow,streak:appState.game.stormNow?appState.game.stormStreak:0,windStreak:appState.game.noteWind(appState.game.windNow),next:appState.game.forecastWind(),nextStorm:appState.game.stormNext});liveRender(); // NARR-04
          // @copy adhoc.round.finalheader
          await flash(describe(appState.game.events[appState.game.events.length-1]).txt,900);
          if(appState.game.stormNow)await runStormLive(appState.game.windNow); // rule 7, last lap too
          const startPos=order.indexOf(i);
          const lastLap=order.slice(startPos+1).concat(order.slice(0,startPos));
          for(const j of lastLap){
            const q=appState.game.players[j];
            if(q.done)continue;
            await (q.strategy==="human"?humanTurn(q):botTurn(q));
            if(appState.game.checkFinish(q))liveRender();
          }
          // v2.1: the final lap is the likeliest moment for a raid on the bakery (rule 13c), and
          // if it lands the finisher is no longer finished (Game.unfinish). Ending here regardless
          // would crown nobody and stop a voyage still being sailed — so end only if somebody is
          // still home; otherwise break out of this rotation and let the while-loop sail on.
          return appState.game.finishOrder.length>0;
        }
      }
    }
  return false;
}

/* THE BAKE-OFF DAY (v2.1). Three differences from the classic day, all consequences of one rule —
   the bake, not the arrival, is the finish line:
     - a captain at the ovens takes no ordinary turn; their attempt IS the turn
     - arriving lights the ovens and enrols them in THIS day's resolution, so nobody waits a day
       for a first attempt
     - the day resolves after every seat has played, so two captains arriving on the same day get a
       fair race rather than seat order deciding it
   The one-lap final round is gone: the baking days ARE the catch-up window.

   The per-attempt sequence lives in Game.bakeAttempt and NOWHERE ELSE — this driver supplies only
   which promise to await, never what to compute. That is what keeps the live and headless loops
   from drifting, and scripts/bakeoff_parity_test.js asserts it rather than trusting the comment.  [UNGATED-IN-4: bakeoff_parity_test.js reads the root tree, not this one] */
async function runLiveDayBakeoff(order){
  const g=appState.game;
  for(const i of order){
    const p=g.players[i];
    if(p.done||p.baking)continue;
    await (p.strategy==="human"?humanTurn(p):botTurn(p));
    if(g.lightOvens(p)){liveRender();await narrateLastEvent();}
  }
  for(const i of g.bakersToday(order)){
    await bakeTurnLive(g.players[i]);
  }
  liveRender();
  return g.endBakeDay();
}
/* One captain's attempt. The UI half lands in a later step; for now every seat plays with the
   engine's own botGuess, which is exactly what a forfeited human turn will use too. */
async function bakeTurnLive(p){
  const g=appState.game;
  /* SETUP FIRST, ALWAYS. The engine shuffles and computes the bot's guess in one call, in that
     fixed order, so the seeded stream is identical whether a human is about to play or not. Only
     then does the human path get to look at the bench. */
  const {setup,fallback}=g.bakeSetup(p);
  const human=p.strategy==="human";
  // bakeoffPrompt owns replay, the decision log and the shot clock (see its note in flow.js). It is
  // called for a human seat even under replay — that is the whole point, since it is what returns
  // the guess the player ACTUALLY made rather than re-deriving one from the bot.
  const dec=human?await bakeoffPrompt(p,setup,fallback):{g:fallback,w:0};
  /* WHERE A RE-WATCH IS ACTUALLY PAID FOR — three cases, one debit site, and the engine is the
     only thing that ever moves a coin.
       LOCAL, LIVE      already charged, one click at a time, by flow.js's onRewatch — so the purse
                        on screen falls as you spend.
       REPLAY           the prompt early-returns without ever running the UI, so nothing has been
                        charged and the whole count settles here in one go.
       REMOTE, LIVE     (04-01 Task 2, MP-06) the buyer has no engine to debit. Their own screen
                        dropped the number optimistically the moment they bought; the COUNT rode
                        home in the single reply, and this is where it becomes real. Same site,
                        same call, same one-entry decision log — the host stays authoritative and
                        the settled purse is what the end-of-voyage ranking reads.
     bakeRewatch DRAWS NO RANDOM NUMBERS (see its note in the engine), so adding the remote case
     cannot fork the seeded stream; it emits a `rewatch` event, exactly as the other two do, which
     is also what reconciles the buyer's optimistic figure back to the settled one. */
  if(dec.w&&(appState.replaying||!decisionIsLocal(p.idx)))g.bakeRewatch(p,dec.w);
  const out=g.bakeResolve(p,dec.g);
  if(human&&!appState.replaying)await benchReveal(p,out.res);
  liveRender();
  // narrateLastEvent() reads events[length-1], NOT appState.evIdx — so it narrates whichever event
  // bakeAttempt emitted last: the `finish` on a perfect bake, otherwise the `bake` verdict. Walking
  // evIdx to narrate both was a mistake; that field drives the scrubber, not this.
  await narrateLastEvent();
}
/* THE VERDICT — the one bench moment the HOST publishes, because the host is the only thing that
   scores (04-01 Task 3, MP-05).

   ORDER IS LOAD-BEARING: the write goes out BEFORE the local render, so every other captain starts
   their reveal at the same moment this one does rather than four seconds later. Then the node is
   CLEARED once the local reveal has finished, the way asyncBattle clears it at the end of a fight —
   without that, nothing downstream can take the panel back and a watcher session could never end.

   `slots` is on this snapshot and that is not a leak: it is the arrangement the crates are being
   lifted off, public to everyone the instant the reveal plays. */
async function benchReveal(p,res){
  const snap={seat:p.idx,phase:"reveal",
    order:p.bake.order.slice(),slots:p.bake.slots.slice(),
    correct:res.correct.map(Boolean),perfect:!!res.perfect};
  const live=appState.db&&appState.room&&!appState.replaying;
  if(live)netSetBattle(appState.db,appState.room,{title:BENCH_TITLE,bake:snap},netFail("bake bench"));
  await applyBenchSnap(snap);                       // LOCAL RENDER ALWAYS
  if(live)netRemoveBattle(appState.db,appState.room,netFail("bake bench clear"));
}
/* ?ovens=1 — SKIP THE VOYAGE, GO STRAIGHT TO THE BAKE-OFF.

   Sixteen-odd days of gathering to reach a minigame that lasts ninety seconds makes the minigame
   expensive to iterate on. This fills each HUMAN captain's hold with their own drafted recipe the
   moment the draft closes AND lights their ovens on the spot, so the bake-off runs at the end of
   day one with nothing to sail, tap or survive first.

   IT LIGHTS THE OVENS ITSELF, and the first version's failure to is why. That version only stocked
   the hold and relied on "everyone starts standing on Tortuga, so just pass" — which is true right
   up until the weather disagrees. Measured: a day-one storm (cfg.storm = 0.20, so one game in five)
   runs BEFORE anyone acts and blows every ship three squares off Tortuga, so `Stay put` keeps you
   where the storm dumped you, canBake never passes, and the ovens never light. The hold was only
   half the condition; position was the other half, and a shortcut that guarantees one of two
   requirements is a shortcut that fails a fifth of the time for reasons that look like a bug.
   Lighting here removes the dependency on both the turn and the weather: once a captain is baking
   the seat loop skips them and nothing re-checks where they are standing.

   PLACED HERE, after recipeDraftNet, because that is where p.recipe stops being a pair of choices
   and becomes the captain's actual recipe — and it is still before day one's wind and storm, which
   is the window in which everyone is provably still on Tortuga.

   IT DRAWS NO RANDOM NUMBERS. That is the whole reason this can be bolted onto a seeded game
   without lying about it: the board, the recipes, the wind and every bot decision are unchanged,
   and only the contents of a hold differ. It emits a real `hold` event so the move shows up in the
   captain's log rather than crates silently materialising, and says plainly on screen that this is
   a test game — a shortcut nobody can see is one somebody eventually mistakes for a real result. */
/* testFlagOn(name,urlFn) — THE SAVE OUTRANKS THE URL, asked once instead of three times.
   On a resume the query string may be gone (a bookmark without it, a shared link, a cleared
   address bar) while the decision log being replayed was recorded in a stocked game — so what the
   voyage was PLAYED under wins, and the URL only decides for a game that does not exist yet.

   Precedence: the solo save, then the game's own cfg, then the URL. The cfg leg is the CREW game's
   equivalent of the same rule — roundCfg() threads the flag onto cfg, startGame writes that cfg
   into the room, and a host-reload replay rebuilds from it, so a test room stays a test room across
   a resume even when the query string is gone. The bare URL fallback only decides for a game whose
   cfg predates the field, which is what old saves behaved like anyway.

   CONVERGED, NOT COPIED (rule 23). W0-1 added a second and third caller of this exact chain. Three
   copies of a precedence rule are three things kept in step by discipline; the design-time question
   is "what makes these agree?" and the only durable answer is that there is one of them. */
function testFlagOn(name,urlFn){
  const meta=appState.soloMeta;
  const cfg=appState.game&&appState.game.cfg;
  if(meta&&meta[name]!==undefined)return !!meta[name];
  if(cfg&&cfg[name]!==undefined)return !!cfg[name];
  return urlFn();
}
async function stockHoldsForBakeTest(){
  // ?bake2=1 IMPLIES this shortcut — a second attempt needs a captain standing at a lit oven with
  // a full hold, which is exactly what this does. One route to the ovens, two doors onto it.
  // ?endcard=1 does NOT: it never bakes, so lighting an oven for it would pose a state the card it
  // is trying to reach never comes from.
  const bake2=testFlagOn("bake2",bake2Enabled);
  if(!testFlagOn("ovens",ovensNowEnabled)&&!bake2)return;
  const g=appState.game;
  const humans=g.players.filter(p=>p.strategy==="human");
  if(!humans.length)return;
  for(const p of humans){
    if(!p.recipe||!p.recipe.length)continue;
    p.ing=[...p.recipe];
    g.ev({t:"testhold",p:p.idx});
    // Straight to the ovens. lightOvens still enforces its own gate (full recipe, at Tortuga), so
    // this cannot conjure a bake out of an ineligible captain — it just satisfies the gate in the
    // one window where everyone provably still meets it.
    g.lightOvens(p);
    /* ?bake2=1 — LAND ON THE SECOND ATTEMPT, NOT THE FIRST (W0-1).
       The jitter Wyatt reported (W3-2) is an attempt-TWO fault, and `?ovens=1` lands on attempt
       one, so the shortcut that existed could not reach the bug it was needed for. lightOvens has
       just built a fresh bake; spend one attempt on it.

       THROUGH THE ENGINE'S OWN applyResult, never by hand-setting attempts and locked. It is the
       function a real attempt goes through, so this state is one a real voyage can actually
       produce — including the forced-last-bowl rule, which hand-setting would miss. It draws no
       random numbers, so the seeded stream is untouched.

       HOW MANY STEPS THE PRETEND ATTEMPT GOT RIGHT IS DERIVED, NOT TYPED (rule 9): enough to leave
       THREE bowls open. A recipe length is not a constant — leaving a fixed two locked would solve
       a short recipe outright via the forced-last-bowl rule and hand him a bake with nothing left
       to play. Three open is the smallest bench that still shuffles and still has to be read. */
    if(bake2&&p.bake&&p.bake.order.length){
      const n=p.bake.order.length;
      const solved=Math.max(0,n-3);
      applyResult(p.bake,{correct:p.bake.order.map((_,k)=>k<solved)});
    }
  }
  liveRender();
  // @copy adhoc.test.ovensnow
  // "Stay put, then Pass" is MEASURED, not assumed: a turn is two prompts, the sail picker and then
  // the action menu, so "pass on day one" would have sent him looking for one button that does both.
  await flash(bake2
    ? `${iconImg(FLAME_IMG)} <b>TEST GAME</b> — holds stocked, ovens lit, and one attempt already spent. The bake-off resumes at attempt 2 at the end of day one.`
    : `${iconImg(FLAME_IMG)} <b>TEST GAME</b> — holds stocked and the ovens are lit. The bake-off begins at the end of day one.`,3000);
}
/* ?endcard=1 — LAND ON THE END OF VOYAGE CARD (W0-1, 2026-08-27).

   Four of Wyatt's 2026-08-27 PROBLEM marks are problems only because the card sits at the far end
   of a sixteen-day voyage and he could not get to it on a phone. Two of them (W3-3, the drumroll
   firing after the winner is named; W3-4, the card slamming down) are faults IN the ending itself,
   so a shortcut that produces anything other than the real ending would be worse than useless.

   SO IT DOES NOT DRAW A CARD. It poses the state the ending reads — every captain home with a full
   recipe — and then lets the voyage end through liveResolveEndNet(), the same and only function
   that ends every other voyage. ONE DISPLAY PATH (rule 23): the card he inspects is the card
   players get, because nothing here draws one.

   EVERY captain, not only the humans. With one finisher the ending takes its single-winner branch
   and never emits `collab` — and the collaborative bakery, the ranked finishers and the drumroll
   are exactly what W3-3 is about. The richer ending is the one worth reaching.

   IT DRAWS NO RANDOM NUMBERS, like the ovens shortcut it sits beside, and it emits a real
   `testhold` per captain so the crates do not silently materialise in the captain's log. */
async function skipToEndCard(){
  if(!testFlagOn("endcard",endCardEnabled))return false;
  const g=appState.game;
  for(const p of g.players){
    if(!p.recipe||!p.recipe.length)continue;
    p.ing=[...p.recipe];
    g.ev({t:"testhold",p:p.idx});
    p.done=true;p.baking=false;
    if(g.finishOrder.indexOf(p.idx)<0)g.finishOrder.push(p.idx);
  }
  liveRender();
  await flash(`${iconImg(FLAME_IMG)} <b>TEST GAME</b> — every captain is home with a full recipe. Skipping to the end of the voyage.`,2600);
  return true;
}
export async function runLiveNet(){
  await showAhoyIntro();
  // turn order is randomized once here and never rotates — a one-time first-player advantage,
  // not something that cycles away round to round
  let order=appState.game.players.map((_,i)=>i);
  appState.game.shuffle(order);
  // staggered starting coins level that one-time edge: sim-tested (see cocoa_pirates_sim.py
  // "staggeredcoins" mode) to flatten the first-mover advantage without overcorrecting to favor
  // whoever goes last
  order.forEach((i,pos)=>{appState.game.players[i].coins=appState.game.cfg.startCoins+pos;});
  appState.turnOrder=order.slice();buildPlayerRows();
  if(!appState.replaying&&appState.db&&appState.room)netSetTurnOrder(appState.db,appState.room,order,netFail("turn order"));
  // G5 (Wyatt-approved 2026-07-30): *"Put the recipe selection step NEXT"* — immediately after the
  // Ahoy intro, before the turn-order intro. The player is told to choose a recipe and then asked
  // to choose one, with nothing in between.
  //
  // ONLY these two awaited calls were swapped. The invariant that made that safe is NOT turn order
  // itself — it is the seeded RNG stream and the decision log, because a host-reload replay must
  // reconstruct an identical game. Verified before swapping:
  //   1. shuffle(order) above consumes game.r() (src/engine/index.js:228).
  //   2. recipeDraftNet consumes game.r() for bot picks and calls logDecision for human picks.
  //   3. showTurnOrderIntro -> netIntroBarrier (src/ui/flow.js:988) consumes NEITHER, and returns
  //      immediately when appState.replaying. Nor do its callees: localAsk, remoteDraftPrompt and
  //      passGate. logDecision lives only inside ask() (:391), which the barrier never calls.
  //   4. recipeDraftNet reads nothing from appState.turnOrder and iterates in SEAT-index order.
  // So r() consumption order (shuffle -> bot recipe picks) and logDecision order are both identical.
  //
  // The silent setup above (:727-734 — shuffle, staggered coins, turnOrder, buildPlayerRows,
  // netSetTurnOrder) was deliberately NOT moved. Nothing is on screen for it, so from a player's
  // point of view it does not sit "between" the two intros at all — and moving it WOULD perturb
  // the RNG stream, which is the one thing this swap must not do.
  await recipeDraftNet();
  await stockHoldsForBakeTest();
  /* ?endcard=1 skips straight past the day loop into liveResolveEndNet() below — the one function
     that ends every voyage. Nothing here draws the card; the real ending does.

     BEFORE the turn-order intro, and that placement was MEASURED, not chosen (2026-08-27). Placed
     after it, the shortcut sat behind netIntroBarrier's "🦜 Start" button waiting for a tap — so a
     URL whose whole purpose is to remove taps between him and the card added one. The intro draws
     lots for a sailing order that this voyage will never use. */
  const toEnd=await skipToEndCard();
  if(!toEnd)await showTurnOrderIntro(order);
  let ended=toEnd;
  while(appState.game.round<150&&!ended){
    appState.game.round++;
    // v2 rule 6: the wind that blows this round was forecast on the compass LAST round, and rule
    // 6d makes that forecast a promise — advanceWind() is the single place it is kept.
    appState.game.advanceWind();
    appState.game.ev({t:"newround",dir:appState.game.windNow,streak:appState.game.stormNow?appState.game.stormStreak:0,windStreak:appState.game.noteWind(appState.game.windNow),next:appState.game.forecastWind(),nextStorm:appState.game.stormNext});liveRender(); // NARR-04
    // wind direction (and any storm) used to be visible only in the captain's log — call it
    // out in the yellow panel too, briefly, so it's not missed
    // @copy adhoc.round.header
    await flash(describe(appState.game.events[appState.game.events.length-1]).txt,900);
    // v2 rule 7: one storm for the whole table, before anybody acts.
    if(appState.game.stormNow)await runStormLive(appState.game.windNow);
    ended=appState.game.cfg.bakeoff?await runLiveDayBakeoff(order):await runLiveDayClassic(order);
  }
  await liveResolveEndNet();
  if(appState.replaying)endReplay();   // whole game was in the log: leave replay mode & paint the result
}
export async function liveResolveEndNet(){
  // same guard as Game.resolveEnd: nobody is crowned without a full recipe (v2.1)
  appState.game.finishOrder=appState.game.eligibleFinishers();
  if(!appState.game.finishOrder.length)appState.game.winner=null;
  else if(appState.game.finishOrder.length===1)appState.game.winner=appState.game.finishOrder[0];
  else{
    // v2 rule 12: every captain who got home collaborates on ONE bakery — a scene, not a contest —
    // and Best Baker goes to whoever brought the most to it. Ranked on crates (all of them, recipe
    // or not), then coins, then who got home first. No flipping: the title is earned across the
    // whole voyage rather than decided by one last coin. bakeRank is the engine's, so the live
    // game and the headless simulator can never crown different winners.
    const ranked=appState.game.finishOrder.slice().sort((x,y)=>appState.game.bakeRank(x,y));
    appState.game.winner=ranked[0];
    appState.game.ev({t:"collab",finishers:ranked.slice(),winner:appState.game.winner,
      crates:ranked.map(i=>appState.game.players[i].ing.length),
      coins:ranked.map(i=>appState.game.players[i].coins)});
    liveRender();
    await narrateLastEvent();
  }
  appState.game.ev({t:"end",winner:appState.game.winner});
  await writeMeta();
  await writeGameLog();
  // WYATT, 2026-07-31 — the drumroll, and why liveDone moved BELOW it.
  //
  // The blue box now plays one last line and then gets out of the way, and the win is revealed in
  // the gold End of Voyage banner (see showStats). `liveDone` is what makes render() call
  // showStats(), so setting it before this await would have revealed the winner FIRST and drum-
  // rolled afterwards — suspense in the wrong order.
  //
  // flash() already waits the normal hold for the line's length before returning, which is exactly
  // the interval he asked for: "when that text has been on screen for the amount of time that it
  // would normally be faded out if there were another message coming after it." fadeOutPanel()
  // then performs the same GHOST_FADE_MS fade a replaced line gets, and hides the box.
  /* THE BOARD GETS THE LAST WORD — playtest 22 item 12 (Wyatt): "After the successful bake off i
     could see things happening on the board behind the stage, like bargain boxes and animations;
     but the stage blocked it. I think we should close the stage to let the viewer see the board and
     appreciate it one last time, then let final voyage end screen appear. The player should always
     be able to see the board again, in order to reflect on their voyage or screenshot it."

     The bake-off holds CENTRE STAGE — a full-screen dim with the panel over it — and the voyage ran
     straight from that into the gold banner, so the last thing the board did happened entirely
     behind a curtain. Two beats, in his order: drop the curtain, pull the shot out to the whole
     board, and hold. Only then the drumroll and the banner.
     fadeOutPanel() is what actually ends the stage: enterCenterStage keys off the panel's CONTENT
     (`.bko`), so emptying the panel IS lowering the curtain — no separate teardown to keep in step.
     The wide shot reuses sweepCam, which is camFull; the rim sweep already trusts it to frame the
     entire board. */
  await fadeOutPanel();
  if(window.__pp4&&window.__pp4.sweepCam)window.__pp4.sweepCam();
  liveRender();
  await sleepMs(BOARD_LAST_LOOK_MS);
  // @copy adhoc.voyageend.drumroll
  await flash("Drumroll...");
  await fadeOutPanel();
  appState.liveDone=true;
  playWinScreen(); // D-05: the host's win-screen cue, tied to the screen appearing — end/finish stay silent as events per D-06
  liveRender();
  // The victory box that used to be flashed here is GONE, deliberately — do not restore it. Its
  // three pieces (the "wins!" line, the recipe picture, the Best Baker sentence) now render in the
  // gold End of Voyage banner via showStats(), which liveRender() has just called. Flashing them
  // here as well would announce the win twice AND re-show the blue box that the drumroll just
  // faded away, which is the exact defeat UI-07 suffered before this change: showStats() hid the
  // box and the very next flash() put it straight back.
  //
  // "Nobody finished" keeps its blue-box line: there is no winner, no recipe and no gold banner
  // content to move, so the drumroll would otherwise fade into an unexplained empty screen.
  if(appState.game.winner==null){
    // @copy adhoc.voyageend.nobodyfinished
    await flash("⏳ Nobody finished the voyage.");
  }else{
    victoryConfetti(appState.game.winner); // EOV-05: a burst of celebration over the board
  }
  if(appState.db&&appState.room&&!appState.replaying){
    // CANCEL FIRST, then write "ended". An armed onDisconnect would otherwise overwrite this the
    // moment the host closes the tab on a game they actually finished, and every guest would be
    // told the host bailed. Order matters: cancel, then set.
    netClearHostGone(appState.db,appState.room);
    netUpdateRoom(appState.db,appState.room,{status:"ended"},netFail("game end"));
  }
}

// host (live): append a resolved human decision to the shared, ordered log. Issued BEFORE the
// decision's resulting events are pushed, so the log can never lag the broadcast event feed.
export function logDecision(v){
  const n=appState.dlogN++;
  if(!appState.replaying){
    // dlog holds plain decoded values everywhere else it's read (ask/pickCell/battleAsk all treat
    // dlog[dlogIdx] as the resolved value itself, e.g. resumeHostGame decodes Firebase's wrapper
    // objects into plain values before assigning to dlog) — so push the plain value here too, not
    // the encoded {v:...}/{n:1} wrapper, which is a Firebase-only transport detail.
    appState.dlog.push(v);                  // kept locally too (harmless in multiplayer — resumeHostGame
                                    // overwrites it from Firebase — but it's the only copy solo has)
    if(appState.room)netSetDlog(appState.db,appState.room,n,encodeDec(v),netFail("decision log"));
    else saveSoloState();
  }
}
// D-08: tell the crew their captain is mid-repair. Guests watch only ev/prompt/narr/flip/battle/
// clock/timerOff/draftPrompts/response/chat — none of which can carry this — so it gets its own
// small node rather than overloading prompt's payload shape. Host-only, guarded like broadcastClock.
export function setRecoveryState(state){
  if(!appState.isHost||!appState.db||!appState.room)return;
  if(state)netSetRecovery(appState.db,appState.room,{state,at:Date.now()},netFail("recovery"));
  else netRemoveRecovery(appState.db,appState.room,netFail("recovery"));
}
// guest side: purely presentational. A guest is render-only in this architecture, so this may only
// show/hide the strip — never reconcile or re-fetch game state.
export function watchRecoveryState(){
  netWatchRecovery(appState.db,appState.room,s=>{
    const v=s.val();
    const note=$("recoverynote");
    if(note)note.style.display=(v&&v.state)?"":"none";
  });
}
// host: broadcast new events to the shared feed
export function pushEvents(){
  if(!appState.db||!appState.room)return;
  while(appState.evPushed<appState.game.events.length){
    netPushEvent(appState.db,appState.room,JSON.parse(JSON.stringify(appState.game.events[appState.evPushed])),netFail("event feed"));
    appState.evPushed++;
  }
}
// host: ask a remote seat's owner to decide, wait for their answer
export function remotePrompt(seat,payload){
  const id="q"+(appState.promptCounter++)+"_"+Date.now();
  netSetPrompt(appState.db,appState.room,Object.assign({id,seat},payload),netFail("prompt"));
  return new Promise(res=>{
    let wid;
    const cb=snap=>{const v=snap.val();
      if(v&&v.id===id){netDetach(wid);netRemovePrompt(appState.db,appState.room,netFail("prompt clear"));
        res(v.choice===undefined?null:v.choice);}};
    wid=netWatchResponse(appState.db,appState.room,cb,"response:"+id);
  });
}
// remote: post my answer back to the host
export function sendResponse(id,choice,keepPanel){
  const o={id};
  if(choice!==null&&choice!==undefined)o.choice=choice;
  netSetResponse(appState.db,appState.room,o,netFail("response"));
  // Mirror localAsk's done() (flow.js:213): the centre-stage stamp is cleared as part of answering,
  // not left for the next prompt to overwrite. Without this the guest's board stays dimmed behind a
  // card they have already dismissed.
  //
  // `keepPanel` is for a card that still has a beat to play AFTER the answer, and there is exactly
  // one: the bake-off's bench, which stays up for the verdict coming back on the bench channel and
  // then leaves through its own single exit, retireBakeCard (item 6 / D-16). Clearing here would
  // take a card down mid-animation and strand the captain with no verdict at all.
  if(keepPanel)return;
  delete $("actionPanel").dataset.pp4Stage;
  panel("");
}
// Parallel prompt/response path used only for concurrent recipe drafting — a per-seat node
// so several remote seats can each have an outstanding question at once, unlike the singular
// rooms/{room}/prompt above which only ever holds one.
export function remoteDraftPrompt(seat,msg,opts,waitMsg){
  const id="d"+(appState.promptCounter++)+"_"+Date.now();
  // Same two fields as the singular prompt channel (util.js's ask()). This channel carries the
  // opening Ahoy! and the turn-order intro through netIntroBarrier, which is precisely where Wyatt
  // saw the host get a dimmed centre-stage card and the joining captain get a small pill.
  netSetDraftPrompt(appState.db,appState.room,seat,{id,seat,msg,waitMsg:waitMsg||null,
    labels:opts.map(o=>o.label),classes:opts.map(o=>o.cls||""),
    shorts:opts.map(o=>o&&o.short!=null?o.short:""),
    stage:opts.some(o=>o&&o.stage)?1:null},netFail("recipe prompt"));
  return new Promise(res=>{
    let wid;
    const cb=snap=>{const v=snap.val();
      if(v&&v.id===id){netDetach(wid);netRemoveDraftPrompt(appState.db,appState.room,seat,netFail("recipe prompt clear"));
        res(v.choice);}};
    wid=netWatchDraftResponse(appState.db,appState.room,seat,cb,"draftResponse:"+id);
  });
}
export function watchDraftPrompt(){
  netWatchDraftPrompt(appState.db,appState.room,appState.mySeat,snap=>{
    const p=snap.val();
    if(!p){return;}
    const cls=p.classes||[];
    const grid=cls.some(c=>c)?" recipes":"";
    if(p.stage)$("actionPanel").dataset.pp4Stage="1";else delete $("actionPanel").dataset.pp4Stage;
    // @copy prompt.net.draftrerender
    // 02.1-03: the third copy of this markup is gone too. The draft channel's WIRE payload stays
    // deliberately narrower (no disabled/why/seat/colors — a recipe card is never greyed); only
    // its RENDERING stops duplicating the pattern, so a field it one day needs is already built.
    panel(`<div class="apMsg">${p.msg}</div><div class="apBtns${grid}">`+
      optionButtonsHTML((p.labels||[]).map((l,i)=>({i,label:l,cls:cls[i]})))+`</div>`,true);
    const shorts=p.shorts||[];
    $("actionPanel").querySelectorAll(".apBtn").forEach(b=>{
      const i=+b.dataset.i;
      if(shorts[i])b._shortHtml=shorts[i];
      b.onclick=()=>{
        netSetDraftResponse(appState.db,appState.room,appState.mySeat,{id:p.id,choice:i},netFail("recipe response"));
        /* THE CARD WAS NEVER TORN DOWN — Wyatt, 2026-08-19: "the crew draws lots screen doesn't
           disappear". The old line showed the waiting narration and left the panel standing,
           because showNarration paints a floating bubble and does not touch #actionPanel. On the
           opening Ahoy! that meant the card sat there for the rest of the voyage. localAsk's done()
           clears the stamp AND the panel before anything else (flow.js:213) — mirrored here.
           The teardown runs unconditionally now; the waiting line, if any, comes after it. */
        delete $("actionPanel").dataset.pp4Stage;
        panel("");
        if(p.waitMsg)showNarration(p.waitMsg,{wait:true}); // item 19: no deadline on a wait line
      };
    });
  });
}
// remote: render the game purely from the broadcast event feed
export function watchEvents(){
  netWatchEvents(appState.db,appState.room,async snap=>{
    // G14 (Wyatt-approved 2026-07-30): the guest half of the trade-wind sweep. THE PUSH AND THE
    // evIdx ASSIGNMENT HAPPEN FIRST, BEFORE ANY await — so a second event arriving mid-sweep cannot
    // reorder the feed. Everything after the await is presentation only.
    const e=fixEv(snap.val());
    appState.game.events.push(e);
    appState.evIdx=appState.game.events.length-1;
    /* THE GUEST'S OWN COPY OF THE GAME USED TO BE A PHOTOGRAPH TAKEN THE INSTANT THE VOYAGE BEGAN.

       beginGame() constructs `appState.game` on both tiers, but only the host's runLiveNet() ever
       mutates it again — so on a guest, round stayed 0, windNow stayed null, and every captain's
       pos/coins/ing stayed at their spawn values for the entire voyage while `events[]` filled up
       with everything that actually happened. render() has always known that and draws from
       `events[evIdx].state` (board.js:1567), which is why the BOARD was right and the RIBBON, the
       WIND PILL and every CAMERA CUT were wrong: those read `appState.game` directly
       (stage.js ribbonTick :403, pillHTML :381, camToSeat :72, camFitSail :97, camFitSeats :111).
       Measured on a real driven guest, 2026-08-19, on day 2 of a live crew game:
           appState.game.players pos: 7,6 · 7,8 · 8,7 · 6,7   (spawn, frozen)
           events[last].state    pos: 8,9 · 9,10 · 9,9 · 6,7   (what was actually on screen)
           host ribbon "DAY 2" / pill "WIND NOW: W← · FORECAST: N↑"
           guest ribbon "DAY 1" / pill blank, because pillHTML()'s own !g.windNow guard hides it

       THE FIX IS TO STOP THE LIE, NOT TO PATCH THE SIX PLACES THAT READ IT. Game.ev()
       (engine/index.js:316) already bakes round/wind/storm and a full per-seat snapshot onto EVERY
       event that crosses the wire, and `newround` additionally carries next/nextStorm — so this
       needs no engine change, no wire-format change, and raises no determinism question. It is the
       same move applyEndMeta() (:757) has always made for the end-of-voyage fields, run on every
       event instead of once at the finish line. Not one renderer changed to make the ribbon, the
       pill and the sail camera correct.

       MUTATED IN PLACE, NEVER REASSIGNED: renderBattleFromSnap holds `appState.game.players[i]`
       object references across the fight (flow.js:2283-2285). Replacing the array would strand
       them; writing their fields makes those same references simply become true.

       The arrays are COPIED, not aliased, exactly as Game.ev() copies them on the way out —
       `events[i].state` is the scrubber's history, and history must not be reachable for writing
       through a live player object. */
    if(e.state)e.state.forEach((s,i)=>{
      const p=appState.game.players[i];if(!p||!s)return;
      p.pos=Array.isArray(s.pos)?[...s.pos]:p.pos;
      p.coins=s.coins;p.ing=Array.isArray(s.ing)?[...s.ing]:[];p.done=s.done;p.baking=!!s.baking;
    });
    if(e.round!=null)appState.game.round=e.round;
    if(e.wind!=null)appState.game.windNow=e.wind;
    if(e.storm!=null)appState.game.stormNow=e.storm;
    // next/nextStorm ride on the `newround` event ONLY (engine/index.js:2940), and they are already
    // forecastWind()'s own output — a storm-bound forecast arrives as null and Firebase drops the
    // key, so windNext lands undefined and g.forecastWind() returns null through its own stormNext
    // branch, which is exactly what the host shows. pillHTML() calls forecastWind() unmodified.
    if(e.t==="newround"){appState.game.windNext=e.next;appState.game.stormNext=e.nextStorm;}
    /* 21 AND 20 — WHOSE TURN IT IS, learned from the same place on both tiers (02.15-01 Stage 2).
       Measured before it was written, fourteen consecutive samples of a real two-tab crew game:
       host curSeat=1 with the ribbon glowing boat 1, guest curSeat=0 with the glow on boat 0 and
       never moving. Nothing on this tier had ever written it. Same shared renderer, two sets of
       callers, one of which did not exist on a guest — D-24 in one figure.
       `p` rides `turn`, `sail`, `dock`, `pass` and `attack` already; applyActiveSeat skips the
       events that carry no seat rather than blanking the indicator, and bounds the seat before it
       is used as an index. Nothing is asked of the engine, so the event schema and the determinism
       corpus are untouched — the same move this callback already makes for round, wind and storm. */
    applyActiveSeat(e.p);
    syncLogLines();
    $("scrub").max=Math.max(0,appState.game.events.length-1);
    // ANIMATE BEFORE render(), or the ship has already jumped to its destination and there is
    // nothing left to watch. The same shared stepper the host calls — one function, both tiers, so
    // they cannot be paced or aimed differently (that is what scripts/host_guest_parity_check.js
    // assertion 3 pins). This tier does NOT read rimCellInfo or rimHead itself.
    //
    // KNOWN, ACCEPTED DEGRADATION, stated rather than discovered later: the guest's coin/crate
    // panels lag by the sweep's duration (~95ms per square) because render() now runs after it, and
    // an event arriving mid-sweep harmlessly snaps the ship to its true square on the next paint.
    // Degradation, not breakage.
    await animateRimSweepIfAny();
    render();
    // (the re-fetch of events[evIdx] that used to sit here is gone — `e` is declared once, at the
    // top of this callback, and evIdx was set to events.length-1 the instant after `e` was pushed,
    // so the line was already handing back the identical object. It is now also a redeclaration
    // this scope would refuse to parse.)
    spawnPops(e,boardCell()); // notes/edits 11-03: cell now lives in src/ui/board.js
    playForEvent(e); // AUDIO-01/D-07: the guest's mirror of the host's per-event sound moment — rival and bot captains audible here too, no isLocalTo gate
    if(e.t==="end")applyEndMeta();
  });
}
export function watchPrompt(){
  netWatchPrompt(appState.db,appState.room,snap=>{
    const p=snap.val();
    /* A BAKE BENCH OUTLIVES ITS OWN PROMPT, so this clear must not take one down (04-01 Task 3).
       MEASURED: the remote captain answered, remotePrompt removed the prompt node, this callback
       fired with p===null and wiped the bench a beat before the verdict arrived on the bench
       channel — so the one captain who had actually played the bake was the only one who never saw
       how it went. The same guard protects a WATCHER, whose bench is not tied to any prompt of
       their own. The card leaves through its one exit, retireBakeCard (item 6 / D-16), never here. */
    if(!p||p.seat!==appState.mySeat){
      if(!document.querySelector("#actionPanel .bko"))panel("");
      setFlipActive(null);appState.inBattlePrompt=false;return;}
    if(p.kind==="ask"){
      if(p.battle){
        // this seat owns the live battle decision — render the same scoreboard everyone else
        // sees, with the control (flip button or choice buttons) layered on top
        appState.inBattlePrompt=true;
        if(p.flip){
          renderBattleFromSnap(p.battle);
          setNeedsAction(true);
          setFlipActive(()=>{setFlipActive(null);setNeedsAction(false);sendResponse(p.id,0);});
        }else{
          setFlipActive(null);
          const cols=p.colors||[];
          renderBattleFromSnap(p.battle,{prompt:{msg:p.msg,opts:(p.labels||[]).map(l=>({label:l})),colors:cols}});
          $("actionPanel").querySelectorAll(".btlBtn").forEach(b=>{b.onclick=()=>sendResponse(p.id,+b.dataset.i);});
        }
        return;
      }
      appState.inBattlePrompt=false;
      // mirror localAsk: a flip option arms the flippenator coin, a `back` option renders the
      // small circular apBack escape hatch, and any remaining options are the normal button row.
      // (These used to be host-only — remote players got a stray "FLIP!" button in the panel and
      // never saw the back affordance.)
      const cols=p.colors||[],cls=p.classes||[],labels=p.labels||[];
      const flipIdx=(p.flipIdx!=null&&p.flipIdx>=0)?p.flipIdx:(p.flip?0:-1);
      const backIdx=(p.back!=null&&p.back>=0)?p.back:-1;
      const backHtml=backIdx>=0?backButtonHTML(backIdx):"";
      if(flipIdx>=0){
        setNeedsAction(true);
        setFlipActive(()=>{setFlipActive(null);setNeedsAction(false);sendResponse(p.id,flipIdx);});
        if(backIdx>=0){
          // @copy prompt.net.promptrerender
          panel(`${backHtml}<div class="apMsg">${p.msg}</div>`,true);
          $("actionPanel").querySelectorAll(".apBack").forEach(b=>{
            b.onclick=()=>{setFlipActive(null);setNeedsAction(false);sendResponse(p.id,+b.dataset.i);};});
        }else showNarration(p.msg);
        return;
      }
      setFlipActive(null);
      const dis=p.disabled||[];
      // playtest 21 item 5: aria-disabled so a greyed circle can be TAPPED for its reason, and
      // data-why so it has one to give.
      //
      // THIS IS NO LONGER A SECOND COPY OF THE BUTTON MARKUP (02.1-03). The comment that used to
      // sit here said it out loud — "a genuine second copy... so a change to one that skips the
      // other reintroduces the bug on whichever side was forgotten" — and six fields had already
      // proved it one at a time. The row is now built by optionButtonsHTML (util.js), the same
      // function localAsk calls, so there is nothing left to keep in step by hand. The local escW
      // closure went with it; the shared builder escapes through escHtml, which also escapes ">".
      // What stays here, and must, is this tier's own click wiring: sendResponse(p.id,i) writes an
      // answer to Firebase where localAsk resolves a promise in this browser.
      const why=p.why||[];
      // The seventh and last field of that drift class. `seat` anchors an option's circle over the
      // boat it NAMES rather than the boat choosing (stage.js:1174 reads it back off data-seat) —
      // the battle side-bet's "Call Dough Hook" is what needs it, and until now a spectating guest
      // got the ordinary fan while the host got the anchored one. "" means "no seat"; SEAT 0 IS A
      // REAL CAPTAIN, so this is an explicit ""/null test and never a truthiness one.
      const seats=p.seats||[];
      const rest=labels.map((l,i)=>({l,i})).filter(x=>x.i!==backIdx);
      const grid=cls.some(c=>c)?" recipes":"";
      const subHtml=p.sub?`<div class="apSub">${p.sub}</div>`:"";
      /* MP-08 — THE COIN SLIDER, ON THIS SEAT TOO (05-01 Task 3, D-55). Until this build a remote
         captain got coinStepper's +/- pair instead: three round trips per coin, and — measured in a
         real crew room on 2026-08-23, shots/t2/03-mid-round-guest1.png — those +/- circles rendered
         IN THE RADIAL ARC, which is precisely what playtest 21 took out of the host's arc ("THE ARC
         IS FOR ACTIONS ONLY"). Same gesture, two behaviours, on the one axis rule 23 forbids.
         IT NAMES sliderWrapHTML AND wireSlider DIRECTLY, not through a guest-only wrapper — that is
         what lets the orchestration parity gate SEE the convergence rather than a lookalike.
         `ref` is built HERE and read at click time; the number rides home as {i,n} and ask() lands
         it in the HOST's own ref before resolveOpt, so coinSlider's single logQuantity() records a
         dragged number identically whoever dragged it. */
      const sl=p.slider?Object.assign({},p.slider,{ref:{value:p.slider.start}}):null;
      const slHtml=sl?sliderWrapHTML(sl):"";
      // The guest half of the two fields added to this payload in util.js's ask(). Stamped BEFORE
      // panel() so the stage loop sees it on the same tick localAsk's does (flow.js:214).
      if(p.stage)$("actionPanel").dataset.pp4Stage="1";else delete $("actionPanel").dataset.pp4Stage;
      // @copy prompt.net.promptrerenderbuttons
      panel(`${backHtml}<div class="apMsg">${p.msg}</div>${slHtml}<div class="apBtns${grid}">`+
        optionButtonsHTML(rest.map(x=>({i:x.i,label:x.l,cls:cls[x.i],disabled:dis[x.i],why:why[x.i],seat:(seats[x.i]===""||seats[x.i]==null)?null:seats[x.i],color:cols[x.i]})))+`</div>${subHtml}`,true);
      // ...wired by the same function localAsk wires it with. The slider sits BETWEEN the message
      // and the buttons on both tiers, which is also where the top-to-bottom reveal rule puts it.
      if(sl)wireSlider($("actionPanel"),sl);
      // menuButtons() reads _shortHtml off the BUTTON, so the guest has to hang it on the same way
      // localAsk does (flow.js:271) — an empty string means "this option had no short label",
      // which is not the same as having one, so it must not be assigned.
      const shorts=p.shorts||[];
      $("actionPanel").querySelectorAll(".apBtn,.apBack").forEach(b=>{
        const i=+b.dataset.i;
        if(shorts[i])b._shortHtml=shorts[i];
        if(isDisabledBtn(b)){b.onclick=()=>showWhy(b);return;}
        /* {i,n} WHEN THERE IS A NUMBER TO SEND, a bare index when there is not. sendResponse puts
           `choice` on the wire unchanged and remotePrompt resolves it unchanged, so an OBJECT needs
           no new node and no new listener — 04-01 established that for the bake's {g:[...],w:n}. */
        b.onclick=()=>sendResponse(p.id,sl?{i,n:sl.ref.value}:i);
      });
    }else if(p.kind==="pick"){
      appState.inBattlePrompt=false;
      setFlipActive(null);
      // THE TRACER (02.15-02 Task 3, D-25/PAR-14): names the ONE converged renderer DIRECTLY —
      // this is what makes the pick channel's orchestration parity gate (assertion 6,
      // scripts/host_guest_parity_check.js) see the convergence, not merely a guest-only wrapper
      // that happens to call it. `answer` writes the guest's choice back over the wire; the
      // renderer itself never touches Firebase.
      // `hint` is the sail self-check's shout, composed by pickCell for EVERY captain since 02.15
      // Stage 4 — rendered here, never authored here, exactly like `msg` (D-35).
      /* T-02 (Wyatt, 2026-08-26): "The guest cannot 'stay put' -- why is there an entire parallel
         track of code for guests? this violates many of my design principles."

         HE IS RIGHT, AND IT WAS ONE MISSING FIELD. renderPickPrompt draws the yellow stay square
         only `if(spec.pos)`, and this spec was built as {cells,msg,hint} — so no guest has ever
         been sent the position of their own boat, no guest has ever had a stay square, and the
         Stay put button that square unlocks could never appear. Not a parallel renderer: the ONE
         converged renderer, starved of an argument.

         prompt_field_parity_check's assertion 2 has been RED about exactly this the whole time —
         "pickCell() SENDS 'pos' and watchPrompt's pick branch never reads p.pos". The gate named
         the field, the tier and the consequence, and nobody read it.

         And the comment inside renderPickPrompt claimed `pos` is "absent only across a version
         skew (an older host feeding a newer guest)". It was absent on EVERY guest in EVERY game.
         That is rule 6's other half in the wild — a comment making a claim about runtime, rotted,
         and believed. */
      renderPickPrompt({cells:p.cells||[],msg:p.msg,hint:p.hint||null,pos:p.pos||null},cell=>sendResponse(p.id,cell));
    }else if(p.kind==="bake"){
      /* MP-04 — THE BAKE, TAKEN BY ITS OWN CAPTAIN (04-01 Task 2, THE TRACER).
         Before this branch existed, a guest's bake was played on the HOST's screen by the host's
         own hands while the guest's screen showed nothing at all — measured 2026-08-23 in a real
         two-browser room (.planning/phases/04-the-networked-bakeoff/shots/t1/ANSWER.md).

         IT NAMES THE CHOREOGRAPHY FUNCTION DIRECTLY, not through a guest-only wrapper. That is
         what lets the orchestration parity gate (assertion 6, scripts/host_guest_parity_check.js)
         SEE the convergence — a wrapper would satisfy the eye and nothing else. playBakeoffLive is
         handed the same spec bakeoffPrompt built, so the shuffle a remote captain watches is the
         same arcs, the same 1000ms swaps and the same 700ms settles, drawn by the same code. */
      appState.inBattlePrompt=false;
      setFlipActive(null);
      /* ONE PROMPT, ONE CHOREOGRAPHY. This callback fires on every write to the prompt node and
         also on re-attach, and a bake is a two-minute interaction rather than a re-render — a
         second start would put two benches in one panel and answer twice. Same edge-trigger idiom
         watchBattle uses for spectatingBattle: read before you assign. */
      if(_liveBakePromptId===p.id)return;
      _liveBakePromptId=p.id;
      /* MP-06, THE REMOTE PURSE. The engine is the only thing that moves a real coin and it lives
         on the host, so what happens here is DISPLAY: the buyer's own purse drops the moment they
         buy, the count rides home in the single reply, and the host charges it authoritatively
         through Game.bakeRewatch — after which the ordinary `rewatch` event reconciles this screen
         with the settled number.
         THE ALTERNATIVE, RECORDED RATHER THAN TAKEN (D-56): a live spend channel would show the
         true number instantly, at the price of a round-trip in the middle of a prompt and a second
         way for a purse to be wrong. If the optimistic figure is ever seen to disagree with the
         settled one, report the number — do not paper over it. */
      const cost=p.cost||1;
      let purse=(p.coins==null?0:p.coins);
      const spend=(n)=>{
        const want=cost*(n||0);
        if(want<=0||purse<want)return false;
        purse-=want;showSeatCoins(p.seat,purse);
        return true;
      };
      spend.canAfford=()=>purse>=cost;
      /* THE SPEC IS THE OBJECT THAT CAME OVER THE WIRE, held once and handed both to the
         choreography and to the publisher — so a remote captain's bench and the bench every other
         captain watches are built from literally the same fields. */
      // `baker` (T-25) is read here for the same reason every other field is: the prompt-field
      // parity gate treats a field this branch does not read as a fact the local captain gets and
      // a remote one does not. It caught this exact omission the moment `baker` was added — the
      // local screen would have titled the card "{Captain}'s Bake-Off" while a remote captain's
      // still read "The Bake-Off". A title is not load-bearing; the divergence would have been.
      const wireSpec={order:p.order||[],before:p.before||[],swaps:p.swaps||[],
                      locked:p.locked||[],attempts:p.attempts||0,cost,baker:p.baker};
      const seat=p.seat;
      /* MP-13 (04-01 Task 4) — A CAPTAIN WHO DROPS MID-BAKE DOES NOT STALL THE TABLE.
         The bake has no shot clock any more (Wyatt, 2026-08-18: the finish line gets as long as it
         needs), and the clock was the only thing that used to stop an absent captain hanging the
         voyage. So the fallback fires on PRESENCE LOSS instead, armed HERE, on the SERVER, the
         moment this captain's bench opens — the tab closing, the browser crashing and the wifi
         dropping are exactly the cases a client-side goodbye cannot cover.
         The host is already holding an open promise on the response node, so this needs no new
         watcher and no new node: the armed write carries this prompt's id and NO `choice`, which
         remotePrompt resolves to null and the tail already treats as a forfeit to the engine's own
         guess, having bought nothing. One entry, both facts.
         CANCELLING IS NOT OPTIONAL — see the writer's own note. It is cancelled on the answer path
         AND on the error path below, which are the only two ways out of this branch. */
      netForfeitOnDisconnect(appState.db,appState.room,p.id);
      playBakeoffLive(wireSpec,{onRewatch:spend,onBench:(patch)=>benchPublish(wireSpec,seat,patch)})
        // The SAME SHAPE playBakeoffLive resolves for a local captain — {guess,rewatches} — so the
        // host's tail in bakeoffPrompt never has to know which tier answered. `null` (the bench
        // failed to render) travels as no `choice` at all, which remotePrompt already resolves to
        // null and the tail already treats as a forfeit to the engine's own guess.
        //
        // KEEP THE PANEL (the third argument). sendResponse ordinarily clears #actionPanel as part
        // of answering, which is right for every other prompt — but a bake's card has one beat
        // left on it: the reveal, which arrives back from the host on the bench channel and plays
        // on THIS bench. The card's exit is retireBakeCard's, at the end of that (item 6 / D-16).
        .then(r=>{_liveBakePromptId=null;
                  netClearForfeitOnDisconnect(appState.db,appState.room);
                  sendResponse(p.id,r||null,true);},
              e=>{_liveBakePromptId=null;console.error("bake prompt",e);
                  netClearForfeitOnDisconnect(appState.db,appState.room);
                  sendResponse(p.id,null,true);});
    }
  });
}
// The prompt id whose bake choreography is currently running on THIS client — see watchPrompt's
// bake branch. Module-local, like _watchRoomAttachedFor and _hostGoneArmedFor below.
let _liveBakePromptId=null;
/* ONE DRAW PATH (02.15-01 Stage 1, D-25). This used to call showNarration(), which reaches the
   bubble through __pp4.narr — a DIFFERENT entry to the same renderer than the one the host's own
   game loop uses (narrateCurrent -> flash -> __pp4.flash). Same bubble, two orchestrations, and
   nothing holding them together: a host line carrying an explicit hold held for one duration on the
   host and another on a guest, and four of the seven divergences in Wyatt's screenshots were
   narration. It now calls flash() — the SAME function the host's loop calls — so a guest draws a
   narration line through exactly the code the host draws it through. watchChat's shape, applied to
   the game display.
   NO ECHO AND NO LOOP: flash()'s mirror is netBroadcast, guarded by `isHost && db && room`, so a
   guest calling flash() broadcasts nothing, and the host never listens to this node at all (this
   function only runs in the guest branch of beginGame's fork). The host's own screen is still drawn
   locally and synchronously — it never reads itself back through Firebase, which is what keeps solo
   and pass-and-play alive.
   THE RAW PAYLOAD IS PASSED, NOT A PICKED ONE: flash() calls pickNarrVariant itself when
   appState.room is set, so handing it v.html + v.variants picks exactly once, as before. An old
   payload with no `variants` key still degrades to v.html.
   `wait` is item 19's flag — a wait line registers no dismissal deadline (see stageFlash). */
export function watchNarr(){
  netWatchNarr(appState.db,appState.room,s=>{const v=s.val();
    // while a battle scoreboard is showing here (as spectator or active combatant), keep it up —
    // the per-flip "X flips HEADS" broadcasts are already reflected in the scoreboard coins, and
    // letting them overwrite the panel made the battle box flicker away between flips (#9)
    if(v&&!appState.spectatingBattle&&!appState.inBattlePrompt)
      Promise.resolve(flash(v.html,undefined,undefined,v.variants,v.wait?{wait:true}:undefined)).catch(()=>{});});
}

/* ================= welcome modal ================= */
/* ================= lobby / room ================= */
// WYATT'S WORDING, 2026-07-31, verbatim. Shared by createRoom and joinRoom, the same way the
// capacity line below is shared by both (D-60) — one cause, one sentence, wherever it surfaces.
//
// WHY THIS EXISTS, so nobody merges it back into the capacity line: `appState.db === null` means
// this browser never established a connection at all — offline, an ad-blocker or extension eating
// the request, or the multiplayer script failing to load. That is NOT the server being busy. Until
// today both said "the server's got too many pirates baking right now", which sent a player with
// their wi-fi off away to wait it out, and made a genuine capacity problem and a local one
// indistinguishable in a bug report.
//
// A null db is checked BEFORE the try, not inside the catch, because it is not an exception — it is
// a precondition that is knowable without attempting anything.
const NO_CONNECTION_MSG="Can't reach the Sugar Seas — check yer connection, wifi, and ad blockers, then try again matey.";
// FIX-03/T-02-05 (02-02): shared with watchRoom's existing guard below AND startGame's new one —
// two ids for one shared sentence, exactly as createnoconnection/joinnoconnection already do it
// above (the id names the SITE so a review mark can follow it across a source move; the constant
// keeps the words identical so the two sites can never drift into two different sentences for one
// situation — a room that has stopped existing).
const GAME_GONE_MSG="That game no longer exists.";
export async function createRoom(){
  // @copy misc.mperror.createnoconnection
  if(!appState.db){alert(NO_CONNECTION_MSG);return;}
  const name=requireName(); // FIX-01: the removed welcome-screen field's read, repointed at the chokepoint
  appState.numSeats=4; // online hosted games are always 4 seats — bots fill any unfilled slot
  const code=genCode();
  const seats={0:{name,id:appState.myId,bot:false}};
  for(let i=1;i<appState.numSeats;i++)seats[i]={name:"",id:"",bot:true,strat:seatStrat(i)}; // BOT-02
  appState.room=code;appState.mySeat=0;appState.isHost=true;
  // UI-05 follow-up (Wyatt, 2026-07-31): show the room screen NOW, before the write, so the click
  // has an immediate response.
  //
  // MEASURED, because "glitchy" turned out not to mean what it sounded like: the click handler
  // blocks for 2ms, but the room screen did not appear for 1002ms — a full second in which the
  // player clicked Host and the menu just sat there. Wyatt read that dead time as the old
  // intermediate step "still loading". It was not; it was nothing at all.
  //
  // Before UI-05 this felt fine only by accident: clicking Host flipped to #stepHost instantly (a
  // local display toggle) and the same ~1s network wait then hid behind the "Create the game"
  // button. Removing that screen removed the feedback and left the wait exposed. The fix is to give
  // the feedback back without the extra click — not to restore the screen.
  //
  // Nothing is faked by doing this early: genCode() generated the code LOCALLY a few lines up, so
  // the six characters on screen are the real ones. Only their registration is still in flight. On
  // failure everything is undone and we return to the menu (see the catch).
  /* T-13 (Wyatt, 2026-08-26): "when the host leaves the game -- when they try to host a new game,
     in the same browser, the 'Captains at the Table' box is populated with the stale players from
     the past game -- not new ones. User must refresh the page to clear it."

     THIS CLOSES THE WINDOW I CAN SEE AND IS NOT CLAIMED AS THE WHOLE FIX. showRoom() is called
     HERE, deliberately, before the network write (see the measured note above: the room screen used
     to take 1002ms to appear). #seatList still holds the PREVIOUS room's markup at that moment, and
     nothing clears it, so the old captains are on screen until the first seats push repaints them.
     Emptying it means a new room starts empty rather than starting wrong.

     WHAT I COULD NOT REPRODUCE is the PERSISTENCE he describes — "must refresh to clear it" means
     the repaint never arrives at all, and that is a different fault from a stale first frame.
     RULED OUT, so nobody re-runs them:
       - the registry refusing a duplicate attach: keyFor() includes ref.toString(), which carries
         the room code, so a new room is a new key and attaches normally (net/registry.js).
       - listeners leaking from the abandoned room: the Back to port handler calls netLeaveRoom(),
         which is detachRoom(), which does drop every room-scoped entry (net/index.js:116).
     Neither is the cause. Reproducing it needs leaving a real room and hosting another in the same
     browser, which is a two-room crew run and is the verification that ran out of budget tonight. */
  $("seatList").innerHTML="";
  const wm=$("waitMsg"); if(wm)wm.textContent="";
  showRoom();
  try{
    await netCreateRoom(appState.db,code,{host:appState.myId,status:"lobby",numSeats:appState.numSeats,seats,createdAt:Date.now()});
  }catch(e){
    console.error("createRoom failed",e);appState.room=null;appState.isHost=false;
    showHome(); // undo the optimistic screen — the room does not exist
    // NARR-01/D-25/D-60 (Wyatt-approved 2026-07-29): one line for every multiplayer-service
    // disruption — createRoom's own failure and joinRoom's below share it verbatim (D-60).
    // @copy misc.mperror.createcapacity
    alert("Arrgh, the server's got too many pirates baking right now! Try a Solo game instead?");
    return;
  }
  // showRoom() already ran above, before the write — not repeated here.
  saveSession();watchRoom();
}
// UI-05 follow-up (Wyatt, 2026-07-31): back out of the "share this code with yer crew" screen.
//
// This is NOT leaveGame(). leaveGame() reloads the page and calls clearSoloState(), which would
// destroy an unrelated saved SOLO game just because someone changed their mind about hosting. Here
// nothing has started: no game, no board, no turn order — only a lobby row in the database.
//
// Order matters. Detach the watchers FIRST: watchRoom() is live by now, and deleting the room while
// it is still listening fires the "that game no longer exists" recovery path at the person who
// deliberately left, which is the host telling themselves off.
//
// Only the HOST deletes, and only from the lobby. A guest backing out just stops watching — the
// room is not theirs to remove — and a room that has already started playing is never deleted here,
// because that would strand everyone else at the table.
export async function abandonRoom(){
  const room=appState.room, wasHost=appState.isHost;
  netLeaveRoom();
  // NAME-01 (2026-08-01, measured): netLeaveRoom() tears the room-scoped watchers down, which breaks
  // the invariant _watchRoomAttachedFor stands for ("the seat/status watchers are live for this
  // room"). Left set, a player who leaves and rejoins the SAME room trips D-13's guard, watchRoom()
  // returns before re-attaching netWatchSeats(), and their lobby freezes on the last seat list they
  // saw — the rename they just made lands on every other client but not their own. Clearing it here
  // keeps the guard honest: it must mean "attached", not "was attached once".
  _watchRoomAttachedFor=null;
  if(room&&wasHost){
    try{ await netDeleteRoom(appState.db,room); }
    catch(e){ console.error("abandonRoom: could not delete room",e); } // best effort — leaving still works
  }
  appState.room=null;appState.mySeat=null;appState.isHost=false;appState.roster=[];
  clearSession();
  showHome();
}
// withoutSeat and applyNameClaim — the seat-naming rule — moved to src/shared/index.js on
// 2026-08-22 (item 16, D-19). It is a PURE rule over a seat map, so it belongs in the pure leaf tier
// beside unusedDefaultName() and seatHeldName(), the two helpers it is built from — and, being
// there, it can be imported and exercised directly by a Node gate
// (4/scripts/name_claim_check.js) instead of grepped for. This file keeps the three CALLERS:
// joinRoom's fresh-claim and rejoin paths, and renameMySeat.
// NAME-02 (Wyatt, 2026-08-01): "the player may just want to change their name." Rewrites this
// player's OWN seat in place, so renaming never costs them the room. Deliberately narrow — it
// touches one seat, only its owner's, and only in the lobby: once the voyage is under way narration
// has already gone out under the old name, and renaming would desync the roster against events
// guests have already been shown (the same guard joinRoom's rejoin path uses).
export async function renameMySeat(newName){
  if(!appState.db||!appState.room||appState.mySeat==null||appState.gameStarted)return;
  const seat=appState.mySeat;
  const auto=pendingAutoName();
  const chosen=(auto&&newName===auto)?"":newName;
  // item 16 (D-19): the same rule joinRoom uses. Reset on EVERY updater run — Firebase may call a
  // transaction updater more than once (typically a cached pass, then the server value), so an
  // outcome recorded on an earlier run would be read back as this run's answer.
  let outcome=null;
  try{
    await netClaimSeat(appState.db,appState.room,s=>{
      outcome=null;
      if(!s)return s;
      const cur=s[seat]||{};
      if(cur.id!==appState.myId)return s; // not mine any more — never stomp another captain's seat
      outcome=applyNameClaim(s,seat,chosen,appState.numSeats||4,appState.myId,false);
      if(outcome==="taken")return;        // undefined ABORTS the transaction — nothing is written
      return s;
    });
  }catch(e){
    console.error("renameMySeat failed",e);
    // @copy misc.mperror.renamefailed
    alert("Couldn't change yer name just now — the seas are choppy. Try again in a moment.");
  }
  /* REFUSED, so SAY SO — a rename that silently does not happen is the fix wearing the bug's
     clothes. The name modal is the only route to a rename and it has already closed by now, so the
     refusal is delivered by opening it again with the warning under the box, in the same words and
     the same place as the JOIN screen's (rule 8). Same continuation, so confirming a different name
     completes the rename the captain came here to make. Never an alert() — see setNameWarning. */
  if(outcome==="taken")openNameModal(name=>{renameMySeat(name);},nameTakenMsg(newName));
  // no re-render here: netWatchSeats() is already live for this room and repaints every client,
  // this one included, the moment the write lands.
}
export async function joinRoom(){
  // item 16 (D-19): every attempt starts from a clean slate. Without this a captain who fixed their
  // name and pressed Join again would watch the old refusal sit under the box while the join
  // succeeded behind it — which reads as "still refused" and is the opposite of what happened.
  setNameWarning("joinName","");
  const typedName=($("joinName").value||"").trim().slice(0,MAX_NAME_LEN);
  const code=($("joinCode").value||"").toUpperCase().trim();
  // @copy misc.mperror.entercode
  if(code.length<4){alert("Enter the room code yer host shared.");return;}
  // same precondition as createRoom — a null handle is "we never connected", not "the server is busy".
  // Two ids for one shared sentence, exactly as createcapacity/joincapacity already do it: the id
  // names the SITE so a review mark can follow it across a source move, the constant keeps the words
  // identical so the two can never drift apart.
  // @copy misc.mperror.joinnoconnection
  if(!appState.db){alert(NO_CONNECTION_MSG);return;}
  let snap;
  try{snap=await netReadRoom(appState.db,code);}
  // @copy misc.mperror.joincapacity
  catch(e){console.error("joinRoom failed",e);alert("Arrgh, the server's got too many pirates baking right now! Try a Solo game instead?");return;}
  // @copy misc.mperror.nogamefound
  if(!snap.exists()){alert(`Arrgh, no game found with code ${code}. Try typin' again.`);return;}
  const r=snap.val();
  const seats=r.seats||{};
  // NAME-01 (2026-08-01): a name the player was OFFERED is not one they chose. #joinName is prefilled
  // from the modal and stays editable, so "unchosen" means the field still holds the exact string we
  // put there; any edit — even retyping the same letters — counts as a choice and is honoured
  // verbatim. An unchosen name goes in blank so the collision-safe fallback below actually runs.
  // Before this, every fresh player confirmed the same prefilled "Davy Scones", which was truthy and
  // therefore skipped that fallback entirely — two captains, one name.
  const auto=pendingAutoName();
  const chosen=(auto&&typedName===auto)?"":typedName;
  let mine=null;
  for(let i=0;i<r.numSeats;i++)if(seats[i]&&seats[i].id===appState.myId)mine=i;
  if(mine!=null){
    // NAME-01/C: a seat keyed to this pp_id OUTLIVES leaving the room — abandonRoom() calls
    // netLeaveRoom(), which only detaches watchers (src/net/index.js) and never releases the record.
    // So "back out, come back with a different name" used to reuse the stale record verbatim and
    // silently discard what was just typed. Measured: guest joins as ALPHA, backs out via the room
    // screen's "← back", rejoins typing BRAVO — both clients still showed ALPHA.
    //
    // Write the name on the way back in, but ONLY while the room is still in the lobby. A rejoin
    // into a voyage already under way must keep the seat's existing name: narration has already gone
    // out under it, and renaming mid-game would desync the roster against events guests have shown.
    if(r.status==="lobby"){
      // item 16 (D-19): the rejoin is a THIRD name-write path and gets the identical rule. It is
      // the one most likely to collide, too — it exists precisely so a captain can back out and
      // come back under a different name, which is exactly when they might pick one somebody else
      // has taken in the meantime.
      let outcome=null;
      await netClaimSeat(appState.db,code,s=>{
        outcome=null;                       // reset per updater run; Firebase may call this twice
        if(!s)return s;
        const cur=s[mine]||{};
        if(cur.id!==appState.myId)return s; // someone else holds it now — never stomp their seat
        outcome=applyNameClaim(s,mine,chosen,r.numSeats,appState.myId,false);
        if(outcome==="taken")return;        // undefined ABORTS — the seat keeps the name it had
        return s;
      });
      if(outcome==="taken"){setNameWarning("joinName",nameTakenMsg(typedName));return;}
    }
    // Item 31: the join screen's own name box is the naming step now (no modal), so persisting the
    // durable pp_lastName moves here — only a name they actually CHOSE, same rule confirmName kept.
    if(chosen)saveLastName(chosen);
    appState.room=code;appState.mySeat=mine;appState.isHost=(r.host===appState.myId);saveSession();watchRoom();return;
  }
  // @copy misc.mperror.alreadysailed
  if(r.status!=="lobby"){alert("⛵ That game has already set sail! Tell yer mateys and they may restart to come back for ye.");return;}
  let claimed=null,outcome=null;
  await netClaimSeat(appState.db,code,s=>{
    claimed=null;outcome=null;            // reset per updater run; Firebase may call this twice
    if(!s)return s;
    for(let i=0;i<r.numSeats;i++){const cur=s[i]||{};if(!cur.id){
      // #2: blank name → an unused default captain name computed against the live seat map, so a
      // late joiner never duplicates a name already in the room. item 16 (D-19) adds the other half:
      // a name they DID type is now checked too — refused if a human holds it, granted (and the bot
      // moved aside) if a bot does.
      outcome=applyNameClaim(s,i,chosen,r.numSeats,appState.myId,true);
      if(outcome==="taken")return;        // undefined ABORTS — no seat is claimed, nothing written
      claimed=i;return s;}}
    return s;
  });
  // Told where they typed it, not in a popup that blocks the page (T-02.2-23). The seat is NOT
  // claimed, the code and name they typed are still in their boxes, and changing the name and
  // pressing Join again is the whole recovery.
  if(outcome==="taken"){setNameWarning("joinName",nameTakenMsg(typedName));return;}
  // @copy misc.mperror.roomfull
  if(claimed==null){alert("Too many pirates already in that game.");return;}
  if(chosen)saveLastName(chosen);   // item 31: see the rejoin path above
  appState.room=code;appState.mySeat=claimed;appState.isHost=(r.host===appState.myId);saveSession();watchRoom();
}
// D-13: module-scope guard so a repeated watchRoom() call for the SAME room (a normal guest-join
// lifecycle invokes this more than once) does not re-attach netWatchSeats()/netWatchStatus() and
// trip src/net/registry.js's "duplicate attach refused" ERROR — see this file's own header note.
/* THE 30-SECOND GRACE (Wyatt, 2026-08-24, his design verbatim): "We should instead give the host
   30 seconds to reopen the site, and in that time, display a message to the guest saying 'yer
   matey has left the game... Let's give 'em 30 seconds to return before callin' off yer voyage'".
   His playtest found the old 4s window shorter than a real reload — the voyage was called off
   before he could get the site open again. 30_000 is HIS number, a design pick like a pacing
   constant, not a derived quantity. Polls every 2s so a returning host (resumeHostGame writes
   "playing" back on boot) ends the wait early; the wait line retires itself on the next narration
   once play resumes. ONE helper for both callers — the live status watcher and the boot-time
   re-entry — so the two waits can never drift apart (rule 23). `quiet` is the boot case: the
   stage is not built yet, so the boot loader stays the message. */
async function hostGoneGrace(quiet){
  if(!quiet){
    // @copy prompt.net.hostgrace — his copy, in-world register (the voice boundary)
    showNarration("⚓ Yer matey has left the game… let's give 'em 30 seconds to return before callin' off yer voyage.",{wait:true});
  }
  const T0=Date.now();
  let last=null;
  while(Date.now()-T0<30000){
    await new Promise(res=>setTimeout(res,2000));
    last=(await netReadRoom(appState.db,appState.room)).val();
    if(!last)return {gone:true,room:null};
    if(last.status!=="hostgone"){
      /* T-11 (Wyatt, 2026-08-26): "This message DID appear -- although the message never
         disappeared once the host had returned. It needs to disappear with an affirmative
         'Yargh! They're back!' which then disappears after the standard time for a message of
         that length."

         THE WAIT LINE HAS NO DEADLINE, and that is deliberate — {wait:true} means "nothing is
         happening yet", and item 19 removed the deadline from wait lines precisely so one cannot
         time out while the table is genuinely still waiting. The comment above claims it "retires
         itself on the next narration once play resumes"; that is true and it is not enough,
         because there may be no narration for a while after a host walks back in, and until then
         his screen still says they are gone.

         An ORDINARY narration is the answer: no `wait` flag, so it takes the standard hold for its
         length and fades on its own. It also replaces the wait line by being the next narration,
         which is the mechanism the old comment was relying on — this just guarantees one happens.
         @copy prompt.net.hostback — his words, verbatim. */
      if(!quiet)showNarration("⚓ Yargh! They're back!");
      return {gone:false,room:last};
    }
  }
  return {gone:!last||last.status==="hostgone",room:last};
}
let _watchRoomAttachedFor=null;
export async function watchRoom(){
  const r0=(await netReadRoom(appState.db,appState.room)).val();
  // @copy misc.mperror.gamegone
  if(!r0){alert(GAME_GONE_MSG);clearSession();showHome();return;}
  appState.numSeats=r0.numSeats;appState.isHost=(r0.host===appState.myId);
  // A GUEST rebooting into a room already marked "hostgone" (Wyatt's problem 5, the guest half):
  // the status watcher below only acts on hostgone once gameStarted is true, so a guest whose
  // refresh landed while the host was away used to sit under the boot loader forever. The same
  // 30-second grace the live watcher gives (hostGoneGrace above) — quiet, because the stage is
  // not built yet: the boot loader stays the message, and the resume escape hatch remains the
  // player's own way out of a wait they don't want.
  if(r0.status==="hostgone"&&!appState.isHost){
    const g=await hostGoneGrace(true);
    if(g.gone){hideBootLoader();hostLeftTheVoyage(g.room);return;}
  }
  if(r0.status==="lobby")showRoom();
  if(_watchRoomAttachedFor===appState.room)return; // already watching this room — see D-13 above
  _watchRoomAttachedFor=appState.room;
  netWatchSeats(appState.db,appState.room,snap=>{
    const seats=snap.val()||{};
    appState.roster=[];for(let i=0;i<appState.numSeats;i++)appState.roster[i]=seats[i]||{bot:true,strat:seatStrat(i)};
    if(!appState.gameStarted)renderSeatList(seats);
  });
  netWatchStatus(appState.db,appState.room,async snap=>{
    const st=snap.val();
    /* THE HOST LEFT. Only a guest acts on this — the host writing it about itself is not news, and
       the flag only means anything once a voyage is under way. GRACE PERIOD, not an instant verdict:
       a momentary drop fires the server-side onDisconnect too, and armHostGone() puts "playing" back
       the instant the host is connected again. Re-read before believing it, so a wifi hiccup never
       tells somebody their crewmate walked out. */
    if(st==="hostgone"&&!appState.isHost&&appState.gameStarted&&!appState.hostGoneShown){
      appState.hostGoneShown=true;
      // The 30-second grace (Wyatt's design, 2026-08-24 — see hostGoneGrace above): the guest
      // reads his message while the host gets a real chance to reopen the site.
      const g=await hostGoneGrace(false);
      // Pass the room through — hostLeftTheVoyage() names the departed captain from room.host
      // matched against the seat list. Verified 2026-08-20: calling it bare made the card read
      // "Yer matey has left the voyage" when it could have said the name.
      if(g.gone){hostLeftTheVoyage(g.room);return;}
      appState.hostGoneShown=false;                      // they sailed back in — play resumes and
      return;                                           // the next narration retires the wait line
    }
    if((st==="playing"||st==="ended")&&!appState.gameStarted){
      const r=(await netReadRoom(appState.db,appState.room)).val();
      appState.roster=[];for(let i=0;i<r.numSeats;i++)appState.roster[i]=(r.seats&&r.seats[i])||{bot:true,strat:seatStrat(i)};
      beginGame(r.cfg,r.seed);
    }
  });
}
/* THE VOYAGE IS OVER BECAUSE THE HOST LEFT — Wyatt, 2026-08-20: the guest "must see an error
   notification, ideally in pirate speak, saying that their matey left the voyage and it's over."

   PIRATE SPEAK IS CORRECT HERE and is not a style choice: this is a message from inside the game
   world to a captain at sea, which is exactly the side of CLAUDE.md's voice boundary that speaks
   this way. (The credits and About page are the other side, and stay in Wyatt's own voice.)

   NOT AN alert(). The existing "That game no longer exists." path uses one, and a blocking dialog
   is indistinguishable from a hung tab (docs/DRIVING-THE-GAME.md §8) — which is a poor way to tell
   somebody the game stopped. It is also plain English in a pirate game. This card is the shape that
   path should have had.

   Terminal by design: no way back into a voyage that has no host to compute it. One door, to port. */
function hostLeftTheVoyage(room){
  if(document.getElementById("ppHostGone"))return;                 // first one wins
  let who="Yer matey";
  try{
    const hostId=room&&room.host;
    const seats=(room&&room.seats)||appState.roster||[];
    for(let i=0;i<seats.length;i++){
      const s=seats[i];
      if(s&&s.id&&hostId&&s.id===hostId&&s.name){who=s.name;break;}
    }
  }catch(e){}                                                       // a name is a courtesy, never a blocker
  const esc=t=>String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const box=document.createElement("div");
  box.id="ppHostGone";
  box.setAttribute("role","alertdialog");
  box.setAttribute("aria-modal","true");
  box.style.cssText="position:fixed;inset:0;z-index:99998;display:flex;align-items:center;"+
    "justify-content:center;padding:22px;background:rgba(8,34,41,.72);backdrop-filter:blur(2px)";
  box.innerHTML=
    '<div style="background:#fffdf2;border:2px solid #2aa9b8;border-radius:16px;padding:22px 24px;'+
    'max-width:26rem;box-shadow:0 10px 40px rgba(0,0,0,.4);text-align:center;'+
    'font:16px/1.5 system-ui,sans-serif;color:#123">'+
      '<div style="font-size:34px;line-height:1;margin-bottom:10px">\u2693</div>'+
      '<h2 style="margin:0 0 10px;font-size:20px;color:#12707c">'+esc(who)+' has left the voyage</h2>'+
      '<p style="margin:0 0 18px">There be no hand on the wheel, so this ship sails no further. '+
      'Gather yer crew and set out afresh, captain.</p>'+
      '<button id="ppHostGoneBtn" style="font:600 16px system-ui,sans-serif;background:#2aa9b8;'+
      'color:#fff;border:0;border-radius:999px;padding:11px 26px;cursor:pointer">Back to port</button>'+
    '</div>';
  document.body.appendChild(box);
  const btn=document.getElementById("ppHostGoneBtn");
  btn.onclick=()=>{try{netLeaveRoom();}catch(e){} clearSession(); showHome(); box.remove();};
  btn.focus();
}

/* Arming is not once-and-done. Firebase re-sends an armed onDisconnect after a reconnect, but the
   value it already WROTE during the drop stays written — so a host whose wifi hiccups for a moment
   comes back to a room marked "hostgone" and a guest who has been told a lie. So on every transition
   back to connected the host re-asserts "playing" AND re-arms. Paired with the guest's grace period
   in watchRoom, a blip costs nobody anything. */
/* MY REGRESSION, AND IT BROKE HOSTING ENTIRELY. Wyatt, 2026-08-20: "no game can start properly,
   because trying to host a new game doesn't load with a button to hit start; and others who join
   with your code are not put into your voyage."

   netWatchConnected is scope:"session" (net/watchers.js:43) and netLeaveRoom() detaches only
   scope:"room" (net/registry.js:73). So the watcher below OUTLIVED the room it was armed for — for
   the rest of the page's life — and its handler read `appState.room`, meaning WHATEVER ROOM THIS
   BROWSER IS IN NOW. Finish a voyage, create a fresh room, and the orphan fired and stamped
   status:"playing" onto a brand-new LOBBY. A lobby already marked playing shows no Start button and
   never admits its joiners, which is exactly the pair of symptoms he reported. Worse, it stacked:
   every game hosted attached another one, none ever removed.

   THREE GUARDS, and each one alone would have prevented it:
     - the room is captured at ARM TIME and compared, so it can never act on a later room;
     - it re-asserts only while this browser is still the host of THAT room;
     - and only once the voyage is actually under way, so a lobby is never written to at all.
   Plus one attachment per room rather than one per call, so orphans cannot accumulate even if a
   future caller arms twice. */
let _hostGoneArmedFor = null;
export function armHostGone(){
  // liveDone: a finished voyage must never be re-marked — endVoyage cancels the onDisconnect on
  // purpose (its cancel-first note), and endReplay's onHostBack call would otherwise re-arm it
  // when a fully-ended game is resumed from the log.
  if(!appState.isHost||!appState.db||!appState.room||appState.replaying||appState.liveDone)return;
  const armedRoom = appState.room;                      // THIS room, not "the current room" later
  netMarkHostGoneOnDisconnect(appState.db,armedRoom);
  if(_hostGoneArmedFor===armedRoom)return;              // never stack a second watcher on one room
  _hostGoneArmedFor=armedRoom;
  // FOURTH GUARD, and the one that was missing: name this consumer. watchPresence() already holds
  // a .info/connected watcher from page boot, and until 2026-08-26 both used the wrapper's default
  // label — so this one, attaching second, produced an identical registry key and was REFUSED.
  // The whole repair above therefore never ran: a host whose connection blipped left the guest on
  // "yer matey has left the game…" with nothing to clear it. Found by the crew-phone sea trial as
  // a single console ERROR; proved by 4/scripts/net_connected_twin_test.js.
  netWatchConnected(appState.db,snap=>{
    if(snap.val()!==true)return;
    if(appState.room!==armedRoom||!appState.isHost||!appState.gameStarted||appState.liveDone)return;
    netUpdateRoom(appState.db,armedRoom,{status:"playing"},()=>{});
    netMarkHostGoneOnDisconnect(appState.db,armedRoom);
  },()=>{},"hostgone-reassert");
}
export async function startGame(){
  try{
    const r=(await netReadRoom(appState.db,appState.room)).val();
    // T-02-05: the room can be gone by the time this read resolves — the host abandoned it,
    // a probe's teardown removed it, or two clients raced — and reading numSeats/seats off null
    // would throw inside this awaited chain, the same silent-stall shape as the sparse-draft
    // crash above. watchRoom already handles exactly this condition twenty lines up; give
    // startGame the identical treatment against the identical condition, not a new invention.
    // @copy misc.mperror.startgamegone
    if(!r){alert(GAME_GONE_MSG);clearSession();showHome();return;}
    const strategies=[];
    for(let i=0;i<r.numSeats;i++){const s=(r.seats&&r.seats[i])||{};strategies.push(s.id?"human":(s.strat||"pirate"));}
    const cfg=roundCfg(strategies);
    const seed=Math.floor(Math.random()*1e9);
    pingStart(strategies.filter(s=>s==="human").length,"net");
    await netUpdateRoom(appState.db,appState.room,{status:"playing",cfg,seed,ev:null,prompt:null,response:null,narr:null,meta:null,
      recipes:null,dlog:null,flip:null,battle:null,draftPrompts:null,draftResponses:null,clock:null,turnOrder:null,chat:null});
    /* THE HOST'S HAND ON THE WHEEL — Wyatt, 2026-08-20: "when the host leaves, the guest isn't told
       anything; the game simply stalls." Armed the moment the voyage actually starts, because a
       lobby that loses its host is already covered (the room is deleted and watchRoom's existing
       recovery fires); it is the STARTED voyage that had nothing.
       Re-armed on every reconnect below, and CANCELLED at a normal finish — see endVoyage. */
    armHostGone();
  }catch(e){
    console.error("startGame failed",e);
    // @copy misc.mperror.serviceunreachable
    alert("Couldn't reach the multiplayer service — it may be at capacity right now. Try again in a moment.");
  }
}
export function beginGame(cfg,seed){
  if(appState.gameStarted)return;appState.gameStarted=true;
  showGameView();
  appState.game=new Game(cfg,seed,true);
  // Hand the engine the two plain numbers it needs to resume this device's captain mid-list (see
  // Game.nextSeaCreature). Set here rather than inside roundCfg because the cursor is a UI-tier
  // concern — the engine tier may not read localStorage (D-03) — and because roundCfg is also
  // rebuilt from scratch on a resume, where the base must come from the SAVE, not from storage.
  appState.game.seaSeat=appState.mySeat;
  appState.game.seaBase=(appState.soloMeta&&appState.soloMeta.seaBase)||0;
  appState.live=true;appState.liveDone=false;appState.evIdx=0;appState.evPushed=0;appState.appliedMeta=false;
  // fresh start resets the decision log; a reload-replay keeps the log loaded by resumeHostGame
  if(!appState.replaying){appState.dlog=[];appState.dlogIdx=0;appState.dlogN=0;}
  appState.turnOrder=null;
  appState.logLines=[];resetBoardLog(-2);$("log").innerHTML=""; // notes/edits 11-03: logRenderedTo now lives in src/ui/board.js
  $("chatLog").innerHTML="";clearChatBubbles();
  $("chatPanel").style.display=(appState.db&&appState.room)?"":"none"; // no chat in solo/pass-and-play — no one else to talk to
  drawBoard();buildPlayerRows();
  updateRecipeBanner();
  watchRecipes();
  /* THE ONE PLACE THE WHOLE VOYAGE IS ROOTED, and until 2026-08-14 the only thing here was a bare
     call. runLiveNet() is not awaited (it drives the game for the rest of the session), so a throw
     anywhere beneath it — any round, any turn, any prompt — became an unhandled rejection that
     stopped the game with an empty panel and, measured, NOTHING in the console. See
     voyageAground()'s note in util.js for why that is worse than a crash. */
  if(appState.isHost){runLiveNet().catch(e=>voyageAground(e,"runLiveNet"));}
  else{watchEvents();watchPrompt();watchNarr();watchFlip();watchDraftPrompt();watchClock();watchTurnOrder();watchRecoveryState();}
  /* EVERY CLIENT WATCHES THE BENCH NODE, THE HOST INCLUDED — watchChat's shape, one line below,
     and for the same reason (04-01 Task 3, MP-05). A bake-off bench is published by whoever is
     BAKING, and the baker may be a guest, so a host that only ever wrote to this node could never
     watch a rival's bake. watchBattle's own body keeps the battle scoreboard guest-only; it is the
     BAKE branch that both tiers reach.
     GUARDED ON `room`, which is what is null in solo and pass-and-play (DISPLAY-RULES Rule A's
     measured correction — `db` is a real handle in every mode). Without this a solo game would
     attach a listener to rooms/null/battle. */
  if(appState.db&&appState.room)watchBattle();
  watchChat(); // unlike narr/ev, every client (including the host) both sends and listens for chat
  watchTimer(); // #7: every client tracks the shared timer-off flag
  watchPause(); // CLOCK-02: every client tracks the shared whole-game pause flag
  // D-19 (phase 21): this used to be read ONLY inside the isHost&&db&&room branch below, which
  // never runs in solo or pass-and-play — so appState.timerOff silently kept its `false` default
  // there and a player who switched the timer off last game got it back on every new game. Read
  // unconditionally, in every mode, before that branch — guarded by !appState.replaying so a
  // reload-replay keeps whatever the live game already had, exactly like the dlog reset above.
  // P8 (Wyatt, 2026-08-01: "i turned the timer off, refreshed the page, and the timer was turned
  // on"). D-19 above fixed the fresh-game case; a RELOAD still lost it, because a solo/pass-and-play
  // reload resumes through replay, `appState.replaying` is true, and this read was skipped — so
  // appState.timerOff fell back to its `false` default in src/state/index.js.
  //
  // pp4_timerOff is a PER-DEVICE preference, not game state (see src/ui/util.js's note that it is
  // structurally excluded from the versioned-blob mechanism, and never cleared) — confirmed by
  // Wyatt 2026-08-01: "per-device in local storage". So on replay it should still be honoured.
  // FIX-01 (D-01): this key was pp_timerOff until 2026-08-19, un-namespaced and therefore SHARED
  // with the live game at the same origin — so this read, and the room push below, were reading and
  // broadcasting the other game's preference. The per-game key is the fix; the one-time removal of
  // the legacy key lives in cleanupLegacyTimerKey() in src/ui/stage.js.
  // The !replaying guard is kept ONLY for networked games, where the room's shared flag is the
  // authority and watchTimer() delivers it; overriding that from one device's localStorage mid-
  // replay is what the original guard was protecting against.
  if(!appState.replaying||!(appState.db&&appState.room)){
    try{appState.timerOff=localStorage.getItem("pp4_timerOff")==="1";}catch(e){}
  }
  // host seeds the shared flag from its own last choice so the preference carries across games
  // (but not on a reload-replay, which must keep whatever the live game already had)
  if(appState.isHost&&appState.db&&appState.room&&!appState.replaying){
    let off=false;try{off=localStorage.getItem("pp4_timerOff")==="1";}catch(e){}
    netSetTimerOff(appState.db,appState.room,off,netFail("timerOff"));
  }
}
// non-host clients don't compute turn order themselves (only the host's runLiveNet does) — read
// the host's synced copy instead, and reorder the captains panel once it arrives
export function watchTurnOrder(){
  netWatchTurnOrder(appState.db,appState.room,snap=>{
    const v=snap.val();
    if(v){appState.turnOrder=v;buildPlayerRows();}
  });
}
// FIX-03/T-02-04 (02-02): Firebase Realtime Database has no native array type — the SDK hands
// rooms/<C>/recipes back as a dense ARRAY, padded with null, only when the picked-seat/max-index
// ratio is high enough to look array-like; a lone early pick (the normal shape of a draft still in
// progress) reads back as a plain OBJECT with sparse integer-like keys instead (measured directly
// against the live database, 02-02-SUMMARY.md). The old `picks.forEach(...)` assumed the array
// shape unconditionally and threw `TypeError: picks.forEach is not a function` the instant a guest
// (every guest also runs this callback, per beginGame()'s unconditional watchRecipes() call)
// received the object form — killing the guest silently, with zero page errors
// (docs/HARD-WON-LESSONS.md §1b's exact shape). Object.entries() walks either shape identically,
// keyed by the seat index each pick actually names, so both the sparse mid-draft object and the
// fully-resolved dense array apply correctly. The `pk==null` guard also closes a second, quieter
// fault the array-only code carried: a null-padded gap would have driven `recipeChoices[null]`
// (=== undefined) onto a still-drafting seat's `.recipe` — this is the same fix, not new scope.
export function watchRecipes(){
  netWatchRecipes(appState.db,appState.room,snap=>{
    const picks=snap.val();
    if(!picks)return;
    Object.entries(picks).forEach(([key,pk])=>{
      if(pk==null)return; // not-yet-picked seat — either absent (object form) or null-padded (array form)
      const i=+key;
      if(appState.game.players[i]&&appState.game.players[i].recipeChoices)appState.game.players[i].recipe=appState.game.players[i].recipeChoices[pk];
    });
    updateRecipeBanner();
    if(appState.game.events.length)render();
  });
}
export function leaveGame(){netLeaveRoom();clearSession();clearSoloState();location.reload();}

/* ================= boot ================= */
// AUDIO-01: the one-shot AudioContext unlock. A document-level, capture-any-gesture listener is
// chosen over binding one specific button deliberately — it survives future welcome-screen
// changes and never has to know that #flipCoinWrap is not an .apBtn (docs/DRIVING-THE-GAME.md
// §4a). Fire-and-forget with a .catch() (T-21-04) — never awaited here, and never called from
// playFlip()/any per-play path: unlock is a once-per-page-session concern, not a per-play one.
function unlockAudioOnce(){
  initAudio().catch(()=>{});
  document.removeEventListener("pointerdown",unlockAudioOnce);
  document.removeEventListener("keydown",unlockAudioOnce);
}
export function wireLobby(){
  document.addEventListener("pointerdown",unlockAudioOnce,{once:true});
  document.addEventListener("keydown",unlockAudioOnce,{once:true});
  $("btnCreate").onclick=()=>{createRoom();};
  $("btnJoin").onclick=()=>{joinRoom();};
  $("btnStart").onclick=()=>{$("startConfirmModal").style.display="flex";};
  $("btnCancelStart").onclick=()=>{$("startConfirmModal").style.display="none";};
  $("btnConfirmStart").onclick=()=>{$("startConfirmModal").style.display="none";startGame();};
  wireRestoreFail();
  $("btnRoomBack").onclick=()=>{abandonRoom();}; // UI-05 follow-up: leave the lobby, tear the room down
  // NAME-02: same modal as every other name entry, so there is one place a captain is named. The
  // continuation writes the seat instead of starting a mode; dismissing it cancels and changes
  // nothing, which is what a ✕ should do here too.
  //
  // DELEGATED, not bound to the button: renderSeatList() rebuilds #seatList's innerHTML on every
  // seats update, so a handler attached to the button itself would be discarded the first time
  // anyone joined — and this button lives inside the reader's own seat row precisely so it is
  // rebuilt with it. Binding the container survives every re-render.
  $("seatList").onclick=e=>{
    if(e.target.closest("#btnChangeName"))openNameModal(name=>{renameMySeat(name);});
  };
  $("btnLeave").onclick=()=>{$("leaveConfirmModal").style.display="flex";};
  $("btnCancelLeave").onclick=()=>{$("leaveConfirmModal").style.display="none";};
  $("btnConfirmLeave").onclick=()=>{$("leaveConfirmModal").style.display="none";leaveGame();};
  // playtest 18 (Wyatt's pick): at a Pass & Play table, Play again is a REMATCH — same crew,
  // same seats, fresh voyage. The names ride localStorage across the reload that resets all
  // other state; boot() (src/main.js) consumes the stash and relaunches directly. Solo keeps
  // the plain leave-to-welcome behavior.
  $("btnPlayAgain").onclick=()=>{
    if(appState.passAndPlay&&appState.soloMeta&&appState.soloMeta.names)
      try{localStorage.setItem("pp_rematch",JSON.stringify(appState.soloMeta.names));}catch(e){}
    leaveGame();
  };
  $("scPause").onclick=togglePause;
  $("scTimerToggle").onclick=toggleTimer;
  $("btnMute").onclick=toggleMute;
  $("btnShowLog").onclick=()=>{$("logModal").style.display="flex";const box=$("log");box.scrollTop=box.scrollHeight;};
  $("btnShowHow").onclick=()=>{$("howToPlayModal").style.display="flex";};
  $("btnShowCredits").onclick=()=>{$("creditsModal").style.display="flex";};
  // KOFI-01: two doors onto one embedded panel — footer, and the Credits modal.
  $("btnKofi").onclick=openKofi;
  $("btnKofiCredits").onclick=()=>{$("creditsModal").style.display="none";openKofi();};
  $("btnShowFeedback").onclick=()=>{$("feedbackModal").style.display="flex";};
  // #2: in-game modals get a top-right ✕ and close on outside-click (the bottom "Close" buttons
  // were removed). Pre-game/blocking modals (lobby, pass-device, room, start/leave confirms) are
  // deliberately NOT dismissible this way — they gate the game and must be answered.
  ["howToPlayModal","creditsModal","logModal","feedbackModal","recipeModal","kofiModal"].forEach(id=>{
    const ov=$(id);if(!ov)return;
    const card=ov.querySelector(".modalCard");
    if(card&&!card.querySelector(".modalX")){
      card.style.position="relative";
      const x=document.createElement("button");
      x.className="modalX";x.type="button";x.innerHTML=iconImg(CLOSE_X_IMG);x.setAttribute("aria-label","Close");
      x.onclick=()=>{ov.style.display="none";};
      card.insertBefore(x,card.firstChild);
    }
    ov.addEventListener("click",e=>{if(e.target===ov)ov.style.display="none";});
  });
  $("btnSendFeedback").onclick=()=>{
    const text=($("feedbackText").value||"").trim();
    if(!text)return;
    // FIX-01: getLastName() (raw persisted read), NOT requireName() — a player who has never named
    // themself must keep writing name:null to this record. requireName() would substitute a
    // default captain name and silently change what gets attributed to Firebase.
    if(appState.db)netSetFeedback(appState.db,Date.now(),{text,room:appState.room||null,name:getLastName().trim()||null,t:Date.now()},e=>console.error("feedback write failed",e));
    $("feedbackText").value="";
    $("feedbackModal").style.display="none";
  };
  $("chatForm").addEventListener("submit",e=>{e.preventDefault();sendChat($("chatInput").value);$("chatInput").value="";});
}
// The host reloaded mid-game. Rebuild the crew, load the recorded decision log, then let
// beginGame → runLiveNet fast-forward the deterministic engine through the log (replaying=true).
// Rendering, delays, and broadcasts are suppressed until the log runs out (endReplay), at which
// point control returns to live play from the exact spot the reload interrupted — but only after
// endReplay validates that the rebuild actually got there. A replay that fell far short (a failed
// or empty log read) surfaces the restore-failed dialog instead of quietly handing back a board
// that has silently reset to turn 1.
export async function resumeHostGame(r){
  appState.numSeats=r.numSeats;
  appState.roster=[];for(let i=0;i<appState.numSeats;i++)appState.roster[i]=(r.seats&&r.seats[i])||{bot:true,strat:seatStrat(i)};
  if(!r.cfg){ // never actually started (reloaded on the "playing" flag before cfg was written)
    clearSession();showHome();return;
  }
  // The old connection's onDisconnect stamped "hostgone" when the tab dropped. Put "playing" back
  // FIRST — before the (potentially long) dlog read and replay — so a guest's 4s grace re-read in
  // watchRoom sees the truth and withdraws the "yer matey left" verdict instead of going terminal.
  // And re-arm the onDisconnect for THIS connection: the server-side write is one-shot, so a
  // resumed host who closed the tab a second time used to leave the crew with no notice at all.
  // (armHostGone()'s full kit — the reconnect re-assert watcher — is armed once the replay hands
  // back to live play, via endReplay's onHostBack; arming a watcher mid-replay is what its own
  // replaying guard exists to prevent.)
  if(r.status==="hostgone")netUpdateRoom(appState.db,appState.room,{status:"playing"},netFail("host back"));
  // Never on an "ended" room — endVoyage CANCELS the onDisconnect precisely so a finished game's
  // status can't be overwritten by the host reasonably closing the tab (see its cancel-first note).
  if(r.status!=="ended")netMarkHostGoneOnDisconnect(appState.db,appState.room);
  // notes/edits BUG-03: these two reads used to swallow their errors entirely (`catch(e){}`), which
  // conflated three very different outcomes — the read THREW, the read succeeded and returned
  // nothing, and the read succeeded with data. A thrown read then looked identical to a brand-new
  // game, so the engine rebuilt a fresh board from the seed and the player saw their whole voyage
  // reset. Record the failure and surface it through netFail (same helper every other failure site
  // in this file uses); replayShortfall treats a failed read as untrustworthy regardless of counts.
  appState.resumeReadFailed=false;
  let draw={};try{draw=(await netReadDlog(appState.db,appState.room)).val()||{};}catch(e){appState.resumeReadFailed=true;netFail("resume dlog")(e);}
  appState.dlog=Object.keys(draw).map(Number).sort((a,b)=>a-b).map(k=>decodeDec(draw[k]));
  appState.dlogIdx=0;appState.dlogN=0;
  let evval={};try{evval=(await netReadEv(appState.db,appState.room)).val()||{};}catch(e){appState.resumeReadFailed=true;netFail("resume events")(e);}
  appState.resumeEvLen=evval?Object.keys(evval).length:0;
  showGameView();
  // @copy prompt.net.reconnecting
  panel('<div class="apMsg">⚓ Reconnecting to yer voyage…</div>');
  appState.replaying=true;
  beginGame(r.cfg,r.seed);
}

/* THE RESUME ESCAPE HATCH — Wyatt, 2026-08-23 (problem 5): "give that screen an escape hatch so it
   can never strand him again." The hostgone routing above fixes the hang we measured; this is the
   guarantee for every stall we did NOT foresee. A watchdog armed at the start of either resume
   journey: if, after 15s, the player is still behind the boot loader or still mid-replay, a small
   card offers one honest door — abandon this voyage and sail home. Clicking it clears ONLY the blob
   being resumed (a stalled room resume must not eat a healthy solo save, and vice versa) and
   reloads, so the next boot has nothing to trip over.
   Raw DOM and no renderer calls, for voyageAground()'s reason: the thing that stalled may BE the
   render path, and a rescue that needs the broken machine is not a rescue. */
function armResumeEscapeHatch(kind){
  let stuckSecs=0,goodTicks=0;
  const iv=setInterval(()=>{
    const loader=document.getElementById("bootLoader");
    const loaderUp=!!(loader&&!loader.classList.contains("hidden"));
    const stuck=loaderUp||appState.replaying;
    const box=document.getElementById("ppResumeEscape");
    if(!stuck){
      // Stand down only after the resume has looked healthy for 3 straight ticks — the loader and
      // the replaying flag hand over to each other with sub-second gaps, and a watchdog that
      // disarms on one lucky tick is a watchdog that misses the stall it was armed for (proven by
      // this hatch's own red-proof, 2026-08-24: the first version stood down at t+1s and ignored a
      // loader that came back at t+2s).
      stuckSecs=0;
      if(++goodTicks>=3){clearInterval(iv);if(box)box.remove();}
      return;
    }
    goodTicks=0;
    stuckSecs++;
    if(stuckSecs<15||box)return;
    const b=document.createElement("div");
    b.id="ppResumeEscape";
    b.style.cssText="position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:10001;"+
      "background:#fffdf2;border:2px solid #2aa9b8;border-radius:16px;padding:14px 18px;max-width:22rem;"+
      "box-shadow:0 10px 40px rgba(0,0,0,.35);text-align:center;font:15px/1.45 system-ui,sans-serif;color:#123";
    b.innerHTML=
      '<div style="font-weight:700;color:#12707c;margin-bottom:6px">⚓ Still reconnectin’…</div>'+
      '<div style="margin-bottom:12px">If yer voyage won’t come back, ye can abandon ship and set out afresh.</div>'+
      '<button id="ppResumeEscapeBtn" style="font:600 15px system-ui,sans-serif;background:#2aa9b8;color:#fff;'+
      'border:0;border-radius:999px;padding:10px 24px;cursor:pointer">Back to port</button>';
    document.body.appendChild(b);
    document.getElementById("ppResumeEscapeBtn").onclick=()=>{
      try{if(kind==="room")clearSession();else clearSoloState();}catch(e){}
      location.reload();
    };
  },1000);
}

export function boot(){
  appState.myId=getMyId();
  pingVisit();
  // LOAD-03b — DECIDE THE DESTINATION BEFORE PAINTING ANYTHING.
  //
  // Wyatt's intent, 2026-08-02, stated as two journeys: "i need players who are visiting the site
  // without being in the middle of a game to load a beautiful homescreen fast. I need players who
  // are visiting the site in the middle of a game (eg. because of a refresh) to see their game and
  // not worry that it got interrupted."
  //
  // Both reads below are SYNCHRONOUS localStorage lookups, so "am I resuming?" is knowable before
  // a single pixel is committed. The async netReadRoom() further down only confirms the room still
  // EXISTS — it is not what decides the journey. That distinction is the whole fix.
  //
  // What this replaces: the boot loader used to hide on an art-download timer, and showHome() ran
  // UNCONDITIONALLY. So a first-timer waited behind the loader for ~7.7MB of board art the welcome
  // screen no longer even shows, and a mid-game refresher could watch the loader fade onto the
  // WELCOME SCREEN — art finishing before the async room read — with their voyage arriving a beat
  // later. That flash is the "did my game get lost?" moment, and it was reachable, not theoretical.
  let sess=null;try{sess=JSON.parse(localStorage.getItem("pp4_sess"));}catch(e){}
  // CLOCK-01: a blob with no v field (pre-refactor build) or a mismatched v (stale schema) is
  // treated as absent — cleared via the existing clearSession(), never partially trusted — so a
  // returning old-version player starts clean instead of stalling on an invalid resume attempt
  // (D-01/D-02). A current-version blob's v always matches and is never touched here.
  if(sess&&sess.v!==SESSION_SCHEMA_V){clearSession();sess=null;}
  // Mirror guard, solo side (same D-01/D-02 reasoning). Hoisted from the branch below so the
  // journey is decided up front; the schema guards themselves are unchanged.
  let solo=null;try{solo=JSON.parse(localStorage.getItem("pp4_solo"));}catch(e){}
  if(solo&&solo.v!==SOLO_SCHEMA_V){clearSoloState();solo=null;}
  const resumingRoom=!!(sess&&sess.room);
  // ...only when there is no multiplayer session to reconnect to, exactly as the old nesting had it.
  const resumingSolo=!resumingRoom&&!!(solo&&solo.seed!=null&&solo.strategies);
  const resuming=resumingRoom||resumingSolo;
  seedIdleGameState(); // holds up the "appState.game always exists" invariant; draws nothing
  wireWelcome();
  wireRecipeModal(); // wired unconditionally (not inside wireLobby) so it works in solo/offline play too
  // MUTE-01: unconditional, like the wiring above — BOTH journeys need it. A mid-game refresh goes
  // straight to showGameView() without passing the fresh-visit branch, and it is the journey most
  // likely to land on a phone. Idempotent: it installs one ResizeObserver and no more.
  watchMutePlacement();
  wireLobby(); // wired unconditionally, before any early-return resume path (solo or offline), so
  // footer/pause buttons are never left unwired — previously this ran after the Firebase-init
  // check below, which the solo-resume branch's early `return` skipped entirely, leaving every
  // footer button and the pause button dead for the rest of a resumed solo game
  //
  // Firebase is initialised BEFORE any early return below, and the two cards are gated on the
  // result immediately. Previously this whole block sat AFTER the solo-resume return, so a player
  // resuming an interrupted solo game got `appState.db === null` while showHome() (above) had
  // already put the welcome screen up with Host and Join still ENABLED. Clicking Host then reached
  // createRoom() with a null handle, and its catch fired the capacity line — "the server's got too
  // many pirates baking right now" — which was untrue, and is the very sentence a REAL capacity
  // failure uses (D-60 shares it deliberately), so the two were indistinguishable to a player and
  // in any bug report. It also blocks the renderer, because it is a native alert(), which is why it
  // presented as a frozen tab rather than a failed call.
  //
  // NOTE the ordering constraint this must not break, and which the old comment here recorded:
  // **an offline refresh mid-solo-game still has to resume.** So the failure branch no longer
  // returns on the spot — it marks the UI and falls through, and the `return` for "no Firebase and
  // nothing to resume" happens after the solo check instead. Moving fbInit() up is safe because
  // netInit() is total: it returns null for a missing config and swallows its own init throw
  // (src/net/index.js), so it can never break a boot that previously never called it.
  const fbOk=fbInit();
  if(!fbOk){
    // v2 always lands here — there is no Firebase SDK on the page at all. The elements these
    // lines marked up no longer exist, so each is guarded; the branch itself is kept because
    // ui_contract_check.js's BOOT-FBINIT-OFFLINE assertion forbids restructuring the path  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
    // between here and resumeSoloGame(), and because an offline refresh mid-solo-game still has
    // to resume through exactly this route.
    const hostCard=$("choiceHost");if(hostCard)hostCard.classList.add("disabled");
    const joinCard=$("choiceJoin");if(joinCard)joinCard.classList.add("disabled");
    const note=$("fbnote");if(note)note.style.display="";
  }

  // if/else rather than an early return, deliberately: ui_contract_check.js's BOOT-FBINIT-OFFLINE  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
  // assertion forbids ANY `return` between the !fbOk branch and resumeSoloGame(solo), because that
  // is how an offline refresh mid-solo-game once stopped resuming. The early return this replaced
  // sat on the not-resuming path and could not have caused that — but the assertion is a textual
  // proxy for a real invariant, and the right move is to satisfy it structurally rather than loosen
  // a gate that is doing its job.
  if(!resuming){
    // playtest 18: a Pass & Play REMATCH stashed by Play again (wireLobby's handler) relaunches
    // the same crew directly — no welcome screen, no re-typing names. Checked only when no real
    // resume exists (leaveGame cleared those first), so a mid-voyage refresh always outranks it.
    // No early return, structurally: BOOT-FBINIT-OFFLINE forbids returns on the path to
    // resumeSoloGame, so this is a sibling branch instead.
    let rematch=null;
    try{rematch=JSON.parse(localStorage.getItem("pp_rematch"));localStorage.removeItem("pp_rematch");}catch(e){}
    if(Array.isArray(rematch)&&rematch.length>=2&&rematch.length<=4&&rematch.every(n=>typeof n==="string"&&n.trim())){
      preloadAssets(); // same art the finished voyage just used — warm cache, not awaited
      startPassAndPlay(rematch);
    }else{
    // JOURNEY 1 — NOBODY'S GAME IS WAITING: paint the home screen NOW.
    // It needs the card's own CSS, the logo, and one 71KB backdrop still. The ~7.7MB of board art
    // belongs to a game this player has not started, so it is fetched WITHOUT being awaited and
    // lands while they read the byline and pick a mode. showHome() lifts the boot loader itself.
    showHome();
    syncBoardSizing();
    preloadAssets(); // deliberately not awaited — nothing on this screen is waiting for it
    }
  }else{
  // JOURNEY 2 — THIS PLAYER IS MID-VOYAGE: never show them the welcome screen. Seeing it is the
  // moment a refresh feels like a lost game, so the boot loader stays up and the next thing they
  // see is their own board. The loader is lifted by showGameView()/showRoom()/showHome(), whichever
  // the resume actually lands on, so it can never outlive the thing it is covering.
  //
  // The art IS awaited here, capped at 6s (offline, dead CDN, slow phone) — a hung loader would be
  // worse than the pop-in it prevents. This is the one journey where waiting is right: the board is
  // about to be drawn, and a voyage that reassembles island-by-island reads as damaged.
  // The loader's default reads "Hoisting the sails…", which is a NEW-game promise and the wrong
  // thing to tell someone whose voyage is already under way. This wording deliberately echoes the
  // approved reconnecting line resumeHostGame() panels a moment later (@copy prompt.net.reconnecting,
  // "⚓ Reconnecting to yer voyage…") so the two read as one continuous reassurance.
  //
  // No @copy id: the extractor scans call sites, not textContent assignments, so a marker here
  // binds to nothing and the audit gate rejects it. The loader's own default string is unregistered
  // for the same reason — boot-loader copy sits outside the audit by precedent, not by oversight.
  const bootMsg=document.querySelector("#bootLoader .bootMsg");
  if(bootMsg)bootMsg.textContent="Reconnecting to yer voyage…";
  armResumeEscapeHatch(resumingRoom?"room":"solo");   // problem 5: this screen can never strand again
  Promise.race([preloadAssets(),new Promise(r=>setTimeout(r,6000))]).then(()=>{
    // Solo first and BEFORE the Firebase gate — the ordering constraint the comment above records:
    // an offline refresh mid-solo-game still has to resume. resumingSolo is already false whenever
    // a multiplayer session exists, so this cannot steal a room reconnect.
    if(resumingSolo){resumeSoloGame(solo);return;}
    // A room to rejoin but no Firebase to rejoin it with: there is nothing to restore, so fall back
    // to the home screen rather than leaving them under a loader forever.
    if(!fbOk){showHome();return;}
    appState.room=sess.room;appState.mySeat=sess.mySeat;appState.isHost=!!sess.isHost;
    netReadRoom(appState.db,appState.room).then(snap=>{
      if(!snap.exists()){clearSession();showHome();return;}
      const r=snap.val();
      appState.isHost=(r.host===appState.myId);
      if(appState.isHost&&(r.status==="playing"||r.status==="ended"||r.status==="hostgone")){
        // The host's browser drives the game. On an accidental reload, replay the recorded
        // decision log to rebuild the exact game state and keep driving it — then check the
        // rebuild actually landed (see endReplay). If it came up short, the player is asked
        // what to do rather than handed a silently-reset board.
        //
        // "hostgone" IS a resumable status FOR THE HOST — Wyatt's problem 5, 2026-08-23, measured
        // in the two-window rig 2026-08-24. armHostGone()'s server-side onDisconnect writes
        // status:"hostgone" the moment the host's old connection drops — a tab close, but ALSO a
        // plain reload. This branch used to require "playing"/"ended", so the returning host fell
        // through to watchRoom(), whose every handler guards against exactly this state, and the
        // boot loader sat on "Reconnecting to yer voyage…" forever — with every further reload
        // re-entering the same dead end via pp4_sess. The very flag that tells guests their host
        // left was locking the host out. The host being back is the news: resume, and let
        // resumeHostGame() put "playing" back on the room.
        resumeHostGame(r);return;
      }
      watchRoom();
    }).catch(()=>{clearSession();showHome();});
  });
  }
}
