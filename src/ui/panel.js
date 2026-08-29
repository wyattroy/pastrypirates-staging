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
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
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
  SOUND_ON_IMG, SOUND_OFF_IMG, COIN_IMG, HEXCOL, iconImg, emojify, subjectOf,
} from "../shared/index.js";
import {
  boardShipEls, chatBubbles, positionChatBubble, removeChatBubble,
} from "./board.js";
import {
  pn, boatXY, narrationHoldMs, chatBubbleHoldMs,
  sleepMs, describeFor, narrationVariants, NEUTRAL_VIEWER,
  pickNarrVariant, eventCeremony, voyageAground,
} from "./util.js";
import { escHtml } from "./recipe.js";
import { netHandlers } from "./handlers.js";
import { isMuted } from "./audio.js";

const $=id=>document.getElementById(id);
// sleepMs, not a bare setTimeout: a dropped beat must cost a late line, never the voyage (util.js)
const sleep=ms=>appState.replaying?Promise.resolve():sleepMs(ms);   // the waitWhilePaused gate left with play/pause (A-10)

// Writes only what has actually CHANGED. This is a performance fix, not tidiness — see the note
// on the welcome-screen early return below for what unconditional writes were costing.
function setIf(el,prop,val){ if(el&&el[prop]!==val)el[prop]=val; }
function setStyleIf(el,prop,val){ if(el&&el.style[prop]!==val)el.style[prop]=val; }
// MUTE-01: the attribute sibling of setIf. Needed for aria-*, which must be written as ATTRIBUTES
// rather than via the `el.ariaLabel` IDL properties — ARIA reflection only reached Safari 16.4, and
// this game is played on iOS. Compares first for the same reason setIf does: this runs on the 500ms
// tick, and unconditional DOM writes are what made Safari burn 137% CPU behind the welcome blur.
function setAttrIf(el,name,val){ if(el&&el.getAttribute(name)!==val)el.setAttribute(name,val); }
/* Once the whole-table clock display, then the pause panel; both are gone (the clock 2026-08-28
   morning, play/pause at Wyatt's A-10 the same day). What remains on the 500ms tick is exactly
   what still draws: the mute button and the end-of-voyage Play again swap. The name stays until
   something bigger renames the seam (main.js's interval and the onSetClockUI handler point here). */
export function setClockUI(){
  // ⚠ SAFARI CPU (Wyatt, 2026-08-01: "Safari rendering is killing my computer when I open
  // pastrypirates — even without running the game", 137% CPU on Safari Graphics and Media).
  //
  // This function is on a 500ms setInterval that runs FOREVER (src/main.js), and it used to write
  // DOM unconditionally every tick — including `muteEl.innerHTML=...`, which rebuilds an <img>
  // element twice a second. Meanwhile the welcome screen puts `filter: blur(7px) saturate(1.15)
  // brightness(.97)` over the WHOLE of #game (index.html's .bg-blurred), which contains the full
  // board SVG.
  //
  // A filter forces that subtree into its own compositing layer, and ANY invalidation inside it
  // makes Safari re-rasterise AND re-blur the entire surface. So a clock nobody can see was
  // repainting a full-screen blurred board twice a second, on the welcome screen, before the game
  // had even started.
  //
  // Two defences, both kept: skip the work entirely while the blurred welcome screen is up, and
  // write only what changed the rest of the time (setIf/setStyleIf above) so an in-game tick does
  // not invalidate layers for nothing either.
  const gameEl=$("game");
  if(gameEl&&gameEl.classList.contains("bg-blurred"))return;
  // AUDIO-02/D-15/D-16 (phase 21): #btnMute is a #controlsRow sibling (index.html), not a third
  // corner icon on the clock face — rendered here, above the end-of-voyage early return below,
  // so the same tick that swaps in Play again at the win screen also hides #btnMute (D-16),
  // one code path, no second branch. Its click is bound exactly once in wireLobby()
  // (src/orchestrator.js) — this block only ever writes display/innerHTML/title, exactly like
  // the #scTimerToggle block below, and must never touch that binding (CLOCK-03 discipline:
  // setClockUI() re-runs on the 500ms interval).
  const muteEl=$("btnMute");
  if(muteEl){
    setStyleIf(muteEl,"display",appState.liveDone?"none":"");
    // D-14: Wyatt's megaphone pair replaces 21-04's 🔊/🔇 emoji scaffold. #btnMute img in
    // index.html sizes these to 60% of the button (~29px), overriding .narrIcon's inline 18px —
    // id+element beats class, so no extra rule is needed.
    setIf(muteEl,"innerHTML",isMuted()?iconImg(SOUND_OFF_IMG):iconImg(SOUND_ON_IMG));
    // Tooltip copy recorded in .planning/todos/pending/copy-shipped-vs-approved-gate.md — no
    // @copy marker (a new misc.sound.* id would need registering in art-review's node-group
    // table, out of scope for this phase; see that file's phase-21 entry for the follow-up).
    //
    // MUTE-01 (Wyatt, 2026-08-01: "I don't see any mute tooltips — where are they?"). They were
    // real, but `title` is a DESKTOP-ONLY affordance: it needs a hover-and-hold, and on touch it
    // never appears at all. So on the device he mostly plays on there was nothing to see, and no
    // amount of styling fixes that — a hover tooltip has no touch equivalent to fix.
    //
    // The honest resolution, and the one the todo asked for as a deliberate decision rather than an
    // assumed bug: keep `title` as the desktop nicety it is, and add the treatment that works
    // EVERYWHERE. aria-label names the control for assistive tech on any device, and aria-pressed
    // exposes the on/off state as a real toggle rather than something inferable only from the
    // picture. Both are kept in step with the icon on the same tick, so they can never drift.
    //
    // Deliberately NOT a custom tooltip bubble: it would be a second, permanently-visible-on-touch
    // label competing with the icon for space in a row that already clamps hard at 390px, to say
    // what the icon already says. The todo's own bar — "the mute state must be readable from the
    // icon alone regardless" — is met by Wyatt's megaphone/slashed-megaphone pair above.
    // setAttribute, NOT the `el.ariaLabel` IDL property: ARIA reflection only landed in Safari 16.4
    // and this game is played on iOS. Still compared before writing, because this runs on the 500ms
    // tick and unconditional DOM writes behind the blur are exactly what cost 137% CPU in Safari
    // (see this function's header).
    const muteLabel=isMuted()?"Turn the sound back on":"Mute the sound";
    setIf(muteEl,"title",muteLabel);
    setAttrIf(muteEl,"aria-label",muteLabel);
    setAttrIf(muteEl,"aria-pressed",isMuted()?"true":"false");
  }
  // the end-of-voyage swap: the panel that once hid here is gone; only Play again remains to show
  $("btnPlayAgain").style.display=appState.liveDone?"":"none";
}

export function liveRender(){
  if(appState.replaying)return;          // during reload-replay we rebuild state silently, no render/broadcast
  appState.evIdx=Math.max(0,appState.game.events.length-1);
  if(!appState.game.events.length)return;
  const _nh=netHandlers();
  /* W1 (2026-08-28): THE HOST'S INLINE DRAWING IS GONE. The render/pops/sound lines that stood
     here were the second orchestration CLAUDE.md rule 23 names — the host drew from this loop
     while a guest drew from watchEvents, and every divergence of three phases lived in that gap.
     This is now the local DRAIN feeding the ONE consumer (consumeEvent, src/orchestrator.js,
     via the handler seam — panel.js is ui-tier and may never import the orchestrator). Rule A:
     the host consumes locally, never reading its own write back off Firebase.
     Fire-and-forget WITH the aground catch: liveRender stays synchronous for its 57 call sites,
     and a throw inside the consumer must still surface the wreck screen rather than vanish as
     an unhandled rejection (the runLiveNet catch cannot see a detached promise). */
  /* A-13 (Wyatt: "host and guest parity is the #1 goal of this work. If we need to change the
     game to fix pace, we want to fix pace for ALL PLAYERS EQUALLY."): the drain hands the
     consumer EVERY unconsumed event, in order — matching the guest, whose wire delivers each
     event individually. The coalescing this replaces (only the LATEST event per call drew; a
     burst's earlier pops and sounds were skipped on the host alone) was the last divergence
     inside the one-consumer claim, flagged as Q-13 and closed by his (b). Start-in-order,
     interleave-at-awaits — the same semantics a guest has when a burst arrives. */
  if(_nh.onConsumeEvent)while(appState.evConsumed<appState.game.events.length){
    const e=appState.game.events[appState.evConsumed++];
    _nh.onConsumeEvent(e).catch(err=>voyageAground(err,"consumeEvent"));
  }
  if(appState.isHost){
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
// Resolver for the CURRENT message's reveal — runHeightSequence waits on it before SETTLED.
let panelRevealSettle=null;
/* estimateRevealMs() stood here — the deliberately-long reveal estimate the host used to defer
   a remote seat's clock arm by (hard constraint 8: err long, never short). Left with the clock,
   2026-08-28. RESIZE_MS and GHOST_FADE_MS above are NOT clock residue — they are the swap
   sequence's own two clocks and stay. */
// A CLEAR IS DEFERRED, and this is the single most important thing in this file.
//
// The harness caught it: almost every swap in a real game is `panel("")` immediately followed by
// `panel(newHtml)` — flow.js's `done` handler clears the box the instant a prompt is answered
// (src/ui/flow.js:87 and four siblings). Executed literally that means: wipe the old message,
// collapse the row to 0, THEN build the new one. So the outgoing text had already been destroyed by
// the time the swap ran — no `.apMsg` left to clone, therefore NO GHOST, therefore NO FADE — and the
// box visibly collapsed to nothing and grew back on every single message.
//
// That is why four rounds of fixing the fade changed so little: for most messages the fade was never
// running at all. The trace showed exactly one swap out of nine with a ghost, and that one behaved
// perfectly (pinned at 26px through the fade, then a single clean 26 -> 46 resize).
//
// So a clear now WAITS one beat. If content arrives before CLEAR_GRACE_MS it is a REPLACE — the old
// message is still in the DOM, a ghost is cloned from it, and the normal fade -> resize -> reveal
// sequence runs. If nothing arrives, the clear happens for real, which is F6's explicit-clear path
// intact (the box empties and hides, no ghost, no fade).
const CLEAR_GRACE_MS=60;
let pendingClear=null;
export function panel(html,needsAction=false){
  html=emojify(html);
  const inner=$("apGridInner");
  if(pendingClear){clearTimeout(pendingClear);pendingClear=null;}
  if(!html){
    // Defer — a replacement may be one statement away.
    pendingClear=setTimeout(()=>{
      pendingClear=null;
      inner.innerHTML="";
      $("actionPanel").style.display="none";
      $("actionPanel").classList.remove("needsAction","pendingReveal","pendingStage");
      resizePanel(false);
    },CLEAR_GRACE_MS);
    return;
  }
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
  // RULE 1 — PIN BEFORE YOU SWAP. Resolve the row to a real px value while the OLD content is still
  // in place. Without this the row may be sitting at max-content, and the instant innerHTML lands
  // the box collapses to the new content's blanked height — which is the box shrinking under a
  // still-fading ghost that the last round measured at 66px -> 26px during the fade.
  const fromH=pinCurrentHeight();
  inner.innerHTML=html;
  /* A GHOST CROSSFADES ONE SENTENCE INTO ANOTHER. IT MUST NOT SIT OVER A DIFFERENT KIND OF THING.
     Wyatt, 2026-08-20, with a screenshot: "the Ahoy line is temporarily written into the recipe box,
     and then faded out immediately upon clicking 'ahoy'. this shouldn't happen." And, on how often:
     "the bug where stage narrations get temporarily displayed in other action boxes is pervasive and
     happens many times, especially during pass and play."

     MEASURED, not guessed — a per-animation-frame sampler over a solo game caught two .apMsg nodes
     alive together twice in the first five seconds, the second one carrying `fadeOut`:
       2743ms  n=2  "wy, choose yer recipe:"  ||  "Ahoy! Choose a recipe, gather each ingredien…"
       4257ms  n=2  "The crew draws lots…"    ||  "wy, choose yer recipe:"
     852ms of overlap against the ghost's own .8s fade. So this is not the Ahoy line specially — it
     is EVERY transition, which is exactly the "pervasive" he reported.

     The ghost itself is right and stays: fading one narration line into the next reads well, and a
     great deal of care is pinned into it (position, width, the reduced-motion path, click-through).
     What is wrong is fading a SENTENCE over a RECIPE PICKER — the old words land inside a box that
     now belongs to something else, and read as text wrongly written into it.

     So the crossfade survives message->message and is skipped whenever the incoming panel is more
     than a bare message. Decided from the REAL DOM after the swap rather than by pattern-matching
     the html string, so a future prompt shape cannot silently opt itself back in. */
  const incomingIsBareMessage = inner.children.length===1 &&
    inner.firstElementChild && inner.firstElementChild.classList.contains("apMsg");
  if(ghost && incomingIsBareMessage){
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
  /* TWO GATES, BECAUSE THEY ANSWER TWO QUESTIONS — Wyatt's blank-space lag, 2026-08-23 tier 1.
     `pendingReveal` answers "may the player ACT yet" and holds the BUTTON ROW until the typewriter
     and the board have both finished. Reusing that same flag for the whole popup's visibility
     (D-20's stage.js gates) accidentally made the box wait for its OWN INVISIBLE TYPING: fade
     (800ms) + resize (180ms) + 20ms/char all ran behind display:none, so every prompt was seconds
     of dead air and then a fully-formed card — "it's like the game is thinking" (his words). The
     typewriter is pointless while hidden; the player pays for it and never sees it.
     `pendingStage` answers the question D-20 actually asked — "has the board stopped moving" — and
     is what the box's visibility now reads (stage.js promptTick/centre-stage). It lifts the moment
     stageSettled() resolves, so the box appears at once on a still board, the old line fades in
     view, and the new text TYPES IN VISIBLY, exactly as notes/edits #1 always specified. Buttons
     still arrive last (top-to-bottom rule), through the unchanged pendingReveal CSS. */
  if(hasButtons&&!reduced)gateEl.classList.add("pendingReveal","pendingStage");
  /* The board-settled promise, taken ONCE here so the box gate, the typewriter's start and the
     button unhide all read the same answer (a second call could disagree mid-tween). Resolved
     immediately when the stage is inactive (crew lobby, battle cards) or motion is reduced. */
  const settledP=(hasButtons&&!reduced&&window.__pp4&&window.__pp4.settled)?window.__pp4.settled():Promise.resolve();
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
  // RULE 2 — MEASURE WITH THE TEXT PRESENT. typewriterReveal() below blanks every text node
  // synchronously, so this must happen first or it reads an empty box.
  let canReveal=Promise.resolve();
  if(!html){ heightSeq++; resizePanel(false); }
  else{
    const targetH=measurePanelHeight();
    // The reveal's completion, promised now and resolved further down once typewriterReveal exists.
    let settleReveal; const revealDone=new Promise(res=>{settleReveal=res;});
    panelRevealSettle=settleReveal;
    canReveal=runHeightSequence({ghostEl:(ghost&&!reduced)?ghost:null,targetH,fromH,revealDone});
    // The typewriter also waits for the BOARD: the box becomes visible when settledP resolves
    // (pendingStage lifts), so starting the type-in on the same signal means the box never pops
    // with half its text already on screen. On a still board settledP is already resolved and this
    // adds nothing.
    if(hasButtons&&!reduced)canReveal=canReveal.then(()=>settledP);
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
  // RULE 3 — the reveal starts on the sequence's own SIGNAL (fade done, then resize done), never on
  // a copy of the CSS durations. The text is blanked synchronously either way.
  const revealDone=msgEl?typewriterReveal(msgEl,REVEAL_MS_PER_CHAR,canReveal):Promise.resolve();
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
    // The box's own gate lifts on the board settling, independently of the typewriter — same seq
    // guard, so a late-resolving earlier settle can never unhide a newer prompt's box early.
    settledP.then(()=>{
      if(gateEl.dataset.revealSeq!==String(seq))return;
      gateEl.classList.remove("pendingStage");
    });
    // D-02 (18-05): THIS is the button row becoming clickable.
    // (The shot clock's arm claim stood here — the one-shot clockPendingArm continuation that
    // deferred the 30s window past this reveal. Removed 2026-08-28 with the clock; the reveal
    // gating below is the feature that STAYS — D-01: buttons hidden until the player can act.)
    /* playtest 21 item 2: the buttons also wait for the BOAT TO ARRIVE. Extended here rather than
       given its own mechanism, because pendingReveal already exists to answer exactly this
       question — "may the player act yet?" — and a second gate would be a second thing able to
       disagree with the first. src/ui/stage.js:stageSettled() waits on the camera tween and the
       ship's rendered transform, and is HARD-BOUNDED so it can never hold a turn hostage.
       Consequence worth stating: the shot clock arms on this same promise, so a captain no longer
       burns seconds of their 30 while the board is still moving under them. That is a fix in its
       own right, and it falls out of putting the wait in the existing seam instead of beside it. */
    Promise.all([revealDone,settledP]).then(()=>{
      // T-18-15: reuse the SAME seq stamp the unhide above is gated by — a late-resolving EARLIER
      // reveal must never unhide a newer prompt's row early.
      if(gateEl.dataset.revealSeq!==String(seq))return;
      gateEl.classList.remove("pendingReveal","pendingStage");
    });
  }
  // (The remote-decision arm claim stood here — the host deferring the clock by the actor's own
  // estimated reveal length, T-18-14. Removed 2026-08-28 with the shot clock.)
  // playtest 19: LAY THE NEW PROMPT OUT IN THE FRAME IT WAS BUILT. The /4 stage styles and places
  // every prompt from its own tick loop, which drops to an 8Hz heartbeat when nothing is moving —
  // so a freshly built prompt could sit up to ~125ms in its unstyled default before the stage
  // reached it. Measured on the recipe chooser: the cards painted at 110px wide, then jumped to
  // 163.5px once .pp4Recipes landed. Called here, at panel()'s single chokepoint, so EVERY prompt
  // style gets the same treatment rather than the recipe sheet alone — the same reasoning that put
  // the bake-off's stageCenterNow() before its panel build. No-op off the stage.
  try{ if(window.__pp4&&window.__pp4.syncPrompt)window.__pp4.syncPrompt(); }catch(e){}
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
// ============================ THE PANEL HEIGHT, AND ONLY HERE ============================
//
// Four rewrites of this box all failed the same way: SEVERAL places decided the height, at times
// that were not coordinated, and whichever timer arrived first won. The measured symptoms differed
// each round (overshoot-then-snap; a box collapsing under a still-fading ghost; a row released to
// max-content while the text was blanked, so it stepped up line by line) but the cause never did.
//
// So the height is now a pure function of an explicit PHASE, and exactly one owner drives it:
//
//   FADING     frozen at the OUTGOING message's height — pinned in px BEFORE the DOM is swapped,
//              which is the step whose absence let the box collapse the instant the new (blanked)
//              content landed
//   RESIZING   animating, once, to the INCOMING message's measured height
//   REVEALING  pinned at that height while the text types in
//   SETTLED    released to max-content, so a LATER re-wrap (a resize, a late icon, a font swap)
//              grows the box instead of being clipped by it
//
// Rules that keep it true:
//   1. PIN BEFORE YOU SWAP. Nothing may collapse the box mid-sequence.
//   2. MEASURE WITH THE TEXT PRESENT. typewriterReveal() blanks it synchronously; measuring after
//      that reads an empty box (shipped once, clipped the buttons at 316px).
//   3. ADVANCE ON REAL EVENTS — animationend, transitionend — with timers only as BACKSTOPS. The
//      duplicated-constant approach is what CR-01 records going wrong.
//   4. SKIP the resize when the height does not change. Most messages are the same height; they
//      should pay nothing.
//   5. ONE CANCELLATION TOKEN. A new message aborts the old sequence, so two can never both drive.
let heightSeq=0;
const RESIZE_BACKSTOP=RESIZE_MS+120;
// Freeze the row exactly where it is right now, resolving max-content to a real px value. Called
// BEFORE any DOM swap — this is rule 1, and its absence was the last bug.
function pinCurrentHeight(){
  const grid=$("apGrid");if(!grid)return 0;
  const cur=getComputedStyle(grid).gridTemplateRows;
  grid.style.transition="none";
  grid.style.gridTemplateRows=cur;
  void grid.offsetHeight;      // commit the pin before the transition is restored
  grid.style.transition="";
  return parseFloat(cur)||0;
}
// Wait for a real event, with a timer backstop. Resolves once, whichever arrives first.
function once(el,type,backstopMs){
  return new Promise(res=>{
    let done=false;
    const fire=()=>{if(done)return;done=true;el.removeEventListener(type,h);res();};
    const h=e=>{if(type==="transitionend"&&e.propertyName!=="grid-template-rows")return;fire();};
    el.addEventListener(type,h);
    setTimeout(fire,backstopMs);
  });
}
export function measurePanelHeight(minHeight=0){
  const grid=$("apGrid"),inner=$("apGridInner");if(!grid)return 0;
  const from=getComputedStyle(grid).gridTemplateRows;
  grid.style.transition="none";
  grid.style.gridTemplateRows="max-content";
  const h=Math.max(inner.offsetHeight,minHeight); // natural height of the FINISHED message
  grid.style.gridTemplateRows=from;
  void grid.offsetHeight;
  grid.style.transition="";
  return h;
}
// Runs FADING -> RESIZING -> REVEALING -> SETTLED for one message. Returns a promise that resolves
// when the reveal may START (i.e. once the box has finished moving) — that promise is handed to
// typewriterReveal as its start SIGNAL, which is what keeps the two in step without either one
// duplicating the other's duration.
// playtest 19 item 1: the /4 centre stage owns its own height — index.html forces the row to
// max-content and drops the clip there, so the ceremony card takes its natural size and can never
// be drawn part-built (the "At the helm!" circle was being sliced 29.6px short of its own bottom).
// With no transition left to fire, the RESIZING phase below would sit out its full RESIZE_BACKSTOP
// waiting for a `transitionend` that can never arrive, delaying every centre-stage reveal by 300ms
// for nothing. So it is skipped outright while the stage is up.
const centreStaged=()=>{const b=$("pp4Prompt");return !!(b&&b.classList.contains("pp4Center"));};
function runHeightSequence({ghostEl,targetH,fromH,revealDone}){
  const seq=++heightSeq;
  const grid=$("apGrid");
  const alive=()=>seq===heightSeq;
  const settle=()=>{
    // SETTLED. Only after the text has fully arrived: released earlier, max-content reads a blanked
    // box and the row collapses, then steps up line by line as the characters land.
    if(!alive())return;
    if(grid.style.gridTemplateRows===targetH+"px")grid.style.gridTemplateRows="max-content";
  };
  /* T-15 (Wyatt, 2026-08-26): "the stages have a brief (half second or so) pause where their
     narration boxes are completely blank white... The exact instant that a box appears, the text
     should start to appear in it. otherwise it looks like the game is laggy and stalling."

     HE UNDER-ESTIMATED IT. Measured 2026-08-26 in a driven solo game with an in-page rAF recorder,
     time from a box becoming visible to its FIRST character:
         before  median 917ms · 90th 1001ms · worst 1001ms
         after   median 334ms · 90th  360ms · worst  360ms
     [UNGATED-IN-4: nothing keeps this duration low. The recorder is a measuring tool that was run
     by hand, not a check that runs in npm test — it drives a real browser through a real voyage,
     which the gate chain cannot afford. If this regresses, nothing will say so. Turning it into a
     gate needs a threshold somebody is willing to defend, and that is a decision, not a chore.]
     The cause was this line: the reveal waited for the OLD line's whole fade-out —
     GHOST_FADE_MS (800) + 120 backstop — before typing the first character of the new one. 920ms
     of white box, which is what he watched and called lag.

     WHAT CHANGED: the resize no longer queues BEHIND the fade. It starts at once, and the reveal
     waits only for it. The ghost keeps fading on its own clock, behind the arriving text, which is
     a crossfade rather than a stall.

     WHY NOT ZERO, which is literally what he asked for: the height animation is the thing that
     makes the box the right size, and #apGridInner is overflow:hidden. Typing into a box still at
     the OLD height is precisely P3/P5 — "the 2nd line is cut off during writing, but only
     sometimes" — a bug he reported himself and which cost a session to find. So the wait is now
     the RESIZE only (~180ms, and skipped entirely when the height is unchanged or the centre stage
     owns the row), not the fade. ~920ms -> ~180ms, with the clipping fault still impossible.

     If he still wants literal zero after seeing it, the change is to hand typewriterReveal() a
     resolved promise instead of this one — and the clipping is what to watch for. */
  const fading = ghostEl ? once(ghostEl,"animationend",GHOST_FADE_MS+120) : Promise.resolve();
  const canReveal = (()=>{
    if(!alive())return Promise.resolve();
    // RESIZING — skipped entirely when the height is unchanged (rule 4), or when the centre stage
    // has taken the row off us (see centreStaged() above).
    if(centreStaged()||Math.abs(targetH-fromH)<1)return Promise.resolve();
    grid.style.gridTemplateRows=targetH+"px";
    return once(grid,"transitionend",RESIZE_BACKSTOP);
  })();
  // The ghost's fade is still awaited — for the SETTLE, not for the text. Releasing the pinned row
  // to max-content while the old line is still painted is what collapsed the box mid-fade before.
  const faded = fading;
  Promise.all([canReveal,faded]).then(()=>{ if(alive())revealDone.then(settle,settle); });
  return canReveal;
}
// THE RESIZE / ORIENTATIONCHANGE PATH (src/main.js). Deliberately NOT the swap sequence.
//
// A window resize re-wraps the text, so the height that was measured for this message is stale by
// definition — and if a reveal is running, the text is partially blanked, so re-measuring would
// read a SHORT box and clip the rest as it types. Both traps are avoided by not measuring at all:
// max-content always fits whatever is in the box, at any width, at any point in a reveal.
//
// There is nothing to animate here either — the user is dragging the window, and the box should
// track their drag rather than easing 180ms behind it.
//
// Any in-flight swap sequence is CANCELLED (rule 5): its measured target belongs to the old width.
// The reveal itself continues untouched; only the height stops being driven by it. The next swap
// re-pins from whatever max-content resolves to, so the sequence picks up cleanly from here.
export function resizePanel(hasContent){
  const grid=$("apGrid");if(!grid)return;
  // A SEQUENCE IN FLIGHT OWNS THE HEIGHT — do not fight it. The board sizes itself dynamically, so
  // resize events land mid-swap routinely; the harness caught this one firing during three separate
  // fades, each time forcing max-content and collapsing the box under the still-fading ghost. That
  // is the same class of bug as the earlier max-content release, arriving from a different door.
  //
  // Skipping is safe rather than merely convenient: every sequence ENDS at max-content of its own
  // accord (SETTLED), so the re-fit this call wanted still happens — just a beat later, and without
  // interrupting a fade the player is currently watching.
  if($("apGridInner")&&$("apGridInner").querySelector(".apMsg.fadeOut"))return;
  heightSeq++;                                   // otherwise: cancel any sequence and re-fit now
  grid.style.gridTemplateRows=hasContent?"max-content":"0px";
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
// `startDelayMs` may be a NUMBER (a fixed delay) or a PROMISE (a start SIGNAL). The promise form is
// what lets the swap sequence drive the reveal off real events — the ghost's animationend, the
// grid's transitionend — instead of a duplicated copy of the CSS durations, which is the class of
// bug CR-01 recorded. Either way the text is BLANKED synchronously on call, so the incoming line is
// invisible from the instant the DOM swaps; only the first TICK waits.
export function typewriterReveal(msgEl,msPerChar,startDelayMs=0){
  if(msgEl._revealTimer)clearTimeout(msgEl._revealTimer);
  const units=[],recs=[];
  // WORDS MUST NOT JUMP LINES AS THEY GROW (Wyatt, 2026-08-01). Emptying the text node and refilling
  // it means the line breaks are recomputed on every character — so a word starts on one line, grows
  // past the edge, and hops down to the next. Reserving the layout up front removes the cause rather
  // than compensating for it.
  //
  // Each text node becomes TWO adjacent spans holding the SAME characters in the same order:
  //   [shown]  the revealed prefix
  //   [hidden] the rest, visibility:hidden — which still occupies its exact layout box
  // Characters move from hidden to shown. Because the two spans together always contain the full
  // text, the browser's line breaking is IDENTICAL to the finished message from the very first
  // frame: every word is written on the line it will end up on, and nothing ever reflows.
  //
  // Two spans per text node, not one per character — the cheap version of this idea. A break
  // opportunity comes from the text content (UAX #14), never from an inline element boundary, so
  // splitting mid-word across the two spans cannot introduce a break the full text would not have.
  //
  // Bonus, and it matters: the box's natural height is now correct at ANY point in the reveal, so
  // measurePanelHeight() can no longer read a short box mid-type. That was a real bug twice.
  const textNodes=[];
  const walker=document.createTreeWalker(msgEl,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let n;
  while(n=walker.nextNode()){
    if(n.nodeType===Node.TEXT_NODE){ if(n.nodeValue)textNodes.push(n); }
    else if(n.tagName==="IMG"){ n.style.opacity="0";n.style.transition="opacity .1s"; units.push({img:n,_dom:n}); }
  }
  // Replace after the walk — mutating the tree during it would invalidate the walker.
  for(const tn of textNodes){
    const chars=[...tn.nodeValue];
    const shownEl=document.createElement("span");
    const hiddenEl=document.createElement("span");
    hiddenEl.style.visibility="hidden";
    hiddenEl.textContent=tn.nodeValue;
    const parent=tn.parentNode;
    parent.insertBefore(shownEl,tn);
    parent.insertBefore(hiddenEl,tn);
    parent.removeChild(tn);
    const rec={shownEl,hiddenEl,chars,shown:0,dirty:false};
    recs.push(rec);
    // still one pacing unit per code point, so the timing arithmetic below is untouched
    for(let i=0;i<chars.length;i++)units.push({rec});
  }
  // Images were pushed during the walk and text after it, so restore document order for pacing.
  units.sort((a,b)=>{
    const ea=a.img||a.rec.shownEl, eb=b.img||b.rec.shownEl;
    if(ea===eb)return 0;
    const pos=ea.compareDocumentPosition(eb);
    return (pos&Node.DOCUMENT_POSITION_FOLLOWING)?-1:1;
  });
  return new Promise(resolve=>{
    const total=units.length;
    if(!total){resolve();return;}
    let revealed=0;
    const isSignal=startDelayMs&&typeof startDelayMs.then==="function";
    // With a signal, the clock starts when it resolves; with a number, at now+delay.
    let start=isSignal?Infinity:performance.now()+startDelayMs;
    if(isSignal)startDelayMs.then(()=>{start=performance.now();},()=>{start=performance.now();});
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
        if(r.dirty){r.shownEl.textContent=r.chars.slice(0,r.shown).join("");r.hiddenEl.textContent=r.chars.slice(r.shown).join("");r.dirty=false;}
      }
      if(revealed<total)msgEl._revealTimer=setTimeout(step,pollMs);
      else{msgEl._revealNow=null;resolve();}
    };
    /* T-17 — his checklist #24 (Wyatt, 2026-08-26): "tapping the card, or the space around it, should instant-appear
       all of the text. this is a nice affordance for players who are familiar with the game and
       follows the same logic where they get to progress bot turns by tapping."

       Exposed as a handle ON THE ELEMENT rather than as a global, for the same reason panelSeq
       exists: a newer message must never be finished by a tap meant for an older one. The handle is
       nulled the moment this reveal ends, either way, so a stale tap is a no-op instead of an
       exception.

       It reveals through the SAME bookkeeping the tick uses — every unit marked shown, every image
       opaque, one write per node — so a hurried message and a fully-typed one end up in byte-
       identical DOM. Writing the text straight in would skip the img opacity and leave icons
       invisible on exactly the messages a player was impatient with. */
    msgEl._revealNow=()=>{
      if(msgEl._revealTimer){clearTimeout(msgEl._revealTimer);msgEl._revealTimer=null;}
      while(revealed<total){
        const u=units[revealed++];
        if(u.img)u.img.style.opacity="1"; else u.rec.shown++;
      }
      for(const r of recs){r.shownEl.textContent=r.chars.join("");r.hiddenEl.textContent="";r.dirty=false;}
      msgEl._revealNow=null;
      resolve();
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
// `opts.wait` rides through to stageFlash, which then registers no dismissal deadline — see its
// note. The pre-stage panel path below has no hold of its own to skip, so it needs no branch.
/* `variants` is FORWARDED, not read here (02.2-07, PAR-14). The renderer needs the payload's own
   per-seat array to answer one question — is this wait line about a question coming to THIS
   browser — and until now the host's entry into the renderer dropped it while a guest's kept it.
   Same drawn thing, two shapes; the shape the host used could not carry the fact. Additive: every
   two-argument caller behaves exactly as before, since `undefined` forwards as `undefined`. */
export function showNarration(html,opts,variants){
  if(html&&window.__pp4){const h=window.__pp4.narr(html,opts,variants);if(h)return;}
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
  // D-07: watchChat (orchestrator.js) calls appendChatLine for EVERY incoming chat message,
  // including this client's own echo — the flash and the unread mark hang off this same call
  // rather than a second listener, so the orchestrator needs no edit (key_links, 02-05-PLAN.md).
  //
  // Never flash a captain's own sent message back at them, and never flash (or mark unread)
  // while the sheet is open — the message is already sitting right there in the log they're
  // looking at.
  if(seat===appState.mySeat)return;
  if(document.body.classList.contains("pp4Chat"))return;
  renderChatFlash(seat,text);
  setChatUnread(true);
}
// D-06's unread mark — a DOT, not a counter (nothing here counts messages). Exported so it is the
// one place that turns it on or off; stage.js's own sheet-open handler (Task 1, committed ahead of
// this function existing) clears the dot with a direct class toggle instead of importing this, so
// that task's commit stayed self-contained — both write the same "on" class to the same element.
export function setChatUnread(on){
  const dot=$("pp4ChatDot");if(dot)dot.classList.toggle("on",!!on);
}
// D-07: the flash under the ribbon — seen without opening the sheet. ONE element, replaced rather
// than stacked (T-02-15: a captain spamming chat must not wall the board off with piled-up
// flashes), with the same instant-tap-dismissal a ship bubble carries at ANY stage of its
// lifecycle, including mid-reveal, for the same reason (board.js's removeChatBubble comment: one
// captain spamming chat must not be able to wall off the screen).
//
// Rendering route is copied verbatim from appendChatLine just above: pn() names the seat,
// escHtml() bounds the free text. No second escaping path (T-02-14).
let chatFlashTimer=null;
export function renderChatFlash(seat,text){
  let el=$("pp4ChatFlash");
  if(!el){
    el=document.createElement("div");
    el.id="pp4ChatFlash";
    el.addEventListener("pointerdown",removeChatFlash);
    document.body.appendChild(el);
  }
  if(chatFlashTimer)clearTimeout(chatFlashTimer);
  if(el._msgEl&&el._msgEl._revealTimer)clearTimeout(el._msgEl._revealTimer);
  el.classList.remove("out");
  el.innerHTML="";
  const msgEl=document.createElement("span");
  el.appendChild(msgEl);
  el._msgEl=msgEl;
  msgEl.innerHTML=`${pn(seat)}: ${escHtml(text)}`;
  typewriterReveal(msgEl,REVEAL_MS_PER_CHAR);   // same reveal rate showChatBubble already uses
  // D-15's own hold curve (chatBubbleHoldMs, util.js) — this IS chat, the exact same kind of
  // message the ship bubble already paces, so it borrows that curve rather than msgHoldMs's
  // narration one, and rather than a hand-typed duration nothing else in the codebase provides.
  chatFlashTimer=setTimeout(()=>{
    el.classList.add("out");
    // .35s matches .pp4Bub's own transition:opacity — 300ms matches stageFlash's own removal
    // delay after adding .out (stage.js) — the same fade-out timing this codebase already uses
    // for a floating message card, not a new number.
    setTimeout(()=>{ if($("pp4ChatFlash")===el)el.remove(); },300);
  },chatBubbleHoldMs(text));
}
export function removeChatFlash(){
  const el=$("pp4ChatFlash");if(!el)return;
  if(el._msgEl&&el._msgEl._revealTimer)clearTimeout(el._msgEl._revealTimer);
  if(chatFlashTimer){clearTimeout(chatFlashTimer);chatFlashTimer=null;}
  el.remove();
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
  /* W4-2 (Wyatt): "Guest battle narration box is not centred", narrowed by him to the BATTLE box
     because the tap-to-sail box was correctly centred on the same screen.
     MEASURED IN A REAL CREW GAME BEFORE CHANGING THIS, and it corrects his premise once and sharpens
     it once: NOT guest-only — the battle result sat 44px right of centre on BOTH seats — and within
     ONE battle two lines were drawn two ways, "Dough Hook attacks Flaky Jack!" centred at offset 0
     and "Dough Hook wins 1–0" anchored at 44.
     THE CAUSE IS THIS LINE. A bubble with a subject anchors to that captain's boat and grows a tail,
     which is right for "Flaky Jack takes the wheel". A battle event is {t:"battle", a:attacker,
     d:defender}, so `e.a` handed the RESULT to the attacker — one of the two fighters, arbitrarily.
     THE RULE IS DERIVED FROM THE EVENT'S OWN SHAPE, never a list of event names that would need
     editing every time a new two-captain event appears: AN EVENT THAT NAMES TWO CAPTAINS IS NOT
     ABOUT ONE OF THEM, so it takes no subject and its bubble is ambient — centred, like the opening
     line of the same fight already is.
     This is also what the codebase already says out loud about fights, in the camera hold a few
     hundred lines away in stage.js: "the director should focus battles on the players fighting, not
     the player calling the battle." Anchoring the result to one fighter was the same fault one
     layer down. Held by scripts/qa/w42_battle_bubble_check.mjs. */
  if(window.__pp4){
    /* ONE RULE, ONE PLACE (Wyatt's Q-18 ruling, 2026-08-29; CEO Review 24). This test used to be
       spelled out here and its ANSWER shipped to the guest as a wire field, which is two things
       kept in step by nothing — rule 23's exact shape. `subjectOf` lives in src/shared/index.js,
       the one module both this tier and the orchestrator already import, and the guest now runs
       the SAME function over the event it already holds. Neither seat owns the rule any more. */
    window.__pp4.subject = subjectOf(e);
    /* AND WHICH EVENT IT WAS READ FROM. CEO Review 25: the first cut sent `events.length-1` with
       EVERY narration line, but only THIS function is about the last event — every other flash()
       in the game (prompts, dock lines, ceremonies, bot turn banners, the battle play-by-play)
       went out carrying a serial for an event it had nothing to do with. The guest then resolved
       that unrelated event, anchored the bubble to whichever captain it named, and marked the
       subject DECIDED, while the host left the same sentence to the colour sniff. A host/guest
       divergence in bubble placement, created by the fix meant to end host/guest divergence, in
       the very family Wyatt reported (W4-2). THE SERIAL AND THE SUBJECT ARE ONE FACT AND NOW
       TRAVEL AS ONE: a line that did not read an event sends neither. */
    appState.narrEvIdx = appState.game.events.length - 1;
    /* DECIDED IS NOT THE SAME AS ABSENT, and conflating them is why the first cut of W4-2 changed
       nothing on either seat. stageFlash falls back to sniffing the sentence for captain colours
       whenever the subject is null — a fallback that exists for turn-start lines, which carry no
       event at all. A battle result names exactly ONE captain (the winner), so the sniff cheerfully
       re-anchored the very line this rule had just decided to centre. The flag says "an event was
       read and it yielded no subject", which the sniff must not override. */
    window.__pp4.subjectSet = true;
    window.__pp4.evType=e.t;
  }
  const variants=narrationVariants(e);
  // notes/edits #1 follow-up: this used to be netNarrate()+a flat 3000ms sleep, a leftover from
  // before the typewriter/hold/fade system existed. That fixed window never accounted for reveal
  // time at all, so a long multi-sentence line (battle results especially — often 120-160+ chars)
  // could burn the ENTIRE 3s just typing itself in, leaving no time to actually read it before the
  // next event overwrote it. flash() awaits real reveal completion, then holds for length*80ms —
  // scaling with the text instead of a one-size-fits-all timer.
  await flash(L.txt,undefined,undefined,variants);
  // THE BLACK MARKET'S ONE LESSON (Wyatt, 2026-08-12, "ceremony + marker"): the first time any
  // shelf on the board empties, a once-per-voyage centre-stage beat teaches that sold-out islands
  // still sell, at cfg.blackMarket's flat price — after this it is only the 🏴 marker and the
  // dock's own whisper. (The price is NOT repeated here on purpose: it moved once already and a
  // number typed into a comment cannot move with it.) Keyed on
  // the event's firstDry stamp (engine sets it exactly once), so a replayed voyage re-derives the
  // same single showing. Hand-built stage barrier, same pattern as the bake-off intro card —
  // panel.js may not import flow.js's localAsk (layering), and needs none of it.
  //
  // HIS ITEM 7: THE GATE ITSELF MOVED OUT OF THIS FUNCTION. It used to be an inline
  // `if(e.firstDry&&!appState.replaying)` right here, in the HUMAN narration path only — and a
  // bot's dock narrates through util.js's narrateCurrent(), a structurally separate function that
  // knew nothing about it. A bot claims the first dry shelf in 76% of solo voyages, and in every
  // one of those the ceremony was swallowed for good. The gate is now eventCeremony() in util.js,
  // which BOTH narration paths call — rule 23's "make the FIRST one go through the new path too",
  // rather than a second copy of the check that would have to be kept in step by discipline.
  await eventCeremony(e);
}
// exported so the composition root (src/main.js) can hand it to eventCeremony() through the
// handlers seam — util.js is imported BY this file and can never import it back.
export function dryCeremony(){
  return new Promise(res=>{
    const ap=$("actionPanel");
    ap.dataset.pp4Stage="1";
    if(window.__pp4&&window.__pp4.stageCenterNow)window.__pp4.stageCenterNow();
    // @copy prompt.blackmarket.ceremony — APPROVED as written, Wyatt 2026-08-27. He wrote this
    // sentence HIMSELF, taking none of the three drafts he was offered, and two of its words are
    // his deliberate picks rather than slips: "ingredient" (not "crate") and "black market flag"
    // (not "black flag"). Do not "correct" either. He also cut "after dark" and "the Sugar Seas"
    // on purpose — the latter agrees with W2-6. The paragraph it replaces was three lines long.
    //
    // THE PRICE IS READ, NEVER TYPED (rule 9). cfg.blackMarket is the one place the flat sold-out
    // price lives; cratePrice() hands it back for an empty shelf, and the board's 🏴 marker reads
    // the same field the same way (board.js, the flag build). So the card, the flag and the till
    // cannot quote three different numbers — and when the price moves, this sentence moves with
    // it instead of quietly lying to a captain about what the crate costs. Reached unguarded for
    // the same reason board.js reaches it unguarded: no client ever draws without appState.game.
    const bmPrice=appState.game.cfg.blackMarket;
    panel(`<div class="apMsg">🏴 <b>The shelves be bare…</b><br><br>
      Sold-out islands fly the black market flag. They'll find ye one more
      ingredient — for <b>${bmPrice}🌕.</b></div>
      <div class="apBtns"><button class="apBtn" id="bmCerGo" type="button">Arrgh!</button></div>
      `,true);   /* the "Steep, aye…" helper line is gone — his call, 2026-08-25 */
    const go=$("bmCerGo");
    if(!go){delete ap.dataset.pp4Stage;res();return;}
    go.onclick=()=>{go.onclick=null;delete ap.dataset.pp4Stage;panel("");res();};
  });
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
/* THE ONE PLACE A NARRATION LINE IS DRAWN FROM (02.15-01 Stage 1, D-25).
   Until 2026-08-20 the host drew its narration here, from the game loop, and a guest drew its own
   from watchNarr -> showNarration -> __pp4.narr. Two orchestrations, one renderer, and they drifted
   — four of the seven divergences in Wyatt's side-by-side screenshots were narration.
   orchestrator.js's watchNarr now calls THIS function, so a guest draws a narration line through
   exactly the code the host's own loop draws it through, holds included. That is watchChat's shape
   applied to the game display: one renderer, every client, nothing to keep in step by hand.
   AND THE HOST STILL NEVER ROUND-TRIPS. It feeds this function directly and mirrors to Firebase
   only through onNetBroadcast, whose netBroadcast target is guarded by `isHost && db && room`. In
   solo and pass-and-play there is no room, the mirror is a no-op, and this function is the whole
   path — which is exactly what it was before. A guest calling it broadcasts nothing for the same
   reason (it is not the host), so there is no echo and no loop. */
export async function flash(msg,ms,holdMs,variants,opts){
  // /4 stage: narration renders as a board bubble instead of the panel (solo only; the stage
  // hook returns null before a game is on screen, and the classic path runs unchanged).
  /* CREW GAMES PAINTED EVERY NARRATION LINE TWICE, AND THE SECOND PAINT ATE THE FIRST ONE'S HOLD.
     Measured 2026-08-19 on a live board, rAF-driven at ~60fps: the same flash() call held 2701ms
     in solo and 1ms in a crew game. Wyatt saw it as "the pass narration is immediately blitzed
     past by the bots" and as "the final coin image didn't load" — the coin had in fact loaded and
     was painted, then wiped 1ms later, because humanFlip awaits this very promise before blanking
     the coin (flow.js:298).

     The cause was one identifier. `onBroadcast` is netNarrate, which BOTH broadcasts AND repaints
     this screen's panel; `onNetBroadcast` is netBroadcast, which exists for exactly this case —
     "broadcast narration to spectators WITHOUT touching this screen's panel" (orchestrator.js:305).
     Calling the former meant stageFlash ran a second time, and stageFlash's first act is
     `if (S.hurry) S.hurry()` — retire the live bubble NOW (stage.js:558) — which resolved the
     promise this function had just returned. The hold was computed correctly all along and thrown
     away; no duration needed changing, and none was.

     WHY THE PICKED VARIANT IS PASSED TO THE BUBBLE: stageFlash takes only `msg` and never reads
     `variants`, so the bubble always carried the NEUTRAL line while the panel echo carried the
     host's addressed one ("ye flip HEADS"). Since the echo is what he actually read, deleting it
     alone would have quietly demoted his own lines to the neutral wording — a copy regression
     hiding inside a timing fix. Picking here keeps what he reads identical.

     ...and why only when `appState.room` is set: in solo there was never an echo, so the bubble's
     neutral line IS the shipped solo wording. Picking unconditionally would have changed solo copy
     nobody asked to change. The broadcast still sends the neutral `msg` so every other client picks
     its own variant, exactly as before. */
  /* READ THE SUBJECT BEFORE THE LOCAL DRAW SPENDS IT — and this is one level up from where that
     lesson was learned, which is why it was still broken.
     MEASURED ON THE WIRE, 2026-08-29, two real browsers, 47 narration lines in one crew game:
     **NOT ONE carried a subject.** W4-2's second half — "the host's decision crosses the wire so
     both seats draw it alike" — has never worked in a crew game, and gate 42 could not see it
     because the code that sends the subject is all present and correct.
     THE CAUSE IS THE ORDER, TWO LINES APART. On the v2 stage path — every crew game — this
     function calls `window.__pp4.flash(...)` FIRST, and stageFlash's own act is to read the flag
     and clear it (`const decided = !!S.subjectSet; S.subjectSet = false;`, src/ui/stage.js). Only
     THEN does it reach the broadcast, which finds the flag already spent and sends nothing. CEO
     Review 20 fixed exactly this inside netNarrate — "reading it after would always send nothing"
     — but the stage path never goes through netNarrate; it goes through netBroadcast, from here.
     So the decision is captured HERE, before the draw, and handed to the broadcast explicitly.
     src/ui/ may never import the orchestrator (D-07), so it rides the handler seam like every
     other cross-tier value. */
  if(window.__pp4){
    const pre=window.__pp4.subjectSet
      ? {subj:window.__pp4.subject, evN:appState.narrEvIdx}
      : null;
    const shown=appState.room?pickNarrVariant({html:msg,variants},appState.mySeat):msg;
    const h=window.__pp4.flash(shown,ms,holdMs,variants,opts);
    if(h){if(appState.room){const _nh0=netHandlers();if(_nh0.onNetBroadcast)_nh0.onNetBroadcast(msg,variants,opts,pre);}
      appState.narrEvIdx=null;   // spent with the line it belonged to, whether or not it was sent
      return h;}
  }
  const _nh=netHandlers();
  // seam (D-07/criterion 1, RESEARCH Q1b edge 1): was a direct netNarrate(msg) call — netNarrate
  // is itself still a classic-script global this wave, wired in through the still-present PP
  // bridge by src/main.js's setNetHandlers() call, formalized to a real src/net/ import in 11-06.
  if(_nh.onBroadcast)_nh.onBroadcast(msg,variants,opts);
  const el=$("actionPanel").querySelector(".apMsg");
  if(el&&el._revealDone)await el._revealDone;
  const text=el?el.textContent:msg;
  // F6 (Wyatt-approved 2026-07-29): THE HOLD IS DELIBERATELY PRESERVED. He narrowed the scope
  // himself — this await is what paces CONSECUTIVE lines, flash() is awaited by its callers, and
  // MSG_HOLD_MULTIPLIER (0.72) and the chat-bubble curve are not to be touched at all. Removing the
  // hold would make lines race past each other, which is not what "never fade the last line" asks
  // for.
  // D-34/D-45: the classic-path fallback reads from the SAME reading-speed model the stage bubble
  // does. It is dead in practice (initStage() sets window.__pp4 at boot, so the branch above always
  // takes it) but it is a real second reader of "how long does one line of narration read", and two
  // things that must agree are one thing or they will drift (rule 23). A numeric holdMs still wins
  // -- that is botWindLeg's own per-square override (D-10), an argument, not a curve.
  await sleep(typeof holdMs==="number"?holdMs:narrationHoldMs(text));
  // F6: the two things that CLEARED the box at the end are gone — the fadeOut class, and the
  // trailing sleep(500) that existed solely to let that fade finish. The next render replaces this
  // line, so it stays fully readable until something takes its place and the box is never empty.
  // Reclaims roughly half a second per line, which also serves D-58's standing anti-drag note for
  // free — a benefit, not a risk.
  // (BUG-01, for the next reader: the fade was opacity-only with no grid-row collapse, so nothing
  // ever animated the box height — the box snaps to the next message's height when panel() replaces
  // the content. That is still true, and it is now the ONLY transition, which is what F6 chose.)
}
