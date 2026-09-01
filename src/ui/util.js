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
  SEA_CREATURES, buildRoster,
} from "../shared/index.js";
import { escHtml } from "./recipe.js";
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
  if(!appState.turnOrder||appState.turnOrder.length!==n){
    const raw=appState.game.players.map((_,i)=>i);
    const r=raw.indexOf(head);
    return r<0?raw:raw.slice(r).concat(raw.slice(0,r));
  }
  const at=appState.turnOrder.indexOf(head);
  if(at<0)return appState.turnOrder.slice();
  return appState.turnOrder.slice(at).concat(appState.turnOrder.slice(0,at));
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
    const who=s.id ? (i===appState.mySeat?`${escHtml(s.name)} — that's you!`:escHtml(s.name))
                   : `🤖 bot (${s.strat||appState.game.cfg.strategies[i]})`;
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
export function refreshNameMarquees(){
  const $=id=>document.getElementById(id);
  // DESKTOP (>600px): the name column grows to fit (index.html @media min-width:601px), so a name
  // NEVER needs to scroll — and a 2px rounding overhang would otherwise trip the marquee and scroll
  // the first letter off ("ough Hook", Wyatt 2026-08-21). The marquee is a PHONE affordance, where
  // an 18-char name genuinely cannot fit the fixed 106px column. Clear any stale scroll and stop.
  const desktop=(document.documentElement.clientWidth||window.innerWidth)>600;
  for(const i of seatDisplayOrder()){
    const wrap=$("pname"+i),inner=wrap&&wrap.firstElementChild;
    if(!wrap||!inner)continue;
    if(desktop){ if(wrap.classList.contains("marquee")){wrap.classList.remove("marquee");wrap.style.removeProperty("--scrollDist");} continue; }
    const overflow=inner.scrollWidth-wrap.clientWidth;
    if(overflow>0){wrap.classList.add("marquee");wrap.style.setProperty("--scrollDist",(overflow+2)+"px");}
    // a column that GREW (side-by-side vs stacked, or a live resize) can un-clip a name that used
    // to need the scroll — drop the class and stop animating something with nothing left to reveal.
    else if(wrap.classList.contains("marquee")){wrap.classList.remove("marquee");wrap.style.removeProperty("--scrollDist");}
  }
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
export function fl(h){return h?"⚪H":"⚫T";}
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
export function fmtItem(x){return /coin/.test(x)?x.replace(" coins","🌕").replace("coins","🌕"):(ING_IMG[x]?ilabelImg(x):(ING_EMOJI[x]||"")+" "+iname(x));}
// Single source of truth for what an event says (long-log text), pops (board emoji/icon
// animation), and caps (per-ship mini-log caption) — one function per event type instead of
// three independent switches that used to drift out of sync with each other (see describe()/
// spawnPops()/captions() below, all now thin wrappers over this table). `at` is a board-position
// lookup — real when called from spawnPops (which needs coordinates), a harmless no-op stub
// when called from describe()/captions() (which only ever read .txt/.caps, never the pop math).
// notes/edits NARR-04: named for the direction the wind blows TOWARD, matching how DIRNAME and the
// rest of the game already talk about wind.
const WIND_ADJ={N:"northerly",S:"southerly",E:"easterly",W:"westerly"};
export function windHoldPhrase(dir,streak){
  const a=WIND_ADJ[dir]||"wind";
  return (streak||2)>=3?`this ${a} won't quit`:`this ${a} is gusting`;
}
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
function seaLine(sea,mine,name){
  // A pre-2026-08-06 solo save stores `sea` as a bare creature name, and a save from earlier the
  // same day stores {o,s,v}. Both are replayed verbatim on resume, so both must still narrate.
  // "there's X down there" needs neither an article nor number agreement, so every old name reads
  // correctly without resurrecting the inference this change removed.
  if(!sea||typeof sea==="string"||!sea.y){
    const w=(sea&&sea.s)||(typeof sea==="string"?sea:null)||"somethin' strange";
    return mine?`${name} — ye lean over the rail, and there's ${w} down there.`
               :`${name} leans over the rail, and there's ${w} down there.`;
  }
  return mine?`${name} — ${sea.y}`:sea.t.replace("{}",name);
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
         windHoldPhrase() below now has no callers
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
    const tail=e.nextStorm?" Tomorrow: a storm.":(e.next?` Tomorrow: ${DIRNAME[e.next]}.`:"");
    /* A-9 (Wyatt, 2026-08-28): option (b) — calm days stay short, a STORM day keeps a sentence of
       its own carrying the rule, because this is the ONLY place a player is ever told how far a
       storm moves them. His example verbatim: "It'll blow every ship 3 squares WEST." Distance
       and direction both DERIVED (rule 9): STORM_PUSH is the same constant the engine pushes
       with, DIRNAME is the one CAPS spelling every wind surface shares. This reverses the
       2026-08-27 "minus 3 squares" cut on his own later word — the graveyard note below stands
       as the history of that day, not the ruling in force. */
    const head=e.storm
      ? `Day ${e.round}: Storm ${e.streak>=2?"still":"blowin\u2019"} ${DIRNAME[e.dir]}. It\u2019ll blow every ship ${STORM_PUSH} squares ${DIRNAME[e.dir]}.`
      : `Day ${e.round}: Wind ${DIRNAME[e.dir]}.`;
    return {cls:"roundhdr",txt:head+tail};
  },
  dock:(e,at,cellPx,viewerSeat)=>{
    const place=dockPlace(e.ing),goods=dockFlavorIcon(e.ing);
    const heads=appState.game.cfg.dockHeads,tails=appState.game.cfg.dockTails;
    const paid=e.price!=null?e.price:"";
    const bought=(e.got==="bought");
    // black-market buys and the purchase that empties a shelf each get their clause — the dry
    // notice is how the whole table learns a shelf ran out (draft copy, Wyatt rewrites)
    // THE BLACK MARKET'S TWO PRICES read as two different sentences, because they are two
    // different bargains: coin buys the crate, but a barter SPENDS two crates the whole table can
    // see leave the hold — and they leave the game with them, so the line has to name them.
    const barter=bought&&e.paidIng&&e.paidIng.length===2;
    // paying with two of the SAME crate is legal and common (a hold of junk duplicates is exactly
    // what the barter is for), and "trades Cacao Pods an' Cacao Pods" reads like a stutter
    const gave=barter
      ?(e.paidIng[0]===e.paidIng[1]?`two ${fmtItem(e.paidIng[0])}`:e.paidIng.map(fmtItem).join(" an' "))
      :``;
    /* W2-5 — ONE FORMAT FOR COIN IN THIS SENTENCE, NOT TWO. The dig above already names the gain
       as a signed parenthetical, `(+3🌕)`; the purchase in the SAME breath read "for 12🌕". Money
       arriving and money leaving were dressed differently a dozen words apart.
       THE MINUS IS U+2212 "−", NEVER ASCII "-" — the same character the broadside line and the
       captain's-log capsule below already use; a hyphen here is the drift this whole clause exists
       to stop. `.nobrk` because the coin is an <img>, and a replaced element hands the browser a
       break opportunity immediately after it — the reason a full stop turned up alone on its own
       line twice. Built ONCE and spent by both the third-person and the addressed form, so the two
       can never say the amount differently. The barter clause takes no `spent`: it pays in crates,
       and inventing a coin figure where no coin moved would be a lie the whole table can read. */
    const spent=`<span class="nobrk">(−${paid}🌕)</span>`;
    const buyTail=bought
      ?(barter?` — then trades ${gave} to the black market for ${goods}.`
        :e.black?` — then pays the black market for ${goods} ${spent}.`
        :` — then buys ${goods} ${spent}.`+(e.wentDry?` That were the last crate — the shelves be bare!`:``))
      :``;
    const buyTailYou=bought
      ?(barter?` — then ye trade ${gave} to the black market for ${goods}.`
        :e.black?` — then ye pay the black market for ${goods} ${spent}.`
        :` — then ye buy ${goods} ${spent}.`+(e.wentDry?` Ye took the last crate — the shelves be bare!`:``))
      :``;
    const txt=isLocalTo(e.p,viewerSeat)
      ?(e.heads
        ?`⚪ HEADS! Ye dig deep at ${place} and strike buried treasure <span class="nobrk">(+${heads}🌕)</span>${buyTailYou}`
        :`⚫ TAILS — ye spend the turn workin' the docks at ${place} <span class="nobrk">(+${tails}🌕)</span>${buyTailYou}`)
      :(e.heads
        ?`⚪ HEADS! ${pn(e.p)} digs deep at ${place} and strikes buried treasure <span class="nobrk">(+${heads}🌕)</span>${buyTail}`
        :`⚫ TAILS — ${pn(e.p)} spends the turn workin' the docks at ${place} <span class="nobrk">(+${tails}🌕)</span>${buyTail}`);
    const cap=(e.heads?`⚪H 💰+${heads}🌕`:`⚫T +${tails}🌕`)+
      (bought?(barter?` · ${e.paidIng.map(x=>ING_EMOJI[x]||"📦").join("")} → ${ING_EMOJI[e.ing]}`:` · buys ${ING_EMOJI[e.ing]} −${paid}🌕`):``);
    return {txt,caps:[[e.p,cap]],
      pops:[[at(e.p),bought?ING_EMOJI[e.ing]:"🌕",false,bought?ING_IMG[e.ing]:null]]};
  },
  // v2 rule 4e: no harbor-tax refund any more, so no bonus clause to name.
  trade:(e,at,cellPx,viewerSeat)=>{
    // D-08/D-25: each named trader reads it addressed to themselves.
    let txt;
    if(isLocalTo(e.a,viewerSeat))txt=`🤝 ${pn(e.a)} — ye trade ${fmtItem(e.gave)} to ${pn(e.b)} for ${fmtItem(e.got)}`;
    else if(isLocalTo(e.b,viewerSeat))txt=`🤝 ${pn(e.a)} trades ${fmtItem(e.gave)} to ye for ${fmtItem(e.got)}`;
    else txt=`🤝 ${pn(e.a)} trades ${fmtItem(e.gave)} to ${pn(e.b)} for ${fmtItem(e.got)}`;
    return {cls:"trade",txt,
      caps:[[e.a,`🤝 got ${fmtItem(e.got)}`],[e.b,`🤝 got ${fmtItem(e.gave)}`]],
      pops:[[at(e.a),"🤝"],[at(e.b),"🤝"]]};
  },
  // v2 rule 5: a call is free and pays a flat bounty. Nothing is ever lost on a wrong one, so
  // there is no "backed the wrong ship (−N🌕)" form any more.
  sidebet:(e,at,cellPx,viewerSeat)=>{
    const you=isLocalTo(e.p,viewerSeat);
    if(e.won)return {cls:"trade",txt:you
      ?`🔭 ${pn(e.p)} — ye called it! <span class="nobrk">(+${e.delta}🌕)</span>`
      :`🔭 ${pn(e.p)} called it! <span class="nobrk">(+${e.delta}🌕)</span>`,
      caps:[[e.p,`🔭 called it +${e.delta}🌕`]]};
    return {cls:"trade",txt:you
      ?`🔭 ${pn(e.p)} — ye called the wrong ship. No bounty.`
      :`🔭 ${pn(e.p)} called the wrong ship — no bounty.`};
  },
  battle:(e,at,cellPx=0,viewerSeat)=>{
    // count by who actually scored (r[3]) rather than the raw flip pattern — a both-heads
    // downwind round scores a point but isn't "a XOR d landed heads", so filtering on the flips
    // alone silently drops it and undercounts the displayed score.
    const aP=e.rounds.filter(r=>r[3]==="a").length,dP=e.rounds.filter(r=>r[3]==="d").length;
    const rn=e.rounds.length; // BATL-01/02: broadside-round count dropped from the narration (always 0 now)
    const loser=e.winner===e.a?e.d:e.a;
    const [x1,y1]=at(e.a),[x2,y2]=at(e.d);
    const sp=e.spoilIng?ING_EMOJI[e.spoilIng]:"💰"; // e.spoil is HTML (ilabelImg) now — never parse it for a pop icon
    const spImg=e.spoilIng?ING_IMG[e.spoilIng]:null; // #3: won ingredient rises from the boat as art, not emoji
    // G3 (Wyatt-approved 2026-07-30): *"'Gives up all they have: 2 coins' should be 'gives up all
    // they have: 2🌕'"*. And, on being told the string came from the engine: *"why does this need to
    // touch the engine, but all our other narration doesn't? that seems badly designed, or worth
    // rechecking."* He is right, and that anomaly is real — `spoil` is one of only two fields in the
    // engine's whole event contract that carry RENDERED TEXT rather than data. Fixing it properly
    // means changing what the engine emits, which invalidates all 31 determinism fixtures and needs
    // a gated re-record; that work is specified in docs/DETERMINISM-RERECORD-NEXT.md and must ride
    // along the next time a re-record happens anyway. THIS is the interim display-layer fix, and it
    // leaves src/engine/index.js with an empty diff.
    //
    // ONE const, used at every site that interpolates the spoil. Three cases, in this order:
    //   1. Crate win — render from the DATA field and ignore e.spoil entirely. `spoilIng` already
    //      exists beside `spoil` as a proper data field, and art-review/narration-core.js:267-278
    //      already asserts the paired invariant `spoil === ilabelImg(spoilIng)` at every real emit
    //      site (D-51), so this renders byte-identically today while removing the crate half's
    //      dependence on pre-rendered engine text.
    //   2. Coin win — reuse fmtItem, the single place that already decides how a coin amount is
    //      spelled (D-17), rather than inventing a rival regex here. "5 coins" -> "5🌕", and the
    //      engine-only "2 coins (all they had)" -> "2🌕 (all they had)".
    //   3. Anything else — pass through UNTOUCHED. Load-bearing, not defensive padding: the raider
    //      spoil is `take+"c (raider)"` (src/engine/index.js:568), which contains no "coin"
    //      substring at all, so a blanket fmtItem() would fall through its /coin/ test into the
    //      INGREDIENT branch and render garbage. `asym` is hardcoded false in roundCfg and set
    //      nowhere in the codebase, so that branch is config-dead — but a config-dead branch must
    //      not be silently broken. Its deletion is queued in DETERMINISM-RERECORD-NEXT.md.
    const spoilText=e.spoilIng?ilabelImg(e.spoilIng):(/ coins/.test(e.spoil)?fmtItem(e.spoil):e.spoil);
    // ingredient spoils read as the winner taking a crate — untouched by the split below.
    //
    // NARR-04/D-12 (Wyatt-approved 2026-07-29): a coin spoil used to read as a single "bribe"
    // clause regardless of amount. Both real spoil-generation paths — src/orchestrator.js's asyncBattle
    // (every real game) and the offline-simulator-only src/engine/index.js — clamp the coin take
    // to at most 5. So when the loser holds no crate and the leading number in e.spoil reached
    // that full 5, they had a full purse and chose to pay rather than give one up: a genuine
    // bribe (today's wording, unchanged). When it's below 5, the live path guarantees the loser
    // also held zero crates (holding one would have routed to the ingredient branch above instead)
    // — there was nothing left to bargain with, so the winner simply takes what was left: cleaned
    // out, not bribed. This is the real-wording form of the simulator-only "(all they had)"
    // parenthetical the plan asked to fold into prose rather than ever carry as a trailing aside.
    //
    // e.spoil is HTML for the ingredient case and is NEVER parsed there; only here, for the coin
    // case, is its LEADING NUMBER parsed — a different operation from parsing it for a pop icon
    // (spoilClause never does that either). Guarded so an absent, empty, or non-numeric spoil
    // falls through to the cleaned-out framing (the one that claims least) rather than ever
    // rendering `undefined`/NaN — the cleaned-out line also never mocks or piles on the loser
    // (T-15-08/the plan's own values prohibition), it just reports the outcome.
    // G3: these two deliberately parse the RAW e.spoil, NOT spoilText. The bribe test asks "did the
    // coin take reach the full 5" — a numeric question about the event, entirely unrelated to how
    // the amount is spelled on screen. Do not tidy the two together.
    const spoilN=e.spoilIng?null:parseInt(e.spoil,10);
    // FIX-07 (Wyatt-ruled 2026-07-31): spoilN>=5 alone can't tell a genuine bribe (had a crate AND
    // 5+ coins, chose to pay) apart from an empty-hold loser who never had a choice — both clamp to
    // the same "5 coins"/spoilIng:null shape. src/orchestrator.js now carries the real signal as
    // e.spoilChosen, set true ONLY inside its canCoins&&hasIng branch. Engine-generated events
    // (replays, the simulator, all 31 determinism fixtures) carry no such key at all — hasChoice is
    // the fork that keeps every one of THOSE rendering byte-identically to before this change,
    // falling back to the old coin-count proxy exactly as it did before spoilChosen existed.
    const hasChoice=typeof e.spoilChosen==="boolean";
    // the amount gate (spoilN>=5) stays load-bearing in BOTH forks — a fabricated sub-5 event with
    // spoilChosen:true is not a shape the real game ever produces (canCoins&&hasIng only sets
    // spoilChosen true when lose.coins>=5, which clamps the take to exactly 5), but the fix must not
    // depend on that never happening: a sub-5 spoil always falls to the all-they-have framing,
    // regardless of spoilChosen.
    const isBribe=e.spoilIng==null&&Number.isFinite(spoilN)&&spoilN>=5&&(hasChoice?e.spoilChosen===true:true);
    // the empty-hold case: a real choice existed (hasChoice), the loser did NOT choose coins over a
    // crate (they had none to choose from), and the coin take still reached the clamp ceiling.
    const isEmptyHoldFive=e.spoilIng==null&&hasChoice&&e.spoilChosen===false&&Number.isFinite(spoilN)&&spoilN>=5;
    // D-08 (Wyatt-approved 2026-07-29): the attacker and the defender each read the outcome
    // addressed to themselves — a third-party viewer (including NEUTRAL_VIEWER) reads the
    // third-person text. Only ever one of aAddr/dAddr can be true (distinct seats), so the spoil
    // clause below resolves against whichever of winner/loser the viewer actually is.
    const aAddr=isLocalTo(e.a,viewerSeat),dAddr=isLocalTo(e.d,viewerSeat);
    const winIsA=e.winner===e.a;
    // NARR-01/D-25 (Wyatt-approved 2026-07-29): the result line drops "attacks {name}!" and the
    // round count — the battle OPENER (src/orchestrator.js's asyncBattle) already named both
    // combatants, so restating it here was exactly the redundancy this phase exists to remove.
    let mainClause;
    if(aAddr)mainClause=`⚔️ ${pn(e.a)} — ye ${winIsA?"win":"lose"} ${aP}–${dP}.`;
    else if(dAddr)mainClause=`⚔️ ${pn(e.d)} — ye ${winIsA?"lose":"win"} ${aP}–${dP}.`;
    else mainClause=`⚔️ ${pn(e.winner)} wins ${aP}–${dP}.`;
    const viewerIsWinner=isLocalTo(e.winner,viewerSeat),viewerIsLoser=isLocalTo(loser,viewerSeat);
    // playtest 20 (Mando: "There's a bug in the battles - we both rolled heads but he still took
    // something from me"). It was not a bug — rule 9 gives a two-heads tie to the DOWNWIND ship —
    // but nothing on the durable line ever said so, and both cannons land heads in ~25% of fights,
    // so roughly ONE BATTLE IN FOUR ended with no stated reason. Wyatt, 2026-08-13, on where to
    // explain it: after the battle (this), plus a badge on the battle card and a line in the flip
    // ceremony. The loser's wording below is his approved copy verbatim; the winner-addressed and
    // neutral forms are the mechanical person-swap of it, same as D-54 did for the base line.
    //
    // The DECIDING round is the last one that scored — a crosswind tie can re-fire, so earlier
    // rounds may have no scorer at all. `downwind` rides the event (src/orchestrator.js).
    const decidedRound=e.rounds&&e.rounds.filter(r=>r&&r[3]).pop();
    const wonOnWind=!!(e.downwind&&decidedRound&&decidedRound[0]===1&&decidedRound[1]===1&&decidedRound[3]===e.downwind);
    const windHeadThird=`⚔️ Both cannons land — but ${pn(e.winner)} fires downwind, and the wind carries the shot home.`;
    const windHeadYe=`⚔️ Both cannons land — but ye're firin' downwind, and the wind carries the shot home.`;
    // playtest 20 (Wyatt: "losers of a battle without a crate don't always give 'all they have' —
    // sometimes they don't even give all their doubloons"). They give NONE, and that is correct:
    // RULES-V2 line 180 is "Prize: one crate, winner's choice. No coin alternative", so an empty
    // hold means the winner leaves with nothing. The ENGINE (awardSpoil returns null) and the live
    // path (`pick` is undefined) both already do exactly that. The BUG WAS THIS FUNCTION.
    //
    // The isBribe / isEmptyHoldFive / "all ye have" branches below are survivors of the OLDER
    // ruleset, where a beaten captain could pay in coin. With no coin spoil possible any more,
    // spoilN parses to NaN, both coin branches go false, and every empty-hold loss fell through to
    // the "gives up all they have" fallback — which is a lie, and reads exactly like the game
    // failing to take something. Measured before the fix:
    //   live path   "Wyargh wins 0–1 — ye give up all ye have."
    //   engine path "Wyargh wins 0–1 — ye give up all ye have: nothing."
    // Detected on the DATA (a null/"nothing" spoil) rather than by assuming coins are impossible,
    // so a future ruleset that restores a coin prize cannot silently inherit this line.
    const tookNothing=e.spoilIng==null&&(e.spoil==null||e.spoil==="nothing"||e.spoil==="");
    let spoilClause;
    // G3: every ${e.spoil} below became ${spoilText}. Not one sentence, clause order or word
    // changed — the only difference is how the spoil AMOUNT is spelled.
    if(e.spoilIng)spoilClause=viewerIsWinner?`Ye take ${spoilText}.`:`${pn(e.winner)} takes ${spoilText}.`;
    else if(isBribe)spoilClause=viewerIsLoser?`Ye bribe yer way out of giving away a crate with ${spoilText}.`:`${pn(loser)} bribes their way out of giving away a crate with ${spoilText}.`;
    // FIX-07 (ruled 2026-07-31, verbatim): an empty-hold loser reads this third line, not the bribe
    // wording and not the all-they-have fallback below.
    else if(isEmptyHoldFive)spoilClause=viewerIsLoser?`Ye give up ${spoilText}.`:`${pn(loser)} gives up ${spoilText}.`;
    else if(viewerIsLoser)spoilClause=`Ye give up all ye have${spoilText?`: ${spoilText}`:""}.`;
    else if(viewerIsWinner)spoilClause=`Ye take all ${pn(loser)} has${spoilText?`: ${spoilText}`:""}.`;
    else spoilClause=`${pn(loser)} gives up all they have${spoilText?`: ${spoilText}`:""}.`;
    // D-54/D-25/D-16 (Wyatt-approved 2026-07-29): his three approved rewrites of the LOSER's own
    // view (table:battle / ~cleaned / ~crate in 15-ADDRESSED2-APPROVED.json) all restructure the
    // sentence, so the loser gets a composite of its own rather than the mainClause+spoilClause
    // join. Three deliberate differences, applied verbatim: the WINNER is named (not the loser),
    // the clauses join with " — "/" and" into ONE sentence (not two), and the wording is his —
    // elided "givin'", possessive "takes yer", and no trailing period on the crate line. The
    // leading ⚔️ is re-attached (his note could not carry inline markup). The winner-addressed and
    // neutral renderings below are byte-unchanged, and the spoilN/isBribe guard is reused as-is so
    // a non-numeric or absent spoil still falls through to the cleaned-out framing, never NaN.
    let txt;
    if(viewerIsLoser){
      const head=`⚔️ ${pn(e.winner)} wins ${aP}–${dP}`;
      // @copy misc.battle.emptyhold — verbatim as Wyatt wrote it, 2026-08-13. Checked BEFORE the
      // wind branch: when nothing was taken, why the tie fell one way is not what the player is
      // asking; "where did my crate go" is, and the answer is that there was never one to take.
      if(tookNothing)txt=`⚔️ ${pn(e.winner)} wins — but ye've nothing in the hold to plunder.`;
      else if(wonOnWind){
        // his approved line: "Both cannons land — but X fires downwind, and the wind carries the
        // shot home. X takes yer cocoa." The spoil is a SECOND sentence here, not the em-dash
        // continuation the score-led head uses, because the head already ends in a full stop.
        if(e.spoilIng)txt=`${windHeadThird} ${pn(e.winner)} takes yer ${spoilText}.`;
        else if(isBribe)txt=`${windHeadThird} Ye bribe yer way out of givin' away a crate with ${spoilText}.`;
        else if(isEmptyHoldFive)txt=`${windHeadThird} Ye give up ${spoilText}.`;
        else txt=`${windHeadThird} Ye give up all ye have${spoilText?`: ${spoilText}`:""}.`;
      }
      else if(e.spoilIng)txt=`${head} and takes yer ${spoilText}`;
      else if(isBribe)txt=`${head} — ye bribe yer way out of givin' away a crate with ${spoilText}.`;
      // FIX-07: mechanical person-swap of the ruled "Ye give up {spoil}." line into this composite's
      // own em-dash-continuation shape, matching the pattern the bribe/all-they-have branches above
      // already use in this same chain.
      else if(isEmptyHoldFive)txt=`${head} — ye give up ${spoilText}.`;
      else txt=`${head} — ye give up all ye have${spoilText?`: ${spoilText}`:""}.`;
    }else if(tookNothing){
      // @copy misc.battle.emptyhold — Wyatt's own wording, 2026-08-13. It deliberately drops the
      // "1–0" score the other lines carry: nothing changed hands, so the scoreline is the least
      // interesting thing about the outcome. Winner-addressed and neutral are the person-swap.
      txt=viewerIsWinner
        ? `⚔️ Ye win — but there's nothing in ${pn(loser)}'s hold to plunder.`
        : `⚔️ ${pn(e.winner)} wins — but there's nothing in ${pn(loser)}'s hold to plunder.`;
    }
    else txt=`${wonOnWind?(viewerIsWinner?windHeadYe:windHeadThird):mainClause} ${spoilClause}`;
    return {cls:"battle",
      txt,
      caps:[[e.winner,`⚔️ wins! +${spoilText}`],[loser,"⚔️ loses 💸"]], // G3: the winner caption too
      pops:[[[(x1+x2)/2,Math.min(y1,y2)-cellPx*.15],"⚔️",true],[at(loser),"💸"],[at(e.winner),sp||"💰",false,spImg]]};
  },
  // NARR-01/D-25/D-38 (Wyatt-approved 2026-07-29): signed flee cost, "they/pays" dropped as
  // redundant once signed; comma+"but" structure per his approved actor-addressed sample, extended
  // mechanically to the defender-addressed and neutral forms.
  battleflee:(e,at,cellPx,viewerSeat)=>{
    const aAddr=isLocalTo(e.a,viewerSeat),dAddr=isLocalTo(e.d,viewerSeat);
    let txt;
    // v2 rule 2: fleeing is FREE now, so every (−1🌕) toll comes off these three lines and the capsule.
    if(aAddr)txt=`🏃 ${pn(e.a)} — ye attack ${pn(e.d)}, but both shots miss wildly and ${pn(e.d)} slips away!`;
    else if(dAddr)txt=`🏃 ${pn(e.a)} attacks ye, but both shots miss wildly and ye slip away!`;
    else txt=`🏃 ${pn(e.a)} attacks ${pn(e.d)}, but both shots miss wildly and ${pn(e.d)} slips away!`;
    return {cls:"battle",txt,caps:[[e.d,"🏃 flees!"]],pops:[[at(e.d),"🏃"]]};
  },
  // notes/edits UI-04: on a catch, the emoji that rises from the boat is the SUGARFISH itself, not
  // the fishing line — you just landed a fish, so show the fish coming up out of the boat.
  // NARR-01/D-25/D-38 (Wyatt-approved 2026-07-29): signed catch amounts.
  finish:(e,at,cellPx,viewerSeat)=>({cls:"roundhdr",txt:isLocalTo(e.p,viewerSeat)?`🏁 ${pn(e.p)} — ye return to the Isle of Tortuga with a full recipe!`:`🏁 ${pn(e.p)} returns to the Isle of Tortuga with a full recipe!`,
    caps:[[e.p,"🏁 recipe done!"]],pops:[[at(e.p),"🏁",true]]}),
  /* The `shotclock` (20s coin penalty) and `shotclockskip` (30s turn skip, Wyatt's "Dozed at the
     helm!" wording) rows stood here — removed 2026-08-28 with the shot clock itself (see ask()).
     Nothing emits either event any more; the wordings and their approval history live in git. */
  // D-08/D-25: both finalists read the result addressed to themselves — the winner's own "ye take
  // it!", the loser's own commiseration; a third-party viewer (and NEUTRAL_VIEWER) reads today's
  // exact third-person text.
  // notes/edits EOV-01: the blue narration box no longer announces the win — it would duplicate the
  // dedicated one-off victory box (see endLive's flash) and the End of Voyage summary. The board
  // still gets a crown pop over the winner; the announcement itself lives in the celebratory box.
  end:(e,at)=>({cls:"roundhdr",txt:"",caps:[],pops:e.winner===null?[]:[[at(e.winner),"👑",true,CROWN_IMG]]}),
  turn:()=>null,
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
  pass:(e,at,cellPx,viewerSeat)=>({
    txt:`🌊 ${seaLine(e.sea,isLocalTo(e.p,viewerSeat),pn(e.p))} <span class="nobrk">Recipe idea! (+${appState.game.cfg.passCoin}🌕)</span>`,
    // Generic rather than naming the creature: the sighting is one hand-written sentence now, with
    // no separately-stored subject to lift out of it, and inventing one by parsing the prose is
    // exactly the kind of guessing this rewrite removed. (Nothing renders caps in v2 regardless.)
    caps:[[e.p,"🌊 looks into the ocean"]],pops:[[at(e.p),"🌊",false,WAVE_IMG]]}),
};
const NO_AT=()=>[0,0]; // describe()/captions() never need real board coordinates
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

export function captions(e){
  const fn=EVENT_NARRATION[e.t];if(!fn)return [];
  const r=fn(e,NO_AT);
  return (r&&r.caps)||[];
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
  {key:"battlesWon",   img:"cutlass",  name:"The Cutlass of a Thousand Notches", byline:"One notch per fallen foe, carved into the hilt.",                 stat:"Most battles won",   unit:"",         scale:3},
  // v2 rule 3: no fishing, so the Golden Herring is retired. In its place, the award that
  // actually measures a v2 captain — who spent the most at the docks now that every crate on the
  // board has a price on it (rules 10/11).
  {key:"cratesBought", img:"doubloon", name:"The Open Purse",                      byline:"Paid the harbourmaster more than any captain on the Sugar Seas.", stat:"Most crates bought", unit:"",         scale:4},
  {key:"dist",         img:"compass",  name:"The Horizon-Chaser's Compass",      byline:"For the salt-crusted soul who sailed further than sense allowed.", stat:"Farthest traveled",  unit:" sq",      scale:45},
  {key:"longestBattle",img:"medal",    name:"The Iron Gut Medal",                byline:"For the crew that refused to sink.",                               stat:"Longest battle",     unit:" rounds",  scale:4},
  {key:"tails",        img:"blackspot",name:"The Black Spot of Bad Tides",       byline:"Survived the curse — worst luck on the Sugar Seas.", stat:"Most tails flipped", unit:" tails", scale:16},
  {key:"hottestStreak",img:"herring",  name:"The Lucky Streak",                  byline:"Heads, then heads, then heads again — Lady Luck rode on their shoulder.", stat:"Hottest streak", unit:" heads", scale:4},
  {key:"trades",       img:"ledger",   name:"The Silver-Tongued Ledger",         byline:"Struck more deals than a Tortuga fishmonger on market day.",       stat:"Most trades struck", unit:"",         scale:3},
  {key:"timesAttacked",img:"target",   name:"The Painted Target",                byline:"Somehow every cannon in the Caribbean swung their way.",           stat:"Most set upon",      unit:"",         scale:3},
  {key:"battlesLost",  img:"timbers",  name:"The Splintered Timbers",            byline:"Took a right drubbing and lived to grumble about it.",             stat:"Most battles lost",  unit:"",         scale:3},
  /* "The Barnacle Brain" (slowest to decide) left with the shot clock, 2026-08-28 — its tally
     counted shotclock/shotclockskip events nothing emits now; kept, every seat would score 0 and
     the award would be handed out by tie-break, a visibly wrong End of Voyage screen. */
];
// Guaranteed fallback for a captain who earned no standout stat (rare — everyone at least sails, so
// "Farthest traveled" is nearly always claimable — but this ensures EVERY captain gets one award).
// It still carries a real number: how many ingredients they finished the voyage holding.
const FALLBACK_BADGE={img:"anchor",name:"Good Mate",byline:"Pirated for the love of the game.",stat:"Number of ingredients plundered",unit:""};
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
export function backButtonHTML(idx){return `<button class="apBack" data-i="${idx}" aria-label="Back">‹</button>`;}

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
  const seat=appState.curSeat;
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
  netHandlers().onBroadcast(`${pn(seat)} is deciding…`,[{seat,html:msg}],{wait:true});
  const isFlip=opts.length===1&&!!opts[0].flip;
  // `sub` is optional helper text rendered under the button row; an option flagged `disabled`
  // renders greyed and non-clickable (notes/edits #5) — used for the too-poor Attack button.
  const base=decisionIsLocal(seat)?netHandlers().onLocalAsk(msg,opts,colors,sub,extra)
    :netHandlers().onRemotePrompt(seat,{kind:"ask",msg,labels:opts.map(o=>o.label),
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
      ? "Refreshin' will sail ye back onto the same rock — start a fresh voyage."
      : "A refresh may set ye right.";
    console.error("VOYAGE AGROUND"+(where?" ("+where+")":""),err);
    const box=document.createElement("div");
    box.id="ppAground";
    box.style.cssText="position:fixed;inset:auto 12px 12px 12px;z-index:99999;background:#fffdf2;"+
      "border:2px solid #2aa9b8;border-radius:14px;padding:14px 16px;max-height:60vh;overflow:auto;"+
      "font:14px/1.45 system-ui,sans-serif;color:#123;box-shadow:0 8px 30px rgba(0,0,0,.35)";
    const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
    box.innerHTML=
      `<div style="font-weight:800;margin-bottom:6px">🪨 The voyage has run aground</div>`+
      `<div style="margin-bottom:8px">Somethin' broke below decks and the game can sail no further. `+
      `${esc(advice)}</div>`+
      `<div style="opacity:.6;font-size:11px;margin-bottom:6px">${esc(stamp)}`+
      `${where?" · "+esc(where):""}</div>`+
      `<pre style="white-space:pre-wrap;word-break:break-word;font-size:11px;opacity:.8;margin:0">`+
      `${esc(detail)}</pre>`;
    document.body.appendChild(box);
  }catch(e){
    // the surface itself failed — say it the one way that cannot also fail
    console.error("voyageAground() could not render",e,"original:",err);
    try{alert("The voyage has run aground. "+String(err));}catch(_){}
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
export async function botBeat(){netHandlers().onLiveRender();await narrateCurrent();}
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
export async function narrateCurrent(){
  const e=appState.game.events[appState.evIdx];if(!e)return;
  await narrateCurrentBody(e);
  // his item 7: a bot's dock reaches the black-market ceremony by the same door a human's does
  await eventCeremony(e);
}
async function narrateCurrentBody(e){
  // D-07/D-25 (Wyatt-approved 2026-07-29): the one ad-hoc (non-EVENT_NARRATION-table) narration
  // line that lives here in util.js itself — the neutral-plus-variants shape, same as every other
  // ad-hoc flash() site in src/ui/flow.js.
  // @copy adhoc.turn.botbanner
  if(e.t==="turn"){await netHandlers().onFlash(`🧭 ${pn(e.p)} takes the wheel…`,undefined,undefined,[{seat:e.p,html:`🧭 ${pn(e.p)} — ye take the wheel…`}]);return;}
  // settleSideBets() already flashed one aggregate message covering every bettor — skip the
  // duplicate individual re-narration (same reasoning as narrateLastEvent()).
  if(e.t==="sidebet")return;
  // @copy adhoc.turn.boteventpassthrough
  const L=appState.logLines[appState.evIdx];if(L)await netHandlers().onFlash(L.txt);
}
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

   That is the line this list draws, and it is worth stating so the next addition knows which side
   it is on: preload what a TIMED CEREMONY needs — anything the game animates on a clock, where a
   late image is a missed beat rather than a slow paint. Not every icon in the game: ~90 images at
   boot on a phone would trade this bug for a slower start. The flip is the archetype; the coin is
   also what battles, docks and the bake-off all spend their drama on. */
export function preloadAssets(){
  const urls=[BOARD_IMG,DOCK_IMG,WIND_ARROW_IMG,TRADE_SWIRL_IMG,`${ASSET_BASE}logo.jpg`,
    FLIP_SOCKET_IMG,COIN_SPIN_IMG,FLIP_HEADS_IMG,FLIP_TAILS_IMG,COIN_IMG,
    // T-33: ING_HOLE_IMG was the ONE ingredient family never warmed here, so the greyed-crate art
    // was always fetched cold in the middle of a voyage — and both image failures caught in a
    // driven run were in it (holes/sugar.png, twice). Seven files, ~24KB.
    ...BOAT_IMG,...ISLAND_SHAPE_IMG,...ING_ALL.map(i=>ING_IMG[i]),...ING_ALL.map(i=>ING_HOLE_IMG[i])];
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
export function fixEv(e){
  if(e.state)e.state.forEach(s=>{if(!s.ing)s.ing=[];if(!s.pos)s.pos=[0,0];});
  if(e.rounds)e.rounds=e.rounds.map(r=>[r&&r[0]?1:0,r&&r[1]?1:0,r&&r[2]?1:0,r&&r[3]||null]);
  return e;
}
