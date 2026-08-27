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
  iconImg, iname, ingImg,
  devHost,
} from "../shared/index.js";
import {
  dockOrient, tracePolygonLoops, roundedPathFromLoop, islandArtPlacement, shipXY, pulseEl,
  // describeFor + NEUTRAL_VIEWER dropped with LOAD-03's last step: their only use here was seeding
  // the decorative board's demo log line, and that board no longer renders. Dead imports are
  // forbidden in this codebase (D-33/D-34/D-40) and no gate catches them, so they go with the code
  // that used them rather than being left behind as plausible-looking dependencies.
  assignBadges, pname, pn, buildPlayerRows, applyCaptainOrder, SHIP_GLIDE_MS, vwPx, vhPx,
} from "./util.js";
import { recipeTitle, recipeInfo, winRecipeSpan, recipeArticle } from "./recipe.js";
import { playFlip } from "./audio.js";

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
export function drawBoard(){
  const svg=$("board");svg.innerHTML="";
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
      el("image",{x:0,y:0,width:placement.w,height:placement.h,"preserveAspectRatio":"none",href:placement.href},artG);
    }
    // dock is drawn before the crate icons below so it always sits underneath them — it
    // stretches to the shared edge with the island and would otherwise occlude a crate there
    if(appState.game.cfg.singleDock){
      const d=appState.game.dockOf[ing];
      const adj=Object.values(DIRS).find(dd=>appState.game.islands[[d[0]+dd[0],d[1]+dd[1]]]===ing);
      // faces the island, and centered on the shared edge between the dock cell and the island
      // so it visually stretches to meet it rather than sitting centered in open water
      const{rot:dockRotDeg,flip:dockFlip}=adj?dockOrient(adj):{rot:0,flip:false};
      const px=adj?(d[0]+.5+adj[0]*.5)*cell:(d[0]+.5)*cell;
      const py=adj?(d[1]+.5+adj[1]*.5)*cell:(d[1]+.5)*cell;
      iconAt(svg,px,py,cell,DOCK_IMG,dockRotDeg,dockFlip);
    }
    // one big icon per remaining crate, one per island square — a taken crate turns fully
    // grey in place rather than shrinking to a count badge, so the whole island reads at a glance
    if(appState.game.cfg.crates<1e9){
      cells.slice(0,appState.game.cfg.crates).forEach((c,idx)=>{
        const scx=(c[0]+.5)*cell,scy=(c[1]+.5)*cell;
        const g=iconAt(svg,scx,scy,cell*.8,ING_IMG[ing]);
        g.id=`crate_${ing}_${idx}`;
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
        const f=el("text",{x:(fd[0]+.5)*cell,y:(fd[1]+.42)*cell,"text-anchor":"middle",
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
  forecastLabel.textContent="FORECAST:";
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
  appState.game.players.forEach((p,i)=>{
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
  appState.game.players.forEach((p,i)=>{
    const [x,y]=shipXY(p.pos,i,appState.game.players,cell);
    shipEls[i].style.transform=`translate(${x}px,${y}px)`;
  });
}
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
  if(!windBuilt){
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
export function renderLiveShips(){
  if(appState.replaying)return;      // reload-replay rebuilds state silently — same guard liveRender() uses
  if(!shipEls.length)return;         // board not built yet
  const live=appState.game.players;  // shipXY() only reads .pos off each entry
  live.forEach((p,i)=>{
    const [x,y]=shipXY(p.pos,i,live,cell);
    shipEls[i].style.transform=`translate(${x}px,${y}px)`;
    // A CAPTAIN AT THE OVENS FADES OUT (Wyatt, 2026-08-08: "in a past version, the boat faded
    // semitransparent when docked. I removed that feature in v2, but now i want it back because we
    // have the bake-off"). It is not decoration: Game.inPlay() has genuinely taken them off the
    // board — no storm moves them, nobody can reach, trade with or raid them, and their square is
    // free — so the boat being half-there is the honest picture of the rule. Anything still solid
    // on this board can be interacted with; anything faded cannot.
    // opacity only (PERF-01), and written unconditionally because it is one property on four nodes.
    shipEls[i].style.opacity=p.baking?0.42:1;
    if(chatBubbles[i])positionChatBubble(i,x,y); // keep an active chat bubble riding along with its boat
  });
  // the active-turn ripple has to travel with the ship it's ringing, or it's left behind mid-push.
  // G14: the whose-turn-is-it scan now lives in activeTurnSeat() below, shared with paintShipAt().
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
function activeTurnSeat(){
  for(let i=appState.evIdx;i>=0&&i>appState.evIdx-80;i--){
    const t=appState.game.events[i].t;
    if(t==="turn")return appState.game.events[i].p;
    if(t==="newround")break;
  }
  return null;
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
export function showSeatCoins(seat,coins){
  const el=$("coins"+seat);
  if(!el)return;
  if(el.dataset.coins!==undefined&&+el.dataset.coins!==coins)pulseEl(el);
  el.dataset.coins=coins;
  el.innerHTML=`${iconImg(COIN_IMG)} ${coins}`;
}
export function render(){
  const e=appState.game.events[appState.evIdx];if(!e)return;
  const st=e.state;
  // recipes are secret: only the local human's own recipe target is revealed.
  // in a spectator-only game (no human seat, e.g. a bot-vs-bot design test) everything stays visible.
  const humanIdxs=appState.game.players.map((p,i)=>p.strategy==="human"?i:-1).filter(i=>i>=0);
  const youIdx=humanIdxs.length===1?humanIdxs[0]:-1;
  const spectator=humanIdxs.length===0;
  appState.game.players.forEach((p,i)=>{
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
    const canReveal=spectator||(i===appState.mySeat&&(!appState.passAndPlay||appState.recipeRevealed));
    const offerCheckBtn=appState.passAndPlay&&i===appState.mySeat&&i===appState.activeTurnSeat&&!appState.recipeRevealed;
    if(canReveal){
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
      const extras=hold.map(x2=>`<span class="chip extra" title="surplus cargo: ${iname(x2)}">${ingImg(x2)}</span>`);
      // @copy misc.board.prowcargorow
      newChipsHtml=chips.join("")+(extras.length?`<span style="opacity:.4">·</span>`:"")+extras.join("");
    }else if(offerCheckBtn){
      $("prowRecipe"+i).classList.remove("hasRecipe");
      // @copy misc.board.checkrecipebtn
      newChipsHtml=`<button type="button" class="checkRecipeBtn" onclick="revealMyRecipe()" style="background:${HEXCOL[i]};color:#fff;border-color:${HEXCOL[i]}">🔍 Check my recipe</button>`;
    }else{
      // other captains' recipe maps are private — only the crates visibly aboard their ship are shown.
      // sorted so duplicate ingredients sit next to each other — easier to spot a tradeable double
      $("prowRecipe"+i).classList.remove("hasRecipe");
      const held=hold.slice().sort().map(x2=>`<span class="chip have" title="${iname(x2)}">${ingImg(x2)}</span>`);
      // @copy misc.board.emptyhold
      newChipsHtml=held.join("")||`<span style="opacity:.4">empty hold</span>`;
    }
    /* T-33 — the guard decided whether to PULSE, not whether to WRITE, so all four captains' hold
       chips were destroyed and rebuilt on every render: 600 fresh <img> elements in 210 seconds,
       each one a cold fetch. Moving the assignment inside the comparison keeps the pulse behaviour
       byte-identical and stops the churn. */
    if(chipsEl.innerHTML!==newChipsHtml){
      if(chipsEl.innerHTML)pulseEl(chipsEl);
      chipsEl.innerHTML=newChipsHtml;
    }
    const lastEv=appState.game.events[appState.game.events.length-1];
    $("crown"+i).innerHTML=(lastEv.t==="end"&&lastEv.winner===i&&appState.evIdx===appState.game.events.length-1)?iconImg(CROWN_IMG):"";
  });
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
  let active=null;
  for(let i=appState.evIdx;i>=0&&i>appState.evIdx-80;i--){
    const t=appState.game.events[i].t;
    if(t==="turn"||t==="ovens"||t==="bake"){active=appState.game.events[i].p;break;}
    if(t==="newround")break;
  }
  if(active!=null&&st[active].done)active=null;
  if(activeRing){
    if(active!=null){
      const [ax,ay]=shipXY(st[active].pos,active,st,cell);
      ringTo(active,ax,ay);
      // PERF-01: a style, not an attribute — `opacity` is presentational-attribute-only on SVG.
      activeRing.style.opacity=1;
    }else activeRing.style.opacity=0;
  }
  appState.game.players.forEach((p,i)=>{
    const row=$("prow"+i);if(row)row.classList.toggle("activeTurn",i===active);
  });
  // Pass & Play only: float the captain whose turn it is to the top of the box, rest in sailing
  // order. Driven from `active` above (the same derivation the ring and the highlight use) so the
  // box moves in step with the narration playhead, not ahead of it. See applyCaptainOrder.
  applyCaptainOrder(active);
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
  if(spinNeedle&&e.wind){
    const storming=!!e.storm;
    // v2 rule 7: a storm blows ONE direction now, so there is no combined diagonal to aim at —
    // the needle simply points where the wind points, storm or no storm.
    const angle=({N:0,E:90,S:180,W:270})[e.wind];
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
  const banner=w===null?`${iconImg(HOURGLASS_IMG)} Nobody finished!`:`${iconImg(CROWN_IMG)} ${pn(w)} wins!`;
  // The winner's recipe is read defensively, and that is NOT belt-and-braces — it is a guest-path
  // requirement. This code used to live in endLive() (src/orchestrator.js), which only ever runs on
  // the HOST after a real finished game, so a recipe was guaranteed. showStats() is different: the
  // guest reaches it through applyEndMeta(), which sets game.winner straight from Firebase meta and
  // renders. A guest whose local game has not drafted recipes — joined late, or an incomplete replay
  // — would hit `undefined.slice()` inside recipeInfo() and throw, taking the ENTIRE End of Voyage
  // screen down with it: no banner, no awards, no stats. Caught exactly that way in a browser.
  const winRecipe=w===null?null:(appState.game.players[w]||{}).recipe;
  // @copy adhoc.voyageend.victory
  const victoryLine=!winRecipe?"":`<div class="victoryText">${pn(w)} baked ${(a=>a?a+" ":"")(recipeArticle(winRecipe))}${winRecipeSpan(w)} and won <b>Best Baker in the Caribbean!</b></div>`;
  const wi=winRecipe?recipeInfo(winRecipe):null;
  const victoryPic=wi&&wi.img?`<img class="victoryRecipe" src="${wi.img}" alt="">`:""; // art, not copy
  const luck=appState.game.players.map(p=>p.flips?(p.heads/p.flips):0);
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
  const bakersHome = appState.game.players.filter(p => p.baking || p.done).length;
  // @copy misc.board.statsheadings
  const statsTable=`<table>
    <tr><td>Days</td><td>${appState.game.round}</td></tr>
    <tr><td>Battles</td><td>${appState.game.battles} (attacker won ${appState.game.battles?Math.round(100*appState.game.attWins/appState.game.battles):0}%)</td></tr>
    <tr><td>Trades</td><td>${appState.game.trades}</td></tr>
    <tr><td>Bakeries</td><td>${bakersHome===0?"no bakers home":bakersHome===1?"1 baker home":bakersHome+" bakers home"}</td></tr>
    ${appState.game.players.map((p,i)=>`<tr><td style="color:${HEXCOL[i]}">${pname(i)} heads-luck</td><td>${p.flips?Math.round(100*luck[i]):0}% of ${p.flips} flips</td></tr>`).join("")}
    </table>`;
  $("statsPanel").innerHTML=`<div class="winner-banner">${banner}${victoryPic}${victoryLine}</div>
    <div class="awardsRow">${awards}</div>
    ${statsTable}`;
  renderWindSummary();
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
  const row=$("controlsRow"), slot=$("muteSlot"), btn=$("btnMute"), clock=$("shotClockPanel");
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
  if(fits&&clock&&clock.nextSibling)row.insertBefore(btn,clock.nextSibling); // snug, right after the clock
  else if(fits)row.appendChild(btn);
  else slot.appendChild(btn);
}
let muteRO=null;
export function watchMutePlacement(){
  const row=$("controlsRow"), clock=$("shotClockPanel");
  if(!row||muteRO||typeof ResizeObserver==="undefined"){placeMuteButton();return;}
  // Observe the row AND the clock: the row catches viewport/layout changes, the clock catches its
  // own content growing (the timer toggle appearing, the countdown widening) — either can change
  // the answer without the other moving. ResizeObserver fires only on real size changes, so this
  // costs nothing while the game sits still, unlike re-measuring on the 500ms tick.
  muteRO=new ResizeObserver(()=>placeMuteButton());
  muteRO.observe(row);
  if(clock)muteRO.observe(clock);
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
  // IDEMPOTENT for "spin", because the tap now paints it and broadcastFlip repaints it a beat
  // later (setFlipActive below) — re-entering the state ye are already in must not re-play the
  // sound, or every flip is heard twice.
  const wasSpin=el.classList.contains("spin");
  el.classList.remove("heads","tails","spin","wait","active");el.onclick=null;el.style.backgroundImage="";
  if(state==="H"){el.classList.add("heads");el.style.backgroundImage=`url(${FLIP_HEADS_IMG})`;el.textContent="";}
  else if(state==="T"){el.classList.add("tails");el.style.backgroundImage=`url(${FLIP_TAILS_IMG})`;el.textContent="";}
  // D-49: the flip's clock starts on the frame the spin is PAINTED, and only on the frame it
  // actually starts — the `wasSpin` guard that already stops the sound doubling is the same
  // guard that stops broadcastFlip's repaint a beat later restarting the timer under the tap.
  else if(state==="spin"){el.classList.add("spin");el.style.backgroundImage=`url(${COIN_SPIN_IMG})`;el.textContent="";if(!wasSpin){flipSpinAt=performance.now();playFlip();}}
  else{el.classList.add("wait");el.textContent="";}
}
export function setFlipActive(onClick){
  const el=$("flipCoinWrap");if(!el)return;
  if(window.__pp4)window.__pp4.flip(el,onClick);   // /4 stage: the flip ceremony rides the same arming
  // notes/edits #6: show the heads face behind "FLIP" (was a flat gradient, no coin art) — a
  // tint layer on top keeps the text legible over the image.
  // notes/edits UI-09: drop the heavy orange tint over the whole coin — show the clean heads face
  // and make just the word "FLIP" orange instead (see #flipCoinWrap.active CSS).
  if(onClick){el.classList.add("active");el.style.backgroundImage=`url(${FLIP_HEADS_IMG})`;el.textContent="FLIP";el.onclick=onClick;}
  // A PLAIN DISARM CLEARS THE WORD TOO. Every other coin state sets textContent; this one did not,
  // so a disarmed coin kept the caption "FLIP" over a blank chip (playtest 22). The coin that has
  // just been TAPPED goes straight to the spin instead — see localAsk, which owns that distinction:
  // this function is called to disarm on every ordinary prompt as well, where a spin would be a lie.
  else{el.classList.remove("active");el.style.backgroundImage="";el.textContent="";el.onclick=null;}
}
