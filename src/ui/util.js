// src/ui/util.js
//
// Phase 11 (SPLIT-03/06), waves 11-02. The pure leaf helper cluster: formatting/name/geometry/
// awards/narration-string/session/shot-clock helpers that touch neither the DOM nor `src/net/`
// (tier `helper/logic`, dom:false, net:[] in 11-analysis.json). Extending src/ui/recipe.js's
// established pattern (11-01): move verbatim, replace bare shared/engine/state reads with
// explicit imports, keep bare-identifier calls to still-classic functions (they resolved through
// the bridge's global-object spread until Phase 11 (11-07) deleted it).
//
// Purity bar for src/ui/: reads DOM and game state, NEVER imports src/net/ (D-07).
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
//
// Deviation (mirrors 11-01's RECIPE_BOOK/$ finding): a handful of these functions read `cell`
// (the board's current px-per-grid-cell) or `shipEls` (the array of ship <g> elements) — both
// classic-script top-level `let`s declared at index.html's board-rendering section (not part of
// Phase 10's appState migration; they are render-only state owned by the still-classic
// drawBoard()/render()). A classic script's `let` is invisible to an ES module (same class of
// bug 11-01 hit with RECIPE_BOOK), and neither variable is exclusive to this cluster — dozens of
// still-classic rendering call sites also read them — so, unlike RECIPE_BOOK, they cannot simply
// move here too. Fix: `islandArtPlacement`, `shipXY`, `islandXY`, `spawnPops` gained an explicit
// `cellPx` parameter (default-free — every call site is still-classic and has `cell` in scope, so
// each is updated in index.html to pass it explicitly) and `boatXY` gained a `shipEls` parameter
// the same way. The EVENT_NARRATION `battle`/`aground` entries (and, before the shot clock's
// 2026-08-28 removal, `shotclockskip`) gained an optional
// `cellPx=0` third parameter for the same reason; describe()/captions() (which only ever read
// `.txt`/`.cls`/`.caps`, never `.pops`) call with the 2-arg form and let the harmless default
// apply, while spawnPops() (the only real consumer of `.pops`) passes its own `cellPx` through.
// See 11-02-SUMMARY.md for the full account.
//
// Deviation (Rule 1 — bug): `saveSoloState()` read a bare `soloMeta` identifier instead of
// `appState.soloMeta` — a leftover from the Phase 10 appState migration that this migration's own
// tooling missed. Caught (and silently swallowed) by the surrounding try/catch, so `pp_solo`
// localStorage has never actually persisted; fixed while moving (Rule 1).
//
// Deviation (Rule 3 — blocking): `replayShortfall`/`REPLAY_SHORTFALL_TOLERANCE` used to live inside
// a sentinel-comment region in index.html that scripts/dlog_replay_test.js sliced out via  [UNGATED-IN-4: dlog_replay_test.js reads the root tree, not this one]
// `node:vm` at test time (see that script's original header). Moving them here retires that
// slicing hack entirely — dlog_replay_test.js now does a native `import` of this module instead;  [UNGATED-IN-4: dlog_replay_test.js reads the root tree, not this one]
// see its updated header comment for the full account.

import {
  appState,
} from "../state/index.js";
import { normalizeSeat, deriveActiveSeat, isDecisionLocal } from "../shared/storyboard.js";
import { roundCfg } from "../engine/index.js";
import {
  // F5 (2026-07-29): dockFlavor -> dockFlavorIcon. EVENT_NARRATION.dock was this file's only
  // dockFlavor consumer; all four branches now take the icon-placed form from the declared split.
  NAMES, HEXCOL, DIRNAME, STORM_PUSH, ING_EMOJI, iname, ilabelImg, dockPlace, dockFlavorIcon, iconImg, ING_IMG,
  CUPCAKE_IMG, FLAME_IMG, CROWN_IMG, HORN_IMG, WAVE_IMG, TRADE_SWIRL_IMG, CRATE_OVERBOARD_IMG, TET, ISLAND_SHAPE_IMG, emojify,
  ASSET_BASE, BOARD_IMG, DOCK_IMG, WIND_ARROW_IMG, BOAT_IMG, ING_ALL, COIN_IMG, EYES_IMG,
  // the flip's own five, for preloadAssets — see its note on why a timed ceremony cannot wait
  FLIP_SOCKET_IMG, COIN_SPIN_IMG, FLIP_HEADS_IMG, FLIP_TAILS_IMG,
  // T-33: the greyed-crate art, warmed alongside ING_IMG rather than fetched cold mid-voyage
  ING_HOLE_IMG,
  SEA_CREATURES, buildRoster, subjectOf,
} from "../shared/index.js";
/* THE WHOLE MODULE, as well as the names above — this is what makes preloadAssets() DERIVED rather
   than a list somebody maintains. See its note: every hand-kept version of that list has drifted. */
import * as SHARED from "../shared/index.js";
import { escHtml, RECIPE_BOOK } from "./recipe.js";
// 11-07 (bridge deletion fix): util.js is a common dependency of src/ui/board.js, panel.js,
// lobby.js, and flow.js — it can never import any of THEM back without closing an import cycle
// module_graph_check.js's "no import cycle" assertion forbids. A handful of functions here
// (ask/botBeat/narrateCurrent/
// spawnPops/updateRecipeBanner/resumeSoloGame) genuinely need to CALL a rendering function that
// lives in one of those sibling modules (liveRender/flash/setClockUI/narrateLastEvent from
// panel.js; popEmoji/render from board.js), or a net-adjacent orchestration function that lives
// in src/orchestrator.js (main tier, which src/ui/ can never import either). Both cases route
// through the SAME injected-handler seam src/ui/handlers.js already provides for the 5 original
// net edges — see that file's own header for the full account. `buildPlayerRows` itself is
// relocated INTO this file from src/ui/lobby.js this same wave, for the opposite reason: it has
// zero net/sibling-rendering dependencies of its own, and src/ui/board.js (which calls it) already
// imports this file directly, so a plain import is strictly simpler than a seam entry here.
import { netHandlers } from "./handlers.js";
/* EVERY WORD THE GAME SAYS lives in src/shared/words.js — say()/sayAll() below are the one door to it. */
import { WORDS, fill, seat } from "../shared/words.js";

/* ---------- board geometry ---------- */

// Captain rows in the sidebar. `roster` holds the seat claims (name/bot/strat) from Firebase.
// captains panel lists seats in sailing order (turnOrder), rotated so this browser's own seat
// (the human, from its own point of view) always sits at the top — falls back to raw seat index
// before turnOrder is known yet (briefly, at the very start of a game)
export function seatDisplayOrder(){ return seatOrderFrom(appState.mySeat); }
// The rotation itself: sailing order (turnOrder), turned so `head` sits first and everyone else
// follows in the order they will actually sail. Falls back to raw seat index before turnOrder is
// known yet (briefly, at the very start of a game), and to plain sailing order if `head` is not a
// seat in it.
export function seatOrderFrom(head){
  const n=appState.game.players.length;
  /* 02.15-01 Stage 3, MEASURED IN A TWO-TAB SESSION 2026-08-20 BEFORE IT WAS TOUCHED. The fallback
     used to return raw seat index and DROP `head` on the floor, so at the Ahoy beat — screenshotted
     on both tiers — the guest read "Wyatt, Mate, Dough Hook, Flaky Jack" with its own captain
     second. Wyatt's rule is "the active player, whether host or guest, should always see their
     captain's name on top" (2026-08-20), and it was broken for the opening of every game.
     NOT A HOST/GUEST DIVERGENCE, and the shots prove it: the HOST fell back identically, because
     runLiveNet does not shuffle turn order until AFTER showAhoyIntro returns, so turn order truly
     does not exist yet on either tier. The plan's suggested remedy — route turnOrder through the
     dispatch — could not have fixed this: no delivery mechanism can deliver a value nobody has
     computed. The site is the fallback, and the reproduction names it (CLAUDE.md rule 6).
     The rotation is the same one rule, applied to whatever ordering is available. */
  const ord=appState.game.turnOrder;   // the engine's record — see consumeEvent's turnOrder note
  if(!ord||ord.length!==n){
    const raw=appState.game.players.map((_,i)=>i);
    const r=raw.indexOf(head);
    return r<0?raw:raw.slice(r).concat(raw.slice(0,r));
  }
  const at=ord.indexOf(head);
  if(at<0)return ord.slice();
  return ord.slice(at).concat(ord.slice(0,at));
}
// PASS & PLAY (Wyatt, 2026-08-09): "resort the captains box with the currently active player at the
// top during their turn, and the rest of the players sorted according to turn order... currently
// they have to scroll down too far" — at a full table the reader was scrolling past three rivals to
// reach their own recipe, on the one mode where the reader CHANGES every turn.
//
// Only Pass & Play reorders. In solo and net play the reader's own seat is a fixed anchor that
// seatDisplayOrder already parks at the top; a box that resorted under them every turn would cost
// them the one row they look at most, which is the opposite of the fix.
//
// Done by setting flex `order` rather than moving nodes: every prow*/pname*/coins*/chips*/
// prowRecipe* id keeps the same element, so no in-flight name marquee, highlight transition or
// pending paint is restarted by a reorder. Requires #players to be a flex column (index.html).
//
// A null `active` (between rounds, or after the last captain finishes) deliberately does NOTHING:
// the box holds its current order until the next turn rather than snapping back for one frame.
export function applyCaptainOrder(active){
  if(!appState.passAndPlay||active==null||!appState.game)return;
  const order=seatOrderFrom(active);
  for(let k=0;k<order.length;k++){
    const row=document.getElementById("prow"+order[k]);
    if(row)row.style.order=k;
  }
}
// 11-07 (bridge deletion fix): relocated here verbatim from src/ui/lobby.js. lobby.js already
// imports src/ui/board.js's syncBoardSizing(), so board.js importing buildPlayerRows() BACK from
// lobby.js (its only other caller besides this module's own orchestrator-driven call sites) would
// close an import cycle module_graph_check.js's "no import cycle" assertion forbids. This function
// has no dependency of its own on anything lobby-specific — it only needs seatDisplayOrder/pname
// (both already local to this file) plus escHtml/HEXCOL/COIN_IMG/iconImg (already imported here) —
// so moving it into src/ui/util.js (which src/ui/board.js already imports directly) resolves the
// bare read with a plain import, no seam needed.
export function buildPlayerRows(){
  const $=id=>document.getElementById(id); // this file's first DOM read — see the header note above
  let html="";
  const order=seatDisplayOrder();
  for(const i of order){
    const s=(appState.roster&&appState.roster[i])||{};
    // D-29 RESOLVED (Wyatt-approved 2026-07-29): every player-facing string in this file speaks the
    // pirate register — the 2nd-person pronouns become ye/yer/yers/yerself. Applied as a one-time source
    // transformation using art-review/narration-core.js's own PIRATE_RE/PIRATE_MAP as the spec — the one
    // declaration site in the repo, imported by the audit page, the health gate and ui_contract_check.js  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
    // alike (the
    // page ran it LIVE at render, so a card tagged `keep` displayed the converted text — under D-25 that
    // converted text is what he approved). No runtime helper is shipped for it: a pirateVoice() nothing
    // calls would be dead code, which D-33/D-34/D-40 exist to prevent. Comments and identifiers are out
    // of scope. scripts/ui_contract_check.js now gates this permanently.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
    // F1 (Wyatt-approved 2026-07-29): the LABEL class — this tooltip points AT a row to say "this
    // one is the reader", so it is UI chrome rather than the game speaking, and takes plain "you".
    // See src/ui/lobby.js's renderSeatList for the full rule; ui_contract_check.js gates it.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
    const who=s.id ? (i===appState.mySeat?say("captains.youTip",{name:escHtml(s.name)}):escHtml(s.name))
                   : say("captains.botTip",{strategy:s.strat||appState.game.cfg.strategies[i]});
    const displayName=pname(i);
    html+=`<div class="player-row" id="prow${i}" style="background:${HEXCOL[i]}18;--rowcol:${HEXCOL[i]}" title="${who}">
      <div class="prowTop">
        <span class="pname" id="pname${i}" style="color:${HEXCOL[i]}"><span class="pnameInner">${displayName}</span></span>
        <span class="coinsWrap"><span class="coins" id="coins${i}">${iconImg(COIN_IMG)} –</span><span class="crown" id="crown${i}"></span></span>
        <span class="chips" id="chips${i}"></span>
        <span class="prowRecipe" id="prowRecipe${i}"></span>
      </div></div>`;
  }
  $("players").innerHTML=html;
  refreshNameMarquees();
}
// D-31: the name-overflow check used to live inline in buildPlayerRows(), which only runs when
// the TURN ORDER changes (orchestrator.js) — never when the CAPTAINS COLUMN's own width changes,
// which the desktop layout now does live (stage.js computeStageGeometry(), every resize and every
// ~900ms while the stage is up). A name that fit the old fixed 106px/36% column and no longer fits
// a narrower derived one stayed marquee:false forever — statically clipped, never scrolling, with
// no error and no visual cue that anything was hidden. Exported so computeStageGeometry() can
// re-run this exact check after it changes the column's width, without rebuilding the whole
// captains list (which the comment below warns against — it would cancel any in-flight marquee).
// names have a fixed column width to keep coins/hold aligned across every row — a name that
// overflows it scrolls instead of blowing out the layout or truncating unreadably
/* ⭐ EVERY HOLD ON ONE LINE — Wyatt, 2026-09-11, on check 9: "I want them to scroll within the same
   line, not go onto two lines -- ideally by bunching on top of each other, with less buffer room --
   they can overlap a little bit, even up to 50%." Shown as a page with sliders; his settings, read
   back off it: most overlap 35%, gap 3px. The rule, in his page's words: if the crates fit, nothing
   changes; if they don't, they slide together evenly, the newest on top with a soft edge; never past
   his limit; past it, the line scrolls sideways with a fade at the edge. A row is therefore always
   one crate tall, so the box's height is set by the number of captains alone.
   MEASURED at fit time, never assumed: the room is the hold's own width after the name and coin
   columns have taken theirs, and the crate's size is its drawn size (22px on a phone, 26 elsewhere). */
/* ⭐ THE GAP IS THE ROW'S OWN TOP/BOTTOM PADDING, AND IT IS READ OFF THE PAGE — Wyatt, 2026-09-13, from his
   crate tuner: "Adjust the between-crate padding to match the row padding top/bottom for both modes." (It was 20%
   of a crate's width, his 2026-09-12 number, superseded.) The number lives ONCE, in index.html's --capRowPad, which
   sets both the row's padding and the hold's CSS `gap`; this function reads that same gap back from the laid-out
   hold, so the laid-out spacing and the squeezed spacing cannot disagree — and it holds no second copy to go stale. */
export const HOLD_MAX_OVERLAP=0.35;
export function fitHold(el){
  if(!el)return;
  const chips=[...el.children].filter(c=>c.classList&&c.classList.contains("chip"));
  el.classList.remove("holdScroll");
  chips.forEach(c=>{c.style.marginLeft="";c.classList.remove("ov");});
  if(chips.length<2)return;
  const cs=chips[0].offsetWidth, room=el.clientWidth, n=chips.length;
  if(!(cs>0&&room>0))return;                              // not laid out yet — the next fit catches it
  const gap=parseFloat(getComputedStyle(el).columnGap)||0; // the hold's own CSS gap — his row padding
  if(n*cs+(n-1)*gap<=room)return;                         // they fit: the CSS gap is the whole answer
  const floor=cs*(1-HOLD_MAX_OVERLAP);
  let step=(room-cs)/(n-1), scroll=false;
  if(step<floor){step=floor;scroll=true;}
  // the container's own gap still applies between crates, so the margin takes it back out
  const ml=(step-cs-gap).toFixed(2)+"px";
  chips.forEach((c,i)=>{ if(i){ c.style.marginLeft=ml; if(step<cs)c.classList.add("ov"); } });
  el.classList.toggle("holdScroll",scroll);
}
export function fitHolds(){ document.querySelectorAll("#players .chips").forEach(fitHold); }
/* ⛔ THE RECIPE'S NAME SHRINKS TO FIT, AND IT IS MEASURED — NEVER `scrollWidth > clientWidth`.
   Both of those are rounded to whole pixels, and on a page the browser is scaling (any zoom that is
   not 100%, and every artifact preview) they round INDEPENDENTLY: scrollWidth can read a pixel wider
   than clientWidth for text that genuinely fits, and a shrink loop then walks all the way to its
   floor. Wyatt caught exactly that on 2026-09-12 — a 21-character name at the floor with half the
   card empty. So: a hidden copy of the name INSIDE the same element (same font, same scaling), both
   widths read with getBoundingClientRect() — fractional, no rounding — and one division.
   Longest name in the game is "Chocolate Genoise Sponge Cake"; the floor is 68% of the CSS size. */
export function fitRecipeName(){
  const el=document.querySelector("#capRecipeBand .capRecipeName");
  if(!el)return;
  el.style.fontSize="";                                    // back to the size the CSS asks for
  const base=parseFloat(getComputedStyle(el).fontSize)||13.5;
  const avail=el.getBoundingClientRect().width;
  if(!(avail>0))return;                                    // not laid out yet — the next fit catches it
  const probe=document.createElement("span");
  probe.textContent=el.textContent;
  probe.style.cssText="position:absolute;left:0;top:0;white-space:nowrap;visibility:hidden;pointer-events:none";
  el.appendChild(probe);
  const natural=probe.getBoundingClientRect().width;
  probe.remove();
  if(!(natural>avail))return;                              // it already fits at full size
  el.style.fontSize=Math.max(Math.max(9,Math.round(base*0.68)), Math.floor(base*(avail/natural)))+"px";
}
export function refreshNameMarquees(){
  const $=id=>document.getElementById(id);
  /* ⭐ ONE COLUMN FOR EVERY NAME — his Q8 ruling, 2026-09-10: the name sits in a FIXED column so
     every coin starts at the same x. The column is the widest name at the table plus the 6px gap
     the desktop rule pads with, capped at 36% of the list so the crates keep their room; a name
     wider than that scrolls. Measured before: coins ragged by 49px (phone) and 63px (desktop).
     (Widths are read from each name's inline-block, which a running marquee's transform does not
     change, so re-running this mid-scroll measures the same thing.)
     ⚠ AND THE MARQUEE NOW RUNS ON DESKTOP TOO — his follow-up the same day, "A long captain name
     SCROLLS on desktop too". This used to return early above 600px because the desktop column GREW
     to fit, and a 2px rounding overhang had tripped the scroll and taken the first letter off
     ("ough Hook", his report of 2026-08-21). A fixed column is exactly what makes an 18-character
     name overflow on desktop, so the early return had to go — and the overhang is answered by a
     THRESHOLD instead: a name must overflow by more than MARQUEE_MIN px to scroll. The widest name
     always has its own 6px of slack in the column, so rounding can never reach it. */
  const MARQUEE_MIN=3;
  const list=$("players");
  let widest=0;
  for(const i of seatDisplayOrder()){
    const inner=$("pname"+i)&&$("pname"+i).firstElementChild;
    if(inner)widest=Math.max(widest,Math.ceil(inner.getBoundingClientRect().width));
  }
  if(list){
    // the column holds the widest name, the gap the desktop rule pads it with, and 2px of slack
    const w0=$("pname"+seatDisplayOrder()[0]);
    const padR=w0?(parseFloat(getComputedStyle(w0).paddingRight)||0):0;
    const cap=Math.floor(list.clientWidth*0.36);
    const col=widest&&cap>40?Math.min(widest+padR+2,cap):0;
    if(col)list.style.setProperty("--nameCol",col+"px"); else list.style.removeProperty("--nameCol");
  }
  for(const i of seatDisplayOrder()){
    const wrap=$("pname"+i),inner=wrap&&wrap.firstElementChild;
    if(!wrap||!inner)continue;
    const pad=parseFloat(getComputedStyle(wrap).paddingRight)||0;
    const overflow=inner.scrollWidth-(wrap.clientWidth-pad);
    if(overflow>MARQUEE_MIN){wrap.classList.add("marquee");wrap.style.setProperty("--scrollDist",(overflow+2)+"px");}
    // a column that GREW (side-by-side vs stacked, or a live resize) can un-clip a name that used
    // to need the scroll — drop the class and stop animating something with nothing left to reveal.
    else if(wrap.classList.contains("marquee")){wrap.classList.remove("marquee");wrap.style.removeProperty("--scrollDist");}
  }
  /* the name column just moved, so every hold's room moved with it — re-fit them (his one-line holds) */
  fitHolds();
  fitRecipeName();   // the name column just moved, so the room for the recipe's name did too
}
// dock.png is authored facing right (+x, East) in a slightly perspective/isometric style —
// rotating it 180° to face West flips it upside down and puts the anchor on the wrong side,
// so West is a horizontal mirror instead (stays right-side-up, just points the other way);
// North/South still rotate a quarter turn, which doesn't have that problem.
export function dockOrient(dir){
  if(dir[0]>0)return{rot:0,flip:false};
  if(dir[0]<0)return{rot:0,flip:true};
  return{rot:dir[1]>0?90:-90,flip:false};
}
// maps a canonical (unrotated) island shape image onto the actual rotated/mirrored cells a
// given island was placed with (see shapeFor() in the Game constructor, and TET/ISLAND_SHAPE_IMG
// above) — returns the <image> transform + size needed so shape art lands exactly on the cells.
export function islandArtPlacement(meta,cellsR,cellPx){
  const{shapeIdx,rot,flip}=meta;
  if(shapeIdx<0)return null; // rectangle-mode island (not used by the live game); no art mapping
  const canon=TET[shapeIdx];
  const canonW=Math.max(...canon.map(c=>c[0]))+1, canonH=Math.max(...canon.map(c=>c[1]))+1;
  let s=canon.map(c=>[...c]);
  for(let t=0;t<rot;t++)s=s.map(([x,y])=>[y,-x]);
  if(flip)s=s.map(([x,y])=>[-x,y]);
  const mx=Math.min(...s.map(c=>c[0])),my=Math.min(...s.map(c=>c[1]));
  const anchorX=Math.min(...cellsR.map(c=>c[0])),anchorY=Math.min(...cellsR.map(c=>c[1]));
  const tx=(anchorX-mx)*cellPx, ty=(anchorY-my)*cellPx;
  // shapeFor() rotates/mirrors CELL INDICES (not raw pixel coordinates) — index (x,y) is a unit
  // cell's own corner label, so rotating indices by (x,y)=>(y,-x) actually pivots the geometry
  // about the CENTER of the reference cell (0.5,0.5), and mirroring pivots about x=0.5, not the
  // origin. The image transform below has to rotate/mirror about those same pivots (scaled to
  // pixels) or the art lands exactly one cell off from the true clipped outline.
  const pivot=cellPx/2;
  const transform=`translate(${tx},${ty})${flip?` translate(${cellPx},0) scale(-1,1)`:""} rotate(${-90*rot},${pivot},${pivot})`;
  return{transform,w:canonW*cellPx,h:canonH*cellPx,href:ISLAND_SHAPE_IMG[shapeIdx]};
}
// trace the outer boundary loop(s) of a polyomino (array of [x,y] grid cells) in grid units
export function tracePolygonLoops(cells){
  const setK=new Set(cells.map(c=>c[0]+","+c[1]));
  const edgeMap=new Map();
  for(const [x,y] of cells){
    const sides=[[[x,y],[x+1,y],0,-1],[[x+1,y],[x+1,y+1],1,0],
      [[x+1,y+1],[x,y+1],0,1],[[x,y+1],[x,y],-1,0]];
    for(const [p1,p2,nx,ny] of sides)
      if(!setK.has((x+nx)+","+(y+ny)))edgeMap.set(p1[0]+","+p1[1],p2);
  }
  const visited=new Set(),loops=[];
  for(const startKey of edgeMap.keys()){
    if(visited.has(startKey))continue;
    const loop=[];let curKey=startKey;
    while(!visited.has(curKey)){
      visited.add(curKey);
      const [cx,cy]=curKey.split(",").map(Number);
      loop.push([cx,cy]);
      const next=edgeMap.get(curKey);
      curKey=next[0]+","+next[1];
    }
    loops.push(loop);
  }
  return loops;
}
// build an SVG path with rounded corners from a loop of [x,y] points already in pixel space
export function roundedPathFromLoop(loop,r){
  const n=loop.length;let d="";
  for(let i=0;i<n;i++){
    const prev=loop[(i-1+n)%n],cur=loop[i],next=loop[(i+1)%n];
    const v1=[prev[0]-cur[0],prev[1]-cur[1]],v2=[next[0]-cur[0],next[1]-cur[1]];
    const len1=Math.hypot(v1[0],v1[1]),len2=Math.hypot(v2[0],v2[1]);
    const rr=Math.min(r,len1/2,len2/2);
    const p1=[cur[0]+v1[0]/len1*rr,cur[1]+v1[1]/len1*rr];
    const p2=[cur[0]+v2[0]/len2*rr,cur[1]+v2[1]/len2*rr];
    d+=(i===0?`M ${p1[0]},${p1[1]} `:`L ${p1[0]},${p1[1]} `);
    d+=`Q ${cur[0]},${cur[1]} ${p2[0]},${p2[1]} `;
  }
  return d+"Z";
}
export function shipXY(pos,i,state,cellPx){
  // offset ships sharing a cell
  const same=state.map((s,j)=>({j,k:s.pos[0]+","+s.pos[1]})).filter(o=>o.k===pos[0]+","+pos[1]);
  const my=same.findIndex(o=>o.j===i),m=same.length;
  const ox=m>1?(my%2?1:-1)*cellPx*.18:0, oy=m>2?(my<2?-1:1)*cellPx*.18:0;
  return [(pos[0]+.5)*cellPx+ox,(pos[1]+.5)*cellPx+oy];
}

/* ---------- event text ---------- */
// a claimed seat (roster[i].id truthy) always speaks under the name its captain typed in;
// the default Capt. NAMES are only ever shown for unclaimed bot seats
// UI-06 (Wyatt-approved 2026-07-29, F2): a seated player who joined WITHOUT typing a name used to
// render nameless everywhere pname() is used, not just in the lobby — `s.name` is "" for them, and
// escHtml("") is "". rawName() two functions below already carried exactly the fallback UI-06 asks
// for, so it is mirrored here: trim, escape, and fall back to the captain default when nothing is
// left. The escaping is unchanged and still applies to every typed name (T-PB-02) — a non-blank
// name renders byte-identically to before.
export function pname(i){
  const s=(appState.roster&&appState.roster[i])||{};
  const fallback=NAMES[i].replace("Capt. ","");
  const nm=(s.name||"").trim();
  // playtest 19: a BOT carries no id, so this used to hand it the SEAT-INDEXED default — which is
  // how a human who typed "Dough Hook" ended up sitting opposite a bot of the same name. Bots are
  // now named once, collision-free, at roster build (buildRoster, src/shared/index.js), and that
  // assigned name is authoritative. The id gate still governs NETWORKED seats, where an unclaimed
  // seat must show its default rather than a name left behind by whoever sat there last.
  if(!s.id&&s.bot&&nm)return escHtml(nm);
  return s.id?(escHtml(nm)||fallback):fallback;
}
// plain (unescaped) display name for a seat — the same source pname() renders, minus the HTML
// escaping. Used by writeGameLog so every finished game records who was playing, including
// solo/local games (which have no rooms/{code}/seats node to cross-reference names from).
export function rawName(i){
  const s=(appState.roster&&appState.roster[i])||{};
  const nm=(s.name||"").trim();
  // same rule as pname() above — the game log must record the crew the player actually saw
  if(!s.id&&s.bot&&nm)return nm;
  return (s.id?nm:"")||NAMES[i].replace("Capt. ","");
}
export function pn(i){return `<b style="color:${HEXCOL[i]}">${pname(i)}</b>`;}
// possessive form for narration addressed to spectators of someone else's turn, e.g. "Davy Scones' turn"
export function poss(i){const nm=pname(i);return `<b style="color:${HEXCOL[i]}">${nm}${nm.endsWith("s")?"'":"'s"}</b>`;}
/* ⭐ THE ONE DOOR TO THE GAME'S WORDS — Wyatt, 2026-09-13: "All the narration should be re-architected to live in
   one place" · "we use one engine, that accepts as arguments the action taken, the player type (human/bot), the
   location of the player (this browser/remote), and serves an event."
   `viewerSeat` is WHICH SCREEN is reading, in the three states describeFor() already takes: a seat, NEUTRAL_VIEWER
   (every other screen), or undefined (this device's own seat). That is the LOCATION half of his sentence. The PLAYER
   TYPE half is deliberately absent: nothing here can ask whether a captain is a bot, so a bot and a human are
   described in the same words by construction. */
export function say(id,facts,viewerSeat){
  const t=WORDS[id];
  if(t===undefined)throw new Error(`src/shared/words.js has no line "${id}"`);
  return fill(t,facts,{me:s=>isLocalTo(s,viewerSeat),name:pn,poss});
}
/* One line for every screen at once — what every other screen reads, plus the "ye" version for each captain the
   line names: exactly the {html, variants} shape flash() and the wire already carry. */
export function sayAll(id,facts){
  const html=say(id,facts,NEUTRAL_VIEWER);
  const seats=[...new Set(Object.values(facts||{}).filter(v=>v&&typeof v==="object"&&"seat" in v).map(v=>v.seat))];
  return {html,variants:seats.map(s=>({seat:s,html:say(id,facts,s)})).filter(v=>v.html!==html)};
}
/* THE PLAIN-TEXT DOOR — for words drawn with textContent, like a greyed button's reason (showWhy). A coloured name or a
   no-break span would reach the screen there as literal markup, so both are taken off. */
export function sayText(id,facts,viewerSeat){
  return say(id,facts,viewerSeat).replace(/<[^>]*>/g,"");
}
export { seat };
// D-17 (Wyatt-approved 2026-07-29): ingredients render as the SAME custom art the islands and the
// captain's box draw (ilabelImg -> ING_IMG), not as raw system emoji. None of the 7 in-play
// ingredient emoji are EMOJI_IMG keys, so emojify() could never rescue them downstream — they were
// reaching the screen as system glyphs sitting beside custom coin art, the exact inconsistency he
// reported. Two guards below are load-bearing, not padding:
//   - the /coin/ branch stays FIRST and unchanged: x is not always an ingredient key. flow.js's
//     offerLabel composes a DISPLAY string ("Toasty Wheat + 2 coins") and the engine emits
//     price+" coins"; both contain "coin", so this branch already handles them and reordering
//     would break them.
//   - the ING_IMG[x] guard is required for the same reason: offerLabel with zero coins yields the
//     display NAME ("Toasty Wheat"), and "nothing" is emitted at three flow.js sites. Without it
//     those would emit <img src="undefined">. With it they fall through to the previous output
//     byte-for-byte.
// D-17 is also explicit that the ~145 raw emoji elsewhere in narration source are deliberate
// shorthand that emojify() converts at its two chokepoints — the defect was only this one branch.
export function fmtItem(x){return /coin/.test(x)?x.replace(/(\d+) ?coins?/,(_,n)=>say("coin.amount",{n})):(ING_IMG[x]?ilabelImg(x):(ING_EMOJI[x]||"")+" "+iname(x));}
// Single source of truth for what an event says (long-log text) and pops (board emoji/icon
// animation) — one function per event type instead of independent switches that used to drift out
// of sync (see describe()/spawnPops() below, thin wrappers over this table). `at` is a board-position
// lookup — real when called from spawnPops (which needs coordinates), a harmless no-op stub when
// called from describe() (which only reads .txt, never the pop math).
// (The per-ship "caps" captions and windHoldPhrase() were deleted 2026-09-14: nothing had drawn a
//  caption since v2 and the wind-streak phrase had no caller — dead words a reskin would trip on.)
// BUG-2 (storm-push-not-rendered): did this player's ship actually move between the start of its
// turn and the moment event `e` was recorded? A storm push is the very first thing a turn does
// (humanTurn/botTurn both emit `turn` and then push), so the `turn` event that opened this seat's
// turn holds where the ship sat BEFORE the storm touched it, and every event carries a full
// position snapshot (Game.ev, src/engine/index.js:233-235). Comparing the two is how the narration
// tells "the gust shoved you here" apart from "you were parked there all along".
//
// Derived from the event stream rather than from live UI bookkeeping ON PURPOSE. The captain's log
// is produced by running describe() over the event stream — on the host, on every remote guest
// (which never runs the push code at all, only receives its events — see watchEvents), and again
// on a reload-replay. UI-tier scratch state would only exist on the host, so a guest's log would
// tell the wrong story. Snapshots are in the stream everywhere, so this reads the same on all three.
//
// Returns true/false, or null for "can't tell" — a detached or fabricated event (no snapshot, or
// not in the current stream). Every caller must treat null as NOT a shove: understating a real
// lucky save is a far cheaper mistake than announcing a shove that never happened, which is the
// whole bug being fixed.
export function movedSinceTurnStart(e){
  if(!e||!e.state||!e.state[e.p])return null;
  const evs=(appState.game&&appState.game.events)||[];
  const idx=evs.lastIndexOf(e); // events are only ever appended, so the newest match is the right one
  if(idx<0)return null;
  for(let i=idx-1;i>=0;i--){
    const q=evs[i];
    if(q.t==="newround")return null;                       // ran past the turn's start — no anchor to compare
    if(q.t!=="turn")continue;
    if(q.p!==e.p||!q.state||!q.state[e.p])return null;     // the nearest turn isn't this seat's — wrong anchor
    const a=q.state[e.p].pos,b=e.state[e.p].pos;
    return a[0]!==b[0]||a[1]!==b[1];
  }
  return null;
}
// D-07/D-09/NARR-01 (Wyatt-approved 2026-07-29): every single-subject EVENT_NARRATION entry below
// that names a captain takes an optional 4th `viewerSeat` parameter and selects an addressed ("ye")
// branch via isLocalTo(e.p, viewerSeat) — the addressed form uses D-07's name-prefix-then-second-
// person shape; every other viewer (including describe()'s own default when appState.mySeat is
// unset, and NEUTRAL_VIEWER) sees the third-person line. `newround` is deliberately EXCLUDED
// (D-09 — it addresses the whole table, never one captain), and `end`/`turn` name no captain at
// all, so neither gains a branch either.
// seaLine(sea,mine,name) — the whole sighting sentence, INCLUDING the captain's name, because
// where the name goes is not fixed. Most lines lead with it ("Crustbeard leans over the rail…"),
// but Wyatt's own "Off the bow, ye see…" puts it mid-sentence ("Off the bow, Crustbeard sees…"),
// so the third-person string carries a `{}` marker and this decides nothing on its own.
//
// Both persons are read out verbatim from SEA_CREATURES. Nothing is conjugated, no article is
// guessed, no verb agreement is derived — the deleted seaSighting() did all three and got the
// plurals wrong; a leading-clause rule would additionally have missed the SECOND verb in a
// compound sentence ("leans over the rail, and spots six clownfish").
function seaLine(sea,p,viewerSeat){
  // A pre-2026-08-06 solo save stores `sea` as a bare creature name, and a save from earlier the
  // same day stores {o,s,v}. Both are replayed verbatim on resume, so both must still narrate.
  // "there's X down there" needs neither an article nor number agreement, so every old name reads
  // correctly without resurrecting the inference this change removed.
  if(!sea||typeof sea==="string"||!sea.y){
    const w=(sea&&sea.s)||(typeof sea==="string"?sea:null)||say("muse.somethin",{});
    return say("muse.unknown",{p:seat(p),what:w},viewerSeat);
  }
  return isLocalTo(p,viewerSeat)?`${pn(p)} — ${sea.y}`:sea.t.replace("{}",pn(p));
}
export
const EVENT_NARRATION={
  // notes/edits NARR-03: a wind that hasn't changed direction is "still" blowing that way — it
  // doesn't newly go anywhere, so it never says "now".
  // notes/edits NARR-04: any wind, storm or not, that holds one direction two rounds running gets
  // called out; three or more and it's openly refusing to quit.
  // NARR-01/D-25/D-26/D-49 (Wyatt-approved 2026-07-29): round-header copy, applied verbatim from
  // 15-COPY-APPROVED.md. D-49 folds two of the eight original branches in: a freshly-STARTED storm
  // (streak<2) renders the same line whether or not the wind direction just held — the windStreak
  // distinction only matters once the storm has itself repeated a round (streak>=2, below) —
  // and a storm that's both repeated AND has the wind holding renders one line regardless of
  // whether that hold is merely gusting or has gone past 3 rounds ("won't quit").
  /* THE DAY-START WEATHER LINE — Wyatt's shape, 2026-08-27.
       Day 6: Wind SOUTH. Tomorrow: NORTH.
       Day 6: Storm blowin' SOUTH. Tomorrow: NORTH.

     TWO RULINGS OF HIS, and between them they took the calm line from 57 characters to 35 and the
     held-storm line from 138 to 42:
       1. directions in CAPS — applied in DIRNAME itself, so every wind surface agrees;
       2. Option B "but remove '3 squares'; reasoning: the game already teaches you this
          automatically." He is right: a storm moves every ship and the player watches it happen,
          so the sentence was explaining something the board had already demonstrated.

     WHAT WENT, SO THE NEXT READER DOES NOT RESTORE IT THINKING IT WAS LOST BY ACCIDENT. All of it
     was his own approved copy (11cbf345, the 209 reviewed dispositions; re-approved at D-49), and
     all of it was cut by him, on purpose, on 2026-08-27:
       · "It'll blow every ship 3 squares west"        — ruling 2 above
       · "Batten down the hatches, ye scurvy lot!" / "Fie, Poseidon!"  — the storm theatre
       · "this westerly is gusting" / "won't quit"     — the wind-streak flavour, which is why
         windHoldPhrase() was deleted (2026-09-14)
     v2.1's rule SURVIVES and is the one thing here that is not merely shorter: a FORECAST storm
     still names no direction (`e.next` is null on exactly those rounds), so the tail reads
     "Tomorrow: a storm." and never guesses a heading.

     NOTHING ABOUT THE WEATHER IS TYPED (rule 9) — the day, both directions and whether tomorrow
     storms all come off the event. The old line hardcoded the 3 that STORM_PUSH already held.

     THE NOBRK SPAN IS GONE WITH THE LENGTH, and that is deliberate rather than an oversight. It
     existed because the old storm line put 502px of unbreakable text into a 276px box and was cut
     off at every width tested, 430px included. At 35-46 characters there is no atomic unit left to
     protect, and a span that cannot wrap is a liability the moment a line grows again. */
  newround:e=>{
    /* HIS PASS, 2026-09-13 (supersedes A-9's storm sentence): "Wind still" for any repeated direction; a storm is
       blowin', now blowin' (it goes on and the wind has turned) or still blowin' (it goes on, same way). The
       "It'll blow every ship 3 squares" sentence is gone — the storm summary names the squares when it pushes.
       "Tomorrow" stays, his pick. Every word in src/shared/words.js; only WHICH line is decided here. */
    const dir=DIRNAME[e.dir];
    const id=!e.storm?(e.windStreak>=2?"day.windStill":"day.wind")
      :e.streak>=2?(e.windStreak>=2?"day.stormStill":"day.stormNow"):"day.storm";
    const tail=e.nextStorm?say("day.tomorrowStorm",{}):(e.next?say("day.tomorrow",{dir:DIRNAME[e.next]}):"");
    return {cls:"roundhdr",txt:say(id,{day:e.round,dir})+(tail?" "+tail:"")};
  },
  dock:(e,at,cellPx,viewerSeat)=>{
    const heads=appState.game.cfg.dockHeads,tails=appState.game.cfg.dockTails;
    const paid=e.price!=null?e.price:"";
    const bought=(e.got==="bought");
    /* THE BLACK MARKET'S TWO PRICES read as two different sentences, because they are two different bargains:
       coin buys the crate, but a barter SPENDS two crates the whole table can see leave the hold. Paying with
       two of the SAME crate is legal and common, and "Cacao Pods an' Cacao Pods" reads like a stutter. */
    const barter=bought&&e.paidIng&&e.paidIng.length===2;
    const gave=!barter?"":e.paidIng[0]===e.paidIng[1]
      ?say("dock.gaveTwoSame",{a:fmtItem(e.paidIng[0])})
      :say("dock.gaveTwo",{a:fmtItem(e.paidIng[0]),b:fmtItem(e.paidIng[1])});
    /* HIS PASS, 2026-09-13: "Crustbeard finds treasure (+N) at the Flour Patch!" · "Crustbeard earns 1{coin}
       scrubbin' the docks and buys a crate of Wheat Sheaves (−N)." The HEADS!/TAILS words are gone — the coin
       itself shows the face. Every amount still comes off cfg and the event, never typed (W2-4). */
    const how=!bought?"":barter?".barter":e.black?".black":".buy";
    const facts={p:seat(e.p),n:e.heads?heads:tails,place:dockPlace(e.ing),goods:dockFlavorIcon(e.ing),paid,gave};
    let txt=say((e.heads?"dock.treasure":"dock.work")+how,facts,viewerSeat);
    // the purchase that empties a shelf is how the whole table learns it ran out
    if(how===".buy"&&e.wentDry)txt+=" "+say("dock.lastOne",facts,viewerSeat);
    return {txt,
      pops:[[at(e.p),bought?ING_EMOJI[e.ing]:"🌕",false,bought?ING_IMG[e.ing]:null]]};
  },
  // v2 rule 4e: no harbor-tax refund any more, so no bonus clause to name.
  trade:(e,at,cellPx,viewerSeat)=>{
    // D-08/D-25: each named trader reads it addressed to themselves — derived by words.js, not written twice.
    const txt=say("trade.struck",{a:seat(e.a),b:seat(e.b),gave:fmtItem(e.gave),got:fmtItem(e.got)},viewerSeat);
    // no 🤝 stamp over the boats — his game feel audit, 2026-09-13: "This already happens, and it seems weird." → "Remove it"
    return {cls:"trade",txt};
  },
  // v2 rule 5: a call is free and pays a flat bounty. Nothing is ever lost on a wrong one, so
  // there is no "backed the wrong ship (−N🌕)" form any more.
  sidebet:(e,at,cellPx,viewerSeat)=>{
    // his pass, 2026-09-13: "{Player} called it wrong." — one line for a wrong call; nothing is ever lost on one.
    if(e.won)return {cls:"trade",txt:say("call.right",{p:seat(e.p),n:e.delta},viewerSeat)};
    return {cls:"trade",txt:say("call.wrong",{p:seat(e.p)},viewerSeat)};
  },
  battle:(e,at,cellPx=0,viewerSeat)=>{
    const loser=e.winner===e.a?e.d:e.a;
    const [x1,y1]=at(e.a),[x2,y2]=at(e.d);
    const sp=e.spoilIng?ING_EMOJI[e.spoilIng]:"💰"; // e.spoil is HTML (ilabelImg) now — never parse it for a pop icon
    const spImg=e.spoilIng?ING_IMG[e.spoilIng]:null; // #3: won ingredient rises from the boat as art, not emoji
    /* G3 (Wyatt, 2026-07-30): a crate is rendered from the DATA field (`spoilIng`), never the engine's pre-rendered
       `spoil` text; a coin amount goes through fmtItem, the one place a coin amount is spelled; anything else passes
       through untouched (the config-dead raider spoil, queued for deletion in DETERMINISM-RERECORD-NEXT.md). */
    const spoilText=e.spoilIng?ilabelImg(e.spoilIng):(/ coins/.test(e.spoil)?fmtItem(e.spoil):e.spoil);
    /* playtest 20: rule 9 gives a two-heads tie to the DOWNWIND ship, and roughly one battle in four ends that
       way — so the line says why. The deciding round is the last one that scored (`downwind` rides the event). */
    const decidedRound=e.rounds&&e.rounds.filter(r=>r&&r[3]).pop();
    const wonOnWind=!!(e.downwind&&decidedRound&&decidedRound[0]===1&&decidedRound[1]===1&&decidedRound[3]===e.downwind);
    /* playtest 20 (Wyatt: "losers of a battle without a crate don't always give 'all they have'"): an empty hold
       means the winner leaves with nothing, and the line says so — detected on the DATA, so a future coin prize
       cannot silently inherit it. Checked before the wind: "where did my crate go" is the question a loser asks. */
    const tookNothing=e.spoilIng==null&&(e.spoil==null||e.spoil==="nothing"||e.spoil==="");
    /* HIS PASS, 2026-09-13: "Crustbeard wins and takes Cacao Pods." The score went, and so did the bribe and the
       "gives up all they have" branches — v2 rule 9d makes the prize a crate, full stop, so a coin prize could no
       longer reach a player. Who reads "ye" or "yer" is words.js's business, from the seats named here. */
    const facts={winner:seat(e.winner),loser:seat(loser),spoil:spoilText};
    const txt=say(tookNothing?"battle.nothing":wonOnWind?"battle.downwind":"battle.takes",facts,viewerSeat);
    return {cls:"battle",
      txt,
      pops:[[[(x1+x2)/2,Math.min(y1,y2)-cellPx*.15],"⚔️",true],[at(loser),"💸"],[at(e.winner),sp||"💰",false,spImg]]};
  },
  // NARR-01/D-25/D-38 (Wyatt-approved 2026-07-29): signed flee cost, "they/pays" dropped as
  // redundant once signed; comma+"but" structure per his approved actor-addressed sample, extended
  // mechanically to the defender-addressed and neutral forms.
  battleflee:(e,at,cellPx,viewerSeat)=>{
    // his pass, 2026-09-13: "Davy Scones slips away!" — the attack itself was announced when the fight opened.
    return {cls:"battle",txt:say("battle.slipsAway",{d:seat(e.d)},viewerSeat),pops:[[at(e.d),"🏃"]]};
  },
  // notes/edits UI-04: on a catch, the emoji that rises from the boat is the SUGARFISH itself, not
  // the fishing line — you just landed a fish, so show the fish coming up out of the boat.
  // NARR-01/D-25/D-38 (Wyatt-approved 2026-07-29): signed catch amounts.
  /* (`finish` — "returns to the Isle of Tortuga with a full recipe!" — stood here. Only the classic day emitted it, and the
     classic day is gone by his word of 2026-09-13; a captain home with a full recipe lights the ovens, and `ovens` says it.) */
  /* The `shotclock` (20s coin penalty) and `shotclockskip` (30s turn skip, Wyatt's "Dozed at the
     helm!" wording) rows stood here — removed 2026-08-28 with the shot clock itself (see ask()).
     Nothing emits either event any more; the wordings and their approval history live in git. */
  // D-08/D-25: both finalists read the result addressed to themselves — the winner's own "ye take
  // it!", the loser's own commiseration; a third-party viewer (and NEUTRAL_VIEWER) reads today's
  // exact third-person text.
  // notes/edits EOV-01: the blue narration box no longer announces the win — it would duplicate the
  // dedicated one-off victory box (see endLive's flash) and the End of Voyage summary. The board
  // still gets a crown pop over the winner; the announcement itself lives in the celebratory box.
  end:(e,at)=>({cls:"roundhdr",txt:"",pops:e.winner===null?[]:[[at(e.winner),"👑",true,CROWN_IMG]]}),
  /* THE START OF ANY CAPTAIN'S TURN — ONE LINE, bot or human, every screen. Silent while "turn.start" is empty in
     src/shared/words.js, by his word (2026-09-13): "can we cut it and see how it feels?" · "make sure your change is
     architectural". It replaced two lines that were never the same line: a bot's "takes the wheel…" and a human's
     "Ahoy, yer turn!". */
  turn:(e,at,cellPx,viewerSeat)=>{const txt=say("turn.start",{p:seat(e.p)},viewerSeat);return txt?{cls:"roundhdr",txt}:null;},
  /* A CAPTAIN LIGHTS THE OVENS — his rewrite of the retired final-round card ("Crustbeard fired up the bakery!"),
     on the moment a full recipe actually reaches Tortuga in today's game. */
  ovens:(e,at,cellPx,viewerSeat)=>({cls:"roundhdr",txt:say("ovens.lit",{p:seat(e.p)},viewerSeat)}),
  // RESTORED VERBATIM 2026-09-01 from 693c2b0b^ — the weather-line commit (693c2b0b, 2026-08-27)
  // deleted this entry as COLLATERAL in its table edit: its own "cut on purpose" list names the
  // storm theatre and the wind-streak flavour, never this. Five days of silent Muses later, Wyatt
  // reported it from the Glass ("the Muse narrations are now missing"). seaLine() above had sat
  // with zero callers the whole time. Held now by scripts/qa/muse_narration_check.mjs.
  //
  // Pass, given something to look at. Every captain who takes the turn off sees a different beast
  // go by; see Game.nextSeaCreature. The BUTTON reads "🌊 Muse" with the payout stated after it
  // (Wyatt, 2026-08-05 — it briefly read "Look into the ocean"; the label went back to Pass, the
  // narration stayed; the amount joined it under RULE-01, built like Attack's cost; the label
  // became Muse 2026-08-27, W2-7).
  //
  // RULE-01/D-06: passing pays a dubloon (Game.doPass), and the line says so. Wyatt's wording, his
  // pick over two longer drafts of his own — the idea is that the sea creatures are where the recipe
  // inspiration comes from, and the constraint he named was "short and easy to read".
  //
  // IT IS A SUBJECTLESS FRAGMENT AND THAT IS THE WHOLE POINT. About twenty of the fifty sightings
  // end on the CREATURE as the nearest grammatical subject ("...and a dozen donut shrimp bounce
  // past."), so any appended clause carrying a verb hands the pen to the shrimp. No subject, no
  // verb, no agreement to derive: it reads identically after all fifty sentences in both persons,
  // which is what lets it be appended HERE, once, with all 100 hand-written strings untouched — the
  // seaLine contract above, which the deleted seaSighting() broke in all three ways at once.
  //
  // The coin is a RAW character, resolved to the coin image by emojify() at panel()'s single
  // chokepoint (D-50), like every other coin-amount line in this table. Hand-rolling the markup here
  // would duplicate the chokepoint. Wrapped WHOLE rather than just the parenthetical — a unit and
  // its amount are one readable thing (the sailing-order precedent, G27/P7).
  //
  // THE AMOUNT IS READ OFF THE LIVE GAME'S ROUND CONFIG, not written out here — the same unguarded
  // read the dock: builder below already does for its two flip payouts, from inside this same
  // table. It is the same field the engine pays from and the same field the Pass button states, so
  // a line that tells a captain what they were paid cannot drift from what they were actually
  // paid. The wording is Wyatt's and is fixed; only the number derives.
  /* THE POST-STORM SUMMARY — the line Wyatt found missing on 2026-09-06, playing solo to the end.
     "Solo: storm summary narration is missing."

     IT WAS MISSING IN EVERY MODE, not just solo, and this is the other half of an August ruling
     that only ever shipped its first half. ITEM 8 (Wyatt, 2026-08-23c): "The storm narrated the
     fact that flaky jack was blown into the trade winds — it shouldn't. trade winds, like
     everything else, should be reported once with the post-storm summary." The four mid-storm
     lines (windmove, blownOut, anchorHold, blocked) and the tradewind bubble were duly withdrawn.
     THE SUMMARY THAT WAS MEANT TO REPLACE THEM WAS NEVER WRITTEN. `stormSummaryEvent` has been
     emitting a full payload — moved/held/shipHeld/blown/swept — into a table with no entry for
     it, so describeFor() returned null at line 789 and the bubble never appeared. A storm
     announced itself in the day header and then moved four ships in total silence.

     HIS SHAPE, chosen from the question UI 2026-09-06: name the captains, group the outcomes.
     Grouping is what keeps it one line instead of four on a phone — the engine already hands us
     the seats bucketed by outcome, so this reads them rather than re-deriving anything.
     shipHeld is the bucket that exists BECAUSE captains were being silently omitted (see
     noteStormOutcome: 71 omitted across 300 seeded games), so it gets a clause of its own here.
     Every bucket the engine can fill has one; a bucket cannot be added there without this line
     going quiet about it, which is the failure this whole entry is repairing. */
  stormSummary:(e,at,cellPx,viewerSeat)=>{
    const dir=DIRNAME[e.dir];
    /* "ye" wherever the local player is in the group, exactly as the trade and battle lines do —
       a summary that calls you by name while addressing everyone else in second person is the
       inconsistency rule "one display path" exists to stop. */
    const AND=say("list.and",{});
    const list=(seats)=>{
      const names=seats.map(i=>isLocalTo(i,viewerSeat)?`<b>${say("list.ye",{})}</b>`:pn(i));
      if(names.length<=1)return names[0]||"";
      if(names.length===2)return `${names[0]} ${AND} ${names[1]}`;
      return `${names.slice(0,-1).join(", ")} ${AND} ${names[names.length-1]}`;
    };
    /* Second person takes the plural verb ("ye drop"), so a group is singular ONLY when it is one
       captain who is not you. THIS IS THE BUG THE HARNESS CAUGHT: the first draft built every
       clause in the passive ("X is driven"), which read fine in a list and produced the fragment
       "The storm Crustbeard is driven 3 squares NORTH!" whenever it was the only clause. */
    const sng=(seats)=>seats.length===1&&!isLocalTo(seats[0],viewerSeat);
    /* TWO GRAMMATICAL SUBJECTS, KEPT APART. What the storm DOES to a captain takes the storm as
       its subject, so those clauses share the one "The storm …" opener and read as one sentence
       however many of them fire. What a captain does about it takes the captain, so those follow
       the dash. Wyatt's own shape, chosen from the question UI 2026-09-06:
         "The storm drives Flaky Jack and Wyargh WEST — Crustbeard drops anchor and holds fast…" */
    const byStorm=[],byCaptain=[];
    if(e.moved.length) byStorm.push(say("storm.drives",{who:list(e.moved),n:STORM_PUSH,dir}));
    if(e.blown.length) byStorm.push(say("storm.blowsOff",{who:list(e.blown)}));
    if(e.swept.length) byStorm.push(say("storm.sweeps",{who:list(e.swept)}));
    if(e.held.length)  byCaptain.push(say(sng(e.held)?"storm.holds.one":"storm.holds.many",{who:list(e.held)}));
    if(e.shipHeld.length)byCaptain.push(say(sng(e.shipHeld)?"storm.pinned.one":"storm.pinned.many",{who:list(e.shipHeld)}));
    const join=(a)=>a.length<=1?(a[0]||""):a.length===2?`${a[0]} ${AND} ${a[1]}`:`${a.slice(0,-1).join(", ")} ${AND} ${a[a.length-1]}`;
    /* The engine already refuses to emit this event when every bucket is empty ("say nothing
       rather than narrate an absence"), so one of these two is always populated — but a narration
       builder that CAN return an empty sentence is one bad merge away from showing him "🌀 !". */
    if(!byStorm.length&&!byCaptain.length)return null;
    const txt=byStorm.length
      ? (byCaptain.length?say("storm.summary.both",{storm:join(byStorm),captains:join(byCaptain)}):say("storm.summary",{storm:join(byStorm)}))
      : say("storm.summary.captains",{captains:join(byCaptain)});
    return {cls:"storm",txt};
  },
  pass:(e,at,cellPx,viewerSeat)=>({
    txt:say("muse.line",{sighting:seaLine(e.sea,e.p,viewerSeat),idea:`<span class="nobrk">${say("muse.idea",{n:appState.game.cfg.passCoin})}</span>`},viewerSeat),
    pops:[[at(e.p),"🌊",false,WAVE_IMG]]}),
};
const NO_AT=()=>[0,0]; // describe() never needs real board coordinates
// D-10: describeFor is the viewer-aware core; describe() below is now a thin wrapper
// (viewerSeat undefined) so its own observable behaviour stays byte-identical to before this
// wave. NOTE (D-24): syncLogLines()/the captain's log NO LONGER go through describe() — the log
// is a third-person record and calls describeFor(e, NEUTRAL_VIEWER) explicitly. describe()'s
// remaining callers are the message-box round-header flashes, which should stay addressed.
// describe() itself never reads "which viewer", that's
// threaded through by the caller (isLocalTo()'s null/undefined fallback to seatLocal() is what
// makes this safe: describe() → describeFor(e, undefined) → each builder's own
// isLocalTo(seat, undefined) → seatLocal(seat), i.e. today's live appState.mySeat read).
export function describeFor(e,viewerSeat){
  if(!e)return null;
  const fn=EVENT_NARRATION[e.t];if(!fn)return null;
  const r=fn(e,NO_AT,0,viewerSeat);
  // EOV-01: an event that yields no text (the suppressed win banner) produces no captain's-log line
  // at all — the blue box "disappears" rather than showing an empty strip. Board pops still fire via
  // spawnPops, which reads the raw narration independently of this.
  if(!r||!r.txt)return null;
  return {cls:r.cls,txt:emojify(r.txt)};
}
export function describe(e){return describeFor(e,undefined);}
// D-08: the seats an event NAMES — the doer AND the target, not just the doer (e.g. a battle
// addresses both attacker and defender; a trade/parley/bakeoff addresses both parties; a
// blocked-by-another-ship event also names the ship in the way). Deduplicated and sorted
// ascending, so narrationVariants() below emits at most one entry per seat in a deterministic
// order regardless of how many of these clauses happen to match the same seat twice.
export function narrationSubjects(e){
  if(!e)return [];
  const seats=new Set();
  if(e.p!=null)seats.add(e.p);
  if(e.t==="battle"||e.t==="battleflee"){if(e.a!=null)seats.add(e.a);if(e.d!=null)seats.add(e.d);}
  if(e.t==="parley"||e.t==="trade"||e.t==="collab"){if(e.a!=null)seats.add(e.a);if(e.b!=null)seats.add(e.b);}
  if(e.t==="blocked"&&e.other!=null)seats.add(e.other);
  /* THE STORM SUMMARY NAMES EVERY CAPTAIN IT MOVED OR HELD, and each of them reads "ye" for themselves — its builder has
     always said so (list() asks isLocalTo per captain), but no captain was counted here, so no screen ever received its
     own version and everyone read the names. Found in a two-window crew game, 2026-09-13: the guest read "The storm
     drives HOSTCAP, GUESTCAP an' Flaky Jack…" about itself. */
  if(e.t==="stormSummary")for(const k of ["moved","blown","swept","held","shipHeld"])(e[k]||[]).forEach(i=>{if(i!=null)seats.add(i);});
  return [...seats].sort((a,b)=>a-b);
}
// D-10: the host computes this ONCE per broadcast narration line — the viewer-neutral default
// (today's exact text, via NEUTRAL_VIEWER) plus, for every subject seat whose addressed
// rendering actually differs, a {seat,html} entry. A builder with no viewer branch (every entry
// but `dodge`, until later plans extend more of them) always renders identically for every seat,
// so it correctly contributes zero entries here — safe to call on every event unconditionally,
// not just ones that happen to have a viewer-aware builder.
export function narrationVariants(e){
  if(!e)return [];
  const neutral=describeFor(e,NEUTRAL_VIEWER);
  const neutralTxt=neutral?neutral.txt:null;
  const out=[];
  for(const seat of narrationSubjects(e)){
    const forSeat=describeFor(e,seat);
    const txt=forSeat?forSeat.txt:null;
    if(txt!=null&&txt!==neutralTxt)out.push({seat,html:txt});
  }
  return out;
}
// D-10: the one function both the host's own render (netNarrate) and every guest's watcher
// (watchNarr) go through to pick their own line out of a rooms/{code}/narr payload — tolerant of
// a null payload, a missing/empty variants array, and a null asking seat, so an old host's
// payload (no variants key at all) and a viewer with no seat both degrade to the payload's own
// html rather than ever returning undefined/null.
/* A WAIT LINE ADDRESSED TO THE VERY CAPTAIN WHO IS ABOUT TO BE ASKED IS NOT DRAWN ON THAT
   CAPTAIN'S OWN SCREEN — they are getting the question itself. Everyone else still reads
   "…is deciding…", with no dismissal deadline, exactly as item 19 requires.

   THE DEFECT THIS CLOSES, measured to the millisecond twice (`.planning/debug/tails-narration-
   vanishes.md`, then again by 4/scripts/narration_timeline.mjs on build h). ask() posts a wait-line
   bubble carrying the same words as the prompt it is about to build; two milliseconds later, in the
   SAME synchronous turn, panel()'s trailing syncPrompt() runs promptTick(), which sees the action
   panel go empty -> non-empty and retires whatever wait line is registered — including the one
   ask() itself just posted. The bubble pops in and is marked for its 300ms fade before a word of it
   can be read. Measured on build h: the post-sail menu 0ms, the dock's Buy mirror 0ms, the
   crow's-nest call 1ms. That is Wyatt's "popped up and immediately disappeared", four times over.

   THE FIX GOES AT THE MIRROR, NOT AT promptTick, AND THE CODEBASE ALREADY DECIDED THIS. The radial
   fan carries a dedup whose own comment says the quiet part out loud — "if a live bubble is just
   this pill's own words, retire it (the pill already says it)". The mirror is redundant with the
   prompt by this project's own prior ruling, so teaching promptTick to spare the line would either
   leave a genuine duplicate standing or be cancelled two lines later by that dedup. And the
   retirement it would weaken is 3a80839's, which closed a real defect Wyatt reported — a "waiting
   for yer mateys" card outliving the prompt it announced. That still works after this.

   DERIVED FROM WHAT THE PAYLOAD ALREADY CARRIES — no new wire field, no new state (rule 9). `wait`
   already crosses (netSetNarr's own note records why a display flag must), and so does `variants`.
   A wait line for which a seat AT THIS BROWSER has an addressed variant is, by construction, a wait
   line about a question coming to this browser. decisionIsLocal() is the same test ask() itself
   uses one line later to decide whether to build the prompt here or send it over the wire, so the
   two can never disagree about who is being asked.

   ONE PLACE, BOTH TIERS (rule 23, PAR-14). This is called from stageFlash — the single renderer the
   host's own loop and a guest's watchNarr both reach — never from the two call shapes above it. */
export function waitLineIsSelfAddressed(variants,opts){
  if(!(opts&&opts.wait))return false;
  if(!Array.isArray(variants))return false;
  try{return variants.some(v=>v&&v.seat!=null&&decisionIsLocal(v.seat));}
  catch(e){return false;}   // pre-game, or a seat the table does not have: draw it, as before
}
export function pickNarrVariant(payload,seat){
  if(!payload)return "";
  const variants=payload.variants;
  if(Array.isArray(variants)){
    const found=variants.find(v=>v&&v.seat===seat);
    if(found)return found.html;
  }
  return payload.html||"";
}
// #: describe() only the events added since logLines was last synced, instead of remapping the
// whole (append-only) game.events history on every single new event. A long-running game racks up
// thousands of events, and re-describing all of them on every tick made each new event O(n) —
// O(n²) over a multi-hour session — which is exactly the kind of session that gets visibly
// laggier the longer it runs. Safe because events are only ever pushed, never spliced/reordered;
// any real reset reassigns logLines directly (see the two `logLines=[...]` resets) rather than
// going through this path.
// D-24: the captain's log is a THIRD-PERSON stream — a neutral record of what happened, not a
// retelling aimed at whoever happens to be sitting here. describe() would resolve viewerSeat to
// the live appState.mySeat (via isLocalTo's null-fallback to seatLocal), so the log used to read
// "Crustbeard — you pay 1<coin> and sail" for your own moves. Passing NEUTRAL_VIEWER explicitly
// forces every builder's un-addressed branch, so every seat is named the same way. The message
// box is unaffected — it keeps addressing you directly via its own per-seat variants.
export function syncLogLines(){
  for(let i=appState.logLines.length;i<appState.game.events.length;i++)appState.logLines.push(describeFor(appState.game.events[i],NEUTRAL_VIEWER));
}

/* ---------- playback ---------- */
// re-triggers the .pulse animation (removing then re-adding forces a reflow so repeat
// changes in quick succession each get their own pulse instead of silently no-op'ing)
export function pulseEl(el){
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
}

// screen-center of the crate for ingredient `ing` on its home island, so a lost crate can
// visibly splash back where it came from (see #5/#6). Null-safe before the board is built.
export function islandXY(ing,cellPx){
  const isl=(typeof appState.game!=="undefined"&&appState.game&&appState.game.islandOf)?appState.game.islandOf[ing]:null;
  return isl?[(isl[0]+.5)*cellPx,(isl[1]+.5)*cellPx]:null;
}

// Derived entirely from the event log (including each event's captured position snapshot),
// so it works identically for live play, a host-reload replay, or scrubbing a finished game —
// no separate live-only counters to keep in sync.
// Walks the full event log once, tallying everything the superlative pool below might need.
// Streak/battle-round events don't carry a separate "who flipped what" trail, so hottestStreak
// is reconstructed here from every individual coin flip embedded in dock/fish/anchor/aground/
// battle-round events, in chronological order.
export function computeAwards(){
  const n=appState.game.players.length;
  const mk=()=>Array(n).fill(0);
  const battlesWon=mk(),battlesLost=mk(),timesAttacked=mk(),cratesBought=mk(),dist=mk(),
    trades=mk(),longestBattle=mk(),hottestStreak=mk(),streak=mk();
  const bump=(i,heads)=>{
    if(i==null)return;
    if(heads){streak[i]++;if(streak[i]>hottestStreak[i])hottestStreak[i]=streak[i];}
    else streak[i]=0;
  };
  let prevPos=appState.game.players.map(()=>null);
  for(const e of appState.game.events){
    // v2.1 (Wyatt, 2026-08-06: recalculate the lucky streak "over the course of the whole game").
    // MEASURED FIRST: the walk was already whole-game — `streak` is never reset between turns — but
    // it was BLIND TO `battlenull`, and that is where the reported symptom came from. A null battle
    // (v2 rule 9: the crosswind stand-off nobody paid to break, and every declined re-fire) carries
    // its flips in `rounds` exactly like the other two outcomes, and they were being dropped.
    // Across 40 headless games that lost 74 of 816 flips — 9% — and the badge undercounted somebody's
    // streak in 4 of them. Always downward, which is why it read as "this only counted one turn".
    // Adding it also repairs timesAttacked and longestBattle, which had the same blind spot: a null
    // battle is still a real attack with real rounds. battlesWon/battlesLost stay guarded on
    // `winner!=null`, because a null is precisely the case where nobody won.
    if(e.t==="battle"||e.t==="battleflee"||e.t==="battlenull"){
      // #5: a fought-then-fled battle still counts toward game.battles, so it must count in the
      // per-player battle stats too (it was a real attack with real rounds) — only the clean
      // win/loss tally is skipped for a flee, since nobody won.
      if(e.t==="battle"&&e.winner!=null){battlesWon[e.winner]++;battlesLost[e.winner===e.a?e.d:e.a]++;}
      timesAttacked[e.d]++;
      const rounds=e.rounds||[],len=rounds.length;
      if(len>longestBattle[e.a])longestBattle[e.a]=len;
      if(len>longestBattle[e.d])longestBattle[e.d]=len;
      // v2 rule 9b: on a paid re-fire only the ATTACKER flips, and the defender's slot is
      // null rather than 0 — counting that as a tails would libel their coin luck.
      for(const r of rounds){bump(e.a,!!r[0]);if(r[1]!=null)bump(e.d,!!r[1]);}
    }
    if(e.t==="dock"){bump(e.p,!!e.heads);if(e.got==="bought")cratesBought[e.p]++;}
    // v2: `aground` is no longer a coin flip — a storm asks nothing (rule 8), so it contributes
    // nothing to the heads-luck tally. `anchor` no longer exists at all.
    if(e.t==="trade"){trades[e.a]++;trades[e.b]++;}
    if(e.state)e.state.forEach((s,i)=>{
      if(prevPos[i])dist[i]+=Math.abs(s.pos[0]-prevPos[i][0])+Math.abs(s.pos[1]-prevPos[i][1]);
      prevPos[i]=s.pos;
    });
  }
  return {battlesWon,battlesLost,timesAttacked,cratesBought,dist,trades,longestBattle,hottestStreak};
}
// notes/edits EOV-04: the end-of-voyage honours. The full pool of ~10 keepsakes, each with a
// pirate-y name, a byline, its 1:1 emblem art (assets/badges/*.png — placeholders Wyatt will
// repaint), and the underlying plain stat. `scale` is roughly "how big a value is impressive" for
// that category, so assignBadges() can compare across categories with different units. `key` selects
// the per-player stat array (computeAwards() output, plus a synthesised `tails`).
const BADGE_POOL=[
  {key:"battlesWon",   img:"cutlass",  name:say("trophy.cutlass.name",{}), byline:say("trophy.cutlass.byline",{}),                 stat:say("trophy.cutlass.stat",{}),   unit:say("trophy.cutlass.unit",{}),         scale:3},
  // v2 rule 3: no fishing, so the Golden Herring is retired. In its place, the award that
  // actually measures a v2 captain — who spent the most at the docks now that every crate on the
  // board has a price on it (rules 10/11).
  {key:"cratesBought", img:"doubloon", name:say("trophy.doubloon.name",{}),                      byline:say("trophy.doubloon.byline",{}), stat:say("trophy.doubloon.stat",{}), unit:say("trophy.doubloon.unit",{}),         scale:4},
  {key:"dist",         img:"compass",  name:say("trophy.compass.name",{}),      byline:say("trophy.compass.byline",{}), stat:say("trophy.compass.stat",{}),  unit:say("trophy.compass.unit",{}),      scale:45},
  {key:"longestBattle",img:"medal",    name:say("trophy.medal.name",{}),                byline:say("trophy.medal.byline",{}),                               stat:say("trophy.medal.stat",{}),     unit:say("trophy.medal.unit",{}),  scale:4},
  {key:"tails",        img:"blackspot",name:say("trophy.blackspot.name",{}),       byline:say("trophy.blackspot.byline",{}), stat:say("trophy.blackspot.stat",{}), unit:say("trophy.blackspot.unit",{}), scale:16},
  {key:"hottestStreak",img:"herring",  name:say("trophy.herring.name",{}),                  byline:say("trophy.herring.byline",{}), stat:say("trophy.herring.stat",{}), unit:say("trophy.herring.unit",{}), scale:4},
  {key:"trades",       img:"ledger",   name:say("trophy.ledger.name",{}),         byline:say("trophy.ledger.byline",{}),       stat:say("trophy.ledger.stat",{}), unit:say("trophy.ledger.unit",{}),         scale:3},
  {key:"timesAttacked",img:"target",   name:say("trophy.target.name",{}),                byline:say("trophy.target.byline",{}),           stat:say("trophy.target.stat",{}),      unit:say("trophy.target.unit",{}),         scale:3},
  {key:"battlesLost",  img:"timbers",  name:say("trophy.timbers.name",{}),            byline:say("trophy.timbers.byline",{}),             stat:say("trophy.timbers.stat",{}),  unit:say("trophy.timbers.unit",{}),         scale:3},
  /* "The Barnacle Brain" (slowest to decide) left with the shot clock, 2026-08-28 — its tally
     counted shotclock/shotclockskip events nothing emits now; kept, every seat would score 0 and
     the award would be handed out by tie-break, a visibly wrong End of Voyage screen. */
];
// Guaranteed fallback for a captain who earned no standout stat (rare — everyone at least sails, so
// "Farthest traveled" is nearly always claimable — but this ensures EVERY captain gets one award).
// It still carries a real number: how many ingredients they finished the voyage holding.
const FALLBACK_BADGE={img:"anchor",name:say("trophy.anchor.name",{}),byline:say("trophy.anchor.byline",{}),stat:say("trophy.anchor.stat",{}),unit:say("trophy.anchor.unit",{})};
// notes/edits EOV-04: every captain gets exactly ONE award, and no two share a category. Build all
// (captain, category) claims with a positive stat, rank them by value/scale (so a 57-square voyage
// and a 4-win rampage compare fairly), then greedily hand each captain their single most impressive
// still-available badge. A captain who can't claim any stat (all zero) gets a flavor fallback.
export function assignBadges(){
  const s=computeAwards();
  const arrs=Object.assign({},s,{tails:appState.game.players.map(player=>(player.flips||0)-(player.heads||0))});
  const n=appState.game.players.length;
  const cands=[];
  for(const def of BADGE_POOL){
    const arr=arrs[def.key];if(!arr)continue;
    for(let i=0;i<n;i++)if(arr[i]>0)cands.push({seat:i,def,value:arr[i],score:arr[i]/def.scale});
  }
  cands.sort((a,b)=>b.score-a.score);
  const bySeat={},usedCat=new Set();
  /* ⭐ THE BLACK SPOT IS ALWAYS AWARDED — Wyatt, 2026-09-09: "include the unluckiest (most tails
     flipped) prize in each awards lineup".
     ⚠ IT WAS NOT MISSING, IT WAS COMPETING. Every badge below is handed out by one greedy pass over
     `score = value / scale`, so "most tails" only appeared when it happened to out-score a captain's
     battles, distance or trades — which on a lucky table is never. He wants it every voyage, so it
     is assigned FIRST, to whoever actually flipped the most tails, and the greedy pass then fills
     the rest of the table around it.
     ⭐ AND THE COUNTER ALREADY MEANS WHAT HE HOPED — he asked to "make sure that the most tails
     flipped counter is doing total tails, not streak". It is: `flips - heads`, a total, computed
     where `arrs` is built above. The STREAK award is a different badge (hottestStreak, heads), which
     is probably what raised the question. Checked, not assumed. */
  {
    const t=arrs.tails||[];
    let best=-1,bestSeat=-1;
    for(let i=0;i<n;i++)if((t[i]||0)>best){best=t[i]||0;bestSeat=i;}
    const def=BADGE_POOL.find(d=>d.key==="tails");
    if(def&&bestSeat>=0&&best>0){
      bySeat[bestSeat]={seat:bestSeat,def,value:best,score:best/def.scale};
      usedCat.add("tails");
    }
  }
  for(const c of cands){
    if(bySeat[c.seat]!==undefined||usedCat.has(c.def.key))continue;
    bySeat[c.seat]=c;usedCat.add(c.def.key);
  }
  for(let i=0;i<n;i++)if(bySeat[i]===undefined)bySeat[i]={seat:i,def:FALLBACK_BADGE,value:appState.game.players[i].ing.length};
  return appState.game.players.map((player,i)=>bySeat[i]); // one per captain, in seat order
}

// standard subtitle-timing formula: a floor so short messages don't flash away, a per-char
// reading-speed term (~16-17 CPS), a bump for each mid-string pause (,!?.), and a cap so a very
// long message doesn't hold forever — players will click through it.
// notes/edits NARR-05: finished sentences were lingering too long — hold every message for 20%
// less time. Applied to the clamped result so the floor and cap scale with it and the whole curve
// shortens uniformly, rather than short messages sticking at an unchanged floor. This is the HOLD
// duration only; REVEAL_MS_PER_CHAR (the typing rate) is deliberately untouched.
// Phase 15 (NARR-06/D-14): a second, STACKING cut on top of the one above — hold for 10% less
// time again (0.8 -> 0.72), same "applied to the clamped result" rule so the floor/cap scale with
// it and the whole curve shortens uniformly. Chat bubbles are deliberately EXCLUDED from this cut —
// see CHAT_BUBBLE_HOLD_MULTIPLIER below, which is its own named constant precisely so the narration
// curve and the bubble curve can drift apart on purpose.
// D-23 (Wyatt-approved 2026-07-29): this is now the ONLY narration hold curve — bot narration used
// to run on its own, shorter curve (BOT_MSG_HOLD_MULTIPLIER/botMsgHoldMs below); that curve is
// retired and every bot call site now holds on this exact formula, same as a human's own line.
// G28 (Wyatt-approved 2026-07-30, retuned live during the recorded playtest). THREE changes, and the
// third is the one that matters most:
//
//   1. base 1000 -> 500, charTime 50 -> 20. He watched the long lines and said they "hold too long".
//   2. CLAMP MOVED LAST. It used to wrap `raw` and THEN multiply, so the 1200/7000 written here were
//      bounds on an intermediate number nobody ever sees — the real visible range was 864..5040ms.
//      He spotted it: "the clamp should happen last. right? The idea is that nothing is visible for
//      less than 1200 ms and nothing is visible for more than 7000 ms." It is now literally that.
//   3. MSG_HOLD_MULTIPLIER (0.72) RETIRED, not re-applied on top. Keeping it would have made his
//      3200 ceiling render as 2304 and his 1200 floor as 864 — recreating the exact defect item 2
//      just fixed, one layer down. His numbers ARE the visible milliseconds. If the pacing wants
//      changing again, change THESE numbers; do not reintroduce a scale factor over them.
//
// THE HOLD IS NOT THE WHOLE TIME ON SCREEN, and that matters for anyone retuning this. flash()
// awaits the typewriter (`_revealDone`) and only THEN starts this hold, so a line's real life is
//     reveal (REVEAL_MS_PER_CHAR x chars)  +  this hold  +  GHOST_FADE_MS
// He deliberately left the reveal alone — "i like the reveal speed where it is, it looks good" — so
// on a long line the typewriter and the hold contribute roughly equally, and THE CEILING IS THE ONLY
// LEVER on the worst case. Without one, 500 + 20/char keeps climbing and a 200-char line ends up
// longer than it was before this retune. That is why 2000 is a hard cap and not a formality.
//
// Measured against the pre-retune curve, total time on screen:
//     25ch 2.5s -> 2.6s   80ch 5.6s -> 4.4s   120ch 7.6s -> 5.2s   160ch 8.4s -> 6.0s
// Short lines hold steady, the long ones lose up to 2.4s, and the fade is now long enough to read as
// a warning rather than a cut.
//
// Floor is 800, matching GHOST_FADE_MS: he lowered it himself once the fade grew — "i think the floor
// can be lowered to 800ms if we have a 800ms fade" — because the fade now carries the "this is
// leaving" signal that the floor used to have to guarantee on its own. It binds only under ~15
// characters, and only for a line with no sentence punctuation.
//
// Known and accepted: at 20ms/char the ceiling binds from ~60 characters, so most full sentences share
// the same 2000ms hold. Length still stretches the reveal, and the fade — not the hold — is what
// signals "this is about to leave". That was his stated purpose for lengthening it.
const HOLD_BASE_MS=500, HOLD_MS_PER_CHAR=20, HOLD_PAUSE_MS=300;
export const HOLD_FLOOR_MS=800, HOLD_CEILING_MS=2000;
// D-10 (Wyatt, 2026-08-20 playtest item 10; re-ruled by the orchestrator 2026-08-21 after the
// literal stage.js edit was measured to have zero player-visible effect): "a long narration line
// stays on screen about two seconds longer" — the CEILING only, floor and formula untouched.
//
// THE LEVER WAS HERE, NOT AT stage.js's OUTER CLAMP. `msgHoldMs()` was already returning at most
// HOLD_CEILING_MS (2000) BEFORE stage.js's `*1.5` and its own outer Math.min ever run, so
// 2000*1.5=3000 sat well under stage.js's clamp regardless of what number that clamp named —
// raising 6750 to 8775 there could never bind. Live-measured, two-tab, real driven crew game:
// longest bubble held 3305ms/3304ms (host/guest), matching 2000*1.5 + the ~300ms fade tail in
// stage.js's finish(), not the outer ceiling.
//
// SCOPED, NOT GLOBAL: msgHoldMs() gained an OPTIONAL second parameter rather than HOLD_CEILING_MS
// itself being raised, because this function has a second live consumer — panel.js's flash()
// falls back to `msgHoldMs(text)` (no override) whenever `window.__pp4` is unset. In practice that
// path is dead once a game is on screen (stage.js's initStage() sets window.__pp4 unconditionally
// at boot), but it is a real second reader of this exact constant and D-10 asked only about the
// narration BUBBLE, not every future caller. Every existing call site — including panel.js's
// fallback and any script harness reading HOLD_CEILING_MS directly — behaves byte-identically:
// the parameter defaults to HOLD_CEILING_MS itself, so omitting it reproduces today's clamp
// exactly. Only stage.js's narration-bubble call (the sole live consumer) passes the override.
export function msgHoldMs(text,ceilingMs){
  if(appState.ff)return 0;   // ⏩ fast-forward: no holds — pacing belongs to the skip until a prompt lands
  text=text||"";
  let raw=HOLD_BASE_MS+text.length*HOLD_MS_PER_CHAR;
  const body=text.replace(/[.,!?]+$/,""); // trailing punctuation doesn't count as a mid-string pause
  const pauses=(body.match(/[,!?.]/g)||[]).length;
  raw+=pauses*HOLD_PAUSE_MS;
  const ceiling=typeof ceilingMs==="number"?ceilingMs:HOLD_CEILING_MS;
  return Math.round(Math.min(Math.max(raw,HOLD_FLOOR_MS),ceiling));
}
// ---- D-34 / D-45: narration holds at READING SPEED --------------------------------------------
// His item 6 on the afternoon solo list, build t: "medium narration lines drag". Measured, and the
// curve above was not the culprit -- the FLOOR was. msgHoldMs() returns at least HOLD_FLOOR_MS,
// stage.js then multiplied by 1.5 and floored the RESULT at 2550ms, so every line under about 85
// characters sat at exactly 2550ms. "Blown into the trade winds!" (27 chars, computed 1560ms) and a
// 75-character sentence held for the identical time. A floor is a price list standing in for a
// quantity that moves by an order of magnitude across a voyage (rule 9), and it fails silently.
//
// D-34 -- Wyatt's own pick, shown three options and the measurement behind each: replace the
// floor-plus-per-character model with a READING-SPEED one. Hold = a small overhead + characters
// divided by a reading rate. He picked against two anchors, and those two anchors are the only
// numbers typed here. Two points determine one line, so the rate and the overhead are SOLVED from
// them rather than typed alongside them:
//
//     rate     = (75 - 27) chars / (4500 - 2100) ms = 0.0200 char/ms  (20 char/sec)
//     overhead = 2100ms - 27 chars / 0.0200 char/ms = 750ms
//
// D-45 -- Wyatt, 2026-08-21 evening, asked directly with both numbers in front of him: "everything
// 15% faster: long lines ~5.3s -> ~4.5s, short ~2.1s -> ~1.8s." BOTH of his after-numbers are his
// own before-numbers divided by 1.15, so the speed-up divides the WHOLE hold, not only its reading
// term. Dividing the overhead and multiplying the rate does exactly that at every length in
// between, and it needs no third number. (D-41 recorded the earlier form of this ruling -- rate
// only, ceiling held. D-45 supersedes it and says so.)
//
// D-45 ALSO RE-RULES D-10's CEILING, in the open, by the person who made both rulings. D-10 pinned
// a long line at ~5.3s (live-measured 5304ms host / 5297ms guest) and this file used to describe
// that number as guarded. It is not guarded any more: he was shown it and chose ~4.5s. D-10's
// INTENT -- a long line stays on screen long enough to read -- is untouched; only its number moved.
// So the new ceiling is D-10's own hold divided by the same 1.15, not a fourth typed number.
//
// WHAT MOVES WITH IT, enumerated before the change rather than discovered after it (the -21.2
// ladder regression came from replacing a constant with a calculation and not listing its readers):
//   - stage.js's narration bubble  -> MOVES. This is D-34's target and the only live consumer.
//   - panel.js's flash() classic-path fallback -> MOVES, so the two cannot disagree about how long
//     one line of narration reads (rule 23). It is dead in practice because initStage() sets
//     window.__pp4 at boot, but it is a real second reader of the same pacing.
//   - flash(holdMs) when holdMs is a NUMBER -> does NOT move. That is botWindLeg's explicit
//     per-square override (D-10), an argument rather than a curve.
//   - chatBubbleHoldMs()           -> does NOT move. D-15 pinned a chat bubble to its own curve on
//     purpose: another player typing TO you earns the extra beat.
//   - msgHoldMs() itself and its botMsgHoldMs() alias -> UNCHANGED. Nothing in 4/src calls either
//     any more once the two above are moved; they are kept so the D-23 parity alias and any script
//     harness reading HOLD_FLOOR_MS/HOLD_CEILING_MS keep behaving byte-identically.
//   - scripts/narration_test.js's G28 pins -> read the ROOT tree's src/ui/util.js, not this file.  [ROOT-TREE-CITATION: narration_test.js reads the root tree on purpose — true as written]
//     Checked by path, not assumed.
const READ_ANCHOR_SHORT  = [27, 2100];   // D-34: ~27 characters reads in ~2.1s
const READ_ANCHOR_MEDIUM = [75, 4500];   // D-34: ~75 characters reads in ~4.5s
export const READ_SPEEDUP = 1.15;        // D-45: assume people read 15% faster -- every line
const READ_RATE_BASE_CPMS =
  (READ_ANCHOR_MEDIUM[0] - READ_ANCHOR_SHORT[0]) / (READ_ANCHOR_MEDIUM[1] - READ_ANCHOR_SHORT[1]);
export const READ_RATE_CPMS = READ_RATE_BASE_CPMS * READ_SPEEDUP;
export const READ_OVERHEAD_MS =
  (READ_ANCHOR_SHORT[1] - READ_ANCHOR_SHORT[0] / READ_RATE_BASE_CPMS) / READ_SPEEDUP;
// D-10's approved hold exactly as this codebase produced it until today -- msgHoldMs's scoped
// ceiling times stage.js's 1.5 -- kept as the SOURCE of the new ceiling so the lineage of the
// number stays readable and D-45 is expressed in exactly one place.
const D10_HOLD_CEILING_MS = 3330 * 1.5;  // 4995ms; measured on screen at 5304/5297 with the fade tail
export const NARRATION_HOLD_CEILING_MS = Math.round(D10_HOLD_CEILING_MS / READ_SPEEDUP);
export function narrationHoldMs(text){
  if(appState.ff)return 0;   // fast-forward: no holds, same rule msgHoldMs already follows
  const chars=String(text==null?"":text).length;
  return Math.round(Math.min(READ_OVERHEAD_MS + chars / READ_RATE_CPMS, NARRATION_HOLD_CEILING_MS));
}

// D-09/D-10: the per-square storm-push beat — a single named constant so Wyatt can tune
// snappiness-vs-legibility at UAT without a code hunt. STORM_STEP_MS is the human pace (windLeg);
// BOT_STORM_STEP_MS is the bot's own, snappier per-square beat (botWindLeg, src/ui/flow.js).
//
// BOTH MUST STAY ABOVE SHIP_GLIDE_MS. Each ship <g> carries its own
// `transition: transform .35s` (src/ui/board.js, in drawBoard's ship loop), so a painted move
// takes 350ms to actually travel. A beat shorter than that retargets the boat mid-glide: it slides
// continuously through the push and never comes to rest on the squares in between, which is the
// opposite of the per-square reading this beat exists to create.
//
// The original 320/170 predate any of this being observable — until the storm-push render bug was
// fixed (.planning/debug/resolved/storm-push-not-rendered.md) an ordinary storm square painted
// NOTHING at all, so these two numbers had never once been seen against the glide they pace. Live
// measurement on the fixed build put the real dwell at 166ms (bot) and 317ms (human), both under
// the 350ms glide, exactly as that predicts. Raised to clear it with a little rest at each square.
// Still the feel knob: tune freely, but keep both above SHIP_GLIDE_MS or the stepping is lost.
// /4 playtest 14 (Wyatt: "make the boats sail 50% of current speed"): 350 -> 700. Every derived
// beat below (storm steps, rim-sweep pace) scales with it, so the per-square rest is preserved.
// playtest 19 item 3 (Wyatt: "on load, the recipe cards were zoomed wrong; i had to zoom out then
// refresh"). THE LAYOUT VIEWPORT — never window.innerWidth/innerHeight for laying anything out.
//
// Safari reports the *visual* viewport in innerWidth/innerHeight, so on a pinch-zoomed page they
// SHRINK, and every box sized from them is built for a screen half the real width. Measured at
// 390x844 with innerWidth forced to 195 (a 2x pinch), on the old build: the recipe sheet came out
// 179px wide with 72px cards against a correct 374/163.5, and it stayed wrong until BOTH a
// zoom-out and a reload — exactly what he had to do.
//
// documentElement.clientWidth/Height is the layout viewport. It does not move with pinch zoom, and
// it is the same coordinate space getBoundingClientRect() reports in — which is what every
// placement in stage.js compares against, so mixing the two was the whole bug.
//
// Defined ONCE here because two separate files had it: stage.js sizes the prompts and the recipe
// sheet, and board.js's syncBoardSizing() sets --boardW, which #actionPanel is max-width capped to
// (index.html) — so a zoomed innerWidth squeezed the cards a second time, through a different
// file, after the first fix. The `||` is a floor for the pre-layout case, not a preference.
/* ONE ANSWER to "is this option greyed out?", for every site that needs to know.
   playtest 21 item 5 moved greyed options from the `disabled` ATTRIBUTE onto aria-disabled, because
   a real <button disabled> fires no click event and therefore could never be tapped to ask why it
   is greyed. The consequence is that `b.disabled` is now FALSE on every prompt button, so any
   surviving `!b.disabled` test silently starts treating greyed options as live — which is exactly
   how the stay-put confirm would have picked one to hang itself on.
   It lives in util.js rather than flow.js because stage.js needs it too and flow.js must not be
   imported there: module_graph_check.js forbids the cycle. */
export function isDisabledBtn(b){return !!b&&b.getAttribute("aria-disabled")==="true";}
/* ITEM 22 STOPGAP (D-18, 02.2-03): on a desktop-width screen, index.html caps `body.pp4Stage` to a
   phone-shaped column (`max-width:430px`) and gives it a `transform`, which — by the CSS spec — is
   what makes `body` the containing block for every `position:fixed` stage element (the ribbon, the
   prompt box, the captains panel, the board itself: buildStage() in stage.js appends all of them
   straight to `document.body`). So the WIDTH those elements actually render at is `body`'s own box,
   not the true viewport — but `document.documentElement.clientWidth` only ever answers "how wide is
   the viewport", never "how wide is the box everything is actually measured against". Every camera
   fit, every `cqw` calculation and every board-mapped overlay in stage.js reads `vwPx()`/`vhPx()`
   for that number, so left unchanged they would keep computing against the full desktop width while
   everything they position renders inside the narrower, capped column — the exact mismatch a
   200px phantom bug came from once already (`docs/BOARD-RENDERING.md` §7).
   `document.body.getBoundingClientRect()` is what the renderer's own fixed-position math is
   actually keyed to (BOARD-RENDERING.md §7's rule: compare against what the renderer produced, not
   against arithmetic re-derived by hand) — so read it directly, rather than re-deriving 430px or
   the media query's breakpoint here as a second copy of either number.
   FALLS BACK to today's behaviour whenever the stage isn't active, the container has no box yet
   (a game not yet on screen — 0×0 is a real width, so its emptiness, not a falsy check, is what
   triggers the fallback), or `pp4Stage` never got the class in the first place — a phone, where the
   min-width media query never applies and body's own rect equals the viewport anyway, takes this
   same fallback path and is unaffected either way. Zero-risk default (D-18).
   TO REVERT (Phase 8): delete this branch and the matching `@media (min-width:601px)` rule in
   index.html — both are additive over the pre-stopgap behaviour below. */
export function stageCappedRect(){
  if(typeof document==="undefined")return null;
  const b=document.body;
  if(!b||!b.classList.contains("pp4Stage"))return null;
  const vw=document.documentElement.clientWidth||window.innerWidth;
  const r=b.getBoundingClientRect();
  // Trust body's own box ONLY once the desktop-only media query has genuinely narrowed it below
  // the true viewport. On a phone that query never matches, so body's rect always equals the
  // viewport width — `r.width>=vw` catches that (and any other width-uncapped state) and falls
  // through to the untouched pre-stopgap path, which is what keeps a phone byte-identical (D-18)
  // regardless of anything this branch does on desktop.
  if(r.width<=0||r.height<=0||r.width>=vw)return null;
  return r;
}
export const vwPx=()=>{const r=stageCappedRect();return r?r.width:(document.documentElement.clientWidth||window.innerWidth);};
export const vhPx=()=>{const r=stageCappedRect();return r?r.height:(document.documentElement.clientHeight||window.innerHeight);};
/* THE OTHER HALF OF ITEM 22 (RED ALERT, 2026-08-21, D-18 follow-up): stageCappedRect() above fixes
   WIDTH/HEIGHT for anything reading vwPx()/vhPx() — but the same transform that narrows body also
   MOVES it: `margin:0 auto` on a capped-width body sits its own left edge partway into the true
   viewport, not at 0. getBoundingClientRect() always answers relative to the true viewport (CSS
   spec, unaffected by any ancestor transform), so a `left`/`top` copied from one gBCR reading
   straight onto a DIFFERENT position:fixed element (now measured against body's shifted box, not
   the viewport) lands off by exactly that shift. Confirmed as the root cause of Wyatt's 7am
   game-stopping report (docs/HARD-WON-LESSONS.md): the radial fan's own placement search requires
   candidates to land inside a body-relative band (via vwPx()), but was fed viewport-absolute
   coordinates for the ship itself — every candidate failed, and the fallback stacked all four
   buttons (Dock/Trade/Attack/Pass) on the same clamped corner, hiding three of them under the one
   left visibly clickable.
   fixedOrigin() is that same shift, read the same way stageCappedRect() reads its own guard — zero
   on phone, zero whenever the stopgap isn't active, never re-derived as 430px or the breakpoint.
   fixedRect(el) applies it to one element's own rendered box for the handful of call sites that
   read a DIFFERENT element's rect (a sail-highlight square, an already-placed pill) to place
   something else — width/height are untouched, since a translation cannot change a size. */
export function fixedOrigin(){
  const r=stageCappedRect();
  return r?{x:r.left,y:r.top}:{x:0,y:0};
}
export function fixedRect(el){
  const r=el.getBoundingClientRect();
  const o=fixedOrigin();
  return {left:r.left-o.x,right:r.right-o.x,top:r.top-o.y,bottom:r.bottom-o.y,width:r.width,height:r.height};
}
export const SHIP_GLIDE_MS=700;
/* How long the finished board is left alone before the End of Voyage banner covers it (playtest 22
   item 12). Long enough to read the sea and take a screenshot, short enough that it does not read
   as the game having stalled — the same judgement msgHoldMs makes for a line of narration, and
   deliberately a shade longer because there is nothing to read and everything to look at. */
export const BOARD_LAST_LOOK_MS=2600;
export const STORM_STEP_MS=SHIP_GLIDE_MS+70;     // 420 — the human watching their own ship
export const BOT_STORM_STEP_MS=SHIP_GLIDE_MS+30; // 380 — bots stay the snappier of the two
// G14 (Wyatt-approved 2026-07-30): the per-square beat for a TRADE-WIND RIM SWEEP. Derived from the
// constant above rather than invented, so the two pacings stay related if either is tuned.
//
// DELIBERATELY BELOW SHIP_GLIDE_MS, which is the opposite of the rule stated for the two constants
// above — and the reason is the difference between the two motions:
//   - A STORM PUSH is 1-2 discrete squares, and the point is to READ each one. Hence a beat that
//     clears the 350ms glide so the boat comes to rest.
//   - A RIM SWEEP is a long CONTINUOUS ARC. An arc can span nearly half the rim (arc lengths are
//     randomised per game, src/engine/index.js:70-73), so a storm-paced 420ms per square would run
//     six seconds for one sweep. At ~95ms the ship retargets mid-glide, which here is exactly what
//     is wanted: it reads as one continuous travel ALONG the ring rather than a row of hops. That
//     is what "square-by-square, quickly" should look like.
// ONE constant, so host and guest are paced identically by construction.
export const RIM_SWEEP_STEP_MS=Math.round(BOT_STORM_STEP_MS/4); // 95
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// CORRECTION, 2026-07-31, FROM A SCREEN RECORDING (`notes/trade winds animation bug.mov`).
//
// The paragraph directly above is WRONG about what 95ms actually looks like, and it was believed
// for a full day because it reasons about the code rather than about the screen. Retargeting a
// 350ms glide every 95ms does NOT read as "continuous travel ALONG the ring". It makes the boat a
// heavily damped FOLLOWER of its target, and a damped follower chasing a target around a curve
// takes the CHORD, NOT THE ARC — so the boat cuts the corner and drifts diagonally across the
// middle of the board, over the islands, arriving late and never touching the ring at all.
//
// THE PROOF IS IN THE RECORDING, and it is a detail nobody thought to look for: `activeRing` (the
// white sonar ripple, src/ui/board.js) is moved by the SAME paintShipAt() call on the SAME beat,
// but it carries NO css transition — so it snaps to each square exactly. Frame-stepping the
// recording, the ring runs roughly TWO SQUARES AHEAD of the boat for the entire sweep. The ring was
// drawing the correct path the whole time; the boat simply never went there.
//
// Wyatt: "the boat kind of gets dragged over the islands in a shorter version of the ark." The arc
// looks short because the boat is cutting across the inside of it.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// SECOND CORRECTION, 2026-07-31 — AND THE END OF PER-SQUARE STEPPING ALTOGETHER.
//
// The square-by-square fix above WORKED, and that is exactly what was wrong with it. Wyatt, having
// watched it: *"it works, technically, but it looks really jittery because it's working exactly as
// we designed it… it moves according to a step function instead of a smooth, rounded motion."*
//
// Landing on each square is the correct behaviour for a STORM PUSH, where 1-2 discrete squares are
// the thing being read. It is the wrong behaviour for a rim sweep, which is a boat being carried by
// a current along a curve. A ring walked one cell at a time is a staircase, and no per-square beat
// — however well tuned — can be a smooth arc. So the sweep no longer steps at all: it interpolates
// along a spline through the ring cells and is driven by elapsed time.
//
// RIM_SWEEP_STEP_MS is kept ONLY as the basis for the duration below, so the new motion inherits
// the pace the old one was tuned to rather than inventing a fresh number. Nothing steps by it now.
//
// TIMER-DRIVEN, NOT requestAnimationFrame — this is not a preference, it is the lesson already
// written into src/ui/panel.js's typewriter: rAF callbacks are FULLY SUSPENDED (not throttled) in
// a hidden tab, so an awaited rAF loop hangs forever and freezes the whole game loop the moment a
// player switches tabs. This was reproduced live on 2026-07-31 while trying to instrument the bug:
// the automation tab reported visibilityState "hidden", rAF returned zero frames, and the game
// stalled mid-turn every time. setTimeout keeps firing (merely throttled) when hidden.
//
// The tick is paired with a LINEAR css glide, so the browser interpolates between our discrete
// targets and absorbs the timer jitter setTimeout has and vsync-aligned rAF does not. That pairing
// is what makes a setTimeout-driven motion look as smooth as an rAF one — but ONLY if the glide
// outlasts the tick. See MOTION_BRIDGE_TICKS below: "equally short", which is what this paragraph
// said for a fortnight, is the one length that cannot work.
// UNITS: milliseconds BETWEEN motion updates — so SMALLER is smoother, not larger. 16ms is ~60
// updates a second, which is the display's own refresh rate and therefore the practical ceiling:
// going lower buys nothing a screen can show. (Wyatt asked for "48" reading 24 as a frame rate;
// 16ms is ~60/sec, i.e. more than the 48/sec he was after, in the direction he wanted.)
export const RIM_SWEEP_TICK_MS=16;
// playtest 21 item 6: the motion tick for a routed sail. Same value and same reasoning as the rim
// sweep's — small enough that the eye reads one continuous travel, and paired with a one-tick
// LINEAR ship glide so the browser bridges between successive targets. It is a TICK RATE, not a
// pace: the route's duration is SHIP_GLIDE_MS regardless, so lowering this buys smoothness and
// costs paints, and changes nothing about how long a move takes.
export const SAIL_ROUTE_TICK_MS=16;
/* HOW LONG THE BRIDGING GLIDE RUNS, IN TICKS — and "one tick" is precisely the value that cannot
   work, which is what both steppers shipped with until playtest 22 (Wyatt: "the ships movement is
   not smooth; it feels jittery").

   MEASURED, headless at a real 61fps, sampling the ship's RENDERED transform (getComputedStyle,
   which returns the live animated matrix) on every animation frame through a real four-leg routed
   sail. The control is a plain 700ms CSS glide on the same element — a motion already known to be
   smooth, so it proves the sampler can tell the two apart at all:

     bridge = 1 tick  (16ms, what shipped)   48% of the fast core's frames FROZEN   peak jump 20.0px
     bridge = 2 ticks (32ms)                  0% frozen                             peak jump 10.6px
     bridge = 3 ticks (48ms)                  0% frozen                             peak jump  9.5px
     one 700ms CSS glide (control)            0% frozen                             peak jump  5.3px

   At one tick the per-frame sequence is a perfect sawtooth — 0.1 0.0 0.5 0.0 1.3 0.0 2.8 0.0 —
   the boat advancing on every OTHER frame in doubled steps. THE RACE IS WITH THE FRAME CLOCK, NOT
   THE TIMER: a transition exactly as long as the tick has at most one frame in which to run, so
   whether a frame shows an intermediate value at all depends on where setTimeout happens to land
   inside it. Two ticks means a transition is always still in flight when the next target lands —
   the measured tick gap ran 16-36ms — so the browser has something to interpolate every frame.

   THE COST IS LAG, AND LAG ROUNDS CORNERS — the chord bug of 2026-07-31 in a milder form, so it is
   measured too, and against the stepper's OWN targets rather than against arithmetic of mine (the
   targets are on the drawn route by construction). Max excursion off the route: 4.5px at 2 ticks
   (0.11 of a cell), 8.2px at 3, 12.7px at 5. Two ticks buys the whole of the smoothness and costs
   a ninth of a cell, so it is the setting; three buys nothing more and costs twice as much.

   ONE constant for BOTH steppers (routed sail and rim sweep) — they are the same mechanism and had
   the same defect, so they are not allowed to drift apart. It is expressed in TICKS rather than
   milliseconds for the same reason RIM_SWEEP_MS_PER_CELL is derived: the thing that matters is the
   ratio to the tick, and a millisecond figure would quietly stop being right the moment a tick
   rate is tuned. */
export const MOTION_BRIDGE_TICKS=2;
// Progress is always derived from ELAPSED TIME, never from a tick count — panel.js's other lesson:
// a chain that counts ticks can never catch up, because each tick only schedules the next after its
// own overhead, so one slow callback drifts every remaining one. Deriving from elapsed time means a
// late tick simply advances further along the curve.
export const RIM_SWEEP_MS_PER_CELL=RIM_SWEEP_STEP_MS+15; // 110 — inherits the tuned per-square pace
// Arcs are randomised per game and can span nearly half the ring, so duration is clamped at both
// ends: a 2-cell sweep should not be an instant flicker, and a 12-cell one should not be a journey.
export const RIM_SWEEP_MIN_MS=420;
export const RIM_SWEEP_MAX_MS=1500;
// How long the boat takes to SAIL INTO the trade-wind square before the winds take hold. The square
// the player clicked was previously never drawn at all: the board redraw that would have shown it
// and the sweep's first paint ran in one synchronous block with no yield between them, so the
// browser only ever painted the second. Hence the sweep began with the boat still rendered inland.
// This value is BOTH the landing glide and the wait, so the landing always completes in exactly the
// time we wait for it — the two can never drift apart and re-create the re-aimed-mid-glide bug.
//
// 2026-07-31, Wyatt: *"decrease the pause on arrival to 0 so it looks like it immediately gets
// swept up once it lands in the trade wind square."* This is NOT dead time — it is the boat sailing
// in, and at the previous SHIP_GLIDE_MS (350) the winds already took hold the very instant it
// landed. So what read as a pause was the LANDING being slow, and the fix is to make the landing
// quick rather than to remove it: at 140ms the boat visibly arrives and is carried off in what
// reads as one continuous motion.
//
// 0 IS SUPPORTED AND MEANS SOMETHING DIFFERENT: skip the landing entirely, so the winds take the
// boat while it is still sailing in. That re-creates the original complaint — the boat never
// reaches the trade winds before moving — so it is deliberately not the default.
export const RIM_SWEEP_ARRIVE_MS=140;

// D-23 (Wyatt-approved 2026-07-29): bot narration used to hold on screen for LESS time than the
// identical human line (BOT_MSG_HOLD_MULTIPLIER 0.45 vs MSG_HOLD_MULTIPLIER 0.72) — a violation of
// D-18's "the only axis of variation is who's reading, never who acted". Wyatt: "let's have all bot
// narration events last the same length as humans so we can finally bring everything into parity" —
// a speed slider is planned for later, but until then bot and human share ONE hold curve.
// botMsgHoldMs is kept (not deleted) purely so existing call sites and imports don't need to churn;
// it is now a pure alias for msgHoldMs and carries no formula of its own.
export function botMsgHoldMs(text){return msgHoldMs(text);}

// Phase 15 (NARR-06/D-15): a chat bubble is another player typing TO you, not the game reporting —
// it earns the extra beat, so it is deliberately pinned to today's pacing rather than riding
// msgHoldMs's own cut. Same base/per-char/pause formula and the same 1200/7000 clamp as the
// shared narration curve, but its own named multiplier applied to the clamped result — this
// constant is what lets the narration curve and the bubble curve drift apart on purpose from here
// on. Set to 0.8 (msgHoldMs's PRE-cut value, not 1.0) so chatBubbleHoldMs(t) reproduces exactly
// what the shared curve returned for the same t before this phase's 10% cut landed.
export const CHAT_BUBBLE_HOLD_MULTIPLIER=0.8;
export function chatBubbleHoldMs(text){
  text=text||"";
  const base=1000,charTime=50;
  let raw=base+text.length*charTime;
  const body=text.replace(/[.,!?]+$/,""); // trailing punctuation doesn't count as a mid-string pause
  const pauses=(body.match(/[,!?.]/g)||[]).length;
  raw+=pauses*300;
  return Math.round(Math.min(Math.max(raw,1200),7000)*CHAT_BUBBLE_HOLD_MULTIPLIER);
}

// reads a boat's current on-screen position straight off its own <g>, rather than deriving it
// from game.events[evIdx] — that array is still empty during the pre-round intro narration (boats
// are already docked and drawn by drawBoard() at that point, just not yet driven by real events),
// so a chat bubble sent before "Let's start" would otherwise have nowhere valid to anchor to.
export function boatXY(i,shipEls){
  const el=shipEls[i];if(!el)return null;
  const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
  return m?[parseFloat(m[1]),parseFloat(m[2])]:null;
}

// ---- ask(): route the decision to whichever browser owns this seat ----
// opaque pastel blend of a captain color toward white — baked in as a solid color instead of
// alpha-over-background, so it reads correctly regardless of what panel it sits on (previously
// a semi-transparent background let the yellow "needsAction" panel show through and shift hues,
// e.g. the blue captain looked green).
export function pastelize(hex,alpha=.16){
  const n=parseInt(hex.slice(1),16),r=n>>16&255,g=n>>8&255,b=n&255;
  const mix=c=>Math.round(c*alpha+255*(1-alpha)).toString(16).padStart(2,"0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}
export function apBtnStyle(col){return col?` style="border:2px solid ${col};background:${pastelize(col)};font-weight:700"`:"";}
/* ================= ONE BUTTON ROW, BUILT IN ONE PLACE (02.1-03) =================

   The host's localAsk (flow.js) and the guest's watchPrompt (orchestrator.js) used to build this
   markup from two separately-maintained template literals, and orchestrator.js's own comment named
   the hazard in as many words: "this renderer is a genuine second copy (host and guest render
   prompts from different sources), so a change to one that skips the other reintroduces the bug on
   whichever side was forgotten." Six fields had already drifted and been caught ONE AT A TIME —
   `disabled`, `why`, `back`, `flipIdx`, `stage`, `shorts` — every one of them found by a human
   staring at two browser windows. A seventh, `seat`, was still missing from the guest when this
   was written. This function is why there cannot be an eighth.

   SHARE THE BUILDER, NOT THE CALLER. This is the sailHighlightRect() shape (flow.js:388-419, G25,
   which fixed the same class of drift for sail squares): one pure function decides what the markup
   IS, and each caller keeps its own click wiring. localAsk resolves its own promise with res(i);
   watchPrompt writes an answer to Firebase with sendResponse(prompt.id,i). Those two resolution paths
   are legitimately different — a local promise and a network round trip — and must stay apart.
   Unifying them is NOT what this shares.

   escHtml (recipe.js) rather than a third local escaper. The two `esc`/`escW` closures this
   replaces never escaped ">" at all; escHtml does, so the row is strictly better escaped than
   either copy was. Nothing in 4/ feeds a ">" into a `why` today (checked), so no rendered reason
   changes — this is a hole closed, not a behaviour change.

   Items are {i, label, cls, disabled, why, seat, color}. `seat` MAY BE 0 — seat 0 is a real
   captain — so it is tested against null and never for truthiness. `data-why` is written only when
   the option is BOTH disabled and has a reason, because that attribute exists for showWhy() to
   speak when a greyed circle is tapped, and a live button has nothing to explain.

   The narration-box reveal rule (.apBack -> .apMsg -> .apBtns -> .apSub) is untouched by this: it
   builds only what goes INSIDE .apBtns, and never the order panel() assembles around it. */
export function optionButtonsHTML(items){
  return (items||[]).map(it=>`<button class="apBtn ${it.cls||""}${it.disabled?" apDisabled":""}" data-i="${it.i}"${it.seat!=null?` data-seat="${it.seat}"`:""}${it.disabled?` aria-disabled="true"`:""}${it.disabled&&it.why?` data-why="${escHtml(it.why)}"`:""}${apBtnStyle(it.color)}>${it.label}</button>`).join("");
}
// the small circular "‹" escape hatch that renders ABOVE the message rather than competing with
// the real choices in the button row. Both call sites hand-built this identical string; same
// reason as the row above, one definition.
export function backButtonHTML(idx){return `<button class="apBack" data-i="${idx}" aria-label="${say("button.backAria",{})}">‹</button>`;}

/* ================= ONE COIN SLIDER, BUILT AND WIRED IN ONE PLACE (05-01 Task 3, MP-08) =========

   Wyatt, 2026-08-23: "guest should OBVIOUSLY get the real coin slider, and you already know why —
   guests and hosts are given the same experience." (D-55.) It was never a decision: CLAUDE.md
   rule 23 / DISPLAY-RULES §1 already say host/guest decides WHO COMPUTES and WHO CREATES THE ROOM,
   never WHAT IS DRAWN, and rule 8 says the same gesture behaves the same way everywhere unless he
   chose the exception. He did not choose this one — the code itself had been flagging it as an open
   hole since playtest 21 ("close this if /4 ever ships online multiplayer"), which is an admission,
   not a ruling. /4 is shipping online multiplayer. This is that closure.

   THE DESIGN-TIME QUESTION, answered before a line of it was written: what makes the host's coin
   control and a guest's coin control agree? THEY ARE THE SAME TWO FUNCTIONS. Not two controls kept
   in step. localAsk (flow.js) and watchPrompt's ask branch (orchestrator.js) both name
   sliderWrapHTML and wireSlider directly — no tier-only wrapper, because a wrapper is exactly what
   stops the parity gate from seeing a convergence.

   THE CLASS NAMES ARE LOAD-BEARING AND THAT IS WHY THIS IS ONE BUILDER. stage.js identifies the
   slider BY CLASS in two places: menuButtons exempts `input:not(.apSlider)` so a slider does not
   knock its own prompt out of radial mode, and the placement memo key reads `.apSliderWrap` without
   which the bar renders at 0,0 in the corner. A guest whose markup differed by one class name would
   get a flat card where the host gets the radial bloom — the 2026-08-19 complaint, waiting to happen
   an eighth time. With one builder that is unrepresentable.

   WHAT CROSSES THE WIRE AND WHAT DOES NOT. The spec is {min,max,start,ref,fmt,aria}. Four of those
   six are a plain number or a string and ride across untouched. The two that cannot:
     - `fmt` is a closure over live game state, so it is PRE-RENDERED on the host into `texts` —
       max-min+1 short strings, one per stop. It is not dropped: the pill re-stating the whole deal
       as ye drag is the reason the number is never read in isolation (TRADE-SYSTEM §4), and a guest
       handed a bare number would have a different control again.
     - `ref` is the mutable object the CALLER reads the answer out of. It does not cross and does not
       need to: the guest builds its own ref, the chosen number rides home beside the button index
       as {i,n}, and ask() lands it in the HOST's ref before resolveOpt ever runs. So coinSlider's
       single logQuantity() call fires for a remote drag exactly as it does for a local one — the
       decision-log requirement satisfied BY CONSTRUCTION rather than by care, which is the point,
       because HARD-WON-LESSONS §5 is the account of this very control replaying at its floor. */
export function sliderWrapHTML(sl){
  /* W6-1 (Wyatt): "'Would ye offer any coin on top?' appears with NO SLIDER when the player has no
     money left. Expectation: the slider appears greyed out." A dead purse still gets the control —
     the question makes no sense without it — but it must LOOK dead, because a live-looking bar that
     cannot move invites a drag that does nothing. `disabled` does both jobs at once: the browser
     stops the drag and stops the keyboard, and the stylesheet greys it, so there is no second
     mechanism to keep in step. */
  const dead = sl.disabled ? " disabled" : "";
  return `<div class="apSliderWrap${sl.disabled ? " apSliderDead" : ""}"><input class="apSlider" type="range" min="${sl.min}" max="${sl.max}" value="${sl.start}" step="1"${dead} aria-label="${escHtml(sl.aria||"Amount")}"><output class="apSliderOut">${sl.start}</output></div>`;
}
/* The deal re-stated at THIS stop. `fmt` on the tier that has the game, `texts` on the tier that was
   handed the strings — one function so the two can never say different things at the same stop. */
export function sliderText(sl,n){
  if(sl.fmt)return sl.fmt(n);
  if(sl.texts&&sl.texts[n-sl.min]!=null)return sl.texts[n-sl.min];
  return null;
}
/* Wires the control the markup above built. `sl.ref.value` is where the running position lands, and
   the CALLER reads its answer from there — locally on the drag, remotely when ask() unpacks {i,n}.
   Same function, same class names, same repaint, on every tier. */
export function wireSlider(root,sl){
  const inp=root.querySelector(".apSlider"),outEl=root.querySelector(".apSliderOut");
  if(!inp)return;
  const paint=()=>{
    const n=+inp.value;
    if(sl.ref)sl.ref.value=n;
    if(outEl)outEl.textContent=String(n);
    const t=sliderText(sl,n);
    if(t!=null){const m=root.querySelector(".apMsg");if(m)m.innerHTML=emojify(t);}
  };
  inp.addEventListener("input",paint);
  paint();
}
/* The wire form of a slider spec: the four serialisable fields plus the pre-rendered strings.
   Built on the host, where the game lives. Returns null when there is no slider, so ask()'s payload
   simply never carries the key — additive, omitted when absent, the same shape netSetNarr's
   variants/wait params use, so an old client reading a new payload never sees it. */
export function sliderWirePayload(sl){
  if(!sl)return null;
  const texts=[];
  for(let n=sl.min;n<=sl.max;n++){const t=sliderText(sl,n);texts.push(t==null?"":String(t));}
  /* `disabled` CROSSES THE WIRE, and leaving it off was a rule-23 fault caught by CEO Review 19.
     W6-1 greys the control when there is nothing to choose; the guest rebuilds its spec from THIS
     payload alone (orchestrator.js Object.assigns it), so a flag missing here means the host sees a
     dead bar and the guest sees a live one — in the exact control TRADE-SYSTEM.md says every seat
     drags. The commit that added the greying argued the case against itself: "a live-looking bar
     that cannot move invites a drag that does nothing." That was the guest's screen for one commit.
     Omitted when false so an older client reading a newer payload is unaffected, the same additive
     shape the rest of this payload uses. */
  const out={min:sl.min,max:sl.max,start:sl.start,aria:sl.aria||"Amount",texts};
  if(sl.disabled)out.disabled=true;
  return out;
}
// opts[i] can come back missing — a remote seat's answer can resolve to null (remotePrompt
// resolves null when Firebase gives back a response with no `choice` field, e.g. a dropped
// connection), or a replay log can be stale/corrupt. Left unguarded that throws mid-decision
// and silently stalls whatever awaited it; falling back to a safe index keeps play moving.
export function resolveOpt(opts,i,fallback){
  if(opts[i])return{i,opt:opts[i]};
  console.warn("resolveOpt(): invalid choice index",i,"of",opts.length,"options — defaulting to",fallback);
  return{i:fallback,opt:opts[fallback]};
}
/* `extra` (playtest 21 item 7) carries a SLIDER spec for a quantity prompt. IT NOW REACHES EVERY
   SEAT (05-01 Task 3, MP-08, D-55). The named exception that used to sit here said this must be
   closed if /4 ever shipped online multiplayer; /4 is shipping online multiplayer, so it is closed.
   The four serialisable fields plus pre-rendered `texts` ride across in `slider:` (sliderWirePayload
   above); the guest builds the SAME markup with the SAME builder, and the number it drags to comes
   home beside the button index as {i,n} and lands in this tier's `ref` below, before resolveOpt.
   coinStepper is gone from the tree, and with it the routing-dependent decision-log length. */
export function ask(msg,opts,colors,sub,extra){
  // during reload-replay, return the recorded choice (an index) mapped through the freshly
  // rebuilt opts — so object-valued options resolve to live game references, not stale copies.
  if(appState.replaying){
    if(appState.dlogIdx<appState.dlog.length){appState.dlogN++;return Promise.resolve(resolveOpt(opts,appState.dlog[appState.dlogIdx++],0).opt.value);}
    netHandlers().onEndReplay();
  }
  const askSeat=appState.curSeat;
  /* THE SHOT CLOCK IS TEMPORARILY OUT OF THE GAME — Wyatt, 2026-08-28, choosing removal over
     engineering the one-activity-engine convergence around it: "i'd prefer to do it even if it
     breaks shot clock, and to temporarily remove the shot clock from the game." What stood here
     was the D-02/18-05 arming machinery: an `armed` promise resolved by a one-shot continuation
     (appState.clockPendingArm) that panel()'s reveal seam claimed once the buttons were truly
     clickable, so a captain never lost reveal-time from their 30s window. It comes BACK against
     the converged dispatch — racing ONE resolver is an easier problem than racing two, which is
     the whole reason removal won. The reveal-gating half of that seam (buttons hidden until the
     typewriter finishes and the board settles) is a separate feature and still lives in panel().
     Removal gate: scripts/qa/shotclock_removed_check.mjs. */
  // D-10 DELIVERY (F7, found in the 2026-07-29 two-tab playtest): ONE broadcast reaches EVERY
  // client, so content that branches on the local viewer can never be right. This line used to read
  // `seat===appState.mySeat?msg:spectatorLine` — but ask() runs on the HOST, so `mySeat` is the
  // host's seat, and whichever branch the host took was sent to the whole table. Measured live on a
  // guest: the host's raw prompts arrived verbatim ("Wyatt, what'll ye do:" held 1694ms), and of
  // 2516 recorded narration lines, ZERO contained "is deciding" — the spectator line never reached
  // any client at all.
  //
  // Fixed by using the mechanism that already ships: broadcast the SPECTATOR line as the neutral
  // content, and the actor's own prompt as that seat's variant. netNarrate forwards `variants` to
  // pickNarrVariant on the host and through netSetNarr to watchNarr on every guest, so each client
  // selects for itself. No new copy — both strings already existed.
  // scripts/ui_contract_check.js assertion 7 gates the rule.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
  /* 19 — THE HOST'S DEAD BOARD, and this is the line that was dying on it. While a guest answers,
     every other screen holds this "…is deciding…" line, and it is the only thing explaining the
     pause. On the ordinary hold curve it retired after a few seconds and left a board with nothing
     on it at all — Wyatt's shot 19, where the host reads as dead while the guest still has the
     prompt up. `wait` means it registers no dismissal deadline and stands until the answer arrives
     and fires the next real line, which is his own wording for item 19: "it should disappear when
     their teammates have played". It is fire-and-forget — nothing awaits it — which is what makes
     an un-deadlined bubble safe here (see stageFlash). */
  netHandlers().onBroadcast(sayAll("wait.deciding",{p:seat(askSeat)}).html,[{seat:askSeat,html:msg}],{wait:true});
  const isFlip=opts.length===1&&!!opts[0].flip;
  // `sub` is optional helper text rendered under the button row; an option flagged `disabled`
  // renders greyed and non-clickable (notes/edits #5) — used for the too-poor Attack button.
  const base=decisionIsLocal(askSeat)?netHandlers().onLocalAsk(msg,opts,colors,sub,extra)
    :netHandlers().onRemotePrompt(askSeat,{kind:"ask",msg,labels:opts.map(o=>o.label),
       colors:colors?colors.map(c=>c||""):null,classes:opts.map(o=>o.cls||""),
       // playtest 21 item 5: `why` rides across with `disabled`, because the two are one fact and
       // a guest that got the greying without the reason would show a dead circle that answers
       // nothing when tapped — the exact complaint, reintroduced on the other side of the wire.
       disabled:opts.map(o=>!!o.disabled),why:opts.map(o=>o.why||""),sub:sub||null,flip:isFlip,
       // 2026-08-19, Wyatt: "the guest doesn't have radial action menus", and "the narration box
       // stage doesn't look the same for guest and host". Both were THIS payload, missing two
       // fields — the same shape as the `why` fix five lines up, which is why that note is worth
       // reading before adding an option flag that the guest also has to see.
       //   `shorts` — menuButtons() (stage.js:1029) only blooms a prompt into the radial ring when
       // every button either carries a short label or is <=16 characters. "Dock at the Flour Patch"
       // is neither, so with `short` left behind the guest silently fell back to a flat card for
       // the commonest prompt in the game. Empty string, not null, for absent: matches `classes`
       // and `why` above and avoids RTDB's null-hole behaviour in arrays.
       //   `stage` — localAsk stamps dataset.pp4Stage from it (flow.js:214) and the stage loop
       // turns that into the centre-stage treatment. Without it the joining captain got a small
       // pill where the host got the dimmed 420px card: same words, different game.
       shorts:opts.map(o=>o&&o.short!=null?o.short:""),
       //   `seats` — the SEVENTH field of this exact class, and the last one still missing when
       // 02.1-03 went looking. An option carrying `seat` blooms its circle over the boat it NAMES
       // rather than around the boat choosing (stage.js's radial placement reads it back off data-seat — named, not line-numbered, because the line moves and the citation rots) — the
       // battle side-bet's "Call Dough Hook" is the case that needs it. Without this the spectating
       // guest got the ordinary fan while the host got the anchored one: same words, different
       // game, which is the same sentence the `stage` fix five lines up had to be written in.
       //   Empty string for absent, matching `classes`/`why`/`shorts` above and avoiding RTDB's
       // null-hole behaviour in arrays. SEAT 0 IS A REAL CAPTAIN, so the test is `!=null`, never
       // truthiness — and the guest reading it back must be just as careful.
       seats:opts.map(o=>o&&o.seat!=null?o.seat:""),
       stage:opts.some(o=>o&&o.stage)?1:null,
       /* MP-08. Additive and OMITTED WHEN ABSENT — sliderWirePayload returns null for a prompt
          with no quantity on it, and Firebase drops a null key, so nothing changes for the ~99%
          of prompts that are just buttons. */
       slider:sliderWirePayload(extra&&extra.slider),
       flipIdx:opts.findIndex(o=>o.flip),back:opts.findIndex(o=>o.back)});
  // With the clock out there is nothing to arm and nothing to race: the answer is the answer.
  // (The no-panel belt and the armed→withShotClock chain that stood here are part of the same
  // atomic removal as the machinery above — inventory D1: removing HALF of it hangs every prompt.)
  const idxP=base;
  return idxP.then(v=>{
    /* A QUANTITY PROMPT COMES BACK AS {i,n} — the button and the number the captain dragged to.
       Unpacked HERE, before resolveOpt, for two reasons. First, resolveOpt has always taken an
       INDEX and an unguarded object would fall through to its fallback, silently answering index 0.
       Second, `n` has to be in `ref` before the caller's own confirm branch reads it, and that
       branch is what calls logQuantity() — so the number reaches the decision log through the ONE
       call a local drag already uses, for a remote drag too.
       A BARE NUMBER MUST STILL WORK: while the shot clock lived, its 30s force-resolve answered
       with a plain 0 — an index, not a pair — and any future forced answer will again. */
    let i=v;
    if(v&&typeof v==="object"&&v.i!=null){
      i=v.i;
      if(v.n!=null&&extra&&extra.slider&&extra.slider.ref)extra.slider.ref.value=v.n;
    }
    const r=resolveOpt(opts,i,0);netHandlers().onLogDecision(r.i);return r.opt.value;});
}
/* ---------- pacing ---------- */
// (The solo-pause gate that used to precede these beats left with play/pause — A-10.)
/* EVERY BEAT IN THE GAME IS AWAITED, SO NO BEAT MAY BE LOST — playtest 22, the stall report
   (Wyatt: "the game just completely stalled, and when i refreshed the browser, the game RESTARTED").

   The turn loop is a chain of awaits: a narration hold, a coin's spin, a pause between storm
   squares. Each one was a bare `setTimeout`, and a `setTimeout` is a promise that a browser is
   allowed to break. MEASURED, headless, with the page visible and unthrottled: two timers armed on
   the same line with the same delay were BOTH never delivered, neither was ever cleared, and a
   250ms setInterval kept counting straight through it — 272 ticks across 72 seconds. One lost
   callback anywhere in that chain and the voyage stops for good, with no error and nothing on
   screen to say so. That is precisely what a stall looks like from the seat.

   So a beat is a DEADLINE with two ways to come due: the timer, which is exact and almost always
   the one that fires, and a single sweeping interval that catches whatever the timer dropped. The
   worst case becomes a beat up to SLEEP_SWEEP_MS late rather than a voyage that never continues.
   One sweeper for the whole game, not one per sleep, so the cost is fixed no matter how many beats
   are in flight — and intervals are what the measurement showed surviving.

   If setInterval is lost too there is nothing left to catch it, and that is an accepted limit: the
   evidence says the two are not lost together. */
const SLEEP_SWEEP_MS=120;
const pendingSleeps=new Set();
setInterval(()=>{
  if(!pendingSleeps.size)return;
  const now=Date.now();
  for(const rec of [...pendingSleeps])if(now>=rec.due)rec.fire();
},SLEEP_SWEEP_MS);
export function sleepMs(ms){
  const wait=Math.max(0,ms||0);
  return new Promise(res=>{
    const rec={due:Date.now()+wait,done:false,
      fire(){if(this.done)return;this.done=true;pendingSleeps.delete(this);res();}};
    pendingSleeps.add(rec);
    setTimeout(()=>rec.fire(),wait);
  });
}
/* ---------- the voyage ran aground ---------- */
/* A THROW IN THE TURN CHAIN USED TO BE A SILENT DEATH. Wyatt's call, 2026-08-14, after the counter
   stall: put something on screen.

   The chain runLiveNet -> the round loop -> humanTurn/botTurn -> every prompt is one long series of
   awaits with nothing catching at the top. A throw anywhere in it rejected all the way up and the
   game simply stopped — empty panel, no captain's-log line, and MEASURED over CDP with
   Runtime.exceptionThrown subscribed: `page errors: NONE`, because the awaiting chain swallows the
   rejection. On a phone he has no console, so a crash and a hang look identical to him, and the
   report that reaches me is "it stalled" rather than a stack. That cost two sessions on one typo.

   THREE RULES SHAPE THIS, and each one is why it looks the way it does:

   1. IT MUST NOT USE THE GAME'S OWN RENDERING. Not panel(), not flash(), not showNarration() — the
      thing that failed may BE the render path, and an error surface that needs the broken machine
      is not a surface. Raw createElement, inline styles, appended to <body>, no imports.
   2. IT MUST CARRY THE BUILD STAMP AND THE ERROR TEXT, read from the DOM rather than imported for
      the same reason. A screenshot of this box is a bug report I can act on; "it stalled" is not.
   3. IT MUST SAY WHETHER A REFRESH WILL HELP. Solo persists as a decision log, so if the fault is
      on a REPLAYED decision a refresh sails straight back into it and comes back at the starting
      position — which reads like a corrupt save and is the second half of every stall report so
      far. When the log is what will be replayed, the box says to start a fresh voyage instead.

   Deliberately NOT a retry or a resume. Play cannot continue past a turn that half-happened — the
   coins, the crates and the decision log would disagree — and an error boundary that lets the game
   limp on is how a small fault becomes an unexplainable one.
   @copy adhoc.stall.aground — pirate voice with the stamp, Wyatt's pick 2026-08-14. */
export function voyageAground(err,where){
  try{
    if(document.getElementById("ppAground"))return;      // first fault wins; later ones are noise
    const stamp=(document.getElementById("pp4Stamp")||{}).textContent||"v4 · build unknown";
    const detail=String((err&&(err.stack||err.message))||err||"unknown");
    // a replayed decision is the case where refreshing makes it WORSE, not better
    const onReplay=!!(appState&&appState.replaying);
    const hasLog=!!(appState&&appState.dlog&&appState.dlog.length);
    const advice=onReplay||hasLog
      ? sayText("aground.freshVoyage",{})
      : sayText("aground.refresh",{});
    console.error("VOYAGE AGROUND"+(where?" ("+where+")":""),err);
    const box=document.createElement("div");
    box.id="ppAground";
    box.style.cssText="position:fixed;inset:auto 12px 12px 12px;z-index:99999;background:#fffdf2;"+
      "border:2px solid #2aa9b8;border-radius:14px;padding:14px 16px;max-height:60vh;overflow:auto;"+
      "font:14px/1.45 system-ui,sans-serif;color:#123;box-shadow:0 8px 30px rgba(0,0,0,.35)";
    const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
    box.innerHTML=
      `<div style="font-weight:800;margin-bottom:6px">${say("aground.title",{})}</div>`+
      `<div style="margin-bottom:8px">${say("aground.body",{})} `+
      `${esc(advice)}</div>`+
      `<div style="opacity:.6;font-size:11px;margin-bottom:6px">${esc(stamp)}`+
      `${where?" · "+esc(where):""}</div>`+
      `<pre style="white-space:pre-wrap;word-break:break-word;font-size:11px;opacity:.8;margin:0">`+
      `${esc(detail)}</pre>`;
    document.body.appendChild(box);
  }catch(e){
    // the surface itself failed — say it the one way that cannot also fail
    console.error("voyageAground() could not render",e,"original:",err);
    try{alert(sayText("error.aground",{err:String(err)}));}catch(_){}
  }
}
// used only to derive flip/spin animation-pacing constants (asyncBattle, asyncBakeoff, fishCast)
// — unrelated to text legibility, which is governed by flash()'s own reveal/hold/fade formula.
export function stepDelay(){return 3000;}
// notes/edits #1 audit: this used to fire-and-forget narrateCurrent() (raw netNarrate(), no
// hold/fade at all) then separately sleep a flat stepDelay()=3000ms regardless of the event
// text's length — the same "one size fits all" bug as narrateLastEvent()/humanFlip() had, just
// hitting the most common narration path in the game (every bot action goes through botBeat()).
// Now narrateCurrent() itself is the thing that paces this beat, via flash()'s length-aware timing.
/* A BOT PAUSES TO THINK. Wyatt, 2026-09-15: "Bots need to have a small about (eg 200ms) of "thinking" time between their actions --
   it's too fast when they dock and flip and crate all back to back." His number. Skipped while replaying (the scrubber must not crawl)
   and when motion is reduced. */
export const BOT_THINK_MS=200;
export async function botBeat(){
  netHandlers().onLiveRender();
  await narrateCurrent();
  if(!appState.replaying)await new Promise(r=>setTimeout(r,BOT_THINK_MS));   // a beat, not an animation — the scrubber is the only thing that skips it
}
/* THE ONCE-PER-VOYAGE CEREMONY GATE — ONE PLACE, BOTH NARRATION PATHS (rule 23, his item 7).
   Wyatt: "Did the on-stage narration for the black market appear the first time all ingredients
   were removed from an island? ... it needs to be there. How did it get lost?" It never got lost.
   It was built into ONE of the game's two narration functions and has been missing from the other
   since the day it shipped (348ccf4, 2026-08-12).

   A HUMAN's dock runs humanDock() -> narrateLastEvent() (src/ui/panel.js), which carried the
   firstDry check. A BOT's dock runs the engine's doDock() -> botBeat() -> narrateCurrent(), right
   here — a separate, older function (written 2026-08-11, a full day before the ceremony existed)
   that had no reference to firstDry anywhere in its body. And `drySeen` is a single voyage-wide
   latch that flips on the first shelf to empty WHOEVER empties it. So when a bot claims that
   shelf, the ceremony is swallowed and can never appear again for the rest of the voyage.
   Measured across 500 seeded games: a bot claims the first dry shelf in 76.0% of solo voyages.
   His report — that it simply was not there — is what a 76% failure rate looks like from a
   player's chair.

   TWO FIXES WERE AVAILABLE AND THIS IS THE WIDER ONE. Adding the same `if(e.firstDry)` line to
   this file would be smaller and the wrong shape: it leaves two narration functions that must be
   kept in step by discipline, which is the definition of a thing that will drift. Rule 23 states
   the move — when a SECOND consumer of the same thing appears, make the FIRST one go through the
   new path too. So panel.js's narrateLastEvent() now calls THIS, and so does narrateCurrent()
   below; the next feature gated on a once-per-voyage stamp gets both paths for free.

   RULE 13 IS THE CHECK THAT IT LANDED: bots and humans have identical rules and affordances.
   After this, who emptied the shelf cannot change whether the table is told.

   WHY THE HANDLER SEAM RATHER THAN AN IMPORT. dryCeremony() draws a centre-stage card and lives
   in panel.js, which imports THIS file — so util.js can never import it back (module_graph_check
   forbids the cycle). handlers.js exists for exactly this edge and already carries onFlash and
   onLiveRender, two calls of the same shape. No new mechanism. */
export async function eventCeremony(e){
  if(!e||!e.firstDry||appState.replaying)return;
  const h=netHandlers();
  if(h.onDryCeremony)await h.onDryCeremony();
}
// keep the yellow action panel in step with the bot's latest move — liveRender only
// updates the board/log/bubble, so without this the panel stays stuck on the last human prompt.
/* ⭐ NARRATION WAITS FOR THE BOARD TO FINISH DRAWING THE EVENT IT DESCRIBES — ON EVERY DEVICE.
   Wyatt, 2026-09-12, before the dock coin was built: "you'll need to have that narration box showing
   the result of the coin flip wait until the coin flip is over." The first build honoured that in ONE
   place — a bot's turn loop, on the host — by awaiting the coin before narrating. That is a decision
   written into the code path that happened to be under the microscope, and it is exactly how the
   coin came to exist for bots and not for humans, and on the host and not on a guest
   (his 2026-09-13 note 8). The board's reaction to an event now lives in the ONE consumer
   (consumeEvent, src/orchestrator.js), which every device runs for every event; this registry is how
   anything that SPEAKS about an event asks that consumer "are you finished with it?". Keyed by the
   event object itself: the host's narrator and a guest's watchNarr both hold the very object the
   consumer was handed. CAPPED, so a narrator can never be held forever by a consumer that is itself
   waiting on a narration — a stalled wait speaks late, it never swallows the line. */
const EV_DRAWING=new WeakMap();   // event object -> {pr, done}
/* EXPECTED the moment an event is QUEUED for drawing (the host's drain batch, a guest's wire queue) —
   not when its consumer starts. A bot's sail and dock land in one burst and are drawn in order; if the
   dock were only marked once ITS consumer began, a narrator asking during the sail's walk would find
   nothing pending and speak over a coin that had not been thrown yet. */
export function expectEventDrawing(e){
  if(!e||typeof e!=="object")return;
  if(EV_DRAWING.has(e))return;
  let done;const pr=new Promise(r=>{done=r;});
  EV_DRAWING.set(e,{pr,done});
}
export function finishEventDrawing(e){
  if(!e||typeof e!=="object")return;
  const rec=EV_DRAWING.get(e);
  if(rec)rec.done();else EV_DRAWING.set(e,{pr:Promise.resolve(),done:()=>{}});
}
export function eventDrawn(e,capMs=9000){
  const rec=e&&typeof e==="object"?EV_DRAWING.get(e):null;
  if(!rec)return Promise.resolve();
  return Promise.race([rec.pr,new Promise(r=>setTimeout(r,capMs))]);
}
/* ⭐ ONE NARRATOR FOR EVERY EVENT, BOT OR HUMAN — Wyatt, 2026-09-13: "there should be no separate track of dialogy
   for botTurn() -- re-architect this away. we use one engine, that accepts as arguments the action taken, the player
   type (human/bot), the location of the player (this browser/remote), and serves an event."
   THERE WERE TWO, AND THEY SAID DIFFERENT THINGS. A human's action was narrated by panel.js's narrateLastEvent(): the
   line every other screen reads PLUS a "ye" version for each captain it named. A bot's action went through this file's
   narrateCurrent(), which read the captain's-log line — third person only, no "ye" versions — and opened every bot turn
   with its own "takes the wheel…" banner that no human turn had. So when a bot attacked or traded with a person, that
   person was told about it as a bystander. Both are now this one function: the event decides the words, the screen
   decides "ye", and who chose the move never enters. narrateLastEvent() and narrateCurrent() are only WHICH event. */
/* ⭐ A COIN THAT IS BEING EXPLAINED WAITS FOR THE WORDS. Wyatt, 2026-09-15: "I think the coin you get from musing should only fly into
   your purse AFTER the narration line has finished writing -- because it's explaining where the coin comes from." So the one consumer
   hands the flight here instead of running it itself, and it is let go when the line has finished TYPING — 9ms a character, the
   typewriter's own rate (stage.js typewriterReveal), not when the line's reading time is up. The 8-second fallback is the safety a
   screen with narration switched off needs: a coin must never be lost because nobody spoke. */
const AFTER_LINE = new Map();
export function afterLine(e, fn){
  if(!e || typeof fn !== "function") return;
  AFTER_LINE.set(e, fn);
  setTimeout(() => runAfterLine(e), 8000);
}
function runAfterLine(e){
  const fn = AFTER_LINE.get(e);
  if(!fn) return;
  AFTER_LINE.delete(e);
  try { fn(); } catch (err) {}
}
export async function narrateEvent(e){
  if(!e)return;
  await eventDrawn(e);   // the board finishes the event (a dock coin's flip and hold) before a word of it
  // settleSideBets() already flashes one aggregate "Lookout's Call settles" message covering
  // every bettor — re-narrating the last individual sidebet event here would just duplicate it.
  if(e.t==="sidebet")return;
  const apNow=document.getElementById("actionPanel");
  if(apNow&&apNow.classList.contains("needsAction"))return;
  // D-10: the BROADCAST payload is built from the viewer-NEUTRAL rendering (never the ambient
  // appState.mySeat-flavored one) plus per-seat variants — netNarrate on the receiving end (the
  // host's own screen) and watchNarr on every guest both select their own line via
  // pickNarrVariant, so building this from anything OTHER than the neutral default would leak
  // the host's own personalised phrasing into every other seat's broadcast.
  const L=describeFor(e,NEUTRAL_VIEWER);if(!L){await eventCeremony(e);return;}
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
    appState.narrEvIdx = appState.game.events.lastIndexOf(e);
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
  // the line is written after 9ms a character; anything waiting on the words (a muse coin) is let go then, not after the hold
  setTimeout(() => runAfterLine(e), 9 * String(L.txt == null ? "" : L.txt).replace(/<[^>]*>/g, "").length + 120);
  await netHandlers().onFlash(L.txt,undefined,undefined,variants);
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
export async function narrateCurrent(){ await narrateEvent(appState.game.events[appState.evIdx]); }
/* NOT EXPORTED (2026-08-31). One fact, one writer: the only caller is applyActiveSeat below,
   which also moves S.activeSeat — the value stage.js:1206 draws FIRST. Sixteen call sites used
   to import this directly and leave the ribbon pointing at the previous captain; they now call
   applyActiveSeat. Un-exporting is what stops the seventeenth from being added by hand.
   scripts/qa/whose_turn_one_fact_check.mjs holds this. */
function setActor(s){appState.curSeat=s;}
/* ONE ACTIVE SEAT (02.15-01 Stage 2, D-25). THE fault of D-24 in miniature, and it was measured
   before it was touched: ribbonTick (ui/stage.js) glows the boat at S.activeSeat ?? appState.curSeat;
   curSeat is written only by setActor and S.activeSeat only by __pp4.actor; and every one of those
   21 call sites lived in the host's live simulation or a local prompt. Not one of the guest's nine
   listeners called either. Measured in a two-tab crew game 2026-08-20, fourteen consecutive samples:
   host curSeat=1 / ribbon glow on boat 1, guest curSeat=0 / glow on boat 0, never moving. That is
   his shot 21 — "top-bar boats: updating with the turn / not updating" — and, through camToSeat
   reading the same notion of whose turn it is, his shot 20 as well.
   ONE FUNCTION, BOTH TIERS, so the two cannot be aimed differently. The host's turn loop calls it
   (humanTurn, botTurn) and so does watchEvents, off the `p: seat` field every meaningful event
   already carries. NO ENGINE CHANGE and none is permitted here: ev() records no actor and the
   schema has no actor field, but `turn`/`sail`/`dock`/`pass`/`attack` all carry `p`. This is the
   same move watchEvents already makes for round, wind, storm and per-seat state.
   TWO GUARDS, BOTH DELIBERATE. Events that carry no seat (`newround`, `end`) leave the indicator
   alone rather than blanking it. And the seat is bounded to the known range before it is used as an
   index (T-02.2-08) — the `ev` node is host-authoritative, which is the same trust already relied
   on for board positions, but a bounded index costs nothing and a trusted one eventually does. */
export function applyActiveSeat(seat){
  /* THE ONE WRITER. Both guards now come from src/shared/storyboard.js's normalizeSeat, so the
     rule for "is this a seat we may point at" has one spelling shared with the event-stream
     derivation the board reads (2026-08-31). Behaviour is unchanged: null in -> nothing written,
     out-of-range in -> nothing written. */
  const ps=appState.game&&appState.game.players;
  const s=normalizeSeat(seat,ps?ps.length:null);
  if(s==null)return;
  setActor(s);
  if(window.__pp4)window.__pp4.actor(s);
}
export function seatLocal(s){return s===appState.mySeat;}
// D-10: a sentinel seat value no real seat index (0..3) can ever equal — passing it as
// viewerSeat forces isLocalTo()'s neutral (never-addressed) branch, used to compute the
// viewer-neutral default line narrationVariants() diffs every per-seat rendering against.
export const NEUTRAL_VIEWER=-1;
// D-10/Pitfall 2: viewerSeat null/undefined MUST delegate to seatLocal()'s live appState.mySeat
// read and therefore behave byte-identically to today — scripts/bot_storm_narration_test.js  [UNGATED-IN-4: bot_storm_narration_test.js reads the root tree, not this one]
// never sets appState.mySeat, so this default is exactly what keeps that script green
// unmodified. An explicit numeric viewerSeat (including NEUTRAL_VIEWER) instead compares
// directly, ignoring whatever the live appState.mySeat happens to be.
export function isLocalTo(seat,viewerSeat){
  return viewerSeat==null?seatLocal(seat):seat===viewerSeat;
}
// pass & play: every human seat shares this one browser, so any human seat resolves locally
// regardless of mySeat — unlike real online multiplayer, there's no other device to reach over
// remotePrompt/remoteDraftPrompt (which would throw anyway, since db/room are null here).
/* THE THIN WRAPPER. The RULE is isDecisionLocal() in src/shared/storyboard.js — pure, so the gate
   that guards it runs the same function the game runs instead of a typed-out copy of it (which is
   how CEO review 41 walked past decider_table_check with one appended clause). This half knows
   only WHERE the facts live; it decides nothing. */
// ONE LINE ON PURPOSE: mode_fork_check counts LINES carrying a who-is-playing word, so splitting
// this wrapper across three lines raised the file's fork count by one without adding a fork. The
// counter is a debt ceiling and it should keep meaning what it says.
const EMPTY_SEAT=Object.freeze({});   // a missing seat has no strategy; never a fresh object per call
export function decisionIsLocal(s){const player=((appState.game&&appState.game.players)||[])[s]||EMPTY_SEAT;return isDecisionLocal({sharedDevice:appState.passAndPlay,strategy:player.strategy,isMySeat:seatLocal(s)});}

/* ---------- the clock and pause both stood here ----------
   Removed in two rulings, 2026-08-28: the shot clock ("temporarily remove the shot clock", see
   ask() above), then play/pause itself (A-10: "you can simply remove play/pause from this latest
   work — if we need to put it in again later, we'll re-engineer it"). What lived here across the
   two removals: startShotClock/stopShotClock/rearmShotClock/shotClockTick/applyShotClockPenalty/
   applyTimerOff/withShotClock, then soloBotGame/applyPauseState/toggleShotClockPause. The design
   decisions they carried (D-05/06/07; CLOCK-02's networked pause; the app-switch auto-pause's
   hidden-tab history) are in git history at this file — read the log before re-deriving any of
   it. sleepMs's sweeper belt above is NOT pause residue: it is the measured defence against a
   browser dropping setTimeout callbacks, and it must stay. */
// CORRECTED 2026-08-31: this comment used to say "mirrors render()'s derivation". IT DOES NOT —
// render() also stops at `ovens` and `bake`; this walk knows only `turn`. It was true when written
// and rotted when render()'s copy was widened, which is exactly the rot a behavioural comment
// carries (rule 6). It is now one walk, shared/storyboard.js, with the difference passed in.
// CURRENTLY UNCALLED (its last consumer, the
// pause panel's "waiting" label, left with play/pause at A-10) — kept because the clock's return
// needs exactly this derivation, and it is pure over the event stream.
export function currentTurnSeat(){
  if(!appState.game||!appState.game.events)return null;
  return deriveActiveSeat(appState.game.events,appState.evIdx);
}
/* ---------- board pops (event -> emoji animation) ---------- */
export function spawnPops(e,cellPx){
  if(!e)return;
  const st=e.state;
  const at=i=>{const [x,y]=shipXY(st[i].pos,i,st,cellPx);return [x,y-cellPx*.42];};
  const fn=EVENT_NARRATION[e.t];if(!fn)return;
  const r=fn(e,at,cellPx);
  (r&&r.pops||[]).forEach(([xy,emo,big,img,cls])=>netHandlers().onPopEmoji(xy[0],xy[1],emo,big,img,cls));
}

/* ---------- misc UI refresh / bot seat strategy ---------- */
// notes/edits BOT-01/BOT-02: bot personality is no longer anyone's choice — it belongs to the
// captain. Indexed to match NAMES: Davy Scones, Crustbeard, Dough Hook, Flaky Jack. Every seat
// that fills with a bot takes its captain's temperament, so "Crustbeard" always plays like
// Crustbeard whether you meet him in solo or multiplayer.
const SEAT_BOT_STRAT=["balanced","pirate","trader","rusher"];
export function seatStrat(i){return SEAT_BOT_STRAT[i%SEAT_BOT_STRAT.length];}
export function updateRecipeBanner(){
  // recipe is now shown as semi-transparent chips in your own captain row (see render());
  // refresh the board so those chips appear as soon as recipes are drafted
  if(appState.game&&appState.game.events&&appState.game.events.length)netHandlers().onRender();
}
// #6: preload the core board art up front so a slow connection doesn't render the board with
// missing/fallback tiles that pop in one by one. Each image resolves on load OR error (never
// rejects), and boot() caps the whole wait with a timeout, so the loader can never hang the game.
/* THE COIN'S OWN FACES WERE NEVER IN HERE — playtest 22 item 13 (Wyatt): "Make sure to load all of
   the coin flip images immediately when the game loads; currently they seem to be loading during
   the first flip, which makes them fail to appear sometimes."
   Exactly right, and the reason is a drift this list is prone to: it was written around the BOARD
   (art, docks, boats, islands, crates) and the flip's five images were never added, so the first
   toss of a voyage fetched its own socket, spin and faces mid-ceremony. Everything else on the
   board can arrive a beat late and nobody notices; a flip CANNOT, because it is a timed animation
   that has already started.

   That line — "preload what a TIMED CEREMONY needs, not every icon" — was Wyatt's deliberate
   trade-off through 2026-08-31. He REVERSED it 2026-09-01 (INBOX-20260901T1335Z): "we need to load
   all game assets up front; i notice sometimes that the 'fire the ovens' graphic loads dynamically
   when it is called, which will make it appear blank on slow connections. Bad engineerign! [sic]"
   The recipe/badge art below is the confirmed, measured mechanism: RECIPE_BOOK's 21 pastry
   illustrations (recipe.js) and BADGE_POOL's emblems (this file) are plain `<img src>` tags that
   fetch cold the first time the recipe picker, the recipe modal, or the End-of-Voyage award screen
   actually renders them — exactly the "loads dynamically when called" complaint, on the two asset
   families that were never in this list. Safe to add here because every call site of
   preloadAssets() already fires it WITHOUT awaiting except the mid-voyage-resume path, which caps
   it at a 6s Promise.race — this was already true before this change, not a new guarantee. */
/* EVERY ASSET URL THE SHARED MODULE KNOWS ABOUT, READ OFF THE MODULE ITSELF.
   Rule 9's shape — derived from what the game already computes, never a list somebody types.
   THE HISTORY IS THE ARGUMENT FOR THIS. The list below was hand-kept for its whole life and it
   drifted every single time somebody added art: the flip's five faces were missing until a playtest
   caught them mid-ceremony, ING_HOLE_IMG was missing until a driven run failed on holes/sugar.png,
   the recipe and badge families were missing until 2026-09-01. Each was fixed by appending one more
   name, which is the move that guarantees the next omission. CEO Review 80 then found the same
   fault AGAIN and it was the biggest one yet: the entire `assets/icons/` family — 78 files —
   including FLAME_IMG, the flame in every "fire the ovens" line, WHICH IS WYATT'S OWN NAMED EXAMPLE
   of the bug ("i notice sometimes that the 'fire the ovens' graphic loads dynamically when it is
   called, which will make it appear blank on slow connections. Bad engineerign!").
   A fifth append would have been the fifth wrong answer, so the list is now the derivation:
   anything exported as `*_IMG` whose value is an asset path is warmed, and a new icon is covered
   the moment it is declared. `scripts/qa/preload_recipe_badge_check.mjs` guards the shape. */
export function sharedAssetUrls(){
  const out=[];
  for(const [name,val] of Object.entries(SHARED)){
    if(!name.endsWith("_IMG"))continue;
    // scalars, arrays (BOAT_IMG, ISLAND_SHAPE_IMG) and lookup objects (ING_IMG, EMOJI_IMG) all appear
    // under this suffix, so flatten whatever shape the constant happens to have.
    const vals=typeof val==="string"?[val]:Array.isArray(val)?val:val&&typeof val==="object"?Object.values(val):[];
    for(const u of vals)if(typeof u==="string"&&u.startsWith(ASSET_BASE))out.push(u);
  }
  return [...new Set(out)];
}
/* THE ART A JAVASCRIPT CONSTANT CANNOT SEE — read off the page's own stylesheets.
   `sharedAssetUrls()` above derives from `*_IMG` constants, so it is structurally blind to a picture
   that exists only inside CSS, and one does: the storm's rain texture (`#stormOverlay .rlayer`,
   index.html). Measured 2026-09-02 against INBOX-20260901T1335Z — of the 144 pictures the game
   names, `assets/rain-streaks.png` was the ONE that boot never asked for, so the first storm of a
   voyage fetched its own rain mid-storm. That is Wyatt's complaint word for word: "loads dynamically
   when it is called, which will make it appear blank on slow connections."
   THIS IS A DERIVATION AND NOT A FIFTH NAME ON THE LIST, deliberately. The comment above records
   that the hand-kept list drifted four times and that "a fifth append would have been the fifth
   wrong answer"; appending `rain-streaks.png` would have been exactly that. Any picture a future
   stylesheet names is covered the moment the rule is written.
   A sheet we are not allowed to read (a cross-origin stylesheet) is skipped rather than thrown on —
   warming is best-effort by construction, and no caller awaits it. */
function cssAssetUrls(){
  const out=[];
  for(const sheet of document.styleSheets||[]){
    let rules; try{ rules=sheet.cssRules; }catch{ continue; }
    if(!rules)continue;
    for(const rule of rules){
      const text=rule.cssText||"";               // a media rule's cssText contains its inner rules
      for(const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)){
        if(m[1]&&m[1].startsWith(ASSET_BASE))out.push(m[1]);
      }
    }
  }
  return out;
}
export function preloadAssets(){
  const urls=[...new Set([...sharedAssetUrls(),...cssAssetUrls(),
    `${ASSET_BASE}logo.jpg`,
    // T-33: ING_HOLE_IMG was the ONE ingredient family never warmed here, so the greyed-crate art
    // was always fetched cold in the middle of a voyage — and both image failures caught in a
    // driven run were in it (holes/sugar.png, twice). Seven files, ~24KB.
    ...BOAT_IMG,...ISLAND_SHAPE_IMG,...ING_ALL.map(i=>ING_IMG[i]),...ING_ALL.map(i=>ING_HOLE_IMG[i]),
    // INBOX-20260901T1335Z: the two asset families a player can reach WITHOUT them ever having
    // been fetched — recipe art (picker/modal/victory banner) and award emblems (End of Voyage).
    // These are NOT `*_IMG` constants (they are built per-recipe and per-badge), so they stay
    // explicit — the derivation above cannot see them.
    ...RECIPE_BOOK.map(r=>r.img),
    ...BADGE_POOL.map(b=>`${ASSET_BASE}badges/${b.img}.png`),`${ASSET_BASE}badges/${FALLBACK_BADGE.img}.png`])];
  return Promise.all(urls.map(u=>new Promise(res=>{
    const img=new Image();
    img.onload=img.onerror=()=>res();
    img.src=u;
  })));
}

/* ---------- session persistence / host-refresh recovery ---------- */
// CLOCK-01: schema-version stamps for the two *resumable-game-state* blobs (pp_sess/pp_solo).
// Each blob evolves on its own schedule (multiplayer resume vs. solo resume are separate code
// paths), so two independent constants rather than one shared "build version" (RESEARCH Pattern 3
// Alternatives Considered) — bump only the one whose shape actually changes. boot()'s guard clears
// a blob (via the existing clearSession()/clearSoloState()) whenever its stamp doesn't match,
// treating an unstamped pre-refactor blob or a stale mismatched one as "no resume" (D-01/D-02).
// pp_id and the turn-clock key are structurally excluded from THIS MECHANISM (D-03) — meaning the
// SESSION_SCHEMA_V/SOLO_SCHEMA_V auto-clear of the resumable-game-state blobs never versions or
// clears them. That is the entire scope of the sentence. It says nothing about any other cleanup:
// v2.0's FIX-01 removes the legacy shared pp_timerOff key exactly once per browser
// (cleanupLegacyTimerKey in src/ui/stage.js), and this exclusion neither blocks nor governs it.
// pp_lastName joins that exclusion in FIX-01 (Phase 22): it carries a display name, not resumable
// game state, so it is never cleared by leaveGame() either — that is precisely the point, per D-04.
export const SESSION_SCHEMA_V=1;
// 1 -> 2 (playtest 21, the counter-offer stall): a confirmed COIN QUANTITY is now its own entry in
// the decision log (flow.js logQuantity). A save written before that has one fewer entry per coined
// trade, so replaying it would run every decision after the first such trade against the wrong
// prompt — the exact failure the new entry exists to stop. The stamp is what makes an old blob
// "no resume" instead of a mis-aligned one.
export const SOLO_SCHEMA_V=3;   // 2->3 at A-1: the bake-day reorder changes replay — a v2 save must be refused, never desynced
export function getMyId(){
  let id=null;try{id=localStorage.getItem("pp_id");}catch(e){}
  if(!id){id="u"+Math.random().toString(36).slice(2,10);try{localStorage.setItem("pp_id",id);}catch(e){}}
  return id;
}
// FIX-01/D-04: the durable "last-used captain name," pre-filling the name modal across separate
// games. Deliberately NOT pp_sess/pp_solo — both are wiped by leaveGame() (clearSession()/
// clearSoloState()), which fires on the two commonest ways a session ends (Play again, Leave game).
// Follows getMyId()'s exact try/catch-swallow shape: silent failure, no logging, plain string (not
// a JSON blob), never stamped with SESSION_SCHEMA_V/SOLO_SCHEMA_V and never cleared — same
// structural exclusion as pp_id, see the comment block above.
/* MAX_NAME_LEN — NOT a taste decision, and not ours to pick: the LIVE Firebase rule validates
   `seats/$seat/name` with `newData.val().length <= 18` (notes/ONLINE_SETUP.md). A longer name is
   refused by the database SERVER-side, and the refusal arrives as an uncaught promise rejection
   from firebase-database-compat.js — which the game surfaces as "The voyage has run aground."
   Wyatt hit exactly this on 2026-08-19 with a 22-character name: the join simply died.

   The boxes used to accept 40 and the clamps used to cut at 40, so every name between 19 and 40
   characters was a crash the player could type. This is the one number that must agree with the
   deployed rule, so it lives here once and every name that can reach the database derives from it.
   If the rule is ever changed in the Firebase console, THIS is the line that has to move with it.

   Pass-and-play's own name boxes (#ppName0-3) deliberately do NOT use this: those names are local
   to one device, never written to any room, and never persisted through saveLastName() — the only
   caller of which is confirmName() below. Capping them would restrict a mode the database rule
   does not reach. */
export const MAX_NAME_LEN=18;
export function getLastName(){
  let n=null;try{n=localStorage.getItem("pp_lastName");}catch(e){}
  return n||"";
}
export function saveLastName(v){try{localStorage.setItem("pp_lastName",v);}catch(e){}}
// The sea-creature cursor (Wyatt, 2026-08-06): where this device's captain had got to in the
// fifty, so the next voyage starts at the NEXT one and they work through the whole list across
// many games instead of restarting near the top every time.
//
// Structurally excluded from the SESSION_SCHEMA_V/SOLO_SCHEMA_V versioning above, exactly like
// pp_id and pp_lastName, and for the same reason: it is a durable device preference, not resumable
// game state, so leaveGame()'s clearSession()/clearSoloState() must never wipe it — that is the
// whole point of the feature. Same try/catch-swallow shape too, so Safari private mode and a
// file:// page fall back to 0 and behave exactly as the game did before this existed.
//
// Read ONCE PER GAME (startSinglePlayer/startPassAndPlay stash it in soloMeta, which the solo save
// carries), never once per look. A per-look read would make a host-refresh replay narrate
// different creatures than the voyage actually showed, because the cursor would have moved on.
export function getSeaBase(){
  let n=null;try{n=localStorage.getItem("pp_seaIdx");}catch(e){}
  const v=parseInt(n,10);
  return (isFinite(v)&&v>=0)?(v%SEA_CREATURES.length):0;
}
// Called after a sighting by the seat that owns the cursor. Idempotent by construction — it writes
// an ABSOLUTE position derived from the game's fixed base plus this captain's look count, not an
// increment, so a replay that re-runs the same looks rewrites the same number rather than racing
// the cursor forward a second time.
export function advanceSeaCursor(player){
  const base=(appState.game&&appState.game.seaBase)||0;
  const looks=player.oceanLooks||0;
  try{localStorage.setItem("pp_seaIdx",String((base+looks)%SEA_CREATURES.length));}catch(e){}
}
export function genCode(){const A="ABCDEFGHJKMNPQRSTUVWXYZ";let s="";for(let i=0;i<4;i++)s+=A[Math.floor(Math.random()*A.length)];return s;}
export function saveSession(){try{localStorage.setItem("pp4_sess",JSON.stringify({v:SESSION_SCHEMA_V,room:appState.room,mySeat:appState.mySeat,isHost:appState.isHost}));}catch(e){}}
export function clearSession(){try{localStorage.removeItem("pp4_sess");}catch(e){}}

// --- host-refresh recovery: record & replay the decision log ---
// Encode so a "stay put" (null) still persists as a non-empty object (Firebase drops nulls,
// and setting a node to {} deletes it — which would leave a gap in the ordered log).
export function encodeDec(v){return (v===null||v===undefined)?{n:1}:{v:v};}
export function decodeDec(e){return (e&&Object.prototype.hasOwnProperty.call(e,"v"))?e.v:null;}
// ---- singleplayer persistence: reuse the same replay mechanism multiplayer host-refresh uses,
// but keep the log in localStorage instead of Firebase, since there's no server for solo games ----
export function saveSoloState(){
  if(!appState.soloMeta)return;
  try{localStorage.setItem("pp4_solo",JSON.stringify({v:SOLO_SCHEMA_V,...appState.soloMeta,dlog:appState.dlog}));}catch(e){}
}
export function clearSoloState(){appState.soloMeta=null;try{localStorage.removeItem("pp4_solo");}catch(e){}}
export function resumeSoloGame(saved){
  appState.numSeats=saved.strategies.length;appState.room=null;appState.isHost=true;appState.mySeat=0;
  appState.passAndPlay=!!saved.passAndPlay;
  const names=saved.names||[saved.name]; // old solo saves only ever had one human, at seat 0
  appState.roster=buildRoster(names,saved.strategies);   // playtest 19: SAME rule as the fresh
  // start above, or a resumed voyage would rename the bots mid-game
  // seaBase rides along so the replay narrates the SAME creatures the live voyage did; a save from
  // before this existed has none, and 0 is exactly the behaviour it had.
  const seaBase=saved.seaBase||0;
  // v2.1: THE RULESET RIDES ALONG TOO, for a sharper reason than seaBase's. cfg is rebuilt from
  // roundCfg() here, which reads whatever the flag says RIGHT NOW — so a voyage played with the
  // bake-off on and resumed with it off (or resumed on a `?bakeoff=0` link) would replay its
  // decision log against a structurally different game: different turn loop, different rng draws,
  // and a log whose entries no longer line up with the decisions being asked for. A save from
  // before this field existed has no opinion, and inheriting the current flag is the only sensible
  // reading of an old save.
  const bakeoff=saved.bakeoff===undefined?undefined:!!saved.bakeoff;
  const meta=appState.passAndPlay?{names,strategies:saved.strategies,seed:saved.seed,passAndPlay:true,seaBase}
                      :{name:saved.name,strategies:saved.strategies,seed:saved.seed,seaBase};
  if(bakeoff!==undefined)meta.bakeoff=bakeoff;
  // ?ovens=1 rides along for the same reason: it changes what is in a hold on day one, so a save
  // made with it and resumed without it (he cleared the query string, or opened a bookmark that
  // never had it) would replay its decision log against captains who never had a full recipe.
  if(saved.ovens!==undefined)meta.ovens=!!saved.ovens;
  appState.soloMeta=meta;
  appState.dlog=(saved.dlog||[]).slice();appState.dlogIdx=0;appState.dlogN=0;
  appState.replaying=true;
  const cfg=roundCfg(saved.strategies);
  if(bakeoff!==undefined)cfg.bakeoff=bakeoff;
  // Same override for ?ovens=1: the save's value wins over whatever the current URL made roundCfg
  // say, so cfg never contradicts the soloMeta the stock check actually reads.
  if(saved.ovens!==undefined)cfg.ovens=!!saved.ovens;
  if(saved.bake2!==undefined)cfg.bake2=!!saved.bake2;
  if(saved.endcard!==undefined)cfg.endcard=!!saved.endcard;
  netHandlers().onBeginGame(cfg,saved.seed);
}
// notes/edits BUG-03/BUG-04: decide whether a host-refresh replay actually rebuilt the voyage.
// The yardstick is resumeEvLen — the Firebase event count captured BEFORE the reload (see
// resumeHostGame) — not dlog.length, because one logged decision can emit several events, so the
// two counts are not comparable. A SMALL shortfall is expected, not an error: ask()/pickCell()/
// battleAsk() each fall through from replay to live play the instant dlogIdx >= dlog.length, so
// the decision that was in flight when the tab reloaded — and the narration events it would have
// produced — are legitimately missing. A LARGE shortfall means the log never loaded (the empty-
// dlog case that rebuilds a fresh board from the seed and reads to players as "reset to start").
export const REPLAY_SHORTFALL_TOLERANCE = 4;
export function replayShortfall(rebuiltEvLen, priorEvLen, readFailed){
  const shortfall = Math.max(0, priorEvLen - rebuiltEvLen); // clamped: replaying past the old
                                                             // frontier is fine, never negative
  if(readFailed) return {shortfall, incomplete:true, reason:"read-failed"};
  if(shortfall > REPLAY_SHORTFALL_TOLERANCE) return {shortfall, incomplete:true, reason:"short-replay"};
  return {shortfall, incomplete:false, reason:"ok"};
}
/* THE WIRE EATS EMPTY ARRAYS, AND THIS IS THE ONE PLACE THAT PUTS THEM BACK. Firebase RTDB does
   not store an empty array — it stores nothing — so a field written as `[]` on the host arrives on
   a guest as `undefined`. `s.ing` above has always been repaired here for exactly that reason. */
/* ⭐ THE STORM CRASH THAT KILLS CREW VOYAGES — open since Wyatt's 2026-08-21 handoff, named there
   as "stormSummary reading .length of undefined", and it is this and nothing more.
   stormSummaryEvent emits FIVE buckets (moved/held/shipHeld/blown/swept) and only emits at all when
   at least one has somebody in it — so the others are `[]`, the wire drops them, and the narration
   reaches `if(e.moved.length)` on a guest with e.moved undefined. IT CAN ONLY EVER HAPPEN IN CREW,
   because a host reads the array it just built, in memory, and a solo game never crosses a wire.
   That is why it survived four months of solo play and killed multiplayer.
   ⚠ REPAIRED HERE RATHER THAN GUARDED AT THE READ. The narration reads five fields and the log line
   reads them too; guarding each is five places to keep in step for one wire fact. STORM_BUCKETS is
   asserted against the engine's own emit by storm_summary_buckets_check.mjs, so a sixth bucket
   cannot be added there without this list being made to match. */
export const STORM_BUCKETS=["moved","held","shipHeld","blown","swept"];
export function fixEv(e){
  if(e.state)e.state.forEach(s=>{if(!s.ing)s.ing=[];if(!s.pos)s.pos=[0,0];});
  if(e.rounds)e.rounds=e.rounds.map(r=>[r&&r[0]?1:0,r&&r[1]?1:0,r&&r[2]?1:0,r&&r[3]||null]);
  if(e.t==="stormSummary")for(const k of STORM_BUCKETS)if(!Array.isArray(e[k]))e[k]=[];
  return e;
}
