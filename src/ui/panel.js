// src/ui/panel.js
//
// Phase 11 (SPLIT-03/06), wave 11-04. The panel/clock/narration/chat/modal render cluster —
// setClockUI, panel, resizePanel, typewriterReveal, narrateLastEvent, appendChatLine,
// showChatBubble, showNarration, setNeedsAction, flash, liveRender. Extends 11-01/02/03's
// proven "move verbatim + rewire bare reads into imports + bridge grows + gates green" pattern.
//
// This file ALSO stands up src/ui/handlers.js — the injected-handler seam (D-07, criterion 1's
// directional boundary) — and is the first consumer of it. flash() used to call netNarrate(...)
// directly and liveRender() used to call pushEvents() directly; both are net-adjacent
// orchestration calls, which src/ui/ must never reach by importing src/net/. Instead each now
// calls through the injected handler (netHandlers().onBroadcast / .onEvents), registered by
// src/main.js's composition root. See RESEARCH.md Q1b for the full 6-edge seam table — these are
// the first 2 of 6 resolved; the remaining 4 land in 11-05/11-06.
//
// Purity bar for src/ui/: reads DOM and game state, NEVER imports src/net/ (D-07).
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.
//
// Deviation ($ duplicate, mirrors 11-01/11-03's precedent): `$` is a classic-script-local
// `const $=id=>document.getElementById(id)` (index.html:863), used ~120+ times across the still-
// classic region far beyond this cluster's own consumers — reproduced verbatim as a private
// module-local helper instead of "moved".
//
// Deviation (sleep duplicate, same class of gap, new instance this wave): `sleep` is ALSO a
// classic-script-local `const` (index.html:947), not a `function` declaration, so it never
// becomes a `window` property and cannot resolve as a bare read once flash() moves into a
// module. It is used well beyond this cluster (humanFlip/fishCast/asyncBattle and others, none
// of which move this wave), so — unlike an exclusive-to-this-cluster const (cf. 11-01's
// RECIPE_BOOK / 11-02's EVENT_NARRATION / 11-03's chatBubbles) — it cannot simply move here too.
// Reproduced verbatim as a private module-local const, wired to the already-moved
// `waitWhilePaused` import (./util.js) exactly like the classic original wires to its own bare
// `waitWhilePaused` call.

import { appState } from "../state/index.js";
import {
  PLAY_IMG, PAUSE_IMG, PAUSE_SYMBOL_IMG, BLOCKED_SLASH_IMG, STOPWATCH_IMG, SOUND_ON_IMG, SOUND_OFF_IMG, COIN_IMG, HEXCOL, iconImg, emojify,
} from "../shared/index.js";
import {
  render, boardCell, boardShipEls, chatBubbles, positionChatBubble, removeChatBubble,
} from "./board.js";
import {
  soloBotGame, currentTurnSeat, syncLogLines, spawnPops, pn, boatXY, msgHoldMs, chatBubbleHoldMs,
  waitWhilePaused, describeFor, narrationVariants, NEUTRAL_VIEWER, armClock,
} from "./util.js";
import { escHtml } from "./recipe.js";
import { netHandlers } from "./handlers.js";
import { playForEvent, isMuted } from "./audio.js";

const $=id=>document.getElementById(id);
const sleep=ms=>appState.replaying?Promise.resolve():waitWhilePaused().then(()=>new Promise(r=>setTimeout(r,ms)));

export function setClockUI(){
  const wrap=$("shotClockPanel");if(!wrap)return;
  // AUDIO-02/D-15/D-16 (phase 21): #btnMute is a #controlsRow sibling (index.html), not a third
  // corner icon on the clock face — rendered here, above the end-of-voyage early return below,
  // so the same tick that hides #shotClockPanel at the win screen also hides #btnMute (D-16),
  // one code path, no second branch. Its click is bound exactly once in wireLobby()
  // (src/orchestrator.js) — this block only ever writes display/innerHTML/title, exactly like
  // the #scTimerToggle block below, and must never touch that binding (CLOCK-03 discipline:
  // setClockUI() re-runs on the 500ms interval).
  const muteEl=$("btnMute");
  if(muteEl){
    muteEl.style.display=appState.liveDone?"none":"";
    // D-14: Wyatt's megaphone pair replaces 21-04's 🔊/🔇 emoji scaffold. #btnMute img in
    // index.html sizes these to 60% of the button (~29px), overriding .narrIcon's inline 18px —
    // id+element beats class, so no extra rule is needed.
    muteEl.innerHTML=isMuted()?iconImg(SOUND_OFF_IMG):iconImg(SOUND_ON_IMG);
    // Tooltip copy recorded in .planning/todos/pending/copy-shipped-vs-approved-gate.md — no
    // @copy marker (a new misc.sound.* id would need registering in art-review's node-group
    // table, out of scope for this phase; see that file's phase-21 entry for the follow-up).
    muteEl.title=isMuted()?"Turn the sound back on":"Mute the sound";
  }
  wrap.classList.remove("warming"); // UI-02: only the active countdown branch below re-adds it
  if(appState.liveDone){
    wrap.classList.remove("idle","urgent","paused");
    wrap.style.display="none";
    $("btnPlayAgain").style.display="";
    return;
  }
  wrap.style.display="";
  $("btnPlayAgain").style.display="none";
  const state=appState.isHost?(appState.shotClockSeat==null?null:{seat:appState.shotClockSeat,deadline:appState.shotClockDeadline,paused:appState.shotClockPaused,pauseElapsed:appState.shotClockPauseElapsed}):appState.clockState;
  // CLOCK-02 FIX (mp-pause-clock-desync): on a GUEST the frozen<->running decision AND the frozen
  // remaining it renders must both flip from the SAME authoritative clock broadcast. Driving the
  // paused branch off appState.shotClockPaused alone (set by watchPause on the /paused flag) let
  // the flag land a network round-trip BEFORE the fresh deadline (watchClock) and flash a stale
  // countdown — the "guest races to 0 on resume". Prefer the broadcast's own paused bit; fall back
  // to the mirrored flag only until the first clock write arrives. The host owns the clock, so its
  // inline state.paused IS its live flag — no behavior change for host or solo.
  const paused=(state&&typeof state.paused==="boolean")?state.paused:appState.shotClockPaused;
  const labelEl=$("scLabel"),numEl=$("shotClockNum"),unitEl=$("scUnit"),subEl=$("shotClockSub"),pauseEl=$("scPause");
  // CLOCK-03: defensive reset, once per tick, BEFORE any branch below. setClockUI() re-runs on
  // the 500ms interval, so a click-to-resume handler set in a prior PAUSED tick must never
  // survive into a later non-paused tick (RESEARCH Anti-Pattern 4) — only the two paused
  // branches below re-arm it. The .tappable affordance class is reset here for the same reason.
  numEl.onclick=null;numEl.style.cursor="";numEl.classList.remove("tappable");
  // CLOCK-02/D-09: de-gated from appState.isHost&&soloBotGame() — the ▶/⏸ pause is now shown to
  // every player in both solo and multiplayer (a guest's click reaches togglePause() via
  // src/orchestrator.js's wireLobby rewire, which routes through the networked pause path).
  pauseEl.style.display=(!appState.liveDone)?"":"none";
  $("scPauseImg").src=paused?PLAY_IMG:PAUSE_IMG;
  // #7 / D-20 (phase 21): the timer off/on toggle is offered to EVERY player in EVERY mode —
  // the soloBotGame() gate that used to hide it in solo/pass-and-play is gone. It used to be a
  // dead control there (toggleTimer() early-returned with no Firebase connection); Task 2 gave
  // every mode a working code path behind it, so there is no longer a reason to hide it anywhere
  // but end of voyage. Its icon reflects the current state.
  const toggleEl=$("scTimerToggle");
  if(toggleEl){
    toggleEl.style.display=appState.liveDone?"none":"";
    toggleEl.innerHTML=appState.timerOff?iconImg(BLOCKED_SLASH_IMG):iconImg(STOPWATCH_IMG);
    // @copy misc.timer.toggletooltip
    toggleEl.title=appState.timerOff?"Turn the timer back on":"Turn the timer off";
  }
  if(appState.timerOff){
    // synced to all clients — everyone sees the clock is disabled
    wrap.classList.add("idle");wrap.classList.remove("urgent","paused");
    labelEl.textContent="timer off";numEl.textContent="∞";unitEl.textContent="";
    subEl.innerHTML=`no rush — tap ${iconImg(STOPWATCH_IMG)}`;
    return;
  }
  if(!state){
    if(paused){
      wrap.classList.remove("idle","urgent");wrap.classList.add("paused");
      labelEl.textContent="paused";numEl.innerHTML=iconImg(PAUSE_SYMBOL_IMG);unitEl.textContent="";subEl.innerHTML=`tap ${iconImg(PLAY_IMG)} to resume`;
      // CLOCK-03: the big paused symbol is an ADDED resume affordance alongside #scPause — same
      // togglePause seam, routed via netHandlers() since panel.js (ui-tier) may never import
      // src/orchestrator.js (main-tier) directly.
      numEl.style.cursor="pointer";numEl.onclick=()=>netHandlers().onTogglePause();
      return;
    }
    // D-02 (18-05) UI obligation: a decision's own reveal is gating the button row right now
    // (clockPendingSeat, set by panel() the instant it gates a real button row — see the D-02
    // comment there), so there is genuinely no live clock state yet — the arm itself is what's
    // deferred. Show a frozen full-window value instead of falling through to the idle "–" below,
    // so a player never sees a blank or ticking clock during the 0-2.8s reveal. Derived from the
    // SAME elapsed=0 expression the active/waiting branch further down uses, rather than a literal
    // duplicate, so a future change to the 20/30 split can't desync the two.
    if(appState.clockPendingSeat!=null){
      const elapsed=0,urgent=elapsed>=20;
      const num=urgent?30-elapsed:20-elapsed;
      const activeViewer=appState.clockPendingSeat===appState.mySeat;
      wrap.classList.remove("urgent","paused");
      wrap.classList.toggle("idle",!activeViewer);
      labelEl.textContent=activeViewer?"play in":"waiting";
      numEl.textContent=num;
      unitEl.textContent="seconds";
      subEl.innerHTML=activeViewer?`or pay 1${iconImg(COIN_IMG)}`:`or gain 1${iconImg(COIN_IMG)}`;
      return;
    }
    // notes/edits #5a: a bot's turn in solo mode never arms the shot clock, so `state` stays
    // null the whole time it's playing — that used to fall through to the idle "turn clock"
    // label even while a bot is actively moving. Show the same "waiting" copy multiplayer
    // spectators see for a non-active seat instead, so it reads as "something's happening", not idle.
    const activeSeat=currentTurnSeat();
    const botPlaying=activeSeat!=null&&activeSeat!==appState.mySeat&&!(appState.game.players[activeSeat]&&appState.game.players[activeSeat].done);
    wrap.classList.add("idle");wrap.classList.remove("urgent","paused");
    labelEl.textContent=botPlaying?"waiting":"turn clock";numEl.textContent="–";unitEl.textContent="";subEl.innerHTML="&nbsp;";
    return;
  }
  wrap.classList.remove("idle");
  if(paused){
    // CLOCK-02 FIX (mp-pause-clock-desync): the frozen remaining comes from the host's
    // pauseElapsed carried in the clock broadcast (state.pauseElapsed) so host and guest show the
    // IDENTICAL number — a guest never owns appState.shotClockPauseElapsed (it stays 0), which is
    // why it used to freeze at 20s while the host showed 13s. Fall back to the live deadline only
    // for the brief pre-broadcast window on a guest (self-corrects on the next clock write).
    const peMs=(state.pauseElapsed!=null)?state.pauseElapsed:Math.max(0,30000-(state.deadline-Date.now()));
    const elapsed=peMs/1000;
    const urgent=elapsed>=20;
    wrap.classList.remove("urgent");wrap.classList.add("paused");
    labelEl.textContent="paused";
    numEl.textContent=Math.ceil(urgent?30-elapsed:20-elapsed);
    unitEl.textContent="seconds";
    subEl.innerHTML=`tap ${iconImg(PLAY_IMG)} to resume`;
    // CLOCK-03: same togglePause resume seam as the other paused branch above. UX (this phase):
    // the frozen NUMBER didn't read as clickable (unlike the ⏸-symbol branch), so .tappable adds
    // a dotted underline + hover lift making it obviously tap-to-resume on your own turn.
    numEl.style.cursor="pointer";numEl.onclick=()=>netHandlers().onTogglePause();numEl.classList.add("tappable");
    return;
  }
  const remain=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));
  const elapsed=30-remain;
  const urgent=elapsed>=20;
  // whose turn is being timed vs. who's looking: the active player sees a live "play in / or pay"
  // countdown; everyone else sees a greyed "WAITING" clock with spectator-appropriate copy — a
  // slow player hands the rest of the crew a coin, then (final 10s) forfeits their turn entirely.
  const active=(state.seat===appState.mySeat);
  wrap.classList.remove("paused");
  // notes/edits UI-02: the clock's outer edge warms up as the 20s window burns down — 0 at a full
  // 20s left, 1 at zero. The CSS reads --heat to size an orange glow (see #shotClockPanel.warming).
  const heat=Math.max(0,Math.min(1,elapsed/20));
  if(active){
    wrap.classList.remove("idle");
    wrap.classList.toggle("urgent",urgent);
    wrap.classList.toggle("warming",!urgent&&heat>0);
    wrap.style.setProperty("--heat",heat.toFixed(3));
    labelEl.textContent="play in";
    numEl.textContent=urgent?30-elapsed:20-elapsed;
    unitEl.textContent="seconds";
    // D-29 RESOLVED (Wyatt-approved 2026-07-29): every player-facing string in this file speaks the
    // pirate register — the 2nd-person pronouns become ye/yer/yers/yerself. Applied as a one-time source
    // transformation using art-review/narration-core.js's own PIRATE_RE/PIRATE_MAP as the spec — the one
    // declaration site in the repo, imported by the audit page, the health gate and ui_contract_check.js
    // alike (the
    // page ran it LIVE at render, so a card tagged `keep` displayed the converted text — under D-25 that
    // converted text is what he approved). No runtime helper is shipped for it: a pirateVoice() nothing
    // calls would be dead code, which D-33/D-34/D-40 exist to prevent. Comments and identifiers are out
    // of scope. scripts/ui_contract_check.js now gates this permanently.
    subEl.innerHTML=urgent?"or lose yer turn":`or pay 1${iconImg(COIN_IMG)}`;
  }else{
    wrap.classList.remove("urgent");
    wrap.classList.add("idle");
    labelEl.textContent="waiting";
    numEl.textContent=urgent?30-elapsed:20-elapsed;
    unitEl.textContent="seconds";
    subEl.innerHTML=urgent?"or their turn is skipped":`or gain 1${iconImg(COIN_IMG)}`;
  }
}

export function liveRender(){
  if(appState.replaying)return;          // during reload-replay we rebuild state silently, no render/broadcast
  appState.evIdx=Math.max(0,appState.game.events.length-1);
  if(!appState.game.events.length)return;
  syncLogLines();
  $("scrub").max=Math.max(0,appState.game.events.length-1);
  render();
  const e=appState.game.events[appState.evIdx];
  spawnPops(e,boardCell()); // notes/edits 11-03: cell now lives in src/ui/board.js
  playForEvent(e); // AUDIO-01/D-07: the host's per-event sound moment — fires once per game.ev() call, whole table audible, no isLocalTo gate
  if(appState.isHost){
    const _nh=netHandlers();
    // seam (D-07/criterion 1, RESEARCH Q1b edge 2): was a direct pushEvents() call — pushEvents
    // is itself still a classic-script global this wave, wired in through the still-present PP
    // bridge by src/main.js's setNetHandlers() call, formalized to a real src/net/ import in 11-06.
    if(_nh.onEvents)_nh.onEvents();       // broadcast the growing event feed to every other browser
  }
}
// needsAction=true turns the panel yellow (this seat must decide something);
// false (the default) is pale blue — informational only, nothing to click.
// G8 (Wyatt-approved 2026-07-30): *"I would like a gentle fade before the next line comes in,
// triggered BY the next line coming in – the logic could be, if new line coming in, then fade
// current line before displaying it; else keep the current line up."*
//
// F6's trailing-line behaviour is UNCHANGED and must stay so: a line with nothing following it
// never fades, because the fade is created only when a replacement arrives. What changes is only
// the REPLACEMENT, which until now was an instant swap.
//
// G17 (Wyatt-approved 2026-07-30) — OVERRULES G8's OVERLAP. He asked for a STRICT sequence:
// *"please fade the current line, THEN show the next"* — and waved off the pacing objection
// explicitly: *"if we need to shorten the 'hold' time to counteract that fade, we will do that
// later… you can stop taking so much concern for 'dragging' — that's on me to decide."*
//
// G8 shipped a 180ms OVERLAP cross-fade: the ghost faded while the incoming line typed in
// underneath. That was a real objection, honestly held — and he heard it and overruled it. The
// cost, stated plainly so nobody has to rediscover it: 180ms of added latency per REPLACED line,
// paid deliberately, his call. The rejection paragraph below is kept as history, not deleted.
//
// THE MECHANISM, which is the whole of the change. panel() stays fully SYNCHRONOUS — that is
// REQUIRED, not a preference: flash() reads `.apMsg._revealDone` the instant panel() returns, so a
// deferred swap would hand it the wrong element or none at all. So the DOM is still replaced
// synchronously and only the REVEAL is delayed. typewriterReveal() already blanks every text node
// and hides every <img> the moment it is called, so the incoming line is genuinely invisible in the
// meantime; giving it a start delay equal to the ghost fade produces fade-out-then-type-in with no
// overlap and no awaits anywhere.
//
// The cross-fade rejected on 2026-07-29 (see showNarration's own note) was turned down for two
// named reasons. Both are still real, and here is where each now stands:
//   - "it would delay every line by half a second" — the delay is now REAL but it is 180ms, not
//     500ms, and it applies only to a line that REPLACES another. Wyatt accepted it above.
//   - "two live lines in the box snap the panel height" — still fully answered: the ghost is
//     `position:absolute` and so out of flow, meaning resizePanel's `inner.offsetHeight`
//     measurement below still sees ONLY the incoming message. The box animates once, to the new
//     height, exactly as it does today.
//
// EVERY PROPERTY MEASURED GOOD THIS MORNING IS PRESERVED, and each is load-bearing:
//   - `pointer-events:none` on the ghost — panel() also renders prompts WITH BUTTONS, so a ghost
//     that could take clicks would swallow a real decision.
//   - `position:absolute; inset:0` — see the height argument above; the panel moves 0px per swap.
//   - the `animationend` listener plus the 250ms setTimeout belt.
//   - panel() synchronous, and flash()'s `_revealDone` contract intact.
//   - F6 STANDS and is NOT reintroduced as fade-to-empty: the ghost is created only when the
//     incoming html is non-empty, so a TRAILING line still never fades. An explicit clear (a caller
//     passing empty content) still empties and hides the panel instantly, with no ghost.
// FIX-16 (18-01 Task 2): the outgoing ghost's own measured height, shared as a floor between the
// swap path (panel()'s own resizePanel() call) and the resize/orientationchange path (18-01 Task
// 3, via resizePanel()'s default parameter) so neither can re-clip a still-fading ghost. Set when
// a ghost is created, cleared as the first statement inside drop() before the node is removed.
// The height animation's own duration. MUST equal index.html's `#apGrid { transition:
// grid-template-rows .18s }` — the swap sequence waits this long for phase 2 before starting
// phase 3, so if the CSS and this disagree the text starts typing while the box is still moving,
// which is the exact fault the sequence exists to remove. Declared beside GHOST_FADE_MS because
// the two are the sequence's only two clocks.
const RESIZE_MS=180;
export const GHOST_FADE_MS=800;
// ^ G17: the ghost fade's duration, and the incoming line's reveal delay — ONE number, because a
// strict sequence is only strict while they are equal.
// G28 (Wyatt-approved 2026-07-30): 180 -> 800. He watched G17's strict sequence live and judged it
// too quick to register, naming what the fade is actually FOR: "the point of it is to let the player
// know that the text is about to leave, so they can hurry up and read it". A warning nobody notices
// is not a warning. The hold was cut to pay for it (msgHoldMs, src/ui/util.js — ceiling 2000ms).
// THIS NUMBER LIVES IN TWO PLACES AND ONLY TWO: here, and the `.8s` in index.html's `.apMsg.fadeOut`
// rule. Move them together or the fade and the reveal disagree — that CSS rule carries the same
// warning pointing back here, plus a note that `.8s`'s old value collided with #apGrid's unrelated
// panel-height transition, so a find-and-replace on the duration is not safe.
// FIX-03/D-01 (18-01 Task 1): monotonically increasing per-panel()-call sequence, stamped onto
// #actionPanel's dataset at gate time and compared inside the reveal .then() below. Closes the
// stale-reveal race RESEARCH flags: typewriterReveal() only clears `_revealTimer` for the NEW
// element it is walking, never an interrupted earlier one, so an old reveal can resolve LATE. A
// seq mismatch means a newer panel() call already replaced this gate — removing the class then
// would be wrong. #actionPanel is a singleton element, so this guards against TIME (a late
// .then()), not against which node to unhide.
let panelSeq=0;
// Resolver for the CURRENT message's height release — see applyPanelHeight's `settled`.
let panelRevealSettle=null;
// D-02 (18-05): sizes a REMOTE decision's host-side arm-defer window from the ACTOR's own prompt
// text (never this browser's own shorter spectator line — see panel()'s clock-defer block below).
// Derived from REVEAL_MS_PER_CHAR and GHOST_FADE_MS rather than a literal duplicate of either, so
// a future change to the reveal pacing can't silently desync this estimate from the reveal it is
// approximating — see CR-01's comment on GHOST_FADE_MS above for what a hardcoded companion
// constant cost last time. Strips tags and counts CODE POINTS, not `.length` — narration text is
// full of emoji/surrogate pairs `.length` would double-count. GHOST_FADE_MS is added
// UNCONDITIONALLY (even though a real reveal only pays it when replacing a prior line): this
// estimate can only ever grant the acting player MORE of their window, never less (hard
// constraint 8) — erring long here is deliberate, not an oversight.
function estimateRevealMs(html){
  const codePoints=[...String(html||"").replace(/<[^>]*>/g,"")];
  // + RESIZE_MS (2026-08-01): the swap sequence now waits for the height animation as well as the
  // fade before the first character lands, so an estimate that stopped at GHOST_FADE_MS would run
  // 180ms SHORT — and running short is the one thing hard constraint 8 forbids, because it would
  // arm the acting player's clock before their prompt is readable. Erring long stays deliberate.
  return codePoints.length*REVEAL_MS_PER_CHAR+GHOST_FADE_MS+RESIZE_MS;
}
export function panel(html,needsAction=false){
  html=emojify(html);
  const inner=$("apGridInner");
  // REDUCED MOTION is read HERE, in JS, and that is not a stylistic choice: index.html's
  // `@media (prefers-reduced-motion: reduce)` sets `.apMsg.fadeOut{display:none}`, so there is no
  // fade to wait for — but a CSS media query cannot reach a JS timer. Without this read, a
  // reduced-motion user would get a blank 180ms gap AND no fade, which is the worst of both.
  // Read up-front (moved ahead of the pendingReveal gate decision below, 18-01 Task 1) — ordering
  // vs. resizePanel() doesn't matter for correctness (visibility:hidden never changes
  // offsetHeight), but `reduced` must be known before that gate decision is made.
  const reduced=typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Only when a line is actually being REPLACED: an explicit clear (empty html) still empties and
  // hides the panel instantly with no ghost, which is the explicit-clear path F6 preserved.
  const outgoing=html?inner.querySelector(".apMsg:not(.fadeOut)"):null;
  const ghost=outgoing?outgoing.cloneNode(true):null;
  // FIX-16 (18-01 Task 2): capture the outgoing message's REAL position and size while it is
  // still live in flow — offsets are relative to #apGridInner, which is already
  // position:relative (index.html) — BEFORE inner.innerHTML wipes it out of the DOM below.
  const ghostRect=outgoing?{top:outgoing.offsetTop,left:outgoing.offsetLeft,width:outgoing.offsetWidth,height:outgoing.offsetHeight}:null;
  inner.innerHTML=html;
  if(ghost){
    ghost.classList.add("fadeOut");
    // Pin the ghost to exactly where it sat and how wide it wrapped — position:absolute alone
    // would otherwise snap it to #apGridInner's padding-box corner (the FIX-16 "jump left" bug).
    // Pinning width matters as much as position: without it the now out-of-flow ghost re-wraps
    // and changes line count mid-fade.
    ghost.style.top=ghostRect.top+"px";
    ghost.style.left=ghostRect.left+"px";
    ghost.style.width=ghostRect.width+"px";
    // No height FLOOR any more: phase 1 of the sequence holds the row exactly where it is for the
    // whole fade, so there is no window in which a shorter incoming message could pull the box down
    // under a still-fading ghost. The floor existed to paper over a resize that no longer happens.
    inner.appendChild(ghost); // appended AFTER the live content, so :not(.fadeOut) lookups below still find the new line first
    // dropped guard: drop() can fire twice (animationend AND the setTimeout belt racing on a
    // backgrounded tab) — without this guard the second call would run a SECOND reflow-probe
    // per ghost (see resizePanel()'s own comment on the single-probe contract), for no reason —
    // the first drop already did everything there is to do.
    let dropped=false;
    const drop=()=>{
      if(dropped)return;
      dropped=true;
      if(ghost.parentNode)ghost.parentNode.removeChild(ghost);
      // drop() REMOVES THE NODE AND NOTHING ELSE. It used to re-measure here, which is what made
      // the height change twice per message (and, when it landed mid-reveal, clipped the text).
      // Phase 2 of the sequence owns the height now — see resizePanel()'s header.
    };
    ghost.addEventListener("animationend",drop,{once:true});
    // belt: animationend can be dropped entirely in a backgrounded tab, which would leak a ghost
    // that then sits over every later line. Same reasoning typewriterReveal records for preferring
    // setTimeout to requestAnimationFrame.
    //
    // CR-01 (found by code review, 2026-07-30): this was a HARDCODED 250 — "comfortably clear of the
    // 180ms animation" — and G28 moved the animation to 800ms in three places without touching it.
    // The belt then beat animationend every time, so the ghost was ripped out at 250ms while the
    // incoming line still waited the full GHOST_FADE_MS to start revealing: the box sat EMPTY for
    // 550ms per replaced line. That silently broke both G28's purpose (a fade long enough to read as
    // a warning) and F6's rule, which is Wyatt's own — "the blue box should never be empty".
    //
    // DERIVED, never hardcoded again. The margin only has to outlast the animation, so tying it to
    // the constant makes this correct for any future duration by construction rather than by anyone
    // remembering a fourth site. The CSS rule and GHOST_FADE_MS still have to move together — that
    // pair is genuinely irreducible — but this no longer joins them.
    setTimeout(drop,GHOST_FADE_MS+70);
  }
  // FIX-03/D-01 (18-01 Task 1): gate the action buttons behind #actionPanel.pendingReveal until
  // THIS prompt's own reveal resolves. Captured before resizePanel() runs so the buttons' full
  // markup is already in the DOM either way (visibility:hidden still occupies its box in layout,
  // which is exactly what keeps resizePanel()'s inner.offsetHeight measurement honest whether the
  // class is present or not). hasButtons is false/null for battle prompts — renderBattle()'s HTML
  // has no .apMsg/.apBtns/.apBack at all, so they are correctly untouched by this gate.
  const gateEl=needsAction?$("actionPanel"):null;
  const hasButtons=!!(gateEl&&gateEl.querySelector(".apBtns, .apBack"));
  if(hasButtons&&!reduced)gateEl.classList.add("pendingReveal");
  // P3 + P5 (Wyatt, 2026-08-01): "the 2nd line is cut off during writing, but only sometimes" and
  // "narrow window action button: fail". Both are the SAME cause, and the intermittency is the tell
  // — he also noticed "sometimes the box adjusts to the correct size during fade-out", i.e. the
  // correct height IS reachable, just not at measure time.
  //
  // resizePanel() measures once, synchronously, immediately below. Narration is full of inline
  // <img> icons (coins, ingredients, narrIcon). An <img> with no intrinsic size contributes ZERO
  // height and ZERO width until it decodes — so a message measured before its icons load comes out
  // one line short, and #apGridInner's overflow:hidden then CLIPS the line that appears when they
  // arrive. On a warm cache the icons are instant and nothing goes wrong, which is exactly why it
  // reproduces "only sometimes"; and drop()'s later resizePanel() is what silently corrects it
  // during the fade.
  //
  // So: re-measure once per image that was still loading. NOT a per-frame or per-tick re-measure —
  // that is the Safari near-crash BUG-01's measure-once rule exists to prevent. One extra probe per
  // late image, only for images that were not already complete, each firing at most once.
  for(const img of inner.querySelectorAll("img")){
    if(img.complete)continue;
    const remeasure=()=>resizePanel(!!inner.innerHTML);
    img.addEventListener("load",remeasure,{once:true});
    img.addEventListener("error",remeasure,{once:true}); // a broken icon changes the layout too
  }
  $("actionPanel").style.display=html?"":"none";
  $("actionPanel").classList.toggle("needsAction",!!needsAction);
  // PHASE 1 -> PHASE 2. When a line is being REPLACED, the box HOLDS its current height for the
  // whole fade and only then animates, exactly once, to the new message's height. Measuring is
  // still done inside resizePanel() with the full text present (the reveal blanks it afterwards),
  // so this defers WHEN the height moves, never HOW it is measured.
  //
  // With no ghost — a first line, or a line after an explicit clear — there is nothing to hold for,
  // so it resizes immediately, exactly as before.
  // MEASURE NOW, APPLY LATER. The measurement MUST happen here, synchronously, while the full text
  // is still in the DOM — typewriterReveal() below blanks every text node the instant it is called,
  // so anything measured after it reads an empty box. (That is exactly the regression the first
  // version of this sequence shipped: the whole resize was deferred, it measured the blank, and the
  // buttons were clipped at 316px.)
  const fadeMs=(ghost&&!reduced)?GHOST_FADE_MS:0;
  if(!html){resizePanel(false);}
  else{
    const targetH=measurePanelHeight();
    // `revealSettled` is resolved by the reveal below — the row stays pinned at targetH for the
    // whole type-in and is only released to max-content once the text has finished arriving.
    let settleReveal; const revealSettled=new Promise(res=>{settleReveal=res;});
    panelRevealSettle=settleReveal;
    if(fadeMs)setTimeout(()=>applyPanelHeight(targetH,revealSettled),fadeMs); // phase 2, after the fade
    else applyPanelHeight(targetH,revealSettled);                             // no ghost: nothing to wait for
  }
  // notes/edits #1: every message text types in one character at a time, whether it's passive
  // narration or an action prompt with buttons — see typewriterReveal() for how. The returned
  // promise (stashed on the element) resolves only once every character is actually on screen,
  // so callers like flash() can wait for real completion instead of a guessed duration.
  // G8: `:not(.fadeOut)` so a lingering ghost can never be mistaken for the live message and get
  // typed in a second time. The ghost is appended after the live content anyway, so this is a belt
  // rather than a fix — but flash() depends on getting the RIGHT element back, so it is cheap.
  const msgEl=$("actionPanel").querySelector(".apMsg:not(.fadeOut)");
  // PHASE 3. G17's strict sequence, now genuinely strict: the reveal waits for the fade AND for
  // the height animation that follows it, so the first character lands in a box that is already the
  // right size. Previously it waited only the fade, and the box was still moving underneath it.
  //
  // RESIZE_MS is added only when there IS a resize to wait for. This is the one place the sequence
  // costs more than before — 180ms per REPLACED line — and it buys the thing the recording showed
  // missing: text never arrives while the box is mid-move.
  //
  // Still handed to typewriterReveal()'s existing startDelay, so `_revealDone` is assigned before
  // panel() returns and flash()'s contract is untouched.
  const revealDone=msgEl?typewriterReveal(msgEl,REVEAL_MS_PER_CHAR,fadeMs?fadeMs+RESIZE_MS:0):Promise.resolve();
  if(msgEl)msgEl._revealDone=revealDone;
  // Release the pinned height only once this message's text has fully arrived (or immediately if
  // there is no message to reveal). Captured locally so a NEWER panel() call cannot resolve an
  // older message's release.
  if(panelRevealSettle){const settle=panelRevealSettle;panelRevealSettle=null;revealDone.then(settle,settle);}
  // FIX-03: unhide the gated buttons only once THIS prompt's own reveal resolves. The seq compare
  // (declared above panel()) is what keeps a late-resolving EARLIER reveal from unhiding a NEWER
  // prompt's still-hidden buttons — see panelSeq's own comment.
  if(hasButtons&&!reduced){
    const seq=++panelSeq;
    gateEl.dataset.revealSeq=String(seq);
    // D-02 (18-05): THIS is the button row becoming clickable — the seam armClock defers onto.
    // clockPendingSeat drives setClockUI()'s frozen pending display on whichever browser renders
    // it: the host's own screen for a local decision, or the deciding guest's own screen for a
    // remote one (the ONLY place a remote seat's own button row ever renders — see the host-side
    // spectator-narration branch below for how the host defers without ever seeing hasButtons here).
    appState.clockPendingSeat=currentTurnSeat();
    // Ownership of clockPendingArm is taken SYNCHRONOUSLY here (read-and-null), not inside the
    // .then() below — this is what lets ask()'s no-panel belt (checked synchronously right after
    // onLocalAsk/onRemotePrompt returns) tell "a button row WILL arm, just not yet" apart from
    // "nothing will ever arm this decision" (a pure flip prompt, which never reaches panel() at
    // all). clockPendingLocal gates it to LOCAL decisions only — a guest rendering its own remote
    // decision always finds clockPendingArm null here (ask() only ever runs host-side), a correct
    // no-op: arming is the host's job, and the guest's own clock mirrors clockState once the
    // host's deferred arm (below) broadcasts it.
    const armFn=(appState.clockPendingLocal&&appState.clockPendingArm)?appState.clockPendingArm:null;
    if(armFn){appState.clockPendingArm=null;appState.clockPendingLocal=false;appState.clockPendingText="";}
    revealDone.then(()=>{
      // T-18-15: reuse the SAME seq stamp the unhide above is gated by — a late-resolving EARLIER
      // reveal must never clear a NEWER prompt's clockPendingSeat or arm a stale seat's clock.
      if(gateEl.dataset.revealSeq!==String(seq))return;
      gateEl.classList.remove("pendingReveal");
      appState.clockPendingSeat=null;
      // armFn() marks the continuation claimed (unblocking ask()'s withShotClock chain) and hands
      // back the REAL asked seat — armClock(seat) is what actually starts the 30s window.
      if(armFn)armClock(armFn());
    });
  }
  // D-02 (18-05): a REMOTE decision's own button row never renders on the HOST's screen — the
  // deciding seat is a different browser. This panel() call is the host's spectator "<seat> is
  // deciding…" narration instead (hasButtons is false here, so the block above never runs on this
  // browser for this decision). Claim the arm right here — a hasButtons render that would
  // otherwise claim it is never coming on the host's own screen for a remote seat — and defer the
  // actual arm by the ACTOR's own estimated reveal length (from their real prompt text via
  // estimateRevealMs, not this shorter spectator line's own reveal): erring long by construction,
  // never short (hard constraint 8, T-18-14).
  if(!appState.clockPendingLocal&&appState.clockPendingArm){
    const fn=appState.clockPendingArm,text=appState.clockPendingText;
    appState.clockPendingArm=null;appState.clockPendingText="";
    setTimeout(()=>armClock(fn()),estimateRevealMs(text));
  }
}
// FIX-03 (18-01 Task 1): the live prompt's own reveal-completion promise, exported so a later
// caller (18-05's armClock chain) has exactly one seam to hook rather than re-deriving this
// lookup itself. Returns an already-resolved promise when there is no live .apMsg (nothing to
// wait for) rather than null, so every caller can `.then()` unconditionally.
export function panelRevealDone(){
  const m=$("actionPanel")&&$("actionPanel").querySelector(".apMsg:not(.fadeOut)");
  return (m&&m._revealDone)||Promise.resolve();
}
// notes/edits BUG-01: smoothly resize the box to the CURRENT message's finished height, exactly
// ONCE. Measure the natural content height (with the row briefly unconstrained and the transition
// suppressed so the measurement itself never animates), snap the row back to where it was, then let
// the transition animate to the measured height. The typewriter then fills a box that's already the
// right size — so the height animates a single time per message instead of on every character.
// FIX-16's ghost-height FLOOR is gone (2026-08-01). It existed so a resize landing mid-fade could
// not pull the box down under a still-fading ghost — but phase 1 now holds the height for the whole
// fade, so that window no longer exists. `minHeight` is kept as an explicit parameter for the
// resize/orientationchange path, defaulting to 0.
// THE SWAP SEQUENCE (rewritten 2026-08-01 after Wyatt's frame-by-frame recording).
//
// What the recording proved, measured at 20fps rather than eyeballed:
//   - the box overshot then snapped (H 88 -> 21 -> 109 -> 90, and 109 -> 95 -> 73 -> 68): the
//     height was being changed two or three times per message
//   - the outgoing text vanished in ONE frame (ink 433 -> 123) instead of fading
//   - the box then sat empty for ~850ms — GHOST_FADE_MS — before the new line began typing
//
// The cause was structural, not any one of those three: the fade, the height change and the
// type-in were three INDEPENDENT timers, each free to land whenever. Patching them one at a time
// is what produced the sequence above.
//
// They are now ONE owned sequence, in the only order that is coherent:
//
//   phase 1  fade the outgoing line          — the box HOLDS its current height, so nothing moves
//                                              under text the player is still reading
//   phase 2  animate the height, exactly once — old text is gone, new text is blanked, so the box
//                                              is free to move and nothing can be clipped by it
//   phase 3  type the new line in            — into a box that is already the right size
//
// Consequences that matter, so nobody "optimises" them back:
//   - resizePanel() no longer needs a ghost-height FLOOR: the height does not change while a ghost
//     exists, so there is nothing to floor against.
//   - drop() no longer re-measures. It only removes the node.
//   - measurement still happens ONCE per message (BUG-01's Safari rule), and still with the full
//     text present — the reveal blanks the text only after we have measured it.
//   - panel() stays synchronous and `_revealDone` is still assigned before it returns: the delay is
//     handed to typewriterReveal()'s existing startDelay parameter, which is what made this
//     restructure possible without touching flash()'s contract.
// MEASURE and APPLY are separate, and that separation is load-bearing (2026-08-01, second pass).
//
// The first version of the swap sequence deferred the WHOLE of resizePanel() to the end of the
// fade — which silently broke it, because typewriterReveal() BLANKS every text node the moment it
// is called, synchronously inside panel(). Measuring 800ms later therefore measured an EMPTY box,
// pinned the row to that height, and clipped the buttons. Wyatt caught it immediately at 316px.
//
// So: measure SYNCHRONOUSLY, while the full text is still in the DOM, and apply that number later.
// Height is still set exactly once per message; only the moment of application moves.
export function measurePanelHeight(minHeight=0){
  const grid=$("apGrid"),inner=$("apGridInner");if(!grid)return 0;
  const from=getComputedStyle(grid).gridTemplateRows;
  grid.style.transition="none";
  grid.style.gridTemplateRows="max-content";
  const h=Math.max(inner.offsetHeight,minHeight); // natural height of the FINISHED message
  grid.style.gridTemplateRows=from;               // snap back; nothing animates from this probe
  void grid.offsetHeight;
  grid.style.transition="";
  return h;
}
export function applyPanelHeight(h,settled){
  const grid=$("apGrid");if(!grid)return;
  grid.style.gridTemplateRows=h+"px";             // one smooth animation to the measured height
  // SAFETY NET — but NOT until the content has actually arrived.
  //
  // Releasing the row to max-content is what makes clipping impossible afterwards: if anything
  // later grows the content (a resize re-wrap, a late icon, a font swap) the box grows with it.
  // The catch, measured in Wyatt's second recording: released on a plain 180ms timer it fires while
  // the typewriter has the text BLANKED, so max-content reads a nearly-empty box, collapses the row
  // (202 -> 162 in one frame), and the box then STEPS back up line by line as the text types —
  // eight height changes across one message.
  //
  // So the release waits for `settled`: the reveal's own completion promise. At that moment the
  // content is at its final size, so max-content equals h and the swap is invisible — while every
  // LATER growth is still protected. Without a promise (the resize/orientationchange path, where
  // no reveal is running) a short timer is correct and is used instead.
  const release=()=>{ if(grid.style.gridTemplateRows===h+"px")grid.style.gridTemplateRows="max-content"; };
  if(settled&&typeof settled.then==="function"){
    settled.then(release,release);
    // Backstop: a reveal that is interrupted (a newer panel() call replacing this message
    // mid-type) may never resolve this particular promise. Without a timer the row would stay
    // pinned in px forever and the safety net would never engage. Generous — it must not beat a
    // legitimately long reveal, only rescue a dead one.
    setTimeout(release,15000);
  }
  else setTimeout(release,RESIZE_MS+40);
}
export function resizePanel(hasContent,minHeight=0){
  const grid=$("apGrid");if(!grid)return;
  if(!hasContent){grid.style.gridTemplateRows="0px";return;}
  applyPanelHeight(measurePanelHeight(minHeight));
}
// Walks msgEl's real DOM in document order and reveals it character-by-character (text nodes)
// and unit-by-unit (atomic elements like <img>), instead of faking a type-in with a CSS wipe — a
// wipe reveals every line at the same horizontal position simultaneously, which looks like
// parallel typing instead of one narrator reading in order once a message wraps past a single
// line. Walking real text nodes keeps nested formatting (<b>, colored <span>s) intact: the tags
// themselves are never touched, only the text inside them fills in over time.
//
// Paced by real elapsed time (performance.now()) on every tick, not a chained
// setTimeout(tick, msPerChar) that just counts ticks — a chain like that has no way to catch up
// once it falls behind: each tick only schedules the NEXT one after the current callback's own
// overhead (DOM mutation, style recalc) finishes, so if any single callback runs even a little
// over budget, that delay permanently compounds into every remaining character. Deriving the
// target reveal count from actual elapsed time every tick means a late tick just reveals several
// characters at once to catch back up to schedule, instead of drifting later forever.
// Deliberately setTimeout-driven rather than requestAnimationFrame: rAF callbacks are fully
// suspended (not just throttled) in a backgrounded/hidden tab, which would let flash() — which
// awaits this reveal before it can hold/fade/return — hang forever and freeze the whole bot-turn
// game loop the moment a player switches tabs. setTimeout keeps firing (just throttled) even when
// hidden, so the reveal still completes — slower while backgrounded, but never stuck.
// Batches each tick's reveal into ONE nodeValue write per text node instead of one per character
// (a catch-up tick that reveals twelve characters does one write, not twelve). This is a minor
// efficiency tidy — NOT the Safari storm fix. The storm hitch was the narration box's smooth
// height animation re-firing every reveal tick; that lives in #apGrid's CSS and is fixed there by
// snapping the height. The typewriter reveal (this) is deliberately kept exactly as-is.
// Characters are counted as CODE POINTS (`[...str]`, matching the original's `for...of`), not code
// units — this text is full of emoji and slicing mid-surrogate-pair would render broken glyphs.
// G17 (Wyatt-approved 2026-07-30): the third parameter, `startDelayMs`. panel() passes the ghost
// fade's duration so the incoming line does not begin revealing until the outgoing one has finished
// fading — a STRICT sequence rather than G8's overlap. Nothing is deferred and nothing is awaited:
// the DOM is still replaced synchronously, and this function still BLANKS every text node and sets
// every <img> to opacity:0 the moment it is called, so the incoming line is genuinely invisible
// until its first tick. The delay only moves that first tick.
// The target is clamped at 0 below, so a negative elapsed reveals nothing while the poll loop keeps
// scheduling — which is what makes the delay work without a separate timer.
export function typewriterReveal(msgEl,msPerChar,startDelayMs=0){
  if(msgEl._revealTimer)clearTimeout(msgEl._revealTimer);
  const units=[],recs=[];
  const walker=document.createTreeWalker(msgEl,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let n;
  while(n=walker.nextNode()){
    if(n.nodeType===Node.TEXT_NODE){
      if(!n.nodeValue)continue;
      const rec={node:n,chars:[...n.nodeValue],shown:0,dirty:false};
      n.nodeValue="";
      recs.push(rec);
      // still one pacing unit per code point, so the timing arithmetic below is untouched — but
      // the unit now points at its owning node record instead of carrying a character to write
      for(let i=0;i<rec.chars.length;i++)units.push({rec});
    }else if(n.tagName==="IMG"){
      n.style.opacity="0";n.style.transition="opacity .1s";
      units.push({img:n});
    }
  }
  return new Promise(resolve=>{
    const total=units.length;
    if(!total){resolve();return;}
    let revealed=0;
    const start=performance.now()+startDelayMs;
    const pollMs=Math.max(16,Math.min(msPerChar,32));
    const step=()=>{
      // Math.max(0,…): before `start` the elapsed is negative, which would floor to a negative
      // target and, without the clamp, leave `revealed<target` false — ending the poll loop and
      // resolving an empty message. Clamped to 0 it reveals nothing and keeps scheduling.
      const target=Math.min(total,Math.max(0,Math.floor((performance.now()-start)/msPerChar)));
      while(revealed<target){
        const u=units[revealed++];
        if(u.img)u.img.style.opacity="1";
        else{u.rec.shown++;u.rec.dirty=true;}   // book-keeping only — no DOM write in here
      }
      // one write per touched node per tick, instead of one per character
      for(let i=0;i<recs.length;i++){
        const r=recs[i];
        if(r.dirty){r.node.nodeValue=r.chars.slice(0,r.shown).join("");r.dirty=false;}
      }
      if(revealed<total)msgEl._revealTimer=setTimeout(step,pollMs);
      else resolve();
    };
    step();
  });
}
// notes/edits #1: .1s per letter to type in (see typewriterReveal), then held fully visible for
// another .08s/letter before flash() fades it out — floored at 1000ms so a short message/word
// (narration or chat bubble alike) doesn't flash past before anyone can actually read it.
const REVEAL_MS_PER_CHAR=20;
export function setNeedsAction(v){const el=$("actionPanel");if(el)el.classList.toggle("needsAction",!!v);}

// ---- narration: shown to everyone in the yellow action panel (no separate banner) ----
// D-57/D-58 HISTORY, kept because it explains why this path exists at all: the host's own flash()
// held and faded; showNarration() (the guest's — and the host's own echo's — display path) used to
// just render and stop, so guest narration never faded and NARR-06's hold cut never reached a guest
// seat. D-57 gave it render → await the typewriter reveal → hold msgHoldMs(text) → fade.
//
// F6 SUPERSEDES THE FADE HALF (Wyatt-approved 2026-07-29). His rule, verbatim: *"Never fade the last
// line — only fade when something replaces it."* And the reasoning, which is the load-bearing part:
// *"we want players to be able to see and think about each others' turns with them, as they think."*
// Narration is SHARED ATTENTION. A line should persist until the next line needs the space. He put
// the invariant plainly: **the blue box should never be empty.**
//
// So the timed hold-and-fade is gone from this path entirely. The next line's own render is what
// removes the outgoing one — which IS "fade only when something replaces it", and means no timer can
// ever leave the box empty. Nothing awaits showNarration() (it has never had a caller that awaits
// it, and must not acquire one), so removing the internal wait changes no caller's pacing. The
// typewriter reveal is unaffected: panel() owns it and stashes the promise on the element.
//
// `_narrToken` went with it. Its only job was cancelling the fade this function no longer schedules,
// and a variable nothing reads is dead code — D-33/D-34/D-40 exist to prevent exactly that.
//
// A CROSS-FADE WAS CONSIDERED AND REJECTED, recorded here rather than left as an open question:
// keeping the outgoing element alive to fade it over the existing half-second would delay every
// guest line by that half-second (the opposite of D-58's anti-drag note) and would briefly put two
// lines in the box, which snaps the panel height (see BUG-01's note in flash() below). Replacement
// IS the transition.
//
// SUPERSEDED BY G8 (Wyatt-approved 2026-07-30) — kept, not deleted, because the next reader needs
// to know the 500ms version was tried and why this one is different. He asked for *"a gentle fade
// before the next line comes in, triggered BY the next line coming in"*. Both objections above are
// answered rather than overridden, and the answer to each is what shapes the implementation (which
// lives in panel(), NOT here — see its header):
//   - the half-second delay: 180ms, and nothing is deferred or waited on. panel() stays synchronous.
//   - the height snap: the outgoing line is an absolutely-positioned GHOST CLONE, out of flow, so
//     resizePanel still measures only the incoming message. One height animation per message.
// What is NOT superseded: "never fade the last line". The ghost exists only when a replacement
// arrives, so a trailing line still never fades, and showNarration below still schedules nothing.
//
// SUPERSEDED IN TURN BY G17 (Wyatt-approved 2026-07-30, the SAME DAY, later) — and the correction
// is to the paragraph directly above, so read them in order. G8 shipped an OVERLAP: the ghost faded
// while the incoming line typed in underneath. He looked at it and asked for a STRICT sequence:
// *"please fade the current line, THEN show the next."*
//
// The pacing objection recorded twice above — a delay per line — is now a REAL cost rather than an
// avoided one: 180ms per REPLACED line. He was told, and overruled it in terms that leave nothing
// to re-litigate: *"if we need to shorten the 'hold' time to counteract that fade, we will do that
// later… you can stop taking so much concern for 'dragging' — that's on me to decide."* So the
// objection was correct, was heard, and lost on the merits of whose call it is. Do not re-raise it
// as a defect.
//
// The height answer is UNCHANGED and still holds — the ghost is still an out-of-flow clone, so the
// box still animates once per message. And "never fade the last line" is STILL not superseded: the
// ghost is created only when the incoming html is non-empty. Verified live over 200 lines this
// session. The mechanism (a start delay on the typewriter reveal, panel() still synchronous) lives
// in panel()'s header — the whole of it is there, deliberately, not split across two files.
//
// NARR-06, recorded honestly and NOT silently re-written: its criterion is "narration stays fully
// visible 10% less time before it begins fading." Under F6 a TRAILING line never begins fading, so
// that criterion is inapplicable to it. The hold still governs the gap between CONSECUTIVE lines
// (flash() below), so the 10% cut still does real work. The requirement's literal wording is
// superseded by this decision and should be RE-WORDED rather than re-verified — that is a change to
// .planning/REQUIREMENTS.md only Wyatt can authorise, so it is noted here and on the morning brief,
// and REQUIREMENTS.md is deliberately left untouched.
//
// The explicit-clear path is deliberately preserved: a caller passing empty content still empties
// and hides the panel. A caller ASKING for an empty box is a different thing from a timer producing
// one, and only the second is what F6 forbids.
export function showNarration(html){
  panel(html?`<div class="apMsg">${html}</div>`:"");
}
// netNarrate/netBroadcast remain classic-script globals this wave (they call showNarration bare,
// which resolves fine via the PP bridge) — they call into src/net/'s netSetNarr directly and are
// homed in main/orchestration in a later wave, not moved here (RESEARCH.md's battleAsk-style
// classification note applies the same reasoning: net-adjacent orchestration is out of scope for
// this UI-rendering cluster).

export function appendChatLine(seat,text){
  const log=$("chatLog");if(!log)return;
  const line=document.createElement("div");
  line.innerHTML=`${pn(seat)}: ${escHtml(text)}`;
  log.appendChild(line);
  log.scrollTop=log.scrollHeight;
}
// one bubble div per seat; a new message replaces whatever that seat was already showing.
// chatBubbles/positionChatBubble/removeChatBubble all live in src/ui/board.js (chatBubbles since
// 11-03; positionChatBubble/removeChatBubble moved there in 11-06 — see that file's header for
// why) — imported directly here (same ui/ tier, already-moved sibling), rather than left as a
// bare bridge read.
export function showChatBubble(i,text){
  const holder=$("chatBubbles");if(!holder)return;
  removeChatBubble(i);
  const b=document.createElement("div");
  b.className="bubble";
  b.style.borderColor=HEXCOL[i];
  b.onclick=()=>removeChatBubble(i);
  const msgEl=document.createElement("span");
  b.appendChild(msgEl);
  holder.appendChild(b);
  chatBubbles[i]=b;
  b._msgEl=msgEl;
  const xy=boatXY(i,boardShipEls()); // notes/edits 11-03: shipEls now lives in src/ui/board.js
  if(xy)positionChatBubble(i,xy[0],xy[1]);
  msgEl.textContent=text; // real text node for typewriterReveal to walk+blank — never innerHTML,
                          // so there's no HTML-injection surface here even without escHtml
  (async()=>{
    await typewriterReveal(msgEl,REVEAL_MS_PER_CHAR);
    if(chatBubbles[i]!==b)return; // dismissed (click) or replaced by a newer message meanwhile
    b._timer=setTimeout(()=>{
      if(chatBubbles[i]!==b)return;
      b.classList.add("fadeOut");
      b._timer=setTimeout(()=>{if(chatBubbles[i]===b)removeChatBubble(i);},500);
    },chatBubbleHoldMs(text)); // D-15: bubbles run on their own hold curve, pinned to today's timing
  })();
}

// narrates the outcome of the event just pushed via game.ev() — bot turns already get this
// for free via narrateCurrent(), but human actions (dock, anchor flip, trade) need it explicitly
// since they don't route through botBeat(). Skips (rather than clobbers) a still-pending
// decision's buttons — e.g. the 20s shot-clock penalty fires while the player hasn't answered
// yet, so overwriting the panel would wipe out the very buttons they need to click. Awaits a
// beat after narrating so the outcome is actually readable before the next thing overwrites it.
export async function narrateLastEvent(){
  const e=appState.game.events[appState.game.events.length-1];if(!e)return;
  // settleSideBets() already flashes one aggregate "Lookout's Call settles" message covering
  // every bettor — re-narrating the last individual sidebet event here would just duplicate it.
  if(e.t==="sidebet")return;
  if($("actionPanel").classList.contains("needsAction"))return;
  // D-10: the BROADCAST payload is built from the viewer-NEUTRAL rendering (never the ambient
  // appState.mySeat-flavored one) plus per-seat variants — netNarrate on the receiving end (the
  // host's own screen) and watchNarr on every guest both select their own line via
  // pickNarrVariant, so building this from anything OTHER than the neutral default would leak
  // the host's own personalised phrasing into every other seat's broadcast.
  const L=describeFor(e,NEUTRAL_VIEWER);if(!L)return;
  const variants=narrationVariants(e);
  // notes/edits #1 follow-up: this used to be netNarrate()+a flat 3000ms sleep, a leftover from
  // before the typewriter/hold/fade system existed. That fixed window never accounted for reveal
  // time at all, so a long multi-sentence line (battle results especially — often 120-160+ chars)
  // could burn the ENTIRE 3s just typing itself in, leaving no time to actually read it before the
  // next event overwrote it. flash() awaits real reveal completion, then holds for length*80ms —
  // scaling with the text instead of a one-size-fits-all timer.
  await flash(L.txt,undefined,undefined,variants);
}

// notes/edits #1: ms is no longer used to size the hold — the hold duration is derived purely
// from the message's own length (see msgHoldMs). flash() only ever runs on the host (spectating
// clients mirror narration via a lightweight direct showNarration() echo in watchNarr(), never
// through flash()), so awaiting the real on-screen completion below doesn't need to match across
// browsers/clients — it only paces the host's own gameplay flow.
// Awaits the actual typewriterReveal() completion (never a guessed duration) before the hold
// timer even starts, so a message can never be held or faded before every character is genuinely
// on screen — regardless of how fast or slow reveals run in a given browser. Held on screen
// fully-visible for the hold period, then fades out over .5s before flash() resolves, so the next
// narration/prompt never clobbers this one mid-transition.
// D-10: `holdMs`, when a number, overrides the human msgHoldMs() hold — this is how botWindLeg
// (src/ui/flow.js) gets its own, snappier bot pacing without a second flash() implementation.
// Purely additive: `ms` and every existing two-argument call site behave exactly as before.
// D-10 (widened narr payload): `variants`, when present, is the per-seat addressed-rendering
// array narrationVariants() built for `msg` — additive 4th parameter, same precedent as holdMs
// immediately above. Every existing 1-/2-/3-argument call site keeps behaving exactly as before
// (variants undefined forwards as undefined, which netSetNarr treats as "no variants field").
// EOV (Wyatt, 2026-07-31): fade the line currently in the box, then empty and HIDE the box.
//
// flash() deliberately does not do this — F6 removed its trailing fade so a line stays readable
// until something replaces it, and that rule stands for every line during play. The end of the
// voyage is the one moment where nothing comes next and the box should get out of the way, so the
// fade lives here, in its own function, rather than as a flag on flash() that could be switched on
// mid-game and quietly undo F6.
//
// The timing is the SAME fade a replaced line gets — GHOST_FADE_MS, via the same `.fadeOut` class —
// so the drumroll leaves exactly the way every other line leaves. His words: "when that text has
// been on screen for the amount of time that it would normally be faded out if there were another
// message coming after it". flash() already awaited that hold before this is called.
export async function fadeOutPanel(){
  const inner=$("apGridInner"), ap=$("actionPanel");
  if(!inner||!ap)return;
  const live=inner.querySelector(".apMsg:not(.fadeOut)");
  if(live)live.classList.add("fadeOut");
  await sleep(GHOST_FADE_MS);
  inner.innerHTML="";
  ap.style.display="none";
  ap.classList.remove("needsAction");
}
export async function flash(msg,ms,holdMs,variants){
  const _nh=netHandlers();
  // seam (D-07/criterion 1, RESEARCH Q1b edge 1): was a direct netNarrate(msg) call — netNarrate
  // is itself still a classic-script global this wave, wired in through the still-present PP
  // bridge by src/main.js's setNetHandlers() call, formalized to a real src/net/ import in 11-06.
  if(_nh.onBroadcast)_nh.onBroadcast(msg,variants);
  const el=$("actionPanel").querySelector(".apMsg");
  if(el&&el._revealDone)await el._revealDone;
  const text=el?el.textContent:msg;
  // F6 (Wyatt-approved 2026-07-29): THE HOLD IS DELIBERATELY PRESERVED. He narrowed the scope
  // himself — this await is what paces CONSECUTIVE lines, flash() is awaited by its callers, and
  // MSG_HOLD_MULTIPLIER (0.72) and the chat-bubble curve are not to be touched at all. Removing the
  // hold would make lines race past each other, which is not what "never fade the last line" asks
  // for.
  await sleep(typeof holdMs==="number"?holdMs:msgHoldMs(text));
  // F6: the two things that CLEARED the box at the end are gone — the fadeOut class, and the
  // trailing sleep(500) that existed solely to let that fade finish. The next render replaces this
  // line, so it stays fully readable until something takes its place and the box is never empty.
  // Reclaims roughly half a second per line, which also serves D-58's standing anti-drag note for
  // free — a benefit, not a risk.
  // (BUG-01, for the next reader: the fade was opacity-only with no grid-row collapse, so nothing
  // ever animated the box height — the box snaps to the next message's height when panel() replaces
  // the content. That is still true, and it is now the ONLY transition, which is what F6 chose.)
}
