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
// logDecision, beginGame, and others — RESEARCH.md's own
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
  rulesFacts, // A-7: the one source of every number the How-to-Play page teaches
  subjectOf,  // Q-18: the ONE rule both seats run — never a decision one seat ships to the other
} from "./shared/index.js";
import { initAudio, playForEvent, playWinScreen, playBattleEngage, isMuted, setMuted } from "./ui/audio.js";
import {
  netSetFlip, netWatchFlip,
  netDeleteRoom,
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
  benchChoreoMs, BENCH_STUDY_MS, BENCH_BEAT_MS, // A-2: the choreography's own timings, answered by the file that runs them
  appendChatLine, showChatBubble,
  setFlipActive, setFlipCoin, flipSpinLeftMs, FLIP_LAND_HOLD_MS, boardCell, boardShipEls, drawBoard, render, resetBoardLog,
  seedIdleGameState, syncBoardSizing, watchMutePlacement, victoryConfetti, clearChatBubbles,
  showSeatCoins, // MP-06: the ONE purse renderer, shared with render() (04-01 Task 2)
  battleSnapshot, renderBattleFromSnap, battleFooter, coinHTML, pipsHTML,
  collectSideBets, settleSideBets, netIntroBarrier, showAhoyIntro, showTurnOrderIntro,
  reachable, pickCell, localAsk, humanTurn, botTurn, runStormLive, renderPickPrompt, renderAskPrompt, draftDispatch, wireRestoreFail,
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
  rawName, pn, pname, updateRecipeBanner, describe, seatLocal,
  decisionIsLocal, resolveOpt, setActor, applyActiveSeat, stepDelay, ask, pickNarrVariant,
  sleepMs, BOARD_LAST_LOOK_MS,
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
const sleep=ms=>appState.replaying?Promise.resolve():sleepMs(appState.ff?Math.min(ms||0,40):ms);   // the waitWhilePaused gate left with play/pause (A-10)

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

/* broadcastClock() stood here (the clock write), then togglePause()/watchPause() (the whole-table
   pause) — the clock left with the shot-clock removal, pause with Wyatt's A-10, both 2026-08-28. */
/* toggleTimer() stood here — the ⏱ off/on toggle, every mode. Left with the clock 2026-08-28. */
export function toggleMute(){
  setMuted(!isMuted());
  setClockUI();
}
/* expireShotClock() and watchClock() stood here — the 30s auto-skip (turnExpired, the forced
   default answer, the activePickCleanup teardown, the `shotclockskip` event and its narration)
   and the guest's mirror of the clock broadcast. Removed 2026-08-28 with the shot clock (see
   src/ui/util.js's ask()). Wyatt's rulings that shaped the penalty (2026-07-30: "you just lose
   your turn... get rid of that crate losing business altogether") are preserved in git history
   at this file and must ride back in WITH the clock. */

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
export function netNarrate(html,variants,opts){if(appState.replaying)return;
  /* READ THE SUBJECT BEFORE DRAWING, because showNarration CONSUMES it (`S.subject = null` on the
     way through). Reading it after would always send nothing, and the guest would keep sniffing —
     which is the fault this line exists to close (W4-2, CEO Review 20). */
  const {subj,evN}=readSubject();
  showNarration(pickNarrVariant({html,variants},appState.mySeat),opts,variants);
  sendNarr(html,variants,opts,subj,evN);}
/* THE SUBJECT AND THE SERIAL ARE ONE FACT, READ IN ONE PLACE, AND SPENT ONCE.
   BOTH HALVES WERE EARNED THE HARD WAY. `subj` must be read BEFORE showNarration, because
   showNarration CONSUMES it (`S.subjectSet = false`, src/ui/stage.js) — reading it after would
   always send nothing and the guest would keep sniffing (W4-2, CEO Review 20). And the SERIAL must
   name the event the subject was actually read from, not simply the newest event in the array:
   `events.length-1` went out with every line in the game, so a prompt or a dock line carried the
   serial of an event it had nothing to do with, and the guest anchored its bubble to whichever
   captain that unrelated event named (CEO Review 25). Only src/ui/panel.js's narrateLastEvent
   reads an event for its line, and it now says so by setting appState.narrEvIdx.
   -1 IS NOT A SERIAL EITHER, and sending it cost every crew game half a second: before the engine
   has produced anything `events.length-1` is -1, `-1 != null` so it was sent, and the guest's own
   frontier was still undefined so the guard held the recipe-draft line for the full grace period
   at the start of every voyage (CEO Review 24, reproduced before it was believed).
   SPENT ONCE, because the flag is one-shot. netBroadcast draws nothing locally, so nothing else
   would ever clear it — and a battle play-by-play line would then inherit whatever subject the
   previous event happened to decide. */
function readSubject(){
  const has=!!(window.__pp4&&window.__pp4.subjectSet);
  const subj=has?window.__pp4.subject:undefined;
  const raw=has?appState.narrEvIdx:null;
  const evN=(typeof raw==="number"&&raw>=0)?raw:null;
  appState.narrEvIdx=null;
  return {subj,evN};}
/* ONE PAYLOAD ASSEMBLY, because two writers to one Firebase slot that disagree about what they put
   in it is the same fault in miniature. netBroadcast used to send neither the subject nor the
   serial, which left the battle play-by-play — the place coins move MOST — outside both fixes. */
function sendNarr(html,variants,opts,subj,evN){
  if(!(appState.isHost&&appState.db&&appState.room))return;
  netSetNarr(appState.db,appState.room,html,netFail("narration"),variants,opts&&opts.wait,subj,evN);}
// broadcast narration to spectators WITHOUT touching this screen's panel — used during
// battles so the local scoreboard (coins) stays put while others still get the play-by-play
export function netBroadcast(html,variants,opts,pre){if(appState.replaying)return;
  /* `pre` IS THE DECISION CAPTURED BEFORE THE LOCAL DRAW SPENT IT (src/ui/panel.js's flash). On the
     stage path — every crew game — the bubble is drawn first and stageFlash clears the flag, so
     reading it here finds nothing: measured on the wire, 47 of 47 lines carried no subject. When a
     caller hands the decision over, it is used; when none does, the flag is read here as before. */
  const {subj,evN}=pre?{subj:pre.subj,evN:(typeof pre.evN==="number"&&pre.evN>=0)?pre.evN:null}:readSubject();
  if(window.__pp4)window.__pp4.subjectSet=false;   // nothing renders here, so nothing else spends it
  sendNarr(html,variants,opts,subj,evN);}

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

/* FORK 3, STEP A (W1, 2026-08-28) — THE PUBLISH LEAVES THE RENDERER. renderBattle used to write
   the wire from inside itself; watchBattle's host guard existed purely to stop the host reading
   its own write (the fork-3 map's ECHO LOOP landmine). This is benchPublish/applyBenchSnap's
   shape: LOCAL RENDER ALWAYS, then the write under its own Rule A guard. Every scoreboard moment
   in the host loop now goes through here; renderBattle stays reachable directly only for the
   GUEST's render path (renderBattleFromSnap via the handler table), which must never publish.
   Gate: scripts/qa/battle_publish_seam_check.mjs. */
export function battlePublish(o){
  renderBattle(o);
  // broadcast the read-only scoreboard (never buttons) so every connected client — not just
  // whoever's deciding — sees the same battle unfold in real time
  if(appState.isHost&&appState.db&&appState.room&&!appState.replaying)netSetBattle(appState.db,appState.room,battleSnapshot(o),netFail("battle"));
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
  /* `baker` rides the snapshot (A-2 sweep, closing a T-25 gap): the spec has carried the baker's
     name since T-25 ("one field, built once, read by baker and watcher alike"), but this assign
     dropped it — so every WATCHER titled the bench with bakeTitle's generic fallback while the
     baker's own screen said whose bake it was. Forwarding it is what makes a watched bench read
     "Crustbeard's Bake-Off". */
  const snap=Object.assign({seat,order:spec.order,before:spec.before,swaps:spec.swaps||[],
    locked:spec.locked||[],attempts:spec.attempts||0,baker:spec.baker||null,epoch:0},patch||{});
  // `||null`, not bare: RTDB rejects a set() carrying `undefined`, and a spec without a baker
  // (an older client's) must degrade to bakeTitle's fallback, not kill the whole publish.
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
                   locked:snap.locked||[],attempts:snap.attempts||0,baker:snap.baker},{watch:ctl})
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
      // once per battlePublish()), so without the read-then-assign order the clash would re-fire
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
        battlePublish(o);
        setNeedsAction(true);
        setFlipActive(()=>{setFlipActive(null);setNeedsAction(false);res(0);});
      }else{
        battlePublish(Object.assign({},o,{prompt:{msg,opts,colors}}));
        $("actionPanel").querySelectorAll(".btlBtn").forEach(b=>{
          b.onclick=()=>res(+b.dataset.i);
        });
      }
    });
  }else{
    battlePublish(Object.assign({},o,{waiting:pn(seat)}));
    idxP=remotePrompt(seat,{kind:"ask",msg,labels:opts.map(x=>x.label),
      colors:colors?colors.map(c=>c||""):null,classes:opts.map(()=>""),
      flip:isFlip,battle:battleSnapshot(o)});
  }
  // resolveOpt's opts.length-1 fallback is NOT clock residue — it is also the null-answer
  // fallback for a disconnected guest, and it stays (fork-3 map, landmine 4).
  return idxP.then(i=>{const r=resolveOpt(opts,i,opts.length-1);logDecision(r.i);return r.opt.value;});
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
   0 or 1, and exist so the shared battlePublish() scoreboard keeps working unchanged. */
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
    battlePublish(base(Object.assign({live:side,[key]:"spin"},extra)));
    await sleep(flipSpinLeftMs());
    const h=appState.game.flip(p);
    broadcastFlip(h?"H":"T");
    netBroadcast(`${pn(p.idx)} flips ${h?"⚪ HEADS!":"⚫ TAILS"}`);
    battlePublish(base(Object.assign({live:side,[key]:h?"H":"T"},extra)));
    // playtest 13 (Wyatt: "hold the finished coin heads/tails for longer — .8 seconds maybe").
    // T-34: the number is FLIP_LAND_HOLD_MS now, shared with the other flips (board.js).
    await sleep(FLIP_LAND_HOLD_MS);
    broadcastFlip("wait");
    return h;
  };
  const bFlip=async(side,p,extra)=>{
    extra=extra||{};
    const key=side==="a"?"atState":"dfState";
    battlePublish(base(Object.assign({live:side,[key]:"wait"},extra)));
    broadcastFlip("spin");
    battlePublish(base(Object.assign({live:side,[key]:"spin"},extra)));   // playtest 11: see hFlip
    await sleep(flipSpinLeftMs());
    const h=appState.game.flip(p);
    broadcastFlip(h?"H":"T");
    battlePublish(base(Object.assign({live:side,[key]:h?"H":"T"},extra)));   // land ON the face
    await sleep(FLIP_LAND_HOLD_MS);   // playtest 13 / T-34: the landed face holds, same as every other flip
    broadcastFlip("wait");
    return h;
  };
  // ---- THE round ----
  round=1;
  battlePublish(base({atState:"wait",dfState:"wait",live:"a",result:`${nm(att.idx)} loads the cannon…`}));
  await sleep(beat*0.5);
  const ah=hA?await hFlip("a",att,`⚔️ ${nm(att.idx)} (attacker) — fire!`,{dfState:"wait"}):await bFlip("a",att,{dfState:"wait"});
  battlePublish(base({atState:ah?"H":"T",dfState:"wait",live:"a"}));
  await sleep(beat*0.6);
  battlePublish(base({atState:ah?"H":"T",dfState:"wait",live:"d",
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
      rmsg=`<span class="score">Both fire ⚪ HEADS — but ${dwName}'s firing downwind and the shot hits!</span>`;
    // @copy misc.battleline.bothheadscrosswind
    }else rmsg=`<span class="cancel">Both fire ⚪ HEADS — but in the crosswind, the cannonballs collide.</span>`;
  }else if(ah||dh){
    scorer=ah?"a":"d";
    if(ah){a++;winner=att;}else{d++;winner=def;}
    const hitName=ah?nm(att.idx):nm(def.idx);
    // @copy misc.battleline.hitlands
    rmsg=`<span class="score">${hitName} lands a hit!</span>`;
  }
  // @copy misc.battleline.bothmiss
  else rmsg=`<span class="cancel">Both miss — ⚫ TAILS all round.</span>`;
  rounds.push([ah?1:0,dh?1:0,0,scorer]);
  battlePublish(base({atState:ah?"H":"T",dfState:dh?"H":"T",live:null,winCoin:scorer,result:rmsg}));
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
          battlePublish(base({atState:"H",dfState:dh?"H":"T",live:null,winCoin:"a",result:`<span class="score">The second broadside tells — ${nm(att.idx)} lands it!</span>`}));
        }else{
          // @copy misc.battleline.refiremisses
          battlePublish(base({atState:"T",dfState:dh?"H":"T",live:null,result:`<span class="cancel">The shot goes wide.</span>`}));
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
    // G4 (Wyatt-approved 2026-07-30): one short line — the prompt's job is to ask, not re-teach.
    // Not an extracted @copy site: the message reaches the dispatcher via a variable. D-29 (`yer`).
    const msgFor=p=>`${pn(p.idx)}, choose yer recipe:`;
    const optsFor=p=>[{label:recipeCardHTML(p.recipeChoices[0]),value:0,cls:"recipeCard"},
                       {label:recipeCardHTML(p.recipeChoices[1]),value:1,cls:"recipeCard"}];
    /* FORK 4 CONVERGED (W1, 2026-08-28): the pass-and-play/networked branch pair that stood here
       — with its 17b one-moment-one-sentence lesson, the solo third-person regression and its
       variants fix, and the draftWait argument a guest once never received — lives in
       draftDispatch (src/ui/flow.js) now, where fork 5 shares every line of it. The recipe draft
       is the PRIVATE case: recipe cards are secret, so a shared device walks every seat behind
       the pass gate, serially. The announce line and its variants ride in unchanged; decisions
       are logged below in seat-index order exactly as before, whichever mode ran, so a reload-
       replay reconstructs the identical stream. */
    const byIdx={};pending.forEach(p=>{byIdx[p.idx]=p;});
    // @copy misc.draftwait.recipechoosing
    const announce={html:pending.length>1?"⚓ Everyone's choosing their recipe…":`${pn(pending[0].idx)} is choosing a recipe…`,
      variants:pending.map(q=>({seat:q.idx,html:""}))};
    // @copy misc.draftwait.recipechosen
    // a wait line: it holds until the crew actually finishes, not for 2.5 seconds (item 19)
    const draftWait=pending.length>1?"⚓ Recipe chosen! Waiting for the rest of the crew…":null;
    const results=await draftDispatch({seats:pending.map(p=>p.idx),isPublic:false,
      msgFor:i=>msgFor(byIdx[i]),optsFor:i=>optsFor(byIdx[i]),waitMsg:draftWait,announce});
    for(const p of pending){picks[p.idx]=results[p.idx];logDecision(results[p.idx]);}
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
    if(p.done)continue;
    /* A-1: one phase — the attempt rides the captain's own turn slot, byte-for-byte the same
       order as the engine's playBakeoff (live and headless must consume identical randomness).
       endBakeDay still closes the day at the end, so same-day arrivals keep their fair race. */
    if(p.baking){await bakeTurnLive(p);continue;}
    await (p.strategy==="human"?humanTurn(p):botTurn(p));
    if(g.lightOvens(p)){liveRender();await narrateLastEvent();await bakeTurnLive(p);}
  }
  liveRender();
  return g.endBakeDay();
}
/* One captain's attempt. */
async function bakeTurnLive(p){
  const g=appState.game;
  /* SETUP FIRST, ALWAYS. The engine shuffles and computes the bot's guess in one call, in that
     fixed order, so the seeded stream is identical whether a human is about to play or not. Only
     then does the human path get to look at the bench. */
  const {setup,fallback}=g.bakeSetup(p);
  const human=p.strategy==="human";
  /* A-2 (Wyatt, 2026-08-28: "Yes. Build it. Bakeoff IS the game coming to life."): a bot's bake
     PLAYS on every screen now, where it used to resolve invisibly in one tick. `perform` is when
     any bench is worth drawing at all — never under replay (its sleeps no-op but the watcher's
     animations would run in real time), and for a bot never under fast-forward either (a human's
     bake ends the skip itself, via bakeoffPrompt's ffEndNow). When it is false the bot bakes
     silently, exactly as it always did. */
  const perform=!appState.replaying&&(human||!appState.ff);
  // bakeoffPrompt owns replay and the decision log (see its note in flow.js). It is called for a
  // human seat even under replay — that is the whole point, since it is what returns the guess the
  // player ACTUALLY made rather than re-deriving one from the bot. The bot's guess is the engine's
  // own fallback either way: the performance publishes a decision already made, it never makes one.
  let dec;
  if(human)dec=await bakeoffPrompt(p,setup,fallback);
  else{ if(perform)await botBakePerform(p,setup,fallback); dec={g:fallback,w:0}; }
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
  // A-2: the verdict reveals for EVERY performed bake, not only a human's — the crates a bot's
  // watchers just studied come off the same way, through the same one publish.
  if(perform)await benchReveal(p,out.res);
  liveRender();
  // narrateLastEvent() reads events[length-1], NOT appState.evIdx — so it narrates whichever event
  // bakeAttempt emitted last: the `finish` on a perfect bake, otherwise the `bake` verdict. Walking
  // evIdx to narrate both was a mistake; that field drives the scrubber, not this.
  await narrateLastEvent();
}
/* A-2 — THE BOT'S BAKE, PERFORMED (Wyatt, 2026-08-28: "Yes. Build it. Bakeoff IS the game coming
   to life.").

   T-23's trace was right and is now closed: the entire watcher pipeline already existed — a bot
   seat is never decisionIsLocal, so benchPublish -> applyBenchSnap -> benchWatch draws a bench on
   EVERY screen, the publisher's own included (that is what solo is). The one missing thing was a
   publisher, and this is it: the same discrete moments a human baker's onBench publishes, through
   the same benchPublish, so a bot's bake and a human's bake are one display path (rule 23).

   IT DECIDES NOTHING AND DRAWS NOTHING FROM THE SEEDED STREAM (BOT-DESIGN-PRINCIPLES; the race
   planner's determinism contract). bakeSetup already shuffled and already computed `fallback`
   before this runs; this function reads those and paces them out loud. Whether anyone watched can
   never change what the bot guessed.

   THE PACING IS THE CHOREOGRAPHY'S OWN (rule 9 — nothing is a constant): bakeoff.js answers how
   long its cover-and-swap animation takes (benchChoreoMs, from the same COVER/SWAP/SETTLE numbers
   the animation runs on), the study window is the game's original PREVIEW_MS, and picks land one
   per SETTLE_MS — the beat that file already defends as the line between trackable and blur. The
   added seconds on a bot's bake day are the point, not a cost: this is the game coming to life.

   THE TAP LIST IS THE ENGINE'S OWN DATA: fallback[k] is null exactly at steps already locked
   (botGuess's expansion), so "which crates does the bot tap, in what order" is read straight off
   the guess — no re-derivation that could disagree with what scoreAttempt will be handed. */
async function botBakePerform(p,setup,fallback){
  const spec={order:p.bake.order.slice(),
    before:(setup.before||p.bake.slots).slice(),
    swaps:(setup.swaps||[]).map(sw=>[sw[0],sw[1]]),
    locked:p.bake.locked.slice(),
    attempts:p.bake.attempts,
    baker:pn(p.idx)};
  benchPublish(spec,p.idx,{phase:"open"});      // the bench appears; the bot "studies"
  await sleep(BENCH_STUDY_MS);
  benchPublish(spec,p.idx,{phase:"shuffle"});   // Ready — every watcher's crates cover and swap
  await sleep(benchChoreoMs(spec));
  const picks=[];
  for(let k=0;k<spec.order.length;k++){
    if(fallback[k]==null)continue;              // a locked step is never tapped
    await sleep(BENCH_BEAT_MS);
    picks.push(fallback[k]);
    benchPublish(spec,p.idx,{phase:"pick",picks:picks.slice()});
  }
  await sleep(BENCH_BEAT_MS);                   // the last badge lands before the crates lift
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
  /* A STATE CHANGE IS NOT AN EVENT (found by the 2026-08-28 sea trial, both solo legs stuck on a
     silent board with the voyage over). Since A-13 the drain consumes each event exactly once, so
     the liveRender() above draws NOTHING here — the `end` event was consumed lines ago, while
     liveDone was still false, and board.js's showStats gate re-hid the stats on that render. The
     redraw for the FLAG has to be explicit, exactly as applyEndMeta (this function's guest twin)
     has always done: liveDone=true, playWinScreen(), render(). one_event_consumer_check §5 holds
     both twins to it. */
  render();
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
// small node rather than overloading prompt's payload shape. Host-only, guarded on isHost+db+room.
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
    /* Q-18 — THE SERIAL IS STAMPED ON THE WIRE COPY, NEVER ON THE ENGINE'S OWN EVENT. Adding a
       field inside Game.ev would change what the engine emits into the event stream, which
       invalidates the whole determinism corpus and forces a gated re-record (CLAUDE.md's Project
       section — NOT .planning/PROJECT.md, which an earlier version of this comment named). This is
       the deep copy that already exists for the broadcast, so the engine's array is untouched and
       `n` is simply what index this event went out as — appState.evPushed is already that number,
       monotonic and host-owned. flow.js's re-entry-guard note warns against stamping fields on the
       event OBJECT for exactly this reason; the copy is the safe place. */
    const wire=JSON.parse(JSON.stringify(appState.game.events[appState.evPushed]));
    wire.n=appState.evPushed;
    netPushEvent(appState.db,appState.room,wire,netFail("event feed"));
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
/* ═════════ THE ONE EVENT CONSUMER (W1, 2026-08-28) ═════════
   Wyatt: "fix all the described architecture so both host and guest listen to one game activity
   engine." This is the event channel's half of that sentence. Everything an event DRAWS —
   active seat, captain's log, rim sweep, render, pops, sound, end-meta — happens HERE and only
   here, whichever tier the event reaches this browser on:
     · a GUEST gets it from the Firebase listener (watchEvents below);
     · the HOST and solo/pass-and-play get it from the local drain (liveRender, src/ui/panel.js,
       through the onConsumeEvent handler seam) — Rule A: the host's own screen never round-trips
       through Firebase, so the host calls this locally and never reads its own write back.
   The comments that taught this body its steps were written in watchEvents and are preserved
   there; the ORDER is the guest's proven order and is gated (one_event_consumer_check.mjs):
   ANIMATE BEFORE render(), or the ship has already jumped to its destination.

   WHO COMPUTES IS STILL A BRANCH, AND THAT IS SANCTIONED: the state-sync block below runs on a
   guest only. It is Rule A's "who computes" fork — a guest mirrors the authoritative snapshot
   baked onto every event; the host IS the authority, and (measured risk, not style) writing a
   drained event's older snapshot back onto live engine objects mid-loop would corrupt the game.
   Nothing in the branch decides what is DRAWN.

   THE FEED-RATE DIVERGENCE IS CLOSED (A-13, Wyatt 2026-08-28: "host and guest parity is the #1
   goal"): the host's drain (liveRender) now hands this consumer EVERY unconsumed event in order,
   exactly as the guest's wire does — the shared evConsumed frontier is what makes double-draws
   and skips both impossible. */
export async function consumeEvent(e){
  if(!e)return;
  if(!appState.isHost){
    // the guest's mirror of the host-authoritative state — see watchEvents' preserved history
    // below for the day the ribbon said DAY 1 while the board played day 2 (2026-08-19).
    if(e.state)e.state.forEach((s,i)=>{
      const p=appState.game.players[i];if(!p||!s)return;
      p.pos=Array.isArray(s.pos)?[...s.pos]:p.pos;
      p.coins=s.coins;p.ing=Array.isArray(s.ing)?[...s.ing]:[];p.done=s.done;p.baking=!!s.baking;
    });
    if(e.round!=null)appState.game.round=e.round;
    if(e.wind!=null)appState.game.windNow=e.wind;
    if(e.storm!=null)appState.game.stormNow=e.storm;
    if(e.t==="newround"){appState.game.windNext=e.next;appState.game.stormNext=e.nextStorm;}
  }
  applyActiveSeat(e.p);
  syncLogLines();
  $("scrub").max=Math.max(0,appState.game.events.length-1);
  await animateRimSweepIfAny();   // idempotent (_lastSweptEvIdx) — a host call site that already awaited the ride makes this a no-op
  render();
  spawnPops(e,boardCell());
  playForEvent(e);                // AUDIO-01/D-07: the per-event sound moment, every tier, no isLocalTo gate
  if(e.t==="end")applyEndMeta();  // self-guarded: host/already-applied return immediately
}

// remote: feed the broadcast event stream into the ONE consumer
export function watchEvents(){
  netWatchEvents(appState.db,appState.room,async snap=>{
    // G14 (Wyatt-approved 2026-07-30): the guest half of the trade-wind sweep. THE PUSH AND THE
    // evIdx ASSIGNMENT HAPPEN FIRST, BEFORE ANY await — so a second event arriving mid-sweep cannot
    // reorder the feed. Everything after the await is presentation only.
    const e=fixEv(snap.val());
    appState.game.events.push(e);
    appState.evIdx=appState.game.events.length-1;
    appState.evConsumed=appState.game.events.length;   // A-13: the wire IS this tier's drain — keep the one frontier true
    /* Q-18: how far this seat's own feed has actually reached, in the host's numbering. A narration
       that names a later event must not be drawn yet — see watchNarr. Older hosts send no `n`, and
       then this stays null and the wait below never engages. */
    if(e&&e.n!=null)appState.evSeen=e.n;
    /* THE HISTORY THIS CALLBACK EARNED, preserved with it (2026-08-19, measured on a real driven
       guest): the guest's appState.game used to be a photograph taken the instant the voyage
       began — round stayed 0, windNow null, every pos at spawn — so the BOARD (drawn from
       events[evIdx].state) was right while the RIBBON, the WIND PILL and every CAMERA CUT (which
       read appState.game directly) were wrong. The fix was to stop the lie at the source: bake
       the state onto every event (Game.ev already did) and mirror it here — MUTATED IN PLACE,
       never reassigned, because renderBattleFromSnap holds player object references across a
       fight. That mirror now lives in consumeEvent's guest branch, where the host's drain shares
       every line AFTER it. `p` rides turn/sail/dock/pass/attack for applyActiveSeat (02.15-01
       Stage 2); the rim sweep's known, accepted degradation stands: the guest's coin panels lag
       by the sweep's duration, an event arriving mid-sweep snaps the ship true on the next paint. */
    await consumeEvent(e);
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
      /* FORK 2 CONVERGED (W1, 2026-08-28). Everything that stood here — the guest's own flip
         branch (whose early return meant a guest NEVER saw the other options on a flip-bearing
         prompt), its own back-button build, its own panel() markup, its own slider build and its
         own click wiring — is gone. The ONE renderer draws this seat's prompt from the wire
         payload, and the ONLY thing this tier keeps is its response mechanism: sendResponse puts
         the answer on the wire where localAsk resolves a promise. keepPanel=true because the
         renderer's own done() already tore the panel down — sendResponse's clear is for callers
         that render nothing.
         BEHAVIOUR CHANGE, NAMED (the map said this needs Wyatt; convergence IS the call rule 23
         makes, and it is flagged on the checklist): a guest's flip-bearing prompt now renders
         exactly what the host's does — the coin AND the full option row — instead of an early
         return that hid the options; and a PURE flip shows the ceremony title/stakes (flipMsg,
         fixed 2d19a15e) instead of a floating narration bubble the host never drew.
         "" from the wire normalizes to null inside the rebuild (seat 0 is a real captain — the
         !=null tests stay). */
      const flipIdx=(p.flipIdx!=null&&p.flipIdx>=0)?p.flipIdx:(p.flip?0:-1);
      const backIdx=(p.back!=null&&p.back>=0)?p.back:-1;
      const cols=p.colors||[],cls=p.classes||[],labels=p.labels||[],dis=p.disabled||[],why=p.why||[],seats=p.seats||[],shorts=p.shorts||[];
      const opts=labels.map((l,i)=>({label:l,cls:cls[i]||"",disabled:!!dis[i],why:why[i]||"",
        seat:(seats[i]===""||seats[i]==null)?null:seats[i],
        short:(shorts[i]===""||shorts[i]==null)?null:shorts[i],
        flip:i===flipIdx,back:i===backIdx,stage:!!p.stage}));
      // belt: a flip prompt whose labels never crossed the wire still arms the coin
      if(flipIdx>=0&&!opts.length)opts.push({label:"",flip:true,stage:!!p.stage});
      const sl=p.slider?Object.assign({},p.slider,{ref:{value:p.slider.start}}):null;
      renderAskPrompt({msg:p.msg,opts,colors:p.colors||null,sub:p.sub||null,slider:sl,battle:false},
        v=>sendResponse(p.id,v,true));
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
/* Q-18's two clocks. A GRACE PERIOD, not a deadline: the guest is waiting for a message already in
   flight over the same connection that just delivered the sentence, so the gap it covers is one
   round trip, not a retry budget. Long enough to absorb an ordinary reorder, short enough that a
   line drawn anyway is not perceived as a pause — and if the event never comes at all, the story
   carries on exactly as it does today. */
const NARR_EVENT_GRACE_MS=450, NARR_EVENT_POLL_MS=30;
export function watchNarr(){
  netWatchNarr(appState.db,appState.room,s=>{const v=s.val();
    // while a battle scoreboard is showing here (as spectator or active combatant), keep it up —
    // the per-flip "X flips HEADS" broadcasts are already reflected in the scoreboard coins, and
    // letting them overwrite the panel made the battle box flicker away between flips (#9)
    if(v&&!appState.spectatingBattle&&!appState.inBattlePrompt)
      {
        /* THE HOST'S DECISION WINS OVER THE SNIFF. -1 means "the host deliberately gave this line no
           subject" (a fight, a table-wide report) and must NOT fall through to the colour sniff,
           which would anchor it to whichever single captain the sentence happens to name. A payload
           with no `subj` at all is an older host, and keeps the old sniff behaviour. */
        /* Q-18, WYATT'S RULING IN ITS ACTUAL SHAPE (2026-08-29): "the guest prefers the real event
           and falls back to today's picture when it's absent." The guest ALREADY HOLDS the whole
           event — watchEvents pushes it onto this seat's own array — so preferring it costs zero
           extra bytes on the wire, and the first cut of this fix stopped one line short of taking
           it (CEO Review 24). Both seats now run the SAME `subjectOf` out of src/shared/index.js
           over the SAME event, which is the only honest answer to "what makes these two agree?".
           THE FALLBACK IS TODAY'S PICTURE, EXACTLY: no event in hand (an older host, a dropped
           write, a line with no event at all) and the host's own `subj` decision is used, -1 still
           meaning "deliberately no subject" and must not fall through to the colour sniff. */
        const evAt=n=>{
          if(n==null||!appState.game||!appState.game.events)return null;
          const arr=appState.game.events;
          /* the guest's array is filled in arrival order, so index === serial in the ordinary case;
             the scan is the honest fallback rather than an assumption about Firebase ordering. */
          if(arr[n]&&arr[n].n===n)return arr[n];
          for(let i=arr.length-1;i>=0;i--)if(arr[i]&&arr[i].n===n)return arr[i];
          return null;};
        const applySubject=()=>{
          if(!window.__pp4)return;
          const ev=evAt(v.evN);
          if(ev){window.__pp4.subject=subjectOf(ev);window.__pp4.subjectSet=true;window.__pp4.evType=ev.t;return;}
          if(v.subj!=null){window.__pp4.subject=(v.subj===-1?null:v.subj);window.__pp4.subjectSet=true;}};
        /* ONE SLOT, ONE LIVE LINE. `narr` is written with .set(), so only the newest sentence is
           real — but each arriving line now runs its own timer, and a held line firing after a
           newer one had already drawn would repaint the OLDER sentence over it (CEO Review 24: an
           ordering fix that could invert two lines). The generation counter is the whole guard:
           a tick that is no longer the current line simply drops. */
        appState.narrGen=(appState.narrGen||0)+1;
        const myGen=appState.narrGen;
        /* Q-18 — DO NOT DRAW A LINE AHEAD OF ITS OWN EVENT. The sentence and the event that caused
           it arrive on two independent listeners, so this seat can be handed "test2 trades 1 to ye
           for Fresh Milk" before the trade itself has landed — and the captains box then shows the
           pre-trade purse under the post-trade sentence. Measured in a real two-browser game: twice
           in twelve minutes, and twice the mirror image.
           BOUNDED, AND THAT BOUND IS THE WHOLE SAFETY OF IT. A wait that could last forever would
           turn a dropped write into a stalled story, which is far worse than a one-coin flicker. It
           gives the feed a short grace period and then draws regardless — so the worst case is
           exactly today's behaviour, and the common case is in step. An older host sends no evN and
           this never engages at all. */
        const drawIt=()=>{applySubject();return Promise.resolve(flash(v.html,undefined,undefined,v.variants,v.wait?{wait:true}:undefined)).catch(()=>{});};
        if(v.evN!=null&&v.evN>=0&&(appState.evSeen==null||appState.evSeen<v.evN)){
          const until=Date.now()+NARR_EVENT_GRACE_MS;
          const tick=()=>{
            if(appState.narrGen!==myGen)return;                       // a newer line owns the slot
            if((appState.evSeen!=null&&appState.evSeen>=v.evN)||Date.now()>=until){drawIt();return;}
            setTimeout(tick,NARR_EVENT_POLL_MS);
          };
          tick();
        } else drawIt();
      }});
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
  appState.live=true;appState.liveDone=false;appState.evIdx=0;appState.evPushed=0;appState.evConsumed=0;appState.evSeen=null;appState.narrGen=0;appState.narrEvIdx=null;appState.appliedMeta=false;
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
  else{watchEvents();watchPrompt();watchNarr();watchFlip();watchDraftPrompt();watchTurnOrder();watchRecoveryState();}
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
  /* The pp4_timerOff read and the host's room-seed of the shared timer flag stood here
     (D-19/P8/FIX-01 — the per-device preference and its cross-game carry). Left with the shot
     clock 2026-08-28; the localStorage key is untouched on players' devices, so their preference
     survives to be honoured when the clock returns. cleanupLegacyTimerKey() in src/ui/stage.js
     still removes the LEGACY pp_ key exactly once — that hygiene is about the classic game's
     namespace, not the clock. */
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
  $("btnMute").onclick=toggleMute;
  $("btnShowLog").onclick=()=>{$("logModal").style.display="flex";const box=$("log");box.scrollTop=box.scrollHeight;};
  /* A-7 — THE RULES PAGE DERIVES ITS NUMBERS (Wyatt, 2026-08-28: the rules page must update
     "according to the latest rules" automatically). Every amount in the How-to-Play modal is an
     empty <b data-rule="key"> span; this fills them from rulesFacts(cfg) — the LIVE game's cfg
     when a voyage is running (a 2-player table's crate prices are genuinely different), else the
     4-seat default. Filled once here so the modal is never blank, and again on every open so a
     modal read mid-voyage tells the truth about THIS voyage. rules_page_check.mjs reads the same
     rulesFacts, which is what keeps this filler and the gate from drifting apart. */
  const fillRulesFacts=()=>{
    const facts=rulesFacts((appState.game&&appState.game.cfg&&appState.game.cfg.recipeSize)
      ?appState.game.cfg:roundCfg(["human","bot","bot","bot"]));
    document.querySelectorAll("#howToPlayModal [data-rule]").forEach(el=>{
      const v=facts[el.dataset.rule];
      el.textContent=v===undefined?"?":String(v);
    });
  };
  fillRulesFacts();
  $("btnShowHow").onclick=()=>{fillRulesFacts();$("howToPlayModal").style.display="flex";};
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
