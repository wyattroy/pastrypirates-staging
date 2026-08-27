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
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.
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
import {
  // F5 (2026-07-29): dockFlavor -> dockFlavorIcon. The tails buy prompt (:below) was this file's
  // only dockFlavor consumer, and it now needs the icon placed by the declared {prefix,name} split
  // rather than interpolated in front of the whole flavour phrase.
  DIRS, DIRNAME, windStepCost, man, HEXCOL, iname, ilabelImg, iconImg, NAMES, dockPlace, dockFlavorIcon, ING_IMG,
  CUPCAKE_IMG, CHECKMARK_IMG, CANCEL_X_IMG, DICE_IMG, FLIP_HEADS_IMG, FLIP_TAILS_IMG,
} from "../shared/index.js";
import { el, boardCell, setFlipActive, renderLiveShips, paintShipAt, setShipGlideMs, paintShipAtPoint } from "./board.js";
import {
  liveRender, panel, setNeedsAction, narrateLastEvent, flash, showNarration,
} from "./panel.js";
import {
  pn, poss, apBtnStyle, ask, armClock, stepDelay, botBeat, setActor, seatLocal,
  decisionIsLocal, stopShotClock, withShotClock, waitWhilePaused, seatStrat, saveSoloState,
  replayShortfall, STORM_STEP_MS, describeFor, narrationVariants, isLocalTo, NEUTRAL_VIEWER,
  msgHoldMs, BOT_STORM_STEP_MS, RIM_SWEEP_ARRIVE_MS, RIM_SWEEP_TICK_MS,
  RIM_SWEEP_MS_PER_CELL, RIM_SWEEP_MIN_MS, RIM_SWEEP_MAX_MS,
} from "./util.js";
import { passGate, requireName, showStep, openNameModal, confirmName, wireNameModal } from "./lobby.js";
import { netHandlers } from "./handlers.js";

const $=id=>document.getElementById(id);
const sleep=ms=>appState.replaying?Promise.resolve():waitWhilePaused().then(()=>new Promise(r=>setTimeout(r,ms)));

/* ================= turn-flow + interaction ================= */

export function localAsk(msg,opts,colors,sub){
  return new Promise(res=>{
    if(opts.length===1&&opts[0].flip){
      setNeedsAction(true);
      setFlipActive(()=>{setFlipActive(null);setNeedsAction(false);res(0);});
      return;
    }
    // an option flagged `back` renders as a small circular "‹" button of its own, above the
    // message — a consistent, low-emphasis escape hatch instead of competing with the real
    // choices in the main button row (see notes/edits — every back-able decision gets this).
    // Can coexist with a `flip` option (arms the flippenator coin as usual) and/or ordinary
    // choices, which still render as the normal button row.
    const backIdx=opts.findIndex(o=>o.back);
    const flipIdx=opts.findIndex(o=>o.flip);
    const done=v=>{setFlipActive(null);setNeedsAction(false);panel("");res(v);};
    if(flipIdx!==-1){setNeedsAction(true);setFlipActive(()=>done(flipIdx));}
    else setFlipActive(null);
    const rest=opts.map((o,i)=>({o,i})).filter(x=>x.i!==flipIdx&&x.i!==backIdx);
    const grid=rest.some(x=>x.o.cls)?" recipes":"";
    const backHtml=backIdx!==-1?`<button class="apBack" data-i="${backIdx}" aria-label="Back">‹</button>`:"";
    const subHtml=sub?`<div class="apSub">${sub}</div>`:"";
    // @copy prompt.plumbing.localask
    panel(`${backHtml}<div class="apMsg">${msg}</div><div class="apBtns${grid}">`+
      rest.map(x=>`<button class="apBtn ${x.o.cls||""}${x.o.disabled?" apDisabled":""}" data-i="${x.i}"${x.o.disabled?" disabled":""}${apBtnStyle(colors&&colors[x.i])}>${x.o.label}</button>`).join("")+`</div>${subHtml}`,
      true);
    $("actionPanel").querySelectorAll(".apBtn,.apBack").forEach(b=>{
      if(b.disabled)return; // disabled options are display-only (notes/edits #5d)
      b.onclick=()=>done(+b.dataset.i);
    });
  });
}
export async function humanFlip(p,label,allowBack){
  setActor(p.idx);
  const opts=[{label:"🌕 FLIP!",value:1,flip:true}];
  if(allowBack)opts.push({label:"← Back",back:true,value:"back"});
  // @copy prompt.flip.fallback
  const v=await ask(label||"Flip the dubloon!",opts);
  if(v==="back")return "back";
  netHandlers().onBroadcastFlip("spin");
  await sleep(340);
  const h=appState.game.flip(p);
  netHandlers().onBroadcastFlip(h?"H":"T");
  // same fixed-3000ms leftover as narrateLastEvent() had — flash() scales the hold to this
  // (short) message's own length instead of a flat timer unrelated to how long it takes to read
  // @copy adhoc.flip.announce
  await flash(`${pn(p.idx)} flips ${h?"⚪ HEADS!":"⚫ TAILS"}`,undefined,undefined,[{seat:p.idx,html:`${pn(p.idx)} — ye flip ${h?"⚪ HEADS!":"⚫ TAILS"}`}]);
  netHandlers().onBroadcastFlip("wait");
  return h;
}
// A fishing cast, flipped on the flippenator like every other coin in the game.
// Humans tap CAST; bots auto-cast. Awards the catch and logs the event.
export async function fishCast(p,label,allowBack){
  const bd=(typeof stepDelay==="function")?stepDelay():500;
  const spin=Math.max(260,Math.min(650,bd*0.7));
  const hold=Math.max(500,Math.min(1200,bd*1.0));
  if(p.strategy==="human"){
    setActor(p.idx);
    const opts=[{label:"🎣 CAST!",value:1,flip:true}];
    if(allowBack)opts.push({label:"← Back",back:true,value:"back"});
    // D-29 RESOLVED (Wyatt-approved 2026-07-29): every player-facing string in this file speaks the
    // pirate register — the 2nd-person pronouns become ye/yer/yers/yerself. Applied as a one-time source
    // transformation using art-review/narration-core.js's own PIRATE_RE/PIRATE_MAP as the spec — the one
    // declaration site in the repo, imported by the audit page, the health gate and ui_contract_check.js
    // alike (the
    // page ran it LIVE at render, so a card tagged `keep` displayed the converted text — under D-25 that
    // converted text is what he approved). No runtime helper is shipped for it: a pirateVoice() nothing
    // calls would be dead code, which D-33/D-34/D-40 exist to prevent. Comments and identifiers are out
    // of scope. scripts/ui_contract_check.js now gates this permanently.
    // @copy prompt.fish.fallback
    const v=await ask(label||`${pn(p.idx)}: cast yer line — flip!`,opts);
    if(v==="back")return "back";
  }
  netHandlers().onBroadcastFlip("spin");
  await sleep(spin);
  const h=appState.game.flip(p);
  netHandlers().onBroadcastFlip(h?"H":"T");
  await sleep(Math.max(hold,3000));
  netHandlers().onBroadcastFlip("wait");
  if(h)p.coins+=2;else if(appState.game.cfg.sardine)p.coins+=1;
  appState.game.ev({t:"fish",p:p.idx,heads:h?1:0});
  liveRender();
  return h;
}
// Dijkstra over the wind-weighted grid: with-the-wind steps cost 2, across cost 3, against
// cost 4 (see windStepCost/#7) — returns every cell reachable within this turn's sail budget.
export function reachable(p){
  const budget=appState.game.sailBudget(p);
  const best={[p.pos[0]+","+p.pos[1]]:0},frontier=[[p.pos,0]],out=[];
  while(frontier.length){
    let mi=0;
    for(let i=1;i<frontier.length;i++)if(frontier[i][1]<frontier[mi][1])mi=i;
    const [c,cost]=frontier.splice(mi,1)[0],k=c[0]+","+c[1];
    if(cost>best[k])continue; // stale entry, already beaten by a cheaper path
    const isStart=c[0]===p.pos[0]&&c[1]===p.pos[1];
    if(!isStart){
      // you may sail PAST other ships, but not end your move on one
      const occupied=appState.game.players.some(q=>q!==p&&!q.done&&q.pos[0]===c[0]&&q.pos[1]===c[1]);
      if(!occupied)out.push(c);
    }
    if(appState.game.onRim(c)&&!isStart)continue; // entering the trade winds ends your move
    for(const dk of Object.keys(DIRS)){
      const dd=DIRS[dk];
      const o=[c[0]+dd[0],c[1]+dd[1]],ok=o[0]+","+o[1];
      if(appState.game.blocked(o))continue;
      if(appState.game.islands[o]!==undefined||appState.game.isHome(o))continue;
      const nc=cost+windStepCost(appState.game.windNow,dk);
      if(nc>budget)continue;
      if(best[ok]!==undefined&&best[ok]<=nc)continue;
      best[ok]=nc;
      frontier.push([o,nc]);
    }
  }
  return out;
}
// D-25/D-35 (Wyatt-approved 2026-07-29): the one sail-prompt message, shared by BOTH transports —
// the host's own localPickCell() and a guest's remotePickHighlights(). Previously the guest path
// hardcoded its own separate sentence instead of rendering what the host composed, so the same
// player read two different prompts depending on whether they happened to be the host or a guest
// (D-35's sweep finding: guest-side code must render text, never author it).
export function sailPickMsg(seat){
  return `${pn(seat)}: click any yellow square to sail there <span class="nobrk">(−1🌕)</span>`;
}
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
export function sailHighlightRect(c,cellPx,svg){
  const side=(cellPx-4)*SAIL_HL_SCALE, inset=(cellPx-side)/2;
  return el("rect",{x:c[0]*cellPx+inset,y:c[1]*cellPx+inset,width:side,height:side,rx:6,
    fill:"#ffc23a",class:"sailCell",style:`cursor:pointer;animation-delay:${((c[0]+c[1])%4)*0.12}s`},svg);
}
export function pickCell(p,cells){
  if(appState.replaying){
    if(appState.dlogIdx<appState.dlog.length){appState.dlogN++;return Promise.resolve(appState.dlog[appState.dlogIdx++]);}
    endReplay();
  }
  setActor(p.idx);
  // @copy misc.draftwait.sailchoosing
  // D-10 DELIVERY (F7): same conversion as ask() — the spectator line is the neutral broadcast and
  // the ACTOR's variant is the empty string (their own board highlighting is their feedback). This
  // used to branch on appState.mySeat, which is the HOST's seat, so one client's answer was sent to
  // the whole table and no guest ever saw "is choosing where to sail".
  netHandlers().onBroadcast(`${pn(p.idx)} is choosing where to sail…`,[{seat:p.idx,html:""}]);
  armClock(p.idx);
  const base=decisionIsLocal(p.idx)?localPickCell(p,cells)
    :netHandlers().onRemotePrompt(p.idx,{kind:"pick",cells,msg:sailPickMsg(p.idx)});
  const cellP=withShotClock(p.idx,base,null);
  return cellP.then(c=>{netHandlers().onLogDecision(c);return c;});
}
export function localPickCell(p,cells){
  return new Promise(res=>{
    const svg=$("board"),hs=[];
    const done=v=>{hs.forEach(h=>h.remove());panel("");appState.activePickCleanup=null;res(v);};
    appState.activePickCleanup=()=>{hs.forEach(h=>h.remove());panel("");};
    // notes/edits UI-06: the sail squares read as obviously tappable — brighter fill, a soft bounce
    // so they draw the eye, and a hover state that pops the square and deepens the colour. Each
    // square's bounce is phase-offset a touch by its board position so they shimmer rather than
    // pulse in dead unison. transform-box:fill-box + centered origin keeps the scale centered.
    // G25: those attributes now live in sailHighlightRect() above, shared with the guest path.
    // notes/edits 11-03: cellPx now read via boardCell() — cell itself lives in src/ui/board.js.
    const cellPx=boardCell();
    cells.forEach(c=>{
      const r=sailHighlightRect(c,cellPx,svg);
      r.addEventListener("click",()=>done(c));
      hs.push(r);
    });
    // @copy prompt.sail.pickpanel
    panel(`<div class="apMsg">${sailPickMsg(p.idx)}</div>
      <div class="apBtns"><button class="apBtn" id="apStay">Stay put</button></div>`,true);
    $("apStay").onclick=()=>done(null);
  });
}
// D-11/D-25 (Wyatt-approved 2026-07-29): can't-afford-to-sail, for a human (humanTurn's own sail
// gate, below) AND a bot (botTurn's sail gate, merged in per D-18/D-25 — both call this same
// function, so the wording can never fork by actor type) — so a broke bot states why it isn't
// moving instead of appearing to forget its turn.
export function brokeSailLine(seat,viewerSeat){
  return isLocalTo(seat,viewerSeat)
    ?`${pn(seat)} — yer too broke to pay the crew. No sailing this turn.`
    :`${pn(seat)} is too broke to pay the crew — no sailing this turn.`;
}
// D-11 case 2/D-25: can't-afford-to-anchor — told plainly the anchor is out of reach, rather than
// the Pay-to-anchor option silently vanishing from the list below (windLeg's storm-anchor block).
export function brokeAnchorLine(seat,viewerSeat){
  return isLocalTo(seat,viewerSeat)
    ?`${pn(seat)} — ye can't afford to anchor. Flip and take yer chances.`
    :`${pn(seat)} can't afford to anchor — flips and takes their chances.`;
}
// F12 (Wyatt-approved 2026-07-29): how much MORE a bot may demand in a counter-offer. The cap has
// to be the coins NOT already pledged, because humanTrade's settlement debits `give.coins+askFor`
// (:below, `const totalCoins=`) — so capping against the full purse counts the pledged coins twice
// and pays the captain into the negative (he went to −1; the tradeBonus `p.coins++` masked it back
// to 0, which is why it survived this long). The existing `askFor>0` guard then turns zero headroom
// into "no counter is offered at all" — the D-41 pattern behaving correctly, one fewer dead-end
// rather than a new one. The Math.max(0,…) floor makes an over-pledged purse impossible to express
// as a negative demand even if a future caller passes something unexpected.
// UI-tier, so no determinism risk: `humanTrade` is a path `Game.play()`'s headless corpus never
// executes — the same reasoning D-19 used to establish that zero `parley` events appear in any of
// the 31 fixtures — and the engine's own separate trade settlement (src/engine/index.js) is untouched.
export function counterHeadroom(shortfall,coins,offerCoins){
  return Math.max(0,Math.min(shortfall,coins-offerCoins));
}
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
// over real boards in scripts/narration_flow_test.js. Never includes `from` itself.
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
  if(!game||!game.isRound||!game.rimCellInfo||!from)return [];
  const key=from[0]+","+from[1];
  const cells=game.rimCellInfo;
  const fromIdx=cells.findIndex(c=>c.k===key);
  if(fromIdx<0)return [];                      // not on the ring
  const head=game.rimHead&&game.rimHead[key];
  if(!head)return [];
  if(head[0]===from[0]&&head[1]===from[1])return []; // already AT its arc head — nothing to sweep
  const headKey=head[0]+","+head[1];
  const headIdx=cells.findIndex((c,i)=>i>=fromIdx&&c.k===headKey);
  if(headIdx<0)return [];
  return cells.slice(fromIdx+1,headIdx+1).map(c=>[c.x,c.y]);
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
// Extracted 2026-07-31 so scripts/rim_sweep_trace_test.js can enumerate exactly what the live
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
// and by the guest's watchEvents(). Takes NO PARAMETERS on purpose — no call site can pass something
// a different call site doesn't, so the two tiers cannot be paced or aimed differently.
//
// Derives its path from the EVENT STREAM, which both tiers have: the last event must be a
// `tradewind`; `to` is that event's own state snapshot, `from` is the PREVIOUS event's. It then
// refuses to animate unless rimSweepPath(from) is non-empty AND lands exactly on `to`. NEVER
// INVENTS A PATH — if the derivation does not check out, it returns and today's instant render
// stands.
//
// WHERE THE DERIVATION HOLDS (an event exists AT the entry cell):
//   - a human sailing into the rim — the `sail` event is emitted at the entry cell
//   - a human storm push onto the rim — `windmove`/`blownOut` likewise
//   - the engine's rimEscape() — `windmove` at the rim cell, THEN the sweep. That is exactly the
//     bot-teaching case G18 just turned on.
// WHERE IT FALLS BACK to today's instant render, honestly listed rather than overclaimed:
//   - the engine's INTERNAL windPush sweep (a bot storm), which emits nothing between stepping onto
//     the rim and sweeping, so there is no `from` to read
//   - the battle-flee sweep (src/orchestrator.js), where `def.pos=dest` is not recorded before
//     tradewind() runs
// Both render exactly as they do today — no regression, and no invented path. Closing that residue
// would require the ENTRY CELL in the event stream, i.e. the STORM-02 class of change, which stays
// parked on its own merits and is NOT added to the re-record batch.
let _lastSweptEvIdx=-1;
export async function animateRimSweepIfAny(){
  const g=appState.game;
  if(!g||appState.replaying)return;
  const n=g.events.length;
  if(n<2)return;
  const last=g.events[n-1];
  if(!last||last.t!=="tradewind")return;
  // RE-ENTRY GUARD: a module-local index, NEVER a flag stamped on the event object. The host
  // broadcasts events verbatim (pushEvents -> JSON.parse(JSON.stringify(...))), so an extra field
  // would leak straight into the Firebase payload and can trip scripts/net_contract_check.js.
  if(_lastSweptEvIdx===n-1)return;
  _lastSweptEvIdx=n-1;
  const seat=last.p;
  const prev=g.events[n-2];
  if(!last.state||!prev||!prev.state)return;
  const to=last.state[seat]&&last.state[seat].pos;
  const from=prev.state[seat]&&prev.state[seat].pos;
  if(!to||!from||!g.onRim(from))return;
  const path=rimSweepPath(g,from);
  if(!path.length)return;
  const end=path[path.length-1];
  if(end[0]!==to[0]||end[1]!==to[1])return;   // the derivation disagrees with the engine — do not guess
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
      // one tick's worth of LINEAR glide, so the browser bridges between our targets and soaks up
      // setTimeout's jitter. Anything longer re-introduces the lag that made the boat cut corners.
      setShipGlideMs(seat,RIM_SWEEP_TICK_MS,"linear");
      const began=Date.now();
      for(;;){
        // progress from ELAPSED TIME, never from a tick count. A throttled or late tick then
        // advances further along the curve instead of stretching the sweep — and in a hidden tab,
        // where setTimeout is clamped to ~1s, this reaches 1 and terminates rather than crawling.
        // (rAF would not run at all there; see RIM_SWEEP_TICK_MS and src/ui/panel.js:334.)
        const t=Math.min(1,(Date.now()-began)/total);
        const p=rimSweepPointAt(curve,t);
        if(p)paintShipAtPoint(seat,p[0],p[1]);
        if(t>=1)break;
        await sleep(RIM_SWEEP_TICK_MS);
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
}
// one 1- or 2-square push in a single direction, with the human island-dodge prompt inline.
// storms chain two of these (see humanWind) — each leg resolves fully before the next begins.
export async function windLeg(p,dirKey,dist,dodgedOnce,wasDocked){
  dodgedOnce=dodgedOnce||{v:false};
  const d=DIRS[dirKey];
  for(let s=0;s<dist;s++){
    const nx=[p.pos[0]+d[0],p.pos[1]+d[1]];
    if(appState.game.blocked(nx))return;
    // G15 (Wyatt-approved 2026-07-30) — PAINT BEFORE NARRATE, everywhere in this function. His
    // report: "the storm animation didn't move your boat until AFTER the message disappeared… is
    // there a way to make the movement happen before the message, for all movements during all
    // storms?" Every ev() -> await narrateLastEvent() pair below now paints in between, and
    // scripts/narration_flow_test.js asserts it as an INVARIANT over this whole function (plus a
    // mirror for botWindLeg), not as a pin on three specific lines — so a fourth branch added later
    // is covered for free and cannot inherit the wrong order. It also replaces two old pins that
    // required the WRONG order for `moored` and `anchorHold`; D-13's real requirement (the
    // anchorHold line must PLAY AT ALL) is preserved and asserted separately.
    //
    // BE HONEST ABOUT WHAT EACH BRANCH BUYS — it differs, and a reader who checks will otherwise
    // think this comment is wrong:
    //   blocked / moored / anchorHold — the ship does not move on that square, so the visible
    //     change is small. What these buy is the INVARIANT: no future branch inherits the bug.
    //   dodge / anchor / aground / shipwrecked — coins and crates change, and the panel should show
    //     the new purse before the line describing it plays. This is where it is actually visible.
    //   THE LAG WYATT ACTUALLY WATCHED is the trade-wind rim sweep, which is G14 — a separate fix
    //     that animates the sweep square-by-square. Do NOT read G15 as having fully answered his
    //     report; it fixes the ordering, G14 fixes the motion.
    const blocker=appState.game.players.find(q=>q!==p&&!q.done&&q.pos[0]===nx[0]&&q.pos[1]===nx[1]);
    if(blocker){appState.game.ev({t:"blocked",p:p.idx,other:blocker.idx});liveRender();await narrateLastEvent();return;} // another ship holds that square — wind stops short (see #20: surface the "strikes sail" narration)
    if(appState.game.islands[nx]!==undefined||appState.game.isHome(nx)){
      // D-19/D-21/D-22: mooredReason() is the single source of truth for which of the three
      // safe-harbor causes fired — call the engine's own accessor rather than re-deriving the
      // cause here. Folds the old standalone isHome(nx) early return into ordinary land
      // handling, mirroring windPush's own isIsland(nx)||isHome(nx) branch
      // (src/engine/index.js:280) — same order this file already keeps (blocker before land).
      const reason=appState.game.mooredReason(p);
      if(reason){appState.game.ev({t:"moored",p:p.idx,reason});liveRender();await narrateLastEvent();return;}
      // a storm only ever charges (coins or a coin flip) once per turn — a second leg that
      // also hits an island is a free pass, already-paid anchor holding fast
      if(dodgedOnce.v){appState.game.ev({t:"anchorHold",p:p.idx});liveRender();await narrateLastEvent();return;}
      const opts=[];
      // notes/edits #10b: the real tails consequence depends on what this player actually has to
      // lose (mirrors the branches below) — a broke player with crates loses one of those, not
      // "half their coins" (they have none), and only a truly broke, empty-holds player risks
      // losing the whole turn to repairs.
      // G10 (2026-07-30): HOISTED above the option push — a pure reorder, no behaviour change — so
      // both the option list and the prompt below can read it.
      const broke=p.coins===0,trueShipwreck=broke&&!p.ing.length;
      // D-38 (Wyatt-approved 2026-07-29): signed parenthesised cost, U+2212 minus.
      // G10 (Wyatt-approved 2026-07-30), at 0 coins during a storm push into land: "oooh -- this
      // should also have a greyed-out button because you can't anchor!" SIXTH instance of the D-41
      // family after Attack, Trade, coins-only, hail-Counter and dock-buy. The option used to be
      // pushed only when p.coins>=1, so it VANISHED with no explanation on the decision surface.
      // Now it is always pushed and greys instead, with his reason verbatim beneath it. The label,
      // the U+2212 minus and the (−1🌕) parenthetical are untouched.
      // The reason is supplied ONLY when broke — ui_contract_check.js assertion 6 requires a
      // disabled option's reason to be reachable in the state it explains and absent in states it
      // does not.
      opts.push({label:'Anchor safely <span class="nobrk">(−1🌕)</span>',value:"pay",disabled:broke});
      // D-59 (Wyatt-approved 2026-07-29): the ordinary branch shows the REAL coin loss — the same
      // Math.max(1,Math.floor(p.coins/2)) expression the engine uses below, so the button can never
      // disagree with the outcome, and the rounding-down is visible before the decision is made.
      // G13 (Wyatt-approved 2026-07-30): the ORDINARY branch used to name the coin GLYPH where it now
      // says "treasure", which put two coin emojis a few characters apart — "the two coin emojis next
      // to each other are confusing", his words. Only the WORD
      // changes: the D-59 parenthetical keeps its live expression and its 🌕, so the button still
      // cannot disagree with the outcome. The trueShipwreck and broke branches are untouched;
      // neither ever had two coin glyphs.
      // G24 (Wyatt-declined 2026-07-30): he was offered an inline-icon-spacing change alongside this
      // and turned it down — "i don't care at all about breathing room around inline items right now
      // -- i just wanted the emoji wording fix." Do NOT bundle a margin change (here or in
      // index.html's .narrIcon rule) into a wording fix at this site.
      const flipLabel=trueShipwreck?"Flip (⚪ HEADS: dodge safely. ⚫ TAILS: lose turn)"
        :broke?"Flip (⚪ HEADS: dodge safely. ⚫ TAILS: lose a crate)"
        :`Flip (⚪ HEADS: dodge safely. ⚫ TAILS: lose half yer treasure <span class="nobrk">(−${Math.max(1,Math.floor(p.coins/2))}🌕)</span>)`;
      opts.push({label:flipLabel,value:"flip"});
      // G10 second half (2026-07-30): the prompt used to OFFER a branch it could not honour — a
      // broke captain read "Anchor safely, or take yer chances…" above a button he could not press.
      // A third case for broke-but-holding-crates, built by DELETING the offer clause from the
      // existing sentence — NOT by writing a new one. Same operation D-46/G1 already performed on
      // the dock lines, and D-31 justifies it twice over: what remains of the decision is stated by
      // the flip BUTTON, which names both consequences. trueShipwreck keeps its own wording, which
      // already explains the stakes without offering an anchor.
      const promptMsg=trueShipwreck
        ?`${pn(p.idx)}: the storm blows ye toward an island! Yer broke — if ye run aground, ye'll lose yer turn!`
        :broke?`${pn(p.idx)}: the storm's blowin' ye into land!`
        :`${pn(p.idx)}: the storm's blowin' ye into land! Anchor safely, or take yer chances dodging the rocks.`;
      // D-11 case 2: the anchor option greys out above when broke — this says the same thing a beat
      // earlier on the COMMENTARY surface, and is NOT duplication. D-40's finding was that the
      // explanation lived only on the wrong surface; having it on both is the fix. NARR-02 case 2,
      // gate-asserted since 15-02 — do not remove it.
      // @copy adhoc.storm.brokeanchor
      if(broke)await flash(brokeAnchorLine(p.idx,NEUTRAL_VIEWER),900,undefined,[{seat:p.idx,html:brokeAnchorLine(p.idx,p.idx)}]);
      // @copy prompt.storm.anchororflip
      const v=await ask(promptMsg,opts,null,broke?`Yer too broke to anchor`:null);
      if(appState.turnExpired)return;
      // G6 (COIN-AUDIT.md site 5): the "pay" option was pushed above when p.coins>=1, but `await
      // ask(...)` sits between that gate and this debit, and the 20s penalty can take the coin in
      // between. Re-validated here; a shortfall falls through to the EXISTING flip branch below,
      // which is what a captain with no coin gets anyway — and brokeAnchorLine already explains a
      // missing pay option in existing approved copy, so nothing new is written.
      if(v==="pay"&&!coinShortfall(1,p.coins)){p.coins--;appState.game.ev({t:"dodge",p:p.idx});liveRender();await narrateLastEvent();}
      else{
        // @copy misc.paramprompt.stormdodge
        const h=await humanFlip(p,"Flip to dodge!");
        if(appState.turnExpired)return;
        if(h)appState.game.ev({t:"anchor",p:p.idx});
        // tails with no coins can't "lose half" of nothing — take a crate instead, or if the
        // hold is empty too, the ship is stuck and repairs eat the rest of this turn
        else if(p.coins>0){p.coins-=Math.max(1,Math.floor(p.coins/2));appState.game.ev({t:"aground",p:p.idx});}
        else if(p.ing.length){
          const idx=Math.floor(appState.game.r()*p.ing.length);
          const lost=p.ing.splice(idx,1)[0];
          appState.game.tokens[lost]++;
          appState.game.ev({t:"aground",p:p.idx,ing:lost});
        }else{p.shipwrecked=true;appState.game.ev({t:"shipwrecked",p:p.idx});}
        // G15: the purse/hold has just changed, so paint the new state BEFORE the line describing
        // it plays — the anchor/aground/shipwrecked outcome is the branch where this buys the most.
        liveRender();
        await narrateLastEvent();
      }
      dodgedOnce.v=true;
      liveRender();return;
    }
    // D-22: render THIS square before the next one's outcome can narrate — the reported "false
    // dock held fast" symptom was the board being a square behind when the message played, not a
    // wrong message. sleep() is a no-op during replay (:64), so this adds no replay-timing risk.
    //
    // renderLiveShips(), NOT liveRender(): an ordinary storm square emits no event, and liveRender()
    // -> render() draws every ship from events[evIdx].state — the snapshot on the LAST EMITTED
    // event — so it repainted the square the ship had already left and the push was invisible.
    // Nothing else changed on this square either (no event to log, broadcast or pop), so painting
    // the ships from their live positions is both the fix and the whole of the work owed here.
    p.pos=nx;
    renderLiveShips();
    await sleep(STORM_STEP_MS);
    if(appState.game.onRim(nx)){ // swept into the trade winds
      appState.game.ev({t:wasDocked?"blownOut":"windmove",p:p.idx});liveRender();
      if(appState.game.tradewind(p)){await animateRimSweepIfAny();liveRender();await narrateLastEvent();}
      return;
    }
  }
  appState.game.ev({t:wasDocked?"blownOut":"windmove",p:p.idx});liveRender();
}
// bot's own storm push (D-09/D-10/D-11) — mirrors windLeg's per-square shape, but delegates each
// square's outcome to the engine's own windPush(p,d,1,dodgedOnce) rather than re-deriving the
// island-outcome ladder: the engine already makes bots' storm decisions today, so reimplementing
// the ladder here would let bots and humans silently drift apart on the rule itself (the same
// "keep the two in step" convention this file already follows for humanDock/Game.doDock). Narrates
// EVERY event the square records, not just the last — the fix for D-11: botBeat()'s own
// narrateCurrent() only ever narrates the single appState.evIdx pointer, which is exactly why bot
// storm outcomes have been vanishing. No flip animation for a bot: windPush already calls
// g.flip(p) directly and records the resulting anchor/aground/shipwrecked event; narrating that
// event states the result, which is all D-11 asks for. The interactive human flip helper
// (humanFlip) is never reached from this function.
export async function botWindLeg(p,dirKey,dist,dodgedOnce,wasDocked){
  dodgedOnce=dodgedOnce||{v:false};
  const g=appState.game;
  for(let s=0;s<dist;s++){
    const before=[...p.pos];
    const evBefore=g.events.length;
    g.windPush(p,DIRS[dirKey],1,dodgedOnce);
    if(g.events.length>evBefore){
      // paint BEFORE narrating, same order the human path already uses for its own rim sweep
      // (windLeg :274 renders, then flashes). windPush can move the ship AND record an event in
      // one call — a square onto the rim is followed by tradewind() flinging it to the quadrant
      // head — and the board must already show where the ship ended up when the line describing
      // it plays, which is the whole of D-22. Without this the boat sat on its old square through
      // the entire message and only jumped at the liveRender() below.
      renderLiveShips();
      for(let k=evBefore;k<g.events.length;k++){
        const ev=g.events[k];
        // D-10: render the viewer-NEUTRAL text (never the ambient appState.mySeat-flavored one)
        // plus per-seat variants — the same broadcast-safe split narrateLastEvent() uses.
        const L=describeFor(ev,NEUTRAL_VIEWER);
        // @copy adhoc.storm.botsquare
        if(L)await flash(L.txt,null,msgHoldMs(L.txt),narrationVariants(ev));
      }
      liveRender();
      return; // the engine returned early — this square's own outcome ends the leg
    }
    if(p.pos[0]!==before[0]||p.pos[1]!==before[1]){
      // same reason windLeg uses it (:263) — the engine moved the ship without emitting an event,
      // and render() only ever draws ships from the last event's position snapshot, so liveRender()
      // here repainted the square the ship had just left. This is the square that was invisible.
      renderLiveShips();
      await sleep(BOT_STORM_STEP_MS);
      if(g.onRim(p.pos))return; // the engine already resolved the rim; no further square to push
      continue;
    }
    return; // neither moved nor recorded anything — a blocked square, stop silently like windLeg
  }
  g.ev({t:wasDocked?"blownOut":"windmove",p:p.idx});
  const lastEv=g.events[g.events.length-1];
  const L=describeFor(lastEv,NEUTRAL_VIEWER);
  // @copy adhoc.storm.botlegsummary
  if(L)await flash(L.txt,null,msgHoldMs(L.txt),narrationVariants(lastEv));
  liveRender();
}
// NARR-03: the per-turn storm intro clause — sits inside the addressed turn banner ("Ahoy, {name}
// — yer turn!", humanTurn below) and previously pre-announced BOTH storm legs before either
// happened. humanWind (below) and botTurn already announce the second leg's own direction at the
// moment it actually happens, so pre-announcing it here was exactly that redundancy — this clause
// now names only the leg happening now. Second person because this clause only ever renders inside
// the addressed (one-captain) form of the turn banner; the round header (EVENT_NARRATION.newround)
// stays third person and untouched (D-09).
// NARR-01/D-25/D-37 (Wyatt-approved 2026-07-29): the turn banner's storm clause. "Blows", per D-37
// — wind never "pushes" or "moves" a player, it blows them.
export function stormIntroClause(dir1){
  return ` First the ⛈️ storm blows ye 2 squares <b>${DIRNAME[dir1]}</b>.`;
}
// D-18/D-23/D-37/D-25 (Wyatt-approved 2026-07-29): the second-storm-leg announcement, shared by the
// human path (humanWind, below) AND the bot path (botTurn) — one narration path per event, viewer
// perspective is the only axis that varies (D-18). Previously humanWind hardcoded a "you" line with
// no viewer branch (so a spectator of a human's turn also read "you" — the exact fork D-18 flags),
// and botTurn's own copy of the same line ran on the separate, shorter bot hold curve (D-23 removes
// that gap: both now go through msgHoldMs). "Blows", never "moves" (D-37).
export function secondLegLine(seat,dir,viewerSeat){
  return isLocalTo(seat,viewerSeat)
    ?`⛈️ Now the storm blows ye <b>${DIRNAME[dir]}</b>!`
    :`⛈️ Now the storm blows ${pn(seat)} <b>${DIRNAME[dir]}</b>!`;
}
// only ever called during a storm now (see humanTurn) — normal turns don't force-move anyone
export async function humanWind(p){
  setActor(p.idx);
  const wasDocked=appState.game.adjPort(p)!==null;
  const dodgedOnce={v:false};
  await windLeg(p,appState.game.windNow,2,dodgedOnce,wasDocked);
  if(appState.turnExpired)return;
  // @copy adhoc.storm.secondleg
  await flash(secondLegLine(p.idx,appState.game.windNow2,NEUTRAL_VIEWER),900,undefined,[{seat:p.idx,html:secondLegLine(p.idx,appState.game.windNow2,p.idx)}]);
  if(appState.turnExpired)return;
  await windLeg(p,appState.game.windNow2,2,dodgedOnce,wasDocked);
}
export async function humanDock(p,port){
  setActor(p.idx);
  const ing=port;
  // notes/edits NARR-07: empty island — nothing to flip for, so don't make the player flip. Mirrors
  // the same early-out in Game.doDock; keep the two in step or bots and humans diverge.
  if(appState.game.tokens[ing]<=0){
    p.coins+=3;appState.game.ev({t:"dock",p:p.idx,ing,got:"empty"});
    await narrateLastEvent();
    p.firstFlip.add(ing);p.dockedNow.add(ing);
    liveRender();
    return;
  }
  // D-46 (Wyatt-approved 2026-07-29): the flip prompt names the PLACE, not the ingredient — the
  // ingredient icon is kept (D-16), the ingredient is the payoff named once the flip resolves.
  // @copy misc.paramprompt.dockflip
  const h=await humanFlip(p,`Docking at ${iconImg(ING_IMG[ing])} ${dockPlace(ing)} — flip!`,true);
  if(h==="back")return "back";
  if(h){
    appState.game.tokens[ing]--;p.ing.push(ing);appState.game.ev({t:"dock",p:p.idx,ing,heads:1,got:"ing"});
  }else{
    let got="coins";
    // F9 (Wyatt-approved 2026-07-29, D-41): the affordability test USED TO LIVE IN THIS CONDITION,
    // so a captain with under 3 coins got no prompt at all — the turn resolved straight to taking
    // the coins and they never learned that buying the crate was possible but unaffordable, which is
    // exactly the information that teaches the dock-on-tails rule. Same family as D-41's dead-ends,
    // inverted: instead of offering an option that cannot work, it removed the choice with no
    // explanation. The prompt now shows whenever the buy rule is on and the island has stock;
    // affordability decides only whether the buy option is CLICKABLE.
    if(appState.game.cfg.dockBuy&&appState.game.tokens[ing]>0){
      const canBuy=p.coins>=3;
      // @copy prompt.dock.tailschoice
      // F5 (Wyatt-approved 2026-07-29): SEVENTH site of the icon-before-the-clause shape — not in
      // the playtest notes' six-site audit table, found while implementing. Was
      // `${iconImg(ING_IMG[ing])} ${dockFlavor(ing)}`, which floated the icon to the front of the
      // whole flavour phrase; dockFlavorIcon() places it directly before the ingredient NAME using
      // the declared split. Same rule, same fix, no new copy — the sentence is unchanged.
      //
      // F9's reason is Wyatt's own copy, approved 2026-07-29 — shipped verbatim, and three things
      // about it are load-bearing: the dash is a U+2014 em dash per D-53 and the house style; the
      // coin stays as the 🌕 emoji shorthand because emojify() turns it into the coin artwork at the
      // panel() chokepoint (D-50), so an image tag must NOT be hand-rolled here; and it is supplied
      // ONLY when unaffordable, so a solvent captain sees no helper text at all. The prompt sentence
      // itself is deliberately unchanged — it already names the alternative.
      //
      // This fix and scripts/ui_contract_check.js's co-reachability assertion hold each other up:
      // that gate (added for F11) requires every `disabled:` option to have a reason reachable in
      // the state it explains, so it now covers this option and would fail if the reason were ever
      // removed or moved into a branch that cannot fire alongside the greying.
      //
      // G12 (Wyatt-approved 2026-07-30): the prompt is now his own words, typed verbatim —
      // `⚫️ TAILS! Take treasure instead? Or buy a bundle of 🌼 Velvety Vanilla Beans?`. Three
      // things in it are load-bearing:
      //   1. THE AMOUNTS ARE REMOVED ON PURPOSE. The buttons below already carry them
      //      (`Buy … (−3🌕)` / `Take 3🌕`). D-31 applied deliberately, in his words: "I don't want
      //      to duplicate wording in the prompt and on the button."
      //   2. `TAILS` IS ALL CAPS because the game is announcing a flip outcome AS IT HAPPENS. The
      //      sweep found this prompt was the ONLY in-play offender; explanatory prose (the
      //      how-to-play modal) and statistics (award bylines, `heads-luck`) stay lowercase at his
      //      word — "just the in-play line is fine, leave the prose and stats". The ruling and the
      //      blanket-replace hazard live in .planning/todos/pending/flip-outcomes-all-caps-in-play-only.md.
      //   3. `⚫️` IS EMOJI SHORTHAND, NOT AN <img> — emojify() turns it into the coin artwork at the
      //      panel() chokepoint (D-50). It carries the U+FE0F variation selector exactly as he typed
      //      it; do not strip it.
      // The flavour phrase is still dockFlavorIcon(ing) — F5's one-place-decides rule, icon before
      // the NOUN. Never hand-roll it here.
      const buy=await ask(`⚫️ TAILS! Take treasure instead? Or buy ${dockFlavorIcon(ing)}?`,[
        {label:`Buy ${ilabelImg(ing)} <span class="nobrk">(−3🌕)</span>`,value:true,disabled:!canBuy},{label:"Take 3🌕",value:false}],
        null,canBuy?null:`Yer too broke to buy it — take the 3🌕 instead.`);
      // D-40 safety net: guard the purchase on affordability as well as on the returned choice, so a
      // forced or edge selection of the greyed option can never spend coins that are not there.
      // Deliberately re-reads p.coins rather than trusting `canBuy`, which was computed BEFORE the
      // await: the shot-clock's 20-second penalty can take a coin WHILE this prompt is open (see
      // COIN-AUDIT.md site 4), so a stale flag would leave that hole open while looking guarded.
      if(buy&&p.coins>=3){p.coins-=3;appState.game.tokens[ing]--;p.ing.push(ing);got="bought";}
      else p.coins+=3;
    }else p.coins+=3;
    appState.game.ev({t:"dock",p:p.idx,ing,heads:0,got});
  }
  await narrateLastEvent();
  p.firstFlip.add(ing);p.dockedNow.add(ing);
  liveRender();
}
export async function humanTrade(p){
  setActor(p.idx);
  const opps=appState.game.tradeOpp(p).filter(q=>q.ing.length>0);
  // @copy adhoc.trade.nocargo
  if(!opps.length){await flash("No one has cargo to trade for.");return false;}
  // notes/edits UI-08: the parley used to be a straight chain of prompts where hitting Back at ANY
  // step returned false all the way out to the action menu — so Back felt like it jumped two (or
  // more) steps. It's now a little step machine: Back moves to the PREVIOUS prompt, and only Back
  // out of the first shown prompt returns to the action menu (which is itself exactly one step
  // back). Inputs accumulate in `st` so revisiting a step keeps what you already picked.
  const st={q:null,want:null,baseIng:undefined,extraCoins:undefined};
  const single=opps.length===1;
  if(single)st.q=opps[0];
  const firstStep=single?1:0; // step 0 partner · 1 want · 2 offer-ing · 3 sweeten-coins
  let step=firstStep;
  while(step<4){
    // CR-02 layer 1: the shot clock can expire on ANY of the four prompts below. The bot-hail path
    // has had this guard since 14-02 (`if(appState.turnExpired)return;` — "no partial trade, ever");
    // humanTrade never got it. 15-LEARNINGS #3: the guard existed in one path and was never carried
    // to the other. Returning false lands on the action menu, and expireShotClock has already
    // narrated the skip, so nothing is said twice and no copy is invented.
    if(appState.turnExpired)return false;
    if(step===0){
      // D-19 (Wyatt-approved 2026-07-29): "Trade", never "Parley" — the only two places the word
      // reached a player.
      // @copy prompt.trade.partner
      const q=await ask("Trade with whom?",opps.map(o=>({label:pn(o.idx),value:o})).concat([{label:"← Back",back:true,value:"__back__"}]),
        opps.map(o=>HEXCOL[o.idx]).concat([null]));
      if(q==="__back__"||q==null)return false; // Back from the first step → action menu (one step)
      st.q=q;step=1;
    }else if(step===1){
      // @copy prompt.trade.want
      const want=await ask(`What do ye WANT from ${pn(st.q.idx)}?`,
        [...new Set(st.q.ing)].map(i=>({label:ilabelImg(i),value:i})).concat([{label:"← Back",back:true,value:"__back__"}]));
      if(want==="__back__"||want==null){if(step===firstStep)return false;step--;continue;}
      st.want=want;step=2;
    }else if(step===2){
      // An offer is an ingredient, coins, or both together — sweeten a crate with a few coins on top.
      // D-41 EXTENDED (Wyatt-approved 2026-07-29): "coins only" dead-ends when the purse is empty —
      // grey it out and say why, same pattern as Attack/Trade's own availability gating.
      const canOfferCoins=p.coins>0;
      const ingOpts=[...new Set(p.ing)].map(i=>({label:ilabelImg(i),value:i}));
      ingOpts.push({label:"— coins only —",value:"__coinsonly__",disabled:!canOfferCoins});
      ingOpts.push({label:"← Back",back:true,value:"__back__"});
      const offerSub=canOfferCoins?null:`Ye don't have any coin to offer — pick a crate instead.`;
      // @copy prompt.trade.give
      const baseIng=await ask(`What will ye GIVE ${pn(st.q.idx)} in exchange?`,ingOpts,null,offerSub);
      if(baseIng==="__back__"){if(step===firstStep)return false;step--;continue;}
      st.baseIng=(baseIng==="__coinsonly__")?null:baseIng;step=3;
    }else{ // step 3
      const coinChoices=[0,1,2,3,4,5,6].filter(n=>n===0||p.coins>=n);
      if(!st.baseIng)coinChoices.shift(); // a coins-only offer needs at least 1 coin
      if(!coinChoices.length){
        // D-40: guarded safety net — the "coins only" option is now greyed out whenever the purse
        // is empty (above), so this is unreachable through the normal UI; kept for a forced/edge
        // selection, same convention as Attack's own guard.
        // @copy prompt.trade.nothingtooffer
        await ask("Ye don't have any to offer!",[{label:"← Back",back:true,value:-1}]);
        step=2;continue;
      }
      const coinOpts=coinChoices.map(n=>({label:n===0?"No extra coins":`+${n}🌕`,value:n}));
      coinOpts.push({label:"← Back",back:true,value:-1});
      // @copy prompt.trade.addcoins
      // G11 (Wyatt-approved 2026-07-30): was `Add any 🌕 to yer offer of <the crate, or a
      // placeholder phrase when there was none>?`. His words: "this is a weird statement, for players
      // who only offer coins! It should just say 'How many?' -- and i think it would work with all
      // branches." BOTH branches, so the interpolation goes entirely and the local const that built
      // it was DELETED — a const nothing reads is the dead code D-33/D-34/D-40 exist to prevent, and
      // it stranded the coins-only placeholder phrase, which is the exact wording he called weird.
      // WHAT HE GIVES UP, stated plainly so a later pass does not "restore context" and undo him: on
      // the crate branch this screen now reads `How many?` above a row of coin options ending in
      // `No extra coins`, with no reminder of WHICH crate is being offered. He has been told this and
      // accepted it.
      const extraCoins=await ask(`How many?`,coinOpts);
      if(extraCoins===-1){step=2;continue;}
      st.extraCoins=extraCoins;step=4;
    }
  }
  const q=st.q,want=st.want;
  const give={ing:st.baseIng,coins:st.extraCoins};
  // plain-text form (stored on events, later run through fmtItem for the log); emoji form for
  // direct UI prompts below
  const offerLabel=(give.ing?iname(give.ing):"")+(give.ing&&give.coins?" + ":"")+(give.coins?`${give.coins} coins`:"");
  const offerDisplay=(give.ing?ilabelImg(give.ing):"")+(give.ing&&give.coins?" + ":"")+(give.coins?`${give.coins}🌕`:"");
  let accept;
  if(q.strategy==="human"){
    setActor(q.idx);
    // @copy prompt.trade.accept
    accept=await ask(`${pn(q.idx)}: accept ${offerDisplay} for yer ${ilabelImg(want)}?`,
      [{label:`${iconImg(CHECKMARK_IMG)} Accept`,value:true},{label:`${iconImg(CANCEL_X_IMG)} Decline`,value:false}]);
    // CR-02 layer 1, THE important one. expireShotClock resolves this promise via shotClockForce(),
    // and `ask()` forces default index 0 — which here is **Accept**. Without this guard a partner
    // who simply ran out of time is recorded as having AGREED to the trade. Silence is correct: the
    // skip has already been narrated.
    if(appState.turnExpired)return false;
  }else{
    // bot valuation: a crate is ESSENTIAL if it's on their recipe and they hold no spare — unless
    // they're within one turn's sail of that crate's own dock and could just go re-flip for
    // another, in which case trading it away is the efficient path (players trading with each
    // other instead of everyone physically re-visiting every island).
    const essential=q.recipe.includes(want)&&appState.game.cnt(q.ing,want)<=1;
    const nearResupply=essential&&appState.game.tokens[want]>0&&man(q.pos,appState.game.islandOf[want])<=3;
    const trulyEssential=essential&&!nearResupply;
    // bots never hand a human their final needed ingredient — no price buys it, they have to
    // fight for it instead
    const humanNeeds=appState.game.needs(p);
    const humanFinishes=humanNeeds.length===1&&humanNeeds[0]===want;
    // an ordinary crate is still worth more than the 1🌕 a bad fishing flip guarantees, and gets
    // pricier as its home island's remaining supply runs low (notes/edits #6)
    const scarcityBonus=appState.game.tokens[want]<=1?2:(appState.game.tokens[want]<=2?1:0);
    let cost=trulyEssential?7:(3+scarcityBonus);
    const ingVal=give.ing?(appState.game.needs(q).includes(give.ing)?7:2):0;
    const val=ingVal+give.coins;
    const bonus=appState.game.cfg.tradeBonus?1:0;
    // if what's on offer is something the bot needs and every island's stock of it is gone,
    // this trade is the bot's only remaining way to ever get it — take the deal outright
    const mustAcquire=give.ing&&appState.game.needs(q).includes(give.ing)&&appState.game.tokens[give.ing]===0;
    accept=!humanFinishes&&(mustAcquire||val+bonus>=cost);
    if(!accept){
      const shortfall=Math.max(0,cost-bonus-ingVal-give.coins);
      // bots always counter a lowball rather than flatly refuse — if the human can't cover the
      // full shortfall, name the smaller amount they *can* afford instead of walking away outright.
      // F12: "can afford" means the coins NOT already pledged in this offer — see counterHeadroom().
      const askFor=counterHeadroom(shortfall,p.coins,give.coins);
      if(!humanFinishes&&askFor>0){
        setActor(p.idx);
        // @copy prompt.trade.counter
        const deal=await ask(`${pn(q.idx)} scoffs — but counters: "${askFor}🌕 more for my ${ilabelImg(want)}, take it or leave it."`,
          [{label:`Pay ${askFor}🌕 more`,value:true},{label:"Walk away",value:false}]);
        // G6 (COIN-AUDIT.md site 2): askFor was priced against the purse held when the counter was
        // composed; `await ask(...)` above is the window. Re-validate the FULL settlement
        // (give.coins+askFor — the same total debited below), not just the increment. A shortfall
        // falls through to the "Walk away" outcome: the parley event and the existing
        // @copy adhoc.trade.refusalbot line just below, which is exactly what declining renders.
        if(appState.turnExpired)return false; // CR-02 layer 1 — see the accept prompt above
        // CR-02 layer 2: BOTH legs are validated before EITHER mutates, so a trade is atomic. A
        // crate that is no longer held routes into the existing decline path below rather than
        // splicing on indexOf === -1. Same shape G6 used for a coin shortfall, and no new copy.
        const canCounter=deal&&!coinShortfall(give.coins+askFor,p.coins)
          &&p.ing!=null&&q.ing.includes(want)&&(!give.ing||p.ing.includes(give.ing));
        if(canCounter){
          moveCrate(q.ing,p.ing,want);
          if(give.ing)moveCrate(p.ing,q.ing,give.ing);
          const totalCoins=give.coins+askFor;
          p.coins-=totalCoins;q.coins+=totalCoins;
          appState.game.trades++;
          if(appState.game.cfg.tradeBonus){p.coins++;q.coins++;}
          appState.game.ev({t:"trade",a:p.idx,b:q.idx,gave:offerLabel+(askFor?` + ${askFor} coins`:""),got:want,kind:"counter"});
          await narrateLastEvent();
          liveRender();
          return true;
        }
      }
      // D-19 SIMPLIFIED (Wyatt-approved 2026-07-29): `ok` is dropped — a refusal is now the only
      // thing this event ever records, so the field was an invariant, i.e. no field.
      appState.game.ev({t:"parley",a:p.idx,b:q.idx,offer:offerLabel||"nothing",want});
      liveRender();
      // D-08/D-25: this refusal names two seats (q the decliner, p the offerer) — p reads the taunt
      // addressed ("ye"/"yer"); every other viewer sees p named.
      // @copy adhoc.trade.refusalbot
      await flash(humanFinishes?`${pn(q.idx)} refuses — "Not lettin' ${pn(p.idx)} finish their recipe that easy!"`:`${pn(q.idx)} declines ${pn(p.idx)}'s offer!`,undefined,undefined,[{seat:p.idx,html:humanFinishes?`${pn(q.idx)} refuses — "Not lettin' ye finish yer recipe that easy!"`:`${pn(q.idx)} declines yer offer!`}]);
      return true;
    }
  }
  // G6 (COIN-AUDIT.md site 3): the coin choices were filtered against the purse when the list was
  // BUILT (`coinChoices=[0..6].filter(...)`), and the settlement below debits give.coins after an
  // await. A pledge the captain can no longer cover routes into the EXISTING decline path — the
  // trade simply does not happen, told in the already-approved @copy adhoc.trade.refusalhuman
  // wording. No new string, and no half-completed trade where crates move but coins cannot.
  // CR-02 layer 2: the crate legs join the same decline gate the coin leg already used, so BOTH
  // legs are validated before EITHER mutates and the trade is atomic. Previously the settlement
  // below spliced on an unchecked indexOf: a `-1` removed the holder's LAST crate and then minted
  // the wanted one. Routes into the existing @copy adhoc.trade.refusalhuman wording — no new string.
  const crateGone=!q.ing.includes(want)||(give.ing&&!p.ing.includes(give.ing));
  if(!accept||coinShortfall(give.coins,p.coins)||crateGone){
    appState.game.ev({t:"parley",a:p.idx,b:q.idx,offer:offerLabel||"nothing",want});
    liveRender();
    // D-18/D-25 (Wyatt-approved 2026-07-29): merged with the bot-decline wording above — a human
    // clicking Decline and a bot computing a decline are the same moment, and the only thing that
    // should ever vary is who's reading, never who (or what) decided (D-18). Previously this branch
    // had its own bare "declines!" wording, addressed to the decliner rather than the offerer.
    // @copy adhoc.trade.refusalhuman
    await flash(`${pn(q.idx)} declines ${pn(p.idx)}'s offer!`,undefined,undefined,[{seat:p.idx,html:`${pn(q.idx)} declines yer offer!`}]);
    return true;
  }
  moveCrate(q.ing,p.ing,want);
  if(give.ing)moveCrate(p.ing,q.ing,give.ing);
  if(give.coins){p.coins-=give.coins;q.coins+=give.coins;}
  appState.game.trades++;
  if(appState.game.cfg.tradeBonus){p.coins++;q.coins++;}
  appState.game.ev({t:"trade",a:p.idx,b:q.idx,gave:offerLabel||"nothing",got:want,kind:"human"});
  await narrateLastEvent();
  liveRender();
  return true;
}
export async function humanAct(p,sailCtx){
  setActor(p.idx);
  const port=appState.game.adjPort(p);
  const canDock=port&&(appState.game.cfg.unlimitedDock||!(p.firstFlip.has(port)&&p.dockedNow.has(port)))
    &&!(appState.game.cfg.singleDock&&appState.game.dockOccupiedBy(port,p));
  const targets=appState.game.adjOpp(p);
  const canAfford=p.coins>=appState.game.cfg.powder;
  // D-41 EXTENDED (Wyatt-approved 2026-07-29): Parley/Trade is offered whenever any opponent is
  // alive, but the action itself only ever works against someone HOLDING cargo — compute real
  // availability once and drive both the button's `disabled` flag and the action guard (:602 below)
  // from it, following the same pattern already used for Attack.
  const tradeTargets=appState.game.tradeOpp(p).filter(q=>q.ing.length>0);
  const canTrade=!!tradeTargets.length;
  const opts=[];
  // F5 (Wyatt-approved 2026-07-29), his own example: *"In the 'Dock at Full Cream Folly' the icon
  // should go directly in front of the island name — 'Dock at 🥛 Full Cream Folly'"*. The icon used
  // to sit in front of the whole anchor-plus-verb clause. Nothing else about the label changed, and
  // the anchor stays where it is (it labels the ACTION, not the island). The dock FLIP prompt
  // (:above) was already correct and is deliberately untouched.
  if(canDock)opts.push({label:`⚓ Dock at ${iconImg(ING_IMG[port])} ${dockPlace(port)}`,value:"dock"});
  // #5b/#5d: shorter label, and the Attack button always shows when there's a target — greyed out
  // (disabled) rather than hidden when you can't afford powder.
  if(targets.length)
    opts.push({label:`⚔️ Attack${appState.game.cfg.powder?` <span class="nobrk">(−${appState.game.cfg.powder}🌕)</span>`:""}`,value:"attack",disabled:!canAfford});
  if(appState.game.tradeOpp(p).length)opts.push({label:"🤝 Trade",value:"trade",disabled:!canTrade});
  if(!appState.game.needs(p).length&&man(p.pos,appState.game.home)<=1)
    opts.unshift({label:`${iconImg(CUPCAKE_IMG)} Start yer bakery!`,value:"bakery"});
  // D-38-adjacent (Wyatt-approved 2026-07-29, during the two-tab playtest): the separator here is a
  // numeric RANGE, not a minus, so it correctly carries no sign — but it was an ASCII hyphen, which
  // renders narrower and lighter than the U+2212 "−" on the Attack button directly above it in this
  // same menu. An en dash (U+2013) is the correct character for a range, and it matches the weight.
  opts.push({label:'🎣 Fish <span class="nobrk">(+1–2🌕)</span>',value:"fish"});
  // offered only if this player's sail step ended in "Stay put" (nothing spent/moved) and they
  // could still afford to sail — covers the reported "hit Stay put by accident" complaint
  const canMoveInstead=sailCtx&&p.coins>0&&p.coins===sailCtx.preSailCoins&&
    p.pos[0]===sailCtx.preSailPos[0]&&p.pos[1]===sailCtx.preSailPos[1];
  if(canMoveInstead)opts.push({label:"← Actually, move instead",back:true,value:"moveInstead"});
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
  // scripts/ui_contract_check.js assertion 6 gates this shape, red-proofed against the ab98e04 code.
  let sub=null;
  if(targets.length&&!canAfford)sub=`Yer too poor to afford powder! Go fishin' 🎣`;
  if(appState.game.tradeOpp(p).length&&!canTrade)sub=[sub,`No one's holding cargo to trade for yet.`].filter(Boolean).join(" ");
  if(!sub&&targets.length)sub=`Attacking costs ye ${appState.game.cfg.powder}🌕 for powder. Firing downwind wins ties!`;
  // #5e: with an empty purse you can't pay the crew to sail — reframe the action prompt.
  const prompt=p.coins<=0?`${pn(p.idx)}, ye got nothin to pay yer crew, so they won't budge. Pick one:`:`${pn(p.idx)}, what'll ye do:`;
  // @copy prompt.act.menu
  const v=await ask(prompt,opts,null,sub);
  if(appState.turnExpired)return;
  // the clock keeps running (and re-arms fresh) through dock/attack/trade/fish now, instead of
  // stopping here — each ask() inside those sub-flows re-arms it for its own decision
  if(v==="moveInstead"){
    const dest=await pickCell(p,reachable(p));
    if(appState.turnExpired)return;
    // G6 (COIN-AUDIT.md site 7): reachable() was computed from the pre-await purse and
    // `await pickCell(...)` is the window. A shortfall falls through to the existing "no
    // destination" outcome — the ship simply does not move, which renders nothing, so nothing is
    // invented. appState.turnExpired above does NOT cover this: it is set at 30s, the coin
    // penalty fires at 20s and sets no flag at all.
    if(dest&&!coinShortfall(1,p.coins)){p.coins--;p.pos=dest;appState.game.ev({t:"sail",p:p.idx});liveRender();
      if(appState.game.tradewind(p)){await animateRimSweepIfAny();liveRender();await narrateLastEvent();}}
    await humanAct(p,sailCtx);return;
  }
  // @copy adhoc.act.bakerystart
  if(v==="bakery"){await flash("🧁 Firing up the ovens on the Isle of Tortuga!",1200);return;}
  if(v==="dock"){
    const r=await humanDock(p,port);
    if(r==="back"){await humanAct(p,sailCtx);return;}
  }
  else if(v==="attack"){
    // #5d: safety net — the button is disabled when you can't afford powder, but guard the action
    // too (e.g. a forced/edge selection) so we never enter a battle you can't pay for.
    // @copy adhoc.act.nopowder
    if(p.coins<appState.game.cfg.powder){await flash(`${pn(p.idx)} can't afford powder.`,1400,undefined,[{seat:p.idx,html:`Yer too poor to afford powder. Go fishin' 🎣`}]);await humanAct(p,sailCtx);return;}
    const t=targets.length===1?targets[0]:
      // @copy prompt.act.attacktarget
      await ask("Attack whom?",targets.map(o=>({label:pn(o.idx),value:o})).concat([{label:"← Back",back:true,value:null}]),
        targets.map(o=>HEXCOL[o.idx]));
    if(t===null){await humanAct(p,sailCtx);return;}
    await netHandlers().onAsyncBattle(p,t);
    await narrateLastEvent();
  }
  else if(v==="trade"){const done=await humanTrade(p);if(!done){await humanAct(p,sailCtx);}return;}
  else if(v==="fish"){
    // @copy misc.paramprompt.fishcast
    const r=await fishCast(p,"🎣 Cast yer line — flip!",true);
    if(r==="back"){await humanAct(p,sailCtx);return;}
    await narrateLastEvent();
  }
}
export async function humanTurn(p){
  await passGate(p.idx);
  setActor(p.idx);
  // a prior player's shot-clock expiry can leave this set from their forfeited turn — this
  // flag only ever gets cleared by armClock() deep inside a decision, which is too late to
  // save this turn's own early "did the previous turn just die?" guards below, so clear it
  // fresh the moment a new human turn actually begins
  appState.turnExpired=false;
  // pass & play: this seat's own "check my recipe" button is only ever offered while its
  // turn is genuinely live (see render()) — any reveal from a prior turn is already gone.
  appState.activeTurnSeat=p.idx;appState.recipeRevealed=false;
  appState.game.ev({t:"turn",p:p.idx});
  liveRender();
  // NARR-01/NARR-03/D-25 (Wyatt-approved 2026-07-29): the storm clause names only the leg happening
  // now (dir1/windNow) — the second leg's own direction is announced separately, at the moment it
  // actually happens, by humanWind. A non-storm turn drops the wind-direction repeat entirely — the
  // round header (EVENT_NARRATION.newround) already announced it moments ago at the top of the
  // round, so restating it here every single turn was exactly the redundancy this phase removes.
  const stormNow=appState.game.stormNow;
  const neutralBanner=stormNow
    ?`⛵ Ahoy, ${poss(p.idx)} turn! First the ⛈️ storm blows them 2 squares <b>${DIRNAME[appState.game.windNow]}</b>.`
    :`⛵ Ahoy, ${poss(p.idx)} turn!`;
  const addressedBanner=stormNow
    ?`⛵ Ahoy, ${pn(p.idx)} — yer turn!${stormIntroClause(appState.game.windNow)}`
    :`⛵ Ahoy, ${pn(p.idx)} — yer turn! The wind blows <b>${DIRNAME[appState.game.windNow]}</b> this round.`;
  // @copy adhoc.turn.banner
  await flash(neutralBanner,1500,undefined,[{seat:p.idx,html:addressedBanner}]);
  // the clock only starts once the player actually reaches a decision (wind response, sail
  // pick, action choice, ...) — not from the raw top of the turn, since the wind step itself
  // eats no time. Each ask()/pickCell() call re-arms it fresh via armClock().
  if(appState.turnExpired){appState.activeTurnSeat=null;appState.recipeRevealed=false;return;}
  // normal turns no longer get force-moved by the wind (see #7) — only a storm still shoves
  // ships around; otherwise the wind only shapes this player's own sail budget below
  if(appState.game.stormNow){
    await humanWind(p);
    appState.recipeRevealed=false; // a real decision (dodge/pay/flip) may just have resolved — re-lock
    if(appState.turnExpired){appState.activeTurnSeat=null;return;}
    // storms already narrate each leg's direction as they happen ("spins again — blows X"),
    // so there's no separate "wind carries you" summary to show here — it would always be
    // stale (mentioning only the first leg) by the time both legs have resolved
    if(p.shipwrecked){ // no coins, no crates, no move — repairs eat the rest of this turn
      p.shipwrecked=false;
      stopShotClock();
      appState.activeTurnSeat=null;
      if(appState.passAndPlay)liveRender();
      return;
    }
  }
  p.justDocked=false;
  if(!appState.game.adjPort(p))p.dockedNow.clear();
  const preSailPos=[...p.pos],preSailCoins=p.coins; // lets humanAct offer "move instead" if this seat just stayed put
  if(p.coins>0){
    // notes/edits #10: an island upwind steals your wind — warn before the move pick
    // @copy adhoc.turn.leeward
    if(appState.game.leeward(p))await flash(`🏝️ Land's blockin' ${pn(p.idx)}'s wind — can't sail as far. Movin' slow as cold molasses in this lee.`,1500,undefined,[{seat:p.idx,html:`🏝️ Land's blockin' yer wind, ${pn(p.idx)} — can't sail as far. Movin' slow as cold molasses in this lee.`}]);
    const dest=await pickCell(p,reachable(p));
    appState.recipeRevealed=false; // sail destination chosen — re-lock
    if(appState.turnExpired){appState.activeTurnSeat=null;return;}
    // G6 (COIN-AUDIT.md site 8): same shape as site 7 — the `p.coins>0` gate above sits before
    // `await pickCell(...)`, the debit after it. Falls through to the same "ship does not move"
    // outcome, which renders nothing.
    if(dest&&!coinShortfall(1,p.coins)){p.coins--;p.pos=dest;appState.game.ev({t:"sail",p:p.idx});liveRender();
      if(appState.game.tradewind(p)){await animateRimSweepIfAny();liveRender();await narrateLastEvent();}}
  // @copy adhoc.turn.brokesail
  }else await flash(brokeSailLine(p.idx,NEUTRAL_VIEWER),900,undefined,[{seat:p.idx,html:brokeSailLine(p.idx,p.idx)}]); // D-11: broke — the action prompt right after also reframes, but this is the sail-specific nudge
  if(appState.turnExpired){appState.activeTurnSeat=null;return;}
  if(!appState.game.adjPort(p))p.dockedNow.clear();
  await humanAct(p,{preSailPos,preSailCoins});
  appState.recipeRevealed=false; // the turn's dock/attack/trade/fish action just resolved — re-lock
  stopShotClock();
  appState.activeTurnSeat=null;
  // refresh now, not at the next turn's render — otherwise this seat's "check my recipe"
  // button sits frozen (blurred but visible) behind the next pass-the-device screen
  if(appState.passAndPlay)liveRender();
}
/* ================= bot hail (AI-01) ================= */
// D-04/D-06/D-07: pure, DOM/Firebase/RNG-free — take `g` as an explicit param, read no appState,
// touch no DOM, and never call g.r(), so a repeated evaluation inside one round is always safe.
const HAIL_BASE_PRICE=5,HAIL_RESERVE=1; // reserve is exactly what a bot needs to sail next turn (:579)
// D-06: prefer sellers holding 2+ (a genuine spare), then whoever it hurts least to give one up
// (humanTrade's own essential idiom, :370 — recipe.includes+cnt<=1, NOT needs(q).includes per
// <planner_corrections>), then proximity to the ingredient's island as a tiebreaker only — the
// crate pool is guaranteed empty whenever a hail fires (D-05's gate), so no target can actually
// restock; proximity never implies "can resupply easily". Seat index closes out a full tie.
export function rankHailTargets(g,p,ing){
  return g.players.filter(q=>q.strategy==="human"&&!q.done&&q.ing.includes(ing)).sort((a,b)=>{
    const spareA=g.cnt(a.ing,ing),spareB=g.cnt(b.ing,ing);
    if(spareB!==spareA)return spareB-spareA;
    const hurtsA=(a.recipe.includes(ing)&&spareA<=1)?1:0,hurtsB=(b.recipe.includes(ing)&&spareB<=1)?1:0;
    if(hurtsA!==hurtsB)return hurtsA-hurtsB;
    const distA=man(a.pos,g.islandOf[ing]),distB=man(b.pos,g.islandOf[ing]);
    if(distA!==distB)return distA-distB;
    return a.idx-b.idx;
  });
}
// D-07: scales on BOTH the bot's own desperation and what giving it up costs the seller, clamped
// by the bot's purse minus its reserve — the clamp is the bankruptcy guard and is not optional.
export function priceHailOffer(g,p,seller,ing){
  const desperation=g.needs(p).length<=1?2:(g.needs(p).length<=2?1:0);
  const sellerCost=g.cnt(seller.ing,ing)>=2?0:(seller.recipe.includes(ing)?2:1);
  return Math.max(0,Math.min(HAIL_BASE_PRICE+desperation+sellerCost,p.coins-HAIL_RESERVE));
}
// D-04: evaluated AFTER D-05's crate-supply gate has already passed — true only when the purse
// covers the base offer with the reserve intact AND the spend is genuinely worth it: the
// ingredient is among the bot's last two remaining needs, or the bot is stuck outright.
export function hailWorthIt(g,p,ing){
  return p.coins>=HAIL_BASE_PRICE+HAIL_RESERVE&&(g.needs(p).length<=2||g.boxedIn(p));
}
export async function botTurn(p){
  const g=appState.game;
  g.ev({t:"turn",p:p.idx});
  await botBeat();
  // wind no longer force-moves anyone on a normal turn (see #7) — only storms still shove
  // ships around; a normal turn's wind only shapes this player's own sail budget below
  if(g.stormNow){
    const wasDocked=g.adjPort(p)!==null;
    const dodgedOnce={v:false};
    await botWindLeg(p,g.windNow,2,dodgedOnce,wasDocked);
    // mirrors humanWind's own mid-storm direction flash (:281) at bot pace, naming the second leg
    // D-18/D-23/D-37: shared with humanWind's own second-leg line — one narration path, viewer
    // perspective only, same hold curve as a human's turn (D-23 parity).
    const secondLegMsg=secondLegLine(p.idx,g.windNow2,NEUTRAL_VIEWER);
    // @copy adhoc.turn.botsecondleg
    await flash(secondLegMsg,null,msgHoldMs(secondLegMsg),[{seat:p.idx,html:secondLegLine(p.idx,g.windNow2,p.idx)}]);
    await botWindLeg(p,g.windNow2,2,dodgedOnce,wasDocked);
    // botWindLeg already emits and narrates its own blownOut/windmove summary per leg — no
    // separate summary emit or botBeat() here, or every storm outcome double-narrates
    p.justDocked=false;
    if(p.shipwrecked){p.shipwrecked=false;return;} // no coins, no crates, no move — repairs eat the turn
  }
  if(!g.adjPort(p))p.dockedNow.clear();
  let target=g.chooseTarget(p);
  if(p.strategy==="pirate"&&g.needs(p).length){
    const prey=g.players.filter(q=>q!==p&&!q.done&&q.ing.some(i=>g.needs(p).includes(i)));
    if(prey.length){prey.sort((x,y)=>man(p.pos,x.pos)-man(p.pos,y.pos));
      if(man(p.pos,prey[0].pos)<man(p.pos,target))target=prey[0].pos;}
  }
  const dist=man(p.pos,target);
  const exact=g.dockCells.has(target[0]+","+target[1]);
  const wantsToSail=dist>1||(dist===1&&exact);
  if(wantsToSail&&p.coins>0){
    p.coins--;const b=[...p.pos];g.stepToward(p,target,g.sailBudget(p));
    // G18 (Wyatt-approved 2026-07-30): "A boxed-in bot SHOULD escape via the rim." The engine's
    // takeTurn (src/engine/index.js:738-742) has given a walled-in bot a rim escape since AI-05, but
    // THIS path — the one the live game actually runs — had only two arms, so bots froze in the game
    // people play and escaped only in headless runs. This mirrors the engine's ladder exactly,
    // including its order: moved -> rim escape -> refund. UI-TIER BY CONSTRUCTION: boxedIn() and
    // rimEscape() are existing ENGINE methods being CALLED, so src/engine/index.js keeps its empty
    // diff and none of the 31 determinism fixtures move.
    //
    // rimEscape() records TWO events — {t:"windmove"} at the rim cell, then tradewind()'s own
    // {t:"tradewind"}. botBeat() is liveRender() + narrateCurrent(), and liveRender() pins
    // appState.evIdx to the LAST event, so the line that plays is the trade-wind sweep line
    // (src/ui/util.js's EVENT_NARRATION.tradewind — "…is blown into the trade winds and swept
    // around the rim!"). That is the right one, and it is exactly what a watching player should
    // learn from. No new copy: that line already ships.
    //
    // COIN ACCOUNTING, deliberately the engine's: p.coins-- has already happened above, and a
    // SUCCESSFUL rim escape KEEPS the coin (a move was made). Only the both-failed arm refunds.
    //
    // .planning/quick/20260730-bot-intelligence/PLAN.md plans to FLAG this same parity gap as a todo
    // (.planning/todos/pending/bot-rim-escape-live-parity.md, not yet written). Wyatt has now ruled
    // it should be FIXED, so that task becomes "verify already fixed" rather than a duplicate.
    if(p.pos[0]!==b[0]||p.pos[1]!==b[1]){g.ev({t:"sail",p:p.idx});await botBeat();}
    else if(g.boxedIn(p)&&g.rimEscape(p)){await animateRimSweepIfAny();await botBeat();} // G14: watch the sweep, then narrate it. rimEscape recorded its own events
    else p.coins++;
  // @copy adhoc.turn.botbrokesail
  }else if(wantsToSail)await flash(brokeSailLine(p.idx,NEUTRAL_VIEWER),null,msgHoldMs(brokeSailLine(p.idx,NEUTRAL_VIEWER)),[{seat:p.idx,html:brokeSailLine(p.idx,p.idx)}]); // D-11/D-23: a broke bot states why it isn't moving, on the same hold curve a human gets
  if(!g.adjPort(p))p.dockedNow.clear();
  liveRender();
  // hail humans: locked-out bots offer coins for a crate they can't get any other way. D-02/D-24:
  // an offer reaching the table spends the bot's one action — accepted, countered, or refused, its
  // turn ends here, exactly like a human's Parley (humanAct :432, humanTrade :336/:485 precedent).
  // D-25: this stays UI-tier only — the action selector below is shared with the simulator's
  // takeTurn(), so a taken hail must return before reaching it rather than folding hailing in.
  let hailed=false;
  if(g.cfg.parley&&(appState.game.round-(p.lastOffer||-9))>=3){
    for(const ing of g.needs(p)){
      if(g.tokens[ing]>0)continue; // island still has crates — no need to beg (D-05, last-resort only)
      if(!hailWorthIt(g,p,ing))continue; // D-04: only spend the action when it's genuinely worth it
      const targets=rankHailTargets(g,p,ing);
      if(!targets.length)continue;
      const human=targets[0];
      const price=priceHailOffer(g,p,human,ing);
      // D-24: stamp lastOffer and spend the action THE MOMENT the offer reaches the table — before
      // the await, not after — so the cooldown and the action cost are committed whether the human
      // accepts, counters, or refuses (and a re-entrant pass within the cooldown is a no-op).
      p.lastOffer=appState.game.round;
      hailed=true;
      setActor(human.idx);
      // D-41 EXTENDED (Wyatt-approved 2026-07-29): Counter-offer dead-ends silently when the bot
      // can't afford to go any higher — compute `raises` BEFORE offering the choice and grey the
      // option out with a reason, same pattern as Attack/Trade.
      const raises=[price+1,price+2,price+3].filter(n=>n<=p.coins-HAIL_RESERVE);
      const canCounter=raises.length>0;
      // @copy prompt.hail.offer
      const choice=await ask(`📯 ${pn(p.idx)} hails ye: "Ahoy! Want ${price}🌕 for yer ${ilabelImg(ing)}?"`,
        [{label:`Sell for ${price}🌕`,value:"sell"},{label:"Counter-offer",value:"counter",disabled:!canCounter},{label:"Refuse",value:"refuse"}],
        null,canCounter?null:`${pn(p.idx)} can't afford to go any higher.`);
      if(appState.turnExpired)return; // shot-clock expired mid-hail — no partial trade, ever
      let finalPrice=price,dealt=choice==="sell";
      if(choice==="counter"){
        // @copy prompt.hail.counter
        const counterAmt=await ask(`Counter — how much for yer ${ilabelImg(ing)}?`,
          raises.map(n=>({label:`+${n}🌕`,value:n})).concat([{label:"Never mind",value:0}]));
        if(appState.turnExpired)return;
        if(counterAmt>0){finalPrice=counterAmt;dealt=true;} // the bot's only source is this trade, so it pays up if it can afford it
      }
      // D-19 SIMPLIFIED (Wyatt-approved 2026-07-29): emit `parley` only on a refusal — the accepted
      // branch already emits its own `trade` event two lines below, so emitting both here produced
      // two captain's-log lines for one swap. No `ok` field: it can now only ever be `false` (an
      // invariant field is no field), and EVENT_NARRATION.parley's builder has been simplified to
      // match. UI-tier only, does not touch src/engine/index.js — zero `parley` events across all
      // 31 determinism fixtures (Game.play()'s headless path never reaches this human-trade flow).
      if(!dealt)g.ev({t:"parley",a:p.idx,b:human.idx,offer:finalPrice+" coins",want:ing,kind:"hail"});
      // CR-02 (swept 2026-07-30): this path had the SAME bare `splice(indexOf(...))` as humanTrade.
      // 15-LEARNINGS #3 — when you fix a behaviour the next question is "where else is this same
      // idea written?", so the sweep found this one too rather than fixing only the reported site.
      // moveCrate returns false and mutates nothing if the crate is gone, so `dealt` collapses to a
      // refusal and the existing `parley` event above is what renders. No new copy.
      if(dealt&&moveCrate(human.ing,p.ing,ing)){
        p.coins-=finalPrice;human.coins+=finalPrice;g.trades++;
        if(g.cfg.tradeBonus){p.coins++;human.coins++;}
        g.ev({t:"trade",a:p.idx,b:human.idx,gave:finalPrice+" coins",got:ing,kind:"hail"});
      }
      await botBeat();
      break;
    }
  }
  // CR-01: the hail's own botBeat() already fired at the end of the loop above, and liveRender()
  // pins evIdx to events.length-1 (src/ui/panel.js:170). No event is appended between there and
  // here, so a second botBeat() re-narrates the identical line and re-fires spawnPops for the same
  // event — a visible double-flash on every resolved hail. Just end the turn: D-24's whole point is
  // that the hail WAS the action.
  if(hailed)return;
  const action=g.chooseAction(p);
  if(action.type==="attack"){
    if(!g.tryTrade(p))await netHandlers().onAsyncBattle(p,action.target);
    await botBeat();return;
  }
  if(action.type==="trade"){g.tryTrade(p);await botBeat();return;}
  if(action.type==="dock"&&g.doDock(p,action.ing)){await botBeat();return;}
  // fallback: fish regardless of purse size — see the matching comment on the sim's takeTurn()
  // @copy misc.paramprompt.botfishcast
  await fishCast(p);
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
export async function netIntroBarrier(msg,btnLabel){
  if(appState.replaying)return;
  netHandlers().onNetBroadcast(msg);
  const opts=[{label:btnLabel,value:0,cls:"primary ahoyGlow"}];
  const humans=appState.game.players.filter(p=>p.strategy==="human");
  if(appState.passAndPlay){
    // one device, several humans: nobody is "remote", so read-and-click-through happens in
    // turn, each gated by the same pass-the-device screen every turn hand-off uses
    for(const p of humans){await passGate(p.idx);await localAsk(msg,opts);}
    return;
  }
  // whoever clicks through first (or isn't last) sits on this instead of a blank panel while the
  // rest of the crew finishes reading — same idea as recipeDraftNet's "waiting for the crew" beat
  // @copy misc.draftwait.introwait
  const waitMsg=humans.length>1?"⚓ Waiting for yer mateys…":null;
  await Promise.all(humans.map(p=>seatLocal(p.idx)
    ?localAsk(msg,opts).then(i=>{if(waitMsg)showNarration(waitMsg);return i;})
    :netHandlers().onRemoteDraftPrompt(p.idx,msg,opts,waitMsg)));
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
  const msg=`⚓ Ahoy! Choose a recipe, gather each ingredient, then sail home first to win!`;
  // NARR-01/D-25 (Wyatt-approved 2026-07-29): button trimmed to just "Arrgh!" — icon kept (D-16).
  // @copy misc.introbarrier.ahoy
  await netIntroBarrier(msg,"⚓ Arrgh!");
}
// right after the Ahoy intro closes: announce who won the flip for first mover, and cheer up
// everyone sailing later by pointing out the coin they get in exchange for waiting. Stays up
// until every human player dismisses it (like showAhoyIntro) since it's easy to blink and miss
// a flashed message.
// NARR-01/D-25 (Wyatt-approved 2026-07-29): applied verbatim.
export async function showTurnOrderIntro(order){
  const lead=pn(order[0]);
  // G27 (Wyatt-approved 2026-07-30, spotted mid-playtest): the waiting captains' consolation is an
  // amount of MONEY, so it carries the coin like every other amount in the game — "(+1🌕)", not a bare
  // "(+1)". Emoji shorthand, not hand-rolled markup: emojify() swaps it for COIN_IMG at panel()'s
  // chokepoint (D-50), the same path every other 🌕 in this file takes. No sign change — D-38 already
  // has this one right, it is a gain and it was already signed.
  // P7 (Wyatt, 2026-08-01, second pass): "other numbers and coin combos do split, which they
  // shouldn't." The nobrk span covered only the parenthetical, so the amount stayed intact but
  // detached from the captain it belongs to — "…Davy Scones" / "(+2🌕), Dough Hook…" across a
  // line break. A name and its amount are ONE readable unit; the span wraps both.
  const rest=order.slice(1).map((i,k)=>`<span class="nobrk">${pn(i)} (+${k+1}🌕)</span>`).join(", ");
  const msg=`${iconImg(DICE_IMG)} The crew draws lots for sailing order — ${lead} first!<br><br>`+
    `No fretting, patience pays — ${rest} all cast off with extra dubloons.`;
  // @copy misc.introbarrier.turnorder
  await netIntroBarrier(msg,"🦜 Start");
}
export function coinHTML(state,bs,win){
  const b=bs?`<span class="bs">🔥</span>`:"";
  const w=win?" win":"";
  if(state==="H")return `<div class="coin heads${w}" style="background-image:url(${FLIP_HEADS_IMG})">${b}</div>`;
  if(state==="T")return `<div class="coin tails${w}" style="background-image:url(${FLIP_TAILS_IMG})">${b}</div>`;
  if(state==="spin")return `<div class="coin spin">🪙${b}</div>`;
  return `<div class="coin wait">?</div>`;
}
export function pipsHTML(n,col,total){
  total=total||3;
  let s="";
  for(let i=0;i<total;i++)s+=`<span class="pip${i<n?" on":""}"${i<n?` style="background:${col};border-color:${col}"`:""}></span>`;
  return `<div class="pips">${s}</div>`;
}
export function battleSnapshot(o){
  const snap={};
  for(const k of ["round","a","d","atState","dfState","atBs","dfBs","live","winCoin","result","waiting","need","title","roleA","roleD"])
    if(o[k]!==undefined)snap[k]=o[k];
  snap.attIdx=o.att.idx;snap.defIdx=o.def.idx;
  return snap;
}
export function renderBattleFromSnap(snap,extra){
  if(!appState.game||!appState.game.players[snap.attIdx]||!appState.game.players[snap.defIdx])return;
  netHandlers().onRenderBattle(Object.assign({att:appState.game.players[snap.attIdx],def:appState.game.players[snap.defIdx]},snap,extra||{}));
}
// the footer beneath the coins: a decision (buttons), a "waiting…" note, or the round result
export function battleFooter(o){
  if(o.prompt){
    const {msg,opts,colors}=o.prompt;
    return `<div class="btl-prompt">${msg?`<div class="msg">${msg}</div>`:""}<div class="btns">`+
      opts.map((op,i)=>`<button class="apBtn btlBtn" data-i="${i}"${apBtnStyle(colors&&colors[i])}>${op.label}</button>`).join("")+
      `</div></div>`;
  }
  if(o.waiting)return `<div class="btl-wait">⏳ Waiting for ${o.waiting}…</div>`;
  return `<div class="btl-result">${o.result||"&nbsp;"}</div>`;
}
// The Lookout's Call: every spectator MUST call a winner from the crow's nest —
// it's free, and a correct call earns a Spotter's Bounty (+1🌕) from the ship's
// bank. Players MAY back their call with their own coin for a bigger prize.
export async function collectSideBets(att,def){
  const bets=[],ns=pn;
  const spectators=appState.game.players.filter(p=>p!==att&&p!==def&&!p.done);
  for(const s of spectators){
    if(s.strategy==="human"){
      // The call itself is free and mandatory — no coin of your own at risk. The coin-backing
      // step is back-able: "← Back" there returns to re-pick the winner (see notes/edits 4b).
      let who,amt=0;
      for(;;){
        setActor(s.idx);
        // @copy prompt.sidebet.call
        who=await ask(`⚔️ A battle's brewing! Guess the winner (for free) and win 1🌕 — or back yer call for double-or-nothing.`,
          [{label:`Call ${ns(att.idx)}`,value:"a"},{label:`Call ${ns(def.idx)}`,value:"d"}],
          [HEXCOL[att.idx],HEXCOL[def.idx]]);
        amt=0;
        let amounts=[1,2,3,5].filter(n=>s.coins>=n);
        if(s.coins>5)amounts.push(s.coins); // all-in
        if(amounts.length){
          setActor(s.idx);
          // Optional: sweeten the call with real coin.
          // @copy prompt.sidebet.raise
          amt=await ask(`💰 Add to yer call on ${who==="a"?ns(att.idx):ns(def.idx)}? Win: 2x🌕 + 1. Lose: ye get nothing.`,
            [{label:"Just the free call",value:0}].concat(
              amounts.map(n=>({label:`Bet ${n}🌕`+(n===s.coins?" — all in!":""),value:n})))
              .concat([{label:"← Back",back:true,value:"back"}]));
          if(amt==="back")continue; // re-pick the winner
        }
        break;
      }
      bets.push({idx:s.idx,on:who,amt});
      // D-08: a side-bet call names two seats — the caller (s) AND the called captain (att/def) —
      // so both get their own addressed variant, not just the actor.
      const calledIdx=who==="a"?att.idx:def.idx;
      // D-54/D-25 (Wyatt-approved 2026-07-29): the called captain's variant ends "bets N🌕 on it!"
      // per adhoc:src/ui/flow.js:901 in 15-ADDRESSED2-APPROVED.json. The leading 💰 is re-attached
      // (D-16 — his note could not carry inline markup). The free-call sibling below already
      // matches its own approved row byte-for-byte and is deliberately untouched.
      // @copy adhoc.sidebet.backed
      if(amt)await flash(`💰 ${pn(s.idx)} calls ${pn(calledIdx)} and bets ${amt}🌕!`,1100,undefined,[{seat:s.idx,html:`💰 Ye call ${pn(calledIdx)} and bet ${amt}🌕!`},{seat:calledIdx,html:`💰 ${pn(s.idx)} calls ye to win and bets ${amt}🌕 on it!`}]);
      // @copy adhoc.sidebet.freecall
      else await flash(`🔭 ${pn(s.idx)} calls ${pn(calledIdx)} from the crow's nest.`,900,undefined,[{seat:s.idx,html:`🔭 ${pn(s.idx)} — ye call ${pn(calledIdx)} from the crow's nest.`},{seat:calledIdx,html:`🔭 ${pn(s.idx)} calls ye to win from the crow's nest.`}]);
    }else{
      // Bots always call (favoring the fuller purse), and sometimes back it with coin.
      const fav=att.coins>=def.coins?"a":"d";
      const on=appState.game.r()<.72?fav:(fav==="a"?"d":"a");
      const amt=(s.coins>=4&&appState.game.r()<.5)?Math.min(2,s.coins):0;
      bets.push({idx:s.idx,on,amt});
    }
  }
  return bets;
}
export async function settleSideBets(bets,winSide){
  if(!bets.length)return;
  const parts=[];
  for(const bet of bets){
    const p=appState.game.players[bet.idx],won=bet.on===winSide;
    // Correct call: Spotter's Bounty (+1) plus doubled stake. Wrong: only a
    // wagered stake sinks — a free call costs nothing.
    // G6 (COIN-AUDIT.md site 11 — the WIDEST window in the codebase): the stake is validated in
    // collectSideBets and not debited until here, after the entire battle resolves, dozens of
    // awaits later. A bettor who goes all-in at 3 and is penalised during their own side-bet
    // prompt (3 -> 2) would land at −1. Re-validated at the moment of the debit; a stake the purse
    // can no longer cover is treated as the FREE call, which settleSideBets already renders in
    // existing wording ("no bounty" below). Only the LOSING branch is re-validated — a win is a
    // credit, never a debit, and must not be clawed back.
    const amt=(won||!coinShortfall(bet.amt,p.coins))?bet.amt:0;
    const delta=won?1+2*amt:-amt;
    p.coins+=delta;
    // the event and the message both carry the SETTLED amount, so neither can disagree with the purse
    appState.game.ev({t:"sidebet",p:bet.idx,amt,won,on:bet.on,delta});
    if(delta>0)parts.push(`${pn(bet.idx)} +${delta}🌕`);
    else if(delta<0)parts.push(`${pn(bet.idx)} −${amt}🌕`);
    else parts.push(`${pn(bet.idx)} no bounty`);
  }
  liveRender();
  // D-25/D-26 (Wyatt-approved 2026-07-29, applied during the two-tab playtest): his rewrite drops
  // the possessive — "The Lookout settles", not "The Lookout's Call settles". 🔭 kept per D-16.
  // @copy adhoc.sidebet.settle
  await flash("🔭 The Lookout settles — "+parts.join(" · "),1600);
}
// The bakeoff gets the same scoreboard + flippenator treatment as a regular battle, just
// without attacker/defender roles, broadsides, or spoils — just two finalists racing to `need`.
export async function asyncBakeoff(A,B){
  const need=3;
  let a=0,d=0,round=0;
  const nm=pn;
  const bd=(typeof stepDelay==="function")?stepDelay():500;
  const spin=Math.max(260,Math.min(650,bd*0.7));
  const hold=Math.max(500,Math.min(1500,bd*1.1));
  const base=o=>Object.assign({att:A,def:B,a,d,round,need,title:"🧁 The Bakeoff!",roleA:"Finalist",roleD:"Finalist"},o);
  const flipSide=async(side,p)=>{
    const key=side==="a"?"atState":"dfState";
    if(p.strategy==="human"){
      await netHandlers().onBattleAsk(p,base({live:side,[key]:"wait"}),
        `🧁 ${nm(p.idx)} — flip!`,[{label:"🌕 FLIP!",value:1,flip:true}]);
    }else{
      netHandlers().onRenderBattle(base({live:side,[key]:"wait"}));
    }
    netHandlers().onBroadcastFlip("spin");
    await sleep(spin);
    const h=appState.game.flip(p);
    netHandlers().onBroadcastFlip(h?"H":"T");
    netHandlers().onNetBroadcast(`${pn(p.idx)} flips ${h?"⚪ HEADS!":"⚫ TAILS"}`);
    netHandlers().onRenderBattle(base({live:side,[key]:h?"H":"T"}));
    await sleep(Math.min(hold*0.5,500));
    netHandlers().onBroadcastFlip("wait");
    return h;
  };
  while(a<need&&d<need){
    round++;
    netHandlers().onRenderBattle(base({atState:"wait",dfState:"wait",live:"a",result:`🧁 Bakeoff — round ${round}!`}));
    await sleep(300);
    const ah=await flipSide("a",A);
    const dh=await flipSide("d",B);
    let scorer=null,rmsg;
    // NARR-01/D-25/D-52 (Wyatt-approved 2026-07-29): the two "{finalist} scores!" branches merge
    // into one template naming whoever actually scored — same D-52 pattern as asyncBattle's own
    // round-result merge above (a name-slot difference, not a real branch).
    // @copy misc.battleline.bakeoffbothheads
    if(ah&&dh){rmsg=`<span class="cancel">Both ⚪️ HEADS — no score this round.</span>`;}
    else if(ah||dh){
      scorer=ah?"a":"d";
      if(ah)a++;else d++;
      // @copy misc.battleline.bakeoffscores
      rmsg=`<span class="score">${ah?nm(A.idx):nm(B.idx)} scores!</span>`;
    }
    // @copy misc.battleline.bakeoffbothtails
    else{rmsg=`<span class="cancel">Both ⚫️ TAILS — no score this round.</span>`;}
    netHandlers().onRenderBattle(base({atState:ah?"H":"T",dfState:dh?"H":"T",live:null,winCoin:scorer,result:rmsg}));
    await sleep(hold);
  }
  panel("");
  const w=a>=need?A:B;
  appState.game.ev({t:"bakeoff",a:A.idx,b:B.idx,winner:w.idx});liveRender();
  return w;
}
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
  $("choiceHost").onclick=()=>{if($("choiceHost").classList.contains("disabled"))return;openNameModal(()=>{netHandlers().onCreateRoom();});};
  $("choiceJoin").onclick=()=>{if($("choiceJoin").classList.contains("disabled"))return;openNameModal(name=>{$("joinName").value=name;showStep("stepJoin");});};
  // D-03 decision (22-01-PLAN.md): #ppName0 stays visible on stepPassPlay, pre-filled and editable
  // — Pass & Play still has to name seats 1-3, so consistency (same modal, same position in the
  // flow) was chosen over saving a click.
  $("choicePassPlay").onclick=()=>{openNameModal(name=>{$("ppName0").value=name;showStep("stepPassPlay");});};
  $("btnNameConfirm").onclick=()=>{confirmName();};
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
  appState.roster=strategies.map((s,i)=>i===0?{name,id:"solo",bot:false}:{name:"",id:"",bot:true,strat:s});
  const seed=Math.floor(Math.random()*1e9);
  appState.soloMeta={name,strategies,seed};appState.dlog=[];saveSoloState();pingStart(1,"solo");
  netHandlers().onBeginGame(roundCfg(strategies),seed);
}
// Pass & Play: `names` holds one entry per human seat (2-4), in seat order; any remaining
// seats up to the standard 4-player table are filled with bots, same pool solo/host use.
export function startPassAndPlay(names){
  const strategies=names.map(()=>"human");
  for(let i=names.length;i<4;i++)strategies.push(seatStrat(i)); // BOT-02
  appState.numSeats=strategies.length;appState.room=null;appState.isHost=true;appState.mySeat=0;appState.passAndPlay=true;
  appState.roster=strategies.map((s,i)=>i<names.length?{name:names[i],id:"solo",bot:false}:{name:"",id:"",bot:true,strat:s});
  const seed=Math.floor(Math.random()*1e9);
  appState.soloMeta={names,strategies,seed,passAndPlay:true};appState.dlog=[];saveSoloState();pingStart(names.length,"pass");
  netHandlers().onBeginGame(roundCfg(strategies),seed);
}
// pass & play: reveal the active turn-holder's own recipe on demand — see render()'s
// canReveal/offerCheckBtn logic and the recipeRevealed re-lock points inside humanTurn.
export function revealMyRecipe(){appState.recipeRevealed=true;liveRender();}

/* ================= recovery/replay seam trio + remotePickHighlights ================= */
// This section resolves the final 3 of the milestone's 6 UI->orchestration edges (RESEARCH.md
// Q1b) through src/ui/handlers.js's injected-handler seam — 11-04 resolved the first 2
// (flash->onBroadcast, liveRender->onEvents). Each function below replaces a direct call to a
// still-classic net-adjacent function (sendResponse/setRecoveryState/leaveGame) with a call
// through netHandlers(), so this module never needs its own import of src/net/ (D-07).
// src/main.js's composition root wires onRespond/onRecovery/onLeave alongside the existing
// onBroadcast/onEvents, still pointing at the classic globals via the PP bridge this wave —
// formalized to real src/net/ imports in 11-06.

// draw the same highlighted cells on a REMOTE player's board and post their choice back.
// D-35 (Wyatt-approved 2026-07-29): `msg` is what the host composed (sailPickMsg, via pickCell's
// onRemotePrompt payload) — rendered here, never re-authored. Falls back to sailPickMsg(mySeat) for
// an older host payload with no `msg` field, so a mid-game version skew still reads sensibly.
export function remotePickHighlights(cells,promptId,msg){
  const svg=$("board"),hs=[];
  const done=v=>{hs.forEach(h=>h.remove());panel("");netHandlers().onRespond?.(promptId,v);};
  const cellPx=boardCell(); // notes/edits 11-03: cell now lives in src/ui/board.js
  // D-55/D-56 CLOSED by G25 (Wyatt-approved 2026-07-30). This loop used to build its own rect —
  // rx:5, fill:#fdb63d, opacity:.4, no class — so a guest's squares were a different orange,
  // dimmer, unanimated and unhoverable. It now calls sailHighlightRect(), the SAME builder the
  // host's localPickCell() calls, so the two cannot drift again by construction. The click handler
  // and hs.push stay here, where they differ legitimately (this path responds over the wire).
  for(const c of cells){
    const r=sailHighlightRect(c,cellPx,svg);
    r.addEventListener("click",()=>done(c));
    hs.push(r);
  }
  // @copy prompt.sail.remotepickpanel
  panel(`<div class="apMsg">${msg||sailPickMsg(appState.mySeat)}</div>
    <div class="apBtns"><button class="apBtn" id="apStay">Stay put</button></div>`,true);
  $("apStay").onclick=()=>done(null);
}
// leave replay mode: the recorded log is exhausted (or the game replayed to its end). Reconcile
// the broadcast frontier so we push only events the crew hasn't already seen, then render live.
export function endReplay(){
  if(!appState.replaying)return;
  appState.replaying=false;
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
  appState.evPushed=appState.resumeEvLen;   // events 0..resumeEvLen-1 are already in Firebase; push only what's new
  liveRender();           // flush any freshly-rebuilt events + paint the current board
}

// notes/edits BUG-03/D-07: the replay didn't rebuild the voyage. Explain which way it failed and
// offer the two honest choices — carry on from a knowingly-incomplete state, or scuttle it and
// start fresh. "Resume anyway" deliberately advances evPushed to the REBUILT length, not to
// resumeEvLen: the frontier must reflect what actually exists locally, or pushEvents() goes right
// back to suppressing everything the replay missed (the BUG-04 freeze).
export function showRestoreFail(sf){
  const why=$("restoreFailWhy");
  if(why)why.textContent = sf.reason==="read-failed"
    ? "We couldn't reach the crew's log for this voyage, so we can't tell how much of it is missing. Carrying on may put ye out of step with the rest of the crew."
    : `We rebuilt this voyage but came up ${sf.shortfall} event${sf.shortfall===1?"":"s"} short. Carrying on may put ye out of step with the rest of the crew.`;
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
