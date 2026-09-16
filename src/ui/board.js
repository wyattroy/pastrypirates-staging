// src/ui/board.js
//
// Phase 11 (SPLIT-03/06), wave 11-03. The board + storm rendering cluster — the DOM-heaviest,
// most Safari-sensitive slice of the classic <script> region. Extending 11-01/11-02's proven
// "move verbatim + rewire bare reads into imports + bridge grows + gates green" pattern to the
// functions that actually own board-render state (drawBoard/render/renderLog are the sole
// mutators of the render-only `let`s below).
//
// CRITICAL: this file carries the v1.0 BUG-01 storm-crash fix (pre-baked PNG rain tile,
// snap-not-animate narration height) — drawBoard()/buildStormLayers()/render()'s bodies below are
// moved BYTE-IDENTICAL to the classic source. Do not refactor, "clean up", re-animate, or reorder
// anything inside them; a structural regression here is the milestone's known Safari risk
// (11-CONTEXT.md D-12, re-verified live on Safari in 11-08).
//
// SCOPED EXCEPTION — ONE DIRECTOR STEP 1 (Wyatt-approved 2026-08-31). Recorded HERE, in the header
// a reader checks first, because a checker's verdict was that without it the next reader is
// entitled to revert this in good faith — and would be right to. His words, granting it:
// "i approve you changing board.js and anything else you need to change to execute our 4-layer plan".
// THAT APPROVAL IS SCOPED TO THE FOUR-LAYER PLAN, not to this region generally. A change in here
// that is not part of that plan still needs its own ruling.
// WHAT CHANGED: render()'s backward walk for "whose turn is it", and activeTurnSeat()'s, now call
// deriveActiveSeat() in src/shared/storyboard.js instead of each keeping a private copy.
// AND, LATER THE SAME DAY: render() previously derived the seat once and passed NO list, silently
// taking a default while the other ring site passed the narrow one — so the two disagreed. Wyatt
// then ruled "rings follow active player the whole game with no exception including during
// bakeoff", which collapsed the two lists into one and let the option be DELETED. render() derives
// once again, from the one rule, and the ring, the captains box and the pass-and-play row order
// all read it. Nothing else in either body moved.
// (This paragraph said "nothing else in either body moved" while render()'s body had moved a second
// time — caught by CEO review 40. The header is what the unruled-exception gate blesses, so a
// header that is behind its own region is the one comment in this file that must never be stale.) The same fact was being derived FIVE times in three files; it is now
// derived once, and the shared module is a leaf tier that scripts/module_graph_check.js forbids
// from importing src/ui/ or src/state/ at all.
// WHY THAT IS SAFE, in BUG-01's own terms — the same test the two exceptions below apply. BUG-01
// was a LIVE CSS GRADIENT plus a MASK composited every frame, and a narration height animating on
// every typewriter tick. This edit replaces a `for` loop over a JavaScript array with a function
// call returning the same value: no gradient, no mask, no layer, no animation, no per-frame work,
// no DOM. LAYERS is still 4.
// AND IT WAS NOT LEFT AT REASONING. Verified on WebKit 26.5 at 1280x800 and 390x664 with storms
// forced every 1.5s: the full four-layer storm stack mounted on both, the shared walk agreed with
// live appState.curSeat 110/110 and 97/97, and there were ZERO pageerrors, console errors, crashes
// or disconnects. A screenshot shows the active ripple ring on the correct ship mid-storm — the
// exact thing this walk drives. Limit, stated: neither run passed Day 1, so a long voyage, a live
// ovens/bake and a newround boundary were NOT exercised in a browser; those are covered instead by
// a 20,000-stream differential against the old walks (0 mismatches for every consumer).
// ONE HONEST DIFFERENCE, since "byte-for-byte" would be unearned: where an establishing event
// carries p === undefined the old walks returned undefined and this returns null. No consumer can
// tell — every reader uses `!= null` or compares against an integer — but the type moved, and that
// is worth a reader knowing.
// AND A PRECEDENT NOT TO FOLLOW: render()'s ovens/bake widening is a deliberate change to this body
// that was never recorded in this header either. That is a second unrecorded deviation, not a
// licence for a third.
//
// SCOPED EXCEPTION TO THE ABOVE — G19 (Wyatt-approved 2026-07-30), recorded here so the next reader
// is not entitled to revert it. buildStormLayers() WAS changed, deliberately and narrowly, in two
// ways: (a) its RNG source swapped from unseeded Math.random() to a private mulberry32 seeded from
// the game, so every client in a room sees the same rain, and (b) two tuning constants retuned to
// the midpoint of two screens measured live (baseSpeed 0.75 -> 0.676, a new BASE_SCALE 0.969). The
// pure spec-building half was lifted into stormLayerSpecs() so it can be tested headlessly; the
// DOM-writing half applies those specs in exactly the order and with exactly the properties it
// always did.
//
// WHY THAT IS SAFE, stated in terms of what BUG-01 actually fixed. The Safari crash was caused by a
// LIVE CSS GRADIENT plus a MASK being composited every frame, and by the narration box's height
// animating on every typewriter tick. The fix was to pre-bake the rain into a PNG tile, animate
// only background-position, and snap the height. NONE of that changes here: no gradient, no mask,
// no per-frame work, no extra layers (LAYERS is still 4), and the layers are still built ONCE and
// cached by the childElementCount guard. Different numbers into the same four static properties.
// The Safari eyeball check is on this task's human-verify list regardless.
//
// SCOPED EXCEPTION — PHASE 19 / WIND-00 (Wyatt-approved 2026-07-31, the "go-ahead" recorded in
// 19-01-SUMMARY.md), recorded here so the next reader is not entitled to revert it. render() gained
// exactly ONE appended call to windDotsTick inside its existing `if(spinNeedle&&e.wind)` block,
// passing the same live `angle` — nothing already there was reordered or removed. showStats() (19-05)
// gained a SECOND appended call, to renderWindSummary, as the very last statement of its existing
// body — same pattern, same rule: nothing already there was reordered or removed, and the call is a
// no-op unless the prototype is enabled. Everything else this exception covers lives in a new,
// clearly-marked region between the
// "WIND DOT PROTOTYPE (Phase 19 / WIND-00) BEGIN" and "... END" markers below (after
// buildStormLayers()), inert unless explicitly enabled (WIND_PROTOTYPE_ENABLED_DEFAULT=false,
// flipped only by the `?wind=1` URL flag or the `pp_wind_proto` localStorage key).
//
// WHY THAT IS SAFE, in BUG-01's own terms. BUG-01 was a LIVE CSS GRADIENT plus a MASK, animated via
// an animated mask-position and a blur filter, composited every frame over a 220%-sized layer. None
// of that appears anywhere in the wind-dot region: only the two compositor-safe properties the
// post-mortem at index.html:97-105 endorses — `transform` and `opacity` — are ever animated, via a
// single shared requestAnimationFrame loop writing `translate3d(...)` plus an outer `rotate(...)`
// exactly the way `.rlayer` already does above. No live gradient, no mask, no blur, no filter, no
// box-shadow, no backdrop appear in the region, and scripts/wind_dot_contract_check.js greps for
// exactly those substrings on every `npm test` — a mechanically enforced promise, not a hopeful one.
// This gate deliberately runs the dots through storms as well as calm turns (D-06 run 2 proves the
// layer holds while storms arrive and leave); a non-storm-only rule is WIND-01's, and Phase 20's.
//
// Purity bar for src/ui/: reads DOM and game state, NEVER imports src/net/ (D-07).
// scripts/module_graph_check.js and scripts/ui_contract_check.js both gate this mechanically.  [UNGATED-IN-4: ui_contract_check.js does not read 4/ — 03-UI-CONTRACT-TRIAGE.md, plan 03-02]
//
// Deviation ($ duplicate, mirrors 11-01's recipe.js precedent): `$` is a classic-script-local
// `const $=id=>document.getElementById(id)` (index.html:863), used ~120+ times across the
// still-classic region far beyond this cluster's own consumers — reproduced verbatim as a
// private module-local helper instead of "moved" (moving it would break every other classic call
// site). The classic script keeps its own untouched copy until a later wave empties it entirely.
//
// Deviation (cell/shipEls/activeRing/spinNeedle/stormText/stormDial/windLabels/logRenderedTo —
// mirrors 11-02's cellPx/shipEls finding, same root cause, opposite direction): this cluster OWNS
// these classic-script top-level `let`s — drawBoard()/render()/renderLog() are their sole
// mutators — so they move here verbatim as ordinary module-scope `let`s (src/state/index.js's
// header already documents these 7 render-handle names as deliberately excluded from Phase 10's
// appState migration and left for this phase). Three of them — `cell`, `shipEls`,
// `logRenderedTo` — also have external still-classic readers/writers that are NOT moving this
// wave (localPickCell/remotePickHighlights read `cell`; showChatBubble reads `shipEls`; beginGame
// resets `logRenderedTo` before a fresh game — all panel/flow/lobby functions slated for later
// waves). A classic script's bare read of a module-local `let` can't resolve at all (no
// `import`), and the (now-deleted, Phase 11) bridge's one-time global-object-spread snapshot
// couldn't have helped either — it copied primitive/reassigned-array VALUES once at boot, not a
// live binding, so a
// later `cell=W/n` inside this module would never reach a stale global copy. Exported three
// narrow accessor functions (boardCell/boardShipEls/resetBoardLog) for exactly those external
// call sites instead; index.html's 6 call sites were updated to use them (see this plan's
// SUMMARY). Removed once those still-classic callers move into src/ui/ in a later wave.
// activeRing/spinNeedle/stormText/stormDial/windLabels have zero readers outside this cluster
// (grep-confirmed) and stay module-private with no accessor needed.
//
// Deviation (chatBubbles — mirrors 11-02's EVENT_NARRATION finding): render() reads the classic
// `const chatBubbles={}` object (declared elsewhere in the classic script, alongside the
// chat-bubble UI functions) to decide whether to reposition an active bubble. A classic script's
// top-level `const` never becomes a window property the way a `function` declaration does, so
// board.js cannot read it as a bare global unless it moves. Unlike cell/shipEls above, chatBubbles
// is a plain object whose entries are only ever set/deleted in place (`chatBubbles[i]=b`,
// `delete chatBubbles[i]`) — never reassigned wholesale — so it survives the PP bridge's
// value-copy snapshot exactly like appState does (the copied value IS the live object reference).
// Moved here as an EXPORTED object (not module-private), since still-classic
// positionChatBubble/showChatBubble/removeChatBubble/clearChatBubbles (chat feature, a later
// wave) keep mutating it as a bare global via the bridge with zero changes to their own bodies.

import { appState } from "../state/index.js";
import { Game, roundCfg } from "../engine/index.js";
import {
  mulberry32,
  DIRS, STORM_DIAG, HEXCOL, ASSET_BASE, EMOJI_IMG,
  BOARD_IMG, DOCK_IMG, BOAT_IMG, ING_IMG, ING_HOLE_IMG, ANCHOR_IMG, TRADE_SWIRL_IMG,
  WIND_ARROW_IMG, COMPASS_DIAL_IMG, COMPASS_NEEDLE_IMG, COIN_IMG, SCROLL_IMG, CROWN_IMG,
  STORM_CLOUD_IMG,
  HOURGLASS_IMG, CROISSANT_IMG, CAKE_SLICE_IMG, DONUT_IMG, CUPCAKE_IMG,
  FLIP_HEADS_IMG, FLIP_TAILS_IMG, COIN_SPIN_IMG,
  iconImg, iname, ingImg, emojify,
  devHost,
} from "../shared/index.js";
import {
  dockOrient, tracePolygonLoops, roundedPathFromLoop, islandArtPlacement, shipXY, pulseEl,
  // describeFor + NEUTRAL_VIEWER dropped with LOAD-03's last step: their only use here was seeding
  // the decorative board's demo log line, and that board no longer renders. Dead imports are
  // forbidden in this codebase (D-33/D-34/D-40) and no gate catches them, so they go with the code
  // that used them rather than being left behind as plausible-looking dependencies.
  assignBadges, pname, pn, buildPlayerRows, applyCaptainOrder, SHIP_GLIDE_MS, vwPx, vhPx, say, seat, fixedOrigin,
  fitHold,   // 2026-09-11: every hold on one line (his check-9 note)
  fitRecipeName,   // 2026-09-12: the recipe's name at the largest size that fits its card
} from "./util.js";
import { deriveActiveSeat } from "../shared/storyboard.js";
import { mayRevealRecipe, offersRecipeCheck } from "../shared/visibility.js";
import { recipeTitle, recipeInfo, winRecipeSpan, recipeArticle } from "./recipe.js";
import { playFlip, startFlipSpinSound, stopFlipSpinSound, onThunder, playCoinTick, playAwardWhoosh } from "./audio.js";
import { popInHolds } from "./popin.js";

// `$` is a classic-script-local `const $=id=>document.getElementById(id)` (index.html:863) —
// see the file header's deviation note.
const $=id=>document.getElementById(id);
// PERF-01 (2026-08-02): board user units -> cqw, for the active-turn ripple now living in HTML
// (#rippleHost) instead of the board SVG. #boardwrap declares `container-type: inline-size`, so
// 100cqw is exactly the board's rendered width and the SVG's 640-unit viewBox maps onto it 1:1 —
// which is why every ripple call site below still passes the same shipXY() coordinates it always
// did, and why nothing has to recompute a scale factor on resize. 640 is drawBoard's own `W`.
const CQ=v=>v/640*100;

/* ---------- board rendering ---------- */
const SVGNS="http://www.w3.org/2000/svg";
export function el(tag,attrs,parent){const e=document.createElementNS(SVGNS,tag);
  for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
// custom-art icon: a single centered <image>. (cx,cy) is its center in board px; size is its
// width/height in board px.
export function iconAt(svg,cx,cy,size,href,rotateDeg,flip){
  const g=el("g",{transform:`translate(${cx},${cy})${flip?" scale(-1,1)":""}${rotateDeg?` rotate(${rotateDeg})`:""}`},svg);
  const im=el("image",{x:-size/2,y:-size/2,width:size,height:size,href},g);
  /* T-33 — THE FALLBACK TWO COMMENTS ALREADY PROMISED, now actually here. shared/index.js said
     "iconAt() below removes the <image> on load failure, leaving the original emoji/shape visible"
     and spawnPops says "same fallback as iconAt()". Neither was true: this function had no error
     handler, so a failed ingredient image was left showing the browser's broken-image glyph — the
     blue "?" Wyatt photographed on 2026-08-26, on island tiles AND in captains' hold chips.
     Two image failures were caught in a driven solo run, both on holes/sugar.png.

     Removing the <image> is the whole fallback: whatever the art was drawn OVER (the island shape,
     the crate) is underneath and becomes visible again. An empty square is a far better failure
     than a broken-image icon, and it is what the rest of the file already does. */
  im.addEventListener("error",()=>im.remove());
  return g;
}
let cell=0,shipEls=[],activeRing=null,spinNeedle=null,forecastNeedle=null,forecastPulse=null,forecastBox=null,forecastLabel=null,forecastStorm=null,forecastMark=null,forecastSpin=null,forecastSpinner=null,stormText=null,stormDial=null,windLabels=[];

// Exported accessors for the still-classic call sites that read this cluster's render-only state
// directly (localPickCell/remotePickHighlights read cell; showChatBubble reads shipEls) — see the
// file header's deviation note. Removed once those callers move into src/ui/ in a later wave.
export function boardCell(){return cell;}
export function boardShipEls(){return shipEls;}

/* THE TRADE WINDS ACTUALLY BLOW — playtest 21 item 9 (WIND-02, on the roadmap unstarted since
   v1.3). The rim used to be one STATIC WIND_ARROW_IMG per channel square plus a still swirl at each
   drop-off, so the one part of the board that is defined by movement was the only part that never
   moved. Wyatt's pick: always on, so the current teaches itself at a glance before a ship is ever
   swept.

   IT IS HTML, NOT SVG, AND THAT IS THE WHOLE ENGINEERING DECISION. index.html's #sailHost note
   records the measurement that settles it: an animated transform on an SVG child forced ~62 layouts
   PER SECOND — 97% of all layout work with the game idle — and "Chrome does not composite SVG
   transform animations at all; will-change cannot promote an SVG child to its own layer". Animating
   forty arrows in #board would therefore have been the single most expensive thing in the build, on
   a phone Wyatt has already reported running hot. As HTML, transform and opacity are compositor
   work and cost zero layouts.

   THE ROTATION AND THE MOTION ARE ON DIFFERENT ELEMENTS, deliberately. The wrapper carries the
   tangent rotation and never animates; the <img> inside animates translateX and opacity only. So
   each arrow drifts along its OWN channel direction — compose them on one element and the keyframe
   transform would overwrite the rotation, which is the same class of bug as the compass chip whose
   CSS animation erased its SVG transform attribute.

   The per-cell delay is what makes it a CURRENT rather than forty independent twitches: the wave
   travels clockwise around the ring, in the direction a ship is actually carried. */
function buildRimFlow(cellPx){
  const host=$("rimHost"); if(!host)return;
  host.innerHTML="";
  const g=appState.game; if(!g||!g.isRound)return;
  const CQ=v=>(v/640*100)+"cqw";
  const heads=new Set(Object.values(g.rimHead||{}).map(h=>h[0]+","+h[1]));
  const ring=g.rimCellInfo||[];
  ring.forEach((c,i)=>{
    const left=CQ(c.x*cellPx),top=CQ(c.y*cellPx),size=CQ(cellPx);
    const d=document.createElement("div");
    d.style.left=left;d.style.top=top;d.style.width=size;d.style.height=size;
    // the grid cell this belongs to, carried rather than left to be re-derived. Same reasoning as
    // sailHighlightRect's data-gx/gy: two readers there had been inverting the positioning maths by
    // hand, which is a second copy of it to keep in step. It is also what lets a probe check an
    // arrow against its OWN square instead of against the board's corner — under a zoom, points at
    // different board positions move by different amounts, so only a same-cell comparison means
    // anything.
    d.dataset.gx=c.x; d.dataset.gy=c.y;
    if(heads.has(c.k)){
      d.className="rimSwirl";
      const img=document.createElement("img");
      img.src=TRADE_SWIRL_IMG;img.alt="";img.decoding="async";
      d.appendChild(img);
    }else{
      d.className="rimFlow";
      d.style.transform=`rotate(${c.deg+90}deg)`;   // tangent of the clockwise flow — STATIC
      const img=document.createElement("img");
      img.src=WIND_ARROW_IMG;img.alt="";img.decoding="async";
      // the wave runs with the current, one beat per cell around the ring
      img.style.animationDelay=(-(i%ring.length)*0.16)+"s";
      d.appendChild(img);
    }
    host.appendChild(d);
  });
}
/* ⭐ HAS THE BOARD'S ART ARRIVED? — Wy-Blade's sea trial of 2026.09.14.2: both crew GUESTS played the pop-in over a board
   whose pictures had not loaded ("sparkles over a bare grid with no sea, islands or ingredients"; "21 ingredients on open
   water, no island land"). The host, whose pictures were already cached, looked right. So drawBoard counts the pictures it
   starts — the sea, the islands, the crates — and boardArtReady() says when every one has loaded or failed. The recipe
   picker's show waits on it (stage.js rcFlightRun), capped, so a slow connection delays the draft but can never hold it. */
let artPending=0,artDrawnAt=0;
function trackArt(im){
  if(!im)return;
  artPending++;
  let settled=false;
  const done=()=>{if(settled)return;settled=true;artPending=Math.max(0,artPending-1);};
  im.addEventListener("load",done);im.addEventListener("error",done);
}
export function boardArtReady(maxWaitMs){
  return artPending===0||(artDrawnAt>0&&performance.now()-artDrawnAt>maxWaitMs);
}
export function drawBoard(){
  const svg=$("board");svg.innerHTML="";
  artPending=0;artDrawnAt=performance.now();
  // PERF-01 (2026-08-02): the boats live in their own SVG overlaying #board so they paint ABOVE the
  // ripple rings, which are HTML now and would otherwise cover them. Cleared in lockstep with
  // #board — emptying one and not the other would strand ghost boats from the previous board.
  // Same viewBox and same box, so ship coordinates are unchanged. See index.html's paint-order note.
  const shipsSvg=$("boardShips");if(shipsSvg)shipsSvg.innerHTML="";
  const n=appState.game.cfg.grid,W=640;cell=W/n;
  // custom board art (ocean + Isle of Tortuga + its docks baked in) sits behind everything.
  // `grid` draws the functional cell boundaries on top of it: open water is outline-only
  // (fully transparent fill) and the trade-wind channel gets a light 10%-black tint so its
  // squares still read as distinct from open water. `home` (the plain Tortuga tile + anchor +
  // berths) fully hides once art loads, since that's baked into the art itself.
  const boardImg=el("image",{x:0,y:0,width:W,height:W,href:BOARD_IMG},svg);
  trackArt(boardImg);
  boardImg.addEventListener("error",()=>boardImg.remove());
  const grid=el("g",{},svg);
  const home=el("g",{},svg);
  boardImg.addEventListener("load",()=>{home.style.display="none";});
  if(appState.game.isRound){
    svg.style.background="transparent";
    for(const k of appState.game.valid){
      const [x,y]=k.split(",").map(Number);
      const rimC=appState.game.rim.has(k);
      el("rect",{x:x*cell,y:y*cell,width:cell,height:cell,
        fill:rimC?"#000000":"none","fill-opacity":rimC?.1:0,stroke:"#a6dee8","stroke-width":1,"stroke-opacity":.5},grid);
    }
    // playtest 21 item 9: the current MOVES now — see buildRimFlow. The arrows and the drop-off
    // swirls left #board entirely, so nothing about the channel is drawn here any more.
    buildRimFlow(cell);
  }else{
    svg.style.background="";
    for(let i=0;i<=n;i++){
      el("line",{x1:i*cell,y1:0,x2:i*cell,y2:W,stroke:"#a6dee8","stroke-width":1,"stroke-opacity":.5},grid);
      el("line",{x1:0,y1:i*cell,x2:W,y2:i*cell,stroke:"#a6dee8","stroke-width":1,"stroke-opacity":.5},grid);
    }
  }
  // home: Isle of Tortuga is a 1-square island with 4 docks (N/S/E/W). The island tile itself
  // is baked into board.png, but the 4 berths around it aren't — those always render for real.
  const [hx,hy]=appState.game.home;
  el("rect",{x:hx*cell+2,y:hy*cell+2,width:cell-4,height:cell-4,rx:cell*.3,
    fill:"#fef48b",stroke:"#f5a623","stroke-width":2},home);
  iconAt(home,(hx+.5)*cell,(hy+.5)*cell,cell*.7,ANCHOR_IMG);
  let homeDockI=0;
  for(const d of Object.values(DIRS)){
    const dx=hx+d[0],dy=hy+d[1];
    if(dx<0||dy<0||dx>=n||dy>=n)continue;
    // invisible — kept only so celebrateHomeDocks() can find each berth's id and geometry
    // (x/y/width/height) once the voyage ends; the dock.png below it is the visible layer
    el("rect",{id:`homeDock${homeDockI++}`,x:dx*cell,y:dy*cell,width:cell,height:cell,
      fill:"none",stroke:"none"},svg);
    // faces back toward Tortuga, centered in its own dock cell so its edge touches the island
    // boundary without crossing into the home tile
    const{rot:rotDeg,flip}=dockOrient([-d[0],-d[1]]);
    const px=(dx+.5-d[0]*.2)*cell, py=(dy+.5-d[1]*.2)*cell;
    iconAt(svg,px,py,cell,DOCK_IMG,rotDeg,flip);
  }
  // islands (arbitrary polyomino shapes): fused cell fills + a single union outline
  const defs=el("defs",{},svg);
  for(const ing of appState.game.ings){
    const cells=appState.game.islandRect[ing];
    const loops=tracePolygonLoops(cells);
    const clipId=`islandClip_${ing}`;
    const clipPath=el("clipPath",{id:clipId},defs);
    for(const loop of loops){
      const pxLoop=loop.map(([x,y])=>[x*cell,y*cell]);
      const d=roundedPathFromLoop(pxLoop,cell*.32);
      el("path",{d},clipPath);
    }
    // custom island art: authored once per canonical shape (see ISLAND_SHAPE_IMG/TET above) and
    // placed with the same rotate/mirror the board used, then clipped to the island's own rounded
    // outline — so hand-drawn art doesn't need rounded corners or to know its own orientation.
    const placement=islandArtPlacement(appState.game.islandShapeMeta[ing],cells,cell);
    if(placement){
      const clipG=el("g",{"clip-path":`url(#${clipId})`},svg);
      const artG=el("g",{transform:placement.transform},clipG);
      trackArt(el("image",{x:0,y:0,width:placement.w,height:placement.h,"preserveAspectRatio":"none",href:placement.href},artG));
    }
    // dock is drawn before the crate icons below so it always sits underneath them — it
    // stretches to the shared edge with the island and would otherwise occlude a crate there
    /* W5-3 — THE DOCK'S PLACEMENT IS COMPUTED ONCE AND THE FLAG READS IT. Wyatt: "the black market
       flags are not attached to the docks. For every dock orientation, set the base of the flag on
       the dock." The flag used to be positioned from the bare dock CELL with a hand-picked vertical
       fraction, while the dock itself is drawn half a cell TOWARD its island — so the two agreed
       only when the dock happened to face up, and the flag floated free on the other three
       orientations. Two placements for one object, kept in step by nothing (rule 23), and the typed
       fraction was the tell (rule 9). Hoisted here so there is one answer to "where is this dock". */
    let dockPx=null, dockPy=null;
    if(appState.game.cfg.singleDock){
      const d=appState.game.dockOf[ing];
      const adj=Object.values(DIRS).find(dd=>appState.game.islands[[d[0]+dd[0],d[1]+dd[1]]]===ing);
      // faces the island, and centered on the shared edge between the dock cell and the island
      // so it visually stretches to meet it rather than sitting centered in open water
      const{rot:dockRotDeg,flip:dockFlip}=adj?dockOrient(adj):{rot:0,flip:false};
      const px=adj?(d[0]+.5+adj[0]*.5)*cell:(d[0]+.5)*cell;
      const py=adj?(d[1]+.5+adj[1]*.5)*cell:(d[1]+.5)*cell;
      dockPx=px; dockPy=py;
      iconAt(svg,px,py,cell,DOCK_IMG,dockRotDeg,dockFlip);
    }
    // one big icon per remaining crate, one per island square — a taken crate turns fully
    // grey in place rather than shrinking to a count badge, so the whole island reads at a glance
    if(appState.game.cfg.crates<1e9){
      cells.slice(0,appState.game.cfg.crates).forEach((c,idx)=>{
        const scx=(c[0]+.5)*cell,scy=(c[1]+.5)*cell;
        const g=iconAt(svg,scx,scy,cell*.8,ING_IMG[ing]);
        g.id=`crate_${ing}_${idx}`;
        trackArt(g.querySelector("image"));
        /* THE POP-IN READS ITS CRATES OFF WHAT WAS DRAWN — the square, the centre, the size, the picture — so there is no
           second copy of where a crate sits (BOARD-RENDERING §2). Until this voyage's pop-in lands, a crate is drawn but
           not shown: his "pop in the ingredients ... until the recipe picker cards appear" (src/ui/popin.js).
           ⚠ VISIBILITY, NOT OPACITY: render() below writes every crate's opacity on every render (a taken crate greys to
           .45), and measured, that un-hid all 21 crates within 700ms of the show starting. */
        Object.assign(g.dataset,{gx:c[0],gy:c[1],cx:scx,cy:scy,size:cell*.8,ing,idx});
        if(popInHolds())g.style.visibility="hidden";
      });
      // 🏴 THE BLACK MARKET FLAG (draft art — emoji until Wyatt commissions a proper flag): flies
      // over the dock when the shelf is empty — the same promise the ceremony card makes, that a
      // sold-out island will still find ye one more ingredient for a price.
      // THE PRICE IS NOT REPEATED HERE ON PURPOSE (corrected 2026-08-27). This comment used to
      // quote "10🌕", which is a number that lives in cfg.blackMarket precisely so it can move —
      // a comment restating it is a second copy that rots silently. "after dark" went with it:
      // Wyatt cut that phrase from the ceremony on 2026-08-27, so repeating it here would have
      // preserved retired wording in the one place nobody thinks to re-read.
      // Built hidden; render() toggles it from the same event snapshot that greys the crates, so
      // the two tells can never disagree.
      if(appState.game.cfg.blackMarket&&appState.game.dockOf&&appState.game.dockOf[ing]){
        const fd=appState.game.dockOf[ing];
        /* W5-3 — ITS BASE STANDS ON THE DOCK, AT EVERY ORIENTATION. `dockPx/dockPy` is the dock's
           OWN drawn centre, already offset half a cell toward its island, so the flag follows the
           dock instead of guessing where it is. A <text> baseline is the bottom of the glyph, so
           putting the baseline at the dock's centre stands the flag ON it rather than floating it
           above — which is his ask in his words, "set the base of the flag on the dock".
           The fallback is the bare cell centre, used only where there is no single dock to read
           (the unlimited-crate lab config), and it is the same .5 centre the whole board uses
           rather than a fraction picked for this one glyph. */
        const fx = dockPx!=null ? dockPx : (fd[0]+.5)*cell;
        const fy = dockPy!=null ? dockPy : (fd[1]+.5)*cell;
        const f=el("text",{x:fx,y:fy,"text-anchor":"middle",
          "font-size":Math.round(cell*.55)},svg);
        f.textContent="🏴";f.id=`bmflag_${ing}`;f.style.opacity=0;
      }
    }else{
      // unlimited-crate config (not used by the live game, kept for the lab): one plain icon
      const mx=cells.reduce((s,c)=>s+c[0],0)/cells.length, my=cells.reduce((s,c)=>s+c[1],0)/cells.length;
      let best=cells[0],bd=1e9;
      for(const c of cells){const dd=(c[0]-mx)**2+(c[1]-my)**2;if(dd<bd){bd=dd;best=c;}}
      const cx=(best[0]+.5)*cell,cy=(best[1]+.5)*cell;
      iconAt(svg,cx,cy,cell*.8,ING_IMG[ing]);
    }
  }
  // wind spinner HUD (bottom-right corner) — sized off `cell` rather than fixed pixels, so it
  // scales with the board's actual cell density instead of a magic number tuned for one grid size.
  // Everything is drawn in a <g> translated to the dial's center, so all local coordinates are
  // relative to (0,0) — the needle's rotation pivot is then exactly "0px 0px", which stays correct
  // at any browser zoom level (an absolute px transform-origin drifted from the dial at non-100% zoom).
  const sr=cell*.95,scx=W-sr-14,scy=sr+32;
  const hud=el("g",{opacity:.95,transform:`translate(${scx},${scy})`,class:"ppHud"},svg); // /4: the pill is the instrument on the stage
  // colored ring stays underneath as the storm-state indicator (still toggled by fill/stroke
  // below) — the dial art sits on top slightly smaller, so a thin halo of that color peeks out
  // around the rim instead of being fully hidden by the now-opaque dial image.
  stormDial=el("circle",{cx:0,cy:0,r:sr,fill:"#fffdf0",stroke:"#f5a623","stroke-width":2.5},hud);
  iconAt(hud,0,0,sr*1.86,COMPASS_DIAL_IMG);
  // compass-dial.png has N/E/S/W baked into the art itself (rather than the plain circle this
  // used to be), so the separately-drawn text labels are gone — windLabels stays around (now
  // always empty) purely so the storm-color-toggle loop below still has something safe to iterate.
  windLabels=[];
  /* THE DIAL IS LEFT ALONE: one ornate needle, always THIS round's wind.
     Two attempts to put the forecast ON the dial both failed for the same reason — anything drawn
     over the needle competes with it. First a ghost needle (mistaken for the live wind), then a
     red chevron (legible, but it shouted louder than the thing it was annotating). The forecast
     now lives in its own chip BELOW the dial, where it annotates without competing. Do not put a
     second marker back on this dial. */
  spinNeedle=el("g",{},hud);
  // needle art's collar (rotation pivot) sits at the vertical center of the image, so the
  // box is centered on (0,0) rather than offset — an offset box put the pivot ~6% of the
  // needle's height away from the collar, a visible wobble when it spins
  const needleImg=el("image",{x:-sr*.336,y:-sr*.68,width:sr*.672,height:sr*1.36,href:COMPASS_NEEDLE_IMG},spinNeedle);
  spinNeedle.style.transition="transform .7s ease";
  spinNeedle.style.transformOrigin="0px 0px";
  stormText=el("text",{x:0,y:sr+16,"text-anchor":"middle","font-size":14,"font-weight":"bold"},hud);
  /* THE FORECAST CHIP (Wyatt, 2026-08-05): a filled box below the compass, where the caption used
     to be, reading "FORECAST: N ↑" — and turning red when a storm is coming.

     SIZING IS DELIBERATE AND NOT sr-RELATIVE. The old caption was font-size 12 in board user
     units, and the board is ~640 units wide — so on a 374px phone it rendered at about SEVEN
     pixels. That is why it was, in his words, almost impossible to see. This is font-size 20 in
     the same space (~12px on that phone) on a 170-unit chip (~99px), which is a legible chip
     rather than a whisper.

     Nudged left of the dial's centre (FC_DX) because the compass sits hard against the board's
     right edge and a centred chip would overflow it. */
  // Sized in the SVG's 640-unit space, which maps to the board's rendered width — so on a 374px
  // phone these units are ~0.58px each. The chip is therefore ~117px wide with ~12px text, against
  // the old caption's ~7px. It is nudged well left of the dial's centre because the compass sits
  // hard against the board's right edge and a centred chip of this width would run off it.
  //
  // TWO NESTED GROUPS, AND THE NESTING IS LOAD-BEARING. The outer one carries the POSITION as an
  // SVG transform attribute; the inner one carries the storm PULSE, which is a CSS animation that
  // writes `transform`. A CSS transform overrides an element's SVG transform attribute outright —
  // so with both on one node the pulse silently erased the translate, and the chip snapped back
  // over the dial's centre and hung 28px off the right edge of the board. Measured, not guessed.
  // Keep the position and the animation on different nodes.
  // Smaller, and ABOVE the dial (Wyatt, 2026-08-05) — below it the chip covered playable squares,
  // and it must not sit on the compass either. There are only ~32 units of room between the board's
  // top edge and the dial, so the height is set to fit that gap exactly, and the negative FC_DY
  // lifts it clear. It lands over the corner's decorative pastry art rather than over the grid.
  /* LAID OUT WITH TWO ANCHORS, NOT ONE CENTRED STRING, and that is deliberate. "FORECAST:" is
     pinned to the left edge with text-anchor:start and the direction to the right edge with
     text-anchor:end, which leaves a fixed gap in the middle for the storm icon to drop into. A
     single centred string would have needed the text measured at runtime to know where the icon
     goes — and measurement is exactly what has gone wrong twice on this chip already. With two
     anchors nothing needs measuring: both ends are nailed to the box. */
  const FC_W=190,FC_H=28,FC_PAD=9,FC_DX=-50,FC_DY=-(sr+2+28);
  forecastNeedle=el("g",{transform:`translate(${FC_DX},${FC_DY})`,class:"fcChip"},hud); // /4: the wind pill supersedes the chip on the stage
  forecastPulse=el("g",{},forecastNeedle);
  forecastBox=el("rect",{x:-FC_W/2,y:0,width:FC_W,height:FC_H,rx:10,
    fill:"#fffdf0",stroke:"#29a3b2","stroke-width":2},forecastPulse);
  forecastLabel=el("text",{x:-FC_W/2+FC_PAD,y:FC_H*0.70,"text-anchor":"start","font-size":15,
    "font-weight":"bold",fill:"#1f4249"},forecastPulse);
  forecastLabel.textContent=say("pill.forecast",{});
  // the game's own storm art, not a Unicode glyph — the same icon the narration uses, so the chip
  // looks like the rest of the game rather than like whatever emoji font the phone happens to have
  // sits immediately left of the direction with a real gap — measured at 170 units wide the
  // cloud crowded the letter, so the chip gained 20 units rather than the icon losing size
  forecastStorm=el("image",{x:FC_W/2-FC_PAD-54,y:FC_H*0.5-11,width:22,height:22,
    href:STORM_CLOUD_IMG},forecastPulse);
  forecastMark=el("text",{x:FC_W/2-FC_PAD,y:FC_H*0.70,"text-anchor":"end","font-size":15,
    "font-weight":"bold",fill:"#1f4249"},forecastPulse);
  /* The hidden-direction spinner (v2.1). Lives in the SAME slot the direction occupies — between
     the cloud's right edge and the box's right padding — because the whole point is that it stands
     where a direction would have stood. Centred in that slot rather than anchored to an edge, since
     a rotating glyph has to turn about its own middle.
     THREE NESTED GROUPS, and every one of them is load-bearing:
       forecastSpin    — SVG transform attribute, position only. Never animated.
       forecastSpinner — the CSS class .fcSpin, rotation only.
     A CSS transform on the positioned element would REPLACE its SVG transform attribute and fling
     the glyph off the chip — the exact failure that cost two attempts when this chip was first
     built (see the comment above about measurement going wrong twice). Splitting position from
     animation is what makes that impossible rather than merely unlikely. */
  const FC_SLOT_L=FC_W/2-FC_PAD-54+22, FC_SLOT_R=FC_W/2-FC_PAD; // cloud's right edge .. box padding
  forecastSpin=el("g",{transform:`translate(${(FC_SLOT_L+FC_SLOT_R)/2},${FC_H/2})`},forecastPulse);
  forecastSpinner=el("g",{},forecastSpin);
  const spinGlyph=el("text",{x:0,y:0,"text-anchor":"middle","dominant-baseline":"central",
    "font-size":18,"font-weight":"bold",fill:"#ffffff"},forecastSpinner);
  spinGlyph.textContent="↑";
  // active-player highlight: a sonar-style ripple of white rings expanding out from the boat
  // (positioned in render). Fixed white, not per-player color, so it stays visible against art.
  //
  // PERF-01 (2026-08-02): these are HTML divs in #rippleHost now, NOT SVG circles in this svg.
  // Measured with the GPU on at a phone viewport, the SVG version forced ~62 layouts per second —
  // 97% of all layout work while the game sat idle, and just over half the main-thread cost during
  // play — from an animation that only touches transform and opacity. Chrome does not composite SVG
  // transform animations at all; will-change cannot promote an SVG child, and transform-box /
  // transform-origin candidates all measured identical to shipped. As HTML the same rings cost
  // ZERO layouts at a locked 60fps.
  //
  // Sizes go out in `cqw` against #boardwrap (container-type: inline-size), so 640 board user units
  // == 100cqw and the geometry maps 1:1: r=cell*.4 becomes a diameter of cell*.8, stroke-width:2
  // becomes a 2-unit border, and both scale with the board exactly as the SVG did — no scale factor
  // to keep in sync, and every call site below keeps the numbers it already had.
  activeRing=$("rippleRing");
  if(activeRing){
    activeRing.innerHTML="";
    activeRing.style.opacity=0;
    activeRing.style.transform="";
    activeRing.style.transition="";
    ringSeat=null;   // a rebuilt ring belongs to nobody yet — its first placement must snap
    const d=CQ(cell*.8), bw=CQ(2);
    for(let i=0;i<3;i++){
      const ring=document.createElement("div");
      ring.className="hrip";
      // left/top are 0 and the parent carries the translate, so the negative margin is what centres
      // each ring on the boat — the job transform-box:fill-box + transform-origin:center did in SVG.
      //
      // NEGATIVE delays, and the sign is the whole point — do not drop the minus. Carried over from
      // the SVG rings verbatim, because it is a property of the ANIMATION, not of the element type,
      // and it survived the move unchanged.
      //
      // A POSITIVE animation-delay leaves the element in its UN-ANIMATED state until the delay
      // elapses, and animation-fill-mode is `none` here. Measured: with +0.9s/+1.8s, rings 2 and 3
      // rendered as static, fully opaque circles at scale 1 (no transform, opacity 1) parked on the
      // boat for the first 0.9s and 1.8s. That is the first-cycle glitch Wyatt filmed — and it
      // cleared itself once every ring had started, which is why it "looked really good after they
      // have loaded".
      //
      // A negative delay instead starts the animation as if it had ALREADY been running that long,
      // so all three rings are correctly distributed at 0%, 33% and 66% from the very first frame.
      // One third of the 2.7s rippleOut cycle in index.html; if that duration changes, this must
      // change with it or the rings bunch together.
      ring.style.cssText=`width:${d}cqw;height:${d}cqw;margin:${-d/2}cqw 0 0 ${-d/2}cqw;`
        +`border-width:${bw}cqw;animation-delay:${-i*.9}s`;
      activeRing.appendChild(ring);
    }
  }
  // ships
  shipEls=[];
  appState.game.players.forEach((player,i)=>{
    // DERIVED from SHIP_GLIDE_MS, not written as a literal `.35s`. util.js's constant carried the
    // comment "must match drawBoard()'s ship `transition: transform .35s`" — two numbers kept in
    // step by hand, in different files, one of them the pacing basis for every per-square animation
    // in the game. setShipGlideMs() below now also has to restore this exact value, which would
    // have made it three. Deriving it makes the coupling structural instead of a promise.
    // PERF-01: appended to shipsSvg, not svg — the boats' whole reason for being a separate layer.
    // Falls back to #board if the overlay is somehow absent, so a stale cached index.html degrades
    // to the old (rings-over-boats) look rather than a board with no ships on it.
    const g=el("g",{style:`transition: transform ${shipGlideCss(SHIP_GLIDE_MS)}`},shipsSvg||svg);
    const boatSize=cell;
    el("image",{x:-boatSize/2,y:-boatSize/2,width:boatSize,height:boatSize,href:BOAT_IMG[i]},g);
    shipEls.push(g);
  });
  // seat the ships on their Isle of Tortuga docks right away, before the first event renders
  appState.game.players.forEach((player,i)=>{
    const [x,y]=shipXY(player.pos,i,appState.game.players,cell);
    shipEls[i].style.transform=`translate(${x}px,${y}px)`;
  });
}
/* ⭐ THE ACTIVE BOAT BOBS ONCE WHEN ITS TURN BEGINS — PASSED on his game feel audit (2026-09-13), as proposed: "One gentle
   bob of the active boat when the turn begins — the eye goes straight to it."
   Called from the ONE event consumer on the `turn` event (orchestrator.js consumeEvent), so every screen bobs the same
   boat at the same moment. The boat's PICTURE bobs (CSS `translate` on its <image>), never its group: the group's
   transform is where the boat sits on the board and carries the sailing glide. A one-shot, so its SVG cost is a moment,
   not the continuous cost BOARD-RENDERING §5 forbids. */
/* ⭐⭐ AND IT KEEPS BOBBING FOR THE WHOLE TURN — Wyatt, 2026-09-14: "I don't see the boat bobbing -- i'd love for it to keep bobbing
   for your whole turn." A one-shot bob at the turn's first frame was lost under the camera's own move to the boat. It is now a slow
   swell from the captain's turn event to the next captain's (or the voyage's end), on every screen, one boat at a time.
   ⚠ IT BOBS IN HTML, NOT IN THE SVG, AND THAT WAS MEASURED. Bobbing the boat's own SVG picture for a whole turn cost 60 LAYOUTS A
   SECOND at his phone size with a phone-class CPU (10/s without it) — the continuous SVG cost BOARD-RENDERING §5 exists to forbid.
   So while the boat sits still, a copy of its picture bobs in #dockCoinHost (a camera layer just over the boats, composited: no
   layout) and the SVG picture hides; the instant the boat's drawn position changes, or anything animates its SVG picture (the sail's
   lean, the arrival's dip, the storm's rock, a cannon's kick, a loser's wobble), the SVG picture is the one shown and those play
   exactly as they always did. The copy follows the boat's drawn place, so a camera move carries both together. */
export const SHIP_BOB = 0.1;        // of a square, up
export const SHIP_BOB_MS = 1400;    // one swell, down and back
let turnBob=null;
export function stopTurnBob(){
  if(!turnBob)return;
  cancelAnimationFrame(turnBob.raf);
  try{ turnBob.anim.cancel(); }catch(e){}
  turnBob.pic.remove();
  if(turnBob.im)turnBob.im.style.visibility="";
  turnBob=null;
}
export function bobShip(seat){
  stopTurnBob();
  const g=shipEls[seat], im=g&&g.querySelector("image"), host=$("bobHost");   // NOT dockCoinHost: that layer is above the weather, and a boat must not be (index.html #bobHost)
  if(!im||!host||!cell||typeof im.animate!=="function")return;
  if(typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const pic=document.createElement("img");
  pic.className="ppBobBoat";pic.alt="";pic.src=im.getAttribute("href")||"";
  pic.style.width=pic.style.height=CQfx(cell);pic.style.visibility="hidden";
  host.appendChild(pic);
  const anim=pic.animate([{translate:"0 0"},{translate:`0 ${CQfx(-cell*SHIP_BOB)}`,offset:.5},{translate:"0 0"}],
    {duration:SHIP_BOB_MS,iterations:Infinity,easing:"ease-in-out",id:"turn-bob"});
  const me={seat,g,im,pic,anim,raf:0};
  turnBob=me;
  let last=null,showing=false;
  const step=()=>{
    if(turnBob!==me)return;
    if(shipEls[seat]!==g||!g.isConnected){ bobShip(seat); return; }      // the board was redrawn: bob the new boat
    const p=drawnShipPoint(seat);
    const moved=!p||!last||Math.abs(p[0]-last[0])>0.01||Math.abs(p[1]-last[1])>0.01;
    if(p&&moved){ pic.style.left=CQfx(p[0]-cell/2); pic.style.top=CQfx(p[1]-cell/2); }
    const show=!!p&&!moved&&g.style.visibility!=="hidden"&&im.getAnimations().length===0;
    if(show!==showing){ showing=show; pic.style.visibility=show?"visible":"hidden"; im.style.visibility=show?"hidden":""; }
    if(show)pic.style.opacity=g.style.opacity||"";
    last=p;
    me.raf=requestAnimationFrame(step);
  };
  me.raf=requestAnimationFrame(step);
}
/* ⭐ THE BOAT SAILS: A WIND-UP, A WAKE, AND A SPLASH WHEN IT ARRIVES — all three PASSED on his game feel audit (2026-09-13),
   as proposed: "A short rock backward, then it surges forward — the classic wind-up that makes movement feel powered." ·
   "A few foam dots that trail and fade, so speed and direction are visible." · "When it stops, it dips and rises once with
   a small ring on the water."
   Called from THE ONE event consumer on a `sail` event (sailSetsOff as the boat moves, sailArrives once the stage has
   settled), so every screen shows the same boat doing the same thing. The boat's PICTURE leans and dips (translate and
   scale on its <image>); its group, which carries its place and its glide, is never touched. The foam and the ring are
   HTML in #popHost, a camera layer under the boats, placed from where the boat is DRAWN at that moment (its computed
   transform), so they sit where the eye sees the hull whatever route or glide is moving it. */
export const SAIL_LEAN=0.09, SAIL_LEAN_MS=320;          // how far back the wind-up rocks, in squares; how long it takes
export const WAKE_EVERY=0.28, WAKE_MS=650;              // a foam dot every this many squares travelled; how long each lasts
export const ARRIVE_DIP=0.07, ARRIVE_MS=520, SPLASH_MS=700;
const fxReduced=()=>typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches;
const CQfx=v=>(v/640*100)+"cqw";
function drawnShipPoint(seat){
  const g=shipEls[seat]; if(!g)return null;
  const m=/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+),\s*([-\d.]+)\)/.exec(getComputedStyle(g).transform);
  return m?[parseFloat(m[1]),parseFloat(m[2])]:null;
}
function fxDot(host,cls,p,size,keyframes,ms){
  const d=document.createElement("div");
  d.className=cls;
  d.style.left=CQfx(p[0]-size/2);d.style.top=CQfx(p[1]-size/2);d.style.width=d.style.height=CQfx(size);
  host.appendChild(d);
  const a=d.animate(keyframes,{duration:ms,easing:"ease-out",fill:"both"});
  a.onfinish=a.oncancel=()=>d.remove();
  return d;
}
export function sailSetsOff(seat,route){
  if(fxReduced()||!shipEls[seat]||!cell)return;
  const im=shipEls[seat].querySelector("image");
  let dx=0,dy=0;
  if(Array.isArray(route)&&route.length>=2){dx=route[1][0]-route[0][0];dy=route[1][1]-route[0][1];}
  const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
  const back=cell*SAIL_LEAN,fwd=back*.55;
  if(im&&typeof im.animate==="function")
    im.animate([{translate:"0px 0px",scale:"1"},
      {translate:`${(-dx*back).toFixed(2)}px ${(-dy*back).toFixed(2)}px`,scale:"0.94",offset:.35},
      {translate:`${(dx*fwd).toFixed(2)}px ${(dy*fwd).toFixed(2)}px`,scale:"1.03",offset:.7},
      {translate:"0px 0px",scale:"1"}],{duration:SAIL_LEAN_MS,easing:"ease-in-out",id:"sail-lean"});
  followHull(seat,WAKE_EVERY,(host,at)=>fxDot(host,"ppWake",at,cell*0.16,[{opacity:.8,scale:"1"},{opacity:0,scale:"0.3"}],WAKE_MS));
}
/* FOLLOW THE DRAWN HULL until it has stopped, and leave something where the boat WAS each time it moves on by `every` of a
   square — so a trail falls behind the boat rather than under it. drop(host, point, angle) makes the mark. */
const SNAP_SQUARES=1.2;
function followHull(seat,every,drop){
  const host=document.getElementById("popHost");
  if(!host)return;
  let last=drawnShipPoint(seat),prev=last,moved=false,stillMs=0,prevT=performance.now();
  const t0=prevT;
  const step=now=>{
    const p=drawnShipPoint(seat);
    if(!p||!host.isConnected)return;
    const dt=now-prevT;prevT=now;
    /* A SNAP IS NOT TRAVEL. A boat sailing or riding the wind moves a fraction of a square a frame; one that jumps more than a
       square in a frame was put back on its true square by a paint (MEASURED on the trade wind: two rides each left a pair of
       streaks pointing straight back along the jump). Nothing trails a jump — the trail picks up again from where it landed. */
    if(prev&&Math.hypot(p[0]-prev[0],p[1]-prev[1])>cell*SNAP_SQUARES){last=p;prev=p;stillMs=0;requestAnimationFrame(step);return;}
    if(prev&&Math.hypot(p[0]-prev[0],p[1]-prev[1])<0.25)stillMs+=dt;else{stillMs=0;moved=true;}
    if(last&&Math.hypot(p[0]-last[0],p[1]-last[1])>=cell*every){
      drop(host,last,Math.atan2(p[1]-last[1],p[0]-last[0]));
      last=p;
    }
    prev=p;
    if((moved&&stillMs>250)||(!moved&&now-t0>1200)||now-t0>8000)return;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
/* ⭐ SPEED LINES ON THE TRADE WIND — PASSED on his game feel audit (2026-09-13), as proposed: "Short streaks trail the boat
   while the current carries it, so the ride reads as fast." Called from THE ONE event consumer on a `tradewind` event, so
   every screen sees every ride. Each streak lies along the direction the hull is travelling (a static `rotate`), and fades
   and shortens behind it. His separate note, that every wind-sailing cue should be yellow-gold, belongs to the sailing
   project on the backlog; these stay white like the rest of the water until that is built. */
export const STREAK_EVERY=0.22, STREAK_MS=780;   // 520 -> 780: Wyatt, 2026-09-14, "I want the speed lines to linger 50% longer"
export function rideStreaks(seat){
  if(fxReduced()||!shipEls[seat]||!cell)return;
  followHull(seat,STREAK_EVERY,(host,at,angle)=>{
    const len=cell*0.55,thick=cell*0.07,d=document.createElement("div");
    d.className="ppStreak";d.dataset.seat=seat;
    d.style.left=CQfx(at[0]-len/2);d.style.top=CQfx(at[1]-thick/2);d.style.width=CQfx(len);d.style.height=CQfx(thick);
    d.style.rotate=`${(angle*180/Math.PI).toFixed(1)}deg`;
    host.appendChild(d);
    const a=d.animate([{opacity:.85,scale:"1 1"},{opacity:0,scale:"0.3 0.6"}],{duration:STREAK_MS,easing:"ease-out",fill:"both",id:"ride-streak"});
    a.onfinish=a.oncancel=()=>d.remove();
  });
}
/* ⭐ CONFETTI FOR THE FIRST CAPTAIN HOME — PASSED on his game feel audit (2026-09-13), as proposed: "The first captain home
   gets a two-second burst — it is the moment the race turns." (The fanfare is a sound and comes with the sound page.)
   Called from THE ONE event consumer on the voyage's FIRST `ovens` event — a captain home with a full hold, lighting the
   ovens — read off the event list, so a reload or a guest joining late never throws it twice. Paper in that captain's
   colour, gold and cream, from their boat. */
export const CONFETTI_PIECES=36, CONFETTI_MS=3000;   // 2000 -> 3000: Wyatt, 2026-09-14, "Make the confetti linger 50% longer"
export function firstHomeConfetti(e){
  if(fxReduced()||!e||e.t!=="ovens"||!appState.game||!shipEls[e.p])return;
  const evs=appState.game.events;
  if(evs.find(x=>x&&x.t==="ovens")!==e)return;              // only the first captain home
  /* ON TOP OF EVERYTHING, IN SCREEN PIXELS, like the treasure coins. Drawn first in the board's own camera layer, the
     pieces MEASURED 3-4px on his phone and rose straight under the narration bubble that announces the ovens: 36 pieces
     nobody could see. A burst for the moment the race turns has to be the top thing on the screen. */
  const ships=$("boardShips")||$("board");
  const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(shipEls[e.p].style.transform||"");
  const from=m&&fixedPointOfBoard(ships,parseFloat(m[1]),parseFloat(m[2]));if(!from)return;
  const ctm=ships.getScreenCTM(),sq=cell*(ctm?ctm.a:1);     // one square of the board, in screen pixels
  const colours=[HEXCOL[e.p]||"#f5a623","#ffd76b","#fff3d6"];
  const rnd=k=>{const x=Math.sin((k+1)*127.1+e.p*31.7)*43758.5453;return x-Math.floor(x);};
  for(let k=0;k<CONFETTI_PIECES;k++){
    const w=Math.max(6,sq*(0.26+rnd(k)*0.1)),h=w*0.5,d=document.createElement("div");
    d.className="ppConfetti";d.style.background=colours[k%colours.length];
    Object.assign(d.style,{left:(from[0]-w/2)+"px",top:(from[1]-h/2)+"px",width:w+"px",height:h+"px"});
    document.body.appendChild(d);
    const ang=-Math.PI/2+(rnd(k+50)-0.5)*Math.PI*1.1,pow=Math.max(45,sq*(2+rnd(k+90)*2));
    const ux=Math.cos(ang)*pow,uy=Math.sin(ang)*pow,spin=(rnd(k+7)-0.5)*900,fall=Math.max(90,sq*4);
    const a=d.animate([{translate:"0px 0px",rotate:"0deg",opacity:1},
      {translate:`${ux.toFixed(1)}px ${uy.toFixed(1)}px`,rotate:`${(spin*.5).toFixed(0)}deg`,opacity:1,offset:.35},
      {translate:`${(ux*1.25).toFixed(1)}px ${(uy+fall).toFixed(1)}px`,rotate:`${spin.toFixed(0)}deg`,opacity:0}],
      {duration:CONFETTI_MS*(0.8+rnd(k+3)*0.4),easing:"cubic-bezier(.2,.6,.4,1)",fill:"both",id:"first-home-confetti"});
    a.onfinish=a.oncancel=()=>d.remove();
  }
}
/* ⭐ A SHOT LANDS: THE CANNON KICKS, THE HIT FLASHES, THE BOARD SHAKES — PASSED on his game feel audit (2026-09-13), as proposed:
   "The firing side's art recoils backward and springs back, with a smoke puff" and "The struck ship flashes white for one frame
   and the board shakes 3px — a hit you can feel." ON THE BOARD, NOT THE BATTLE CARD: he means to retire the battle screen and
   fight over the board, so the reaction belongs to the boats. Called from THE ONE event consumer on a `shotLands` event, which
   the fight records the moment a shot gets through, so every screen feels the same hit. Smoke and flash sit OVER the boats
   (#dockCoinHost); the shake moves the whole board window by its individual `translate`, which composes with the camera. */
/* THE SHOT IS TWICE THE SHOT IT WAS. Wyatt, 2026-09-15: "I didn't see any smoke, or the ship recoil away from the other ship --
   these should all be accentuated 2x." The recoil (KICK_CELL), the puff (SMOKE_CELL) and the board's shake all doubled; the timings
   are unchanged, so the same moment simply reads. All four are dials on his Game Feel Tuner. */
export const KICK_MS=320, SMOKE_MS=520, HIT_AT_MS=110, HIT_FLASH_MS=110, SHAKE_PX=6, SHAKE_MS=300;
export const KICK_CELL=0.28, SMOKE_CELL=1.7;   // of a square: 0.14 -> 0.28, 0.85 -> 1.7
export function shotLands(e){
  if(fxReduced()||!e||e.by==null||!cell)return;
  const shooter=e.by,target=e.by===e.a?e.d:e.a;
  const from=drawnShipPoint(shooter),to=drawnShipPoint(target),host=$("dockCoinHost");
  if(!from||!to||!host)return;
  const len=Math.hypot(to[0]-from[0],to[1]-from[1])||1,ux=(to[0]-from[0])/len,uy=(to[1]-from[1])/len;
  const im=shipEls[shooter]&&shipEls[shooter].querySelector("image");
  if(im&&typeof im.animate==="function")
    im.animate([{translate:"0px 0px"},{translate:`${(-ux*cell*KICK_CELL).toFixed(2)}px ${(-uy*cell*KICK_CELL).toFixed(2)}px`,offset:.18},{translate:"0px 0px"}],
      {duration:KICK_MS,easing:"cubic-bezier(.2,.8,.3,1)",id:"cannon-kick"});
  // a pale puff that small vanished on sand in the frozen-frame photo, so it is bigger, holds its body for a third of its life,
  // and carries a grey edge that reads against sand and sea alike
  fxDot(host,"ppSmoke",[from[0]+ux*cell*.45,from[1]+uy*cell*.45],cell*SMOKE_CELL,[{opacity:1,scale:".35"},{opacity:.9,scale:"1",offset:.35},{opacity:0,scale:"1.45"}],SMOKE_MS);
  setTimeout(()=>{
    if(!host.isConnected)return;
    fxDot(host,"ppHitFlash",drawnShipPoint(target)||to,cell*1.1,[{opacity:1,scale:".75"},{opacity:0,scale:"1.1"}],HIT_FLASH_MS);
    const wrap=$("boardwrap");
    if(wrap&&typeof wrap.animate==="function")
      wrap.animate([{translate:"0px 0px"},{translate:`${SHAKE_PX}px ${-SHAKE_PX/2}px`,offset:.2},{translate:`${-SHAKE_PX}px ${SHAKE_PX/2}px`,offset:.45},
        {translate:`${SHAKE_PX/2}px 0px`,offset:.7},{translate:"0px 0px"}],{duration:SHAKE_MS,easing:"linear",id:"hit-shake"});
  },HIT_AT_MS);
}
/* ⭐ THE LOSER IS KNOCKED ABOUT — PASSED on his game feel audit (2026-09-13), as proposed: "The losing boat wobbles and a crate
   splashes into the sea when spoils are taken." On the `battle` event, which the engine records only for a fight somebody WON (a
   flee and a null battle are other events); the crate goes only when one actually changed hands. It tumbles off the far side of
   the loser, away from the winner, and lands in a splash ring on the water. */
export const KNOCK_MS=900, CRATE_SPLASH_MS=620;
export function loserKnocked(e){
  if(fxReduced()||!e||e.winner==null||!cell)return;
  const loser=e.winner===e.a?e.d:e.a;
  const im=shipEls[loser]&&shipEls[loser].querySelector("image");
  if(im&&typeof im.animate==="function")
    im.animate([{rotate:"0deg"},{rotate:"-12deg",offset:.15},{rotate:"9deg",offset:.38},{rotate:"-5deg",offset:.6},{rotate:"2deg",offset:.8},{rotate:"0deg"}],
      {duration:KNOCK_MS,easing:"ease-out",id:"loser-knock"});
  if(!e.spoilIng)return;
  const host=$("dockCoinHost"),water=$("popHost"),at=drawnShipPoint(loser),won=drawnShipPoint(e.winner);
  if(!host||!at)return;
  const away=(won&&Math.sign(at[0]-won[0]))||1,size=cell*.42,land=[away*cell*.75,cell*.35];
  const img=document.createElement("img");
  img.src=`${ASSET_BASE}plaque/crate.webp`;img.alt="";img.className="ppCrateSplash";
  img.style.left=CQfx(at[0]-size/2);img.style.top=CQfx(at[1]-size/2);img.style.width=img.style.height=CQfx(size);
  host.appendChild(img);
  const a=img.animate([{translate:"0 0",rotate:"0deg",opacity:1,scale:"1"},
    {translate:`${CQfx(land[0]*.5)} ${CQfx(-cell*.55)}`,rotate:`${away*140}deg`,opacity:1,offset:.45},
    {translate:`${CQfx(land[0])} ${CQfx(land[1])}`,rotate:`${away*260}deg`,opacity:.9,scale:".8",offset:.85},
    {translate:`${CQfx(land[0])} ${CQfx(land[1]+cell*.1)}`,rotate:`${away*270}deg`,opacity:0,scale:".5"}],
    {duration:CRATE_SPLASH_MS,easing:"cubic-bezier(.3,.5,.6,1)",fill:"both",id:"crate-splash"});
  a.onfinish=a.oncancel=()=>img.remove();
  if(water)setTimeout(()=>{if(water.isConnected)fxDot(water,"ppSplash",[at[0]+land[0],at[1]+land[1]],cell*.8,[{opacity:.9,scale:".3"},{opacity:0,scale:"1.4"}],SPLASH_MS);},CRATE_SPLASH_MS*.85);
}
export function sailArrives(seat){
  if(fxReduced()||!shipEls[seat]||!cell)return;
  const im=shipEls[seat].querySelector("image");
  if(im&&typeof im.animate==="function")
    im.animate([{translate:"0px 0px"},{translate:`0px ${(cell*ARRIVE_DIP).toFixed(2)}px`,offset:.4},
      {translate:`0px ${(-cell*ARRIVE_DIP*.4).toFixed(2)}px`,offset:.75},{translate:"0px 0px"}],
      {duration:ARRIVE_MS,easing:"ease-in-out",id:"sail-arrive"});
  const host=document.getElementById("popHost"),p=drawnShipPoint(seat);
  if(host&&p)fxDot(host,"ppSplash",p,cell*0.95,[{opacity:.85,scale:"0.35"},{opacity:0,scale:"1.35"}],SPLASH_MS);
}
/* ⭐ STORMS: LIGHTNING WITH THE THUNDER, AND THE BOATS ROCK — PASSED on his game feel audit (2026-09-13), as proposed: "A white
   flash across the board timed to each thunder clap" — with his note, "make this subtle -- too much could be annoying." —
   and "Every boat tilts gently back and forth while the storm lasts." The third storm idea, the sea darkening as a storm
   rolls in, was already there (#stormOverlay's navy tint); it now eases in over a full second.
   ⚠ THE ROCKING RIDES THE THUNDER, NOT A LOOP. The boats are SVG, and Chrome cannot composite a transform animation on SVG
   (BOARD-RENDERING §5: ~62 layouts a second), so a rock running the whole round would spend the board's idle budget for the
   whole storm. Each clap — the first the instant the storm arrives, then about every 20 seconds — rocks every boat for two
   seconds. A clap is per screen (the thunder is scattered on each device), so each screen's lightning matches its own sound. */
export const LIGHTNING_PEAK=0.2, LIGHTNING_MS=420, ROCK_DEG=4, ROCK_MS=2000;
export function stormFlash(){
  const wrap=$("boardwrap"),ov=$("stormOverlay");
  if(!wrap||!ov||!wrap.classList.contains("storming")||fxReduced())return;
  let f=ov.querySelector(".ppLightning");
  if(!f){f=document.createElement("div");f.className="ppLightning";ov.appendChild(f);}
  f.animate([{opacity:0},{opacity:LIGHTNING_PEAK,offset:.1},{opacity:.03,offset:.3},{opacity:LIGHTNING_PEAK*.55,offset:.45},{opacity:0}],
    {duration:LIGHTNING_MS,easing:"ease-out",id:"lightning"});
  shipEls.forEach((g,i)=>{
    const im=g&&g.querySelector("image");
    if(!im||typeof im.animate!=="function"||g.style.visibility==="hidden")return;
    im.animate([{rotate:"0deg"},{rotate:`${ROCK_DEG}deg`,offset:.2},{rotate:`${-ROCK_DEG}deg`,offset:.45},
      {rotate:`${(ROCK_DEG*.6).toFixed(1)}deg`,offset:.7},{rotate:`${(-ROCK_DEG*.3).toFixed(1)}deg`,offset:.88},{rotate:"0deg"}],
      {duration:ROCK_MS,delay:i*60,easing:"ease-in-out",id:"storm-rock"});
  });
}
onThunder(stormFlash);
/* ---------- playback ---------- */
// notes/edits BUG-01: build the storm's rain layers once, on the first storm. The rain is now a
// pre-rendered tiling PNG (see #stormOverlay .rlayer CSS), so each layer only varies things that
// are free to composite — tile scale (depth), fall speed, start offset/phase, and opacity — never
// a live gradient/mask. rotate + translate do the rest on the GPU. 3 layers give depth without
// stacking the texture so heavily it reads as fog.
// G19 (Wyatt-approved 2026-07-30): the PURE half of buildStormLayers — same seed in, byte-identical
// specs out, in any browser. Extracted so it can be tested headlessly and, more importantly, so the
// randomness has ONE source that is not the machine.
//
// WHY. Measured live this session on two screens in the same room: Wyatt's rain averaged 0.818s /
// 200.5px, Claude's 0.534s / 264.7px. This function used to jitter four layers with UNSEEDED
// Math.random() and cache the result per browser, so every player in a room got permanently
// different weather. His fix, option 1: seed it from the game.
//
// mulberry32(seed), NEVER appState.game.r(). THIS IS THE MOST IMPORTANT LINE IN THIS FUNCTION.
// game.r() is the seeded GAME stream; drawing four extra numbers from it would advance that stream
// and desync every client AND all 31 determinism fixtures. A PRIVATE RNG seeded from the same
// number gives identical rain in every browser in the room while consuming nothing from the game.
//
// The per-layer jitter is KEPT (LAYERS=4, JIT=0.86 — his words were to keep it; it is what gives
// the rain depth). What changes is where the variation lives: it used to vary between PLAYERS, and
// now it varies between GAMES.
export function stormLayerSpecs(seed){
  // Same 4 layers / 0.86 jitter as the original CSS rain. Per-layer spacing (which the old build set
  // via a --spacing gradient var) is reproduced by SCALING the tiled PNG — the tile bakes spacing 60
  // / period 113, so scale factor = jittered-spacing / 60. --drop (the fall distance) scales with it
  // so every layer still loops seamlessly; that coupling is easy to break later, so: --drop derives
  // from `scale` (PERIOD*scale) and therefore follows the new base for free.
  //
  // G19 RETUNE (his option 3): "let's split the difference between our two screens' settings right
  // now to use as the new target setting."
  //   baseSpeed 0.75 -> 0.676 — the midpoint of the two measured means, (0.818+0.534)/2 = 0.676.
  //   BASE_SCALE 0.969 — 240 x 0.969 = 232.6px, the midpoint of 200.5 and 264.7 ((200.5+264.7)/2
  //   = 232.6; 232.6/240 = 0.969).
  const LAYERS=4, JIT=0.86, baseSpeed=0.676, BASE_SCALE=0.969, TILE_W=240, TILE_H=226, PERIOD=113;
  const rnd=mulberry32(seed);
  const specs=[];
  for(let i=0;i<LAYERS;i++){
    const ox=rnd(), sp=rnd()*2-1, spd=rnd()*2-1, ph=rnd(), op=rnd()*2-1;
    const scale=BASE_SCALE*(1+sp*0.4*JIT);          // matches old spacing jitter (60 → ~39..81px)
    const dur=baseSpeed*(1+spd*0.5*JIT);
    specs.push({
      scale,
      dur,
      bgSize:(TILE_W*scale).toFixed(1)+"px "+(TILE_H*scale).toFixed(1)+"px",
      drop:(PERIOD*scale).toFixed(2)+"px",          // one dash period at this scale → seamless
      duration:dur.toFixed(3)+"s",
      delay:(-ph*dur).toFixed(3)+"s",               // desync so layers don't fall in lockstep
      bgPosX:(ox*TILE_W).toFixed(1)+"px",
      opacity:Math.max(0,Math.min(1,1+op*0.35*JIT)).toFixed(3), // same opacity jitter as before
    });
  }
  return specs;
}
// G19: the decorative demo board has no game, so it has no seed. Fall back to a FIXED literal rather
// than Math.random() — a demo board that looks the same every load is fine, and it keeps "nothing in
// the rain path draws unseeded randomness" absolute rather than nearly-true.
const DEMO_RAIN_SEED=1337;
export function buildStormLayers(ov,seed){
  if(ov.childElementCount)return; // already built
  for(const s of stormLayerSpecs(seed==null?DEMO_RAIN_SEED:seed)){
    const d=document.createElement("div");
    d.className="rlayer";
    d.style.backgroundSize=s.bgSize;
    d.style.setProperty("--drop",s.drop);
    d.style.animationDuration=s.duration;
    d.style.animationDelay=s.delay;
    d.style.backgroundPositionX=s.bgPosX;
    d.style.opacity=s.opacity;
    ov.appendChild(d);
  }
}

// ============================================================================
// WIND DOT PROTOTYPE (Phase 19 / WIND-00) — the Safari verdict tracer
// ============================================================================
// This region is the whole prototype: seeded per-dot randomness -> a DOM dot layer over the board
// -> a single shared requestAnimationFrame loop that moves the dots and samples frame timing -> an
// on-screen touch panel (switch, 0-100 dial, live readout) -> one call from render(), which already
// knows the live wind direction at exactly the right moment (see the wind block below). Off by
// default (D-08, D-10); enabled only by `?wind=1` or `localStorage.pp_wind_proto==="1"`. See the
// file header's Phase 19 / WIND-00 scoped exception above for the full BUG-01 safety argument.
export const WIND_PROTOTYPE_ENABLED_DEFAULT=true;
/* ===== WIND DOT PROTOTYPE (Phase 19 / WIND-00) BEGIN ===== */

// windPrototypeEnabled() — the on/off switch (D-08, D-10). Memoized into module-scope
// `windProtoEnabled` so a normal build costs exactly one boolean read per render() and touches no
// DOM at all. Both reads are wrapped in try/catch so a `file://` page or a storage-blocked context
// (Safari private mode) falls back to the default instead of throwing.
let windProtoEnabled=null;
export function windPrototypeEnabled(){
  if(windProtoEnabled!==null)return windProtoEnabled;
  let on=WIND_PROTOTYPE_ENABLED_DEFAULT;
  try{ if(location.search.indexOf("wind=1")!==-1)on=true; }catch(err){}
  try{ if(localStorage.getItem("pp_wind_proto")==="1")on=true; }catch(err){}
  windProtoEnabled=on;
  return windProtoEnabled;
}

// windHudEnabled() — the tuning HUD's own switch, separate from the dots themselves so the effect
// can ship while the developer panel stays out of the way. Same memoize-and-guard shape as
// windPrototypeEnabled() above.
let windHudOn=null;
export function windHudEnabled(){
  if(windHudOn!==null)return windHudOn;
  let on=false;
  // CUTOVER 2026-08-26: dev machines only — see devHost() in shared/index.js and Phase 6
  // criterion 4. A player typing ?windhud=1 on the live site must not get a tuning panel.
  try{ if(devHost() && location.search.indexOf("windhud=1")!==-1)on=true; }catch(err){}
  try{ if(localStorage.getItem("pp_wind_hud")==="1")on=true; }catch(err){}
  windHudOn=on;
  return windHudOn;
}

// WIND_DOT_MAX is D-04's 0-100 dial ceiling. WIND_DOT_DEFAULT is D-02's 5-10 target density and
// D-06's locked run-2 value. WIND_DOT_SEED_SALT keeps this stream from correlating with the rain's
// (stormLayerSpecs, above) even though both derive from the same game seed — its hex spells "WIND"
// byte-for-byte (0x57=W,0x49=I,0x4e=N,0x44=D). WIND_LAYER_OVERSIZE mirrors .rlayer's 220% oversize
// so a live rotation never exposes a layer corner. WIND_READOUT_MS is 19-RESEARCH.md Pitfall 4's
// throttle: the readout text updates at most this often, so measuring the frame rate never becomes
// part of the frame cost it measures.
const WIND_SPEED_SCALE=0.2;
// WIND_DOT_DEFAULT 10 -> 20 (Wyatt, 2026-08-10: "Add 100% more wind particles"). Goes with the
// lane-band fix in windDotFrame below — the two together are what he asked for: more dots, and
// all of them actually crossing the board.
const WIND_DOT_MAX=100, WIND_DOT_DEFAULT=20, WIND_DOT_SEED_SALT=0x57494e44, WIND_LAYER_OVERSIZE=2.2, WIND_READOUT_MS=250;
// WIND_DOT_PX (Wyatt, 2026-08-05): "decrease the wind particle size fifty percent" — the
// prototype's 7px halved. A named constant rather than an edited literal, because the size is now
// something taste may move again; nothing else in the region depends on it (the wobble cap and the
// wrap margin are both in layer space, not dot space, so a smaller dot does not change its path).
const WIND_DOT_PX=3.5;

// WIND_STORM_FADE_* (Wyatt, 2026-08-05): "fade out the wind particles when a storm starts — the two
// animation effects should not happen simultaneously." The rain's own fade is `.8s ease` on
// #stormOverlay (index.html), so the two timings are set AGAINST it rather than matched to it:
//  - OUT at 400ms with no delay, so the dots are gone about halfway through the rain's fade IN —
//    the board never shows drifting dots under falling rain.
//  - IN at 900ms behind an 800ms delay, so the dots only begin returning once the rain's own 800ms
//    fade OUT has fully finished. A crossfade back would have been the same overlap in reverse.
// The dots' rAF loop is also STOPPED once the fade-out finishes and restarted before the fade-in
// (windStormSync) — an invisible dot field must not keep paying for frames through a storm, which
// is the one moment the board is already at its most expensive (BUG-01).
const WIND_STORM_FADE_OUT_MS=400, WIND_STORM_FADE_IN_MS=900, WIND_STORM_FADE_IN_DELAY_MS=800;

// WIND_WOBBLE_MAX_PX/WIND_WOBBLE_PERIOD_MS (D-02.2) and WIND_FADE_FRAC (D-02.1) are 19-04's two
// named fill-in points' constants. WIND_WOBBLE_MAX_PX caps the lateral sway's amplitude in the
// layer's LOCAL space (px); WIND_WOBBLE_PERIOD_MS is that sway's period. WIND_FADE_FRAC is the
// fraction of one travel cycle spent rising from 0 to the plateau (and, mirrored, falling back to
// 0) — "roughly the first/last fifth" per 19-04-PLAN.md Task 1.
const WIND_WOBBLE_MAX_PX=14, WIND_WOBBLE_PERIOD_MS=2600, WIND_FADE_FRAC=0.2;

// WIND_METER_* (19-05, D-05) — the calibrated frame-timing meter's constants. This is what turns
// the tracer's raw last-frame-delta readout into a number Phase 20 can trust: everything below is
// classified against a baseline MEASURED on this device in this session, never a hardcoded 60fps
// assumption (19-RESEARCH.md Pitfall 2 — a Low Power Mode iPhone throttled to ~30fps would
// otherwise be misreported as constant stutter, and a historical ProMotion/60fps rAF cap would make
// a hardcoded target wrong in the other direction).
//  - WIND_METER_OUTLIER_MS: a delta ABOVE this is background time (a backgrounded tab, a phone
//    auto-lock), never a rendering stutter (19-RESEARCH.md Pitfall 3) — discarded, not measured.
//  - WIND_METER_HIST_MAX: the histogram's top bucket index; that index is an INCLUSIVE overflow
//    bucket covering 100ms up to (but not including) WIND_METER_OUTLIER_MS.
//  - WIND_METER_BASELINE_SAMPLES: how many accepted deltas establish the one-time baseline.
//  - WIND_METER_DIP_FACTOR: how far above baseline a frame must be to count as a dip.
//  - WIND_METER_LOWPOWER_MS: the low end of the "looks like Low Power Mode" baseline band —
//    19-RESEARCH.md Pitfall 2's ~33ms signature, paired with a fixed 40ms upper bound in
//    windMeterSummary().
const WIND_METER_OUTLIER_MS=500, WIND_METER_HIST_MAX=100, WIND_METER_BASELINE_SAMPLES=120, WIND_METER_DIP_FACTOR=1.5, WIND_METER_LOWPOWER_MS=30;

// windHist is preallocated ONCE — sampling allocates nothing per frame (19-RESEARCH.md Pitfall 4:
// the instrument must not become the stutter it is measuring). windHist[i] counts accepted deltas
// rounded half-up (Math.round) to i whole milliseconds; index WIND_METER_HIST_MAX is the inclusive
// overflow bucket described above. windSamples/windBaselineMs/windWorstMs/windWorstAtMs/windDips/
// windDiscarded/windMeterStartMs are windMeterSample's plain-number state — see windMeterSample and
// windMeterSummary below for what each one means.
const windHist=new Int32Array(WIND_METER_HIST_MAX+1);
let windSamples=0, windBaselineMs=null, windWorstMs=0, windWorstAtMs=0, windDips=0, windDiscarded=0, windMeterStartMs=0;

// windDotSpecs(seed,count) — the PURE seeded-spec half, direct sibling of stormLayerSpecs() above.
// mulberry32(seed), NEVER appState.game.r() — see src/ui/board.js:299-302 for why the private
// stream is non-negotiable (D-12): drawing from the game's own seeded stream would advance it and
// desync every client in a multiplayer room AND all 31 determinism fixtures. A private RNG instance
// is created fresh on every call, salted so the dot stream never correlates with the rain's. Count
// is clamped to [0,WIND_DOT_MAX] first. Exactly four values are drawn per dot in a fixed order —
// startT, wobbleAmp, speed, lane — matching 19-RESEARCH.md's sketch, so re-reading this function
// later reproduces the same field order.
export function windDotSpecs(seed,count){
  const n=Math.max(0,Math.min(WIND_DOT_MAX,Math.floor(Number(count))||0));
  const rnd=mulberry32(((seed==null?DEMO_RAIN_SEED:seed)^WIND_DOT_SEED_SALT)>>>0);
  const specs=[];
  for(let i=0;i<n;i++){
    // lane is STRATIFIED, not raw-uniform: dot i lives in the i-th slice of the crosswind span,
    // jittered within it. Raw draws are fixed for a whole voyage, so one unlucky game could leave
    // a 15% stretch of the board's edge with no dot in it ever (measured: one seed's 20 uniform
    // lanes topped out at 0.83). A slice apiece guarantees the whole starting edge is served,
    // every game — and the draw count per dot is unchanged, so the spec order note above holds.
    specs.push({startT:rnd(),wobbleAmp:rnd(),speed:rnd(),lane:(i+rnd())/Math.max(1,n)});
  }
  return specs;
}

// windDotFrame(spec,tMs,layerW,layerH) — the PURE per-dot motion half. Free of DOM and of
// `now`-relative state (every input arrives as a parameter) so it can be exercised headlessly.
// Returns {x,y,opacity} in the LAYER's own local, unrotated space — the outer rotate() applied by
// windEnsureLayer/windDotsTick supplies the live wind direction; it is never baked in here, which
// is exactly why a direction change re-aims every dot with no restart. `y` travels along local +Y
// only, wrapped into [-margin,layerH+margin] with margin=16, at (0.35+spec.speed*0.5)
// layer-heights per second, phase-offset by spec.startT — unchanged by D-02's fade/wobble below,
// since neither touches `y`.
//
// D-02.1 (fade): `u` is the SAME travel term as `y`, renormalized to a cycle position in [0,1).
// `opacity` rises from 0 to the PLATEAU (0.72, the tracer's original constant) across the first
// WIND_FADE_FRAC of the cycle, holds at the plateau across the middle, and falls back to 0 across
// the last WIND_FADE_FRAC — eased with sin() (a quarter-cosine ease) rather than a linear ramp, so
// the appear/disappear reads as a smooth breath. A dot therefore appears and disappears mid-board
// and never has to traverse the whole layer at full opacity, which is what keeps the on-screen
// count roughly constant per D-02.3's density target.
//
// D-02.2 (wobble): a lateral term added to `x` ONLY — `y` (and therefore the direction of travel)
// is untouched. Because `x` is the layer's own LOCAL horizontal axis and the whole `.wlayer`
// carries the live compass rotation (windEnsureLayer/windDotsTick), this local-only sway becomes,
// in screen space, automatically ACROSS whatever direction the wind is currently blowing — a
// north-bound dot sways west and east — with no per-dot trigonometry against the wind angle.
// Phase-seeded by spec.startT so dots don't sway in lockstep; amplitude scaled by spec.wobbleAmp
// (drawn in [0,1) by windDotSpecs) so no dot's deviation from its lane can exceed WIND_WOBBLE_MAX_PX.
export function windDotFrame(spec,tMs,layerW,layerH){
  const margin=16;
  // WIND_SPEED_SCALE (Wyatt, 2026-08-05): "MUCH slower — 20% their current speed". The prototype
  // was tuned as a visible-motion demo; as ambient scene-setting under a board people are reading,
  // that pace is busy. Applied as a scale on the rate rather than by editing the two literals, so
  // the prototype's own 0.35..0.85 spread — the per-dot variation that stops them moving in
  // lockstep — is preserved exactly, just slowed.
  const rate=(0.35+spec.speed*0.5)*WIND_SPEED_SCALE; // layer-heights per second
  const span=layerH+margin*2;
  let raw=(spec.startT*span+(tMs/1000)*rate*layerH)%span;
  if(raw<0)raw+=span;
  const y=raw-margin;
  const u=raw/span; // cycle position in [0,1) — drives the fade envelope only

  const PLATEAU=0.72;
  let opacity;
  if(u<WIND_FADE_FRAC){
    opacity=PLATEAU*Math.sin((u/WIND_FADE_FRAC)*(Math.PI/2));
  }else if(u<1-WIND_FADE_FRAC){
    opacity=PLATEAU;
  }else{
    const v=(1-u)/WIND_FADE_FRAC;
    opacity=PLATEAU*Math.sin(v*(Math.PI/2));
  }
  opacity=Math.max(0,Math.min(1,opacity));

  const wobble=Math.sin(tMs/WIND_WOBBLE_PERIOD_MS*Math.PI*2+spec.startT*Math.PI*2)*spec.wobbleAmp*WIND_WOBBLE_MAX_PX;
  /* LANES SPAN THE BOARD, NOT THE OVERSIZED LAYER (Wyatt, 2026-08-10: "make sure they spawn
     across the whole starting edge of the board"). The layer is WIND_LAYER_OVERSIZE (2.2x) wide
     so a live rotation never exposes a corner — but lanes drawn across its FULL width meant only
     ~1/2.2 of the dots ever crossed the board's clip, and whichever random lanes survived
     bunched wherever they fell. Measured before this change (headless, 10 dots): five lanes over
     the board, all between 0.00 and 0.50 of its width, none between 0.60 and 1.00 — exactly the
     "they all spawn near one spot" a playtest sees. Lanes now map into the central board-width
     band, so every dot crosses the board and lane=0..1 is edge-to-edge of the board itself. The
     oversize keeps its one job; the dots just stop hiding in it. */
  const band=1/WIND_LAYER_OVERSIZE;
  const x=layerW*((1-band)/2+spec.lane*band)+wobble;

  return {x,y,opacity};
}

// buildWindDots(container,seed,count) — NOT idempotent, unlike buildStormLayers()'s
// childElementCount guard above: D-04 requires the dial's count to change live, mid-voyage, without
// a reload, so this grows or shrinks the pool to exactly `count` on every call — creating missing
// `div.wdot` elements and REMOVING surplus ones from the DOM entirely (never just hiding them).
// Regenerates the module-scope `windSpecs` cache from windDotSpecs(seed,count) in the SAME call so
// specs and elements can never disagree in length. Every dot is styled inline via element.style
// only (D-14 — index.html is never touched): absolute position at left/top 0, a WIND_DOT_PX circle, a flat
// translucent white fill, and pointerEvents:"none". The dot is a drawn shape, not a baked image —
// no new asset is loaded.
export function buildWindDots(container,seed,count){
  const n=Math.max(0,Math.min(WIND_DOT_MAX,Math.floor(Number(count))||0));
  windSpecs=windDotSpecs(seed,n);
  if(!container)return;
  const created=[];
  while(windDotEls.length<n){
    const d=document.createElement("div");
    d.className="wdot";
    d.style.position="absolute";
    d.style.left="0";
    d.style.top="0";
    d.style.width=WIND_DOT_PX+"px";
    d.style.height=WIND_DOT_PX+"px";
    d.style.borderRadius="50%";
    d.style.background="rgba(255,255,255,.72)";
    d.style.pointerEvents="none";
    // Inherit the CURRENT will-change setting (19-RESEARCH.md Anti-Patterns / Open Question 1) —
    // a dot created after the toggle must not silently start off-hint just because it's new.
    d.style.willChange=windWillChangeOn?"transform":"";
    container.appendChild(d);
    windDotEls.push(d);
    created.push(d);
  }
  while(windDotEls.length>n){
    const d=windDotEls.pop();
    if(d.parentNode)d.parentNode.removeChild(d);
  }
  // Initial-frame paint (19-06 pre-flight finding, item 11): a freshly-created dot's transform/
  // opacity is otherwise ONLY ever written by windDotLoop's transform-writing branch — but that
  // branch is unconditionally SKIPPED whenever windReducedMotion is true (D-13), and also skipped
  // whenever windDotsOn is false (the switch). Either way, a dot created in that state would sit at
  // its untouched CSS default (left/top:0, no transform, opacity unset -> 1) forever — that default
  // position is the LAYER's own local origin, which sits well outside #windDots' clipped, oversized
  // (220%, -60%/-60%) viewport, so reduced-motion players (and anyone toggling the switch off right
  // as the dial grows) saw NO dots at all rather than D-13's promised "hold still, on screen."
  // Painted via ONE requestAnimationFrame rather than a synchronous clientWidth read right after
  // appendChild — a synchronous read here can still observe a 0-sized ancestor mid-layout-flush,
  // which collapses windDotFrame's math toward the layer's local origin; one frame later, layout is
  // guaranteed settled. Deliberately unconditional on windReducedMotion/windDotsOn, because giving a
  // fresh dot its first real position is exactly the case those two branches would otherwise skip.
  // windDotFrame(spec,0,w,h) is pure and deterministic (D-12); windDotLoop's own per-frame write (if
  // running) simply overwrites this moments later, so the extra paint costs nothing in the common case.
  if(created.length){
    requestAnimationFrame(function(){
      const w=container.clientWidth||container.offsetWidth||1;
      const h=container.clientHeight||container.offsetHeight||1;
      for(const d of created){
        const idx=windDotEls.indexOf(d);
        const spec=idx>=0?windSpecs[idx]:null;
        if(!spec)continue; // dial dropped again before this frame ran; nothing to paint
        const f=windDotFrame(spec,0,w,h);
        d.style.transform=`translate3d(${f.x}px,${f.y}px,0)`;
        d.style.opacity=f.opacity;
      }
    });
  }
}

// Module state (mirrors the file header's precedent for module-private render-owned `let`s):
// windDotEls/windSpecs are the DOM/spec pools built by buildWindDots, kept in lockstep; windDotsOn
// is the switch's live value; windDotCount is the dial's live value; windAngle is the live wind
// compass angle, updated the same place --slant is; windRafId is the shared rAF handle (0 = not
// running); windLayer is the lazily-created `.wlayer` element; windHudBuilt guards the HUD's
// one-time construction; windLastReadoutMs/windLastFrameMs drive the readout throttle and the frame
// delta sample; windWillChangeOn is #windWillChange's live value (default OFF, 19-RESEARCH.md
// Anti-Patterns / Open Question 1 — the headroom run isolates this variable rather than guessing).
let windDotEls=[],windSpecs=[],windDotsOn=true,windDotCount=WIND_DOT_DEFAULT,windAngle=0,windRafId=0,windLayer=null,windHudBuilt=false,windLastReadoutMs=0,windLastFrameMs=null,windWillChangeOn=false;

// windStormFaded is the LAST storm state windStormSync acted on, so a fade fires once on the edge
// rather than on every render() (render runs many times per storm — restarting the transition each
// time would freeze the dots at whatever opacity they had reached). windStormTimer is the pending
// stop-the-loop timeout, always cleared before a new one is set so a storm that ends mid-fade-out
// cannot stop a loop the fade-in has just restarted. windBuilt replaces the old `if(!windRafId)`
// build guard in windDotsTick: that test conflated "the pool exists" with "the loop is running",
// and once a storm legitimately stops the loop it would have rebuilt the pool and restarted the
// loop on the very next render — undoing the stop every single frame of the storm.
let windStormFaded=false,windStormTimer=0,windBuilt=false;

// windReducedMotion (D-13) — read ONCE at module init via the JS `matchMedia` pattern
// (src/ui/panel.js:300), not the pure-CSS `animation-play-state` pattern the storm rain uses,
// because the dots' motion is written by windDotLoop's own transform/opacity assignments — a CSS
// rule has nothing to pause. Guarded exactly like panel.js's read so a context without
// `matchMedia` (or without `window` at all) falls back to `false` instead of throwing. A `change`
// listener keeps this live so a mid-session OS preference flip is picked up with no reload.
let windReducedMotion=false;
try{
  if(typeof window!=="undefined"&&window.matchMedia){
    const windMotionQuery=window.matchMedia("(prefers-reduced-motion: reduce)");
    windReducedMotion=windMotionQuery.matches;
    const windMotionChange=function(e){ windReducedMotion=e.matches; };
    if(windMotionQuery.addEventListener)windMotionQuery.addEventListener("change",windMotionChange);
    else if(windMotionQuery.addListener)windMotionQuery.addListener(windMotionChange); // older WebKit
  }
}catch(err){}

// windEnsureLayer() — lazily creates the layer structure inside #boardwrap: direction lives OUTSIDE
// the animated portion, mirroring `.rlayer`'s exact structure (19-PATTERNS.md Pattern 1). #windDots
// sits one z-index above #stormOverlay (6 vs 5), pointer-events:none, aria-hidden. Inside it, ONE
// `.wlayer` sized WIND_LAYER_OVERSIZE (220%) at left/top -60%, carrying ONLY a live rotate() —
// dots live inside it and move only in its local space, so a wind-direction change re-aims every
// dot by rewriting one transform on one element, with no per-dot trigonometry and no restart.
function windEnsureLayer(){
  if(windLayer)return windLayer;
  const bw=$("boardwrap");
  if(!bw)return null;
  let dots=$("windDots");
  if(!dots){
    dots=document.createElement("div");
    dots.id="windDots";
    dots.setAttribute("aria-hidden","true");
    dots.style.position="absolute";
    dots.style.inset="0";
    dots.style.pointerEvents="none";
    dots.style.borderRadius="10px";
    dots.style.overflow="hidden";
    dots.style.zIndex="6";
    // The storm fade lives on the CONTAINER, not on the dots: one compositor-only opacity
    // transition on one element, rather than 10 per-dot transitions fighting windDotLoop's own
    // per-frame opacity writes (the loop would win, and the fade would never happen). Duration and
    // delay are rewritten per direction by windStormSync — only the property and easing are fixed
    // here. `opacity` is the sole transitioned property, so this stays inside BUG-01's
    // compositor-only contract.
    dots.style.opacity="1";
    dots.style.transitionProperty="opacity";
    dots.style.transitionTimingFunction="ease";
    dots.style.transitionDuration=WIND_STORM_FADE_OUT_MS+"ms";
    bw.appendChild(dots);
  }
  let layer=dots.querySelector(".wlayer");
  if(!layer){
    layer=document.createElement("div");
    layer.className="wlayer";
    layer.style.position="absolute";
    layer.style.left="-60%";
    layer.style.top="-60%";
    layer.style.width=(WIND_LAYER_OVERSIZE*100)+"%";
    layer.style.height=(WIND_LAYER_OVERSIZE*100)+"%";
    dots.appendChild(layer);
  }
  windLayer=layer;
  return windLayer;
}

// windHistMedian() — the histogram's TRUE median (not a rolling average): the smallest bucket whose
// cumulative count reaches Math.ceil(windSamples/2). This is the exact tie-breaking contract for an
// even sample count — it resolves to the LOWER of the two middle values, the conservative direction
// for a smoothness figure (a figure that undersells "typical" is safer than one that oversells it).
// Returns null when no samples have been accepted yet. Not exported — an internal half shared by
// windMeterSample (baseline) and windMeterSummary (the live "typical" figure).
function windHistMedian(){
  if(windSamples===0)return null;
  const need=Math.ceil(windSamples/2);
  let cum=0;
  for(let i=0;i<windHist.length;i++){
    cum+=windHist[i];
    if(cum>=need)return i;
  }
  return WIND_METER_HIST_MAX;
}

// windMeterSample(deltaMs,nowMs) — the calibrated half of the smoothness instrument (19-05, D-05).
// Called once per frame from windDotLoop below, in this exact order:
//  1. A delta ABOVE WIND_METER_OUTLIER_MS is background time, not jank (19-RESEARCH.md Pitfall 3) —
//     count it as a discarded pause and touch nothing else. This is what stops a phone auto-lock
//     from swamping the worst-moment slot with a multi-second "stutter" that never happened.
//  2. Bucket it into the preallocated histogram. Math.round is half-up for positive values, and that
//     is the stated rounding contract for every figure this meter reports (D-05). The final bucket
//     is an inclusive overflow bucket for 100ms up to (but not including) WIND_METER_OUTLIER_MS.
//  3. The first WIND_METER_BASELINE_SAMPLES accepted deltas establish the baseline as the
//     histogram's median. Never recomputed afterwards — a baseline that drifts with the load being
//     measured could not classify that load (19-RESEARCH.md Pitfall 2 — a Low Power Mode iPhone's
//     ~33ms baseline must be read as "this device", not chased downward as more slow frames arrive).
//  4. Once a baseline exists, a delta more than WIND_METER_DIP_FACTOR times the baseline counts as
//     a dip.
//  5. The worst accepted delta (and elapsed time since windMeterStartMs when it happened) is tracked.
// Allocates nothing — windHist is preallocated, no object/array is created here (19-RESEARCH.md
// Pitfall 4: the instrument must not become the stutter it measures).
export function windMeterSample(deltaMs,nowMs){
  if(deltaMs>WIND_METER_OUTLIER_MS){
    windDiscarded++;
    return;
  }
  windHist[Math.min(WIND_METER_HIST_MAX,Math.round(deltaMs))]++;
  windSamples++;
  if(windBaselineMs===null&&windSamples>=WIND_METER_BASELINE_SAMPLES){
    windBaselineMs=windHistMedian();
  }
  if(windBaselineMs!==null&&deltaMs>windBaselineMs*WIND_METER_DIP_FACTOR){
    windDips++;
  }
  if(deltaMs>windWorstMs){
    windWorstMs=deltaMs;
    windWorstAtMs=nowMs-windMeterStartMs;
  }
}

// windMeterReset() — clears ONLY the frame reference (windLastFrameMs), never the histogram, the
// worst-moment slot, the discarded count or the baseline. Wired to `visibilitychange`: on becoming
// visible again after a hidden interval, the very next rAF tick must not be allowed to sample the
// hidden gap as a single catastrophic delta (19-RESEARCH.md Pitfall 3) — the gap is counted as a
// discarded pause here instead, so it is visible in the summary rather than silently vanishing OR
// corrupting the worst-moment slot.
export function windMeterReset(){
  windLastFrameMs=null;
}
try{
  if(typeof document!=="undefined"&&document.addEventListener){
    document.addEventListener("visibilitychange",function(){
      if(document.visibilityState==="visible"){
        windMeterReset();
        windDiscarded++;
      }
    });
  }
}catch(err){}

// windMeterSummary() — a plain object summarizing what the meter measured (D-05). Every
// frames-per-second figure is Math.round(1000/ms) — D-05's stated half-up rounding contract, applied
// identically to typicalFps and worstFps. lowPowerSuspected mirrors 19-RESEARCH.md Pitfall 2's Low
// Power Mode signature: a baseline at or above WIND_METER_LOWPOWER_MS (30ms) but still below 40ms.
// Exported here (Task 1) rather than deferred to Task 2, because Task 1's own acceptance criteria
// (19-05-PLAN.md) exercises windMeterSummary() directly to prove the baseline/outlier/median
// behavior headlessly — Task 2 (renderWindSummary) only formats this object's fields into sentences,
// it does not need to touch this function's own definition.
export function windMeterSummary(){
  const typicalMs=windHistMedian();
  const toFps=(ms)=>(ms==null||ms<=0)?null:Math.round(1000/ms);
  return {
    baselineMs:windBaselineMs,
    typicalMs,
    typicalFps:toFps(typicalMs),
    worstMs:windWorstMs,
    worstFps:toFps(windWorstMs),
    worstAtMs:windWorstAtMs,
    samples:windSamples,
    dips:windDips,
    discarded:windDiscarded,
    lowPowerSuspected:windBaselineMs!==null&&windBaselineMs>=WIND_METER_LOWPOWER_MS&&windBaselineMs<40,
  };
}

// windFormatElapsed(ms) — D-05's "roughly when it happened": elapsed time floored to whole seconds
// (Math.floor, never rounding upward past a boundary — 4m 12.9s in must read "4m 12s", not "4m 13s")
// and always rendered as BOTH whole minutes and whole seconds (e.g. "0m 12s", "4m 12s"), never
// minutes alone or seconds alone, so the figure's shape never depends on how long the voyage ran.
function windFormatElapsed(ms){
  const totalSec=Math.floor(Math.max(0,ms)/1000);
  const m=Math.floor(totalSec/60);
  const s=totalSec%60;
  return `${m}m ${s}s`;
}

// renderWindSummary() — the plain-English end-of-voyage read Wyatt uses to judge the verdict
// (D-05, D-09). Returns immediately when the prototype is off, so a normal build's End of Voyage
// screen is byte-identical to before this plan. Builds/reuses one #windSummary block appended to
// #statsPanel and writes plain sentences, not a table of jargon — this is the text Wyatt reads to
// decide whether Phase 20 goes ahead, not a metrics dump.
export function renderWindSummary(){
  // v2.1 (Wyatt, 2026-08-06): "remove this wind for smoothness report". It is developer instrumentation
  // that shipped onto a PLAYER'S End of Voyage screen — a dashed box of frame rates between the
  // keepsakes and the captains' luck. The wind dots are long since approved and live; the verdict this
  // was built to inform has been made.
  //
  // The METER itself stays. windMeterSample still runs inside the existing rAF loop (one call, no
  // extra loop) and windMeterSummary() still feeds the live readout in the tuning HUD behind
  // ?windhud=1 — so this is not dead code, it is instrumentation that no longer shows itself to
  // someone who did not ask for it. Gate flipped here, at the one render, rather than by deleting the
  // instrument, so `?windhud=1` keeps working exactly as before.
  if(!windHudEnabled())return;
  if(!windPrototypeEnabled())return;
  const panel=$("statsPanel");
  if(!panel)return;
  let box=$("windSummary");
  if(!box){
    box=document.createElement("div");
    box.id="windSummary";
    box.style.marginTop="10px";
    box.style.padding="8px 10px";
    box.style.border="1.5px dashed #29a3b2";
    box.style.borderRadius="8px";
    box.style.fontSize="12px";
    box.style.textAlign="left";
    panel.appendChild(box);
  }
  const s=windMeterSummary();
  const lines=[`<div><b>Wind-dot smoothness check (Phase 19 prototype)</b></div>`];
  if(s.samples===0){
    lines.push(`<div>No frames were measured this voyage.</div>`);
  }else{
    lines.push(`<div>Typical: about ${s.typicalFps} frames a second.</div>`);
    lines.push(`<div>Worst moment: about ${s.worstFps} frames a second, roughly ${windFormatElapsed(s.worstAtMs)} in.</div>`);
    lines.push(`<div>${s.dips} rough moment${s.dips===1?"":"s"} noticed, out of ${s.samples} frames measured.</div>`);
    lines.push(`<div>Dial ended at ${windDotCount} dot${windDotCount===1?"":"s"}, with the will-change hint ${windWillChangeOn?"ON":"OFF"}.</div>`);
    lines.push(`<div>${s.discarded} pause${s.discarded===1?"":"s"} ignored — the screen was off or the tab was hidden, not a stutter.</div>`);
    if(s.lowPowerSuspected){
      lines.push(`<div>This device looked like it was in a power-saving mode for this run — read the numbers above in that light.</div>`);
    }
  }
  box.innerHTML=lines.join("\n");
}

// windDotLoop(now) — the ONE shared requestAnimationFrame loop for every dot, never one per dot.
// Samples the frame delta first (now-windLastFrameMs, when a previous frame exists), hands it to
// windMeterSample (the calibrated instrument above) so measuring costs one call and no extra loop,
// and updates the live readout text at most every WIND_READOUT_MS (19-RESEARCH.md Pitfall 4: the
// instrument must not become the stutter). Then, if the switch is on and the count is nonzero,
// writes each dot's transform as a single translate3d(...) string plus its opacity, and re-arms
// itself. windMeterStartMs is (re)established on the FIRST frame seen after a gap (windLastFrameMs
// was null), so "roughly when it happened" is always relative to the current measuring window, not
// to some earlier session.
//
// HIDDEN-TAB SAMPLING GUARD (19-06 pre-flight finding, item 8): the visibilitychange listener above
// discards only the ONE frame immediately after becoming visible again — that alone assumed rAF
// fully PAUSES while hidden. Driven-Chrome testing showed that's false for an ordinary backgrounded
// tab (as opposed to a fully-suspended one): Chrome keeps firing rAF at a throttled cadence for a
// hidden document, each individual delta comfortably UNDER WIND_METER_OUTLIER_MS, so those frames
// were sailing straight past the outlier filter and corrupting the worst-moment slot with throttle
// artifacts, not real jank — exactly the lie 19-RESEARCH.md Pitfall 3 and this plan's own truth
// ("a tab hidden and restored mid-run produces a discarded pause, not a worst moment") forbid.
// windDotLoop now skips windMeterSample entirely whenever `document.visibilityState` is not
// "visible" (the delta is still consumed into windLastFrameMs so the FIRST frame after returning is
// a normal, small, real delta rather than a leftover gap) — the guard fails safe to "sample" (true)
// if `document` is unavailable, matching every other DOM-optional guard in this region.
//
// AT A CLAMPED COUNT OF 0 (or with the switch off), windDotEls is empty (or the transform-writing
// branch is skipped) — no dot transform is written on that frame, and buildWindDots has already
// removed every `.wdot` node from the DOM, so there is zero residue. The loop itself DOES NOT
// STOP in that case — it keeps re-arming via requestAnimationFrame every frame regardless of the
// dot count, on purpose: the readout must still be able to sample the board's own behaviour with
// the dots off, which is what makes the off-state baseline measurable in 19-05. Do not "fix" this
// by cancelling the loop when the count reaches 0 — that would make the off-state unmeasurable.
//
// REDUCED MOTION (D-13): when windReducedMotion is true, this ALSO skips the transform-writing
// branch — dots stay exactly where they last were, on screen and still, mirroring how the storm
// rain freezes (`animation-play-state:paused`) rather than vanishing. The loop still keeps running
// (same reasoning as the count-0 case above) so the readout still reports, which is what lets a
// pre-flight check confirm the branch actually took effect.
function windDocVisible(){
  try{
    if(typeof document==="undefined")return true; // headless/non-browser context: sample, as before
    return document.visibilityState==="visible";
  }catch(err){ return true; }
}
export function windDotLoop(now){
  const delta=windLastFrameMs==null?null:now-windLastFrameMs;
  if(windLastFrameMs==null)windMeterStartMs=now;
  windLastFrameMs=now;
  const layer=windLayer;
  if(!windReducedMotion&&windDotsOn&&windDotCount>0&&layer){
    const w=layer.clientWidth||layer.offsetWidth||1;
    const h=layer.clientHeight||layer.offsetHeight||1;
    for(let i=0;i<windDotEls.length;i++){
      const spec=windSpecs[i];
      if(!spec)continue;
      const f=windDotFrame(spec,now,w,h);
      windDotEls[i].style.transform=`translate3d(${f.x}px,${f.y}px,0)`;
      windDotEls[i].style.opacity=f.opacity;
    }
  }
  if(delta!=null&&delta>0&&windDocVisible()){
    windMeterSample(delta,now);
    if(now-windLastReadoutMs>=WIND_READOUT_MS){
      windLastReadoutMs=now;
      const r=$("windReadout");
      if(r){
        const fps=Math.round(1000/delta);
        const word=windBaselineMs===null?"warming up":(delta<=windBaselineMs*WIND_METER_DIP_FACTOR?"smooth":"rough");
        r.textContent=fps+" fps — "+word;
      }
    }
  }
  windRafId=requestAnimationFrame(windDotLoop);
}
export function startWindDots(){
  if(windRafId)return;
  windRafId=requestAnimationFrame(windDotLoop);
}
export function stopWindDots(){
  if(windRafId)cancelAnimationFrame(windRafId);
  windRafId=0;
  windLastFrameMs=null; // next start must not sample a stale gap
}

// buildWindHud() — the touch HUD (D-04, D-05). Builds #windHud once and appends it to #game, a
// fixed panel pinned bottom-right so it stays reachable by thumb mid-voyage on the phone without
// scrolling. Styled inline with this project's existing .panel conventions (white background, the
// teal border, 10px radius) rather than a new design language (D-14 — index.html is never touched).
// #windSwitch is the SAME node as its visible label, deliberately — see docs/DRIVING-THE-GAME.md
// §4a's #flipCoinWrap trap, which this must not repeat.
export function buildWindHud(){
  if(windHudBuilt)return;
  const game=$("game");
  if(!game)return;
  const hud=document.createElement("div");
  hud.id="windHud";
  hud.style.position="fixed";
  hud.style.right="8px";
  hud.style.bottom="8px";
  hud.style.zIndex="60";
  hud.style.background="#fff";
  hud.style.border="1.5px solid #29a3b2";
  hud.style.borderRadius="10px";
  hud.style.padding="10px 12px";
  hud.style.boxShadow="0 1px 3px rgba(41,163,178,.08)";
  hud.style.fontSize="12px";
  hud.style.minWidth="170px";

  const sw=document.createElement("button");
  sw.id="windSwitch";
  sw.textContent="WIND: ON";
  sw.style.display="block";
  sw.style.width="100%";
  sw.style.minHeight="44px";
  sw.style.marginBottom="6px";
  sw.onclick=function(){
    windDotsOn=!windDotsOn;
    sw.textContent=windDotsOn?"WIND: ON":"WIND: OFF";
  };
  hud.appendChild(sw);

  const dialRow=document.createElement("div");
  dialRow.style.display="flex";
  dialRow.style.alignItems="center";
  dialRow.style.gap="6px";
  const dial=document.createElement("input");
  dial.id="windDial";
  dial.type="range";
  dial.min="0";
  dial.max=String(WIND_DOT_MAX);
  dial.step="1";
  dial.value=String(windDotCount);
  dial.style.flex="1";
  dial.style.height="44px";
  dial.style.touchAction="manipulation";
  dial.oninput=function(){ windSetDotCount(dial.value); };
  dialRow.appendChild(dial);
  const num=document.createElement("span");
  num.id="windDialNum";
  num.textContent=String(windDotCount);
  dialRow.appendChild(num);
  hud.appendChild(dialRow);

  // Finger-friendly stepping (D-04): a slider alone is hard to land on an exact value with a
  // thumb. #windDialMinus/#windDialPlus step the count by WIND_DIAL_STEP; #windDial10 jumps
  // straight to WIND_DOT_DEFAULT (10), making run 2's "lock it to exactly 10" one tap. All three
  // route through windSetDotCount so they inherit its clamp — the visible control and the tap
  // target are the same real `button` node, per docs/DRIVING-THE-GAME.md's #flipCoinWrap warning.
  const WIND_DIAL_STEP=5;
  const stepRow=document.createElement("div");
  stepRow.style.display="flex";
  stepRow.style.gap="6px";
  stepRow.style.marginTop="6px";
  function windStepButton(id,label,onClick){
    const b=document.createElement("button");
    b.id=id;
    b.textContent=label;
    b.style.flex="1";
    b.style.minHeight="44px";
    b.style.minWidth="44px";
    b.style.touchAction="manipulation";
    b.onclick=onClick;
    return b;
  }
  const minusBtn=windStepButton("windDialMinus","-5",function(){ windSetDotCount(windDotCount-WIND_DIAL_STEP); });
  const plusBtn=windStepButton("windDialPlus","+5",function(){ windSetDotCount(windDotCount+WIND_DIAL_STEP); });
  const tenBtn=windStepButton("windDial10","="+WIND_DOT_DEFAULT,function(){ windSetDotCount(WIND_DOT_DEFAULT); });
  stepRow.appendChild(minusBtn);
  stepRow.appendChild(plusBtn);
  stepRow.appendChild(tenBtn);
  hud.appendChild(stepRow);

  const readout=document.createElement("div");
  readout.id="windReadout";
  readout.style.marginTop="6px";
  readout.textContent="—";
  hud.appendChild(readout);

  // #windWillChange (19-RESEARCH.md Anti-Patterns / Open Question 1): a blanket static
  // `will-change:transform` promotion of up to 100 elements is a documented double-edged tool at
  // exactly this scale — it can increase memory pressure and DEGRADE performance rather than help
  // it, rather than being an unambiguous win. Defaults OFF so the headroom run measures its own
  // baseline first; toggling it on/off lets Wyatt isolate this one variable on screen instead of
  // guessing whether it helped or hurt after the fact.
  const wc=document.createElement("button");
  wc.id="windWillChange";
  wc.textContent=windWillChangeOn?"HINT: ON":"HINT: OFF";
  wc.style.display="block";
  wc.style.width="100%";
  wc.style.minHeight="44px";
  wc.style.marginTop="6px";
  wc.style.touchAction="manipulation";
  wc.onclick=function(){
    windWillChangeOn=!windWillChangeOn;
    wc.textContent=windWillChangeOn?"HINT: ON":"HINT: OFF";
    for(let i=0;i<windDotEls.length;i++){
      windDotEls[i].style.willChange=windWillChangeOn?"transform":"";
    }
  };
  hud.appendChild(wc);

  game.appendChild(hud);
  windHudBuilt=true;
}

// windSetDotCount(n) — the dial's `input` handler. Clamps to [0,WIND_DOT_MAX]; non-finite input
// (an empty/invalid field) is ignored, retaining the previous value. Rebuilds the pool via
// buildWindDots so specs/elements stay in lockstep, then syncs #windDialNum and #windDial.value
// (so a programmatic set — e.g. the headroom run stepping) keeps the visible dial in agreement).
export function windSetDotCount(n){
  const num=Number(n);
  const clamped=Number.isFinite(num)?Math.max(0,Math.min(WIND_DOT_MAX,Math.floor(num))):windDotCount;
  windDotCount=clamped;
  buildWindDots(windLayer,appState.game&&appState.game.seed,windDotCount);
  const numEl=$("windDialNum");
  if(numEl)numEl.textContent=String(windDotCount);
  const dialEl=$("windDial");
  if(dialEl)dialEl.value=String(windDotCount);
}

// windStormSync(storming) — the wind field's half of "the two animation effects should not happen
// simultaneously" (Wyatt, 2026-08-05). EDGE-TRIGGERED: returns immediately unless the storm state
// actually changed, because render() runs many times during one storm and re-writing the opacity
// every time would restart the CSS transition from wherever it had got to, pinning the dots at a
// half-faded value forever.
//
// Fading OUT: rewrite the duration to WIND_STORM_FADE_OUT_MS with no delay, drop the container to
// opacity 0, and schedule stopWindDots() for just after the fade lands. The loop keeps running
// THROUGH the fade — a stopped loop freezes the dots, and dots that stop drifting the instant the
// storm is announced read as a bug rather than as weather.
//
// Fading IN: start the loop FIRST (so the dots are already moving by the time they are visible —
// starting it after would show a frozen field for one frame), then fade in behind
// WIND_STORM_FADE_IN_DELAY_MS so the rain's own .8s fade-out has finished before the dots return.
function windStormSync(storming){
  if(storming===windStormFaded)return;
  windStormFaded=storming;
  const host=$("windDots");
  if(windStormTimer){clearTimeout(windStormTimer);windStormTimer=0;}
  if(storming){
    if(host){
      host.style.transitionDuration=WIND_STORM_FADE_OUT_MS+"ms";
      host.style.transitionDelay="0ms";
      host.style.opacity="0";
    }
    // +80ms of slack so the stop lands after the last painted frame of the fade, never on top of it
    windStormTimer=setTimeout(function(){ windStormTimer=0; stopWindDots(); },WIND_STORM_FADE_OUT_MS+80);
  }else{
    startWindDots();
    if(host){
      host.style.transitionDuration=WIND_STORM_FADE_IN_MS+"ms";
      host.style.transitionDelay=WIND_STORM_FADE_IN_DELAY_MS+"ms";
      host.style.opacity="1";
    }
  }
}

// windDotsTick(angle,storming) — the ONE call render() makes into this region (see the wind block
// below). Returns immediately when the prototype is disabled, touching no DOM at all in a normal
// build. Otherwise: stores the live angle, ensures the layer + HUD exist, writes the SAME
// `angle+180` convention --slant uses as a live transform (zero restart), builds the dot pool and
// starts the loop on first run, and hands the live storm state to windStormSync above.
export function windDotsTick(angle,storming){
  if(!windPrototypeEnabled())return;
  windAngle=angle;
  const layer=windEnsureLayer();
  // v2: the DOTS are on by default (they are the clearest read of which way the wind blows), but
  // the tuning HUD is not — it is a fixed panel pinned bottom-right, which on a phone lands on top
  // of the Captains panel. Opt in with ?windhud=1 when the density dial is actually wanted.
  if(windHudEnabled())buildWindHud();
  if(layer)layer.style.transform=`rotate(${windAngle+180}deg)`;
  /* ⚠ LATCH ONLY ONCE THERE IS SOMETHING TO BUILD INTO — Wyatt, playtest 2026-09-10, item 12:
     "When i reloaded, there was no wind particle animation... but the ships were in the right
     place." Measured across a reload of the same voyage: 20 dots became 0, permanently.
     `windBuilt` was set BEFORE the build and without checking that the layer exists. On a resume
     the board is rebuilt from a replayed log, and a render can land before #boardwrap has been
     laid out — windEnsureLayer then returns null, this flag latches true, nothing is built, and
     because the flag is the only retry guard NOTHING EVER BUILDS THEM AGAIN for the life of the
     page. A guard that says "already done" after doing nothing is the whole bug.
     One added condition, and the retry happens naturally on the next render. */
  if(!windBuilt&&layer){
    windBuilt=true;
    buildWindDots(layer,appState.game&&appState.game.seed,windDotCount);
    startWindDots();
  }
  windStormSync(!!storming);
}

/* ===== WIND DOT PROTOTYPE (Phase 19 / WIND-00) END ===== */

// see the file header's chatBubbles deviation note: moved (exported) alongside render(), the
// only cluster function that reads it.
export const chatBubbles={};

// 11-06: positionChatBubble/removeChatBubble/clearChatBubbles moved verbatim here (NOT into
// src/orchestrator.js — see that file's own header for why: zero net calls, and render() right
// below is already this cluster's own same-module caller of positionChatBubble). showChatBubble
// (src/ui/panel.js, 11-04) imports removeChatBubble/positionChatBubble from here instead of
// reading them bare.
function positionChatBubble(i,x,y){
  const b=chatBubbles[i];if(!b)return;
  // x,y come from shipXY(), in the SVG's fixed 0..640 viewBox space — clamp X only (like the
  // lab.html bubble prototype this is adapted from) so a boat hugging the left/right edge
  // doesn't push its bubble half off the board; Y is left alone, same as popEmoji().
  b.style.left=Math.max(15,Math.min(85,x/640*100))+"%";
  b.style.top=(y/640*100)+"%";
}
// removes a bubble immediately regardless of whether it's mid-typewriter-reveal, holding fully
// visible, or already fading — a click must dismiss it instantly at any stage (so one player
// can't wall off the board by spamming chat and leaving bubbles up to expire on their own clock)
function removeChatBubble(i){
  const b=chatBubbles[i];if(!b)return;
  if(b._msgEl&&b._msgEl._revealTimer)clearTimeout(b._msgEl._revealTimer);
  if(b._timer)clearTimeout(b._timer);
  b.remove();
  delete chatBubbles[i];
}
export function clearChatBubbles(){Object.keys(chatBubbles).map(Number).forEach(removeChatBubble);}
export { positionChatBubble, removeChatBubble };

// D-22 fix (storm push not rendered): render() below draws every ship from the position SNAPSHOT
// that Game.ev() bakes into each event (events[evIdx].state), NOT from the live player objects. So
// a move that emits no event — which is exactly what an ordinary per-square storm step is, see
// windPush's `p.pos=nx` fall-through — repaints the identical square and the boat never appears to
// budge; it only jumps once the leg's own outcome event finally lands. This paints the ships from
// their LIVE positions instead, and is the per-square storm beat's redraw (windLeg/botWindLeg).
//
// Positions only, deliberately: coins, crates, the captain's log, the scrub bar and the host's
// event broadcast all belong to the event stream, and every storm outcome that changes any of them
// emits its own event and goes through the full liveRender()/render() path exactly as before. The
// live-players-as-a-seat-array idiom is the same one drawBoard() already uses at :244.
/* Is the board currently holding the boot placeholder rather than a real voyage? Read off the
   game object itself (seedIdleGameState), so it cannot disagree with reality. */
function idlePlaceholder(){ return !!(appState.game && appState.game.__idle); }
/* Ships stay HIDDEN, not parked, while the placeholder is up. Hiding is the honest picture: we do
   not yet know where anybody is. Parking them paints a confident lie — four captains at Tortuga —
   which is exactly what he saw. Cleared the moment a real game replaces the placeholder. */
function hideShipsWhileIdle(){
  for(const el of shipEls) if(el) el.style.visibility="hidden";
}
function unhideShips(){
  for(const el of shipEls) if(el&&el.style.visibility==="hidden") el.style.visibility="";
}
export function renderLiveShips(){
  if(appState.replaying)return;      // reload-replay rebuilds state silently — same guard liveRender() uses
  if(!shipEls.length)return;         // board not built yet
  if(idlePlaceholder()){hideShipsWhileIdle();return;}
  unhideShips();
  const live=appState.game.players;  // shipXY() only reads .pos off each entry
  live.forEach((player,i)=>{
    const [x,y]=shipXY(player.pos,i,live,cell);
    shipEls[i].style.transform=`translate(${x}px,${y}px)`;
    // A CAPTAIN AT THE OVENS FADES OUT (Wyatt, 2026-08-08: "in a past version, the boat faded
    // semitransparent when docked. I removed that feature in v2, but now i want it back because we
    // have the bake-off"). It is not decoration: Game.inPlay() has genuinely taken them off the
    // board — no storm moves them, nobody can reach, trade with or raid them, and their square is
    // free — so the boat being half-there is the honest picture of the rule. Anything still solid
    // on this board can be interacted with; anything faded cannot.
    // opacity only (PERF-01), and written unconditionally because it is one property on four nodes.
    shipEls[i].style.opacity=player.baking?0.42:1;
    if(chatBubbles[i])positionChatBubble(i,x,y); // keep an active chat bubble riding along with its boat
  });
  // the active-turn ripple has to travel with the ship it's ringing, or it's left behind mid-push.
  // G14: the whose-turn-is-it scan now lives in activeTurnSeat() below, shared with paintShipAt().
  // CORRECTED 2026-08-31: the two copies are NOT identical and have not been since ovens/bake was
  // added to render()'s alone. Both now call one walk (shared/storyboard.js); they differ only in
  // the event list each passes, which is stated at each call site instead of hidden in a loop body.
  // It was previously duplicated inline here because this file's header forbids touching render()'s
  // body ("moved BYTE-IDENTICAL... do not refactor... anything inside them" — the v1.0 BUG-01
  // Safari storm-crash fix). render() KEEPS its own copy and is still NOT touched; extracting the
  // duplicate out of THIS function removes the second copy rather than adding a third.
  if(activeRing){
    const a=activeTurnSeat();
    if(a!=null&&live[a]&&!live[a].done){
      const [ax,ay]=shipXY(live[a].pos,a,live,cell);
      ringTo(a,ax,ay);
    }
  }
}
/* THE RIPPLE FOLLOWS ITS OWN BOAT, AND ONLY JUMPS BETWEEN BOATS — one place decides, because this
   has now been got wrong twice from two different directions.

   2026-07-31: the ring carried no transition while the ship eased, so it ran ~2 squares AHEAD
   during a rim sweep. Fixed then by retuning the ring alongside the ship for the duration of the
   sweep — but only for the sweep, and only through setShipGlideMs.
   2026-08-14, Wyatt, from a screen recording: *"The ripples now move differently than the ship
   sailing."* The same defect, on ORDINARY moves, where nothing retunes anything: the ship glides
   SHIP_GLIDE_MS (700 — doubled from the 350 the original fix was judged against) while the ring
   snaps to the destination on the first frame and waits there.

   The rule the old comment was reaching for, stated properly: **the ring must wear whatever glide
   the ship it is marking is wearing.** It must still SNAP, but only when the wheel changes hands —
   a ring that glided from the last captain's boat to the next would slide right across the board.
   Those two cases are distinguishable, and the seat is what tells them apart, so this decides it
   once instead of every caller guessing.

   The layout read on the snap path is load-bearing for the same reason it is in snapShipTo: style
   writes are batched, so without forcing the commit the "snap" animates after all. */
let ringSeat=null;
function ringTo(seat,x,y){
  if(!activeRing)return;
  const jumped=(ringSeat!==seat);
  ringSeat=seat;
  const xf=`translate(${CQ(x)}cqw,${CQ(y)}cqw)`;
  if(jumped){
    activeRing.style.transition="none";
    activeRing.style.transform=xf;
    void activeRing.getBoundingClientRect();
    activeRing.style.transition="";
    return;
  }
  // same boat: match its glide exactly, so the two are one moving object
  const sh=shipEls[seat];
  const want=sh?sh.style.transition:"";
  if(activeRing.style.transition!==want)activeRing.style.transition=want;
  activeRing.style.transform=xf;
}
// G14: which seat currently owns the turn, by walking back from the current event to the nearest
// `turn` (stopping at a round boundary). Extracted from renderLiveShips so paintShipAt can ring the
// right ship too. render() has an identical inline copy which is deliberately LEFT ALONE — see the
// file header's BYTE-IDENTICAL rule.
/* ONE WALK (2026-08-31). This was the FOURTH private copy of the backward scan, found by the
   sweep. It now shares the walk in src/shared/storyboard.js, which has one rule and no options
   what it was — this scan has never known about ovens/bake, unlike render()'s — and the split is
   now VISIBLE at this one line instead of being a silent difference between two lookalike loops. */
function activeTurnSeat(){
  // TURN_ESTABLISHING, moved here with render()'s copy on 2026-08-31 — "rings follow active player
  // the whole game with no exception including during bakeoff". The gate keeps these two in step.
  return deriveActiveSeat(appState.game.events,appState.evIdx);
}
// G14 (Wyatt-approved 2026-07-30): move ONE ship element to an arbitrary cell, without touching game
// state or the event stream. The per-square painter behind the trade-wind rim sweep.
//
// WHY THIS EXISTS AT ALL — and it is the reason the stepper can be SHARED: renderLiveShips() above
// reads `appState.game.players[i].pos`, which on a GUEST NEVER UPDATES (a guest's authority is the
// broadcast event feed, not a local simulation), so it cannot be reused here. This function bases
// the shared-cell nudge on `events[evIdx].state` instead — the same snapshot render() draws from,
// and the reason a guest can render at all — with just this seat's pos overridden. Correct on both
// tiers by construction.
// ONE spelling of the ship glide, used by drawBoard() to create it and by setShipGlideMs() to
// retune and restore it. Only the duration and the easing ever vary.
// /4 playtest 12 (Wyatt: the sail "starts too rapidly") — a deeper S: the boat leans into the
// move instead of leaping, and settles the same way.
const SHIP_GLIDE_EASE="cubic-bezier(.6,0,.32,1)";
function shipGlideCss(ms,ease){ return `${ms}ms ${ease||SHIP_GLIDE_EASE}`; }
// Retune ONE ship's glide duration, or restore the default when `ms` is null.
//
// WHY THIS EXISTS (2026-07-31, from two trade-wind recordings): the default SHIP_GLIDE_MS (350ms)
// is tuned for a ship moving ONE square at a time and is far too long for a sweep that re-aims the
// ship many times a second. Left at 350ms the ship was still travelling toward one target when the
// next arrived, so it lagged, and — chasing a target around a curve — took the chord instead of the
// arc, cutting across the middle of the board.
//
// The sweep now drives the motion itself, tick by tick along a spline, so it wants a glide of about
// ONE TICK and a LINEAR easing: just enough for the browser to bridge between successive targets
// and absorb setTimeout's jitter, and not so much that the lag returns. See RIM_SWEEP_TICK_MS.
//
// Scoped to one seat because only the sweeping ship should be retuned — every other ship on the
// board is still moving under ordinary rules and must keep the ordinary glide.
// `ease` matters as much as `ms` here: the rim sweep drives its own motion tick by tick, so it wants
// a LINEAR glide of about one tick — just enough for the browser to bridge between our targets and
// absorb setTimeout's jitter. The default eased curve applied per-tick would ease in and out of
// every single tick, which is a shimmer, not a smooth line.
// THE RING MUST BE RETUNED WITH THE SHIP — 2026-07-31, third recording (`notes/tradewinds v5.mov`).
// activeRing carries NO transition of its own, so it SNAPS to each target while the ship eases
// toward it, leaving the ripple permanently ahead of the boat it is supposed to be marking. That is
// how the very first bug was diagnosed (the ring ran ~2 squares ahead and was drawing the correct
// path), and once the ship's own lag was fixed the same asymmetry became the remaining visible
// defect — smaller, but now the only thing moving out of step. Wyatt: *"the rings now move ahead of
// the boat."*
//
// The ring is only retuned while a sweep is in flight, and RESTORED to snapping afterwards. It must
// keep snapping normally: `render()` repositions it whenever the turn passes, and a ring that
// glided there would slide right across the board from the previous captain's boat to the next.
/* PUT A SHIP AND ITS RING ON A CELL WITH NO INTERPOLATION, AND MAKE IT STICK BEFORE RETURNING.
   2026-08-14, from a screen recording — Wyatt: *"The ripples now move differently than the ship
   sailing."* Measured: a 108 x 54px excursion in the first two frames of every routed sail.

   WHY IT HAPPENS, and it is not what it looks like. The targets are never wrong — the ring and the
   ship are aimed at identical positions on every frame. What differs is the TRANSITION they are
   carrying when liveRender() aims them at the destination: the ship has the ordinary 700ms glide
   and eases off toward it, while the ring carries NONE (deliberately — see setShipGlideMs below;
   it must snap when the turn passes, or it slides across the board between captains). So the ring
   resolves to the destination INSTANTLY. animateSailRoute then arms a 16ms tick glide and paints
   the start — and the ring, already at the far end, animates the whole length of the move backwards
   over those 16ms. That is the ripple leaving the boat.

   THE `getBoundingClientRect()` IS THE ENTIRE POINT OF THIS FUNCTION, and removing it as a useless
   read would restore the bug in silence. Style writes are batched: set transition:none, write the
   transform, then re-arm a transition, and the browser applies the transition in force at the END
   of the task — so the "snap" animates after all. Reading layout forces the start position to be
   committed first, which is what makes it a snap rather than a very short journey.

   Restores whatever transitions were in force, so a caller can arm its own glide afterwards. */
export function snapShipTo(seat,c){
  if(!shipEls.length||!shipEls[seat])return;
  const ringing=activeRing&&activeTurnSeat()===seat;
  const prevShip=shipEls[seat].style.transition;
  const prevRing=ringing?activeRing.style.transition:null;
  shipEls[seat].style.transition="none";
  if(ringing)activeRing.style.transition="none";
  paintShipAt(seat,c);
  void shipEls[seat].getBoundingClientRect();          // commit it — see above
  if(ringing)void activeRing.getBoundingClientRect();
  shipEls[seat].style.transition=prevShip;
  if(ringing)activeRing.style.transition=prevRing;
}
export function setShipGlideMs(seat,ms,ease){
  if(!shipEls.length||!shipEls[seat])return;
  const css=`transform ${shipGlideCss(ms==null?SHIP_GLIDE_MS:ms,ms==null?null:ease)}`;
  shipEls[seat].style.transition=css;
  if(activeRing&&activeTurnSeat()===seat)activeRing.style.transition=ms==null?"":css;
}
// Move one ship to an arbitrary FRACTIONAL cell position — the sub-square painter behind the smooth
// trade-wind arc. paintShipAt() below can only address whole cells, which is precisely the
// limitation that made the sweep a staircase.
//
// No shared-cell nudge here, deliberately: shipXY()'s ±0.18 offset exists so two ships PARKED on one
// square stay both visible, and applying it to a ship in flight would make it twitch sideways every
// time it passed over an occupied square. The resting nudge is restored by the final
// paintShipAt(seat,to) when the sweep ends.
export function paintShipAtPoint(seat,fx,fy){
  if(appState.replaying)return;
  if(!shipEls.length||!shipEls[seat])return;
  const x=(fx+.5)*cell, y=(fy+.5)*cell;
  shipEls[seat].style.transform=`translate(${x}px,${y}px)`;
  if(chatBubbles[seat])positionChatBubble(seat,x,y);
  if(activeRing&&activeTurnSeat()===seat)ringTo(seat,x,y);
}
export function paintShipAt(seat,c){
  if(appState.replaying)return;
  if(!shipEls.length||!shipEls[seat])return;
  const ev=appState.game.events[appState.evIdx];
  // fall back to the live players array when there is no event yet (first paint of a fresh game)
  const base=(ev&&ev.state)?ev.state:appState.game.players;
  const st=base.map((s,i)=>i===seat?{...s,pos:c}:s);
  const [x,y]=shipXY(c,seat,st,cell);
  shipEls[seat].style.transform=`translate(${x}px,${y}px)`;
  if(chatBubbles[seat])positionChatBubble(seat,x,y); // the bubble rides along, as renderLiveShips does
  if(activeRing&&activeTurnSeat()===seat)ringTo(seat,x,y);
}
/* ONE PLACE DRAWS A PURSE (rule 23 / DISPLAY-RULES §1).
   These four lines lived inline in render(), which was fine while render() was the only thing that
   ever moved a coin on screen. 04-01 Task 2 produced a SECOND consumer — a captain baking in
   another browser who pays for a re-watch, whose coin the host has not charged yet, because the
   count rides home in the single reply and settles there. The rule when a second consumer appears
   is CONVERGE, not add a path: so render() goes through this too, and the pulse, the dataset stamp
   and the markup are one statement rather than two copies drifting.
   `coins` is a NUMBER, and 0 is a real purse — every test in here is explicit, never truthiness. */
/* ⭐ THE COUNT ROLLS, IT DOES NOT JUMP — PASSED on his game feel audit (2026-09-13), as proposed for both directions: "Coins
   spray up from the dock and arc into your coin count, which rolls up number by number." · "The price leaves your coin count
   as a quick tick-down ... instead of the number just changing." The number ticks one at a time toward the new purse
   (never longer than COIN_ROLL_MAX_MS), and waits while treasure is still in the air (holdCoinRoll). The coin picture is
   written once and only the number changes, so the roll re-fetches nothing. A replay and reduced motion just set it. */
const COIN_ROLL_STEP_MS=40, COIN_ROLL_MAX_MS=700;
const coinRolls={};
/* A SHORTER HOLD WAKES A ROLL ALREADY WAITING ON A LONGER ONE. treasureBurst holds the count for up to a minute the moment coins
   are earned (they wait for the flip stage), then shortens the hold once they are actually in the air. The roll's next tick was
   scheduled against the long hold, so without this it slept the full minute: the count never showed the coins just earned, and
   "Buy a crate?" asked him to spend a purse the count said he did not have (measured on a posed dock, phone and laptop,
   2026-09-15). A hold that is lengthened needs nothing — the tick re-checks it when it wakes. */
export function holdCoinRoll(seat,ms){
  const r=coinRolls[seat]=coinRolls[seat]||{};
  r.holdUntil=performance.now()+ms;
  if(r.tick){clearTimeout(r.timer);r.timer=setTimeout(r.tick,Math.max(0,ms));}
}
export function showSeatCoins(seat,coins){
  const el=$("coins"+seat);
  if(!el)return;
  const had=el.dataset.coins!==undefined?+el.dataset.coins:null;
  if(had!==null&&had!==coins)pulseEl(el);
  el.dataset.coins=coins;
  const n=el.querySelector(".coinN");
  if(!n){el.innerHTML=`${iconImg(COIN_IMG)} <span class="coinN">${coins}</span>`;return;}
  const r=coinRolls[seat]=coinRolls[seat]||{};
  clearTimeout(r.timer);
  const from=parseInt(n.textContent,10);
  if(had===null||!Number.isFinite(from)||from===coins||appState.replaying||fxReduced()){n.textContent=coins;r.tick=null;return;}
  const every=Math.max(12,Math.min(COIN_ROLL_STEP_MS,COIN_ROLL_MAX_MS/Math.abs(coins-from))),dir=Math.sign(coins-from);
  const tick=()=>{
    if(!n.isConnected){r.tick=null;return;}
    // a hold set AFTER this roll was scheduled still holds it — the earned coins wait for the flip stage to come down (treasureBurst)
    if(performance.now()<(r.holdUntil||0)){r.timer=setTimeout(tick,r.holdUntil-performance.now());return;}
    const cur=parseInt(n.textContent,10);
    if(!Number.isFinite(cur)||cur===coins){n.textContent=coins;r.tick=null;return;}
    n.textContent=cur+dir;
    playCoinTick();                                            // his pick, 2026-09-14: the abacus click, one per coin
    if(cur+dir!==coins)r.timer=setTimeout(tick,every);else r.tick=null;
  };
  r.tick=tick;
  r.timer=setTimeout(tick,Math.max(0,(r.holdUntil||0)-performance.now()));
}
/* ⭐ TREASURE BURSTS OUT, AND A BOUGHT CRATE FLIES HOME — PASSED on his game feel audit (2026-09-13), as proposed: "Coins spray
   up from the dock and arc into your coin count" · "It lifts off the island, arcs to your captain's box, and lands on its
   crate with a squash — the island's copy greys with a little poof as it leaves."
   Called from THE ONE event consumer on a `dock` event, so every screen shows every captain's dock. They fly in FIXED
   position between two things drawn in different places — the board and the captains box — so both ends are measured as
   drawn and brought into the one fixed space (fixedOrigin, util.js) before a single number is taken between them. */
/* 780 -> 1170ms and a wider stagger: Wyatt, 2026-09-14, "the treasure should always fly from the island into your hold -- i think it
   does this, but a little fast." TREASURE_GAP_MS spaces the coins so each can be counted in. */
/* 620 -> 1240: Wyatt, 2026-09-15, "The crates DO fly -- but they're too fast. slow them to 50% of their current speed". His dial for it
   is on the Game Feel Tuner; this is the number he gave. */
const TREASURE_MS=1170, TREASURE_GAP_MS=90, TREASURE_MAX=20, CRATE_FLY_MS=1240;
/* THE FLIP STAGE COMES DOWN FIRST. A captain's own dock earns its coins while the stage still stands over the board; coins flying
   under it would land in a purse nobody can see. Waits at most the stage's own longest stand (stage.js CER_VEIL_WAIT_CAP_MS). */
function whenFlipStageGone(capMs=7100){
  return new Promise(res=>{ const t0=performance.now();
    const look=()=>{ if(!document.body.classList.contains("pp4Cer")||performance.now()-t0>capMs)res(); else setTimeout(look,50); };
    look(); });
}
function fixedPointOfBoard(svg,x,y){
  const ctm=svg&&svg.getScreenCTM();if(!ctm)return null;
  const pt=svg.createSVGPoint();pt.x=x;pt.y=y;
  const p=pt.matrixTransform(ctm),o=fixedOrigin();
  return [p.x-o.x,p.y-o.y];
}
function capShowing(){const cap=$("pp4Cap");return !(cap&&cap.style.visibility==="hidden");}
export async function treasureBurst(seat,coins){
  if(fxReduced()||!shipEls[seat])return;
  const n=Math.max(1,Math.min(TREASURE_MAX,Math.round(coins||1)));
  holdCoinRoll(seat,60000);                         // the count waits for its coins…
  await whenFlipStageGone();
  const ships=$("boardShips")||$("board");
  const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(shipEls[seat].style.transform||"");
  const from=m&&fixedPointOfBoard(ships,parseFloat(m[1]),parseFloat(m[2]));if(!from){holdCoinRoll(seat,0);return;}   // never leave the count frozen (CEO, 2026-09-15)
  const icon=($("coins"+seat)||{querySelector:()=>null}).querySelector("img");
  let to=null;
  if(icon&&capShowing()){const r=icon.getBoundingClientRect(),o=fixedOrigin();if(r.width>1)to=[r.left+r.width/2-o.x,r.top+r.height/2-o.y];}
  const ctm=ships.getScreenCTM(),size=Math.max(12,cell*(ctm?ctm.a:1)*0.42);
  if(!from||!to)holdCoinRoll(seat,0);
  const anims=[];
  for(let k=0;k<n;k++){
    const im=document.createElement("img");
    im.src=COIN_IMG;im.alt="";im.className="ppTreasure";im.dataset.seat=String(seat);   // whose purse this one is heading for — read by the probes, invisible to a player
    Object.assign(im.style,{left:(from[0]-size/2)+"px",top:(from[1]-size/2)+"px",width:size+"px",height:size+"px"});
    document.body.appendChild(im);
    const spread=(k-(n-1)/2)*size*0.55,up=size*(2.2+((k*37)%5)*0.25);
    const end=to?[to[0]-from[0],to[1]-from[1]]:[spread*1.4,-up*1.6];
    const a=im.animate([{translate:"0px 0px",scale:"0.4",opacity:0},
      {translate:`${spread.toFixed(1)}px ${(-up).toFixed(1)}px`,scale:"1.05",opacity:1,offset:.4},
      {translate:`${end[0].toFixed(1)}px ${end[1].toFixed(1)}px`,scale:to?"0.55":"0.7",opacity:to?1:0}],
      {duration:TREASURE_MS,delay:k*TREASURE_GAP_MS,easing:"cubic-bezier(.3,.7,.4,1)",fill:"both",id:"treasure"});
    a.onfinish=a.oncancel=()=>im.remove();anims.push(a);
  }
  const flight=TREASURE_MS+(n-1)*TREASURE_GAP_MS;
  /* THE WAIT IS THE FLIGHT ITSELF, NOT A CLOCK BESIDE IT. On a busy machine the coins start a frame or more after they are created, so a
     timer of the same length ended before the last coin landed: a heads dock measured "Buy a crate?" 133ms before its third coin
     arrived (2026-09-15). So the count starts rolling when the FIRST coin lands, and this (and through eventDrawn, a dock's question)
     waits for the LAST one, capped so a stalled page never holds the game. */
  if(to&&anims.length){holdCoinRoll(seat,flight+1500);const go=()=>holdCoinRoll(seat,0);anims[0].finished.then(go,go);}
  else holdCoinRoll(seat,0);
  await Promise.race([Promise.all(anims.map(a=>a.finished.catch(()=>{}))),new Promise(r=>setTimeout(r,flight+1500))]);
}
/* ⭐ THE TWO CRATES SWAP IN ARCS — PASSED on his game feel audit (2026-09-13), as proposed: "Your crate and theirs cross over
   each other between the two rows, and both land with a squash." Same shape as the crate flight home: each side's crate is
   read out of its row BEFORE render() moves it, and flies to the new chip in the other row AFTER render() draws it. The two
   bow opposite ways, so they visibly pass each other rather than overlap in a straight line. A counter paid in coin has no
   crate on that side — only the ingredient flies, and the coin counts roll. */
const SWAP_MS=1360;   // 680 -> 1360: the same ruling, for the two crates of a trade crossing
function chipIn(seat,src){
  const el=$("chips"+seat);if(!el||!src)return null;
  return [...el.querySelectorAll(".chip")].filter(c=>{const i=c.querySelector("img");return i&&i.getAttribute("src")===src;}).pop()||null;
}
/* THE CRATE FLIES, NOT JUST WHAT IS ON IT — Wyatt, 2026-09-14: "the crates themselves should ALSO swap between players, not just the
   ingredient icons; use the crate icons too. Please also do the same thing when a crate is purchased off an island -- the ingredient
   ON the crate should move into the hold, not just the ingredient on its own." The flying copy is the approved crate with the
   ingredient sitting on it, the way every hold draws them. */
function flyingCrate(src){
  const d=document.createElement("div");d.className="ppCrateFly ppCrateBox";
  const im=document.createElement("img");im.src=src;im.alt="";d.appendChild(im);
  return d;
}
function fixedBox(el){const r=el.getBoundingClientRect();if(r.width<1)return null;const o=fixedOrigin();return {x:r.left-o.x,y:r.top-o.y,w:r.width,h:r.height};}
export function tradeSwapFrom(e){
  if(fxReduced()||!e||e.t!=="trade")return null;
  const giveSrc=(/src="([^"]+)"/.exec(String(e.gave||""))||[])[1]||null,wantSrc=ING_IMG[e.got]||null;
  const legs=[];
  const g=chipIn(e.a,giveSrc),w=chipIn(e.b,wantSrc);
  if(g&&fixedBox(g))legs.push({src:giveSrc,from:fixedBox(g),to:e.b,bow:-1});
  if(w&&fixedBox(w))legs.push({src:wantSrc,from:fixedBox(w),to:e.a,bow:1});
  return legs.length?legs:null;
}
export function tradeSwapTo(legs){
  if(!legs||!capShowing())return;
  for(const leg of legs){
    const chip=chipIn(leg.to,leg.src),to=chip&&fixedBox(chip);
    if(!to)continue;
    chip.style.visibility="hidden";
    const im=flyingCrate(leg.src);
    Object.assign(im.style,{left:leg.from.x+"px",top:leg.from.y+"px",width:leg.from.w+"px",height:leg.from.h+"px"});
    document.body.appendChild(im);
    const dx=(to.x+to.w/2)-(leg.from.x+leg.from.w/2),dy=(to.y+to.h/2)-(leg.from.y+leg.from.h/2);
    /* THE ARC STAYS ON THE GLASS. On a phone the hold slots sit at the right edge of the captains box, so a crate bowing outward
       flew half off the screen (a phone guest at 375 wide, 2026-09-15). The bow is clamped so the crate's widest moment, the
       middle of the arc at 1.2x, sits inside the screen; start and end are already on it, so the whole path is. */
    const o=fixedOrigin(),cx0=o.x+leg.from.x+leg.from.w/2+dx*.5,half=leg.from.w*.6+6;
    const side=Math.max(half-cx0,Math.min(window.innerWidth-half-cx0,leg.bow*Math.max(leg.from.w*1.4,Math.abs(dy)*0.35))),s=Math.max(.3,Math.min(2,to.w/leg.from.w));
    const a=im.animate([{translate:"0px 0px",scale:"1"},
      {translate:`${(dx*.5+side).toFixed(1)}px ${(dy*.5).toFixed(1)}px`,scale:"1.2",offset:.5},
      {translate:`${dx.toFixed(1)}px ${dy.toFixed(1)}px`,scale:String(s)}],{duration:SWAP_MS,easing:"ease-in-out",fill:"both",id:"trade-swap"});
    let landed=false;
    const land=()=>{if(landed)return;landed=true;im.remove();chip.style.visibility="";
      if(chip.isConnected&&typeof chip.animate==="function")chip.animate([{scale:"1.3 0.75"},{scale:"0.92 1.08",offset:.5},{scale:"1"}],{duration:300,easing:"ease-out",id:"crate-land"});};
    a.onfinish=land;a.oncancel=land;
    setTimeout(land,SWAP_MS+400);
  }
}
/* A TRADE'S COINS CROSS FROM ONE PURSE TO THE OTHER. Wyatt, 2026-09-14: "every coin you earn should fly over". The CEO found a trade's
   coins never flew (2026-09-15). They come from the other captain, not from an island, so they fly row to row the way the crates
   do: out of the payer's coin count and into the seller's, one coin per coin. The seller's count waits for them; the payer's drops
   at once, because the coins have already left. Called BEFORE render(), so the hold is in place before the new count is drawn. */
const ACROSS_MS=900;
export async function coinsAcross(fromSeat,toSeat,coins){
  if(fxReduced()||!capShowing())return;
  const at=s=>{const icon=($("coins"+s)||{querySelector:()=>null}).querySelector("img");if(!icon)return null;
    const r=icon.getBoundingClientRect(),o=fixedOrigin();return r.width>1?{x:r.left+r.width/2-o.x,y:r.top+r.height/2-o.y,w:r.width}:null;};
  const from=at(fromSeat),to=at(toSeat);if(!from||!to)return;
  const n=Math.max(1,Math.min(TREASURE_MAX,Math.round(coins||1))),size=Math.max(12,from.w*1.15);
  const anims=[];
  const dx=to.x-from.x,dy=to.y-from.y,ox=fixedOrigin().x,cx0=ox+from.x+dx*.5,half=size*.55+6;
  const bow=Math.max(half-cx0,Math.min(window.innerWidth-half-cx0,Math.max(size*2,Math.abs(dy)*0.3)));   // the same clamp: on the glass
  for(let k=0;k<n;k++){
    const im=document.createElement("img");
    im.src=COIN_IMG;im.alt="";im.className="ppTreasure";im.dataset.seat=String(toSeat);   // the seller's purse
    Object.assign(im.style,{left:(from.x-size/2)+"px",top:(from.y-size/2)+"px",width:size+"px",height:size+"px"});
    document.body.appendChild(im);
    const a=im.animate([{translate:"0px 0px",scale:"0.6",opacity:0},
      {translate:`${(dx*.5+bow).toFixed(1)}px ${(dy*.5).toFixed(1)}px`,scale:"1.1",opacity:1,offset:.45},
      {translate:`${dx.toFixed(1)}px ${dy.toFixed(1)}px`,scale:"0.7",opacity:1}],
      {duration:ACROSS_MS,delay:k*TREASURE_GAP_MS,easing:"cubic-bezier(.3,.7,.4,1)",fill:"both",id:"coins-across"});
    a.onfinish=a.oncancel=()=>im.remove();anims.push(a);
  }
  const flight=ACROSS_MS+(n-1)*TREASURE_GAP_MS,go=()=>holdCoinRoll(toSeat,0);   // the seller's count starts when the first coin lands
  holdCoinRoll(toSeat,flight+1500);if(anims.length)anims[0].finished.then(go,go);else go();
  await Promise.race([Promise.all(anims.map(a=>a.finished.catch(()=>{}))),new Promise(r=>setTimeout(r,flight+1500))]);
}
/* Measured BEFORE render() greys the crate (its island rect), handed to crateFlightTo AFTER render() has drawn the new chip. */
export function crateFlightFrom(e){
  if(fxReduced()||!e||!e.tokens||e.tokens[e.ing]==null)return null;
  const crate=$(`crate_${e.ing}_${e.tokens[e.ing]}`);if(!crate)return null;
  const r=crate.getBoundingClientRect();if(r.width<1)return null;
  const o=fixedOrigin();
  return {ing:e.ing,rect:{x:r.left-o.x,y:r.top-o.y,w:r.width,h:r.height}};
}
export function crateFlightTo(f,seat){
  if(!f)return;
  const cx=f.rect.x+f.rect.w/2,cy=f.rect.y+f.rect.h/2;
  const poof=document.createElement("div");poof.className="ppPoof";
  Object.assign(poof.style,{left:(cx-f.rect.w*.6)+"px",top:(cy-f.rect.h*.6)+"px",width:(f.rect.w*1.2)+"px",height:(f.rect.h*1.2)+"px"});
  document.body.appendChild(poof);
  const pa=poof.animate([{opacity:.8,scale:"0.5"},{opacity:0,scale:"1.5"}],{duration:480,easing:"ease-out",fill:"both",id:"crate-poof"});
  pa.onfinish=pa.oncancel=()=>poof.remove();
  const chipsEl=$("chips"+seat),src=ING_IMG[f.ing];
  if(!chipsEl||!capShowing()||!src)return;
  const chip=[...chipsEl.querySelectorAll(".chip")].filter(c=>{const i=c.querySelector("img");return i&&i.getAttribute("src")===src;}).pop();
  if(!chip)return;
  const cr=chip.getBoundingClientRect();if(cr.width<1)return;
  const o=fixedOrigin(),tx=cr.left-o.x+cr.width/2,ty=cr.top-o.y+cr.height/2;
  chip.style.visibility="hidden";
  const im=flyingCrate(src);
  Object.assign(im.style,{left:f.rect.x+"px",top:f.rect.y+"px",width:f.rect.w+"px",height:f.rect.h+"px"});
  document.body.appendChild(im);
  const dx=tx-cx,dy=ty-cy,s=Math.max(.3,Math.min(2,cr.width/f.rect.w));
  const a=im.animate([{translate:"0px 0px",scale:"1"},
    {translate:`${(dx*.2).toFixed(1)}px ${(dy*.2-f.rect.h*1.2).toFixed(1)}px`,scale:"1.15",offset:.3},
    {translate:`${dx.toFixed(1)}px ${dy.toFixed(1)}px`,scale:String(s)}],{duration:CRATE_FLY_MS,easing:"cubic-bezier(.45,0,.3,1)",fill:"both",id:"crate-fly"});
  let landed=false;
  const land=()=>{if(landed)return;landed=true;im.remove();chip.style.visibility="";
    if(chip.isConnected&&typeof chip.animate==="function")chip.animate([{scale:"1.3 0.75"},{scale:"0.92 1.08",offset:.5},{scale:"1"}],{duration:300,easing:"ease-out",id:"crate-land"});};
  a.onfinish=land;a.oncancel=land;
  setTimeout(land,CRATE_FLY_MS+400);   // a dropped animation never leaves a crate invisible in the hold
}
export function render(){
  if(idlePlaceholder()){if(shipEls.length)hideShipsWhileIdle();return;}
  if(shipEls.length)unhideShips();
  const e=appState.game.events[appState.evIdx];if(!e)return;
  const st=e.state;
  // recipes are secret: only the local human's own recipe target is revealed.
  // in a spectator-only game (no human seat, e.g. a bot-vs-bot design test) everything stays visible.
  const humanIdxs=appState.game.players.map((player,i)=>player.strategy==="human"?i:-1).filter(i=>i>=0);
  const youIdx=humanIdxs.length===1?humanIdxs[0]:-1;
  const spectator=humanIdxs.length===0;
  let bandHtml="", hasYou=false;   // the viewer's recipe, for #capRecipeBand — filled by the loop, written once after it
  appState.game.players.forEach((player,i)=>{
    const [x,y]=shipXY(st[i].pos,i,st,cell);
    shipEls[i].style.transform=`translate(${x}px,${y}px)`;
    // v2.1 (Wyatt, 2026-08-06): "they don't need to fade out visually when they dock at Tortuga —
    // they are still active players." A finished captain used to drop to 45% opacity, which read as
    // "out of the game". Under rule 13b they were never out — they are a legal target sitting on the
    // most valuable cargo at the table — and since the bakery raid now actually un-bakes them
    // (Game.unfinish), a ghosted ship is worse than cosmetic: it says "nothing to do here" about the
    // one ship worth attacking. Every ship renders at full strength; the tell that somebody is home
    // is that they are parked on Tortuga, plus the 🏁 line that announced it.
    //
    // THE BAKE-OFF BRINGS IT BACK (Wyatt, 2026-08-08: "in a past version, the boat faded
    // semitransparent when docked... now i want it back because we have the bake-off").
    //
    // A PREVIOUS VERSION OF THIS NOTE WAS WRONG AND IS CORRECTED HERE. It claimed a docked finisher
    // stays solid because they are "still a legal target, still worth attacking". That is the v2
    // CLASSIC rule, carried across and asserted as if it were this build's. It is not: Wyatt ruled
    // on 2026-08-06 that Tortuga is sanctuary, canAttack returns false the moment the ovens are
    // lit, and under the bake-off `done` is only ever set by endBakeDay — which ends the voyage.
    // So there is no such thing here as a docked finisher sitting around raidable.
    //
    // Which leaves one honest meaning for the fade, and it is the same one either way you say it:
    // a ship you cannot reach. inPlay() has taken them off the board — no storm, no raid, no trade,
    // square free — and the boat being half-there is the picture of that.
    // Read off the event snapshot, not live state, so dragging the scrubber back to before the
    // ovens were lit shows a solid ship again.
    shipEls[i].style.opacity=st[i].baking?0.42:1;
    if(chatBubbles[i])positionChatBubble(i,x,y); // keep an active chat bubble riding along with its boat
    showSeatCoins(i,st[i].coins);
    const hold=[...st[i].ing];
    const chipsEl=$("chips"+i);
    let newChipsHtml;
    // pass & play: your own recipe never auto-reveals — it only shows once you've tapped
    // "check my recipe" during your own live turn (see humanTurn/passGate), so a device
    // changing hands mid-battle or mid-trade can never carry someone else's recipe on screen.
    /* THE RULE LIVES IN src/shared/visibility.js — pure, gated, and knowing no mode's name. These
       two lines used to spell out `appState.passAndPlay` inline, which made a GAME RULE (your own
       recipe is yours, everyone else's is private) look like a pass-and-play feature. It is not:
       on separate devices the hardware enforces it for free, on one shared screen the same rule
       needs a tap. Step 5's narrow half, at Wyatt's choosing, 2026-08-31. */
    /* WHO IS LOOKING is read ONCE, here, and every secrecy decision below takes it from these two
       names — the two rules, and the band. It used to be read inline in each rule's call, so adding
       the band would have been a third read of the same fact in a file that draws (mode_fork_check). */
    const mine=i===appState.mySeat, sharedDevice=appState.passAndPlay;
    const canReveal=mayRevealRecipe({isMySeat:mine,spectator,sharedDevice,askedThisTurn:appState.recipeRevealed});
    const offerCheckBtn=offersRecipeCheck({isMySeat:mine,isActiveSeat:i===appState.activeTurnSeat,sharedDevice,askedThisTurn:appState.recipeRevealed});
    /* ⭐ YOUR RECIPE LIVES IN THE BAND, NOT IN YOUR ROW — Wyatt's Q4 ruling, 2026-09-10: "A header
       band across the top of the plaque — above all the captain rows. Coins and crates are facts
       about the table; a recipe is a fact about you." So every row, yours included, shows the same
       two facts — coins and the crates aboard — and the recipe the viewer is allowed to see goes
       in #capRecipeBand, with a tick on each ingredient already in the hold.
       THE SAME TWO RULES DECIDE IT, unchanged: mayRevealRecipe / offersRecipeCheck. So the band is
       empty exactly when the row used to be — and that is his duty on the ruling, "it must not be
       on screen when a pass-and-play device changes hands", met by the rule that already met it.
       A SPECTATOR HAS NO "YOU", so a spectator keeps every recipe in its own row, as before. */
    const bandSeat=mine&&!spectator;
    if(bandSeat){
      hasYou=true;
      const rec=appState.game.players[i].recipe;
      if(canReveal&&rec&&rec.length){
        const bh=[...st[i].ing];
        const want=appState.game.players[i].recipe.map(ing=>{
          const k=bh.indexOf(ing); const have=k>=0; if(have)bh.splice(k,1);
          return `<span class="chip ${have?"have":""}" title="${iname(ing)}${have?say("hold.aboard",{}):""}">${ingImg(ing)}</span>`;
        }).join("");
        bandHtml=`<span class="narrRecipeLink capRecipeName" data-idx="${i}">${recipeTitle(appState.game.players[i].recipe)}</span>`+
          `<span class="capRecipeIng">${want}</span>`;
      }else if(offerCheckBtn){
        // @copy misc.board.checkrecipebtn
        bandHtml=`<button type="button" class="checkRecipeBtn" onclick="revealMyRecipe()" style="background:${HEXCOL[i]};color:#fff;border-color:${HEXCOL[i]}">${say("recipe.check",{})}</button>`;
      }
    }
    if(canReveal&&!bandSeat){
      $("prowRecipe"+i).innerHTML=`${iconImg(SCROLL_IMG)} ${recipeTitle(appState.game.players[i].recipe)}`;
      $("prowRecipe"+i).classList.add("hasRecipe");
      // recipe chips consume one matching crate each; every leftover crate is surplus cargo
      const chips=appState.game.players[i].recipe.map(ing=>{
        const k=hold.indexOf(ing);
        const have=k>=0;
        if(have)hold.splice(k,1);
        return `<span class="chip ${have?"have":""}" title="${iname(ing)}">${ingImg(ing)}</span>`;
      });
      // @copy misc.board.surplustooltip
      const extras=hold.map(x2=>`<span class="chip extra" title="${say("hold.surplus",{ing:iname(x2)})}">${ingImg(x2)}</span>`);
      // @copy misc.board.prowcargorow
      newChipsHtml=chips.join("")+(extras.length?`<span style="opacity:.4">·</span>`:"")+extras.join("");
    }else{
      // other captains' recipe maps are private — only the crates visibly aboard their ship are shown.
      // sorted so duplicate ingredients sit next to each other — easier to spot a tradeable double
      $("prowRecipe"+i).classList.remove("hasRecipe");
      const held=hold.slice().sort().map(x2=>`<span class="chip have" title="${iname(x2)}">${ingImg(x2)}</span>`);
      // @copy misc.board.emptyhold
      /* an empty hold is an empty crate — his Q6 ruling, 2026-09-10 ("An empty crate silhouette"). The
         words stay as its name, for a tooltip and a screen reader. */
      newChipsHtml=held.join("")||`<span class="chip holdEmpty" title="${say("hold.empty",{})}" aria-label="${say("hold.empty",{})}" role="img"></span>`;
    }
    /* T-33 — the guard decided whether to PULSE, not whether to WRITE, so all four captains' hold
       chips were destroyed and rebuilt on every render: 600 fresh <img> elements in 210 seconds,
       each one a cold fetch. Moving the assignment inside the comparison keeps the pulse behaviour
       byte-identical and stops the churn. */
    /* COMPARED AGAINST THE STRING THIS WROTE, not innerHTML — the band's reason (below), and now a
       second one: fitHold() puts the squeeze on each crate as an inline margin, so innerHTML would
       never match again and every render would rebuild and pulse every captain's hold. */
    if(chipsEl.dataset.src!==newChipsHtml){
      if(chipsEl.dataset.src)pulseEl(chipsEl);
      chipsEl.innerHTML=newChipsHtml; chipsEl.dataset.src=newChipsHtml;
      fitHold(chipsEl);
    }
    const lastEv=appState.game.events[appState.game.events.length-1];
    $("crown"+i).innerHTML=(lastEv.t==="end"&&lastEv.winner===i&&appState.evIdx===appState.game.events.length-1)?iconImg(CROWN_IMG):"";
  });
  /* the band is written only when it CHANGES, for T-33's reason above: rebuilding it every render
     re-fetches five <img>s a frame. Compared against the string this wrote, not against innerHTML,
     which the browser normalises and would never match. */
  const band=$("capRecipeBand");
  if(band&&band.dataset.src!==bandHtml){
    if(band.dataset.src&&bandHtml)pulseEl(band);
    band.innerHTML=bandHtml; band.dataset.src=bandHtml;
    fitRecipeName();          // a new recipe is a new width to fit
  }
  /* THE BAND KEEPS ITS PLACE WHILE IT IS BLANK, so the box never changes height mid-voyage — his
     Q11, "the board does not give way". On a phone the board takes whatever the box leaves, so a
     band that came and went at every pass-and-play reveal and hand-over would breathe the board up
     and down by its own height each time. Blank is visibility:hidden — nothing drawn, which is the
     secrecy duty — not display:none. Only a table with no "you" (spectating bots) has no band. */
  if(band){ band.hidden=!hasYou; band.classList.toggle("bandEmpty",!bandHtml); }
  // active-player ring + captain's-box highlight: whose turn is it as of this event?
  /* T-09 (Wyatt, 2026-08-26, with a host/guest screenshot pair): "the bakeoff SHOULD be happening
     for guest because it's their turn -- but Dough hook (who just played) is still displayed as the
     active player ship in the top header, and in the captain's box." He saw it in crew; he then
     found the same thing in pass-and-play (his #34), so it is every mode.

     THE WALK ONLY KNEW ABOUT `turn`. A bake is not a turn — the engine emits {t:"ovens",p} when a
     captain steps up and {t:"bake",p} for each attempt — so during a bake the most recent `turn`
     was still the PREVIOUS captain's, and the ring and the highlight faithfully pointed at them.
     Both screens agreed, which is why this was never a host/guest fault: one derivation, one wrong
     answer, drawn identically everywhere.

     THIS CHANGE DOES NOT FIX WHAT HE SAW, and the probe says so: bakeoff_surface.mjs still reads
     "Flaky Jack" lit while "Davy Probe" bakes. MEASURED, not assumed. The reason is that
     bakeoffPrompt runs BEFORE the engine records anything — {t:"ovens"} and {t:"bake"} are emitted
     when the attempt RESOLVES — so while the bench is on screen there is no bake event to find.
     What this does fix is the moment after the bake, and a resumed voyage replaying across one.

     THE REAL DEFECT, located and left for a supervised change: there are TWO independent answers
     to "whose turn is it". `appState.curSeat`, which every prompt sets through applyActiveSeat —
     including the bake — and THIS EVENT WALK, which the ring and the captains box actually read.
     They disagree for the whole length of a bake. That is rule 23's shape exactly: one fact,
     derived twice, kept in step by nothing.

     Converging them means deciding which one wins during REPLAY, where there is no live actor and
     the box must follow the narration playhead rather than run ahead of it (see applyCaptainOrder
     below). That is a design call, not a patch, so it waits for Wyatt rather than being guessed at
     while he sleeps. Do not "fix" this by reading curSeat here as well — that makes three. */
  /* ONE DERIVATION (2026-08-31). This walk used to live here, private, as the THIRD independent
     answer to "whose turn is it". It has moved to src/shared/storyboard.js — the pure leaf tier,
     where module_graph_check GATES its purity rather than trusting it. The list of events that
     establish a turn, the round boundary that stops the walk, and the 80-event bound are all
     unchanged; they now have one spelling instead of a copy per reader. The `done` filter below
     stays here, because it reads render state and the derivation must not. */
  /* ONE ANSWER FOR EVERY SURFACE — Wyatt, 2026-08-31, and this ruling REPLACED two earlier ones
     the same day: "rings follow active player the whole game with no exception including during
     bakeoff. Consistency is a design value."

     So the ring, the captains-box highlight and the pass-and-play row order all read THIS value,
     derived once from TURN_ESTABLISHING — the list that counts `ovens` and `bake`, because during
     a bake the captain at the ovens IS the active player. renderLiveShips()'s ring reads the same
     list through activeTurnSeat().

     THE HISTORY, because two reversals in one day is exactly what a later reader will mistake for
     drift. Earlier today he ruled "no ripple ring in the ovens", which was applied to the ring and
     then — after CEO review 40 caught it — scoped so the box kept the wider list, because
     `ovens`/`bake` were added to that list FOR the box (T-09, 2026-08-26: "Dough hook, who just
     played, is still displayed as the active player ship in the top header, AND IN THE CAPTAIN'S
     BOX"). Shown the split, he closed it the other way: one rule, every surface. That is the
     ruling that stands, and it also settles T-09 in the same breath.

     WHAT WAS ACTUALLY BROKEN, and it survives every version of the ruling: this line used to pass
     NO list, and an omitted option is not "no answer" — it is the DEFAULT answer, while the other
     ring site passed the narrow one. The two derivations therefore disagreed (measured 2026-08-31:
     on [newround, turn p1, sail p1, ovens p3, bake p3] they returned seat 1 and seat 3). The
     option is now gone entirely — one rule, nothing to pass, nothing to forget.
     scripts/qa/ripple_one_answer_check.mjs fails the build if any surface comes apart from the
     others — it asserts AGREEMENT first and the current ruling second, which is what let this
     reversal be a one-line change instead of an argument. */
  let active=deriveActiveSeat(appState.game.events,appState.evIdx);
  if(active!=null&&st[active].done)active=null;
  if(activeRing){
    if(active!=null){
      const [ax,ay]=shipXY(st[active].pos,active,st,cell);
      ringTo(active,ax,ay);
      // PERF-01: a style, not an attribute — `opacity` is presentational-attribute-only on SVG.
      activeRing.style.opacity=1;
    }else activeRing.style.opacity=0;
  }
  appState.game.players.forEach((player,i)=>{
    const row=$("prow"+i);if(row)row.classList.toggle("activeTurn",i===active);
  });
  // Pass & Play only: float the captain whose turn it is to the top of the box, rest in sailing
  // order. Driven from the SAME `active` as the ring and the highlight, so no two of the three can
  // ever point at different captains, and in step with the narration playhead rather than ahead of
  // it. See applyCaptainOrder, and the one-answer note above.
  applyCaptainOrder(active);   // the SAME value as the ring and the highlight — see the note above
  /* THE ACTIVE ROW STAYS IN VIEW when the list is capped and scrolling (his Q11: "Cap it and
     scroll"). Only the LIST scrolls — scrollIntoView would also scroll the page, and on a phone that
     moves the board — and only when the row is actually outside the visible part of the list. */
  { const list=$("players"), row=active!=null?$("prow"+active):null;
    if(list&&row&&list.scrollHeight>list.clientHeight+1){
      const top=row.offsetTop-list.offsetTop, bot=top+row.offsetHeight;
      if(top<list.scrollTop)list.scrollTop=top;
      else if(bot>list.scrollTop+list.clientHeight)list.scrollTop=bot-list.clientHeight;
    } }
  if(appState.game.cfg.crates<1e9)for(const ing of appState.game.ings){
    const remaining=e.tokens[ing];
    for(let idx=0;idx<appState.game.cfg.crates;idx++){
      const ic=document.getElementById(`crate_${ing}_${idx}`);if(!ic)continue;
      const taken=idx>=remaining;
      const img=ic.querySelector("image");
      /* T-33 — WRITE ONLY WHEN IT CHANGES. This wrote every crate's href on every render whether
         or not the value differed, and an SVG href assignment restarts the load machinery even
         when the string is identical. Measured over one 210-second solo voyage: 1743 href writes
         on #board, of which 1739 wrote the value that was already there — about 29 redundant
         fetches per game event, forever. A rewrite that lands on an in-flight load CANCELS it and
         fires `error`, and nothing here catches an error, so the element is left showing the
         browser's broken-image glyph — a blue "?" in Safari, which is exactly what Wyatt
         photographed on the board AND in the hold chips. */
      const want=taken?ING_HOLE_IMG[ing]:ING_IMG[ing];
      if(img&&img.getAttribute("href")!==want)img.setAttribute("href",want);
      ic.style.opacity=taken?.45:1;
    }
    // the black-market flag rises exactly when the last crate greys (same snapshot, one truth)
    const flag=document.getElementById(`bmflag_${ing}`);
    if(flag){const dry=remaining<=0&&remaining<1e9;flag.style.opacity=dry?1:0;}
  }
  /* ⭐ THE WIND IS A FACT ABOUT THE GAME, NOT ABOUT THIS EVENT — Wyatt, playtest 2026-09-10, item
     12: "When i reloaded, there was no wind particle animation... but the ships were in the right
     place."
     MEASURED, before and after a reload of the same voyage: 20 wind dots became 0. Every event the
     engine emits carries the wind that was blowing when it happened, and this whole block hung off
     `e.wind` — so it only ever ran while a NEW event was being drawn. A resume rebuilds the board
     by replaying a log; the render that lands is not a fresh event, `e.wind` is undefined, and the
     needle, the forecast chip and the particle layer are all skipped. They then stay skipped until
     the next live event, which on a resumed voyage can be a whole turn away.
     The engine already holds the answer — windNow/stormNow are what the compass readout itself
     reads — so resolve it once here and let the event merely OVERRIDE it. A replayed frame draws
     the wind the game is actually under, which is the same wind the header was already showing
     beside it. Two sources for one fact was the defect; this is one. */
  const liveWind = e.wind || (appState.game && appState.game.windNow) || null;
  if(spinNeedle&&liveWind){
    const storming=!!(e.wind ? e.storm : (appState.game && appState.game.stormNow));
    // v2 rule 7: a storm blows ONE direction now, so there is no combined diagonal to aim at —
    // the needle simply points where the wind points, storm or no storm.
    const angle=({N:0,E:90,S:180,W:270})[liveWind];
    spinNeedle.style.transform=`rotate(${angle}deg)`;
    // v2 rule 6: next round's committed wind, as the small chevron riding on the needle. It points
    // the way the wind will BLOW, matching the needle's own convention exactly.
    // v2.1: forecastWind() is null while a storm is coming — the chip still shouts STORM, it just
    // cannot say which way. `have` (not `nx`) gates the chip's visibility now, because gating on
    // the direction would make the whole chip DISAPPEAR on exactly the round it matters most.
    const nx=appState.game&&appState.game.forecastWind();
    const nextStorm=!!(appState.game&&appState.game.stormNext);
    const have=!!(appState.game&&(nx||nextStorm));
    if(forecastNeedle)forecastNeedle.style.display=have?"":"none";
    if(forecastMark&&have){
      // With no direction to name, the direction slot holds a turning arrow instead of a letter —
      // the two are mutually exclusive and share the same space, so exactly one is ever shown.
      //
      // THIS REPLACED THE WORD "STORM", which was a measured mistake and not a taste one: at the
      // shipped size the word rendered 31.3px wide into an 18.6px slot and overlapped the cloud
      // icon by 12.7px. The slot is fixed by the two anchors this chip is built on, so the thing
      // that goes in it has to be small — a glyph, never a word.
      forecastMark.textContent=nx?`${nx} ${({N:"↑",E:"→",S:"↓",W:"←"})[nx]||""}`:"";
      if(forecastSpin)forecastSpin.style.display=nx?"none":"";
      if(forecastSpinner)forecastSpinner.classList.toggle("fcSpin",!nx);
      // the storm cloud sits BEFORE the slot, and only when weather is actually coming
      if(forecastStorm)forecastStorm.style.display=nextStorm?"":"none";
      // THE STORM WARNING IS THE WHOLE BOX GOING RED — a filled chip changing colour is visible in
      // peripheral vision on a phone in a way that a small glyph never was.
      forecastMark.setAttribute("fill",nextStorm?"#ffffff":"#1f4249");
      forecastLabel.setAttribute("fill",nextStorm?"#ffffff":"#1f4249");
      forecastBox.setAttribute("fill",nextStorm?"#d32f2f":"#fffdf0");
      forecastBox.setAttribute("stroke",nextStorm?"#7f1d1d":"#29a3b2");
      forecastPulse.classList.toggle("fcStorm",nextStorm);
    }
    // notes/edits UI-05: the "⛈️ STORM" word + emoji under the compass are gone — the darkened
    // board, the coloured dial, the glowing needle and the rain already read as "storm" without a
    // caption. Kept the (now always-empty) node so the storm-colour toggle below still has a safe
    // target and nothing else has to change.
    stormText.textContent="";
    if(stormDial){
      stormDial.setAttribute("fill",storming?"#2a2f4a":"#fffdf0");
      stormDial.setAttribute("stroke",storming?"#141824":"#f5a623");
    }
    const needleImg=spinNeedle.querySelector("image");
    if(needleImg)needleImg.style.filter=storming?"drop-shadow(0 0 5px #ffd23f) saturate(1.4)":"none";
    windLabels.forEach(t=>t.setAttribute("fill",storming?"#f4f6ff":"#1f4249"));
    // #1b: darken the whole board + run the rain overlay during a storm. The CSS handles the fade
    // in/out; here we toggle the class and, while storming, aim the rain to fall WITH the wind.
    // `angle` is the compass heading the wind blows toward (0=N/up, clockwise). Each rain layer's
    // local fall is straight down; rotating by angle+180 turns that into the true wind direction.
    const bw=$("boardwrap");if(bw)bw.classList.toggle("storming",storming);
    const ov=$("stormOverlay");
    if(ov&&storming){
      // G19: pass the GAME seed so every client in a room renders identical rain. appState.game may
      // be absent on the decorative demo board — stormLayerSpecs falls back to a fixed literal seed,
      // never Math.random().
      buildStormLayers(ov,appState.game&&appState.game.seed); // lazily create the jittered rain layers (once)
      ov.style.setProperty("--slant",(angle+180)+"deg");
    }
    // `storming` goes in so the dot field can fade itself out for the duration of the rain — the
    // two effects are never on screen together (windStormSync).
    windDotsTick(angle,storming);
  }
  $("scrub").value=appState.evIdx;
  renderLog();
  // end stats
  // PERF-02 (2026-08-02), resolved at the root. This test is a HEURISTIC — "we are at the event
  // frontier and nobody is playing" is inferred to mean the voyage ended. The welcome screen used to
  // satisfy it by accident: its decorative board carried one event at evIdx 0, so the frontier test
  // was trivially true and `live` was false because nobody was playing. showStats() therefore ran on
  // the WELCOME screen, firing celebrateHomeDocks() and leaving four SVG pastries dancing forever
  // behind the blur (60 layouts/sec; 11.1% CPU -> 4.2% once gone) and deleting Tortuga's four berths.
  //
  // Fixed first with an appState.decorative flag, then fixed PROPERLY by removing the cause: the
  // welcome screen no longer renders at all (see seedIdleGameState), so nothing can reach this
  // before a real game exists and the flag was deleted rather than left standing guard over an
  // impossibility. The heuristic itself is unchanged and still worth replacing with an explicit
  // game-over fact one day — but it is no longer reachable from a state that lies to it.
  if(appState.evIdx===appState.game.events.length-1&&(!appState.live||appState.liveDone))showStats();
  else $("statsWrap").style.display="none";
}
let logRenderedTo=-1;

// Exported accessor for beginGame() (still-classic, a later wave) to reset this cluster's log
// render cursor before a fresh game — see the file header's deviation note.
export function resetBoardLog(v){logRenderedTo=v;}

export function renderLog(){
  const box=$("log");
  const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<50;
  if(appState.evIdx===logRenderedTo+1){
    const prev=box.querySelector(".line.cur");if(prev)prev.classList.remove("cur");
    const L=appState.logLines[appState.evIdx];
    if(L){const d=document.createElement("div");d.className="line "+(L.cls||"")+" cur";d.innerHTML=L.txt;box.appendChild(d);}
  }else if(appState.evIdx!==logRenderedTo){
    let html="";
    for(let i=0;i<=appState.evIdx;i++){const L=appState.logLines[i];if(!L)continue;
      html+=`<div class="line ${L.cls||""} ${i===appState.evIdx?"cur":""}">${L.txt}</div>`;}
    box.innerHTML=html;
  }
  logRenderedTo=appState.evIdx;
  if(atBottom)box.scrollTop=box.scrollHeight;
}

/* ---------- action popups on the map ---------- */
// SVG's default transform-box is the whole viewport, so the popfloat keyframe's scale()
// would otherwise be anchored at the board's (0,0) corner instead of the emoji's own spot —
// every pop would rocket toward/away from that corner instead of rising in place. Pinning
// transform-origin to the emoji's own x,y (same fix as celebrateHomeDocks' dancingPastry).
export function popEmoji(x,y,emo,big,imgHref,cls){
  // callers only need to pass imgHref explicitly when they want art OTHER than the emoji's own
  // default (e.g. the tradewind pop's big board swirl, distinct from 🌀's usual pocket icon) —
  // otherwise this falls back to whatever's in EMOJI_IMG automatically.
  imgHref=imgHref||EMOJI_IMG[emo];
  // UI-02 (Wyatt, 2026-07-31): the two travel distances the popfloat keyframes use, derived from the
  // LIVE cell size rather than hardcoded px, so the icon's flight scales with the board instead of
  // being a fixed 32px that means different things on a phone and a desktop.
  //   --pop-rise  how far ABOVE this anchor the icon appears. The anchor (spawnPops' at()) already
  //               sits .42 of a cell above the ship, so .55 more puts the spawn point ~1 full square
  //               up — the square north of the boat, which is where he asked for it.
  //   --pop-sink  how far BELOW the anchor the hull is, so the icon lands IN the boat rather than
  //               stopping short above it. .42 is exactly the anchor's own offset, inverted.
  // The `.splash` variant does NOT read these — popsplash has its own choreography and is untouched.
  const g=el("g",{class:"pop"+(cls?" "+cls:""),
    style:`transform-origin:${x}px ${y}px;--pop-rise:${(cell*.55).toFixed(1)}px;--pop-sink:${(cell*.42).toFixed(1)}px`},$("board"));
  const size=cell*(big?.72:.55);
  if(imgHref){
    const im=el("image",{x:x-size*.43,y:y-size*.43,width:size*.86,height:size*.86,href:imgHref},g);
    // same fallback as iconAt(): if the art can't load, drop the <image> and show the emoji
    if(emo)im.addEventListener("error",()=>{im.remove();el("text",{x,y,"text-anchor":"middle","font-size":size},g).textContent=emo;});
  }else{
    el("text",{x,y,"text-anchor":"middle","font-size":size},g).textContent=emo;
  }
  // Must OUTLAST the CSS animation or the node is ripped out mid-flight — the CR-01 failure, where a
  // removal belt kept beating the animation it was supposed to follow. splash is 3.8s (popsplash),
  // popfloat is 2s since the burst retune; +100ms of margin each.
  setTimeout(()=>g.remove(),cls==="splash"?3900:2100);
}

// once the voyage is over, replace the Isle of Tortuga's 4 berths with dancing pastries —
// a little celebration flourish, purely cosmetic (doesn't touch game state)
export function celebrateHomeDocks(){
  const pastryImgs=[CROISSANT_IMG,CAKE_SLICE_IMG,DONUT_IMG,CUPCAKE_IMG];
  for(let i=0;i<4;i++){
    const rect=$("homeDock"+i);
    if(!rect)continue;
    const x=+rect.getAttribute("x")+(+rect.getAttribute("width"))/2;
    const y=+rect.getAttribute("y")+(+rect.getAttribute("height"))/2;
    rect.remove();
    const ty=y+cell*.14,size=cell*.7;
    // the dancing rotation is a CSS animation, which takes over the whole `transform` and would
    // clobber a plain SVG translate attribute on the same element — position via an outer group's
    // attribute (untouched by CSS) and rotate an inner group around its own fill-box center instead
    const outer=el("g",{transform:`translate(${x},${ty})`},$("board"));
    const inner=el("g",{class:"dancingPastry",style:"transform-box:fill-box;transform-origin:center"},outer);
    el("image",{x:-size/2,y:-size/2,width:size,height:size,href:pastryImgs[i%pastryImgs.length]},inner);
  }
}
// notes/edits EOV-05: a one-off burst of pastries + coins arcing up over the winner's ship to make
// the victory land as a real moment. Purely cosmetic (uses popEmoji, the same board-pop system
// every event already uses), so it touches no game state and is safe during replay/spectate.
export function victoryConfetti(winner){
  const st=appState.game.events[appState.game.events.length-1]&&appState.game.events[appState.game.events.length-1].state;
  const treats=[["🥐",CROISSANT_IMG],["🍰",CAKE_SLICE_IMG],["🍩",DONUT_IMG],["🧁",CUPCAKE_IMG],["🌕",COIN_IMG],["👑",CROWN_IMG]];
  let cx=null,cy=null;
  if(st&&st[winner]){const [x,y]=shipXY(st[winner].pos,winner,st,cell);cx=x;cy=y-cell*.42;}
  for(let k=0;k<18;k++){
    const [emo,img]=treats[k%treats.length];
    // scatter across the board (fall back to the winner's ship if we can't read a board width)
    const bx=cx!=null?cx+(Math.random()-0.5)*cell*7:cell*(1+Math.random()*8);
    const by=cy!=null?cy+(Math.random()-0.5)*cell*3:cell*(1+Math.random()*6);
    setTimeout(()=>popEmoji(bx,by,emo,Math.random()<0.5,img),k*70);
  }
}
export function showStats(){
  $("statsWrap").style.display="";
  // UI-07: collapse the narration/action box once the End of Voyage summary is up. By this point
  // the box can only be in one of two states, and neither should stay on screen underneath the
  // summary: EMPTY (EOV-01 removed the win announcement from it, and showNarration carries no timer
  // of its own, so nothing replaces the last line), or holding a now-stale final line. A large
  // empty panel between the board and the awards is the reported symptom.
  //
  // This does NOT contradict F6, Wyatt's "the blue box should never be empty" rule. F6 governs the
  // box DURING PLAY, where an empty box means a dropped message. The voyage is over; the box has no
  // further job, and the summary is the thing to look at.
  //
  // Safe to hide unconditionally: panel() sets display itself on any later call, so a new line
  // re-shows the box without needing anything undone here.
  const ap=$("actionPanel");
  if(ap){$("apGridInner").innerHTML="";ap.style.display="none";ap.classList.remove("needsAction");}
  celebrateHomeDocks();
  const w=appState.game.winner;
  // WYATT, 2026-07-31 — THIS REVERSES EOV-02 ON HIS INSTRUCTION. Read this before "restoring"
  // anything: EOV-02 moved the winner's recipe OUT of the End of Voyage summary and into a separate
  // one-off victory box rendered through flash(), specifically so the summary would not double it
  // up. He has now asked for the opposite, and for a reason that did not exist then — the blue box
  // is hidden at the end of the voyage (UI-07), so the victory box was the one thing keeping it on
  // screen. His words: "i want the golden victory box to say: 👑 {name} wins! {the recipe image} +
  // {name} baked a {recipe} and won Best Baker in the Caribbean!"
  //
  // So all three pieces live here now, in the gold banner, and endLive no longer flashes a victory
  // box at all — it plays "Drumroll..." in the blue box, fades it, and hides it. Nothing is
  // duplicated: this is the ONLY place the win is announced.
  //
  // The two sentences are his existing approved copy, moved rather than rewritten — the banner line
  // (@copy misc.board.eovbanner) and the victory line (formerly @copy adhoc.voyageend.victory in
  // src/orchestrator.js, which is why that id now lives on this file's site).
  // Two separate `const`s, each with its own @copy marker, because they are two separate approved
  // strings with two separate ids — the extractor binds one marker per assignment site, and folding
  // them into one template would make both ids point at the same site.
  // @copy misc.board.eovbanner
  const banner=w===null?say("end.nobodyBanner",{icon:iconImg(HOURGLASS_IMG)}):say("end.winsBanner",{icon:iconImg(CROWN_IMG),w:seat(w)});
  // The winner's recipe is read defensively, and that is NOT belt-and-braces — it is a guest-path
  // requirement. This code used to live in endLive() (src/orchestrator.js), which only ever runs on
  // the HOST after a real finished game, so a recipe was guaranteed. showStats() is different: the
  // guest reaches it through applyEndMeta(), which sets game.winner straight from Firebase meta and
  // renders. A guest whose local game has not drafted recipes — joined late, or an incomplete replay
  // — would hit `undefined.slice()` inside recipeInfo() and throw, taking the ENTIRE End of Voyage
  // screen down with it: no banner, no awards, no stats. Caught exactly that way in a browser.
  const winRecipe=w===null?null:(appState.game.players[w]||{}).recipe;
  // @copy adhoc.voyageend.victory
  const victoryLine=!winRecipe?"":`<div class="victoryText">${say("end.victory",{w:seat(w),article:(a=>a?a+" ":"")(recipeArticle(winRecipe)),recipe:winRecipeSpan(w)})}</div>`;
  const wi=winRecipe?recipeInfo(winRecipe):null;
  const victoryPic=wi&&wi.img?`<img class="victoryRecipe" src="${wi.img}" alt="">`:""; // art, not copy
  const luck=appState.game.players.map(player=>player.flips?(player.heads/player.flips):0);
  // notes/edits EOV-04: one keepsake per captain (see assignBadges) — emblem, pirate name + byline,
  // the captain (big, colored, no seat dot) filling the card above a rule, and the stat beneath it.
  const badges=assignBadges();
  const awards=badges.map(b=>`<div class="awardCard" style="border-color:${HEXCOL[b.seat]}">
      <img class="awardEmblem" src="${ASSET_BASE}badges/${b.def.img}.png" alt="">
      <div class="awardName">${b.def.name}</div>
      <div class="awardByline">${b.def.byline}</div>
      <div class="awardCaptain" style="color:${HEXCOL[b.seat]}">${pname(b.seat)}</div>
      <hr class="awardRule">
      <div class="awardStat">${b.def.stat}${b.value!=null?` — <b>${b.value}${b.def.unit||""}</b>`:""}</div>
    </div>`).join("");
  // NARR-01: the stats table is hoisted into its own local purely so the wording audit can review it
  // as one unit of copy (art-review/narration-audit.html, `// @copy` below). Pure string hoist — the
  // rendered HTML is byte-identical to the inline version it replaced.
  /* ITEM 7 (Wyatt, 2026-08-20 playtest): this row said "Bakery" and read `finishOrder.length`, which
     counts captains who FINISHED a bake (engine/index.js:2859 pushes only the `won` list). It was not
     miscounting — it was measuring something other than what the word promised. He watched three
     captains reach Tortuga and start their bakeries and read "one baker home" as simply wrong, which
     from where he sat it was.

     His ruling: count the captains who GOT HOME. A captain is home once they have reached Tortuga and
     fired the ovens — `baking` (engine/index.js:2774), which stays true for anyone still baking when
     the voyage ends — or `done`, set when their bake completed. `done` is not implied by `baking`:
     :2859 clears `baking` as it sets `done`, so BOTH terms are needed and neither is redundant.

     This is a NEW quantity. `finishOrder` is untouched and still means what it always meant — it
     orders the finishers and other code depends on that. Do not repoint it at this. */
  const bakersHome = appState.game.players.filter(player => player.baking || player.done).length;
  // @copy misc.board.statsheadings
  const statsTable=`<table>
    <tr><td>${say("stats.days",{})}</td><td>${appState.game.round}</td></tr>
    <tr><td>${say("stats.battles",{})}</td><td>${say("stats.battlesValue",{n:appState.game.battles,pct:appState.game.battles?Math.round(100*appState.game.attWins/appState.game.battles):0})}</td></tr>
    <tr><td>${say("stats.trades",{})}</td><td>${appState.game.trades}</td></tr>
    <tr><td>${say("stats.bakeries",{})}</td><td>${say(bakersHome===0?"stats.noneHome":bakersHome===1?"stats.oneHome":"stats.manyHome",{n:bakersHome})}</td></tr>
    ${appState.game.players.map((player,i)=>`<tr><td style="color:${HEXCOL[i]}">${emojify(say("stats.heads",{name:pname(i)}))}</td><td>${say("stats.headsValue",{pct:player.flips?Math.round(100*luck[i]):0,n:player.flips})}</td></tr>`).join("")}
    </table>`;
  $("statsPanel").innerHTML=`<div class="winner-banner">${banner}${victoryPic}${victoryLine}</div>
    <div class="awardsRow">${awards}</div>
    ${statsTable}`;
  renderWindSummary();
  endCardArrives($("statsPanel"),w);
}
/* ⭐ THE END CARD ARRIVES — three ideas PASSED on his game feel audit (2026-09-13), as proposed: "Each award card flips in one
   after another ..., instead of the list simply being there"; "Numbers roll up from zero ..."; and "One burst in the winner's
   captain colour behind the pastry." (The whoosh and the ticking are sounds, and come with the sound page.)
   ONCE A VOYAGE, ON EACH SCREEN. render() calls showStats() whenever the log sits at its end, so the same finished voyage can
   be written more than once; the mark lives on the Game object it describes (as __idle does), so a new voyage starts unmarked
   and a repaint of the same one never deals the cards twice. A repaint mid-arrival just writes the card at rest: every number
   is final in the HTML, and the roll only rewrites what is on screen on its way there. */
export const DEAL_MS=440, DEAL_GAP_MS=150, DEAL_START_MS=220, COUNT_MS=900, END_CONFETTI=26;
function endCardArrives(panel,w){
  const g=appState.game;
  if(!panel||!g||g.__endArrived)return;
  g.__endArrived=true;
  if(fxReduced())return;
  const cards=[...panel.querySelectorAll(".awardCard")];
  cards.forEach((c,k)=>{
    const a=c.animate([
      {opacity:0,transform:"perspective(700px) translateY(18px) rotateY(85deg)"},
      {opacity:1,transform:"perspective(700px) translateY(0) rotateY(-10deg)",offset:.7},
      {opacity:1,transform:"perspective(700px) rotateY(0deg)"}],
      {duration:DEAL_MS,delay:DEAL_START_MS+k*DEAL_GAP_MS,easing:"cubic-bezier(.2,.7,.3,1)",fill:"backwards",id:"end-deal"});
    // his pick, 2026-09-14: a soft whoosh as each card deals in — from the moment its animation starts, then its own delay
    a.ready.then(()=>setTimeout(()=>{ if(c.isConnected&&a.playState!=="idle")playAwardWhoosh(); },DEAL_START_MS+k*DEAL_GAP_MS)).catch(()=>{});
  });
  // the numbers roll up as the last card lands: every run of digits in the stats column and in each award's value
  const texts=[];
  const collect=node=>{for(const c of node.childNodes){if(c.nodeType===3){if(/\d/.test(c.nodeValue))texts.push([c,c.nodeValue]);}else collect(c);}};
  for(const el of panel.querySelectorAll("table td:nth-child(2), .awardStat b"))collect(el);
  if(texts.length){
    // the stats tick as they roll — his pick, 2026-09-14: "The coin tick", the same abacus click as a coin count, once per visible change
    const roll=t=>{let sum=0;for(const [n,full] of texts)if(n.isConnected)n.nodeValue=full.replace(/\d+/g,d=>{const v=Math.ceil(Number(d)*t);sum+=v;return String(v);});return sum;};
    let shown=roll(0);
    const start=performance.now()+DEAL_START_MS+Math.max(0,cards.length-1)*DEAL_GAP_MS;
    const step=now=>{
      if(!texts.some(([n])=>n.isConnected))return;
      const u=Math.min(1,Math.max(0,(now-start)/COUNT_MS));
      const sum=roll(1-Math.pow(1-u,3));
      if(sum!==shown){shown=sum;playCoinTick();}
      if(u<1)requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const banner=panel.querySelector(".winner-banner"),pastry=banner&&banner.querySelector(".victoryRecipe");
  if(w==null||!pastry)return;
  const col=HEXCOL[w]||"#f5a623",colours=[col,`color-mix(in srgb, ${col} 55%, white)`,"#ffe6a0"];
  setTimeout(()=>{                                             // as the pastry lands (its victoryPop settles at .55s)
    if(!pastry.isConnected)return;
    const b=banner.getBoundingClientRect(),r=pastry.getBoundingClientRect();
    const cx=r.left+r.width/2-b.left,cy=r.top+r.height/2-b.top;
    for(let k=0;k<END_CONFETTI;k++){
      const d=document.createElement("div"),wd=6+(k*7)%4,ht=wd*.5;
      d.className="endConfetti";d.style.background=colours[k%colours.length];
      Object.assign(d.style,{left:(cx-wd/2)+"px",top:(cy-ht/2)+"px",width:wd+"px",height:ht+"px"});
      banner.appendChild(d);
      const ang=(k/END_CONFETTI)*Math.PI*2+((k*53)%10)/10,pow=Math.max(60,r.width*(.55+((k*31)%7)/12));
      const ux=Math.cos(ang)*pow,uy=Math.sin(ang)*pow*.75,spin=((k*97)%360)-180;
      const a=d.animate([{translate:"0px 0px",rotate:"0deg",opacity:0},
        {translate:`${(ux*.2).toFixed(1)}px ${(uy*.2).toFixed(1)}px`,opacity:1,offset:.08},
        {translate:`${ux.toFixed(1)}px ${uy.toFixed(1)}px`,rotate:`${spin}deg`,opacity:1,offset:.45},
        {translate:`${(ux*1.15).toFixed(1)}px ${(uy+Math.max(40,r.height*.6)).toFixed(1)}px`,rotate:`${spin*2}deg`,opacity:0}],
        {duration:1700+((k*41)%500),easing:"cubic-bezier(.2,.6,.4,1)",fill:"both",id:"end-confetti"});
      a.onfinish=a.oncancel=()=>d.remove();
    }
  },300);
}

// LOAD-03 final (2026-08-02). This used to be renderDecorativeBoard(): it built a bot-vs-bot game
// AND drew it behind the welcome modal, so new players glimpsed a board before choosing.
//
// THE DRAWING IS GONE, AND THE NAME NOW SAYS WHAT IS LEFT. Two separate jobs were tangled here:
//
//   1. Draw a backdrop — OBSOLETE. The welcome screen sits on a static blurred still now
//      (#welcomeBackdrop), and #game is display:none behind it, so every element this drew was
//      built, laid out and composited for something nobody could see. beginGame() calls
//      drawBoard()/buildPlayerRows() itself, so a real game never depended on this having run.
//
//   2. Put a Game on appState — LOAD-BEARING, and the real reason this could not simply be
//      deleted. `appState.game` is read 269 times across src/ and only 52 of those are guarded, so
//      "a game always exists" is a global invariant of this codebase. This function is what holds
//      it up before anyone has chosen a mode. That is a seam worth naming rather than a decoration.
//
// Deleting job 1 also removed the need for the `appState.decorative` flag added earlier the same
// day: the ONLY render() that could fire before a real game began was the one this function used to
// call, and render()'s end-of-voyage test could therefore never misfire on the welcome screen
// again. The flag went with it rather than being left as a guard against something now impossible.
//
// If the 269 unguarded reads are ever made honest, this whole function can go. Until then it is the
// cheapest possible way to keep the invariant true — one object, no DOM.
export function seedIdleGameState(){
  try{
    const strategies=["pirate","trader","balanced","rusher"];
    appState.game=new Game(roundCfg(strategies),Math.floor(Math.random()*1e9),true);
    /* WYATT, 2026-09-06: "after refreshing the page, the boats temporarily reset to tortuga
       instead of showing up at their correct positions. the moment your boat moves, all boats go
       to their correct spots."

       THIS OBJECT IS WHAT HE WAS LOOKING AT. It is a throwaway placeholder — four bots, a random
       seed, every ship on its start square — seeded only to hold up the "appState.game always
       exists" invariant. The comment at its call site says "draws nothing", and that WAS true when
       it was written. It is not true on the resume path: src/orchestrator.js calls showGameView()
       three lines BEFORE beginGame() replaces this object, because the "⚓ Reconnecting to yer
       voyage…" message needs the board visible to sit on. So the board's first paint after any
       refresh comes from here — hence four boats stacked on Tortuga and every coin reading "–",
       until the first real update lands.

       THE FLAG LIVES ON THE OBJECT IT DESCRIBES, which is the whole point: beginGame() assigns a
       brand-new Game over the top, so the mark disappears with the thing it marked. There is no
       teardown anyone can forget and no second place that has to agree (rule: what makes these two
       agree? — nothing has to). */
    appState.game.__idle=true;
    appState.roster=strategies.map(s=>({bot:true,strat:s}));
    appState.mySeat=null;
  }catch(err){console.error("idle game state failed to seed",err);}
}

// Board size is driven purely by available HEIGHT (board+footer always fit the viewport, floored
// at 600px) — width never shrinks it. The sidebar then just takes whatever width is left over
// next to that board, up to a sane cap so it doesn't stretch absurdly on ultrawide monitors. Once
// that leftover width can no longer fit a full row of 5 ingredient chips, we drop to the stacked
// (narrow) layout — board full-width on its own row, sidebar full-width below it — instead of
// squeezing the sidebar further and wrapping ingredients onto a second line.
const MIN_SIDEBAR_W=380,MAX_SIDEBAR_W=560;
// MUTE-01 (Wyatt, 2026-08-02), his rule verbatim: "if there is room ON THE SAME LINE as the turn
// clock, put it there. if not, move it down."
//
// So it is MEASURED. Two earlier attempts substituted a proxy for that question and both were wrong
// in ways he had to catch on screen: the sidebar-layout class (which answers "does the sidebar fit
// ingredient chips") and then a 460px threshold derived from a stale measurement, which pushed the
// button down at 391px where 11px of room was plainly visible. The contents of this row all clamp
// with their container, so no fixed number can track them — only asking the layout can.
//
// The gap is counted, which was his question: `free` is what remains after the other children AND
// the gaps between them, and the button needs its own width PLUS one more gap. The row's standard
// spacing is therefore never squeezed to make something fit.
//
// It MOVES the button between two parents rather than restyling one in place, because his two
// placements want genuinely different boxes — a flex child sitting snug after the clock and
// bottom-aligned with it, or a grid item under the captains box. No CSS can relocate an element
// across containers, and duplicating it would mean keeping two buttons' state in step.
export function placeMuteButton(){
  const row=$("controlsRow"), slot=$("muteSlot"), btn=$("btnMute");   // the clock/pause panel is gone (A-10); the flip plank is the row's remaining tenant
  if(!row||!slot||!btn)return;
  /* ON THE STAGE THERE IS ONLY ONE HOME, AND THE MEASUREMENT BELOW WAS SENDING THE BUTTON TO THE
     OTHER ONE. Wyatt, 2026-08-20: "the host has no mute button (guest does)."

     MEASURED, in a solo /4 game — so this was never a host/guest question at all:
         #btnMute      parent #controlsRow   rect 0x0   hidden by #controlsRow
         #controlsRow  parent #pp4Cap        display:none
         #muteSlot     parent #footerRow     (the ☰ menu — visible when the menu is open)
     enterStage() parks #controlsRow inside #pp4Cap and index.html's `body.pp4Stage #controlsRow`
     hides it outright ("the coin + clock left the sheet"), while #muteSlot is moved into the ☰
     menu on purpose — playtest 10 item 2, "the sound toggle was orphaned at the top-left of the
     stage… it lives in the ☰ menu now". So on the stage the row is not a smaller home for the
     button, it is a CLOSED one, and the fit test below was a coin toss between the menu and
     oblivion.

     That coin toss is also why it looked like a parity bug. The test reads live widths during
     layout, so two clients answering it a frame apart answer it differently — the guest kept its
     button in the menu and the host lost its own. Nothing about hosting was involved.

     The fit measurement is still exactly right for the classic layout, where #controlsRow is a real
     visible row; it is only meaningless once the stage has taken it away. */
  if(document.body.classList.contains("pp4Stage")){
    if(btn.parentNode!==slot)slot.appendChild(btn);
    return;
  }
  const gap=parseFloat(getComputedStyle(row).gap)||0;
  // Measure with the button OUT of the row, so its own width never counts toward "used".
  const used=[...row.children]
    .filter(el=>el!==btn&&getComputedStyle(el).display!=="none")
    .reduce((sum,el,i)=>sum+el.getBoundingClientRect().width+(i?gap:0),0);
  // The button is the same width in either home — #muteSlot mirrors the row's box and is its own
  // inline-size container, so the cqw its styling uses resolves to the same basis. Without that this
  // test would depend on where the button already was, and oscillate.
  const need=btn.getBoundingClientRect().width+gap;
  const fits=(row.getBoundingClientRect().width-used)>=need;
  const wantRow=fits?row:slot;
  if(btn.parentNode===wantRow)return; // no DOM write unless the answer actually changed
  if(fits)row.appendChild(btn);   // (it used to slot in after the clock panel — gone at A-10)
  else slot.appendChild(btn);
}
let muteRO=null;
export function watchMutePlacement(){
  const row=$("controlsRow");
  if(!row||muteRO||typeof ResizeObserver==="undefined"){placeMuteButton();return;}
  // ResizeObserver fires only on real size changes, so this costs nothing while the game sits
  // still, unlike re-measuring on the 500ms tick. (It also observed the clock panel until A-10.)
  muteRO=new ResizeObserver(()=>placeMuteButton());
  muteRO.observe(row);   // (the clock panel it also observed is gone — A-10)
  placeMuteButton();
}
export function syncBoardSizing(){
  const root=document.documentElement;
  const footerH=($("footerRow")||{}).offsetHeight||0;
  const chromeH=28+14+footerH; // #game top/bottom padding + layout gap + footer height
  const boardSize=Math.max(600,vhPx()-chromeH);
  const availW=vwPx()-28; // #game's own left+right padding (LAYOUT viewport — see vwPx in util.js)
  const remaining=availW-boardSize-14; // width left for the sidebar after the board + the column gap
  const wide=remaining>=MIN_SIDEBAR_W;
  $("game").classList.toggle("layoutWide",wide);
  if(wide){
    root.style.setProperty("--boardW",boardSize+"px");
    root.style.setProperty("--sideW",Math.min(remaining,MAX_SIDEBAR_W)+"px");
  }else{
    // stacked layout: the flippenator/timer row and the narration box also sit below the board
    // in this single column, so the board must leave room for THEM too, not just the footer —
    // otherwise it claims nearly the full viewport height on its own and pushes the narration
    // box (sometimes even the flippenator) below the fold. This runs at the moment the game view
    // first appears, before #actionPanel has any narration in it (offsetHeight would read 0), so
    // budget off an assumed typical height for the common (short-message) case — #actionPanel
    // has no CSS height cap, so a long narration/battle/recipe-draft message can still grow past
    // this budget; the page itself simply scrolls at that point instead of the panel internally.
    const gap=14; // matches #layout's grid gap, repeated between every stacked row
    const actionMaxH=180;
    const controlsH=($("controlsRow")||{}).offsetHeight||0;
    const narrowBudget=vhPx()-28-gap*2-controlsH-actionMaxH;
    const narrowBoardSize=Math.max(280,Math.min(narrowBudget,availW));
    root.style.setProperty("--boardW",narrowBoardSize+"px");
    root.style.removeProperty("--sideW");
  }
  // MUTE-01: --boardW just changed, which is the width #controlsRow and #muteSlot both cap to, so
  // re-ask whether the button still fits beside the clock. The ResizeObserver covers everything
  // else; this covers the case where the row's own max-width moved under it.
  placeMuteButton();
}

/* ================= D-49: EVERY COIN FLIP TAKES THE SAME 1.5 SECONDS =================
   Wyatt, 2026-08-21: "the coin flips take varying lengths of time; figure out why this is." Two
   causes, both real, and neither of them a number anyone had looked at:

   1. THE TWO CODE PATHS DISAGREED BY DESIGN. The dock flip (flow.js humanFlip) slept 340ms
      between the spin and the result; a battle flip (orchestrator.js) slept
      `clamp(260, 650, stepDelay()*0.7)`, and stepDelay() is a flat 3000, so it slept 650. Nearly
      twice as long, in the same voyage, for the same coin.
   2. THE CLOCK STARTED IN THE WRONG PLACE. `.coin.spin` is `animation:coinspin .34s linear
      infinite` — an INFINITE spin whose length is decided entirely by when the result arrives.
      Since the playtest-22 fix the coin starts spinning ON THE TAP, inside setFlipActive's
      callback, and only then does the promise resolve, ask() return and humanFlip resume to run
      its sleep. So what a player watched was scheduling latency PLUS 340ms — and this build's own
      comment beside that line already admits it "has been caught losing whole timers to" exactly
      that latency. No two flips were alike because no two resumptions were.

   THE CLOCK IS STAMPED WHERE THE SPIN IS PAINTED, which is here — `setFlipCoin("spin")` is the one
   spelling of a spinning coin in the whole game, reached by the dock tap, by broadcastFlip, and by
   a guest's Firebase listener alike. Every caller then waits the REMAINDER of FLIP_SPIN_MS, so the
   length on screen is the same however slow the chain that got there was.

   ONE CLOCK, THREE WAITS, and the split is deliberate: this module owns WHEN the spin began and
   HOW LONG a flip lasts; each call site owns HOW it waits, through its own `sleep`, which is what
   keeps fast-forward, pause and reload-replay behaving exactly as they did. A raw setTimeout here
   would have made a skipped battle crawl and a replay stall.

   THIS IS A NUMBER WYATT CHOSE, and "nothing is a constant" does not reach it: that rule is about
   quantities that shift with game state, and the whole point of this one is that it must NOT
   shift. It is the fault, stated as a value. 1500 -> 1000 is his own correction, playtest
   2026-08-23c item 18: "it should be 1 second, not 1.5 seconds (this last part is my mistake —
   1.5 feels too long)". */
/* T-35 (Wyatt, 2026-08-26): "the coin flip should be the exact length of the audio file, so that
   the coin ALWAYS lands when the coin in the audio file lands -- it's the final 'blip' in the file
   which you should be able to notice, but if not i can try to time it myself and give you time
   code."  He does not need to time it. MEASURED 2026-08-26 from sfx/coin-flip.mp3 itself, decoded
   to PCM and read as a 10ms peak envelope:

       file duration                    965ms
       transient 1 (the toss)             0ms
       transient 2 (THE LANDING BLIP)   790-800ms, peaking at 795ms
       after that                       ~165ms of decay tail, nothing struck

   So at 1000ms the coin was landing on screen about 205ms AFTER the sound of it landing — which is
   exactly the mismatch he suspected without being able to name it. 795 is the blip, so 795 is the
   flip.

   NOT THE FILE'S 965ms LENGTH, and the distinction is his own sentence: he asks for the coin to
   land "when the coin in the audio file lands", and what follows the blip is decay, not an event.
   Matching the file length would have re-created the same lateness, 30ms smaller.

   WHY A MEASURED CONSTANT RATHER THAN A DERIVED ONE (rule 9 asks, and it deserves an answer): the
   blip's position is a property of the ASSET, not of game state — it does not shift across a
   voyage, which is what rule 9 is about. Deriving it at runtime would mean decoding the file on
   every boot to find a number that only changes when somebody re-exports the sound. IF THAT SOUND
   IS EVER RE-EXPORTED, RE-MEASURE THIS. That is the one thing that invalidates it.

   HISTORY, kept: 1500 -> 1000 was his own correction (playtest 2026-08-23c item 18, "it should be
   1 second, not 1.5 seconds -- this last part is my mistake"). 1000 -> 795 is this measurement. If
   795 reads as hurried on his screen, the honest fix is a different sound, not a coin that lands
   after its own noise. */
export const FLIP_SPIN_MS = 795;
/* HOW LONG A LANDED COIN STAYS ON ITS FACE — the flip's second beat, and until now it had three
   different answers. T-34 (Wyatt, 2026-08-26): "I'm not convinced these are consistent. write a
   unit test to do each one." He passed the item and doubted it anyway, and he was right: the SPIN
   was converged onto FLIP_SPIN_MS on 2026-08-23, the HOLD never was. Measured across the four
   paths:
       battle, human (hFlip)        sleep(800)
       battle, bot   (bFlip)        sleep(800)
       dock,  human  (humanFlip)    however long the narration's own hold runs
       dock,  bot    (botDockCoin)  NOTHING — the face was set and the function returned
   So a bot's dock coin landed and vanished while every other flip held, which is exactly the
   "bots' dock coins spin and land like yers" claim being almost true.

   800 is HIS number, playtest 13: "hold the finished coin heads/tails for longer — .8 seconds
   maybe". It is named here so the four paths cannot drift again, and so a gate can read it.
   The human dock flip keeps its narration hold rather than adding this on top: flash() floors a
   message's hold at 1000ms, which already exceeds this, and stacking them would make one flip
   longer than the rest to fix an inconsistency. */
export const FLIP_LAND_HOLD_MS = 800;
let flipSpinAt = 0;
/* How much of the spin is left, from the frame it was painted. Zero if no spin is running, so a
   caller that reaches it out of order waits nothing rather than a phantom full spin. */
export function flipSpinLeftMs(){
  if (!flipSpinAt) return 0;
  return Math.max(0, Math.round(FLIP_SPIN_MS - (performance.now() - flipSpinAt)));
}

// ---- the flippenator: one always-visible coin+button; every flip in the game plays here ----
// The flippenator coin doubles as its own button — no separate FLIP button — so this sets
// the coin's own class/text directly instead of using coinHTML() (which stays for the
// battle scoreboard's per-fighter result circles, a separate use of the same .coin styles).
export function setFlipCoin(state){
  const el=$("flipCoinWrap");if(!el)return;
  // see ceremonyHoldsTheCoin() below — only a BLANKING is deferred, never a face and never a spin
  if(state==="wait"&&ceremonyHoldsTheCoin())return;
  // IDEMPOTENT for "spin", because the tap now paints it and broadcastFlip repaints it a beat
  // later (setFlipActive below) — re-entering the state ye are already in must not re-play the
  // sound, or every flip is heard twice.
  const wasSpin=el.classList.contains("spin");
  /* THE SPIN SOUND STOPS HERE, ON THE ONE LINE THAT ENDS EVERY SPIN. Every state change clears the
     classes through this line — a landed face, a re-arm, a disarm, a cancelled prompt — so stopping
     the loop here means it cannot outlive the picture by ANY route, including ones nobody has
     written yet. Placing it in the "H"/"T" branches instead would have covered the two exits I
     happened to think of. (Wyatt, 2026-09-06: the flip "kept flipping longer than the sound file
     lasted" — the fix is the sound following the coin, and this is the half that makes it stop.) */
  stopFlipSpinSound();
  el.classList.remove("heads","tails","spin","wait","active");el.onclick=null;el.style.backgroundImage="";
  if(state==="H"){el.classList.add("heads");el.style.backgroundImage=`url(${FLIP_HEADS_IMG})`;el.textContent="";}
  else if(state==="T"){el.classList.add("tails");el.style.backgroundImage=`url(${FLIP_TAILS_IMG})`;el.textContent="";}
  // D-49: the flip's clock starts on the frame the spin is PAINTED, and only on the frame it
  // actually starts — the `wasSpin` guard that already stops the sound doubling is the same
  // guard that stops broadcastFlip's repaint a beat later restarting the timer under the tap.
  else if(state==="spin"){el.classList.add("spin");el.style.backgroundImage=`url(${COIN_SPIN_IMG})`;el.textContent="";if(!wasSpin){flipSpinAt=performance.now();startFlipSpinSound();}}
  else{el.classList.add("wait");el.textContent="";}
}
/* ⭐ THE VEIL TAKES THE FACE AWAY, NOTHING ELSE DOES — Wyatt, 2026-09-08: "the coin result is
   removed from the flippenator before the stage is removed, making it look like a coin just
   disappeared", and then his ruling on the fix: "just don't clear the coin's face at all — let the
   veil coming down clear it."

   IT WAS TWO CLOCKS DISAGREEING, and the arithmetic is the whole bug:
     the battle flow holds the landed face  FLIP_LAND_HOLD_MS = 800ms, then calls broadcastFlip("wait")
     the ceremony holds the veil up         CER_REVEAL_MS    = 1100ms, then tears down
   So for 300ms the stage stood there with a blank coin on it. Shortening the veil would have fixed
   the symptom and left two clocks to drift; his answer removes one of them instead.

   SO WHILE A CEREMONY IS STANDING, A CLEAR IS THE CEREMONY'S TO MAKE. cerTeardown() does it as the
   veil leaves, so the face is on screen for every frame the stage is. A landed face is NOT
   suppressed here — only the blanking — so nothing can hide a result. And the wire write in
   broadcastFlip() is untouched: a guest with no veil of its own still resets normally. */
function ceremonyHoldsTheCoin(){
  return typeof document !== "undefined" && document.body && document.body.classList.contains("pp4Cer");
}
export function setFlipActive(onClick){
  const el=$("flipCoinWrap");if(!el)return;
  if(window.__pp4)window.__pp4.flip(el,onClick);   // /4 stage: the flip ceremony rides the same arming
  // notes/edits #6: show the heads face behind "FLIP" (was a flat gradient, no coin art) — a
  // tint layer on top keeps the text legible over the image.
  // notes/edits UI-09: drop the heavy orange tint over the whole coin — show the clean heads face
  // and make just the word "FLIP" orange instead (see #flipCoinWrap.active CSS).
  if(onClick){el.classList.add("active");el.style.backgroundImage=`url(${FLIP_HEADS_IMG})`;el.textContent=say("flip.word",{});el.onclick=onClick;}
  // A PLAIN DISARM CLEARS THE WORD TOO. Every other coin state sets textContent; this one did not,
  // so a disarmed coin kept the caption "FLIP" over a blank chip (playtest 22). The coin that has
  // just been TAPPED goes straight to the spin instead — see localAsk, which owns that distinction:
  // this function is called to disarm on every ordinary prompt as well, where a spin would be a lie.
  /* …BUT NEVER A FACE THE FLIP STAGE IS STILL SHOWING — Wyatt's screen recording, 2026-09-14: "When the coin in the flip stage
     lands, it makes the coin disappear before the stage itself disappears, leaving an empty flippenator again." Frame by frame:
     TAILS landed at 2.2s, and at 3.07s the NEXT question ("Buy a crate?") disarmed the coin through this line, blanking it 330ms
     before the stage came down — the one route ceremonyHoldsTheCoin() never covered. A coin that was not armed has nothing to
     disarm, and while the stage stands its face is the stage's to clear (cerTeardown). A real tap disarms an ARMED coin, and
     that still clears it for the spin. */
  else{const wasArmed=el.classList.contains("active");el.classList.remove("active");el.onclick=null;
    if(!(ceremonyHoldsTheCoin()&&!wasArmed)){el.style.backgroundImage="";el.textContent="";}}
}
