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
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.
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
// the same way. The EVENT_NARRATION `battle`/`aground`/`shotclockskip` entries gained an optional
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
// a sentinel-comment region in index.html that scripts/dlog_replay_test.js sliced out via
// `node:vm` at test time (see that script's original header). Moving them here retires that
// slicing hack entirely — dlog_replay_test.js now does a native `import` of this module instead;
// see its updated header comment for the full account.

import {
  appState,
} from "../state/index.js";
import { roundCfg } from "../engine/index.js";
import {
  // F5 (2026-07-29): dockFlavor -> dockFlavorIcon. EVENT_NARRATION.dock was this file's only
  // dockFlavor consumer; all four branches now take the icon-placed form from the declared split.
  NAMES, HEXCOL, DIRNAME, ING_EMOJI, iname, ilabelImg, dockPlace, dockFlavorIcon, iconImg, ING_IMG,
  CUPCAKE_IMG, CROWN_IMG, TRADE_SWIRL_IMG, CRATE_OVERBOARD_IMG, TET, ISLAND_SHAPE_IMG, emojify,
  ASSET_BASE, BOARD_IMG, DOCK_IMG, WIND_ARROW_IMG, BOAT_IMG, ING_ALL, COIN_IMG,
} from "../shared/index.js";
import { escHtml } from "./recipe.js";
// 11-07 (bridge deletion fix): util.js is a common dependency of src/ui/board.js, panel.js,
// lobby.js, and flow.js — it can never import any of THEM back without closing an import cycle
// module_graph_check.js's "no import cycle" assertion forbids. A handful of functions here
// (ask/botBeat/narrateCurrent/applyShotClockPenalty/toggleShotClockPause/shotClockTick/
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
export function seatDisplayOrder(){
  const n=appState.game.players.length;
  if(!appState.turnOrder||appState.turnOrder.length!==n)return appState.game.players.map((_,i)=>i);
  const startPos=Math.max(0,appState.turnOrder.indexOf(appState.mySeat));
  return appState.turnOrder.slice(startPos).concat(appState.turnOrder.slice(0,startPos));
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
    // declaration site in the repo, imported by the audit page, the health gate and ui_contract_check.js
    // alike (the
    // page ran it LIVE at render, so a card tagged `keep` displayed the converted text — under D-25 that
    // converted text is what he approved). No runtime helper is shipped for it: a pirateVoice() nothing
    // calls would be dead code, which D-33/D-34/D-40 exist to prevent. Comments and identifiers are out
    // of scope. scripts/ui_contract_check.js now gates this permanently.
    // F1 (Wyatt-approved 2026-07-29): the LABEL class — this tooltip points AT a row to say "this
    // one is the reader", so it is UI chrome rather than the game speaking, and takes plain "you".
    // See src/ui/lobby.js's renderSeatList for the full rule; ui_contract_check.js gates it.
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
  // names have a fixed column width to keep coins/hold aligned across every row — a name that
  // overflows it scrolls instead of blowing out the layout or truncating unreadably
  for(const i of order){
    const wrap=$("pname"+i),inner=wrap&&wrap.firstElementChild;
    if(!wrap||!inner)continue;
    const overflow=inner.scrollWidth-wrap.clientWidth;
    if(overflow>0){wrap.classList.add("marquee");wrap.style.setProperty("--scrollDist",(overflow+2)+"px");}
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
  return s.id?(escHtml((s.name||"").trim())||fallback):fallback;
}
// plain (unescaped) display name for a seat — the same source pname() renders, minus the HTML
// escaping. Used by writeGameLog so every finished game records who was playing, including
// solo/local games (which have no rooms/{code}/seats node to cross-reference names from).
export function rawName(i){
  const s=(appState.roster&&appState.roster[i])||{};
  return (s.id?(s.name||"").trim():"")||NAMES[i].replace("Capt. ","");
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
export const EVENT_NARRATION={
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
  newround:e=>{
    const D=DIRNAME[e.dir],D2=DIRNAME[e.dir2];
    const held=(e.windStreak||1)>=2,wontQuit=(e.windStreak||1)>=3;
    if(e.storm){
      if(e.streak>=2)return {cls:"roundhdr",
        txt:held
          ?`— Round ${e.round}: ⛈️ The storm's baked in and won't cool down! It's still aiming ${D}, then ${D2}. Fie, Poseidon! —`
          :`— Round ${e.round}: ⛈️ The storm's baked in and won't cool down! It's aiming ${D}, then ${D2}. Batten down the hatches, ye scurvy lot! —`};
      return {cls:"roundhdr",txt:`Round ${e.round}: A ⛈️ storm be ragin'! It'll blow yer ships ${D}, then ${D2}.`};
    }
    if(held)return {cls:"roundhdr",txt:wontQuit
      ?`— Round ${e.round}: wind still to the ${D}, ${windHoldPhrase(e.dir,e.windStreak)} —`
      :`— Round ${e.round}: wind still blows ${D}, ${windHoldPhrase(e.dir,e.windStreak)} —`};
    return {cls:"roundhdr",txt:`— Round ${e.round}: wind is blowin' ${D} —`};
  },
  // D-25/D-37 (Wyatt-approved 2026-07-29): wind always BLOWS a player — never carries/sweeps/moves.
  // FIX-04 (Wyatt, 2026-07-31): the narration line itself is gone — both viewer variants together,
  // per D-07/NARR-05. The Captains-box capsule stays; it's the only remaining marker of the drift.
  windmove:(e,at,cellPx,viewerSeat)=>({caps:[[e.p,"🌬️ drifts"]]}),
  blownOut:(e,at,cellPx,viewerSeat)=>({txt:isLocalTo(e.p,viewerSeat)?`⛵ ${pn(e.p)} — a gale blows ye off the dock!`:`⛵ A gale blows ${pn(e.p)} off the dock!`}),
  sail:(e,at,cellPx,viewerSeat)=>({txt:isLocalTo(e.p,viewerSeat)?`${pn(e.p)} — ye pay 1🌕 and sail`:`${pn(e.p)} pays 1🌕 and sails`,caps:[[e.p,"⛵ sails −1🌕"]]}),
  // D-07/NARR-05/D-10 (Wyatt-approved 2026-07-29): the tracer line for viewer-aware narration. The
  // addressed reader keeps the name prefix, then switches to second person; every other viewer
  // (including NEUTRAL_VIEWER, and describe()'s own default when appState.mySeat is unset) sees the
  // third-person line — see isLocalTo()'s own header comment for why.
  dodge:(e,at,cellPx,viewerSeat)=>{
    const addressed=isLocalTo(e.p,viewerSeat);
    const txt=addressed?`${pn(e.p)} — ye pay 1🌕 to anchor safely!`:`${pn(e.p)} pays 1🌕 to anchor safely`;
    return {txt,caps:[[e.p,"💨 dodges −1🌕"]],pops:[[at(e.p),"💨"]]};
  },
  anchor:(e,at,cellPx,viewerSeat)=>({txt:isLocalTo(e.p,viewerSeat)?`${pn(e.p)} — ye flip ⚪HEADS and dodge the rocks!`:`${pn(e.p)} flips ⚪HEADS and dodges the rocks!`,caps:[[e.p,"⚪H drops anchor ⚓"]],pops:[[at(e.p),"⚓"]]}),
  // D-19/D-20/D-21/D-27 (Wyatt-approved 2026-07-26): one line used to cover three unrelated
  // safe-harbor causes. mooredReason() still tags every event with which one actually fired (the
  // engine's `reason` field is untouched — this is a narration-only collapse). Per Wyatt's
  // decision, `home` (a Tortuga berth) renders the SAME lines as `dock` — D-18 treats Tortuga as a
  // normal island/dock, so it gets no bespoke wording of its own, in EITHER of dock's two cases.
  // A replayed pre-change log with no reason falls back to the old generic line rather than
  // rendering "undefined".
  //
  // G2 (Wyatt-approved 2026-07-30): `home` used to map to `stillDocked` unconditionally, while
  // `dock` already split on movement. So a ship the storm pressed against the TORTUGA berth took the
  // `home` reason and read as though it had been parked there all along — Wyatt, this morning:
  // "Right got blown onto a (tortuga) dock in a storm, but the narration said 'right is still
  // docked' – instead of 'lucky break!'". Same bug BUG-2 fixed for `dock`, one reason short.
  // `home` now takes the identical expression, built from the SAME two consts, so the two branches
  // cannot drift apart — that is why the strings are hoisted rather than repeated.
  //
  // D-28 still holds and is NOT weakened: `justDocked`, `dock`-when-unmoved and `home`-when-unmoved
  // remain ONE shared `stillDocked` string reached by three doors — not three copies awaiting a
  // merge. This change splits only the MOVED case, and it adds no copy: both strings already ship,
  // both are Wyatt's own approved rewrites (D-20/D-25/D-37), and D-37 keeps "shoves" here as a
  // rescue rather than a move. Nothing here is new wording; it is a second door onto approved copy.
  moored:(e,at,cellPx,viewerSeat)=>{
    // G2: hoisted to ONE call, above both tables. It walks the event stream, so four calls per
    // render is wasteful — and a single const is what makes `dock` and `home` structurally
    // identical rather than merely matching today. `null` ("can't tell") is NOT a shove, per
    // movedSinceTurnStart's own contract.
    const shoved=movedSinceTurnStart(e)===true;
    const stillDocked=`${pn(e.p)} is still docked, so the storm can't run them aground.`;
    const dockShove=`Lucky break! The gust shoves ${pn(e.p)} towards a dock, and the crew steadies her fast ⚓`;
    const L={
      justDocked:stillDocked,
      // D-20: the mechanics stay a lucky save (a ship blown ONTO a dock is sheltered by it) — the
      // wording change is the fix, per Wyatt: "you're able to steady your boat against the dock to
      // not be blown aground."
      //
      // BUG-2 (storm-push-not-rendered): reason `dock` is mooredReason()'s "standing on a dock"
      // cause, and that covers TWO different stories the engine cannot tell apart — the storm
      // shoved this ship onto the dock earlier in this same push (D-20's genuine lucky save), or
      // the ship was simply parked at that dock before the storm started and has not moved an
      // inch. The shove line is only true for the first, and Wyatt watched it fire for the second.
      // The engine must keep emitting the one `dock` reason (that field is serialized into all 31
      // determinism fixtures — see .planning/debug/storm-push-not-rendered.md), so the UI picks
      // the wording instead, from movement the event stream already records. When the ship never
      // moved, it renders the SAME already-approved "still docked" line as justDocked/home, which
      // is exactly what it is — no new player-facing copy is invented here (D-14/D-27).
      //
      // NARR-01/D-25 (Wyatt-approved 2026-07-29): the lucky-break "dockMoved" wording is his own
      // rewrite, applied verbatim; D-37 keeps "shoves" here deliberately (a rescue, not a move — see
      // that decision's own resolution note). justDocked/dock(unmoved)/home stay byte-identical to
      // each other (D-28: one shared string reached by three doors, not three copies to merge).
      dock:shoved?dockShove:stillDocked,
      home:shoved?dockShove:stillDocked, // G2: the Tortuga berth tells the same two stories
    };
    // D-07/D-25: addressed siblings to L above — a sibling table, never a replacement, so the
    // third-person strings above (asserted byte-identical by scripts/bot_storm_narration_test.js)
    // are untouched by this branch existing.
    if(isLocalTo(e.p,viewerSeat)){
      const stillDockedYou=`${pn(e.p)} — yer still docked, so the storm can't run ye aground.`;
      const dockShoveYou=`Lucky break! The gust shoves ye towards a dock, ${pn(e.p)}, and yer crew steadies her fast ⚓`;
      const LA={
        justDocked:stillDockedYou,
        dock:shoved?dockShoveYou:stillDockedYou,
        home:shoved?dockShoveYou:stillDockedYou, // G2: same split as the neutral table above
      };
      return {txt:LA[e.reason]||`${pn(e.p)} — the dock steadies ye from running aground ⚓`,pops:[[at(e.p),"⚓"]]};
    }
    return {txt:L[e.reason]||`The dock steadies ${pn(e.p)} from running aground ⚓`,pops:[[at(e.p),"⚓"]]};
  },
  // D-08: `blocked` names TWO captains — e.p (the ship that struck sail) and e.other (the ship
  // spotted dead ahead, blocking the way). Each reads it addressed to themselves independently.
  // NARR-01/D-25/D-54 (Wyatt-approved 2026-07-29): approved neutral + actor-addressed text applied
  // verbatim; the third viewer (the ship spotted dead ahead) has no dedicated addressed text from
  // Wyatt's review (D-54's second-addressed-party field was still empty for this card at approval
  // time — see 15-06-SUMMARY.md's outstanding-addressedNotes2 list) so its line is derived by the
  // same mechanical name→"ye" substitution every other multi-viewer builder in this table already
  // applies to its own approved template, not new invented wording.
  blocked:(e,at,cellPx,viewerSeat)=>{
    let txt;
    if(isLocalTo(e.p,viewerSeat))txt=`${pn(e.p)} — ye spot ${pn(e.other)} dead ahead, so ye strike sail and hold fast.`;
    else if(isLocalTo(e.other,viewerSeat))txt=`${pn(e.p)} spots ye dead ahead, so strikes sail and holds fast.`;
    else txt=`${pn(e.p)} spots ${pn(e.other)} dead ahead, so strikes sail and holds fast.`;
    return {txt,pops:[[at(e.p),"⚓"]]};
  },
  anchorHold:(e,at,cellPx,viewerSeat)=>({txt:isLocalTo(e.p,viewerSeat)?`${pn(e.p)} — yer anchor's already down. It holds fast ⚓`:`${pn(e.p)}'s anchor is already down — it holds fast ⚓`,pops:[[at(e.p),"⚓"]]}),
  tradewind:(e,at,cellPx,viewerSeat)=>({txt:isLocalTo(e.p,viewerSeat)?`🌀 ${pn(e.p)} — yer blown into the trade winds and swept around the rim!`:`🌀 ${pn(e.p)} is blown into the trade winds and swept around the rim!`,pops:[[at(e.p),"🌀",true,TRADE_SWIRL_IMG]]}),
  // D-19 SIMPLIFIED (Wyatt-approved 2026-07-29): `parley` now fires ONLY on a refusal — an accepted
  // hail emits a `trade` event instead (src/ui/flow.js's bot-hail path), so the old `e.ok===true`
  // "deal struck!" branch here is unreachable and has been removed rather than left as dead copy a
  // future rewrite could land on. `table:parley`/`table:parley~refused` collapse to this one
  // refusal-only builder (D-25/D-26: no notes given for either row, so wording is unchanged from
  // before — only the unreachable branch is gone).
  parley:(e,at,cellPx,viewerSeat)=>{
    // D-08: each named captain reads the offer addressed to themselves — the offerer's own view,
    // and the target's own view; a third-party viewer reads today's exact text.
    let txt;
    if(isLocalTo(e.a,viewerSeat))txt=`🤝 ${pn(e.a)} — ye offered ${fmtItem(e.offer)} for ${pn(e.b)}'s ${fmtItem(e.want)} — they refused.`;
    else if(isLocalTo(e.b,viewerSeat))txt=`🤝 ${pn(e.a)} offered ${fmtItem(e.offer)} for yer ${fmtItem(e.want)} — ye refused.`;
    else txt=`🤝 ${pn(e.a)} offered ${fmtItem(e.offer)} for ${pn(e.b)}'s ${fmtItem(e.want)} — they refused.`;
    return {cls:"trade",txt,pops:[[at(e.a),"🙅"]]};
  },
  // NARR-01/D-25/D-38 (Wyatt-approved 2026-07-29): the coin case names the real amount lost, per
  // his question on the addressed card — computed from the event stream's own snapshots (the
  // immediately-prior event's captured coins for this seat, same technique movedSinceTurnStart
  // uses for position), never a new engine field. Falls back to no parenthetical when the amount
  // can't be determined (a fabricated/detached event) rather than guessing.
  aground:(e,at,cellPx=0,viewerSeat)=>{
    const evs=(appState.game&&appState.game.events)||[];
    const idx=evs.lastIndexOf(e);
    const prev=idx>0?evs[idx-1]:null;
    const before=(prev&&prev.state&&prev.state[e.p])?prev.state[e.p].coins:null;
    const after=(e.state&&e.state[e.p])?e.state[e.p].coins:null;
    const lost=(before!=null&&after!=null)?Math.max(0,before-after):null;
    const lossTag=lost!=null?` <span class="nobrk">(−${lost}🌕)</span>`:"";
    return {txt:isLocalTo(e.p,viewerSeat)
        ?(e.ing?`${pn(e.p)} — ye flip ⚫TAILS and run aground! A crate of ${ilabelImg(e.ing)} tumbles overboard and floats back to its island ⚠️`:`${pn(e.p)} — ye flip ⚫TAILS and run aground! Ye lose half yer coins on repairs${lossTag} ⚠️`)
        :(e.ing?`${pn(e.p)} flips ⚫TAILS and runs aground! A crate of ${ilabelImg(e.ing)} tumbles overboard and floats back to its island ⚠️`:`${pn(e.p)} flips ⚫TAILS and runs aground! Loses half their coins doing repairs${lossTag} ⚠️`),
      caps:[[e.p,e.ing?`⚫T aground! ${ING_EMOJI[e.ing]} overboard`:"⚫T aground! 💥 −half 🌕"]],
      pops:e.ing?[[at(e.p),"📦",true,CRATE_OVERBOARD_IMG,"splash"]].concat(islandXY(e.ing,cellPx)?[[islandXY(e.ing,cellPx),ING_EMOJI[e.ing],true,ING_IMG[e.ing],"splash"]]:[]):[[at(e.p),"💥"]]};
  },
  shipwrecked:(e,at,cellPx,viewerSeat)=>({txt:isLocalTo(e.p,viewerSeat)?`${pn(e.p)} — yer shipwrecked, and lose yer turn making repairs.`:`${pn(e.p)} is shipwrecked, and loses their turn making repairs.`,caps:[[e.p,"🛠️ shipwrecked — repairs all turn"]],pops:[[at(e.p),"🛠️"]]}),
  // NARR-01/D-25/D-46/D-48 (Wyatt-approved 2026-07-29): docking copy applied verbatim.
  //
  // D-46, STATED AS IT ACTUALLY READS (this comment used to describe the over-application F10
  // found, i.e. exactly what D-46 forbade): *"Only the `ing` (heads) narration branch loses its
  // place clause. The other three dock branches still need theirs. Do not apply the cut across all
  // four."* So `ing` — and ONLY `ing` — drops the place and leads with the payoff, because the
  // actor already read the place name on the Dock button and the flip prompt, and the haul itself
  // is the payoff that needs no antecedent.
  //
  // G1 (Wyatt-approved 2026-07-30) — THE RULE, stated rather than its history: **the addressed line
  // says what happened to YOU, not where you are.** The actor already read the place name on the
  // Dock button and again on the flip prompt; a third telling is noise. Wyatt: "you already know
  // that you docked at the Flour Patch — we don't need to tell you that again."
  //
  // This governs the `gA` table only. The NEUTRAL `g` table below keeps every place clause, because
  // a spectator watching someone else's turn has no other source for either the place or the goods.
  //
  // F10's real defect was a DANGLING PRONOUN, and it stays fixed — by a different means. The
  // addressed `bought` line read "ye flip ⚫ TAILS, but buy it anyway for 3🌕", where "it" referred
  // to nothing. F10 gave "it" an antecedent by restoring the whole place-and-goods clause; that
  // over-corrected, because the place was never the fix. `bought` now NAMES ITS GOODS directly in
  // place of the pronoun — antecedent supplied, place dropped. `empty` returns to its shorter
  // pre-F10 form at Wyatt's explicit ask; `coins` needs neither place nor goods.
  //
  // F5: the ingredient icon now sits directly before the ingredient NAME on every branch that names
  // goods, via the single shared `goods` value from dockFlavorIcon() — one place decides where the
  // icon goes, so these branches cannot drift apart again.
  //
  // D-48 — the flavour text (DOCK_FLAVOR) is kept and used on every branch, `ing` included.
  dock:(e,at,cellPx,viewerSeat)=>{
    const place=dockPlace(e.ing),goods=dockFlavorIcon(e.ing);
    const g={ing:`docks at ${place} and flips ⚪ HEADS — hauls aboard ${goods}!`,
      empty:`docks at ${place} and finds no ${ilabelImg(e.ing)}, so grabs 3🌕`,
      bought:`docks at ${place} for ${goods} and flips ⚫ TAILS, but buys it anyway for 3🌕`,
      coins:`docks at ${place} for ${goods}, but flips ⚫ TAILS and takes 3🌕`};
    // G1: no addressed branch names the place — see the rule above. D-46's record stands among the
    // NEUTRAL forms, where `ing` alone drops the place. `bought` keeps its goods (that is F10's
    // fix, carried forward: the pronoun is replaced by the thing itself, not by the place).
    const gA={ing:`ye haul aboard ${goods}!`,
      empty:`ye find no ${ilabelImg(e.ing)}, so ye grab 3🌕`,
      bought:`ye flip ⚫ TAILS, but buy ${goods} anyway for 3🌕`,
      coins:`ye flip ⚫ TAILS and take 3🌕`};
    const capM={ing:`gets ${ING_EMOJI[e.ing]}!`,empty:"island empty · +3🌕",bought:`buys ${ING_EMOJI[e.ing]} −3🌕`,coins:"+3🌕"};
    // no flip happened on an empty island, so don't caption one
    const F=e.got==="empty"?"":(e.heads?"⚪H":"⚫T");
    const gotIng=(e.got==="ing"||e.got==="bought");
    // #3: the crate rising out of the boat renders the ingredient art (ING_IMG), not the old
    // emoji — the emoji stays as the fallback popEmoji() shows if the image can't load.
    const txt=isLocalTo(e.p,viewerSeat)?`${pn(e.p)} — ${gA[e.got]}`:`${pn(e.p)} ${g[e.got]}`;
    return {txt,caps:[[e.p,F?`docks ${F} ${capM[e.got]}`:`docks — ${capM[e.got]}`]],
      pops:[[at(e.p),gotIng?ING_EMOJI[e.ing]:"🌕",false,gotIng?ING_IMG[e.ing]:null]]};
  },
  // notes/edits NARR-02: name the cooperation bonus rather than leaving a bare "(+1🌕 each)"
  trade:(e,at,cellPx,viewerSeat)=>{
    const bonus=appState.game.cfg.tradeBonus?' <span class="nobrk">— they each get +1🌕 for cooperating like good friendly pirates</span>':"";
    const bonusYou=appState.game.cfg.tradeBonus?' <span class="nobrk">— ye each get +1🌕 for cooperatin\' like good friendly pirates</span>':"";
    // D-08/D-25: each named trader reads it addressed to themselves; a third-party viewer reads
    // today's exact text.
    let txt;
    if(isLocalTo(e.a,viewerSeat))txt=`🤝 ${pn(e.a)} — ye trade ${fmtItem(e.gave)} to ${pn(e.b)} for ${fmtItem(e.got)}${bonusYou}`;
    else if(isLocalTo(e.b,viewerSeat))txt=`🤝 ${pn(e.a)} trades ${fmtItem(e.gave)} to ye for ${fmtItem(e.got)}${bonusYou}`;
    else txt=`🤝 ${pn(e.a)} trades ${fmtItem(e.gave)} to ${pn(e.b)} for ${fmtItem(e.got)}${bonus}`;
    return {cls:"trade",txt,
      caps:[[e.a,`🤝 got ${fmtItem(e.got)}`],[e.b,`🤝 got ${fmtItem(e.gave)}`]],
      pops:[[at(e.a),"🤝"],[at(e.b),"🤝"]]};
  },
  // NARR-01/D-25/D-38 (Wyatt-approved 2026-07-29): sidebet copy applied verbatim, signed amounts.
  sidebet:(e,at,cellPx,viewerSeat)=>{
    const you=isLocalTo(e.p,viewerSeat);
    if(e.won)return {cls:"trade",txt:e.amt
      ?(you
        ?`🔭 ${pn(e.p)} — ye called it! 1🌕 + double yer bet <span class="nobrk">(+${e.delta}🌕)</span>`
        :`🔭 ${pn(e.p)} called it! 1🌕 + double their bet <span class="nobrk">(+${e.delta}🌕)</span>`)
      :(you
        ?`🔭 ${pn(e.p)} — ye called it! <span class="nobrk">(+${e.delta}🌕)</span>`
        :`🔭 ${pn(e.p)} called it! <span class="nobrk">(+${e.delta}🌕)</span>`)};
    return {cls:"trade",txt:you
      ?(e.amt
        ?`💰 ${pn(e.p)}, ye backed the wrong ship <span class="nobrk">(−${e.amt}🌕)</span>`
        :`🔭 ${pn(e.p)} — ye backed the wrong ship. No bounty.`)
      :(e.amt
        ?`💰 ${pn(e.p)} backed the wrong ship <span class="nobrk">(−${e.amt}🌕)</span>`
        :`🔭 ${pn(e.p)} backed the wrong ship — no bounty.`)};
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
      if(e.spoilIng)txt=`${head} and takes yer ${spoilText}`;
      else if(isBribe)txt=`${head} — ye bribe yer way out of givin' away a crate with ${spoilText}.`;
      // FIX-07: mechanical person-swap of the ruled "Ye give up {spoil}." line into this composite's
      // own em-dash-continuation shape, matching the pattern the bribe/all-they-have branches above
      // already use in this same chain.
      else if(isEmptyHoldFive)txt=`${head} — ye give up ${spoilText}.`;
      else txt=`${head} — ye give up all ye have${spoilText?`: ${spoilText}`:""}.`;
    }else txt=`${mainClause} ${spoilClause}`;
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
    if(aAddr)txt=`🏃 ${pn(e.a)} — ye attack ${pn(e.d)}, but both shots miss wildly and ${pn(e.d)} slips away! <span class="nobrk">(−1🌕)</span>`;
    else if(dAddr)txt=`🏃 ${pn(e.a)} attacks ye, but both shots miss wildly and ye slip away! <span class="nobrk">(−1🌕)</span>`;
    else txt=`🏃 ${pn(e.a)} attacks ${pn(e.d)}, but both shots miss wildly and ${pn(e.d)} slips away! <span class="nobrk">(−1🌕)</span>`;
    return {cls:"battle",txt,caps:[[e.d,"🏃 flees! −1🌕"]],pops:[[at(e.d),"🏃"]]};
  },
  // notes/edits UI-04: on a catch, the emoji that rises from the boat is the SUGARFISH itself, not
  // the fishing line — you just landed a fish, so show the fish coming up out of the boat.
  // NARR-01/D-25/D-38 (Wyatt-approved 2026-07-29): signed catch amounts.
  fish:(e,at,cellPx,viewerSeat)=>{
    const outcome=e.heads?'catches a 🐠 sugarfish! <span class="nobrk">(+2🌕)</span>':(appState.game.cfg.sardine?'nets a 🦀 candycrab <span class="nobrk">(+1🌕)</span>':"comes up empty-handed");
    const outcomeYou=e.heads?'catch a 🐠 sugarfish! <span class="nobrk">(+2🌕)</span>':(appState.game.cfg.sardine?'net a 🦀 candycrab <span class="nobrk">(+1🌕)</span>':"come up empty-handed");
    const txt=isLocalTo(e.p,viewerSeat)?`${pn(e.p)} — ye cast a line and ${outcomeYou}`:`${pn(e.p)} casts a line, ${outcome}`;
    return {txt,
      caps:[[e.p,`🎣 ${e.heads?"⚪H":"⚫T"} ${e.heads?"+2🌕":(appState.game.cfg.sardine?"🦀 +1🌕":"nothing")}`]],
      pops:[[at(e.p),e.heads?"🐠":(appState.game.cfg.sardine?"🦀":"🎣")]]};
  },
  finish:(e,at,cellPx,viewerSeat)=>({cls:"roundhdr",txt:isLocalTo(e.p,viewerSeat)?`🏁 ${pn(e.p)} — ye return to the Isle of Tortuga with a full recipe!`:`🏁 ${pn(e.p)} returns to the Isle of Tortuga with a full recipe!`,
    caps:[[e.p,"🏁 recipe done!"]],pops:[[at(e.p),"🏁",true]]}),
  shotclock:(e,at,cellPx,viewerSeat)=>({cls:"trade",txt:isLocalTo(e.p,viewerSeat)?`⏱ ${pn(e.p)} — ye were too slow and lose 1🌕; everyone else gets +1🌕`:`⏱ ${pn(e.p)} was too slow — loses 1🌕, everyone else +1🌕`}),
  // NARR-01/D-25 (Wyatt-approved 2026-07-29): "loses the turn" → "loses their/yer turn" for
  // parallelism with the addressed form.
  //
  // WYATT, 2026-07-30 — HIS WORDING, chosen from three drafts: "Dozed at the helm!". The old
  // headline was "Snoozing pirates lose their treasure!", which became untrue the moment the two
  // 30-second resource penalties were removed (see expireShotClock in src/orchestrator.js). The
  // event no longer carries `ing` or `coins` AT ALL, so there is one line per viewer instead of a
  // four-way branch, and no `pops` — nothing goes overboard any more, so nothing splashes.
  //
  // If a resource penalty is ever reinstated, this line must change WITH it. That coupling is the
  // whole reason the old wording survived being false: the text described a mechanic the code had
  // moved on from. (15-LEARNINGS #6 — a constant, or a string, that does not mean what it says.)
  shotclockskip:(e,at,cellPx=0,viewerSeat)=>({cls:"roundhdr",txt:isLocalTo(e.p,viewerSeat)
      ?`⏰ Dozed at the helm! ${pn(e.p)} — ye lose yer turn.`
      :`⏰ Dozed at the helm! ${pn(e.p)} loses their turn.`}),
  // D-08/D-25: both finalists read the result addressed to themselves — the winner's own "ye take
  // it!", the loser's own commiseration; a third-party viewer (and NEUTRAL_VIEWER) reads today's
  // exact third-person text.
  bakeoff:(e,at,cellPx,viewerSeat)=>{
    const loser=e.winner===e.a?e.b:e.a;
    let txt;
    if(isLocalTo(e.winner,viewerSeat))txt=`${iconImg(CUPCAKE_IMG)} BAKEOFF! ${pn(e.a)} vs ${pn(e.b)} — ye take it!`;
    // D-54: the loser's line is Wyatt's own wording (15-ADDRESSED2-APPROVED.json) — both captains
    // stay NAMED rather than the loser becoming "ye". In a bakeoff the matchup is the drama, and
    // "vs ye" flattens one of the two names exactly when the pairing is the point. It also carries
    // no consolation clause: he approved it plain. Do not re-add one.
    else if(isLocalTo(loser,viewerSeat))txt=`${iconImg(CUPCAKE_IMG)} BAKEOFF! ${pn(e.a)} vs ${pn(e.b)} — ${pn(e.winner)} takes it!`;
    else txt=`${iconImg(CUPCAKE_IMG)} BAKEOFF! ${pn(e.a)} vs ${pn(e.b)} — ${pn(e.winner)} takes it!`;
    return {cls:"battle",txt,
      caps:[[e.winner,`${iconImg(CUPCAKE_IMG)} wins the bakeoff!`]],pops:[[at(e.winner),"🧁",true,CUPCAKE_IMG]]};
  },
  // notes/edits EOV-01: the blue narration box no longer announces the win — it would duplicate the
  // dedicated one-off victory box (see endLive's flash) and the End of Voyage summary. The board
  // still gets a crown pop over the winner; the announcement itself lives in the celebratory box.
  end:(e,at)=>({cls:"roundhdr",txt:"",caps:[],pops:e.winner===null?[]:[[at(e.winner),"👑",true,CROWN_IMG]]}),
  turn:()=>null,
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
  if(e.t==="parley"||e.t==="trade"||e.t==="bakeoff"){if(e.a!=null)seats.add(e.a);if(e.b!=null)seats.add(e.b);}
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
  const battlesWon=mk(),battlesLost=mk(),timesAttacked=mk(),fishCount=mk(),dist=mk(),
    trades=mk(),shotClockCount=mk(),longestBattle=mk(),hottestStreak=mk(),streak=mk();
  const bump=(i,heads)=>{
    if(i==null)return;
    if(heads){streak[i]++;if(streak[i]>hottestStreak[i])hottestStreak[i]=streak[i];}
    else streak[i]=0;
  };
  let prevPos=appState.game.players.map(()=>null);
  for(const e of appState.game.events){
    if(e.t==="battle"||e.t==="battleflee"){
      // #5: a fought-then-fled battle still counts toward game.battles, so it must count in the
      // per-player battle stats too (it was a real attack with real rounds) — only the clean
      // win/loss tally is skipped for a flee, since nobody won.
      if(e.t==="battle"&&e.winner!=null){battlesWon[e.winner]++;battlesLost[e.winner===e.a?e.d:e.a]++;}
      timesAttacked[e.d]++;
      const rounds=e.rounds||[],len=rounds.length;
      if(len>longestBattle[e.a])longestBattle[e.a]=len;
      if(len>longestBattle[e.d])longestBattle[e.d]=len;
      for(const r of rounds){bump(e.a,!!r[0]);bump(e.d,!!r[1]);}
    }
    if(e.t==="fish"){if(e.heads)fishCount[e.p]++;bump(e.p,!!e.heads);}
    if(e.t==="dock")bump(e.p,!!e.heads);
    if(e.t==="anchor")bump(e.p,true);
    if(e.t==="aground")bump(e.p,false);
    if(e.t==="trade"){trades[e.a]++;trades[e.b]++;}
    if(e.t==="shotclock"||e.t==="shotclockskip")shotClockCount[e.p]++;
    if(e.state)e.state.forEach((s,i)=>{
      if(prevPos[i])dist[i]+=Math.abs(s.pos[0]-prevPos[i][0])+Math.abs(s.pos[1]-prevPos[i][1]);
      prevPos[i]=s.pos;
    });
  }
  return {battlesWon,battlesLost,timesAttacked,fishCount,dist,trades,shotClockCount,longestBattle,hottestStreak};
}
// notes/edits EOV-04: the end-of-voyage honours. The full pool of ~10 keepsakes, each with a
// pirate-y name, a byline, its 1:1 emblem art (assets/badges/*.png — placeholders Wyatt will
// repaint), and the underlying plain stat. `scale` is roughly "how big a value is impressive" for
// that category, so assignBadges() can compare across categories with different units. `key` selects
// the per-player stat array (computeAwards() output, plus a synthesised `tails`).
const BADGE_POOL=[
  {key:"battlesWon",   img:"cutlass",  name:"The Cutlass of a Thousand Notches", byline:"One notch per fallen foe, carved into the hilt.",                 stat:"Most battles won",   unit:"",         scale:3},
  {key:"fishCount",    img:"herring",  name:"The Golden Herring",                byline:"For the sweetest rod in the ocean.",                              stat:"Most fish caught",   unit:"",         scale:4},
  {key:"dist",         img:"compass",  name:"The Horizon-Chaser's Compass",      byline:"For the salt-crusted soul who sailed further than sense allowed.", stat:"Farthest traveled",  unit:" sq",      scale:45},
  {key:"longestBattle",img:"medal",    name:"The Iron Gut Medal",                byline:"For the crew that refused to sink.",                               stat:"Longest battle",     unit:" rounds",  scale:4},
  {key:"tails",        img:"blackspot",name:"The Black Spot of Bad Tides",       byline:"Survived the curse — worst luck on the Sugar Seas.", stat:"Most tails flipped", unit:" tails", scale:16},
  {key:"hottestStreak",img:"doubloon", name:"The Lucky Doubloon",                byline:"Heads, then heads, then heads again — Lady Luck rode on their shoulder.", stat:"Hottest streak", unit:" heads", scale:4},
  {key:"trades",       img:"ledger",   name:"The Silver-Tongued Ledger",         byline:"Struck more deals than a Tortuga fishmonger on market day.",       stat:"Most trades struck", unit:"",         scale:3},
  {key:"timesAttacked",img:"target",   name:"The Painted Target",                byline:"Somehow every cannon in the Caribbean swung their way.",           stat:"Most set upon",      unit:"",         scale:3},
  {key:"battlesLost",  img:"timbers",  name:"The Splintered Timbers",            byline:"Took a right drubbing and lived to grumble about it.",             stat:"Most battles lost",  unit:"",         scale:3},
  {key:"shotClockCount",img:"barnacle",name:"The Barnacle Brain",                byline:"Pondered each move till the barnacles grew — no rush in these waters.", stat:"Slowest to decide", unit:"",      scale:3},
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
  const arrs=Object.assign({},s,{tails:appState.game.players.map(p=>(p.flips||0)-(p.heads||0))});
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
  return appState.game.players.map((p,i)=>bySeat[i]); // one per captain, in seat order
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
export function msgHoldMs(text){
  text=text||"";
  let raw=HOLD_BASE_MS+text.length*HOLD_MS_PER_CHAR;
  const body=text.replace(/[.,!?]+$/,""); // trailing punctuation doesn't count as a mid-string pause
  const pauses=(body.match(/[,!?.]/g)||[]).length;
  raw+=pauses*HOLD_PAUSE_MS;
  return Math.round(Math.min(Math.max(raw,HOLD_FLOOR_MS),HOLD_CEILING_MS));
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
export const SHIP_GLIDE_MS=350; // must match drawBoard()'s ship `transition: transform .35s`
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
// The tick is paired with an equally short LINEAR css glide, so the browser interpolates between
// our discrete targets and absorbs the timer jitter setTimeout has and vsync-aligned rAF does not.
// That pairing is what makes a setTimeout-driven motion look as smooth as an rAF one.
// UNITS: milliseconds BETWEEN motion updates — so SMALLER is smoother, not larger. 16ms is ~60
// updates a second, which is the display's own refresh rate and therefore the practical ceiling:
// going lower buys nothing a screen can show. (Wyatt asked for "48" reading 24 as a frame rate;
// 16ms is ~60/sec, i.e. more than the 48/sec he was after, in the direction he wanted.)
export const RIM_SWEEP_TICK_MS=16;
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
// opts[i] can come back missing — a remote seat's answer can resolve to null (remotePrompt
// resolves null when Firebase gives back a response with no `choice` field, e.g. a dropped
// connection), or a replay log can be stale/corrupt. Left unguarded that throws mid-decision
// and silently stalls whatever awaited it; falling back to a safe index keeps play moving.
export function resolveOpt(opts,i,fallback){
  if(opts[i])return{i,opt:opts[i]};
  console.warn("resolveOpt(): invalid choice index",i,"of",opts.length,"options — defaulting to",fallback);
  return{i:fallback,opt:opts[fallback]};
}
export function ask(msg,opts,colors,sub){
  // during reload-replay, return the recorded choice (an index) mapped through the freshly
  // rebuilt opts — so object-valued options resolve to live game references, not stale copies.
  if(appState.replaying){
    if(appState.dlogIdx<appState.dlog.length){appState.dlogN++;return Promise.resolve(resolveOpt(opts,appState.dlog[appState.dlogIdx++],0).opt.value);}
    netHandlers().onEndReplay();
  }
  const seat=appState.curSeat;
  // D-02 (18-05): the shot clock used to arm HERE, before the prompt's own buttons were even in
  // the DOM — a player on a long prompt lost up to ~2.8s of their 30s window to the typewriter
  // reveal before they could act at all (D-01 now holds the buttons hidden until it resolves).
  // Publish a one-shot continuation instead: whichever panel() render actually gates the button
  // row (18-01's pendingReveal seam) claims it and fires it once the buttons are truly clickable.
  // Deliberately does NOT itself call the arming function defined below — this file's only mention
  // of that identifier is its own declaration line (a hard gate on this task's own diff); panel.js
  // is the sole caller, since it already imports it and is where every claim of this continuation
  // actually happens (both the deferred-reveal path and the remote estimate path). The closure
  // below just marks the arm claimed and hands the real seat back to whoever calls it, since
  // panel()'s own currentTurnSeat() derivation is a display-only approximation (it can drift from
  // the actual asked seat during a nested battle sub-decision) and must never be the value that
  // actually gets armed.
  //
  // Published BEFORE onBroadcast() below, not just before onLocalAsk/onRemotePrompt — netNarrate
  // (onBroadcast's target) calls showNarration() synchronously on THIS (host) browser before it
  // ever reaches Firebase, so it is the FIRST panel() render this call produces on either branch:
  // the actor's own line for a local seat, or the neutral spectator line for a remote one — and
  // for a remote seat that spectator render is the ONLY panel() call this browser ever makes for
  // this decision (the real button row renders on the deciding guest's own browser instead).
  let resolveArmed;
  const armed=new Promise(res=>{resolveArmed=res;});
  appState.clockPendingLocal=decisionIsLocal(seat);
  appState.clockPendingText=msg;
  appState.clockPendingArm=()=>{resolveArmed();return seat;};
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
  // scripts/ui_contract_check.js assertion 7 gates the rule.
  netHandlers().onBroadcast(`${pn(seat)} is deciding…`,[{seat,html:msg}]);
  const isFlip=opts.length===1&&!!opts[0].flip;
  // `sub` is optional helper text rendered under the button row; an option flagged `disabled`
  // renders greyed and non-clickable (notes/edits #5) — used for the too-poor Attack button.
  const base=decisionIsLocal(seat)?netHandlers().onLocalAsk(msg,opts,colors,sub)
    :netHandlers().onRemotePrompt(seat,{kind:"ask",msg,labels:opts.map(o=>o.label),
       colors:colors?colors.map(c=>c||""):null,classes:opts.map(o=>o.cls||""),
       disabled:opts.map(o=>!!o.disabled),sub:sub||null,flip:isFlip,
       flipIdx:opts.findIndex(o=>o.flip),back:opts.findIndex(o=>o.back)});
  // No-panel belt: nothing claimed the arm during the synchronous render above — a pure flip
  // prompt (opts.length===1 with a `flip`) never calls panel() at all (see localAsk()), so there
  // is no reveal to defer onto. Arm right now so this decision is never left unclocked; identical
  // to today's timing for exactly this case (T-18-13). Inlines the same two-line body the arming
  // function below performs (host guard, then start the clock for this seat) rather than naming
  // it a second time in this file, for the same reason the closure above doesn't.
  if(appState.clockPendingArm){
    appState.clockPendingArm=null;appState.clockPendingLocal=false;appState.clockPendingText="";
    resolveArmed();
    if(appState.isHost){const p=appState.game.players[seat];if(p)startShotClock(p);}
  }
  // Hard constraint 1: withShotClock() bails out and returns `base` unwrapped unless
  // seat===appState.shotClockSeat — chaining it onto `armed` guarantees the seat has already been
  // armed (shotClockSeat is already set) before withShotClock ever inspects it, so the 30s
  // auto-skip resolver is installed for every clocked decision, never skipped (T-18-12).
  const idxP=armed.then(()=>withShotClock(seat,base,0));
  return idxP.then(i=>{const r=resolveOpt(opts,i,0);netHandlers().onLogDecision(r.i);return r.opt.value;});
}
// re-arms the shot clock with a fresh 30s window right before a new decision is shown to
// whichever seat is being asked — every ask()/pickCell()/non-flip battleAsk() call in the
// game goes through this, so every decision anyone makes is timed the same way.
export function armClock(seat){
  if(!appState.isHost)return;
  const p=appState.game.players[seat];if(p)startShotClock(p);
}

/* ---------- pause / pacing ---------- */
// solo pause (see toggleShotClockPause) freezes the whole game by making every await-ed
// sleep() stall first — bots pace their turns entirely through sleep(), so this alone halts
// bot play without threading a paused-check through every call site.
export function waitWhilePaused(){
  return appState.shotClockPaused?new Promise(res=>{
    const iv=setInterval(()=>{if(!appState.shotClockPaused){clearInterval(iv);res();}},150);
  }):Promise.resolve();
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
// keep the yellow action panel in step with the bot's latest move — liveRender only
// updates the board/log/bubble, so without this the panel stays stuck on the last human prompt.
export async function narrateCurrent(){
  const e=appState.game.events[appState.evIdx];if(!e)return;
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
export function setActor(s){appState.curSeat=s;}
export function seatLocal(s){return s===appState.mySeat;}
// D-10: a sentinel seat value no real seat index (0..3) can ever equal — passing it as
// viewerSeat forces isLocalTo()'s neutral (never-addressed) branch, used to compute the
// viewer-neutral default line narrationVariants() diffs every per-seat rendering against.
export const NEUTRAL_VIEWER=-1;
// D-10/Pitfall 2: viewerSeat null/undefined MUST delegate to seatLocal()'s live appState.mySeat
// read and therefore behave byte-identically to today — scripts/bot_storm_narration_test.js
// never sets appState.mySeat, so this default is exactly what keeps that script green
// unmodified. An explicit numeric viewerSeat (including NEUTRAL_VIEWER) instead compares
// directly, ignoring whatever the live appState.mySeat happens to be.
export function isLocalTo(seat,viewerSeat){
  return viewerSeat==null?seatLocal(seat):seat===viewerSeat;
}
// pass & play: every human seat shares this one browser, so any human seat resolves locally
// regardless of mySeat — unlike real online multiplayer, there's no other device to reach over
// remotePrompt/remoteDraftPrompt (which would throw anyway, since db/room are null here).
export function decisionIsLocal(s){return (appState.passAndPlay&&appState.game.players[s].strategy==="human")||seatLocal(s);}

/* ---------- shot clock ---------- */
export function startShotClock(p){
  if(!appState.isHost||appState.timerOff)return;   // #7: timer switched off — decisions wait, never time out
  appState.shotClockSeat=p.idx;
  appState.shotClockDeadline=Date.now()+30000;
  appState.shotClockFired={};
  appState.turnExpired=false;
  appState.shotClockPaused=false;
  netHandlers().onBroadcastClock();
  if(appState.shotClockTimer)clearInterval(appState.shotClockTimer);
  appState.shotClockTimer=setInterval(shotClockTick,500);
}
export function stopShotClock(){
  if(!appState.isHost)return;
  // BUG-02: stash the in-flight decision's force-resolver before dropping the live reference, so
  // rearmShotClock() can hand it back. Keyed by seat — restoring a resolver that belongs to an
  // older decision would force-resolve the wrong promise, which is worse than having no auto-skip.
  if(appState.shotClockForce&&appState.shotClockSeat!=null)appState.shotClockStash={seat:appState.shotClockSeat,force:appState.shotClockForce};
  appState.shotClockSeat=null;appState.shotClockForce=null;appState.shotClockPaused=false;
  if(appState.shotClockTimer){clearInterval(appState.shotClockTimer);appState.shotClockTimer=null;}
  netHandlers().onBroadcastClock();
}
// notes/edits BUG-02: re-arm the CURRENT turn's clock after the timer is switched back on. This is
// deliberately not startShotClock(): that clears shotClockFired, which would let the same turn be
// charged the 20s penalty twice. D-06 says an already-fired penalty is neither refunded nor
// replayed — switching the timer off only prevents FUTURE penalties. Also restores the stashed
// force-resolver so the 30s auto-skip survives the toggle (see stopShotClock).
// Not a pause button: D-04 keeps multiplayer on the ⏱ toggle only, and this adds no new UI.
export function rearmShotClock(p){
  if(!appState.isHost||appState.timerOff)return;
  appState.shotClockSeat=p.idx;
  appState.shotClockDeadline=Date.now()+30000;   // D-05: a full fresh 30s, not the remainder
  appState.shotClockPaused=false;
  // shotClockFired is deliberately NOT reset here (D-06) — see above.
  // turnExpired is deliberately NOT cleared: if the turn already expired, the flow is unwinding
  // and watchTimer's guard below refuses to re-arm it at all.
  if(appState.shotClockStash&&appState.shotClockStash.seat===p.idx){appState.shotClockForce=appState.shotClockStash.force;appState.shotClockStash=null;}
  netHandlers().onBroadcastClock();
  if(appState.shotClockTimer)clearInterval(appState.shotClockTimer);
  appState.shotClockTimer=setInterval(shotClockTick,500);
}
// solo/bots-only games only — pausing wouldn't make sense with other humans waiting on you
export function soloBotGame(){return appState.game&&appState.game.players&&appState.game.players.filter(p=>p.strategy==="human").length<=1;}
// CLOCK-02: the pause/resume state-mutation body, extracted out of toggleShotClockPause below
// so src/orchestrator.js's watchPause() can call it directly on the host branch of a networked
// pause toggle — the SAME shotClockDeadline/shotClockPauseElapsed math as before (D-07: resume
// continues from the remaining time, not a fresh 30s), just relocated, not rewritten. No
// isHost/soloBotGame gate lives in here on purpose (D-05/D-06): the caller decides who may call
// this — solo's toggleShotClockPause() below (host-only), or the host branch of watchPause()
// (never the guest branch, which only mirrors the boolean for rendering).
export function applyPauseState(nowPaused){
  if(nowPaused){
    appState.shotClockPaused=true;
    if(appState.shotClockSeat!=null){
      appState.shotClockPauseElapsed=Date.now()-(appState.shotClockDeadline-30000);
      if(appState.shotClockTimer){clearInterval(appState.shotClockTimer);appState.shotClockTimer=null;}
    }
  }else{
    appState.shotClockPaused=false;
    if(appState.shotClockSeat!=null){
      appState.shotClockDeadline=Date.now()+30000-appState.shotClockPauseElapsed;
      appState.shotClockTimer=setInterval(shotClockTick,500);
    }
  }
}
// notes/edits BUG-02 / D-18 (phase 21): the timer-off state-mutation body, extracted VERBATIM out
// of src/orchestrator.js's watchTimer() Firebase-listener callback so BOTH the networked path
// (watchTimer(), unchanged below other than calling this) and the new local path (toggleTimer()'s
// solo/pass-and-play branch) share this ONE body — the whole point being that the re-arm fix below
// (BUG-02: switching the timer off then back on mid-turn must re-arm the clock for the player
// whose turn is in progress, or the game freezes) cannot drift between the networked and local code
// paths. Mirrors applyPauseState()'s own no-gate discipline immediately above: every appState.isHost
// gate already lived INSIDE this body before the move and stays exactly where it was — the caller
// decides who may call this, not this function.
export function applyTimerOff(off){
  const was=appState.timerOff;
  appState.timerOff=off;
  if(appState.isHost&&appState.timerOff)stopShotClock();
  else if(appState.isHost&&was&&!appState.timerOff&&appState.shotClockSeat==null&&!appState.turnExpired){
    // shotClockSeat==null is what prevents double-arming: this fires on EVERY client for every
    // write (networked path) or the one local browser (solo/pass-and-play), so the host also runs
    // it for a write a guest originated.
    const seat=currentTurnSeat();
    const p=seat!=null?appState.game.players[seat]:null;
    if(p&&!p.done)rearmShotClock(p);
  }
  // src/ui/util.js is imported by src/ui/panel.js (setClockUI() lives there) — calling setClockUI()
  // directly here would close an import cycle scripts/module_graph_check.js forbids outright, so
  // this reaches it through the same netHandlers() render seam toggleShotClockPause() uses one
  // function below.
  netHandlers().onSetClockUI();
}
// works any time in solo play, not just on your own turn — shotClockPaused doubles as the
// whole game's pause flag (see waitWhilePaused/sleep above), so pausing between turns
// actually freezes the bots instead of just a countdown that isn't running yet.
// CLOCK-02/D-05/D-06: the soloBotGame() half of the old gate is REMOVED here — multiplayer now
// reaches pause too, via src/orchestrator.js's togglePause()/watchPause(), which call
// applyPauseState() directly instead of this wrapper. This wrapper stays host-gated and is now
// only the solo/pass-and-play path (togglePause()'s local fallback when there is no db/room).
export function toggleShotClockPause(){
  if(!appState.isHost)return;
  applyPauseState(!appState.shotClockPaused);
  netHandlers().onSetClockUI();
}
export function shotClockTick(){
  if(appState.shotClockSeat==null)return;
  const elapsed=Date.now()-(appState.shotClockDeadline-30000);
  if(!appState.shotClockFired.t20&&elapsed>=20000){appState.shotClockFired.t20=true;applyShotClockPenalty();}
  if(elapsed>=30000){netHandlers().onExpireShotClock();return;}
  netHandlers().onSetClockUI();
}
export function applyShotClockPenalty(){
  const p=appState.game.players[appState.shotClockSeat];if(!p)return;
  const others=appState.game.players.filter(q=>q!==p&&!q.done);
  const take=Math.min(1,p.coins);
  p.coins-=take;others.forEach(q=>q.coins++);
  appState.game.ev({t:"shotclock",p:p.idx,others:others.map(q=>q.idx)});
  netHandlers().onNarrateLastEvent();
  netHandlers().onLiveRender();
}
// mirrors render()'s "whose turn is it" derivation — used by setClockUI() to tell a genuinely
// idle moment apart from a bot quietly taking its turn, since startShotClock() is only ever
// armed for a human decision (ask()), never for a bot's turn.
export function currentTurnSeat(){
  if(!appState.game||!appState.game.events)return null;
  for(let i=appState.evIdx;i>=0&&i>appState.evIdx-80;i--){
    const t=appState.game.events[i]&&appState.game.events[i].t;
    if(t==="turn")return appState.game.events[i].p;
    if(t==="newround")return null;
  }
  return null;
}
// If `seat` is the one currently on the shot clock, wrap its decision so expireShotClock() can
// force a default answer once 30s run out, instead of the answer waiting forever. A no-op for
// every other decision in the game (recipe drafts, battle/trade sub-flows, etc).
// Critically: once the wrapped decision is answered for real (not forced), the clock stops
// immediately rather than continuing to tick toward that seat — otherwise a spectator who
// answers a side-bet prompt right away keeps getting timed against for the rest of the battle,
// long after they have nothing left to decide.
export function withShotClock(seat,base,defaultVal){
  if(!appState.isHost||seat!==appState.shotClockSeat)return base;
  return new Promise(res=>{
    let done=false;
    appState.shotClockForce=()=>{if(!done){done=true;res(defaultVal);}};
    base.then(v=>{
      if(!done){
        done=true;appState.shotClockForce=null;
        // BUG-02: the decision resolved for real, so any resolver stashed for THIS seat across a
        // timer-off is dead — drop it so a later re-arm can't force-resolve a settled promise.
        if(appState.shotClockStash&&appState.shotClockStash.seat===seat)appState.shotClockStash=null;
        if(appState.shotClockSeat===seat)stopShotClock();
        res(v);
      }
    });
  });
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
export function preloadAssets(){
  const urls=[BOARD_IMG,DOCK_IMG,WIND_ARROW_IMG,TRADE_SWIRL_IMG,`${ASSET_BASE}logo.jpg`,
    ...BOAT_IMG,...ISLAND_SHAPE_IMG,...ING_ALL.map(i=>ING_IMG[i])];
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
// pp_id/pp_timerOff are structurally excluded from this mechanism (D-03) — never versioned/cleared.
// pp_lastName joins that exclusion in FIX-01 (Phase 22): it carries a display name, not resumable
// game state, so it is never cleared by leaveGame() either — that is precisely the point, per D-04.
export const SESSION_SCHEMA_V=1;
export const SOLO_SCHEMA_V=1;
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
export function getLastName(){
  let n=null;try{n=localStorage.getItem("pp_lastName");}catch(e){}
  return n||"";
}
export function saveLastName(v){try{localStorage.setItem("pp_lastName",v);}catch(e){}}
export function genCode(){const A="ABCDEFGHJKMNPQRSTUVWXYZ";let s="";for(let i=0;i<4;i++)s+=A[Math.floor(Math.random()*A.length)];return s;}
export function saveSession(){try{localStorage.setItem("pp_sess",JSON.stringify({v:SESSION_SCHEMA_V,room:appState.room,mySeat:appState.mySeat,isHost:appState.isHost}));}catch(e){}}
export function clearSession(){try{localStorage.removeItem("pp_sess");}catch(e){}}

// --- host-refresh recovery: record & replay the decision log ---
// Encode so a "stay put" (null) still persists as a non-empty object (Firebase drops nulls,
// and setting a node to {} deletes it — which would leave a gap in the ordered log).
export function encodeDec(v){return (v===null||v===undefined)?{n:1}:{v:v};}
export function decodeDec(e){return (e&&Object.prototype.hasOwnProperty.call(e,"v"))?e.v:null;}
// ---- singleplayer persistence: reuse the same replay mechanism multiplayer host-refresh uses,
// but keep the log in localStorage instead of Firebase, since there's no server for solo games ----
export function saveSoloState(){
  if(!appState.soloMeta)return;
  try{localStorage.setItem("pp_solo",JSON.stringify({v:SOLO_SCHEMA_V,...appState.soloMeta,dlog:appState.dlog}));}catch(e){}
}
export function clearSoloState(){appState.soloMeta=null;try{localStorage.removeItem("pp_solo");}catch(e){}}
export function resumeSoloGame(saved){
  appState.numSeats=saved.strategies.length;appState.room=null;appState.isHost=true;appState.mySeat=0;
  appState.passAndPlay=!!saved.passAndPlay;
  const names=saved.names||[saved.name]; // old solo saves only ever had one human, at seat 0
  appState.roster=saved.strategies.map((s,i)=>i<names.length?{name:names[i],id:"solo",bot:false}:{name:"",id:"",bot:true,strat:s});
  appState.soloMeta=appState.passAndPlay?{names,strategies:saved.strategies,seed:saved.seed,passAndPlay:true}
                      :{name:saved.name,strategies:saved.strategies,seed:saved.seed};
  appState.dlog=(saved.dlog||[]).slice();appState.dlogIdx=0;appState.dlogN=0;
  appState.replaying=true;
  netHandlers().onBeginGame(roundCfg(saved.strategies),saved.seed);
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
