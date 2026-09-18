// src/ui/flow.js
//
// Phase 11 (SPLIT-03/06), wave 11-05. The deepest layer of src/ui/ — the turn-flow, interaction,
// battle-UI, side-bet, intro, game-start, and recovery/replay clusters — the functions that
// actually drive a live turn and call the panel/board/util modules already moved (11-01..11-04).
// Extends the proven "move verbatim + rewire bare reads into imports + bridge grows + gates
// green" pattern one more time.
//
// This file also carries the deterministic battle/coin-flip machinery (asyncBakeoff, the
// battle-UI render helpers, collectSideBets/settleSideBets) — moved BYTE-IDENTICAL to the classic
// source. Do not alter ordering, object-literal key order, or RNG-adjacent call sequencing; a
// structural change here is exactly the RNG-desync risk this milestone's threat register (T-11-07)
// flags.
//
// Purity bar for src/ui/: reads DOM and game state, NEVER imports src/net/ (D-07).
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
//
// Task 3 (this same file, added after tasks 1-2 land) resolves the remaining 3 of the milestone's
// 6 UI->orchestration edges through src/ui/handlers.js's injected-handler seam (11-04 resolved the
// first 2 — flash->onBroadcast, liveRender->onEvents): remotePickHighlights->onRespond,
// endReplay->onRecovery, wireRestoreFail->onRecovery+onLeave. See that section's own header note
// for the mechanism.
//
// Deliberately NOT moved here (11-analysis.json's "orchestration (calls net directly)" tier,
// same reasoning 11-04 applied to the room-lifecycle functions): battleAsk, renderBattle,
// watchBattle, asyncBattle — each calls a net-adjacent function (netBroadcast/netSetBattle/
// netWatchBattle/netRemoveBattle) or is itself classified as orchestration by 11-analysis.json.
// These stay classic and are homed in 11-06 alongside the rest of the orchestration layer. This
// file's functions call them as bare identifiers (asyncBattle from humanAct/botTurn, battleAsk
// from asyncBakeoff) — they resolve fine via the still-present PP bridge, same as every other
// still-classic cross-reference in this codebase this phase.
//
// A handful of calls inside these functions reach still-classic orchestration/net-adjacent
// globals that are NOT part of the milestone's 6-edge seam table (broadcastFlip, netNarrate,
// netBroadcast, remotePrompt, logDecision) — those are left as bare identifiers exactly like every
// other still-classic cross-reference elsewhere in src/ui/ this phase; only the 6 specifically
// identified edges (RESEARCH.md Q1b) get the handler-injection treatment.
//
// Deviation ($/sleep duplicates, mirrors 11-01/11-03/11-04's precedent): `$` (index.html:863) and
// `sleep` (index.html:947) are classic-script-local consts used far beyond this cluster's own
// consumers (dozens of still-classic call sites for `$`; humanFlip/fishCast/asyncBattle etc. for
// `sleep`, some of which are NOT moving this wave) — reproduced verbatim as private module-local
// duplicates instead of "moved", exactly like panel.js/board.js/lobby.js/recipe.js already do.

import { appState } from "../state/index.js";
import { pingStart } from "./usage.js";
import { roundCfg } from "../engine/index.js";
import { present } from "../shared/storyboard.js";   // L3: the storyboard this file performs
import {
  // F5 (2026-07-29): dockFlavor -> dockFlavorIcon. The tails buy prompt (:below) was this file's
  // only dockFlavor consumer, and it now needs the icon placed by the declared {prefix,name} split
  // rather than interpolated in front of the whole flavour phrase.
  DIRS, DIRNAME, STORM_PUSH, WAVE_IMG, SAIL_RANGE, SAIL_RANGE_UPWIND, OPPOSITE, man, HEXCOL, iname, ilabelImg, iconImg, NAMES, dockPlace, dockFlavorIcon, ING_IMG,
  CUPCAKE_IMG, CHECKMARK_IMG, CANCEL_X_IMG, DICE_IMG, FLIP_HEADS_IMG, FLIP_TAILS_IMG, COIN_SPIN_IMG, ovensNowEnabled, bake2Enabled, endCardEnabled,
  buildRoster, emojify,
} from "../shared/index.js";
import { el, boardCell, setFlipActive, armFlipTap, renderLiveShips, paintShipAt, setShipGlideMs, paintShipAtPoint, snapShipTo, render as renderBoard } from "./board.js";
import {
  liveRender, panel, setNeedsAction, narrateLastEvent, flash, showNarration,
} from "./panel.js";
import {
  pn, poss, apBtnStyle, optionButtonsHTML, backButtonHTML, sliderWrapHTML, wireSlider, ask, stepDelay, botBeat, raiseLocalPrompt, seatLocal,
  decisionIsLocal, sleepMs, seatStrat, saveSoloState,
  getSeaBase, advanceSeaCursor,
  replayShortfall, STORM_STEP_MS, describeFor, narrationVariants, isLocalTo, NEUTRAL_VIEWER,
  msgHoldMs, BOT_STORM_STEP_MS, RIM_SWEEP_ARRIVE_MS, RIM_SWEEP_TICK_MS,
  RIM_SWEEP_MS_PER_CELL, RIM_SWEEP_MIN_MS, RIM_SWEEP_MAX_MS, isDisabledBtn,
  SHIP_GLIDE_MS, SAIL_ROUTE_TICK_MS, MOTION_BRIDGE_TICKS, MAX_NAME_LEN, getLastName,
  vwPx, fixedRect,
  clearSoloState, clearSession,   // ?pilot=new starts a NEW voyage; these own the two saved blobs
  buildPlayerRows,                // endReplay: the captains' rows, rebuilt once in sailing order
  say, sayAll, sayText, seat,     // the one door to src/shared/words.js
  eventDrawn,   // a dock's buy waits for its coins to land (humanDock)
  narrateEvent, // showTheWind narrates the trade-wind event it is handed (architecture item 19)
} from "./util.js";
/* A line every screen reads its own way, in one call: the words and their "ye" versions come from words.js. */
const sayFlash=(id,facts,ms)=>{const w=sayAll(id,facts);return flash(w.html,ms,undefined,w.variants);};
import { passGate, requireName, showStep, openNameModal, confirmName, wireNameModal, setNameWarning } from "./lobby.js";
import { playBakeoffLive } from "./bakeoff.js";
import { netHandlers } from "./handlers.js";
import { pilotLine, pilotMsg, pilotSee, pilotSpeaks, pilotRung, pilotDepth, pilotFirstTime,
  pilotStartFromTheTop, pilotSkipToVeteran, pilotDecayOnLaunch, pilotApplyUrlFlag,
  pilotIsOn } from "./pilot.js";
import { showCourseFor, clearCourse, forgetCourse } from "./course.js";

const $=id=>document.getElementById(id);
// ⏩ fast-forward: every flow beat (storm steps, rim sweeps, bot beats, battle pauses) collapses
// to a breath — 40ms keeps the sequencing sane (paints still land in order) while the round races
// by. Prompts are never touched by this: any decision involving the player ends the skip first
// (ffEndNow below), so his interactions always play at full speed.
// sleepMs, not a bare setTimeout: a dropped beat must cost a late line, never the voyage (util.js)
const sleep=ms=>appState.replaying?Promise.resolve():sleepMs(appState.ff?Math.min(ms||0,40):ms);   // the waitWhilePaused gate left with play/pause (A-10)

/* ================= ⏩ fast-forward: how a skip ends ================= */
// Called, synchronously, at the top of EVERY entry point that puts a decision in front of the
// player — localAsk (which also carries flips, battle calls, offered trades and defenses, since
// ask() routes through it), localPickCell (the sail), and bakeoffPrompt. Wyatt's rule
// (2026-08-12): the skip halts for ALL interactions he takes part in, plays them at normal
// speed, and NEVER re-arms itself — the ⏩ chip sits in the ribbon to tap again after. The recap
// is fire-and-forget so his prompt is never delayed by it, anchored to his own ship so the
// camera stays where his decision is.
// Returns null when no skip was live, else a promise that resolves once the recap bubble has
// played. Playtest 17 (Wyatt: "No narration/action messaging should overlap"): the recap is
// AWAITED before the prompt builds — bubble first, pill after, never both. Tap-to-hurry works on
// the bubble, so the cost of the sequence is one tap at most. (ask()'s no-panel belt arms the
// clock during the recap for this one case; /4 ships with the turn clock off by default, and a
// hurried bubble costs ~a second of a 30s window when it is on.)
function ffEndNow(){
  if(!appState.ff)return null;
  appState.ff=false;
  const from=appState.ffFromEv||0;appState.ffFromEv=null;
  const g=appState.game;if(!g)return null;
  const line=ffRecapLine(g,from);
  if(!line)return null;
  if(window.__pp4)window.__pp4.subject=(appState.mySeat??0);
  return flash(line);
}
// One clause per bot (his pick), weightiest event claiming the clause: finishing > battles >
// buys > trades > dock work > a plain sail. Covers only what he did NOT witness — anything that
// halted the skip played live in front of him. Draft copy — Wyatt rewrites.
function ffRecapLine(g,from){
  const by=new Map();   // the recap is read on THIS screen, so say() words each captain as this screen sees them
  const note=(seat,w,txt)=>{
    if(seat==null||seat===(appState.mySeat??0))return;
    const cur=by.get(seat);if(!cur||w>cur.w)by.set(seat,{w,txt});
  };
  for(const e of g.events.slice(Math.max(0,from))){
    if(e.t==="battle"){
      const loser=e.winner===e.a?e.d:e.a;
      note(e.winner,5,say("recap.bested",{p:seat(e.winner),q:seat(loser)}));
      note(loser,4,say("recap.lost",{p:seat(loser),q:seat(e.winner)}));
    }
    else if(e.t==="dock"&&e.got==="bought")
      note(e.p,e.black?4:3,e.black
        ?say("recap.black",{p:seat(e.p),icon:iconImg(ING_IMG[e.ing])})
        :say("recap.bought",{p:seat(e.p),icon:iconImg(ING_IMG[e.ing]),place:dockPlace(e.ing)}));
    else if(e.t==="trade"){note(e.a,3,say("recap.traded",{p:seat(e.a),q:seat(e.b)}));note(e.b,3,say("recap.traded",{p:seat(e.b),q:seat(e.a)}));}
    else if(e.t==="dock")note(e.p,2,say("recap.docks",{p:seat(e.p),place:dockPlace(e.ing)}));
    else if(e.t==="sail"||e.t==="pass")note(e.p,1,say("recap.sailed",{p:seat(e.p)}));
  }
  if(!by.size)return null;
  // @copy adhoc.ff.recap — APPROVED as written, Wyatt 2026-08-14
  return say("recap.line",{list:[...by.values()].map(v=>v.txt).join("; ")});
}

/* ================= turn-flow + interaction ================= */

/* THE REASON, SPOKEN AT THE BUTTON THAT OWNS IT — playtest 21 item 5 (Wyatt: "The helper text for
   a given action should hover near its button — see this ss, the attack greyed out prompt hovers
   far away. Alternatively, the helper text reason should appear when the user taps the grey
   button"). His pick was the tap, and the bubble is placed AT the circle with a tail pointing at
   it so it can never be ambiguous which greyed button it belongs to — which is the actual failure
   in the screenshot, where one line explained one of several circles from across the board.

   Deliberately NOT the shared .apSub line: that is one element for a whole prompt, so with two
   greyed circles it can only ever explain one of them, and it explains it from wherever it happens
   to sit. A per-button bubble scales to however many are greyed.

   Dismissal is every gesture that means "I'm done reading": another tap anywhere, and a timeout.
   It is pointer-events:none so it can never itself swallow the tap that dismisses it or the tap on
   a live button underneath. */
let whyBub=null,whyTimer=null;
export function clearWhy(){
  if(whyTimer){clearTimeout(whyTimer);whyTimer=null;}
  if(whyBub){whyBub.remove();whyBub=null;}
}
export function showWhy(b){
  clearWhy();
  const why=b&&b.dataset&&b.dataset.why;
  if(!why)return;                       // nothing to say — stay silent rather than show an empty box
  // RED ALERT FIX (2026-08-21, D-18 follow-up — util.js's fixedOrigin() note has the full account):
  // fixedRect(), not a raw getBoundingClientRect() — `d` (.apWhy, index.html) is position:fixed on
  // body like every other stage overlay, so a viewport-absolute button rect written into its
  // left/top is off by body's own offset the instant item 22's desktop stopgap is active. Also
  // vwPx(), not window.innerWidth — this file's own established rule (stage.js's header comment,
  // playtest 19 item 3): innerWidth is the Safari *visual* viewport, and on desktop it is additionally
  // the TRUE (uncapped) width rather than the phone-shaped column every other clamp in this game uses.
  const r=fixedRect(b);
  const d=document.createElement("div");
  d.className="apWhy";
  d.textContent=why;                    // textContent: the reason is prose, never markup
  document.body.appendChild(d);
  // measure AFTER it is in the DOM, then clamp to the viewport — a circle near the right edge of a
  // 390px phone would otherwise hang its bubble off the screen
  const w=d.offsetWidth,h=d.offsetHeight;
  const cx=r.left+r.width/2;
  d.style.left=Math.min(Math.max(cx-w/2,8),Math.max(8,vwPx()-w-8))+"px";
  // above the button by preference; below it when there is no room up there
  const above=r.top-h-10;
  d.style.top=(above>=8?above:r.bottom+10)+"px";
  d.classList.toggle("below",!(above>=8));
  // the tail tracks the BUTTON, not the bubble's centre — after clamping they are not the same
  d.style.setProperty("--tailX",Math.min(Math.max(cx-parseFloat(d.style.left),12),Math.max(12,w-12))+"px");
  whyBub=d;
  whyTimer=setTimeout(clearWhy,4200);
  // any next tap clears it. Registered on the NEXT frame so the tap that opened it does not
  // immediately close it again.
  setTimeout(()=>document.addEventListener("pointerdown",clearWhy,{once:true}),0);
}
/* ═════════ FORK 2 CONVERGED (W1, 2026-08-28): ONE ASK RENDERER ═════════
   renderAskPrompt(spec, answer) is the ask-class renderPickPrompt: it draws EVERYTHING an ask
   prompt is — back button, message, coin slider, button row, helper text, in the narration box's
   top-to-bottom reveal order — and knows nothing about promises, Firebase or seats. `answer`
   fires exactly once with the chosen index (or {i,n} when a slider rode along). localAsk passes
   its promise resolver; watchPrompt passes sendResponse. The body below is localAsk's own,
   moved, not rewritten — its comments (playtest 21 items 5/7, MP-08, 02.1-03) moved with it.
   Gate: scripts/qa/ask_render_convergence_check.mjs; parity DECL row watched red first.
   spec = { msg, opts, colors, sub, slider, battle } — opts carry label/cls/disabled/why/seat/
   short/flip/back/stage exactly as ask() builds them; the guest rebuilds the same shape from the
   wire payload ("" from RTDB's null-hole convention normalizes back to null here, not at the
   call sites — the fork-2 map's cosmetic divergence #4 closes with it). */
export function renderAskPrompt(spec,answer){
  const {msg,opts,colors,sub}=spec;
  if(opts.length===1&&opts[0].flip){
    // /4 ceremony: a PURE flip renders no panel at all, so the veil cannot read its ask from
    // the DOM — stash message + helper on the bridge for the ceremony title/stakes.
    // GUARDED ON !spec.battle (belt and braces — battleAsk never reaches this renderer, and
    // stage.js's `!fm && btl` "⚔️ Broadside!" fallback needs fm null for battles).
    if(!spec.battle&&window.__pp4)window.__pp4.flipMsg={m:msg||"",s:sub||""};
    setNeedsAction(true);
    // THE TAP IS THE FLIP — playtest 22: the tap paints the spin in its own frame. armFlipTap (board.js) is where every
    // flip's tap does that now, a fight's included (architecture item 6).
    armFlipTap(()=>{setNeedsAction(false);answer(0);});
    return;
  }
  const backIdx=opts.findIndex(o=>o&&o.back);
  const flipIdx=opts.findIndex(o=>o&&o.flip);
  /* THE BOX SAYS THIS SEAT IS NO LONGER BEING ASKED — architecture item 9b. `setNeedsAction(false)` stood
     here, one statement before the clear, and renderPickPrompt's teardown below had no such line: two
     prompt renderers, one fact, two answers. panel("") drops the mark itself now (src/ui/panel.js), so both
     renderers say it the same way and neither says it twice. */
  const done=v=>{setFlipActive(null);delete $("actionPanel").dataset.pp4Stage;panel("");answer(v);};
  if(opts.some(o=>o&&o.stage))$("actionPanel").dataset.pp4Stage="1";
  if(flipIdx!==-1){
    if(!spec.battle&&window.__pp4)window.__pp4.flipMsg={m:msg||"",s:sub||""};   // same stash as the pure flip
    // same rule as the pure-flip path above: choosing the coin paints the spin at once
    setNeedsAction(true);armFlipTap(()=>done(flipIdx));
  }
  else setFlipActive(null);
  const rest=opts.map((o,i)=>({o,i})).filter(x=>x.i!==flipIdx&&x.i!==backIdx);
  const grid=rest.some(x=>x.o.cls)?" recipes":"";
  const backHtml=backIdx!==-1?backButtonHTML(backIdx):"";
  const subHtml=sub?`<div class="apSub">${sub}</div>`:"";
  /* playtest 21 item 7 — THE ARC IS FOR ACTIONS ONLY: a quantity is a slider, and it sits
     BETWEEN the message and the buttons — the narration-box reveal order (back, message, THIS,
     buttons, helper text), and a control that edits the message belongs with the message.
     sliderWrapHTML/wireSlider are the ONE definition (05-01 Task 3, MP-08). */
  const sl=spec.slider;
  const slHtml=sl?sliderWrapHTML(sl):"";
  // @copy prompt.plumbing.localask
  /* playtest 21 item 5 — aria-disabled, NOT the `disabled` attribute: a real <button disabled>
     fires no click at all, so the greyed circle could never say WHY when tapped. The row itself
     is optionButtonsHTML (02.1-03) — the one definition of what an option button is. */
  panel(`${backHtml}<div class="apMsg">${msg}</div>${slHtml}<div class="apBtns${grid}">`+
    optionButtonsHTML(rest.map(x=>({i:x.i,label:x.o.label,cls:x.o.cls,disabled:x.o.disabled,why:x.o.why,seat:x.o.seat,color:colors&&colors[x.i]})))+`</div>${subHtml}`,
    true);
  if(sl)wireSlider($("actionPanel"),sl);
  $("actionPanel").querySelectorAll(".apBtn,.apBack").forEach(b=>{
    // an option may carry a `short` label — the radial bloom shows the compact form (element
    // property, never a data-attribute: the short form is HTML with icon imgs in it)
    const o=opts[+b.dataset.i];
    if(o&&o.short!=null)b._shortHtml=o.short;
    if(isDisabledBtn(b)){
      // display-only for the DECISION (a greyed option can never be chosen), but not mute:
      // it answers for itself when asked.
      b.onclick=()=>showWhy(b);
      return;
    }
    /* {i,n} WHEN A SLIDER RODE ALONG, a bare index when not — one shape for both tiers. The
       host's ask() unpacks {i,n} and writes n into its own live ref (a no-op there, since
       wireSlider already wrote it); the guest's sendResponse puts it on the wire unchanged. */
    b.onclick=()=>done(sl?{i:+b.dataset.i,n:sl.ref.value}:+b.dataset.i);
  });
}
/* (THE ONE DOOR A LOCAL PROMPT COMES THROUGH — raiseLocalPrompt, Wyatt 2026-09-09 — stood here. It moved to
   src/ui/util.js in architecture item 3 (2026-09-16), with its whole note, so ask() in that file can go through
   the same door; it publishes who is being asked, never whose turn it is.) */
export function localAsk(msg,opts,colors,sub,extra){
  // a decision is landing in front of the player — the ff skip is over; when a recap is owed it
  // plays FIRST and the prompt builds after it resolves (no bubble/pill overlap, his rule).
  const pre=ffEndNow();
  // `extra` rides the re-entry too — the pre-W1 line dropped it, which silently lost a coin
  // slider if the skip recap fired on exactly that prompt (latent, never reported; fixed in the
  // move because leaving a known fault in a freshly-shared path helps nobody).
  if(pre)return pre.then(()=>localAsk(msg,opts,colors,sub,extra));
  // THE LOCAL RESPONSE MECHANISM — renderPickPrompt's localPickCell shape: a promise around the
  // ONE renderer, nothing else. The drawing all lives in renderAskPrompt above.
  return new Promise(res=>{renderAskPrompt({msg,opts,colors,sub,slider:extra&&extra.slider},res);});
}
export async function humanFlip(player,label,allowBack,sub,why){
  const opts=[{label:say("flip.button",{}),value:1,flip:true}];
  if(allowBack)opts.push({label:say("button.back",{}),back:true,value:"back"});
  // `sub` is the italic helper line beneath the buttons — used by the dock flip to explain what
  // the two faces of the coin actually pay (Wyatt, 2026-08-05).
  // @copy prompt.flip.fallback
  const v=await ask(player.idx,label||say("flip.ask",{}),opts,null,sub);
  if(v==="back")return "back";
  return flipFor(player,why);
}
/* ⭐ THE ONE TOSS — architecture item 6, 2026-09-17. A dock's flip (humanFlip above) and every flip of a fight (orchestrator.js
   asyncBattleRun, a captain's or a bot's) come here once the captain has tapped, or once a bot has simply decided to. There used to be
   three of these — humanFlip, the fight's hFlip and bFlip — each painting the spin, sleeping out the rest of it, broadcasting the face
   over its own wire node, holding, and clearing, so the two timing fixes below had to be made three times, and a watching screen heard
   the spin sound from the node AND from the small coin. Measured before: two starts in the same millisecond for a bot's fight flip on a
   solo phone; two starts 696ms apart on a crew guest watching the host's fight flip.
   THE RESULT IS DECIDED AT THE TAP, AND EVERY OTHER SCREEN HEARS OF IT AT ONCE (2026-09-13, kept): the engine records a coinflip event,
   which is published and drained immediately. Then this AWAITS THE DRAIN, which is where the flip is drawn on every screen — the one
   event consumer lands the big coin on the screen that tapped (board.js landFlipCoin) and throws the small coin everywhere else
   (dockcoin.js flipDockCoin) — so the flip's pacing is the drawing's own:
     · D-49, kept: the spin lasts FLIP_SPIN_MS from the frame the TAP painted it (flipSpinLeftMs), not a flat sleep from wherever this
       line happens to resume;
     · T-34 / playtest 13, kept: the landed face holds FLIP_LAND_HOLD_MS, the same hold the small coin waits out;
     · 2026-09-13, kept: no "Crustbeard flips HEADS!" line — the coin's own face is the answer.
   Through the drain, so fast-forward, pause and reload-replay behave exactly as before (a replay does not drain, and draws no coin). */
export async function flipFor(player,why){
  const h=appState.game.flip(player,why);
  publishNow();
  await liveRender();
  return h;
}
// v2 rule 3: fishing is gone entirely. fishCast() and its whole flip-for-coins path are deleted
// rather than left dormant — a function nothing calls is exactly the dead code the house rules
// exist to prevent. Coins now enter play only at a dock (rule 10) and by calling a battle
// correctly (rule 5). The sugarfish/candycrab art and the "fishing" sfx stay on disk in the
// shared assets/ and sfx/ at the repo root — the classic game at /classic reaches them as ../assets and ../sfx.
export function reachable(player){
  /* v2 rule 1: the gold squares a captain choosing where to sail is shown. Not computed here — Game.sailChoices is where a captain
     may sail this turn (the trade winds' rim included), and it is the SAME function this screen's own camera frames the turn from
     before these squares exist (ui/stage.js camFrameTurn), so the squares offered and the frame around them cannot differ
     (architecture item 18, 2026-09-17; scripts/qa/sail_frame_same_squares_check.mjs). */
  return appState.game.sailChoices(player);
}
// D-25/D-35 (Wyatt-approved 2026-07-29): the one sail-prompt message, shared by BOTH transports —
// composed once in pickCell() and rendered by the ONE converged renderer, renderPickPrompt()
// (02.15-02 Task 3), whichever tier calls it. Previously the guest path hardcoded its own separate
// sentence instead of rendering what the host composed, so the same player read two different
// prompts depending on whether they happened to be the host or a guest (D-35's sweep finding:
// guest-side code must render text, never author it).
/* A SELF-CHECK, run every time a human is shown their sail options.
   Wyatt reported being able to sail 3 squares upwind. Everything testable says that cannot happen:
   an independent brute force over every path of length <= 4 agrees with the game's own reachability
   on 1,920 board/position/wind combinations, click handlers are bound only to legal squares, and a
   highlight rect's centre is (c+0.5)*cellPx — identical to where ships are drawn, so nothing is
   displaced. I could not reproduce it, and rather than argue from a screenshot, this checks the
   invariant live, on his phone, at the exact moment he is looking at it.

   It re-derives the legal set from scratch — deliberately NOT by calling sailStates, since a bug in
   sailStates would then be compared against itself — and also compares the wind the COMPASS is
   drawn from (the current event) against the wind MOVEMENT is computed from (game.windNow), because
   if those two ever drift the player is being shown one wind and moved by another.

   Costs a few hundred node visits per prompt, i.e. nothing. If it ever fires, the message names the
   wind, the position and the offending squares — so the screenshot IS the bug report. */
export function sailSelfCheck(player,cells){
  const g=appState.game,wind=g.windNow;
  if(!wind||!player||!player.pos)return null;
  const passable=o=>!g.blocked(o)&&!g.isIsland(o)&&!g.isHome(o);
  // A BAKING captain is off the board (Game.inPlay: !done && !baking) — no storm moves them and
  // their square is a legal landing. This check predated the bake-off and still counted them as
  // occupying, so on a bake day it flagged the (correct) squares beside Tortuga as illegal —
  // Wyatt's DAY-15 screenshot, wind N at 10,9, cells 8,7/7,8: both held baking captains. The
  // engine was right; the check was stale.
  const occupied=o=>g.players.some(q=>q!==player&&!q.done&&!q.baking&&q.pos[0]===o[0]&&q.pos[1]===o[1]);
  const origin=player.pos.join(",");
  const legal=new Map();
  const walk=(cell,len,usedUp,hitRim)=>{
    if(len>0){
      const cap=usedUp?SAIL_RANGE_UPWIND:SAIL_RANGE,k=cell.join(",");
      if(len<=cap&&!occupied(cell)&&k!==origin&&(!legal.has(k)||legal.get(k)>len))legal.set(k,len);
    }
    if(len>=SAIL_RANGE||hitRim)return;
    for(const dk of Object.keys(DIRS)){
      const d=DIRS[dk],o=[cell[0]+d[0],cell[1]+d[1]];
      if(!passable(o))continue;
      const u=usedUp||dk===OPPOSITE[wind];
      if(len+1>(u?SAIL_RANGE_UPWIND:SAIL_RANGE))continue;
      walk(o,len+1,u,g.onRim(o));
    }
  };
  walk([player.pos[0],player.pos[1]],0,false,false);
  const bad=(cells||[]).filter(c=>!legal.has(c[0]+","+c[1]));
  const ev=g.events[appState.evIdx];
  const dialWind=(ev&&ev.wind)||wind;
  const problems=[];
  if(bad.length)problems.push(`illegal: ${bad.map(c=>c.join(",")).join(" ")}`);
  if(dialWind!==wind)problems.push(`compass shows ${dialWind}, movement uses ${wind}`);
  if(!problems.length)return null;
  console.error("[sail self-check]",{wind,dialWind,pos:player.pos,bad,cells});
  return `⚠️ SAIL BUG — screenshot this: wind ${wind} at ${player.pos.join(",")} · ${problems.join(" · ")}`;
}
/* W2-8 (Wyatt, 2026-08-27): "'Tap to sail' -> 'Tap square again to sail trade winds'". A blue
   square is the ONE square in the set that does not commit on the first tap — sweepGuard()
   (src/ui/stage.js) swallows that tap to draw the ride preview, and only a second tap sails. That
   is a deliberate exception to the one-tap gesture and his own pick (2026-08-13), but nothing on
   screen said so, so the confirming tap had to be found by accident.

   WHY THE CLAUSE IS CONDITIONAL rather than replacing the line outright. `cells` is a whole SET and
   it is usually mixed: an amber square commits at once, a blue one does not. A line that told every
   prompt to "tap the square again" would be false for every amber square in it — worse than saying
   nothing. So the clause is added only where a blue square is actually on offer, which is only
   within reach of the rim rather than every turn.

   THE GRAVEYARD, because this is the SECOND sentence written on this card (rule 10). The first —
   sailGuideLine()'s "Blue squares are the trade winds — land there and the current carries ye on" —
   was deleted at playtest 22 item 2: "Remove it entirely — it's too long, it blocks the board, and
   it appears every time." All three objections are answered on purpose: this clause is short, it
   rides the existing line instead of adding a second one, and it appears only beside a blue square.
   It also carries only the fact the BOARD CANNOT TEACH — the channel is tinted and the arrows flow
   along it, so what blue MEANS is already shown; that it takes two taps is not.

   ONE PREDICATE, NOT TWO. `g.onRim` is the same call sailHighlightRect() makes to decide whether to
   paint the square blue at all, asked of the same `cells`, so the sentence and the colour cannot
   disagree — there is nothing left to keep in step. And the line is built ONCE, here, on the
   deciding device and shipped in spec.msg, so host and guest read the identical words.

   `cells` is optional: renderPickPrompt's version-skew fallback calls this with a seat alone (see
   its comment below), and that path degrades to the plain line rather than guessing.

   STILL "tap", NOT "click", and that is a KNOWN GAP rather than a choice: D-40's verb helper
   (holdVerb(), src/ui/stage.js:445) is private to that module, so there is no shared way to say
   tap-or-click from here. Re-testing `matchMedia("(pointer: coarse)")` in this file would be a
   second copy of the same rule to keep in step. Export holdVerb() and both lines can read it. */
export function sailPickMsg(seat,cells,base=say("sail.tap",{})){
  // v2 rule 2: sailing is FREE, so the (−1🌕) parenthetical is gone.
  /* `base` IS THE ONLY THING THE PILOT REPLACES, and its DEFAULT is the shipped clause — so every
     existing caller, and the wire payload, get byte-for-byte the line this built before.
     The captain's name is composed here at every rung: a situational fact, not teaching. */
  /* ⭐ THE TWO-TAPS CLAUSE LEFT THIS LINE ON 2026-09-11 — his note 3: "should be a rung on the
     tutorial ladder -- not always present." It is the "sail.twotap" ladder now, added by
     withTwoTapRung() on the device that is LOOKING (renderPickPrompt), because the tutorial is per
     device and this line travels on the wire: built here, a veteran host would have spoken for — or
     silenced — a first-time guest. */
  // /4 playtest 6: one line — the card must stay small
  return say("sail.ask",{name:pn(seat),what:base});
}
/* The sail line, plus the two-taps rung when THIS device's ladder still has one and a blue square
   is actually on offer — the same g.onRim test sailHighlightRect() paints blue with, so the words
   and the colour cannot disagree. Spends one sighting. */
export function withTwoTapRung(msg,cells){
  const g=appState.game;
  const swept=!!(g&&g.onRim&&(cells||[]).some(c=>c&&g.onRim(c)));
  if(!swept||!pilotSpeaks("sail.twotap"))return msg;
  const rung=pilotMsg("sail.twotap","");
  pilotSee("sail.twotap");
  if(!rung)return msg;
  // a line that already ends in a stop takes a second sentence; otherwise the dash joins them
  return /[.!?]$/.test(msg)?`${msg} ${rung}`:`${msg} — ${rung.charAt(0).toLowerCase()}${rung.slice(1).replace(/\.$/,"")}`;
}
/* THE SAIL CARD, BUILT ONCE. 02.15-01, the narrow half — see renderPickPrompt (02.15-02 Task 3,
   THE TRACER) for the wide one, which converged the ORCHESTRATION around this same builder.
   The host's localPickCell() and the (now-retired) guest's remotePickHighlights() used to each
   write this markup out by hand, and the two copies had already drifted: the guest's had no
   .apSub at all, so the sail self-check's red shout could not be shown on a guest even in
   principle. That is the same drift class 02.1-03 closed for the option row with
   optionButtonsHTML, and the same answer — one builder, so there is nothing left to keep in step.
   The .apSub is LAST, per the standing top-to-bottom reveal rule for anything in #actionPanel. */
export function sailPanelHTML(msg,hint){
  // @copy prompt.sail.pickpanel
  /* ITEM 21 REDESIGN (Wyatt, 2026-08-24): "when sailing, there is never a 'stay put' button UNTIL
     the player taps their own boat. then the normal Stay Put button appears." So the button ships
     hidden; the yellow stay square behind the boat (renderPickPrompt) and a tap on the boat itself
     (stage.js's pointer handler) are the two doors that reveal it. The Aye/Keep-sailin' confirm
     pair is deleted outright — his call: "Get rid of the Aye Stay Put and Keep Sailin' button
     flow entirely" (the Keep sailin' circle broke the consistent-back-button value). */
  /* THE RED SHOUT IS NO LONGER DRAWN (Wyatt, 2026-08-25: "I don't care about the red shout at all
     — it's not useful any more"). It was never what it looked like: not the game explaining a
     refused move, but a developer alarm that fired only when the highlighted squares disagreed
     with sailSelfCheck()'s independent re-derivation of the sail rules. In three years of his
     playing it has never once spoken, because the two have never disagreed on his screen.
     sailSelfCheck() ITSELF STAYS and still console.error()s — it costs a player nothing, it is the
     only thing that would catch a genuine "I sailed 3 upwind" fault, and it was red-proofed on
     2026-08-25 (silent on a real board; fires on an impossible square). What is gone is the
     player-facing red text. `hint` stays in the signature and on the wire so the spec shape and
     the guest payload are unchanged. */
  /* THE HINT SLOT DRAWS AGAIN — but it is no longer the red shout, and that distinction is the
     whole of this change. Wyatt deleted the shout's TEXT on 2026-08-25 ("I don't care about the
     red shout at all — it's not useful any more") while the parameter was deliberately kept on the
     wire so the spec shape and the guest payload stayed unchanged. That dormant, already-crossing-
     the-wire field is now the Pilot's helper line — no new field, no new parity risk, and the
     guest reads exactly what the host composed.
     sailSelfCheck() still runs and still console.error()s; what it produces no longer rides here,
     so a self-check failure can never again become player-facing red text. See pickCell().
     LAST IN THE MARKUP, per the standing top-to-bottom reveal rule for #actionPanel: back button,
     message, buttons, helper text. */
  const sub=hint?`<div class="apSub">${hint}</div>`:"";
  return `<div class="apMsg">${msg}</div>`+
    `<div class="apBtns"><button class="apBtn" id="apStay" style="display:none">${say("sail.stay",{})}</button></div>`+
    sub;
}
/* THE WIND HINT IS GONE (Wyatt, 2026-08-25): "Remove the sail prompt saying wind blows east
   entirely because the game calculates this for you." It was ALREADY invisible — `sailWindHint()`
   was exported and never called by anything in 4/src, so the sentence it built had not rendered
   for as long as that was true. Deleted rather than left as a function nobody calls, which is its
   own small trap: the next reader finds it, assumes it ships, and reasons about copy the player
   has never seen. The wind ribbon above the board still names the direction and the forecast. */
// G25 (Wyatt-approved 2026-07-30, D-55 PULLED FORWARD): THE ONE PLACE that decides what a sail
// square looks like. Asked whether the four host/guest drifts were structurally fixed so they
// cannot drift again, he said: "yes, add it and pull D-55 forward." Deferred to Phase 16 twice; it
// was the last of the four never fixed at all.
//
// THE GAP, MEASURED. The host drew rx:6, fill #ffc23a, the sailCell class and a per-square
// animation-delay stagger. The guest drew rx:5, fill:#fdb63d, opacity:.4 and NO CLASS AT ALL — so a
// guest's move options were a different orange, dimmer, didn't pulse, didn't respond to the cursor
// and ignored prefers-reduced-motion. Two players in one game looked at materially different boards.
//
// FIXED BY CONSTRUCTION, NOT BY COPYING ATTRIBUTES. Copying the host's attribute list into the
// guest is the same "match by discipline" that produced four drifts; one builder means there is
// nothing left to keep in sync. Same reasoning as sailPickMsg() above, which this sits beside —
// the established home for "the one thing both transports share". Each caller keeps its own
// click handler and its own hs.push(r); only the RECT is shared.
//
// THE INLINE fill STAYS, and that is load-bearing: .sailCell sets opacity, animation,
// transform-box/origin and transition but does NOT set fill (verified at index.html:424-426), so
// dropping the inline fill would give BOTH boards default-black squares. If .sailCell ever gains a
// fill, re-derive this — scripts/host_guest_parity_check.js and this comment are the only warning.
// The guest's old opacity:.4 goes: .sailCell supplies .5 and the keyframes animate it.
// UI-03: the highlight is 10% smaller than it was. The old geometry was a flat 2px inset
// (width: cellPx-4); SAIL_HL_SCALE shrinks that square about its own centre, so the inset is
// derived rather than a second hand-tuned number that could drift from the scale.
//
// Deliberately changed HERE and only here. This builder is G25's shared host/guest surface — the
// entire reason it exists is that the two boards used to drift — so a size change made in one
// renderer would recreate D-55 exactly. scripts/host_guest_parity_check.js asserts they stay one.
//
// The CSS bounce ratio (scale 1 -> 1.11) is left alone on purpose: "10% smaller" reads as the
// resting size, and rescaling the animation too would flatten the bounce rather than shrink it.
const SAIL_HL_SCALE=0.9;

// playtest 20 (Mando: "I was stuck here for 3 turns trying to get milk. Just couldn't get to the
// dock from this direction since I didn't want to get stuck in the trade winds").
//
// She could SEE the dock and had no way to find out, before spending a turn, either that the blue
// squares would carry her off or that no square she could reach that day actually reached the
// berth. Both facts are cheap and EXACT — nothing here is estimated:
//   - a swept square is g.onRim(c), the same predicate that draws it blue;
//   - /4 runs singleDock (roundCfg), so "can I dock for milk this turn" is literally
//     "is dockOf.dairy one of the squares I may sail to" — a set membership test, not a route
//     search. Deliberately NOT sailTurns(): that is the bots' comparison heuristic and a
//     straight-line estimate that models neither the islands nor the rim ride, so quoting it as
//     "days" would put a confident wrong number in front of the player.
//
// CORRECTION (Wyatt, 2026-08-13): an earlier version of this note called the rim "impassable".
// It is not, and the distinction matters for anything built on top of this. The rim is a LEGAL,
// DELIBERATE move — sailStates' own `throughRim` option exists precisely so "a human may
// deliberately ride the trade winds". What was true then was narrower: bots never chose it — a bot-routing decision, not a rule,
// and it was changed (bots ride the current since 2026-08-13). Every ship's sail, a bot's or a person's, now goes through
// Game.sailTo with the rim allowed (architecture item 7); the bots' route request that still said throughRim:false is gone.
// A wrong reason is what the next change gets built on — see HARD-WON-LESSONS section 5.
/* THE SAIL CARD CARRIES NO HELPER LINE AT ALL — playtest 22 items 2 and 9 (Wyatt).

   sailGuideLine() had exactly two things to say and he cut both:

     "Blue squares are the trade winds — land there and the current carries ye on."
        -> "Remove it entirely — it's too long, it blocks the board, and it appears every time."
           The board teaches this better than the sentence does: the channel is tinted, the arrows
           flow along it, and a ship that lands there is visibly swept.

     "<crate> lies N squares off — no square ye can reach this day sits on that dock."
        -> "the helper text is stupid and unhelpful: 'fresh milk lies 0 squares off' makes no
           sense." It is worse than unhelpful, it is WRONG: `man(player.pos, dock)` is the distance to
           the DOCK SQUARE, and a captain moored on that very square measures 0 while being told
           nothing he can reach sits on it.

   With both gone the function could only ever return null, so it is deleted rather than left
   returning nothing — a helper nothing can be said by is dead code. The self-check's red shout is
   NOT this and stays: it is a bug report, not a hint. */
export function sailHighlightRect(c,cellPx,svg){
  // playtest 20: an HTML div in #sailHost, NOT an SVG rect. UI-06's bounce animates transform:
  // scale, and on an SVG element that forces a full layout every frame — measured as the whole of
  // the board's idle cost (60.1 layouts/sec from the transform alone; zero from the opacity).
  // This is PERF-01's fix applied a second time, to the same root cause it named for the ripples.
  // The LOOK is unchanged; only the element type moved (Wyatt, 2026-08-13).
  //
  // #boardwrap is container-type:inline-size, so 640 board units == 100cqw and the geometry is
  // identical to the rect this replaces — same SAIL_HL_SCALE inset, same rounded corner, same
  // position — with no scale factor to keep in sync on resize.
  //
  // `svg` is still accepted so both call sites keep their signature, and is deliberately unused:
  // the host outlives any one prompt, and callers dispose of squares with .remove() either way.
  const side=(cellPx-4)*SAIL_HL_SCALE, inset=(cellPx-side)/2;
  const CQ=v=>(v/640*100)+"cqw";
  const host=$("sailHost")||$("boardwrap")||document.body;
  const d=document.createElement("div");
  d.className="sailCell";
  d.style.left=CQ(c[0]*cellPx+inset); d.style.top=CQ(c[1]*cellPx+inset);
  d.style.width=CQ(side); d.style.height=CQ(side);
  /* two delays, one per animation in .sailCell's list, and they are the SAME: the breathing starts as the square pops, so it rolls
     outward from the boat the way the pop did (renderPickPrompt sets --sailPopDelay). It used to be staggered by ((x+y)%4)*120ms, a
     diagonal stripe pattern that had nothing to do with the boat — the "horribly jagged" half of his 2026-09-16 note (index.html). */
  d.style.animationDelay="var(--sailPopDelay, 0ms), var(--sailPopDelay, 0ms)";
  // THE GRID COORDINATES, CARRIED. Two readers used to recover these by inverting the maths above
  // (camFrameTurn and the trade-wind preview, both in src/ui/stage.js) — a second copy of this
  // function's arithmetic that had to be kept in step with it by hand. They read these instead.
  d.dataset.gx=c[0]; d.dataset.gy=c[1];
  // playtest 20 (Mando): a square in the trade-wind rim does not park you there — the current
  // sweeps you to that arc's clockwise end (RULES-V2 line 24). It used to be drawn in exactly the
  // same amber as a square that simply parks you, so the one square that costs the rest of your
  // turn looked identical to the safe ones. The engine already knows both halves.
  const g=appState.game;
  if(g&&g.onRim&&g.onRim(c)){
    d.classList.add("sailSwept");
    const h=g.rimHead&&g.rimHead[c[0]+","+c[1]];
    if(h)d.dataset.sweptTo=h[0]+","+h[1];
  }
  host.appendChild(d);
  return d;
}
// THE TRACER's converged renderer (02.15-02 Task 3, D-25/PAR-14). ONE function, named directly by
// the host's local response mechanism (localPickCell, below) AND by a guest's watchPrompt listener
// (src/orchestrator.js's kind==="pick" branch) — nothing else draws a sail window. Draws the
// highlighted squares and the sail card, wires their clicks to `answer`, and tears everything down
// (squares removed, panel cleared, appState.currentPrompt cleared) BEFORE calling `answer`, never
// after — same teardown-before-resolve shape sendResponse's own comment describes for the ask
// channel. Knows nothing about Firebase, promises or seats: it imports nothing from src/net/, by
// construction (T-02.15-01) — the local caller below never lets this renderer anywhere near a
// writer, which is what keeps a solo game (db===null) alive on this path.
// Returns its own teardown so a caller that needs to abandon an unanswered prompt can do so
// without waiting for or forcing this renderer's own promise. (While the shot clock lived, its
// expiry was the one registered caller — activePickCleanup, a LOCAL-caller concern; the clock
// left 2026-08-28 and the teardown return survives it for the clock's return.)
/* THE ONE BROOM for the one sail window. This renderer is the ONLY thing that draws sail squares
   (the parity gate insists on exactly one call site of sailHighlightRect), so any .sailCell alive
   when it is asked to draw — or when a prompt is cleared remotely — is stale by definition and is
   swept. Why this exists (Wyatt, on the Glass, 2026-09-01: the guest camera "FULLY zoomed out,
   and stay that way, until the guest refreshes"): teardown only ever removed the squares its own
   call created, the guest's caller discards the returned teardown, and watchPrompt's clear branch
   never touched squares at all — so a re-delivered or remotely-cleared prompt orphaned a whole
   window in #sailHost forever. Harmless-looking until the containment pass (sailContainTick,
   2026-09-01) started honestly framing every square it could see: orphans pinned the camera at
   the 640 full-ocean cap, re-fought every glide, every turn. One broom, called by both paths, so
   the two cannot drift (rule 23). Gate: scripts/qa/sail_window_single_check.mjs, proven RED
   against the pre-fix build (8 squares after a double render; 4 orphans after answering). */
/* ⭐ THE SQUARES POP IN FROM THE BOAT OUTWARD, AND THE ONE YOU TAP SQUISHES AND FLASHES — both PASSED on his game feel
   audit (2026-09-13), as proposed: "The nearest squares appear first and the farthest last, over a quarter second — the
   reach reads as distance." · "A quick squash and a bright ring on the square you chose, before the boat leaves."
   `scale`, not transform, so both compose with the squares' own looping bounce (sailBounce animates transform). The
   choice waits SAIL_PRESS_MS for its flash, and only goes through if its square is still on the board — a prompt cleared
   from elsewhere in that moment must not be answered by a tap it has already taken away. */
/* THE POP IS CSS (sailPop in index.html), started by a per-square --sailPopDelay — measured, a script animation left 2-5
   squares of every window showing at full for their first frame before its hidden start applied; a CSS animation with a
   backwards fill is resolved with the square's very first style, so nothing shows before its turn. */
/* ⭐ ONE NUMBER, AND A WAVE. Wyatt, 2026-09-16, on his tuner: "doesn't this var 'How long the whole cascade takes, nearest square to
   furthest' get calculated by multiplying 'One square's pop' by the number of squares? You shouldn't have 2 variables for this. Also,
   the sail squares in your animation seem like they're going radially, not outward from the boat. I want all squares that are the same
   distance from the boat to appear simultaneously as each other so the effect looks like a yellow wave flowing from the boat; not a
   radial pop in of squares."
   Both were right, and not only on the tuner: the game timed each square by its straight-line distance from the boat, so squares one
   sail apart popped at different moments and the pop spread like a circle. Now a square's RING is how many sails of water it is from
   the boat — squares on the same ring pop together — and each ring starts one pop after the ring before, so the whole wave takes a pop
   per ring. SAIL_POP_MS is the only number (index.html's sailPop reads it as --sailPopMs). 250 -> 375 -> 560 -> his 440 -> his 180. */
const SAIL_POP_MS=180, SAIL_PRESS_MS=180;   // was 440 — his tuner, 2026-09-16 (the step from one ring to the next)
/* A square's pop lasts SAIL_POP_RINGS rings' steps, so each ring is still springing when the next begins: a wave, not a staircase. A
   ratio, not a second number — his ruling was that the wave has one (index.html's sailPop has the whole story). */
const SAIL_POP_RINGS=3;
const sailReduced=()=>typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches;
function pressSailSquare(r){
  if(sailReduced()||typeof r.animate!=="function")return;
  r.animate([{scale:"1",opacity:.9,boxShadow:"0 0 0 0 rgba(255,255,255,0)"},
    {scale:"1.14 0.82",opacity:1,boxShadow:"0 0 0 3px #fff, 0 0 14px 5px rgba(255,194,58,.95)",offset:.4},
    {scale:"1.04",opacity:1,boxShadow:"0 0 0 2px #fff, 0 0 10px 3px rgba(255,194,58,.7)"}],
    {duration:SAIL_PRESS_MS,easing:"ease-out",fill:"forwards"});
}
export function clearSailWindow(){
  document.querySelectorAll(".sailCell").forEach(el=>el.remove());
}
/* Is a sail prompt open on THIS screen — its gold squares on the sea? The squares exist only on the screen being asked, and they
   leave through the prompt's own teardown or clearSailWindow() above. Read by the one event consumer: a dotted course drawn by an
   open sail prompt belongs to the turn being played, however late that turn's own event is drawn (orchestrator.js consumeEvent).
   HIS RULINGS ON THE COURSE: 2026-09-09 (quoted at the parrot-off teardown below) "on 'Polly' mode, the dotted line should appear for
   the whole game, not fade out"; 2026-09-10 (2b40b7bd, his SS1) "the dotted line is ONLY visible on the player's turn, and auto
   updates with their current location each turn"; 2026-09-11 (DECISIONS.md, playtest notes) "should disappear the moment your boat
   starts animatedly sailing". WHY THIS GUARD EXISTS IS A MEASUREMENT, NOT A RULING (architecture item 12, 2026-09-17): this screen's
   own open sail prompt IS "the player's turn" on that screen, and a crew guest's event feed can trail its prompt, so a late `turn`
   must not end that turn early — without the guard 1 of 3 slowed guest prompts lost its course; with it, 0 of 3. */
export function sailWindowOpen(){
  return !!document.querySelector(".sailCell");
}
export function renderPickPrompt(spec,answer){
  clearSailWindow();
  const svg=$("board"),hs=[];
  appState.currentPrompt=spec;
  /* forgetCourse, not clearCourse: this prompt is OVER, so there is nothing for the parrot to
     restore. Keeping the memory here would let a later toggle redraw a course for a sail that has
     already been made.
     ⚠ NOT WHILE POLLY IS ON — his 2026-09-09 ruling above. Wiping it here is the other half of why
     the line "faded out": even with the draw condition widened, every prompt teardown took the
     dashes off the water again, so the course flickered away between turns. With the parrot on, the
     next prompt redraws it from the LIVE game anyway, so leaving it up is both correct and
     continuous. */
  /* AND panel("") IS ALSO WHAT SAYS THIS SEAT IS NO LONGER BEING ASKED (architecture item 9b) — the mark
     the one narrator reads before it will say a word. It used to ride out on the box's CONTENT timer, 60ms
     after the tap, and a flight is recorded and narrated inside that window: the captain who chose to flee
     was the one screen never told, and on a host so was every other screen, because the host never reached
     the broadcast either. Nothing to add here; do NOT add a second setNeedsAction(false) beside it. */
  const teardown=()=>{hs.forEach(h=>h.remove());panel("");appState.currentPrompt=null;
    if(!pilotIsOn())forgetCourse();};
  const done=v=>{teardown();answer(v);};
  const cellPx=boardCell();
  /* ITEM 21: the yellow flashing square UNDER the captain's own boat — "to indicate that they may
     stay there too." It rides the same list, same builder, ONE call site (the parity gate's
     PARITY-SAILRECT-GEOM insists on exactly one, so a second renderer can never reappear — this
     stays inside it). It renders BEHIND the boat for free: #sailHost is z-index 2 and #boardShips
     is 4, Wyatt's own 2026-08-02 layering ("the sail highlights are below the ships"). Tapping it
     (or the boat above it — stage.js) reveals the hidden Stay put button rather than sailing,
     because staying is a decision, not a move. spec.pos is absent only across a version skew
     (an older host feeding a newer guest) — then there is simply no stay square, same degrade
     shape as the spec.msg fallback below. */
  const squares=(spec.cells||[]).map(c=>({c}));
  if(spec.pos)squares.push({c:spec.pos,stay:true});
  /* A SQUARE'S RING: sails of water from the boat, counted through the gold squares themselves (a flood from the boat's own square), so the
     wave flows AROUND an island instead of leaping it. A square the flood cannot reach (only across a version skew) takes its steps. */
  const ringOf=new Map(),key=c=>c[0]+","+c[1],gold=new Set(squares.map(({c})=>key(c)));
  if(spec.pos){
    const q=[[spec.pos,0]];ringOf.set(key(spec.pos),0);
    for(let i=0;i<q.length;i++){const [c,r]=q[i];
      for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const n=[c[0]+d[0],c[1]+d[1]],k=key(n);
        if(gold.has(k)&&!ringOf.has(k)){ringOf.set(k,r+1);q.push([n,r+1]);}}}
  }
  const reach=c=>ringOf.has(key(c))?ringOf.get(key(c)):(spec.pos?Math.abs(c[0]-spec.pos[0])+Math.abs(c[1]-spec.pos[1]):0);
  /* A TAP THAT DRAGGED THE BOARD IS NOT A CHOICE. Wyatt, 2026-09-15: "When the player clicks /taps a sailable yellow square and drags
     the board, that should not count as them choosing that square to sail to... Many times I've tried to move the board and ended up
     accidentally moving to the square I tapped purely to move the board." His pick when asked was to ignore drags rather than add a
     confirming tap, so one tap still sails and no turn costs an extra tap. 10px is the slop a still finger leaves on a touch screen. */
  const DRAG_SLOP_PX=10; let downAt=null;
  const dragged=e=>{const d=downAt;downAt=null;return !!(d&&Math.hypot((e.clientX||0)-d[0],(e.clientY||0)-d[1])>DRAG_SLOP_PX);};
  let chosen=false;
  squares.forEach(({c,stay})=>{
    const r=sailHighlightRect(c,cellPx,svg);
    r.style.setProperty("--sailPopDelay",(reach(c)*SAIL_POP_MS)+"ms");
    r.style.setProperty("--sailPopMs",(SAIL_POP_MS*SAIL_POP_RINGS)+"ms");
    // it grows out of its edge nearest the boat, so the scales unroll away from the ship rather than swelling in place
    if(spec.pos)r.style.transformOrigin=`${50-50*Math.sign(c[0]-spec.pos[0])}% ${50-50*Math.sign(c[1]-spec.pos[1])}%`;
    if(stay){
      r.classList.remove("sailSwept");delete r.dataset.sweptTo;
      r.classList.add("pp4StayCell");
      r.addEventListener("pointerdown",e=>{downAt=[e.clientX,e.clientY];});
      r.addEventListener("click",e=>{if(dragged(e))return;pressSailSquare(r);const b=$("apStay");if(b)b.style.display="";});
    } else {
      r.addEventListener("pointerdown",e=>{downAt=[e.clientX,e.clientY];});
      r.addEventListener("click",e=>{
        if(dragged(e))return;
        if(chosen)return;
        chosen=true;
        pressSailSquare(r);
        if(sailReduced()){done(c);return;}
        setTimeout(()=>{if(r.isConnected)done(c);else chosen=false;},SAIL_PRESS_MS);
      });
    }
    hs.push(r);
  });
  // The wind hint goes in .apSub — last in the DOM, so it is revealed last, per the standing
  // top-to-bottom reveal rule for anything added to #actionPanel.
  // FALLBACK RESTORED (02.15-REVIEW WR-02): the retired remotePickHighlights() fell back to
  // sailPickMsg(mySeat) for an older host payload with no msg field, "so a mid-game version skew
  // still reads sensibly." THE TRACER dropped it when both callers converged on this one renderer.
  // pickCell() always populates spec.msg locally, so this never fires on the tracer's own path —
  // it only guards a guest on a stale build receiving a payload from a host on a newer one (or the
  // reverse), which docs/GIT-AND-DEPLOY.md's mid-session ship-to-live model makes a real scenario.
  // Pure plumbing: no currently-reachable call passes a falsy spec.msg, so today's rendered text is
  // unchanged.
  /* ── THE PILOT SPEAKS HERE, on the device that is actually looking ──────────────────────────
     This renderer runs on whichever machine draws the prompt, for both tiers, which is exactly the
     property the Pilot needs: the count is per device, so a first-time guest gets rung 0 while a
     veteran host reads the line it always read.
     AT THE BOTTOM RUNG NOTHING IS RECOMPOSED — spec.msg, straight off the wire, byte-identical.
     Only above it does this device build its own longer line, and `sailPickMsg` composes it from
     the same parts (the name, the swept clause) so the two can never drift. */
  const seat=spec.seat!=null?spec.seat:(appState.mySeat??0);
  const rung=pilotLine("sail.pick",say("sail.tap",{}));
  const teaching=pilotRung("sail.pick")<pilotDepth("sail.pick")-1;
  const msg=withTwoTapRung(teaching?sailPickMsg(seat,spec.cells,rung.msg):(spec.msg||sailPickMsg(seat,spec.cells)),spec.cells);
  panel(sailPanelHTML(msg,rung.sub||null),true);
  /* THE ONWARD GUIDE RETIRES ON THE SAME DIAL AS THE WORDS — no second thing to remember to turn
     off. While the sail ladder still has a rung to give the course is drawn; when it reaches the
     bottom it stops with it. Drawn for the captain whose prompt this is, from the position the
     SPEC carries — never this client's own players[].pos, which on a guest is a stale render
     shell (the same rule the stay square already follows). */
  const who=appState.game&&appState.game.players?appState.game.players[seat]:null;
  /* ⭐ WITH POLLY ON, THE COURSE IS DRAWN FOR THE WHOLE VOYAGE — Wyatt, 2026-09-09: "I think on
     'Polly' mode, the dotted line should appear for the whole game, not fade out."
     ⚠ THIS WIDENS THE CONDITION FROM `teaching` TO `pilotIsOn()`, AND THE TWO ARE NOT THE SAME.
     `teaching` is "this rung still has words for ye" — it goes false the moment a ladder bottoms
     out, which is by design for TEXT (the tutorial wears off rather than ending). The dotted course
     is not text. It is a picture of where this recipe sends ye, and his ruling is that a captain who
     has left the parrot on wants it every turn, not for the first three. So the words still decay
     on their own ladder and the picture no longer decays with them. */
  if(pilotIsOn()&&who&&spec.pos)
    showCourseFor(appState.game,{...who,pos:spec.pos},svg,cellPx);
  /* forgetCourse only when the parrot is OFF: nothing left to restore, and a later toggle must not
     resurrect a course for a sail already made. */
  else forgetCourse();
  pilotSee("sail.pick");
  $("apStay").onclick=()=>done(null);
  /* THE CAMERA REQUEST RIDES WITH THE SQUARES — rule 23's converge move, and the missing half of a
     guest's sail prompt. THE SCREEN DRAWING THE SQUARES IS THE SCREEN BEING ASKED, which is why this
     call passes local:true (architecture item 46): the one turn-frame door frames a sail window here
     and that captain's boat on every other screen.
     camFitSail() (camFrameTurn now) had exactly ONE caller: pickCell(), which runs on the machine
     running the ENGINE. In a crew game that is the HOST — so a guest drew its squares and nobody
     ever asked the director to frame them; its camera sat wherever the last narration's camToSeat()
     glide (640/1.9 — the 336.84-unit window in every probe trace) had parked it, and whichever
     square fell outside that window could not be tapped. Measured 2026-09-01 (posed, seed 7, room
     ZTNK): square (3,8) at x=-23 on a 390px guest, centre outside, elementFromPoint = nothing.
     Whoever DRAWS the squares asks for the frame — one renderer, both tiers, so the request cannot
     fork again. spec.pos is the authoritative boat square (the stay-square rule above) — never this
     client's own players[].pos. After panel(), so camFrameTurn's reserve measures the real pill; a
     zero-delay beat, because unlike pickCell's call the squares here are already in the DOM. */
  if(window.__pp4)setTimeout(()=>window.__pp4.turnFrame(seat,spec.pos,true),0);
  return teardown;
}
export function pickCell(player,cells){
  if(appState.replaying){
    if(appState.dlogIdx<appState.dlog.length){
      appState.dlogN++;
      const rec=appState.dlog[appState.dlogIdx++];
      /* A RECORDED SQUARE ONLY MEANS ANYTHING AGAINST THE BOARD THAT WAS ACTUALLY REBUILT — and it is checked where EVERY square is
         checked now, live or replayed: Game.sailTo (a sail, Move instead, a flight through Game.flee) writes nothing for a square the
         captain may not sail to, so a diverged replay stays put rather than teleporting. That check lived HERE, for replays alone,
         while a live square went in unchecked; one check at the write is architecture item 7's. */
      return Promise.resolve(rec==null?null:rec);
    }
    endReplay();
  }
  // /4 stage: frame the whole sail window once the highlight cells exist (they are drawn just
  // after this call returns its promise — a beat later is soon enough for a lerping camera).
  // player.idx, NOT the viewer: on a spectating host this used to frame the HOST's own ship at the
  // start of every guest's turn (Wyatt, 2026-08-20). See camFrameTurn() in ui/stage.js.
  // SINCE 2026-09-01 the client that DRAWS the squares frames them from renderPickPrompt itself
  // (which is what fixed the guest, who never reached this line — pickCell runs on the engine's
  // machine). This call remains for the client that does NOT run that renderer: the spectator,
  // whose empty cell list collapsed the same fit to "frame the asked captain's ship" — and which asks for
  // that ship by name now, one rule for every watching screen (architecture item 46).
  /* (The host used to frame this captain's sail window from right here — the engine machine only, so a
     guest's camera never framed anybody's sail but its own. The frame is decided by the one event
     consumer on the `turn` event now, on every device; see consumeEvent, 2026-09-13 note 6.) */
  // @copy misc.draftwait.sailchoosing
  // D-10 DELIVERY (F7): same conversion as ask() — the spectator line is the neutral broadcast and
  // the ACTOR's variant is the empty string (their own board highlighting is their feedback). This
  // used to branch on appState.mySeat, which is the HOST's seat, so one client's answer was sent to
  // the whole table and no guest ever saw "is choosing where to sail".
  // {wait:true} — ITEM 19, and the half Stage 1 missed. Wyatt, 2026-08-20, from a two-window
  // screenshot: "the narration line that says 'waiting for wy to sail' disappeared before they
  // sailed. bad." This was an ORDINARY narration, so it retired on the hold deadline (6.75s ceiling)
  // whether or not the captain had moved — and what a spectator was left with is a board and no
  // explanation, which is the exact complaint item 19 is. Stage 1 built the no-deadline wait line
  // and wired it to the recipe draft; this per-turn line never got it. Fire-and-forget, so it meets
  // the flag's stated safety condition (see stageFlash's note: a wait line must never be awaited).
  netHandlers().onBroadcast(sayAll("wait.sailing",{p:seat(player.idx)}).html,[{seat:player.idx,html:""}],{wait:true});
  /* EVERY CAPTAIN'S SQUARES ARE CHECKED, NOT JUST THE ONES ON THIS DEVICE. G6 (Wyatt-approved
     2026-07-30) is "yes, build this check and apply it to all situations", and it was applied to
     one: sailSelfCheck ran inside localPickCell, so it covered a captain whose decision is LOCAL
     and silently skipped every remote one. The host builds a guest's `cells` with the same
     reachable() call and then shipped them over the wire unchecked — and the guest's renderer had
     no .apSub to shout into even if it had been checked. So the report this whole check exists for
     ("I sailed 3 squares upwind") is exactly the report a guest cannot generate.
     Hoisted here, ahead of the fork, where the answer is the same for both tiers by construction.
     It is a pure read — geometry over the live game, no RNG, no mutation — so it is safe on the
     host's authoritative state and cannot fork the determinism stream. */
  const bug=sailSelfCheck(player,cells);
  // THE TRACER (02.15-02 Task 3): ONE spec, built ONCE, handed to BOTH branches — the local render
  // and the remote wire payload can never drift apart because they are literally the same object.
  // kind/cells/msg/hint/pos on the wire — id and seat keep being stamped by remotePrompt()
  // (orchestrator.js), never added here. `pos` (item 21) is the captain's own square, carried so
  // the renderer can draw the stay square on BOTH tiers from the same authoritative value — a
  // guest's game.players[].pos is a stale render shell and must never be read for this.
  // `cells` is handed to sailPickMsg for W2-8: the line says a blue square takes two taps only
  // when one of THESE squares is a blue one. Same list the renderer is about to colour.
  /* `bug` no longer rides on the wire. It was `hint:bug||null` and NOTHING RENDERED IT — the
     player-facing red text went on 2026-08-25 and the parameter was kept only to hold the payload
     shape steady. Now that sailPanelHTML draws `hint` again, leaving the shout in it would quietly
     restore the very text he deleted, on the one path he would never see it coming. sailSelfCheck
     still runs above and still console.error()s, which is the whole of what he kept. */
  if(bug)console.warn("sailSelfCheck:",bug);
  /* ⚠ NOTHING THE PILOT SAYS GOES ON THE WIRE, AND THAT IS A RULE RATHER THAN A TIDINESS.
     The spec below is built on the machine running the ENGINE — the HOST in a crew game. If the
     rung were chosen here, a veteran host would silence a first-time guest: the whole point of the
     Pilot being per device is that a guest who has never sailed gets help the host does not need.
     So the wire carries the SHIPPED line, exactly as it does today, and each device applies its
     own rung in renderPickPrompt — the one renderer both tiers already share.
     That also makes gate 3 ("no rung string reaches netSetNarr") true literally rather than by
     argument, and it keeps D-35 intact: the guest still RENDERS what the host authored, then adds
     a presentation layer of its own that emits no event.
     `seat` is stamped so the renderer can re-compose the line without guessing whose turn it is;
     remotePrompt() in orchestrator.js already stamps the same field, so the payload shape is
     unchanged. */
  const spec={kind:"pick",seat:player.idx,cells,msg:sailPickMsg(player.idx,cells),hint:null,pos:[player.pos[0],player.pos[1]]};
  const base=decisionIsLocal(player.idx)?localPickCell(player,spec)
    :netHandlers().onRemotePrompt(player.idx,spec);
  return base.then(c=>{netHandlers().onLogDecision(c);return c;});
}
/* ================= the bake-off's decision seam =================

   bakeoffPrompt(player,setup,fallback) — one captain's attempt, made REPLAYABLE and CLOCKED. It is
   pickCell()'s shape, and it exists for a specific failure rather than for symmetry.

   REPLAY. Without a logged decision, a solo refresh mid-bake would re-run the attempt with the
   engine's own botGuess instead of what the player actually did. That is not a cosmetic difference:
   a different answer locks different bowls, and the NEXT shuffle draws only from the unlocked ones,
   so the r() stream diverges from that point and the rest of the voyage is a different game.

   THE CLOCK IS GONE — WYATT'S RULING, 2026-08-18: the finish line gets AS LONG AS IT NEEDS
   (04-01 Task 4, MP-13). A bake is the one decision in this game that is a puzzle rather than a
   choice, and timing a memory test rewards reflex over memory.

   WHAT WENT WITH IT, because removing a mechanism means removing what fed it: the `armed` promise,
   the `onArm` callback that playBakeoffLive used to fire the moment the bench became answerable,
   the belt that settled `armed` when the bench failed to render, and the withShotClock wrapper
   itself. Leaving that scaffolding standing is how dead branches get built — and every line of it
   existed only to solve "the 30s window must not start during 4.5s of animation", a problem that
   no longer exists.

   THE SAFETY NET IT USED TO BE IS REPLACED, NOT DROPPED, and the two halves ship together or
   neither does. The clock was the only thing stopping an absent captain hanging the table, so the
   fallback now fires on PRESENCE LOSS instead: a remote captain's own client arms an onDisconnect
   write to the response node when their bench opens (netForfeitOnDisconnect, src/net/writers.js),
   the server fires it if the tab closes, and the tail below sees a null and forfeits to the
   engine's own guess having bought nothing — the same one entry a completed bake writes.

   PASS THE DEVICE FIRST. A bake is a whole turn, but it is not taken through takeTurn — and takeTurn
   is where every other handoff happens. Without a gate, pass-and-play hands the bench to whoever last
   held the board: the preview would play in the wrong person's hands, and two captains baking on the
   same day would get no handoff between them at all. THE GATE MOVED UP ONE CALL, into bakeTurnLive
   (src/orchestrator.js), in architecture item 3 (2026-09-16): the engine now records that a baking
   captain's turn has begun (Game.bakeTurn), and the screen must not change captain before the device
   has changed hands — so the hand-over has to come before that record, which is made for bots and
   humans alike, before this prompt is ever reached.

   THE REMOTE PATH EXISTS NOW (04-01 Task 2, MP-04). The note that stood here said there was none,
   and it was right when it was written: *"This is all built for v2 which doesn't have multiplayer"*
   (Wyatt, 2026-08-08), and a remote branch would then have been unreachable code whose only
   behaviour was to forfeit somebody's bake to the bot without telling them. Multiplayer came back
   in Phase 2, and what that left was measured on 2026-08-23 in a real two-browser room: the HOST
   was playing the GUEST's bake, on the host's own screen, with the guest's screen showing nothing
   at all — not a bench, not a waiting note (.planning/phases/04-the-networked-bakeoff/shots/t1/).
   So the branch below is not symmetry; it is the fix for that.

   THE FORK IS decisionIsLocal(player.idx), NEVER isHost AND NEVER seatLocal (DISPLAY-RULES Rule B).
   decisionIsLocal is true for EVERY human seat at a pass-and-play table, which is what keeps that
   mode working when several seats are local on one device.

   The FALLBACK below is a different thing again and is genuinely live: it is the shot-clock
   forfeit, which any mode can hit, and which a `null` reply from a remote captain reuses. */
export async function bakeoffPrompt(player,setup,fallback){
  await (ffEndNow()||0);   // the bake is his own hands-on turn — recap first if a skip was live
  // (the hand-over — passGate, which also keeps mySeat in step with a baking seat across a resumed
  // pass-and-play voyage — has already happened: bakeTurnLive runs it first, see the note above)
  if(appState.replaying){
    if(appState.dlogIdx<appState.dlog.length){
      appState.dlogN++;
      const rec=appState.dlog[appState.dlogIdx++];
      // Logs written before rewatching existed hold a bare guess array; normalise so every caller
      // downstream sees one shape.
      return Array.isArray(rec)?{g:rec,w:0}:rec;
    }
    endReplay();
  }
  // {wait:true} — same fault, found by the rule-8 sweep rather than by Wyatt: this is the other
  // per-turn spectator line whose subject is "nothing is happening yet". Also fire-and-forget.
  netHandlers().onBroadcast(sayAll("wait.ovens",{p:seat(player.idx)}).html,[{seat:player.idx,html:""}],{wait:true});
  /* THE ONE SPEC, BUILT ONCE, HANDED TO BOTH BRANCHES — pickCell()'s tracer pattern verbatim
     (see the `const spec={kind:"pick",...}` comment 60 lines up). The local render and the remote
     wire payload cannot drift apart because they are literally the same object, and the captain in
     the other browser runs the SAME playBakeoffLive from it.

     It carries what the choreography needs and nothing else. THE ANSWER IS NOT IN IT: the engine's
     post-shuffle bench never leaves this machine, because `before` + `locked` already determine
     every solved step (a locked bowl never moves — see playBakeoffLive's own note). A captain
     cannot read their own solution off the wire.

     `id` and `seat` keep being stamped by remotePrompt() (orchestrator.js), never added here —
     same rule the sail payload follows, and the prompt-field parity gate asserts it. */
  const spec={kind:"bake",
    order:player.bake.order.slice(),
    before:(setup.before||player.bake.slots).slice(),
    swaps:(setup.swaps||[]).map(sw=>[sw[0],sw[1]]),
    locked:player.bake.locked.slice(),
    attempts:player.bake.attempts,
    /* (`cost:BAKE_REWATCH_COST` and `coins:player.coins` STOOD HERE — architecture item 17, 2026-09-18.
       Two facts sent over the wire so a remote captain's browser could run its own little till: the price
       of a look, and the purse to take it out of. Both are now asked of the ONE place that decides them
       (Game.rewatchCost / Game.canRewatch) on whichever screen is asking, and a purse is the one every
       screen is already drawing — so there is nothing left on the wire to disagree with it. The button's
       own label asks the same constant; see playBakeoffLive.) */
    /* T-25 (Wyatt, 2026-08-26): "the bakeoff title shouldn't say The Bake-off, it should say
       {Captain's name}'s bake-off, or {Your captain's name}, Yer Bake-Off."
       IT RIDES IN THE SPEC rather than being looked up on each screen, for the reason the whole
       spec exists: a watcher has no `player`, and a name resolved independently on two machines is two
       answers waiting to disagree. One field, built once, read by baker and watcher alike. */
    baker:pn(player.idx),
    /* ⭐ AND THE RECIPE RIDES WITH IT, for exactly the reason `baker` does: a WATCHER has no
       `player` to look it up from, so a name resolved separately on two machines is two answers
       waiting to disagree. The bot's spec (orchestrator botBakePerform) has carried this since it
       was asked for; the HUMAN's — this one — did not, which is why the line was blank on the one
       screen he was looking at. */
    recipe:(player.recipe||[]).slice()};
  // Spending a coin goes through the ENGINE, live, one at a time — so the purse on screen drops the
  // moment the player buys a look rather than after the whole prompt resolves. `canAfford` asks the
  // engine's own rule (Game.canRewatch) rather than re-typing the comparison, so the button and the
  // till can never give different answers about the same purse.
  //
  // A REMOTE CAPTAIN REACHES THIS SAME ENGINE — architecture item 17. Their tap publishes the bench's
  // new epoch, the host charges it there and the `rewatch` event draws the coins leaving on EVERY
  // screen, exactly as this call does here. There is no guest-side till any more.
  const onRewatch=(n)=>appState.game.bakeRewatch(player,n)>0&&(liveRender(),true);
  onRewatch.canAfford=()=>appState.game.canRewatch(player);
  /* THE BENCH IS PUBLISHED BY WHOEVER IS BAKING (04-01 Task 3, MP-05). Only the captain with their
     hand on the crates knows when Ready was pressed or which crate was just named, so the same
     `io.onBench` hook exists on both tiers and the guest's copy (orchestrator.js's bake branch)
     is the identical call. It is handed the SAME spec the choreography is running from, so a
     watcher can never be sent a bench that disagrees with the one being played. */
  const onBench=(patch)=>netHandlers().onBenchPublish(spec,player.idx,patch);
  const base=decisionIsLocal(player.idx)
    ? playBakeoffLive(spec,{onRewatch,onBench})
    : netHandlers().onRemotePrompt(player.idx,spec);
  return base
    .then(r=>{
      // ONE TAIL FOR BOTH BRANCHES, which is what keeps the roadmap's fourth criterion true by
      // construction rather than by care. playBakeoffLive resolves {guess,rewatches} and the remote
      // captain replies with the SAME SHAPE, so nothing below has to know which tier answered. A
      // shot-clock forfeit — or a `null` from a captain whose tab went away — resolves null and
      // forfeits to the engine's own guess, having bought nothing.
      const answer=fillLocked(player.bake,(r&&r.guess)||fallback);
      const watched=(r&&r.rewatches)||0;
      // LOGGED TOGETHER, as one decision. The coins a rewatch spends are game state that the
      // end-of-voyage ranking reads, so a resume that replayed the guess but not the spending would
      // rebuild a captain with the wrong purse. One entry, both facts.
      const dec={g:answer,w:watched};
      netHandlers().onLogDecision(dec);
      return dec;
    });
}
// A guess carries null at every step already solved on an earlier attempt — scoreAttempt accepts
// that, but the decision log should not have to. Solo and pass-and-play persist the log as JSON in
// localStorage, which round-trips a null happily; the reason to fill them in anyway is that a
// logged guess is then always five plain bowl indices, so replaying one is never the question "was
// this step null because it was locked, or because something went wrong writing it?". The locked
// steps' answers are known by definition, so filling them in loses nothing.
function fillLocked(bake,guess){
  return guess.map((bowl,k)=>bowl==null?bake.slots.indexOf(bake.order[k]):bowl);
}

// THE LOCAL RESPONSE MECHANISM (02.15-02 Task 3) — NOT a renderer any more. Wraps the ONE
// converged renderer, renderPickPrompt(), in a Promise and resolves it from the answer callback.
// Reached through pickCell()'s decisionIsLocal() fork; `spec` is the SAME {kind,cells,msg,hint}
// object the remote branch hands to netHandlers().onRemotePrompt, never re-authored here.
export function localPickCell(player,spec){
  // his sail prompt — the natural end of every full-round skip; recap first, prompt after
  const pre=ffEndNow();
  if(pre)return pre.then(()=>localPickCell(player,spec));
  return new Promise(res=>{
    // The activePickCleanup registration stood here — the shot clock's expireShotClock was its
    // ONLY reader (inventory D4), so the registration left with the clock 2026-08-28. The
    // renderer still returns its teardown; nothing registers it until the clock's return does.
    renderPickPrompt(spec,v=>{res(v);});
  });
}
// v2 rules 2 and 8 delete three v1 helpers outright rather than leaving them dormant:
//   brokeSailLine   — sailing is free now, so nobody is ever too poor to move;
//   brokeAnchorLine — there is no anchor to afford; a storm asks nothing and costs only the turn;
//   counterHeadroom — a counter-offer's price is NAMED by the captain being asked (rule 4), never
//                     computed against a bot's spare change.
// A function nothing calls is exactly the dead code D-33/D-34/D-40 exist to prevent.
// G6 (Wyatt-approved 2026-07-30): *"yes, build this check and apply it to all situations."*
//
// COIN-AUDIT.md's root cause, in its own sentence: **affordability is checked when the option list
// is BUILT, the purse is debited AFTER the click, and the 20-second shot-clock penalty
// (applyShotClockPenalty in src/ui/util.js, which takes Math.min(1,p.coins) from the DECIDING seat)
// fires inside exactly that window.** `appState.turnExpired` does not protect against it: that flag
// is set at 30 seconds, and every guard in the codebase checks it — the coin penalty fires at 20
// and sets no flag at all, so those guards sail straight past it.
//
// The audit's correction to its own framing is the important part: this is not eight independent
// debit sites, it is ONE MISSING STEP repeated at eight of them — re-validate affordability after
// the await, immediately before the debit. Hence one shared helper rather than eight edits.
//
// Returns the SHORTFALL: 0 means clear (the purse covers the debit, proceed), any positive number
// means it does not. A negative or non-finite debit reports Infinity rather than 0, so a nonsensical
// value can never clear and turn a debit into a silent CREDIT to the purse.
//
// Why the engine needs no such thing, stated so nobody adds one there: `Game.play()` is fully
// SYNCHRONOUS. There is no `await` anywhere between an engine affordability gate and its matching
// debit, so no timer can interleave — which is why the audit found zero AT RISK rows in
// src/engine/index.js, and why nothing here goes near the 31 determinism fixtures.
export function coinShortfall(debit,purse){
  if(!Number.isFinite(debit)||debit<0)return Infinity;
  return Math.max(0,debit-purse);
}
// CR-02 (15-REVIEW.md; PRE-EXISTING since Phase 11): the CRATE half of what coinShortfall does for
// coins. G6 gave coins re-validation after the await; crates were never given the same treatment.
//
// The defect this exists to make unwritable, in one line:
//
//     q.ing.splice(q.ing.indexOf(want),1);  // want absent -> -1 -> splice(-1,1) removes the LAST crate
//     p.ing.push(want);                     // ...and mints a crate that is ALSO back in tokens[]
//
// It is REACHABLE, not theoretical. expireShotClock (src/orchestrator.js) resolves the pending
// `ask()` promise BEFORE it confiscates a random crate, and `ask()` forces default index 0 — which
// on the accept prompt is **Accept**. So a partner who times out auto-accepts a trade for a crate
// the clock has just taken from them, and the trade then removes a different crate entirely.
//
// Why a helper rather than four guarded call sites: 15-LEARNINGS #3 — "the dominant failure mode
// was the PARTIAL fix, not the missed one" — and its preferred remedy (a), one shared function both
// paths call. Putting the lookup and the mutation inside the same function means they cannot drift
// apart later, which is exactly how G18/G15/G29/CR-01 each happened.
//
// Returns TRUE when the crate moved, FALSE when `from` does not hold `ing` — and on false it
// mutates NOTHING, so a caller that validates both legs before moving either can never leave a
// half-completed trade behind. Defensive about junk input for the same reason coinShortfall reports
// Infinity for a negative debit: a nonsensical value must never be coerced into a mutation.
export function moveCrate(from,to,ing){
  if(!Array.isArray(from)||!Array.isArray(to)||ing==null)return false;
  const i=from.indexOf(ing);
  if(i<0)return false;
  from.splice(i,1);
  to.push(ing);
  return true;
}
// G14 (Wyatt-approved 2026-07-30): the ordered rim cells a trade-wind sweep passes THROUGH, from
// just after `from` up to and including its arc head. PURE and DOM-free, so it is tested headlessly
// over real boards in scripts/narration_flow_test.js. Never includes `from` itself.  [UNGATED-IN-4: narration_flow_test.js reads the root tree, not this one]
//
// Wyatt: *"the tradewinds to move players square-by-square, quickly… then we don't need a new
// narration line, and the players are just seeing what happens."* He watched a storm push a bot onto
// the rim and the sweep return it invisibly, so the boat appeared not to move.
//
// A GUEST CAN DO THIS TOO, and the earlier claim that it needed the event stream was WRONG — say so
// here, because the conflation is what parked this for a phase. A storm push is SIMULATION:
// intermediate squares depend on collisions, docks, other ships and the aground ladder, none of
// which a guest can replay from one event — that is why STORM-02 is parked, on its own merits. A RIM
// SWEEP IS PURE GEOMETRY between two known points on a STATIC ring. `rimCellInfo`
// (src/engine/index.js:92) is the ordered, arc-tagged ring, built once at construction from board
// layout, and a guest's game object carries it identically. Different class of problem entirely.
//
// WHY THE SLICE IS CORRECT — the two structural facts, from the constructor:
//   1. arcs are CONTIGUOUS in `cells` (built `for q…for i…cells.push({...ring[idx++],q})`), and
//   2. each arc's head is its LAST member (`for(const c of cells)heads[c.q]=c` — last write wins).
// Together: headIdx >= fromIdx always, within one arc, with no wraparound. So a plain forward slice
// is the whole answer.
export function rimSweepPath(game,from){
  /* THE SLICE NOW LIVES IN THE ENGINE (Game.rimRide), because a second reader appeared — the dotted
     course, 2026-09-11 — and two copies of one piece of geometry are two things to keep in step.
     rimRide includes the entry square; the sweep starts FROM it, so it is dropped here. A ship
     already at its arc's head gets [head] back and therefore [] — nothing to sweep, as before. */
  if(!game||typeof game.rimRide!=="function"||!from)return [];
  return game.rimRide(from).slice(1);
}
// 2026-07-31: the PURE half of the smooth trade-wind arc — cell centres in, evenly-spaced curve
// points out. Kept pure and exported for the same reason rimSweepPath is: it can then be tested
// headlessly over real randomised boards, which is the only way this project has ever caught a
// geometry mistake before a human saw it.
//
// WHY A CURVE AT ALL. The per-square stepper it replaces was correct and looked wrong — Wyatt:
// *"it moves according to a step function instead of a smooth, rounded motion."* Landing on each
// square is right for a storm push (1-2 squares, each one meant to be read) and wrong for a boat
// carried by a current along a ring: walked one cell at a time, a ring is a staircase.
//
// Catmull-Rom through the cell centres, NOT a circular arc fitted to the ring. The rim IS very
// nearly a circle today (every rim cell sits 7.0-7.3 cells from the board centre), so a fitted arc
// would look identical and take less code — but it would bake in a board shape that the deferred
// island-redesign milestone explicitly changes. A spline through whatever cells rimSweepPath
// returns cannot go stale that way.
//
// The output is RESAMPLED to even spacing so that travelling it at a constant rate gives a constant
// SPEED. Walking the raw spline samples instead would slow down through curves and speed up on the
// straights, which is the same class of artefact this is replacing.
// `perCell` is how finely the curve itself is sampled — 48 points per ring cell, comfortably finer
// than any tick rate can consume, so the traversal is never quantised by the curve's own resolution.
// It costs a few hundred array entries once per sweep and nothing per frame, so there is no reason
// to be stingy with it. (Raised 16 -> 48 on 2026-07-31; the largest sample gap fell 0.088 -> 0.029
// cells, measured by the SMOOTH-ARC test.)
export function rimSweepCurve(cells,perCell=48){
  if(!Array.isArray(cells)||cells.length<2)return [];
  // duplicate both ends so the spline actually reaches the first and last cell rather than easing
  // out of them — the boat must start ON the square the player clicked and finish ON the whirlpool
  const P=[cells[0],...cells,cells[cells.length-1]];
  const raw=[]; const SEG=12;
  for(let i=1;i<P.length-2;i++){
    const [x0,y0]=P[i-1],[x1,y1]=P[i],[x2,y2]=P[i+1],[x3,y3]=P[i+2];
    for(let s=0;s<SEG;s++){
      const t=s/SEG,t2=t*t,t3=t2*t;
      raw.push([
        .5*(2*x1+(x2-x0)*t+(2*x0-5*x1+4*x2-x3)*t2+(3*x1-x0-3*x2+x3)*t3),
        .5*(2*y1+(y2-y0)*t+(2*y0-5*y1+4*y2-y3)*t2+(3*y1-y0-3*y2+y3)*t3),
      ]);
    }
  }
  raw.push([cells[cells.length-1][0],cells[cells.length-1][1]]);
  const cum=[0];
  for(let i=1;i<raw.length;i++)cum.push(cum[i-1]+Math.hypot(raw[i][0]-raw[i-1][0],raw[i][1]-raw[i-1][1]));
  const total=cum[cum.length-1];
  if(!(total>0))return [raw[0],raw[raw.length-1]];
  const N=Math.max(2,Math.round(perCell*(cells.length-1)));
  const out=[]; let j=0;
  for(let k=0;k<=N;k++){
    const d=total*k/N;
    while(j<cum.length-2&&cum[j+1]<d)j++;
    const span=cum[j+1]-cum[j], f=span>0?(d-cum[j])/span:0;
    out.push([raw[j][0]+(raw[j+1][0]-raw[j][0])*f,raw[j][1]+(raw[j+1][1]-raw[j][1])*f]);
  }
  return out;
}
// eased 0..1 — the winds take hold, then the whirlpool receives the boat rather than snapping it
const rimSweepEase=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
// ── THE TWO FUNCTIONS BELOW ARE THE SWEEP'S MOTION, AND THE ONLY COPY OF IT ────────────────────
// Extracted 2026-07-31 so scripts/rim_sweep_trace_test.js can enumerate exactly what the live  [UNGATED-IN-4: rim_sweep_trace_test.js reads the root tree, not this one]
// animation will aim at, without a browser. That harness is only worth anything if it measures the
// REAL motion rather than a re-implementation that can drift, so animateRimSweepIfAny below calls
// these and does no position maths of its own — and host_guest_parity_check.js assertion 4 fails if
// it ever stops doing so. Both are pure: no DOM, no clock, no state.
export function rimSweepDurationMs(cellCount){
  return Math.min(RIM_SWEEP_MAX_MS,Math.max(RIM_SWEEP_MIN_MS,Math.round(RIM_SWEEP_MS_PER_CELL*cellCount)));
}
// position at progress `t` (0..1) along an already-built curve, easing included
export function rimSweepPointAt(curve,t){
  if(!Array.isArray(curve)||curve.length<2)return null;
  const u=rimSweepEase(Math.min(1,Math.max(0,t)))*(curve.length-1);
  const i=Math.min(curve.length-2,Math.floor(u)), f=u-i;
  return [curve[i][0]+(curve[i+1][0]-curve[i][0])*f,curve[i][1]+(curve[i+1][1]-curve[i][1])*f];
}
// G14 (Wyatt-approved 2026-07-30): THE ONE TRADE-WIND STEPPER, called identically by the host sites
// and by the guest's watchEvents(). It takes exactly ONE argument — the event being drawn — and
// every call site hands over that one thing, so no call site can mean a different event by it and
// the two tiers cannot be paced or aimed differently.
//
// Derives its path from the EVENT STREAM, which both tiers have: the event must be a `tradewind`;
// `to` is that event's own state snapshot, `from` is the PREVIOUS event's. It then refuses to
// animate unless rimSweepPath(from) is non-empty AND lands exactly on `to`. NEVER INVENTS A PATH —
// if the derivation does not check out, it returns and today's instant render stands.
//
// WHERE THE DERIVATION HOLDS — an event exists AT the entry cell, which is now every way a ship
// reaches the rim:
//   - a human sailing into the rim — the `sail` event is emitted at the entry cell
//   - a storm push onto the rim — stormStep emits `windmove` AT the entry square before it sweeps
//     (src/engine/index.js). It did not until W9, and that omission is what left the guest — whose
//     ONLY route into this animator is consumeEvent — watching a teleport while the host rode.
//   - the engine's rimEscape() — `windmove` at the rim cell, THEN the sweep. The shape the other
//     two were converged onto.
//   - a ship fleeing a battle into the channel — the flee is recorded AT the destination before
//     tradewind() runs (src/orchestrator.js).
// THERE IS NO LONGER A HOST-ONLY FALLBACK. runStormLive used to reconstruct the entry square by
// hand and call animateRimSweepRun directly, because the stream did not carry it; that hatch is
// deleted, and animateRimSweepRun is now reached only from here. The entry cell went ON THE WIRE
// instead — which does change what the engine emits, so it belongs in the determinism re-record
// batch (`npm run test:determinism`, itself already broken by the cutover — see .planning/BACKLOG.md).
/* THE STORM'S WIDE SHOT IS A FUNCTION OF THE EVENT, NOT OF WHO YOU ARE (W9, rule 23).
   playtest 22 item 1 (Wyatt): "The director should zoom out to show all boats and their end squares
   before moving them in a storm." That cue used to be one line inside runStormLive, which is
   host-only (src/orchestrator.js) — so the host framed the whole table for a storm and the guest
   sat at whatever zoom it happened to be at. A tester measured what that costs now that the guest
   RIDES the sweep instead of sliding: on a posed storm the swept ship's destination sat at screen
   x = -292, off the left edge of the guest's own viewport. A ride nobody can watch is not a fix.
   A camera cue that exists on one tier and not the other is the same display-path fork the ride
   itself was, so the cue is now ONE function of the `storm` event, entered from wherever: the host
   calls it with the event it just emitted, the guest with the event it is consuming. The window is
   computed from the players' positions at that moment, and a `storm` event is emitted BEFORE any
   hull moves on either tier, so both tiers compute the same window from the same board.
   Returns whether the cue fired — false off the /4 stage, where there is no director to ask. */
export function stormCamForEvent(ev){
  if(!ev||ev.t!=="storm"||!ev.dir)return false;
  if(!(window.__pp4&&window.__pp4.stormCam))return false;
  window.__pp4.stormCam(ev.dir);
  return true;
}
/* IT RIDES THE EVENT IT IS HANDED — the same correction W7 made to animateSailRoute, made here
   because it is the same fault. This used to take no arguments and read g.events[n-1], so any
   event that landed behind a sweep before its consumer ran cost that player the ride (watchEvents
   pushes each arriving event BEFORE awaiting consumeEvent, so the top of the pile is regularly not
   the event being consumed). Every call site now hands over exactly one thing, the event being
   drawn, and no call site can mean a different event by it. No argument now rides nothing.

   RE-ENTRY GUARD: a WeakSet of events already ridden, NEVER a flag stamped on the event object —
   the host broadcasts events verbatim (pushEvents -> JSON.parse(JSON.stringify(...))), so an extra
   field would leak straight into the Firebase payload and can trip scripts/net_contract_check.js.
   It replaces a module-local ARRAY POSITION, which had the second defect W7b measured on the sail
   walker: an index survives a new Game, so "Play again" in one page load silently dropped the ride
   for whichever sweep landed on the index the last voyage finished on. A fresh voyage's events are
   fresh objects, so this cannot happen and there is no frontier for anyone to remember to reset.

   The ride's STARTING square still has to come from the event before this one — a sweep records
   where the ship ended, not where it entered the channel — so the previous event is found by
   IDENTITY (indexOf the event handed over), never by a position a caller passed in. */
/* W9 — PUT THE EVENTS ON THE WIRE BEFORE ANYBODY RIDES THEM.
   `liveRender()` does two unrelated jobs in one call: it drains the local consumer AND (on the
   host) publishes. Every call site that awaited an animation and THEN called liveRender was
   therefore holding the whole table still for the length of its own animation. Measured in a real
   two-browser crew room, 2026-08-30: the host emitted the storm sweep at t=2326ms, rode it inline
   for 1447ms, and the event did not reach the wire until t=3989ms. The guest received it 47ms later
   and started its own ride 64ms after that. THE NETWORK WAS 47ms; nothing on the guest was slow —
   it simply had not been told yet. (A guest being a moment behind is expected and is NOT what this
   fixes, docs/INTENDED-BEHAVIOUR.md §3. What is being removed is an artificial hold that grows with
   the host's own animation.)
   This is the publish half on its own, so an animating call site can hand the table the event at
   the moment it is recorded and then take its own time drawing it. Host-guarded and handler-seamed
   exactly as liveRender's publish line is (ui-tier may never import src/net/, D-07), and pushEvents
   is a monotonic while-loop over appState.evPushed, so an early call costs one extra no-op pass and
   can never double-send or reorder.
   ⚠ "CAN NEVER DOUBLE-SEND" WAS TRUE OF LIVE PLAY ONLY, and architecture item 47 (2026-09-18) found
   the exception: during a host's reload-replay the frontier had been reset to 0 while the engine
   rebuilt the whole voyage, so the first call from here flushed every record the crew already held
   — thirty-six duplicate serials in the measured room. liveRender's own `replaying` return covered
   its own path and this one had nothing. Fixed on the publisher, not here (see below).
   WHY NOT SIMPLY MOVE liveRender() ABOVE THE RIDE — the tempting one-line version: liveRender's
   drain is FIRE-AND-FORGET (`_nh.onConsumeEvent(e).catch(...)`, deliberately not awaited, because
   liveRender's body must stay synchronous for EVERY call site — the count is not the point and a
   number in a comment rots: it read "57" while the real figure passed 87). consumeEvent itself rides the sweep, and
   _rodeSweep below is idempotent — so draining first would make the call site's own `await` return
   false immediately, and the host would stop WAITING for the ride it is showing while a guest
   (whose watchEvents awaits consumeEvent serially) still waits. That trades a publish-order defect
   for a pacing divergence between the tiers, which is the fault rule 23 exists to prevent. Publish
   early, ride unchanged: nothing about what is drawn, or about who waits for it, moves.
   NO "AM I THE HOST" TEST LIVES HERE, and that is not an oversight — mode_fork_check.js failed the
   build when one did, correctly: this file DRAWS, and a conditional on who is playing has no
   business in it. The publish is host-only because PUBLISHING is host-only, so the guard sits on
   pushEvents itself (src/orchestrator.js), where rule 23 sanctions "who computes" and where it
   protects every caller rather than this one. The same is now true of "a screen rebuilding its own
   history publishes nothing" — item 47 put it on the publisher for exactly this reason. */
export function publishNow(){
  const h=netHandlers();
  if(h.onEvents)h.onEvents();
}
const _rodeSweep=new WeakMap();   // event -> the sweep's promise; a second caller JOINS it
/* ══════════════════════ THE PARROT'S OWN BOX — "🦜 Aye aye" ══════════════════════
   Wyatt, 2026-09-07 playtest item 4, after sailing into the rim: "there is a problem with the
   design of our tutorial narrations — they disappear too quickly to read AND understand. Can we
   put an action prompt button below all tutorial ladder narrations > 0 with the image of the
   parrot and the words 'Aye aye'? that way the player has time to read and digest the
   information." His pick, from three shapes offered: A GATE BEFORE THE PROMPT.

   ⭐ WHICH MOMENTS GET THIS, AND WHY IT IS NOT ALL OF THEM. I measured every one of the seven
   Pilot moments before choosing, because "disappear" is a property of the SLOT, not the ladder:

     RIDES flash() — a timed narration that auto-advances, so it genuinely vanishes:
       rim.sweep       · the default reading-speed hold
       recipe.stowed   · the default reading-speed hold
       storm.hit       · appended to the round header, which flashes for NINE HUNDRED
                         MILLISECONDS. One sentence about a rule that moves every ship on the
                         board, on screen for under a second. That is his complaint, exactly.

     RIDES A PROMPT CARD that waits for the player and cannot vanish:
       sail.pick · recipe.draft · act.menu/attack/trade/muse · dock.buy

   So the three that vanish are gated and the four that wait are left where they are. His own
   words are "all tutorial ladder NARRATIONS", and the narrations are precisely these three.
   GATING THE OTHER FOUR WOULD COST SOMETHING REAL: the wind rule would leave the screen on which
   ye are choosing a square, and he passed that screen twice in this same playtest (items 3, 18).
   IF HE WANTS THEM GATED TOO IT IS ONE LINE PER SITE — this decision is on his sheet, marked as
   mine to be overruled.

   NO NEW MECHANISM: it is localAsk, the game's one prompt, with one circle. So it dims the board,
   reveals top-to-bottom, obeys reduce-motion and answers the back button like every other card.
   NOTHING REACHES THE WIRE — localAsk resolves a promise, and the Pilot is per device
   (docs/INTENDED-BEHAVIOUR.md). A veteran never reaches this function at all: pilotSpeaks() is
   false at the bottom rung, so the byte-identical guarantee is untouched.

   `tweak` exists for recipe.stowed's one substitution ({name}) and is applied to the rung text
   before it is drawn. */
export async function pilotGate(id,tweak){
  if(!pilotSpeaks(id))return false;
  const line=pilotLine(id,null);
  const text=tweak?tweak(line.msg||""):(line.msg||"");
  if(!text)return false;
  /* SEEN BEFORE SHOWN, deliberately. The count must advance even if this voyage ends mid-card —
     otherwise a captain who quits during a lesson meets the same lesson forever. */
  pilotSee(id);
  // `pp4AyeAye` exists only to size the bird — Wyatt, 2026-09-08: "Polly is too small on the Aye
  // aye button -- make the bird bigger!" The parrot itself was already the game art (emojify maps
  // 🦜 to assets/icons/parrot.png and panel() runs it over every prompt); it was arriving at
  // .narrIcon's 18px, which is a footnote size on a full-stage circle.
  await localAsk(text,[{label:say("parrot.ok",{}),value:0,cls:"primary ahoyGlow pp4AyeAye",stage:true}],null,line.sub||null);
  return true;
}
export function animateRimSweepIfAny(ev){
  const g=appState.game;
  if(!g||appState.replaying)return Promise.resolve(false);
  if(!ev||ev.t!=="tradewind")return Promise.resolve(false);
  const inflight=_rodeSweep.get(ev);
  if(inflight)return inflight;              // JOIN the ride, never skip it
  const p=animateRimSweepPlay(ev);
  _rodeSweep.set(ev,p);
  return p;
}
async function animateRimSweepPlay(ev){
  const g=appState.game;
  const i=g.events.indexOf(ev);
  if(i<1)return false;
  const prev=g.events[i-1];
  const seat=ev.p;
  if(!ev.state||!prev||!prev.state)return false;
  const to=ev.state[seat]&&ev.state[seat].pos;
  const from=prev.state[seat]&&prev.state[seat].pos;
  if(!to||!from||!g.onRim(from))return false;
  /* ⭐ THE TRADE-WIND LADDER NOW SPEAKS *BEFORE* THE RIDE — Wyatt, 2026-09-09, reversing a call
     that was argued for at length right here:
       "the 'sail the trade winds' helper text stage should happen immediately when a player ENTERS
        the trade winds, BEFORE they are swept around the rim -- so the player knows what to look
        for."
     ⚠ WHAT STOOD HERE ARGUED THE OPPOSITE, and it is worth keeping the argument rather than quietly
     deleting it: "spoken once the ride has been WATCHED, because the sentence explains something
     that just happened; said first it would be a rule about a thing not yet seen."
     HIS REASON BEATS IT, and the difference is the word LOOK. That reasoning is right for a rule
     and wrong for a SPECTACLE. The rim carries a ship most of the way across the sea in about a
     second; a captain who does not know it is coming spends that second working out what happened
     instead of watching it. Told first, the sentence is an instruction to watch — and the ride
     then demonstrates it. Told after, the ride is startling and the sentence is a footnote.
     ⚠ NOT GATED ON WHOSE SHIP IT IS, and that half is unchanged and still load-bearing. An earlier
     version spoke only when the swept captain was local — a conditional on WHO IS PLAYING, inside
     code that draws, which is exactly what the mode-fork gate exists to stop. It is also worse
     teaching: watching a BOT get carried across explains the rim just as well. Per device, and
     nothing here rides the wire. */
  await pilotGate("rim.sweep");
  const rode=await animateRimSweepRun(seat,from,to);
  return rode;
}
// /4 (Wyatt's playtest, storm rides): the SAME guarded ride, callable with an explicitly known
// entry cell. A swept storm step emits nothing between stepping onto the rim and tradewind()
// (see the fallback list above), so the event stream cannot supply `from` — but runStormLive
// holds the pre-step square in its hand and stormStep moves exactly ONE straight square downwind
// before the sweep, so the driver can reconstruct the entry cell first-hand. Same discipline:
// derive the path and REFUSE TO GUESS — if rimSweepPath from the given cell does not land
// exactly on `to`, no animation happens and today's instant render stands.
export async function animateRimSweepRun(seat,from,to){
  const g=appState.game;
  if(!g||appState.replaying)return false;
  const path=rimSweepPath(g,from);
  if(!path.length)return false;
  const end=path[path.length-1];
  if(end[0]!==to[0]||end[1]!==to[1])return false;   // the derivation disagrees with the engine — do not guess
  // the ride spans the rim — pull the camera to the full board first, or the whole sweep can play
  // past the edge of a zoomed-in view (a no-op outside the /4 stage)
  if(window.__pp4&&window.__pp4.sweepCam)window.__pp4.sweepCam();
  try{
    // ── PART A: ARRIVE IN THE TRADE WINDS FIRST ──────────────────────────────────────────────
    // The square the player clicked was never drawn. liveRender() at the call site DOES write it,
    // but the very next statement (this function, synchronously through to its first await) wrote
    // path[0] over the top of it — and a browser paints once per task, so only path[0] ever
    // reached the screen. The sweep therefore began with the boat still rendered INLAND, and
    // dragged it diagonally out of the middle of the board.
    //
    // paintShipAt() rather than trusting that liveRender(): render() draws from
    // events[appState.evIdx].state and evIdx is the NARRATION cursor, which can lag the emitted
    // event. This targets `from` explicitly, and moves the activeRing with it.
    //
    // The await is the load-bearing half — it is the yield that lets the browser paint the arrival
    // at all, and RIM_SWEEP_ARRIVE_MS is long enough for that glide to COMPLETE.
    // The glide is set to the SAME value we are about to wait for, so the landing completes exactly
    // as the wait ends. Leaving it at SHIP_GLIDE_MS (350) while waiting only 140 would re-create the
    // very bug this function exists to fix: the sweep re-aiming a ship that is still in flight.
    // Linear, because a 140ms ease-in-out over one square reads as a hesitation.
    if(RIM_SWEEP_ARRIVE_MS>0){
      setShipGlideMs(seat,RIM_SWEEP_ARRIVE_MS,"linear");
      paintShipAt(seat,from);
      await sleep(RIM_SWEEP_ARRIVE_MS);
    }
    // ── PART B: CARRY THE BOAT SMOOTHLY ALONG THE RING ───────────────────────────────────────
    // Interpolated along a spline, NOT stepped cell by cell. See rimSweepCurve above, and
    // RIM_SWEEP_TICK_MS in util.js, for why the per-square stepper this replaces looked wrong even
    // though it was doing exactly what it was designed to do.
    const curve=rimSweepCurve([from,...path]);
    if(curve.length>1){
      const total=rimSweepDurationMs(path.length);
      // A LINEAR glide that OUTLASTS the tick, so the browser always has a transition in flight to
      // interpolate and soaks up setTimeout's jitter. One tick's worth — what this was — leaves the
      // glide finished before the next target lands, and the boat renders on every other frame; see
      // MOTION_BRIDGE_TICKS in util.js for the frame-by-frame measurement and for the corner-rounding
      // this is traded against.
      setShipGlideMs(seat,RIM_SWEEP_TICK_MS*MOTION_BRIDGE_TICKS,"linear");
      const began=Date.now();
      for(;;){
        // progress from ELAPSED TIME, never from a tick count. A throttled or late tick then
        // advances further along the curve instead of stretching the sweep.
        // The tick is routeTick() — the frame clock raced against the timer — for the reason the
        // routed sail uses it (see routeTick): this is the same driven motion, and a ship that
        // judders on one of them and glides on the other is one gesture with two behaviours.
        const t=Math.min(1,(Date.now()-began)/total);
        const point=rimSweepPointAt(curve,t);
        if(point)paintShipAtPoint(seat,point[0],point[1]);
        if(t>=1)break;
        await routeTick(RIM_SWEEP_TICK_MS);
      }
    }
  }finally{
    // an interruption (turn expiry, a mid-sweep event, a thrown paint) must never strand the ship
    // part-way round the arc — nor leave it stuck on the sweep's short glide, which would make
    // every ordinary move it makes for the rest of the game snap instead of glide. Restore BEFORE
    // the corrective paint so that paint travels at the normal speed.
    setShipGlideMs(seat,null);
    paintShipAt(seat,to);
  }
  return true;
}
/* SAIL THE ROUTE, NOT THE CHORD — playtest 21 item 6 (Wyatt: "Animate the boats to take the actual
   legal routes through the water. Confusingly, it often looks like they go over land because they
   sail simply from current square to end square").

   "Often" turned out to be measurable: over 13,982 legal moves across 40 boards and four winds,
   the straight line between a ship's two squares passed over land in 16.3% of them — better than
   one move in six, and up to three land squares at a time. The MOVE was always legal; only the line
   drawn between its endpoints was a lie.

   The route comes from Game.sailTo, which walks the very BFS that decides which squares are legal
   (sailStates is now that same search's `out`). So the path a ship is drawn along and the rule that
   permitted the move cannot disagree — the alternative, a second pathfinder in the UI, is precisely
   the shape of bug this project keeps paying for.

   STRAIGHT SEGMENTS, NOT A SPLINE, and this is a real decision rather than laziness. The rim sweep
   smooths its ring with Catmull-Rom because a ring walked cell by cell is a staircase. Here the
   opposite holds: a spline through cell centres BULGES OUTSIDE a right-angled corner, and the
   corner it would bulge into is the island the ship is sailing around. Smoothing this path would
   re-introduce the exact bug it exists to fix, in a subtler form that only shows up on tight turns.

   SAME TOTAL TIME WHATEVER THE ROUTE (Wyatt's pick): a four-square dogleg takes exactly as long as
   a four-square straight run, so turn pacing is completely unchanged and only the path is honest.
   The easing is applied over the WHOLE route rather than per segment, so a routed move leans in and
   settles exactly like an ordinary one-square glide instead of stuttering at every corner.

   A one-step move returns immediately: there is no corner, the chord IS the route, and the ordinary
   CSS glide already draws it perfectly for free. */
const sailRouteEase=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
/* THE SHIP IS THE ONLY THING ON THE BOARD ANIMATED BY A JS TIMER, AND THAT IS WHY IT ALONE JUDDERS.

   playtest 21 (Wyatt): "The ships STILL move in a very jerky way — watch the video and diagnose it
   properly." Measured off his 60fps recording, tracking the green sail BY COLOUR (scale-invariant,
   so the camera zoom cannot corrupt it) across the window where the camera is provably static — the
   sail's pixel area holds constant at ~1980px, so there is no zoom in those frames:

       frames 0-6    still          frame 7   +93.6px
       frames 8-12   still          frame 13  +79.1px
       frames 14-18  still          frame 19  +46.7px

   The ship's position advances ONCE PER 100ms — six frames still, then a jump — and the steps
   shrink, which is the ease being sampled about six times too rarely. It is not the page freezing:
   in those SAME frames the ship's own neighbourhood changes on 24 of 25 of them (mean 5.7 grey
   levels/px), so the phone is painting at 60fps throughout. Only the ship's TRANSFORM is late.

   Every other moving thing in /4 is CSS — the rim arrows, the whirlpools, the ripple rings, the
   camera's own layer transforms — and CSS animation is driven by the browser's frame clock. This
   loop alone asked a `setTimeout` for its next tick, and a phone under load or in Low Power Mode
   clamps timers hard while continuing to composite. So the one JS-timed animation in the game is
   the one that drops to ~10fps, which is exactly the complaint.

   requestAnimationFrame is the frame clock itself — it cannot be later than the frame it draws in,
   and progress here is already computed from ELAPSED TIME, so a coarser clock advances further per
   tick instead of stretching the move.

   THE TIMEOUT IS STILL THERE, RACED, and that is not belt-and-braces — it is the lesson from the
   playtest 22 stall (util.js: "EVERY BEAT IN THE GAME IS AWAITED, SO NO BEAT MAY BE LOST").
   rAF stops completely in a backgrounded tab, so an rAF-only loop would hang the voyage the moment
   the phone locked, mid-glide, with the turn loop awaiting it. sleepMs carries the sweeper that
   catches a dropped timer, so whichever clock is alive wins the race and the glide always finishes. */
const routeTick=(ms)=>appState.replaying?Promise.resolve():(Promise.race([
  new Promise(res=>requestAnimationFrame(()=>res())),
  sleepMs(appState.ff?Math.min(ms||SAIL_ROUTE_TICK_MS,40):(ms||SAIL_ROUTE_TICK_MS)*8),
]));
/* THE ONE SAIL STEPPER, called identically by the host's turn loop and by the guest's consumer —
   the same split animateRimSweepIfAny/animateRimSweepRun already proved above. Everything it needs
   is on the EVENT, which both tiers hold: the engine bakes the drawn line into the sail event's
   presentation lane (Game.ev / bakeDraw), and that lane is self-contained, starting with the square
   the boat left. Returns true only when a route actually walked.

   IT TAKES THE EVENT TO RIDE, AND THIS IS THE FIX W7b MEASURED. The first cut took no parameters
   on the reasoning that a shared no-argument entry is what keeps the two tiers from being aimed
   differently — and it did the opposite, because "no argument" still had to mean SOMETHING, and
   what it meant was `events[events.length-1]`. That is not one subject: it is the sail on the host,
   where the turn loop emits and rides with nothing in between, and whatever landed last on a guest,
   where watchEvents pushes each arriving event before awaiting consumeEvent and the engine emits a
   sail and calls tradewind(player) in the same breath. Measured on eight sails in two real crew rooms:
   the host walked all eight, the guest walked five and slid across the islands on three.
   Handing it the event is the STRONGER version of the same principle — every call site now hands it
   exactly one thing, the event being drawn, and no call site can mean a different event by it.
   No argument now rides nothing; there is no silent fall back to the pile.

   RE-ENTRY GUARD: a WeakSet of events already ridden, NEVER a flag stamped on the event object —
   the host broadcasts events verbatim, so an extra field would leak straight into the Firebase
   payload. This is what makes the host's inline call and the drain's call the same ride rather than
   two. It replaces a module-local index, which had a second defect of its own: an index survives a
   new Game, so "Play again" in the same page load silently dropped the ride for whichever sail
   landed on the index the last voyage finished on (W7b case C). A fresh voyage's events are fresh
   objects, so this cannot happen and there is no frontier for anyone to remember to reset. */
/* ⭐ A SECOND CALLER JOINS THE RIDE; IT NO LONGER RACES PAST IT. This was a WeakSet and the guard
   `return false`d — so whichever call site arrived second simply carried on while the boat was
   still moving. A WeakMap of event -> the ride's own promise makes re-entry mean "wait for the ride
   already in progress", which is what every caller actually wanted. See the note on the bot's sail
   below (his sheet item s4) for the timing this unlocks. */
const _rodeRoute=new WeakMap();
/* ============================================================================
   L4 — THE PERFORMER. Plays a storyboard; decides nothing.
   ============================================================================
   Step 1 of the one-director plan. `present()` in src/shared/storyboard.js (L3, purity gated by
   module_graph_check) turns an event into an ordered list of beats; this plays them in order.

   IT DECIDES NOTHING, AND THAT IS THE ENTIRE CONTRACT. No reordering, no filtering by client type,
   no beat of its own. The list's order IS the order. The moment a performer starts choosing, there
   are two directors again, which is the fault the whole plan exists to remove.

   AN UNKNOWN BEAT THROWS. It does not skip, and it does not warn-and-continue — a skipped beat is
   precisely a screen quietly failing to draw something, which is the class of bug this project
   keeps paying for. A beat kind that reaches here without a performer is a build mistake and
   should be as loud as one.

   NO PLAYER SEES ANYTHING CHANGE TODAY, and the honest reason is in storyboard.js's header: `sail`
   was already drawn identically everywhere. What this buys is that the sequence is now DATA, which
   is what the golden-file parity gate needs to exist at all. */
export async function playStoryboard(beats){
  if(!Array.isArray(beats))return false;
  let played=false;
  for(const b of beats){
    switch(b&&b.do){
      case "walkRoute":
        /* THE SAME RUNNER THE OLD PATH CALLS, not a reimplementation — the whole point of a
           strangler fig is that the new path reaches the identical code. animateSailRouteRun holds
           the ride; animateSailRoute holds the DECISION to ride, and that decision has moved into
           present(). */
        played=(await animateSailRouteRun(b.seat,b.from,b.path))||played;
        break;
      default:
        throw new Error(`playStoryboard: no performer for beat "${b&&b.do}" — a beat kind reached L4 that L4 cannot play. This is a build mistake, not a runtime condition; skipping it would be a screen silently not drawing something.`);
    }
  }
  return played;
}

export function animateSailRoute(ev){
  const g=appState.game;
  if(!g||appState.replaying)return Promise.resolve(false);
  /* ANY EVENT CARRYING A BAKED ROUTE, not one event name. This used to demand t==="sail", which
     is a second place that has to be told about every move a boat makes — and it had already been
     missed once: a ship fleeing a battle sails on average 3.93 squares, 13.3% of them straight
     through an island, and this walker refused it purely because of what the event was called.
     The presentation lane IS the test: Game.bakeDraw only ever produces draw.route for a move it
     could vouch for (the route must land exactly on the pos baked beside it), so an event that
     carries one is by construction a move worth walking. */
  if(!ev)return Promise.resolve(false);
  const inflight=_rodeRoute.get(ev);
  if(inflight)return inflight;              // JOIN the ride, never skip it
  const p=animateSailRoutePlay(ev);
  _rodeRoute.set(ev,p);
  return p;
}
async function animateSailRoutePlay(ev){
  /* THE DECISION TO RIDE NOW LIVES IN present() — src/shared/storyboard.js, L3, pure and gated.
     What used to be three lines of policy here (does it carry a baked route? is it long enough to
     have a corner?) is the same three lines there, moved verbatim so that converting this kind
     could not quietly change which sails walk.
     `null` MEANS "NOT CONVERTED", not "no beats", and the distinction is what makes the migration
     safe one kind at a time: a kind present() does not know falls through to whatever this function
     did before. Today only `sail` returns a list; everything else returns null and lands here.
     The WeakSet guard stays ABOVE this, unchanged: idempotency is a property of this call site
     (the host's own flow.js:2381/2489 calls versus consumeEvent's), not of the storyboard. */
  const beats=present(ev);
  if(beats)return playStoryboard(beats);
  return false;
}
/* The walker itself: squares in hand, no derivation. Kept separate for the same reason
   animateRimSweepRun is — one place decides WHETHER to ride, one place performs the ride. */
export async function animateSailRouteRun(seat,from,path){
  if(appState.replaying)return false;
  if(!Array.isArray(path)||path.length<2||!from)return false;   // no corner to draw
  const pts=[from,...path];
  // cumulative distance, so a constant rate gives a constant SPEED rather than hurrying the long
  // legs — the same reason rimSweepCurve resamples
  const cum=[0];
  for(let i=1;i<pts.length;i++)
    cum.push(cum[i-1]+Math.abs(pts[i][0]-pts[i-1][0])+Math.abs(pts[i][1]-pts[i-1][1]));
  const total=cum[cum.length-1];
  if(!(total>0))return false;
  const dest=path[path.length-1];
  try{
    // a LINEAR glide that OUTLASTS the tick, so the browser always has a transition in flight to
    // interpolate; the eased shape lives in sailRouteEase, applied to progress along the whole
    // route. This was one tick's worth, which is the one length that guarantees the glide is over
    // before the next target arrives — measured at 48% frozen frames. See MOTION_BRIDGE_TICKS.
    /* TAKE THE START WITH NO INTERPOLATION AT ALL, and commit it, before arming the tick glide.
       The earlier version painted the start with the tick glide already armed, on the reasoning
       that a browser paints once per task so the destination aim could never reach the screen.
       That is true of the SHIP and false of the RING, and the difference is what Wyatt saw:
       liveRender() aims both at the destination, but the ring carries no transition and therefore
       RESOLVES there immediately, so arming a 16ms glide and then painting the start sent the ring
       animating the whole length of the move backwards. Measured at 108 x 54px over the first two
       frames of every routed sail.
       snapShipTo forces the start to be committed — the layout read inside it is load-bearing, not
       a leftover — so both elements begin the route from the same place, stopped. */
    snapShipTo(seat,from);
    setShipGlideMs(seat,SAIL_ROUTE_TICK_MS*MOTION_BRIDGE_TICKS,"linear");
    const began=Date.now();
    for(;;){
      // progress from ELAPSED TIME, never a tick count — a throttled or late tick then advances
      // further along the route instead of stretching the move, and a backgrounded tab finishes
      // rather than crawling
      const t=Math.min(1,(Date.now()-began)/SHIP_GLIDE_MS);
      const d=total*sailRouteEase(t);
      let j=0; while(j<cum.length-2&&cum[j+1]<d)j++;
      const span=cum[j+1]-cum[j],f=span>0?(d-cum[j])/span:0;
      paintShipAtPoint(seat,pts[j][0]+(pts[j+1][0]-pts[j][0])*f,pts[j][1]+(pts[j+1][1]-pts[j][1])*f);
      if(t>=1)break;
      await routeTick(SAIL_ROUTE_TICK_MS);
    }
  }finally{
    // an interruption must never strand a ship mid-water, nor leave it on the short tick glide —
    // which would make every ordinary move it makes for the rest of the voyage snap instead of
    // glide. Restore BEFORE the corrective paint so that paint travels at the normal speed.
    setShipGlideMs(seat,null);
    paintShipAt(seat,dest);
  }
  return true;
}
/* ================= v2 rules 7 + 8: the storm =================
   A storm is now ONE event for the whole table, at the top of the round, before anybody acts:
   one direction, three squares, everyone at once. It asks the player nothing.

   That deletes a great deal of v1 machinery, and the deletion is the point. Gone: windLeg's
   inline island-dodge prompt, humanWind's two-leg chain, botWindLeg's mirror of it, the
   anchor/dodge/aground/shipwreck ladder, and the second perpendicular gust. v1 needed all of it
   because a storm arrived unannounced and had to offer you a way out. v2 tells you a full round
   in advance, on the compass, which way it will blow (rule 6c) and promises the forecast is
   never wrong (rule 6d) — so the price of being caught is simply your turn, and there is nothing
   to decide. Wyatt's words: *"there are no multiple options, because now you can plan ahead."*

   Humans and bots run the identical path here — there is no longer any per-player decision for
   them to diverge on. The rule itself lives in the engine (stormStep/noteStormOutcome); this
   function only animates it, square by square, so the board is never behind the narration. */
/* ⭐ THE STORM LESSON IS RAISED BY THE CONSUMER AND PACED BY THE FLOW — Wyatt, playtest 2026-09-10,
   item 15: "The storm helper tutorial polly line only appeared for Host -- have you ensured that
   these are also drained from the engine?"
   It was not, and the answer to his question is no: `pilotGate("storm.hit")` was called from
   runLiveNet, which is the HOST'S round loop. A guest never runs that loop — it drains events — so
   the line was host-only by construction, on a rule that moves every ship on the board.
   Same shape as the "yer recipe's stowed" fix he already has: consumeEvent CREATES the card the
   moment the `storm` event drains (one place, every device, each answering for itself through its
   own tutorial ladder), and the HOST'S flow waits on it here — because pacing the game is the
   flow's job and a guest has no flow to pace. Awaiting it in the drain instead would block the
   event feed, which on a guest is the whole game.
   ⚠ AND THE PLACE IS EXACT: after the storm event has been drawn and narrated, BEFORE the ship
   loop below. That keeps his item-4 ordering — the parrot speaks, the captain taps Aye aye, and
   only then does anything move — which is why the card cannot simply be awaited after the storm. */
let stormGate=null;
export function armStormGate(p){ stormGate=p; }
export async function runStormLive(dirKey){
  const g=appState.game;
  g.ev({t:"storm",dir:dirKey,dist:STORM_PUSH});
  /* THE WIDE SHOT IS NOT ASKED FOR HERE — architecture item 24, 2026-09-18. `stormCamForEvent(evStorm)`
     stood on the next line, one statement after this tier handed the same event to the drain — so the
     HOST aimed the storm's camera twice and every other screen once. MEASURED in a crew room (host
     1200x950, guest iPhone-13-mini 375x812 dsf3), both calls caught at the stage bridge with their stacks:
       t=-0.004s  stormCamForEvent <- consumeEvent (src/orchestrator.js) <- liveRender (src/ui/panel.js)
       t=-0.003s  stormCamForEvent <- runStormLive (this function)      <- runLiveNet
     One millisecond apart, off the same board, so the second re-aimed the camera at the frame the first
     was already gliding to and nothing ever looked wrong — which is exactly why it survived. The cue
     belongs to the one event consumer, off the `storm` event, on every screen; liveRender() below is
     simply how this tier reaches it. Both screens arrived at the identical viewBox, 55-65ms apart. */
  liveRender();
  await narrateLastEvent();
  if(stormGate){ const gate=stormGate; stormGate=null; await gate; }
  // furthest downwind moves first, so the lead ship clears its square before the ship behind it
  // arrives — the engine owns that ordering too (rule 7b)
  for(const player of g.stormOrder(dirKey)){
    const wasDocked=g.adjPort(player)!==null;
    const before=[...player.pos];
    let outcome="moved";
    /* ⭐ THIS LOOP DRAWS NO SHIP — architecture item 24, 2026-09-18. It keeps the storm's BEAT; the one
       event consumer moves every hull, on every screen, off that ship's own record. `drivenSquares` is
       the beat's condition and nothing else: true once this ship has been driven at least one ordinary
       square that no record has spoken for yet.

       D-53 (Wyatt, 2026-09-01): "the storm should smoothly move players to their final square in one
       move" — measured then (scripts/qa/w_storm_step_probe.mjs, a driven live storm, ship transform
       sampled every ~35ms): his named cause (an indexing bug) was NOT what was happening — a full
       3-square push was timed evenly, ~780ms per square, exactly STORM_STEP_MS apart. Those digits
       record that run; they are not a claim about today. D-53's fix deferred this tier's own per-square
       paints and flushed them as ONE renderLiveShips(), which got the picture right and left the SECOND
       MOVE PATH standing: the host drew the push itself, every other screen drew it off the engine.

       AND THREE QUARTERS OF THAT PAINT WAS ALREADY BEING THROWN AWAY. Measured 2026-09-18, two windows,
       a real crew room, every write to a ship's group recorded with the value it replaced:
         0.773s seat 3  [3,6] -> [3,3]    the flush
         0.773s seat 3  [3,3] -> [3,6]    undone in the same millisecond, by the PREVIOUS ship's record
                                          reaching render() inside the one consumer
         1.545s seat 3  [3,6] -> [3,3]    the hull actually moves — on its OWN record, like a guest's
       A flush survived only where nothing was in flight to overwrite it: the first ship the storm
       reaches, and any ship following an awaited drain (a rim sweep). Those ships were drawn moving
       0.83s, 0.87s, 0.83s and 0.80s ahead of the guest across three runs; every other ship agreed to
       within 38-54ms, which is the wire. One boat in a storm had a head start and the rest paid a
       wasted write for it.

       NOW: the engine's record moves the hull here as everywhere, and it is PUBLISHED BEFORE THE BEAT
       (below) rather than after it — so every screen draws a ship inside its own 770ms slot and the
       storm's summary still lands after the last hull has arrived. That is the picture D-53 earned, and
       a guest gets it too: before this, a guest's boats each moved a full slot late and the last one
       could still be gliding while the summary was being read out. The storm takes exactly as long as
       it did — the beats are unchanged and there are still as many of them. */
    let drivenSquares=false;
    for(let s=0;s<STORM_PUSH;s++){
      const was=[...player.pos];
      const evBefore=g.events.length;
      outcome=g.stormStep(player,dirKey);
      const movedSquare=(player.pos[0]!==was[0]||player.pos[1]!==was[1]);
      if(movedSquare&&outcome!=="swept")drivenSquares=true;
      if(outcome==="swept"){
        /* (THE LAST HOST-ONLY PAINT STOOD HERE and is deleted by architecture item 24, 2026-09-18:
           `if(pendingSquares){paintShipAt(player.idx,was);await sleep(RIM_SWEEP_TICK_MS);…}` — this tier
           putting the hull back on its pre-sweep square so the ride began from the right place, plus a
           one-tick yield so that paint could reach the screen at all. CEO REVIEW 72 earned both, and the
           reasons are worth keeping: painting from the LIVE position glided the ship onto the whirlpool
           and held it there before the ride snapped it back (teleport, pause, snap-back, ride — the very
           bug D-22 excluded a swept step to avoid), and with no yield the corrective paint and the ride's
           own first paint landed in one task, where a browser paints once, so `was` never reached the
           screen. A full STORM_STEP_MS wait was tried instead and pulled in a separate artifact
           (.planning/CTO-LEDGER.md, not root-caused).
           IT IS DELETED RATHER THAN TUNED because it was the second move path: no other screen has it,
           and no other screen needs it. stormStep emits `windmove` AT the rim-entry square before it
           sweeps, so the one consumer's render() carries the hull there and animateRimSweepIfAny rides
           it round — which is what a guest has always done. MEASURED on a posed sweep, two windows: the
           ride drew [1,6] -> [2,2], five squares, on both screens, 131ms apart. There is nothing left
           for a yield to make visible.) */
        /* THE HOST-ONLY ESCAPE HATCH IS GONE (W9, rule 23). This used to reconstruct the rim-entry
           square by hand — from `was` plus the wind — because the event stream did not contain it,
           and then call animateRimSweepRun directly. runStormLive is host-only, and that was
           animateRimSweepRun's ONLY call site in the tree, so the host watched a ship carried
           around the rim and the guest watched it appear at the whirlpool: one game, two pictures.
           stormStep now emits AT the entry square (src/engine/index.js), so the ONE event-derived
           animator draws this on every tier. The fix was to put what the hatch reconstructed onto
           the wire and DELETE the hatch — never to give the guest a matching one.
           The emitter holds its own moment: stormStep pushed the sweep one synchronous statement
           ago, so the top of the pile is that event (and if it swept nowhere, the guard declines). */
        /* W9: THE TABLE IS TOLD BEFORE THIS TIER RIDES. The sweep event exists as of the
           stormStep one statement above; the ride below takes ~1.4s, and until this line the only
           publisher was the liveRender() underneath it — so every other browser sat on a frozen
           board for exactly the length of the host's own animation. Publish, then ride. */
        /* Same correction as the sail sites: the drain is awaitable now, so the storm's sweep is
           consumed rather than reached past. The ride and the sound of it belong to consumeEvent;
           this loop only has to WAIT. publishNow() still tells the table first (W9). */
        publishNow();
        await liveRender();
      }
      // stormStep records its own `blocked` event when a ship holds the square ahead.
      //
      // HIS ITEM 3 LIVED HERE, and this is the call site b8e9eea never touched. That commit
      // collapsed the storm's chatter into one summary by withdrawing the TEXT of windmove,
      // blownOut and anchorHold — all three of which are recorded by noteStormOutcome, AFTER the
      // per-square loop. This call is inside the loop and fires per collision, so the fourth
      // outcome (a push stopped by another SHIP) kept narrating a line of its own in the middle of
      // the storm. The line is now withdrawn the same way its siblings' were (the `blocked` entry
      // in src/ui/util.js), which makes describeFor() return null and this narrateLastEvent() a
      // clean no-op for it. The call STAYS: liveRender paints the square the ship fetched up on at
      // the moment it lands, which is what D-22 exists to protect, and the awaited narration is
      // the belt for any future in-loop event that does carry text.
      /* ITEM 8 (Wyatt, 2026-08-23c): "The storm narrated the fact that flaky jack was blown into
         the trade winds — it shouldn't. trade winds, like everything else, should be reported once
         with the post-storm summary." The tradewind EVENT still fires — the ride animation above,
         the board state, and an ordinary sail's narration all hang off it — only its mid-storm
         bubble is withheld here, and the summary's swept clause reports it once the storm is done
         (noteStormOutcome now notes "swept"). */
      if(g.events.length>evBefore){liveRender();drivenSquares=false;if(g.events[g.events.length-1].t!=="tradewind")await narrateLastEvent();}
      if(outcome!=="moved")break;
    }
    const moved=(player.pos[0]!==before[0]||player.pos[1]!==before[1]);
    const evBefore=g.events.length;
    g.noteStormOutcome(player,outcome,moved,wasDocked);
    // The per-ship event still fires — it carries this ship's board pop, its captain-panel note and
    // its audio cue — but it no longer NARRATES (playtest 21 item 3, the four texts withdrawn in
    // src/ui/util.js). liveRender still runs so the square it landed on is painted at the moment it
    // lands, which is the thing D-22 exists to protect; only the awaited bubble is gone from here.
    if(g.events.length>evBefore)liveRender();
    /* ⭐ THE RECORD FIRST, THEN THE BEAT — architecture item 24, and the order is the whole of it.
       The wait used to stand ABOVE noteStormOutcome, beside a renderLiveShips() that drew this ship
       here: the hull moved at the top of its slot on this tier and the record that moves it everywhere
       else was published 770ms later, at the bottom. That is how the head start was built. Published
       first, every screen — this one included — draws the push at the top of its own slot and the beat
       is the rest AFTER it, so a 700ms glide always lands inside its 770ms slot and the storm's summary
       still arrives with every hull already home.
       ⚠ THE BEAT IS THE STORM'S PACE AND THERE IS NO SECOND KNOB. STORM_STEP_MS (src/ui/util.js) is the
       one number; if Wyatt asks for a quicker storm it moves, and it moves the rim-sweep pace with it.
       Do not add a smaller number here for one case — that is two places deciding one fact, on the item
       that removed them. */
    if(drivenSquares)await sleep(STORM_STEP_MS);
  }
  // ...and THEN the one line that reads the whole storm at once. Emitted here rather than left to
  // the engine's runStorm() because the live path drives the push itself, square by square, and
  // never calls it — the same split that already exists for every other storm event. Both paths
  // call the identical engine method so the sentence cannot differ between them.
  const evBefore=g.events.length;
  g.stormSummaryEvent(dirKey);
  if(g.events.length>evBefore){liveRender();await narrateLastEvent();}
  liveRender();
}
// How a hold reads on a button: the crate, and how many of it are aboard. The count is load-
// bearing wherever duplicates can be SPENT (the black market takes any two, same crate twice
// included), and harmless everywhere else — so both pickers show it and neither has to be
// remembered as the special one.
/* EVERY CIRCLE CARRIES ITS NAME, INCLUDING THIS ONE (Group G fault 2, judged on solo-phone-021).
   `short` used to be `iconImg(...)` — the picture and nothing else. The radial fan prefers `short`,
   so a captain's own crates in a GIVE prompt bloomed as three unlabelled pictures while the WANT
   prompt one screen earlier named all seven (solo-phone-011). Same gesture, two behaviours, which
   is rule 8. Measured on a posed GIVE step at 390x664: three of four circles rendered as a lone
   <img> with alt="" — no words for the eye and nothing for a screen reader either.
   It is `ilabelImg`, the same helper the full label already uses, so the circle and the sentence
   name the crate identically and there is no second spelling to keep in step; the <br> is the
   in-circle form the trade's own answer circles already use (icon above, words below). The count
   travels into the short form too — it is load-bearing here (the black market takes any two, the
   same crate twice included), so dropping it in the one place a player actually taps would be
   losing the information rather than shortening it.
   FITS: every crate name in the game is 13 characters or fewer, inside the 16 that menuButtons()
   already treats as circle-sized — the fan's own existing rule, not a new number. */
function crateOpt(list,i){
  const n=list.filter(x=>x===i).length;
  const count=n>1?` <span class="nobrk">×${n}</span>`:``;
  return {label:`${ilabelImg(i)}${count}`,
          short:`${iconImg(ING_IMG[i])}<br>${iname(i)}${count}`,value:i};
}
/* WHICH two crates the black market takes — the captain's choice, and the human twin of
   Game.blackMarketPick's for a bot. Two steps, Back at each, and nothing settles until the last
   tap: Back at step one returns to the buy prompt with the hold untouched, Back at step two
   re-picks the first crate. Returns [a,b], or null if the captain walked away.
   Duplicates are legal, which is exactly why the buttons carry their counts. */
async function pickBarterCrates(player,ing){
  let first=null;
  for(;;){
    const pool=player.ing.slice();
    if(first!==null){const at=pool.indexOf(first);if(at>=0)pool.splice(at,1);}
    const opts=[...new Set(pool)].map(i=>crateOpt(pool,i));
    opts.push({label:say("button.back",{}),back:true,value:"__back__"});
    // @copy misc.blackmarket.pick1 / pick2 — draft, Wyatt rewrites
    const msg=first===null
      ?say("market.first",{goods:dockFlavorIcon(ing)})
      :say("market.second",{first:ilabelImg(first),goods:dockFlavorIcon(ing)});
    /* THE LAST SHARED HELPER LINE IS GONE (Wyatt, 2026-08-25). It read "Both crates leave the
       Sugar Seas fer good." on the first pick and "Tap it an' the bargain's struck — both crates
       leave the Sugar Seas fer good." on the second. The message above already says the market
       takes TWO crates and names the one already given, so the grey slab underneath was restating
       the bargain a captain had just read while they were reaching for the second crate. */
    const v=await ask(player.idx,msg,opts);
    if(appState.turnExpired)return null;
    if(v==="__back__"||v==null){
      if(first===null)return null;
      first=null;continue;
    }
    if(first===null){first=v;continue;}
    return [first,v];
  }
}
/* v2 rules 10 + 11: dock, then buy.
   The flip is a TREASURE HUNT, not a grab for the crate: heads you turn up buried treasure
   (cfg.dockHeads), tails you spend the turn working the dock as a hand (cfg.dockTails). There is no free crate any
   more — crates are bought, won in battle, or traded for. The purchase is offered after EITHER
   outcome, on the same turn, with the coins just earned (rule 10a/10c), and the price is
   6 − however many crates are left on the island, so it climbs 3 → 4 → 5 as the island empties. */
export async function humanDock(player,port){
  const ing=port;
  const g=appState.game;
  // v2 rule 10d: an empty island still pays. There is treasure in the sand and work on the dock
  // whether or not there is a crate left to sell, so the flip always happens — unlike v1, which
  // skipped it. Keep this in step with Game.doDock or bots and humans diverge on the rule.
  // G-v2 (Wyatt-approved 2026-08-05): the prompt used to be a bare "flip!" that never said what
  // the flip was FOR — his report: *"it currently just tells you to flip for no reason."* The
  // message stays short and the rules go in the helper line, which is where the narration box
  // already puts explanatory text (and, per the standing top-to-bottom rule, is revealed last).
  // @copy misc.paramprompt.dockflip
  const h=await humanFlip(player,say("dock.flipAsk",{icon:iconImg(ING_IMG[ing]),place:dockPlace(ing)}),true,
    say("dock.flipHelp",{heads:g.cfg.dockHeads,tails:g.cfg.dockTails}),"dock");
  if(h==="back")return "back";
  g.payDock(player,h);   // credited AND recorded in one place, shared with a bot's dock (engine Game.payDock)
  // READ BEFORE THE BUY, and handed to the engine untouched: buying takes the crate off the shelf and the
  // price climbs as the island empties (v2 rule 11), so this is the price the captain was actually offered.
  const price=g.cratePrice(ing);
  /* THE CAPTAINS PANEL IS DRAWN FROM THE LAST EVENT'S SNAPSHOT, not from live player state — so
     coins earned here stayed invisible until the `dock` event was finally emitted, which is AFTER
     the buy prompt has been answered. Wyatt, 2026-08-05: the total "does not update until the very
     end of your turn, which is confusing". He is right, and it matters most exactly here, because
     the buy prompt asks him to spend money the panel says he does not have yet.
     A silent event carries the new snapshot immediately. It narrates nothing (see EVENT_NARRATION
     .purse) and logs nothing — its whole job is to make the panel tell the truth. Game.payDock now
     records it in the same breath as the payment, above, for bots and humans alike (CEO, 2026-09-15). */
  const purseEv=g.events&&g.events[g.events.length-1];
  liveRender(); // the purse changed — show it before the buy prompt prices anything against it
  /* THE BUY WAITS FOR THE COINS TO LAND. Wyatt, 2026-09-14: "they happen sequentially and both require player decisions, so they
     should be displayed that way." The CEO found the "Buy a crate?" question was not held for them (2026-09-15), so a captain could
     be asked to spend coins still in the air. It now waits on the one consumer's drawing of this very purse (util.js eventDrawn,
     capped), the same way every narration line waits on its event. */
  if(purseEv&&purseEv.t==="purse")await eventDrawn(purseEv);
  let buy=null;
  if(g.cfg.dockBuy&&price!==null){
    /* THE BLACK MARKET'S SECOND PRICE, on the human side (Wyatt, 2026-08-13): "ye can trade any 2
       ingredients for the black market ingredient of the island yer docked at — so ye either pay
       in doubloons or in 2 crates." The engine already settles it (Game.barterCrate); ALL this
       does is let a captain choose the two, so bot and human can never diverge on the rule — the
       same warning buyCrate carries above.

       The choice of WHICH two is the whole decision, so it is asked as its own little step
       machine (the trade flow's pattern, UI-08): Back at step one returns to the buy prompt with
       nothing spent, Back at step two re-picks the first crate, and nothing settles until the
       final tap. Duplicates are legal — a hold with two of the same junk crate may spend both. */
    // F9/D-41: the affordability test decides only whether the option is CLICKABLE, never whether
    // it is SHOWN. A captain who cannot afford today's price still learns that buying was possible
    // and what it now costs — which is exactly how the rising-price rule teaches itself.
    const left=g.tokens[ing];
    const black=left<1e9&&left<=0;
    for(;;){
      // F9/D-41: the affordability test decides only whether an option is CLICKABLE, never whether
      // it is SHOWN — re-read every pass, because the shot clock can take a coin while a prompt is
      // open. That rule is why the barter appears the moment the shelves go bare and greys out
      // when the hold is short: a captain carrying one crate still learns the swap exists.
      const canBuy=player.coins>=price;
      const canBarter=g.canBlackMarket(player,ing);
      /* ITEM 17 (Wyatt, 2026-08-23c): the greyed-out explainer said "The price has risen to 3🌕 —
         more than ye can pay" when the price had never risen — it STARTED at 3 and he held 1. The
         honest sentence states the cost and the purse, and it is written ONCE: the same string is
         the button's tap-why and the italic helper line, so the two can never tell two stories
         about one greyed circle (rule 23). */
      const shortWhy=sayText("dock.shortWhy",{price,coins:player.coins,short:price-player.coins});
      const opts=[
        {label:say("dock.buy",{ing:ilabelImg(ing),price}),short:say("dock.buy",{ing:iconImg(ING_IMG[ing]),price}),value:"coin",disabled:!canBuy,
          why:shortWhy},
      ];
      // @copy misc.blackmarket.barterbtn — draft, Wyatt rewrites
      if(black)opts.push({label:say("market.barter",{ing:ilabelImg(ing)}),short:say("market.barterShort",{icon:iconImg(ING_IMG[ing])}),value:"barter",disabled:!canBarter,
        why:sayText("market.barterWhy",{n:player.ing.length})});
      opts.push({label:say("button.nah",{}),value:false});
      // @copy misc.blackmarket.whisper — draft, Wyatt rewrites
      /* HIS COPY PASS, 2026-08-25. The black-market whisper said in a sentence what the two
         buttons beneath it already say; "Last one on the island!" was deleted outright. What is
         left is the price and the alternative, and — when ye cannot pay — the one truthful
         sentence about why (item 17), which is the same string the greyed button's tap-why uses. */
      /* GONE with the rest of the shared helper lines (2026-08-25). Item 17 had already made this
         string and the greyed Buy button's tap-why THE SAME STRING, so the line under the pill was
         a second copy of a sentence the button says while pointing at itself. The price and the
         barter alternative are both on the two buttons' own labels. */
      /* THE PRICE CLIMBS, AND ONLY THE PILOT SAYS SO. Wyatt ruled this ladder IN on 2026-09-02.
         The Buy button already states the price; what nothing states is that the number rises as
         the island empties (v2 rule 11: 6 minus the crates left, so 3 -> 3\u{1F315}, 2 -> 4, 1 -> 5),
         which is the whole reason getting there first matters. Legal under the editorial law: the
         button names the price, never that it moves. */
      const sub=pilotMsg("dock.buy",null)||null;
      if(sub)pilotSee("dock.buy");
      /* W2-4 (Wyatt, 2026-08-27): "Money must be explicit wherever it changes hands."
         This prompt is the ONE place in the dock flow that had gone quiet about it. The line
         BEFORE the flip already names both payouts (:1394) and the recap AFTER it already names
         what landed (util.js:769-773) — so the amount was stated on the way in and on the way out,
         and vanished at the exact moment the coin landed and the captain was asked to spend.

         DERIVED FROM cfg, NEVER TYPED (rule 9). dockHeads/dockTails are cfg FIELDS precisely so
         they can move — a "+3" written into this sentence is a price list standing in for a
         quantity that shifts, and it would go silently wrong the day the payout is retuned. That
         is not hypothetical here: the comment above those very fields claimed 5 while the code
         paid 3, and it took a playtest to catch it (W2-10).

         AND THE SAME EDIT SWEEPS TWO CONSISTENCY FAULTS (rule 8), both surfaced by the W2-3 audit:
         the tails outcome is ONE action and was named three ways — "haulin' crates" (util.js, now
         "workin' the docks"), "a turn's work on the docks" (:1394) and "a turn on the docks" here.
         A player read a different name for the thing they had just done every time they did it.
         And this was the ONLY dock line in the tree spelling the coins with the variation selector
         (U+FE0F) — every other flip, here and in util.js, uses the bare ⚪/⚫. Same family as the
         minus sign that must be U+2212: a character nobody can see is still a difference the font
         renders. */
      const v=await ask(player.idx,say(h?"dock.buyAsk.treasure":"dock.buyAsk.work",{n:h?g.cfg.dockHeads:g.cfg.dockTails,goods:dockFlavorIcon(ing)}),opts,null,sub);
      if(appState.turnExpired)break;
      // D-40 safety net: buyCrate re-reads the purse itself — `canBuy` was computed BEFORE the
      // await, and the shot clock's penalty can take a coin while this prompt sits open. One
      // purchase path with the bots (Game.buyCrate), so the two can never diverge on the rule.
      if(v==="coin"){buy=g.buyCrate(player,ing);break;}
      if(v==="barter"){
        const give=await pickBarterCrates(player,ing);
        if(!give)continue;                       // backed out of the picker — offer the berth again
        buy=g.barterCrate(player,ing,give);
        break;
      }
      break;                                     // "Nah"
    }
  }
  /* THE BERTH HANDS THE ENGINE WHAT THE CAPTAIN DECIDED, AND THE ENGINE'S OWN LINE SAYS IT (architecture item 49).
     This berth used to write its own copy of the dock event beside the engine's, the two kept in step by hand — and on
     2026-09-17 they fell out of step: the engine's line gained `paid`, this one did not, and a person's PURCHASE stopped
     drawing its coins leaving the purse for a whole build on staging. What was bought, bartered or refused is all this
     berth knows that the engine does not; every word of the line itself — what the flip turned up, what was paid, what
     was left on the shelf — is Game.dockDone's, exactly as it is for a bot. */
  g.dockDone(player,ing,h,price,buy);
  /* HIS ITEM 9: THE CRATE LANDS WHEN YE BUY IT. One call moved, none added.
     "the crate sound and the crate animation arrive after the summary has faded, instead of on the
     Buy click." Measured: 5489ms between the trusted mouse-down on the Buy petal and liveRender()
     actually running. The cause was this ordering — the purchase event was emitted, then the FULL
     narration was awaited (2 to 5 seconds under D-34), and only then did liveRender() run. Both the
     crate pop (spawnPops) and the crate cue (playForEvent) hang off that one call, so both sat
     behind the whole hold.
     RULE 13 IS THE FRAME, not just the audio. A BOT's dock already does this in the right order —
     botBeat() is literally `onLiveRender(); await narrateCurrent();`. The bot heard its crate at
     the right moment and the human did not, which is exactly the asymmetry rule 13 forbids. This
     brings the human into line with the bot rather than inventing a third ordering.
     THE EVENT-TO-SOUND MAP IS UNTOUCHED and stays one entry per event. No second trigger, no call
     into the audio module from the prompt handler, no special case for the dock cue. The map was
     never what was wrong — the MOMENT was. A second trigger would fire the cue twice, which is a
     worse defect than a late one and far harder to notice in a summary.
     The two player-state writes travel WITH the render rather than staying behind it, so
     liveRender() sees byte-identically the state it saw before this change. Neither is read by
     narrateLastEvent(), which reads the event. */
  player.firstFlip.add(ing);player.dockedNow.add(ing);
  liveRender();
  await narrateLastEvent();
}
/* ================= v2 rule 4: the table-wide open trade =================
   You no longer hail one captain. You stand on your deck and announce to the whole Sugar Seas
   WHAT YE WANT and WHAT YE'LL GIVE. Everyone holding it answers — accept, deny, or name their
   price — and you see every answer at once, then take one or walk away. One round: a counter
   cannot itself be countered (rule 4c). No harbor-tax refund any more (rule 4e).

   Cargo is public, so the "what do ye want" picker lists every ingredient in the game and greys
   out the ones nobody is holding — Wyatt's ruling: *"You can ask for any crate you want, but
   those not on the table should be greyed out."*

   Kept as a little step machine, exactly like v1's: Back moves to the PREVIOUS prompt, and only
   Back out of the first prompt returns to the action menu. Inputs accumulate in `st` so
   revisiting a step keeps what you already picked (UI-08). */
/* /4 playtest 13: the COIN STEPPER — replaces both "How many?" option grids, the last of the
   yellow boxes. The pill names the DIRECTION in every step (GIVIN' vs ASKIN', Wyatt's exact
   complaint: "it isn't clear if you're offering those coins or asking for them"), and the
   circles adjust one coin at a time. Each tap is a real ask(), so the shot clock re-arms and
   the decision log records every step exactly as it always did — replay-safe by construction. */
/* playtest 21 item 7 — THE COIN SLIDER, which replaces the stepper above wherever the decision is
   local. Wyatt tapped "Ask it!" expecting another adjuster and sent a trade he did not want:

     "the trade counteroffer flow is strange bc the confirmation button (ask it) looks the same as
      the +1 buttons, but you can press those multiple times"

   and his ruling on the fix is the general rule, not a patch to this one prompt:

     "Keep the arc logic consistent by having all the buttons that are in the ark actions. Move the
      plus minus coins out of the arc instead and style those differently, potentially with a
      slider or some other mechanic."

   So THE ARC IS FOR ACTIONS ONLY. A quantity is set on a bar under the pill that looks nothing
   like a circle, and every circle left in the arc commits something. One tap, one consequence.

   It also removes a whole class of the original confusion: reaching 6 coins took six taps of a
   button that looked exactly like the one that sent the deal, so the two were being pressed in the
   same rhythm. Dragging and committing are not the same gesture and can no longer be confused.

   The pill re-states the whole deal as ye drag (`fmt`), so the number is never read in isolation.

   FALLS BACK to the stepper for a genuinely REMOTE seat — a live control does not cross the prompt
   wire, and threading it through is a large change for a mode /4 does not ship. Named, not silent:
   solo and pass-and-play are both LOCAL decisions, so every human quantity prompt /4 actually
   presents gets the slider. See ask()'s own note in util.js. */
// the engine owns what a counter MEANS (see Game.counterTerms) — this is just the reach.
const counterTerms=(offer,r)=>appState.game.counterTerms(offer,r);
/* ⭐ WHAT A DEAL COMES TO, IN WORDS — the crate and the coin, decided here, once (architecture item 20b, 2026-09-18).
   WYATT, ON HIS OWN PLAYTEST: "Fix this so it is intuitive -- i've also noticed the confusion when i play."
   Four places in this file turned a deal into words and one of them disagreed with the other three. Measured on a posed
   counter (a crate offered with 3🌕 on it, countered for 9 more), desktop 1400x900 and phone 375x812 dsf3:
     the ask line  read  "💰 Crustbeard wants 🥛 Fresh Milk + 12🌕"    — the whole price, correctly
     the CIRCLE    read  "Crustbeard" / "🥛+12🌕"                      — the same 12, with a + in front of it
   The + was words.js's "trade.coinsShort" ("+{n}🌕"), a leftover from when a counter really was "+k coins ON TOP".
   Since counterTerms (engine) started returning the TOTAL, that + has been telling a captain the price is twelve MORE
   than the offer they are looking at. A trade prompt that misstates the price is worse than one that says nothing —
   the same fault, one size down, as the circle that once showed only a name (see humanAnswersHail's note).
   So: ONE builder, and the amount is "coin.amount" ({n}🌕) wherever it is read. `icons` is the only difference a
   surface may ask for — a petal has room for the crate's picture, not its name — and it changes no word.
   NOTHING ELSE MAY WORD A DEAL: scripts/qa/counter_price_one_wording_check.mjs fails if a second builder appears, or
   if either answer circle goes back to a sentence typed into this file instead of one from words.js. */
const dealBits=(ing,coins,icons)=>[ing?(icons?iconImg(ING_IMG[ing]):ilabelImg(ing)):null,
  coins?say("coin.amount",{n:coins}):null].filter(Boolean).join(" + ");
/* THE COUNTER-OFFER, REBUILT — playtest 21 item 7 (Wyatt): "'Ask it' is really confusing because
   i clicked it thinking that i could counteroffer their money with asking for their milk. Instead,
   it simply initiated the trade (which i did not want). I want a way to counteroffer with other of
   their ingredients; and when i do, they should calculate their algorithm to see if it is
   advantageous for them to trade that to me bc of turns saved etc."

   A counter used to be "+k coins on top of whatever they offered" and NOTHING ELSE, so the one
   thing he actually wanted — their milk instead of their coin — could not be expressed at all. The
   button was not misnamed; the feature was missing.

   FAST PATH FIRST (his pick, and he is on a phone): the counter opens straight on WHAT OF THEIRS
   DO YE WANT — their hold, tappable, because cargo is public and he can already see it. Coins are
   an optional second step ye can skip entirely. Two taps to say "milk instead", which is exactly
   what he tried to do.

   THE COINS ARE CLEARED (his pick): "instead" means instead. The counter is a fresh deal — ye name
   what ye want, and no money rides along invisibly from an offer ye just rejected.

   ONE ROUND (his pick, and rule 4c): they accept it or they walk. A counter cannot itself be
   countered, so this cannot become a haggling loop that eats a turn in prompts.

   Returns {askIng, askCoins} — or "__back__" to re-ask, "deny", or null if the clock ran out.

   THE COUNTER STALL (playtest 22, Wyatt: "when i counter-offer a bot trade the entire game stalls
   and stops... it happened immediately when i clicked counter offer"). It was ONE character of
   nesting on the message line below — `poss(pn(player.idx))` where poss(), like pn(), takes a SEAT INDEX
   and renders the name itself. pname() computes `NAMES[i].replace("Capt. ","")` unconditionally,
   before any early return, so an array indexed by a finished `<b …>` string gives undefined and the
   .replace throws. Not sometimes: EVERY tap of Counter, for every seat, since the counter rebuild
   shipped (c8e2937).

   THE SHAPE OF IT IS WHY IT SURVIVED TWO SESSIONS OF FIXES. A throw inside this await chain has no
   error boundary anywhere above it — botOpenTradeLive, the bot turn, the voyage loop all simply
   stop, with nothing on screen and nothing in the log. On a refresh solo REPLAYS the decision log,
   reaches the recorded Counter press, throws in the same place before the board is ever driven, and
   comes back sat at the starting position with every purse showing "–": Wyatt's "the game remains
   unplayable but from the starting position". One fault, both halves of the report.

   Both earlier attempts (a6b81cd, 69b9f23) were reasoning about what a counter SETTLES, which is
   everything downstream of a prompt that never rendered. When a stall is reported at a tap, prove
   the prompt appears before improving what it decides. 4/scripts/seat_arg_check.js is the gate. */
async function counterOffer(q,player,offer){
  const g=appState.game;
  // what THEY are carrying, minus the crate already on the table — offering it back is not a counter
  const theirs=[...new Set(player.ing)].filter(i=>i!==offer.giveIng);
  // whether a coins-only counter exists at all — the engine's answer (Game.counterRoom), the same one the Counter button and its
  // "no coin left to sweeten the deal" line read in humanAnswersHail, so the two screens cannot disagree
  const coinRoom=g.counterRoom(player,offer,null);
  for(;;){
    if(appState.turnExpired)return null;
    const opts=theirs.map(i=>crateOpt(player.ing,i));
    // coin-only is still a legal counter — it is what the old flow could do, kept rather than lost. Greyed when the asker has no
    // coin at all, or has already offered every coin aboard (architecture item 20)
    opts.push({label:say("counter.coin",{}),short:say("counter.coinShort",{}),value:"__coinsonly__",disabled:!coinRoom,
      why:sayText(offer.giveCoins?"counter.allOffered":"counter.noCoin",{p:seat(player.idx)},q.idx)});
    opts.push({label:say("button.deny",{icon:iconImg(CANCEL_X_IMG)}),value:"__deny__"});
    opts.push({label:say("button.back",{}),back:true,value:"__back__"});
    // @copy prompt.trade.counterwant — APPROVED as written, Wyatt 2026-08-14 ("draft copy is fine")
    // poss() TAKES A SEAT INDEX, exactly as pn() does — it renders the name itself. Passing it
    // pn(p.idx) fed a finished <b> string to pname(), where `NAMES[i].replace(...)` is evaluated
    // UNCONDITIONALLY on an array indexed by that string: undefined.replace, a TypeError, thrown on
    // the first line of the first counter prompt. That is the whole of playtest 22's counter stall —
    // see the note above counterOffer.
    const pick=await ask(q.idx,say("counter.ask",{q:pn(q.idx),whose:poss(player.idx)}),opts,null,
      theirs.length?null:say("counter.noCargo",{p:seat(player.idx)},q.idx));
    if(appState.turnExpired)return null;
    if(pick==null||pick==="__back__")return "__back__";
    if(pick==="__deny__")return "deny";
    const askIng=(pick==="__coinsonly__")?null:pick;
    /* ...and how much coin, if any — the room is the engine's (Game.counterRoom). A crate counter may take none at all, so its floor
       is 0; a coins-only counter asks at least one coin more than the offer.

       THE NUMBER DRAGGED IS COIN IN ALL, AND THE CEILING IS THEIR WHOLE PURSE. playtest 21 (Wyatt, countering Dough Hook's 8🌕 with
       the slider stuck at 6, 2e9e06b1): "i cannot ask for all that he has — i should be able to slide the slider up to 8, no?" The 6
       dated from the ±1 STEPPER (d63d14f), and breaking it fixed I4 (no constant prices a trade) and I3 (openingBid lets a bot bid
       its whole purse). But the slider then ran to the whole purse ON TOP of what was offered, so "ye're ASKIN' 40" from a captain
       with 40 who had offered 1 settled as 41 and was always refused (architecture item 20, measured on a phone). The pill reads as
       a total — "Coin instead" — so the slider IS the total: it runs the room, and coinSlider hands back the coin above room.base,
       which is the counter's own shape (askFor on top, Game.counterTerms). */
    const room=askIng?g.counterRoom(player,offer,askIng):coinRoom;
    if(!room)continue;                           // no such counter can be made — re-pick
    // @copy prompt.trade.countercoins — APPROVED as written, Wyatt 2026-08-14 ("draft copy is fine")
    const n=await coinSlider(q.idx,
      k=>say("counter.asking",{q:pn(q.idx),what:dealBits(askIng,k)||say("trade.nothin",{}),want:ilabelImg(offer.want)}),
      room.min,room.min,room.max,say("counter.go",{}),null,null,room.base);
    if(n==null)return null;
    if(n==="__back__")continue;                  // BACK MEANS BACK — return to the crate picker
    return {askIng,askCoins:n};                  // coin ON TOP of room.base — what the engine settles
  }
}
/* A CONFIRMED QUANTITY IS ITS OWN DECISION, AND ask() ONLY EVER LOGS WHICH BUTTON WAS PRESSED.

   MEASURED, on a real trade driven to a real slider: the captain dragged it to 6 and the decision
   log gained exactly `[0]` — the index of "Offer it!". The number lived in the slider's `ref`, and
   the button knew nothing about it. So a solo refresh replayed that trade at the slider's FLOOR (1
   coin, not 6): a different offer, a different answer from the holder, a different r() stream, and
   every recorded decision after it landing on a prompt that is no longer the one it was recorded
   against. From the seat that is not a subtle desync — it is Wyatt's report, "the game was simply
   reset and stalled and the captains log was empty and nothing happened."

   The slider is new (playtest 21 item 7), which is why this is new: every other quantity in the
   game is spelled out in button presses the log already holds. The fix is the seam pickCell() and
   bakeoffPrompt() already use — record the value itself, replay the recorded one — applied at the
   ONE place a quantity is confirmed.

   THERE IS NOW ONE CONTROL, SO THERE IS ONE RECORD (05-01 Task 3, MP-08). This paragraph used to
   read "BOTH controls log it" and explain that a log whose LENGTH depends on routing is a log that
   only replays under the same routing. That hazard is gone rather than managed: coinStepper is
   deleted, every seat drags the slider, and this single call is the only way a coin quantity can
   reach the log — locally or across the wire. */
function logQuantity(n){
  if(appState.replaying){
    if(appState.dlogIdx<appState.dlog.length){appState.dlogN++;return appState.dlog[appState.dlogIdx++];}
    endReplay();
  }
  netHandlers().onLogDecision(n);
  return n;
}
/* EVERY SEAT DRAGS THIS. The line that used to stand here — `if(!decisionIsLocal(seat)) return
   coinStepper(...)` — is what D-55 deleted (05-01 Task 3, MP-08). A remote seat now gets the same
   slider, built by the same builder, and the number it lands on arrives in `ref` through ask()'s
   {i,n} unpack. That means the ONE logQuantity() call below fires for a remote drag exactly as it
   does for a local one, and for the first time the decision log's LENGTH does not depend on how the
   trade was routed: an N-coin counter cost N+2 entries on the stepper and costs 2 either way now. */
async function coinSlider(seat,msgFor,start,min,max,confirmLabel,extraOpt,declineLabel,base){
  /* `base` — coin already on the table that the dragged number INCLUDES (a coins-only counter's offer: Game.counterRoom, architecture
     item 20). The captain drags coin in all; the log and the caller get the number above base — the counter's own shape — so a
     recorded counter replays in the units it was always recorded in. */
  base=base||0;
  if(max<=min){
    /* W6-1 (Wyatt): "'Would ye offer any coin on top?' appears with NO SLIDER when the player has no
       money left. Expectation: the slider appears greyed out, and the button reads 'Nah' instead of
       'Offer it!'"
       THIS BRANCH USED TO SAY "nothing to choose — do not present a slider with one stop on it",
       and for a range like 3..3 that is still right reasoning. It is wrong for an EMPTY PURSE,
       because there the missing control is the answer to the question: the sentence asks whether to
       add coin and the screen shows nothing to add it with. So the slider is drawn, DISABLED, at its
       one stop — the browser refuses the drag and greys it, one mechanism doing both.
       THE DECLINE LABEL IS THE CALLER'S. "Nah" answers "would ye offer any coin on top?"; the
       counter-offer's sentence STATES a fact ("ye're ASKIN' X for yer Y"), where the same word would
       read as cancelling the whole counter rather than declining the coin. Same mechanism, different
       sentence, so the word travels with the sentence. That rule-8 exception is recorded for him in
       .planning/CTO-QUESTIONS.md rather than decided here. */
    /* ⚠ THE DECLINE WORD ONLY FITS WHEN NOTHING IS ACTUALLY OFFERED, and the first cut of W6-1 got
       this wrong — caught by CEO Review 19, which put it plainly: "the button says no and offers a
       coin." This branch fires on `max<=min`, which is NOT the same as "broke". A coins-only offer
       from a captain holding exactly ONE coin has minC=1, maxC=1, so it lands here too — and the
       button read "Nah" while pressing it returned logQuantity(1) and offered that coin. A new wrong
       screen, reachable by anyone down to their last coin, where the old label had at least been
       truthful.
       So the word is chosen by the AMOUNT, not by the branch: at zero the button declines, above
       zero it confirms, because above zero it really does commit something. */
    const nothingOffered = min === 0;
    const opts=[{label:(nothingOffered && declineLabel) || confirmLabel,value:"ok",cls:"primary"}];
    if(extraOpt)opts.push(extraOpt);
    opts.push({label:say("button.back",{}),back:true,value:"__back__"});
    const v0=await ask(seat,msgFor(min),opts,null,null,{slider:{min,max:min,start:min,ref:{value:min},fmt:msgFor,aria:"Coins",disabled:true}});
    if(appState.turnExpired)return null;
    if(v0==="ok")return logQuantity(min-base);
    if(v0==="__back__"||v0==null)return "__back__";
    return v0;
  }
  const ref={value:start};
  const opts=[{label:confirmLabel,value:"ok",cls:"primary"}];
  if(extraOpt)opts.push(extraOpt);
  opts.push({label:say("button.back",{}),back:true,value:"__back__"});
  const v=await ask(seat,msgFor(start),opts,null,null,{slider:{min,max,start,ref,fmt:msgFor,aria:"Coins"}});
  if(appState.turnExpired)return null;
  if(v==="ok"){
    const n=logQuantity(Math.max(min,Math.min(max,ref.value))-base);
    // clamped AGAIN on the way out, against the range THIS call was given: the number coming back
    // may be a replayed one, and a save made when the purse was richer must not spend coins the
    // captain does not have now
    return Math.max(min-base,Math.min(max-base,n));
  }
  if(v==="__back__"||v==null)return "__back__";
  return v;
}
/* Returns {spoken, struck}, like every hail runner: spoken once the offer is put to the table (the `openoffer` below), never
   before. Whether that ends the turn is Game.hailEndsTurn's (architecture item 14). */
export async function humanTrade(player){
  const g=appState.game;
  // DEFENSE IN DEPTH, for any caller but the menu (which greys Trade on the same answer): whether this captain may open a trade
  // is the engine's (Game.whyNoTrade — nothing to give, or nobody still on the board holding a crate), so decline here, before the
  // want prompt renders, rather than dead-end them a screen deeper. Each reason keeps the refusal line it always had.
  // @copy adhoc.trade.nothingtogive
  // @copy adhoc.trade.nocargo
  const cannot=g.whyNoTrade(player);
  if(cannot){await sayFlash({nothingToTrade:"trade.nothingAtAll",noCargo:"trade.noCargo"}[cannot],{p:seat(player.idx)});return {spoken:false,struck:false};}
  const st={want:undefined,baseIng:undefined,extraCoins:undefined};
  let step=0;
  while(step<3){
    // CR-02 layer 1: the shot clock can expire on ANY prompt below. No partial trade, ever.
    if(appState.turnExpired)return {spoken:false,struck:false};
    if(step===0){
      // every crate in the game, with the ones nobody holds greyed out (rule 4, Wyatt's ruling)
      const opts=g.ings.map(i=>{
        const holders=g.holdersOf(i,player);
        // playtest 21 item 5: the greyed crate says which crate it is and why it is out of reach,
        // so the reason survives even when the shared helper line is explaining something else
        return {label:ilabelImg(i),value:i,disabled:!holders.length,
          why:sayText("trade.nobodyHas",{ing:iname(i)})};
      });
      opts.push({label:say("button.back",{}),back:true,value:"__back__"});
      // @copy prompt.trade.want
      // no shared helper line: every greyed crate above carries "No captain on the water is
      // carryin' <that crate>", which names the crate the general sentence could not (2026-08-25).
      const want=await ask(player.idx,say("trade.want",{}),opts);
      if(want==="__back__"||want==null)return {spoken:false,struck:false};
      st.want=want;step=1;
    }else if(step===1){
      // An offer is a crate, coins, or both — sweeten a crate with a few coins on top.
      const canOfferCoins=player.coins>0;
      const ingOpts=[...new Set(player.ing)].map(i=>crateOpt(player.ing,i));
      ingOpts.push({label:say("trade.coins",{}),value:"__coinsonly__",disabled:!canOfferCoins,
        why:sayText("trade.emptyPurse",{})});
      ingOpts.push({label:say("button.back",{}),back:true,value:"__back__"});
      // no shared helper line: the greyed "— coins only —" option already carries "Yer purse is
      // empty — ye've no coin to offer, so it must be a crate." (2026-08-25)
      // @copy prompt.trade.give
      const baseIng=await ask(player.idx,say("trade.give",{want:ilabelImg(st.want)}),ingOpts);
      if(baseIng==="__back__"){step=0;continue;}
      if(baseIng==null)return {spoken:false,struck:false};
      st.baseIng=(baseIng==="__coinsonly__")?null:baseIng;step=2;
    }else{ // step 2 — playtest 13: the coin stepper, never an option grid
      // ye may offer everything ye have — the same ceiling the counter now uses, and the same one
      // openingBid gives a bot. See counterOffer for why the old 6 had to go; fixing one and not
      // the other would leave the human able to ASK for a whole purse but not OFFER one.
      const maxC=player.coins;
      const minC=st.baseIng?0:1; // a coins-only offer needs at least 1 coin
      if(maxC<minC){
        // @copy prompt.trade.nothingtooffer
        await ask(player.idx,say("trade.nothingToOffer",{}),[{label:say("button.back",{}),back:true,value:-1}]);
        step=1;continue;
      }
      // @copy prompt.trade.addcoins
      // playtest 21 item 7: the slider here too, not only in the counter. Wyatt's rule is about the
      // ARC, not about one prompt — leaving ±1 circles on the offer-building step and removing them
      // from the counter would be the same gesture behaving two ways, which is the consistency rule
      // this project treats as a bug in its own right.
      /* T-19 (Wyatt, 2026-08-26): "currently the text is very confusing when the slider appears:
         it says 'Yer GIVING' {ingredient1} for {ingredient2} and it doesn't say what the slider is
         for at all. Instead, when the slider appears, it should say 'Would ye offer any coin on
         top?'"  His sentence, verbatim. The line now asks the question the control answers; the
         running amount is not lost, because the slider draws its own value beside the handle.
         The deal itself is still on screen — this prompt sits under the offer being built. */
      /* W2-9 (Wyatt, 2026-08-27): "context-blind. If coin is the ONLY thing being offered it makes
         no sense — should read 'How many coins?'" Right: "on top" of nothing is not a question.
         THE SIGNAL ALREADY EXISTED, one line up. `st.baseIng` is null exactly when the captain
         picked "— coins only —" (:1806), and `minC` at :1812 was already branching on it to raise
         the floor to 1. The control knew; only the sentence did not. Nothing new is computed here. */
      const n=await coinSlider(player.idx,
        k=>say(st.baseIng?"trade.coinOnTop":"trade.howMany",{}),
        minC,minC,maxC,say("trade.offerGo",{}),null,say("button.nah",{}));
      if(n==null)return {spoken:false,struck:false};
      if(n==="__back__"){step=1;continue;}
      st.extraCoins=n;step=3;
    }
  }
  if(appState.turnExpired)return {spoken:false,struck:false};
  const offer={want:st.want,giveIng:st.baseIng,giveCoins:st.extraCoins||0};
  const offerDisplay=g.offerLabel(offer,0)||"nothing";
  // announcing an offer is itself public information — the whole table now knows what player is after,
  // and that is exactly how bots learn each other's recipes without ever seeing one (see noteDemand)
  g.noteDemand(player,offer.want,1);
  g.ev({t:"openoffer",p:player.idx,want:offer.want,offer:offerDisplay});
  liveRender();
  await narrateLastEvent();

  // ---- every captain the hail is put to answers: bots reason (engine-side), human captains are asked ----
  const responses=await hearHail(player,offer);
  if(responses==null)return {spoken:true,struck:false};   // the clock ran out on a captain answering

  // ---- the asker sees EVERY answer at once and picks one, or walks away (rule 4a/4b) ----
  /* WHAT EACH CAPTAIN IS ASKING FOR MUST BE ON SCREEN BEFORE YE TAP — playtest 21, and this was a
     bug I shipped. Wyatt: "the counteroffer isnt displayed at all!!! When i clicked 'dough hook',
     I suddenly lost my wheat! The narration box must say what each player is offering you."

     The cause was one word. The radial bloom renders an option's `short` form when it has one, and
     I gave the counter option `short: "💰 Crustbeard"` — a label that throws the TERMS away. So the
     circle named a captain and said nothing about the price, the ask said only "the table answers",
     and a counter that REPLACES the give side (asking for a different crate of yours) took a crate
     the player never agreed to part with. A trade prompt that hides the price is worse than no
     prompt: it turns a deliberate choice into a forfeit.

     Two fixes, because the circle and the ask fail differently:
       - the ASK now enumerates every answer, one captain per line, in full — Wyatt's instruction,
         and the only place there is room for the whole deal;
       - the CIRCLE's short form carries the crate ICON and the coins, so even the compact form can
         never be read as "just tap the name". Short means SHORTER, not silent.

     AND SHORTER STILL NAMES THE SAME PRICE — architecture item 20b, 2026-09-18, Wyatt on his own
     playtest: "Fix this so it is intuitive -- i've also noticed the confusion when i play." The
     circle had kept the price but SIGNED it, so "Crustbeard" over "+12🌕" read as twelve coins
     MORE than the offer already on the table, when 12 is the whole of it. Both circles now come
     out of the same words table (trade.takesShort / trade.wantsShort) and the same dealBits — so
     the petal and the sentence beside it cannot mean two prices again.
     HIS OWN WORDING FOR THAT CIRCLE, and it is final (item 20c, 2026-09-18): "Crustbeard 12🌕" —
     the captain and the price, no verb. words.js holds it; nothing in this file picks a word. */
  const opts=[];
  const termsOf=r=>counterTerms(offer,r);
  const bitsOf=(t,icons)=>dealBits(t.giveIng,t.giveCoins,icons);
  const answerLines=[];
  for(let i=0;i<responses.length;i++){
    const r=responses[i];
    if(r.kind==="accept"){
      const b=bitsOf(offer);
      answerLines.push(say("trade.takes",{icon:iconImg(CHECKMARK_IMG),q:seat(r.q.idx),what:b||say("trade.offer",{})},player.idx));
      opts.push({label:say("trade.accepts",{icon:iconImg(CHECKMARK_IMG),q:seat(r.q.idx)},player.idx),
        short:say("trade.takesShort",{icon:iconImg(CHECKMARK_IMG),q:seat(r.q.idx)},player.idx),value:i});
    }
    else if(r.kind==="counter"){
      /* counterTerms() is the ONE place a counter is turned into the deal it means, and the ask
         line, the circle and the settlement below all read it — so what a captain is SHOWN and
         what they GET cannot drift apart, which is exactly how a trade UI goes wrong. */
      const t=termsOf(r);
      const bits=bitsOf(t);
      const haveIng=!t.giveIng||player.ing.includes(t.giveIng);
      // a counter that swaps the give side is the dangerous one — say "instead" out loud
      const swap=t.giveIng&&t.giveIng!==offer.giveIng;
      answerLines.push(say(swap?"trade.wantsInstead":"trade.wants",{q:seat(r.q.idx),what:bits||say("trade.nothin",{})},player.idx));
      opts.push({label:say("trade.wants",{q:seat(r.q.idx),what:bits||say("trade.nothin",{})},player.idx),
        // the petal: the crate's picture where the line has its name, and the same price in full
        short:say("trade.wantsShort",{q:seat(r.q.idx),what:bitsOf(t,true)||say("trade.nothin",{})},player.idx),
        value:i,
        // the engine's one test of what an asker can honour — the same one it applies for a bot
        disabled:!g.canTakeAnswer(player,offer,r),
        why:!haveIng?sayText("trade.notCarrying",{ing:t.giveIng?iname(t.giveIng):say("trade.that",{})})
          :sayText("trade.tooDear",{n:t.giveCoins,coins:player.coins})});
    }
  }
  const denials=responses.filter(r=>r.kind==="deny");
  const colors=opts.map(o=>HEXCOL[responses[o.value].q.idx]);
  opts.push({label:say("trade.walkAway",{}),value:-1});colors.push(null);
  const denyNote=denials.length
    ?denials.map(r=>say(r.why==="blocking"?"trade.refuses":"trade.declines",{q:seat(r.q.idx)},player.idx)).join(" · ")
    :null;
  // Nobody said anything ye can act on (or nobody answered at all): no choice to put to ye, and the
  // engine says why below. Otherwise:
  // @copy prompt.trade.pick — APPROVED as written, Wyatt 2026-08-14. One captain per line: the whole point is that
  // the price is readable BEFORE a finger moves, so this deliberately does not compress.
  let pick=-1;
  if(responses.some(r=>g.canTakeAnswer(player,offer,r))){
    pick=await ask(player.idx,say("trade.answers",{want:ilabelImg(offer.want),lines:answerLines.join("<br>")}),opts,colors,denyNote);
    if(appState.turnExpired)return {spoken:true,struck:false};
  }
  /* THE HAIL IS RESOLVED BY THE ENGINE, and the WORDS for one that falls through are the narration
     table's, read off the `parley` event's reason — the same lines a bot's failed hail now gets
     (architecture item 15). CR-02 layer 2 lives there too: settleTrade validates BOTH legs before
     EITHER mutates, so a deal that can no longer be honoured falls through rather than half-completing. */
  const hail=g.resolveHail(player,offer,responses,pick===-1||pick==null?null:responses[pick]);
  if(!hail.struck){liveRender();await narrateLastEvent();return {spoken:true,struck:false};}
  await narrateLastEvent();
  liveRender();
  return {spoken:true,struck:true};
}
/* WHICH LADDER SPEAKS AT THE ACT MENU — one helper slot, four teachable buttons.
   FIRST SIGHTING, NOT TURN COUNT. The ladder with the most rungs still to give wins, so a captain
   offered their first battle on day nine still meets its rung 0 — whenever that is. Nothing here
   needs to know how experienced a player is; the counts already know, moment by moment.
   A GREYED CIRCLE IS SKIPPED: it teaches nothing a captain can act on, and it already carries its
   own `why`. That is also what keeps this from ever colliding with the anchored reasons. */
const ACT_LADDERS=[["dock","act.menu"],["attack","act.attack"],["trade","act.trade"],["pass","act.muse"]];
function actLadder(opts){
  let best=null,bestLeft=0;
  for(const [val,id] of ACT_LADDERS){
    const o=(opts||[]).find(x=>x&&x.value===val);
    if(!o||o.disabled)continue;
    const left=pilotDepth(id)-1-pilotRung(id);
    if(left>bestLeft){bestLeft=left;best=id;}
  }
  return best;
}
/* The engine's reasons (Game.whyNoAttack / whyNoAttackHere / whyNoTrade) in the game's words — one entry per reason, and
   nothing else in this file picks these lines. A reason the engine gains without an entry here would throw in say();
   scripts/qa/action_reasons_from_engine_check.mjs fails first, because it words every reason the engine can give. */
const WHY_WORDS={noPowder:"act.noPowder",sanctuary:"act.sanctuary",emptyHolds:"act.emptyHolds",
  nothingToTrade:"act.nothingToTrade",noCargo:"act.noCargoOnWater"};
/* ⭐ AFTER A BOAT LANDS, THE TRADE WIND — ONE STEP FOR EVERY SAIL (architecture item 19, 2026-09-17).
   A human's sail (humanTurn), a human's Move instead (humanAct) and a bot's sail (botTurn) each carried their own copy of these
   lines, and only the first had the line for a boat that comes into the current AT its head ("rim.head", said here with
   sayFlash) — so a human who took Move instead, and every bot, rode a zero-square ride in silence. The ENGINE's trade-wind step
   now records that ride as well as a real one (Game.tradewind: a `tradewind` or a `rimhead` event), and the one narration table
   words it for whoever is reading. A flight from a fight takes the same engine step inside Game.flee, and the fight shows
   what it recorded through showTheWind below, once its card is down — before the Lookout's line, the way a won or a null
   fight says its result before the calls are settled (src/orchestrator.js asyncBattleRun). Without that, a flee's wind was
   never said at all: the calls settle after it, and the attacker's closing narration finds only the settled calls.
   scripts/qa/after_sail_one_step_check.mjs holds it. */
async function afterSail(player){
  await showTheWind(appState.game.tradewind(player));
}
/* The trade-wind step SHOWN: the table told, the drain waited on (the ride, if there was one), and the event narrated —
   the event it is handed, never the top of the pile (W7). Nothing when the step recorded nothing. */
export async function showTheWind(ev){
  if(!ev)return;
  publishNow();await liveRender();await narrateEvent(ev);
}
export async function humanAct(player,sailCtx){
  const port=appState.game.adjPort(player);
  const canDock=port&&!(appState.game.cfg.singleDock&&appState.game.dockOccupiedBy(port,player));
  /* ⭐ WHETHER YE MAY ATTACK OR TRADE, AND WHY NOT, IS THE ENGINE'S ANSWER — this menu greys the buttons and words the reason,
     and decides nothing (architecture item 13, 2026-09-17). Game.alongside, attackTargets, whyNoAttackHere and whyNoTrade hold
     the rules; WHY_WORDS below is the only thing that turns a reason into a sentence.
     WHAT STOOD HERE, so it is not rebuilt: a target list of everyone adjacent with no in-play test, justified by a comment saying
     "a captain who has already fired up the ovens is still a legal target ('nobody is safe')" — the v2 classic rule, false since
     his SANCTUARY ruling of 2026-08-06; its own powder test; a reason picked by elimination (powder, else "Their holds are empty");
     and a Trade test that counted a baker's crates. So beside a captain baking at Tortuga with five crates aboard, Attack said
     their holds were empty, and when the only cargo on the water was a baker's, Trade was live and bounced when tapped.
     The Attack button still SHOWS whenever a ship lies alongside — a baker included, greyed, saying why. The two trade reasons
     keep their own ruling history in the engine (D-41; the 02.2 FINAL-QA "nothing to offer" strand). */
  const g=appState.game;
  const alongside=g.alongside(player.pos,player);
  const attackable=g.attackTargets(player);
  const attackWhy=g.whyNoAttackHere(player);
  const tradeWhy=g.whyNoTrade(player);
  const canTrade=!tradeWhy;
  const opts=[];
  // F5 (Wyatt-approved 2026-07-29), his own example: *"In the 'Dock at Full Cream Folly' the icon
  // should go directly in front of the island name — 'Dock at 🥛 Full Cream Folly'"*. The icon used
  // to sit in front of the whole anchor-plus-verb clause. Nothing else about the label changed, and
  // the anchor stays where it is (it labels the ACTION, not the island). The dock FLIP prompt
  // (:above) was already correct and is deliberately untouched.
  // /4 radial (Wyatt's pick: short verbs in the circles, details in the pill): each long label
  // carries a `short` form for the bloom; the card fallback keeps the full sentence. Draft copy.
  /* D-33 (Wyatt, his item 4, build t): the anchor goes, and the petal reads as the INGREDIENT, the
     word Dock, and a COIN WITH NO NUMBER. His reason is exact and worth keeping verbatim: the flip
     decides whether it pays 1 or 3, so a number printed before the flip would be a lie.

     THE COIN GLYPH IS 🪙, NOT 🌕, AND THAT IS THE WHOLE POINT. emojify maps 🌕 to the game's flat
     coin and 🪙 to COIN_SPIN_IMG — the coin mid-flip. A still-spinning coin says "this price has
     not landed yet" in one character, which is precisely the fact he wants the button to carry.

     THE ONE PLACE HIS NOTE IS NOT TAKEN LITERALLY, flagged so he can overrule it in a word: he
     wrote the label as `{ingredient} Dock +🪙`. That `+` is read here as a list separator ("and a
     coin"), the way the phase plan itself restates it, NOT as a sign — because in this game's own
     button vocabulary a leading + means a GAIN (treasure reads "+3") and the neighbouring Attack
     button writes its cost with a minus. Docking is a cost, so a + would be the one misleading
     mark on a button whose entire redesign is about not stating a price it does not know yet.

     The neighbouring ruling this does NOT undo: Attack states its powder and Pass pays a known
     amount BECAUSE THOSE ARE KNOWN BEFORE YE COMMIT. Dock is a coin flip and states no number.
     D-33 is the application of that consistency rule, not an exception to it.

     Wyatt, 2026-08-14, on the icon's position: *"the ingredient icon should go directly in front of
     the island name — 'Dock at 🥛 Full Cream Folly'"*. Kept: the ingredient still leads, and the
     island name still follows it in the full card label. Only the anchor and the missing coin
     changed. The dock FLIP prompt (:above) was already correct and stays untouched.
     /4 radial (his pick: short verbs in the circles, details in the pill): the long label is the
     card fallback, `short` is what the petal shows. ONE builder — optionButtonsHTML carries both to
     the host, to a guest and to the draft card, so this single edit reaches all three. */
  /* T-20 (Wyatt, 2026-08-26): "remove the coin image from the dock button; just use the image of
     the ingredient at that island (eg cinnamon, when docking at the spice isle)." The button
     already carried the island's own ingredient; the trailing coin was a second picture competing
     with it for the same glance, and it named a reward the button does not actually hand out (the
     dock's coin depends on the flip). Both forms lose it together — long and short are one control
     wearing two widths, and a difference between them is the consistency rule as a bug. */
  if(canDock)opts.push({label:say("act.dock",{icon:iconImg(ING_IMG[port]),place:dockPlace(port)}),short:say("act.dockShort",{icon:iconImg(ING_IMG[port])}),value:"dock"});
  // #5b/#5d: shorter label, and the Attack button always shows when there's a target — greyed out
  // (disabled) rather than hidden when you can't afford powder.
  // playtest 21 item 5: a greyed circle carries its OWN reason, spoken at the circle when tapped.
  // Attack has three ways to be greyed — no powder, sanctuary, an empty hold — and they used to share one line. The engine
  // orders them (Game.whyNoAttack): powder first, because it is the one the captain can actually do something about.
  // @copy adhoc.why.* — APPROVED as written, Wyatt 2026-08-14 ("draft copy is fine").
  // The reason is read to the captain being asked, so "ye"/"yer" is derived for that seat (player.idx), wherever the menu is drawn.
  if(alongside.length)
    opts.push({label:say(g.cfg.powder?"act.attack":"act.attackFree",{n:g.cfg.powder}),value:"attack",disabled:!attackable.length,
      why:attackWhy?sayText(WHY_WORDS[attackWhy],{n:g.cfg.powder,p:seat(player.idx)},player.idx):null});
  // @copy adhoc.why.nothingtotrade
  opts.push({label:say("act.trade",{}),value:"trade",disabled:!canTrade,
    why:tradeWhy?sayText(WHY_WORDS[tradeWhy],{p:seat(player.idx)},player.idx):null});
  // (the classic "Start yer bakery!" button stood here — the classic day is gone, his word of 2026-09-13)
  // THE OVENS BUTTON (Wyatt, 2026-08-09: "Where did the button go? This is a celebratory moment!
  // It feels terrible to have to click 'pass'").
  //
  // Suppressing the classic bakery button above left NOTHING in its place. The ovens still lit —
  // runLiveDayBakeoff calls lightOvens() the moment the turn returns — but the captain who had just
  // spent thirteen days assembling a full recipe had to end that turn by tapping "Pass", and only
  // then read that they had arrived. The biggest moment in the voyage was reached through the
  // button that means "I have nothing to do".
  //
  // This does NOT light the ovens itself, and that is deliberate: lightOvens() must stay in the day
  // loop, called exactly once per captain, or the RNG stream forks on which button a human happened
  // to press (scrambleBench draws from it). The button's whole job is to END THE TURN with the
  // right name on it — the loop lights the ovens a moment later and EVENT_NARRATION.ovens carries
  // the celebration, so nothing is flashed here that would step on it.
  //
  // It REPLACES Pass rather than joining it. The "a turn must always be endable" invariant below is
  // what Pass exists for, and this discharges it — same action, right name. Offering both would put
  // the dead option back on screen next to the live one.
  const canOvens=appState.game.cfg.bakeoff&&appState.game.canBake(player);
  // @copy adhoc.act.fireovens
  if(canOvens)opts.unshift({label:say("act.ovens",{icon:iconImg(CUPCAKE_IMG)}),short:say("act.ovensShort",{icon:iconImg(CUPCAKE_IMG)}),value:"ovens",cls:"primary ahoyGlow"});
  // v2 rule 3: Fish is gone from the menu, and rule 4's Trade is table-wide rather than
  // adjacency-gated. Together that made it possible for EVERY option to be unavailable at once —
  // not on a dock, nobody adjacent to fight, nobody holding cargo yet, recipe unfinished — which
  // is exactly what happened on turn one of the first phone playtest: a menu with a single greyed
  // Trade button and no way to end the turn at all.
  //
  // Fish used to absorb that case by accident, because it was always available. Nothing replaced
  // it, so this does, explicitly: a turn must ALWAYS be endable. Never disabled, never hidden —
  // a "pass" that vanishes when you need it is the D-41 dead-end all over again.
  //
  // offered only if this player's sail step ended in "Stay put" — covers the reported "hit Stay
  // put by accident" complaint. Sailing is free now (rule 2), so there is no purse test.
  const canMoveInstead=sailCtx&&
    player.pos[0]===sailCtx.preSailPos[0]&&player.pos[1]===sailCtx.preSailPos[1];
  if(canMoveInstead)opts.push({label:say("act.moveInstead",{}),back:true,value:"moveInstead"});
  // RULE-01: the button states what a pass pays, built exactly like Attack's cost above — same
  // conditional shape, same no-break wrapping, same read off the live round config, and the coin
  // left raw for panel()'s emojify chokepoint (D-50). Never hand-rolled markup for a coin.
  //
  // ONLY WHEN THE PAYOUT IS TRUTHY, for the same reason Attack drops its parenthetical when powder
  // is free: a "(+0🌕)" advertises nothing and reads as a broken label. If D-07 zeroes the payout at
  // the wave 5 gate, the annotation disappears rather than lying about it.
  //
  // The sign is ASCII, not Attack's U+2212 MINUS SIGN — every GAIN parenthetical in this game uses
  // a plain plus (the shot-clock line in src/ui/util.js, the Spotter's Bounty note below).
  //
  // No `short` form: src/ui/stage.js requires one only past 16 characters of textContent, and this
  // renders 14 at the shipped default — fewer once emojify swaps the coin for its image. Attack
  // carries none for the same reason.
  //
  // NOT swept onto Dock or the sidebet Call, and that is the consistency ruling rather than an
  // omission: a button states its amount when the amount is CERTAIN at the moment of the tap. Buy
  // states its price, Attack states its powder, a pass pays a known amount. Dock is a coin flip and
  // Call is conditional on being right, so both put their amounts in the prompt text instead.
  // ITEM 1 + ITEM 14 (Wyatt, 2026-08-20): "Remove the () from action prompt buttons – they take too
  // much space", and Pass "should not have parentheses around the +1". The brackets are gone from all
  // three money buttons — Buy, Attack, Pass — while the sign, the amount and the coin all stay. The
  // nobrk span is KEPT: it is what stops "−2" wrapping away from its coin, which is a different job
  // from the brackets. Buy's `short:` (the radial-fan label) already had no brackets, so this makes
  // the flat label agree with the fan rather than inventing a style.
  // NOT changed: the parentheticals in NARRATION (e.g. the sailing-order line, :2260) — item 1 says
  // action prompt BUTTONS, and narration is prose where a bracket reads normally.
  /* MUSE, not Pass (Wyatt, 2026-08-27). "Pass" named the absence of a move; "Muse" names what the
     captain is actually doing — watching the water and thinking about a recipe — so the quietest
     turn in the game stops reading as a forfeit.

     GRAVEYARD, so nobody re-runs this argument by accident (rule 10): this label was briefly
     "Look into the ocean" on 2026-08-05 and was changed BACK to "Pass". "Muse" is a different word
     and a later ruling of his, not a repeat of that one.

     NO TOOLTIP, and that is his call too, made the same day: "don't build the tooltip, ignore this
     and let the idea go." The backlog had asked for hover text explaining the button; the game has
     no mechanism for one on an ENABLED button (data-why is disabled-buttons-only, util.js), and he
     chose not to build one rather than have half the item ship quietly.

     THREE STACKED LINES — "a wave image above 'Muse' and a +1🌕 below it", his words. The <br>
     idiom is the house form for exactly this and is already what crateOpt() uses for the radial
     fan ("icon above, words below"); `short` and `label` carry the same shape so the circle and
     the list button read identically rather than being two spellings kept in step (rule 8).
     A real WAVE_IMG, not the 🌊 emoji, because he asked for an image and the asset already exists.
     The coin still comes off cfg.passCoin — a payout is not a constant (rule 9). */
  if(!canOvens){
    const museCoin=appState.game.cfg.passCoin?`<br>${say("act.museCoin",{n:appState.game.cfg.passCoin})}`:"";
    const museFace=`${iconImg(WAVE_IMG)}<br>${say("act.muse",{})}${museCoin}`;
    opts.push({label:museFace,short:museFace,value:"pass"});
  }
  // #5c/D-41: helper text under the buttons explains why a greyed button is greyed — Attack's own
  // powder gate, and now Trade's cargo gate, follow the same pattern.
  //
  // D-41 COMPLETED (F11, found in the 2026-07-29 two-tab playtest): these arms used to be an
  // if/else-if chain, and the two conditions are INDEPENDENT — whether an enemy is adjacent says
  // nothing about whether anyone is holding cargo. So whenever an attack target happened to be
  // adjacent, the first arm won and Trade's greyed reason became unreachable: the playtest showed the
  // greyed Trade button rendering with ATTACK's helper text beneath it while Attack was enabled. The
  // string existed, shipped verbatim, and was structurally reachable — it simply never appeared in
  // the state it explains. Two fixes, both structural:
  //   1. independent conditions get independent `if`s, so neither can suppress the other, and where
  //      both apply BOTH reasons are shown rather than one being silently dropped;
  //   2. a GREYED control's reason outranks an ENABLED control's informational tip — the Attack tip
  //      only fires when nothing is greyed, because telling a player how Attack works does not
  //      explain why Trade is unavailable.
  // No new copy: all three strings already existed and are already Wyatt-approved.
  // scripts/ui_contract_check.js assertion 6 gates this shape, red-proofed against the ab98e04 code.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
  /* THE SHARED HELPER LINE IS GONE (Wyatt, 2026-08-25, after seeing the anchored version driven
     and screenshotted: "this looks great to me — delete the tooltip at the top").

     IT WAS A DUPLICATE, AND THE WORSE COPY OF THE TWO. Every sentence it could show was already on
     the control it described, as that option's own `why` — shown in `.apWhy`, which is
     position:fixed ON the button with a tail pointing at it (flow.js showWhy):

       shared line, under the pill        the button's own why, anchored to it
       "Ye need 2🌕 to fire."             "Ye can't afford the powder — 2🌕 a broadside, and yer
                                           purse won't stretch."
       "Their holds are empty."           "Their holds are empty — there's nothin' aboard worth
                                           takin'."
       "Ye've nothin' to trade."          "Ye've nothin' to trade — an empty hold and an empty
                                           purse."
       "No one's holding cargo…"          "Not a captain on the water is carryin' cargo to trade
                                           for."

     MEASURED before deleting, on a driven phone-sized voyage: the shared line sat 6px under the
     narration pill and 182px from the nearest button it was about, while each greyed control's own
     reason appeared on the control itself and only one was ever on screen at a time. His copy pass
     the day before had been shortening this line — it was shortening a copy.

     D-41's structural lesson SURVIVES and is not undone: independent conditions must never suppress
     one another. It is now enforced where it belongs, on the options themselves — Attack's why and
     Trade's why are separate strings on separate buttons, so neither can swallow the other by
     construction, which is stronger than the two independent `if`s this replaced. */
  /* ⚠ THE PILOT PUTS A LINE BACK IN THIS SLOT, AND THAT RUNS STRAIGHT INTO THE RULING ABOVE.
     Worth stating plainly rather than burying, because he deleted the last thing that lived here.

     WHAT HE DELETED was a DUPLICATE: every sentence it showed was already on the control it
     described, as that option's own `why`, anchored to the button with a tail. He was right, and
     nothing here restores it — each button's `why` is still the only place a greyed circle
     explains itself, and the two can never collide because a greyed option is skipped below.

     WHAT THIS SHOWS is a RULE the buttons do not state: that a hail reaches the whole table, that
     a broadside is one flip each and the winner takes a crate. That is the editorial law he set on
     the same day — A RUNG MAY NOT RESTATE ITS OWN BUTTON — and it is what tells the two apart.
     It also deletes itself: two sightings of Attack and the line is gone for good.

     I am flagging it for his eye in playtesting rather than treating "different enough" as
     settled. If he reads it as the tooltip coming back, the fix is one line: drop these four
     ladders and let the act menu teach nothing. */
  const helpId=actLadder(opts);
  const sub=helpId?(pilotMsg(helpId,null)||null):null;
  if(helpId)pilotSee(helpId);
  const prompt=say("act.ask",{name:pn(player.idx)});
  // @copy prompt.act.menu
  const v=await ask(player.idx,prompt,opts,null,sub);
  if(appState.turnExpired)return;
  // the clock keeps running (and re-arms fresh) through dock/attack/trade/fish now, instead of
  // stopping here — each ask() inside those sub-flows re-arms it for its own decision
  if(v==="moveInstead"){
    const dest=await pickCell(player,reachable(player));
    if(appState.turnExpired)return;
    // G6 (COIN-AUDIT.md site 7): reachable() was computed from the pre-await purse and
    // `await pickCell(...)` is the window. A shortfall falls through to the existing "no
    // destination" outcome — the ship simply does not move, which renders nothing, so nothing is
    // invented. appState.turnExpired above does NOT cover this: it is set at 30s, the coin
    // penalty fires at 20s and sets no flag at all.
    /* THE SAIL IS THE ENGINE'S (architecture item 7): Game.sailTo checks the square, writes it, and records the move with the route
       the same search takes — the one every captain's sail gets. A square it refuses is no move at all. */
    if(dest&&appState.game.sailTo(player,dest)){
      player.justDocked=false;
      /* ⭐ THE TURN LOOP WAITS ON THE DRAIN, AND TOUCHES THE DISPLAY NOWHERE.
         Wyatt, 2026-09-08, reading my write-up of the sound-timing fix: "All players, bot or human,
         are supposed to feed actions to an engine, which feeds events back, which a different piece
         of code displays. Is that not what you built here?"
         It is — playForEvent's only caller in the tree is consumeEvent, and consumeEvent's only two
         producers are this drain and the guest's wire. But this line used to reach PAST the drain
         and await the presentation itself (`liveRender(); await animateSailRoute(evSail)`), because
         liveRender() was fire-and-forget and a turn loop that must stay behind a moving boat had
         nothing else to wait on. That is orchestration holding a reference to the display for its
         own pacing, and it is exactly what let the two get out of order: for a year the ride was
         awaited BEFORE the drain, so the boat glided while its event sat unread and the sound
         landed on arrival.
         liveRender() returns a promise now (src/ui/panel.js), so the wait is on the DRAIN and the
         consumer owns every pixel and every sound. Two lines became one, and the turn loop no
         longer imports a walker at all.
         WHAT HAS NOT CHANGED: publishNow() still tells the table BEFORE this tier draws anything
         (W9 — it calls only the broadcast half, never the local drain), so no other browser is held
         still for the length of this captain's own animation. */
      publishNow();await liveRender();
      await afterSail(player);}
    await humanAct(player,sailCtx);return;
  }
  if(v==="pass"){
    // See Game.nextSeaCreature for the walk. advanceSeaCursor persists where this device's captain
    // has got to, so the NEXT voyage picks up at the next creature rather than restarting near the
    // top — over enough games they see all fifty. Only this seat owns the cursor; bots walk their
    // own derived offsets and never touch it.
    // RULE-01: the dubloon and the event are one shared engine method, so this site, the bot
    // fallback below and the engine's own fallback can never drift apart on what a pass is worth.
    appState.game.doPass(player);
    if(player.idx===appState.game.seaSeat)advanceSeaCursor(player);
    liveRender();
    await narrateLastEvent();
    return;
  }
  // Ends the turn and nothing else — runLiveDayBakeoff lights the ovens the instant this returns,
  // and narrates it. See the option's own note above for why the click must not do it itself.
  if(v==="ovens")return;
  if(v==="dock"){
    const r=await humanDock(player,port);
    if(r==="back"){await humanAct(player,sailCtx);return;}
  }
  else if(v==="attack"){
    // #5d: safety net — the button is disabled when you can't afford powder, but guard the action
    // too (e.g. a forced/edge selection) so we never enter a battle you can't pay for.
    // @copy adhoc.act.nopowder
    if(!attackable.length){await sayFlash("act.cantAttack",{p:seat(player.idx)},1400);await humanAct(player,sailCtx);return;}
    const t=attackable.length===1?attackable[0]:
      // @copy prompt.act.attacktarget
      // SEAT-ANCHORED, joining the ONE placement rule (Wyatt, 2026-09-01, from the Glass: attack
      // buttons sat "on top of the wrong captain" — "fix this universally, not through patches").
      // Without seats this menu ran the ordinary fan around the chooser, where a captain-coloured
      // circle lands on whichever neighbour's hull the geometry happens to cross — with two
      // ADJACENT captains, often the wrong one. `seat` puts each circle on the boat it NAMES
      // (playtest 22's rule, the battle call's exact shape at the sidebet ask below), and Back
      // carries the CHOOSER's seat because the anchored mode is all-or-nothing — one seatless
      // button would silently drop the whole menu back into the fan. Held by
      // scripts/qa/attack_buttons_on_target_check.mjs, proven red on the seatless shape.
      await ask(player.idx,say("act.whom",{}),attackable.map(o=>({label:pn(o.idx),value:o,seat:o.idx})).concat([{label:say("button.back",{}),back:true,value:null,seat:player.idx}]),
        attackable.map(o=>HEXCOL[o.idx]));
    if(t===null){await humanAct(player,sailCtx);return;}
    await netHandlers().onAsyncBattle(player,t);   // the fight has said how it ended, before the calls settled (architecture item 9)
  }
  else if(v==="trade"){
    // #5d: safety net, same shape as Attack's own two lines up — the button is disabled when P
    // has nothing to offer or no one else holds cargo, but guard the action too (e.g. a
    // forced/edge selection) so we never enter a trade P cannot possibly complete.
    // @copy adhoc.act.notrade
    if(!canTrade){await sayFlash("act.cantTrade",{p:seat(player.idx)},1400);await humanAct(player,sailCtx);return;}
    // A hail put to the table IS this turn's action, struck or refused; backing out before a word was said is not — back to the
    // menu. The same one rule the simulator's turn and botTurn ask (Game.hailEndsTurn, architecture item 14).
    if(!g.hailEndsTurn(await humanTrade(player)))await humanAct(player,sailCtx);
    return;
  }
}
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⭐ THE ONE DOOR EVERY TURN COMES THROUGH — Wyatt, 2026-09-09: "Bots and humans MUST share an
   input door."

   His model, and it is the rule in CLAUDE.md now: *human vs bot decides only HOW AN ACTION IS
   CHOSEN, never what may be done.* What stood in its way was `player.strategy === "human" ?
   humanTurn(p) : botTurn(p)` at three call sites — two functions, not one door with two choosers —
   so every fact that is true of ANY turn had to be remembered twice, in two files' worth of
   interleaved mode-specific work.

   THREE THINGS ARE TRUE OF EVERY TURN WHOEVER IS SAILING, and they live here now:
     · the device changes hands first (passGate — a no-op outside pass-and-play, so it is honest to
       run it for a bot too rather than branching on who is playing)
     · and the engine records that a turn began (the `turn` event) — which IS what turns the screen to
       that captain: the top bar, the ring, the box, the bob and Check my recipe all read whose turn it
       is from the event stream (util.js whoseTurn, architecture item 3, 2026-09-16). What stood as a
       step of its own here was applyActiveSeat(), the writer of the slot the top bar used to draw.
   A fourth shared step will be added HERE, once, rather than to two functions by somebody who
   remembers both exist.

   ⚠ WHAT IS NOT MERGED, AND WHY THAT IS THE HONEST STOPPING POINT. humanTurn is 99 lines of
   prompt-and-wait and botTurn is 111 of plan-and-animate; their remaining preambles genuinely
   differ (a banner and a shot-clock flag against a thinking beat), and folding those together is a
   rewrite of the turn loop rather than a convergence of it. The DOOR is what his rule needs: one
   entry, one place turn-level facts are published, and the only thing downstream of it is the
   choosing. The rest is in .planning/BACKLOG.md with its own entry. */
export async function takeTurn(player){
  await passGate(player.idx);
  /* (forgetCourse() stood here — "the dotted line is ONLY visible on the player's turn", Wyatt, playtest 2026-09-10. It ran only
     on the machine running the game, so a crew guest's course never came down with it. The `turn` event below takes the course
     down now, in the one consumer, on every screen — architecture item 12, 2026-09-17; course_down_one_place_check.mjs.) */
  appState.game.ev({t:"turn",p:player.idx});
  /* PUBLISHED AND DRAWN BEFORE THE CHOOSING BEGINS — so the one consumer frames this captain's turn on
     every device (a guest the moment the event lands; the host here) before anybody is asked anything.
     It used to sit undrawn until the next drain, which is why the host needed its own private camera
     call in pickCell. The same pair every other turn-level event in this file already uses. */
  publishNow();await liveRender();
  /* THE TURN'S OPENING LINE, SPOKEN HERE FOR EVERY CAPTAIN — Wyatt, 2026-09-13: "make sure your change is
     architectural -- not changing the bot line AND the human line". A bot's turn opened with "takes the wheel…" and a
     human's with "Ahoy, yer turn!", from two different functions. Now the `turn` event is narrated once, at the door
     both pass through, from one entry in words.js. */
  await narrateLastEvent();
  return (player.strategy==="human"?humanTurn:botTurn)(player);
}
export async function humanTurn(player){
  /* THE DEVICE CHANGES HANDS BEFORE THE SCREEN CHANGES CAPTAIN — Wyatt, 2026-08-31: "Move it, I
     trust the plan." The plan puts pass-and-play's hand-over in the Decider: it is a precondition
     on OBTAINING a decision from a seat, not a look and not part of the turn.

     WHAT STOOD HERE: applyActiveSeat(player.idx) — then the gate — then applyActiveSeat(player.idx) again,
     with a note reading "exactly as setActor was called before it", i.e. a shape preserved through
     a refactor rather than a behaviour anybody chose. It came in with the cutover (fb74eedc).

     WHAT IT COST A PLAYER: the board switched to the incoming captain — ring, captains-box
     highlight, pass-and-play row order — and THEN the hand-over card appeared. For that instant the
     OUTGOING captain, still holding the device, was looking at the next captain's board.

     AND TWO OF THE THREE PASS-AND-PLAY PATHS ALREADY DID IT THIS WAY: the secret draft and a bake
     turn both gate first. One of three disagreeing is rule 8's drift exactly, and nobody had
     noticed. Gate: scripts/qa/handover_before_turn_check.mjs.

     NOTHING CHANGES OUTSIDE PASS-AND-PLAY — passGate returns immediately in every other mode. */
  // (passGate and the `turn` event now happen in takeTurn — the one door)
  // a prior player's shot-clock expiry can leave this set from their forfeited turn — this
  // flag only ever got cleared by the clock's arming deep inside a decision, too late to
  // save this turn's own early "did the previous turn just die?" guards below, so clear it
  // fresh the moment a new human turn actually begins
  appState.turnExpired=false;
  // pass & play: any reveal from a prior turn is already gone. (The "check my recipe" button is offered to the
  // captain whose turn it is — render() reads that from the one helper, whoseTurn — so no flag is set here any more;
  // appState.activeTurnSeat, which humanTurn alone wrote, was deleted by architecture item 3.)
  appState.recipeRevealed=false;
  liveRender();   // draws the `turn` event takeTurn just emitted, now that the reveal is locked
  /* (The human-only "Ahoy, yer turn!" banner stood here. The start of every captain's turn now says ONE line, from
     takeTurn — the one door — through the one narrator: "turn.start" in src/shared/words.js, silent by his word.) */
  // the clock only starts once the player actually reaches a decision (wind response, sail
  // pick, action choice, ...) — not from the raw top of the turn, since the wind step itself
  // eats no time. (Each ask()/pickCell() call re-armed it fresh while the clock lived.)
  if(appState.turnExpired){appState.recipeRevealed=false;return;}
  // normal turns no longer get force-moved by the wind (see #7) — only a storm still shoves
  // ships around; otherwise the wind only shapes this player's own sail budget below
  // v2.1: a storm can no longer cost anyone a turn — land simply stops the push. The forfeit
  // branch that used to sit here is gone with the rule.
  if(!appState.game.adjPort(player))player.dockedNow.clear();
  const preSailPos=[...player.pos],preSailCoins=player.coins; // lets humanAct offer "move instead" if this seat just stayed put
  // v2 rule 2: sailing is FREE. No coin gate, no debit, no "yer too broke to sail" nudge — and
  // rule 1 deletes the lee, so there is no upwind-island warning to give either.
  {
    const dest=await pickCell(player,reachable(player));
    // playtest 18 (Wyatt's pick): a checked recipe STAYS OPEN for the whole turn — the mid-turn
    // re-locks (here after the sail, and after the action below) are gone. The reveal ends at the
    // turn's own boundaries instead: humanTurn's entry, the expiry path, and passGate itself.
    if(appState.turnExpired)return;
    // the sail, its square checked and its route recorded, is Game.sailTo's — the same call as Move instead above and every bot's sail
    if(dest&&appState.game.sailTo(player,dest)){
      player.justDocked=false;
      /* ⭐ THE TURN LOOP WAITS ON THE DRAIN, AND TOUCHES THE DISPLAY NOWHERE.
         Wyatt, 2026-09-08, reading my write-up of the sound-timing fix: "All players, bot or human,
         are supposed to feed actions to an engine, which feeds events back, which a different piece
         of code displays. Is that not what you built here?"
         It is — playForEvent's only caller in the tree is consumeEvent, and consumeEvent's only two
         producers are this drain and the guest's wire. But this line used to reach PAST the drain
         and await the presentation itself (`liveRender(); await animateSailRoute(evSail)`), because
         liveRender() was fire-and-forget and a turn loop that must stay behind a moving boat had
         nothing else to wait on. That is orchestration holding a reference to the display for its
         own pacing, and it is exactly what let the two get out of order: for a year the ride was
         awaited BEFORE the drain, so the boat glided while its event sat unread and the sound
         landed on arrival.
         liveRender() returns a promise now (src/ui/panel.js), so the wait is on the DRAIN and the
         consumer owns every pixel and every sound. Two lines became one, and the turn loop no
         longer imports a walker at all.
         WHAT HAS NOT CHANGED: publishNow() still tells the table BEFORE this tier draws anything
         (W9 — it calls only the broadcast half, never the local drain), so no other browser is held
         still for the length of this captain's own animation. */
      publishNow();await liveRender();
      await afterSail(player);
    }
  }
  if(appState.turnExpired)return;
  if(!appState.game.adjPort(player))player.dockedNow.clear();
  await humanAct(player,{preSailPos,preSailCoins});
  appState.recipeRevealed=false; // the TURN is over — the reveal ends with it (playtest 18: no mid-turn re-locks)
  // refresh now, not at the next turn's render — otherwise this seat's "check my recipe"
  // button sits frozen (blurred but visible) behind the next pass-the-device screen
  if(appState.passAndPlay)liveRender();
}
/* ⭐ WHO ANSWERS A HAIL, AND HOW — ONE LOOP FOR EVERY CAPTAIN WHO HAILS (architecture item 15, 2026-09-17).
   The engine says who a hail is put to (Game.hailAudience); a bot holder answers by reasoning
   (respondToOffer), a human holder is asked (humanAnswersHail). Both a human's hail (humanTrade) and a
   bot's (botOpenTradeLive) come through here, so a bot hailing the table reaches exactly the captains
   its own offer was composed for — it used to ask EVERY holder, including ones it had decided were not
   worth asking (TRADE-SYSTEM invariant I1: every prompt is something a player has to swat away).
   Returns the answers in seat order, or null when the clock ran out on a captain answering. */
async function hearHail(asker,offer){
  const g=appState.game;
  const responses=[];
  for(const q of g.hailAudience(asker,offer)){
    const r=q.strategy==="human"?await humanAnswersHail(q,asker,offer):g.respondToOffer(q,offer,asker);
    if(r==null)return null;
    responses.push(r);
  }
  return responses;
}
/* THE PROMPT A CAPTAIN SEES WHEN A HAIL IS PUT TO THEM — one, whoever hailed. It stood here twice,
   verbatim, once for a human's hail and once for a bot's (architecture item 15).
   Returns {q, kind, …} — the same response shape Game.respondToOffer gives — or null if the clock ran out. */
async function humanAnswersHail(q,asker,offer){
  const offerDisplay=appState.game.offerLabel(offer,0)||"nothing";
  // @copy prompt.trade.accept
  // playtest 20 (Mando: "Bug in 'name your price' - the game simply acted as if I had rejected
  // the trade and moved on"). TWO separate ways that happened, both fixed here:
  //
  //   1. A counter is "+k coins on top of the offer", so it needs the offerer to have coins
  //      LEFT OVER. When they did not, tapping "Name yer price" was recorded as a DENIAL, with
  //      no prompt and no word to the captain who tapped it — from their seat the game simply
  //      moved on. The option is now greyed with the reason said out loud (Wyatt's pick), the
  //      same way the game already greys crates nobody is carrying, so it can never be a silent
  //      no again.
  //   2. "← Back" out of the coin stepper was ALSO recorded as a denial. Everywhere else in
  //      this flow Back steps BACK (see humanTrade's `step=0`/`step=1` above) — one gesture,
  //      two meanings, which is the consistency rule this project keeps. Back now returns to
  //      this prompt, and only "✗ Deny" denies.
  //
  // Whether a coins-only counter exists at all — none when every coin aboard is already offered. The engine's answer
  // (Game.counterRoom, architecture item 20), read by the Counter button, the line under it, and the Coin button inside the counter.
  const coinRoom=appState.game.counterRoom(asker,offer,null);
  for(;;){
    if(appState.turnExpired)return null;
    const v=await ask(q.idx,say("trade.offered",{q:pn(q.idx),p:seat(asker.idx),offer:offerDisplay,want:ilabelImg(offer.want)},q.idx),[
      {label:say("button.accept",{icon:iconImg(CHECKMARK_IMG)}),value:"accept"},
      // playtest 21 item 7: a counter is no longer "+coins" — it can ask for one of THEIR
      // crates instead. So it is live whenever they hold anything at all to give, not only
      // when they have coin spare, and the label says what it now does.
      {label:say("trade.counter",{}),short:say("trade.counterShort",{}),value:"counter",
        disabled:!coinRoom&&![...new Set(asker.ing)].some(i=>i!==offer.giveIng),
        why:sayText("trade.nothingElse",{p:seat(asker.idx)},q.idx)},
      {label:say("button.deny",{icon:iconImg(CANCEL_X_IMG)}),value:"deny"}],null,
      // @copy adhoc.trade.nocointosweeten — APPROVED as written, Wyatt 2026-08-14
      !coinRoom?say("trade.noSweetener",{p:seat(asker.idx)},q.idx):null);
    // CR-02 layer 1, the important one: expireShotClock forces default index 0 — which here
    // is Accept. Without this guard a captain who merely ran out of time is recorded as
    // agreeing. Re-checked at the top of the loop too, so a Back cannot outlive the clock.
    if(appState.turnExpired)return null;
    if(v==="counter"){
      const c=await counterOffer(q,asker,offer);
      if(c==null)return null;                    // shot clock expired mid-counter
      if(c==="__back__")continue;                // BACK MEANS BACK — re-ask, never a denial
      if(c==="deny")return {q,kind:"deny",why:"chose"};
      return {q,kind:"counter",askIng:c.askIng,askFor:c.askCoins};
    }
    return {q,kind:v==="accept"?"accept":"deny",why:"chose"};
  }
}
/* v2 rule 4, the bot's side of the open trade. A bot puts the same announcement to the same table
   a human does — the difference is only who answers the prompts. Bot holders reason in the engine
   (respondToOffer); human holders are asked, so a human is never traded around behind their back.

   This REPLACES v1's whole "bot hails a human" apparatus (D-02/D-24: rankHailTargets,
   priceHailOffer, hailWorthIt and the cooldown). That existed because v1 had no way for a bot to
   reach a player it wasn't standing next to, and it only ever fired as a last resort when an
   island had run dry. Rule 4 gives every captain that reach every turn, so the special case is
   gone rather than left running alongside the general one.

   ITS SETTLEMENT IS THE ENGINE'S NOW (architecture item 15). This function used to carry a THIRD
   copy of which answer a bot takes and at what price — the one that once settled the raw offer
   instead of a human's counter, and later priced a spare crate with a typed 1.1 — and its failed
   hail recorded a reasonless `parley` the narration table had no words for, so the table heard
   nothing. Wyatt, build .5: "when a captain denied my trade counter offer (in solo play, on his bot
   turn), that trade fail resolution message did not appear." Game.resolveHail now chooses, settles
   and says why, for this runner and the simulator alike. */
export async function botOpenTradeLive(player){
  const g=appState.game;
  const offer=g.botOpenOffer(player);
  if(!offer)return {spoken:false,struck:false};
  g.noteDemand(player,offer.want,1);
  g.ev({t:"openoffer",p:player.idx,want:offer.want,offer:g.offerLabel(offer,0)||"nothing"});
  liveRender();
  await botBeat();
  const responses=await hearHail(player,offer);
  if(responses==null)return {spoken:true,struck:false};               // the clock ran out on a captain answering
  const hail=g.resolveHail(player,offer,responses);
  liveRender();
  await botBeat();
  /* {spoken, struck}, like every hail runner; what it costs the turn is Game.hailEndsTurn's (architecture item 14). This
     used to return whether anybody ANSWERED, so a hail nobody answered left the bot free to dock or muse after it. */
  return {spoken:true,struck:hail.struck};
}
/* A BOT'S DOCK COIN IS NOT DRAWN HERE ANY MORE. It was, until 2026-09-13 — in this turn loop, which
   only the host runs and only for bots, so no human's dock ever drew one and a guest never drew its
   own. It is drawn by the one event consumer (consumeEvent, src/orchestrator.js) for every dock whose
   choice was not made on the watching screen. The flip's clock (FLIP_SPIN_MS + FLIP_LAND_HOLD_MS) is
   unchanged, and the narration still waits for it — through eventDrawn(), on every device. */

export async function botTurn(player){
  // (the `turn` event and its one opening line now happen in takeTurn — the one door. A bot's
  // turn used to open with its own botBeat() here, which narrated that event a second time.)
  const g=appState.game;
  // v2.1: no turn is ever lost to weather, so a bot has no forfeit branch either.
  if(!g.adjPort(player))player.dockedNow.clear();
  // PRINCIPLE 1: the WHOLE turn is decided here, before a square is crossed — the square to finish
  // on AND what to do from it, scored as one plan against turns-to-victory. This path only ANIMATES
  // the engine's decision, so a bot on screen can never do something the headless simulation would
  // not have done. See docs/BOT-DESIGN-PRINCIPLES.md.
  const plan=g.planTurn(player);
  const target=plan.cell;
  if(man(player.pos,target)>0){
    // v2 rule 2: sailing is free. No coin to spend, none to refund.
    /* A BOT SAILS THE WAY EVERY SHIP SAILS (architecture item 7): sailPlan picks the square and Game.sailTo checks it, writes it and
       records the move with the route the sail search takes, the trade winds allowed — the same call as a person's sail. This loop
       used to ask for the route itself, after sailPlan had written the square, WITHOUT the rim ({throughRim:false,from:b}), so a bot
       sailing into the trade winds was recorded with no route and its boat glided the straight chord to the current, over the islands. */
    if(g.sailPlan(player,plan)){player.justDocked=false;
      /* ⭐ THE TURN LOOP WAITS ON THE DRAIN, AND TOUCHES THE DISPLAY NOWHERE.
         Wyatt, 2026-09-08, reading my write-up of the sound-timing fix: "All players, bot or human,
         are supposed to feed actions to an engine, which feeds events back, which a different piece
         of code displays. Is that not what you built here?"
         It is — playForEvent's only caller in the tree is consumeEvent, and consumeEvent's only two
         producers are this drain and the guest's wire. But this line used to reach PAST the drain
         and await the presentation itself (`liveRender(); await animateSailRoute(evSail)`), because
         liveRender() was fire-and-forget and a turn loop that must stay behind a moving boat had
         nothing else to wait on. That is orchestration holding a reference to the display for its
         own pacing, and it is exactly what let the two get out of order: for a year the ride was
         awaited BEFORE the drain, so the boat glided while its event sat unread and the sound
         landed on arrival.
         liveRender() returns a promise now (src/ui/panel.js), so the wait is on the DRAIN and the
         consumer owns every pixel and every sound. Two lines became one, and the turn loop no
         longer imports a walker at all.
         WHAT HAS NOT CHANGED: publishNow() still tells the table BEFORE this tier draws anything
         (W9 — it calls only the broadcast half, never the local drain), so no other browser is held
         still for the length of this captain's own animation. */
      publishNow();await liveRender();
      await botBeat();
      await afterSail(player);}
    // G18: a boxed-in bot escapes through the rim, exactly as the engine's own takeTurn does.
    // rimEscape() records its own events (windmove, then tradewind's sweep line).
    /* rimEscape returns whether the ship escaped, not the event, so the sweep it just pushed is
       read off the top of the pile. That is safe HERE and is not the fault W7/W9 fixed: the fault
       is a CONSUMER guessing which event it is drawing, and this is the EMITTER, one synchronous
       statement after its own emit with nothing awaited in between. If the escape found no head to
       sweep to, the top of the pile is the windmove and the call is a no-op by its own guard. */
    // the drain draws it and this loop waits on the drain — same shape as every other ride here
    else if(g.boxedIn(player)&&g.rimEscape(player)){publishNow();await liveRender();await botBeat();}
  }
  if(!g.adjPort(player))player.dockedNow.clear();
  liveRender();
  // The plan was costed from plan.cell; a storm or a blocked route can leave the ship short of it,
  // so anything needing adjacency is re-checked against where the ship ACTUALLY is. Not a second
  // decision — the same plan, refusing to pretend it arrived.
  if(plan.type==="attack"&&g.attackTargets(player).includes(plan.target)){
    await netHandlers().onAsyncBattle(player,plan.target);
    /* the bot's ordinary beat, the one it takes after every move — and it adds no words here: the fight has already said how it ended
       (architecture item 9), and the event on top of the pile is now the fight's own `disengage`, which has none */
    await botBeat();return;
  }
  // A hail put to the table IS this turn's action, struck or refused; a trade never spoken costs nothing and falls through to
  // the berth or the muse below. The same one rule the simulator's turn and humanAct ask (Game.hailEndsTurn, architecture item 14).
  if(plan.type==="trade"&&g.hailEndsTurn(await botOpenTradeLive(player)))return;
  if(plan.type==="dock"&&g.adjPort(player)===plan.ing){
    const n0=g.events.length;
    if(g.doDock(player,plan.ing)){
      await botBeat();
      return;
    }
  }
  // THE FALLBACK, and it has to be repeated HERE rather than inherited: botTurn does not call
  // Game.takeTurn — it reimplements the turn so each step can animate (see the note in
  // scripts/bakeoff_parity_test.js). A fallback added only to the engine would fix the simulator  [UNGATED-IN-4: bakeoff_parity_test.js reads the root tree, not this one]
  // and leave every real browser game exactly as broken, which is the opposite of the point.
  // Same rule as the engine's: work the berth under your feet, nothing cleverer.
  const fallbackPort=g.adjPort(player);
  if(fallbackPort&&g.canDock(player,fallbackPort)){
    const n0=g.events.length;
    if(g.doDock(player,fallbackPort)){
      await botBeat();
      return;
    }
  }
  // ITEM 4 / D-15: a bake-eligible captain never reaches the pass line below. canOvens (:1857,
  // this same file) already suppresses the human's Pass button the instant g.canBake(player) is true
  // and shows "Fire up the ovens!" instead — the SAME g.canBake(player), not a second hand-written
  // test, is what makes "same rule for bots and humans" a property of the code rather than two
  // sites that happen to agree today (rule 13). Ending the turn here, silently, is enough:
  // runLiveDayBakeoff's own g.lightOvens(player) call fires the moment this function returns
  // (4/src/orchestrator.js:934), exactly as it does for a human whose turn ended on the ovens
  // button — the bot bakes, it does not pass.
  if(g.cfg.bakeoff&&g.canBake(player))return;
  // v2 rule 3: no fishing. A bot with nothing worth doing looks into the ocean, exactly as a
  // human does — same action, same narration, same dubloon (RULE-01), so the table reads
  // consistently. The shared engine method is what makes "same" a property of the code rather
  // than a claim about two sites that happen to agree today.
  g.doPass(player);
  await botBeat();
}

/* ================= battle-UI + side-bets + intro + game-start ================= */
// battleAsk/renderBattle/watchBattle/asyncBattle stay classic (11-analysis.json: orchestration —
// each calls a net-adjacent function directly), homed in 11-06 alongside the rest of the
// orchestration layer. This cluster's functions call them as bare identifiers (resolved via the
// still-present PP bridge), same as every other still-classic cross-reference this phase.

// flash moved verbatim to src/ui/panel.js (11-04) — its netNarrate() call is now routed through
// src/ui/handlers.js's injected onBroadcast handler (D-07/criterion 1 seam; see src/main.js).
// blocks until every human seat (not just the host) has read msg and clicked through — same
// per-seat localAsk/remoteDraftPrompt barrier recipeDraftNet() uses, so remote players get a
// real button instead of read-only narration text they can't dismiss
/* ═════════ THE ONE DRAFT DISPATCHER (W1, 2026-08-28) — forks 4 and 5 converge here ═════════
   One dispatcher, and the PUBLIC/PRIVATE distinction is an INPUT, because the two forks' pass-
   and-play branches meant OPPOSITE things and both were Wyatt's decisions:
     · PRIVATE (fork 4, the recipe draft): every seat in turn behind the pass-the-device gate,
       serially — "nobody's two recipe choices are ever on screen for the seat that comes next".
       Collapsing this is an INFORMATION LEAK, and (with no shot clock left to force it) three
       concurrent localAsk calls into ONE #actionPanel would strand two promises and hang the
       voyage at Promise.all forever — the fork-4/5 map's exact warning.
     · PUBLIC (fork 5, the intro barriers): ONE showing for the whole table. Wyatt, 2026-08-08:
       "Dont require passing to the next player for the opening narration… Just show those once."
       A pass-the-device gate exists to keep private information off the next player's screen;
       a public card has none.
   Networked (and solo): every seat concurrently — a local seat through localAsk, a remote seat
   through the draft-prompt channel (the netHandlers seam: this file is ui-tier and may not
   import the orchestrator). `waitMsg` (item 19: a wait line has no deadline) shows on a LOCAL
   seat's answer only in the concurrent mode — on a shared device there is no one to wait for.
   `announce` (the "everyone's choosing…" broadcast) fires only in the concurrent mode for the
   same reason. Returns {seatIdx: choice}; the CALLER logs decisions in seat-index order, so the
   reload-replay stream is identical whichever mode ran (both modes resolve in seat order here —
   serial by construction, concurrent by the post-join loop the caller already had).
   DELIBERATE DROP, flagged on the checklist: fork 4's concurrent branch used to call raw
   setActor once per seat inside its map — net effect, the actor glow pointed at the LAST pending
   seat while every prompt was open (the map called it a wart: neither converged applyActiveSeat
   nor meaningful). The dispatcher does not reproduce it; the serial branch DOES set the actor,
   because there the device genuinely follows one seat at a time.
   Gate: scripts/qa/draft_dispatch_convergence_check.mjs. */
/* `subFor` is OPTIONAL and per-seat, and it is how the Pilot reaches the two draft moments
   without a second dispatcher. It lands in localAsk's helper slot (.apSub) — last in the DOM, per
   the standing top-to-bottom reveal order — and it is deliberately NOT passed to
   onRemoteDraftPrompt: a rung is per device, so a remote seat's own device supplies its own. The
   host composing one for a guest is the exact thing the Pilot exists to avoid. */
/* `localOptsFor` is OPTIONAL and follows subFor's rule for the same reason: it is answered by the
   device in front of the player, and it is deliberately NOT passed to onRemoteDraftPrompt. The
   Pilot's fork ("do ye know how to play?") is per device — a first-time guest must be able to ask
   for help the veteran host does not need — so the host must never compose a guest's buttons.
   A remote seat keeps `optsFor`, which is the ordinary card everybody shares. */
export async function draftDispatch({seats,isPublic,msgFor,optsFor,waitMsg,announce,subFor,localOptsFor,localMsgFor}){
  const sub=seat=>subFor?(subFor(seat)||null):null;
  const localOpts=seat=>(localOptsFor?(localOptsFor(seat)||null):null)||optsFor(seat);
  // `localMsgFor` follows localOptsFor's rule: what THIS device's seats read, never sent to a remote one
  const localMsg=seat=>(localMsgFor?(localMsgFor(seat)||null):null)||msgFor(seat);
  const results={};
  /* ⭐ A LOCAL PROMPT IS ADDRESSED TO A SEAT, AND THIS DISPATCHER IS THE ONLY THING THAT KNOWS WHICH
     — Wyatt, 2026-09-09, crew, two windows: "guest's recipe choice narration box says '{host name},
     pick yer recipe' in the host's color... fix this ARCHITECTURALLY not with a bad patch. it seems
     like you may have written sloppy code; if this was scoped right, the guest's name would appear."
     He is right, and the sloppy code was mine but it was not in the picker. THE PICKER RE-DERIVED
     the seat (`S.activeSeat ?? appState.curSeat`) because nothing told it — and on a guest neither
     of those is the guest: `curSeat` is whoever's turn the ENGINE is on, and `S.activeSeat` still
     held the last captain the camera pointed at, which is the host.
     ⚠ THE ASYMMETRY IS THE BUG, AND IT WAS ALREADY VISIBLE HERE. The pass-play branch below called
     applyActiveSeat(seat) before asking; the simultaneous branch never did. Two branches of one
     dispatcher disagreeing about whether "who is being asked" gets published is exactly the
     one-display-path rule broken inside the function that exists to enforce it. Every local ask now
     says who it is for, on every path, so no caller downstream has to guess — and the picker's own
     derivation is deleted rather than corrected.
     WHY IT IS SAFE ON A GUEST: raiseLocalPrompt only ever names a seat the game already has, and
     during a simultaneous draft each device SHOULD be pointing at its own captain — which is what the
     top bar shows during the draft (whoseTurn: the recipe draft is its own phase, architecture item 3). */
  const askLocal = (seat) => raiseLocalPrompt(seat, () => localAsk(localMsg(seat),localOpts(seat),null,sub(seat)));
  if(appState.passAndPlay){
    if(isPublic){
      // ONE DEVICE, ONE SHOWING — the table reads it together, off one screen.
      results[seats[0]]=await askLocal(seats[0]);
      return results;
    }
    // one device, secret options: draft in turn, each behind the pass-the-device screen
    for(const seat of seats){
      await passGate(seat);
      /* THE DEVICE CHANGES HANDS, THEN THE SCREEN ASKS THE INCOMING CAPTAIN — in that order, in the source.
         An explicit applyActiveSeat(seat) stood between these two lines so handover_before_turn_check could
         read the order; it wrote the slot the top bar drew, and architecture item 3 deleted that slot. The
         screen turns to this captain through askLocal's raiseLocalPrompt now, and the gate reads THAT. */
      results[seat]=await askLocal(seat);
    }
    return results;
  }
  if(announce)netHandlers().onBroadcast(announce.html,announce.variants,{wait:true});
  await Promise.all(seats.map(seat=>{
    if(decisionIsLocal(seat))return askLocal(seat).then(i=>{
      results[seat]=i;
      if(waitMsg)showNarration(waitMsg,{wait:true}); // item 19: no deadline on a wait line
    });
    return netHandlers().onRemoteDraftPrompt(seat,msgFor(seat),optsFor(seat),waitMsg).then(i=>{results[seat]=i;});
  }));
  return results;
}
/* 17a AND 17c — THE SAME TEXT ARRIVING TWICE ON A GUEST, AND THIS LINE WAS THE SECOND COPY.
   It used to read `netHandlers().onNetBroadcast(msg);` — a third, redundant delivery of a message
   the barrier below already hands to EVERY human seat: localAsk for a local one, onRemoteDraftPrompt
   for a remote one. netBroadcast does not touch the sending screen's panel, so the host never saw
   it and nothing looked wrong there; on a guest it landed on the `narr` node, watchNarr drew a
   floating bubble from it, and the draftPrompt card drew the identical words on top a beat later.
   That is his 17a (a dark top strip AND the centre card) and his 17c (a bubble behind, plus the
   card), and it is the general fault in miniature: one moment sent down two channels with nothing
   coordinating them.
   CHECKED BEFORE DELETING (the plan asked for this explicitly): the room's `narr` node has exactly
   one consumer in the tree — watchNarr in src/orchestrator.js — and two writers, netNarrate and
   netBroadcast. Nothing besides the narration bubble depends on it, so removing this write drops a
   duplicate render and nothing else.
   NOBODY IS LEFT OUT BY THE DELETION: every browser at the table owns a human seat (a bot seat has
   no browser), and the barrier walks every human seat. There is no spectator this broadcast was
   the only delivery for. */
/* `localOpts` — the buttons THIS device sees instead of the single dismiss circle, and the reason
   the return value now matters. Used by exactly one caller: showAhoyIntro, so that the Pilot's
   fork can live at the bottom of the Ahoy card rather than in a second box in front of it
   (Wyatt, 2026-09-07 playtest item 2). Everyone else passes nothing and gets the card unchanged. */
export async function netIntroBarrier(msg,btnLabel,localOpts,{localMsg=null,forkable=false}={}){
  if(appState.replaying)return;
  // /4 playtest 12: the two intro barriers (ahoy + turn order) play CENTER STAGE — board dimmed,
  // message and button centred — instead of a bubble at the top and a lone circle mid-sea
  /* `pp4Fork` is a MARKER, not a style: it tells a remote device "this is the card yer own Pilot may
     ask its fork on" (see pilotOpeningFork). It rides the classes the draft channel already
     carries, so nothing new crosses the wire. */
  const opts=[{label:btnLabel,value:0,cls:"primary ahoyGlow"+(forkable?" pp4Fork":""),stage:true}];
  const humans=appState.game.players.filter(player=>player.strategy==="human");
  // whoever clicks through first (or isn't last) sits on this instead of a blank panel while the
  // rest of the crew finishes reading — same idea as recipeDraftNet's "waiting for the crew" beat.
  // (On a shared device the dispatcher never shows it: nobody is waiting for anybody.)
  // @copy misc.draftwait.introwait
  const waitMsg=humans.length>1?say("wait.mateys",{}):null;
  // FORK 5 IS THE PUBLIC CASE — one showing for a shared device (Wyatt 2026-08-08), every human
  // concurrently when each has their own screen. The whole pass-and-play/networked branch pair that
  // stood here lives in draftDispatch now, where fork 4 shares it.
  /* WHICH SEAT ANSWERED ON THIS DEVICE — learned from the dispatcher rather than re-derived.
     `localOptsFor` is called by draftDispatch for local seats ONLY (that is its whole purpose), so
     noting the seat as it goes past is the dispatcher's own answer about locality, not a second
     opinion formed here.
     ⚠ THE FIRST DRAFT ASKED decisionIsLocal() DIRECTLY AND THE MODE-FORK GATE CAUGHT IT — flow.js
     14/13, "1 NEW fork(s). Every one of these is a place two captains can see different games."
     It was right to: a file whose job is to draw had grown a fresh conditional on who is playing,
     and the honest fix is not a bigger baseline but not needing to ask. */
  let mine=null;
  const results=await draftDispatch({seats:humans.map(player=>player.idx),isPublic:true,msgFor:seatReading=>typeof msg==="function"?msg(seatReading):msg,optsFor:()=>opts,waitMsg,
    localMsgFor:localMsg?(()=>localMsg):null,
    localOptsFor:localOpts?(seat=>{ if(mine==null)mine=seat; return localOpts; }):null});
  return mine==null?undefined:results[mine];
}
// the opening backstory/context message — stays up until every human player actually reads it
// and clicks through, rather than auto-advancing on a timer like every other narration
export async function showAhoyIntro(){
  // D-25/D-26 (Wyatt-approved 2026-07-29, applied 2026-07-29 during the two-tab playtest): his
  // `misc:introBarrier` rewrite is this ONE sentence. The two that used to follow — "⛵️ Each turn,
  // ye sail, then ye plunder." and the EYES_IMG "Watch this panel — she'll steer ye straight!" —
  // are deleted at his explicit word ("I want to delete the other two sentences, because the intro
  // is too long"), which is what D-16 requires before an icon may go: removal stated in words, not
  // inferred from a note that simply omits it. The leading ⚓ is KEPT — the leading space in his
  // stored note is a stripped emoji (D-50), never an instruction to drop the icon.
  //
  // This row was `reviewed:true, tag:"rewrite"` in 15-DISPOSITIONS-FINAL.json and was NEVER
  // applied: 15-06's "apply Wyatt's approved narration copy" commit (11cbf34) changed only this
  // call's BUTTON label and left the message byte-identical to its Phase 11 original (6dbd87f).
  // A sixth instance of the approved-but-not-applied class after D-17/D-29/D-54 — and the first
  // found outside the five audited gaps, which is why the copy gate must check all 155 approval
  // fields rather than a hand-picked subset.
  //
  // G4 (Wyatt-approved 2026-07-30): the sentence now opens with "Choose a recipe" — the FIRST thing
  // the player is actually asked to do, which (with G5 moving the draft ahead of the turn-order
  // intro) is the very next screen. The old wording described gathering before he had a recipe to
  // gather for. The leading ⚓ is KEPT again here: D-16 requires removal stated in words, and he
  // named no icon. D-53 (a `--` becomes an em dash) is a no-op check on this string — it has none.
  const msg=say("intro.ahoy",{});
  /* ── THE FORK, and it is a STARTING RUNG rather than a yes/no ──────────────────────────────
     Shown only on a device that has never played — the absence of the Pilot's one storage key IS
     the "never played" test, so one key answers both questions it needs to.

     ASKED LOCALLY, ON PURPOSE, AND IT NEVER TOUCHES THE WIRE. The Pilot is per device, not per
     table: a first-time guest must be able to get help the veteran host does not need. That makes
     this a Decider in docs/INTENDED-BEHAVIOUR.md §3's sense, and it is safe for the one reason
     that file gives — IT EMITS NO EVENT. localAsk draws a panel and resolves a promise; nothing
     reaches netSetNarr, nothing reaches the event stream, no RNG is drawn.
     The barrier that follows is the sync point, so a table whose captains answer at different
     speeds still converges before anybody sails.

     This card already draws any number of circles, so making it two costs one argument.
     Wyatt's own framing, which matters for later: if testing says some captains want a middle
     setting, that is a THIRD CIRCLE AND A NUMBER — not a new system. */
  /* ── DECAY IS EVALUATED HERE, ONCE, AND NOWHERE ELSE ────────────────────────────────────────
     Every voyage passes through this card, before a single rung has been read, which is the one
     property the schedule needs: under 7 days nothing changes · 7-30 back one rung · 30-90 back
     two · over 90 back to the top.
     EVALUATED BETWEEN VOYAGES, NEVER DURING ONE, and that is what makes it predictable — it
     answers the objection the spec raised against decay in its own first draft. Words can never
     grow back mid-game, and two voyages in one evening behave identically.
     Skipped on a replay: a host refresh re-runs this path, and decaying again would hand a captain
     back rungs they had already spent purely because their browser reloaded. */
  /* THE URL FLAG IS READ BEFORE ANYTHING ELSE TOUCHES THE COUNTS — ?pilot=new has to be able to
     un-answer the fork, and one line below is where the fork asks. */
  if(!appState.replaying){
    const flag=pilotApplyUrlFlag();
    /* ⚠ "new" MEANS A NEW VOYAGE, and without this the flag silently did nothing on any device
       that had played. boot() RESUMES an interrupted solo game before the opening ever runs, so
       the captain was dropped straight back into a voyage in progress — past the fork, past every
       rung — with no error and no hint. Measured rather than reasoned: five of six modes came back
       reading "Wyatt, choose yer recipe" off a resumed game.
       CLEARED THROUGH THE FUNCTIONS THAT OWN THOSE BLOBS, never by removing keys by hand — the
       first attempt hardcoded `pp_solo`/`pp_sess`, which is what docs/DRIVING-THE-GAME.md §2 still
       calls them, and the real keys have been `pp4_solo`/`pp4_sess` for some time. A second copy of
       a name is a second thing to keep in step, and this one was already out of step. */
    if(flag==="new"){clearSoloState();clearSession();}
  }
  /* decay and the fork are ONE step now — pilotOpeningFork(), below — so a crew guest's own device
     runs exactly the same opening when its Ahoy card arrives (see watchDraftPrompt) */
  /* NOT ON A REPLAY. netIntroBarrier below self-skips when appState.replaying is set, because a
     host refresh re-runs this whole path — and a localAsk here would put a card on screen and wait
     for a tap that is never coming, hanging the rebuild. The fork inherits the same guard rather
     than relying on nobody noticing. */
  /* ⭐ ONE CARD, NOT TWO — Wyatt, 2026-09-07 playtest item 2: "This should not be its own box —
     this should be written at the bottom of the box that says 'Ahoy! Choose a recipe, gather each
     ingredient, then sail home first to win!' ... the buttons should say '⚓️ Yarrgh!' or '🦜 Nah'".

     A first-time captain used to meet TWO stage cards back to back before the game began, saying
     two different things, each needing its own tap. The question now rides the bottom of the Ahoy
     card and its two circles ARE that card's dismiss — so a first voyage opens with one card and
     one tap, and a veteran's opens exactly as it did before.

     THE ANSWER STAYS ON THIS DEVICE. The buttons go down `localOpts`, which draftDispatch
     deliberately withholds from onRemoteDraftPrompt for the same reason it withholds `subFor`:
     the Pilot is per device (docs/INTENDED-BEHAVIOUR.md, "🦜 THE TUTORIAL IS PER DEVICE"), so a
     remote seat's card keeps the ordinary single circle and that seat's own browser answers for
     itself. Nothing about this reaches the wire, draws an RNG, or emits an event.

     ASKED BEFORE, SET AFTER: pilotFirstTime() is read while the card is still being composed and
     the rung is written once the barrier releases, so the read can never see its own write. */
  const fork=pilotOpeningFork(msg);
  // NARR-01/D-25 (Wyatt-approved 2026-07-29): button trimmed to just "Arrgh!" — icon kept (D-16).
  // @copy misc.introbarrier.ahoy
  /* ⚠ THE SHARED MESSAGE IS THE PLAIN ONE, and the question is only ever this device's. The card's
     text used to be built here with "Do ye know how to play?" appended whenever THIS (the host's)
     captain was new, and draftDispatch sent that same text to every seat — so a crew guest was
     asked a question with ONE button under it ("⚓ Arrgh!"): a first-time guest could not ask for
     the lessons, and a veteran guest could not turn them off. Seen in the 2026-09-10 sea trial's
     crew-phone screenshots, host and guest side by side. `forkable` marks the card so the guest's
     own device can ask its own captain (orchestrator.js, watchDraftPrompt). */
  const knows=await netIntroBarrier(msg,say("intro.ahoyGo",{}),fork?fork.opts:null,{localMsg:fork?fork.msg:null,forkable:true});
  if(fork)fork.apply(knows);
}
/* ⭐ THE PILOT'S OPENING, ONE FUNCTION FOR EVERY DEVICE. Decay, then — only on a device that has
   never played — the fork: the Ahoy line with "Do ye know how to play?" under it and his two
   circles. Returns null when there is nothing to ask. `apply(answer)` sets the starting rung:
   "Nah" (1) is the captain who wants teaching — the TOP of every ladder; anything else, including a
   barrier that resolved with no answer, skips to veteran, because the safe failure is the game a
   veteran already knows, never a tutorial nobody asked for.
   Used by showAhoyIntro for this device's own seats, and by a crew guest's device when the host's
   Ahoy card arrives. Per device, as docs/INTENDED-BEHAVIOUR.md "🦜 THE TUTORIAL IS PER DEVICE"
   requires: it draws a card and writes this browser's own ladder, and emits NO event. */
export function pilotOpeningFork(baseMsg){
  if(appState.replaying)return null;
  pilotDecayOnLaunch();
  if(!pilotFirstTime())return null;
  // @copy misc.introbarrier.pilotfork — his words, 2026-09-07.
  return {
    msg:`${baseMsg}<br><br>${say("intro.knowHow",{})}`,
    opts:[
      {label:say("intro.yes",{}),value:0,cls:"primary ahoyGlow",stage:true},
      {label:say("intro.no",{}),value:1,cls:"primary ahoyGlow",stage:true},
    ],
    apply:answer=>{ if(answer===1)pilotStartFromTheTop(); else pilotSkipToVeteran(); },
  };
}
// right after the Ahoy intro closes: announce who won the flip for first mover, and cheer up
// everyone sailing later by pointing out the coin they get in exchange for waiting. Stays up
// until every human player dismisses it (like showAhoyIntro) since it's easy to blink and miss
// a flashed message.
// NARR-01/D-25 (Wyatt-approved 2026-07-29): applied verbatim.
export async function showTurnOrderIntro(order){
  /* HIS REWRITE, 2026-09-13: "{Crustbeard} goes first! The rest o' ye get {coin}." — no per-captain amounts, his pick
     ("As I wrote it"). The card is handed over as a function of WHICH SEAT IS READING it, so the lead captain's own
     card reads "ye go first" and everyone else's names them — derived by words.js, never written twice. */
  const msg=seatReading=>say("intro.order",{icon:iconImg(DICE_IMG),lead:seat(order[0])},seatReading);
  // @copy misc.introbarrier.turnorder
  await netIntroBarrier(msg,say("intro.orderGo",{}));
}
export function battleSnapshot(o){
  const snap={};
  /* `dw` — THE WIND THE FIGHT WAS CALLED IN, CARRIED WITH THE FIGHT'S WORDS (architecture item 25, 2026-09-18). Without it a watching
     screen worked the wind out from whatever its own board said at the moment it drew the line, which is a different day's board while
     its event queue is behind: measured, a guest said "CROSSWIND · ties collide" about a fight the host was calling "⬇ HOSTCAP FIRES
     DOWNWIND — WINS TIES". Firebase deletes a null field, so a crosswind arrives as no `dw` at all — renderBattle reads absent and null
     as the same answer, which is the only reason that is safe. */
  for(const k of ["round","a","d","atState","dfState","atBs","dfBs","live","winCoin","result","waiting","need","title","roleA","roleD","dw"])
    if(o[k]!==undefined)snap[k]=o[k];
  snap.attIdx=o.att.idx;snap.defIdx=o.def.idx;
  return snap;
}
export function renderBattleFromSnap(snap,extra){
  if(!appState.game||!appState.game.players[snap.attIdx]||!appState.game.players[snap.defIdx])return;
  // (the camera's hold stood here, re-armed by every snapshot a guest drew and never released — architecture item 4: it is the fight's
  //  `engage` event now, held and let go by the one event consumer on every screen)
  netHandlers().onRenderBattle(Object.assign({att:appState.game.players[snap.attIdx],def:appState.game.players[snap.defIdx]},snap,extra||{}));
}
// The Lookout's Call: every spectator MUST call a winner from the crow's nest —
// it's free, and a correct call earns a Spotter's Bounty (+1🌕) from the ship's
// bank. Players MAY back their call with their own coin for a bigger prize.
/* ================= v2 rule 5: calling the battle =================
   The betting is gone. A call is FREE, it costs nothing to be wrong, and being right pays a flat
   +2🌕 from the bank. That deletes the whole stake/raise/all-in ladder, the double-or-nothing
   payout, and the re-validate-the-stake-at-settlement guard that existed only because a wager
   could outlive the purse that promised it (COIN-AUDIT site 11 — the widest window in v1).

   Every non-combatant may call, from anywhere on the board, and bots call too. A NULL battle
   (rule 9: crosswind stand-off, attacker declines to pay) has no winner, so no call is correct
   and nobody is paid. */
/* `downwind` is the fight's own reading of the wind (Game.beginBattle), handed over by asyncBattleRun — architecture item 25. A bot
   caller used to ask appState.game.downwindSide for itself, which is the same fact decided a second time, in a file that must not
   decide game facts at all. */
export async function collectSideBets(att,def,downwind){
  const bets=[];
  const spectators=appState.game.players.filter(player=>player!==att&&player!==def&&!player.done);
  for(const s of spectators){
    if(s.strategy==="human"){
      // NAMED, because on one device the prompt arrives out of nowhere (Wyatt, 2026-08-08: "it is
      // wyyy's turn and they are attacking, but juju must call; so the narration should say 'Juju —
      // A battle's brewing!'"). The caller is a SPECTATOR of someone else's fight, so nothing about
      // whose turn it is tells you the screen is now asking you. The name is the only thing that does.
      // @copy prompt.sidebet.call
      const who=await ask(s.idx,say("call.ask",{name:pn(s.idx),n:appState.game.cfg.callBounty}),
        // `seat` puts each circle ON THE BOAT IT NAMES (Wyatt's pick, playtest 22) rather than
        // fanning both around the caller's own ship, which the director no longer has on screen.
        [{label:say("call.button",{name:pn(att.idx)}),value:"a",seat:att.idx},{label:say("call.button",{name:pn(def.idx)}),value:"d",seat:def.idx}],
        [HEXCOL[att.idx],HEXCOL[def.idx]]);
      bets.push({idx:s.idx,on:who});
      // D-08: a call names two seats — the caller AND the captain called — so both get an
      // addressed variant, not just the actor.
      const calledIdx=who==="a"?att.idx:def.idx;
      // @copy adhoc.sidebet.freecall
      await sayFlash("call.made",{p:seat(s.idx),called:seat(calledIdx)},900);
    }else{
      // Bots read the same board a player does: the wind decides a both-heads round, so the
      // downwind ship is the sharper call — then the fuller purse as a tiebreak.
      const fav=downwind||(att.coins>=def.coins?"a":"d");
      const on=appState.game.r()<.72?fav:(fav==="a"?"d":"a");
      bets.push({idx:s.idx,on});
    }
  }
  return bets;
}
export async function settleSideBets(bets,winSide){
  if(!bets.length)return;
  const parts=[];
  const bounty=appState.game.cfg.callBounty;
  for(const bet of bets){
    const player=appState.game.players[bet.idx];
    // winSide is null for a NULL battle — nobody won, so no call can be correct (rule 5d)
    const won=winSide!=null&&bet.on===winSide;
    const delta=won?bounty:0;
    player.coins+=delta;
    appState.game.ev({t:"sidebet",p:bet.idx,won,on:bet.on,delta});
    parts.push(say(won?"call.paid":"call.unpaid",{name:pn(bet.idx),n:delta}));
  }
  liveRender();
  // D-25/D-26 (Wyatt-approved 2026-07-29): "The Lookout settles". 🔭 kept per D-16.
  // @copy adhoc.sidebet.settle
  await flash(say("call.settle",{parts:parts.join(" · ")}),1600);
}
/* v2 rule 12: there is no bakeoff. asyncBakeoff() and its whole head-to-head flip ladder are
   deleted. When more than one captain gets home they COLLABORATE on a single bakery, and Best
   Baker is awarded on what each brought to it — most crates, then most coins, then whoever got
   home first (Game.bakeRank). The title is earned across the voyage now, not decided by one last
   coin toss at the end of it. */
// 11-07 (bridge deletion fix): relocated here verbatim from src/ui/lobby.js. wireWelcome calls
// startSinglePlayer()/startPassAndPlay() (below, same file — already local, no import needed);
// src/ui/lobby.js (its former home) cannot reach either without importing this file, which would
// close an import cycle (this file already imports `passGate`/`requireName` FROM lobby.js) —
// module_graph_check.js's "no import cycle" assertion forbids that. `showStep` stays in
// lobby.js and is imported alongside the two names already pulled from there.
export function wireWelcome(){
  // FIX-01/D-01/D-03: every mode card now opens the name modal first; each continuation is that
  // mode's remaining body, run by confirmName() once the player confirms (or dismisses — D-02
  // makes dismissal confirm too, wired in wireNameModal()). The two dead pre-modal name guards
  // that used to gate Solo/Host are gone — that read never returned falsy, so both were
  // unreachable branches even before this change.
  $("choiceSolo").onclick=()=>{openNameModal(()=>{startSinglePlayer();});};
  // UI-05: "Host a Crew" now creates the room outright instead of showing #stepHost, whose entire
  // content was one "Create the game" button — a screen that asked the player to confirm the thing
  // they had just clicked. #stepHost's markup is kept (with a note) so nothing else that references
  // it breaks; it is simply no longer reachable from here.
  //
  // createRoom() is main-tier (src/orchestrator.js), which src/ui/ may never import — hence the
  // handlers seam, the same route 13-01 added for onTogglePause. The disabled-card guard stays on
  // THIS side, before the modal opens, so a disabled card still short-circuits before any room
  // exists.
  // v2: the Host/Join cards are gone from the markup — this build is solo and pass-and-play only.
  // The wiring is guarded rather than deleted outright so that restoring the two cards (and the
  // Firebase script tags) is all it takes to bring multiplayer back.
  const hostCard=$("choiceHost"),joinCard=$("choiceJoin");
  if(hostCard)hostCard.onclick=()=>{if(hostCard.classList.contains("disabled"))return;openNameModal(()=>{netHandlers().onCreateRoom();});};
  // The box must not accept a name the database will refuse: seats/$seat/name is validated at
  // MAX_NAME_LEN server-side, and going over used to kill the join outright (Wyatt, 2026-08-19).
  // Set from the constant rather than typed into index.html's maxlength, so the box and the clamp
  // in joinRoom() cannot drift apart — the two-hand-synced-numbers trap 2e84477 was written about.
  // item 16 (D-19): clear the "that name's taken" line as the JOIN screen OPENS, not only on the
  // box's `input` event — writing .value from code fires no input event, so a refusal from a
  // previous attempt would otherwise still be sitting under a box that has just been re-prefilled.
  // Item 31 (Wyatt, 2026-08-23): "when you hit 'Join a crew' you should go straight to the Join a
  // Crew screen which has the 4-letter code button and the Yer captain name field. Remove the
  // 'What do they call ye, captain?' modal in between, it's now unnecessary." The join screen's own
  // name box IS the naming step — prefilled from the same durable pp_lastName the modal read, and
  // whatever they type there is what joinRoom claims. Solo/Host/Pass&Play keep the modal: none of
  // those flows has a second name box to land on (D-03's consistency pick stands for Pass & Play).
  if(joinCard)joinCard.onclick=()=>{if(joinCard.classList.contains("disabled"))return;
    $("joinName").maxLength=MAX_NAME_LEN;
    $("joinName").value=(getLastName()||"").trim().slice(0,MAX_NAME_LEN);
    setNameWarning("joinName","");showStep("stepJoin");};
  // D-03 decision (22-01-PLAN.md): #ppName0 stays visible on stepPassPlay, pre-filled and editable
  // — Pass & Play still has to name seats 1-3, so consistency (same modal, same position in the
  // flow) was chosen over saving a click.
  $("choicePassPlay").onclick=()=>{openNameModal(name=>{$("ppName0").value=name;showStep("stepPassPlay");});};
  $("btnNameConfirm").onclick=()=>{confirmName();};
  /* #17's UX tweak (Wyatt, 2026-08-24): "when the player hits enter after writing their name,
     that should trigger the continue button." Swept across EVERY name field (rule 8), one helper:
     the name modal, the join screen (code and name both), and the four pass-and-play names. The
     chat box keeps its own Enter — it sends a message, not a screen. */
  const enterClicks=(inputId,btnId)=>{const i=$(inputId);
    if(i)i.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const b=$(btnId);if(b)b.click();}});};
  enterClicks("nameModalInput","btnNameConfirm");
  enterClicks("joinCode","btnJoin");
  enterClicks("joinName","btnJoin");
  ["ppName0","ppName1","ppName2","ppName3"].forEach(id=>enterClicks(id,"btnStartPassPlay"));
  // D-02: wires the modal's other three dismissal routes (✕, Escape, backdrop click) to also
  // confirm rather than cancel. Idempotent — safe even though wireWelcome() only runs once.
  wireNameModal();
  $("btnStartPassPlay").onclick=()=>{
    const names=[0,1,2,3].map(i=>($("ppName"+i).value||"").trim().slice(0,40)).filter(n=>n);
    // pass & play always needs at least two humans sharing the device — nobody typing
    // anything shouldn't block starting, it just means the default captain names are used
    while(names.length<2)names.push(NAMES[names.length].replace("Capt. ",""));
    startPassAndPlay(names);
  };
  document.querySelectorAll("#lobby [data-back]").forEach(b=>{b.onclick=()=>showStep("stepChoose");});
}
export function startSinglePlayer(){
  const name=requireName();
  const opp=3; // 4-player table is the standard game; no longer prompting for opponent count
  const strategies=["human"];
  for(let i=1;i<=opp;i++)strategies.push(seatStrat(i)); // BOT-02: temperament follows the captain
  appState.numSeats=strategies.length;appState.room=null;appState.isHost=true;appState.mySeat=0;
  appState.roster=buildRoster([name],strategies);   // playtest 19: bots get a collision-free name
  const seed=Math.floor(Math.random()*1e9);
  // seaBase: where this device left off in the fifty sea creatures. Captured ONCE, here, and
  // carried in soloMeta so the solo save replays the same sightings it showed live.
  // v2.1: the ruleset this voyage is being played under is recorded WITH the save, so a resume can
  // never replay the log against the other one. See resumeSoloGame (util.js) for what that costs.
  const cfg=roundCfg(strategies);
  appState.soloMeta={name,strategies,seed,seaBase:getSeaBase(),bakeoff:!!cfg.bakeoff,ovens:ovensNowEnabled(),bake2:bake2Enabled(),endcard:endCardEnabled()};appState.dlog=[];saveSoloState();pingStart(1,"solo");
  netHandlers().onBeginGame(cfg,seed);
}
// Pass & Play: `names` holds one entry per human seat (2-4), in seat order; any remaining
// seats up to the standard 4-player table are filled with bots, same pool solo/host use.
export function startPassAndPlay(names){
  const strategies=names.map(()=>"human");
  for(let i=names.length;i<4;i++)strategies.push(seatStrat(i)); // BOT-02
  appState.numSeats=strategies.length;appState.room=null;appState.isHost=true;appState.mySeat=0;appState.passAndPlay=true;
  appState.roster=buildRoster(names,strategies);   // playtest 19: bots get a collision-free name
  const seed=Math.floor(Math.random()*1e9);
  const cfg=roundCfg(strategies);
  appState.soloMeta={names,strategies,seed,passAndPlay:true,seaBase:getSeaBase(),bakeoff:!!cfg.bakeoff,ovens:ovensNowEnabled(),bake2:bake2Enabled(),endcard:endCardEnabled()};appState.dlog=[];saveSoloState();pingStart(names.length,"pass");
  netHandlers().onBeginGame(cfg,seed);
}
// pass & play: reveal the active turn-holder's own recipe on demand — see render()'s
// canReveal/offerCheckBtn logic and the recipeRevealed re-lock points inside humanTurn.
/* ⚠ IT MUST REDRAW THE BOX ITSELF — "Check my recipe" did nothing on screen from 2026-08-28 until
   this was measured on 2026-09-10 (scripts/qa/_pnp_band_handover.mjs: the flag flipped to true and
   the button stayed). It called liveRender(), which USED to draw; since W1 that function only drains
   NEW engine events into the one consumer, and a tap on this button emits none — so the captain
   tapped, nothing happened, and their recipe only appeared after their next move. Revealing a
   recipe is not a game event (it changes what THIS screen may show, not the game), so it redraws
   the board directly rather than inventing an event for it. */
export function revealMyRecipe(){appState.recipeRevealed=true;renderBoard();}

/* ================= recovery/replay seam trio ================= */
// This section resolves the final 3 of the milestone's 6 UI->orchestration edges (RESEARCH.md
// Q1b) through src/ui/handlers.js's injected-handler seam — 11-04 resolved the first 2
// (flash->onBroadcast, liveRender->onEvents). Each function below replaces a direct call to a
// still-classic net-adjacent function (sendResponse/setRecoveryState/leaveGame) with a call
// through netHandlers(), so this module never needs its own import of src/net/ (D-07).
// src/main.js's composition root wires onRespond/onRecovery/onLeave alongside the existing
// onBroadcast/onEvents, still pointing at the classic globals via the PP bridge this wave —
// formalized to real src/net/ imports in 11-06.
//
// remotePickHighlights() USED TO LIVE HERE and is RETIRED (02.15-02 Task 3, THE TRACER). It drew
// the same highlighted cells remotePickHighlights on a REMOTE player's board and posted their
// choice back through netHandlers().onRespond — that job now belongs to the ONE converged
// renderer, renderPickPrompt() (above, beside pickCell), named directly by watchPrompt's
// kind==="pick" branch in src/orchestrator.js. onRespond itself is left wired at
// src/main.js:74 with no consumer — see that file's own note.

// leave replay mode: the recorded log is exhausted (or the game replayed to its end). Reconcile
// the broadcast frontier so we push only events the crew hasn't already seen, then render live.
export function endReplay(){
  if(!appState.replaying)return;
  appState.replaying=false;
  // A-13: the rebuilt history was drawn silently (liveRender returns early while replaying) —
  // the consumption frontier must jump past it, or the first live drain would replay every pop
  // and sound of the whole voyage at once.
  appState.evConsumed=appState.game.events.length;
  // BUG-04: this used to set evPushed=resumeEvLen unconditionally. When a replay came up short,
  // that silently moved the broadcast frontier PAST events that were never rebuilt, so every
  // future event was suppressed and guests saw a permanently frozen board. Only advance the
  // frontier when the replay is trustworthy. (readFailed is hard-coded false here; plan 01-02
  // owns resumeHostGame and will thread the real read-failure flag through this parameter.)
  const sf=replayShortfall(appState.game.events.length,appState.resumeEvLen,appState.resumeReadFailed);
  if(sf.incomplete){
    console.error("replay incomplete",sf);
    const note=$("syncnote");if(note)note.style.display="";
    showRestoreFail(sf);    // D-07: ask, don't pretend
    netHandlers().onRecovery?.(sf.reason);  // D-08: and don't leave the crew staring at a frozen board
    return;                 // leave evPushed where it was — pushEvents() resumes from the real
                            // frontier instead of skipping everything the replay failed to rebuild
  }
  /* (`appState.evPushed=appState.resumeEvLen` STOOD HERE — architecture item 47, 2026-09-18. It said
     the right thing at the wrong moment: the replay's own publishNow() calls had already flushed the
     whole rebuilt history to the crew by the time this line ran. The frontier is set where the number
     is learned — resumeHostGame, src/orchestrator.js — and nothing between there and here may publish,
     because pushEvents now refuses while this screen is rebuilding its own history.) */
  // The resumed host is live again: re-arm the full host-gone kit (onDisconnect + the reconnect
  // re-assert watcher). resumeHostGame already re-marked the bare onDisconnect for the reconnect
  // window; this is the durable arming, deliberately AFTER replaying clears so armHostGone()'s
  // own replay guard passes. No-op for guests and solo (armHostGone checks isHost/room itself).
  netHandlers().onHostBack?.();
  liveRender();           // flush any freshly-rebuilt events + paint the current board
  /* ⭐ AND PUT THE BOATS WHERE THE VOYAGE LEFT THEM — Wyatt, 2026-09-09: "there's another problem
     that happens when solo games are reloaded from closed tabs, which is that all the boats appear
     at tortuga; instead they should be played to their last point automatically so they appear in
     the correct places immediately."
     ⚠ REPRODUCED BEFORE IT WAS FIXED (scripts/qa/_solo_resume_positions.mjs). The ENGINE restores
     perfectly — same four squares before and after the reload — and the SHIPS were drawn at cells
     7.5/6.5, 7.5/8.5, 8.5/7.5, 6.5/7.5: the four Tortuga docks, exactly his picture.
     THE CAUSE IS THAT NOTHING EVER MOVED THEM. drawBoard() seats the boats on their home docks
     "right away, before the first event renders", and after that the ONLY thing that repositions a
     ship is renderLiveShips(), which is called from the per-square sail stepper during live play.
     A replay rebuilds state silently — renderLiveShips() guards itself out while `replaying` is
     true, by the same rule liveRender() follows — so a resumed voyage had correct positions in the
     engine and four boats still tied up at home. liveRender() above paints the BOARD; it does not
     own the boats.
     ONE LINE, AFTER `replaying` IS ALREADY FALSE, so the guard inside it passes. */
  renderLiveShips();
  /* ⭐ AND THE BOARD ITSELF IS DRAWN ONCE, HERE — Wyatt, playtest 2026-09-10, item 12: "When i
     reloaded, there was no wind particle animation and no captain's box — but the ships were in
     the right place."
     MEASURED, and it is bigger than either symptom he named: render() is called ZERO times after a
     resume. Not once. The replay rebuilds every fact and drawBoard() lays the board out, but
     render() — which draws the compass needle, the forecast chip, the storm state, the wind
     particle field and the captain's log — never runs again until the next LIVE event, which on a
     resumed voyage can be a whole turn away. "The ships were in the right place" is exactly the
     tell: renderLiveShips() was added on this line for the same bug, one symptom at a time.
     The line above is the boats; this is everything else on the board. One call, on the healthy
     path only — the shortfall branch above returns before it, because a voyage that failed to
     rebuild must show his restore-failure card rather than a confidently drawn wrong board. */
  /* ⭐ AND THE CAPTAINS' ROWS, IN SAILING ORDER — his note 4, 2026-09-11. The rows were built when
     the board was laid out, before the replay had re-drawn the lots, so they stood in plain seat
     order; the turnOrder event that would have rebuilt them was replayed silently. The engine holds
     the order now, so one rebuild here puts them right (the circles read it every tick). */
  buildPlayerRows();
  renderBoard();
}

// notes/edits BUG-03/D-07: the replay didn't rebuild the voyage. Explain which way it failed and
// offer the two honest choices — carry on from a knowingly-incomplete state, or scuttle it and
// start fresh. "Resume anyway" deliberately advances evPushed to the REBUILT length, not to
// resumeEvLen: the frontier must reflect what actually exists locally, or pushEvents() goes right
// back to suppressing everything the replay missed (the BUG-04 freeze).
export function showRestoreFail(sf){
  const why=$("restoreFailWhy");
  if(why)why.textContent = sf.reason==="read-failed"
    ? sayText("restore.unreadable",{})
    : sayText(sf.shortfall===1?"restore.shortOne":"restore.short",{n:sf.shortfall});
  const m=$("restoreFailModal");if(m)m.style.display="flex";
}
export function wireRestoreFail(){
  const anyway=$("btnRestoreAnyway"),restart=$("btnRestoreRestart");
  if(anyway)anyway.onclick=()=>{
    $("restoreFailModal").style.display="none";
    appState.evPushed=appState.game.events.length;   // frontier = what we actually have, not what Firebase claimed
    netHandlers().onRecovery?.(null);
    liveRender();
  };
  if(restart)restart.onclick=()=>{
    $("restoreFailModal").style.display="none";
    netHandlers().onRecovery?.(null);
    netHandlers().onLeave?.();                   // same teardown path as abandoning ship — clears session + room
  };
}
